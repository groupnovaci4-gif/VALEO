/* Coach — phase 5 : score de comportement (affichage, seuil, mention, confidentialité). */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  const b = await launch();
  const errs = [];
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return { ctx, p }; };
  const go = async (p, path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const text = async (p) => (await p.locator('body').innerText()).replace(/[  ]/g, ' ');
  const closeCelebration = async (p) => { const c = p.getByRole('button', { name: 'Continuer' }); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };

  // ── Démonstration : score calculé et expliqué ──
  const d = await mk();
  await go(d.p, '/'); await d.p.getByText('Tester sans données (démonstration)').click(); await d.p.waitForTimeout(5000); await closeCelebration(d.p);
  await go(d.p, '/score', 4000);
  const t = await text(d.p);
  const score = Number((t.match(/\n(\d{1,3})\nsur 100/) || [])[1]);
  ok(score >= 0 && score <= 100 && !Number.isNaN(score), `démo : score affiché (${score}/100)`);
  ok(t.includes("Ce n'est pas une note de crédit ni une évaluation bancaire"), 'mention obligatoire affichée');
  ok(t.includes('Visible par vous seul'), 'confidentialité affichée');
  ok(['Respect des budgets', "Régularité de l'épargne", 'Progression des objectifs', 'Maîtrise des dettes', "Fonds d'urgence"].every((x) => t.includes(x)), 'les 5 composantes sont présentées');
  ok(t.includes('Pourquoi mon score a changé'), 'section « Pourquoi mon score a changé »');
  await d.p.screenshot({ path: `${S}/score-demo.png`, fullPage: true });
  await go(d.p, '/analysis', 3000);
  ok((await text(d.p)).includes('Mon score de comportement'), 'accès depuis l’écran d’analyse');

  // ── Nouveau compte : pas de score avant le seuil ; aucun envoi réseau du score ──
  const a = await mk();
  const sent = [];
  a.p.on('request', (r) => { if (/127\.0\.0\.1:(8080|5001)/.test(r.url()) && r.method() !== 'GET') sent.push((r.postData() || '') + r.url()); });
  await go(a.p, '/'); await a.p.getByText('Créer mon compte').first().click(); await a.p.waitForTimeout(500);
  await a.p.getByLabel('Nom', { exact: true }).fill('Kone'); await a.p.getByLabel('Prénom').fill('Awa'); await a.p.getByLabel('Adresse e-mail').fill(`kone${Date.now()}@ex.com`);
  await a.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await a.p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
  await a.p.getByRole('switch').first().click(); await a.p.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
  await a.p.getByText('Plus tard', { exact: true }).click(); await a.p.getByText('Bonjour Awa').first().waitFor({ timeout: 10000 }); await a.p.waitForTimeout(2500);
  await go(a.p, '/score', 3500);
  ok((await text(a.p)).includes('au moins 10 opérations enregistrées'), 'nouveau compte : pas de score avant un mois complet de 10 opérations');
  const hits = sent.filter((x) => /effectiveWeight|"score"|ScoreComponent|behaviorScore/.test(x));
  if (hits.length) console.log('DBG', hits.map((h) => { const d = decodeURIComponent(h); const i = d.search(/effectiveWeight|"score"|ScoreComponent|behaviorScore/); return d.slice(Math.max(0, i - 150), i + 60); }).join('\n---\n'));
  ok(!hits.length, `aucune écriture réseau ne contient le score (${sent.length} écritures observées)`);
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'COACH SCORE : TOUT EST OK');
  await b.close();
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; });
