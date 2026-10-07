/**
 * Moteur d'événements du coach — module PUR.
 *
 * Transforme ce que l'application sait déjà (alertes de budget, constats de
 * `computeInsights`, recommandations de `intelligence`) et quelques bons
 * comportements détectés ici en `CoachEvent` homogènes : identifiant
 * déterministe (déduplication), gravité, priorité, clé de texte i18n.
 * Aucun montant n'est calculé par une IA : tout vient des modules existants.
 */
import type { CurrencyCode } from '../money';
import type { NotificationPrefs, SpaceData } from '../types';
import type { Insight } from '../insights';
import type { Recommendation } from '../intelligence';
import { envelopeStatuses } from '../budget';
import { debtStatus } from '../debts';
import { monthKey, previousMonth, lastMonths, type ISODate, type MonthKey } from '../dates';
import { envelopeAlertMessage, hasDefinedBudget, type EnvelopeAlert } from './envelopeAlerts';

export type CoachSeverity = 'info' | 'advice' | 'warning' | 'critical' | 'celebration';

/** Ordre de priorité demandé : critical > warning > celebration > advice > info. */
export const SEVERITY_PRIORITY: Record<CoachSeverity, number> = { critical: 50, warning: 40, celebration: 30, advice: 20, info: 10 };

export interface CoachEvent {
  /** Déterministe : le même fait produit toujours le même identifiant. */
  id: string;
  kind: string;
  severity: CoachSeverity;
  priority: number;
  spaceId: string;
  /** Mois (AAAA-MM) ou jour (AAAA-MM-JJ) concerné. */
  period: string;
  textKey: string;
  /** Montants en unités mineures (formatés à l'affichage, jamais lus à voix haute sans accord). */
  params: Record<string, string | number>;
  /** Drapeau de préférence existant qui gouverne ce type d'alerte (null : coach seulement). */
  pref: keyof NotificationPrefs | null;
  ref?: Insight['ref'];
  createdAt: number;
}

const ev = (e: Omit<CoachEvent, 'priority'> & { boost?: number }): CoachEvent => {
  const { boost = 0, ...rest } = e;
  return { ...rest, priority: SEVERITY_PRIORITY[e.severity] + boost };
};

// ─── Sources ───────────────────────────────────────────────────────────

export function fromEnvelopeAlert(a: EnvelopeAlert, spaceId: string, firstName: string | null | undefined, now: number): CoachEvent {
  const msg = envelopeAlertMessage(a, firstName);
  return ev({
    id: a.id,
    kind: `envelope_${a.level}`,
    severity: a.level === 'critical' ? 'critical' : 'warning',
    boost: a.level === 'reached' ? 2 : 0,
    spaceId,
    period: a.month,
    textKey: msg.key,
    params: msg.params,
    pref: 'budgetAlerts',
    ref: { type: 'envelope', id: a.envelopeId },
    createdAt: now,
  });
}

const INSIGHT_MAP: Partial<Record<Insight['kind'], { severity: CoachSeverity; pref: keyof NotificationPrefs | null }>> = {
  envelope_over_streak: { severity: 'warning', pref: 'budgetAlerts' },
  negative_month: { severity: 'warning', pref: 'budgetAlerts' },
  unusual_expense: { severity: 'warning', pref: 'unusualSpending' },
  debt_due: { severity: 'warning', pref: 'debtDue' },
  income_drop: { severity: 'warning', pref: null },
  category_increase: { severity: 'info', pref: 'budgetAlerts' },
  category_decrease: { severity: 'celebration', pref: 'budgetAlerts' },
  goal_reached: { severity: 'celebration', pref: 'goalProgress' },
  goal_near: { severity: 'info', pref: 'goalProgress' },
  goal_eta: { severity: 'info', pref: 'goalProgress' },
  savings_capacity: { severity: 'advice', pref: null },
  suggest_emergency_fund: { severity: 'advice', pref: null },
  suggest_goal_capacity: { severity: 'advice', pref: null },
};

/**
 * Constats existants → événements. `envelope_threshold` est exclu : les seuils
 * de budget passent par `envelopeAlerts` (mémoire, rappels, réarmement).
 */
