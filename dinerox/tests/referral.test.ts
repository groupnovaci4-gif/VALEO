/**
 * Croissance, étape 1 — parrainage : logique PURE du serveur
 * (firebase/functions/src/referral.ts, links.ts) et de l'application
 * (src/core/referral.ts), parité entre les deux, formule effective.
 */
import { describe, expect, it } from 'vitest';
import * as server from '../firebase/functions/src/referral';
import * as client from '../src/core/referral';
import { LINK_BRAND, detectPlatform, playStoreUrl, renderPage, routeLink } from '../firebase/functions/src/links';
import { effectivePlan as serverPlan } from '../firebase/functions/src/plans';
import { effectivePlan as clientPlan } from '../src/core/subscription';
import { brand } from '../src/config/brand';
import { sanitize } from '../src/core/analyticsProps';

const H = 3600 * 1000;
const D = 24 * H;
const TZ = 'Africa/Abidjan';
const UID = 'filleul';
// Inscription le 1er octobre 2026 à 8 h (Abidjan = UTC).
const SIGNUP = Date.UTC(2026, 9, 1, 8, 0, 0);
const at = (day: number, hour = 10, minute = 0) => SIGNUP + day * D + (hour - 8) * H + minute * 60 * 1000;

let seq = 0;
const op = (day: number, type: 'expense' | 'income' | 'transfer' | 'adjustment', over: Partial<server.ActivityOp> = {}): server.ActivityOp => {
  const createdAt = over.createdAt ?? at(day, 10, seq % 50);
  seq++;
  return { id: `tx${seq}`, type, amount: 1000 + seq, categoryId: type === 'expense' ? 'cat_food' : null, createdAt, updatedAt: createdAt, createdBy: UID, ...over };
};
const goal = (day: number, over: Partial<server.ActivityGoal> = {}): server.ActivityGoal => {
  const createdAt = at(day, 9);
  seq++;
  return { id: `g${seq}`, createdAt, updatedAt: createdAt, createdBy: UID, ...over };
};

/** Semaine type : 5 jours actifs (0 à 4), 5 dépenses, 1 revenu, 2 objectifs. */
function regularWeek() {
  return {
    ops: [op(0, 'expense'), op(1, 'expense'), op(1, 'income'), op(2, 'expense'), op(3, 'expense'), op(4, 'expense')],
    goals: [goal(0), goal(2)],
  };
}
const evaluate = (a: { ops: server.ActivityOp[]; goals: server.ActivityGoal[] }, now = at(6, 20)) => server.evaluateWeek({ ...a, uid: UID, signupAt: SIGNUP, now, timeZone: TZ });

describe('codes de parrainage', () => {
  it('6 caractères lisibles, jamais 0/O, 1/I/L', () => {
    expect(server.REFERRAL.CODE_ALPHABET).not.toMatch(/[0O1IL]/);
    let i = 0;
    const seqRand = () => ((i++ * 0.6180339887) % 1);
    for (let n = 0; n < 2000; n++) {
      const c = server.generateCode(seqRand);
      expect(c).toHaveLength(6);
      expect(server.isValidCode(c)).toBe(true);
    }
  });
  it('codes tirés au hasard : pratiquement uniques (887 millions de combinaisons)', () => {
    expect(server.REFERRAL.CODE_ALPHABET.length ** server.REFERRAL.CODE_LENGTH).toBeGreaterThan(800_000_000);
    const seen = new Set<string>();
    for (let n = 0; n < 5000; n++) seen.add(server.generateCode(Math.random));
    expect(seen.size).toBeGreaterThan(4990);
  });
  it('saisie tolérante (minuscules, espaces, tirets), caractère ambigu refusé', () => {
    expect(client.normalizeCode(' abc-234 ')).toBe('ABC234');
    expect(client.isValidCode('ABC234')).toBe(true);
    expect(client.isValidCode('ABC0O1')).toBe(false);
    expect(client.isValidCode('ABCDE')).toBe(false);
  });
});

