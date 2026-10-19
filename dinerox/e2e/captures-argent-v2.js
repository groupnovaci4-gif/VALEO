/*
 * Captures des écrans nouveaux ou modifiés de l'argent disponible v2 (docs/argent-disponible.md),
 * pour relecture du fondateur AVANT tout APK : web, deux tailles de téléphone, thème clair.
 * Sortie : docs/captures-argent-v2/<taille>/<nn-nom>.png. Lancement (émulateurs + export servis) :
 *   node e2e/captures-argent-v2.js
 *   ONLY=09,10,19 node e2e/captures-argent-v2.js   (tout le parcours, mais seules ces images sont réécrites)
 * Pas dans run-all.sh : ce n'est pas un test, c'est une galerie.
 */
const fs = require('fs');
const path = require('path');
const { BASE, launch } = require('./env.js');
const { uidOf, put, list, setFinancial, shift } = require('./seed.js');

const OUT = path.join(__dirname, '..', 'docs', 'captures-argent-v2');
const SIZES = [
  { name: '360x800', viewport: { width: 360, height: 800 } },
  { name: '412x915', viewport: { width: 412, height: 915 } },
];
const log = [];
// ONLY=09,10 : le parcours complet tourne (les états en dépendent), seules ces images sont réécrites.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((x) => x.trim())) : null;
const wanted = (name) => !ONLY || ONLY.has(name.slice(0, 2));

