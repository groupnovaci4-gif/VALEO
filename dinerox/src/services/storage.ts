/**
 * Stockage local clé/valeur (AsyncStorage) avec espace de noms par
 * utilisateur et écriture différée. Les données financières locales ne
 * contiennent aucun secret ; le code PIN est, lui, dans SecureStore.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'dinerox:v1';

export const storageKey = (uid: string, ...parts: string[]) => [PREFIX, uid, ...parts].join(':');

export async function readJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage plein ou indisponible : l'état en mémoire reste valable.
  }
}

export async function removeKeys(prefix: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.startsWith(prefix));
  if (mine.length) await AsyncStorage.multiRemove(mine);
}

/** Écrit au plus une fois toutes les `delay` ms pour une même clé. */
export function debouncedWriter(delay = 500) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, () => unknown>();
  const flushKey = (key: string): Promise<void> => {
    const get = pending.get(key);
    pending.delete(key);
    timers.delete(key);
    return get ? writeJSON(key, get()) : Promise.resolve();
  };
  return {
    schedule(key: string, get: () => unknown) {
      pending.set(key, get);
      if (!timers.has(key)) timers.set(key, setTimeout(() => void flushKey(key), delay));
    },
    /** Écrit immédiatement tout ce qui est en attente (avant une étape critique ou la mise en arrière-plan). */
    flushAll(): Promise<void> {
      const writes: Promise<void>[] = [];
      for (const [key, t] of timers) {
        clearTimeout(t);
        writes.push(flushKey(key));
      }
      return Promise.all(writes).then(() => undefined);
    },
  };
}
