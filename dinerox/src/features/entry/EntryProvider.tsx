/**
 * Point d'entrée unique de la SAISIE : le micro central de la barre, la bulle
 * de l'accueil, le rappel du soir et les liens profonds ouvrent tous la même
 * feuille (`open('voice')` ou `open('keyboard')`).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { EntrySheet } from './EntrySheet';

export type EntryMode = 'voice' | 'keyboard';

const EntryContext = createContext<{ open: (mode?: EntryMode) => void }>({ open: () => undefined });

/**
 * Demande d'ouverture venue d'en dehors de l'arbre des onglets (lien profond
 * `dinerox://entry`, notification du rappel du soir) : mémorisée jusqu'à ce que
 * la feuille soit montée.
 */
let pending: EntryMode | null = null;
let listener: ((mode: EntryMode) => void) | null = null;
export function requestEntry(mode: EntryMode) {
  if (listener) listener(mode);
  else pending = mode;
}

export function EntryProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<EntryMode | null>(null);
  const open = useCallback((m: EntryMode = 'voice') => setMode(m), []);
  const close = useCallback(() => setMode(null), []);
  useEffect(() => {
    listener = (m) => setMode(m);
    if (pending) {
      const m = pending;
      pending = null;
      // Après le montage (demande arrivée avant que la feuille n'existe).
      void Promise.resolve().then(() => setMode(m));
    }
    return () => {
      listener = null;
    };
  }, []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <EntryContext.Provider value={value}>
      {children}
      <EntrySheet mode={mode} onClose={close} onModeChange={setMode} />
    </EntryContext.Provider>
  );
}

export function useEntry() {
  return useContext(EntryContext);
}
