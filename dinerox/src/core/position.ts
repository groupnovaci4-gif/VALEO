/**
 * Position de l'argent — argent disponible v2 (docs/argent-disponible.md §3.3, §4, §5, §5.6).
 * Module PUR (testé : tests/argent-position.test.ts).
 *
 *   D = Σ sur les comptes courants (CC) de la devise : max(0, solde à aujourd'hui) − mises de côté
 *       − parties négatives non couvertes par un découvert autorisé (E40c) ; jamais sous zéro.
 *
 *  - Seules les opérations datées jusqu'à aujourd'hui comptent (une opération future est « à venir »).
 *  - Ne comptent JAMAIS dans D : le revenu déclaré, une récurrence non confirmée, une cagnotte
 *    ou un remboursement attendus, un compte d'épargne (CE), l'épargne hors comptes.
 *  - « Mis de côté » = CE + mises de côté sur des CC + épargne hors comptes + créances de tontine.
 *  - « Total de vos comptes » = Σ des soldes des comptes qui comptent (CC + CE), par devise.
 *  - Patrimoine = comptes (solde > 0) + hors comptes + biens + créances − dettes ;
 *    jamais les objectifs ni les réserves (ils sont déjà dans les comptes ou hors comptes).
 *
 * Adossement des poches (§5.1) : chaque franc d'un objectif ou d'une réserve est
 * sur un CE (transfert ou affectation), mis de côté sur un CC précis, ou hors comptes.
 */
import { debtStatus } from './debts';
import { moneyTracked } from './savingsCircle';
import { tontineLedgerPositions } from './tontineLedger';
import type { CurrencyCode } from './money';
import type { ISODate } from './dates';
import type { Account, Goal, SpaceData, Transaction } from './types';

/** LA définition des comptes qui entrent dans les totaux : non supprimés, actifs — ou inactifs avec un solde (rien n'est masqué). */
export function countsInPosition(a: Pick<Account, 'deleted' | 'active'>, balance: number): boolean {
  return !a.deleted && (a.active || balance !== 0);
}

/** Solde de chaque compte à une date (opérations datées ≤ date ; ouverture comptée à partir de sa date). */
export function balancesAt(accounts: Account[], transactions: Transaction[], date: ISODate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of accounts) out[a.id] = !a.openingDate || a.openingDate <= date ? a.openingBalance : 0;
  for (const t of transactions) {
    if (t.deleted || t.date > date) continue;
    if (t.type === 'income' && t.accountId in out) out[t.accountId] += t.amount;
    else if (t.type === 'expense' && t.accountId in out) out[t.accountId] -= t.amount;
    else if (t.type === 'adjustment' && t.accountId in out) out[t.accountId] += t.direction === 'out' ? -t.amount : t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId in out) out[t.accountId] -= t.amount;
      if (t.toAccountId && t.toAccountId in out) out[t.toAccountId] += t.toAmount ?? t.amount;
    }
  }
  return out;
}

/** Une poche (objectif, réserve) qui détient encore de l'argent : ni supprimée, ni archivée, ni abandonnée. */
export function holdsMoney(g: Pick<Goal, 'deleted' | 'status'>): boolean {
  return !g.deleted && g.status !== 'archived' && g.status !== 'abandoned';
}

/** Premier compte courant actif de la devise (ordre d'affichage) : adossement des anciennes mises de côté (§13). */
export function firstSpendingAccountId(accounts: Account[], currency: CurrencyCode): string | null {
  return [...accounts].filter((a) => !a.deleted && a.active && !a.isSavings && a.currency === currency).sort((a, b) => a.order - b.order)[0]?.id ?? null;
}

export interface Backing {
  /** Compte → montant adossé (mise de côté sur un CC, part d'un CE). */
  byAccount: Record<string, number>;
  /** Épargne hors comptes (montant initial, §5.2). */
  outside: number;
  total: number;
}

/**
 * Adossement de chaque poche de la devise (§5.1) :
 *  - contribution avec transfert : sur le compte d'épargne du transfert ;
 *  - contribution sans transfert : sur son compte (CC = mise de côté ; CE = affectation) ;
 *  - ancienne contribution sans compte : mise de côté sur le premier CC actif (§13) ;
 *  - montant initial : hors comptes (§13 : « provenance non précisée » pour les anciens).
 * Un retrait sans compte (ancienne utilisation de réserve) vide d'abord ce premier CC.
 * Rien sous zéro.
 */
