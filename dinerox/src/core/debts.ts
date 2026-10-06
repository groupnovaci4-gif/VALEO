/**
 * Dettes et crédits : restant dû, échéances, progression.
 * Le restant n'est jamais stocké : principal − Σ remboursements.
 */
import type { Debt, DebtPayment } from './types';
import { addMonths, diffDays, parseISODate, startOfMonth, toISODate, today, type ISODate } from './dates';

export interface DebtStatus {
  debt: Debt;
  paid: number;
  /** Jamais négatif : un trop-perçu est signalé par `overpaid`. */
  remaining: number;
  overpaid: number;
  percent: number;
  /** Prochaine échéance connue. */
  nextDue: ISODate | null;
  /** Jours avant la prochaine échéance (négatif = en retard). */
  daysToDue: number | null;
  /** Mensualités restantes estimées au rythme prévu. */
  installmentsLeft: number | null;
  settled: boolean;
}

export function debtPaid(debtId: string, payments: DebtPayment[]): number {
  return payments.reduce((s, p) => (!p.deleted && p.debtId === debtId ? s + p.amount : s), 0);
}

/** Échéance du mois de `ref` au jour `dueDay` (29-31 ramenés au dernier jour du mois). */
function dueInMonth(ref: ISODate, dueDay: number): ISODate {
  const d = parseISODate(ref);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), Math.min(dueDay, last), 12));
}

/**
 * Prochaine échéance À HONORER :
 *  - échéance du mois passée et non couverte par les remboursements faits
 *    depuis l'échéance précédente → elle reste due (retard, jours négatifs) ;
 *  - échéance du mois déjà couverte (remboursement anticipé) → mois suivant ;
 *  - sans jour d'échéance : la date limite (`dueDate`).
 */
export function nextDueDate(debt: Debt, now: ISODate = today(), payments: DebtPayment[] = []): ISODate | null {
  if (debt.dueDay && debt.dueDay >= 1 && debt.dueDay <= 31) {
    const thisDue = dueInMonth(now, debt.dueDay);
    const prevDue = dueInMonth(addMonths(startOfMonth(now), -1), debt.dueDay);
    const nextDue = dueInMonth(addMonths(startOfMonth(now), 1), debt.dueDay);
    let candidate: ISODate;
    if (debt.installment && debt.installment > 0) {
      // Remboursements faits pour l'échéance de ce mois (après l'échéance précédente).
      const paidForThis = payments.filter((p) => !p.deleted && p.debtId === debt.id && p.date > prevDue && p.date <= now).reduce((n, p) => n + p.amount, 0);
      const covered = paidForThis >= debt.installment;
      // Une échéance antérieure au début de la dette n'est pas due.
      const notStarted = !!debt.startDate && thisDue < debt.startDate;
      candidate = covered || notStarted ? nextDue : thisDue;
    } else {
      candidate = thisDue < now ? nextDue : thisDue;
    }
    if (debt.dueDate && candidate > debt.dueDate) return debt.dueDate;
    return candidate;
  }
  return debt.dueDate ?? null;
}

export function debtStatus(debt: Debt, payments: DebtPayment[], now: ISODate = today()): DebtStatus {
  const paid = debtPaid(debt.id, payments);
  const remaining = Math.max(0, debt.principal - paid);
  const overpaid = Math.max(0, paid - debt.principal);
  const settled = remaining === 0 || debt.status === 'closed';
  const nextDue = settled ? null : nextDueDate(debt, now, payments);
  return {
    debt,
    paid,
    remaining,
    overpaid,
    percent: debt.principal > 0 ? Math.min(100, Math.floor((paid / debt.principal) * 100)) : 100,
    nextDue,
    daysToDue: nextDue ? diffDays(now, nextDue) : null,
    installmentsLeft: debt.installment && debt.installment > 0 ? Math.ceil(remaining / debt.installment) : null,
    settled,
  };
}

/** Totaux : ce que je dois, ce qu'on me doit. */
export function debtTotals(debts: Debt[], payments: DebtPayment[], currency: string) {
  let iOwe = 0;
  let owedToMe = 0;
  for (const d of debts) {
    if (d.deleted || d.currency !== currency) continue;
    // Une dette clôturée (remise, abandon) n'est plus due.
    const s = debtStatus(d, payments);
    const r = s.settled ? 0 : s.remaining;
    if (d.direction === 'i_owe') iOwe += r;
    else owedToMe += r;
  }
  return { iOwe, owedToMe, net: owedToMe - iOwe };
}

/**
 * Valide un remboursement : montant > 0. Un remboursement supérieur au
 * restant est autorisé mais signalé (l'interface demande confirmation).
 */
export function validateDebtPayment(amount: number, remaining: number): 'ok' | 'invalid' | 'exceeds' {
  if (!Number.isInteger(amount) || amount <= 0) return 'invalid';
  if (amount > remaining) return 'exceeds';
  return 'ok';
}
