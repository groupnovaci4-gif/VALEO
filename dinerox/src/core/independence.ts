/**
 * Indépendance financière — SIMULATION, jamais une promesse.
 *
 * Capital visé = dépenses annuelles ÷ taux de retrait (hypothèse modifiable,
 * 4 % par défaut). Trajectoire : capital actuel (actifs − dettes) + épargne
 * mensuelle, capitalisés mensuellement au rendement supposé. Tous les
 * paramètres sont des hypothèses affichées et modifiables par l'utilisateur.
 */
export interface IndependenceInput {
  /** Dépenses mensuelles (unités mineures). */
  monthlyExpenses: number;
  /** Épargne mensuelle investie (unités mineures). */
  monthlySavings: number;
  /** Capital de départ net : actifs − dettes (unités mineures, peut être négatif). */
  currentCapital: number;
  /** Rendement annuel supposé, en % (ex. 4). */
  annualReturnPct: number;
  /** Taux de retrait soutenable supposé, en % (ex. 4). */
  withdrawalRatePct: number;
  maxYears?: number;
}

export interface IndependenceResult {
  target: number;
  /** Années pour atteindre le capital visé (null : non atteint dans l'horizon). */
  years: number | null;
  months: number | null;
  trajectory: { year: number; capital: number }[];
  /** Revenu passif mensuel estimé que le capital actuel permettrait. */
  passiveIncomeToday: number;
  progressPct: number;
}

export function simulateIndependence(i: IndependenceInput): IndependenceResult {
  const maxYears = i.maxYears ?? 60;
  const rate = Math.max(0.1, i.withdrawalRatePct) / 100;
  const target = Math.round((Math.max(0, i.monthlyExpenses) * 12) / rate);
  const monthlyReturn = Math.pow(1 + i.annualReturnPct / 100, 1 / 12) - 1;
  let capital = i.currentCapital;
  const trajectory = [{ year: 0, capital: Math.round(capital) }];
  let months: number | null = capital >= target && target > 0 ? 0 : null;
  for (let m = 1; m <= maxYears * 12; m++) {
    capital = capital * (1 + (capital > 0 ? monthlyReturn : 0)) + Math.max(0, i.monthlySavings);
    if (months === null && target > 0 && capital >= target) months = m;
    if (m % 12 === 0) trajectory.push({ year: m / 12, capital: Math.round(capital) });
    if (months !== null && m >= months + 12 && m % 12 === 0) break;
  }
  return {
    target,
    months,
    years: months === null ? null : Math.round((months / 12) * 10) / 10,
    trajectory,
    passiveIncomeToday: Math.max(0, Math.round((i.currentCapital * rate) / 12)),
    progressPct: target > 0 ? Math.max(0, Math.min(100, Math.round((i.currentCapital / target) * 100))) : 0,
  };
}
