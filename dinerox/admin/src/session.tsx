/**
 * Session du portail. Une session n'est valable que si le jeton porte `boSid`
 * (créé par boLoginVerify après mot de passe + code). Une connexion Firebase
 * ordinaire (sans passer par le portail) est fermée aussitôt : aucun droit.
 * Les permissions viennent de boMe (relues par le serveur à chaque appel).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { call, type Me, type Permission } from './api';
import { codeOf } from './messages';

export interface DataAccess {
  accessId: string;
  expiresAt: number;
  reasonCode: string;
  reasonNote: string | null;
  spaces: { id: string; kind: 'personal' | 'family'; name: string; currency: string | null; memberCount: number }[];
}

interface SessionValue {
  status: 'loading' | 'signedOut' | 'ready';
  me: Me | null;
  can: (p: Permission | null | undefined) => boolean;
  logout: (reason?: 'expired') => Promise<void>;
  refreshMe: () => Promise<void>;
  notice: string | null;
  clearNotice: () => void;
  /** Accès ouverts aux opérations (motif, 30 min), par utilisateur consulté. Jamais stockés. */
  access: Record<string, DataAccess>;
  setAccess: (uid: string, a: DataAccess | null) => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [access, setAccessState] = useState<Record<string, DataAccess>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async (reason?: 'expired') => {
    if (reason === 'expired') setNotice('Votre session a expiré. Reconnectez-vous.');
    await call('boLogout').catch(() => undefined);
    setAccessState({});
    await signOut(auth);
  }, []);

  const load = useCallback(async () => {
    try {
      const m = await call<Me>('boMe');
      setMe(m);
      setStatus('ready');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void logout('expired'), Math.max(0, m.sessionExpiresAt - Date.now()));
    } catch (e) {
      const code = codeOf(e);
      if (code === 'bo/session' || code === 'bo/auth') setNotice('Votre session a expiré. Reconnectez-vous.');
      else if (code === 'bo/staff-suspended') setNotice('Votre accès au back-office est suspendu. Contactez un Super Admin.');
      await signOut(auth);
    }
  }, [logout]);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        if (!u) {
          setMe(null);
          setStatus('signedOut');
          if (timer.current) clearTimeout(timer.current);
          return;
        }
        const token = await u.getIdTokenResult().catch(() => null);
        // Connexion sans passer par mot de passe + code du portail : refusée.
        if (typeof token?.claims?.boSid !== 'string') {
          await signOut(auth);
          return;
        }
        await load();
      }),
    [load],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      me,
      can: (p) => !p || !!me?.permissions.includes(p),
      logout,
      refreshMe: load,
      notice,
      clearNotice: () => setNotice(null),
      access,
      setAccess: (uid, a) =>
        setAccessState((cur) => {
          const next = { ...cur };
          if (a) next[uid] = a;
          else delete next[uid];
          return next;
        }),
    }),
    [status, me, logout, load, notice, access],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider manquant');
  return v;
}
