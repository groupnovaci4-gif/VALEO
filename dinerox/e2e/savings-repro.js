/*
 * Reproduction du test du fondateur (« Mon épargne », APK 1.4.2 → dépôt) AVANT correction :
 * ce que devient chaque champ saisi. Compte réel, formule gratuite.
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
const log = (...a) => console.log(...a);
let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  await go('/');
  await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
  await fill('Nom', 'Test', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', `epargne${Date.now()}@ex.com`);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await p.getByText('Plus tard', { exact: true }).click();
  await p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(3000);

  if ((process.env.VARIANT || '') === 'limit') {
    // Formule gratuite : 3 comptes au maximum (Espèces + 2).
    for (const n of ['Orange Money', 'Wave']) {
      await go('/accounts/edit'); await fill('Nom du compte', n); await btn('Enregistrer').last().click(); await p.waitForTimeout(1200);
    }
  }
  await go('/savings');
  let t = await text();
  log('ÉCRAN ÉPARGNE (vide) :', t.split('\n').filter((l) => /pargne|Créer|compte/i.test(l)).slice(0, 8).join(' | '));
  await btn("Créer un compte d'épargne").click(); await p.waitForTimeout(1500);
  t = await text();
  log('FORMULAIRE OUVERT :', p.url().replace(BASE, ''), '| champs :', (await p.locator('input').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.placeholder))).join(', '));
  const variant = process.env.VARIANT || 'base';
  if (variant === 'bank') {
    // Le fondateur précise « ma banque » : il touche le modèle « Compte bancaire ».
    const chip = p.getByRole('button', { name: /^Compte bancaire|^Banque/ }).first();
    log('MODÈLE TOUCHÉ :', await chip.getAttribute('aria-label'));
    await chip.click(); await p.waitForTimeout(300);
    log('INTERRUPTEUR « COMPTE D\'ÉPARGNE » APRÈS LE MODÈLE :', await p.getByRole('switch').first().isChecked());
  }
  await fill('Nom du compte', 'Ma banque');
  await fill('Solde actuel', '100000');
  await btn('Enregistrer').last().click(); await p.waitForTimeout(1500);
  t = await text();
  log('APRÈS CRÉATION :', p.url().replace(BASE, ''), '|', (t.match(/Épargne totale\s*\n\s*([^\n]+)/) || [])[1], '| message :', t.split('\n').filter((l) => /limite|formule|Plus|maximum/i.test(l)).slice(0, 3).join(' | '));
  if (process.env.VARIANT === 'limit') { await p.screenshot({ path: `${S}/savings-limit.png` }); await b.close(); return; }
  if (process.env.VARIANT === 'only') {
    // Seul compte : le compte d'épargne (Espèces supprimé).
    await go('/accounts'); await p.getByText('Espèces', { exact: true }).first().click(); await p.waitForTimeout(1200);
    await btn('Modifier').click().catch(() => undefined); await p.waitForTimeout(800);
    await btn('Supprimer').first().click(); await p.waitForTimeout(1500);
    log('APRÈS SUPPRESSION D\'ESPÈCES :', (await text()).split('\n').filter((l) => /FCFA|Espèces|Ma banque/.test(l)).slice(0, 6).join(' | '));
  }
  // « Ajouter à une épargne » : le montant à ajouter.
  await go('/savings');
  await btn('Ajouter à une épargne').click(); await p.waitForTimeout(1500);
  t = await text();
  log('« AJOUTER » OUVRE :', p.url().replace(BASE, ''), '|', t.split('\n').slice(0, 30).filter((l) => /transfert|De |Vers|Depuis|compte/i.test(l)).join(' | '));
  await p.getByLabel('Montant', { exact: false }).first().fill('50000');
  await btn('Enregistrer').last().click(); await p.waitForTimeout(1500);
  t = await text();
  log('APRÈS « ENREGISTRER » :', p.url().replace(BASE, ''), '| erreurs :', t.split('\n').filter((l) => /impossible|erreur|même compte|devise|inactif|Il faut/i.test(l)).join(' | '));
  await go('/savings');
  t = await text();
  log('TOTAL ÉPARGNE :', (t.match(/Épargne totale\s*\n\s*([^\n]+)/) || [])[1]);
  await go('/accounts');
  t = await text();
  log('COMPTES :', t.split('\n').filter((l) => /FCFA|Espèces|Ma banque/.test(l)).slice(0, 10).join(' | '));
  await p.screenshot({ path: `${S}/savings-repro.png` });
  log('ERREURS JS :', errs.join(' | ') || 'aucune');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); await b?.close(); });
