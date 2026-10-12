/**
 * Données FICTIVES pour voir le portail en local (émulateurs) :
 *   node admin/scripts/seed-emulators.mjs
 * - Super Admin (double vérification à activer à la 1re connexion, avec votre appli) ;
 * - Administratrice, Support, Analyste (double vérification déjà activée : code donné par
 *   `node admin/scripts/demo-code.mjs <e-mail>`) ;
 * - une dizaine d'utilisateurs de l'app, avec espaces, opérations liées et une famille.
 */
import { auth, db, PROJECT, upsertStaff } from './emulator-lib.mjs';

const PASSWORD = 'Demo-Back-office-1';
export const DEMO_STAFF = [
  { email: 'koffi@dinerox-demo.test', displayName: 'Koffi B.', roleId: 'superAdmin', password: PASSWORD, secret: null },
  { email: 'clarisse@dinerox-demo.test', displayName: 'Clarisse A.', roleId: 'admin', password: PASSWORD, secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' },
  { email: 'didier@dinerox-demo.test', displayName: 'Didier K.', roleId: 'support', password: PASSWORD, secret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' },
  { email: 'awa@dinerox-demo.test', displayName: 'Awa S.', roleId: 'analyste', password: PASSWORD, secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
];

const USERS = [
  ['Aïcha', 'Koné', 'CI', 'XOF', 'family'], ['Moussa', 'Traoré', 'ML', 'XOF', 'plus'], ['Fatou', 'Ndiaye', 'SN', 'XOF', 'free'],
  ['Jean-Marc', 'Yao', 'CI', 'XOF', 'free'], ['Awa', 'Ouédraogo', 'BF', 'XOF', 'plus'], ['Kofi', 'Mensah', 'TG', 'XOF', 'free'],
  ['Mariam', 'Diallo', 'GN', 'GNF', 'free'], ['Serge', 'Bamba', 'CI', 'XOF', 'family'], ['Adjoua', 'Kouamé', 'CI', 'XOF', 'free'],
  ['Bakary', 'Sangaré', 'ML', 'XOF', 'free'], ['Nadia', 'Benali', 'MA', 'MAD', 'plus'], ['Paul', 'Mbarga', 'CM', 'XAF', 'free'],
];
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Vide les émulateurs (Auth + Firestore) : `--reset`. Jamais un vrai projet (demo-…). */
async function resetEmulators() {
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

export async function seed({ reset = false, quiet = false } = {}) {
  if (reset) await resetEmulators();
  for (const s of DEMO_STAFF) await upsertStaff(s);
  const now = Date.now();
  const uids = [];
  for (let i = 0; i < USERS.length; i++) {
    const [fn, ln, country, currency, plan] = USERS[i];
    const email = `${slug(fn)}.${slug(ln)}@exemple.test`;
    let u = await auth.getUserByEmail(email).catch(() => null);
    if (!u) u = await auth.createUser({ email, password: 'motdepasse123', displayName: `${fn} ${ln}`, emailVerified: i % 3 !== 0 });
    uids.push(u.uid);
    const created = now - (USERS.length - i) * 6 * DAY;
    await db.doc(`users/${u.uid}`).set({
      uid: u.uid, firstName: fn, lastName: ln, email, phone: null, country, currency, photoURL: null, language: 'fr', timezone: 'Africa/Abidjan',
      preferences: {}, subscription: plan === 'free' ? { plan: 'free', status: 'active', provider: 'none', expiresAt: null, updatedAt: created } : { plan, status: 'active', provider: 'manual', expiresAt: now + 120 * DAY, updatedAt: created },
      onboarding: { completed: true }, termsAcceptedVersion: '2026-05', createdAt: created, updatedAt: now - (i % 5) * DAY,
    });
    await db.doc(`spaces/${u.uid}`).set({ id: u.uid, kind: 'personal', name: fn, ownerId: u.uid, members: { [u.uid]: 'admin' }, memberIds: [u.uid], memberNames: { [u.uid]: fn }, currency, createdAt: created, updatedAt: created });
    await db.doc(`users/${u.uid}/devices/d1`).set({ token: `ExponentPushToken[demo${i}]`, platform: 'android', updatedAt: created });
  }
  // Fatou : compte suspendu.
  await auth.updateUser(uids[2], { disabled: true });
  await db.doc(`accountStatus/${uids[2]}`).set({ status: 'suspended', since: now - 2 * DAY, by: 'seed', reasonCode: 'fraud_suspicion' });
  // Famille Koné : Aïcha (admin) + Serge.
  const fam = 'fam_kone';
  await db.doc(`spaces/${fam}`).set({ id: fam, kind: 'family', name: 'Famille Koné', ownerId: uids[0], members: { [uids[0]]: 'admin', [uids[7]]: 'partner' }, memberIds: [uids[0], uids[7]], memberNames: { [uids[0]]: 'Aïcha', [uids[7]]: 'Serge' }, currency: 'XOF', createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY });
  const base = (by, ms) => ({ createdAt: ms, updatedAt: ms, createdBy: by, syncedAt: new Date(ms), currency: 'XOF' });
  const put = (sp, col, id, doc) => db.doc(`spaces/${sp}/${col}/${id}`).set({ id, ...doc });
  for (const sp of [uids[0], fam]) {
    const by = uids[0];
    await put(sp, 'accounts', 'acc_cash', { ...base(by, now - 50 * DAY), name: 'Espèces', type: 'cash', provider: 'none', openingBalance: 0, active: true, isSavings: false, color: '#16A34A', icon: 'cash', order: 0 });
    await put(sp, 'accounts', 'acc_om', { ...base(by, now - 50 * DAY), name: 'Orange Money', type: 'mobile', provider: 'orange_money', openingBalance: 0, active: true, isSavings: false, color: '#F97316', icon: 'phone', order: 1 });
    await put(sp, 'accounts', 'acc_bank', { ...base(by, now - 50 * DAY), name: 'Banque', type: 'bank', provider: 'none', openingBalance: 0, active: true, isSavings: false, color: '#2563EB', icon: 'bank', order: 2 });
  }
  const ops = [
    [1, 'expense', 7500, 'cat_transport', 'acc_om', uids[0]], [2, 'expense', 45000, 'cat_family', 'acc_cash', uids[0]], [3, 'income', 350000, 'inc_salary', 'acc_bank', uids[0]],
    [5, 'expense', 10000, 'cat_social', 'acc_om', uids[7]], [6, 'expense', 25000, 'cat_debts', 'acc_om', uids[0]], [8, 'expense', 18250, 'cat_food', 'acc_cash', uids[7]],
    [10, 'expense', 60000, 'cat_housing', 'acc_bank', uids[0]],
  ];
  for (const [d, type, amount, cat, acc, by] of ops) {
    await put(fam, 'transactions', `tx_demo_${d}`, { ...base(by, now - d * DAY), type, amount, date: iso(now - d * DAY), accountId: acc, categoryId: cat, payee: 'Masqué dans le portail', note: 'Note privée' });
  }
  await put(fam, 'debts', 'debt_1', { ...base(uids[0], now - 30 * DAY), direction: 'i_owe', principal: 100000, counterparty: 'Prêt Adjoua' });
  await put(fam, 'debtPayments', 'dp_1', { ...base(uids[0], now - 6 * DAY), debtId: 'debt_1', amount: 25000, date: iso(now - 6 * DAY), transactionId: 'tx_demo_6' });
  await put(fam, 'tontines', 'ton_1', { ...base(uids[7], now - 40 * DAY), type: 'rotating', name: 'Tontine du quartier', amountPerShare: 10000, sharesHeld: 1, frequency: 'monthly', startDate: iso(now - 40 * DAY), status: 'active' });
  await put(fam, 'tontineEntries', 'tne_1', { ...base(uids[7], now - 5 * DAY), tontineId: 'ton_1', kind: 'contribution', period: 2, amount: 10000, date: iso(now - 5 * DAY), status: 'done', transactionId: 'tx_demo_5' });
  for (let k = 0; k < 4; k++) await put(uids[0], 'transactions', `tx_perso_${k}`, { ...base(uids[0], now - (k + 1) * DAY), type: 'expense', amount: 2500 * (k + 1), date: iso(now - (k + 1) * DAY), accountId: 'acc_cash', categoryId: 'cat_food' });
  if (quiet) return;
  console.log('Émulateurs remplis (données fictives).');
  console.log('Connexion au portail (mot de passe de tous les collaborateurs de démonstration) :', PASSWORD);
  for (const s of DEMO_STAFF) console.log(`  ${s.roleId.padEnd(10)} ${s.email}${s.secret ? '  (code : node admin/scripts/demo-code.mjs ' + s.email + ')' : '  (QR code à scanner à la 1re connexion)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) seed({ reset: process.argv.includes('--reset') }).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
