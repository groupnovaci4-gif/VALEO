/*
 * « Mon épargne » (1.8) sur l'application réelle (compte réel, formule gratuite, émulateurs) :
 *  1. le scénario exact du fondateur : « Créer un compte d'épargne », modèle « Compte bancaire »
 *     touché, « Ma banque », 100 000 déjà sur le compte + 50 000 à ajouter → 150 000 ;
 *  2. versement depuis Wave : Wave ↓, épargne ↑, reste par jour ↓, dépenses du mois inchangées ;
 *  3. ajustement de solde : ni revenu ni dépense ;
 *  4. versement affecté à un objectif : progression ↑, compté une seule fois ;
 *  5. retrait vers Wave ; retrait d'un objectif au-delà de ce qui y est → refus clair ;
 *  6. phrase « J'ai épargné 20 000 » → écran de versement, jamais une dépense ;
 *  7. limite de la formule gratuite (3 comptes) : message clair, aucune limite changée ;
 *  8. versement HORS LIGNE : enregistré tout de suite, synchronisé au retour du réseau (vu d'un 2e appareil).
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s ?? '').replace(/[^\d-]/g, ''));

let b;
const email = `sav${Date.now()}@ex.com`;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  const tap = async (t, w = 300) => { await p.getByText(t, { exact: true }).first().click(); await p.waitForTimeout(w); };
  const totalSavings = async () => { await go('/savings'); return num(((await text()).match(/Épargne totale\s*\n\s*([^\n]+)/) || [])[1]); };
  // Soldes lus sur les puces de l'écran de versement (« Wave · 80 000 FCFA »).
  const balanceOf = async (name) => {
    await go('/savings/move?mode=deposit');
    const label = await p.getByRole('button', { name: new RegExp(`^${name} · `) }).first().getAttribute('aria-label').catch(() => null);
    return label ? num(label.split('·')[1]) : NaN;
  };
  const perDay = async () => { await go('/'); return num(((await text()).match(/Il vous reste ([\d ]+) FCFA par jour/) || [])[1]); };
  const monthExpenses = async () => { await go('/transactions'); return (await text()).split('\n').filter((l) => /^-[\d ]+ FCFA$/.test(l.trim())).map(num).reduce((a, x) => a + x, 0); };

  await go('/');
  await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
  await fill('Nom', 'Test', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', email);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await p.getByText('Plus tard', { exact: true }).click();
  await p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(3000);

  // Revenu du mois (pour le reste par jour), une petite dépense et un compte Wave.
  await go('/transaction/new?type=income'); await fill('Montant', '300000'); await tap('Salaire'); await btn('Enregistrer').last().click(); await p.waitForTimeout(1500);
  await go('/accounts/edit'); await tap('Wave', 300); await fill('Nom du compte', 'Wave'); await fill('Solde actuel', '80000'); await btn('Enregistrer').last().click(); await p.waitForTimeout(1500);

  // ── 1. Le scénario exact du fondateur, modèle « Compte bancaire » touché ──
  await go('/savings');
  await btn("Créer un compte d'épargne").click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /^Compte bancaire|^Banque/ }).first().click(); await p.waitForTimeout(300);
  ok(await p.getByRole('switch').first().isChecked(), 'modèle « Compte bancaire » touché : le compte reste un compte d’épargne');
  await fill('Nom du compte', 'Ma banque');
  await fill('Combien y a-t-il déjà sur ce compte ?', '100000');
  await fill('Montant à verser maintenant (facultatif)', '50000');
  await p.waitForTimeout(300);
  await p.getByRole('tab', { name: 'Déjà sur ce compte' }).first().click(); await p.waitForTimeout(300);
  await btn('Enregistrer').last().click(); await p.waitForTimeout(800);
  ok((await text()).includes('Versement enregistré ✓'), 'confirmation « Versement enregistré ✓ »');
  await p.waitForTimeout(1200);
  ok((await totalSavings()) === 150_000, 'scénario du fondateur : 100 000 déjà sur le compte + 50 000 ajoutés = 150 000 dans « Mon épargne »');
  await go('/transactions');
  let t = await text();
  ok(t.includes('Ajustement de solde') && t.includes('+50 000 FCFA'), 'le versement apparaît dans l’historique (ajustement de solde +50 000)');

  // ── 2. Versement depuis Wave ──
  const [wave0, day0, exp0] = [await balanceOf('Wave'), await perDay(), await monthExpenses()];
  await go('/savings');
  await btn("Verser de l'argent").first().click(); await p.waitForTimeout(1500);
  await fill('Montant', '20000');
  await p.getByRole('button', { name: /^Wave · / }).first().click(); await p.waitForTimeout(200);
  await btn('Enregistrer le versement').click(); await p.waitForTimeout(700);
  ok((await text()).includes('Versement enregistré ✓'), 'toast « Versement enregistré ✓ »');
  await p.waitForTimeout(1000);
  ok((await totalSavings()) === 170_000, 'épargne +20 000 (170 000)');
  const wave1 = await balanceOf('Wave');
  ok(wave1 === wave0 - 20_000, `Wave −20 000 (${wave0} → ${wave1})`);
  const day1 = await perDay();
  ok(day1 < day0, `reste par jour en baisse (${day0} → ${day1})`);
  ok((await monthExpenses()) === exp0, `dépenses inchangées : un versement n’est pas une dépense (${exp0})`);
  await go('/transactions'); ok((await text()).includes('Wave → Ma banque'), 'versement visible dans l’Historique : « Wave → Ma banque »');

  // ── 3. Ajustement de solde ──
  await go('/savings'); await btn('Ajuster le solde').first().click(); await p.waitForTimeout(1500);
  await fill("Solde réel aujourd'hui", '175000'); await p.waitForTimeout(300);
  ok((await text()).includes('Ajustement : +5 000 FCFA'), 'écart affiché : +5 000');
  await btn('Enregistrer le nouveau solde').click(); await p.waitForTimeout(1800);
  ok((await totalSavings()) === 175_000, 'ajustement : épargne = solde réel (175 000)');
  ok((await monthExpenses()) === exp0, 'ajustement : ni revenu ni dépense (dépenses inchangées)');
  ok((await perDay()) === day1, 'ajustement : reste par jour inchangé');

  // ── 4. Versement affecté à un objectif ──
  await go('/goals/new'); await p.getByText('Créer mon propre objectif', { exact: false }).click(); await p.waitForTimeout(500);
  await p.getByPlaceholder('Ex. Acheter une machine à glace').fill('Moto'); await btn('Continuer').click(); await p.waitForTimeout(700);
  await fill('Montant cible', '100000');
  await p.getByRole('button', { name: "Créer l'objectif" }).or(p.getByRole('button', { name: 'Créer l’objectif' })).first().click(); await p.waitForTimeout(1500);
  await go('/savings'); await btn("Verser de l'argent").first().click(); await p.waitForTimeout(1500);
  await fill('Montant', '10000');
  await p.getByRole('button', { name: /^Wave · / }).first().click(); await p.waitForTimeout(200);
  await p.getByRole('switch', { name: 'Affecter à un objectif' }).click(); await p.waitForTimeout(300);
  await btn('Enregistrer le versement').click(); await p.waitForTimeout(1800);
  ok((await totalSavings()) === 185_000, 'versement affecté : épargne +10 000 (185 000)');
  await go('/goals'); t = await text();
  ok(/10 000 FCFA \/ 100 000 FCFA|10 %/.test(t), 'objectif « Moto » : 10 000 / 100 000 (compté une fois)');

  // ── 5. Retraits ──
  await go('/savings'); await btn('Retirer').first().click(); await p.waitForTimeout(1500);
  await fill('Montant', '500000');
  await btn('Enregistrer le retrait').click(); await p.waitForTimeout(800);
  ok((await text()).includes("Vous ne pouvez pas retirer plus que le solde de ce compte d'épargne."), 'retrait au-delà du solde : refus clair');
  await fill('Montant', '15000');
  await p.getByRole('switch', { name: "Retirer aussi d'un objectif" }).click(); await p.waitForTimeout(300);
  await btn('Enregistrer le retrait').click(); await p.waitForTimeout(800);
  ok((await text()).includes('Vous ne pouvez pas retirer plus que le montant mis de côté pour cet objectif.'), 'retrait de l’objectif au-delà de ce qui y est (15 000 > 10 000) : refus clair');
  await p.getByRole('switch', { name: "Retirer aussi d'un objectif" }).click(); await p.waitForTimeout(300);
  await btn('Enregistrer le retrait').click(); await p.waitForTimeout(800);
  ok((await text()).includes('Retrait enregistré ✓'), 'retrait de 15 000 vers Wave enregistré');
  await p.waitForTimeout(1000);
  ok((await totalSavings()) === 170_000, 'épargne −15 000 (170 000)');

  // ── 6. Phrase « J'ai épargné 20 000 » ──
  const exp2 = await monthExpenses();
  await go('/entry?mode=keyboard', 3500);
  await p.getByLabel('Écrivez comme vous parlez').fill("J'ai épargné 20 000"); await btn('Comprendre').click(); await p.waitForTimeout(2000);
  ok(p.url().includes('/savings/move'), `« J'ai épargné 20 000 » → écran de versement (${p.url().replace(BASE, '')})`);
  ok((await p.getByRole('textbox', { name: 'Montant', exact: true }).first().inputValue()).replace(/\D/g, '') === '20000', 'montant prérempli : 20 000');
  await p.getByRole('button', { name: /^Wave · / }).first().click(); await p.waitForTimeout(200);
  await btn('Enregistrer le versement').click(); await p.waitForTimeout(1800);
  ok((await totalSavings()) === 190_000, 'versement confirmé : épargne 190 000');
  ok((await monthExpenses()) === exp2, 'aucune dépense créée');

  // ── 7. Limite de la formule gratuite : Espèces + Wave + Ma banque = 3 ──
  await go('/accounts/edit?savings=1', 2500);
  await fill('Nom du compte', 'Caisse urgence'); await btn('Enregistrer').last().click(); await p.waitForTimeout(1200);
  t = await text();
  ok(t.includes('Votre formule gratuite permet 3 comptes et vous en avez déjà 3'), 'limite : message clair (3 comptes, 3 utilisés)');
  await p.screenshot({ path: `${S}/savings-limit.png` });

  // ── 8. Hors ligne (serveur Firestore injoignable) : versement de 10 000 depuis Wave ──
  // (Le mode hors ligne du navigateur ne prévient pas NetInfo sur le web : on coupe le serveur,
  // comme une connexion qui ne passe plus ; sur téléphone, NetInfo suit le réseau natif.)
  await go('/savings/move?mode=deposit');
  await ctx.route(/127\.0\.0\.1:8080/, (r) => r.abort());
  await fill('Montant', '10000');
  await p.getByRole('button', { name: /^Wave · / }).first().click(); await p.waitForTimeout(200);
  await btn('Enregistrer le versement').click(); await p.waitForTimeout(800);
  ok((await text()).includes('Versement enregistré ✓'), 'hors ligne : versement enregistré tout de suite');
  await p.waitForTimeout(1500);
  ok((await totalSavings()) === 200_000, 'hors ligne : « Mon épargne » à jour sur l’appareil (200 000)');
  // Retour de la connexion puis réouverture de l'application : l'outbox est poussée.
  await ctx.unroute(/127\.0\.0\.1:8080/);
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(8000);
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/sign-in', { waitUntil: 'load' }); await p2.waitForTimeout(2500);
  await p2.getByLabel('Adresse e-mail').fill(email); await p2.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await p2.getByRole('button', { name: 'Se connecter' }).click(); await p2.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 }); await p2.waitForTimeout(3500);
  await p2.goto(BASE + '/savings', { waitUntil: 'load' }); await p2.waitForTimeout(3500);
  const t2 = (await p2.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  ok(num((t2.match(/Épargne totale\s*\n\s*([^\n]+)/) || [])[1]) === 200_000, 'retour du réseau : versement synchronisé, vu d’un 2e appareil (200 000)');

  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  await p.screenshot({ path: `${S}/savings.png` });
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'ÉPARGNE : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
