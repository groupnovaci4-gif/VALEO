/**
 * Signal « une écriture a pu changer l'état d'un budget » : émis par
 * `useActions` (seul point d'écriture), consommé par l'hôte du coach.
 * Les signaux d'une même action (opération + remboursement lié…) sont
 * fusionnés et traités une seule fois, juste après l'écriture.
 */
import type { MonthKey } from '@/core/dates';
import type { DeliveryPlan } from '@/core/coach/policy';
import type { CoachEvent } from '@/core/coach/events';

export interface CoachWriteSignal {
  spaceId: string;
  /** Mois → enveloppes à réévaluer. */
  touched: Map<MonthKey, Set<string>>;
}

type Handler = (signal: CoachWriteSignal) => void;
let handler: Handler | null = null;
const pending = new Map<string, Map<MonthKey, Set<string>>>();
let scheduled = false;

export function setCoachWriteHandler(h: Handler | null) {
  handler = h;
}

export function notifyCoachWrite(spaceId: string, touched: Map<MonthKey, Set<string>>) {
  if (!touched.size) return;
  const cur = pending.get(spaceId) ?? new Map<MonthKey, Set<string>>();
  for (const [m, ids] of touched) cur.set(m, new Set([...(cur.get(m) ?? []), ...ids]));
  pending.set(spaceId, cur);
  if (scheduled) return;
  scheduled = true;
  // Après la fin de l'action en cours (toutes ses écritures sont faites).
  void Promise.resolve().then(() => {
    scheduled = false;
    const batch = [...pending.entries()];
    pending.clear();
    for (const [id, t] of batch) handler?.({ spaceId: id, touched: t });
  });
}

// ─── Présentation sonore et vocale ─────────────────────────────────────

/** Branché par l'hôte vocal ; absent : texte seul. */
export type CoachPresenter = (plan: DeliveryPlan, text: (e: CoachEvent) => string) => void;
let presenter: CoachPresenter | null = null;
export function setCoachPresenter(p: CoachPresenter | null) {
  presenter = p;
}
export function presentCoachPlan(plan: DeliveryPlan, text: (e: CoachEvent) => string) {
  presenter?.(plan, text);
}
