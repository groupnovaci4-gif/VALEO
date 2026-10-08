/*
 * Réserve famille et cérémonies (1.6, phase 1) — export web + émulateurs.
 *  1. Démonstration (formule Famille du build de développement) : section « Réserves »,
 *     fiche (solde, historique, qui), « Prendre sur la réserve ? » sur la carte de
 *     confirmation, reste par jour inchangé, complément si la réserve ne suffit pas,
 *     « Annuler », modification et suppression de l'opération liée.
 *  2. Compte réel (formule gratuite) : question facultative du démarrage rapide,
 *     réserve créée, limite d'une réserve.
 */
const { BASE, launch } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s ?? '').replace(/[^\d-]/g, ''));

let b;
(async () => {
  b = await launch();
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  let p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const home = async () => { await go('/'); await closeCelebration(); };
  const perDay = async () => { await home(); return num(((await text()).match(/Il vous reste ([\d ]+) FCFA par jour/) || [])[1]); };
  const balance = async () => { await go('/reserve/demo_reserve'); return num(((await text()).match(/Solde de la réserve\s*\n\s*([\d ]+) FCFA/) || [])[1]); };
  const openKeyboard = async () => { const mic = btn('Dicter une opération'); const box = await mic.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(600); };
  const phrase = async (s) => { await p.getByLabel('Écrivez comme vous parlez').fill(s); await btn('Comprendre').click(); await p.waitForTimeout(600); };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── Section « Réserves » et fiche ──
  await go('/goals');
  let t = await text();
  const iRes = t.indexOf('Réserves'), iGoals = t.indexOf('Vos projets en marche');
  ok(iRes >= 0 && iRes < iGoals && t.includes('Réserve famille et cérémonies'), 'Objectifs : section « Réserves » au-dessus des objectifs');
  ok(!/Vos projets en marche[\s\S]*Réserve famille et cérémonies/.test(t), 'la réserve n’est pas listée parmi les objectifs');
  const b0 = await balance();
  t = await text();
  ok(b0 === 80_000, `fiche : solde = 50 000 + 2 × 25 000 − 20 000 = ${b0}`);
  ok(t.includes('sur un plafond de 300 000 FCFA') && t.includes('Mise de côté prévue : 25 000 FCFA par mois'), 'fiche : plafond et mise de côté mensuelle');
  ok(/Utilisation · Finance sociale & obligations · .* · par vous/.test(t) && /Apport · .* · par vous/.test(t), 'historique : apports et utilisation liée, avec « qui »');
  await go('/goals/demo_reserve');
  ok(p.url().includes('/reserve/demo_reserve'), 'un lien d’objectif vers la réserve ouvre sa fiche');

  // ── Utilisation depuis la carte de confirmation : le reste par jour ne baisse pas ──
  const d0 = await perDay();
  await openKeyboard(); await phrase('Funérailles 15 000');
  t = await text();
  ok(t.includes('Prendre sur la réserve ? (solde : 80 000 FCFA)'), 'carte : « Prendre sur la réserve ? (solde : 80 000 FCFA) »');
  await btn('Oui, sur la réserve').click(); await p.waitForTimeout(300);
  ok((await text()).includes('15 000 FCFA pris sur la réserve : votre reste par jour ne change pas.'), 'carte : part prise sur la réserve annoncée');
  await btn('Tout valider').click(); await p.waitForTimeout(700);
  ok(/Enregistré ✓ — il vous reste [\d ]+ FCFA par jour/.test(await text()), 'toast : enregistré');
  const d1 = await perDay();
  ok(d1 === d0, `reste par jour inchangé après une dépense prise sur la réserve (${d0} → ${d1})`);
  ok((await text()).includes('Pris sur la réserve : 15 000 FCFA (déjà mis de côté)'), 'accueil : « Pris sur la réserve : 15 000 FCFA »');
  ok((await balance()) === 65_000, 'solde de la réserve : 80 000 − 15 000 = 65 000');

  // « Annuler » (5 s) : l'opération ET l'utilisation disparaissent.
  await home(); await openKeyboard(); await phrase('Mariage 10 000');
  await btn('Oui, sur la réserve').click(); await p.waitForTimeout(200);
  await btn('Tout valider').click(); await p.waitForTimeout(400);
  await btn('Annuler').click(); await p.waitForTimeout(600);
  ok((await balance()) === 65_000, '« Annuler » : utilisation annulée avec l’opération (solde 65 000)');

  // Réserve insuffisante : complément montré, rien de bloqué ; seul le complément pèse sur le reste par jour.
  const before = await perDay();
  const avail0 = before * daysLeft;
  // Ligne de détail de la carte (affichée aussi en cas de déficit) : « Revenus … − dépenses X − à venir … ».
  const expenses = (s) => num((s.match(/dépenses ([\d ]+) FCFA − à venir/) || [])[1]);
  const exp0 = expenses(await text());
  await openKeyboard(); await phrase('Funérailles 100 000');
  await btn('Oui, sur la réserve').click(); await p.waitForTimeout(300);
  t = await text();
  ok(t.includes('65 000 FCFA pris sur la réserve ; le complément de 35 000 FCFA est pris sur le budget du mois.'), 'réserve insuffisante : complément de 35 000 montré');
  ok(!(await btn('Tout valider').isDisabled()), 'réserve insuffisante : enregistrement possible (jamais bloqué)');
  await btn('Tout valider').click(); await p.waitForTimeout(700);
  await perDay();
  const exp1 = expenses(await text());
  ok(exp1 - exp0 === 35_000, `seul le complément compte dans le reste par jour : dépenses ${exp0} → ${exp1} (+35 000, pas +100 000)`);
  ok((await balance()) === 0 && avail0 > 0, 'réserve vidée (0), le reste vient du budget');

  // Modification de l'opération liée : utilisation recalculée ; suppression : utilisation annulée.
  await go('/reserve/demo_reserve');
  await p.getByRole('button', { name: /^-65 000 FCFA/ }).first().click(); await p.waitForTimeout(2000);
  ok(p.url().includes('/transaction/'), 'historique : l’utilisation ouvre l’opération liée');
  ok((await text()).includes('Prendre sur la réserve ?'), 'formulaire : la réserve est proposée (et cochée)');
  await p.getByLabel('Montant', { exact: true }).first().fill('50000');
  await btn('Enregistrer').click(); await p.waitForTimeout(1200);
  ok((await balance()) === 15_000, 'opération ramenée à 50 000 : utilisation recalculée (65 000 − 50 000 = 15 000)');
  await p.getByRole('button', { name: /^-50 000 FCFA/ }).first().click(); await p.waitForTimeout(2000);
  await btn('Supprimer').click(); await p.waitForTimeout(1200);
  ok((await balance()) === 65_000, 'opération supprimée : utilisation annulée (solde 65 000)');

  // Mise de côté du mois : confirmation, puis reste par jour inchangé (elle était déjà déduite).
  const r0 = await perDay();
  await go('/reserve/demo_reserve');
  await btn('Mettre 25 000 FCFA de côté').click(); await p.waitForTimeout(800);
  ok((await balance()) === 90_000, '« Mettre 25 000 de côté » (après confirmation) : solde 90 000');
  ok((await perDay()) === r0, 'mettre de côté ce qui était prévu ne change pas le reste par jour');

  // Création : aide au plafond (démo : 2 mois complets seulement → question, aucun chiffre inventé).
  await go('/reserve/new');
  t = await text();
  ok(t.includes("À peu près combien avez-vous donné pour des cérémonies et la famille l'an dernier ?") && !t.includes("D'après vos"), 'aide au plafond : moins de 3 mois d’historique → question posée');
  await checkAllInputs(p, 'Réserve › création', ok, { expectInputs: true });
  await p.getByLabel("Montant de l'an dernier (environ, facultatif)").fill('240000'); await p.waitForTimeout(300);
  ok((await text()).includes('Soit environ 20 000 FCFA par mois.'), 'réponse : environ 20 000 par mois');
  await btn('Plafond : 240 000 FCFA').click(); await btn('Chaque mois : 20 000 FCFA').click(); await p.waitForTimeout(200);
  await p.getByLabel('Nom de la réserve').fill('Réserve rentrée');
  await btn('Créer la réserve').click(); await p.waitForTimeout(1500);
  t = await text();
  ok(p.url().includes('/reserve/') && t.includes('Réserve rentrée') && t.includes('sur un plafond de 240 000 FCFA'), 'réserve créée avec les chiffres choisis');
  await p.screenshot({ path: `${S}/reserve-detail.png` });
  ok(errs.length === 0, 'démo : aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  await ctx.close();

  // ── 2. Compte réel, formule gratuite : question du démarrage rapide, limite d'une réserve ──
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  p = await ctx.newPage();
  const errs2 = []; p.on('pageerror', (e) => errs2.push(e.message)); p.on('dialog', (d) => d.accept());
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  await go('/');
  await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
  await fill('Nom', 'Reserve', true); await fill('Prénom', 'Adjoua'); await fill('Adresse e-mail', `reserve${Date.now()}@ex.com`);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await btn('Démarrer rapidement').click(); await p.waitForTimeout(600);
  await fill('Revenu mensuel', '310000');
  await btn('Continuer').click(); await p.waitForTimeout(600);
  t = await text();
  ok(t.includes('Une réserve pour la famille et les cérémonies ?'), 'démarrage rapide : question facultative de la réserve');
  await fill('Mise de côté chaque mois (facultatif)', '31000'); await p.waitForTimeout(300);
  ok((await text()).includes('Plafond proposé : 12 mois de mise de côté, soit 372 000 FCFA.'), 'plafond proposé annoncé (12 mois, modifiable)');
  await btn('Continuer').click(); await p.waitForTimeout(600);
  const prev = num(((await text()).match(/Il vous reste ([\d ]+) FCFA par jour/) || [])[1]);
  ok(prev === Math.floor((310_000 - 31_000) / daysLeft), `aperçu : mise de côté déduite (${prev})`);
  await btn('Commencer').click();
  await p.getByText('Bonjour Adjoua').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
  await go('/goals');
  t = await text();
  ok(t.includes('Réserve famille et cérémonies') && t.includes('sur un plafond de 372 000 FCFA'), 'compte réel : réserve créée par le démarrage rapide');
  await go('/reserve/new');
  ok((await text()).includes('Plusieurs réserves sont incluses dans la formule Plus.'), 'formule gratuite : une seule réserve (offre Plus pour en ajouter)');
  ok(errs2.length === 0, 'compte réel : aucune erreur JS ' + errs2.slice(0, 2).join(' | '));

  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'RÉSERVE : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
