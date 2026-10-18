/*
 * Objectifs — l'exemple exact du fondateur (compte réel, émulateurs) :
 *  1. créer « Acheter ma voiture », 1 000 000 FCFA → 0 % ;
 *  2. le 15 du mois : « Ajouter de l'argent » DEPUIS L'ONGLET Objectifs (bouton sur la carte,
 *     48 dp, nom de l'objectif lu par le lecteur d'écran), 200 000 → la fiche s'ouvre : 20 %,
 *     versement daté du 15 dans l'historique ;
 *  3. le 21 du mois : 100 000 → 30 % (versements du 15 et du 21 dans l'historique) ;
 *  4. jusqu'à 500 000 → 50 %, puis 900 000 → 90 % ; l'onglet montre aussi la progression.
 * Le sélecteur de date natif n'existe pas sur le web : l'horloge du navigateur est fixée au 15,
 * puis au 21 (« Aujourd'hui » de l'écran de versement) — c'est la date ENREGISTRÉE qui est vérifiée.
 */
const { BASE, launch, dayOfMonth, declareMoney } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };

const GOAL = 'Acheter ma voiture';
const email = `goal${Date.now()}@ex.com`;
const d15 = dayOfMonth(15), d21 = dayOfMonth(21);
const month = d15.toLocaleDateString('fr-FR', { month: 'long' });
let b;

const page = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  return { p, errs, text, btn, go, fill };
};

/** Versement depuis l'onglet Objectifs ; renvoie le texte de la fiche affichée ensuite. */
const addFromTab = async (h, amount) => {
  await h.go('/goals');
  const add = h.btn(`Ajouter de l’argent, ${GOAL}`);
  await add.first().click(); await h.p.waitForTimeout(1200);
  await h.fill('Montant', String(amount));
  await h.btn('Enregistrer').last().click(); await h.p.waitForTimeout(2500);
  return h.text();
};
/** Remplissage DESSINÉ de la barre de progression de l'objectif, en % (le web n'expose pas aria-valuenow). */
const barValue = async (h) => h.p.getByRole('progressbar', { name: GOAL }).first().evaluate((e) => Math.round(parseFloat(e.firstElementChild.style.width)));
const historyRows = (t) => (t.split('Historique des contributions')[1] || t.split('Historique')[1] || '');

