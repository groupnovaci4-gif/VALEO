/**
 * Moteur d'analyse financière — détecte tendances, dépassements et
 * opportunités à partir des données RÉELLES. Ne produit que des clés et des
 * paramètres : le texte est rendu par l'i18n (aucun chiffre inventé).
 */
import type { Category, Debt, DebtPayment, Envelope, Goal, GoalContribution, SpaceData, Transaction } from './types';
import type { CurrencyCode } from './money';
import { envelopeStatuses, spentByEnvelope, envelopeBudgetFor } from './budget';
import { hasEmergencyFund, goalPlanFor } from './goals';
import { isReserve } from './reserve';
import { observedCapacity } from './intelligence';
import { debtStatus } from './debts';
import { lastMonths, monthKey, previousMonth, type ISODate, type MonthKey } from './dates';

export type InsightSeverity = 'info' | 'positive' | 'warning' | 'danger';

export type InsightKind =
  | 'envelope_threshold'
  | 'envelope_over_streak'
  | 'category_increase'
  | 'category_decrease'
  | 'income_drop'
  | 'unusual_expense'
  | 'recurring_payment'
  | 'savings_capacity'
  | 'negative_month'
  | 'goal_eta'
  | 'goal_near'
  | 'goal_reached'
  | 'debt_due'
  | 'suggest_emergency_fund'
  | 'suggest_goal_capacity';

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  /** Paramètres d'interpolation (montants en unités mineures). */
  params: Record<string, string | number>;
  /** Cible de navigation éventuelle. */
  ref?: { type: 'envelope' | 'category' | 'goal' | 'debt' | 'transaction'; id: string };
  /** Plus grand = plus important. */
  weight: number;
}

/** Dépenses par catégorie pour un mois donné. */
export function expensesByCategory(transactions: Transaction[], month: MonthKey, currency: CurrencyCode): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of transactions) {
    if (t.deleted || t.type !== 'expense' || t.currency !== currency || monthKey(t.date) !== month) continue;
    const k = t.categoryId ?? 'uncategorized';
    out[k] = (out[k] ?? 0) + t.amount;
  }
  return out;
}

export function monthFlows(transactions: Transaction[], month: MonthKey, currency: CurrencyCode) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.deleted || t.type === 'transfer' || t.currency !== currency || monthKey(t.date) !== month) continue;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/**
 * Capacité d'épargne : moyenne du solde (revenus − dépenses) des 3 derniers
 * mois COMPLETS ayant au moins une opération. null si pas assez d'historique.
 */
export function savingsCapacity(transactions: Transaction[], now: ISODate, currency: CurrencyCode): number | null {
  const months = lastMonths(4, now).slice(0, 3);
  const nets = months
    .map((m) => ({ m, f: monthFlows(transactions, m, currency) }))
    .filter((x) => x.f.income > 0 || x.f.expense > 0)
    .map((x) => x.f.net);
  if (!nets.length) return null;
  return Math.round(nets.reduce((s, n) => s + n, 0) / nets.length);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Paiements récurrents probables : même bénéficiaire, montant proche, ≥ 3 mois distincts. */
export function detectRecurringPayments(transactions: Transaction[], now: ISODate, currency: CurrencyCode) {
  const months = new Set(lastMonths(4, now));
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.deleted || t.type !== 'expense' || t.recurringId || t.currency !== currency || !t.payee) continue;
    if (!months.has(monthKey(t.date))) continue;
    const k = t.payee.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: { payee: string; amount: number; months: number }[] = [];
  for (const list of groups.values()) {
    const distinct = new Set(list.map((t) => monthKey(t.date)));
    if (distinct.size < 3) continue;
    const med = median(list.map((t) => t.amount));
    const similar = list.every((t) => Math.abs(t.amount - med) <= med * 0.15);
    if (similar) out.push({ payee: list[0].payee!, amount: Math.round(med), months: distinct.size });
  }
  return out;
}

export interface InsightInput {
  data: SpaceData;
  currency: CurrencyCode;
  now: ISODate;
  categoryName: (c: Category | undefined, id: string) => string;
}

