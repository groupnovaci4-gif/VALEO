/**
 * Audit 2026-10 — corrections testées (logique pure du serveur) :
 *  - M2 (partie 1) : jours d'activité du filleul comptés avec l'heure du SERVEUR (`syncedAt`) ;
 *  - (i) : une cotisation de tontine n'est pas une dépense dans la « semaine régulière » ;
 *  - F5 : plafond quotidien d'essais de codes par compte.
 */
import { describe, expect, it } from 'vitest';
import * as server from '../firebase/functions/src/referral';
import { CODE_DAILY_ATTEMPTS, nextCodeAttempt } from '../firebase/functions/src/plans';

const D = 24 * 3600 * 1000;
const SIGNUP = Date.UTC(2026, 9, 1, 8);
const UID = 'filleul';
const op = (i: number, p: Partial<server.ActivityOp>): server.ActivityOp => ({ id: `t${i}`, type: 'expense', amount: 1000 + i, categoryId: 'cat_food', createdAt: SIGNUP + D, updatedAt: SIGNUP + D, createdBy: UID, ...p });

describe('M2 — semaine régulière : l’heure du serveur fait foi', () => {
  it('dates « createdAt » écrites par le téléphone sur 5 jours, mais tout envoyé le même jour : 1 seul jour actif', () => {
    const sameServerDay = SIGNUP + 5 * D + 3600_000;
    const ops = [0, 1, 2, 3, 4].map((k) => op(k, { createdAt: SIGNUP + k * D + 7200_000, updatedAt: SIGNUP + k * D + 7200_000, syncedAt: sameServerDay + k * 60_000 }));
    const w = server.evaluateWeek({ ops, goals: [], uid: UID, signupAt: SIGNUP, now: SIGNUP + 6 * D, timeZone: 'Africa/Abidjan' });
    expect(w.progress.activeDays).toBe(1);
  });
  it('sans heure du serveur (document écrit par l’administration) : la date de création reste utilisée', () => {
    const ops = [0, 1].map((k) => op(k, { createdAt: SIGNUP + k * D + 7200_000, updatedAt: SIGNUP + k * D + 7200_000 }));
    const w = server.evaluateWeek({ ops, goals: [], uid: UID, signupAt: SIGNUP, now: SIGNUP + 3 * D, timeZone: 'Africa/Abidjan' });
    expect(w.progress.activeDays).toBe(2);
  });
});

describe('(i) — une cotisation de tontine n’est pas une dépense dans la semaine régulière', () => {
  it('sous-catégorie Tontine, Épargne communautaire, ou lien avec une tontine : pas une dépense ; une dépense ordinaire, oui', () => {
    const events = server.countedEvents(
      [
        op(1, { subcategoryId: 'sub_informal_tontine', categoryId: 'cat_social' }),
        op(2, { subcategoryId: 'sub_informal_community', categoryId: 'cat_informal', amount: 2002 }),
        op(3, { tontineId: 'carnet1', categoryId: 'cat_other', amount: 3003 }),
        op(4, { amount: 4004 }),
      ],
      [],
      UID,
      SIGNUP,
      'Africa/Abidjan',
    );
    expect(events.filter((e) => e.kind === 'expense')).toHaveLength(1);
  });
});

describe('F5 — plafond quotidien d’essais de codes par compte', () => {
  it(`${CODE_DAILY_ATTEMPTS} essais par jour, remis à zéro le lendemain`, () => {
    expect(CODE_DAILY_ATTEMPTS).toBe(50);
    let state: { day?: string; tries?: number } = {};
    for (let k = 0; k < 50; k++) {
      const r = nextCodeAttempt(state, '2026-10-15');
      expect(r.allowed).toBe(true);
      state = { day: r.patch.codeTriesDay, tries: r.patch.codeTries };
    }
    expect(nextCodeAttempt(state, '2026-10-15').allowed).toBe(false);
    expect(nextCodeAttempt(state, '2026-10-16')).toEqual({ allowed: true, patch: { codeTriesDay: '2026-10-16', codeTries: 1 } });
  });
});

import { readFileSync } from 'node:fs';

describe('F7 — permissions Android inutiles bloquées', () => {
  it('SYSTEM_ALERT_WINDOW et CAMERA dans android.blockedPermissions ; la galerie seule est utilisée', () => {
    const cfg = readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8');
    const m = /blockedPermissions:\s*\[([^\]]*)\]/.exec(cfg);
    expect(m?.[1]).toContain("'android.permission.SYSTEM_ALERT_WINDOW'");
    expect(m?.[1]).toContain("'android.permission.CAMERA'");
    const form = readFileSync(new URL('../src/features/TransactionForm.tsx', import.meta.url), 'utf8');
    expect(form).toContain('launchImageLibraryAsync');
    expect(form).not.toContain('launchCameraAsync');
  });
});

describe('F8 — en-têtes de sécurité des pages de liens (Hosting « links »)', () => {
  it('CSP sans script, interdiction d’intégrer la page, nosniff, aucun référent, aucune autorisation sensible', () => {
    const fb = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')) as { hosting: { target: string; headers?: { source: string; headers: { key: string; value: string }[] }[] }[] };
    const links = fb.hosting.find((h) => h.target === 'links')!;
    const all = links.headers?.find((h) => h.source === '**')?.headers ?? [];
    const v = (k: string) => all.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value ?? '';
    expect(v('Content-Security-Policy')).toContain("default-src 'none'");
    expect(v('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(v('Content-Security-Policy')).not.toContain('script-src');
    expect(v('X-Frame-Options')).toBe('DENY');
    expect(v('X-Content-Type-Options')).toBe('nosniff');
    expect(v('Referrer-Policy')).toBe('no-referrer');
    expect(v('Permissions-Policy')).toContain('camera=()');
    // assetlinks.json reste servi en JSON.
    expect(links.headers?.some((h) => h.source === '/.well-known/assetlinks.json')).toBe(true);
  });
});
