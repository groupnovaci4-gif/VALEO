/*
 * Réserve famille (1.6, phases 2 à 4) — export web + émulateurs.
 *  1. Démonstration : Famille et obligations (totaux, part des revenus, ajout d'un
 *     soutien), « Puis-je contribuer ? » (réserve, reste par jour, comparaison,
 *     enregistrement via le formulaire), phrase « Si je donne… », moments forts
 *     (rentrée, plan par semaine, date à préciser, calendrier).
 *  2. Compte réel (gratuit) : date publiée dans le catalogue distant (émulateur),
 *     limite d'un moment fort, limite de 3 simulations par mois.
 */
const { BASE, launch } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s ?? '').replace(/[^\d-]/g, ''));
const FS = 'http://127.0.0.1:8080/v1/projects/demo-dinerox/databases/(default)/documents';

/** Publie une date de moment fort comme l'administrateur (émulateur : jeton « owner »). */
async function publishSeason(id, fields) {
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === null ? { nullValue: null } : { stringValue: v }])) };
  const r = await fetch(`${FS}/config/seasons/items?documentId=${id}`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok && r.status !== 409) throw new Error(`catalogue : ${r.status}`);
}

let b;
(async () => {
  b = await launch();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  let p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const perDay = async () => { await go('/'); await closeCelebration(); return num(((await text()).match(/Il vous reste ([\d ]+) FCFA par jour/) || [])[1]); };
  const balance = async () => { await go('/reserve/demo_reserve'); return num(((await text()).match(/Solde de la réserve\s*\n\s*([\d ]+) FCFA/) || [])[1]); };
  const openKeyboard = async () => { const mic = btn('Dicter une opération'); const box = await mic.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(600); };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── Famille et obligations ──
  await go('/more');
  ok((await text()).includes('Famille et obligations') && (await text()).includes("Moments forts de l'année") && (await text()).includes('Puis-je contribuer ?'), 'menu « Plus » : obligations, moments forts, simulateur');
  await go('/obligations');
  let t = await text();
  ok(t.includes('Maman') && t.includes('50 000 FCFA / mois') && t.includes('Scolarité neveu') && t.includes('15 000 FCFA / mois'), 'soutiens réguliers listés (récurrences « Famille »)');
  ok(/Par mois\s*\n\s*65 000 FCFA/.test(t) && /Par an\s*\n\s*780 000 FCFA/.test(t), 'totaux : 65 000 par mois, 780 000 par an');
  ok(/Soit \d+ % de vos revenus mensuels\./.test(t), `part des revenus affichée (« ${(t.match(/Soit \d+ %[^\n]*/) || [''])[0]} »)`);
  ok(!/trop|devriez|réduire|moins donner/i.test(t), 'aucun commentaire moralisateur');
  await btn('Ajouter').click(); await p.waitForTimeout(2000);
  ok((await text()).includes('Pour qui ? (bénéficiaire)'), 'ajout : formulaire de récurrence existant, libellé = bénéficiaire');
  await checkAllInputs(p, 'Obligation › ajout', ok, { expectInputs: true });
  await p.getByLabel('Pour qui ? (bénéficiaire)').fill('Papa');
  await p.getByLabel('Montant', { exact: true }).first().fill('10000');
  await btn('Enregistrer').click(); await p.waitForTimeout(1500);
  await go('/obligations');
  t = await text();
  ok(t.includes('Papa') && /Par mois\s*\n\s*75 000 FCFA/.test(t), 'soutien ajouté : 75 000 par mois');

  // ── « Puis-je contribuer ? » ──
  const d0 = await perDay();
  const b0 = await balance();
  await go('/simulate');
  await checkAllInputs(p, 'Simulateur', ok, { expectInputs: true });
  await p.getByLabel('Montant envisagé').fill('30000');
  await btn("Voir l'effet").click(); await p.waitForTimeout(500);
  t = await text();
  ok(t.includes(`Réserve : ${b0.toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA → ${(b0 - 30_000).toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA.`), `simulation : solde de la réserve ${b0} → ${b0 - 30_000}`);
  const simPer = num((t.match(/Avec 30 000 FCFA, il vous resterait ([\d ]+) FCFA par jour/) || [])[1]);
  ok(simPer === d0, `réserve suffisante : reste par jour inchangé (${d0} → ${simPer})`);
  ok(!/trop|devriez|déconseill/i.test(t), 'aucun jugement, seulement des chiffres');
  await btn('Non, sur le budget du mois').click(); await p.waitForTimeout(300);
  await btn("Voir l'effet").click(); await p.waitForTimeout(500);
  t = await text();
  const noRes = (t.match(/Avec 30 000 FCFA, il vous resterait ([\d ]+) FCFA par jour/) || [])[1];
  const short = (t.match(/Avec 30 000 FCFA, il manquerait ([\d ]+) FCFA ce mois-ci\./) || [])[1];
  ok(noRes !== undefined ? num(noRes) < d0 : short !== undefined, `sans la réserve : ${noRes !== undefined ? `reste par jour ${d0} → ${num(noRes)}` : `il manquerait ${short} FCFA ce mois-ci`}`);
  await p.getByLabel('Comparer avec un autre montant (facultatif)').fill('20000'); await p.waitForTimeout(400);
  // Selon le mois de la démo, le résultat est un reste par jour ou un manque (les deux sont des chiffres, sans jugement).
  ok(/Avec 20 000 FCFA, il (vous resterait [\d ]+ FCFA par jour|manquerait [\d ]+ FCFA ce mois-ci)/.test(await text()), 'comparaison : « Avec 20 000 FCFA, il vous resterait … » (ou « il manquerait … »)');
  await btn('Oui, sur la réserve').click(); await p.waitForTimeout(200);
  await btn("Voir l'effet").click(); await p.waitForTimeout(400);
  await btn('Enregistrer cette contribution').click(); await p.waitForTimeout(2000);
  t = await text();
  ok(p.url().includes('/transaction/new') && t.includes('Prendre sur la réserve ?'), 'enregistrer : formulaire prérempli, à confirmer (rien n’est enregistré sans accord)');
  await btn('Enregistrer').click(); await p.waitForTimeout(1500);
  ok((await balance()) === b0 - 30_000, 'contribution confirmée : prise sur la réserve');

  // Phrase (même parseur que la voix) : « Si je donne… » → simulateur.
  await go('/'); await closeCelebration(); await openKeyboard();
  await p.getByLabel('Écrivez comme vous parlez').fill('Si je donne 20 000 pour les funérailles, il me reste combien ?');
  await btn('Comprendre').click(); await p.waitForTimeout(2500);
  t = await text();
  ok(p.url().includes('/simulate') && /Avec 20 000 FCFA, il vous resterait [\d ]+ FCFA par jour/.test(t), '« Si je donne 20 000 pour les funérailles… » → simulateur calculé');

  // ── Moments forts ──
  await go('/goals');
  t = await text();
  ok(t.includes('Moments forts de l') && /Rentrée scolaire dans 8 semaines : 120 000 FCFA prévus, soit 15 000 FCFA par semaine\./.test(t), 'Objectifs : « Rentrée scolaire dans 8 semaines : 120 000 prévus, soit 15 000 par semaine »');
  ok(!/Vos projets en marche[\s\S]*Rentrée scolaire/.test(t), 'le moment fort n’est pas dans la liste des projets');
  await go('/seasons');
  await btn('🐑 Tabaski').click(); await p.waitForTimeout(2500);
  t = await text();
  ok(t.includes('Date à préciser : vous pourrez la fixer plus tard.'), 'Tabaski sans date publiée (démo hors ligne) : « date à préciser », aucune date inventée');
  await checkAllInputs(p, 'Moment fort', ok, { expectInputs: true });
  await p.getByLabel('Montant prévu').fill('100000'); await p.waitForTimeout(300);
  ok((await text()).includes('100 000 FCFA prévus. Fixez la date pour obtenir le rythme par semaine.'), 'plan sans date : montant prévu, invitation à fixer la date');
  await btn('Préparer ce moment').click(); await p.waitForTimeout(2000);
  await go('/seasons');
  ok((await text()).includes('Tabaski') && (await text()).includes('Date à préciser'), 'Tabaski ajoutée (date à préciser)');
  await go('/calendar');
  await p.getByRole('tab', { name: '60 jours' }).click(); await p.waitForTimeout(400);
  t = await text();
  ok(t.includes('Rentrée scolaire') && t.includes('Moment fort'), 'calendrier : la rentrée apparaît comme « Moment fort »');
  ok(errs.length === 0, 'démo : aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  await ctx.close();

  // ── 2. Compte réel, formule gratuite ──
  const soon = new Date(); soon.setDate(soon.getDate() + 70);
  await publishSeason(`tabaski_e2e_${Date.now()}`, { eventId: 'tabaski', date: iso(soon), country: null });
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  p = await ctx.newPage();
  const errs2 = []; p.on('pageerror', (e) => errs2.push(e.message)); p.on('dialog', (d) => d.accept());
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  await go('/');
  await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
  await fill('Nom', 'Famille', true); await fill('Prénom', 'Mariam'); await fill('Adresse e-mail', `famille${Date.now()}@ex.com`);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await p.getByText('Plus tard', { exact: true }).click();
  await p.getByText('Bonjour Mariam').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
  await go('/seasons/new?event=tabaski', 4000);
  t = await text();
  const shown = soon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  ok(t.includes('Date publiée pour votre pays') && t.includes(String(soon.getDate())), `catalogue distant : date publiée proposée (${shown}), modifiable`);
  await p.getByLabel('Montant prévu').fill('100000'); await p.waitForTimeout(300);
  ok(/Tabaski dans \d+ semaines : 100 000 FCFA prévus, soit [\d ]+ FCFA par semaine\./.test(await text()), 'plan par semaine calculé sur la date publiée');
  await btn('Préparer ce moment').click(); await p.waitForTimeout(2000);
  await go('/seasons/new?event=christmas');
  ok((await text()).includes('La formule gratuite prépare un moment fort à la fois.'), 'formule gratuite : un moment fort (offre Plus pour plus)');
  // 3 simulations par mois, puis l'offre.
  await go('/simulate');
  for (let i = 0; i < 3; i++) {
    await p.getByLabel('Montant envisagé').fill(String(10000 + i * 1000));
    await btn("Voir l'effet").click(); await p.waitForTimeout(500);
  }
  ok((await text()).includes('Simulations restantes ce mois-ci : 0 sur 3.'), 'formule gratuite : compteur de simulations (0 sur 3)');
  await go('/simulate');
  ok((await text()).includes('Vous avez utilisé vos 3 simulations du mois.'), '4e simulation : offre Plus, rien de bloqué ailleurs');
  ok(errs2.length === 0, 'compte réel : aucune erreur JS ' + errs2.slice(0, 2).join(' | '));

  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'FAMILLE ET MOMENTS FORTS : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
