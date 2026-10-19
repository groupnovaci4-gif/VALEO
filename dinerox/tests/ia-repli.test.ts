/**
 * IA — repli Haiku pour une phrase non comprise sur le téléphone (docs/ia-comprend-tout.md §1.2,
 * §5, §6, §7) : la phrase (300 caractères au plus) et la langue SEULEMENT, schéma fermé, Haiku sans
 * réflexion ; la réponse est validée et rapprochée des données SUR LE TÉLÉPHONE.
 */
import { describe, expect, it } from 'vitest';
import { UNDERSTAND_ACTIONS, UNDERSTAND_REASONS, UNDERSTAND_SECTIONS, UNDERSTAND_TOPICS, buildUnderstandRequest, sanitizeUnderstanding, validateUnderstandInput } from '../firebase/functions/src/understand';
import { ACTION_KINDS, FORBIDDEN_REASONS, QUESTION_TOPICS, intentContext } from '../src/core/ai/intent';
import { SECTIONS } from '../src/core/ai/sections';
import { remoteIntent } from '../src/core/ai/remote';
import { iaData, TODAY } from './fixtures/ia-data';

const ctx = intentContext(iaData(), { today: TODAY, currency: 'XOF' });

describe('requête au modèle : la phrase et la langue seulement', () => {
  it('entrée bornée (300 caractères), champs en trop jamais transmis', () => {
    expect(validateUnderstandInput({ text: ' ', language: 'fr', door: 'entry' })).toEqual({ error: 'text/invalid' });
    expect(validateUnderstandInput({ text: 'x'.repeat(301), language: 'fr', door: 'entry' })).toEqual({ error: 'text/invalid' });
    expect(validateUnderstandInput({ text: 'Aide-moi', language: 'fr', door: 'porte' })).toEqual({ error: 'door/invalid' });
    expect(validateUnderstandInput({ text: 'Aide-moi', language: 'xx', door: 'assistant', balances: [1], tontines: ['bureau'], spaceId: 'fam_1' })).toEqual({ text: 'Aide-moi', language: 'fr', door: 'assistant', spaceId: 'fam_1' });
  });

  it('corps : Haiku, réflexion désactivée, schéma fermé, aucun repli serveur ni température ; message = { text, language }', () => {
    const r = buildUnderstandRequest({ text: 'Le truc de la semaine passée là', language: 'fr', door: 'entry' }) as unknown as Record<string, unknown>;
    expect(r.model).toBe('claude-haiku-5-5');
    expect(r.thinking).toEqual({ type: 'disabled' });
    expect(r).not.toHaveProperty('temperature');
    expect(r).not.toHaveProperty('fallbacks');
    expect((r.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    const messages = r.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0].content)).toEqual({ text: 'Le truc de la semaine passée là', language: 'fr' });
  });

  it('texte système fixe (mis en cache), sans aucune donnée de la personne', () => {
    const a = JSON.stringify(buildUnderstandRequest({ text: 'a', language: 'fr', door: 'entry' }).system);
    const b = JSON.stringify(buildUnderstandRequest({ text: 'b', language: 'en', door: 'assistant' }).system);
    expect(a).toBe(b);
    expect(a).toContain('ephemeral');
    expect(a).not.toMatch(/Koffi|bureau|Ma moto|Orange Money : \d/);
  });

  it('listes fermées : identiques sur le serveur et sur le téléphone', () => {
    expect([...UNDERSTAND_TOPICS]).toEqual([...QUESTION_TOPICS]);
    expect([...UNDERSTAND_ACTIONS]).toEqual([...ACTION_KINDS]);
    expect([...UNDERSTAND_REASONS]).toEqual([...FORBIDDEN_REASONS]);
    expect([...UNDERSTAND_SECTIONS]).toEqual(SECTIONS.map((s) => s.id));
  });
});

describe('réponse du modèle : validée et nettoyée', () => {
  it('hors schéma ou hors liste → null (le téléphone dit « Je n’ai pas compris »)', () => {
    expect(sanitizeUnderstanding({ kind: 'question', topic: 'pirater', words: {} })).toBeNull();
    expect(sanitizeUnderstanding({ kind: 'supprimer' })).toBeNull();
    expect(sanitizeUnderstanding('n’importe quoi')).toBeNull();
  });

  it('les mots renvoyés tels quels (« bureau ») sont rapprochés des données SUR LE TÉLÉPHONE', () => {
    const raw = sanitizeUnderstanding({ kind: 'question', topic: 'tontine_next', words: { target: 'bureau' } });
    expect(remoteIntent(raw, 'C’est quand déjà le truc du bureau là', ctx)).toMatchObject({ kind: 'question', topic: 'tontine_next', ref: { id: 't_bureau' } });
  });

  it('un montant que la personne n’a pas prononcé n’est jamais repris', () => {
    const raw = sanitizeUnderstanding({ kind: 'action', action: 'goal_contribute', amount: 90000, words: { target: 'moto' } });
    const i = remoteIntent(raw, 'pour la moto là, ajoute un peu', ctx);
    expect(i.kind === 'action' || i.kind === 'ask').toBe(true);
    const inner = i.kind === 'ask' ? i.intent : i;
    expect(inner).toMatchObject({ action: 'goal_contribute', amount: null, ref: { id: 'g_moto' } });
  });

  it('écran, interdit : seulement les valeurs de la liste', () => {
    expect(remoteIntent(sanitizeUnderstanding({ kind: 'open', section: 'tontines' }), 'x', ctx)).toEqual({ kind: 'open', section: 'tontines' });
    expect(remoteIntent(sanitizeUnderstanding({ kind: 'forbidden', reason: 'export' }), 'x', ctx)).toMatchObject({ kind: 'forbidden', reason: 'export' });
    expect(remoteIntent(null, 'x', ctx)).toEqual({ kind: 'unknown' });
  });
});