export function computeInsights({ data, currency, now, categoryName }: InsightInput): Insight[] {
  const out: Insight[] = [];
  const month = monthKey(now);
  const prev = previousMonth(month);
  const tx = data.transactions;

  // 1. Seuils d'enveloppes (85 % / 100 % / dépassement).
  for (const s of envelopeStatuses(data.envelopes, tx, data.budgets, month, currency)) {
    if (s.level === 'ok' || s.budget <= 0) continue;
    const severity: InsightSeverity = s.level === 'critical' ? 'danger' : 'warning';
    out.push({
      id: `env_${s.envelope.id}_${month}_${s.level}`,
      kind: 'envelope_threshold',
      severity,
      params: { name: s.envelope.name, percent: s.percent, level: s.level, over: Math.max(0, -s.remaining) },
      ref: { type: 'envelope', id: s.envelope.id },
      weight: s.level === 'critical' ? 90 : s.level === 'reached' ? 80 : 70,
    });
  }

  // 2. Dépassement d'enveloppe plusieurs mois consécutifs (mois complets).
  const pastMonths = lastMonths(4, now).slice(0, 3).reverse(); // du plus récent au plus ancien
  for (const e of data.envelopes.filter((x: Envelope) => !x.deleted && x.active)) {
    let streak = 0;
    for (const m of pastMonths) {
      const budget = envelopeBudgetFor(e, m, data.budgets);
      const spent = spentByEnvelope(tx, data.envelopes, m, currency)[e.id] ?? 0;
      if (budget > 0 && spent > budget) streak++;
      else break;
    }
    if (streak >= 2) {
      out.push({
        id: `streak_${e.id}_${month}`,
        kind: 'envelope_over_streak',
        severity: 'warning',
        params: { name: e.name, months: streak },
        ref: { type: 'envelope', id: e.id },
        weight: 65,
      });
    }
  }

  // 3. Évolution par catégorie vs le mois précédent (au prorata du mois en cours).
  const cur = expensesByCategory(tx, month, currency);
  const last = expensesByCategory(tx, prev, currency);
  for (const [catId, amount] of Object.entries(cur)) {
    const before = last[catId] ?? 0;
    if (before < 10_000 || amount < 10_000) continue;
    const pct = Math.round(((amount - before) / before) * 100);
    if (pct >= 15) {
      const cat = data.categories.find((c) => c.id === catId);
      out.push({
        id: `catinc_${catId}_${month}`,
        kind: 'category_increase',
        severity: pct >= 40 ? 'warning' : 'info',
        params: { name: categoryName(cat, catId), percent: pct, amount, before },
        ref: { type: 'category', id: catId },
        weight: 40 + Math.min(30, pct / 3),
      });
    }
  }

  // 4. Baisse des revenus (mois précédent vs moyenne des 3 mois d'avant).
  const prevIncome = monthFlows(tx, prev, currency).income;
  const older = lastMonths(5, now).slice(0, 3).map((m) => monthFlows(tx, m, currency).income).filter((v) => v > 0);
  if (older.length >= 2 && prevIncome > 0) {
    const avg = older.reduce((s, v) => s + v, 0) / older.length;
    const drop = Math.round(((avg - prevIncome) / avg) * 100);
    if (drop >= 15) {
      out.push({ id: `incdrop_${prev}`, kind: 'income_drop', severity: 'warning', params: { percent: drop, amount: prevIncome }, weight: 60 });
    }
  }

  // 5. Dépenses inhabituelles (> 3× la médiane de la catégorie sur 3 mois, ce mois-ci).
  const window = new Set(lastMonths(4, now));
  const byCat = new Map<string, number[]>();
  for (const t of tx) {
    if (t.deleted || t.type !== 'expense' || t.currency !== currency || !window.has(monthKey(t.date))) continue;
    const k = t.categoryId ?? 'uncategorized';
    byCat.set(k, [...(byCat.get(k) ?? []), t.amount]);
  }
  for (const t of tx) {
    if (t.deleted || t.type !== 'expense' || t.currency !== currency || monthKey(t.date) !== month) continue;
    const values = byCat.get(t.categoryId ?? 'uncategorized') ?? [];
    if (values.length < 4) continue;
    const med = median(values);
    if (med > 0 && t.amount >= med * 3 && t.amount >= 20_000) {
      const cat = data.categories.find((c) => c.id === t.categoryId);
      out.push({
        id: `unusual_${t.id}`,
        kind: 'unusual_expense',
        severity: 'info',
        params: { amount: t.amount, name: t.payee || categoryName(cat, t.categoryId ?? ''), ratio: Math.round(t.amount / med) },
        ref: { type: 'transaction', id: t.id },
        weight: 45,
      });
    }
  }

  // 6. Paiements récurrents détectés (abonnements).
  for (const r of detectRecurringPayments(tx, now, currency)) {
    out.push({
      id: `recur_${r.payee.toLowerCase()}`,
      kind: 'recurring_payment',
      severity: 'info',
      params: { name: r.payee, amount: r.amount, months: r.months },
      weight: 25,
    });
  }

  // 7. Capacité d'épargne & suggestions d'objectifs.
  // Définition unique de la capacité (charges fixes connues comprises).
  const capacity = observedCapacity(data, currency, now);
  // Les réserves (rechargeables, sans date) ont leurs propres messages : hors constats d'objectifs.
  const activeGoals = data.goals.filter((g) => !g.deleted && g.status === 'active' && !isReserve(g));
  if (capacity !== null) {
    if (capacity > 0) {
      out.push({ id: `capacity_${month}`, kind: 'savings_capacity', severity: 'positive', params: { amount: capacity }, weight: 35 });
      if (!hasEmergencyFund(data.goals)) {
        out.push({ id: `suggest_emergency_${month}`, kind: 'suggest_emergency_fund', severity: 'info', params: { amount: capacity }, weight: 30 });
      } else if (activeGoals.length === 0) {
        out.push({
          id: `suggest_capacity_${month}`,
          kind: 'suggest_goal_capacity',
          severity: 'info',
          params: { monthly: capacity, months: 12, total: capacity * 12 },
          weight: 28,
        });
      }
    } else {
      out.push({ id: `negative_${month}`, kind: 'negative_month', severity: 'danger', params: { amount: -capacity }, weight: 75 });
    }
  }

  // 8. Objectifs : date estimée, presque atteint, atteint.
  for (const g of activeGoals as Goal[]) {
    if (g.currency !== currency || g.targetAmount <= 0) continue;
    const plan = goalPlanFor(g, data.goalContributions as GoalContribution[], now);
    if (plan.reached) {
      out.push({ id: `goalreached_${g.id}`, kind: 'goal_reached', severity: 'positive', params: { name: g.name }, ref: { type: 'goal', id: g.id }, weight: 85 });
    } else if (plan.percent >= 90) {
      out.push({
        id: `goalnear_${g.id}`,
        kind: 'goal_near',
        severity: 'positive',
        params: { name: g.name, percent: plan.percent, remaining: plan.remaining },
        ref: { type: 'goal', id: g.id },
        weight: 55,
      });
    } else if (plan.estimatedDate) {
      out.push({
        id: `goaleta_${g.id}`,
        kind: 'goal_eta',
        severity: 'info',
        params: { name: g.name, date: plan.estimatedDate },
        ref: { type: 'goal', id: g.id },
        weight: 30,
      });
    }
  }

  // 9. Échéances de dettes dans les 7 jours (ou en retard).
  for (const d of data.debts as Debt[]) {
    if (d.deleted || d.direction !== 'i_owe') continue;
    const s = debtStatus(d, data.debtPayments as DebtPayment[], now);
    if (s.settled || s.daysToDue === null || s.daysToDue > 7) continue;
    out.push({
      id: `debtdue_${d.id}_${s.nextDue}`,
      kind: 'debt_due',
      severity: s.daysToDue < 0 ? 'danger' : 'warning',
      params: { name: d.counterparty, days: s.daysToDue, amount: Math.min(d.installment ?? s.remaining, s.remaining), date: s.nextDue ?? '' },
      ref: { type: 'debt', id: d.id },
      weight: s.daysToDue < 0 ? 88 : 68,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
