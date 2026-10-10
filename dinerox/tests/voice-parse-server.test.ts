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

describe('parseVoiceEntry : quotas par formule (validés le 2026-10-10)', () => {
  it('free 3, plus 20, family 20 par membre ; nouveau jour = compteur remis à zéro', async () => {
    const { VOICE_PARSE_DAILY_LIMIT, nextVoiceParseUsage, bestPlan } = await import('../firebase/functions/src/plans');
    const { AI_VOICE_PARSE_PER_DAY } = await import('../src/core/subscription');
    expect(VOICE_PARSE_DAILY_LIMIT).toEqual({ free: 3, plus: 20, family: 20 });
    expect(AI_VOICE_PARSE_PER_DAY).toEqual(VOICE_PARSE_DAILY_LIMIT); // miroir application ↔ serveur
    const day = '2026-10-10';
    expect(nextVoiceParseUsage({ day, count: 2 }, day, 'free')).toEqual({ allowed: true, patch: { voiceParseDay: day, voiceParse: 3 } });
    expect(nextVoiceParseUsage({ day, count: 3 }, day, 'free').allowed).toBe(false);
    expect(nextVoiceParseUsage({ day, count: 19 }, day, 'plus').allowed).toBe(true);
    expect(nextVoiceParseUsage({ day, count: 20 }, day, 'family').allowed).toBe(false);
    expect(nextVoiceParseUsage({ day: '2026-10-09', count: 3 }, day, 'free')).toEqual({ allowed: true, patch: { voiceParseDay: day, voiceParse: 1 } });
    // Membre gratuit d'un espace Famille : quota Famille.
    expect(bestPlan('free', 'family')).toBe('family');
    expect(bestPlan('plus', 'free')).toBe('plus');
  });
});

describe('parseVoiceEntry : seul un appel réussi compte', () => {
  it('échec ou délai dépassé : l’essai réservé est rendu', async () => {
    const { nextVoiceParseUsage, refundVoiceParseUsage } = await import('../firebase/functions/src/plans');
    const day = '2026-10-10';
    // Gratuit : 3 essais. Réservation du 3e, puis échec du modèle → rendu.
    const reserved = nextVoiceParseUsage({ day, count: 2 }, day, 'free');
    expect(reserved.patch.voiceParse).toBe(3);
    const refunded = refundVoiceParseUsage({ day, count: reserved.patch.voiceParse }, day);
    expect(refunded).toEqual({ voiceParseDay: day, voiceParse: 2 });
    // Le 3e essai reste donc disponible.
    expect(nextVoiceParseUsage({ day, count: refunded!.voiceParse }, day, 'free').allowed).toBe(true);
    // Rien à rendre : compteur à zéro, ou jour changé entre la réservation et l'échec.
    expect(refundVoiceParseUsage({ day, count: 0 }, day)).toBeNull();
    expect(refundVoiceParseUsage({ day: '2026-10-09', count: 3 }, day)).toBeNull();
  });
});

describe('parseVoiceEntry : réflexion désactivée, plafond anti-abus, consentement 1.9', () => {
  it('requête au modèle : Haiku 5.5, réflexion désactivée, sortie structurée', async () => {
    const { buildParseRequest, VOICE_PARSE_MODEL } = await import('../firebase/functions/src/voiceEntry');
    const r = buildParseRequest(input);
    expect(VOICE_PARSE_MODEL).toBe('claude-haiku-5-5');
    expect(r.model).toBe('claude-haiku-5-5');
    expect(r.thinking).toEqual({ type: 'disabled' });
    expect(r.output_config?.format?.type).toBe('json_schema');
  });
  it('50 tentatives par jour, échecs compris (jamais rendues), en plus du quota', async () => {
    const { nextVoiceParseAttempt, VOICE_PARSE_DAILY_ATTEMPTS, refundVoiceParseUsage } = await import('../firebase/functions/src/plans');
    const day = '2026-10-10';
    expect(VOICE_PARSE_DAILY_ATTEMPTS).toBe(50);
    expect(nextVoiceParseAttempt({}, day)).toEqual({ allowed: true, patch: { voiceParseTriesDay: day, voiceParseTries: 1 } });
    expect(nextVoiceParseAttempt({ day, tries: 49 }, day).allowed).toBe(true);
    expect(nextVoiceParseAttempt({ day, tries: 50 }, day).allowed).toBe(false);
    expect(nextVoiceParseAttempt({ day: '2026-10-09', tries: 50 }, day).allowed).toBe(true);
    // Un échec rend l'essai du QUOTA, jamais la tentative : 50 échecs de suite épuisent le plafond.
    let tries = 0;
    let quota = 0;
    for (let i = 0; i < 60; i++) {
      const a = nextVoiceParseAttempt({ day, tries }, day);
      if (!a.allowed) break;
      tries = a.patch.voiceParseTries;
      quota += 1;
      quota = refundVoiceParseUsage({ day, count: quota }, day)?.voiceParse ?? 0; // échec du modèle
    }
    expect(tries).toBe(50);
    expect(quota).toBe(0);
  });
  it('version du consentement : identique côté serveur et application', async () => {
    const server = await import('../firebase/functions/src/voiceEntry');
    const app = await import('../src/core/aiConsent');
    expect(server.AI_CONSENT_VERSION).toBe(app.AI_CONSENT_VERSION);
  });
});
