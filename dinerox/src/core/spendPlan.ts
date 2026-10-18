/**
 * Contrôle de toute sortie d'argent et feuille de complément — argent disponible v2
 * (docs/argent-disponible.md §6, §5.2-5.3). Module PUR (testé : tests/argent-sorties.test.ts).
 *
 * Une sortie (dépense, transfert, versement, contribution, cotisation, remboursement,
 * prêt accordé, frais liés, confirmation d'une récurrence de dépense) est acceptée si
 *
 *   montant ≤ min sur les dates d ≥ date de l'opération de : disponible du compte à d
 *
 * (solde + découvert − mises de côté) : une opération antidatée ne crée pas de trou
 * dans le passé, et une dépense future déjà saisie reste couverte.
 *
 * Sinon, AVANT tout enregistrement, la feuille propose d'où prendre ce qui manque, dans
 * cet ordre et seulement les sources qui suffisent seules : (1) une mise de côté sur ce
 * même compte, (2) un autre compte courant, (3) un compte d'épargne ou une poche adossée
 * à un compte d'épargne, (4) « J'ai reçu de l'argent », (5) « Annuler ». Pour une mise de
 * côté, ni (1) ni (3). Un enfant n'a qu'un choix : « Demander à un parent ».
 * Rien n'est écrit ici : `complementDrafts` décrit le lot que l'étape 2 enregistrera
 * avec la sortie, tout ou rien.
 */
import { accountPositions, goalBacking } from './position';
import { moneyTracked } from './savingsCircle';
import type { CurrencyCode } from './money';
import type { ISODate } from './dates';
import type { GoalContribution, Role, SpaceData, Transaction } from './types';

type PlanData = Pick<SpaceData, 'accounts' | 'transactions' | 'goals' | 'goalContributions'>;

export interface SpendLine {
  /** Compte qui paie ; null = aucun compte encore (« Espèces » virtuel à 0, §6.1). */
  accountId: string | null;
  amount: number;
  date: ISODate;
  /** Réserve qui paie d'abord sa part (§5.3). */
  reserveId?: string | null;
  /** Modification : l'opération remplacée (seule la différence est contrôlée). */
  replaces?: string | null;
}

export type SpendSource =
  | { kind: 'set_aside'; goalId: string; accountId: string; free: number }
  | { kind: 'account'; accountId: string; free: number }
  | { kind: 'savings'; accountId: string; free: number }
  | { kind: 'goal'; goalId: string; accountId: string; free: number }
  | { kind: 'received' };

export interface Shortfall {
  accountId: string | null;
  missing: number;
  sources: SpendSource[];
}

export type SpendPlan =
  | { status: 'ok' }
  /** Aucun argent renseigné : « Indiquez d'abord votre argent disponible… » (§6.2). */
  | { status: 'no_money' }
  /** Il manque de l'argent ; au moins une source suffit (feuille de complément). */
  | { status: 'short'; shortfalls: Shortfall[] }
  /** Rien ne suffit : « Vous n'avez pas assez d'argent pour cette dépense » (seul « J'ai reçu… » reste). */
  | { status: 'insufficient'; shortfalls: Shortfall[] }
  /** Enfant d'un espace famille : « Demander à un parent » (§6.5). */
  | { status: 'ask_parent'; shortfalls: Shortfall[] };

/** Dates à vérifier pour une sortie datée `date` : la sienne et toutes les suivantes qui changent un solde, aujourd'hui compris. */
function datesFrom(d: PlanData, date: ISODate, today: ISODate): ISODate[] {
  const set = new Set<ISODate>([date]);
  if (today > date) set.add(today);
  for (const t of d.transactions) if (!t.deleted && t.date > date) set.add(t.date);
  for (const c of d.goalContributions) if (!c.deleted && c.date > date) set.add(c.date);
  return [...set];
}

/** Ce qu'on peut sortir d'un compte à partir de `date` sans créer de trou (min des disponibles, peut être négatif). */
export function debitableFrom(d: PlanData, accountId: string | null, date: ISODate, currency: CurrencyCode, today: ISODate): number {
  if (!accountId) return 0;
  let min = Infinity;
  for (const dd of datesFrom(d, date, today)) min = Math.min(min, accountPositions(d, currency, dd)[accountId]?.debitable ?? 0);
  return min === Infinity ? 0 : min;
}

const without = (d: PlanData, ids: (string | null | undefined)[]): PlanData => {
  const skip = new Set(ids.filter((x): x is string => !!x));
  return skip.size ? { ...d, transactions: d.transactions.filter((t) => !skip.has(t.id)) } : d;
};

/** Une sortie de `amount` sur ce compte à cette date est-elle possible ? `missing` : ce qui manque (arrondi vers le haut). */
export function canDebit(d: PlanData, op: { accountId: string | null; amount: number; date: ISODate; replaces?: string | null }, currency: CurrencyCode, today: ISODate): { ok: boolean; missing: number } {
  const room = debitableFrom(without(d, [op.replaces]), op.accountId, op.date, currency, today);
  const missing = Math.max(0, Math.ceil(op.amount - room));
  return { ok: missing === 0, missing };
}

