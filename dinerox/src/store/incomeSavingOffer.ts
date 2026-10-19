/**
 * §11.2 — épargne à la source : les opérations qui viennent d'être enregistrées (formulaire,
 * saisie vocale ou écrite, « reçu ? » d'une récurrence). La carte de l'accueil
 * (`IncomeSavingCard`) décide, avec `incomeSavingPrompt` (calcul pur), s'il faut proposer de
 * mettre 10 % de côté. Gardé en mémoire seulement : jamais stocké ni synchronisé.
 */
import { useSyncExternalStore } from 'react';

let pending: string[] | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** À appeler après l'enregistrement d'opérations (la carte ne s'affiche que pour un revenu reçu). */
export function offerIncomeSaving(ids: string[]): void {
  pending = ids.length ? [...ids] : null;
  emit();
}

/** « Pas maintenant », « Mettre de côté » ou changement de compte : plus de carte. */
export function clearIncomeSaving(): void {
  if (!pending) return;
  pending = null;
  emit();
}

export function useIncomeSavingOffer(): string[] | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => pending,
  );
}
