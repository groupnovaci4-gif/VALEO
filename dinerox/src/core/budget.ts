/**
 * Budget & enveloppes : consommation, alertes de seuil, budget automatique.
 */
import type { BudgetMethod, BudgetPlan, Category, Envelope, Transaction } from './types';
import type { CurrencyCode } from './money';
import { roundTo } from './money';
import { monthKey, type MonthKey } from './dates';

export type EnvelopeLevel = 'ok' | 'warn70' | 'warn90' | 'full' | 'over';

export interface EnvelopeStatus {
  envelope: Envelope;
  budget: number;
  spent: number;
  /** budget − spent (négatif en cas de dépassement). */
  remaining: number;
  /** Pourcentage consommé (peut dépasser 100). 0 si budget nul et rien dépensé. */
  percent: number;
  level: EnvelopeLevel;
}

/** Seuils d'alerte demandés : 70 %, 90 %, 100 %, dépassement. */
export function envelopeLevel(spent: number, budget: number): EnvelopeLevel {
  if (budget <= 0) return spent > 0 ? 'over' : 'ok';
  if (spent > budget) return 'over';
  const pct = (spent / budget) * 100;
  if (pct >= 100) return 'full';
  if (pct >= 90) return 'warn90';
  if (pct >= 70) return 'warn70';
  return 'ok';
}

/** Budget d'une enveloppe pour un mois : plan du mois s'il existe, sinon budget par défaut. */
export function envelopeBudgetFor(envelope: Envelope, month: MonthKey, plans: BudgetPlan[]): number {
  const plan = plans.find((p) => !p.deleted && p.month === month);
  const v = plan?.allocations?.[envelope.id];
  return typeof v === 'number' ? v : envelope.monthlyBudget;
}

/**
 * Enveloppe d'une dépense : celle choisie explicitement, sinon celle à
 * laquelle sa catégorie est rattachée.
 */
export function resolveEnvelopeId(t: Pick<Transaction, 'envelopeId' | 'categoryId'>, envelopes: Envelope[]): string | null {
  if (t.envelopeId) return t.envelopeId;
  if (!t.categoryId) return null;
  const e = envelopes.find((x) => !x.deleted && x.active && x.categoryIds.includes(t.categoryId!));
  return e?.id ?? null;
}

/** Dépensé par enveloppe pour un mois (dans une devise). */
export function spentByEnvelope(
  transactions: Transaction[],
  envelopes: Envelope[],
  month: MonthKey,
  currency: CurrencyCode,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of transactions) {
    if (t.deleted || t.type !== 'expense' || t.currency !== currency || monthKey(t.date) !== month) continue;
    const id = resolveEnvelopeId(t, envelopes);
    if (id) out[id] = (out[id] ?? 0) + t.amount;
  }
  return out;
}

export function envelopeStatuses(
  envelopes: Envelope[],
  transactions: Transaction[],
  plans: BudgetPlan[],
  month: MonthKey,
  currency: CurrencyCode,
): EnvelopeStatus[] {
  const spent = spentByEnvelope(transactions, envelopes, month, currency);
  return envelopes
    .filter((e) => !e.deleted && e.active)
    .sort((a, b) => a.order - b.order)
    .map((envelope) => {
      const budget = envelopeBudgetFor(envelope, month, plans);
      const s = spent[envelope.id] ?? 0;
      return {
        envelope,
        budget,
        spent: s,
        remaining: budget - s,
        percent: budget > 0 ? Math.round((s / budget) * 100) : s > 0 ? 100 : 0,
        level: envelopeLevel(s, budget),
      };
    });
}

export interface BudgetSummary {
  planned: number;
  spent: number;
  /** planned − spent sur les enveloppes (dépassements inclus). */
  remaining: number;
  /** Dépenses du mois hors enveloppe. */
  unassigned: number;
}

export function budgetSummary(statuses: EnvelopeStatus[], monthExpenses: number): BudgetSummary {
  const planned = statuses.reduce((s, x) => s + x.budget, 0);
  const spent = statuses.reduce((s, x) => s + x.spent, 0);
  return { planned, spent, remaining: planned - spent, unassigned: Math.max(0, monthExpenses - spent) };
}

/** Consommation d'une enveloppe sur les derniers mois (historique). */
export function envelopeHistory(
  envelope: Envelope,
  envelopes: Envelope[],
  transactions: Transaction[],
  plans: BudgetPlan[],
  months: MonthKey[],
  currency: CurrencyCode,
): { month: MonthKey; budget: number; spent: number }[] {
  return months.map((m) => ({
    month: m,
    budget: envelopeBudgetFor(envelope, m, plans),
    spent: spentByEnvelope(transactions, envelopes, m, currency)[envelope.id] ?? 0,
  }));
}

// ─── Budget automatique ───────────────────────────────────────────────

