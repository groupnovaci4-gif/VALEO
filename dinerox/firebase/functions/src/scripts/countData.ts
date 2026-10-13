/**
 * Comptages en LECTURE SEULE d'une base Firestore et des comptes Auth (aucune donnée affichée,
 * seulement des nombres). Sert à mesurer la base avant le déménagement et à vérifier, après,
 * que tout est arrivé (docs/migration-europe.md).
 *
 *   gcloud auth application-default login
 *   gcloud auth application-default set-quota-project dinerox-app
 *   cd dinerox/firebase/functions && npm run build
 *   GOOGLE_CLOUD_PROJECT=dinerox-app node lib/scripts/countData.js [--database "(default)"] [--json fichier.json] [--compare avant.json]
 *
 * Coût : les comptages Firestore sont facturés 1 lecture par tranche de 1 000 documents comptés
 * (quelques lectures au total) ; la liste des comptes Auth est gratuite.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/** Collections connues (miroir de COLLECTIONS de l'app + collections serveur). */
const TOP = ['users', 'spaces', 'subscriptions', 'usage', 'invites', 'config', 'analyticsEvents', 'accountStatus', 'boStaff', 'boRoles', 'boSessions', 'boAccess', 'boAudit', 'boAuditHead', 'boStats', 'boLoginGuard', 'boInvites'];
const SPACE_SUB = ['accounts', 'categories', 'transactions', 'recurring', 'envelopes', 'budgets', 'goals', 'goalContributions', 'debts', 'debtPayments', 'assets', 'tontines', 'tontineEntries'];
const USER_SUB = ['devices', 'coachEvents', 'rewards'];
const CONFIG_SUB = ['items'];

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const database = opt('--database') ?? '(default)';
  const out = opt('--json');
  if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.GOOGLE_CLOUD_PROJECT) throw new Error('Indiquez le projet : GOOGLE_CLOUD_PROJECT=dinerox-app');
  initializeApp(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : undefined);
  const db = database === '(default)' ? getFirestore() : getFirestore(database);

  const counts: Record<string, number> = {};
  for (const c of TOP) counts[c] = (await db.collection(c).count().get()).data().count;
  // Sous-collections : comptage par « groupe de collections » (toutes les sous-collections de ce nom).
  for (const c of [...SPACE_SUB, ...USER_SUB, ...CONFIG_SUB]) counts[`*/${c}`] = (await db.collectionGroup(c).count().get()).data().count;

  let authUsers = 0;
  let disabled = 0;
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    authUsers += page.users.length;
    disabled += page.users.filter((u) => u.disabled).length;
    pageToken = page.pageToken;
  } while (pageToken);

  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  const result = { projet: process.env.GOOGLE_CLOUD_PROJECT ?? 'émulateur', base: database, date: new Date().toISOString(), comptesAuth: authUsers, comptesAuthDesactives: disabled, documentsTotal: total, collections: counts };
  console.log(JSON.stringify(result, null, 2));
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
  // --compare avant.json : chaque collection doit avoir AU MOINS autant de documents qu'avant.
  const cmp = opt('--compare');
  if (cmp) {
    const before = JSON.parse(readFileSync(cmp, 'utf8')) as typeof result;
    const missing = Object.entries(before.collections).filter(([k, n]) => (counts[k] ?? 0) < n);
    for (const [k, n] of Object.entries(before.collections)) if ((counts[k] ?? 0) !== n) console.log(`${(counts[k] ?? 0) < n ? 'MANQUE' : 'plus  '} ${k} : avant ${n}, maintenant ${counts[k] ?? 0}`);
    if (authUsers !== before.comptesAuth) console.log(`comptes Auth : avant ${before.comptesAuth}, maintenant ${authUsers}`);
    console.log(missing.length ? `ÉCHEC : ${missing.length} collection(s) avec moins de documents qu'avant.` : 'OK : aucune collection n’a perdu de document.');
    if (missing.length) process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
