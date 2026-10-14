/// <reference types="node" />
/**
 * Tontine partagée de bout en bout sur les ÉMULATEURS : la vraie Cloud
 * Function `tontineGroup` (et `deleteAccount`, `adminTontineStats`) appelée
 * comme par l'application. Lancé par `npm run test:functions`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { account, admin, read, refusal, setup, teardown } from './helpers';

beforeAll(setup);
afterAll(teardown);

type Group = { memberUids: string[]; organizerUid: string; treasurerUid: string | null; slots: { slotId: string; turnOrder: number; uid: string | null; label: string | null; former?: boolean }[]; paid: Record<string, true>; drawnAt: number | null; status: string };
const groupOf = async (id: string) => (await read(`tontineGroups/${id}`)) as Group;
const history = (id: string) => admin(async (fs) => (await getDocs(collection(fs, `tontineGroups/${id}/history`))).docs.map((d) => d.data()));
let dev = 0;
const device = () => `device-tontine-${Date.now()}-${dev++}`;

const CREATE = { action: 'create', name: 'Tontine du marché', currency: 'XOF', amountPerShare: 10000, frequency: 'weekly', startDate: '2026-10-19', slotsCount: 4, organizerLabel: 'Fatou' };

/** Organisateur Plus + groupe + invitation. */
async function newGroup(opts: { showAmount?: boolean } = {}) {
  const org = await account('Fatou', { plan: 'plus' });
  const { groupId } = await org.call<{ groupId: string }>('tontineGroup', CREATE);
  const { code } = await org.call<{ code: string }>('tontineGroup', { action: 'invite', groupId, showAmount: opts.showAmount ?? false });
  return { org, groupId, code };
}

/** Demande + validation par l'organisateur. */
async function join(org: Awaited<ReturnType<typeof account>>, groupId: string, code: string, label: string, slotId: string, opts: { daysAgo?: number } = {}) {
  const m = await account(label, { daysAgo: opts.daysAgo ?? 30 });
  await m.call('tontineGroup', { action: 'requestJoin', code, label, deviceId: device() });
  await org.call('tontineGroup', { action: 'approve', groupId, uid: m.uid, slotIds: [slotId] });
  return m;
}

describe('créer et inviter', () => {
  it('créer est réservé à Plus et Famille ; rejoindre reste gratuit', async () => {
    const free = await account('Awa');
    expect(await refusal(free.call('tontineGroup', CREATE))).toBe('plan/tontine-group');
    const { groupId } = await newGroup();
    const g = await groupOf(groupId);
    expect(g.slots.map((s) => [s.slotId, s.uid !== null, s.label])).toEqual([['s1', true, 'Fatou'], ['s2', false, null], ['s3', false, null], ['s4', false, null]]);
  });

  it('aperçu de l’invitation : jamais la liste des membres ; cotisation seulement si cochée', async () => {
    const { org, groupId, code } = await newGroup();
    await join(org, groupId, code, 'Awa', 's2');
    const visitor = await account('Kofi');
    const hidden = await visitor.call<Record<string, unknown>>('tontineGroup', { action: 'preview', code });
    expect(hidden).toEqual({ name: 'Tontine du marché', frequency: 'weekly', customDays: null, slots: 4, full: false, expired: false, alreadyMember: false });
    expect(JSON.stringify(hidden)).not.toMatch(/Awa|Fatou|10000/);
    const { code: code2 } = await org.call<{ code: string }>('tontineGroup', { action: 'invite', groupId, showAmount: true });
    expect(await visitor.call('tontineGroup', { action: 'preview', code: code2 })).toMatchObject({ currency: 'XOF', amountPerShare: 10000 });
  });

  it('invitation inconnue ou expirée refusée', async () => {
    const { groupId } = await newGroup();
    const v = await account('Kofi');
    expect(await refusal(v.call('tontineGroup', { action: 'requestJoin', code: 'ZZZZ22', label: 'Kofi' }))).toBe('tg/unknown-invite');
    await admin((fs) => setDoc(doc(fs, 'tontineInvites/OLD234'), { groupId, createdBy: 'x', createdAt: 1, expiresAt: Date.now() - 1000, showAmount: false }));
    expect(await refusal(v.call('tontineGroup', { action: 'requestJoin', code: 'OLD234', label: 'Kofi' }))).toBe('tg/invite-expired');
  });
});

