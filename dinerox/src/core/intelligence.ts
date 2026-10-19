/**
 * Moteur d'intelligence financière DINEROX.
 *
 * Il combine : pays + profil déclaré + revenus + dépenses + charges fixes +
 * dettes + épargne + objectifs + historique, pour produire une photographie
 * de la situation et des recommandations.
 *
 * Provenance des chiffres (jamais mélangée, toujours affichée) :
 *  - 'user'     : calculé à partir des opérations saisies par l'utilisateur ;
 *  - 'declared' : déclaré par l'utilisateur dans son profil financier ;
 *  - 'estimate' : estimation DINEROX (dérivée des deux précédents) ;
 *  - 'external' : statistique officielle — interdite sans source identifiable.
 * DINEROX n'invente aucune statistique : aucune comparaison à une « moyenne
 * nationale » n'est faite tant qu'aucune source externe n'est intégrée.
 *
 * Argent disponible v2 (§11.1, §11.6) : les revenus sont les revenus REÇUS (nature
 * `revenu`), jamais le déclaré ; la capacité d'épargne est remplacée par la MARGE
 * (R − C − Rb − S) observée sur des mois CLOS — sans mois clos, aucun montant ;
 * l'alerte « solde bas » ne compte jamais un revenu attendu.
 */
import type { Category, Debt, DebtPayment, FinancialProfile, Goal, GoalContribution, RecurringRule, Role, SpaceData, Transaction } from './types';
import type { CurrencyCode } from './money';
import { addDays, lastMonths, monthKey, type ISODate, type MonthKey } from './dates';
import { debtStatus } from './debts';
import { goalPlanFor, hasEmergencyFund } from './goals';
import { occurrencesBetween } from './recurring';
import { findSubcategory } from './catalog';
import { ensureLedgerView, isRevenue, isSpending, spendingAmount, txNature } from './nature';
import { nextAdvice, precaution, tenPercent, type AdviceKey } from './coachMetrics';
import type { CoachState } from './coachData';
import { periodReport } from './ledger';
import { endOfMonth } from './dates';

export type DataSource = 'user' | 'declared' | 'estimate' | 'external';

/** Chiffre avec sa provenance. Une donnée 'external' DOIT citer sa source. */
export interface Figure {
  value: number;
  source: DataSource;
  reference?: string;
}

/** Catégories dont les dépenses sont, par nature, des charges fixes. */
const FIXED_CATEGORIES = new Set(['cat_housing', 'cat_internet', 'cat_insurance', 'cat_taxes', 'cat_debts']);

/** Équivalent mensuel d'une échéance récurrente. */
export function monthlyEquivalent(rule: Pick<RecurringRule, 'amount' | 'frequency'>): number {
  if (rule.frequency === 'weekly') return Math.round((rule.amount * 52) / 12);
  if (rule.frequency === 'yearly') return Math.round(rule.amount / 12);
  return rule.amount;
}

/** Revenus récurrents actifs, en équivalent mensuel, dans une devise (aucune addition de devises). */
export function recurringMonthlyIncome(rules: RecurringRule[], currency: CurrencyCode): number {
  return rules.filter((r) => r.active && !r.deleted && r.type === 'income' && r.currency === currency).reduce((n, r) => n + monthlyEquivalent(r), 0);
}

/** Une dépense est-elle une charge fixe ? (sous-catégorie marquée fixe, catégorie fixe, ou échéance récurrente). */
export function isFixedExpense(tx: Pick<Transaction, 'categoryId' | 'subcategoryId' | 'recurringId'>, categories: Category[]): boolean {
  if (tx.recurringId) return true;
  if (tx.subcategoryId) {
    const doc = categories.find((c) => c.id === tx.subcategoryId);
    if (doc?.fixed ?? findSubcategory(tx.subcategoryId)?.fixed) return true;
  }
  return !!tx.categoryId && FIXED_CATEGORIES.has(tx.categoryId);
}

