/** Lot A, phase 5 — mesure d'usage : agrégats sans contenu, part des méthodes, taux de correction vocale. */
import { describe, expect, it } from 'vitest';
import { entryUsage } from '../firebase/functions/src/usage';
import { sanitize } from '../src/core/analyticsProps';

const base = {
  voiceCorrected: 0,
  voiceFailed: 0,
  reminderOpened: 0,
  micRouted: { entry: 0, assistant: 0, ambiguous: 0 },
  historyOpened: { home: 0, toast: 0, more: 0, account: 0, envelope: 0 },
};

describe('usage de la saisie', () => {
  it('part de chaque méthode et taux de correction vocale', () => {
    const u = entryUsage({ ...base, created: { voice: 20, text_phrase: 10, quick_manual: 60, full_form: 10 }, voiceCorrected: 5 });
    expect(u.total).toBe(100);
    expect(u.shares).toEqual({ voice: 20, text_phrase: 10, quick_manual: 60, full_form: 10 });
    expect(u.voiceCorrectionRate).toBe(25);
  });
  it('sans saisie : parts nulles, taux inconnu (jamais de division par zéro)', () => {
    const u = entryUsage({ ...base, created: { voice: 0, text_phrase: 0, quick_manual: 0, full_form: 0 } });
    expect(u.shares.voice).toBe(0);
    expect(u.voiceCorrectionRate).toBeNull();
  });
  it('événements : seules les propriétés autorisées partent, jamais montant, texte, bénéficiaire ni catégorie', () => {
    expect(sanitize({ method: 'voice', count: 3, amount: 2000, text: 'taxi 2000', payee: 'maman', categoryId: 'cat_food', to: 'entry', reason: 'network', source: 'toast' })).toEqual({
      method: 'voice',
      count: 3,
      to: 'entry',
      reason: 'network',
      source: 'toast',
    });
  });
});
