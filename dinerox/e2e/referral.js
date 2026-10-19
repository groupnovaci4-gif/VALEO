/*
 * Croissance, étape 1 — parrainage de bout en bout (export web + émulateurs auth,
 * firestore ET functions : les vraies Cloud Functions répondent).
 *  1. Awa (parraine) : « Inviter des amis » depuis « Plus », code 6 caractères, lien, Copier ;
 *  2. Kofi ouvre le lien /i/{code} sans compte → inscription, code prérempli → « Votre semaine » ;
 *     sa première dépense fait avancer sa carte et la ligne de Kofi chez Awa (aucun montant) ;
 *  3. Ama (inscrite il y a 6 jours) saisit le code dans les réglages : erreurs claires, puis acceptée ;
 *     sa semaine régulière (opérations synchronisées) la valide → message « 1/5 » chez Awa ;
 *  4. admin : statistiques agrégées, mode ambassadeur ;
 *  5. carte discrète de l'accueil après la 5e saisie.
 */
const { BASE, launch, declareMoney } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const PROJECT = 'demo-dinerox';
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { 'content-type': 'application/json', authorization: 'Bearer owner' };
const D = 24 * 3600 * 1000;
const stamp = Date.now();
let b;

// ── Accès « console » aux émulateurs (vérifier ce que le serveur a écrit, simuler une synchro) ──
// Horodatage serveur (`syncedAt`), posé par la synchronisation sur chaque écriture.
const serverTs = (ms) => ({ timestampValue: new Date(ms).toISOString() });
const enc = (v) => (v && typeof v === 'object' && 'timestampValue' in v ? v : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : v === null ? { nullValue: null } : { stringValue: String(v) });
const dec = (f) => { if (!f) return undefined; if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, dec(v)])); if ('integerValue' in f) return Number(f.integerValue); if ('doubleValue' in f) return f.doubleValue; if ('booleanValue' in f) return f.booleanValue; if ('nullValue' in f) return null; if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec); return f.stringValue; };
const readDoc = async (path) => { const r = await fetch(`${FS}/${path}`, { headers: OWNER }); if (!r.ok) return undefined; const j = await r.json(); return dec({ mapValue: { fields: j.fields } }); };
const writeDoc = (path, data) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const until = async (get, test, ms = 20000) => { const end = Date.now() + ms; let v = await get(); while (!test(v) && Date.now() < end) { await new Promise((r) => setTimeout(r, 400)); v = await get(); } return v; };
const uidOf = async (email) => { const r = await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ email: [email] }) }); return (await r.json()).users?.[0]?.localId; };

const page = async (opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: opts.width || 360, height: 800 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  return { p, errs, text, btn, go, fill };
};

/** Inscription par le formulaire (champ code facultatif) jusqu'au tableau de bord. */
async function signUp(h, first, email, code) {
  if (!h.p.url().includes('sign-up')) { await h.go('/'); await h.p.getByText('Créer mon compte', { exact: false }).first().click(); await h.p.waitForTimeout(800); }
  await h.fill('Nom', 'Test', true); await h.fill('Prénom', first); await h.fill('Adresse e-mail', email);
  await h.fill('Mot de passe', 'motdepasse123', true); await h.fill('Confirmer le mot de passe', 'motdepasse123');
  if (code !== undefined) await h.fill("Vous avez un code d'invitation ?", code);
  await h.p.getByRole('switch').first().click();
  await h.btn('Créer mon compte').click();
  await h.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await h.p.getByText('Plus tard', { exact: true }).click();
  await h.p.getByText(`Bonjour ${first}`).first().waitFor({ timeout: 15000 });
  await declareMoney(h.p); // v2 : argent présent avant de dépenser
}

/** Dépense saisie par le formulaire complet. */
async function expense(h, amount) {
  await h.go('/transaction/new?type=expense', 2500);
  await h.fill('Montant', String(amount));
  await h.p.getByText('Alimentation & boissons', { exact: true }).first().click(); await h.p.waitForTimeout(300);
  await h.btn('Enregistrer').last().click(); await h.p.waitForTimeout(2000);
}