interface MonthStats {
  month: MonthKey;
  income: number;
  expense: number;
  fixed: number;
  /** Capital remboursé (remboursements de dettes, ni dépense ni enveloppe). */
  repaid: number;
  byCategory: Record<string, number>;
}

function monthStats(transactions: Transaction[], month: MonthKey, currency: CurrencyCode, categories: Category[]): MonthStats {
  const s: MonthStats = { month, income: 0, expense: 0, fixed: 0, repaid: 0, byCategory: {} };
  for (const t of transactions) {
    if (t.deleted || t.currency !== currency || monthKey(t.date) !== month || (t.type !== 'income' && t.type !== 'expense')) continue;
    // Par NATURE : un emprunt, une cagnotte, un remboursement ne sont pas des revenus.
    if (isRevenue(t)) s.income += t.amount;
    else if (isSpending(t)) {
      s.expense += spendingAmount(t);
      if (isFixedExpense(t, categories)) s.fixed += t.amount;
      const k = t.categoryId ?? 'none';
      s.byCategory[k] = (s.byCategory[k] ?? 0) + t.amount;
    } else if (txNature(t) === 'remboursement_capital') s.repaid += t.amount;
  }
  return s;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export interface FinancialSnapshot {
  currency: CurrencyCode;
  /** Mois complets avec au moins une opération (base des moyennes). */
  monthsOfData: number;
  /** Période des lignes observées (revenus, dépenses, charges fixes, variables, remboursements) :
   *  moyenne des mois clos, sinon le mois en cours — jamais un mélange des deux. */
  period: 'closed' | 'current';
  income: Figure;
  expenses: Figure;
  fixedCharges: Figure;
  /** Part des charges fixes dans les revenus (%), null sans revenu connu. */
  fixedRatio: number | null;
  variableSpending: Figure;
  /** Mensualités de dettes à rembourser. */
  debtService: Figure;
  debtRatio: number | null;
  /** Capital remboursé sur la même période que les revenus (tableau de l'analyse). */
  debtRepaid: Figure;
  debtRepaidRatio: number | null;
  /** Capacité d'épargne estimée (peut être négative). */
  savingsCapacity: Figure;
  /** Effort mensuel nécessaire pour tenir les dates des objectifs actifs. */
  goalNeeds: number;
  /** Disponible aujourd'hui (comptes courants). */
  available: number;
  /** Sorties fixes prévues dans les 30 prochains jours (récurrences + dettes). */
  upcomingOutflows: number;
  upcomingInflows: number;
  /** Dépenses par catégorie : mois en cours vs moyenne des mois précédents. */
  categoryTrends: { categoryId: string; current: number; average: number; change: number }[];
  /** Part des dépenses consacrée à la famille et aux obligations sociales (%). */
  familyShare: number | null;
}

export interface SnapshotInput {
  data: Pick<SpaceData, 'transactions' | 'recurring' | 'debts' | 'debtPayments' | 'goals' | 'goalContributions' | 'categories'> & Partial<Pick<SpaceData, 'accounts' | 'tontines' | 'tontineEntries'>>;
  currency: CurrencyCode;
  now: ISODate;
  available: number;
  financial?: FinancialProfile;
}

export function financialSnapshot({ data: input, currency, now, available, financial }: SnapshotInput): FinancialSnapshot {
  // Natures calculées avec tout le contexte (liens anciens des dettes et du carnet compris).
  const data = ensureLedgerView({ ...input, accounts: input.accounts ?? [] });
  const months = lastMonths(4, now);
  // Moyennes UNIQUEMENT sur des mois complets : un mois en cours (salaire reçu le 1er,
  // loyer pas encore payé) donnerait une capacité d'épargne largement surestimée.
  const past = months.slice(0, 3).map((m) => monthStats(data.transactions, m, currency, data.categories)).filter((m) => m.income > 0 || m.expense > 0);
  const current = monthStats(data.transactions, months[3], currency, data.categories);
  const hasHistory = past.length > 0;

  const debtService = data.debts
    .filter((d: Debt) => !d.deleted && d.direction === 'i_owe' && d.currency === currency)
    .reduce((n, d) => {
      const s = debtStatus(d, data.debtPayments as DebtPayment[], now);
      return s.settled ? n : n + Math.min(d.installment ?? 0, s.remaining);
    }, 0);

  // Marge observée d'un mois clos : R − C − Rb − S (grand livre, mêmes natures que les rapports).
  const ledgerData = { tontines: [], tontineEntries: [], ...data } as unknown as SpaceData;
  const margins = past.map((m) => {
    const r = periodReport(ledgerData, { start: `${m.month}-01`, end: endOfMonth(`${m.month}-01`) }, currency);
    return r.revenus - r.depenses - r.remboursements - r.epargneNette;
  });
  void financial;
  let income: Figure;
  let expenses: Figure;
  let fixedCharges: Figure;
  let capacity: Figure;
  // Toutes les lignes observées sur la MÊME période : les mois clos, sinon le mois en cours.
  // Une récurrence à venir n'y est jamais mêlée (elle est dans « Sorties prévues »).
  const base = hasHistory ? past : [current];
  income = { value: avg(base.map((m) => m.income)), source: 'user' };
  fixedCharges = { value: avg(base.map((m) => m.fixed)), source: 'user' };
  expenses = { value: avg(base.map((m) => m.expense)), source: 'user' };
  const debtRepaid: Figure = { value: avg(base.map((m) => m.repaid)), source: 'user' };
  // Pas encore de mois clos : « Pas encore assez de données » — rien n'est tiré du déclaré.
  capacity = { value: hasHistory ? avg(margins) : 0, source: 'user' };

  const goalNeeds = data.goals
    .filter((g: Goal) => g.status === 'active' && !g.deleted && g.currency === currency)
    .reduce((n, g) => n + (goalPlanFor(g, data.goalContributions as GoalContribution[], now).requiredMonthly ?? 0), 0);

  const horizon = addDays(now, 30);
  let upcomingOutflows = 0;
  let upcomingInflows = 0;
  for (const r of data.recurring) {
    if (r.deleted || !r.active || r.currency !== currency) continue;
    // Toutes les occurrences des 30 prochains jours (une règle hebdomadaire en a 4 ou 5),
    // sauf celles déjà enregistrées en opération (déjà déduites du solde).
    for (const d of occurrencesBetween(r, now, horizon)) {
      if (r.lastGenerated && d <= r.lastGenerated) continue;
      // Un revenu attendu n'est jamais compté (§11.6) : seules les sorties le sont.
      if (r.type === 'expense') upcomingOutflows += r.amount;
    }
  }
  for (const d of data.debts) {
    if (d.deleted || d.direction !== 'i_owe' || d.currency !== currency) continue;
    const s = debtStatus(d, data.debtPayments, now);
    if (!s.settled && s.nextDue && s.nextDue <= horizon) upcomingOutflows += Math.min(d.installment ?? s.remaining, s.remaining);
  }

  const categoryTrends = Object.entries(current.byCategory)
    .map(([categoryId, cur]) => {
      const average = avg(past.map((m) => m.byCategory[categoryId] ?? 0));
      return { categoryId, current: cur, average, change: average > 0 ? Math.round(((cur - average) / average) * 100) : 0 };
    })
    .filter((x) => x.average > 0)
    .sort((a, b) => b.change - a.change);

  const shareBase = hasHistory ? past : [current];
  const familyBase = shareBase.reduce((n, m) => n + m.expense, 0);
  const familySpend = shareBase.reduce((n, m) => n + (m.byCategory.cat_family ?? 0) + (m.byCategory.cat_social ?? 0), 0);

  return {
    currency,
    monthsOfData: past.length,
    period: hasHistory ? 'closed' : 'current',
    income,
    expenses,
    fixedCharges,
    fixedRatio: income.value > 0 ? Math.round((fixedCharges.value / income.value) * 100) : null,
    variableSpending: { value: Math.max(0, expenses.value - fixedCharges.value), source: expenses.source },
    debtService: { value: debtService, source: 'user' },
    debtRatio: income.value > 0 ? Math.round((debtService / income.value) * 100) : null,
    debtRepaid,
    debtRepaidRatio: income.value > 0 ? Math.round((debtRepaid.value / income.value) * 100) : null,
    savingsCapacity: capacity,
    goalNeeds,
    available,
    upcomingOutflows,
    upcomingInflows,
    categoryTrends,
    familyShare: familyBase > 0 ? Math.round((familySpend / familyBase) * 100) : null,
  };
}

/**
 * Capacité d'épargne OBSERVÉE (définition unique pour toute l'application :
 * analyse, alertes, assistant, objectifs). null tant qu'aucun mois complet
 * n'a été saisi — on ne déduit rien d'un mois en cours.
 */
export function observedCapacity(data: SnapshotInput['data'], currency: CurrencyCode, now: ISODate, financial?: FinancialProfile): number | null {
  const s = financialSnapshot({ data, currency, now, available: 0, financial });
  return s.monthsOfData > 0 ? s.savingsCapacity.value : null;
}

export type RecommendationKind =
  | 'no_data'
  | 'fixed_ratio_high'
  | 'fixed_ratio_ok'
  | 'capacity_positive'
  | 'capacity_negative'
  | 'goals_underfunded'
  | 'goals_funded'
  | 'low_balance_risk'
  | 'category_spike'
  | 'debt_ratio_high'
  | 'emergency_fund'
  | 'family_share'
  // Argent disponible v2 (§11.4) : conseils de `nextAdvice`, un seul producteur par notion.
  | 'money_unknown'
  /** Membre enfant (audit B6) : dettes, tontines et charges gérées par les parents. */
  | 'ask_parent'
  | 'commitments_over_available'
  | 'overdue'
  | 'precaution_low'
  | 'living_beyond_means'
  | 'ten_percent'
  | 'ten_percent_none'
  | 'ten_percent_partial'
  | 'fixed_charges'
  | 'debt_load'
  | 'congrats';

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  severity: 'positive' | 'info' | 'warning' | 'danger';
  params: Record<string, string | number>;
  source: DataSource;
  /** Écran utile pour agir. */
  link?: string;
  weight: number;
}

