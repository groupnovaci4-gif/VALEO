/** Phase 1 — alertes de budget du coach (85 % / 100 % / dépassement). */
import { describe, expect, it } from 'vitest';
import { alertsAfterWrite, envelopeAlertMessage, touchedByWrite, type EnvelopeAlertMemory } from '../src/core/coach/envelopeAlerts';
import type { BudgetPlan, Transaction } from '../src/core/types';
import type { CurrencyCode } from '../src/core/money';
import { envelope, tx } from './helpers';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const food = envelope({ id: 'food', name: 'Nourriture', monthlyBudget: 100_000, categoryIds: ['cat_food'] });
const spend = (amount: number, date = '2026-10-10', p: Partial<Transaction> = {}) => tx({ type: 'expense', amount, accountId: 'a', categoryId: 'cat_food', date, ...p });

/** Simule une suite d'opérations et renvoie les niveaux alertés à chaque étape. */
function run(steps: { add?: Transaction; remove?: string; today?: string; budgets?: BudgetPlan[] }[], envelopes = [food], currency: CurrencyCode = 'XOF') {
  let txs: Transaction[] = [];
  let memory: EnvelopeAlertMemory = {};
  let budgets: BudgetPlan[] = [];
  const out: string[][] = [];
  const all: ReturnType<typeof alertsAfterWrite>['alerts'][] = [];
  for (const s of steps) {
    if (s.budgets) budgets = s.budgets;
    const removed = s.remove ? txs.find((t) => t.id === s.remove) : undefined;
    if (s.add) txs = [...txs, s.add];
    if (s.remove) txs = txs.filter((t) => t.id !== s.remove);
    const touched = s.budgets ? new Map([['2026-10', new Set(['food'])]]) : touchedByWrite([s.add, removed], envelopes);
    const r = alertsAfterWrite({ data: { envelopes, transactions: txs, budgets }, touched, currency, memory, today: s.today ?? '2026-10-10' });
    memory = r.memory;
    out.push(r.alerts.map((a) => a.level + (a.reminder ? '+rappel' : '')));
    all.push(r.alerts);
  }
  return { out, all };
}

describe('alertes de budget (budget 100 000)', () => {
  it('progression : 50 000 → 84 999 → 85 000 → 90 000 → 100 000 → 100 001 → 120 000', () => {
    const { out, all } = run([
      { add: spend(50_000) },
      { add: spend(34_999) }, // 84 999
      { add: spend(1) }, // 85 000
      { add: spend(5_000) }, // 90 000
      { add: spend(10_000) }, // 100 000
      { add: spend(1) }, // 100 001
      { add: spend(19_999) }, // 120 000 (même jour)
    ]);
    expect(out).toEqual([[], [], ['warning'], [], ['reached'], ['critical'], []]);
    expect(all[2][0]).toMatchObject({ percent: 85, left: 15_000, over: 0 });
    expect(all[5][0]).toMatchObject({ over: 1 });
  });
  it('dépassement à 120 000 : dépassement exact de 20 000', () => {
    const { all } = run([{ add: spend(120_000) }]);
    expect(all[0]).toHaveLength(1);
    expect(all[0][0]).toMatchObject({ level: 'critical', over: 20_000, left: 0, from: 'ok' });
  });
  it('saut de niveaux 50 000 → 120 000 en une dépense : uniquement « critical »', () => {
    const { out } = run([{ add: spend(50_000) }, { add: spend(70_000) }]);
    expect(out).toEqual([[], ['critical']]);
  });
  it('critical : rappel au plus 1 fois par jour et seulement si le dépassement s’aggrave', () => {
    const { out } = run([
      { add: spend(110_000), today: '2026-10-10' },
      { add: spend(5_000), today: '2026-10-10' }, // aggravation le même jour : rien
      { add: spend(5_000), today: '2026-10-11' }, // lendemain + aggravation : rappel
      { add: spend(1_000), today: '2026-10-11' }, // même jour : rien
    ]);
    expect(out).toEqual([['critical'], [], ['critical+rappel'], []]);
  });
  it('suppression qui redescend : aucune alerte, puis nouveau dépassement → nouvelle alerte', () => {
    const big = spend(120_000, '2026-10-10', { id: 'big' });
    const { out } = run([{ add: big }, { remove: 'big' }, { add: spend(130_000) }]);
    expect(out).toEqual([['critical'], [], ['critical']]);
  });
  it('nouveau mois : remise à zéro', () => {
    const { out } = run([{ add: spend(120_000, '2026-10-10') }, { add: spend(90_000, '2026-11-02'), today: '2026-11-02' }]);
    expect(out).toEqual([['critical'], ['warning']]);
  });
  it('enveloppe de départ à 0 (budget jamais fixé) : aucune alerte', () => {
    const zero = envelope({ id: 'food', name: 'Nourriture', monthlyBudget: 0, categoryIds: ['cat_food'] });
    expect(run([{ add: spend(5_000) }], [zero]).out).toEqual([[]]);
  });
  it('enveloppe fixée à 0 par l’utilisateur (plan du mois) : toute dépense = critical', () => {
    const zero = envelope({ id: 'food', name: 'Nourriture', monthlyBudget: 0, categoryIds: ['cat_food'] });
    const plan = { ...food, id: 'plan', month: '2026-10', allocations: { food: 0 } } as unknown as BudgetPlan;
    const { out, all } = run([{ budgets: [plan] }, { add: spend(1) }], [zero]);
    expect(out).toEqual([[], ['critical']]);
    expect(all[1][0]).toMatchObject({ over: 1, percent: 100 });
  });
  it('budget relevé en cours de mois : recalcul sur la nouvelle base, seuils réarmés', () => {
    const plan150 = { id: 'p', month: '2026-10', allocations: { food: 150_000 }, createdAt: 1, updatedAt: 1, createdBy: 'u' } as unknown as BudgetPlan;
    const { out } = run([
      { add: spend(120_000) }, // critical sur 100 000
      { budgets: [plan150] }, // 80 % de 150 000 : aucune alerte, réarmement
      { add: spend(10_000) }, // 130 000 / 150 000 = 86 % → warning
    ]);
    expect(out).toEqual([['critical'], [], ['warning']]);
  });
  it('devise à décimales (EUR, centimes) et aucune conversion : opération dans une autre devise ignorée', () => {
    const eur = envelope({ id: 'food', name: 'Courses', monthlyBudget: 10_000, categoryIds: ['cat_food'], currency: 'EUR' } as never);
    const { out, all } = run(
      [
        { add: spend(8_499, '2026-10-10', { currency: 'EUR' }) },
        { add: spend(1, '2026-10-10', { currency: 'EUR' }) }, // 85,00 €
        { add: spend(50_000, '2026-10-10', { currency: 'XOF' }) }, // autre devise : ignorée
      ],
      [eur],
      'EUR',
    );
    expect(out).toEqual([[], ['warning'], []]);
    expect(all[1][0]).toMatchObject({ left: 1_500 });
  });
  it('un virement ou un revenu ne touche aucune enveloppe', () => {
    expect(touchedByWrite([tx({ type: 'transfer', amount: 1, accountId: 'a', toAccountId: 'b' }), tx({ type: 'income', amount: 1, accountId: 'a' })], [food]).size).toBe(0);
  });
});

