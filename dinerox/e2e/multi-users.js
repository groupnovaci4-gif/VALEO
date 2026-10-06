/* Multi-utilisateurs : appareil partagé (A → B → A) et deux appareils simultanés. */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
const stamp = Date.now();
const A = { email: `a${stamp}@ex.com`, first: 'Adjoua', last: 'Kouame', inc: '75000', exp: '11111', payee: 'MarcheAdjoua', goal: 'Moto Adjoua' };
const B = { email: `b${stamp}@ex.com`, first: 'Bakary', last: 'Traore', inc: '64000', exp: '22222', payee: 'MarcheBakary', goal: 'Projet Bakary' };
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  const b = await launch();
  const errs = [];
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); return { ctx, p }; };
  const H = (p) => ({
    go: async (path, w = 3200) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); },
    text: async () => (await p.locator('body').innerText()).replace(/[\u00a0\u202f]/g, ' '),
    save: async () => { await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click({ timeout: 8000 }); await p.waitForTimeout(1300); },
  });
  const signUp = async (p, u) => {
    const h = H(p);
    await h.go('/');
    await p.getByText('Créer mon compte').first().click(); await p.waitForTimeout(600);
    await p.getByLabel('Nom', { exact: true }).fill(u.last); await p.getByLabel('Prénom').fill(u.first); await p.getByLabel('Adresse e-mail').fill(u.email);
    await p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
    await p.getByRole('switch').first().click();
    await p.getByRole('button', { name: 'Créer mon compte' }).click();
    await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
    await p.getByText('Plus tard', { exact: true }).click();
    try { await p.getByText(`Bonjour ${u.first}`).first().waitFor({ timeout: 10000 }); } catch (e) { await p.screenshot({ path: `${S}/multi-signup-${u.first}.png` }); console.log('URL', p.url(), 'BODY', (await p.locator('body').innerText()).slice(0, 400)); throw e; }
    await p.waitForTimeout(2500);
  };
  const signIn = async (p, u) => {
    const h = H(p);
    await h.go('/');
    await p.getByText("J'ai déjà un compte").first().click(); await p.waitForTimeout(600);
    await p.getByLabel('Adresse e-mail').fill(u.email); await p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await p.getByText(`Bonjour ${u.first}`).first().waitFor({ timeout: 12000 });
    await p.waitForTimeout(3000);
  };
  const signOut = async (p) => {
    const h = H(p);
    await h.go('/settings');
    await p.getByText('Se déconnecter').last().click(); await p.waitForTimeout(2500);
    await p.getByText('Créer mon compte').first().waitFor({ timeout: 10000 });
  };
  const addData = async (p, u) => {
    const h = H(p);
    await h.go('/transaction/new?type=income');
    await p.getByLabel('Montant').first().fill(u.inc); await p.getByText('Activité commerciale').first().click(); await p.waitForTimeout(300);
    await h.save();
    await h.go('/transaction/new?type=expense');
    await p.getByLabel('Montant').first().fill(u.exp); await p.getByText('Nourriture', { exact: true }).first().click();
    await p.getByLabel('Bénéficiaire / commerçant').fill(u.payee);
    await h.save();
    await h.go('/goals/new');
    await p.getByText('Créer mon propre objectif').click(); await p.waitForTimeout(500);
    await p.getByPlaceholder('Ex. Acheter une machine à glace').fill(u.goal);
    await p.getByRole('button', { name: 'Continuer' }).click(); await p.waitForTimeout(600);
    await p.getByLabel('Montant cible').first().fill('900000');
    await p.getByRole('button', { name: 'Créer l’objectif' }).or(p.getByRole('button', { name: "Créer l'objectif" })).first().click(); await p.waitForTimeout(1500);
  };
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sees = async (p, u) => {
    const h = H(p);
    await h.go('/transactions'); const tx = await h.text();
    if (!tx.includes(u.payee) && process.env.DBGSHOT) { await p.screenshot({ path: `${S}/multi-sees-${u.first}-${Date.now()}.png` }); console.log('URL', p.url(), 'TXT', tx.slice(0, 300).replace(/\n/g, ' / ')); }
    if (process.env.DBG && tx.includes(u.payee)) { const i = tx.indexOf(u.payee); console.log('DBG', JSON.stringify(tx.slice(Math.max(0, i - 80), i + 80))); }
    await h.go('/goals'); const goals = await h.text();
    await h.go('/'); const home = await h.text();
    return { payee: tx.includes(u.payee), amount: tx.includes(fmt(u.exp)), goal: goals.includes(u.goal), name: home.includes(`Bonjour ${u.first}`) };
  };
  const storageUids = async (p) => p.evaluate(() => [...new Set(Object.keys(localStorage).filter((k) => k.startsWith('dinerox:v1:')).map((k) => k.split(':')[2]))]);

  // ── Appareil partagé ───────────────────────────────────────────────
  const d1 = await mk();
  await signUp(d1.p, A); await addData(d1.p, A);
  let s = await sees(d1.p, A);
  ok(s.payee && s.amount && s.goal, 'A : ses opérations et son objectif sont visibles ' + JSON.stringify(s));
  await signOut(d1.p);
  ok(true, 'A déconnecté → écran d’accueil');
  await signUp(d1.p, B);
  s = await sees(d1.p, A);
  ok(!s.payee && !s.amount && !s.goal, 'B (même appareil) : AUCUNE donnée de A visible (opérations, montants, objectif)');
  ok((await H(d1.p).text()).includes('Bonjour Bakary') && !(await H(d1.p).text()).includes('Adjoua'), 'B : profil de B, aucun nom de A');
  await addData(d1.p, B);
  const sb = await sees(d1.p, B);
  ok(sb.payee && sb.amount && sb.goal, 'B : ses propres données sont enregistrées');
  await signOut(d1.p);
  await signIn(d1.p, A);
  s = await sees(d1.p, A); const sA_B = await sees(d1.p, B);
  ok(s.payee && s.amount && s.goal, 'reconnexion de A : ses données sont intactes');
  ok(!sA_B.payee && !sA_B.goal, 'reconnexion de A : aucune donnée de B');
  // Fermeture / réouverture de l'application
  await d1.p.close(); d1.p = await d1.ctx.newPage(); d1.p.on('pageerror', (e) => errs.push(e.message)); d1.p.on('dialog', (d) => d.accept());
  s = await sees(d1.p, A);
  ok(s.name && s.payee && s.goal, 'réouverture : session de A conservée avec ses données');
  const uids = await storageUids(d1.p);
  ok(uids.length >= 2, `stockage local cloisonné par utilisateur (${uids.length} espaces de noms distincts)`);

  // ── Deux appareils en même temps ───────────────────────────────────
  const d2 = await mk();
  await signIn(d2.p, B);
  const C1 = { ...A, inc: '31000', exp: '13131', payee: 'SimultA', goal: A.goal };
  const C2 = { ...B, inc: '41000', exp: '14141', payee: 'SimultB', goal: B.goal };
  const quick = async (p, u) => { const h = H(p); await h.go('/transaction/new?type=expense'); await p.getByLabel('Montant').first().fill(u.exp); await p.getByText('Nourriture', { exact: true }).first().click(); await p.getByLabel('Bénéficiaire / commerçant').fill(u.payee); await h.save(); };
  await Promise.all([quick(d1.p, C1), quick(d2.p, C2)]);
  const [t1, t2] = await Promise.all([(async () => { await H(d1.p).go('/transactions', 5000); return H(d1.p).text(); })(), (async () => { await H(d2.p).go('/transactions', 5000); return H(d2.p).text(); })()]);
  ok(t1.includes('SimultA') && !t1.includes('SimultB') && !t1.includes('MarcheBakary'), 'écritures simultanées : A ne voit que les siennes');
  ok(t2.includes('SimultB') && !t2.includes('SimultA') && !t2.includes('MarcheAdjoua'), 'écritures simultanées : B ne voit que les siennes');
  // A sur un second appareil : synchronisation de SES données uniquement.
  const d3 = await mk();
  await signIn(d3.p, A);
  const t3 = await (async () => { await H(d3.p).go('/transactions', 5000); return H(d3.p).text(); })();
  ok(t3.includes('SimultA') && t3.includes('MarcheAdjoua') && !t3.includes('SimultB'), 'A sur un autre appareil : toutes ses opérations synchronisées, aucune de B');
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 3).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS : ${fails}` : 'MULTI-UTILISATEURS : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ÉCHEC', e.message.slice(0, 400)); process.exitCode = 1; });