/**
 * Recommandations : seuils prudents et explicables (pas de règle universelle
 * imposée ; un seuil sert à alerter, jamais à juger).
 */
export function recommendations(s: FinancialSnapshot, goals: Pick<Goal, 'templateId' | 'status' | 'deleted'>[]): Recommendation[] {
  const out: Recommendation[] = [];
  const hasAny = s.income.value > 0 || s.expenses.value > 0;
  if (!hasAny) {
    out.push({ id: 'no_data', kind: 'no_data', severity: 'info', params: {}, source: 'estimate', link: '/transaction/new?type=expense', weight: 100 });
    return out;
  }
  if (s.fixedRatio !== null) {
    if (s.fixedRatio >= 50) out.push({ id: 'fixed_high', kind: 'fixed_ratio_high', severity: 'warning', params: { percent: s.fixedRatio, amount: s.fixedCharges.value }, source: s.fixedCharges.source, link: '/analysis', weight: 70 });
    else if (s.fixedCharges.value > 0) out.push({ id: 'fixed_ok', kind: 'fixed_ratio_ok', severity: 'info', params: { percent: s.fixedRatio, amount: s.fixedCharges.value }, source: s.fixedCharges.source, link: '/analysis', weight: 30 });
  }
  if (s.income.value > 0 && s.monthsOfData > 0) {
    if (s.savingsCapacity.value > 0) out.push({ id: 'capacity', kind: 'capacity_positive', severity: 'positive', params: { amount: s.savingsCapacity.value }, source: s.savingsCapacity.source, link: '/goals', weight: 60 });
    else out.push({ id: 'capacity_neg', kind: 'capacity_negative', severity: 'danger', params: { amount: -s.savingsCapacity.value }, source: s.savingsCapacity.source, link: '/budget', weight: 90 });
  }
  if (s.goalNeeds > 0) {
    if (s.monthsOfData > 0 && s.savingsCapacity.value < s.goalNeeds) out.push({ id: 'goals_gap', kind: 'goals_underfunded', severity: 'warning', params: { need: s.goalNeeds, capacity: Math.max(0, s.savingsCapacity.value), gap: s.goalNeeds - Math.max(0, s.savingsCapacity.value) }, source: 'estimate', link: '/goals', weight: 75 });
    else if (s.monthsOfData > 0) out.push({ id: 'goals_ok', kind: 'goals_funded', severity: 'positive', params: { need: s.goalNeeds }, source: 'estimate', link: '/goals', weight: 40 });
  }
  if (s.upcomingOutflows > 0 && s.available - s.upcomingOutflows < 0) {
    out.push({ id: 'low_balance', kind: 'low_balance_risk', severity: 'danger', params: { shortfall: s.upcomingOutflows - s.available, outflows: s.upcomingOutflows }, source: 'estimate', link: '/calendar', weight: 95 });
  }
  const spike = s.categoryTrends.find((c) => c.change >= 25 && c.current - c.average > 0);
  if (spike) out.push({ id: `spike_${spike.categoryId}`, kind: 'category_spike', severity: 'warning', params: { categoryId: spike.categoryId, percent: spike.change, amount: spike.current - spike.average }, source: 'user', link: '/reports', weight: 65 });
  if (s.debtRatio !== null && s.debtRatio >= 35) out.push({ id: 'debt_ratio', kind: 'debt_ratio_high', severity: 'warning', params: { percent: s.debtRatio, amount: s.debtService.value }, source: 'user', link: '/debts', weight: 80 });
  if (!hasEmergencyFund(goals) && s.monthsOfData > 0 && s.savingsCapacity.value > 0 && s.expenses.value > 0) out.push({ id: 'emergency', kind: 'emergency_fund', severity: 'info', params: { target: s.expenses.value * 3 }, source: 'estimate', link: '/goals/new', weight: 50 });
  if (s.familyShare !== null && s.familyShare >= 20) out.push({ id: 'family', kind: 'family_share', severity: 'info', params: { percent: s.familyShare }, source: 'user', link: '/budget', weight: 35 });
  return out.sort((a, b) => b.weight - a.weight);
}

