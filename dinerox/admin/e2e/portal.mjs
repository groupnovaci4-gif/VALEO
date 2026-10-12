/*
 * Portail back-office de bout en bout, sur les émulateurs (Auth, Firestore, Functions) :
 * connexion (mot de passe + code, 1re activation), barre latérale et page d'accueil de
 * chaque rôle, page « accès refusé », suspension / réactivation, consultation des
 * opérations avec motif, suppression d'une opération (Super Admin seulement, effets liés),
 * journal, invitation (copier le lien, accepter, activer la double vérification, annuler),
 * création d'un utilisateur, page d'action des e-mails (tous les modes, FR et EN),
 * thème sombre, captures ordinateur / tablette / téléphone.
 * Lancer : voir admin/README.md (« Tests de bout en bout »).
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const lib = await import('../scripts/emulator-lib.mjs');
const { DEMO_STAFF, seed } = await import('../scripts/seed-emulators.mjs');
const { db, auth, totp, PROJECT } = lib;

const BASE = process.env.PORTAL_URL || 'http://localhost:5175';
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const OUT = process.argv[2] || '/tmp/portal-e2e';
mkdirSync(OUT, { recursive: true });
const PASSWORD = 'Demo-Back-office-1';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const staff = Object.fromEntries(DEMO_STAFF.map((s) => [s.roleId, s]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = (path, body, key = true) => fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}${key ? '?key=fake-api-key' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const oobCodes = async () => (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json())).oobCodes ?? [];
const lastCode = async (email, type) => (await oobCodes()).filter((c) => c.email === email && c.requestType === type).pop()?.oobCode;
const usedCodes = new Map();

/** Code du moment, jamais deux fois le même pour un compte (le serveur refuse le rejeu). */
async function freshCode(secret) {
  let c = totp(secret);
  while (usedCodes.get(secret) === c) { await sleep(2000); c = totp(secret); }
  usedCodes.set(secret, c);
  return c;
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'], ...opts });
  ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|FirebaseError|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
  return p;
}
const text = async (p) => (await p.locator('body').innerText()).replace(/[  ]/g, ' ');
const navLabels = async (p) => p.locator('.side .navlink .lbl').allInnerTexts();

async function login(p, email, secret) {
  await p.goto(BASE + '/');
  await p.getByLabel('Adresse e-mail').fill(email);
  await p.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await p.getByRole('button', { name: 'Continuer' }).click();
  await p.getByText('Saisissez votre code').waitFor();
  await p.locator('.otp input').first().fill(await freshCode(secret));
  await p.getByRole('button', { name: 'Vérifier et se connecter' }).click();
  await p.locator('.pagetitle h1').waitFor();
  await p.waitForTimeout(1200);
}

