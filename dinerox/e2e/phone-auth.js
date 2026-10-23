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
 * Audit du 23/10 (partie 2) :
 *  - C5 : interrupteur publié désactivé (par défaut) → bienvenue d'origine ; activé → boutons « numéro ».
 *  - C4 : inscription par numéro avec liens CGU / confidentialité, code d'invitation, événement `sign_up`.
 *  - S7 : déconnexion → le numéro n'est plus retenu sur le téléphone (personne suivante).
 *  - S9 : « S'inscrire » avec un numéro déjà inscrit → « Ce numéro a déjà un compte ».
 *  - C2 : compte sans e-mail : pas de mot de passe ; « Changer mon code secret » (parcours « code oublié »).
 *  - S1 : le compte a déjà un numéro → code secret actuel demandé ; alerte « numéro ajouté ».
 */
const { BASE, launch, setPhoneAuthSwitch } = require('./env.js');
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
const local3 = `01${String((stamp + 13) % 1e8).padStart(8, '0')}`;
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
    // Événements analytiques (export de développement : écrits dans la console « [analytics] nom propriétés »).
    const events = [];
    p.on('console', async (m) => {
      if (!m.text().startsWith('[analytics]')) return;
      const [, name, props] = m.args();
      events.push({ name: await name?.jsonValue().catch(() => null), props: await props?.jsonValue().catch(() => null) });
    });
    // Espaces insécables (160) et fines insécables (8239) ramenés à des espaces ordinaires.
    const text = async () => (await p.evaluate(() => document.body.innerText)).replace(new RegExp(`[${String.fromCharCode(160, 8239)}]`, 'g'), ' ');
    const go = async (path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
    const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
    /** Tape 6 chiffres sur le pavé de l'écran. */
    const keypad = async (code) => { for (const c of code) { await btn(c).last().click(); await p.waitForTimeout(60); } await p.waitForTimeout(2500); };
    const see = (t, timeout = 15000) => p.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
    const shot = (n) => p.screenshot({ path: `${S}/phone-${n}.png` });
    const signOut = async () => { await go('/settings'); await p.getByText('Se déconnecter').last().click(); await see('S’inscrire avec mon numéro'); };
    /** Connexion par numéro depuis l'accueil (le numéro n'est plus retenu après une déconnexion, S7). */
    const toSecret = async (local) => {
      await btn('Se connecter').first().click(); await see('Numéro de téléphone');
      await p.getByLabel('Numéro de téléphone', { exact: true }).fill(local);
      await btn('Continuer').click(); await see('Votre code secret');
    };
    return { ctx, p, text, go, btn, keypad, see, shot, signOut, toSecret, events };
  };
  /** Après la session : onboarding éventuel (« Plus tard »), puis l'application. */
  const landed = async (A) => {
    await A.p.waitForFunction(() => /Dans quel pays vivez-vous|Accueil/.test(document.body.innerText), null, { timeout: 20000 });
    if ((await A.text()).includes('Dans quel pays vivez-vous')) { await A.p.getByText('Plus tard', { exact: true }).click(); await A.p.waitForTimeout(2500); }
    await A.see('Accueil');
  };

  // ── 0. C5 : interrupteur publié, DÉSACTIVÉ par défaut ──
  await setPhoneAuthSwitch(null);
  const Z = await open();
  await Z.go('/');
  const off = await Z.text();
  ok(off.includes('Créer mon compte') && off.includes("J'ai déjà un compte") && !off.includes('S’inscrire avec mon numéro') && !off.includes('S’inscrire avec mon e-mail'), 'interrupteur absent (par défaut) : bienvenue d’origine « Créer mon compte » / « J’ai déjà un compte », aucun bouton « numéro »');
  await Z.shot('00-accueil-sans-numero');
  await Z.btn('Créer mon compte').first().click(); await Z.see('Confirmer le mot de passe');
  ok(Z.p.url().includes('/sign-up'), 'interrupteur désactivé : « Créer mon compte » ouvre l’inscription e-mail');
  await setPhoneAuthSwitch(false);
  await Z.go('/');
  ok(!(await Z.text()).includes('S’inscrire avec mon numéro'), 'interrupteur à « false » : toujours la bienvenue d’origine');
  await Z.ctx.close();
  await setPhoneAuthSwitch(true);

  // ── 1. Inscription par téléphone ──
  await clearGuards();
  const A = await open();
  await A.go('/');
  // Bienvenue d'origine rétablie (fondateur, 23/10, §5ter) : photo plein écran + fondu vert, slogan, accroche, mention.
  const welcome = await A.text();
  ok(welcome.includes('Mieux gérer. Mieux prévoir. Mieux vivre.') && welcome.includes('Votre intelligence financière personnelle') && welcome.includes('ni une banque ni un service de paiement'), 'accueil d’origine : slogan, accroche, mention');
  ok(await A.p.evaluate(() => !!document.querySelector('linearGradient#welcomeFade') && !!document.querySelector('img')), 'accueil d’origine : photo sous le fondu vert');
  const order = await Promise.all(['S’inscrire avec mon numéro', 'Se connecter', 'S’inscrire avec mon e-mail', 'Tester sans données (démonstration)'].map((n) => A.btn(n).first().boundingBox()));
  ok(order.every(Boolean) && order.every((b, i) => i === 0 || b.y > order[i - 1].y), 'panneau : « S’inscrire avec mon numéro », « Se connecter », « S’inscrire avec mon e-mail », puis démonstration');
  ok(!welcome.includes('Continuer avec mon numéro') && !welcome.includes('J’ai un compte e-mail'), 'anciens libellés absents de l’accueil');
  // Écart 1 (fondateur, 23/10) : le lien e-mail est VERT (couleur de la marque), la démonstration garde son style d'origine.
  const colorOf = (loc) => loc.evaluate((el) => getComputedStyle(el.querySelector('div[dir]') || el).color);
  const bgOf = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  const [mailColor, demoColor, brand] = await Promise.all([colorOf(A.btn('S’inscrire avec mon e-mail').first()), colorOf(A.btn('Tester sans données (démonstration)').first()), bgOf(A.btn('S’inscrire avec mon numéro').first())]);
  const mailH = (await A.btn('S’inscrire avec mon e-mail').first().boundingBox()).height;
  ok(mailColor === brand && demoColor !== brand && mailH >= 48, `lien « S’inscrire avec mon e-mail » vert (${mailColor} = ${brand}), démonstration inchangée (${demoColor}), ${Math.round(mailH)} px`);
  await A.shot('01-accueil');
  await A.btn('S’inscrire avec mon numéro').click(); await A.see('Votre numéro de téléphone');
  ok(!!(await A.btn('Se connecter').first().boundingBox()) && !(await A.text()).includes('J’ai déjà un compte'), 'inscription : « J’ai déjà un compte » devient « Se connecter »');
  await A.p.getByLabel('Numéro de téléphone', { exact: true }).fill('0708');
  await A.btn('Recevoir le code').click(); await A.p.waitForTimeout(800);
  ok((await A.text()).includes('Ce numéro ne semble pas complet'), 'numéro incomplet : refusé avant tout envoi');
  ok((await outbox(e164('0708'))).length === 0, 'numéro incomplet : aucun envoi');
  // C4 : mêmes textes que l'inscription e-mail (code d'invitation, transparence, CGU, confidentialité).
  const signupText = await A.text();
  ok(signupText.includes('Vous avez un code d\'invitation ?') && signupText.includes('Facultatif · 6 lettres ou chiffres') && signupText.includes('Votre parrain verra seulement'), 'inscription par numéro : champ « code d’invitation » et sa transparence (C4)');
  ok(!!(await A.btn("Conditions générales d'utilisation").first().boundingBox()) && !!(await A.btn('Politique de confidentialité').first().boundingBox()) && signupText.includes('En continuant, vous acceptez'), 'inscription par numéro : liens CGU et confidentialité (C4)');
  await A.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local1);
  await A.p.getByLabel("Vous avez un code d'invitation ?", { exact: true }).fill('AB');
  await A.btn('Recevoir le code').click(); await A.p.waitForTimeout(800);
  ok((await A.text()).includes("Un code d'invitation compte 6 lettres ou chiffres.") && (await outbox(e164(local1))).length === 0, 'code d’invitation mal formé : refusé avant tout envoi (C4)');
  await A.p.getByLabel("Vous avez un code d'invitation ?", { exact: true }).fill('');
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
  const signUpEvents = A.events.filter((e) => e.name === 'sign_up');
  ok(signUpEvents.length === 1 && JSON.stringify(signUpEvents[0].props) === JSON.stringify({ method: 'phone' }), `événement d’inscription : sign_up { method } comme l’e-mail (C4) — ${JSON.stringify(signUpEvents)}`);

  // ── 2. Connexion après déconnexion : numéro OUBLIÉ par le téléphone (S7) ──
  await A.signOut();
  // Le « dernier numéro » (prérempli pour la personne suivante) est oublié. Les données rangées PAR COMPTE
  // (règle 14, clés avec l'uid) ne sont montrées qu'à ce compte : elles ne sont pas concernées.
  const kept = await A.p.evaluate(() => Object.entries(localStorage));
  const last = kept.find(([k]) => k.endsWith('dinerox:v1:phone:last'));
  ok(!!last && !String(last[1]).includes(local1), `déconnexion : le dernier numéro n’est plus gardé sur le téléphone (S7) — ${last ? last[1] : 'clé absente'} ; autres clés avec le numéro : ${kept.filter(([k, v]) => v.includes(local1) && k !== (last && last[0])).map(([k]) => k).join(', ') || 'aucune'}`);
  await A.btn('Se connecter').click(); await A.see('Numéro de téléphone');
  ok(!(await A.text()).includes('Bon retour') && !(await A.text()).includes(local1.slice(8)), 'déconnexion : la personne suivante ne voit pas le numéro précédent (S7)');
  await A.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local1);
  await A.btn('Continuer').click(); await A.see('Votre code secret');
  ok((await A.text()).includes(`+225 ${local1.slice(0, 2)} ${local1.slice(2, 4)} •• •• ${local1.slice(8)}`), 'numéro tapé, affiché masqué');
  // Retouche (22/10) : numéro masqué sur UNE ligne.
  const masked = await A.p.getByText(`+225 ${local1.slice(0, 2)}`, { exact: false }).filter({ visible: true }).first().boundingBox();
  ok(!!masked && masked.height <= 26, `numéro masqué sur une ligne (${masked ? Math.round(masked.height) : '?'} px)`);
  // Écart 2 (fondateur, 23/10) : les deux liens l'un SOUS l'autre, centrés, chacun sur une ligne, 48 dp.
  const [forgotBox, mailBox] = await Promise.all([A.btn('Code secret oublié ?').first().boundingBox(), A.btn('Se connecter avec mon e-mail').first().boundingBox()]);
  const cx = (b) => b.x + b.width / 2;
  ok(!!forgotBox && !!mailBox && mailBox.y >= forgotBox.y + forgotBox.height - 1 && Math.abs(cx(forgotBox) - cx(mailBox)) < 3 && Math.abs(cx(mailBox) - A.p.viewportSize().width / 2) < 3, 'liens « Code secret oublié ? » puis « Se connecter avec mon e-mail » l’un sous l’autre, centrés');
  ok(!!forgotBox && !!mailBox && [forgotBox, mailBox].every((b) => b.height >= 48 && b.height < 56), `chaque lien sur une ligne, 48 dp (${forgotBox && Math.round(forgotBox.height)} et ${mailBox && Math.round(mailBox.height)} px)`);
  await A.shot('05-connexion');
  await A.keypad('000000');
  ok((await A.text()).includes('Code secret incorrect.'), 'mauvais code secret : refusé');
  await A.shot('10-erreur-secret');
  await A.keypad(SECRET); await landed(A);
  ok(true, 'connexion avec le code secret');

  // ── 3. Blocage après 5 essais ──
  await A.signOut();
  await A.toSecret(local1);
  for (let i = 0; i < 5; i++) await A.keypad('000000');
  ok((await A.text()).includes('Trop d’essais. Réessayez dans 15 minutes'), '5 codes secrets faux : bloqué 15 minutes');
  ok((await A.btn('1').last().getAttribute('aria-disabled')) === 'true', 'pavé désactivé pendant le blocage');
  await A.shot('10b-blocage');
  await clearGuards();

  // ── 4. Nouveau téléphone ──
  const B = await open();
  await B.go('/');
  await B.btn('Se connecter').click(); await B.see('Numéro de téléphone');
  // Numéro pas encore connu sur ce téléphone : titre « Se connecter », lien vers la connexion e-mail (§5ter).
  ok(!(await B.text()).includes('Bon retour') && !!(await B.p.getByRole('heading', { name: 'Se connecter', exact: true }).filter({ visible: true }).first().boundingBox()) && !!(await B.btn('Se connecter avec mon e-mail').first().boundingBox()), 'numéro inconnu sur ce téléphone : titre « Se connecter », lien « Se connecter avec mon e-mail »');
  // Écart 3 (fondateur, 23/10) : écran du numéro en mode connexion — texte et bouton dédiés, sans WhatsApp.
  const signinText = await B.text();
  ok(signinText.includes('Entrez le numéro de votre compte, puis votre code secret.') && !signinText.includes('WhatsApp') && !!(await B.btn('Continuer').first().boundingBox()) && !signinText.includes('Continuer avec mon numéro'), 'connexion, écran du numéro : « Entrez le numéro de votre compte… », bouton « Continuer », aucune mention de WhatsApp');
  await B.shot('05b-connexion-numero');
  await B.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local1);
  await B.btn('Continuer').click(); await B.see('Votre code secret');
  ok(!(await B.text()).includes('Bon retour') && !!(await B.p.getByRole('heading', { name: 'Se connecter', exact: true }).filter({ visible: true }).first().boundingBox()), 'code secret, numéro inconnu sur ce téléphone : titre « Se connecter »');
  await B.keypad(SECRET); await B.see('Nouveau téléphone');
  await B.shot('07-nouveau-telephone');
  await B.btn('Recevoir le code').click(); await B.see('Entrez le code reçu');
  await B.keypad(await lastCode(e164(local1))); await landed(B);
  ok(true, 'nouveau téléphone : code reçu une fois, puis session');

  // ── 5. Pas de réseau, code secret oublié, code expiré ──
  await B.signOut();
  await clearGuards();
  await B.toSecret(local1);
  ok(!(await B.text()).includes('Bon retour'), 'après une déconnexion, numéro retapé : titre « Se connecter » (S7)');
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

  // ── 5b. C2 : Réglages › Sécurité d'un compte SANS e-mail ──
  await B.go('/settings/security');
  const sec = await B.text();
  ok(!sec.includes('Changer le mot de passe') && !sec.includes('Mot de passe actuel'), 'compte sans e-mail : pas de « Changer le mot de passe » (C2)');
  await B.shot('13-securite');
  await B.btn('Changer mon code secret').first().click(); await B.see('Vos opérations, vos comptes et votre abonnement ne changent pas.');
  ok((await B.text()).includes(`•• •• ${local1.slice(8)}`), '« Changer mon code secret » : parcours « code oublié » sur le numéro du compte (D2)');
  await clearGuards();
  await B.btn('Recevoir le code').first().click(); await B.see('Entrez le code reçu');
  await B.keypad(await lastCode(e164(local1))); await B.see('Créez votre code secret');
  await B.keypad(SECRET); await B.see('Confirmez votre code secret'); await B.keypad(SECRET);
  await B.see('Sécurité');
  ok(B.p.url().includes('/settings/security'), 'code secret changé : retour à Réglages › Sécurité, toujours connecté');

  // ── 5c. S9 : « S'inscrire » avec un numéro déjà inscrit ──
  await clearGuards();
  const E = await open();
  await E.go('/');
  await E.btn('S’inscrire avec mon numéro').click(); await E.see('Votre numéro de téléphone');
  await E.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local1);
  await E.btn('Recevoir le code').click(); await E.see('Entrez le code reçu');
  await E.keypad(await lastCode(e164(local1))); await E.see('Ce numéro a déjà un compte');
  ok(!!(await E.btn('Se connecter').first().boundingBox()) && !!(await E.btn('Code secret oublié ?').first().boundingBox()) && !(await E.text()).includes('Créez votre code secret'), 'numéro déjà inscrit : « Ce numéro a déjà un compte », « Se connecter » / « Code secret oublié ? », aucun nouveau code secret (S9)');
  await E.shot('14-deja-inscrit');
  await E.btn('Se connecter').first().click(); await E.see('Votre code secret');
  ok((await E.text()).includes(`•• •• ${local1.slice(8)}`), '« Se connecter » : code secret du numéro tapé');
  await E.btn('Retour').first().click(); await E.see('Ce numéro a déjà un compte');
  await E.btn('Code secret oublié ?').first().click(); await E.see('Vos opérations, vos comptes et votre abonnement ne changent pas.');
  ok(true, '« Code secret oublié ? » ouvre le parcours « code oublié »');
  await E.ctx.close();

  // ── 6. Compte e-mail → « Ajouter mon numéro » ──
  await clearGuards();
  const C = await open();
  const email = `phone${stamp}@ex.com`;
  await C.go('/');
  await C.btn('S’inscrire avec mon e-mail').click(); await C.see('Confirmer le mot de passe');
  ok(C.p.url().includes('/sign-up'), 'accueil : « S’inscrire avec mon e-mail » ouvre l’inscription e-mail');
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
  const linkedAlert = (await docs('phoneOutbox')).filter((m) => m.uid === uidMail && m.reason === 'linked');
  ok(linkedAlert.some((m) => m.kind === 'alert-email' && m.to === email && /numéro/.test(m.body)), 'alerte « numéro ajouté » envoyée à l’e-mail du compte (S1)');
  // S1 : le compte a maintenant un numéro → en changer exige le code secret ACTUEL (vérifié par le serveur).
  await clearGuards();
  await C.go('/settings');
  await C.p.getByText('Ajouter mon numéro', { exact: true }).first().click(); await C.see('Votre code secret');
  await C.shot('08b-code-actuel');
  await C.keypad('905238'); await C.see('Votre compte reste le même');
  await C.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local3);
  await C.btn('Recevoir le code').click(); await C.p.waitForTimeout(2500);
  ok((await C.text()).includes('Code secret incorrect.') && (await outbox(e164(local3))).length === 0, 'code secret actuel faux : refusé, aucun code envoyé au nouveau numéro (S1)');
  await C.signOut();
  await C.go('/sign-in'); await fill('Adresse e-mail', email); await fill('Mot de passe', 'motdepasse123', true);
  await C.p.getByRole('button', { name: 'Se connecter' }).click(); await C.see('Bonjour Awa');
  ok(true, 'connexion par e-mail toujours possible, données intactes');

  // Code secret oublié sur ce numéro, depuis un autre téléphone : alerte à l'e-mail, sans le code.
  await clearGuards();
  const D = await open();
  await D.go('/phone?start=signin');
  await D.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local2);
  await D.btn('Continuer').click(); await D.see('Votre code secret');
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
  await setPhoneAuthSwitch(null);
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message.slice(0, 400));
  await setPhoneAuthSwitch(null).catch(() => undefined);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
