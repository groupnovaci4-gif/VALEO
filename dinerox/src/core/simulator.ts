/**
 * « Puis-je contribuer ? » — simulateur PUR, avant de dire oui.
 *
 * Pour un montant envisagé (funérailles, mariage, aide à un parent…), le code
 * calcule — sans rien enregistrer :
 *  - le solde de la réserve après contribution (part prise dessus, complément) ;
 *  - le nouveau « reste par jour » jusqu'à la fin du mois (`dailyAllowance`,
 *    même règle que l'accueil : la part prise sur la réserve ne le fait pas baisser) ;
 *  - les enveloppes dont le niveau se dégraderait, et ce qui manquerait au
 *    mois (mises de côté prévues non couvertes) si le disponible devient négatif.
 * Aucun jugement, aucune recommandation : des chiffres et des options.
 */
import type { FinancialProfile, GoalContribution, SpaceData, Transaction } from './types';
import type { CurrencyCode } from './money';
import { monthKey, type ISODate } from './dates';
import { dailyAllowance, type DailyAllowance } from './dailyAllowance';
import { LEVEL_RANK, envelopeStatuses, type EnvelopeLevel } from './budget';
import { activeReserves, budgetTransactions, reserveBalance, splitReserveUse } from './reserve';

/** Catégorie par défaut d'une contribution simulée (obligations sociales). */
export const SIMULATION_CATEGORY = 'cat_social';

export interface SimulationInput {
  data: SpaceData;
  currency: CurrencyCode;
  today: ISODate;
  financial?: Pick<FinancialProfile, 'monthlyIncome'> | null;
  amount: number;
  categoryId?: string;
  /** Réserve utilisée : absente = la première réserve active ; null = aucune. */
  reserveId?: string | null;
}

export interface Simulation {
  amount: number;
  reserve: { id: string; name: string; before: number; after: number; fromReserve: number; complement: number } | null;
  before: DailyAllowance;
  after: DailyAllowance;
  /** Enveloppes dont le niveau se dégraderait (seul le complément compte). */
  envelopes: { envelopeId: string; name: string; before: EnvelopeLevel; after: EnvelopeLevel; remainingAfter: number }[];
  /** Si le mois passe en négatif : ce qui manquerait, et les mises de côté prévues alors non couvertes. */
  shortfall: { amount: number; plannedSetAside: number } | null;
}

/** Données « comme si » la contribution était enregistrée (rien n'est écrit). */
function withContribution(input: SimulationInput): { data: SpaceData; reserve: Simulation['reserve'] } {
  const { data, currency, today, amount } = input;
  const categoryId = input.categoryId ?? SIMULATION_CATEGORY;
  const reserves = activeReserves(data.goals, currency);
  const g = input.reserveId === null ? undefined : input.reserveId ? reserves.find((r) => r.id === input.reserveId) : reserves[0];
  const tx: Transaction = { id: '__sim_tx', createdAt: 0, updatedAt: 0, createdBy: '', type: 'expense', amount, currency, date: today, accountId: '__sim', categoryId };
  if (!g) return { data: { ...data, transactions: [...data.transactions, tx] }, reserve: null };
  const before = reserveBalance(g, data.goalContributions);
  const split = splitReserveUse(amount, before);
  const use: GoalContribution[] = split.fromReserve > 0 ? [{ id: '__sim_use', createdAt: 0, updatedAt: 0, createdBy: '', goalId: g.id, amount: -split.fromReserve, date: today, linkedTransactionId: tx.id }] : [];
  return {
    data: { ...data, transactions: [...data.transactions, tx], goalContributions: [...data.goalContributions, ...use] },
    reserve: { id: g.id, name: g.name, before, after: before - split.fromReserve, ...split },
  };
}

export function simulateContribution(input: SimulationInput): Simulation {
  const { data, currency, today, financial } = input;
  const amount = Math.max(0, Math.round(input.amount));
  const sim = withContribution({ ...input, amount });
  const before = dailyAllowance({ data, currency, today, financial });
  const after = dailyAllowance({ data: sim.data, currency, today, financial });
  const month = monthKey(today);
  const statusesBefore = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, month, currency);
  const statusesAfter = envelopeStatuses(sim.data.envelopes, budgetTransactions(sim.data.transactions, sim.data.goalContributions), sim.data.budgets, month, currency);
  const envelopes = statusesAfter
    .map((s) => ({ s, b: statusesBefore.find((x) => x.envelope.id === s.envelope.id) }))
    .filter(({ s, b }) => b && s.spent !== b.spent && s.budget > 0 && LEVEL_RANK[s.level] > LEVEL_RANK[b.level])
    .map(({ s, b }) => ({ envelopeId: s.envelope.id, name: s.envelope.name, before: b!.level, after: s.level, remainingAfter: s.remaining }));
  const shortfall = after.status === 'deficit' ? { amount: after.deficit, plannedSetAside: after.goalsRemaining } : null;
  return { amount, reserve: sim.reserve, before, after, envelopes, shortfall };
}

/** Reste par jour pour plusieurs montants (« Avec 30 000, … ; avec 20 000, … »). */
export function compareAmounts(input: Omit<SimulationInput, 'amount'>, amounts: number[]): { amount: number; after: DailyAllowance }[] {
  return amounts.filter((a) => a > 0).map((amount) => ({ amount, after: simulateContribution({ ...input, amount }).after }));
}
