/* Audit de TOUS les formulaires : champs (générique) + enregistrements réels + persistance. */
const { BASE, launch, phraseField } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const { uidOf, put, list, shift } = require('./seed.js');
const S = process.argv[2] || '.';
const email = `audit${Date.now()}@ex.com`;
let fails = 0, total = 0;
const ok = (c, m) => { total++; if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  let p = await ctx.newPage();
  const errs = [];
  const watch = (pg) => { pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept()); };
  watch(p);
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const text = async () => (await p.locator('body').innerText()).replace(/[  ]/g, ' ');
  const has = async (t, what) => ok((await text()).includes(t), `${what} (« ${t} »)`);
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  const tap = async (t, o = {}) => { await p.getByText(t, { exact: o.exact ?? true }).nth(o.nth ?? 0).click(); await p.waitForTimeout(o.w ?? 400); };
  const btn = async (name, w = 1300) => { await p.getByRole('button', { name, exact: true }).last().click({ timeout: 8000 }); await p.waitForTimeout(w); };
  const shot = (n) => p.screenshot({ path: `${S}/audit-${n}.png` });
  const step = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} : ${e.message.split('\n')[0]}`); await shot(name.replace(/\W+/g, '_')); } };

  // ── 1. Hors connexion : inscription, connexion, mot de passe oublié ──
  await go('/');
  await tap('Créer mon compte', { exact: false });
  await step('inscription (champs)', () => checkAllInputs(p, 'Inscription', ok, { expectInputs: true }));
  await go('/sign-in'); await step('connexion (champs)', () => checkAllInputs(p, 'Connexion', ok, { expectInputs: true }));
  await go('/forgot-password'); await step('mot de passe oublié (champs)', () => checkAllInputs(p, 'Mot de passe oublié', ok, { expectInputs: true }));

  // ── 2. Inscription réelle → onboarding ──
  await step('inscription', async () => {
    await go('/'); await tap('Créer mon compte', { exact: false });
    await fill('Nom', 'Audit', true); await fill('Prénom', 'Fatou'); await fill('Adresse e-mail', email);
    await fill('Téléphone (facultatif)', '+225 07 08 09 10 11');
    await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
    await p.getByRole('switch').first().click();
    await p.getByRole('button', { name: 'Créer mon compte' }).click();
    await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
    ok(true, 'inscription → onboarding');
  });
  await step('onboarding (champs)', () => checkAllInputs(p, 'Onboarding', ok, { expectInputs: true }));
  await step('onboarding → tableau de bord', async () => { await tap('Plus tard'); await p.getByText('Bonjour Fatou').first().waitFor({ timeout: 10000 }); ok(true, 'onboarding « Plus tard » → tableau de bord'); await p.waitForTimeout(2500); });

  // ── 3. Tous les écrans de saisie : contrôle générique de chaque champ ──
  const screens = [
    ['/transaction/new?type=expense', 'Dépense'], ['/transaction/new?type=income', 'Revenu'], ['/transaction/new?type=transfer', 'Transfert'],
    ['/accounts/edit', 'Compte'], ['/accounts/edit?savings=1', 'Compte d’épargne'], ['/envelopes/edit', 'Enveloppe'], ['/debts/edit', 'Dette'], ['/recurring/edit', 'Récurrence'],
    ['/settings/profile', 'Profil'], ['/settings/financial', 'Profil financier'], ['/settings/security', 'Sécurité'],
    ['/independence', 'Indépendance financière'], ['/transactions', 'Recherche d’opérations'], ['/assistant', 'Assistant'],
    ['/reserve/new', 'Réserve famille'], ['/simulate', 'Puis-je contribuer'], ['/seasons/new?event=tabaski', 'Moment fort'],
    ['/invite-code', 'Code d’invitation'],
    ['/tontines/join', 'Rejoindre une tontine'],
  ];
  // AUDIT_FAST=1 : saute le contrôle champ par champ (mise au point des enregistrements réels).
  const fast = !!process.env.AUDIT_FAST;
  // v2 §2 : compte jamais déclaré → l'accueil demande l'argent de chaque compte.
  if (!fast) { await go('/'); await step('Accueil (argent disponible)', () => checkAllInputs(p, 'Accueil (argent disponible)', ok, { expectInputs: true })); }
  if (!fast) for (const [r, n] of screens) { await go(r); await step(n, () => checkAllInputs(p, n, ok, { expectInputs: true })); }
  if (!fast) await step('Objectif (étapes)', async () => {
    await go('/goals/new'); await tap('✏️ Créer mon propre objectif', { exact: false });
    await checkAllInputs(p, 'Objectif — nom', ok, { expectInputs: true });
    await p.getByPlaceholder('Ex. Acheter une machine à glace').fill('Temp'); await btn('Continuer', 700);
    await checkAllInputs(p, 'Objectif — formulaire', ok, { expectInputs: true });
    // v2 §5 : montant initial → « D'où vient cet argent ? » ; hors de mes comptes → note.
    await fill('Montant de départ (facultatif)', '10000'); await tap('C\'est de l\'épargne hors de mes comptes');
    await checkAllInputs(p, 'Objectif — origine hors de mes comptes', ok, { expectInputs: true });
  });
  if (!fast) await step('Saisie (feuille du micro, clavier)', async () => {
    await go('/entry?mode=keyboard', 3500);
    await phraseField(p); // mode clavier : la phrase écrite est dans le repli « Autres façons de saisir »
    await checkAllInputs(p, 'Saisie (phrase écrite)', ok, { expectInputs: true });
    await (await phraseField(p)).fill('Taxi'); await btn('Comprendre', 700);
    await p.getByRole('button', { name: /^montant :/ }).click(); await p.waitForTimeout(300);
    await checkAllInputs(p, 'Saisie (carte de confirmation)', ok, { expectInputs: true });
    await btn('Annuler', 400);
  });
  if (!fast) await step('Catégories (feuille)', async () => {
    await go('/categories'); await p.getByText('Ajouter une sous-catégorie').first().click(); await p.waitForTimeout(800);
    await checkAllInputs(p, 'Sous-catégorie (feuille)', ok, { expectInputs: true });
  });

  // ── 4. Enregistrements réels ──
  await step('revenu', async () => {
    await go('/transaction/new?type=income');
    await fill('Montant', '250000'); await tap('Salaire'); await tap('Hier'); await fill('Source', 'Employeur SARL');
    await fill('Note (facultatif)', 'Salaire octobre');
    await p.getByRole('switch').first().click(); // revenu récurrent (fréquence mensuelle)
    await btn('Enregistrer');
    await go('/transactions'); await has('Employeur SARL', 'revenu enregistré'); await has('+250 000', 'montant du revenu');
  });
  await step('dépense', async () => {
    await go('/transaction/new?type=expense');
    await fill('Montant', '18500'); await tap('Alimentation & boissons'); await tap('Marché'); await tap('Aujourd\'hui');
    await fill('Bénéficiaire / commerçant', 'Marché Cocody'); await btn('Enregistrer');
    await go('/transactions'); await has('Marché Cocody', 'dépense enregistrée'); await has('-18 500', 'montant de la dépense');
  });
  await step('compte', async () => {
    await go('/accounts/edit'); await tap('Wave'); await fill('Argent déjà sur ce compte', '10000'); await btn('Enregistrer');
    await go('/accounts'); await has('Wave', 'compte Wave créé');
    // v2 §3.2 : « Corriger le solde » (solde réel + motif).
    await tap('Wave'); await p.waitForTimeout(800); await btn('Modifier', 1500); await btn('Corriger le solde', 800);
    await checkAllInputs(p, 'Corriger le solde (feuille)', ok, { expectInputs: true });
    await btn('Fermer', 500);
  });
  await step('transfert', async () => {
    await go('/transaction/new?type=transfer'); await fill('Montant', '40000');
    await p.getByText('Wave', { exact: true }).last().click(); await p.waitForTimeout(300); await btn('Enregistrer');
    await go('/accounts'); await has('191 500 FCFA', 'Cash après transfert (250 000 − 18 500 − 40 000)'); await has('50 000 FCFA', 'Wave après transfert');
  });
  await step('épargne (versement, retrait, ajustement)', async () => {
    await go('/accounts/edit?savings=1'); await fill('Nom du compte', 'Épargne audit'); await btn('Enregistrer');
    for (const [mode, n] of [['deposit', 'Versement'], ['withdraw', 'Retrait'], ['adjust', 'Ajustement de solde']]) {
      await go(`/savings/move?mode=${mode}`); await checkAllInputs(p, `${n} d’épargne`, ok, { expectInputs: true });
    }
  });
  await step('objectif', async () => {
    await go('/goals/new'); await tap('✏️ Créer mon propre objectif', { exact: false });
    await p.getByPlaceholder('Ex. Acheter une machine à glace').fill('Moto Audit'); await btn('Continuer', 700);
    await tap('Véhicule'); await fill('Montant cible', '1200000'); await fill('Montant de départ (facultatif)', '200000');
    await tap('C\'est de l\'épargne hors de mes comptes'); // v2 §5 : l'argent initial ne sort pas du disponible
    await fill('Je peux mettre de côté chaque mois (facultatif)', '50000'); await tap('Importante');
    await p.getByRole('button', { name: "Créer l'objectif" }).or(p.getByRole('button', { name: 'Créer l’objectif' })).first().click(); await p.waitForTimeout(1500);
    await go('/goals'); await has('Moto Audit', 'objectif créé'); await has('17 %', 'progression 200 000 / 1 200 000');
  });
  await step('contribution', async () => {
    await go('/goals'); await tap('Moto Audit', { exact: false }); await p.waitForTimeout(800);
    // Bouton de la FICHE (nom exact, visible) : l'onglet Objectifs, resté monté sous la fiche, a aussi le sien (« …, Moto Audit »).
    await p.getByRole('button', { name: 'Ajouter de l’argent', exact: true }).filter({ visible: true }).first().click(); await p.waitForTimeout(400);
    await checkAllInputs(p, 'Contribution', ok, { expectInputs: true });
    await fill('Montant', '100000'); await btn('Enregistrer');
    await go('/goals'); await has('25 %', 'contribution : 300 000 / 1 200 000');
  });
  await step('dette + remboursement', async () => {
    await go('/debts/edit'); await fill('Personne / institution', 'Banque Audit'); await fill('Montant initial', '500000');
    await fill('Mensualité (facultatif)', '50000'); await p.getByLabel(/Jour d'échéance/).first().fill('31'); await p.getByLabel(/Taux annuel/).first().fill('7,5');
    await tap('Hors de mes comptes'); // v2 : compte exigé ; une dette d'avant, sans mouvement
    await btn('Enregistrer');
    await go('/debts'); await tap('Banque Audit', { exact: false }); await p.waitForTimeout(800);
    await tap('Enregistrer un remboursement', { exact: false });
    await checkAllInputs(p, 'Remboursement (feuille)', ok, { expectInputs: true });
    await fill('Montant', '50000'); await p.getByText('Hors de mes comptes', { exact: true }).last().click(); await btn('Enregistrer');
    await has('450 000', 'dette : reste après remboursement');
  });
  await step('récurrence', async () => {
    await go('/recurring/edit'); await fill('Libellé', 'Prime audit'); await fill('Montant', '30000'); await tap('Chaque mois'); await btn('Enregistrer');
    await go('/recurring'); await has('Prime audit', 'récurrence créée'); await has('Employeur SARL', 'revenu récurrent issu du formulaire de revenu');
  });
  await step('dépense récurrente', async () => {
    await go('/recurring/edit'); await tap('Dépense'); await fill('Libellé', 'Loyer audit'); await fill('Montant', '100000');
    await tap('Maison & logement'); await tap('Chaque mois'); await btn('Enregistrer');
    await go('/recurring'); await has('Loyer audit', 'dépense récurrente créée');
  });
  // v2 (D7) : une échéance n'est plus générée seule ; l'accueil demande « reçu ? » / « payé ? ».
  await step('échéances confirmées', async () => {
    await go('/'); await has('Prime audit attendu : reçu ?', 'carte « reçu ? » de la prime');
    await p.getByText('Prime audit attendu : reçu ?').locator('xpath=..').getByRole('button', { name: 'Confirmer', exact: true }).click(); await p.waitForTimeout(1500);
    await has('Loyer audit 100 000 FCFA : payé ?', 'carte « payé ? » du loyer');
    await btn('Oui, depuis Cash', 1500);
    ok(!(await text()).includes('Loyer audit 100 000 FCFA : payé ?'), 'cartes d’échéance retirées après confirmation');
  });
  await step('enveloppe', async () => {
    await go('/envelopes/edit'); await fill('Nom', 'Enveloppe audit', true); await fill('Budget mensuel', '30000'); await tap('Loisirs & divertissement'); await btn('Enregistrer');
    await go('/budget'); await has('Enveloppe audit', 'enveloppe créée');
  });
  await step('sous-catégorie', async () => {
    await go('/categories'); await p.getByText('Ajouter une sous-catégorie').first().click(); await p.waitForTimeout(800);
    await p.getByLabel('Nom', { exact: true }).last().fill('Sous-cat audit'); await btn('Enregistrer');
    await has('Sous-cat audit', 'sous-catégorie créée');
  });
  // v2 §5.4 : clôturer signale d'abord ce qui n'est pas noté ; la cagnotte a un montant modifiable.
  await step('tontine : clôture et cagnotte', async () => {
    const uid = await uidOf(email);
    await put(uid, 'tontines', { id: 'audit_ton', type: 'rotating', name: 'Tontine audit', currency: 'XOF', amountPerShare: 10000, sharesHeld: 1, frequency: 'monthly', startDate: shift(-5), membersCount: 3, myTurns: [3], status: 'active', accountId: null, organizerName: null });
    await p.waitForTimeout(2500);
    await go('/tontines/audit_ton'); await btn('Clôturer', 1000);
    await has('3 cotisations et la cagnotte ne sont pas notées.', 'clôture : cotisations et cagnotte non notées signalées d’abord');
    await p.getByRole('button', { name: /^Noter la cagnotte du/ }).last().click(); await p.waitForTimeout(900);
    await checkAllInputs(p, 'Cagnotte reçue (feuille)', ok, { expectInputs: true });
    ok((await p.getByLabel('Montant', { exact: true }).last().inputValue()).replace(/\D/g, '') === '30000', 'cagnotte : 30 000 proposés (3 × 10 000), modifiables');
    await btn('Fermer', 500);
  });
  // v2 §7.2 : « Payée » propose la date de l'échéance, modifiable (rien n'est enregistré ici).
  await step('à régulariser : « Payée » à la date de l’échéance', async () => {
    const uid = await uidOf(email);
    const cash = (await list(uid, 'accounts')).find((a) => a.name === 'Cash')?.id ?? 'acc_cash_auto';
    await put(uid, 'recurring', { id: 'audit_old', type: 'expense', label: 'Eau audit', amount: 1000, currency: 'XOF', accountId: cash, categoryId: 'cat_housing', frequency: 'monthly', startDate: shift(-4, -1), endDate: shift(-3), active: true, lastGenerated: null });
    await p.waitForTimeout(2500); await go('/');
    const item = (await text()).match(/Eau audit — ([^:]+?) :/);
    ok(!!item, 'à régulariser : échéance ancienne listée');
    await p.getByText(/^Eau audit —/).first().locator('xpath=..').getByRole('button', { name: 'Payée', exact: true }).click(); await p.waitForTimeout(600);
    const t = await text();
    ok(!!item && t.split(item[1].trim()).length - 1 >= 2 && t.includes('Confirmer'), `« Payée » : date proposée = date de l’échéance (${item ? item[1].trim() : '?'})`);
    await btn('Annuler', 500);
  });
  await step('patrimoine (formule gratuite)', async () => {
    await go('/assets/edit'); const t = await text();
    ok(t.includes('Débloquer') && !(await p.$('input:not([type=checkbox])')), 'patrimoine : saisie verrouillée comme la liste (aucune saisie invisible ensuite)');
  });
  await step('profil', async () => {
    await go('/settings/profile'); await fill('Téléphone', '+225 01 02 03 04 05', true); await btn('Enregistrer');
    await go('/settings/profile'); ok((await p.getByLabel('Téléphone', { exact: true }).inputValue()).replace(/\s/g, '').includes('0102030405'), 'profil : téléphone enregistré');
  });
  await step('profil financier', async () => {
    await go('/settings/financial'); await fill('Revenu mensuel approximatif (facultatif)', '300000'); await btn('Enregistrer');
    await go('/settings/financial'); ok((await p.getByLabel('Revenu mensuel approximatif (facultatif)').inputValue()).replace(/\D/g, '') === '300000', 'profil financier : revenu enregistré');
  });
  await step('recherche', async () => { await go('/transactions'); await p.getByPlaceholder('Rechercher').fill('Cocody'); await p.waitForTimeout(600); const t = await text(); ok(t.includes('Marché Cocody') && !t.includes('Employeur SARL'), 'recherche d’opérations filtrée'); });
  await step('mot de passe', async () => {
    await go('/settings/security'); await fill('Mot de passe actuel', 'motdepasse123'); await fill('Nouveau mot de passe', 'nouveaumdp456'); await btn('Changer le mot de passe', 2500);
    ok(!(await text()).includes('incorrect'), 'mot de passe changé');
  });

  // ── 5. Fermeture / réouverture, puis déconnexion / reconnexion (données serveur) ──
  const verifyAll = async (when) => {
    await go('/transactions'); const tx = await text();
    ok(tx.includes('Employeur SARL') && tx.includes('Marché Cocody'), `${when} : revenu et dépense présents`);
    // Les échéances du jour (« Prime audit » 30 000, « Loyer audit » 100 000) ont été confirmées depuis l'accueil.
    ok(tx.includes('Prime audit') && tx.includes('Loyer audit'), `${when} : échéances récurrentes confirmées (revenu et dépense)`);
    await go('/accounts'); const ac = await text(); ok(ac.includes('121 500') && ac.includes('50 000'), `${when} : soldes des comptes (191 500 + 30 000 − 100 000 ; Wave 50 000)`);
    await go('/goals'); const gl = await text(); ok(gl.includes('Moto Audit') && gl.includes('25 %'), `${when} : objectif et contribution`);
    // Diagnostic : en cas d'échec, ce que la page montrait vraiment (capture et texte).
    if (!(gl.includes('Moto Audit') && gl.includes('25 %'))) { await shot(`goals-${when}`); require('fs').writeFileSync(`${S}/audit-goals-${when}.txt`, gl); }
    await go('/debts'); ok((await text()).includes('450 000'), `${when} : dette et remboursement`);
    await go('/recurring'); const rc = await text(); ok(rc.includes('Prime audit') && rc.includes('Loyer audit'), `${when} : récurrences`);
    await go('/budget'); ok((await text()).includes('Enveloppe audit'), `${when} : enveloppe`);
  };
  await p.close(); p = await ctx.newPage(); watch(p);
  await step('réouverture', () => verifyAll('réouverture'));
  await step('reconnexion', async () => {
    await go('/settings'); await p.getByText('Se déconnecter').last().click(); await p.getByText('Créer mon compte').first().waitFor({ timeout: 10000 });
    await go('/sign-in'); await fill('Adresse e-mail', email); await fill('Mot de passe', 'nouveaumdp456', true);
    await p.getByRole('button', { name: 'Se connecter' }).click(); await p.getByText('Bonjour Fatou').first().waitFor({ timeout: 12000 }); await p.waitForTimeout(3000);
    ok(true, 'reconnexion avec le nouveau mot de passe');
    await verifyAll('reconnexion');
  });
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 3).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(`\nRÉSULTAT : ${total - fails}/${total} vérifications réussies`);
  await b.close();
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; });
