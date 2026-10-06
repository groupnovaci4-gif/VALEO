/**
 * Alertes de budget du coach — module PUR (testé, aucun accès React/stockage).
 *
 * Décide, à partir de l'état des enveloppes et d'une mémoire des alertes déjà
 * données, quelles alertes émettre :
 *  - une seule alerte par enveloppe, par mois et par niveau ;
 *  - saut de niveaux (50 % → 120 % en une dépense) : seulement le plus haut ;
 *  - `critical` rappelé au plus une fois par jour, et seulement si une
 *    nouvelle dépense aggrave le dépassement ;
 *  - redescente sous un seuil (suppression, modification, budget relevé) :
 *    aucune alerte, le seuil est réarmé ;
 *  - nouveau mois : mémoire distincte (clé par mois) ;
 *  - aucune alerte sur une enveloppe dont l'utilisateur n'a jamais fixé de
 *    budget (enveloppe de départ à 0) : « dépassé » serait faux.
 */
import type { BudgetPlan, Envelope, Transaction } from '../types';
import { LEVEL_RANK, envelopeStatuses, resolveEnvelopeId, type EnvelopeLevel, type EnvelopeStatus } from '../budget';
import { monthKey, type ISODate, type MonthKey } from '../dates';
import type { CurrencyCode } from '../money';

export type AlertLevel = Exclude<EnvelopeLevel, 'ok'>;

export interface EnvelopeAlertState {
  /** Plus haut niveau déjà signalé (redescend quand la situation s'améliore). */
  level: EnvelopeLevel;
  /** Dépensé lors de la dernière évaluation (détecte une aggravation). */
  lastSpent: number;
  /** Jour du dernier signalement `critical`. */
  criticalDay: ISODate | null;
}

/** Clé `${mois}:${enveloppe}`. */
export type EnvelopeAlertMemory = Record<string, EnvelopeAlertState>;

export interface EnvelopeAlert {
  /** Identique à l'identifiant du constat `envelope_threshold` (déduplication commune). */
  id: string;
  envelopeId: string;
  envelopeName: string;
  month: MonthKey;
  level: AlertLevel;
  from: EnvelopeLevel;
  /** Pourcentage consommé, arrondi vers le bas (jamais « 100 % » avant 100 %). */
  percent: number;
  budget: number;
  spent: number;
  /** Reste disponible (≥ 0). */
  left: number;
  /** Dépassement (≥ 0). */
  over: number;
  /** Rappel quotidien d'un dépassement qui s'aggrave. */
  reminder: boolean;
}

const memKey = (month: MonthKey, envelopeId: string) => `${month}:${envelopeId}`;
const EMPTY: EnvelopeAlertState = { level: 'ok', lastSpent: 0, criticalDay: null };

/** Budget réellement fixé par l'utilisateur pour ce mois (montant positif, ou 0 choisi dans le plan du mois). */
export function hasDefinedBudget(envelope: Envelope, month: MonthKey, plans: BudgetPlan[]): boolean {
  const plan = plans.find((p) => !p.deleted && p.month === month);
  if (typeof plan?.allocations?.[envelope.id] === 'number') return true;
  return envelope.monthlyBudget > 0;
}