(async () => {
  b = await launch();

  // ── 1. Awa, la parraine ──
  const awa = await page();
  const awaEmail = `awa${stamp}@ex.com`;
  await signUp(awa, 'Awa', awaEmail);
  const awaUid = await uidOf(awaEmail);
  await awa.go('/more');
  const entry = awa.p.getByText('Inviter des amis', { exact: true }).filter({ visible: true });
  ok((await entry.count()) >= 1, '« Plus » : ligne « Inviter des amis »');
  await entry.first().click(); await awa.p.waitForTimeout(3500);
  let t = await awa.text();
  ok(t.includes("Quand 5 personnes que vous avez invitées utilisent DineroX régulièrement pendant une semaine, vous gagnez 1 mois de Plus offert."), 'règle en une phrase');
  const codeLabel = await awa.p.locator('[aria-label^="Mon code : "]').first().getAttribute('aria-label');
  const code = (codeLabel || '').replace('Mon code : ', '').replace(/ /g, '');
  ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code), `code personnel de 6 caractères lisibles (${code})`);
  ok(t.includes(`https://dinerox.app/i/${code}`), 'lien d’invitation affiché');
  ok(t.includes('0/5 filleuls validés avant votre prochain mois offert'), 'avancement 0/5');
  ok(t.includes("Personne pour l'instant."), 'liste vide au départ');
  for (const name of ['Partager', 'Copier']) {
    const box = await awa.btn(name).first().boundingBox();
    ok(!!box && box.height >= 48, `bouton « ${name} » ≥ 48 dp (${box ? Math.round(box.height) : '?'})`);
  }
  await awa.btn('Copier').first().click(); await awa.p.waitForTimeout(600);
  const copied = await awa.p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(copied === `https://dinerox.app/i/${code}?src=copy`, `« Copier » : lien avec la source (${copied})`);
  ok((await awa.text()).includes('Lien copié'), 'confirmation « Lien copié »');
  ok((await readDoc(`referralCodes/${code}`))?.uid === awaUid, 'code enregistré par le serveur');
  await awa.p.screenshot({ path: `${S}/referral-invite.png`, fullPage: true });

  // ── 2. Kofi ouvre le lien sans compte ──
  const kofi = await page();
  await kofi.go(`/i/${code.toLowerCase()}?src=whatsapp`, 3500);
  ok(kofi.p.url().includes('/sign-up'), `lien /i/{code} sans compte → inscription (${kofi.p.url().replace(BASE, '')})`);
  const pre = await kofi.p.getByLabel("Vous avez un code d'invitation ?").first().inputValue();
  ok(pre === code, `code prérempli depuis le lien (${pre})`);
  ok((await kofi.text()).includes('Votre parrain verra seulement où en est votre semaine DineroX (par exemple « jour 3/7 » ou « validée »). Il ne verra jamais vos montants ni vos opérations.'), 'inscription : texte de transparence sous le code');
  const kofiEmail = `kofi${stamp}@ex.com`;
  await signUp(kofi, 'Kofi', kofiEmail);
  const kofiUid = await uidOf(kofiEmail);
  const kofiProfile = await until(() => readDoc(`users/${kofiUid}`), (d) => !!d?.referredBy);
  ok(kofiProfile?.referredBy?.uid === awaUid && kofiProfile?.referredBy?.source === 'link', 'serveur : Kofi parrainé par Awa (source « lien »)');
  await kofi.go('/', 3500);
  t = await kofi.text();
  ok(t.includes('Votre semaine DineroX') && t.includes('Votre semaine compte pour Awa, qui vous a invité.'), 'accueil de Kofi : carte « Votre semaine DineroX »');
  ok(t.includes('Dépenses 0/5') && t.includes('Objectifs 0/2'), 'carte : compteurs à zéro');
  ok(t.includes('Votre parrain verra seulement où en est votre semaine DineroX'), 'carte « Votre semaine » : rappel de transparence');
  await expense(kofi, 3500);
  await until(() => readDoc(`users/${kofiUid}`), (d) => d?.referralProgress?.expenses === 1);
  await kofi.go('/', 3500);
  t = await kofi.text();
  ok(t.includes('Jour 1/7') && t.includes('Jours actifs 1/5') && t.includes('Dépenses 1/5'), 'après une dépense : jour 1/7, jours actifs 1/5, dépenses 1/5');
  ok(!/\d[\d  ]*\s?FCFA/.test(t.split('Votre semaine DineroX')[1]?.split('Objectifs')[0] || ''), 'carte du filleul : aucun montant');
  await kofi.p.screenshot({ path: `${S}/referral-week.png` });
  await kofi.go('/invite-code', 2500);
  ok((await kofi.text()).includes('Vous avez été invité par Awa.'), 'réglages : code déjà appliqué, non modifiable');

  await awa.go('/invite', 3500);
  t = await awa.text();
  ok(t.includes('Kofi') && t.includes('En cours : jour 1/7'), 'chez Awa : « Kofi — En cours : jour 1/7 »');
  ok(!/FCFA/.test(t.split('Mes parrainages')[1] || ''), 'liste des parrainages : aucun montant');

  // ── 3. Ama, inscrite il y a 6 jours, saisit le code dans les réglages ──
  const amaEmail = `ama${stamp}@ex.com`;
  const created = Date.now() - 6 * D;
  await fetch(`${AUTH}/accounts:batchCreate`, { method: 'POST', headers: OWNER, body: JSON.stringify({ users: [{ localId: `ama${stamp}`, email: amaEmail, displayName: 'Ama', rawPassword: 'motdepasse123', createdAt: String(created) }] }) });
  const ama = await page({ width: 320 });
  await ama.go('/sign-in', 2500);
  await ama.p.getByLabel('Adresse e-mail').fill(amaEmail); await ama.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await ama.btn('Se connecter').click(); await ama.p.waitForTimeout(6000);
  if ((await ama.text()).includes('Dans quel pays')) { await ama.p.getByText('Plus tard', { exact: true }).click(); await ama.p.waitForTimeout(2500); }
  await ama.go('/settings', 3000);
  ok((await ama.p.getByText("Code d'invitation", { exact: true }).filter({ visible: true }).count()) >= 1, 'réglages : « Code d’invitation » proposé (compte de 6 jours)');
  // Lien ouvert avec une session : rien n'est appliqué en silence, l'écran du code s'ouvre prérempli.
  await ama.go(`/i/${code}`, 4000);
  ok(ama.p.url().includes('/invite-code'), `lien avec session → écran « Code d’invitation » (${ama.p.url().replace(BASE, '')})`);
  ok((await ama.p.getByLabel("Vous avez un code d'invitation ?").first().inputValue()) === code, 'code prérempli, à valider par la personne');
  ok((await readDoc(`users/ama${stamp}`))?.referredBy === undefined, 'rien d’appliqué avant sa validation');
  t = await ama.text();
  ok(t.includes('Votre parrain verra seulement où en est votre semaine DineroX'), 'écran du code : texte de transparence');
  ok(t.includes('Vous pouvez saisir un code jusqu'), 'date limite affichée');
  await ama.fill("Vous avez un code d'invitation ?", 'ABC');
  await ama.btn('Valider le code').click(); await ama.p.waitForTimeout(800);
  ok((await ama.text()).includes("Un code d'invitation compte 6 lettres ou chiffres."), 'code trop court : message clair');
  await ama.fill("Vous avez un code d'invitation ?", 'ZZZZ22');
  await ama.btn('Valider le code').click(); await ama.p.waitForTimeout(2500);
  ok((await ama.text()).includes("Ce code n'existe pas."), 'code inconnu : message clair');
  await ama.fill("Vous avez un code d'invitation ?", code);
  await ama.btn('Valider le code').click(); await ama.p.waitForTimeout(2500);
  const amaUid = `ama${stamp}`;
  ok((await readDoc(`users/${amaUid}`))?.referredBy?.uid === awaUid, 'code accepté par le serveur');
  await ama.p.screenshot({ path: `${S}/referral-code-320.png` });

  // Awa a l'application ouverte (accueil) pendant qu'Ama termine sa semaine.
  await awa.go('/', 3000);
  // Semaine régulière d'Ama, telle que la synchronisation l'écrit (jours 0 à 4 après l'inscription).
  for (let d = 0; d < 5; d++) {
    const at = created + d * D + 3600_000;
    await writeDoc(`spaces/${amaUid}/transactions/e${d}`, { id: `e${d}`, type: 'expense', amount: 1000 + d, currency: 'XOF', date: '2026-10-01', accountId: 'cash', categoryId: 'cat_food', createdBy: amaUid, createdAt: at, updatedAt: at, syncedAt: serverTs(at) });
  }
  await writeDoc(`spaces/${amaUid}/transactions/i1`, { id: 'i1', type: 'income', amount: 90000, currency: 'XOF', date: '2026-10-02', accountId: 'cash', categoryId: 'inc_salary', createdBy: amaUid, createdAt: created + D + 7200_000, updatedAt: created + D + 7200_000, syncedAt: serverTs(created + D + 7200_000) });
  for (const g of ['g1', 'g2']) await writeDoc(`spaces/${amaUid}/goals/${g}`, { id: g, name: 'Objectif', createdBy: amaUid, createdAt: created + 1800_000, updatedAt: created + 1800_000, syncedAt: serverTs(created + 1800_000), targetAmount: 100000, initialAmount: 0, status: 'active', priority: 'normal' });
  const amaDone = await until(() => readDoc(`users/${amaUid}`), (d) => d?.referralProgress?.status === 'validated');
  ok(amaDone?.referralProgress?.status === 'validated', 'serveur : semaine régulière d’Ama validée');
  ok(amaDone?.grants === undefined, 'Ama (filleule) ne reçoit aucun mois');
  // Awa reçoit le message dans l'application (avis écrit par le serveur, montré une seule fois).
  const NOTICE = 'Une personne invitée a utilisé DineroX toute une semaine : 1/5 avant votre prochain mois offert.';
  ok((await until(() => awa.text(), (x) => x.includes(NOTICE), 15000)).includes(NOTICE), 'Awa : message « 1/5 » dans l’application');
  await awa.go('/', 4000);
  ok(!(await awa.text()).includes(NOTICE), 'message déjà vu : pas répété à l’ouverture suivante');
  await awa.go('/invite', 3500);
  t = await awa.text();
  ok(t.includes('1/5 filleuls validés avant votre prochain mois offert'), 'Awa : avancement 1/5');
  ok(/Ama\s*Validé/.test(t), 'Awa : Ama « Validé »');
  ok((await readDoc(`users/${awaUid}`))?.grants === undefined, '1 filleul validé : pas encore de mois offert');

  // ── 4. Administration ──
  const bossEmail = `boss${stamp}@ex.com`;
  await fetch(`${AUTH}/accounts:batchCreate`, { method: 'POST', headers: OWNER, body: JSON.stringify({ users: [{ localId: `boss${stamp}`, email: bossEmail, rawPassword: 'motdepasse123', createdAt: String(Date.now()), customAttributes: JSON.stringify({ admin: true }) }] }) });
  const boss = await page();
  await boss.go('/sign-in', 2500);
  await boss.p.getByLabel('Adresse e-mail').fill(bossEmail); await boss.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await boss.btn('Se connecter').click(); await boss.p.waitForTimeout(6000);
  if ((await boss.text()).includes('Dans quel pays')) { await boss.p.getByText('Plus tard', { exact: true }).click(); await boss.p.waitForTimeout(2500); }
  await boss.go('/admin', 5000);
  t = await boss.text();
  ok(t.includes('Codes créés') && t.includes('Inscriptions par parrainage') && t.includes('Taux de validation'), 'admin : statistiques agrégées du parrainage');
  ok(t.includes(`Awa · ${code}`), 'admin : Awa dans les meilleurs parrains');
  ok(!t.includes(kofiEmail) && !t.includes(amaEmail), 'admin : aucune adresse ni liste d’utilisateurs');
  await checkAllInputs(boss.p, 'Admin — mode ambassadeur', ok, { expectInputs: true });
  await boss.fill('Code du parrain', code); await boss.fill('Plafond de mois offerts par mois', '8');
  await boss.btn('Activer').click(); await boss.p.waitForTimeout(3000);
  ok((await readDoc(`users/${awaUid}/referral/state`))?.ambassador?.maxRewardsPerMonth === 8, 'mode ambassadeur activé (plafond 8)');
  // « mois/mois » porte un gluon invisible (U+2060) après « / » : jamais coupé en fin de ligne.
  const amb = (await boss.text()).replace(/\u2060/g, '').replace(/[\u00A0\u202F]/g, ' ');
  ok(amb.includes('Ambassadeur (plafond 8 mois/mois)'), `admin : ambassadeur affiché (« ${(amb.match(/Ambassadeur[^\n]*/) ?? [''])[0]} »)`);

  // ── 5. Carte de l'accueil après la 5e saisie (Awa) ──
  await awa.go('/', 3000);
  ok(!(await awa.text()).includes('personnes invitées actives pendant une semaine'), 'accueil : pas de carte avant 5 saisies');
  for (let i = 0; i < 5; i++) await expense(awa, 1000 + i);
  await awa.go('/', 4000);
  ok((await awa.text()).includes('5 personnes invitées actives pendant une semaine = 1 mois de Plus offert.'), 'accueil : carte discrète après la 5e saisie');
  await awa.btn('Masquer').first().click(); await awa.p.waitForTimeout(500);
  await awa.go('/', 3500);
  ok(!(await awa.text()).includes('personnes invitées actives pendant une semaine'), 'carte masquée : ne revient pas');

  const errs = [...awa.errs, ...kofi.errs, ...ama.errs, ...boss.errs];
  ok(errs.length === 0, 'aucune erreur JS ' + errs.join(' | '));
  console.log(fails ? `PARRAINAGE : ${fails} ÉCHEC(S)` : 'PARRAINAGE : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
