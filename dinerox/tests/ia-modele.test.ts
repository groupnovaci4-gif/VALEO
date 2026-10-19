/**
 * IA — un seul modèle dans toute l'application (docs/ia-comprend-tout.md §0.1, §6, §7) :
 * `claude-haiku-5-5`, réflexion désactivée, aucun `fallbacks`, aucune `temperature`.
 * Tests sur le CORPS des requêtes envoyées au modèle.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_MODEL, buildAssistantRequest } from '../firebase/functions/src/assistant';
import { buildParseRequest } from '../firebase/functions/src/voiceEntry';

const FUNCTIONS_SRC = join(__dirname, '..', 'firebase', 'functions', 'src');
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));

describe('financeAssistant : Haiku, réflexion désactivée, effort low, sans repli serveur', () => {
  const r = buildAssistantRequest('Combien je peux dépenser ?', { country: 'CI', income: 1 }, 'fr') as unknown as Record<string, unknown>;

  it('modèle claude-haiku-5-5', () => {
    expect(ASSISTANT_MODEL).toBe('claude-haiku-5-5');
    expect(r.model).toBe('claude-haiku-5-5');
  });

  it('réflexion désactivée, effort low, max_tokens adapté à 120 mots', () => {
    expect(r.thinking).toEqual({ type: 'disabled' });
    expect(r.output_config).toEqual({ effort: 'low' });
    expect(r.max_tokens).toBeGreaterThanOrEqual(400);
    expect(r.max_tokens).toBeLessThanOrEqual(1000);
  });

  it('aucun fallbacks, aucun en-tête server-side-fallback, aucune temperature', () => {
    expect(r).not.toHaveProperty('fallbacks');
    expect(r).not.toHaveProperty('betas');
    expect(r).not.toHaveProperty('temperature');
    expect(JSON.stringify(r)).not.toContain('server-side-fallback');
  });

  it('texte système dans la langue demandée, pays réel ; question et résumé dans le message', () => {
    expect(String(r.system)).toContain('dans ce pays');
    const en = buildAssistantRequest('How much?', {}, 'en') as unknown as { system: string };
    expect(en.system).toContain('Answer in simple, warm, concrete English');
    expect(JSON.stringify(r.messages)).toContain('Combien je peux dépenser ?');
  });
});

describe('aucun autre modèle dans les Cloud Functions', () => {
  it('seul claude-haiku-5-5 est cité ; jamais fallbacks ni temperature', () => {
    for (const file of sources(FUNCTIONS_SRC)) {
      const text = readFileSync(file, 'utf8');
      const models = text.match(/claude-[a-z]+-[0-9][0-9a-z-]*/g) ?? [];
      for (const m of models) expect(m, file).toBe('claude-haiku-5-5');
      expect(text, file).not.toMatch(/fallbacks\s*:/);
      expect(text, file).not.toMatch(/temperature\s*:/);
      expect(text, file).not.toContain('server-side-fallback');
    }
  });

  it('parseVoiceEntry : déjà sur Haiku, réflexion désactivée', () => {
    const r = buildParseRequest({ transcript: 'x', language: 'fr', today: '2026-10-19', currency: 'XOF', categories: [], accounts: [] });
    expect(r.model).toBe('claude-haiku-5-5');
    expect(r.thinking).toEqual({ type: 'disabled' });
  });
});
