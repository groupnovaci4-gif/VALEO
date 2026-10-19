/**
 * IA — cartes de validation (docs/ia-comprend-tout.md §2.2, §3) : verbe et montant, « Depuis → vers »,
 * argent disponible après ; complément si le montant dépasse ce que le compte peut payer ; AUCUNE
 * écriture avant « Valider » ; « Valider » appelle l'action existante de `useActions` ; « Annuler »
 * retire ce qui vient d'être écrit ; droits du rôle (`can`) respectés.
 */
import { describe, expect, it, vi } from 'vitest';
import { actionGate, buildActionCard, runAction, type ActionPort } from '../src/core/ai/actionCard';
import { intentContext, understand, type ActionIntent } from '../src/core/ai/intent';
import { positionOf } from '../src/core/position';
import { iaData, TODAY } from './fixtures/ia-data';

const data = iaData();
const ictx = intentContext(data, { today: TODAY, currency: 'XOF' });
const cctx = { data, currency: 'XOF' as const, today: TODAY };
const act = (text: string): ActionIntent => {
  const i = understand(text, ictx);
  if (i.kind !== 'action') throw new Error(`${text} → ${JSON.stringify(i)}`);
  return i;
};

function port() {
  const written = { id: 'w1' };
  const p = {
    depositToSavings: vi.fn(() => written),
    withdrawFromSavings: vi.fn(() => written),
    saveTransaction: vi.fn(() => written),
    contributeToGoal: vi.fn(() => written),
    createGoal: vi.fn(() => written),
    recordDebtPayment: vi.fn(() => written),
    saveDebt: vi.fn(() => written),
    confirmRecurring: vi.fn(() => 'w1'),
    saveEnvelope: vi.fn(() => written),
    saveRecurring: vi.fn(() => written),
    remove: vi.fn(),
    save: vi.fn(),
    currentTransactions: vi.fn(() => []),
  };
  return p as typeof p & ActionPort;
}

describe('carte de validation', () => {
  it('« Retire 100 000 de l’argent disponible pour le mettre en épargne » : verbe, de → vers, disponible après', () => {
    const card = buildActionCard(act('Retire 100 000 de l’argent disponible pour le mettre en épargne'), cctx);
    const available = positionOf(data, 'XOF', TODAY).available;
    expect(card).toMatchObject({ titleKey: 'ia.card.save', titleParams: { amount: 100_000 }, availableAfter: available - 100_000, shortfall: false });
    expect(card.lines).toContainEqual({ key: 'ia.card.fromTo', params: { from: 'Banque', to: 'Mon épargne' } });
  });

  it('montant supérieur à ce que le compte peut payer : la carte le signale (complément de la feuille §6)', () => {
    expect(buildActionCard(act('Mets 500 000 de Wave sur mon épargne'), cctx).shortfall).toBe(true);
  });

  it('montant manquant : surligné sur la carte, jamais deviné', () => {
    const card = buildActionCard({ kind: 'action', action: 'goal_contribute', amount: null, date: TODAY, ref: { kind: 'goal', id: 'g_moto', label: 'Ma moto' }, from: { kind: 'account', id: 'sav', label: 'Mon épargne' } }, cctx);
    expect(card.uncertain).toContain('amount');
  });
});

describe('aucune écriture sans « Valider »', () => {
  it('comprendre et préparer la carte n’appellent aucune action', () => {
    const p = port();
    buildActionCard(act('Retire 100 000 de l’argent disponible pour le mettre en épargne'), cctx);
    for (const fn of Object.values(p)) expect(fn).not.toHaveBeenCalled();
  });

  it('« Valider » : mettre de côté → depositToSavings, puis « Annuler » retire l’opération', () => {
    const p = port();
    const r = runAction(act('Retire 100 000 de l’argent disponible pour le mettre en épargne'), p, cctx, []);
    expect(p.depositToSavings).toHaveBeenCalledWith({ savingsAccountId: 'sav', fromAccountId: 'bank', amount: 100_000, date: TODAY, goal: null, choices: [] });
    r.undo();
    expect(p.remove).toHaveBeenCalledWith('transactions', 'w1');
  });

  it('chaque action passe par l’écriture existante de useActions', () => {
    const cases: [string, keyof ActionPort][] = [
      ['Sors 30 000 de mon épargne vers Wave', 'withdrawFromSavings'],
      ['Envoie 10 000 de Wave vers Orange Money', 'saveTransaction'],
      ['Ajoute 25 000 à ma moto', 'contributeToGoal'],
      ['Je veux économiser pour un frigo à 300 000', 'createGoal'],
      ['J’ai remboursé 50 000 à Koffi avec Orange Money', 'recordDebtPayment'],
      ['J’ai prêté 20 000 à Awa par Wave', 'saveDebt'],
      ['J’ai payé le loyer', 'confirmRecurring'],
      ['Mets le transport à 50 000 ce mois-ci', 'saveEnvelope'],
    ];
    for (const [text, method] of cases) {
      const p = port();
      runAction(act(text), p, cctx, []);
      expect(p[method], text).toHaveBeenCalledTimes(1);
    }
  });

  it('prendre sur la réserve : une dépense liée à la réserve (règle 19)', () => {
    const p = port();
    const i: ActionIntent = { kind: 'action', action: 'reserve_use', amount: 40_000, date: TODAY, ref: { kind: 'reserve', id: 'r_family', label: 'Réserve famille' }, from: { kind: 'account', id: 'om', label: 'Orange Money' }, categoryId: 'cat_social', subcategoryId: 'sub_social_funerals' };
    runAction(i, p, cctx, []);
    expect(p.saveTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'expense', amount: 40_000, accountId: 'om', subcategoryId: 'sub_social_funerals' }), { reserveId: 'r_family', choices: [] });
  });

  it('nouvelle récurrence : mensuelle, au jour dit, sur le compte choisi', () => {
    const p = port();
    const i: ActionIntent = { kind: 'action', action: 'recurring_create', amount: 50_000, date: TODAY, label: 'Maman', categoryId: 'cat_family', subcategoryId: null, type: 'expense', dueDay: 10, from: { kind: 'account', id: 'om', label: 'Orange Money' } };
    runAction(i, p, cctx, []);
    expect(p.saveRecurring).toHaveBeenCalledWith(expect.objectContaining({ type: 'expense', label: 'Maman', amount: 50_000, accountId: 'om', frequency: 'monthly', startDate: '2026-11-10', active: true }));
  });
});

describe('droits du rôle (can) : jamais contournés', () => {
  it('un enfant ne met pas de côté, ne transfère pas, ne prend pas sur une réserve, ne crée pas de dette', () => {
    for (const a of ['save', 'transfer', 'withdraw_savings', 'reserve_use', 'debt_create', 'debt_repayment', 'envelope_budget', 'recurring_create'] as const) expect(actionGate(a, 'child'), a).toBe('ia.a.roleLocked');
    expect(actionGate('goal_contribute', 'child')).toBeNull();
    expect(actionGate('save', 'partner')).toBeNull();
  });
});
