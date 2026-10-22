/*
 * Réserve famille et cérémonies (1.6, phase 1) — export web + émulateurs.
 *  1. Démonstration (formule Famille du build de développement) : section « Réserves »,
 *     fiche (solde, historique, qui), « Prendre sur la réserve ? » sur la carte de
 *     confirmation, reste par jour inchangé, complément si la réserve ne suffit pas,
 *     « Annuler », modification et suppression de l'opération liée.
 *  2. Compte réel (formule gratuite) : question facultative du démarrage rapide,
 *     réserve créée, limite d'une réserve.
 */
const { BASE, launch, dayOfMonth, phraseField, declareMoney, takeComplement, PER_DAY } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s ?? '').replace(/[^\d-]/g, ''));

let b;
(async () => {
  // Jour fixé : la démonstration est générée à partir de la date du jour (le 11, elle est en déficit ;
  // le 3, une saisie dépasse le budget Maison et l'alerte remplace « Enregistré ✓ »).
  const now = dayOfMonth(1);
  b = await launch({ date: now });
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  let p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  // Design v2 : le détail du calcul (« … − dépenses X − à venir … ») est replié derrière « Comment c'est calculé ? ».
  const home = async () => { await go('/'); await closeCelebration(); const how = btn("Comment c'est calculé ?"); if (await how.count()) { await how.first().click(); await p.waitForTimeout(300); } };
  const perDay = async () => { await home(); return num(((await text()).match(PER_DAY) || [])[1]); };
  const balance = async () => { await go('/reserve/demo_reserve'); return num(((await text()).match(/Solde de la réserve\s*\n\s*([\d ]+) FCFA/) || [])[1]); };
  const openKeyboard = async () => { const mic = btn('Dicter une opération'); const box = await mic.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(600); };
  const phrase = async (s) => { await (await phraseField(p)).fill(s); await btn('Comprendre').click(); await p.waitForTimeout(600); };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── Section « Réserves » et fiche ──
  await go('/goals');
  let t = await text();
  // Refonte finale D2 (objectifs-*.html) : la réserve est une VIGNETTE de « Vos projets », étiquetée « Réserve ».
  const resTile = p.getByRole('button', { name: /^Réserve famille et cérémonies,/ }).filter({ visible: true }).first();
  const resText = (await resTile.count()) ? await resTile.innerText() : '';
  ok(t.includes('Vos projets') && resText.includes('Réserve famille et cérémonies'), 'Objectifs : vignette de la réserve dans « Vos projets »');
  ok(/^Réserve$/m.test(resText) && !/Priorité \d/.test(resText), 'la réserve n’est pas un objectif classique (étiquette « Réserve », jamais « Priorité N »)');
  const b0 = await balance();
  t = await text();
  ok(b0 === 80_000, `fiche : solde = 50 000 + 2 × 25 000 − 20 000 = ${b0}`);
  ok(t.includes('sur un plafond de 300 000 FCFA') && t.includes('Mise de côté prévue : 25 000 FCFA par mois'), 'fiche : plafond et mise de côté mensuelle');
  ok(/Utilisation · (Cérémonies|Finance sociale & obligations) · .* · par vous/.test(t) && /Apport · .* · par vous/.test(t), 'historique : apports et utilisation liée, avec « qui »');
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
  // 1.9 : une seule opération confirmée par « Tout valider » passe par la conversation, qui affiche
  // elle-même le bilan (« C'est fait : … Il vous reste … par jour ») au lieu du message « Enregistré ✓ ».
  t = await text();
  ok(/Enregistré ✓ — il vous reste [\d ]+ FCFA par jour/.test(t) || /C'est fait : 1 dépense enregistrée, 15 000 FCFA\. Il vous reste [\d ]+ FCFA par jour/.test(t), 'enregistré : bilan avec le reste par jour');
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
  // v2 (§7.3) : détail « Argent disponible X − engagements … » (replié sous « Comment c'est calculé ? »).
  const available = async () => {
    await home(); // ouvre déjà « Comment c'est calculé ? »
    return num(((await text()).match(/Argent disponible ([\d ]+) FCFA − engagements/) || [])[1]);
  };
  const avail0 = await available();
  const bal0 = await balance();
  await home(); await openKeyboard(); await phrase('Funérailles 100 000');
  await btn('Oui, sur la réserve').click(); await p.waitForTimeout(300);
  t = await text();
  // v2 (§5.3) : la réserve ne paie que l'argent mis de côté sur un compte (la démo a 50 000 de départ
  // déclarés hors comptes) : la carte annonce A pris sur la réserve et B de complément, A + B = 100 000.
  const split = t.match(/([\d ]+) FCFA pris sur la réserve ; le complément de ([\d ]+) FCFA est pris sur le budget du mois\./) || [];
  const [A, B] = [num(split[1]), num(split[2])];
  ok(!!split[0] && A > 0 && B > 0 && A + B === 100_000, `réserve insuffisante : ${A} pris sur la réserve, complément de ${B} montré`);
  ok(!(await btn('Tout valider').isDisabled()), 'réserve insuffisante : enregistrement possible (jamais bloqué)');
  await btn('Tout valider').click(); await p.waitForTimeout(700);
  await takeComplement(p); // le complément peut lui-même manquer sur le compte qui paie
  const avail1 = await available();
  ok(avail0 - avail1 === B, `seul le complément compte dans le reste par jour : argent disponible ${avail0} → ${avail1} (−${B}, pas −100 000)`);
  ok((await balance()) === bal0 - A, `réserve : ${bal0} − ${A} = ${bal0 - A} (ce que la carte a annoncé)`);

  // Modification de l'opération liée : utilisation recalculée ; suppression : utilisation annulée.
  const amountRe = (n) => new RegExp('^-' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\u00a0\u202f]') + '[\\s\u00a0\u202f]FCFA');
  await go('/reserve/demo_reserve');
  await p.getByRole('button', { name: amountRe(A) }).first().click(); await p.waitForTimeout(2000);
  ok(p.url().includes('/transaction/'), 'historique : l’utilisation ouvre l’opération liée');
  ok((await text()).includes('Prendre sur la réserve ?'), 'formulaire : la réserve est proposée (et cochée)');
  await p.getByLabel('Montant', { exact: true }).first().fill('50000');
  await btn('Enregistrer').click(); await p.waitForTimeout(1200);
  const A2 = Math.min(A, 50_000);
  ok((await balance()) === bal0 - A2, `opération ramenée à 50 000 : utilisation recalculée (${bal0} − ${A2} = ${bal0 - A2})`);
  await p.getByRole('button', { name: amountRe(A2) }).first().click(); await p.waitForTimeout(2000);
  await btn('Supprimer').click(); await p.waitForTimeout(1200);
  ok((await balance()) === bal0, `opération supprimée : utilisation annulée (solde ${bal0})`);

  // Mise de côté du mois : confirmation, puis reste par jour inchangé (elle était déjà déduite).
  const r0 = await perDay();
  await go('/reserve/demo_reserve');
  await btn('Mettre 25 000 FCFA de côté').click(); await p.waitForTimeout(800);
  ok((await balance()) === 90_000, '« Mettre 25 000 de côté » (après confirmation) : solde 90 000');
  const r1 = await perDay();
  ok(r1 === r0, `mettre de côté ce qui était prévu ne change pas le reste par jour (${r0} → ${r1})`);

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
  await p.goto(new URL('/sign-up', p.url()).href, { waitUntil: 'load' }); await p.waitForTimeout(1500);
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
  // v2 (§7.3) : sans argent déclaré, l'aperçu ne tire aucun reste par jour du revenu déclaré.
  ok((await text()).includes("Votre argent disponible aujourd'hui"), 'aperçu : demande l’argent disponible (aucun reste par jour inventé)');
  await btn('Commencer').click();
  await p.getByText('Bonjour Adjoua').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
  await declareMoney(p); // v2 : argent présent avant de dépenser
  // La mise de côté mensuelle de la réserve est un engagement du reste par jour.
  await go('/'); await btn("Comment c'est calculé ?").first().click(); await p.waitForTimeout(300);
  ok(/Mise de côté prévue : Réserve famille et cérémonies — 31 000 FCFA/.test(await text()), 'reste par jour : mise de côté de la réserve (31 000) dans les engagements');
  await go('/goals');
  t = await text();
  // Refonte finale D2 : la vignette écrit « solde / plafond » (maquette : « 80 000 FCFA / 300 000 FCFA »).
  ok(t.includes('Réserve famille et cérémonies') && /\/ 372 000 FCFA/.test(t), 'compte réel : réserve créée par le démarrage rapide (plafond 372 000)');
  await go('/reserve/new');
  ok((await text()).includes('Plusieurs réserves sont incluses dans la formule Plus.'), 'formule gratuite : une seule réserve (offre Plus pour en ajouter)');
  ok(errs2.length === 0, 'compte réel : aucune erreur JS ' + errs2.slice(0, 2).join(' | '));

  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'RÉSERVE : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
