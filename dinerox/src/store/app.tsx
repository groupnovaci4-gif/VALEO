/**
 * État global de l'application : session, profil, espaces, moteur de synchro.
 *
 * Deux modes :
 *  - firebase : compte en ligne, données synchronisées (par défaut si
 *    Firebase est configuré) ;
 *  - local : sans compte, données sur l'appareil uniquement (essai, ou
 *    build sans Firebase). Clairement signalé à l'utilisateur.
 *
 * Démarrage hors-ligne : profil et espaces sont mis en cache localement ;
 * l'application s'ouvre même sans réseau.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { isFirebaseConfigured } from '@/config/env';
import { firebase } from '@/services/firebase';
import { readJSON, removeKeys, storageKey, writeJSON } from '@/services/storage';
import { SyncEngine } from '@/services/sync/engine';
import { firestoreRemote } from '@/services/sync/remote';
import { defaultProfile, ensureProfile, listenProfile, saveProfile } from '@/services/profile';
import { ensurePersonalSpace, listenSpaces, personalSpace } from '@/services/spaces';
import { effectivePlan } from '@/core/subscription';
import { roleIn } from '@/core/permissions';
import { emptySpaceData, type PlanId, type Role, type Space, type SpaceData, type UserProfile } from '@/core/types';
import { analytics } from '@/services/analytics';

export type AppMode = 'firebase' | 'local';
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  isAdmin: boolean;
}

interface AppValue {
  mode: AppMode;
  status: AuthStatus;
  user: SessionUser | null;
  profile: UserProfile | null;
  plan: PlanId;
  spaces: Space[];
  activeSpace: Space | null;
  role: Role | null;
  engine: SyncEngine | null;
  online: boolean;
  setActiveSpace: (id: string) => void;
  updateProfile: (patch: Partial<Omit<UserProfile, 'subscription' | 'uid'>>) => Promise<void>;
  enterLocalMode: () => Promise<void>;
  /** Ajoute/retire un espace local (démonstration). */
  addLocalSpace: (space: Space) => Promise<void>;
  removeLocalSpace: (id: string) => Promise<void>;
  signOutLocal: () => Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);

