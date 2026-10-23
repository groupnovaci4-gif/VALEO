/**
 * Connexion par téléphone — module pur du SERVEUR (firebase/functions/src/phone.ts) :
 * parité avec l'application (src/core/phone.ts) et empreintes (code reçu, code secret, numéro,
 * appareil) : jamais rien en clair.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as app from '../src/core/phone';
import * as server from '../firebase/functions/src/phone';

const PEPPER = 'poivre-de-test';

describe('parité application ↔ serveur (le serveur fait foi)', () => {
  it('mêmes règles, mêmes indicatifs, même liste blanche des SMS', () => {
    expect(server.PHONE_RULES).toEqual(app.PHONE_RULES);
    expect(server.DIAL_CODES).toEqual(app.DIAL_CODES);
    expect(server.DEFAULT_DIAL).toBe(app.DEFAULT_DIAL);
    expect(new Set(server.SMS_DIAL_CODES)).toEqual(new Set(app.smsDialCodes()));
  });
  it('mêmes numéros normalisés, mêmes refus de code secret', () => {
    for (const [raw, dial] of [['07 08 09 10 11', '225'], ['+225 07 08 09 10 11', '225'], ['06 12 34 56 78', '33'], ['12 34', '225'], ['+12025550123', '225']] as const) expect(server.normalizePhone(raw, dial), raw).toBe(app.normalizePhone(raw, dial));
    for (const s of ['123456', '000000', '121212', '483915', '12345', '12a456']) expect(server.secretProblem(s), s).toBe(app.secretProblem(s));
    for (const n of ['+2250708091011', '+12025550123', '+33612345678']) expect(server.smsAllowed(n), n).toBe(app.smsAllowed(n));
  });
  it('mêmes décisions d’envoi et de blocage', () => {
    const g = { day: '2026-10-22', sends: 1, lastSendAt: 1_000_000, fails: 4, lockLevel: 1, lockedUntil: 0 };
    expect(server.sendDecision(g, 1_030_000, '2026-10-22')).toEqual(app.sendDecision(g, 1_030_000, '2026-10-22'));
    expect(server.failureAfter(g, 5_000_000)).toEqual(app.failureAfter(g, 5_000_000));
    for (const l of [0, 1, 2, 3, 4]) expect(server.lockDuration(l)).toBe(app.lockDuration(l));
  });
});

describe('empreintes : jamais rien en clair', () => {
  it('code reçu : 6 chiffres tirés au hasard ; empreinte HMAC liée à la demande', () => {
    const codes = new Set(Array.from({ length: 50 }, () => server.newCode()));
    for (const c of codes) expect(c).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(40);
    const h = server.codeHash(PEPPER, 'req1', '482915');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('482915');
    expect(server.codeHash(PEPPER, 'req1', '482915')).toBe(h);
    expect(server.codeHash(PEPPER, 'req2', '482915')).not.toBe(h);
    expect(server.sameHash(h, server.codeHash(PEPPER, 'req1', '482915'))).toBe(true);
    expect(server.sameHash(h, server.codeHash(PEPPER, 'req1', '482916'))).toBe(false);
  });
  it('numéro et appareil : identifiants HMAC (le numéro n’apparaît jamais dans un identifiant)', () => {
    const k = server.phoneKey(PEPPER, '+2250708091011');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain('0708091011');
    expect(server.deviceKey(PEPPER, 'appareil-1')).not.toBe(server.deviceKey(PEPPER, 'appareil-2'));
    expect(server.deviceKey(PEPPER, 'x')).not.toBe(server.phoneKey(PEPPER, 'x'));
  });
  it('code secret : scrypt + sel propre + poivre ; deux comptes, deux empreintes différentes', async () => {
    const a = await server.hashSecret('483915', server.newSalt(), PEPPER);
    const b = await server.hashSecret('483915', server.newSalt(), PEPPER);
    expect(a.hash).not.toBe(b.hash);
    expect(JSON.stringify(a)).not.toContain('483915');
    expect(await server.checkSecret('483915', a, PEPPER)).toBe(true);
    expect(await server.checkSecret('483916', a, PEPPER)).toBe(false);
    expect(await server.checkSecret('483915', a, 'autre-poivre')).toBe(false);
  });
});

describe('audit du 23/10 — règles propres au serveur', () => {
  const now = Date.parse('2026-10-23T10:00:00Z');
  it('S1 : connexion récente = moins de 5 minutes (auth_time en secondes)', () => {
    expect(server.recentLogin(now / 1000 - 60, now)).toBe(true);
    expect(server.recentLogin(now / 1000 - 5 * 60, now)).toBe(true);
    expect(server.recentLogin(now / 1000 - 5 * 60 - 1, now)).toBe(false);
    expect(server.recentLogin(undefined, now)).toBe(false);
    expect(server.recentLogin('x', now)).toBe(false);
  });
  it('S4 : WhatsApp suit la liste des pays des SMS', () => {
    expect(server.codeCountryAllowed('+2250708091011')).toBe(true);
    expect(server.codeCountryAllowed('+33612345678')).toBe(true);
    expect(server.codeCountryAllowed('+12025550123')).toBe(false);
  });
  it('S4 : préfixe = indicatif + 2 chiffres, jamais le numéro entier', () => {
    expect(server.prefixOf('+2250708091011')).toBe('22507');
    expect(server.prefixOf('+33612345678')).toBe('3361');
    expect(server.prefixOf('+2250508091011')).not.toBe(server.prefixOf('+2250708091011'));
  });
  it('S4 : jeton App Check déjà consommé → rejeu refusé ; sinon accepté', () => {
    expect(server.appCheckReplayed({ alreadyConsumed: true })).toBe(true);
    expect(server.appCheckReplayed({ alreadyConsumed: false })).toBe(false);
    expect(server.appCheckReplayed(undefined)).toBe(false);
  });
  it('S4 : phoneStart consomme son jeton App Check (l’émulateur ne sait pas simuler la consommation)', () => {
    const api = fs.readFileSync(path.join(__dirname, '..', 'firebase/functions/src/phoneAuthApi.ts'), 'utf8');
    expect(api).toMatch(/export const phoneStart = onCall\(\{ \.\.\.OPTS, consumeAppCheckToken: true \}/);
    expect(api).toMatch(/if \(P\.appCheckReplayed\(req\.app\)\) fail\(/);
  });
});
