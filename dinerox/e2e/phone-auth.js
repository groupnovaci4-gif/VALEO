/*
 * Connexion par téléphone (docs/connexion-telephone, DECISIONS §5bis) — export web + émulateurs
 * auth, firestore, functions. Fournisseur SIMULÉ : aucun vrai envoi, chaque code « envoyé » est
 * écrit dans `phoneOutbox` (collection fermée), lue ici avec les droits d'administrateur de
 * l'émulateur.
 *  1. Inscription : accueil → numéro (numéro incomplet refusé) → code WhatsApp (mauvais code :
 *     essais restants) → code secret (trop simple refusé, confirmation différente refusée) → compte ;
 *     ni le code secret ni le code reçu ne sont gardés sur le téléphone ni en clair sur le serveur.
 *  2. Déconnexion → « Bon retour ! » (numéro masqué) → mauvais code secret → bon code → session.
 *  3. Cinq codes secrets faux → blocage de 15 minutes, pavé désactivé.
 *  4. Nouveau téléphone (autre navigateur) → code reçu demandé une fois → session.
 *  5. Pas de réseau → message, rien d'envoyé ; code secret oublié → code expiré → nouveau code →
 *     nouveau code secret → session.
 *  6. Compte e-mail → « Ajouter mon numéro » → même compte (même uid), connexion e-mail intacte ;
 *     puis code secret oublié sur ce numéro → alerte à l'e-mail du compte, SANS le code (§5bis.5b).
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const PROJECT = 'demo-dinerox';
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { 'content-type': 'application/json', authorization: 'Bearer owner' };
const stamp = Date.now();
const local1 = `07${String(stamp % 1e8).padStart(8, '0')}`;
const local2 = `05${String((stamp + 7) % 1e8).padStart(8, '0')}`;
const e164 = (l) => `+225${l}`;
const SECRET = '483915';
const SECRET2 = '615204';
let b;

const val = (v) => (v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'booleanValue' in v ? v.booleanValue : 'doubleValue' in v ? v.doubleValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? dec(v.mapValue.fields || {}) : null);
const dec = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v)]));
/** Documents d'une collection fermée (lecture administrateur de l'émulateur). */
async function docs(coll) {
  const out = [];
  let token = '';
  do {
    const r = await (await fetch(`${FS}/${coll}?pageSize=300${token ? `&pageToken=${token}` : ''}`, { headers: OWNER })).json();
    for (const d of r.documents || []) out.push({ name: d.name, ...dec(d.fields || {}) });
    token = r.nextPageToken || '';
  } while (token);
  return out;
}
const outbox = async (to) => (await docs('phoneOutbox')).filter((m) => m.to === to).sort((a, c) => a.at - c.at);
const lastCode = async (to) => String((await outbox(to)).filter((m) => m.kind === 'code').pop()?.code ?? '');
/** Remet à zéro les limites d'envoi (« 1 par minute ») pour enchaîner les parcours. */
const clearGuards = async () => { for (const d of await docs('phoneGuard')) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: OWNER }); };
const lookup = async (body) => (await (await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify(body) })).json()).users?.[0];

