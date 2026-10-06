/* Coach — phase 3 : voix, sons, confidentialité des montants, arrêt en arrière-plan.
   La synthèse vocale et l'audio du navigateur sont interceptés pour enregistrer
   exactement ce qui serait lu ou joué (aucun haut-parleur en environnement de test). */
const { BASE, launch } = require('./env.js');
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const SPY = () => {
  window.__spoken = []; window.__cancelled = 0; window.__sounds = [];
  const synth = window.speechSynthesis;
  if (synth) {
    synth.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend({}), 30); };
    synth.cancel = () => { window.__cancelled++; };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__sounds.push(String(this.src).split('/').pop()); return Promise.resolve(); };
  void play;
};
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.addInitScript(SPY);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const spoken = () => p.evaluate(() => window.__spoken.map((x) => x.replace(/[\u00a0\u202f]/g, ' ')));
  const sounds = () => p.evaluate(() => window.__sounds.slice());
  const reset = () => p.evaluate(() => { window.__spoken = []; window.__sounds = []; });
  const expense = async (amount) => {
    await go('/transaction/new?type=expense', 2500);
    await p.getByLabel('Montant').first().fill(String(amount)); await p.getByText('Nourriture', { exact: true }).first().click();
    await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await p.waitForTimeout(1800);
  };
  await go('/'); await p.getByText('Créer mon compte').first().click(); await p.waitForTimeout(500);
  await p.getByLabel('Nom', { exact: true }).fill('Voix'); await p.getByLabel('Prénom').fill('Awa'); await p.getByLabel('Adresse e-mail').fill(`voice${Date.now()}@ex.com`);
  await p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
  await p.getByRole('switch').first().click(); await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
  await p.getByText('Plus tard', { exact: true }).click(); await p.getByText('Bonjour Awa').first().waitFor({ timeout: 10000 }); await p.waitForTimeout(3000);

  // 1. Tester la voix (réglages).
  await go('/settings/notifications'); await reset();
  await p.getByRole('button', { name: 'Tester la voix' }).click(); await p.waitForTimeout(1500);
  const test = await spoken();
  ok(test.length === 1 && test[0].includes('Bonjour Awa, je suis votre coach'), `« Tester la voix » : ${JSON.stringify(test)}`);

  // Budget Nourriture 100 000.
  await go('/budget'); await p.getByText('Nourriture', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByText('Modifier', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByLabel('Budget mensuel').first().fill('100000'); await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await p.waitForTimeout(2000);

  // 2. 85 % : avertissement → son d'avertissement, PAS de voix (réglage par défaut « importantes »).
  await reset(); await expense(85000);
  ok((await spoken()).length === 0, `85 % : aucune voix par défaut (${JSON.stringify(await spoken())})`);
  ok((await sounds()).some((s) => s.includes('warning')), `85 % : son d'avertissement (${JSON.stringify(await sounds())})`);

  // 3. Dépassement : voix SANS montant (confidentialité par défaut) + alarme.
  await reset(); await expense(35000); // 120 000
  let s = await spoken();
  ok(s.length === 1 && s[0].includes('vous avez dépassé votre budget Nourriture') && !/\d/.test(s[0]), `dépassement : voix sans montant (« ${s[0]} »)`);
  ok((await sounds()).some((x) => x.includes('alarm')), 'dépassement : son d’alarme');

  // 4. Lire les montants activé → le montant est prononcé ; le dépassement suivant (lendemain) n'existe pas ici,
  //    on vérifie donc avec le bouton de test du message réel via une nouvelle enveloppe.
  await go('/settings/notifications');
  await p.getByRole('switch', { name: /Lire les montants/ }).click(); await p.waitForTimeout(1200);
  await go('/budget'); await p.getByText('Transport', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByText('Modifier', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByLabel('Budget mensuel').first().fill('10000'); await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await p.waitForTimeout(2000);
  await reset();
  await go('/transaction/new?type=expense', 2500); await p.getByLabel('Montant').first().fill('12000'); await p.getByText('Transport', { exact: true }).first().click();
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await p.waitForTimeout(1800);
  s = await spoken();
  ok(s.length === 1 && s[0].includes('2 000') && s[0].includes('Transport'), `montants autorisés : « ${s[0]} »`);

  // 5. Mode silencieux : ni voix ni son, le texte reste affiché.
  await go('/settings/notifications');
  await p.getByRole('switch', { name: /Mode silencieux/ }).click(); await p.waitForTimeout(1200);
  await go('/budget'); await p.getByText('Famille', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByText('Modifier', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.getByLabel('Budget mensuel').first().fill('5000'); await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await p.waitForTimeout(2000);
  await reset();
  await go('/transaction/new?type=expense', 2500); await p.getByLabel('Montant').first().fill('9000'); await p.getByText('Famille', { exact: true }).first().click();
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click();
  let toast = ''; for (let i = 0; i < 20 && !toast; i++) { toast = (await p.locator('[role=alert][aria-live]').allInnerTexts()).join(' '); await p.waitForTimeout(150); }
  await p.waitForTimeout(1200);
  ok((await spoken()).length === 0 && (await sounds()).length === 0, 'mode silencieux : ni voix ni son');
  ok(toast.includes('dépassé votre budget Famille'), `mode silencieux : alerte visible à l'écran (« ${toast.trim()} »)`);

  // 6. Arrière-plan : la voix est coupée.
  const before = await p.evaluate(() => window.__cancelled);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(500);
  ok((await p.evaluate(() => window.__cancelled)) > before, 'passage en arrière-plan : lecture coupée');
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'COACH VOIX : TOUT EST OK');
  await b.close();
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; });