// ─── Argent disponible v2 : conseils (§11.2-11.4) ─────────────────────

/** Notions désormais produites par `nextAdvice` : leurs anciennes recommandations disparaissent (pas de doublon). */
const REPLACED: ReadonlySet<RecommendationKind> = new Set(['no_data', 'capacity_positive', 'capacity_negative', 'goals_underfunded', 'goals_funded', 'low_balance_risk', 'debt_ratio_high', 'emergency_fund', 'fixed_ratio_high']);

/**
 * Recommandations v2 : EN TÊTE le conseil unique de `nextAdvice` (ordre du §11.4, chiffres de
 * `coachState`, revenus REÇUS), puis les constats qui ne font pas doublon (hausse d'une
 * catégorie, part de la famille, charges fixes raisonnables).
 */
export function coachRecommendations(s: FinancialSnapshot, state: CoachState, goals: Pick<Goal, 'templateId' | 'status' | 'deleted'>[], until: ISODate | null, role?: Role | null): Recommendation[] {
  // Audit B6 : un enfant ne voit ni dettes, ni tontines, ni charges — aucun conseil sur l'argent de
  // l'espace (il serait faux) ; la même idée que la carte du haut : « Demandez à un parent ».
  if (role === 'child') {
    const ask: Recommendation = { id: 'v2_ask_parent', source: 'user', weight: 1000, kind: 'ask_parent', severity: 'info', params: {}, link: '/' };
    return [ask, ...recommendations(s, goals).filter((r) => !REPLACED.has(r.kind) && r.kind !== 'congrats')];
  }
  const key = nextAdvice({
    tracked: state.tracked,
    available: state.available,
    commitments: state.commitments,
    overdue: state.overdue,
    monthsCovered: state.monthsCovered,
    overspentMonths: state.overspentMonths,
    savingsRate: state.savingsRate,
    fixedShare: state.fixedShare,
    debtShare: state.debtShare,
    goalsBehind: state.goalsBehind,
  });
  // Aucun revenu reçu (taux d'épargne inconnu) : rien à féliciter — jamais « 0 % de vos revenus reçus ».
  if (key === 'congrats' && state.savingsRate === null) return recommendations(s, goals).filter((r) => !REPLACED.has(r.kind) && r.kind !== 'congrats');
  const first = primary(key, s, state, until);
  const rest = recommendations(s, goals).filter((r) => !REPLACED.has(r.kind) && r.kind !== first.kind);
  return [first, ...rest];
}

