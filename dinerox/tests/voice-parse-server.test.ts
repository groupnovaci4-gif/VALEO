/** 1.9 — Cloud Function `parseVoiceEntry` : entrée minimale et sortie contrôlée (logique pure). */
import { describe, expect, it } from 'vitest';
import { LINES_SCHEMA, buildUserMessage, sanitizeLines, validateParseInput, type ParseInput } from '../firebase/functions/src/voiceEntry';
import { validateAiOutput } from '../src/core/entry/aiGuard';

const input: ParseInput = {
  transcript: '30 000 au marché',
  language: 'fr',
  today: '2026-10-07',
  currency: 'XOF',
  categories: [{ id: 'cat_food', label: 'Alimentation', kind: 'expense', parentId: null }, { id: 'sub_food_market', label: 'Marché', kind: 'expense', parentId: 'cat_food' }],
  accounts: ['Wave'],
};

describe('parseVoiceEntry : entrée', () => {
  it('transcription obligatoire et bornée ; champs inconnus jamais transmis', () => {
    expect(validateParseInput({ ...input, transcript: ' ' })).toEqual({ error: 'transcript/invalid' });
    expect(validateParseInput({ ...input, transcript: 'x'.repeat(2001) })).toEqual({ error: 'transcript/invalid' });
    expect(validateParseInput({ ...input, today: 'hier' })).toEqual({ error: 'today/invalid' });
    expect(validateParseInput({ ...input, accounts: [{ name: 'Wave', balance: 5 }] })).toEqual({ error: 'accounts/invalid' });
    const ok = validateParseInput({ ...input, balances: [1, 2], history: ['x'], profile: { firstName: 'Konan' } });
    expect(ok).toEqual(input);
  });
  it('message au modèle : ni solde, ni historique, ni profil', () => {
    const m = buildUserMessage(input);
    expect(m).toContain('30 000 au marché');
    expect(m).toContain('sub_food_market|expense|cat_food|Marché');
    expect(m).not.toMatch(/solde|balance|Konan/i);
  });
});

describe('parseVoiceEntry : sortie', () => {
  const good = { type: 'expense', amount: 30000, currencyFromSpace: true, categoryId: 'cat_food', subcategoryId: 'sub_food_market', accountName: null, date: null, sourceText: '30 000 au marché', confidence: 0.9, question: null };
  it('identifiants hors de la liste envoyée → retirés (jamais inventés)', () => {
    const out = sanitizeLines({ lines: [{ ...good, categoryId: 'cat_invente' }] }, input) as { categoryId: string | null }[];
    expect(out[0].categoryId).toBeNull();
  });
  it('sortie non conforme → null', () => {
    expect(sanitizeLines({ lines: [{ ...good, type: 'vol' }] }, input)).toBeNull();
    expect(sanitizeLines({ nope: 1 }, input)).toBeNull();
    expect(sanitizeLines({ lines: [{ ...good, amount: -1 }] }, input)).toBeNull();
  });
  it('le serveur et l’application acceptent la même forme', () => {
    const out = sanitizeLines({ lines: [good] }, input);
    expect(validateAiOutput({ lines: out })).toHaveLength(1);
    expect(LINES_SCHEMA.properties.lines.items.required).toEqual(expect.arrayContaining(['type', 'amount', 'categoryId', 'sourceText', 'confidence']));
  });
});
