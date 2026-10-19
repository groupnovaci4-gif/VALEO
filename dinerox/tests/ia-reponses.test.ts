/**
 * IA — réponses calculées sur le téléphone pour TOUTES les rubriques (docs/ia-comprend-tout.md
 * §2.1, §2.3). Chaque réponse est une clé i18n + des paramètres venant de `src/core` : l'IA ne
 * calcule jamais un chiffre. Droits du rôle et de la formule respectés (`can`, `hasFeature`).
 */
import { describe, expect, it } from 'vitest';
import { answerIntent, topicGate, type AnswerCtx } from '../src/core/ai/localAnswers';
import { QUESTION_TOPICS, intentContext, understand, type QuestionIntent, type Topic } from '../src/core/ai/intent';
import { positionOf } from '../src/core/position';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import { iaData, TODAY } from './fixtures/ia-data';

const data = iaData();
const ictx = intentContext(data, { today: TODAY, currency: 'XOF' });
const actx: AnswerCtx = { data, currency: 'XOF', now: TODAY, categoryName: (id) => id, payDay: 25, financial: null, rewardsCount: 2, spaceKind: 'personal' };
const ask = (text: string) => {
  const i = understand(text, ictx);
  if (i.kind !== 'question') throw new Error(`${text} → ${JSON.stringify(i)}`);
  return answerIntent(i, actx);
};

describe('réponses locales : les chiffres viennent de src/core', () => {
  it('argent disponible, mis de côté, total des comptes : positionOf', () => {
    const p = positionOf(data, 'XOF', TODAY);
    expect(ask('Combien j’ai de disponible ?')).toMatchObject({ key: 'ia.a.available', params: { available: p.available } });
    expect(ask('Combien j’ai mis de côté ?').params).toMatchObject({ amount: p.setAside });
    expect(ask('Total de mes comptes ?').params).toMatchObject({ amount: p.totalAccounts });
    expect(ask('Combien sur Orange Money ?')).toMatchObject({ key: 'ia.a.accountBalance', params: { name: 'Orange Money', amount: p.accounts.om.balance } });
  });

  it('dettes : Koffi 150 000 − 50 000 remboursés = 100 000 ; total dû ; on me doit', () => {
    expect(ask('Je dois combien à Koffi ?')).toMatchObject({ key: 'ia.a.debtOwe', params: { name: 'Koffi', remaining: 100_000 } });
    expect(ask('Combien je dois ?')).toMatchObject({ key: 'ia.a.debtsOwe', params: { amount: 1_100_000 } });
    expect(ask('Combien on me doit ?')).toMatchObject({ key: 'ia.a.debtsOwed', params: { amount: 20_000 } });
    expect(ask('Awa me doit combien ?')).toMatchObject({ key: 'ia.a.debtOwed', params: { name: 'Awa', remaining: 20_000 } });
  });

  it('tontine du bureau : prochaine cotisation (4e échéance, en retard), tour, déjà versé', () => {
    expect(ask('Quand est-ce que je paie ma tontine du bureau ?')).toMatchObject({ key: 'ia.a.tontineNextLate', params: { name: 'Tontine du bureau', date: '2026-10-05', amount: 20_000 } });
    expect(ask('À quand mon tour pour la tontine du bureau ?')).toMatchObject({ key: 'ia.a.tontineTurn', params: { name: 'Tontine du bureau', date: '2026-12-05', amount: 200_000 } });
    expect(ask('Combien j’ai déjà versé à la tontine du bureau ?')).toMatchObject({ key: 'ia.a.tontinePaid', params: { amount: 60_000, count: 3 } });
    expect(ask('C’est combien ma cotisation pour la tontine du marché ?')).toMatchObject({ key: 'ia.a.tontineAmount', params: { amount: 5_000 } });
  });

  it('famille et échéances : Maman 50 000 par mois ; loyer du 5 octobre pas confirmé, prochain le 5 novembre (audit I8)', () => {
    expect(ask('Combien j’envoie à Maman par mois ?')).toMatchObject({ key: 'ia.a.recurringAmount', params: { name: 'Maman', amount: 50_000 } });
    expect(ask('C’est quand le loyer ?')).toMatchObject({ key: 'ia.a.recurringLate', params: { name: 'Loyer', late: '2026-10-05', date: '2026-11-05', amount: 100_000 } });
  });

  it('dépenses par catégorie et période : loyer du mois, maquis de la semaine', () => {
    expect(ask('Combien j’ai dépensé en loyer ce mois ?')).toMatchObject({ key: 'ia.a.spentCat.month', params: { amount: 100_000 } });
    expect(ask('Combien j’ai payé au maquis cette semaine ?')).toMatchObject({ key: 'ia.a.spentCat.week', params: { amount: 6_000 } });
  });

  it('objectifs, réserve, moments forts', () => {
    expect(ask('Où en est ma moto ?')).toMatchObject({ key: 'ia.a.goalStatus', params: { name: 'Ma moto', saved: 200_000, target: 600_000, percent: 33 } });
    expect(ask('Combien dans ma réserve famille ?')).toMatchObject({ key: 'ia.a.reserve', params: { balance: 90_000, target: 300_000 } });
    expect(ask('Combien pour la rentrée scolaire ?').key).toBe('ia.a.season');
  });

  it('chaque sujet a une réponse dont la clé existe en français et en anglais', () => {
    const refs: Partial<Record<Topic, QuestionIntent['ref']>> = {
      account_balance: { kind: 'account', id: 'om', label: 'Orange Money' },
      envelope_remaining: { kind: 'envelope', id: 'env_tr', label: 'Transport' },
      goal_status: { kind: 'goal', id: 'g_moto', label: 'Ma moto' },
      goal_monthly: { kind: 'goal', id: 'g_car', label: 'Ma voiture' },
      goal_eta: { kind: 'goal', id: 'g_emergency', label: "Mon fonds d'urgence" },
      reserve_balance: { kind: 'reserve', id: 'r_family', label: 'Réserve famille' },
      season_status: { kind: 'season', id: 's_school', label: 'Rentrée scolaire' },
      tontine_next: { kind: 'tontine', id: 't_bureau', label: 'Tontine du bureau' },
      tontine_amount: { kind: 'tontine', id: 't_bureau', label: 'Tontine du bureau' },
      tontine_turn: { kind: 'tontine', id: 't_bureau', label: 'Tontine du bureau' },
      tontine_paid: { kind: 'tontine', id: 't_bureau', label: 'Tontine du bureau' },
      tontine_late: { kind: 'tontine', id: 't_marche', label: 'Tontine du marché' },
      debt_with: { kind: 'debt', id: 'd_koffi', label: 'Koffi' },
      debt_next_due: { kind: 'debt', id: 'd_bank', label: 'Prêt banque' },
      recurring_amount: { kind: 'recurring', id: 'rec_mum', label: 'Maman' },
      recurring_next: { kind: 'recurring', id: 'rec_rent', label: 'Loyer' },
      asset_value: { kind: 'asset', id: 'as_land', label: 'Terrain Bingerville' },
    };
    for (const topic of QUESTION_TOPICS) {
      const a = answerIntent({ kind: 'question', topic, ref: refs[topic] ?? null, categoryId: 'cat_food', amount: 50_000, period: 'month' }, actx);
      for (const k of [a.key, ...(a.bullets ?? []).map((b) => b.key)]) {
        expect(k in fr, `${topic} → ${k} (fr)`).toBe(true);
        expect(k in en, `${topic} → ${k} (en)`).toBe(true);
      }
    }
  });
});

