/* Lot A, phase 1 — « reste par jour », accueil réordonné, démarrage rapide (compte réel sur émulateurs). */
const { BASE, launch } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s).replace(/[^\d-]/g, ''));
let b;
(async () => {
  b = await launch();
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;

  // ── 1. Démonstration : ordre de l'accueil et cohérence du calcul affiché ──
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  let p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  let t = await text();
  const iDaily = t.indexOf('Reste par jour'), iBubble = t.indexOf('Dites-moi ce que vous avez dépensé ou reçu'), iRecent = t.indexOf('Dernières opérations'), iCoach = t.indexOf('Votre coach');
  ok(iDaily >= 0 && iDaily < iBubble && iBubble < iRecent && iRecent < iCoach, `ordre : reste par jour → bulle → dernières opérations → autres blocs (${[iDaily, iBubble, iRecent, iCoach].join(' < ')})`);
  const sentence = (t.match(/Il vous reste ([\d ]+) FCFA par jour jusqu'au (\d+) (\w+)/) || []);
  const detail = (t.match(/Revenus ([\d ]+) FCFA − dépenses ([\d ]+) FCFA − à venir ([\d ]+) FCFA/) || []);
  ok(!!sentence[0] && !!detail[0], `phrase : « ${sentence[0] ?? '—'} »`);
  if (sentence[0] && detail[0]) {
    const expected = Math.floor((num(detail[1]) - num(detail[2]) - num(detail[3])) / daysLeft);
    ok(num(sentence[1]) === expected, `calcul affiché cohérent : (${detail[1]} − ${detail[2]} − ${detail[3]}) / ${daysLeft} j = ${expected}`);
    ok(Number(sentence[2]) === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), 'jusqu’au dernier jour du mois');
  }
  ok(/Par exemple : « .+ »/.test(t) && (await btn('Parler').count()) > 0 && (await btn('Saisir').count()) > 0, 'bulle : exemple + « Parler » + « Saisir »');
  // Recent : 5 dernières opérations au plus, juste sous la bulle.
  // Lignes d'opération situées (à l'écran) entre le titre « Dernières opérations » et la carte du coach.
  const yFrom = (await p.getByText('Dernières opérations', { exact: true }).first().boundingBox()).y;
  const yTo = (await p.getByText(/^Votre coach/).first().boundingBox()).y;
  const recentRows = await p.evaluate(([a, z]) => [...document.querySelectorAll('[role=button][aria-label*=" · "]')].filter((e) => { const y = e.getBoundingClientRect().y + window.scrollY; return y > a && y < z; }).length, [yFrom, yTo]);
  ok(recentRows > 0 && recentRows <= 5, `dernières opérations : ${recentRows} ligne(s) (≤ 5)`);
  // Montants masqués : le reste par jour aussi.
  await p.getByRole('button', { name: 'Masquer les montants' }).click(); await p.waitForTimeout(300);
  ok(/Il vous reste •+ par jour/.test(await text()), 'montants masqués : le reste par jour est masqué aussi');
  // Après 10 saisies réussies, la bulle se réduit à une ligne (compteur local du compte).
  await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(':entryStats')) ?? 'dinerox:v1:local:entryStats';
    const cur = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...cur, successes: 10 }));
  });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3500); await closeCelebration();
  t = await text();
  ok(/Dites « .+ »/.test(t) && !t.includes('Par exemple :') && (await btn('Parler').count()) === 0, 'après 10 saisies : bulle réduite à une ligne discrète');
  await p.screenshot({ path: `${S}/lot-a-home.png` });
  ok(errs.length === 0, 'démo : aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  await ctx.close();

  // ── 2. Compte réel : démarrage rapide → aperçu → accueil identique ──
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  p = await ctx.newPage();
  const errs2 = []; p.on('pageerror', (e) => errs2.push(e.message)); p.on('dialog', (d) => d.accept());
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
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
  const rentDue = now.getDate() <= 28; // loyer du 28 encore à venir ce mois-ci
  const expectedPreview = Math.floor((250000 - (rentDue ? 100000 : 0)) / daysLeft);
  const prev = (t.match(/Il vous reste ([\d ]+) FCFA par jour/) || [])[1];
  ok(num(prev) === expectedPreview, `aperçu immédiat : ${prev} FCFA/jour (attendu ${expectedPreview})`);
  await p.screenshot({ path: `${S}/lot-a-quick-result.png` });
  await btn('Commencer').click();
  await p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
  t = await text();
  const home = (t.match(/Il vous reste ([\d ]+) FCFA par jour/) || [])[1];
  ok(num(home) === expectedPreview, `accueil : même reste par jour (${home})`);
  ok(t.includes('Déclaré'), 'source « Déclaré » affichée (revenu déclaré, pas encore enregistré)');
  await p.goto(BASE + '/recurring', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  t = await text();
  ok(t.includes('Loyer') && t.includes('100 000'), 'charge fixe créée comme opération récurrente (Loyer 100 000)');
  ok(errs2.length === 0, 'démarrage rapide : aucune erreur JS ' + errs2.slice(0, 2).join(' | '));

  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'LOT A ACCUEIL : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
