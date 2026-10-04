/**
 * Dettes et crédits : restant dû, échéances, progression.
 * Le restant n'est jamais stocké : principal − Σ remboursements.
 */
import type { Debt, DebtPayment } from './types';
import { addMonths, diffDays, parseISODate, toISODate, today, type ISODate } from './dates';

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

/** Prochaine échéance : jour `dueDay` du mois en cours ou suivant ; sinon `dueDate`. */
export function nextDueDate(debt: Debt, now: ISODate = today()): ISODate | null {
  if (debt.dueDay && debt.dueDay >= 1 && debt.dueDay <= 31) {
    const d = parseISODate(now);
    const candidate = new Date(d.getFullYear(), d.getMonth(), Math.min(debt.dueDay, 28), 12);
    let iso = toISODate(candidate);
    if (iso < now) iso = addMonths(iso, 1);
    if (debt.dueDate && iso > debt.dueDate) return debt.dueDate;
    return iso;
  }
  return debt.dueDate ?? null;
}

export function debtStatus(debt: Debt, payments: DebtPayment[], now: ISODate = today()): DebtStatus {
  const paid = debtPaid(debt.id, payments);
  const remaining = Math.max(0, debt.principal - paid);
  const overpaid = Math.max(0, paid - debt.principal);
  const settled = remaining === 0 || debt.status === 'closed';
  const nextDue = settled ? null : nextDueDate(debt, now);
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
    const r = debtStatus(d, payments).remaining;
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
