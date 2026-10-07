/*
 * Tontines, Lot T1 — export web + émulateurs.
 *  Phase 1 : « Mes tontines » (démo), échéancier, création en 4 écrans (collecteur,
 *  tournante avec demi-main), mention « carnet de suivi », conversion d'une
 *  récurrence (conservée sans confirmation, désactivée avec), limite gratuite.
 *  Phase 2 (si PHASE >= 2) : cotiser, recevoir, retard, reporter, suppression,
 *  phrase, reste par jour, calendrier, accueil.
 */
const { BASE, launch } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
const PHASE = Number(process.env.TONTINE_PHASE || 3);
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s ?? '').replace(/[^\d-]/g, ''));

let b;
(async () => {
  b = await launch();
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  let p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const next = async () => { await btn('Continuer').last().click(); await p.waitForTimeout(500); };
  const radio = (name) => p.getByRole('radio', { name, exact: true });

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── Phase 1 : Mes tontines et échéancier ──
  await go('/more');
  ok((await text()).includes('Mes tontines'), 'menu « Plus » : « Mes tontines »');
  await go('/tontines');
  let t = await text();
  ok(t.includes('Tontine du bureau') && /Prochaine cotisation : 10 000 FCFA le/.test(t) && /Vous recevez 100 000 FCFA vers le/.test(t), 'démo : tontine du bureau, prochaine cotisation et mon tour');
  ok(t.includes('ne collecte ni ne garde d\'argent et ne garantit pas les paiements des membres'), 'mention « carnet de suivi » affichée');
  ok(t.includes('Tontines saisies comme récurrences') && t.includes('Tontine · 10 000 FCFA'), 'récurrence de tontine existante : conversion proposée (pas imposée)');
  await go('/tontines/demo_tontine');
  t = await text();
  ok((t.match(/· 10 000 FCFA\n/g) || []).length === 10 && t.includes('Vous · vous recevez 100 000 FCFA') && t.includes('Tour 7'), 'échéancier : 10 tours, « Vous » au tour 6, « Tour n » sinon');
  ok((t.match(/Payé/g) || []).length >= 2, 'cotisations passées de la démo : « Payé »');
  if (PHASE >= 3) {
    ok(t.includes('Comprendre ma tontine') && t.includes('Recevoir tôt revient à un crédit sans intérêt') && t.includes('Pour l\'instant, vous épargnez'), 'Comprendre ma tontine (tournante) : crédit / épargne sans intérêt, texte neutre');
    ok(!/quitter|devriez|déconseill|arrêtez/i.test(t), 'aucun conseil de quitter la tontine, aucun jugement');
  }

  // Création : collecteur 1 000 / jour, 31 jours, commission 1 000.
  await go('/tontines/new');
  ok((await text()).includes("ne collecte ni ne garde d'argent"), 'création : rappel « carnet de suivi » dès le premier écran');
  await radio('Épargne avec un collecteur').click(); await next();
  await checkAllInputs(p, 'Tontine › montant', ok, { expectInputs: true });
  await p.getByLabel('Nom de la tontine').fill('Collecteur du marché');
  await p.getByLabel('Mise versée au collecteur').fill('1000');
  await btn('Chaque jour').click(); await next();
  await checkAllInputs(p, 'Tontine › cycle', ok, { expectInputs: true });
  await p.getByLabel('Durée du cycle (jours)').fill('31');
  await p.getByLabel('Commission du collecteur').fill('1000'); await p.waitForTimeout(300);
  ok((await text()).includes('Sur le cycle : 31 000 FCFA versés, commission 1 000 FCFA (3,2 %), 30 000 FCFA rendus.'), 'collecteur : commission 1 000 sur 31 000, soit 3,2 %');
  await next();
  ok((await text()).includes('Aperçu de l\'échéancier'), 'aperçu de l’échéancier avant validation');
  await btn('Créer la tontine').click(); await p.waitForTimeout(2000);
  t = await text();
  ok(p.url().includes('/tontines/ton_') && t.includes('Collecteur du marché') && t.includes('Fin de cycle : 30 000 FCFA rendus'), 'collecteur créé : 31 mises, 30 000 rendus en fin de cycle');
  if (PHASE >= 3) {
    ok(t.includes('Comprendre ma tontine') && t.includes('Commission : 1 000 FCFA sur 31 000 FCFA, soit 3,2 %.'), 'Comprendre ma tontine (collecteur) : « Commission : 1 000 sur 31 000, soit 3,2 % »');
  }

  // Tournante avec demi-main : la moitié de la cagnotte du tour partagé.
  await go('/tontines/new');
  await next();
  await p.getByLabel('Nom de la tontine').fill('Tontine des copines');
  await p.getByLabel('Mise par main et par échéance').fill('20000');
  await btn('Demi-main').click(); await p.waitForTimeout(200);
  ok((await text()).includes('Votre cotisation par échéance : 10 000 FCFA'), 'demi-main : cotisation de 10 000');
  await next();
  await p.getByLabel('Nombre de mains au total (tours)').fill('6'); await p.waitForTimeout(300);
  await next();
  ok((await text()).includes('Choisissez votre tour (un par main).'), 'sans tour choisi : on ne passe pas (message clair)');
  await btn('3').click(); await next();
  t = await text();
  ok(t.includes('6 tours, cagnotte de 120 000 FCFA par tour.') && t.includes('Vous · vous recevez 60 000 FCFA'), 'aperçu : cagnotte 120 000, ma demi-part 60 000 au tour 3');
  await btn('Créer la tontine').click(); await p.waitForTimeout(2000);
  ok(p.url().includes('/tontines/ton_'), 'tournante créée');

  // Conversion : la récurrence d'origine reste active si l'utilisateur ne la désactive pas.
  await go('/recurring');
  await btn('Convertir en tontine complète').first().click(); await p.waitForTimeout(2000);
  ok((await text()).includes('Conversion de la récurrence « Tontine ». Elle n\'est pas supprimée.'), 'conversion : prérempli depuis la récurrence, jamais supprimée');
  await next();
  ok((await p.getByLabel('Mise par main et par échéance').inputValue()).replace(/\D/g, '') === '10000', 'conversion : montant repris (10 000)');
  await next();
  await p.getByLabel('Nombre de mains au total (tours)').fill('5'); await p.waitForTimeout(200);
  await btn('2').click(); await next();
  ok(!(await p.getByRole('switch').last().isChecked()), 'désactivation de la récurrence : décochée par défaut');
  await btn('Créer la tontine').click(); await p.waitForTimeout(2000);
  await go('/recurring');
  t = await text();
  ok(/Tontine\n[^\n]*\n10 000 FCFA/.test(t) && !t.includes('Convertir en tontine complète'), 'récurrence d’origine conservée et toujours active ; conversion plus proposée');
  if (PHASE >= 2) {
    const position = async () => { await go('/tontines/demo_tontine'); return await text(); };
    const paidOf = (s) => num((s.match(/Vous avez versé ([\d ]+) FCFA/) || [])[1]);
    t = await position();
    const paid0 = paidOf(t);
    ok(paid0 >= 20_000 && /Vous avez versé [\d ]+ FCFA\. Vous recevrez 100 000 FCFA au tour 6 \(vers le/.test(t) && t.includes("C'est de l'épargne : le groupe vous doit"), `position nette avant mon tour : versé ${paid0}, recevra 100 000 au tour 6`);
    ok(/Tour \d+ sur 10/.test(t), 'progression : tour actuel sur 10');
    await btn("J'ai cotisé").click(); await p.waitForTimeout(800);
    ok(/Enregistré ✓/.test(await text()), '« J’ai cotisé » (confirmé) : opération enregistrée');
    t = await position();
    ok(paidOf(t) === paid0 + 10_000, `position : versé ${paid0} → ${paidOf(t)}`);
    await go('/transactions');
    ok((await text()).includes('Tontine du bureau'), 'Historique : la cotisation est une vraie dépense « Tontine du bureau »');
    await p.getByRole('button', { name: /Tontine du bureau/ }).first().click(); await p.waitForTimeout(2000);
    await btn('Supprimer').click(); await p.waitForTimeout(1200);
    ok(paidOf(await position()) === paid0, 'suppression de l’opération : la cotisation est annulée');
    // Phrase (même parseur que la voix) : la tontine est proposée sur la carte de confirmation.
    await go('/'); await closeCelebration();
    const mic = btn('Dicter une opération'); const box = await mic.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(600);
    await p.getByLabel('Écrivez comme vous parlez').fill("J'ai cotisé ma tontine du bureau");
    await btn('Comprendre').click(); await p.waitForTimeout(700);
    t = await text();
    ok(/Tontine « Tontine du bureau » : cotisation du/.test(t) && t.includes('10 000 FCFA') && t.includes('Tout valider'), '« J’ai cotisé ma tontine du bureau » : tontine et montant proposés, à valider');
    await btn('Tout valider').click(); await p.waitForTimeout(800);
    ok(paidOf(await position()) === paid0 + 10_000, 'validée : cotisation enregistrée et liée');
    await go('/'); await closeCelebration();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(600);
    // Plusieurs tontines dans la démo : sans nom, la cagnotte la plus proche serait proposée ; on nomme celle du bureau.
    await p.getByLabel('Écrivez comme vous parlez').fill("J'ai reçu la tontine du bureau");
    await btn('Comprendre').click(); await p.waitForTimeout(700);
    t = await text();
    ok(t.includes('Tontine « Tontine du bureau » : cagnotte du tour 6') && t.includes('100 000 FCFA'), '« J’ai reçu la tontine » : cagnotte du tour 6 proposée (100 000)');
    await btn('Tout valider').click(); await p.waitForTimeout(800);
    t = await position();
    ok(t.includes('Vous avez reçu 100 000 FCFA. Il vous reste') && t.includes('crédit sans intérêt'), 'après mon tour : « Vous avez reçu 100 000. Il vous reste … à verser » (crédit sans intérêt)');
    await go('/calendar');
    await p.getByRole('tab', { name: '60 jours' }).click(); await p.waitForTimeout(400);
    ok((await text()).includes('Tontine du bureau'), 'calendrier : cotisations de la tontine');
    // Retard : on avance l'horloge du navigateur de 70 jours.
    await p.clock.install({ time: new Date(Date.now() + 70 * 86_400_000) });
    // Le coach présente son résumé UNE fois à l'ouverture (dédoublonnage) : on regarde l'accueil d'abord.
    await go('/', 5000); await closeCelebration();
    if (PHASE >= 3) ok(/Cotisation « [^»]+ » pas encore enregistrée depuis \d+ jours/.test(await text()), 'coach à l’ouverture : « Cotisation … pas encore enregistrée » (tontine_late)');
    t = await position();
    ok(t.includes('En retard') && (await btn("Je l'ai payée").count()) > 0 && (await btn('Reporter').count()) > 0, 'échéance passée sans cotisation : « En retard », « Je l’ai payée » / « Reporter »');
    await btn('Reporter').first().click(); await p.waitForTimeout(500);
    await btn('Reporter à cette date').click(); await p.waitForTimeout(800);
    ok((await text()).includes('Reporté'), '« Reporter » : échéance reportée (rien n’est payé)');
    await go('/'); await closeCelebration();
    ok(/Tontine « [^»]+ » : (cotisation de [\d ]+ FCFA en retard|[\d ]+ FCFA à cotiser)/.test(await text()), 'accueil : la cotisation en retard (la plus ancienne) est signalée');
  }
  ok(errs.length === 0, 'démo : aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  await ctx.close();

  // ── Compte réel (gratuit) : conversion avec désactivation confirmée, limite d'une tontine ──
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  p = await ctx.newPage();
  const errs2 = []; p.on('pageerror', (e) => errs2.push(e.message)); p.on('dialog', (d) => d.accept());
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  await go('/');
  await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
  await fill('Nom', 'Tontine', true); await fill('Prénom', 'Aya'); await fill('Adresse e-mail', `tontine${Date.now()}@ex.com`);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await p.getByText('Plus tard', { exact: true }).click();
  await p.getByText('Bonjour Aya').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(4500);
  await go('/recurring/edit');
  await p.getByRole('tab', { name: 'Dépense', exact: true }).click(); await p.waitForTimeout(300);
  await fill('Libellé', 'Tontine marché'); await fill('Montant', '5000');
  await p.getByText('Tontines et cotisations', { exact: true }).first().click();
  await p.getByText('Chaque semaine', { exact: true }).first().click();
  await btn('Enregistrer').click(); await p.waitForTimeout(1500);
  await go('/recurring');
  await btn('Convertir en tontine complète').first().click(); await p.waitForTimeout(2000);
  await radio('Cotisation sans tour').click(); await next(); await next(); await next();
  await p.getByText('Désactiver la récurrence « Tontine marché »', { exact: true }).click(); await p.waitForTimeout(300);
  ok(await p.getByRole('switch').last().isChecked(), 'l’utilisateur coche « Désactiver la récurrence »');
  await btn('Créer la tontine').click(); await p.waitForTimeout(2000);
  await go('/recurring');
  t = await text();
  ok(t.includes('Tontine marché') && t.includes('Inactif'), 'désactivation confirmée par l’utilisateur : récurrence désactivée (pas supprimée)');
  await go('/tontines/new');
  ok((await text()).includes('La formule gratuite suit une tontine active.'), 'formule gratuite : une tontine active (offre Plus)');
  ok(errs2.length === 0, 'compte réel : aucune erreur JS ' + errs2.slice(0, 2).join(' | '));

  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'TONTINES : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 600)); try { await b?.contexts()[0]?.pages()[0]?.screenshot({ path: S + '/tontine-stop.png' }); } catch {} process.exitCode = 1; await b?.close(); });