(async () => {
  // ── Le 15 : inscription, objectif, premier versement ──
  b = await launch({ date: d15 });
  let h = await page(b);
  await h.go('/');
  await h.p.getByText('Créer mon compte', { exact: false }).first().click(); await h.p.waitForTimeout(800);
  await h.fill('Nom', 'Test', true); await h.fill('Prénom', 'Awa'); await h.fill('Adresse e-mail', email);
  await h.fill('Mot de passe', 'motdepasse123', true); await h.fill('Confirmer le mot de passe', 'motdepasse123');
  await h.p.getByRole('switch').first().click();
  await h.btn('Créer mon compte').click();
  await h.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await h.p.getByText('Plus tard', { exact: true }).click();
  await h.p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await h.p.waitForTimeout(3000);
  await declareMoney(h.p); // v2 : argent présent avant de dépenser

  await h.go('/goals/new'); await h.p.getByText('Créer mon propre objectif', { exact: false }).first().click(); await h.p.waitForTimeout(500);
  await h.p.getByPlaceholder('Ex. Acheter une machine à glace').fill(GOAL); await h.btn('Continuer').click(); await h.p.waitForTimeout(700);
  await h.fill('Montant cible', '1000000');
  await h.p.getByRole('button', { name: "Créer l'objectif" }).or(h.p.getByRole('button', { name: 'Créer l’objectif' })).first().click(); await h.p.waitForTimeout(2000);
  await h.go('/goals');
  let t = await h.text();
  ok(t.includes(GOAL) && t.includes('0 %') && t.includes('1 000 000 FCFA'), 'objectif « Acheter ma voiture » créé : 0 FCFA / 1 000 000 FCFA, 0 %');

  // Le bouton est sur la carte de l'onglet, avec le nom de l'objectif pour le lecteur d'écran, 48 dp minimum.
  const add = h.btn(`Ajouter de l’argent, ${GOAL}`);
  ok((await add.count()) === 1, 'onglet Objectifs : « Ajouter de l’argent » visible sur la carte (nom lu : « Ajouter de l’argent, Acheter ma voiture »)');
  const box = await add.first().boundingBox();
  ok(!!box && box.height >= 48, `bouton de 48 dp minimum (${box ? Math.round(box.height) : '?'} px)`);
  // Texte visible (sans le glyphe de l'icône) : le texte existant, rien de nouveau.
  const shown = (await add.first().innerText()).split('\n').map((l) => l.trim()).filter((l) => /\p{L}/u.test(l)).join(' ');
  ok(shown === 'Ajouter de l’argent', `texte visible : le texte existant « ${shown} »`);

  t = await addFromTab(h, 200000);
  ok(/\/goals\/[^/?]+$/.test(h.p.url()) && !h.p.url().includes('contribute'), `après l’enregistrement : la fiche de l’objectif s’ouvre (${h.p.url().replace(BASE, '')})`);
  ok(t.includes('200 000 FCFA') && t.includes('20 %') && (await barValue(h)) === 20, '200 000 le 15 → 20 % (texte et barre)');
  ok(historyRows(t).includes('+200 000 FCFA') && historyRows(t).includes(`15 ${month}`), `historique : +200 000 FCFA daté du 15 ${month}`);
  await h.p.screenshot({ path: `${S}/goals-contribute-20.png` });
  if (h.errs.length) ok(false, 'erreurs JS (15) : ' + h.errs.join(' | '));
  await b.close();

  // ── Le 21 : reconnexion, versements suivants ──
  b = await launch({ date: d21 });
  h = await page(b);
  await h.go('/sign-in', 2500);
  await h.p.getByLabel('Adresse e-mail').fill(email); await h.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await h.btn('Se connecter').click(); await h.p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await h.p.waitForTimeout(3500);

  t = await addFromTab(h, 100000);
  ok(t.includes('300 000 FCFA') && t.includes('30 %') && (await barValue(h)) === 30, '100 000 le 21 → 30 % (texte et barre)');
  const rows = historyRows(t);
  ok(rows.includes('+100 000 FCFA') && rows.includes(`21 ${month}`) && rows.includes(`15 ${month}`), `historique : versements du 21 et du 15 ${month}, chacun daté`);
  ok(rows.indexOf(`21 ${month}`) < rows.indexOf(`15 ${month}`), 'historique : le plus récent en premier');

  t = await addFromTab(h, 200000);
  ok(t.includes('500 000 FCFA') && t.includes('50 %') && (await barValue(h)) === 50, 'jusqu’à 500 000 → 50 % (texte et barre)');
  await h.p.screenshot({ path: `${S}/goals-contribute-50.png` });

  t = await addFromTab(h, 400000);
  ok(t.includes('900 000 FCFA') && t.includes('90 %') && (await barValue(h)) === 90, 'jusqu’à 900 000 → 90 % (texte et barre)');
  ok((historyRows(t).match(/\+[\d ]+ FCFA/g) || []).length === 4, 'historique : les 4 versements');

  // L'onglet montre la même progression.
  await h.go('/goals');
  t = await h.text();
  ok(t.includes('900 000 FCFA') && t.includes('90 %') && (await barValue(h)) === 90, 'onglet Objectifs : 900 000 / 1 000 000, 90 %');
  await h.p.screenshot({ path: `${S}/goals-contribute-tab.png` });

  // Depuis la fiche, le bouton existant ramène toujours à la fiche (comportement inchangé).
  await h.p.getByText(GOAL, { exact: false }).first().click(); await h.p.waitForTimeout(1500);
  const detail = h.p.url();
  await h.btn('Ajouter de l’argent').first().click(); await h.p.waitForTimeout(1200);
  await h.p.goBack(); await h.p.waitForTimeout(1200);
  ok(h.p.url() === detail, 'fiche : « Ajouter de l’argent » toujours présent, retour sur la fiche');

  ok(h.errs.length === 0, 'aucune erreur JS ' + h.errs.join(' | '));
  console.log(fails ? `OBJECTIFS : ${fails} ÉCHEC(S)` : 'OBJECTIFS : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
