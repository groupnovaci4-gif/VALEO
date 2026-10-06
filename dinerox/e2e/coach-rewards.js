/* Coach — phase 4 : récompenses (célébration, écran, jamais deux fois, anti-triche, deux appareils). */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  const b = await launch();
  const errs = [];
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); return { ctx, p }; };
  const go = async (p, path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const text = async (p) => (await p.locator('body').innerText()).replace(/[  ]/g, ' ');
  // Ligne « Obtenue N fois » d'une récompense sur l'écran Mes récompenses.
  const earned = async (p, name) => { const t = await text(p); const i = t.indexOf(name); if (i < 0) return null; const m = t.slice(i, i + 160).match(/Obtenue (\d+) fois|Pas encore obtenue/); return m ? (m[1] ? Number(m[1]) : 0) : null; };

  // ── 1. Démonstration : célébration à l'ouverture, une seule fois ──
  const d = await mk();
  await go(d.p, '/'); await d.p.getByText('Tester sans données (démonstration)').click(); await d.p.waitForTimeout(6000);
  const t1 = await text(d.p);
  ok(t1.includes('Nouvelle récompense !'), 'démo : célébration animée d’une nouvelle récompense à l’ouverture');
  const name = (t1.match(/Nouvelle récompense !\n+([^\n]+)/) || [])[1];
  await d.p.screenshot({ path: `${S}/rw-1.png` });
  await d.p.getByRole('button', { name: 'Continuer' }).click(); await d.p.waitForTimeout(400);
  ok(!(await text(d.p)).includes('Nouvelle récompense !'), '« Continuer » ferme la célébration');
  await go(d.p, '/rewards', 4000);
  ok((await earned(d.p, name)) === 1, `écran Mes récompenses : « ${name} » obtenue 1 fois`);
  await d.p.close(); d.p = await d.ctx.newPage(); d.p.on('pageerror', (e) => errs.push(e.message));
  await go(d.p, '/', 6500);
  ok(!(await text(d.p)).includes('Nouvelle récompense !'), 'réouverture : pas de nouvelle célébration (jamais deux fois)');
  await go(d.p, '/rewards', 4000);
  ok((await earned(d.p, name)) === 1, 'réouverture : toujours obtenue 1 seule fois');
  ok((await text(d.p)).includes('au moins 10 opérations'), 'règle anti-triche affichée');

  // ── 2. Compte en ligne : objectif atteint (et objectif « déjà plein » refusé) ──
  const email = `rw${Date.now()}@ex.com`;
  const a = await mk();
  await go(a.p, '/'); await a.p.getByText('Créer mon compte').first().click(); await a.p.waitForTimeout(500);
  await a.p.getByLabel('Nom', { exact: true }).fill('Rec'); await a.p.getByLabel('Prénom').fill('Awa'); await a.p.getByLabel('Adresse e-mail').fill(email);
  await a.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await a.p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
  await a.p.getByRole('switch').first().click(); await a.p.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
  await a.p.getByText('Plus tard', { exact: true }).click(); await a.p.getByText('Bonjour Awa').first().waitFor({ timeout: 10000 }); await a.p.waitForTimeout(2500);
  const newGoal = async (n, target, initial) => {
    await go(a.p, '/goals/new'); await a.p.getByText('Créer mon propre objectif', { exact: false }).click(); await a.p.waitForTimeout(500);
    await a.p.getByPlaceholder('Ex. Acheter une machine à glace').fill(n); await a.p.getByRole('button', { name: 'Continuer' }).click(); await a.p.waitForTimeout(600);
    await a.p.getByLabel('Montant cible').first().fill(String(target));
    if (initial) await a.p.getByLabel('Montant déjà disponible (facultatif)').first().fill(String(initial));
    await a.p.getByRole('button', { name: "Créer l'objectif" }).or(a.p.getByRole('button', { name: 'Créer l’objectif' })).first().click(); await a.p.waitForTimeout(1500);
  };
  // Triche : objectif créé déjà plein → aucune récompense.
  await newGoal('Plein', 50000, 50000);
  await go(a.p, '/rewards', 4000);
  ok((await earned(a.p, 'Objectif atteint')) === 0, 'anti-triche : objectif créé « déjà rempli » → aucune récompense');
  // Objectif réel atteint par une contribution.
  await newGoal('Moto', 100000);
  await go(a.p, '/goals'); await a.p.getByText('Moto', { exact: false }).first().click(); await a.p.waitForTimeout(1200);
  await a.p.getByText('Ajouter de l’argent', { exact: false }).first().click(); await a.p.waitForTimeout(1200);
  await a.p.getByLabel('Montant').first().fill('100000'); await a.p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await a.p.waitForTimeout(2500);
  const tg = await text(a.p);
  ok(tg.includes('🏆 Objectif atteint'), 'objectif atteint : la célébration de l’objectif mentionne la récompense');
  await a.p.screenshot({ path: `${S}/rw-2.png` });
  await go(a.p, '/rewards', 4000);
  ok((await earned(a.p, 'Objectif atteint')) === 1, 'Mes récompenses : « Objectif atteint » obtenue 1 fois');
  // Second appareil : la récompense est retrouvée (stockage personnel), toujours 1 seule fois.
  const b2 = await mk();
  await go(b2.p, '/sign-in'); await b2.p.getByLabel('Adresse e-mail').fill(email); await b2.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await b2.p.getByRole('button', { name: 'Se connecter' }).click(); await b2.p.getByText('Bonjour Awa').first().waitFor({ timeout: 12000 }); await b2.p.waitForTimeout(4000);
  await go(b2.p, '/rewards', 5000);
  ok((await earned(b2.p, 'Objectif atteint')) === 1, 'autre appareil : récompense retrouvée, une seule fois');
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'COACH RÉCOMPENSES : TOUT EST OK');
  await b.close();
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; });