export function fromInsights(insights: Insight[], spaceId: string, period: string, now: number): CoachEvent[] {
  const out: CoachEvent[] = [];
  for (const i of insights) {
    const m = INSIGHT_MAP[i.kind];
    if (!m) continue;
    out.push(ev({ id: i.id, kind: i.kind, severity: m.severity, boost: Math.min(9, Math.floor(i.weight / 10)), spaceId, period, textKey: `ins.${i.kind}`, params: i.params, pref: m.pref, ref: i.ref, createdAt: now }));
  }
  return out;
}

const SKIP_RECS = new Set(['no_data', 'fixed_ratio_ok']);

/** Recommandations déterministes (`intel.rec.*`) → conseils (une fois par mois au plus). */
export function fromRecommendations(recs: Recommendation[], spaceId: string, month: MonthKey, now: number): CoachEvent[] {
  return recs
    .filter((r) => !SKIP_RECS.has(r.kind))
    .map((r) =>
      ev({
        id: `rec_${r.kind}_${month}`,
        kind: `rec_${r.kind}`,
        severity: r.severity === 'positive' ? 'celebration' : 'advice',
        boost: Math.min(9, Math.floor(r.weight / 10)),
        spaceId,
        period: month,
        textKey: `intel.rec.${r.kind}`,
        params: r.params,
        pref: null,
        createdAt: now,
      }),
    );
}

/** Opérations enregistrées dans un mois (seuil anti-triche des félicitations). */
export function operationsInMonth(data: Pick<SpaceData, 'transactions'>, month: MonthKey, currency: CurrencyCode): number {
  return data.transactions.filter((t) => !t.deleted && t.currency === currency && monthKey(t.date) === month).length;
}

export const MIN_OPERATIONS = 10;

/** Le mois a-t-il été « tenu » ? (≥ 10 opérations, au moins un budget fixé, aucun dépassé). */
export function monthRespected(data: SpaceData, month: MonthKey, currency: CurrencyCode): boolean {
  if (operationsInMonth(data, month, currency) < MIN_OPERATIONS) return false;
  const budgeted = envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, currency).filter((s) => s.budget > 0 && hasDefinedBudget(s.envelope, month, data.budgets));
  return budgeted.length > 0 && budgeted.every((s) => s.spent <= s.budget);
}

/** Épargne enregistrée dans un mois (virement vers l'épargne, contribution, dépense « épargne »). */
export function savedInMonth(data: SpaceData, month: MonthKey, currency: CurrencyCode): boolean {
  const savings = new Set(data.accounts.filter((a) => a.isSavings && !a.deleted).map((a) => a.id));
  return (
    data.transactions.some((t) => !t.deleted && t.currency === currency && monthKey(t.date) === month && ((t.type === 'transfer' && !!t.toAccountId && savings.has(t.toAccountId)) || (t.type === 'expense' && t.categoryId === 'cat_savings'))) ||
    data.goalContributions.some((c) => !c.deleted && c.amount > 0 && monthKey(c.date) === month)
  );
}

/** Catégories dont la baisse n'est pas un « bon comportement » (épargne, investissement, dettes). */
const NOT_A_SAVING = new Set(['cat_savings', 'cat_investment', 'cat_debts']);
export const CATEGORY_DOWN_MIN_PERCENT = 20;

/**
 * Catégorie en baisse : le mois dernier (clos, ≥ 10 opérations), la dépense
 * d'une catégorie a baissé d'au moins 20 % par rapport à la moyenne des trois
 * mois précédents (catégorie présente au moins deux de ces mois). La plus
 * forte baisse en valeur, une seule par mois.
 */
export function categoryDown(data: SpaceData, currency: CurrencyCode, today: ISODate): { categoryId: string; percent: number; month: MonthKey } | null {
  const prev = previousMonth(monthKey(today));
  if (operationsInMonth(data, prev, currency) < MIN_OPERATIONS) return null;
  const base = [previousMonth(prev), previousMonth(previousMonth(prev)), previousMonth(previousMonth(previousMonth(prev)))];
  const spend = (m: MonthKey) => {
    const out = new Map<string, number>();
    for (const t of data.transactions) {
      if (t.deleted || t.type !== 'expense' || t.currency !== currency || !t.categoryId || NOT_A_SAVING.has(t.categoryId) || monthKey(t.date) !== m) continue;
      out.set(t.categoryId, (out.get(t.categoryId) ?? 0) + t.amount);
    }
    return out;
  };
  const last = spend(prev);
  const before = base.map(spend);
  let best: { categoryId: string; percent: number; drop: number } | null = null;
  for (const id of new Set(before.flatMap((m) => [...m.keys()]))) {
    const present = before.filter((m) => (m.get(id) ?? 0) > 0);
    if (present.length < 2) continue;
    const avg = before.reduce((n, m) => n + (m.get(id) ?? 0), 0) / 3;
    const cur = last.get(id) ?? 0;
    const percent = Math.round(((avg - cur) / avg) * 100);
    if (percent >= CATEGORY_DOWN_MIN_PERCENT && cur > 0 && (!best || avg - cur > best.drop)) best = { categoryId: id, percent, drop: avg - cur };
  }
  return best ? { categoryId: best.categoryId, percent: best.percent, month: prev } : null;
}