export function goalBacking(
  d: Pick<SpaceData, 'accounts' | 'transactions' | 'goals' | 'goalContributions'>,
  currency: CurrencyCode,
  date?: ISODate,
): Map<string, Backing> {
  const txById = new Map(d.transactions.map((t) => [t.id, t]));
  const first = firstSpendingAccountId(d.accounts, currency);
  const out = new Map<string, Backing>();
  for (const g of d.goals) {
    if (!holdsMoney(g) || g.currency !== currency) continue;
    const byAccount: Record<string, number> = {};
    let outside = Math.max(0, g.initialAmount);
    let unlocated = 0;
    for (const c of d.goalContributions) {
      if (c.deleted || c.goalId !== g.id || (date && c.date > date)) continue;
      let loc: string | null = null;
      if (c.transferId) {
        const t = txById.get(c.transferId);
        if (!t || t.deleted) continue;
        loc = (c.amount >= 0 ? t.toAccountId : t.accountId) ?? null;
      } else if (c.accountId) loc = c.accountId;
      else if (c.amount < 0) {
        unlocated += -c.amount;
        continue;
      } else loc = first;
      if (!loc) outside += c.amount;
      else byAccount[loc] = (byAccount[loc] ?? 0) + c.amount;
    }
    for (const k of Object.keys(byAccount)) byAccount[k] = Math.max(0, byAccount[k]);
    // Retraits sans compte : le premier CC d'abord, puis les autres comptes, puis le hors comptes.
    const order = [...(first && first in byAccount ? [first] : []), ...Object.keys(byAccount).filter((k) => k !== first)];
    for (const k of order) {
      const take = Math.min(unlocated, byAccount[k]);
      byAccount[k] -= take;
      unlocated -= take;
    }
    const fromOutside = Math.min(unlocated, outside);
    outside -= fromOutside;
    for (const k of Object.keys(byAccount)) if (byAccount[k] === 0) delete byAccount[k];
    const total = Object.values(byAccount).reduce((n, v) => n + v, 0) + outside;
    out.set(g.id, { byAccount, outside, total });
  }
  return out;
}

export interface AccountPosition {
  id: string;
  isSavings: boolean;
  balance: number;
  /** CC : mises de côté portées par ce compte. */
  setAside: number;
  /** CE : part affectée à des objectifs ou réserves. */
  assigned: number;
  /** Disponible du compte : max(0, solde) − mises de côté (CC) ; part libre (CE). */
  free: number;
  /** Ce qu'une sortie peut prendre : solde + découvert − mises de côté (peut être négatif). */
  debitable: number;
  /** CC : partie négative non couverte par un découvert autorisé, retirée de D (§4, E40c). */
  uncovered: number;
}

export interface Position {
  currency: CurrencyCode;
  /** L'argent a-t-il été renseigné (§4) ? Sinon : carte « Votre argent disponible aujourd'hui ». */
  tracked: boolean;
  /** D : argent disponible. */
  available: number;
  /** « Mis de côté » : CE + mises de côté sur des CC + hors comptes + créances de tontine. */
  setAside: number;
  /** « Total de vos comptes » : CC + CE. */
  totalAccounts: number;
  /** Épargne hors comptes. */
  outside: number;
  tontineReceivable: number;
  tontineAdvance: number;
  /** Parties négatives des soldes (découvert, carte, solde à régulariser) : dette à court terme. */
  shortTermDebt: number;
  netWorth: number;
  accounts: Record<string, AccountPosition>;
  /** Comptes à solde négatif (« Régulariser »). */
  negatives: string[];
  /** Autres devises, côte à côte, jamais additionnées. */
  otherCurrencies: Partial<Record<CurrencyCode, { available: number; totalAccounts: number }>>;
}

type PositionData = Pick<SpaceData, 'accounts' | 'transactions' | 'goals' | 'goalContributions'> & Partial<Pick<SpaceData, 'tontines' | 'tontineEntries' | 'debts' | 'debtPayments' | 'assets'>>;