describe('messages', () => {
  it('avec prénom, sans prénom (formule neutre)', () => {
    const a = { level: 'warning' as const, envelopeName: 'Nourriture', percent: 85, left: 15_000, over: 0 };
    expect(envelopeAlertMessage(a, 'Awa')).toEqual({ key: 'coach.env.warning', params: { name: 'Awa', envelope: 'Nourriture', percent: 85, left: 15_000, over: 0 } });
    expect(envelopeAlertMessage(a, '  ').key).toBe('coach.env.warning.anon');
    expect(envelopeAlertMessage({ ...a, level: 'critical', over: 20_000 }, null).key).toBe('coach.env.critical.anon');
  });
  it('le pourcentage n’atteint jamais 100 % avant 100 %', () => {
    const { all } = run([{ add: spend(99_999) }]);
    expect(all[0][0]).toMatchObject({ level: 'warning', percent: 99 });
  });
});

describe('messages FR / EN', () => {
  it('chaque niveau existe avec et sans prénom, paramètres remplacés', () => {
    const dict = { fr, en } as Record<'fr' | 'en', Record<string, string>>;
    // Même interpolation que l'application : {param}.
    const translate = (lang: 'fr' | 'en', key: string, params: Record<string, string | number>) => {
      expect(dict[lang][key], `${lang}:${key}`).toBeTypeOf('string');
      return dict[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
    };
    for (const lang of ['fr', 'en'] as const)
      for (const level of ['warning', 'reached', 'critical'] as const)
        for (const name of ['Awa', '']) {
          const m = envelopeAlertMessage({ level, envelopeName: 'Nourriture', percent: 85, left: 15_000, over: 20_000 }, name);
          const text = translate(lang, m.key, { ...m.params, left: '15 000 FCFA', over: '20 000 FCFA' });
          expect(text, `${lang} ${level} ${name}`).not.toMatch(/[{}]/);
          expect(text).toContain('Nourriture');
          if (name) expect(text).toContain('Awa');
        }
    expect(translate('fr', 'coach.env.critical', { name: 'Awa', envelope: 'Nourriture', over: '20 000 FCFA' })).toBe(
      'Attention Awa, vous avez dépassé votre budget Nourriture de 20 000 FCFA. Vos dépenses sont au-dessus de la limite que vous vous étiez fixée.',
    );
  });
});