describe('referrer Google Play et liens', () => {
  it('lit ref, src, cmp, cnt ; ignore tout le reste', () => {
    expect(server.parseInstallReferrer('ref=ABC234&src=whatsapp&cmp=defi30-oct&cnt=video-demo&name=Awa')).toEqual({ code: 'ABC234', src: 'whatsapp', cmp: 'defi30-oct', cnt: 'video-demo' });
  });
  it('installation sans lien DineroX (organique) : aucun code', () => {
    expect(server.parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toEqual({});
    expect(server.parseInstallReferrer('')).toEqual({});
    expect(server.parseInstallReferrer('%E0%A4%A=1&ref=ABC234')).toEqual({ code: 'ABC234' });
  });
  it('valeur libre (montant, nom, espaces) jamais transmise', () => {
    expect(server.parseInstallReferrer('ref=ABC234&src=50000 FCFA&cmp=Awa Koné')).toEqual({ code: 'ABC234' });
  });
  it('fiche Play Store : referrer encodé une fois (ref=…&src=…)', () => {
    expect(playStoreUrl({ code: 'ABC234', src: 'whatsapp' })).toBe(`https://play.google.com/store/apps/details?id=${LINK_BRAND.androidPackage}&referrer=ref%3DABC234%26src%3Dwhatsapp`);
  });
  it('lien d’invitation et lecture inverse (domaines DineroX et schéma de l’application)', () => {
    const link = client.inviteLink(brand.linkHost, 'ABC234', { src: 'share' });
    expect(link).toBe('https://dinerox.app/i/ABC234?src=share');
    expect(client.codeFromInviteUrl(link, brand.linkHosts, brand.scheme)).toBe('ABC234');
    expect(client.codeFromInviteUrl('https://dinerox-app.web.app/i/abc234', brand.linkHosts, brand.scheme)).toBe('ABC234');
    expect(client.codeFromInviteUrl('dinerox://i/ABC234', brand.linkHosts, brand.scheme)).toBe('ABC234');
    expect(client.codeFromInviteUrl('https://evil.example/i/ABC234', brand.linkHosts, brand.scheme)).toBeNull();
  });
  it('page de redirection : Android → Play Store, iPhone → « Bientôt », ordinateur → QR + lien', () => {
    const get = (q: Record<string, string>) => (k: string) => q[k];
    const android = routeLink({ path: '/i/ABC234', get: get({ src: 'whatsapp' }), userAgent: 'Mozilla/5.0 (Linux; Android 14)', origin: 'https://dinerox.app' });
    expect(android).toEqual({ kind: 'redirect', url: playStoreUrl({ code: 'ABC234', src: 'whatsapp' }) });
    const ios = routeLink({ path: '/i/ABC234', get: get({}), userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', origin: 'https://dinerox.app' });
    expect(ios.kind === 'page' && ios.page).toBe('ios_soon');
    const desktop = routeLink({ path: '/i/abc234', get: get({ src: 'tiktok', cmp: 'Bad Value' }), userAgent: 'Mozilla/5.0 (Macintosh)', origin: 'https://dinerox.app' });
    expect(desktop.kind === 'page' && desktop.page).toBe('desktop');
    expect(desktop.kind === 'page' && desktop.shareUrl).toBe('https://dinerox.app/i/ABC234?src=tiktok');
    expect(routeLink({ path: '/i/ABC0O1', get: get({}), origin: 'https://dinerox.app' }).kind).toBe('not_found');
    expect(routeLink({ path: '/x/ABC234', get: get({}), origin: 'https://dinerox.app' }).kind).toBe('not_found');
    expect(detectPlatform(undefined)).toBe('desktop');
  });
  it('page HTML : code et lien Play, QR sur ordinateur, aucun script', () => {
    const r = routeLink({ path: '/i/ABC234', get: () => null, userAgent: 'Mozilla/5.0 (Windows NT 10.0)', origin: 'https://dinerox.app' });
    if (r.kind !== 'page') throw new Error('page attendue');
    const html = renderPage(r, 'fr', '<svg></svg>');
    expect(html).toContain('ABC234');
    expect(html).toContain('<svg></svg>');
    expect(html).toContain('play.google.com');
    expect(html).not.toContain('<script');
    expect(renderPage({ kind: 'not_found' }, 'en')).toContain('This link is not valid.');
  });
});

describe('application d’un code (anti-triche)', () => {
  const base: server.ApplyCheck = {
    code: 'ABC234',
    parrainUid: 'parrain',
    filleulUid: UID,
    signupAt: SIGNUP,
    now: SIGNUP + 2 * D,
    alreadyReferred: false,
    deviceHash: 'h1',
    deviceUids: [UID],
    deviceFilleulUid: null,
  };
  it('cas normal accepté', () => expect(server.checkApply(base)).toBeNull());
  it('code mal formé / inconnu', () => {
    expect(server.checkApply({ ...base, code: 'ABC' })).toBe('referral/invalid-code');
    expect(server.checkApply({ ...base, parrainUid: null })).toBe('referral/unknown-code');
  });
  it('auto-parrainage : même compte ou même appareil', () => {
    expect(server.checkApply({ ...base, parrainUid: UID })).toBe('referral/self');
    expect(server.checkApply({ ...base, deviceUids: [UID, 'parrain'] })).toBe('referral/self');
  });
  it('un code par compte, jamais changé', () => expect(server.checkApply({ ...base, alreadyReferred: true })).toBe('referral/already-referred'));
  it('jusqu’à 7 jours après l’inscription', () => {
    expect(server.checkApply({ ...base, now: SIGNUP + 7 * D })).toBeNull();
    expect(server.checkApply({ ...base, now: SIGNUP + 7 * D + 1 })).toBe('referral/too-late');
    expect(client.canEnterCode(SIGNUP, false, SIGNUP + 7 * D)).toBe(true);
    expect(client.canEnterCode(SIGNUP, false, SIGNUP + 8 * D)).toBe(false);
    expect(client.canEnterCode(SIGNUP, true, SIGNUP + D)).toBe(false);
  });
  it('un appareil n’est filleul qu’une fois ; identifiant d’appareil obligatoire', () => {
    expect(server.checkApply({ ...base, deviceFilleulUid: 'autre' })).toBe('referral/device-used');
    expect(server.checkApply({ ...base, deviceHash: null })).toBe('referral/device-required');
  });
  it('message clair pour chaque refus', () => {
    for (const r of ['referral/invalid-code', 'referral/unknown-code', 'referral/self', 'referral/already-referred', 'referral/too-late', 'referral/device-used', 'referral/device-required']) {
      expect(client.refusalKey(r)).not.toBe('ref.err.generic');
    }
  });
});

describe('semaine régulière du filleul', () => {
  it('5 jours actifs sur 7 + 5 dépenses + 1 revenu + 2 objectifs → validé', () => {
    const w = regularWeek();
    const r = evaluate(w);
    expect(r.status).toBe('validated');
    // Validé au moment de la 5e dépense (jour 5), dernière condition remplie.
    expect(r.validatedAt).toBe(w.ops[5].createdAt);
  });
  it('4 jours actifs seulement → non validé', () => {
    const w = regularWeek();
    w.ops = [op(0, 'expense'), op(1, 'expense'), op(1, 'income'), op(2, 'expense'), op(3, 'expense'), op(3, 'expense', { amount: 777 })];
    const r = evaluate(w);
    expect(r.status).toBe('in_progress');
    expect(r.progress.activeDays).toBe(4);
  });
  it('4 dépenses seulement → non validé', () => {
    const w = regularWeek();
    w.ops = [op(0, 'expense'), op(1, 'expense'), op(1, 'income'), op(2, 'expense'), op(3, 'expense'), op(4, 'transfer')];
    expect(evaluate(w).status).toBe('in_progress');
    expect(evaluate(w).progress.expenses).toBe(4);
  });
  it('pas de revenu → non validé', () => {
    const w = regularWeek();
    w.ops = w.ops.filter((o) => o.type !== 'income');
    expect(evaluate(w).status).toBe('in_progress');
  });
  it('1 seul objectif → non validé', () => {
    const w = regularWeek();
    w.goals = w.goals.slice(0, 1);
    expect(evaluate(w).status).toBe('in_progress');
  });
  it('conditions remplies le 31e jour → pas de validation (expiré)', () => {
    const late = (d: number, type: 'expense' | 'income') => op(d, type);
    const w = { ops: [late(26, 'expense'), late(27, 'expense'), late(27, 'income'), late(28, 'expense'), late(29, 'expense'), late(30, 'expense')], goals: [goal(26), goal(27)] };
    // Dernière condition remplie le jour 30 à 10 h, après la limite (inscription + 30 jours à 8 h).
    const r = evaluate(w, at(31, 12));
    expect(r.status).toBe('expired');
    expect(r.validatedAt).toBeNull();
  });
  it('conditions remplies dans les 30 jours → validé, même si la semaine commence tard', () => {
    const w = { ops: [op(20, 'expense'), op(21, 'expense'), op(21, 'income'), op(22, 'expense'), op(23, 'expense'), op(24, 'expense')], goals: [goal(20), goal(21)] };
    expect(evaluate(w, at(25)).status).toBe('validated');
  });
  it('opération supprimée sous 48 h exclue ; supprimée plus tard, comptée', () => {
    const w = regularWeek();
    const last = w.ops[w.ops.length - 1];
    const quick = { ...w, ops: [...w.ops.slice(0, -1), { ...last, deleted: true, updatedAt: last.createdAt + 47 * H }] };
    expect(evaluate(quick).status).toBe('in_progress');
    const later = { ...w, ops: [...w.ops.slice(0, -1), { ...last, deleted: true, updatedAt: last.createdAt + 49 * H }] };
    expect(evaluate(later).status).toBe('validated');
  });
  it('objectif supprimé sous 48 h exclu', () => {
    const w = regularWeek();
    w.goals[1] = { ...w.goals[1], deleted: true, updatedAt: w.goals[1].createdAt + H };
    expect(evaluate(w).status).toBe('in_progress');
  });
  it('doublons évidents (même montant, même catégorie, moins d’une minute) comptés une fois', () => {
    const t0 = at(0, 10);
    const dup = (n: number) => op(0, 'expense', { amount: 5000, createdAt: t0 + n * 10_000 });
    const w = { ops: [dup(0), dup(1), dup(2), dup(3), dup(4), op(1, 'income'), op(2, 'transfer'), op(3, 'transfer'), op(4, 'transfer')], goals: [goal(0), goal(1)] };
    const r = evaluate(w);
    expect(r.progress.expenses).toBe(1);
    expect(r.status).toBe('in_progress');
    // Même montant à 2 minutes d'écart : deux dépenses réelles.
    expect(server.countedEvents([op(0, 'expense', { amount: 5000, createdAt: t0 }), op(0, 'expense', { amount: 5000, createdAt: t0 + 120_000 })], [], UID, SIGNUP, TZ)).toHaveLength(2);
  });
  it('mode démo, récurrences, ajustements, autre auteur, avant l’inscription : exclus', () => {
    const w = regularWeek();
    const extra = [op(5, 'expense', { id: 'demo_tx1' }), op(5, 'expense', { recurringId: 'rec1' }), op(5, 'adjustment'), op(5, 'expense', { createdBy: 'conjoint' }), op(0, 'expense', { createdAt: SIGNUP - H })];
    const base = evaluate(w).progress;
    const withExtra = evaluate({ ...w, ops: [...w.ops, ...extra] }).progress;
    expect(withExtra.expenses).toBe(base.expenses);
    expect(withExtra.activeDays).toBe(base.activeDays);
  });
  it('ancienne « dépense » d’épargne : jour actif, mais pas une dépense', () => {
    const r = evaluate({ ops: [op(0, 'expense', { categoryId: 'cat_savings' })], goals: [] }, at(0, 20));
    expect(r.progress).toMatchObject({ activeDays: 1, expenses: 0 });
  });
  it('progression : jour n/7 de la semaine en cours, compteurs SANS montant', () => {
    const r = evaluate({ ops: [op(0, 'expense'), op(2, 'expense')], goals: [goal(1)] }, at(2, 20));
    expect(r.progress).toEqual({ day: 3, activeDays: 2, expenses: 2, incomes: 0, goals: 1 });
    expect(Object.keys(r.progress).sort()).toEqual(['activeDays', 'day', 'expenses', 'goals', 'incomes']);
    expect(evaluate({ ops: [], goals: [] }, at(1)).progress.day).toBe(0);
  });
  it('carte du filleul : jamais de montant', () => {
    const c = client.weekChecklist({ day: 3, activeDays: 3, expenses: 4, incomes: 1, goals: 1 });
    expect(c).toEqual({
      day: { value: 3, of: 7 },
      activeDays: { value: 3, of: 5, done: false },
      expenses: { value: 4, of: 5, done: false },
      income: { done: true },
      goals: { value: 1, of: 2, done: false },
    });
  });
});

describe('récompense du parrain : 1 mois par tranche de 5 filleuls validés', () => {
  const NOW = Date.UTC(2026, 9, 15);
  const withValidated = (n: number) => ({ ...server.emptyCounters(), validated: n });
  it('4 validés → rien ; 5 → 1 mois', () => {
    expect(server.convertRewards(withValidated(4), NOW, 2).monthsGranted).toBe(0);
    const r = server.convertRewards(withValidated(5), NOW, 2);
    expect(r.monthsGranted).toBe(1);
    expect(r.counters).toMatchObject({ validated: 5, converted: 5, monthsEarned: 1 });
    expect(server.nextRewardProgress(r.counters)).toEqual({ count: 0, of: 5, waiting: false });
  });
  it('chaque filleul compte une fois : 7 validés → 1 mois et 2/5', () => {
    const r = server.convertRewards(withValidated(7), NOW, 2);
    expect(r.monthsGranted).toBe(1);
    expect(server.nextRewardProgress(r.counters)).toEqual({ count: 2, of: 5, waiting: false });
    // Une seconde conversion sans nouveau filleul ne donne rien de plus.
    expect(server.convertRewards(r.counters, NOW, 2).monthsGranted).toBe(0);
  });
  it('plafond mensuel puis report au mois suivant', () => {
    const r = server.convertRewards(withValidated(15), NOW, server.REFERRAL.MAX_REWARDS_PER_MONTH);
    expect(r.monthsGranted).toBe(2);
    expect(server.nextRewardProgress(r.counters)).toEqual({ count: 5, of: 5, waiting: true });
    // Même mois : toujours bloqué.
    expect(server.convertRewards(r.counters, NOW + D, 2).monthsGranted).toBe(0);
    // Mois suivant : le report est converti.
    const next = server.convertRewards(r.counters, Date.UTC(2026, 10, 1), 2);
    expect(next.monthsGranted).toBe(1);
    expect(next.counters.monthsEarned).toBe(3);
  });
  it('mode ambassadeur : plafond plus élevé, réglable par l’admin', () => {
    expect(server.monthlyCap(null)).toBe(server.REFERRAL.MAX_REWARDS_PER_MONTH);
    expect(server.monthlyCap({ enabled: true })).toBe(server.REFERRAL.AMBASSADOR_MAX_REWARDS_PER_MONTH);
    expect(server.monthlyCap({ enabled: true, maxRewardsPerMonth: 6 })).toBe(6);
    expect(server.monthlyCap({ enabled: false, maxRewardsPerMonth: 50 })).toBe(server.REFERRAL.MAX_REWARDS_PER_MONTH);
    expect(server.convertRewards(withValidated(30), NOW, server.monthlyCap({ enabled: true, maxRewardsPerMonth: 6 })).monthsGranted).toBe(6);
  });
  it('les mois offerts s’additionnent (mois civils)', () => {
    const one = server.extendPlusUntil(null, NOW, 1);
    expect(new Date(one).toISOString().slice(0, 10)).toBe('2026-11-15');
    expect(new Date(server.extendPlusUntil(one, NOW, 1)).toISOString().slice(0, 10)).toBe('2026-12-15');
    // Période échue : on repart d'aujourd'hui.
    expect(new Date(server.extendPlusUntil(NOW - 40 * D, NOW, 1)).toISOString().slice(0, 10)).toBe('2026-11-15');
    // 31 janvier + 1 mois = fin février.
    expect(new Date(server.extendPlusUntil(null, Date.UTC(2027, 0, 31), 1)).toISOString().slice(0, 10)).toBe('2027-02-28');
  });
  it('abonnement payant actif : rien d’automatique (mois mis de côté)', () => {
    expect(server.hasPaidSubscription({ plan: 'plus', status: 'active', provider: 'google_play', expiresAt: NOW + D }, NOW)).toBe(true);
    expect(server.hasPaidSubscription({ plan: 'free', status: 'active', provider: 'none' }, NOW)).toBe(false);
    expect(server.hasPaidSubscription({ plan: 'plus', status: 'active', provider: 'google_play', expiresAt: NOW - D }, NOW)).toBe(false);
  });
});

describe('formule effective avec « Plus offert »', () => {
  const free = { plan: 'free' as const, status: 'active' as const, provider: 'none' as const, expiresAt: null, updatedAt: 1 };
  const family = { ...free, plan: 'family' as const, provider: 'manual' as const };
  const NOW = Date.UTC(2026, 9, 15);
  it('Plus pendant la période offerte, puis retour à la formule normale (application et serveur)', () => {
    for (const plan of [clientPlan, serverPlan]) {
      expect(plan(free, NOW, { plusUntil: NOW + D })).toBe('plus');
      expect(plan(free, NOW, { plusUntil: NOW - 1 })).toBe('free');
      expect(plan(free, NOW, null)).toBe('free');
      // Jamais une formule supérieure à la baisse.
      expect(plan(family, NOW, { plusUntil: NOW + D })).toBe('family');
    }
  });
});

describe('parité application ↔ serveur', () => {
  it('mêmes constantes de règle', () => {
    for (const k of Object.keys(client.REFERRAL) as (keyof typeof client.REFERRAL)[]) {
      if (k in server.REFERRAL) expect(client.REFERRAL[k], k).toBe((server.REFERRAL as Record<string, unknown>)[k]);
    }
  });
  it('même lecture du referrer et des codes', () => {
    for (const raw of ['ref=ABC234&src=whatsapp', 'utm_source=google-play', 'ref=abc-234&cmp=x y', 'ref=ABC234&cnt=video_1&src=TikTok']) {
      expect(client.parseInstallReferrer(raw)).toEqual(server.parseInstallReferrer(raw));
    }
  });
  it('page de redirection : même application que la marque', () => {
    expect(LINK_BRAND.androidPackage).toBe(brand.bundleId);
    expect(LINK_BRAND.name).toBe(brand.name);
    expect(LINK_BRAND.appStoreUrl).toBe(brand.appStoreUrl);
  });
});

describe('confidentialité', () => {
  it('événements de parrainage : ni code ni nom ni montant', () => {
    expect(sanitize({ kind: 'share', code: 'ABC234', name: 'Awa', amount: 5000 })).toEqual({ kind: 'share' });
    expect(sanitize({ source: 'link', link: 'https://dinerox.app/i/ABC234' })).toEqual({ source: 'link' });
  });
  it('message de partage : jamais de montant ni de « on gagne chacun »', async () => {
    const { fr } = await import('../src/i18n/fr');
    const { en } = await import('../src/i18n/en');
    for (const s of [fr['ref.shareMessage'], en['ref.shareMessage']]) {
      expect(s).not.toMatch(/\d/);
      expect(s).not.toMatch(/FCFA|XOF|chacun|each/i);
      expect(s).toContain('{link}');
    }
  });
});

describe('refus renvoyés par le serveur', () => {
  it('le code est lu même suivi du statut HTTP', () => {
    expect(client.refusalCode('referral/self [400]')).toBe('referral/self');
    expect(client.refusalCode('referral/device-used')).toBe('referral/device-used');
    expect(client.refusalCode('internal')).toBeNull();
    expect(client.refusalKey(client.refusalCode('referral/too-late [400]'))).toBe('ref.err.tooLate');
  });
});

describe('code saisi à l’inscription (e-mail ou « Continuer avec Google »)', () => {
  const NOW = 1_800_000_000_000;
  it('code valide → mis en attente AVANT la connexion (source « saisie »)', () => {
    expect(client.pendingForTypedCode(' abc-234 ', null, NOW)).toEqual({ code: 'ABC234', source: 'manual', at: NOW });
  });
  it('même code qu’un lien déjà en attente : la source et le suivi du lien sont gardés', () => {
    const link = { code: 'ABC234', source: 'link' as const, at: 1, src: 'whatsapp' };
    expect(client.pendingForTypedCode('ABC234', link, NOW)).toBe(link);
  });
  it('champ vide ou code mal formé → rien n’est écrit (un code en attente reste intact)', () => {
    expect(client.pendingForTypedCode('', null, NOW)).toBeUndefined();
    expect(client.pendingForTypedCode('AB0', { code: 'XYZ234', source: 'link', at: 1 }, NOW)).toBeUndefined();
  });
});
