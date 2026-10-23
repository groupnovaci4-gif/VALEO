/**
 * Connexion par téléphone — côté application (docs/connexion-telephone, DECISIONS.md §5bis).
 * Tout le sensible se passe sur le SERVEUR (Cloud Functions `phone…`) : envoi et vérification du
 * code reçu, empreinte du code secret, limites, blocages ; il rend un jeton personnalisé qui ouvre
 * la session Firebase.
 *
 * Le code secret de connexion n'est JAMAIS gardé sur le téléphone, ni en clair ni en empreinte
 * (§5bis.3) : il ne fait que transiter vers la fonction. Le verrou de l'application
 * (`security.ts`) reste séparé et inchangé. Seuls l'identifiant d'appareil (tiré au hasard) et le
 * dernier numéro utilisé (pour préremplir « Bon retour ! ») sont gardés localement.
 */
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import * as Crypto from 'expo-crypto';
import { firebase } from './firebase';
import { readJSON, writeJSON } from './storage';
import type { TKey } from '@/i18n';

const DEVICE_KEY = 'dinerox:v1:device:phoneId';
const LAST_PHONE_KEY = 'dinerox:v1:phone:last';

export type PhonePurpose = 'signup' | 'reset' | 'device' | 'link';
export type PhoneChannel = 'whatsapp' | 'sms';

/** Identifiant de CET appareil pour la connexion par téléphone (tiré au hasard, gardé localement). */
export async function phoneDeviceId(): Promise<string> {
  const saved = await readJSON<string>(DEVICE_KEY);
  if (saved) return saved;
  const id = Crypto.randomUUID();
  await writeJSON(DEVICE_KEY, id);
  return id;
}

/** Dernier numéro utilisé sur cet appareil (affiché masqué) — jamais le code secret. */
export const lastPhone = () => readJSON<{ e164: string; dial: string }>(LAST_PHONE_KEY);
export const rememberPhone = (e164: string, dial: string) => writeJSON(LAST_PHONE_KEY, { e164, dial });
export const forgetPhone = () => writeJSON(LAST_PHONE_KEY, null);

/** Numéro relié au compte CONNECTÉ (Firebase Auth), ou null (compte sans numéro, aucune session). */
export const currentPhoneNumber = (): string | null => firebase().auth.currentUser?.phoneNumber ?? null;

async function call<T>(name: string, data: Record<string, unknown>, opts: { limitedUse?: boolean } = {}): Promise<T> {
  // Envoi d'un code (audit 23/10, S4) : jeton App Check à usage UNIQUE, consommé par le serveur.
  const fn = httpsCallable<Record<string, unknown>, T>(firebase().functions, name, opts.limitedUse ? { limitedUseAppCheckTokens: true } : undefined);
  return (await fn({ ...data, deviceId: await phoneDeviceId() })).data;
}

export interface StartResult {
  requestId: string;
  channel: PhoneChannel;
  expiresAt: number;
  resendAt: number;
}

/** `currentSecret` : « Ajouter mon numéro » sur un compte qui en a déjà un (audit 23/10, S1), vérifié par le serveur. */
export const phoneStart = (p: { phone: string; dial: string; purpose: PhonePurpose; channel: PhoneChannel; lang: 'fr' | 'en'; currentSecret?: string }) => call<StartResult>('phoneStart', p, { limitedUse: true });
export const phoneVerify = (p: { requestId: string; code: string }) => call<{ ticket: string; existing: boolean }>('phoneVerify', p);
export const phoneSetSecret = (p: { ticket: string; secret: string; lang: 'fr' | 'en'; currentSecret?: string }) => call<{ token?: string; linked?: boolean; existing?: boolean }>('phoneSetSecret', p);
export const phoneSignIn = (p: { phone: string; dial: string; secret: string; ticket?: string }) => call<{ token?: string; needsDevice?: boolean }>('phoneSignIn', p);

/** Ouvre la session Firebase avec le jeton rendu par le serveur. */
export async function openSession(token: string): Promise<string> {
  const cred = await signInWithCustomToken(firebase().auth, token);
  return cred.user.uid;
}

export interface PhoneError {
  key: TKey;
  params?: Record<string, string | number>;
  /** Refus du serveur (« phone/… »), pour choisir l'affichage (bannière, cases en rouge…). */
  code: string;
}

/** Refus du serveur → message lisible (textes validés, maquettes/TEXTES.md). */
export function phoneErrorOf(e: unknown, now = Date.now()): PhoneError {
  const err = e as { code?: string; message?: string; details?: Record<string, unknown> };
  // Le SDK web ajoute le statut HTTP au message (« phone/wrong-secret [403] ») : on n'en garde que le refus.
  const code = /phone\/[a-z-]+/.exec(String(err?.message ?? ''))?.[0] ?? String(err?.message ?? '');
  const details = err?.details ?? {};
  if (String(err?.code ?? '').endsWith('unavailable') && !code.startsWith('phone/')) return { key: 'phone.err.network', code: 'network' };
  if (/network|failed to fetch|internal/i.test(String(err?.code ?? '')) && !code.startsWith('phone/')) return { key: 'phone.err.network', code: 'network' };
  switch (code) {
    case 'phone/invalid-number':
      return { key: 'phone.err.invalidNumber', code };
    case 'phone/sms-country':
      return { key: 'phone.err.smsCountry', code };
    case 'phone/too-soon':
      return { key: 'phone.err.tooSoon', code };
    case 'phone/daily-limit':
      return { key: 'phone.err.tooManyCodes', code };
    case 'phone/unavailable':
      return { key: 'phone.err.unavailable', code };
    case 'phone/wrong-code': {
      const left = Number(details.attemptsLeft ?? 0);
      return left === 1 ? { key: 'phone.err.wrongCodeOne', code } : { key: 'phone.err.wrongCode', params: { count: left }, code };
    }
    case 'phone/too-many':
      return { key: 'phone.err.codeTooMany', code };
    case 'phone/expired':
    case 'phone/used':
      return { key: 'phone.err.expired', code: 'phone/expired' };
    case 'phone/wrong-secret':
      return { key: 'phone.err.wrongSecret', code };
    case 'phone/locked': {
      const minutes = Math.max(1, Math.ceil((Number(details.retryAt ?? now) - now) / 60_000));
      return { key: 'phone.err.tooMany', params: { minutes }, code };
    }
    case 'phone/weak-secret':
    case 'phone/invalid-secret':
      return { key: 'phone.secret.tooSimple', code };
    case 'phone/taken':
      return { key: 'phone.link.taken', code };
    // Audit du 23/10 (partie 2).
    case 'phone/country':
      return { key: 'phone.err.country', code };
    case 'phone/recent-login':
      return { key: 'auth.err.requires-recent-login', code };
    case 'phone/current-secret':
      return { key: 'phone.signin.secret', code };
    case 'phone/disabled':
      return { key: 'auth.err.user-disabled', code };
    case 'phone/exists':
      return { key: 'phone.exists.title', code };
    case 'phone/app-check':
      return { key: 'phone.err.unavailable', code };
    default:
      return { key: 'error.generic', code: code || 'unknown' };
  }
}