describe('droits : can() et hasFeature() jamais contournés', () => {
  it('patrimoine : formule avec patrimoine ET droit de lecture des biens', () => {
    expect(topicGate('net_worth', { plan: 'free', role: 'admin', spaceKind: 'personal' })).toMatchObject({ key: 'ai.locked' });
    expect(topicGate('net_worth', { plan: 'plus', role: 'admin', spaceKind: 'personal' })).toMatchObject({ key: 'ai.locked' });
    expect(topicGate('net_worth', { plan: 'family', role: 'admin', spaceKind: 'family' })).toBeNull();
    expect(topicGate('net_worth', { plan: 'family', role: 'child', spaceKind: 'family' })).toMatchObject({ key: 'ia.a.roleLocked' });
  });

  it('un enfant ne lit ni les dettes ni les tontines ; sujets avancés réservés à la formule de l’assistant', () => {
    expect(topicGate('debt_with', { plan: 'family', role: 'child', spaceKind: 'family' })).toMatchObject({ key: 'ia.a.roleLocked' });
    expect(topicGate('tontine_next', { plan: 'family', role: 'child', spaceKind: 'family' })).toMatchObject({ key: 'ia.a.roleLocked' });
    expect(topicGate('why_no_savings', { plan: 'free', role: 'admin', spaceKind: 'personal' })).toMatchObject({ key: 'ai.locked' });
    expect(topicGate('tontine_next', { plan: 'free', role: 'admin', spaceKind: 'personal' })).toBeNull();
    expect(topicGate('available', { plan: 'free', role: 'child', spaceKind: 'family' })).toBeNull();
  });
});
