/** Phase 3 — voix : choix du message, file d'attente, délai, erreurs, repli. */
import { describe, expect, it } from 'vitest';
import { VoiceQueue, cacheKey, type PreparedProvider } from '../src/services/voice/queue';
import { speakable, voiceMessage } from '../src/core/coach/voice';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const has = (k: string) => k in fr;
const ev = (textKey: string, params: Record<string, string | number>, severity: 'critical' | 'warning' | 'celebration' | 'advice' | 'info' = 'warning') => ({ textKey, params, severity });

describe('message vocal', () => {
  it('sans montant par défaut : variante dédiée', () => {
    const e = ev('coach.env.critical', { name: 'Awa', envelope: 'Nourriture', over: 20_000 }, 'critical');
    expect(voiceMessage(e, false, has).key).toBe('coach.env.critical.voice');
    expect(fr['coach.env.critical.voice' as keyof typeof fr]).not.toContain('{over}');
  });
  it('montants autorisés : message complet', () => {
    const e = ev('coach.env.critical', { name: 'Awa', envelope: 'Nourriture', over: 20_000 }, 'critical');
    expect(voiceMessage(e, true, has).key).toBe('coach.env.critical');
  });
  it('message sans montant : lu tel quel', () => {
    expect(voiceMessage(ev('coach.env.reached', { name: 'Awa', envelope: 'X', percent: 100 }), false, has).key).toBe('coach.env.reached');
    expect(voiceMessage(ev('coach.pos.month_respected', { month: '2026-09' }, 'celebration'), false, has).key).toBe('coach.pos.month_respected');
  });
  it('montant sans variante vocale : phrase générique qui renvoie à l’écran', () => {
    expect(voiceMessage(ev('intel.rec.capacity_positive', { amount: 50_000 }, 'advice'), false, has)).toEqual({ key: 'coach.voice.generic.advice', params: {} });
  });
  it('toutes les variantes vocales existent en FR et EN, sans montant', () => {
    const keys = Object.keys(fr).filter((k) => k.startsWith('coach.') && (k.endsWith('.voice') || k.includes('.voice.')));
    expect(keys.length).toBeGreaterThan(8);
    for (const k of keys) {
      expect(en[k as keyof typeof en], k).toBeTypeOf('string');
      expect(fr[k as keyof typeof fr]).not.toMatch(/\{(over|left|amount)\}/);
    }
  });
});

/** Faux fournisseur : enregistre ce qu'il lit, avec un comportement configurable. */
function fake(id: string, o: { available?: boolean; fail?: boolean; prepareMs?: number; speakMs?: number; log: string[] }): PreparedProvider & { stopped: number } {
  const p = {
    id,
    stopped: 0,
    async isAvailable() {
      return o.available ?? true;
    },
    async prepare() {
      if (o.prepareMs) await new Promise((r) => setTimeout(r, o.prepareMs));
      if (o.fail) throw new Error('api');
    },
    async speak(text: string) {
      o.log.push(`${id}:start:${text}`);
      await new Promise((r) => setTimeout(r, o.speakMs ?? 5));
      o.log.push(`${id}:end:${text}`);
    },
    async stop() {
      p.stopped++;
    },
  };
  return p;
}