export interface ReserveCover {
  /** Part sur un compte d'épargne de la réserve : transfert vers le compte qui paie. */
  savings: { accountId: string; amount: number }[];
  /** Part mise de côté sur le compte qui paie : la mise de côté prend fin, sans transfert. */
  sameAccount: number;
  /** Part mise de côté sur un autre compte courant : transfert, puis fin de la mise de côté. */
  otherAccounts: { accountId: string; amount: number }[];
  covered: number;
  /** Reste de la dépense (la part hors comptes ne paie rien) : suit le §6. */
  uncovered: number;
}

/**
 * Ce qu'une réserve paie réellement sur une dépense de `amount` (§5.3) : min(M, solde
 * ADOSSÉ à un compte). D'abord la part déjà sur le compte qui paie (rien ne bouge),
 * puis les comptes d'épargne, puis les autres comptes courants. Jamais l'argent hors comptes.
 */
export function reserveCover(d: PlanData, reserveId: string, amount: number, payingAccountId: string | null, currency: CurrencyCode): ReserveCover {
  const b = goalBacking(d, currency).get(reserveId);
  const out: ReserveCover = { savings: [], sameAccount: 0, otherAccounts: [], covered: 0, uncovered: amount };
  if (!b) return out;
  const isSavings = new Set(d.accounts.filter((a) => a.isSavings).map((a) => a.id));
  let left = amount;
  const take = (n: number) => {
    const x = Math.min(left, Math.max(0, n));
    left -= x;
    return x;
  };
  if (payingAccountId) out.sameAccount = take(b.byAccount[payingAccountId] ?? 0);
  for (const [id, v] of Object.entries(b.byAccount)) {
    if (id === payingAccountId || !isSavings.has(id)) continue;
    const x = take(v);
    if (x > 0) out.savings.push({ accountId: id, amount: x });
  }
  for (const [id, v] of Object.entries(b.byAccount)) {
    if (id === payingAccountId || isSavings.has(id)) continue;
    const x = take(v);
    if (x > 0) out.otherAccounts.push({ accountId: id, amount: x });
  }
  out.covered = amount - left;
  out.uncovered = left;
  return out;
}

export function spendPlan(input: { data: PlanData; currency: CurrencyCode; today: ISODate; lines: SpendLine[]; role?: Role | null; purpose?: 'spend' | 'set_aside' }): SpendPlan {
  const { currency, today, lines } = input;
  const d = without(input.data, lines.map((l) => l.replaces));
  if (!moneyTracked(d.accounts, d.transactions, currency)) return { status: 'no_money' };

  // Cumul par compte (plusieurs lignes d'une phrase ou d'une note vocale), part des réserves déduite d'abord.
  const perAccount = new Map<string | null, { amount: number; date: ISODate }>();
  for (const l of lines) {
    const covered = l.reserveId ? reserveCover(d, l.reserveId, l.amount, l.accountId, currency).covered : 0;
    const cur = perAccount.get(l.accountId) ?? { amount: 0, date: l.date };
    perAccount.set(l.accountId, { amount: cur.amount + l.amount - covered, date: l.date < cur.date ? l.date : cur.date });
  }

  const shortfalls: Shortfall[] = [];
  for (const [accountId, need] of perAccount) {
    const { missing } = canDebit(d, { accountId, amount: need.amount, date: need.date }, currency, today);
    if (missing > 0) shortfalls.push({ accountId, missing, sources: sourcesFor(d, accountId, missing, need.date, currency, today, input.purpose ?? 'spend') });
  }
  if (!shortfalls.length) return { status: 'ok' };
  if (input.role === 'child') return { status: 'ask_parent', shortfalls: shortfalls.map((s) => ({ ...s, sources: [] })) };
  const covered = shortfalls.every((s) => s.sources.some((x) => x.kind !== 'received'));
  return { status: covered ? 'short' : 'insufficient', shortfalls };
}

