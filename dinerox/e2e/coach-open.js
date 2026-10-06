/* Coach — phase 2 : résumé unique à l'ouverture, aucune répétition, déduplication entre appareils. */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  const b = await launch();
  const errs = [];
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); return { ctx, p }; };
  const go = async (p, path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  // Lignes de la carte « Votre coach » (null si absente).
  const card = async (p) => {
    const t = (await p.locator('body').innerText()).replace(/[  ]/g, ' ');
    const i = t.indexOf('Votre coach');
    if (i < 0) return null;
    const j = t.indexOf('Selon les opérations enregistrées', i);
    return t.slice(i, j).split('\n').slice(1).map((l) => l.trim()).filter((l) => /[A-Za-zÀ-ÿ]/.test(l));
  };

  // ── 1. Démonstration (local) : résumé à l'ouverture ──
  const d = await mk();
  await go(d.p, '/'); await d.p.getByText('Tester sans données (démonstration)').click();
  await d.p.getByText('Mode démonstration').first().waitFor({ timeout: 8000 }); await d.p.waitForTimeout(4500);
  const first = await card(d.p);
  ok(!!first && first.length >= 1 && first.length <= 3, `ouverture : un seul résumé de 1 à 3 points (${first ? first.length : 0}) — ${JSON.stringify(first)}`);
  ok((await d.p.locator('body').innerText()).includes('Selon les opérations enregistrées dans'), 'mention : selon les opérations enregistrées (pas de suivi bancaire en temps réel)');
  await d.p.screenshot({ path: `${S}/coach-open-1.png` });
  await d.p.getByRole('button', { name: "J'ai compris" }).click(); await d.p.waitForTimeout(500);
  ok((await card(d.p)) === null, '« J’ai compris » : la carte disparaît');
  const seen = new Set(first ?? []);
  let repeated = 0;
  for (let k = 0; k < 2; k++) {
    await d.p.close(); d.p = await d.ctx.newPage(); d.p.on('pageerror', (e) => errs.push(e.message));
    await go(d.p, '/', 6500);
    const again = (await card(d.p)) ?? [];
    for (const l of again) { if (seen.has(l)) repeated++; seen.add(l); }
  }
  ok(repeated === 0, `réouvertures : aucun point déjà présenté n'est répété (${repeated} répétition)`);

  // ── 2. Deux appareils, même compte : pas de répétition entre appareils ──
  const email = `open${Date.now()}@ex.com`;
  const a = await mk();
  await go(a.p, '/'); await a.p.getByText('Créer mon compte').first().click(); await a.p.waitForTimeout(500);
  await a.p.getByLabel('Nom', { exact: true }).fill('Open'); await a.p.getByLabel('Prénom').fill('Awa'); await a.p.getByLabel('Adresse e-mail').fill(email);
  await a.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await a.p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
  await a.p.getByRole('switch').first().click(); await a.p.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
  await a.p.getByText('Plus tard', { exact: true }).click(); await a.p.getByText('Bonjour Awa').first().waitFor({ timeout: 10000 }); await a.p.waitForTimeout(2500);
  await go(a.p, '/budget'); await a.p.getByText('Nourriture', { exact: true }).first().click(); await a.p.waitForTimeout(1200);
  await a.p.getByText('Modifier', { exact: true }).first().click(); await a.p.waitForTimeout(1200);
  await a.p.getByLabel('Budget mensuel').first().fill('100000'); await a.p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await a.p.waitForTimeout(2500);
  // Appareil B : dépense qui dépasse le budget → alerte immédiate sur B.
  const bdev = await mk();
  await go(bdev.p, '/sign-in'); await bdev.p.getByLabel('Adresse e-mail').fill(email); await bdev.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await bdev.p.getByRole('button', { name: 'Se connecter' }).click(); await bdev.p.getByText('Bonjour Awa').first().waitFor({ timeout: 12000 }); await bdev.p.waitForTimeout(3500);
  await go(bdev.p, '/transaction/new?type=expense'); await bdev.p.getByLabel('Montant').first().fill('120000'); await bdev.p.getByText('Nourriture', { exact: true }).first().click();
  await bdev.p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click();
  let toast = '';
  for (let i = 0; i < 20 && !toast; i++) { toast = (await bdev.p.locator('[role=alert][aria-live]').allInnerTexts()).join(' '); await bdev.p.waitForTimeout(150); }
  ok(toast.includes('dépassé votre budget Nourriture'), `appareil B : alerte immédiate (« ${toast.trim()} »)`);
  await bdev.p.waitForTimeout(3000);
  // Appareil A rouvert : la synchro apporte la dépense, mais l'alerte déjà donnée sur B n'est pas répétée.
  await a.p.close(); a.p = await a.ctx.newPage(); a.p.on('pageerror', (e) => errs.push(e.message));
  await go(a.p, '/', 8000);
  const t = (await a.p.locator('body').innerText()).replace(/[  ]/g, ' ');
  ok(t.includes('120 000'), 'appareil A : la dépense de B est synchronisée');
  const cA = (await card(a.p)) ?? [];
  ok(!cA.some((l) => l.includes('dépassé votre budget Nourriture')), `appareil A : l'alerte déjà donnée sur B n'est pas répétée (${JSON.stringify(cA)})`);
  await a.p.screenshot({ path: `${S}/coach-open-2.png` });
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'COACH OUVERTURE : TOUT EST OK');
  await b.close();
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; });