describe('file d’attente vocale', () => {
  it('jamais deux voix à la fois : lecture séquentielle', async () => {
    const log: string[] = [];
    const q = new VoiceQueue(() => [fake('device', { log, speakMs: 20 })]);
    await Promise.all([q.enqueue('un', { language: 'fr' }), q.enqueue('deux', { language: 'fr' })]);
    expect(log).toEqual(['device:start:un', 'device:end:un', 'device:start:deux', 'device:end:deux']);
  });
  it('erreur API premium → voix de l’appareil', async () => {
    const log: string[] = [];
    const q = new VoiceQueue(() => [fake('premium', { log, fail: true }), fake('device', { log })]);
    expect(await q.enqueue('bonjour', { language: 'fr' })).toEqual({ spoken: true, by: 'device' });
  });
  it('délai dépassé (réseau lent) → repli en moins du délai + lecture appareil', async () => {
    const log: string[] = [];
    const q = new VoiceQueue(() => [fake('premium', { log, prepareMs: 500 }), fake('device', { log })], 50);
    const t0 = Date.now();
    expect(await q.enqueue('vite', { language: 'fr' })).toEqual({ spoken: true, by: 'device' });
    expect(Date.now() - t0).toBeLessThan(400);
    expect(log.some((l) => l.startsWith('premium:start'))).toBe(false);
  });
  it('hors ligne / premium indisponible → appareil ; rien de disponible → texte seul', async () => {
    const log: string[] = [];
    expect(await new VoiceQueue(() => [fake('premium', { log, available: false }), fake('device', { log })]).enqueue('x', { language: 'en' })).toEqual({ spoken: true, by: 'device' });
    expect(await new VoiceQueue(() => [fake('device', { log, available: false })]).enqueue('x', { language: 'en' })).toEqual({ spoken: false, reason: 'unavailable' });
  });
  it('stop() (arrière-plan) : coupe la lecture et vide la file', async () => {
    const log: string[] = [];
    const dev = fake('device', { log, speakMs: 50 });
    const q = new VoiceQueue(() => [dev]);
    const a = q.enqueue('un', { language: 'fr' });
    const b = q.enqueue('deux', { language: 'fr' });
    await new Promise((r) => setTimeout(r, 10));
    await q.stop();
    expect(await a).toEqual({ spoken: false, reason: 'stopped' });
    expect(await b).toEqual({ spoken: false, reason: 'stopped' });
    expect(dev.stopped).toBe(1);
    expect(log).not.toContain('device:start:deux');
    // La file reste utilisable ensuite.
    expect(await q.enqueue('trois', { language: 'fr' })).toEqual({ spoken: true, by: 'device' });
  });
  it('message vide : rien n’est lu', async () => {
    const log: string[] = [];
    expect(await new VoiceQueue(() => [fake('device', { log })]).enqueue('  ', { language: 'fr' })).toEqual({ spoken: false, reason: 'empty' });
    expect(log).toEqual([]);
  });
  it('clé de cache : stable, différente selon texte, voix et langue', () => {
    expect(cacheKey('Bonjour', 'v1', 'fr')).toBe(cacheKey('Bonjour', 'v1', 'fr'));
    expect(new Set([cacheKey('Bonjour', 'v1', 'fr'), cacheKey('Bonjour!', 'v1', 'fr'), cacheKey('Bonjour', 'v2', 'fr'), cacheKey('Bonjour', 'v1', 'en')]).size).toBe(4);
  });
});

describe('texte prononcé (bouton « Écouter »)', () => {
  it('retire les émojis sans toucher au texte', () => {
    expect(speakable('🔴 Budget Maison dépassé de 25 000 FCFA.')).toBe('Budget Maison dépassé de 25 000 FCFA.');
    expect(speakable('Objectif atteint 🏆🎉 !')).toBe('Objectif atteint !');
    expect(speakable('🇨🇮 Côte d’Ivoire')).toBe('Côte d’Ivoire');
  });
  it('assemble les lignes : un point seulement s’il manque une ponctuation', () => {
    expect(speakable(['Votre mois en bref :', 'Revenus : 450 000 FCFA', 'Dépenses : 167 000 FCFA'])).toBe('Votre mois en bref : Revenus : 450 000 FCFA. Dépenses : 167 000 FCFA');
    expect(speakable(['Première phrase.', 'Seconde'])).toBe('Première phrase. Seconde');
  });
  it('ignore les lignes vides et les puces', () => {
    expect(speakable(['', '• Loyer', '  ', '🔔'])).toBe('Loyer');
    expect(speakable('')).toBe('');
  });
});