/** Sources qui suffisent SEULES, dans l'ordre du §6.3 ; « J'ai reçu de l'argent » en dernier. */
function sourcesFor(d: PlanData, accountId: string | null, missing: number, date: ISODate, currency: CurrencyCode, today: ISODate, purpose: 'spend' | 'set_aside'): SpendSource[] {
  const out: SpendSource[] = [];
  const backing = goalBacking(d, currency, today);
  const goalsById = new Map(d.goals.map((g) => [g.id, g]));
  const accounts = [...d.accounts].filter((a) => !a.deleted && a.active && a.currency === currency).sort((a, b) => a.order - b.order);
  // (1) Une mise de côté sur ce même compte : elle prend fin, aucun argent ne bouge.
  if (purpose === 'spend' && accountId) {
    for (const [goalId, b] of backing) {
      const v = b.byAccount[accountId] ?? 0;
      if (v >= missing && goalsById.has(goalId)) out.push({ kind: 'set_aside', goalId, accountId, free: v });
    }
  }
  // (2) Un autre compte courant : ce qui y est réellement libre.
  for (const a of accounts) {
    if (a.isSavings || a.id === accountId) continue;
    const free = debitableFrom(d, a.id, date, currency, today);
    if (free >= missing) out.push({ kind: 'account', accountId: a.id, free });
  }
  // (3) Un compte d'épargne (sa part libre), puis une poche adossée à un compte d'épargne.
  if (purpose === 'spend') {
    for (const a of accounts) {
      if (!a.isSavings) continue;
      const free = debitableFrom(d, a.id, date, currency, today);
      if (free >= missing) out.push({ kind: 'savings', accountId: a.id, free });
    }
    for (const a of accounts) {
      if (!a.isSavings) continue;
      const balance = accountPositions(d, currency, today)[a.id]?.balance ?? 0;
      for (const [goalId, b] of backing) {
        const v = Math.min(b.byAccount[a.id] ?? 0, Math.max(0, balance));
        if (v >= missing && goalsById.has(goalId)) out.push({ kind: 'goal', goalId, accountId: a.id, free: v });
      }
    }
  }
  out.push({ kind: 'received' });
  return out;
}

export type TransferDraft = Pick<Transaction, 'id' | 'type' | 'amount' | 'accountId' | 'toAccountId' | 'date'>;
export type ContributionDraft = Pick<GoalContribution, 'goalId' | 'amount' | 'date'> & Partial<Pick<GoalContribution, 'accountId' | 'transferId'>>;

/**
 * Le complément à enregistrer AVEC la sortie, dans le même lot (tout ou rien, étape 2).
 * Identifiants déterministes : deux validations du même complément n'écrivent pas deux fois.
 * La devise est celle du compte (posée par l'écriture).
 */
export function complementDrafts(source: SpendSource, missing: number, payingAccountId: string, date: ISODate): { transactions: TransferDraft[]; contributions: ContributionDraft[] } {
  const id = `cmp_${source.kind}_${'accountId' in source ? source.accountId : 'x'}_${payingAccountId}_${date.replace(/-/g, '')}_${missing}`;
  switch (source.kind) {
    case 'set_aside':
      return { transactions: [], contributions: [{ goalId: source.goalId, amount: -missing, accountId: payingAccountId, date }] };
    case 'account':
    case 'savings':
      return { transactions: [{ id, type: 'transfer', amount: missing, accountId: source.accountId, toAccountId: payingAccountId, date }], contributions: [] };
    case 'goal':
      return {
        transactions: [{ id, type: 'transfer', amount: missing, accountId: source.accountId, toAccountId: payingAccountId, date }],
        contributions: [{ goalId: source.goalId, amount: -missing, accountId: source.accountId, transferId: id, date }],
      };
    case 'received':
      return { transactions: [], contributions: [] };
  }
}

/**
 * Fermeture d'une poche (archiver, abandonner, terminer : §5.1) : un solde 0 est exigé.
 * S'il reste de l'argent, on demande où il va ; « Remettre dans mon disponible » met fin
 * aux mises de côté et rapatrie la part d'un compte d'épargne vers un compte courant.
 * La part hors comptes n'est sur aucun compte : elle reste à déclarer (`outside`).
 */
export function pocketClosure(d: PlanData, goalId: string, currency: CurrencyCode) {
  const b = goalBacking(d, currency).get(goalId) ?? { byAccount: {}, outside: 0, total: 0 };
  const isSavings = new Set(d.accounts.filter((a) => a.isSavings).map((a) => a.id));
  const firstCC = [...d.accounts].filter((a) => !a.deleted && a.active && !a.isSavings && a.currency === currency).sort((a, b) => a.order - b.order)[0]?.id ?? null;
  return {
    amount: b.total,
    outside: b.outside,
    needsDestination: b.total > 0,
    /** `available` : vers le disponible ; `savings` : l'argent reste sur l'épargne (fin de l'affectation seulement). */
    drafts(destination: 'available' | 'savings', date: ISODate): { transactions: TransferDraft[]; contributions: ContributionDraft[] } {
      const transactions: TransferDraft[] = [];
      const contributions: ContributionDraft[] = [];
      for (const [accountId, amount] of Object.entries(b.byAccount)) {
        if (isSavings.has(accountId) && destination === 'available' && firstCC) {
          const id = `close_${goalId}_${accountId}_${date.replace(/-/g, '')}`;
          transactions.push({ id, type: 'transfer', amount, accountId, toAccountId: firstCC, date });
          contributions.push({ goalId, amount: -amount, accountId, transferId: id, date });
        } else contributions.push({ goalId, amount: -amount, accountId, date });
      }
      return { transactions, contributions };
    },
  };
}