describe('personne n’est membre sans l’avoir demandé', () => {
  it('demande → toujours pas membre ; seul l’organisateur valide ; nom choisi par la personne', async () => {
    const { org, groupId, code } = await newGroup();
    const awa = await account('Awa', { daysAgo: 30 });
    // Compte gratuit qui a DÉJÀ une tontine personnelle : rejoindre reste possible.
    await admin((fs) => setDoc(doc(fs, `spaces/${awa.uid}/tontines/t1`), { id: 't1', name: 'Ma tontine', createdBy: awa.uid }));
    expect(await awa.call('tontineGroup', { action: 'requestJoin', code, label: 'Awa K.', deviceId: device() })).toMatchObject({ status: 'pending' });
    expect((await groupOf(groupId)).memberUids).not.toContain(awa.uid);
    expect(await refusal(awa.call('tontineGroup', { action: 'approve', groupId, uid: awa.uid, slotIds: ['s2'] }))).toBe('tg/not-organizer');
    await org.call('tontineGroup', { action: 'approve', groupId, uid: awa.uid, slotIds: ['s2'] });
    const g = await groupOf(groupId);
    expect(g.memberUids).toContain(awa.uid);
    expect(g.slots[1]).toMatchObject({ uid: awa.uid, label: 'Awa K.' });
    // Demande traitée : gardée pour les statistiques, sans le nom.
    expect(await read(`tontineGroups/${groupId}/requests/${awa.uid}`)).toMatchObject({ status: 'approved', label: null });
  });
});

describe('parrainage par l’organisateur', () => {
  it('nouveau compte sans parrain : l’organisateur devient son parrain (source « tontine »)', async () => {
    const { org, code } = await newGroup();
    const nouveau = await account('Yao', { daysAgo: 0 });
    expect(await nouveau.call('tontineGroup', { action: 'requestJoin', code, label: 'Yao', deviceId: device() })).toMatchObject({ referred: true });
    expect((await read(`users/${nouveau.uid}`))?.referredBy).toMatchObject({ uid: org.uid, source: 'tontine' });
  });
  it('parrain déjà existant → inchangé (on ne remplace jamais un code saisi)', async () => {
    const autre = await account('Ama');
    const { code: codeAma } = await autre.call<{ code: string }>('myReferral', { deviceId: device() });
    const nouveau = await account('Yao', { daysAgo: 0 });
    await nouveau.call('applyReferral', { code: codeAma, source: 'manual', deviceId: device() });
    const { code } = await newGroup();
    expect(await nouveau.call('tontineGroup', { action: 'requestJoin', code, label: 'Yao', deviceId: device() })).toMatchObject({ referred: false });
    expect((await read(`users/${nouveau.uid}`))?.referredBy).toMatchObject({ uid: autre.uid, source: 'manual' });
  });
  it('compte de plus de 7 jours : pas de parrainage', async () => {
    const { code } = await newGroup();
    const ancien = await account('Koffi', { daysAgo: 10 });
    expect(await ancien.call('tontineGroup', { action: 'requestJoin', code, label: 'Koffi', deviceId: device() })).toMatchObject({ referred: false });
    expect((await read(`users/${ancien.uid}`))?.referredBy).toBeUndefined();
  });
});

