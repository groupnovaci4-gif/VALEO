/// <reference types="node" />
/**
 * Croissance, étape 5 — origine des inscriptions sur les ÉMULATEURS : les
 * vraies Cloud Functions `recordSignupOrigin` et `adminOriginStats`, appelées
 * comme par l'application. Lancé par `npm run test:functions`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { account, admin, read, refusal, setup, teardown } from './helpers';
import type { OriginStats } from '../../src/core/installOrigin';

beforeAll(setup);
afterAll(teardown);

const today = () => new Date().toISOString().slice(0, 10);
const counters = () => read(`originStats/${today()}`) as Promise<Record<string, unknown> | undefined>;
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const map = (v: unknown) => (v ?? {}) as Record<string, number>;

/** Efface les compteurs (chaque test part de zéro). */
const clear = () => admin(async (fs) => Promise.all((await getDocs(collection(fs, 'originStats'))).docs.map((d) => deleteDoc(d.ref))));

describe('recordSignupOrigin : une fois, anonyme', () => {
  it('compte l’origine, pose le marqueur oui/non, jamais la source dans le profil', async () => {
    await clear();
    const a = await account('Awa');
    expect(await a.call('recordSignupOrigin', { src: 'facebook', cmp: 'lancement', cnt: 'video1', invited: true, code: 'ABC234', firstName: 'Awa', amount: 5000 })).toEqual({ counted: true });
    const profile = (await read(`users/${a.uid}`)) as Record<string, unknown>;
    expect(profile.originCounted).toBe(true);
    const json = JSON.stringify(profile);
    for (const leaked of ['facebook', 'lancement', 'video1', 'ABC234', 'src', 'cmp', 'cnt']) expect(json).not.toContain(leaked);
    const c = await counters();
    expect(num(c?.total)).toBe(1);
    expect(num(c?.invited)).toBe(1);
    expect(map(c?.src)).toEqual({ facebook: 1 });
    expect(map(c?.cmp)).toEqual({ 'facebook~lancement': 1 });
    expect(map(c?.cnt)).toEqual({ 'facebook~lancement~video1': 1 });
    // Rien d'autre que des compteurs : ni uid, ni code, ni prénom, ni montant.
    const cj = JSON.stringify(c);
    for (const leaked of [a.uid, 'ABC234', 'Awa', '5000']) expect(cj).not.toContain(leaked);
  });

  it('une seconde fois (même compte, autre téléphone) : rien n’est compté', async () => {
    await clear();
    const a = await account('Kofi');
    expect(await a.call('recordSignupOrigin', { src: 'whatsapp' })).toEqual({ counted: true });
    expect(await a.call('recordSignupOrigin', { src: 'tiktok' })).toEqual({ counted: false, reason: 'already' });
    const c = await counters();
    expect(num(c?.total)).toBe(1);
    expect(map(c?.src)).toEqual({ whatsapp: 1 });
  });

  it('compte inscrit il y a plus de 7 jours : rien (les comptes d’avant l’étape 5 ne sont pas comptés)', async () => {
    await clear();
    const old = await account('Ancien', { daysAgo: 8 });
    expect(await old.call('recordSignupOrigin', { src: 'whatsapp' })).toEqual({ counted: false, reason: 'too-old' });
    expect(((await read(`users/${old.uid}`)) as Record<string, unknown>).originCounted).toBeUndefined();
    expect(await counters()).toBeUndefined();
    const recent = await account('Récent', { daysAgo: 6 });
    expect(await recent.call('recordSignupOrigin', {})).toEqual({ counted: true });
  });

  it('sans origine : « Origine inconnue » ; source inconnue : « Autre source »', async () => {
    await clear();
    await (await account('A')).call('recordSignupOrigin', {});
    await (await account('B')).call('recordSignupOrigin', { src: 'snapchat', cmp: 'Bad Value' });
    const c = await counters();
    expect(num(c?.total)).toBe(2);
    expect(num(c?.unknown)).toBe(1);
    expect(map(c?.src)).toEqual({ other: 1 });
    expect(c?.cmp).toBeUndefined();
  });

  it('profil pas encore créé : refus temporaire, rien n’est compté (l’application réessaiera)', async () => {
    await clear();
    const a = await account('Sans profil');
    await admin((fs) => deleteDoc(doc(fs, `users/${a.uid}`)));
    expect(await refusal(a.call('recordSignupOrigin', { src: 'qr' }))).toBe('origin/no-profile');
    expect(await counters()).toBeUndefined();
  });
});

describe('adminOriginStats : chiffres regroupés, droit admin', () => {
  it('refusé sans le droit admin', async () => {
    const a = await account('Curieuse');
    expect(await refusal(a.call('adminOriginStats', {}))).toBe('admin/required');
  });

  it('groupes de 5 montrés ; plus petits réunis sans nom ni nombre exact sous 5', async () => {
    await clear();
    for (let i = 0; i < 5; i++) await (await account(`W${i}`)).call('recordSignupOrigin', { src: 'whatsapp', cmp: 'lancement' });
    for (let i = 0; i < 2; i++) await (await account(`F${i}`)).call('recordSignupOrigin', { src: 'facebook', cmp: 'tante-awa' });
    await (await account('T')).call('recordSignupOrigin', { src: 'tiktok' });
    const boss = await account('Admin', { claims: { admin: true } });
    const s = await boss.call<OriginStats>('adminOriginStats', {});
    const m = s.periods.month;
    expect(s.since).toBe(today());
    expect(m.total).toBe(8);
    expect(m.bySource).toEqual([{ key: 'whatsapp', count: 5 }]);
    expect(m.others.source).toBe('few'); // Facebook 2 + TikTok 1 = 3 : « Moins de 5 », jamais le nombre
    expect(m.others.content).toBeNull(); // aucun contenu : pas de ligne « Autres »
    expect(m.byCampaign).toEqual([{ key: 'whatsapp~lancement', count: 5 }]);
    expect(m.unknown).toBeNull();
    const out = JSON.stringify(s);
    for (const hidden of ['facebook', 'tiktok', 'tante-awa']) expect(out).not.toContain(hidden);
    expect(s.periods.all.total).toBe(8);
  });
});
