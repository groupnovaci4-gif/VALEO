/// <reference types="node" />
/**
 * Suppression d'une opération par le back-office, vue par DEUX téléphones qui
 * font tourner le vrai moteur de l'app (SyncEngine + firestoreRemote) sur
 * l'émulateur, règles Firestore actives :
 *  - le téléphone A (en ligne) voit l'opération ET ses écritures liées disparaître ;
 *  - le téléphone B, resté hors ligne avec une modification plus récente, se
 *    reconnecte : son écriture est refusée, la marque est rétablie, l'opération
 *    ne revient pas — ni chez lui, ni sur le serveur, ni chez A.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';
import type { SyncedDoc } from '../../src/core/types';
import { appUser, auditLines, call, db, outcome, staff, waitFor, type Caller } from './helpers';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    getAllKeys: async () => [...mem.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => mem.delete(k)),
  },
}));
// firestoreRemote() lit `firebase().db` : on lui donne la base du téléphone en cours de création.
let currentDb: Firestore | null = null;
vi.mock('../../src/services/firebase', () => ({ firebase: () => ({ db: currentDb }) }));

const { SyncEngine } = await import('../../src/services/sync/engine');
const { firestoreRemote } = await import('../../src/services/sync/remote');

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const project = process.env.GCLOUD_PROJECT ?? 'demo-dinerox';

async function phone(name: string, email: string, password: string, uid: string) {
  const app: FirebaseApp = initializeApp({ apiKey: 'fake-api-key', projectId: project, appId: '1:1:web:1' }, name);
  const a = getAuth(app);
  connectAuthEmulator(a, `http://${authHost}`, { disableWarnings: true });
  await signInWithEmailAndPassword(a, email, password);
  const fs = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const [h, p] = host.split(':');
  connectFirestoreEmulator(fs, h, Number(p));
  currentDb = fs;
  const engine = new SyncEngine(uid, firestoreRemote());
  return { app, engine };
}

const base = { createdAt: 1, currency: 'XOF', date: '2026-10-10' };

describe('suppression par le back-office sur deux appareils', () => {
  let user: { uid: string; email: string };
  let superAdmin: Caller;
  let admin: Caller;
  beforeAll(async () => {
    user = await appUser({ password: 'Motdepasse-1' });
    superAdmin = await staff('superAdmin');
    admin = await staff('admin');
  });

  it('les écritures liées partent avec l’opération, et rien ne revient du téléphone hors ligne', async () => {
    const A = await phone('phoneA', user.email, 'Motdepasse-1', user.uid);
    const B = await phone('phoneB', user.email, 'Motdepasse-1', user.uid);
    const s = user.uid;
    await A.engine.open(s, 'admin');
    await B.engine.open(s, 'admin');

    // Saisies sur A : dépense remboursant une dette, cotisation de tontine, dépense prise sur une réserve (+ transfert).
    const w = <T extends object>(col: string, doc: T) => A.engine.write(s, col as never, { ...base, ...doc } as never);
    w('accounts', { id: 'acc1', name: 'Espèces', type: 'cash', provider: 'none', openingBalance: 0, active: true, isSavings: false, color: '#000', icon: 'cash', order: 0 });
    w('accounts', { id: 'acc2', name: 'Banque', type: 'bank', provider: 'none', openingBalance: 0, active: true, isSavings: false, color: '#000', icon: 'bank', order: 1 });
    w('debts', { id: 'd1', direction: 'i_owe', principal: 100000, counterparty: 'Banque' });
    w('goals', { id: 'res1', name: 'Réserve famille', kind: 'reserve', targetAmount: 0, initialAmount: 50000, status: 'active', priority: 'normal' });
    w('tontines', { id: 'ton1', type: 'rotating', name: 'Tontine', amountPerShare: 10000, sharesHeld: 1, frequency: 'monthly', startDate: '2026-01-01', status: 'active' });
    w('transactions', { id: 'tx1', type: 'expense', amount: 25000, accountId: 'acc1', note: 'remboursement', payee: 'Banque' });
    w('debtPayments', { id: 'dp1', debtId: 'd1', amount: 25000, transactionId: 'tx1' });
    w('tontineEntries', { id: 'te1', tontineId: 'ton1', kind: 'contribution', period: 1, amount: 25000, status: 'done', transactionId: 'tx1' });
    w('transactions', { id: 'trf1', type: 'transfer', amount: 20000, accountId: 'acc2', toAccountId: 'acc1' });
    w('goalContributions', { id: 'gc1', goalId: 'res1', amount: -20000, accountId: 'acc1', transferId: 'trf1', linkedTransactionId: 'tx1' });
    w('transactions', { id: 'tx2', type: 'expense', amount: 1000, accountId: 'acc1' });

    // B reçoit tout.
    await waitFor(() => B.engine.getData(s).transactions.length === 3 && B.engine.getData(s).goalContributions.length === 1 && B.engine.getData(s).tontineEntries.length === 1);
    expect(A.engine.getStatus().pending).toBe(0);

    // B passe hors ligne et modifie l'opération (horloge en avance d'une heure).
    B.engine.setOnline(false);
    const later = Date.now() + 3600_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    B.engine.write(s, 'transactions', { ...(B.engine.getDoc(s, 'transactions', 'tx1') as SyncedDoc), amount: 99000 } as never);
    B.engine.write(s, 'transactions', { ...base, id: 'tx3', type: 'expense', amount: 500, accountId: 'acc1' } as never);
    vi.restoreAllMocks();

    // L'Administratrice consulte (motif) mais ne peut pas supprimer.
    const adminAccess = await call<{ accessId: string }>('boOpenData', admin, { uid: user.uid, reasonCode: 'client_request' });
    expect(await outcome('boPreviewDelete', admin, { accessId: adminAccess.accessId, spaceId: s, txId: 'tx1' })).toEqual({ status: 'permission-denied', message: 'bo/permission' });
    expect(await outcome('boDeleteTransaction', admin, { accessId: adminAccess.accessId, spaceId: s, txId: 'tx1', reasonCode: 'client_request', confirm: 'SUPPRIMER' })).toEqual({ status: 'permission-denied', message: 'bo/permission' });

    // Le Super Admin : motif, aperçu des effets, double confirmation.
    const access = await call<{ accessId: string }>('boOpenData', superAdmin, { uid: user.uid, reasonCode: 'client_request' });
    const list = await call<{ items: Record<string, unknown>[] }>('boListTransactions', superAdmin, { accessId: access.accessId, spaceId: s });
    expect(list.items.map((t) => t.id).sort()).toEqual(['trf1', 'tx1', 'tx2']);
    expect(JSON.stringify(list.items)).not.toMatch(/remboursement|payee|"note"/); // D9
    expect(list.items.find((t) => t.id === 'tx1')?.linked).toBe(3);
    const preview = await call<{ effects: Record<string, number> }>('boPreviewDelete', superAdmin, { accessId: access.accessId, spaceId: s, txId: 'tx1' });
    expect(preview.effects).toEqual({ debtPayment: 1, tontineEntry: 1, reserveUse: 1, reserveTransfer: 1 });
    expect(await outcome('boDeleteTransaction', superAdmin, { accessId: access.accessId, spaceId: s, txId: 'tx1', reasonCode: 'client_request', confirm: 'oui' })).toEqual({ status: 'invalid-argument', message: 'bo/confirm' });
    const res = await call<{ removed: number }>('boDeleteTransaction', superAdmin, { accessId: access.accessId, spaceId: s, txId: 'tx1', reasonCode: 'client_request', confirm: 'SUPPRIMER' });
    expect(res.removed).toBe(5);

    // Serveur : marques horodatées, jamais d'effacement physique, contenu intact.
    for (const [col, id] of [['transactions', 'tx1'], ['debtPayments', 'dp1'], ['tontineEntries', 'te1'], ['goalContributions', 'gc1'], ['transactions', 'trf1']]) {
      const d = await db().doc(`spaces/${s}/${col}/${id}`).get();
      expect(d.exists, `${col}/${id}`).toBe(true);
      expect(d.get('deleted')).toBe(true);
      expect(d.get('adminDeleted')).toBe(true);
    }
    expect((await db().doc(`spaces/${s}/transactions/tx1`).get()).get('amount')).toBe(25000);

    // A (en ligne) : tout disparaît, la dette n'est plus « payée », la réserve retrouve son solde.
    await waitFor(() => {
      const d = A.engine.getData(s);
      return d.transactions.map((t) => t.id).join() === 'tx2' && d.debtPayments.length === 0 && d.tontineEntries.length === 0 && d.goalContributions.length === 0;
    });

    // B revient en ligne : son écriture plus récente est refusée UNE fois, la marque est rétablie.
    B.engine.setOnline(true);
    await waitFor(() => B.engine.getStatus().pending === 0 && B.engine.getData(s).transactions.some((t) => t.id === 'tx3'));
    await waitFor(() => !B.engine.getData(s).transactions.some((t) => t.id === 'tx1'));
    const bData = B.engine.getData(s);
    expect(bData.transactions.map((t) => t.id).sort()).toEqual(['tx2', 'tx3']);
    expect(bData.debtPayments).toHaveLength(0);
    // La synchronisation n'est pas bloquée : tx3 (saisie hors ligne) est arrivée sur le serveur et chez A.
    expect((await db().doc(`spaces/${s}/transactions/tx3`).get()).exists).toBe(true);
    await waitFor(() => A.engine.getData(s).transactions.some((t) => t.id === 'tx3'));
    // Rien n'est revenu : serveur toujours supprimé, montant d'origine.
    const tx1 = await db().doc(`spaces/${s}/transactions/tx1`).get();
    expect(tx1.get('deleted')).toBe(true);
    expect(tx1.get('amount')).toBe(25000);
    await new Promise((r) => setTimeout(r, 1500));
    expect(A.engine.getData(s).transactions.some((t) => t.id === 'tx1')).toBe(false);
    expect(B.engine.getStatus().pending).toBe(0);

    // Journal : motif, références, types d'effets — aucun montant, bénéficiaire ni note.
    const line = (await auditLines((l) => l.action === 'data.delete' && l.result === 'ok')).pop()!;
    expect(line).toMatchObject({ actorUid: superAdmin.uid, targetUid: user.uid, spaceId: s, reasonCode: 'client_request', effects: { debtPayment: 1, tontineEntry: 1, reserveUse: 1, reserveTransfer: 1 } });
    expect(JSON.stringify(line)).not.toMatch(/25000|99000|remboursement|Banque/);
    expect((await auditLines((l) => l.action === 'data.view' && l.actorUid === admin.uid))[0]).toMatchObject({ reasonCode: 'client_request', result: 'ok' });

    A.engine.destroy();
    B.engine.destroy();
    await deleteApp(A.app);
    await deleteApp(B.app);
  });

  it('accès aux opérations : motif obligatoire, accès personnel et limité à l’utilisateur consulté', async () => {
    expect(await outcome('boOpenData', superAdmin, { uid: user.uid })).toEqual({ status: 'invalid-argument', message: 'bo/reason' });
    expect(await outcome('boOpenData', superAdmin, { uid: user.uid, reasonCode: 'other' })).toEqual({ status: 'invalid-argument', message: 'bo/reason' });
    const access = await call<{ accessId: string }>('boOpenData', superAdmin, { uid: user.uid, reasonCode: 'other', reasonNote: 'Contrôle qualité' });
    // L'accès d'un collègue n'est pas réutilisable.
    const other = await staff('superAdmin');
    expect(await outcome('boListTransactions', other, { accessId: access.accessId, spaceId: user.uid })).toEqual({ status: 'failed-precondition', message: 'bo/access-expired' });
    // Un autre espace que ceux de l'utilisateur consulté : refusé.
    const stranger = await appUser();
    expect(await outcome('boListTransactions', superAdmin, { accessId: access.accessId, spaceId: stranger.uid })).toEqual({ status: 'permission-denied', message: 'bo/space-mismatch' });
    // Accès expiré.
    await db().doc(`boAccess/${access.accessId}`).update({ expiresAt: Date.now() - 1 });
    expect(await outcome('boListTransactions', superAdmin, { accessId: access.accessId, spaceId: user.uid })).toEqual({ status: 'failed-precondition', message: 'bo/access-expired' });
  });
});