function primary(key: AdviceKey, s: FinancialSnapshot, state: CoachState, until: ISODate | null): Recommendation {
  const base = { id: `v2_${key}`, source: 'user' as DataSource, weight: 1000 };
  const last = state.last;
  switch (key) {
    case 'money_unknown':
      return { ...base, kind: 'money_unknown', severity: 'info', params: {}, link: '/' };
    case 'commitments_over_available':
      return { ...base, kind: 'commitments_over_available', severity: 'danger', params: { date: until ?? '', amount: Math.ceil(state.commitments - state.available) }, link: '/' };
    case 'overdue':
      return { ...base, kind: 'overdue', severity: 'danger', params: {}, link: '/debts' };
    case 'precaution_low': {
      const p = precaution({ fund: state.fund, essentials: state.essentials ?? 0, irregular: state.irregular });
      return { ...base, kind: 'precaution_low', severity: 'warning', params: { months: p?.months ?? 0, targetMonths: p?.targetMonths ?? 3, target: p?.target ?? 0, missing: p?.missing ?? 0 }, link: '/savings' };
    }
    case 'living_beyond_means':
      return { ...base, kind: 'living_beyond_means', severity: 'warning', params: { spent: (last?.spent ?? 0) + (last?.repaid ?? 0), received: last?.received ?? 0, over: Math.max(0, (last?.spent ?? 0) + (last?.repaid ?? 0) - (last?.received ?? 0)) }, link: '/reports' };
    case 'ten_percent': {
      const ten = tenPercent({ received: last?.received ?? 0, available: state.available, commitments: state.commitments, saved: Math.max(0, last?.saved ?? 0) });
      if (ten.advice === null) return { ...base, kind: 'ten_percent_none', severity: 'info', params: {}, link: '/savings' };
      if ((last?.saved ?? 0) > 0) return { ...base, kind: 'ten_percent_partial', severity: 'info', params: { saved: Math.max(0, last?.saved ?? 0), percent: ten.savedPercent ?? 0, missing: ten.toReach ?? 0 }, link: '/savings' };
      return { ...base, kind: 'ten_percent', severity: 'info', params: { amount: ten.advice, feasible: ten.feasible ?? 0 }, link: '/savings' };
    }
    case 'fixed_charges':
      return { ...base, kind: 'fixed_charges', severity: 'warning', params: { percent: state.fixedShare ?? 0 }, link: '/analysis' };
    case 'debt_load':
      return { ...base, kind: 'debt_load', severity: 'warning', params: { percent: state.debtShare ?? 0 }, link: '/debts' };
    case 'goals_effort':
      return { ...base, kind: 'goals_underfunded', severity: 'warning', params: { need: s.goalNeeds, capacity: Math.max(0, s.savingsCapacity.value), gap: Math.max(0, s.goalNeeds - Math.max(0, s.savingsCapacity.value)) }, link: '/goals' };
    case 'congrats':
      return { ...base, kind: 'congrats', severity: 'positive', params: { percent: state.savingsRate ?? 0 }, link: '/reports' };
  }
}
