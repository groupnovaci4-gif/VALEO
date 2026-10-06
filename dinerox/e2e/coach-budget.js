/* Coach — phase 1 : réaction immédiate aux dépenses (85 % / 100 % / dépassement). */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  const b = await launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const text = async () => (await p.locator('body').innerText()).replace(/[  ]/g, ' ');
  const btn = async (name, w = 400) => { await p.getByRole('button', { name, exact: true }).last().click({ timeout: 8000 }); await p.waitForTimeout(w); };
  // Toast visible juste après l'enregistrement (il reste 6 s).
  const toastAfter = async () => { for (let i = 0; i < 20; i++) { const t = await p.locator('[role=alert][aria-live]').allInnerTexts().catch(() => []); if (t.length) return t.join(' ').replace(/[  ]/g, ' '); await p.waitForTimeout(150); } return ''; };
  const expense = async (amount) => {
    await go('/transaction/new?type=expense');
    await p.getByLabel('Montant').first().fill(String(amount)); await p.getByText('Nourriture', { exact: true }).first().click();
    await btn('Enregistrer', 100);
    return toastAfter();
  };
  await go('/'); await p.getByText('Créer mon compte').first().click(); await p.waitForTimeout(500);
  await p.getByLabel('Nom', { exact: true }).fill('Coach'); await p.getByLabel('Prénom').fill('Awa'); await p.getByLabel('Adresse e-mail').fill(`coach${Date.now()}@ex.com`);
  await p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
  await p.getByRole('switch').first().click(); await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
  await p.getByText('Plus tard', { exact: true }).click(); await p.getByText('Bonjour Awa').first().waitFor({ timeout: 10000 }); await p.waitForTimeout(2500);

  // Enveloppe de départ « Nourriture » à 0 : aucune alerte (budget jamais fixé).
  let t = await expense(5000);
  ok(!t.includes('budget'), `enveloppe à 0 jamais fixée : pas d'alerte de dépassement (« ${t} »)`);
  // Budget fixé : 100 000.
  await go('/budget'); await p.getByText('Nourriture', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByText('Modifier', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByLabel('Budget mensuel').first().fill('100000'); await btn('Enregistrer', 1500);
  t = await expense(79999); // 84 999
  ok(!/Attention|utilisé/.test(t), `84 999 / 100 000 : aucune alerte (« ${t} »)`);
  t = await expense(1); // 85 000
  ok(t.includes('Attention Awa, vous avez utilisé 85 % de votre budget Nourriture. Il vous reste 15 000 FCFA.'), `85 000 : « ${t} »`);
  t = await expense(5000); // 90 000
  ok(!/Attention|utilisé/.test(t), `90 000 : pas de répétition (« ${t} »)`);
  t = await expense(10000); // 100 000
  ok(t.includes('Awa, votre budget Nourriture est entièrement utilisé.'), `100 000 : « ${t} »`);
  t = await expense(20000); // 120 000
  ok(t.includes('Attention Awa, vous avez dépassé votre budget Nourriture de 20 000 FCFA.'), `120 000 : « ${t} »`);
  await go('/budget'); const bt = await text();
  ok(bt.includes('Dépassé de 20 000 FCFA') && bt.includes('Budget Nourriture dépassé de 20 000 FCFA'), 'écran Budget : « Dépassé de 20 000 FCFA » + constat');
  await go('/'); ok((await text()).includes('Dépassée'), 'accueil : carte d’enveloppe « Dépassée »');
  await p.screenshot({ path: `${S}/coach-budget.png` });
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'COACH BUDGET : TOUT EST OK');
  await b.close();
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; });