async function run(size) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: size.viewport, locale: 'fr-FR', colorScheme: 'light', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const dir = path.join(OUT, size.name);
  fs.mkdirSync(dir, { recursive: true });
  const go = async (route, w = 3000) => { await p.goto(BASE + route, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  const btn = async (name, opts = {}) => { await p.getByRole('button', { name, exact: opts.exact ?? true }).filter({ visible: true }).last().click({ timeout: 8000 }); await p.waitForTimeout(opts.w ?? 1200); };
  const tap = async (t, opts = {}) => { await p.getByText(t, { exact: opts.exact ?? true }).filter({ visible: true }).nth(opts.nth ?? 0).click(); await p.waitForTimeout(opts.w ?? 500); };
  const shot = async (name, full = true) => { if (!wanted(name)) return; await p.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full }); log.push(`${size.name}/${name}`); };
  const step = async (name, fn) => { console.log(`… ${size.name} ${name}`); try { await fn(); } catch (e) { console.log(`✗ ${size.name} ${name} : ${e.message.split('\n')[0]}`); await shot(`${name}-ERREUR`).catch(() => {}); } };

  // ── Compte neuf ──
  const email = `captures${size.viewport.width}${Date.now()}@ex.com`;
  await go('/'); await tap('Créer mon compte', { exact: false });
  await fill('Nom', 'Koffi', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', email);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await tap('Plus tard'); await p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
  const uid = await uidOf(email);

  await step('01-accueil-argent-du-jour', async () => { await go('/'); await shot('01-accueil-argent-du-jour'); });
  await step('02-feuille-aucun-argent', async () => {
    await go('/transaction/new?type=expense'); await fill('Montant', '5000'); await tap('Alimentation & boissons');
    await btn('Enregistrer'); await shot('02-feuille-aucun-argent', false);
  });
  await step('03-accueil-reste-par-jour', async () => {
    await go('/');
    await p.getByLabel('Cash', { exact: true }).first().fill('100000');
    await fill("D'où vient cet argent ? (facultatif)", 'Argent gardé à la maison');
    await btn('Enregistrer mon argent disponible', { w: 2500 });
    await shot('03-accueil-reste-par-jour');
  });
  await step('04-comment-c-est-calcule', async () => { await btn("Comment c'est calculé ?", { w: 800 }); await shot('04-comment-c-est-calcule'); });
  await step('05-compte-nouveau-provenance', async () => {
    await go('/accounts/edit'); await tap('Orange Money', { exact: false });
    await fill('Argent déjà sur ce compte', '40000'); await fill("D'où vient cet argent ? (facultatif)", 'Reste du salaire de septembre');
    await shot('05-compte-nouveau-provenance'); await btn('Enregistrer', { w: 2000 });
  });
  await step('06-feuille-complement', async () => {
    await go('/transaction/new?type=expense'); await fill('Montant', '120000'); await tap('Alimentation & boissons');
    await btn('Enregistrer'); await shot('06-feuille-complement', false);
  });
  await step('07-feuille-j-ai-recu', async () => { await btn("J'ai reçu de l'argent", { w: 800 }); await shot('07-feuille-j-ai-recu', false); await btn('Annuler', { w: 600 }); });
  await step('08-transfert-frais', async () => { await go('/transaction/new?type=transfer'); await fill('Montant', '20000'); await fill('Frais (facultatif)', '300'); await shot('08-transfert-frais'); });

  // ── États amorcés : échéances, solde négatif, tontine terminée, jour de paie ──
  let cash = 'acc_cash_auto';
  await step('amorçage', async () => {
    cash = (await list(uid, 'accounts')).find((a) => a.name === 'Cash')?.id ?? cash;
    await put(uid, 'recurring', { id: 'cap_loyer', type: 'expense', label: 'Loyer', amount: 30000, currency: 'XOF', accountId: cash, categoryId: 'cat_housing', frequency: 'monthly', startDate: shift(-3, -1), active: true, lastGenerated: null });
    await put(uid, 'recurring', { id: 'cap_salaire', type: 'income', label: 'Salaire', amount: 200000, currency: 'XOF', accountId: cash, categoryId: 'inc_salary', frequency: 'monthly', startDate: shift(-2, -2), active: true, lastGenerated: null });
    await put(uid, 'accounts', { id: 'cap_wave', name: 'Wave', type: 'mobile_money', provider: 'wave', currency: 'XOF', openingBalance: 10000, openingDate: shift(-1), openingNote: 'Reste du mois dernier', color: '#1D9BF0', icon: 'phone-portrait', active: true, isSavings: false, order: 5 });
    for (const [i, amount] of [[1, 15000], [2, 15000]]) await put(uid, 'transactions', { id: `cap_neg${i}`, type: 'expense', amount, currency: 'XOF', date: shift(0, -1), accountId: 'cap_wave', categoryId: 'cat_food', toAccountId: null, toAmount: null, subcategoryId: null, envelopeId: null, payee: null, note: null });
    await put(uid, 'tontines', { id: 'cap_tontine', type: 'rotating', name: 'Tontine du marché', currency: 'XOF', amountPerShare: 10000, sharesHeld: 1, frequency: 'monthly', startDate: shift(-5), membersCount: 3, myTurns: [3], status: 'active', accountId: null, organizerName: null });
    await setFinancial(uid, 'payDay', Number(shift(0, -3).slice(8)));
    await p.waitForTimeout(3000);
  });
  await step('09-accueil-cartes', async () => { await go('/', 4000); await shot('09-accueil-cartes'); });
  // Un compte qui a déjà des opérations : « Argent déjà sur ce compte » en lecture seule (§3.2).
  await step('10-compte-edition', async () => { await go('/accounts/edit?id=cap_wave'); await shot('10-compte-edition'); });
  await step('11-feuille-corriger-le-solde', async () => { await btn('Corriger le solde', { w: 800 }); await fill('Motif', 'Écart de caisse'); await shot('11-feuille-corriger-le-solde', false); });
  await step('12-feuille-reste-desactivation', async () => { await go(`/accounts/edit?id=${cash}`); await p.getByRole('switch', { name: 'Compte actif' }).click(); await p.waitForTimeout(800); await shot('12-feuille-reste-desactivation', false); });
  await step('13-epargne-origine', async () => { await go('/accounts/edit?savings=1'); await fill('Montant', '50000'); await shot('13-epargne-origine'); });
  await step('14-objectif-origine', async () => {
    await go('/goals/new'); await tap('✏️ Créer mon propre objectif', { exact: false });
    await p.getByPlaceholder('Ex. Acheter une machine à glace').fill('Moto'); await btn('Continuer', { w: 800 });
    await fill('Montant cible', '500000'); await fill('Montant de départ (facultatif)', '30000');
    await shot('14-objectif-origine');
    await p.getByRole('button', { name: "Créer l'objectif" }).or(p.getByRole('button', { name: 'Créer l’objectif' })).first().click(); await p.waitForTimeout(2500);
  });
  await step('15-feuille-fermeture-poche', async () => {
    await btn('Archiver', { exact: false, w: 1500 });
    await shot('15-feuille-fermeture-poche', false);
  });
  await step('16-dette-compte', async () => { await go('/debts/edit'); await fill('Personne / institution', 'Banque Atlantique'); await fill('Montant initial', '200000'); await shot('16-dette-compte'); await tap('Orange Money', { exact: false }); await btn('Enregistrer', { w: 2000 }); });
  await step('17-remboursement-interets', async () => {
    await go('/debts'); await tap('Banque Atlantique', { exact: false }); await p.waitForTimeout(800);
    await tap('Enregistrer un remboursement', { exact: false }); await fill('Montant', '55000'); await fill('Dont intérêts (facultatif)', '5000');
    await shot('17-remboursement-interets', false); await btn('Enregistrer', { w: 2000 });
  });
  await step('18-dette-cloture', async () => { await btn('Clôturer', { exact: false, w: 800 }).catch(() => {}); await shot('18-dette-cloture', false); });
  // Clôturer : la feuille signale d'abord les cotisations et la cagnotte non notées (§5.4).
  await step('19-tontine-cloturer', async () => { await go('/tontines/cap_tontine'); await btn('Clôturer', { w: 1000 }); await shot('19-tontine-cloturer', false); await btn('Fermer', { w: 500 }).catch(() => {}); });
  await step('20-rapport', async () => { await go('/reports'); await shot('20-rapport'); });
  await step('21-releve-compte', async () => { await go(`/transactions?accountId=${cash}`); await shot('21-releve-compte'); });
  await step('22-budget-reste-a-repartir', async () => {
    await go('/envelopes/edit'); await fill('Nom', 'Maison', true); await fill('Budget mensuel', '50000'); await tap('Maison & logement'); await btn('Enregistrer', { w: 1500 });
    await setFinancial(uid, 'monthlyIncome', 400000); await p.waitForTimeout(1500);
    await go('/budget'); await shot('22-budget-reste-a-repartir');
  });
  await step('23-analyse', async () => { await go('/analysis'); await shot('23-analyse'); });
  await step('24-score', async () => { await go('/score'); await shot('24-score'); });
  await step('25-reserve-origine', async () => { await go('/reserve/new'); await fill('Plafond cible', '120000').catch(() => {}); await fill('Montant de départ', '20000').catch(() => {}); await shot('25-reserve-origine'); });
  await step('26-inscription-sources-sans-montant', async () => { await go('/settings/financial'); await shot('26-inscription-sources-sans-montant'); });
  await step('27-historique', async () => { await go('/transactions'); await shot('27-historique'); });
  await b.close();
}

(async () => {
  // Seulement les images (index.md, rédigé à la main, est gardé).
  if (!ONLY) for (const sz of SIZES) fs.rmSync(path.join(OUT, sz.name), { recursive: true, force: true });
  for (const s of SIZES) await run(s);
  if (!ONLY) fs.writeFileSync(path.join(OUT, 'liste.txt'), log.join('\n') + '\n');
  console.log(`${log.length} captures → ${OUT}`);
})().catch((e) => { console.log('ARRÊT', e.message); process.exitCode = 1; });