(async () => {
  b = await launch();
  const errs = [];
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('dialog', (d) => d.accept());
    // Espaces insécables (160) et fines insécables (8239) ramenés à des espaces ordinaires.
    const text = async () => (await p.evaluate(() => document.body.innerText)).replace(new RegExp(`[${String.fromCharCode(160, 8239)}]`, 'g'), ' ');
    const go = async (path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
    const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
    /** Tape 6 chiffres sur le pavé de l'écran. */
    const keypad = async (code) => { for (const c of code) { await btn(c).last().click(); await p.waitForTimeout(60); } await p.waitForTimeout(2500); };
    const see = (t, timeout = 15000) => p.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
    const shot = (n) => p.screenshot({ path: `${S}/phone-${n}.png` });
    const signOut = async () => { await go('/settings'); await p.getByText('Se déconnecter').last().click(); await see('Continuer avec mon numéro'); };
    return { ctx, p, text, go, btn, keypad, see, shot, signOut };
  };
  /** Après la session : onboarding éventuel (« Plus tard »), puis l'application. */
  const landed = async (A) => {
    await A.p.waitForFunction(() => /Dans quel pays vivez-vous|Accueil/.test(document.body.innerText), null, { timeout: 20000 });
    if ((await A.text()).includes('Dans quel pays vivez-vous')) { await A.p.getByText('Plus tard', { exact: true }).click(); await A.p.waitForTimeout(2500); }
    await A.see('Accueil');
  };

  // ── 1. Inscription par téléphone ──
  await clearGuards();
  const A = await open();
  await A.go('/');
  ok((await A.text()).includes('Mieux gérer, mieux prévoir, mieux vivre'), 'accueil : slogan validé');
  await A.shot('01-accueil');
  // Retouche (22/10) : « J’ai un compte e-mail » = bouton blanc (surface) avec contour.
  const mailStyle = await A.btn('J’ai un compte e-mail').first().evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, bw: s.borderTopWidth }; });
  ok(mailStyle.bg === 'rgb(255, 252, 247)' && parseFloat(mailStyle.bw) >= 1, `bouton e-mail blanc avec contour (${mailStyle.bg}, bordure ${mailStyle.bw})`);
  await A.btn('Continuer avec mon numéro').click(); await A.see('Votre numéro de téléphone');
  await A.p.getByLabel('Numéro de téléphone', { exact: true }).fill('0708');
  await A.btn('Recevoir le code').click(); await A.p.waitForTimeout(800);
  ok((await A.text()).includes('Ce numéro ne semble pas complet'), 'numéro incomplet : refusé avant tout envoi');
  ok((await outbox(e164('0708'))).length === 0, 'numéro incomplet : aucun envoi');
  await A.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local1);
  await A.shot('02-numero');
  await A.btn('Recevoir le code').click(); await A.see('Entrez le code reçu');
  ok((await A.text()).includes('Code envoyé sur WhatsApp'), 'code envoyé sur WhatsApp (fournisseur simulé)');
  const sent = await outbox(e164(local1));
  ok(sent.length === 1 && sent[0].kind === 'code' && sent[0].channel === 'whatsapp' && /^\d{6}$/.test(sent[0].code), 'un seul message simulé, canal WhatsApp, code à 6 chiffres');
  const code1 = await lastCode(e164(local1));
  await A.shot('03-code');
  await A.keypad(code1 === '000000' ? '111111' : '000000');
  ok((await A.text()).includes('Code incorrect. Il vous reste 4 essais.'), 'mauvais code : « Il vous reste 4 essais »');
  await A.shot('09-erreur-code');
  await A.keypad(code1); await A.see('Créez votre code secret');
  await A.shot('04-secret');
  await A.keypad('123456');
  ok((await A.text()).includes('Ce code est trop facile à deviner'), 'code secret trop simple : refusé');
  await A.keypad(SECRET); await A.see('Confirmez votre code secret');
  await A.shot('04b-confirmation');
  await A.keypad('615203');
  ok((await A.text()).includes('Les deux codes ne sont pas identiques') && (await A.text()).includes('Créez votre code secret'), 'confirmation différente : retour au choix du code');
  await A.keypad(SECRET); await A.see('Confirmez votre code secret'); await A.keypad(SECRET);
  await landed(A);
  const user1 = await lookup({ phoneNumber: [e164(local1)] });
  ok(!!user1 && user1.phoneNumber === e164(local1), `compte créé avec le numéro (${user1 ? user1.localId : 'absent'})`);
  const stored = await A.p.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  ok(!stored.includes(SECRET) && !stored.includes(code1), 'téléphone : ni le code secret ni le code reçu gardés (§5bis.3)');
  const server = JSON.stringify([await docs('phoneSecrets'), await docs('phoneIndex'), await docs('phoneAuth')]);
  ok(!server.includes(`"${SECRET}"`) && !server.includes(`"${code1}"`), 'serveur : empreintes seulement, jamais en clair');

  // ── 2. Connexion « Bon retour ! » ──
  await A.signOut();
  await A.btn('Continuer avec mon numéro').click(); await A.see('Bon retour !');
  ok((await A.text()).includes(`+225 ${local1.slice(0, 2)} ${local1.slice(2, 4)} •• •• ${local1.slice(8)}`), 'numéro retenu, affiché masqué');
  // Retouches (22/10) : numéro masqué sur UNE ligne ; « Code secret oublié ? » et « J’ai un compte e-mail » côte à côte.
  const masked = await A.p.getByText(`+225 ${local1.slice(0, 2)}`, { exact: false }).filter({ visible: true }).first().boundingBox();
  ok(!!masked && masked.height <= 26, `numéro masqué sur une ligne (${masked ? Math.round(masked.height) : '?'} px)`);
  const [forgotBox, mailBox] = await Promise.all([A.btn('Code secret oublié ?').first().boundingBox(), A.btn('J’ai un compte e-mail').first().boundingBox()]);
  ok(!!forgotBox && !!mailBox && Math.abs(forgotBox.y - mailBox.y) < 4 && forgotBox.x < mailBox.x, 'liens « Code secret oublié ? » et « J’ai un compte e-mail » côte à côte');
  await A.shot('05-connexion');
  await A.keypad('000000');
  ok((await A.text()).includes('Code secret incorrect.'), 'mauvais code secret : refusé');
  await A.shot('10-erreur-secret');
  await A.keypad(SECRET); await landed(A);
  ok(true, 'connexion avec le code secret');

  // ── 3. Blocage après 5 essais ──
  await A.signOut();
  await A.btn('Continuer avec mon numéro').click(); await A.see('Bon retour !');
  for (let i = 0; i < 5; i++) await A.keypad('000000');
  ok((await A.text()).includes('Trop d’essais. Réessayez dans 15 minutes'), '5 codes secrets faux : bloqué 15 minutes');
  ok((await A.btn('1').last().getAttribute('aria-disabled')) === 'true', 'pavé désactivé pendant le blocage');
  await A.shot('10b-blocage');
  await clearGuards();

  // ── 4. Nouveau téléphone ──
  const B = await open();
  await B.go('/phone?start=signin');
  await B.see('Votre numéro de téléphone');
  await B.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local1);
  await B.btn('Continuer avec mon numéro').click(); await B.see('Bon retour !');
  await B.keypad(SECRET); await B.see('Nouveau téléphone');
  await B.shot('07-nouveau-telephone');
  await B.btn('Recevoir le code').click(); await B.see('Entrez le code reçu');
  await B.keypad(await lastCode(e164(local1))); await landed(B);
  ok(true, 'nouveau téléphone : code reçu une fois, puis session');

  // ── 5. Pas de réseau, code secret oublié, code expiré ──
  await B.signOut();
  await clearGuards();
  await B.btn('Continuer avec mon numéro').click(); await B.see('Bon retour !');
  await B.btn('Code secret oublié ?').click(); await B.see('Vos opérations, vos comptes et votre abonnement ne changent pas.');
  await B.shot('06-oublie');
  const before = (await outbox(e164(local1))).length;
  await B.ctx.setOffline(true);
  await B.btn('Recevoir le code').first().click(); await B.p.waitForTimeout(2500);
  ok((await B.text()).includes('Pas de connexion Internet'), 'hors ligne : message « Pas de connexion Internet »');
  await B.shot('12-reseau');
  await B.ctx.setOffline(false);
  ok((await outbox(e164(local1))).length === before, 'hors ligne : aucun code envoyé');
  await B.btn('Recevoir le code').first().click(); await B.see('Entrez le code reçu');
  const pending = (await docs('phoneAuth')).filter((d) => d.purpose === 'reset').sort((a, c) => a.createdAt - c.createdAt).pop();
  await fetch(`http://127.0.0.1:8080/v1/${pending.name}?updateMask.fieldPaths=expiresAt`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { expiresAt: { integerValue: String(Date.now() - 1000) } } }) });
  await B.keypad(await lastCode(e164(local1)));
  ok((await B.text()).includes('Ce code a expiré'), 'code expiré : message, nouveau code à demander');
  await B.shot('11-expire');
  await B.btn('Retour').first().click(); await B.p.waitForTimeout(800);
  await clearGuards();
  await B.btn('Recevoir le code').first().click(); await B.see('Entrez le code reçu');
  await B.keypad(await lastCode(e164(local1))); await B.see('Créez votre code secret');
  await B.keypad(SECRET2); await B.see('Confirmez votre code secret'); await B.keypad(SECRET2);
  await landed(B);
  const again = await lookup({ phoneNumber: [e164(local1)] });
  ok(again && again.localId === user1.localId, 'code secret changé : même compte');

  // ── 6. Compte e-mail → « Ajouter mon numéro » ──
  await clearGuards();
  const C = await open();
  const email = `phone${stamp}@ex.com`;
  await C.go('/sign-up');
  const fill = (label, v, exact = false) => C.p.getByLabel(label, { exact }).first().fill(v);
  await fill('Nom', 'Koné', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', email);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await C.p.getByRole('switch').first().click(); await C.btn('Créer mon compte').click();
  await C.see('Dans quel pays vivez-vous actuellement ?'); await C.p.getByText('Plus tard', { exact: true }).click();
  await C.see('Bonjour Awa');
  const uidMail = (await lookup({ email: [email] })).localId;
  await C.go('/settings');
  await C.p.getByText('Ajouter mon numéro', { exact: true }).first().click(); await C.see('Votre compte reste le même');
  await C.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local2);
  await C.shot('08-ajouter-numero');
  await C.btn('Recevoir le code').click(); await C.see('Entrez le code reçu');
  await C.keypad(await lastCode(e164(local2))); await C.see('Créez votre code secret');
  await C.keypad(SECRET); await C.see('Confirmez votre code secret'); await C.keypad(SECRET);
  await C.p.waitForTimeout(1500);
  const linked = await lookup({ email: [email] });
  ok(linked.localId === uidMail && linked.phoneNumber === e164(local2), 'numéro ajouté au MÊME compte (même uid)');
  await C.signOut();
  await C.go('/sign-in'); await fill('Adresse e-mail', email); await fill('Mot de passe', 'motdepasse123', true);
  await C.p.getByRole('button', { name: 'Se connecter' }).click(); await C.see('Bonjour Awa');
  ok(true, 'connexion par e-mail toujours possible, données intactes');

  // Code secret oublié sur ce numéro, depuis un autre téléphone : alerte à l'e-mail, sans le code.
  await clearGuards();
  const D = await open();
  await D.go('/phone?start=signin');
  await D.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local2);
  await D.btn('Continuer avec mon numéro').click(); await D.see('Bon retour !');
  await D.btn('Code secret oublié ?').click(); await D.see('Code secret oublié ?');
  await D.btn('Recevoir le code').first().click(); await D.see('Entrez le code reçu');
  const resetCode = await lastCode(e164(local2));
  await D.keypad(resetCode); await D.see('Créez votre code secret');
  await D.keypad(SECRET2); await D.see('Confirmez votre code secret'); await D.keypad(SECRET2);
  await landed(D);
  const alerts = (await docs('phoneOutbox')).filter((m) => m.uid === uidMail && String(m.kind).startsWith('alert'));
  const mail = alerts.find((m) => m.kind === 'alert-email');
  ok(!!mail && mail.to === email, `alerte envoyée à l'e-mail du compte (${alerts.map((m) => m.kind).join(', ')})`);
  ok(alerts.every((m) => !JSON.stringify(m).includes(SECRET2) && !JSON.stringify(m).includes(resetCode) && !('code' in m)), 'alerte : jamais le code');

  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 3).join(' | '));
  console.log(fails ? `TÉLÉPHONE : ${fails} ÉCHEC(S)` : 'TÉLÉPHONE : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message.slice(0, 400));
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
