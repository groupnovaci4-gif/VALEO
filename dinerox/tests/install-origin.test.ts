/**
 * Croissance, étape 5 — origine des installations : logique PURE de
 * l'application (src/core/installOrigin.ts) et du serveur
 * (firebase/functions/src/installOrigin.ts), parité, regroupement sous 5
 * (aucun petit groupe ne sort du serveur), liens `/a` et `/t/{code}`, textes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as app from '../src/core/installOrigin';
import * as server from '../firebase/functions/src/installOrigin';
import { renderPage, routeLink } from '../firebase/functions/src/links';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import { LEGAL } from '../src/content/legal';
import { renderPage as renderLinkPage } from '../firebase/functions/src/links';

const get = (o: Record<string, string>) => (k: string) => o[k] ?? null;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14)';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)';
const DESKTOP = 'Mozilla/5.0 (Macintosh)';

describe('origine nettoyée (application et serveur identiques)', () => {
  const cases: unknown[] = [
    { src: 'whatsapp', cmp: 'lancement', cnt: 'video1' },
    { src: 'WhatsApp', cmp: 'Lancement' },
    { src: 'inconnu' },
    { src: 'Bad Value', cmp: 'x' },
    { cmp: 'sans-source', cnt: 'x' },
    { src: 'facebook', cmp: 'Bad Value', cnt: 'video' },
    { invited: true },
    { invited: 'true', src: 'qr' },
    { src: 'a'.repeat(41) },
    null,
    {},
  ];
  it('mêmes sources, seuil, délai et résultats des deux côtés', () => {
    expect(app.ORIGIN_SOURCES).toEqual(server.ORIGIN_SOURCES);
    expect([app.ORIGIN_MIN_GROUP, app.ORIGIN_WINDOW_DAYS, app.ORIGIN_KEY_SEP]).toEqual([server.ORIGIN_MIN_GROUP, server.ORIGIN_WINDOW_DAYS, server.ORIGIN_KEY_SEP]);
    for (const c of cases) expect(app.cleanOrigin(c as never)).toEqual(server.cleanOrigin(c as never));
  });
  it('liste validée : 17 sources, `other` pour tout le reste ; campagne et contenu seulement avec une source', () => {
    expect(app.ORIGIN_SOURCES).toHaveLength(17);
    expect(app.cleanOrigin({ src: 'WhatsApp', cmp: 'Lancement', cnt: 'Video1' })).toEqual({ src: 'whatsapp', cmp: 'lancement', cnt: 'video1' });
    expect(app.cleanOrigin({ src: 'snapchat', cmp: 'x' })).toEqual({ src: 'other', cmp: 'x' });
    expect(app.cleanOrigin({ cmp: 'x', cnt: 'y' })).toEqual({});
    expect(app.cleanOrigin({ src: 'facebook', cmp: 'Bad Value', cnt: 'video' })).toEqual({ src: 'facebook' });
    expect(app.cleanOrigin({ invited: 'true' })).toEqual({});
  });
});

describe('origine lue sur les liens et dans le referrer Google Play', () => {
  it('lien d’invitation : « venue d’un lien d’invitation », jamais le code', () => {
    const o = app.originFromLink({ code: 'ABC234', src: 'whatsapp' });
    expect(o).toEqual({ src: 'whatsapp', invited: true });
    expect(JSON.stringify(o)).not.toContain('ABC234');
  });
  it('lien de campagne sans code', () => {
    expect(app.originFromLink({ src: 'facebook', cmp: 'lancement', cnt: 'video1' })).toEqual({ src: 'facebook', cmp: 'lancement', cnt: 'video1' });
    expect(app.hasOrigin(app.originFromLink({}))).toBe(false);
  });
  it('referrer Play : lien DineroX, recherche organique, autre → rien', () => {
    expect(app.originFromReferrer('ref=ABC234&src=whatsapp&cmp=test')).toEqual({ src: 'whatsapp', cmp: 'test', invited: true });
    expect(app.originFromReferrer('src=tiktok')).toEqual({ src: 'tiktok' });
    expect(app.originFromReferrer('utm_source=google-play&utm_medium=organic')).toEqual({ src: 'play_store' });
    expect(app.originFromReferrer('utm_source=google&utm_medium=cpc')).toEqual({});
    expect(app.originFromReferrer('')).toEqual({});
    expect(app.originFromReferrer(42)).toEqual({});
    expect(app.originFromReferrer('x'.repeat(1001))).toEqual({});
  });
});

describe('compteurs (serveur) : une inscription = +1, plafond de clés', () => {
  it('source, campagne, contenu ; lien d’invitation ; origine inconnue', () => {
    expect(server.originIncrements({ src: 'facebook', cmp: 'lancement', cnt: 'video1' }, {})).toEqual({ total: 1, src: { facebook: 1 }, cmp: { 'facebook~lancement': 1 }, cnt: { 'facebook~lancement~video1': 1 } });
    expect(server.originIncrements({ invited: true }, {})).toEqual({ total: 1, invited: 1 });
    expect(server.originIncrements({ src: 'whatsapp', invited: true }, {})).toEqual({ total: 1, invited: 1, src: { whatsapp: 1 } });
    expect(server.originIncrements({}, {})).toEqual({ total: 1, unknown: 1 });
  });
  it('au-delà de 100 campagnes différentes le même jour : seule la source est comptée (clé déjà connue : comptée)', () => {
    const full = { cmp: Object.fromEntries(Array.from({ length: server.ORIGIN_MAX_KEYS }, (_, i) => [`facebook~c${i}`, 1])) };
    expect(server.originIncrements({ src: 'facebook', cmp: 'nouvelle' }, full)).toEqual({ total: 1, src: { facebook: 1 } });
    expect(server.originIncrements({ src: 'facebook', cmp: 'c3' }, full)).toEqual({ total: 1, src: { facebook: 1 }, cmp: { 'facebook~c3': 1 } });
  });
  it('jour UTC (= Abidjan)', () => {
    expect(server.originDay(Date.UTC(2026, 9, 14, 23, 59))).toBe('2026-10-14');
  });
});

describe('regroupement : jamais un groupe de moins de 5, ni son nombre, ni son nom', () => {
  const days: { id: string; data: server.DayCounters }[] = [
    { id: '2026-10-01', data: { total: 9, invited: 3, unknown: 2, src: { whatsapp: 6, tiktok: 1 }, cmp: { 'whatsapp~lancement': 5, 'whatsapp~awa': 1 }, cnt: { 'whatsapp~lancement~video1': 2 } } },
    { id: '2026-10-14', data: { total: 4, invited: 2, src: { facebook: 3, tiktok: 1 } } },
    { id: '2026-09-20', data: { total: 7, unknown: 7, src: {} } },
    { id: '2026-06-01', data: { total: 2, src: { radio: 2 } } },
    { id: 'meta', data: { total: 99 } },
  ];
  const s = server.aggregateOrigins(days, '2026-10-14');
  it('périodes : ce mois-ci, mois dernier, 90 jours, depuis le début ; premier jour compté', () => {
    expect(s.since).toBe('2026-06-01');
    expect([s.periods.month.total, s.periods.previous.total, s.periods['90d'].total, s.periods.all.total]).toEqual([13, 7, 20, 22]);
    expect(server.inOriginPeriod('2026-07-17', '90d', '2026-10-14')).toBe(true);
    expect(server.inOriginPeriod('2026-07-16', '90d', '2026-10-14')).toBe(false);
    expect(server.inOriginPeriod('2026-12-31', 'previous', '2027-01-05')).toBe(true);
  });
  it('ce mois-ci : WhatsApp 6 montré ; Facebook 3 + TikTok 2 réunis (5) sans nom', () => {
    const m = s.periods.month;
    expect(m.bySource).toEqual([{ key: 'whatsapp', count: 6 }]);
    expect(m.others.source).toBe(5);
    expect(m.byCampaign).toEqual([{ key: 'whatsapp~lancement', count: 5 }]);
    expect(m.others.campaign).toBe('few'); // 1 seule inscription réunie : « Moins de 5 », jamais le nombre
    expect(m.byContent).toEqual([]);
    expect(m.invited).toBe(5);
    expect(m.unknown).toBeNull();
    const out = JSON.stringify(s);
    for (const hidden of ['tiktok', 'facebook', 'awa', 'video1', 'radio']) expect(out).not.toContain(hidden);
  });
  it('mois dernier : 7 origines inconnues montrées', () => {
    expect(s.periods.previous.unknown).toBe(7);
    expect(s.periods.previous.bySource).toEqual([]);
  });
  it('identifiants de jour invalides ignorés (aucun document « meta » compté)', () => {
    expect(s.periods.all.total).toBe(22);
  });
});

describe('liens de campagne (écran admin)', () => {
  it('lien Play (referrer encodé une fois) et lien dinerox.app/a', () => {
    const l = app.campaignLinks({ host: 'dinerox.app', androidPackage: 'com.dinerox.app', src: 'facebook', cmp: 'Lancement', cnt: 'video1' });
    expect(l).toEqual({
      play: 'https://play.google.com/store/apps/details?id=com.dinerox.app&referrer=src%3Dfacebook%26cmp%3Dlancement%26cnt%3Dvideo1',
      domain: 'https://dinerox.app/a?src=facebook&cmp=lancement&cnt=video1',
    });
    expect(app.originFromReferrer(decodeURIComponent(l!.play.split('referrer=')[1]))).toEqual({ src: 'facebook', cmp: 'lancement', cnt: 'video1' });
  });
  it('saisie invalide : aucun lien ; contenu sans campagne ignoré', () => {
    expect(app.campaignLinks({ host: 'dinerox.app', androidPackage: 'com.dinerox.app', src: 'facebook', cmp: 'tante Awa' })).toBeNull();
    expect(app.isValidTagInput('')).toBe(true);
    expect(app.isValidTagInput('été')).toBe(false);
    expect(app.campaignLinks({ host: 'dinerox.app', androidPackage: 'com.dinerox.app', src: 'qr', cnt: 'x' })?.domain).toBe('https://dinerox.app/a?src=qr');
  });
});

describe('page de redirection : /a et /t/{code}', () => {
  it('/a : Android → Play avec src/cmp/cnt ; ordinateur → page sans code ; iPhone → « Bientôt sur iPhone »', () => {
    const a = routeLink({ path: '/a', get: get({ src: 'facebook', cmp: 'lancement', ref: 'ABC234' }), userAgent: ANDROID, origin: 'https://dinerox.app' });
    expect(a).toEqual({ kind: 'redirect', url: 'https://play.google.com/store/apps/details?id=com.dinerox.app&referrer=src%3Dfacebook%26cmp%3Dlancement' });
    const d = routeLink({ path: '/a/', get: get({ src: 'qr' }), userAgent: DESKTOP, origin: 'https://dinerox.app' });
    expect(d.kind === 'page' && d.variant === 'app' && d.shareUrl).toBe('https://dinerox.app/a?src=qr');
    const html = renderPage(d as Extract<typeof d, { kind: 'page' }>, 'fr', '<svg/>');
    expect(html).toContain('Télécharger DineroX');
    expect(html).not.toContain('Votre code d’invitation');
    const i = routeLink({ path: '/a', get: get({}), userAgent: IPHONE, origin: 'https://dinerox.app' });
    const ios = renderPage(i as Extract<typeof i, { kind: 'page' }>, 'en');
    expect(ios).toContain('Coming soon on iPhone');
    expect(ios).not.toMatch(/Keep your code|invitation code/);
  });
  it('/t/{code} : le code de tontine n’entre JAMAIS dans le referrer ; code invalide → introuvable', () => {
    const t = routeLink({ path: '/t/ABC234', get: get({ src: 'whatsapp' }), userAgent: ANDROID, origin: 'https://dinerox.app' });
    expect(t).toEqual({ kind: 'redirect', url: 'https://play.google.com/store/apps/details?id=com.dinerox.app&referrer=src%3Dwhatsapp' });
    expect(JSON.stringify(t)).not.toContain('ABC234');
    expect(routeLink({ path: '/t/ABC0O1', get: get({}), userAgent: ANDROID, origin: 'https://dinerox.app' }).kind).toBe('not_found');
    expect(routeLink({ path: '/i/ABC234', get: get({}), userAgent: ANDROID, origin: 'https://dinerox.app' }).kind).toBe('redirect');
  });
  it('Hosting et Android : /i/, /t/ et /a renvoyés vers la fonction et l’application', () => {
    const fb = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')) as { hosting: { target: string; rewrites: { source: string; function?: { functionId: string } }[] }[] };
    const links = fb.hosting.find((h) => h.target === 'links')!;
    expect(links.rewrites.map((r) => [r.source, r.function?.functionId])).toEqual([
      ['/i/**', 'link'],
      ['/t/**', 'link'],
      ['/a', 'link'],
    ]);
    const cfg = readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8');
    expect(cfg).toContain("pathPrefix: '/t/'");
    expect(cfg).toContain("path: '/a'");
  });
});

describe('textes validés (docs/textes-etape5.md)', () => {
  it('45 textes admin, FR et EN identiques au document', () => {
    const doc = readFileSync(new URL('../docs/textes-etape5.md', import.meta.url), 'utf8');
    const rows = [...doc.matchAll(/^- `(admin\.origin\.[a-zA-Z0-9_.]+)` — FR : « (.*?) » — EN : « (.*?) »/gm)];
    expect(rows).toHaveLength(45);
    for (const [, key, f, e] of rows) {
      expect((fr as Record<string, string>)[key]).toBe(f);
      expect((en as Record<string, string>)[key]).toBe(e);
    }
    for (const s of app.ORIGIN_SOURCES) expect((fr as Record<string, string>)[`admin.origin.src.${s}`]).toBeTruthy();
  });
});

describe('politique de confidentialité et page /a : textes validés mot pour mot (docs/textes-etape5.md)', () => {
  const doc = readFileSync(new URL('../docs/textes-etape5.md', import.meta.url), 'utf8');
  const part = doc.split('## Politique de confidentialité')[1];
  const one = (re: RegExp) => (re.exec(part) as RegExpExecArray)[1];
  const all = (re: RegExp) => [...part.matchAll(re)];
  const sections = (lang: 'fr' | 'en') => LEGAL.privacy[lang].sections;
  it('français : « Statistiques » complétée, puis les deux nouvelles sections', () => {
    const titles = all(/^\s*- Titre — FR : « (.*?) » — EN : « (.*?) »$/gm);
    const bodies = all(/^\s*- FR : « (.*) »$/gm);
    const fr = sections('fr');
    const i = fr.findIndex((s) => s.title === 'Statistiques');
    expect(fr[i].body).toBe(one(/^\s*- FR proposé : « (.*) »$/m));
    expect(fr.slice(i + 1, i + 3)).toEqual([
      { title: titles[0][1], body: bodies[0][1] },
      { title: titles[1][1], body: bodies[1][1] },
    ]);
  });
  it('anglais : nouvelle section « Statistics », puis les deux nouvelles sections', () => {
    const titles = all(/^\s*- Titre — FR : « (.*?) » — EN : « (.*?) »$/gm);
    const bodies = all(/^\s*- EN : « (.*) »$/gm);
    const en = sections('en');
    const i = en.findIndex((s) => s.title === 'Statistics');
    expect(en[i].body).toBe(one(/Proposé — titre « Statistics » : « (.*) »$/m));
    expect(en.slice(i + 1, i + 3)).toEqual([
      { title: titles[0][2], body: bodies[0][1] },
      { title: titles[1][2], body: bodies[1][1] },
    ]);
  });
  it('page /a : phrase validée (FR et EN), sans « hors connexion »', () => {
    const lead = /^- `link\.app\.lead` — .*FR : « (.*?) » — EN : « (.*?) »$/m.exec(doc) as RegExpExecArray;
    const route = routeLink({ path: '/a', get: () => null, userAgent: DESKTOP, origin: 'https://dinerox.app' }) as Extract<ReturnType<typeof routeLink>, { kind: 'page' }>;
    // Page HTML : l'apostrophe est échappée (&#39;), le texte est celui du document.
    expect(renderLinkPage(route, 'fr')).toContain(lead[1].replace('{app}', 'DineroX').replace(/'/g, '&#39;'));
    expect(renderLinkPage(route, 'en')).toContain(lead[2].replace('{app}', 'DineroX'));
    expect(renderLinkPage(route, 'fr')).not.toContain('hors connexion');
  });
});
