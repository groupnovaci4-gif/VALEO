/**
 * Croissance, étape 4 — demande d'avis sur le store : moments, rareté,
 * blocages, mémoire locale, ligne du menu (page du store, réglage distant),
 * textes validés, aucune redirection surprise, voix du coach « occupée ».
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as sr from '../src/core/storeReview';
import { VoiceQueue, type PreparedProvider } from '../src/services/voice/queue';
import { sanitize } from '../src/core/analyticsProps';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14, 12);
const seenState: sr.ReviewState = { firstSeenAt: NOW - 30 * DAY, requests: [], menuUsed: false };
const ctx = (over: Partial<sr.ReviewContext> = {}): sr.ReviewContext => ({
  now: NOW,
  moment: 'goal',
  storeAvailable: true,
  online: true,
  role: 'admin',
  firstSession: false,
  actionFailed: false,
  accountCreatedAt: NOW - 30 * DAY,
  entryDays: 7,
  busy: false,
  ...over,
});
const reason = (d: sr.ReviewDecision) => (d.ask ? 'ask' : d.reason);

describe('règles fixées par le fondateur', () => {
  it('fréquence : 14 jours, 7 jours de saisie, 120 jours, 3 demandes au total', () => {
    expect([sr.REVIEW_MIN_ACCOUNT_DAYS, sr.REVIEW_MIN_ENTRY_DAYS, sr.REVIEW_INTERVAL_DAYS, sr.REVIEW_MAX_REQUESTS]).toEqual([14, 7, 120, 3]);
    expect(sr.REVIEW_DELAY_MS).toBeGreaterThanOrEqual(2000);
  });
  it('les deux moments positifs demandent la fenêtre quand tout est réuni', () => {
    expect(reason(sr.reviewDecision(seenState, ctx({ moment: 'goal' })))).toBe('ask');
    expect(reason(sr.reviewDecision(seenState, ctx({ moment: 'tontine' })))).toBe('ask');
  });
  it('sans moment positif : jamais (ni au lancement, ni en ouvrant l’Accueil)', () => {
    expect(reason(sr.reviewDecision(seenState, ctx({ moment: null })))).toBe('no_moment');
  });
});

describe('blocages', () => {
  it('première session sur ce téléphone, ou date de première ouverture inconnue', () => {
    expect(reason(sr.reviewDecision(seenState, ctx({ firstSession: true })))).toBe('first_session');
    expect(reason(sr.reviewDecision({ ...seenState, firstSeenAt: null }, ctx()))).toBe('first_session');
  });
  it('pendant une saisie / écran occupé : rien, et le moment est gardé pour le prochain retour à l’Accueil', () => {
    const d = sr.reviewDecision(seenState, ctx({ busy: true }));
    expect(reason(d)).toBe('busy');
    expect(sr.keepMoment(d)).toBe(true);
  });
  it('un blocage définitif consomme le moment (aucune relance)', () => {
    for (const over of [{ actionFailed: true }, { online: false }, { storeAvailable: false }, { entryDays: 6 }]) {
      const d = sr.reviewDecision(seenState, ctx(over));
      expect(d.ask).toBe(false);
      expect(sr.keepMoment(d)).toBe(false);
    }
    expect(sr.keepMoment({ ask: true })).toBe(false);
  });
  it('action échouée dans la session, hors ligne, pas de fenêtre native (web, sans Play), compte enfant', () => {
    expect(reason(sr.reviewDecision(seenState, ctx({ actionFailed: true })))).toBe('action_failed');
    expect(reason(sr.reviewDecision(seenState, ctx({ online: false })))).toBe('offline');
    expect(reason(sr.reviewDecision(seenState, ctx({ storeAvailable: false })))).toBe('store_unavailable');
    expect(reason(sr.reviewDecision(seenState, ctx({ role: 'child' })))).toBe('child');
    expect(reason(sr.reviewDecision(seenState, ctx({ role: 'partner' })))).toBe('ask');
  });
  it('compte de moins de 14 jours (borne exacte), date inconnue', () => {
    expect(reason(sr.reviewDecision(seenState, ctx({ accountCreatedAt: NOW - 14 * DAY + 1 })))).toBe('account_too_new');
    expect(reason(sr.reviewDecision(seenState, ctx({ accountCreatedAt: NOW - 14 * DAY })))).toBe('ask');
    expect(reason(sr.reviewDecision(seenState, ctx({ accountCreatedAt: null })))).toBe('account_too_new');
  });
  it('moins de 7 jours de saisie', () => {
    expect(reason(sr.reviewDecision(seenState, ctx({ entryDays: 6 })))).toBe('too_few_entry_days');
  });
  it('120 jours entre deux demandes (borne exacte), 3 au total puis plus jamais', () => {
    const one = sr.withRequest(seenState, NOW - 120 * DAY + 1);
    expect(reason(sr.reviewDecision(one, ctx()))).toBe('too_soon');
    expect(reason(sr.reviewDecision(sr.withRequest(seenState, NOW - 120 * DAY), ctx()))).toBe('ask');
    const three = [NOW - 400 * DAY, NOW - 280 * DAY, NOW - 160 * DAY].reduce(sr.withRequest, seenState);
    expect(reason(sr.reviewDecision(three, ctx({ now: NOW + 1000 * DAY })))).toBe('max_requests');
  });
  it('après un passage par la ligne du menu : plus aucune demande automatique', () => {
    expect(reason(sr.reviewDecision(sr.withMenuUsed(seenState), ctx()))).toBe('menu_used');
  });
  it('un écran occupé ne passe jamais avant une règle de rareté (pas de demande « en attente » injustifiée)', () => {
    expect(reason(sr.reviewDecision(sr.withMenuUsed(seenState), ctx({ busy: true })))).toBe('menu_used');
    expect(reason(sr.reviewDecision(seenState, ctx({ busy: true, entryDays: 1 })))).toBe('too_few_entry_days');
  });
});

describe('mémoire locale', () => {
  it('lecture tolérante : absente, abîmée ou partielle → état sûr', () => {
    expect(sr.parseReviewState(null)).toEqual(sr.EMPTY_REVIEW_STATE);
    expect(sr.parseReviewState('x')).toEqual(sr.EMPTY_REVIEW_STATE);
    expect(sr.parseReviewState({ firstSeenAt: 'hier', requests: [3, 'x', -1, 1], menuUsed: 'oui' })).toEqual({ firstSeenAt: null, requests: [1, 3], menuUsed: false });
    expect(sr.parseReviewState({ firstSeenAt: 5, requests: [], menuUsed: true })).toEqual({ firstSeenAt: 5, requests: [], menuUsed: true });
  });
  it('première ouverture posée une seule fois ; la session qui la pose est la première', () => {
    const a = sr.markSeen(sr.EMPTY_REVIEW_STATE, NOW);
    expect(a).toEqual({ state: { ...sr.EMPTY_REVIEW_STATE, firstSeenAt: NOW }, firstSession: true });
    const b = sr.markSeen(a.state, NOW + DAY);
    expect(b).toEqual({ state: a.state, firstSession: false });
  });
  it('jours de saisie : jours DIFFÉRENTS de saisie, par la personne, opérations supprimées exclues', () => {
    const at = (d: number, h = 9) => new Date(2026, 9, d, h).getTime();
    const txs = [
      { createdAt: at(1), createdBy: 'u' },
      { createdAt: at(1, 20), createdBy: 'u' },
      { createdAt: at(2), createdBy: 'u' },
      { createdAt: at(3), createdBy: 'autre' },
      { createdAt: at(4), createdBy: 'u', deleted: true },
      { createdAt: at(5), createdBy: 'u' },
    ];
    expect(sr.entryDays(txs, 'u')).toBe(3);
    expect(sr.entryDays([], 'u')).toBe(0);
  });
});

describe('ligne du menu « Donner mon avis » : page du store, jamais la fenêtre de Google', () => {
  const on = sr.parseStoreConfig({ reviewMenu: true });
  it('cachée tant que le réglage distant ne l’active pas (absent, faux, mauvais type)', () => {
    for (const raw of [null, {}, { reviewMenu: false }, { reviewMenu: 'true' }, { reviewMenu: 1 }]) {
      expect(sr.storePageUrls('android', 'com.dinerox.app', sr.parseStoreConfig(raw))).toEqual([]);
    }
  });
  it('Android : application Play Store, sinon page web Play ; web : page web Play', () => {
    expect(sr.storePageUrls('android', 'com.dinerox.app', on)).toEqual(['market://details?id=com.dinerox.app', 'https://play.google.com/store/apps/details?id=com.dinerox.app']);
    expect(sr.storePageUrls('web', 'com.dinerox.app', on)).toEqual(['https://play.google.com/store/apps/details?id=com.dinerox.app']);
  });
  it('iPhone : seulement avec une page App Store valide publiée dans le réglage', () => {
    expect(sr.storePageUrls('ios', 'com.dinerox.app', on)).toEqual([]);
    const ios = sr.parseStoreConfig({ reviewMenu: true, appStoreUrl: 'https://apps.apple.com/ci/app/dinerox/id1234567890' });
    expect(sr.storePageUrls('ios', 'com.dinerox.app', ios)).toEqual(['https://apps.apple.com/ci/app/dinerox/id1234567890']);
    for (const bad of ['https://evil.example/app/id1234567890', 'http://apps.apple.com/app/id1234567890', 'itms-apps://x', 42]) {
      expect(sr.parseStoreConfig({ reviewMenu: true, appStoreUrl: bad }).appStoreUrl).toBeNull();
    }
  });
  it('identifiant d’application invalide : aucune adresse fabriquée', () => {
    expect(sr.storePageUrls('android', 'com.dinerox.app&x=1', on)).toEqual([]);
    expect(sr.storePageUrls('android', '', on)).toEqual([]);
  });
});

describe('aucune redirection surprise, aucune donnée transmise', () => {
  it('app.config ne déclare ni playStoreUrl ni appStoreUrl (sinon expo-store-review ouvrirait le store sans fenêtre native)', () => {
    const cfg = readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8');
    expect(cfg).not.toMatch(/playStoreUrl|appStoreUrl/);
  });
  it('dépendance native : expo-store-review ~57.0.3 (version Expo SDK 57)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['expo-store-review']).toBe('~57.0.3');
  });
  it('événement review_requested : le contexte seulement', () => {
    expect(sanitize({ context: 'goal', amount: 5000, name: 'Awa', rated: true })).toEqual({ context: 'goal' });
  });
});

describe('textes validés (docs/textes-etape4.md)', () => {
  it('FR et EN, exacts, avec {app}', () => {
    expect(fr['more.review']).toBe('Donner mon avis sur {app}');
    expect(fr['more.sub.review']).toBe('Votre note et votre commentaire sur le store');
    expect(en['more.review']).toBe('Rate {app}');
    expect(en['more.sub.review']).toBe('Your rating and review on the store');
  });
  it('aucune question qui filtre les gens contents, aucune récompense contre un avis', () => {
    const all = [fr['more.review'], fr['more.sub.review'], en['more.review'], en['more.sub.review']].join(' ');
    expect(all).not.toMatch(/aimez|like|love|\?|offert|gagne|free|reward|récompense|trophée|Plus/i);
  });
});

describe('voix du coach « occupée » (aucune demande pendant qu’elle parle)', () => {
  it('occupée pendant la file et la lecture, libre ensuite', async () => {
    let release: () => void = () => undefined;
    const slow: PreparedProvider = {
      id: 'device',
      isAvailable: async () => true,
      speak: () => new Promise<void>((r) => (release = r)),
      stop: async () => undefined,
    };
    const q = new VoiceQueue(() => [slow]);
    expect(q.busy).toBe(false);
    const done = q.enqueue('Bonjour', { language: 'fr' });
    expect(q.busy).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(q.busy).toBe(true);
    release();
    await done;
    expect(q.busy).toBe(false);
  });
});
