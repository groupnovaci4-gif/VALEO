/**
 * « Puis-je contribuer ? » — simulateur PUR, avant de dire oui.
 *
 * Pour un montant envisagé (funérailles, mariage, aide à un parent…), le code
 * calcule — sans rien enregistrer :
 *  - le solde de la réserve après contribution (part prise dessus, complément) ;
 *  - le nouveau « reste par jour » (`dailyAllowanceV2`, LA fonction de l'accueil :
 *    la réserve paie avec l'argent qui y est adossé, le reste sort du disponible) ;
 *  - les enveloppes dont le niveau se dégraderait, et ce qui manquerait au
 *    mois (mises de côté prévues non couvertes) si le disponible devient négatif.
 * Aucun jugement, aucune recommandation : des chiffres et des options.
 */
import type { FinancialProfile, SpaceData, Transaction } from './types';
import type { CurrencyCode } from './money';
import { monthKey, type ISODate } from './dates';
import { dailyAllowanceV2, type AllowanceV2 } from './allowance';
import { LEVEL_RANK, envelopeStatuses, type EnvelopeLevel } from './budget';
import { activeReserves, budgetTransactions, reserveBalance } from './reserve';
import { firstSpendingAccountId } from './position';
import { applyItems, planReserveUse } from './writePlans';

/** Catégorie par défaut d'une contribution simulée (obligations sociales). */
export const SIMULATION_CATEGORY = 'cat_social';

export interface SimulationInput {
  data: SpaceData;
  currency: CurrencyCode;
  today: ISODate;
  /** Seul le jour de paie sert (horizon) ; le revenu déclaré n'entre jamais dans le calcul. */
  financial?: Pick<FinancialProfile, 'payDay'> | null;
  amount: number;
  categoryId?: string;
  /** Réserve utilisée : absente = la première réserve active ; null = aucune. */
  reserveId?: string | null;
}

export interface Simulation {
  amount: number;
  reserve: { id: string; name: string; before: number; after: number; fromReserve: number; complement: number } | null;
  before: AllowanceV2;
  after: AllowanceV2;
  /** Enveloppes dont le niveau se dégraderait (seul le complément compte). */
  envelopes: { envelopeId: string; name: string; before: EnvelopeLevel; after: EnvelopeLevel; remainingAfter: number }[];
  /** Si le mois passe en négatif : ce qui manquerait, et les mises de côté prévues alors non couvertes. */
  shortfall: { amount: number; plannedSetAside: number } | null;
}

/** Données « comme si » la contribution était enregistrée (rien n'est écrit), sur le compte courant par défaut. */
function withContribution(input: SimulationInput): { data: SpaceData; reserve: Simulation['reserve'] } {
  const { data, currency, today, amount } = input;
  const categoryId = input.categoryId ?? SIMULATION_CATEGORY;
  const reserves = activeReserves(data.goals, currency);
  const g = input.reserveId === null ? undefined : input.reserveId ? reserves.find((r) => r.id === input.reserveId) : reserves[0];
  const tx: Transaction = { id: '__sim_tx', createdAt: 0, updatedAt: 0, createdBy: '', type: 'expense', amount, currency, date: today, accountId: firstSpendingAccountId(data.accounts, currency) ?? '__sim', categoryId };
  const withTx = { ...data, transactions: [...data.transactions, tx] };
  if (!g) return { data: withTx, reserve: null };
  const before = reserveBalance(g, data.goalContributions);
  let n = 0;
  const use = planReserveUse(data, tx, g.id, currency, (p) => `__sim_${p}${++n}`);
  return {
    data: applyItems(withTx, use.items),
    reserve: { id: g.id, name: g.name, before, after: before - use.covered, fromReserve: use.covered, complement: use.uncovered },
  };
}

export function simulateContribution(input: SimulationInput): Simulation {
  const { data, currency, today, financial } = input;
  const amount = Math.max(0, Math.round(input.amount));
  const sim = withContribution({ ...input, amount });
  const payDay = financial?.payDay ?? null;
  const before = dailyAllowanceV2({ data, currency, today, payDay });
  const after = dailyAllowanceV2({ data: sim.data, currency, today, payDay });
  const month = monthKey(today);
  const statusesBefore = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, month, currency, data.accounts);
  const statusesAfter = envelopeStatuses(sim.data.envelopes, budgetTransactions(sim.data.transactions, sim.data.goalContributions), sim.data.budgets, month, currency, sim.data.accounts);
  const envelopes = statusesAfter
    .map((s) => ({ s, b: statusesBefore.find((x) => x.envelope.id === s.envelope.id) }))
    .filter(({ s, b }) => b && s.spent !== b.spent && s.budget > 0 && LEVEL_RANK[s.level] > LEVEL_RANK[b.level])
    .map(({ s, b }) => ({ envelopeId: s.envelope.id, name: s.envelope.name, before: b!.level, after: s.level, remainingAfter: s.remaining }));
  const shortfall = after.status === 'deficit' ? { amount: after.deficit, plannedSetAside: after.items.filter((c) => c.kind === 'goal').reduce((n, c) => n + c.amount, 0) } : null;
  return { amount, reserve: sim.reserve, before, after, envelopes, shortfall };
}

/** Reste par jour pour plusieurs montants (« Avec 30 000, … ; avec 20 000, … »). */
export function compareAmounts(input: Omit<SimulationInput, 'amount'>, amounts: number[]): { amount: number; after: AllowanceV2 }[] {
  return amounts.filter((a) => a > 0).map((amount) => ({ amount, after: simulateContribution({ ...input, amount }).after }));
}