describe('tirage, trésorier, paiements', () => {
  it('tirage au sort une seule fois, inscrit à l’historique', async () => {
    const { org, groupId } = await newGroup();
    await org.call('tontineGroup', { action: 'draw', groupId });
    const g = await groupOf(groupId);
    expect(g.drawnAt).toBeGreaterThan(0);
    expect(new Set(g.slots.map((s) => s.turnOrder))).toEqual(new Set([1, 2, 3, 4]));
    expect(await refusal(org.call('tontineGroup', { action: 'draw', groupId }))).toBe('tg/already-drawn');
    expect((await history(groupId)).some((h) => h.action === 'draw' && h.visibility === 'all')).toBe(true);
  });

  it('déclaration de son seul paiement ; confirmation par le trésorier, notée dans l’historique', async () => {
    const { org, groupId, code } = await newGroup();
    const awa = await join(org, groupId, code, 'Awa', 's2');
    const kofi = await join(org, groupId, code, 'Kofi', 's3');
    await org.call('tontineGroup', { action: 'setTreasurer', groupId, uid: awa.uid });
    expect(await refusal(kofi.call('tontineGroup', { action: 'declare', groupId, period: 1, slotId: 's2' }))).toBe('tg/not-your-slot');
    await kofi.call('tontineGroup', { action: 'declare', groupId, period: 1, slotId: 's3' });
    expect(await read(`tontineGroups/${groupId}/payments/1_1_s3`)).toMatchObject({ status: 'declared', declaredBy: kofi.uid });
    expect(await refusal(kofi.call('tontineGroup', { action: 'confirm', groupId, period: 1, slotId: 's3' }))).toBe('tg/not-manager');
    await awa.call('tontineGroup', { action: 'confirm', groupId, period: 1, slotId: 's3' });
    expect((await groupOf(groupId)).paid['1_1_s3']).toBe(true);
    const confirm = (await history(groupId)).find((h) => h.action === 'confirm');
    expect(confirm).toMatchObject({ by: awa.uid, visibility: 'all', info: { confirmedBy: awa.uid } });
    const payment = await read(`tontineGroups/${groupId}/payments/1_1_s3`);
    expect(payment).toMatchObject({ status: 'confirmed', confirmedBy: awa.uid });
    expect(JSON.stringify(payment)).not.toMatch(/amount|10000/);
  });
});

describe('départ et suppression de compte', () => {
  it('un membre qui part perd l’accès ; sa place devient « ancien membre »', async () => {
    const { org, groupId, code } = await newGroup();
    const awa = await join(org, groupId, code, 'Awa', 's2');
    await awa.call('tontineGroup', { action: 'leave', groupId });
    const g = await groupOf(groupId);
    expect(g.memberUids).not.toContain(awa.uid);
    expect(g.slots[1]).toMatchObject({ uid: null, label: null, former: true });
    expect(await refusal(org.call('tontineGroup', { action: 'leave', groupId }))).toBe('tg/organizer-cannot-leave');
  });

  it('compte supprimé (deleteAccount) : retiré du groupe, place libérée, historique intact ; organisateur → trésorier', async () => {
    const { org, groupId, code } = await newGroup();
    const awa = await join(org, groupId, code, 'Awa', 's2');
    const kofi = await join(org, groupId, code, 'Kofi', 's3');
    await org.call('tontineGroup', { action: 'setTreasurer', groupId, uid: awa.uid });
    const before = (await history(groupId)).length;
    await kofi.call('deleteAccount', {});
    let g = await groupOf(groupId);
    expect(g.memberUids).not.toContain(kofi.uid);
    expect(g.slots[2]).toMatchObject({ uid: null, former: true });
    expect((await history(groupId)).length).toBeGreaterThan(before);
    await org.call('deleteAccount', {});
    g = await groupOf(groupId);
    expect(g).toMatchObject({ organizerUid: awa.uid, treasurerUid: null, status: 'active' });
  });
});

describe('administration', () => {
  it('statistiques agrégées réservées au droit admin, sans nom', async () => {
    await newGroup();
    const user = await account('Awa');
    expect(await refusal(user.call('adminTontineStats', {}))).toBe('admin/required');
    const boss = await account('Admin', { claims: { admin: true } });
    const stats = await boss.call<Record<string, number>>('adminTontineStats', {});
    expect(stats.groups).toBeGreaterThan(0);
    expect(stats.averageMembers).toBeGreaterThan(0);
    expect(stats.invites).toBeGreaterThan(0);
    expect(JSON.stringify(stats)).not.toMatch(/Fatou|Awa|Kofi|uid/);
  });
});
