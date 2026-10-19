/*
 * Captures des corrections de l'audit avant l'APK (docs/audit-avant-apk.md) pour le fondateur :
 * web, thème clair, 412×915, ÉMULATEURS (jamais la production). Sortie : docs/captures-audit/.
 *   node e2e/captures-audit.js
 * Les données sont amorcées dans l'émulateur (e2e/seed.js) : un compte en euros et des opérations
 * datées après aujourd'hui sont longs à produire au clic. Trois personnes :
 *  - Aya (FCFA, compte « Compte Paris » en euros) : fiche d'un compte avec « À venir », accueil avec
 *    « À venir ce mois » et la ligne « En euros », réponse de l'IA pour le compte en euros ;
 *  - Claire (espace en euros) : carte de l'IA « Mets 12,50 de côté » ;
 *  - Kofi (enfant d'un espace famille) : accueil sans reste par jour, « Demandez à un parent ».
 * Pas dans run-all.sh : ce n'est pas un test, c'est une galerie.
 */
const fs = require('fs');
const path = require('path');
const { BASE, launch } = require('./env.js');
const { uidOf, put, iso } = require('./seed.js');

const OUT = path.join(__dirname, '..', 'docs', 'captures-audit');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
const FS = 'http://127.0.0.1:8080/v1/projects/demo-dinerox/databases/(default)/documents';
const stamp = Date.now();
const log = [];

const now = new Date();
const day = (d) => iso(new Date(now.getFullYear(), now.getMonth(), d));
const today = now.getDate();
const past = (d) => day(Math.min(d, today));
const FUTURE = day(28);