export type BudgetBucket = 'housing' | 'food' | 'transport' | 'family' | 'savings' | 'project' | 'free' | 'needs' | 'wants';

export interface BudgetLine {
  bucket: BudgetBucket;
  amount: number;
}

/**
 * Répartition « enveloppes » par défaut, calibrée sur l'exemple de référence
 * 450 000 FCFA → 100/80/40/50/50/30 + 100 libre.
 */
const ENVELOPE_RATIOS: [BudgetBucket, number][] = [
  ['housing', 100 / 450],
  ['food', 80 / 450],
  ['transport', 40 / 450],
  ['family', 50 / 450],
  ['savings', 50 / 450],
  ['project', 30 / 450],
];

/**
 * Propose un budget pour un revenu mensuel. Les montants sont arrondis à un
 * pas lisible (5 000 en XOF, 5 en devise à décimales) ; le reste va dans
 * « libre » pour que la somme soit EXACTEMENT égale au revenu.
 */
export function proposeBudget(income: number, method: BudgetMethod, currency: CurrencyCode): BudgetLine[] {
  if (income <= 0) return [];
  const step = currency === 'XOF' || currency === 'XAF' || currency === 'GNF' ? 5000 : 5;
  const lines: BudgetLine[] = [];
  const push = (bucket: BudgetBucket, ratio: number) => {
    lines.push({ bucket, amount: roundTo(income * ratio, step, currency) });
  };
  /** Les arrondis ne doivent jamais faire dépasser le revenu (sinon une ligne deviendrait négative). */
  const fit = () => {
    let excess = lines.reduce((s, l) => s + l.amount, 0) - income;
    while (excess > 0) {
      const biggest = lines.reduce((a, b) => (b.amount > a.amount ? b : a));
      const cut = Math.min(excess, biggest.amount);
      biggest.amount -= cut;
      excess -= cut;
    }
  };
  switch (method) {
    case '50_30_20':
      push('needs', 0.5);
      push('wants', 0.3);
      push('savings', 0.2);
      break;
    case 'zero_based':
      // Budget base zéro : chaque franc a une affectation, aucun « libre ».
      for (const [b, r] of ENVELOPE_RATIOS) push(b, r);
      fit();
      {
        const used = lines.reduce((s, l) => s + l.amount, 0);
        const savings = lines.find((l) => l.bucket === 'savings')!;
        savings.amount += income - used;
      }
      return lines;
    default:
      for (const [b, r] of ENVELOPE_RATIOS) push(b, r);
  }
  fit();
  const used = lines.reduce((s, l) => s + l.amount, 0);
  const rest = income - used;
  if (method === '50_30_20') {
    lines[lines.length - 1].amount += rest; // l'arrondi profite à l'épargne
  } else {
    lines.push({ bucket: 'free', amount: rest });
  }
  return lines;
}

/**
 * Proposition d'affectation d'un revenu ponctuel (« J'ai reçu 250 000 ») au
 * prorata de ce qui reste à financer dans chaque enveloppe ce mois-ci. Le
 * surplus éventuel est « libre ». La somme est exactement égale au revenu.
 * Rien n'est enregistré : l'utilisateur confirme ou modifie.
 */
export function proposeIncomeAllocation(
  amount: number,
  statuses: EnvelopeStatus[],
  currency: CurrencyCode,
): { envelopeId: string | null; amount: number }[] {
  if (amount <= 0) return [];
  const needs = statuses.map((s) => ({ id: s.envelope.id, need: Math.max(0, s.budget - s.spent) })).filter((n) => n.need > 0);
  const totalNeed = needs.reduce((s, n) => s + n.need, 0);
  const step = currency === 'XOF' || currency === 'XAF' || currency === 'GNF' ? 1000 : 1;
  const out: { envelopeId: string | null; amount: number }[] = [];
  if (totalNeed === 0) return [{ envelopeId: null, amount }];
  const toDistribute = Math.min(amount, totalNeed);
  let used = 0;
  for (const n of needs) {
    const share = Math.min(n.need, roundTo((toDistribute * n.need) / totalNeed, step, currency));
    if (share > 0 && used + share <= amount) {
      out.push({ envelopeId: n.id, amount: share });
      used += share;
    }
  }
  if (amount - used > 0) out.push({ envelopeId: null, amount: amount - used });
  return out;
}

/** Rattache une catégorie de dépense à un compartiment de budget (pour créer les enveloppes). */
export function bucketForCategory(cat: Pick<Category, 'labelKey'>): BudgetBucket | null {
  switch (cat.labelKey) {
    case 'cat.housing':
      return 'housing';
    case 'cat.food':
      return 'food';
    case 'cat.transport':
      return 'transport';
    case 'cat.family':
      return 'family';
    case 'cat.savings':
      return 'savings';
    case 'cat.investment':
      return 'project';
    default:
      return null;
  }
}