try {
  // Départ propre : émulateurs vidés puis remplis avec les données fictives.
  await seed({ reset: true, quiet: true });

  // ─── 1. Super Admin : première connexion, activation de la double vérification ───
  const sa = await newPage();
  await sa.goto(BASE + '/');
  await sa.screenshot({ path: `${OUT}/login-desktop-light.png` });
  await sa.getByLabel('Adresse e-mail').fill(staff.superAdmin.email);
  await sa.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe');
  await sa.getByRole('button', { name: 'Continuer' }).click();
  await sa.getByText('Adresse ou mot de passe incorrect.').waitFor();
  ok(true, 'mot de passe faux : refus clair');
  await sa.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await sa.getByRole('button', { name: 'Continuer' }).click();
  await sa.getByText('Activez la double vérification').waitFor();
  ok(await sa.locator('.qr img').isVisible(), 'QR code affiché à la première connexion');
  await sa.screenshot({ path: `${OUT}/enroll-desktop-light.png` });
  await sa.getByText('Impossible de scanner ?').click();
  const saSecret = (await sa.locator('.secret').innerText()).trim();
  await sa.locator('.otp input').first().fill('000000');
  await sa.getByRole('button', { name: 'Activer et se connecter' }).click();
  await sa.getByText('Code incorrect.').waitFor();
  ok(true, 'code faux : refus clair, on peut retaper');
  await sa.locator('.otp input').first().fill(await freshCode(saSecret));
  await sa.getByRole('button', { name: 'Activer et se connecter' }).click();
  await sa.getByText('Vos codes de secours').waitFor();
  ok((await sa.locator('.codes li').count()) === 8, '8 codes de secours affichés une seule fois');
  await sa.screenshot({ path: `${OUT}/recovery-desktop-light.png` });
  await sa.getByRole('button', { name: 'J’ai noté mes codes, continuer' }).click();
  await sa.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
  ok(JSON.stringify(await navLabels(sa)) === JSON.stringify(['Tableau de bord', 'Statistiques', 'Utilisateurs', 'Données', 'Journal d’audit', 'Équipe et rôles', 'Réglages', 'Se déconnecter']), 'Super Admin : les 6 entrées');
  await sa.waitForTimeout(1500);
  await sa.screenshot({ path: `${OUT}/dashboard-desktop-light.png` });

  // ─── 2. Barre latérale et page d'accueil de chaque rôle ───
  const roles = [
    ['admin', ['Tableau de bord', 'Statistiques', 'Utilisateurs', 'Données'], 'Tableau de bord', true],
    ['support', ['Utilisateurs'], 'Utilisateurs', true],
    ['analyste', ['Tableau de bord', 'Statistiques'], 'Tableau de bord', false],
  ];
  const pages = {};
  for (const [role, entries, home, search] of roles) {
    const p = await newPage();
    await login(p, staff[role].email, staff[role].secret);
    pages[role] = p;
    const labels = (await navLabels(p)).filter((l) => !['Réglages', 'Se déconnecter'].includes(l));
    ok(JSON.stringify(labels) === JSON.stringify(entries), `${role} : entrées ${entries.join(', ')}`);
    ok((await p.locator('h1').innerText()) === home, `${role} : page d'accueil « ${home} »`);
    ok((await p.locator('.ssearch').count()) === (search ? 1 : 0), `${role} : recherche ${search ? 'présente' : 'absente'}`);
    await p.goto(BASE + '/equipe');
    await p.getByText('Vous n’avez pas accès à cette page').waitFor();
    ok(true, `${role} : « Équipe et rôles » ouverte à la main → accès refusé`);
  }

  // ─── 3. Support : réactivation puis suspension (motif obligatoire) ───
  const sup = pages.support;
  await sup.goto(BASE + '/utilisateurs?q=fatou.ndiaye@exemple.test');
  await sup.getByText('Fatou Ndiaye').first().click();
  await sup.getByRole('button', { name: 'Réactiver' }).click();
  ok(await sup.getByRole('button', { name: 'Réactiver le compte' }).isDisabled(), 'réactivation : motif obligatoire');
  await sup.getByLabel('Motif interne').selectOption('verification');
  await sup.getByRole('button', { name: 'Réactiver le compte' }).click();
  await sup.getByText('Compte réactivé.').waitFor();
  const fatou = await auth.getUserByEmail('fatou.ndiaye@exemple.test');
  ok(!(await auth.getUser(fatou.uid)).disabled, 'Fatou réactivée (compte Auth)');
  await sup.getByRole('button', { name: 'Suspendre' }).click();
  await sup.getByLabel('Motif interne').selectOption('fraud_suspicion');
  await sup.getByRole('button', { name: 'Suspendre le compte' }).click();
  await sup.getByText('Compte suspendu.').waitFor();
  ok((await auth.getUser(fatou.uid)).disabled, 'Fatou suspendue à nouveau (compte Auth désactivé)');
  ok((await sup.getByRole('button', { name: 'Voir les opérations' }).count()) === 0, 'support : pas de « Voir les opérations »');
  ok((await sup.getByText('Supprimer définitivement').count()) === 0, 'support : pas de « Supprimer définitivement »');

  // ─── 4. Administratrice : opérations avec motif, sans suppression ───
  const ad = pages.admin;
  await ad.goto(BASE + '/donnees');
  await ad.getByLabel('Utilisateur (e-mail ou identifiant exact)').fill('aicha.kone@exemple.test');
  await ad.getByRole('button', { name: 'Rechercher' }).click();
  await ad.getByRole('button', { name: 'Consulter les opérations' }).click();
  await ad.getByRole('heading', { name: 'Motif de consultation' }).waitFor();
  await ad.getByText('Autre', { exact: true }).click();
  ok(await ad.getByRole('button', { name: 'Consulter', exact: true }).isDisabled(), 'motif « Autre » : précision obligatoire');
  await ad.getByLabel('Précisez le motif').fill('Contrôle qualité');
  await ad.getByRole('button', { name: 'Consulter', exact: true }).click();
  await ad.getByText('Consultation enregistrée au journal').waitFor();
  await ad.getByRole('button', { name: 'Famille Koné' }).click();
  await ad.getByText('Consultation seule (suppression réservée au Super Admin)').waitFor();
  await ad.waitForTimeout(1500);
  const adText = await text(ad);
  ok(adText.includes('-25 000 FCFA') && adText.includes('+350 000 FCFA'), 'montants au format de l’app (formatMoney)');
  ok(!adText.includes('Note privée') && !adText.includes('Masqué dans le portail'), 'notes et bénéficiaires masqués (D9)');
  ok((await ad.getByRole('button', { name: /^Supprimer/ }).count()) === 0, 'Administratrice : aucun bouton « Supprimer »');
  await ad.screenshot({ path: `${OUT}/ops-admin-desktop-light.png`, fullPage: true });

  // ─── 5. Super Admin : suppression d'une opération liée à une dette ───
  await sa.goto(BASE + '/utilisateurs?q=aicha.kone@exemple.test');
  await sa.getByText('Aïcha Koné').first().click();
  await sa.getByRole('button', { name: 'Voir les opérations' }).click();
  await sa.getByRole('button', { name: 'Consulter', exact: true }).click();
  await sa.getByRole('button', { name: 'Famille Koné' }).click();
  await sa.waitForTimeout(1500);
  await sa.locator('tr', { hasText: '-25 000 FCFA' }).getByRole('button', { name: /Supprimer/ }).click();
  await sa.getByText('remboursement de dette — supprimé aussi').waitFor();
  ok(true, 'effets liés calculés par le serveur : « 1 remboursement de dette »');
  await sa.screenshot({ path: `${OUT}/delete-op-desktop-light.png` });
  const del = sa.locator('.dialog').getByRole('button', { name: 'Supprimer l’opération', exact: true });
  await sa.getByLabel('Motif interne').selectOption('client_request');
  await sa.locator('.dialog').getByRole('checkbox').check();
  ok(await del.isDisabled(), 'double confirmation : SUPPRIMER doit être tapé');
  await sa.getByLabel(/Pour confirmer, tapez/).fill('SUPPRIMER');
  await del.click();
  await sa.getByText('Opération supprimée sur tous les appareils.').waitFor();
  const tx = await db.doc('spaces/fam_kone/transactions/tx_demo_6').get();
  const dp = await db.doc('spaces/fam_kone/debtPayments/dp_1').get();
  ok(tx.get('deleted') === true && tx.get('adminDeleted') === true && tx.get('amount') === 25000, 'opération marquée supprimée (jamais effacée), contenu intact');
  ok(dp.get('deleted') === true, 'remboursement de dette lié marqué supprimé');

  // ─── 6. Journal ───
  await sa.goto(BASE + '/journal');
  await sa.locator('td', { hasText: 'Suppression d’une opération' }).first().waitFor();
  ok((await text(sa)).includes('Chaîne d’empreintes vérifiée'), 'journal : chaîne d’empreintes vérifiée');
  ok(!(await text(sa)).includes('25 000'), 'journal : aucun montant');
  await sa.getByRole('button', { name: /Voir le détail/ }).first().click();
  await sa.getByText('aucun montant enregistré').waitFor();
  await sa.screenshot({ path: `${OUT}/audit-detail-desktop-light.png` });
  await sa.keyboard.press('Escape');

  // ─── 7. Invitation : envoyer, copier le lien, accepter, activer la double vérification ───
  await sa.goto(BASE + '/equipe');
  await sa.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await sa.locator('.dialog').getByLabel('Adresse e-mail professionnelle').fill('yao@dinerox-demo.test');
  await sa.locator('.dialog').getByLabel('Nom', { exact: true }).fill('Yao Tanoh');
  await sa.locator('.dialog').getByLabel('Rôle', { exact: true }).selectOption('support');
  await sa.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  await sa.getByText('Invitation envoyée à yao@dinerox-demo.test. Le lien est valable 7 jours.').waitFor();
  ok(true, 'invitation envoyée (e-mail Firebase avec lien de suite)');
  ok(!!(await lastCode('yao@dinerox-demo.test', 'PASSWORD_RESET')), 'e-mail Firebase « mot de passe » parti (lien de suite = invitation)');
  await sa.locator('tr', { hasText: 'Yao Tanoh' }).getByRole('button', { name: 'Copier le lien d’invitation' }).click();
  await sa.getByText('Lien copié.').waitFor();
  const link = await sa.evaluate(() => navigator.clipboard.readText());
  ok(/\/invitation\?i=.+#t=.+/.test(link), 'lien d’invitation copié (jeton après « # »)');
  await sa.screenshot({ path: `${OUT}/team-desktop-light.png`, fullPage: true });
  const inv = await newPage();
  await inv.goto(link);
  await inv.getByText('vous invite à rejoindre l’équipe d’administration').waitFor();
  const invText = await text(inv);
  ok(invText.includes('Koffi B.') && invText.includes('Support'), 'invitation : qui invite et quel rôle');
  await inv.screenshot({ path: `${OUT}/invitation-desktop-light.png` });
  await inv.getByLabel('Votre adresse e-mail (celle qui a reçu l’invitation)').fill('pirate@exemple.test');
  await inv.getByLabel('Choisissez un mot de passe').fill('Yao-mot-de-passe-1');
  await inv.getByLabel('Confirmez le mot de passe').fill('Yao-mot-de-passe-1');
  await inv.getByRole('button', { name: 'Accepter l’invitation' }).click();
  await inv.getByText('Cette adresse ne correspond pas à l’invitation.').waitFor();
  ok(true, 'autre adresse : refus clair');
  await inv.getByLabel('Votre adresse e-mail (celle qui a reçu l’invitation)').fill('yao@dinerox-demo.test');
  await inv.getByLabel('Choisissez un mot de passe').fill('court');
  await inv.getByRole('button', { name: 'Accepter l’invitation' }).click();
  await inv.getByText('au moins 12 caractères').waitFor();
  ok(true, 'mot de passe de moins de 12 caractères : refusé');
  await inv.getByLabel('Choisissez un mot de passe').fill('Yao-mot-de-passe-1');
  await inv.getByRole('button', { name: 'Accepter l’invitation' }).click();
  await inv.getByText('Invitation acceptée. Dernière étape').waitFor();
  await inv.getByRole('button', { name: 'Continuer' }).click();
  await inv.getByLabel('Adresse e-mail').fill('yao@dinerox-demo.test');
  await inv.getByLabel('Mot de passe', { exact: true }).fill('Yao-mot-de-passe-1');
  await inv.getByRole('button', { name: 'Continuer' }).click();
  await inv.getByText('Activez la double vérification').waitFor();
  await inv.getByText('Impossible de scanner ?').click();
  const yaoSecret = (await inv.locator('.secret').innerText()).trim();
  await inv.locator('.otp input').first().fill(await freshCode(yaoSecret));
  await inv.getByRole('button', { name: 'Activer et se connecter' }).click();
  await inv.getByRole('button', { name: 'J’ai noté mes codes, continuer' }).click();
  await inv.getByRole('heading', { name: 'Utilisateurs' }).waitFor();
  ok(true, 'invité : accepte, choisit son mot de passe, active la double vérification, arrive sur sa page');
  await inv.goto(link);
  await inv.getByText('Cette invitation a déjà été utilisée.').waitFor();
  ok(true, 'lien déjà utilisé : refusé');
  // Annuler une autre invitation.
  await sa.goto(BASE + '/equipe');
  await sa.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await sa.locator('.dialog').getByLabel('Adresse e-mail professionnelle').fill('mariam@dinerox-demo.test');
  await sa.locator('.dialog').getByLabel('Nom', { exact: true }).fill('Mariam Doumbia');
  await sa.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  await sa.getByText('Invitation envoyée à mariam@dinerox-demo.test').waitFor();
  await sa.locator('tr', { hasText: 'Mariam Doumbia' }).getByRole('button', { name: 'Annuler' }).click();
  await sa.getByRole('button', { name: 'Annuler l’invitation' }).click();
  await sa.getByText('Invitation annulée.').waitFor();
  await sa.waitForTimeout(800);
  ok((await sa.locator('tr', { hasText: 'Mariam Doumbia' }).innerText()).includes('Annulée'), 'invitation annulée : statut « Annulée »');

  // ─── 8. Création d'un utilisateur ───
  await sa.goto(BASE + '/utilisateurs');
  await sa.getByRole('button', { name: 'Créer un utilisateur' }).click();
  await sa.locator('.dialog').getByLabel('Prénom', { exact: true }).fill('Rokia');
  await sa.locator('.dialog').getByLabel('E-mail', { exact: true }).fill('rokia.cisse@exemple.test');
  await sa.locator('.dialog').getByLabel('Pays', { exact: true }).selectOption('ML');
  await sa.getByRole('button', { name: 'Créer et envoyer le lien' }).click();
  await sa.getByText('Utilisateur créé.').waitFor();
  const rokia = await auth.getUserByEmail('rokia.cisse@exemple.test');
  ok(!rokia.passwordHash && !!(await lastCode('rokia.cisse@exemple.test', 'PASSWORD_RESET')), 'utilisateur créé sans mot de passe, lien envoyé');

  // ─── 9. Page d'action des e-mails Firebase : tous les modes, FR et EN ───
  const act = await newPage();
  // 9a. Mot de passe oublié d'un utilisateur de l'app, en anglais.
  await rest('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: 'paul.mbarga@exemple.test' });
  let code = await lastCode('paul.mbarga@exemple.test', 'PASSWORD_RESET');
  await act.goto(`${BASE}/action?mode=resetPassword&oobCode=${code}&lang=en`);
  await act.getByText('Choose a new password').waitFor();
  await act.getByLabel('New password').fill('court');
  await act.getByLabel('Confirm the password').fill('court');
  await act.getByRole('button', { name: 'Save password' }).click();
  await act.getByText('Your password must be at least 8 characters long.').waitFor();
  await act.getByLabel('New password').fill('nouveau-mdp-paul');
  await act.getByLabel('Confirm the password').fill('nouveau-mdp-paul');
  await act.getByRole('button', { name: 'Save password' }).click();
  await act.getByText('Password saved.').waitFor();
  await act.screenshot({ path: `${OUT}/action-reset-en-desktop-light.png` });
  const signIn = await rest('accounts:signInWithPassword', { email: 'paul.mbarga@exemple.test', password: 'nouveau-mdp-paul', returnSecureToken: true });
  ok(!!signIn.idToken, 'resetPassword (EN) : le nouveau mot de passe fonctionne');
  // 9b. Confirmation d'adresse, en français.
  const nu = await rest('accounts:signUp', { email: 'nouvel.utilisateur@exemple.test', password: 'motdepasse123', returnSecureToken: true });
  await rest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: nu.idToken });
  code = await lastCode('nouvel.utilisateur@exemple.test', 'VERIFY_EMAIL');
  await act.goto(`${BASE}/action?mode=verifyEmail&oobCode=${code}&lang=fr`);
  await act.getByText('Adresse e-mail confirmée').waitFor();
  ok((await auth.getUserByEmail('nouvel.utilisateur@exemple.test')).emailVerified, 'verifyEmail (FR) : adresse confirmée');
  // 9c. Changement d'adresse confirmé.
  await rest('accounts:sendOobCode', { requestType: 'VERIFY_AND_CHANGE_EMAIL', idToken: nu.idToken, newEmail: 'adresse.changee@exemple.test' });
  code = (await oobCodes()).filter((c) => c.requestType === 'VERIFY_AND_CHANGE_EMAIL').pop()?.oobCode;
  await act.goto(`${BASE}/action?mode=verifyAndChangeEmail&oobCode=${code}&lang=fr`);
  await act.getByText('Nouvelle adresse confirmée').waitFor();
  ok(!!(await auth.getUserByEmail('adresse.changee@exemple.test').catch(() => null)), 'verifyAndChangeEmail (FR) : nouvelle adresse active');
  // 9d. Rétablissement de l'adresse : un changement d'adresse fait par le compte envoie un
  //     code RECOVER_EMAIL à l'ancienne adresse.
  const rc = await rest('accounts:signUp', { email: 'avant.changement@exemple.test', password: 'motdepasse123', returnSecureToken: true });
  await rest('accounts:update', { idToken: rc.idToken, email: 'apres.changement@exemple.test', returnSecureToken: true });
  code = await lastCode('avant.changement@exemple.test', 'RECOVER_EMAIL');
  ok(!!code, 'recoverEmail : code reçu par l’ancienne adresse');
  await act.goto(`${BASE}/action?mode=recoverEmail&oobCode=${code}&lang=en`);
  await act.getByText('Email address restored').waitFor();
  ok((await text(act)).includes('avant.changement@exemple.test'), 'recoverEmail (EN) : adresse rétablie affichée');
  ok(!!(await auth.getUserByEmail('avant.changement@exemple.test').catch(() => null)), 'recoverEmail : ancienne adresse rétablie sur le compte');
  await act.getByRole('button', { name: 'Get a link to change your password' }).click();
  await act.getByText('A link to choose a new password has been sent to avant.changement@exemple.test.').waitFor();
  ok(!!(await lastCode('avant.changement@exemple.test', 'PASSWORD_RESET')), 'recoverEmail : lien « nouveau mot de passe » envoyé');
  await act.screenshot({ path: `${OUT}/action-recover-en-desktop-light.png` });
  // 9e. Lien non valable, en français ; mode inconnu.
  await act.goto(`${BASE}/action?mode=resetPassword&oobCode=code-inconnu&lang=fr`);
  await act.getByText('Lien non valable').waitFor();
  await act.goto(`${BASE}/action?mode=modeInconnu&oobCode=x`);
  await act.getByText(/Lien non valable|Invalid link/).waitFor();
  ok(true, 'lien non valable / mode inconnu : message clair');
  await act.goto(`${BASE}/action?mode=resetPassword&oobCode=code-inconnu&lang=fr`);
  await act.screenshot({ path: `${OUT}/action-invalid-fr-desktop-light.png` });
  // 9f. E-mail d'invitation via la page d'action (lien de suite) : ouvre l'invitation.
  const cont = encodeURIComponent(link.replace('#t=', '&t='));
  await act.goto(`${BASE}/action?mode=resetPassword&oobCode=peu-importe&lang=fr&continueUrl=${cont}`);
  await act.getByText(/Cette invitation a déjà été utilisée|vous invite à rejoindre/).waitFor();
  ok(true, 'e-mail d’invitation via la page d’action : ouvre l’invitation (jeton du lien de suite)');

  // ─── 10. Thème sombre et formats ───
  for (const [name, w, h] of [['desktop', 1440, 950], ['tablet', 820, 1100], ['phone', 390, 844]]) {
    for (const theme of ['light', 'dark']) {
      const p = await newPage({ viewport: { width: w, height: h }, colorScheme: theme });
      await login(p, staff.admin.email, staff.admin.secret);
      for (const path of ['/tableau-de-bord', '/utilisateurs']) {
        await p.goto(BASE + path);
        await p.waitForTimeout(2000);
        await p.screenshot({ path: `${OUT}/${path.slice(1)}-${name}-${theme}.png` });
      }
      const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      ok(!hscroll, `${name} ${theme} : aucun défilement horizontal de la page`);
      if (name === 'phone') {
        await p.getByRole('button', { name: 'Ouvrir le menu' }).click();
        await p.waitForTimeout(400);
        await p.screenshot({ path: `${OUT}/drawer-phone-${theme}.png` });
        await p.locator('.side').getByRole('link', { name: 'Statistiques' }).click();
        await p.waitForTimeout(600);
        ok(!(await p.locator('.frame').evaluate((f) => f.classList.contains('nav-open'))), `téléphone ${theme} : le tiroir se referme après un choix`);
      }
      if (theme === 'dark') ok((await p.locator('.frame').getAttribute('class')).includes('t-dark'), `${name} : thème sombre appliqué`);
      await p.context().close();
    }
  }
  const lg = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await lg.goto(BASE + '/');
  await lg.screenshot({ path: `${OUT}/login-phone-dark.png` });
  await lg.goto(link);
  await lg.waitForTimeout(1500);
  await lg.screenshot({ path: `${OUT}/invitation-phone-dark.png` });

  ok(errors.length === 0, `aucune erreur dans les pages (${errors.length}${errors.length ? ` : ${errors.slice(0, 3).join(' | ')}` : ''})`);
} catch (e) {
  fails++;
  console.log('ARRÊT', String(e.message).slice(0, 400));
  for (const c of browser.contexts()) for (const [i, pg] of c.pages().entries()) await pg.screenshot({ path: `${OUT}/echec-${browser.contexts().indexOf(c)}-${i}.png` }).catch(() => undefined);
} finally {
  await browser.close();
  process.exit(fails ? 1 : 0);
}
