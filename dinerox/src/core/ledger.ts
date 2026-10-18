/**
 * Grand livre : rapport d'une période, historique, relevé d'un compte, export —
 * argent disponible v2 (docs/argent-disponible.md §10). Module PUR
 * (testé : tests/argent-natures-rapports.test.ts).
 *
 * Mêmes natures partout (`natureOf`) :
 *   Revenus (R)       = `revenu`
 *   Dépenses (C)      = dépense + frais + intérêts + cotisation sans tour − remboursement d'achat
 *   Remboursements    = capital remboursé (`remboursement_capital`)
 *   Épargne nette (S) = versements − retraits : comptes d'épargne, mises de côté sur un compte
 *                       courant, cotisations de tournante payées depuis un compte courant,
 *                       revenus arrivés sur un compte d'épargne, moins les retours de tontine
 *                       (une cotisation qui rembourse l'avance du groupe n'est pas de l'épargne)
 *   Financement       = emprunts reçus, prêts accordés, remboursements reçus, avances du groupe
 *                       et leur remboursement par les cotisations suivantes (§5.4)
 *   Clôture de tontine confirmée : frais (dépenses, épargne nette) ou gain (revenus) à `closedAt`
 *   Corrections       = ajustements + / −
 *   Remises et pertes = dettes remises, créances abandonnées
 *   Résultat          = R − C − remboursements (le mot « Solde » est réservé au solde d'un compte)
 */
import { natureContext, natureOf, SPENDING_NATURES, type Nature } from './nature';
import { firstSpendingAccountId } from './position';
import { tontineClosure, tontineMovements } from './tontineLedger';
import { writtenOffAmount } from './debts';
import { inPeriod, toISODate, type ISODate } from './dates';
import type { CurrencyCode } from './money';
import type { Account, SpaceData, Transaction } from './types';

type LedgerData = Pick<SpaceData, 'accounts' | 'transactions' | 'goals' | 'goalContributions'> & Partial<Pick<SpaceData, 'tontines' | 'tontineEntries' | 'debts' | 'debtPayments'>>;
type Range = { start: ISODate; end: ISODate };

export interface LedgerTotals {
  revenus: number;
  depenses: number;
  epargneNette: number;
}

export interface PeriodReport extends LedgerTotals {
  remboursements: number;
  /**
   * `avancesTontine` : avances du groupe reçues avec une cagnotte (moins un gain de clôture) ;
   * `remboursementsAvance` : cotisations qui, après la cagnotte, remboursent cette avance (§5.4).
   */
  financement: { empruntsRecus: number; pretsAccordes: number; remboursementsRecus: number; avancesTontine: number; remboursementsAvance: number };
  corrections: { plus: number; minus: number };
  remisesPertes: number;
  resultat: number;
}