const LOCAL_UID = 'local';
const MODE_KEY = 'dinerox:v1:mode';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [remoteSpaces, setRemoteSpaces] = useState<Space[]>([]);
  const [localSpaces, setLocalSpaces] = useState<Space[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const profileRef = useRef<UserProfile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const loadLocalUser = useCallback(async () => {
    const p = (await readJSON<UserProfile>(storageKey(LOCAL_UID, 'profile'))) ?? defaultProfile(LOCAL_UID, '');
    setUser({ uid: LOCAL_UID, email: '', emailVerified: true, displayName: p.firstName, isAdmin: false });
    setProfile(p);
    setStatus('signedIn');
  }, []);

  // 1. Mode mémorisé : un utilisateur ayant choisi « sans compte » y reste.
  //    Sans Firebase configuré et sans choix : écran d'accueil (déconnecté).
  useEffect(() => {
    void readJSON<AppMode>(MODE_KEY).then((saved) => {
      if (saved === 'local') {
        setMode('local');
        void loadLocalUser();
      } else if (isFirebaseConfigured) setMode('firebase');
      else setStatus('signedOut');
    });
  }, [loadLocalUser]);

  // 2. Session en ligne.
  useEffect(() => {
    if (mode !== 'firebase') return;
    const { auth } = firebase();
    return onAuthStateChanged(auth, async (u: User | null) => {
      if (!u) {
        setUser(null);
        setProfile(null);
        setRemoteSpaces([]);
        setStatus('signedOut');
        return;
      }
      const token = await u.getIdTokenResult().catch(() => null);
      setUser({
        uid: u.uid,
        email: u.email ?? '',
        emailVerified: u.emailVerified,
        displayName: u.displayName ?? '',
        isAdmin: token?.claims?.admin === true,
      });
      // Profil et espaces en cache : ouverture hors-ligne immédiate.
      const cachedProfile = await readJSON<UserProfile>(storageKey(u.uid, 'profile'));
      const cachedSpaces = await readJSON<Space[]>(storageKey(u.uid, 'spaces'));
      if (cachedProfile) setProfile(cachedProfile);
      if (cachedSpaces) setRemoteSpaces(cachedSpaces);
      setStatus('signedIn');
    });
  }, [mode]);

  // 3. Profil + espaces distants.
  useEffect(() => {
    if (mode !== 'firebase' || !user) return;
    const offProfile = listenProfile(
      user.uid,
      (p) => {
        if (p) {
          setProfile(p);
          void writeJSON(storageKey(user.uid, 'profile'), p);
        } else {
          // Première connexion (Google, ou inscription interrompue) : profil par défaut.
          void ensureProfile(user.uid, user.email, user.displayName, null).catch(() => undefined);
        }
      },
      () => undefined,
    );
    const offSpaces = listenSpaces(
      user.uid,
      (s) => {
        setRemoteSpaces(s);
        void writeJSON(storageKey(user.uid, 'spaces'), s);
      },
      () => undefined,
    );
    // L'espace personnel doit exister avant toute écriture (règles Firestore).
    void ensurePersonalSpace(user.uid, user.displayName, profileRef.current?.currency ?? 'XOF').catch(() => undefined);
    return () => {
      offProfile();
      offSpaces();
    };
  }, [mode, user]);

  // 4. Espaces locaux (mode local + démonstrations).
  useEffect(() => {
    if (!user) return;
    void readJSON<Space[]>(storageKey(user.uid, 'localSpaces')).then((s) => setLocalSpaces(s ?? []));
  }, [user]);

  // 5. Moteur de synchronisation par utilisateur.
  const engine = useMemo(() => (user ? new SyncEngine(user.uid, mode === 'firebase' ? firestoreRemote() : null) : null), [user, mode]);
  useEffect(() => () => engine?.destroy(), [engine]);

  // 6. Réseau.
  useEffect(() => {
    const off = NetInfo.addEventListener((s) => {
      const isOnline = !!s.isConnected && s.isInternetReachable !== false;
      setOnline(isOnline);
    });
    return off;
  }, []);
  useEffect(() => {
    engine?.setOnline(online);
  }, [engine, online]);
  // Au retour au premier plan : tenter de vider l'outbox.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void engine?.flush();
    });
    return () => sub.remove();
  }, [engine]);

  const spaces = useMemo(() => {
    const base: Space[] = mode === 'local' && user ? [personalSpace(LOCAL_UID, profile?.firstName ?? '', profile?.currency ?? 'XOF')].map((s) => ({ ...s, id: 'local' })) : remoteSpaces;
    const personal = base.filter((s) => s.kind === 'personal');
    const families = base.filter((s) => s.kind === 'family').sort((a, b) => a.createdAt - b.createdAt);
    return [...personal, ...families, ...localSpaces];
  }, [mode, user, profile?.firstName, profile?.currency, remoteSpaces, localSpaces]);

  // Espace actif : mémorisé, sinon l'espace personnel.
  useEffect(() => {
    if (!user) return;
    void readJSON<string>(storageKey(user.uid, 'activeSpace')).then((id) => id && setActiveId(id));
  }, [user]);
  const activeSpace = spaces.find((s) => s.id === activeId) ?? spaces.find((s) => s.kind === 'personal') ?? spaces[0] ?? null;
  const role: Role | null = activeSpace ? (activeSpace.id === 'local' || activeSpace.id.startsWith('demo_') ? 'admin' : roleIn(activeSpace, user?.uid)) : null;

  // Ouverture de l'espace actif dans le moteur.
  useEffect(() => {
    if (engine && activeSpace && role) void engine.open(activeSpace.id, role);
  }, [engine, activeSpace, role]);

  const setActiveSpace = useCallback(
    (id: string) => {
      setActiveId(id);
      if (user) void writeJSON(storageKey(user.uid, 'activeSpace'), id);
    },
    [user],
  );

  const updateProfile = useCallback(
    async (patch: Partial<Omit<UserProfile, 'subscription' | 'uid'>>) => {
      const current = profileRef.current;
      if (!user || !current) return;
      const next = { ...current, ...patch, updatedAt: Date.now() } as UserProfile;
      setProfile(next);
      await writeJSON(storageKey(user.uid, 'profile'), next);
      if (mode === 'firebase') {
        // Hors-ligne : le SDK conserve l'écriture en mémoire et la rejoue ; le cache local fait foi en attendant.
        void saveProfile(user.uid, patch).catch(() => undefined);
      }
    },
    [user, mode],
  );

  const enterLocalMode = useCallback(async () => {
    await writeJSON(MODE_KEY, 'local');
    setMode('local');
    await loadLocalUser();
    analytics.track('sign_up', { method: 'local' });
  }, [loadLocalUser]);

  const signOutLocal = useCallback(async () => {
    await writeJSON(MODE_KEY, null);
    await removeKeys(`dinerox:v1:${LOCAL_UID}:`);
    setUser(null);
    setProfile(null);
    setLocalSpaces([]);
    setMode(isFirebaseConfigured ? 'firebase' : null);
    setStatus('signedOut');
  }, []);

  const addLocalSpace = useCallback(
    async (space: Space) => {
      if (!user) return;
      const next = [...localSpaces.filter((s) => s.id !== space.id), space];
      setLocalSpaces(next);
      await writeJSON(storageKey(user.uid, 'localSpaces'), next);
    },
    [user, localSpaces],
  );

  const removeLocalSpace = useCallback(
    async (id: string) => {
      if (!user) return;
      const next = localSpaces.filter((s) => s.id !== id);
      setLocalSpaces(next);
      await writeJSON(storageKey(user.uid, 'localSpaces'), next);
      await engine?.forget(id);
      if (activeId === id) setActiveSpace(spaces.find((s) => s.kind === 'personal')?.id ?? 'local');
    },
    [user, localSpaces, engine, activeId, spaces, setActiveSpace],
  );

  const value: AppValue = {
    mode: mode ?? (isFirebaseConfigured ? 'firebase' : 'local'),
    status,
    user,
    profile,
    // Mode local : formule gratuite (en développement, tout est débloqué pour tester).
    plan: mode === 'local' ? (__DEV__ ? 'family' : 'free') : effectivePlan(profile?.subscription),
    spaces,
    activeSpace,
    role,
    engine,
    online,
    setActiveSpace,
    updateProfile,
    enterLocalMode,
    addLocalSpace,
    removeLocalSpace,
    signOutLocal,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp hors AppProvider');
  return v;
}

