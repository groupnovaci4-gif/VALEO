/*
 * Compte suspendu par le back-office (D5, D16) : un téléphone CONNECTÉ est
 * déconnecté avec le message validé dès le retour du réseau ; une connexion
 * ensuite affiche le message « compte suspendu » ; après réactivation, la
 * personne se reconnecte et retrouve ses données. La suspension est simulée
 * comme le fait boSetSuspended : compte Auth désactivé (API de l'émulateur).
 * Audit 23/10, S8 : même chose pour un compte créé par NUMÉRO (refus côté serveur, même message).
 */
const { BASE, launch, declareMoney, setPhoneAuthSwitch } = require('./env.js');
const S = process.argv[2] || '.';
const AUTH = process.env.E2E_AUTH_EMULATOR || 'http://127.0.0.1:9099';
const PROJECT = process.env.E2E_PROJECT || 'demo-dinerox';
const SUPPORT = 'support@dinerox.app'; // brand.supportEmail
const stamp = Date.now();
const U = { email: `susp${stamp}@ex.com`, first: 'Fatou', last: 'Ndiaye', payee: `Marche${stamp}` };
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };

/** Active / désactive un compte comme le back-office (Admin), via l'émulateur Auth. */
async function setDisabled(email, disabled) {
  const h = { 'content-type': 'application/json', authorization: 'Bearer owner' };
  const q = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: h, body: JSON.stringify({ returnUserInfo: true }) }).then((r) => r.json());
  const user = (q.userInfo || []).find((u) => u.email === email);
  if (!user) throw new Error('compte introuvable');
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: h, body: JSON.stringify({ localId: user.localId, disableUser: disabled }) });
  if (!r.ok) throw new Error(`accounts:update ${r.status}`);
}
async function setDisabledUid(localId, disabled) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify({ localId, disableUser: disabled }) });
  if (!r.ok) throw new Error(`accounts:update ${r.status}`);
}

