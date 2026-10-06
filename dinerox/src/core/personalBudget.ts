/**
 * Budget personnalisé : pas de règle universelle (50/30/20 pour tous).
 * Pour chaque enveloppe, la base est, dans l'ordre :
 *  1. la dépense réelle moyenne des 3 derniers mois (données de l'utilisateur) ;
 *  2. sinon la charge déclarée dans le profil financier ;
 *  3. sinon le budget actuel.
 * L'épargne vise l'effort nécessaire aux objectifs, dans la limite du
 * possible. Si le total dépasse les revenus, seules les enveloppes VARIABLES
 * sont réduites (les charges fixes ne se négocient pas en un clic).
 */
import type { Envelope, FinancialProfile, Transaction } from './types';
import type { CurrencyCode } from './money';
import { lastMonths, monthKey, type ISODate } from './dates';
import { resolveEnvelopeId } from './budget';
import { findSubcategory } from './catalog';

export type BudgetBasis = 'observed' | 'declared' | 'current' | 'goals';

export interface PersonalBudgetLine {
  envelopeId: string;
  current: number;
  suggested: number;
  basis: BudgetBasis;
  fixed: boolean;
}

export interface PersonalBudget {
  lines: PersonalBudgetLine[];
  income: number;
  total: number;
  /** Revenus − total proposé (≥ 0 si le budget tient). */
  margin: number;
  /** Le budget a dû être réduit pour tenir dans les revenus. */
  adjusted: boolean;
}

const FIXED_ENVELOPE_CATEGORIES = new Set(['cat_housing', 'cat_internet', 'cat_insurance', 'cat_taxes', 'cat_debts', 'cat_education']);
const roundUp = (n: number) => Math.ceil(n / 1000) * 1000;

export function personalBudget(input: {
  envelopes: Envelope[];
  transactions: Transaction[];
  currency: CurrencyCode;
  now: ISODate;
  income: number;
  goalNeeds: number;
  financial?: FinancialProfile;
}): PersonalBudget {
  const { envelopes, transactions, currency, now, income, goalNeeds, financial } = input;
  const months = lastMonths(4, now).slice(0, 3);
  const active = envelopes.filter((e) => e.active && !e.deleted);
  // Dépense moyenne par enveloppe (mois complets avec des dépenses).
  const spent: Record<string, Record<string, number>> = {};
  for (const t of transactions) {
    if (t.deleted || t.type !== 'expense' || t.currency !== currency) continue;
    const m = monthKey(t.date);
    if (!months.includes(m)) continue;
    const id = resolveEnvelopeId(t, active);
    if (!id) continue;
    spent[id] = spent[id] ?? {};
    spent[id][m] = (spent[id][m] ?? 0) + t.amount;
  }
  const monthsWithData = new Set(Object.values(spent).flatMap((x) => Object.keys(x))).size;
  // Charges déclarées rattachées à l'enveloppe de leur catégorie principale.
  const declared: Record<string, number> = {};
  for (const [subId, amount] of Object.entries(financial?.fixedCharges ?? {})) {
    const parent = findSubcategory(subId)?.parent;
    const env = parent ? active.find((e) => e.categoryIds.includes(parent)) : undefined;
    if (env && amount > 0) declared[env.id] = (declared[env.id] ?? 0) + amount;
  }

  // Une seule enveloppe d'épargne porte l'effort des objectifs (jamais en double).
  const savingsEnvelopeId = active.find((e) => e.categoryIds.includes('cat_savings'))?.id ?? null;
  const lines: PersonalBudgetLine[] = active.map((e) => {
    const fixed = e.categoryIds.some((c) => FIXED_ENVELOPE_CATEGORIES.has(c));
    if (e.id === savingsEnvelopeId && goalNeeds > 0) return { envelopeId: e.id, current: e.monthlyBudget, suggested: roundUp(goalNeeds), basis: 'goals', fixed: false };
    const obs = spent[e.id] && monthsWithData ? Math.round(Object.values(spent[e.id]).reduce((a, b) => a + b, 0) / monthsWithData) : 0;
    if (obs > 0) return { envelopeId: e.id, current: e.monthlyBudget, suggested: roundUp(Math.max(obs, declared[e.id] ?? 0)), basis: 'observed', fixed };
    if (declared[e.id]) return { envelopeId: e.id, current: e.monthlyBudget, suggested: roundUp(declared[e.id]), basis: 'declared', fixed };
    return { envelopeId: e.id, current: e.monthlyBudget, suggested: e.monthlyBudget, basis: 'current', fixed };
  });

  let total = lines.reduce((n, l) => n + l.suggested, 0);
  let adjusted = false;
  // L'épargne ne peut pas dépasser ce qui reste réellement : elle est réduite AVANT
  // les dépenses courantes (on n'ampute pas l'alimentation pour épargner).
  const savingsLine = lines.find((l) => l.basis === 'goals');
  if (income > 0 && savingsLine && total > income) {
    const others = total - savingsLine.suggested;
    const capped = Math.max(0, Math.floor((income - others) / 1000) * 1000);
    if (capped < savingsLine.suggested) {
      savingsLine.suggested = capped;
      adjusted = true;
      total = lines.reduce((n, l) => n + l.suggested, 0);
    }
  }
  if (income > 0 && total > income) {
    adjusted = true;
    const fixedTotal = lines.filter((l) => l.fixed).reduce((n, l) => n + l.suggested, 0);
    const flexible = lines.filter((l) => !l.fixed && l !== savingsLine);
    const flexTotal = flexible.reduce((n, l) => n + l.suggested, 0);
    const room = Math.max(0, income - fixedTotal);
    const ratio = flexTotal > 0 ? Math.min(1, room / flexTotal) : 0;
    for (const l of flexible) l.suggested = Math.floor((l.suggested * ratio) / 1000) * 1000;
    total = lines.reduce((n, l) => n + l.suggested, 0);
  }
  return { lines, income, total, margin: income - total, adjusted };
}