/** Comptes d'une devise à une date, avec leurs mises de côté (base de D et du contrôle des sorties). */
export function accountPositions(d: PositionData, currency: CurrencyCode, date: ISODate): Record<string, AccountPosition> {
  const balances = balancesAt(d.accounts, d.transactions, date);
  const perAccount: Record<string, number> = {};
  for (const b of goalBacking(d, currency, date).values()) for (const [k, v] of Object.entries(b.byAccount)) perAccount[k] = (perAccount[k] ?? 0) + v;
  const out: Record<string, AccountPosition> = {};
  for (const a of d.accounts) {
    const balance = balances[a.id] ?? 0;
    if (a.currency !== currency || !countsInPosition(a, balance)) continue;
    const held = perAccount[a.id] ?? 0;
    out[a.id] = {
      id: a.id,
      isSavings: a.isSavings,
      balance,
      setAside: a.isSavings ? 0 : held,
      assigned: a.isSavings ? held : 0,
      free: Math.max(0, balance) - held,
      debitable: balance + Math.max(0, a.overdraftLimit ?? 0) - held,
      uncovered: a.isSavings ? 0 : Math.max(0, -balance - Math.max(0, a.overdraftLimit ?? 0)),
    };
  }
  return out;
}

function currencyTotals(accounts: Record<string, AccountPosition>) {
  let available = 0;
  let totalAccounts = 0;
  for (const a of Object.values(accounts)) {
    totalAccounts += a.balance;
    if (!a.isSavings) available += a.free - a.uncovered;
  }
  // Un négatif non autorisé est retiré de D (§4) ; D ne descend jamais sous zéro (E40).
  return { available: Math.max(0, available), totalAccounts };
}

export function positionOf(d: PositionData, currency: CurrencyCode, today: ISODate): Position {
  const accounts = accountPositions(d, currency, today);
  const { available, totalAccounts } = currencyTotals(accounts);
  const backing = goalBacking(d, currency, today);
  let outside = 0;
  for (const b of backing.values()) outside += b.outside;
  const tontines = d.tontines ? tontineLedgerPositions({ tontines: d.tontines, tontineEntries: d.tontineEntries ?? [] }, currency, today) : { receivable: 0, advance: 0 };

  let savingsAccounts = 0;
  let setAsideOnCC = 0;
  let positive = 0;
  let shortTermDebt = 0;
  const negatives: string[] = [];
  for (const a of Object.values(accounts)) {
    if (a.isSavings) savingsAccounts += Math.max(0, a.balance);
    else setAsideOnCC += a.setAside;
    positive += Math.max(0, a.balance);
    if (a.balance < 0) {
      shortTermDebt += -a.balance;
      negatives.push(a.id);
    }
  }

  let receivables = 0;
  let debts = 0;
  for (const x of d.debts ?? []) {
    if (x.deleted || x.currency !== currency) continue;
    const s = debtStatus(x, d.debtPayments ?? [], today);
    const r = s.settled ? 0 : s.remaining;
    if (x.direction === 'i_owe') debts += r;
    else receivables += r;
  }
  const assets = (d.assets ?? []).filter((a) => !a.deleted && a.currency === currency).reduce((n, a) => n + a.value, 0);

  const otherCurrencies: Position['otherCurrencies'] = {};
  for (const cur of new Set(d.accounts.filter((a) => !a.deleted && a.currency !== currency).map((a) => a.currency))) {
    const others = accountPositions(d, cur, today);
    if (Object.keys(others).length) otherCurrencies[cur] = currencyTotals(others);
  }

  return {
    currency,
    tracked: moneyTracked(d.accounts, d.transactions, currency),
    available,
    setAside: savingsAccounts + setAsideOnCC + outside + tontines.receivable,
    totalAccounts,
    outside,
    tontineReceivable: tontines.receivable,
    tontineAdvance: tontines.advance,
    shortTermDebt,
    netWorth: positive + outside + assets + receivables + tontines.receivable - debts - tontines.advance - shortTermDebt,
    accounts,
    negatives,
    otherCurrencies,
  };
}