// ─── Compte par numéro, créé par les vraies fonctions (fournisseur simulé, jeton App Check de test) ───
const FN = `http://127.0.0.1:5001/${PROJECT}/europe-west1`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const APP_CHECK = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ app_id: '1:1:web:1', sub: '1:1:web:1', exp: Math.floor(Date.now() / 1000) + 7200, iat: Math.floor(Date.now() / 1000) })}.x`;
async function fn(name, data) {
  const r = await (await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Firebase-AppCheck': APP_CHECK }, body: JSON.stringify({ data }) })).json();
  if (r.error) throw new Error(`${name} : ${r.error.message}`);
  return r.result;
}
async function phoneAccount(local, secret) {
  const device = `suspendu-${stamp}`;
  const start = await fn('phoneStart', { phone: local, dial: '225', purpose: 'signup', channel: 'whatsapp', deviceId: device, lang: 'fr' });
  const out = await (await fetch(`${FS}/phoneOutbox?pageSize=300`, { headers: { authorization: 'Bearer owner' } })).json();
  const code = (out.documents || []).map((d) => d.fields).filter((f) => f.to?.stringValue === `+225${local}` && f.kind?.stringValue === 'code').pop()?.code?.stringValue;
  const v = await fn('phoneVerify', { requestId: start.requestId, code });
  const s = await fn('phoneSetSecret', { ticket: v.ticket, secret, deviceId: device });
  const payload = JSON.parse(Buffer.from(s.token.split('.')[1], 'base64url').toString('utf8'));
  return payload.uid;
}

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errs = [];
  const dialogs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  const text = async () => (await p.locator('body').innerText()).replace(/[  ]/g, ' ');
  const go = async (path, w = 3200) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  try {
    // 1. Inscription + une dépense (donnée à retrouver après réactivation).
    await go('/');
    await p.goto(new URL('/sign-up', p.url()).href, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    await p.getByLabel('Nom', { exact: true }).fill(U.last); await p.getByLabel('Prénom').fill(U.first); await p.getByLabel('Adresse e-mail').fill(U.email);
    await p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
    await p.getByRole('switch').first().click();
    await p.getByRole('button', { name: 'Créer mon compte' }).click();
    await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
    await p.getByText('Plus tard', { exact: true }).click();
    await p.getByText(`Bonjour ${U.first}`).first().waitFor({ timeout: 10000 });
    await declareMoney(p); // v2 : argent présent avant de dépenser
    await go('/transaction/new?type=expense');
    await p.getByLabel('Montant').first().fill('4321'); await p.getByText('Alimentation & boissons', { exact: true }).first().click();
    await p.getByLabel('Bénéficiaire / commerçant').fill(U.payee);
    await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await p.waitForTimeout(2500);
    await go('/transactions');
    ok((await text()).includes(U.payee), 'dépense enregistrée avant la suspension');

    // 2. Suspension pendant que l'app est ouverte : rien ne change tant que l'app ne vérifie pas.
    await setDisabled(U.email, true);
    // 3. Coupure puis retour du réseau → l'app renouvelle le jeton → message + déconnexion.
    await ctx.setOffline(true); await p.waitForTimeout(1500);
    await ctx.setOffline(false);
    // Bienvenue d'origine : l'interrupteur « numéro » est désactivé par défaut (audit 23/10, C5).
    await p.getByText('Créer mon compte').first().waitFor({ timeout: 15000 });
    const msg = dialogs.find((d) => d.startsWith('Compte suspendu')) || '';
    ok(msg.includes('Compte suspendu'), 'message affiché : titre « Compte suspendu »');
    ok(msg.includes('Votre compte DineroX est suspendu : vous ne pouvez plus vous connecter pour le moment. Vos données sont conservées.'), 'message affiché : texte validé (D16)');
    ok(msg.includes(SUPPORT), `message affiché : adresse ${SUPPORT}`);
    ok(dialogs.filter((d) => d.startsWith('Compte suspendu')).length === 1, 'message affiché une seule fois');
    ok((await text()).includes('Créer mon compte'), 'déconnecté : écran d’accueil');

    // 4. Nouvelle connexion pendant la suspension : refus avec le message validé.
    await p.getByText("J'ai déjà un compte").first().click(); await p.waitForTimeout(600);
    await p.getByLabel('Adresse e-mail').fill(U.email); await p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
    await p.getByRole('button', { name: 'Se connecter' }).click(); await p.waitForTimeout(2500);
    ok((await text()).includes(`Ce compte est suspendu. Écrivez-nous à ${SUPPORT} pour en savoir plus.`), 'connexion refusée : « Ce compte est suspendu… »');

    // 5. Réactivation : reconnexion, données intactes.
    await setDisabled(U.email, false);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await p.getByText(`Bonjour ${U.first}`).first().waitFor({ timeout: 12000 });
    await go('/transactions');
    ok((await text()).includes(U.payee), 'réactivé : la dépense est toujours là');
    // 6. Un compte actif n'est jamais déconnecté par la vérification.
    await ctx.setOffline(true); await p.waitForTimeout(1000); await ctx.setOffline(false); await p.waitForTimeout(4000);
    ok(!(await text()).includes('Créer mon compte') && dialogs.filter((d) => d.startsWith('Compte suspendu')).length === 1, 'compte actif : aucune déconnexion au retour du réseau');

    // 7. Compte créé par NUMÉRO, suspendu (audit 23/10, S8) : refus côté serveur, même message.
    await setPhoneAuthSwitch(true);
    const local = `07${String(stamp % 1e8).padStart(8, '0')}`;
    const phoneUid = await phoneAccount(local, '483915');
    await setDisabledUid(phoneUid, true);
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
    const q = await ctx2.newPage();
    q.on('pageerror', (e) => errs.push(e.message));
    await q.goto(BASE + '/', { waitUntil: 'load' }); await q.waitForTimeout(3500);
    await q.getByRole('button', { name: 'Se connecter', exact: true }).filter({ visible: true }).first().click(); await q.waitForTimeout(800);
    await q.getByLabel('Numéro de téléphone', { exact: true }).fill(local);
    await q.getByRole('button', { name: 'Continuer', exact: true }).filter({ visible: true }).first().click(); await q.waitForTimeout(800);
    for (const c of '483915') { await q.getByRole('button', { name: c, exact: true }).filter({ visible: true }).last().click(); await q.waitForTimeout(60); }
    await q.waitForTimeout(3000);
    const phoneText = (await q.locator('body').innerText()).replace(/[  ]/g, ' ');
    ok(phoneText.includes(`Ce compte est suspendu. Écrivez-nous à ${SUPPORT} pour en savoir plus.`), 'numéro + bon code secret, compte suspendu : « Ce compte est suspendu… »');
    ok(!phoneText.includes('Accueil'), 'compte suspendu : aucune session ouverte');
    await q.screenshot({ path: `${S}/suspended-phone.png` }).catch(() => undefined);
    await setDisabledUid(phoneUid, false);
    ok(errs.length === 0, `aucune erreur de page (${errs.length})`);
  } catch (e) {
    fails++;
    console.log('ARRÊT', String(e.message).slice(0, 300));
    await p.screenshot({ path: `${S}/suspended-fail.png` }).catch(() => undefined);
  } finally {
    await setPhoneAuthSwitch(null).catch(() => undefined);
    await b.close();
    process.exit(fails ? 1 : 0);
  }
})();