/** Rapport d'une période dans UNE devise (§10.1). */
export function periodReport(d: LedgerData, period: Range, currency: CurrencyCode): PeriodReport {
  const ctx = natureContext(d);
  const r: PeriodReport = {
    revenus: 0,
    depenses: 0,
    epargneNette: 0,
    remboursements: 0,
    financement: { empruntsRecus: 0, pretsAccordes: 0, remboursementsRecus: 0, avancesTontine: 0, remboursementsAvance: 0 },
    corrections: { plus: 0, minus: 0 },
    remisesPertes: 0,
    resultat: 0,
  };
  // Tontines suivies : cotisations et cagnottes lues dans l'ordre (épargne, retour, avance,
  // remboursement de l'avance) ; leurs opérations ne sont pas recomptées plus bas.
  const txById = new Map(d.transactions.map((t) => [t.id, t]));
  const followed = new Set<string>();
  for (const tontine of d.tontines ?? []) {
    if (tontine.deleted || tontine.currency !== currency || tontine.type === 'fixed_contribution') continue;
    followed.add(tontine.id);
    for (const m of tontineMovements(tontine, d.tontineEntries ?? [], d.transactions)) {
      if (!inPeriod(m.date, period)) continue;
      const linked = m.transactionId ? txById.get(m.transactionId) : undefined;
      // Payée depuis (ou reçue sur) un compte d'épargne : un mouvement à l'intérieur de l'épargne.
      const onSavings = !!linked && ctx.savings.has(linked.accountId);
      if (m.kind === 'contribution') {
        if (!onSavings) r.epargneNette += m.savings;
        r.financement.remboursementsAvance += m.repay;
      } else {
        if (!onSavings) r.epargneNette -= m.retour;
        r.financement.avancesTontine += m.avance;
      }
    }
    // Clôture confirmée : frais (dépense) ou gain (revenu) à la date de clôture, sans opération.
    if (tontine.closedAt && inPeriod(tontine.closedAt, period)) {
      const c = tontineClosure(tontine, d.tontineEntries ?? []);
      r.depenses += c.fees;
      r.epargneNette -= c.fees;
      r.revenus += c.gain;
      r.financement.avancesTontine -= c.gain;
    }
  }
  const tontineOf = (t: Transaction) => t.tontineId ?? ctx.tontineOfTx.get(t.id)?.tontineId ?? null;

  for (const t of d.transactions) {
    if (t.deleted || t.currency !== currency || !inPeriod(t.date, period)) continue;
    const n = natureOf(t, ctx);
    if ((n === 'cotisation_tontine' || n === 'retour_tontine') && followed.has(tontineOf(t) ?? '')) continue;
    const onSavings = ctx.savings.has(t.accountId);
    if (SPENDING_NATURES.has(n)) r.depenses += t.amount;
    switch (n) {
      case 'revenu':
        r.revenus += t.amount;
        // Un revenu versé directement sur un compte d'épargne est aussi de l'épargne (E46).
        if (onSavings) r.epargneNette += t.amount;
        break;
      case 'remboursement_achat':
        r.depenses -= t.amount;
        break;
      case 'remboursement_capital':
        r.remboursements += t.amount;
        break;
      case 'versement_epargne':
        r.epargneNette += t.amount;
        break;
      case 'retrait_epargne':
        r.epargneNette -= t.amount;
        break;
      case 'cotisation_tontine':
        // Payée depuis un compte d'épargne : un mouvement à l'intérieur de l'épargne.
        if (!onSavings) r.epargneNette += t.amount;
        break;
      case 'retour_tontine':
        // Ancienne cagnotte sans tontine suivie : tout est un retour d'épargne.
        if (!onSavings) r.epargneNette -= t.amount;
        break;
      case 'emprunt_recu':
        r.financement.empruntsRecus += t.amount;
        break;
      case 'pret_accorde':
        r.financement.pretsAccordes += t.amount;
        break;
      case 'remboursement_recu':
        r.financement.remboursementsRecus += t.amount;
        break;
      case 'ajustement':
        if (t.direction === 'out') r.corrections.minus += t.amount;
        else r.corrections.plus += t.amount;
        break;
    }
  }

  // Mises de côté sur un compte courant (et leur fin) : sans opération, mais de l'épargne.
  const savings = ctx.savings;
  const goalCurrency = new Map(d.goals.map((g) => [g.id, g.currency]));
  for (const c of d.goalContributions) {
    if (c.deleted || c.transferId || goalCurrency.get(c.goalId) !== currency || !inPeriod(c.date, period)) continue;
    const loc = c.accountId ?? firstSpendingAccountId(d.accounts, currency);
    if (loc && !savings.has(loc)) r.epargneNette += c.amount;
  }

  for (const x of d.debts ?? []) {
    if (x.deleted || x.currency !== currency || !x.closedAt || !inPeriod(x.closedAt, period)) continue;
    r.remisesPertes += writtenOffAmount(x, d.debtPayments ?? []);
  }
  r.resultat = r.revenus - r.depenses - r.remboursements;
  return r;
}

/** Totaux de l'historique : IDENTIQUES à ceux du rapport de la même période (§10.2, test de parité). */
export function historyTotals(d: LedgerData, period: Range, currency: CurrencyCode): LedgerTotals {
  const r = periodReport(d, period, currency);
  return { revenus: r.revenus, depenses: r.depenses, epargneNette: r.epargneNette };
}

export interface StatementLine {
  date: ISODate;
  nature: Nature;
  /** Entrée (> 0) ou sortie (< 0) sur ce compte. */
  amount: number;
  transactionId: string | null;
}

export interface AccountStatement {
  start: number;
  inflows: number;
  outflows: number;
  end: number;
  lines: StatementLine[];
}

/** Effet d'une opération sur un compte (dans sa devise). */
function effectOn(t: Transaction, accountId: string): number {
  if (t.type === 'transfer') return (t.toAccountId === accountId ? (t.toAmount ?? t.amount) : 0) - (t.accountId === accountId ? t.amount : 0);
  if (t.accountId !== accountId) return 0;
  if (t.type === 'income') return t.amount;
  if (t.type === 'expense') return -t.amount;
  return t.direction === 'out' ? -t.amount : t.amount;
}

/** Date de l'ouverture : sa date si elle est connue, sinon le jour LOCAL de création du compte. */
export function openingDateOf(a: Pick<Account, 'openingDate' | 'createdAt'>): ISODate {
  return a.openingDate ?? toISODate(new Date(a.createdAt));
}

