/**
 * Natures des opérations — argent disponible v2 (docs/argent-disponible.md §2.3).
 * Module PUR (testé : tests/argent-natures-rapports.test.ts).
 *
 * Toute opération reçoit UNE nature calculée : rapports, historique, export,
 * budget, reste par jour, coach et score lisent cette fonction, et rien d'autre.
 * Les natures se CALCULENT (rien à migrer) : le passé est reclassé lui aussi
 * (cagnottes, cotisations sans tour, opérations liées à une dette).
 *
 * `ouverture` n'est pas une opération : c'est la première ligne du relevé d'un
 * compte (`ledger.ts`), produite à partir de `Account.openingBalance`.
 */
import type { Account, Debt, DebtPayment, SpaceData, Tontine, TontineEntry, Transaction } from './types';
import { CIRCLE_SUBCATEGORY_IDS, isSavingExpense } from './savingsFlows';

export type Nature =
  | 'revenu'
  | 'remboursement_achat'
  | 'depense'
  | 'frais'
  | 'interets'
  | 'cotisation_association'
  | 'transfert'
  | 'versement_epargne'
  | 'retrait_epargne'
  | 'cotisation_tontine'
  | 'retour_tontine'
  | 'emprunt_recu'
  | 'remboursement_capital'
  | 'pret_accorde'
  | 'remboursement_recu'
  | 'ajustement'
  | 'ouverture';

/** Sous-catégorie système des frais d'envoi, de retrait et de compte (§3.4 ; ajoutée au catalogue à l'étape 3). */
export const SUB_OTHER_FEES = 'sub_other_fees';
/** Intérêts d'un crédit (§5.5). */
export const SUB_DEBTS_INTEREST = 'sub_debts_interest';
/** Cotisation sans tour : association, mutuelle, ressortissants, caisse de décès (D6). */
export const SUB_INFORMAL_DUES = 'sub_informal_dues';
/** Catégorie de revenu « Remboursement » (d'un achat) : vient en déduction des dépenses. */
export const INC_REFUND = 'inc_refund';
/** Ancienne catégorie de revenu « Tontine » (cagnotte) : un retour, jamais un revenu (D5). */
export const INC_TONTINE = 'inc_tontine';

/** Natures qui comptent dans les DÉPENSES d'une période (§10.1), remboursement d'achat en déduction. */
export const SPENDING_NATURES: ReadonlySet<Nature> = new Set(['depense', 'frais', 'interets', 'cotisation_association']);

export interface NatureContext {
  savings: Set<string>;
  tontineType: Map<string, Tontine['type']>;
  debtDirection: Map<string, Debt['direction']>;
  /** Opération → dette, par le lien porté par le remboursement (anciennes opérations sans `debtId`). */
  debtOfTx: Map<string, string>;
  /** Opération → tontine et sorte d'entrée du carnet (cotisation, cagnotte, frais, pénalité). */
  tontineOfTx: Map<string, { tontineId: string; kind: TontineEntry['kind'] }>;
  /** Opérations qui ont des opérations liées (transferts avec frais, remboursements avec intérêts). */
  transferIds: Set<string>;
}

export function natureContext(
  d: Pick<SpaceData, 'accounts' | 'transactions'> & Partial<Pick<SpaceData, 'tontines' | 'tontineEntries' | 'debts' | 'debtPayments'>>,
): NatureContext {
  const savings = new Set((d.accounts as Account[]).filter((a) => a.isSavings && !a.deleted).map((a) => a.id));
  const tontineType = new Map((d.tontines ?? []).filter((t) => !t.deleted).map((t) => [t.id, t.type] as const));
  const debtDirection = new Map((d.debts ?? []).filter((x) => !x.deleted).map((x) => [x.id, x.direction] as const));
  const debtOfTx = new Map<string, string>();
  for (const p of (d.debtPayments ?? []) as DebtPayment[]) if (!p.deleted && p.transactionId) debtOfTx.set(p.transactionId, p.debtId);
  const tontineOfTx = new Map<string, { tontineId: string; kind: TontineEntry['kind'] }>();
  for (const e of d.tontineEntries ?? []) if (!e.deleted && e.transactionId) tontineOfTx.set(e.transactionId, { tontineId: e.tontineId, kind: e.kind });
  const transferIds = new Set(d.transactions.filter((t) => !t.deleted && t.type === 'transfer').map((t) => t.id));
  return { savings, tontineType, debtDirection, debtOfTx, tontineOfTx, transferIds };
}

/** La nature d'une opération (une seule). */
export function natureOf(t: Transaction, ctx: NatureContext): Nature {
  if (t.type === 'adjustment') return 'ajustement';
  if (t.type === 'transfer') {
    const fromSavings = ctx.savings.has(t.accountId);
    const toSavings = !!t.toAccountId && ctx.savings.has(t.toAccountId);
    if (!fromSavings && toSavings) return 'versement_epargne';
    if (fromSavings && !toSavings) return 'retrait_epargne';
    return 'transfert';
  }

  // Dettes et prêts : le lien porté par l'opération, sinon par le remboursement.
  const debtId = t.debtId ?? ctx.debtOfTx.get(t.id) ?? null;
  const direction = debtId ? ctx.debtDirection.get(debtId) : undefined;
  // Tontine : le lien porté par l'opération, sinon par l'entrée du carnet.
  const entry = ctx.tontineOfTx.get(t.id);
  const tontineId = t.tontineId ?? entry?.tontineId ?? null;

  if (t.type === 'income') {
    if (direction === 'i_owe') return 'emprunt_recu';
    if (direction === 'owed_to_me') return 'remboursement_recu';
    if (tontineId || t.categoryId === INC_TONTINE) return 'retour_tontine';
    if (t.categoryId === INC_REFUND) return 'remboursement_achat';
    return 'revenu';
  }

  // Dépense (type `expense`).
  if (entry && (entry.kind === 'fee' || entry.kind === 'penalty')) return 'frais';
  if (t.subcategoryId === SUB_OTHER_FEES) return 'frais';
  if (t.subcategoryId === SUB_DEBTS_INTEREST) return 'interets';
  if (t.linkedTransactionId) return ctx.transferIds.has(t.linkedTransactionId) ? 'frais' : 'interets';
  if (direction === 'i_owe') return 'remboursement_capital';
  if (direction === 'owed_to_me') return 'pret_accorde';
  if (tontineId) return ctx.tontineType.get(tontineId) === 'fixed_contribution' ? 'cotisation_association' : 'cotisation_tontine';
  if (t.subcategoryId && CIRCLE_SUBCATEGORY_IDS.has(t.subcategoryId)) return 'cotisation_tontine';
  if (isSavingExpense(t)) return 'versement_epargne';
  return 'depense';
}

/** Natures calculées de toutes les opérations (identifiant → nature). */
export function naturesOf(d: Parameters<typeof natureContext>[0]): Map<string, Nature> {
  const ctx = natureContext(d);
  return new Map(d.transactions.filter((t) => !t.deleted).map((t) => [t.id, natureOf(t, ctx)]));
}
