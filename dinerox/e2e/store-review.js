/*
 * Croissance, étape 4 — demande d'avis sur le store (export web + émulateurs auth, firestore).
 * Le web n'a pas de fenêtre d'avis native : ce parcours vérifie ce qui est vérifiable ici.
 *  1. Accueil : première ouverture retenue pour ce compte (mémoire locale) ;
 *  2. « Objectif atteint » fermé → retour à l'Accueil : aucune demande sur le web (pas de
 *     fenêtre native), aucune erreur, aucun texte ajouté par DineroX ;
 *  3. menu Plus : « Donner mon avis sur DineroX » caché sans réglage, visible quand l'admin
 *     active `config/app/items/store`, ouvre DIRECTEMENT la page Play (interceptée), puis plus
 *     aucune demande automatique pour ce compte ; caché de nouveau si le réglage est retiré ou invalide.
 */
const { BASE, launch, declareMoney } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const PROJECT = 'demo-dinerox';
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { 'content-type': 'application/json', authorization: 'Bearer owner' };
const PLAY = 'https://play.google.com/store/apps/details?id=com.dinerox.app';
const GOAL = 'Téléphone';
let b;

const enc = (v) => (typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) });
const writeDoc = (path, data) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const uidOf = async (email) => (await (await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ email: [email] }) })).json()).users?.[0]?.localId;

(async () => {
  await writeDoc('config/app/items/store', { reviewMenu: false });
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR' });
  await ctx.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return null; };
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const dialogs = []; p.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  // Événements analytiques (export --dev : console), avec leurs propriétés réelles.
  const events = [];
  p.on('console', async (m) => {
    if (!m.text().startsWith('[analytics]')) return;
    const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => null)));
    events.push(JSON.stringify({ event: args[1], props: args[2] ?? {} }));
  });
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const go = async (path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  const state = (uid) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), `dinerox:v1:${uid}:storeReview`);

  const email = `review${Date.now()}@ex.com`;
  await go('/'); await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
  await fill('Nom', 'Koné', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', email);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click(); await btn('Créer mon compte').click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await p.getByText('Plus tard', { exact: true }).click();
  await p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
  await declareMoney(p); // v2 : argent présent avant de dépenser
  const uid = await uidOf(email);

  // ── 1. Première ouverture retenue (par compte) ──
  const s1 = await state(uid);
  ok(!!s1 && s1.firstSeenAt > 0 && Array.isArray(s1.requests) && s1.requests.length === 0 && s1.menuUsed === false, `première ouverture retenue pour ce compte, aucune demande (${JSON.stringify(s1)})`);

  // ── 2. Objectif atteint → fermé → Accueil ──
  await go('/goals/new'); await p.getByText('Créer mon propre objectif', { exact: false }).first().click(); await p.waitForTimeout(500);
  await p.getByPlaceholder('Ex. Acheter une machine à glace').fill(GOAL); await btn('Continuer').click(); await p.waitForTimeout(700);
  await fill('Montant cible', '1000');
  await p.getByRole('button', { name: "Créer l'objectif" }).or(p.getByRole('button', { name: 'Créer l’objectif' })).first().click(); await p.waitForTimeout(2000);
  await go('/goals');
  await btn(`Ajouter de l’argent, ${GOAL}`).first().click(); await p.waitForTimeout(1200);
  await fill('Montant', '1000');
  await btn('Enregistrer').last().click(); await p.waitForTimeout(2500);
  ok((await text()).includes('Félicitations'), '« Objectif atteint » affiché');
  await p.getByText('Fermer', { exact: true }).filter({ visible: true }).last().click(); await p.waitForTimeout(1500);
  ok(!(await text()).includes('Félicitations'), '« Objectif atteint » fermé');
  // Navigation DANS l'application (un rechargement effacerait la session) : bouton Retour, puis onglet « Accueil ».
  await btn('Retour').first().click(); await p.waitForTimeout(1500);
  await p.getByText('Accueil', { exact: true }).filter({ visible: true }).last().click();
  await p.getByText('Bonjour Awa').first().waitFor({ timeout: 10000 }); await p.waitForTimeout(3500);
  const s2 = await state(uid);
  ok(!!s2 && s2.requests.length === 0, 'web : aucune demande (pas de fenêtre native), rien de compté');
  ok(dialogs.length === 0 && !/aimez|avis|note/i.test(await text()), 'aucune question ni aucun texte ajouté par DineroX sur l’Accueil');
  ok(!events.some((e) => e.includes('review_requested')), 'aucun événement de demande automatique');

  // ── 3. Ligne du menu ──
  await go('/more', 4000);
  ok(!(await text()).includes('Donner mon avis sur DineroX'), 'Plus : ligne cachée tant que le réglage est faux');
  await writeDoc('config/app/items/store', { reviewMenu: 'true' });
  await go('/more', 4000);
  ok(!(await text()).includes('Donner mon avis sur DineroX'), 'réglage invalide (texte « true ») : ligne cachée');
  await writeDoc('config/app/items/store', { reviewMenu: true });
  await go('/more', 4000);
  const row = p.getByText('Donner mon avis sur DineroX', { exact: true }).filter({ visible: true });
  ok((await row.count()) === 1 && (await text()).includes('Votre note et votre commentaire sur le store'), 'réglage activé : ligne visible, textes validés');
  await row.first().scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${S}/store-review-menu.png` });
  await row.first().click(); await p.waitForTimeout(1200);
  const opened = await p.evaluate(() => window.__opened.slice());
  ok(opened.length === 1 && opened[0] === PLAY, `ouvre directement la page Play (${opened.join(', ')})`);
  const s3 = await state(uid);
  ok(!!s3 && s3.menuUsed === true && s3.requests.length === 0, 'après la ligne du menu : plus aucune demande automatique pour ce compte');
  const ev = events.filter((e) => e.includes('review_requested'));
  ok(ev.length === 1 && ev[0] === JSON.stringify({ event: 'review_requested', props: { context: 'manual' } }) && !/Awa|Koné|@|1000|FCFA/.test(ev[0]), `événement : contexte « manual » seulement (${ev[0] || 'absent'})`);
  await writeDoc('config/app/items/store', { reviewMenu: false });
  await go('/more', 4000);
  ok(!(await text()).includes('Donner mon avis sur DineroX'), 'réglage retiré : ligne cachée de nouveau');

  ok(errs.length === 0, 'aucune erreur JS ' + errs.join(' | '));
  console.log(fails ? `AVIS : ${fails} ÉCHEC(S)` : 'AVIS : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