/** Bons comportements (félicitations), à partir des seules données enregistrées. */
export function detectPositiveEvents(data: SpaceData, currency: CurrencyCode, today: ISODate, spaceId: string, now: number, categoryName: (id: string) => string = (id) => id): CoachEvent[] {
  const out: CoachEvent[] = [];
  const month = monthKey(today);
  const prev = previousMonth(month);
  const down = categoryDown(data, currency, today);
  if (down) {
    out.push(ev({ id: `pos_category_down_${down.month}`, kind: 'category_down', severity: 'celebration', boost: 3, spaceId, period: down.month, textKey: 'coach.pos.category_down', params: { category: categoryName(down.categoryId), percent: down.percent }, pref: 'unusualSpending', createdAt: now }));
  }
  if (monthRespected(data, prev, currency)) {
    out.push(ev({ id: `pos_month_respected_${prev}`, kind: 'month_respected', severity: 'celebration', boost: 5, spaceId, period: prev, textKey: 'coach.pos.month_respected', params: { month: prev }, pref: 'budgetAlerts', createdAt: now }));
  }
  const past3 = lastMonths(4, today).slice(0, 3);
  if (past3.every((m) => savedInMonth(data, m, currency))) {
    out.push(ev({ id: `pos_savings_regular_${month}`, kind: 'savings_regular', severity: 'celebration', boost: 4, spaceId, period: month, textKey: 'coach.pos.savings_regular', params: { months: 3 }, pref: 'goalProgress', createdAt: now }));
  }
  for (const d of data.debts) {
    if (d.deleted || d.direction !== 'i_owe' || d.currency !== currency) continue;
    const pays = data.debtPayments.filter((p) => !p.deleted && p.debtId === d.id);
    if (!pays.length) continue;
    const s = debtStatus(d, data.debtPayments, today);
    const last = pays.reduce((a, p) => (p.date > a ? p.date : a), '');
    if (s.remaining === 0 && monthKey(last) === month) {
      out.push(ev({ id: `pos_debt_settled_${d.id}`, kind: 'debt_settled', severity: 'celebration', boost: 6, spaceId, period: month, textKey: 'coach.pos.debt_settled', params: { name: d.counterparty }, pref: 'debtDue', ref: { type: 'debt', id: d.id }, createdAt: now }));
    } else if (d.installment && d.dueDay && s.remaining > 0) {
      // Échéance du mois réglée avant la date prévue.
      const due = `${month}-${String(Math.min(d.dueDay, 28)).padStart(2, '0')}`;
      const paid = pays.filter((p) => monthKey(p.date) === month && p.date <= due).reduce((n, p) => n + p.amount, 0);
      if (paid >= d.installment) out.push(ev({ id: `pos_installment_${d.id}_${month}`, kind: 'installment_on_time', severity: 'celebration', boost: 2, spaceId, period: month, textKey: 'coach.pos.installment_on_time', params: { name: d.counterparty }, pref: 'debtDue', ref: { type: 'debt', id: d.id }, createdAt: now }));
    }
  }
  const emergency = data.goals.filter((g) => !g.deleted && g.templateId === 'emergency_fund').map((g) => g.id);
  if (emergency.length && data.goalContributions.some((c) => !c.deleted && c.amount > 0 && emergency.includes(c.goalId) && monthKey(c.date) === month)) {
    out.push(ev({ id: `pos_emergency_${month}`, kind: 'emergency_fund_up', severity: 'celebration', boost: 3, spaceId, period: month, textKey: 'coach.pos.emergency_fund_up', params: {}, pref: 'goalProgress', createdAt: now }));
  }
  return out;
}