/** Document brut (espace famille, devise d'un espace) : jeton « owner » de l'émulateur. */
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
async function patch(docPath, data) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(`${FS}/${docPath}?${mask}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
  if (!r.ok) throw new Error(`${docPath} : ${r.status} ${await r.text()}`);
}
const acc = (id, name, currency, openingBalance, extra = {}) => ({ id, name, type: 'cash', provider: 'none', currency, openingBalance, openingDate: day(1), color: '#0E7C66', icon: 'cash', active: true, isSavings: false, order: 0, ...extra });
const tx = (id, type, amount, currency, date, accountId, categoryId, extra = {}) => ({ id, type, amount, currency, date, accountId, categoryId, ...extra });

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, locale: 'fr-FR', colorScheme: 'light', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const go = async (route, w = 3500) => { await p.goto(BASE + route, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const shot = async (name, full = false) => { await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); log.push(name); };
  const closeCelebration = async () => { const c = btn('Continuer').filter({ visible: true }); if (await c.count()) { await c.first().click().catch(() => {}); await p.waitForTimeout(400); } };
  const signUp = async (first, email) => {
    await go('/', 2500);
    await p.getByText('Créer mon compte').first().click(); await p.waitForTimeout(600);
    await p.getByLabel('Nom', { exact: true }).fill('Test'); await p.getByLabel('Prénom').fill(first); await p.getByLabel('Adresse e-mail').fill(email);
    await p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
    await p.getByRole('switch').first().click();
    await p.getByRole('button', { name: 'Créer mon compte' }).click();
    await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
    await p.getByText('Plus tard', { exact: true }).click();
    await p.getByText(`Bonjour ${first}`).first().waitFor({ timeout: 12000 });
    await p.waitForTimeout(1500);
    return uidOf(email);
  };
  const signOut = async () => { await go('/settings', 2500); await p.getByText('Se déconnecter').last().click(); await p.waitForTimeout(2500); };
  const ask = async (phrase) => {
    await go('/assistant'); await closeCelebration();
    await p.getByPlaceholder('Écrivez comme vous parlez…').fill(phrase);
    await btn('Confirmer').last().click(); await p.waitForTimeout(1800);
  };

  // ── 1. Aya : FCFA, un compte à Paris en euros, un loyer noté d'avance pour le 28 ──────────
  const aya = await signUp('Aya', `aya${stamp}@ex.com`);
  await put(aya, 'accounts', acc('a_cash', 'Cash', 'XOF', 60_000));
  await put(aya, 'accounts', acc('a_om', 'Orange Money', 'XOF', 100_000, { type: 'mobile_money', provider: 'orange_money', icon: 'phone-portrait', order: 1 }));
  await put(aya, 'accounts', acc('a_paris', 'Compte Paris', 'EUR', 120_000, { type: 'bank', provider: 'bank', icon: 'business', order: 2 }));
  await put(aya, 'transactions', tx('t1', 'income', 180_000, 'XOF', past(2), 'a_cash', 'inc_business'));
  await put(aya, 'transactions', tx('t2', 'expense', 12_500, 'XOF', past(5), 'a_cash', 'cat_food'));
  await put(aya, 'transactions', tx('t3', 'expense', 30_000, 'XOF', FUTURE, 'a_om', 'cat_housing', { note: 'Loyer' }));
  await put(aya, 'transactions', tx('t4', 'income', 250_000, 'EUR', past(1), 'a_paris', 'inc_salary'));
  await put(aya, 'transactions', tx('t5', 'expense', 15_000, 'EUR', past(6), 'a_paris', 'cat_family'));
  await put(aya, 'envelopes', { id: 'e_house', name: 'Logement', icon: 'home', color: '#0E7C66', monthlyBudget: 50_000, categoryIds: ['cat_housing'], order: 0, active: true });
  await go('/', 5000); await closeCelebration();
  await go('/accounts/a_om'); await shot('01-fiche-compte-a-venir');
  await go('/'); await closeCelebration();
  const month = p.getByText('Mois en cours', { exact: true }).first();
  await month.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -80)); await p.waitForTimeout(500);
  await shot('02-accueil-a-venir-ce-mois-en-euros');
  await ask('Combien sur mon compte Paris ?'); await shot('03-ia-compte-en-euros');
  await ask('Mes comptes ?'); await shot('04-ia-liste-des-comptes');
  await signOut();

  // ── 2. Claire : espace en euros ─────────────────────────────────────────────────────────
  const claire = await signUp('Claire', `claire${stamp}@ex.com`);
  await patch(`spaces/${claire}`, { currency: 'EUR' });
  await put(claire, 'accounts', acc('c_cur', 'Compte courant', 'EUR', 150_000, { type: 'bank', provider: 'bank', icon: 'business' }));
  await put(claire, 'accounts', acc('c_liv', 'Livret A', 'EUR', 20_000, { type: 'savings', isSavings: true, icon: 'wallet', order: 1 }));
  await go('/', 5000); await closeCelebration();
  await ask('Mets 12,50 de côté');
  const cur = btn('Compte courant').filter({ visible: true });
  if (await cur.count()) { await cur.last().click(); await p.waitForTimeout(1000); }
  await shot('05-ia-carte-12-50-euros');
  await signOut();

  // ── 3. Kofi : enfant d'un espace famille (le parent y a loyer et tontine) ───────────────
  const kofi = await signUp('Kofi', `kofi${stamp}@ex.com`);
  const fam = `fam_audit${stamp}`;
  const parent = `parent${stamp}`;
  await patch(`spaces/${fam}`, { id: fam, kind: 'family', name: 'Famille Kouassi', ownerId: parent, members: { [parent]: 'admin', [kofi]: 'child' }, memberIds: [parent, kofi], memberNames: { [parent]: 'Maman', [kofi]: 'Kofi' }, currency: 'XOF', createdAt: Date.now(), updatedAt: Date.now() });
  await put(fam, 'accounts', acc('f_cash', 'Caisse de la maison', 'XOF', 310_000, { createdBy: parent }));
  await put(fam, 'recurring', { id: 'f_rent', type: 'expense', label: 'Loyer', amount: 100_000, currency: 'XOF', accountId: 'f_cash', categoryId: 'cat_housing', frequency: 'monthly', startDate: day(28), active: true, createdBy: parent });
  await go('/', 5000); await closeCelebration();
  await p.getByRole('button', { name: /^Espace affiché/ }).first().click(); await p.waitForTimeout(800);
  await p.getByText('Famille Kouassi').last().click(); await p.waitForTimeout(4000); await closeCelebration();
  await shot('06-enfant-accueil-espace-famille');
  const m = p.getByText('Mois en cours', { exact: true }).first();
  await m.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  await shot('07-enfant-reste-a-repartir');

  console.log(log.join('\n'));
  console.log(`${log.length} captures → ${OUT}`);
  await b.close();
})().catch((e) => { console.log('ARRÊT ' + e.message); process.exit(1); });