/** Relevé d'un compte : solde au début, entrées, sorties, solde à la fin — début + entrées − sorties = fin (§10.2). */
export function accountStatement(d: Pick<SpaceData, 'accounts' | 'transactions'> & Partial<LedgerData>, accountId: string, period: Range): AccountStatement {
  const account = d.accounts.find((a) => a.id === accountId);
  const ctx = natureContext(d);
  const lines: StatementLine[] = [];
  let start = 0;
  if (account && account.openingBalance !== 0) {
    // Ouverture sans date (ancien compte) : avant toute opération.
    if (!account.openingDate || account.openingDate < period.start) start += account.openingBalance;
    else if (account.openingDate <= period.end) lines.push({ date: account.openingDate, nature: 'ouverture', amount: account.openingBalance, transactionId: null });
  }
  const sorted = d.transactions.filter((t) => !t.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const t of sorted) {
    const e = effectOn(t, accountId);
    if (!e) continue;
    if (t.date < period.start) start += e;
    else if (t.date <= period.end) lines.push({ date: t.date, nature: natureOf(t, ctx), amount: e, transactionId: t.id });
  }
  const inflows = lines.filter((l) => l.amount > 0).reduce((n, l) => n + l.amount, 0);
  const outflows = lines.filter((l) => l.amount < 0).reduce((n, l) => n - l.amount, 0);
  return { start, inflows, outflows, end: start + inflows - outflows, lines };
}

/** Cellule CSV : neutralise les formules (injection dans un tableur) ; un nombre seul reste un nombre. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Opérations liées à supprimer avec une opération (frais d'un transfert, intérêts d'un remboursement). */
export function linkedToDelete(transactionId: string, transactions: Pick<Transaction, 'id' | 'deleted' | 'linkedTransactionId'>[]): string[] {
  return transactions.filter((t) => !t.deleted && t.linkedTransactionId === transactionId).map((t) => t.id);
}

/**
 * Export CSV (§10.3), séparateur « ; ». Colonnes : date ; nature ; compte ; débit ;
 * crédit ; devise ; compte de destination ; montant reçu ; devise reçue ; catégorie ;
 * sous-catégorie ; motif ; provenance. Une ligne d'OUVERTURE par compte : pour
 * chaque compte, ouverture + Σ crédits − Σ débits (+ montants reçus) = solde affiché.
 */
export function ledgerCsv(
  d: Pick<SpaceData, 'accounts' | 'transactions'> & Partial<LedgerData>,
  ctx: { headers: string[]; accountName: (id: string) => string; categoryName: (id: string) => string; natureLabel: (n: Nature) => string; decimals: (currency: string) => number; period?: Range },
): string {
  const inRange = (date: ISODate) => !ctx.period || inPeriod(date, ctx.period);
  const nctx = natureContext(d);
  const major = (amount: number, currency: string) => {
    const dec = ctx.decimals(currency);
    return (amount / 10 ** dec).toFixed(dec);
  };
  const rows: { date: ISODate; cells: unknown[] }[] = [];
  for (const a of d.accounts) {
    if (a.deleted || a.openingBalance === 0 || !inRange(openingDateOf(a))) continue;
    const debit = a.openingBalance < 0 ? major(-a.openingBalance, a.currency) : '';
    const credit = a.openingBalance > 0 ? major(a.openingBalance, a.currency) : '';
    rows.push({ date: openingDateOf(a), cells: [openingDateOf(a), ctx.natureLabel('ouverture'), ctx.accountName(a.id), debit, credit, a.currency, '', '', '', '', '', '', a.openingNote ?? ''] });
  }
  const currencyOf = new Map(d.accounts.map((a) => [a.id, a.currency]));
  const txs = d.transactions.filter((t) => !t.deleted && inRange(t.date)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const t of txs) {
    const out = t.type === 'expense' || t.type === 'transfer' || (t.type === 'adjustment' && t.direction === 'out');
    const toCurrency = t.toAccountId ? (currencyOf.get(t.toAccountId) ?? t.currency) : '';
    rows.push({
      date: t.date,
      cells: [
        t.date,
        ctx.natureLabel(natureOf(t, nctx)),
        ctx.accountName(t.accountId),
        out ? major(t.amount, t.currency) : '',
        out ? '' : major(t.amount, t.currency),
        t.currency,
        t.toAccountId ? ctx.accountName(t.toAccountId) : '',
        t.toAccountId ? major(t.toAmount ?? t.amount, toCurrency) : '',
        toCurrency,
        t.categoryId ? ctx.categoryName(t.categoryId) : '',
        t.subcategoryId ? ctx.categoryName(t.subcategoryId) : '',
        t.reason ?? '',
        '',
      ],
    });
  }
  // Tri stable : les ouvertures restent avant les opérations du même jour.
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return '﻿' + [ctx.headers.map(csvCell).join(';'), ...rows.map((r) => r.cells.map(csvCell).join(';'))].join('\n');
}
