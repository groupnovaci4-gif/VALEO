/// <reference types="node" />
/**
 * Audit 2026-10 sur les ÉMULATEURS (vraies Cloud Functions) :
 *  - F4 : la suppression de compte efface aussi `accountStatus/{uid}` ;
 *  - F5 : au-delà de 50 essais de code par jour, refus (tontine : aperçu ; parrainage).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import { account, admin, read, refusal, setup, teardown } from './helpers';

beforeAll(setup);
afterAll(teardown);

describe('F4 — suppression de compte complète', () => {
  it('accountStatus/{uid} est effacé avec le compte', async () => {
    const s = await account('Ancien suspendu');
    await admin((fs) => setDoc(doc(fs, `accountStatus/${s.uid}`), { status: 'active', since: 1, by: 'staff1', reasonCode: 'other' }));
    await s.call('deleteAccount', {});
    expect(await read(`users/${s.uid}`)).toBeUndefined();
    expect(await read(`accountStatus/${s.uid}`)).toBeUndefined();
  });
});

describe('F5 — plafond quotidien d’essais de codes', () => {
  it('tontine partagée : le 51e aperçu du jour est refusé', async () => {
    const a = await account('Curieux');
    await admin((fs) => setDoc(doc(fs, `usage/${a.uid}`), { codeTriesDay: new Date().toISOString().slice(0, 10), codeTries: 50 }));
    expect(await refusal(a.call('tontineGroup', { action: 'preview', code: 'ABC234' }))).toBe('tg/too-many-tries');
  });
  it('parrainage : le 51e essai du jour est refusé, sans effacer le code en attente côté application (« resource-exhausted »)', async () => {
    const a = await account('Curieux2');
    await admin((fs) => setDoc(doc(fs, `usage/${a.uid}`), { codeTriesDay: new Date().toISOString().slice(0, 10), codeTries: 50 }));
    let code = '';
    try {
      await a.call('applyReferral', { code: 'ABC234', source: 'manual', deviceId: 'appareil-0001' });
    } catch (e) {
      code = String((e as { code?: string }).code);
      expect((e as { message?: string }).message).toContain('referral/too-many-tries');
    }
    expect(code).toBe('functions/resource-exhausted');
  });
  it('sous le plafond : un essai compte, et un code inconnu reste refusé comme avant', async () => {
    const a = await account('Normal');
    expect(await refusal(a.call('tontineGroup', { action: 'preview', code: 'ABC234' }))).toBe('tg/unknown-invite');
    const u = (await read(`usage/${a.uid}`)) as { codeTries?: number } | undefined;
    expect(u?.codeTries).toBe(1);
  });
});