const EMPTY_STATUS = { pending: 0, online: true, lastError: null as string | null };
const noopSubscribe = () => () => undefined;

/** Données de l'espace actif, réactives (useSyncExternalStore). */
export function useData(): SpaceData {
  const { engine, activeSpace } = useApp();
  const id = activeSpace?.id ?? '';
  const getSnapshot = useCallback(() => (engine ? engine.getData(id) : EMPTY_DATA), [engine, id]);
  return useSyncExternalStore(engine?.subscribe ?? noopSubscribe, getSnapshot, getSnapshot);
}

export function useSyncStatus() {
  const { engine } = useApp();
  const get = useCallback(() => engine?.getStatus() ?? EMPTY_STATUS, [engine]);
  return useSyncExternalStore(engine?.subscribe ?? noopSubscribe, get, get);
}

const EMPTY_DATA = emptySpaceData();

/** Vrai quand le cache local de l'espace actif est chargé (lecture locale, quasi instantanée). */
export function useSpaceReady(): boolean {
  const { engine, activeSpace } = useApp();
  const id = activeSpace?.id ?? '';
  const get = useCallback(() => (engine && id ? engine.isLoaded(id) : false), [engine, id]);
  return useSyncExternalStore(engine?.subscribe ?? noopSubscribe, get, get);
}
