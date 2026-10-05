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
import { applyPending, queuePatch, type PendingProfile } from '@/core/profilePending';

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
  /** Mode sans compte en ligne ; `demo` : tableau de bord de démonstration (données fictives). */
  enterLocalMode: (opts?: { demo?: boolean }) => Promise<void>;
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
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const profileRef = useRef<UserProfile | null>(null);
  const pendingProfile = useRef<PendingProfile | null>(null);

  /** Envoie au serveur la modification de profil en attente ; la retire une fois confirmée. */
  const pushPendingProfile = useCallback(async (u: SessionUser) => {
    const pending = pendingProfile.current;
    if (!pending) return;
    try {
      await ensureProfile(u.uid, u.email, u.displayName, null);
      await saveProfile(u.uid, pending.patch);
      if (pendingProfile.current === pending) {
        pendingProfile.current = null;
        await writeJSON(storageKey(u.uid, 'profilePending'), null);
      }
    } catch {
      // Hors-ligne ou refus temporaire : nouvel essai au retour du réseau ou au prochain lancement.
    }
  }, []);
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
          // Une modification locale pas encore confirmée par le serveur (réseau lent, coupure,
          // redémarrage) reste appliquée par-dessus : sans cela, l'ancienne version du serveur
          // effacerait par exemple « onboarding terminé » et renverrait vers l'onboarding.
          // La modification en attente n'est libérée que par l'accusé de réception du serveur
          // (pushPendingProfile) : un instantané peut refléter une écriture encore locale.
          const merged = applyPending(p, pendingProfile.current);
          setProfile(merged);
          void writeJSON(storageKey(user.uid, 'profile'), merged);
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
    // Modification du profil restée en attente lors d'une session précédente : on la renvoie.
    void readJSON<PendingProfile>(storageKey(user.uid, 'profilePending')).then((pending) => {
      if (pending && !pendingProfile.current) pendingProfile.current = pending;
      void pushPendingProfile(user);
    });
    // L'espace personnel doit exister avant toute écriture (règles Firestore).
    void ensurePersonalSpace(user.uid, user.displayName, profileRef.current?.currency ?? 'XOF').catch(() => undefined);
    return () => {
      offProfile();
      offSpaces();
    };
  }, [mode, user, pushPendingProfile]);

  // 4. Espaces locaux (mode local + démonstrations).
  useEffect(() => {
    if (!user) return;
    // Espaces locaux ET espace actif mémorisé sont restaurés ensemble : aucun écran
    // n'affiche un autre espace (vide) le temps de la lecture.
    void Promise.all([readJSON<Space[]>(storageKey(user.uid, 'localSpaces')), readJSON<string>(storageKey(user.uid, 'activeSpace'))]).then(([s, id]) => {
      setLocalSpaces(s ?? []);
      if (id) setActiveId(id);
      setRestoredFor(user.uid);
    });
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
    if (online && mode === 'firebase' && user) void pushPendingProfile(user);
  }, [engine, online, mode, user, pushPendingProfile]);
  // Au retour au premier plan : tenter de vider l'outbox.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void engine?.flush();
      // Mise en arrière-plan : sauvegarde locale immédiate (le système peut fermer l'app).
      else void engine?.persistNow();
    });
    return () => sub.remove();
  }, [engine]);

  const spaces = useMemo(() => {
    let base: Space[] = mode === 'local' && user ? [personalSpace(LOCAL_UID, profile?.firstName ?? '', profile?.currency ?? 'XOF')].map((s) => ({ ...s, id: 'local' })) : remoteSpaces;
    // L'espace personnel existe toujours côté application, même avant d'être reçu du serveur
    // (première connexion, hors-ligne) : les écritures sont autorisées par les règles (id = uid).
    if (mode === 'firebase' && user && !base.some((s) => s.id === user.uid)) {
      base = [personalSpace(user.uid, profile?.firstName ?? user.displayName, profile?.currency ?? 'XOF'), ...base];
    }
    const personal = base.filter((s) => s.kind === 'personal');
    const families = base.filter((s) => s.kind === 'family').sort((a, b) => a.createdAt - b.createdAt);
    return [...personal, ...families, ...localSpaces];
  }, [mode, user, profile?.firstName, profile?.currency, remoteSpaces, localSpaces]);

  // Espace actif : mémorisé, sinon l'espace personnel (null tant que la restauration n'est pas faite).
  const restored = !!user && restoredFor === user.uid;
  const activeSpace = !restored ? null : (spaces.find((s) => s.id === activeId) ?? spaces.find((s) => s.kind === 'personal') ?? spaces[0] ?? null);
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
      if (!user) return;
      // Profil pas encore reçu (première connexion, réseau lent) : on part du profil par défaut
      // au lieu d'ignorer la modification — sinon l'onboarding ne pourrait jamais se terminer.
      const current = profileRef.current ?? defaultProfile(user.uid, user.email, user.displayName);
      const next = { ...current, ...patch, updatedAt: Date.now() } as UserProfile;
      profileRef.current = next;
      setProfile(next);
      await writeJSON(storageKey(user.uid, 'profile'), next);
      if (mode === 'firebase') {
        // Mémorisée sur l'appareil jusqu'à confirmation du serveur (voir pushPendingProfile).
        const prev = pendingProfile.current;
        pendingProfile.current = queuePatch(prev, patch, next.updatedAt);
        await writeJSON(storageKey(user.uid, 'profilePending'), pendingProfile.current);
        void pushPendingProfile(user);
      }
    },
    [user, mode, pushPendingProfile],
  );

  const enterLocalMode = useCallback(async (opts?: { demo?: boolean }) => {
    await writeJSON(MODE_KEY, 'local');
    if (opts?.demo) {
      // Démonstration : pas de questionnaire, l'espace « Démo » est créé par Bootstrap.
      const p = (await readJSON<UserProfile>(storageKey(LOCAL_UID, 'profile'))) ?? defaultProfile(LOCAL_UID, '');
      await writeJSON(storageKey(LOCAL_UID, 'profile'), { ...p, onboarding: { ...p.onboarding, completed: true } });
      await writeJSON(storageKey(LOCAL_UID, 'demoRequested'), true);
    }
    setMode('local');
    await loadLocalUser();
    analytics.track('sign_up', { method: opts?.demo ? 'demo' : 'local' });
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
