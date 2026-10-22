/* Lot A, phase 1 — « reste par jour », accueil réordonné, démarrage rapide (compte réel sur émulateurs). */
const { BASE, launch, dayOfMonth, PER_DAY } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s).replace(/[^\d-]/g, ''));
let b;
(async () => {
  // Jour fixé : la démonstration est générée à partir de la date du jour (le 11, elle est en déficit ;
  // le 3, une saisie dépasse le budget Maison et l'alerte remplace « Enregistré ✓ »).
  const now = dayOfMonth(1);
  b = await launch({ date: now });

  // ── 1. Démonstration : ordre de l'accueil et cohérence du calcul affiché ──
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  let p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  // Design v2 : le détail du calcul est replié derrière « Comment c'est calculé ? » (texte validé).
  const how = p.getByRole('button', { name: "Comment c'est calculé ?", exact: true });
  ok((await how.count()) > 0, 'accueil : repli « Comment c’est calculé ? »');
  await how.first().click(); await p.waitForTimeout(300);
  let t = await text();
  // Refonte finale (FINAL-accueil.png, B2 à B7) : carte → 4 tuiles (dont « Parler ») → « À lire » → dernières opérations → enveloppes.
  const iDaily = t.indexOf('Votre plafond de dépenses par jour'), iTiles = t.indexOf('Historique'), iToRead = t.indexOf('À lire'), iRecent = t.indexOf('Dernières opérations'), iEnv = t.indexOf('Enveloppes');
  ok(iDaily >= 0 && iDaily < iTiles && iTiles < iToRead && iToRead < iRecent && iRecent < iEnv, `ordre : reste par jour → tuiles → À lire → dernières opérations → enveloppes (${[iDaily, iTiles, iToRead, iRecent, iEnv].join(' < ')})`);
  const sentence = (t.match(PER_DAY) || []);
  // Argent disponible v2 (§7.3) : (argent disponible − engagements jusqu'au prochain revenu) / jours.
  const detail = (t.match(/Argent disponible ([\d ]+) FCFA − engagements ([\d ]+) FCFA, sur (\d+) jour/) || []);
  ok(!!sentence[0] && !!detail[0], `carte : « ${sentence[0] ?? '—'} »`);
  if (sentence[0] && detail[0]) {
    const expected = Math.floor((num(detail[1]) - num(detail[2])) / Number(detail[3]));
    ok(num(sentence[1]) === expected, `calcul affiché cohérent : (${detail[1]} − ${detail[2]}) / ${detail[3]} j = ${expected}`);
    ok(Number(detail[3]) >= 1 && Number(detail[3]) <= 31, `période jusqu’au prochain revenu (${detail[3]} jour(s))`);
  }
  // B4 : la tuile « Parler » remplace la bulle (même action, exemple gardé) ; le clavier reste au centre (« Saisir »).
  ok((await p.getByRole('button', { name: /^Parler, « .+ »$/ }).count()) > 0 && (await p.getByText('Saisir', { exact: true }).count()) > 0, 'tuile « Parler » avec exemple + « Saisir »');
  // Recent : 5 dernières opérations au plus (B6 : groupées par jour), entre leur titre et « Enveloppes ».
  const yFrom = (await p.getByText('Dernières opérations', { exact: true }).first().boundingBox()).y;
  const yTo = (await p.getByText('Enveloppes', { exact: true }).first().boundingBox()).y;
  const recentRows = await p.evaluate(([a, z]) => [...document.querySelectorAll('[role=button][aria-label*="FCFA"]')].filter((e) => { const y = e.getBoundingClientRect().y + window.scrollY; return y > a + 20 && y < z; }).length, [yFrom, yTo]);
  ok(recentRows > 0 && recentRows <= 5, `dernières opérations : ${recentRows} ligne(s) (≤ 5)`);
  // Montants masqués : le reste par jour aussi.
  await p.getByRole('button', { name: 'Masquer les montants' }).click(); await p.waitForTimeout(300);
  ok(/Votre plafond de dépenses par jour\s+•+/.test(await text()), 'montants masqués : le reste par jour est masqué aussi');
  // Après 10 saisies réussies, la bulle se réduit à une ligne (compteur local du compte).
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(':entryStats')) ?? 'dinerox:v1:local:entryStats';
    const cur = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...cur, successes: 10 }));
  });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3500); await closeCelebration();
  t = await text();
  // Refonte finale B4 : la bulle est devenue une tuile de taille fixe (maquette) ; il n'y a plus rien à
  // réduire après 10 saisies (écart signalé au fondateur, docs/design-pro/etape-5/DECISIONS-PREUVES.md).
  ok((await p.getByRole('button', { name: /^Parler, « .+ »$/ }).count()) === 1, 'après 10 saisies : la tuile « Parler » reste telle que la maquette (écart B4 signalé)');
  await p.screenshot({ path: `${S}/lot-a-home.png` });
  ok(errs.length === 0, 'démo : aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  await ctx.close();

  // ── 2. Compte réel : démarrage rapide → aperçu → accueil identique ──
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  p = await ctx.newPage();
  const errs2 = []; p.on('pageerror', (e) => errs2.push(e.message)); p.on('dialog', (d) => d.accept());
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.goto(new URL('/sign-up', p.url()).href, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  await fill('Nom', 'Rapide', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', `rapide${Date.now()}@ex.com`);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  ok((await text()).includes('Démarrage rapide (1 minute)'), 'onboarding : démarrage rapide proposé (parcours complet conservé)');
  await btn('Démarrer rapidement').click(); await p.waitForTimeout(600);
  ok((await text()).includes('Votre revenu'), 'étape 1 : revenu');
  await checkAllInputs(p, 'Démarrage rapide › revenu', ok, { expectInputs: true });
  await fill('Revenu mensuel', '250000');
  await p.getByLabel('Jour de paie (facultatif, 1 à 31)').fill('25');
  await btn('Continuer').click(); await p.waitForTimeout(600);
  ok((await text()).includes('Vos charges fixes'), 'étape 2 : charges fixes');
  await p.getByText('Loyer', { exact: true }).first().click(); await p.waitForTimeout(400);
  await checkAllInputs(p, 'Démarrage rapide › charges', ok, { expectInputs: true });
  await p.getByLabel('Montant mensuel — Loyer (facultatif)').first().fill('100000');
  await p.getByLabel('Jour du mois (facultatif)').first().fill('28');
  await btn('Continuer').click(); await p.waitForTimeout(600);
  t = await text();
  // v2 (§2, §7.3) : le revenu déclaré n'est pas de l'argent disponible ; aucun reste par jour inventé.
  ok(t.includes('Votre argent disponible aujourd\'hui') && !PER_DAY.test(t) && !/Il vous reste [\d ]+ FCFA par jour/.test(t), 'aperçu : demande l’argent disponible, aucun reste par jour tiré du revenu déclaré');
  await p.screenshot({ path: `${S}/lot-a-quick-result.png` });
  await btn('Commencer').click();
  await p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
  t = await text();
  ok(!PER_DAY.test(t) && (await btn('Enregistrer mon argent disponible').count()) > 0, 'accueil : carte « argent disponible » à remplir, pas de reste par jour');
  // L'utilisateur indique l'argent présent : le reste par jour apparaît, cohérent avec son détail.
  await p.getByLabel('Cash', { exact: true }).first().fill('300000');
  await btn('Enregistrer mon argent disponible').click(); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: "Comment c'est calculé ?", exact: true }).first().click(); await p.waitForTimeout(300);
  t = await text();
  const home = (t.match(PER_DAY) || [])[1];
  const d2 = (t.match(/Argent disponible ([\d ]+) FCFA − engagements ([\d ]+) FCFA, sur (\d+) jour/) || []);
  ok(num(d2[1]) === 300000 && num(home) === Math.floor((num(d2[1]) - num(d2[2])) / Number(d2[3])), `accueil : reste par jour sur l’argent déclaré (${home} = (${d2[1]} − ${d2[2]}) / ${d2[3]} j)`);
  await p.goto(BASE + '/recurring', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  t = await text();
  ok(t.includes('Loyer') && t.includes('100 000'), 'charge fixe créée comme opération récurrente (Loyer 100 000)');
  ok(errs2.length === 0, 'démarrage rapide : aucune erreur JS ' + errs2.slice(0, 2).join(' | '));

  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'LOT A ACCUEIL : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
