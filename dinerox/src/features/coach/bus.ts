/**
 * Signal « une écriture a pu changer l'état d'un budget » : émis par
 * `useActions` (seul point d'écriture), consommé par l'hôte du coach.
 * Les signaux d'une même action (opération + remboursement lié…) sont
 * fusionnés et traités une seule fois, juste après l'écriture.
 */
import type { MonthKey } from '@/core/dates';

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