export function evaluateEnvelopeAlerts(input: {
  statuses: EnvelopeStatus[];
  month: MonthKey;
  plans: BudgetPlan[];
  memory: EnvelopeAlertMemory;
  today: ISODate;
  /** Limiter l'évaluation à ces enveloppes (celles touchées par une opération). */
  only?: ReadonlySet<string>;
}): { alerts: EnvelopeAlert[]; memory: EnvelopeAlertMemory } {
  const { statuses, month, plans, today, only } = input;
  const memory: EnvelopeAlertMemory = { ...input.memory };
  const alerts: EnvelopeAlert[] = [];
  for (const s of statuses) {
    const id = s.envelope.id;
    if (only && !only.has(id)) continue;
    const key = memKey(month, id);
    const prev = memory[key] ?? EMPTY;
    const level: EnvelopeLevel = hasDefinedBudget(s.envelope, month, plans) ? s.level : 'ok';
    const make = (reminder: boolean): EnvelopeAlert => ({
      id: `env_${id}_${month}_${level}${reminder ? `_${today}` : ''}`,
      envelopeId: id,
      envelopeName: s.envelope.name,
      month,
      level: level as AlertLevel,
      from: prev.level,
      percent: s.budget > 0 ? Math.floor((s.spent * 100) / s.budget) : 100,
      budget: s.budget,
      spent: s.spent,
      left: Math.max(0, s.budget - s.spent),
      over: Math.max(0, s.spent - s.budget),
      reminder,
    });
    if (LEVEL_RANK[level] < LEVEL_RANK[prev.level]) {
      // Amélioration : pas d'alerte, seuils supérieurs réarmés.
      memory[key] = { level, lastSpent: s.spent, criticalDay: null };
    } else if (LEVEL_RANK[level] > LEVEL_RANK[prev.level]) {
      alerts.push(make(false));
      memory[key] = { level, lastSpent: s.spent, criticalDay: level === 'critical' ? today : null };
    } else if (level === 'critical' && s.spent > prev.lastSpent && prev.criticalDay !== today) {
      alerts.push(make(true));
      memory[key] = { level, lastSpent: s.spent, criticalDay: today };
    } else {
      memory[key] = { ...prev, level, lastSpent: s.spent };
    }
  }
  return { alerts, memory: pruneMemory(memory, month) };
}

/** Garde la mémoire des 3 derniers mois seulement (le mois en cours et les deux précédents). */
export function pruneMemory(memory: EnvelopeAlertMemory, month: MonthKey): EnvelopeAlertMemory {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 - 2, 1);
  const oldest = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const out: EnvelopeAlertMemory = {};
  for (const [k, v] of Object.entries(memory)) if (k.slice(0, 7) >= oldest) out[k] = v;
  return out;
}

/** Enveloppes et mois touchés par une écriture (ancienne et nouvelle version d'une opération). */
export function touchedByWrite(versions: (Pick<Transaction, 'type' | 'date' | 'envelopeId' | 'categoryId'> | null | undefined)[], envelopes: Envelope[]): Map<MonthKey, Set<string>> {
  const out = new Map<MonthKey, Set<string>>();
  for (const t of versions) {
    if (!t || t.type !== 'expense') continue;
    const id = resolveEnvelopeId(t, envelopes);
    if (!id) continue;
    const m = monthKey(t.date);
    out.set(m, (out.get(m) ?? new Set()).add(id));
  }
  return out;
}

/**
 * Réaction immédiate à une écriture : évalue uniquement les enveloppes et mois
 * touchés, sur les données APRÈS l'écriture, dans la devise de l'espace.
 */
export function alertsAfterWrite(input: {
  data: { envelopes: Envelope[]; transactions: Transaction[]; budgets: BudgetPlan[] };
  touched: Map<MonthKey, Set<string>>;
  currency: CurrencyCode;
  memory: EnvelopeAlertMemory;
  today: ISODate;
}): { alerts: EnvelopeAlert[]; memory: EnvelopeAlertMemory } {
  let memory = input.memory;
  const alerts: EnvelopeAlert[] = [];
  for (const [month, ids] of input.touched) {
    const statuses = envelopeStatuses(input.data.envelopes, input.data.transactions, input.data.budgets, month, input.currency);
    const r = evaluateEnvelopeAlerts({ statuses, month, plans: input.data.budgets, memory, today: input.today, only: ids });
    memory = r.memory;
    alerts.push(...r.alerts);
  }
  return { alerts, memory };
}

/** Message d'une alerte : clé i18n + paramètres (montants en unités mineures, formatés par l'appelant). */
export function envelopeAlertMessage(alert: Pick<EnvelopeAlert, 'level' | 'envelopeName' | 'percent' | 'left' | 'over'>, firstName?: string | null): { key: string; params: Record<string, string | number> } {
  const name = firstName?.trim();
  return {
    key: `coach.env.${alert.level}${name ? '' : '.anon'}`,
    params: { name: name ?? '', envelope: alert.envelopeName, percent: alert.percent, left: alert.left, over: alert.over },
  };
}
