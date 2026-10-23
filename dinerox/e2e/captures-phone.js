/*
 * Connexion par téléphone — preuves « maquette | application » (8 écrans + 4 erreurs, clair puis
 * sombre). Export web + émulateurs, fournisseur SIMULÉ (codes lus dans `phoneOutbox`).
 * Sortie : docs/connexion-telephone/preuves/<maquette>.png (maquette à gauche, application à droite).
 * Usage : node e2e/captures-phone.js
 */
const fs = require('fs');
const path = require('path');
const { BASE, launch, setPhoneAuthSwitch } = require('./env.js');
const PROJECT = 'demo-dinerox';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { 'content-type': 'application/json', authorization: 'Bearer owner' };
const MAQ = path.join(__dirname, '..', 'docs', 'connexion-telephone', 'maquettes', 'png');
const OUT = path.join(__dirname, '..', 'docs', 'connexion-telephone', 'preuves');
const SECRET = '483915';
let b;

const val = (v) => (v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'booleanValue' in v ? v.booleanValue : null);
async function docs(coll) {
  const r = await (await fetch(`${FS}/${coll}?pageSize=300`, { headers: OWNER })).json();
  return (r.documents || []).map((d) => ({ name: d.name, ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)])) }));
}
const lastCode = async (to) => String((await docs('phoneOutbox')).filter((m) => m.to === to && m.kind === 'code').sort((a, c) => a.at - c.at).pop()?.code ?? '');
const clearGuards = async () => { for (const d of await docs('phoneGuard')) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: OWNER }); };

/** Maquette à gauche, application à droite, même hauteur. */
async function sideBySide(maquette, app, out) {
  const page = await b.newPage({ viewport: { width: 1480, height: 1660 } });
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:20px;padding:20px;font:600 22px sans-serif">
    <figure style="margin:0"><figcaption style="color:#fff;margin-bottom:8px">Maquette</figcaption><img src="${uri(maquette)}" width="720" height="1600"></figure>
    <figure style="margin:0"><figcaption style="color:#fff;margin-bottom:8px">Application</figcaption><img src="${uri(app)}" width="720" height="1600"></figure></body>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

async function run(theme) {
  const suffix = theme === 'dark' ? 'sombre' : 'clair';
  const tmp = path.join(OUT, '.app');
  fs.mkdirSync(tmp, { recursive: true });
  const shots = {};
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR', colorScheme: theme, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept());
    const go = async (u, w = 3500) => { await p.goto(BASE + u, { waitUntil: 'load' }); await p.waitForTimeout(w); };
    const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
    const keys = async (code, w = 2500) => { for (const c of code) { await btn(c).last().click(); await p.waitForTimeout(60); } await p.waitForTimeout(w); };
    const see = (t) => p.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
    const shot = async (name) => { const f = path.join(tmp, `${name}-${suffix}.png`); await p.waitForTimeout(400); await p.screenshot({ path: f }); shots[name] = f; };
    return { ctx, p, go, btn, keys, see, shot };
  };
  const local = `07${String(Date.now() % 1e8).padStart(8, '0')}`;
  const e164 = `+225${local}`;

  // Avant connexion, l'application est toujours en thème clair (`_layout.tsx` : préférence du
  // profil, sinon clair) : en sombre, seul l'écran 8 (connecté) peut être montré.
  if (theme === 'light') {
  // 1 → 4 bis, erreurs 9 et 12.
  await clearGuards();
  const A = await open();
  await A.go('/'); await A.shot('01-bienvenue');
  await A.btn('S’inscrire avec mon numéro').click(); await A.see('Votre numéro de téléphone');
  await A.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local);
  await A.p.getByLabel('Numéro de téléphone', { exact: true }).blur();
  await A.shot('02-numero');
  await A.ctx.setOffline(true);
  await A.btn('Recevoir le code').click(); await A.see('Pas de connexion Internet');
  await A.shot('12-erreur-pas-de-reseau');
  await A.ctx.setOffline(false);
  await A.btn('Recevoir le code').click(); await A.see('Entrez le code reçu');
  const code = await lastCode(e164);
  await A.keys(code.slice(0, 3), 600); await A.shot('03-code-whatsapp');
  await A.keys(code.slice(3) === '999' ? '000' : '999');
  await A.see('Code incorrect'); await A.shot('09-erreur-mauvais-code');
  await A.keys(code); await A.see('Créez votre code secret');
  await A.keys(SECRET.slice(0, 3), 400); await A.shot('04a-code-secret');
  await A.keys(SECRET.slice(3)); await A.see('Confirmez votre code secret');
  await A.keys(SECRET.slice(0, 5), 400); await A.shot('04b-confirmation');
  await A.keys(SECRET.slice(5), 6000);

  // 5, erreur 10, 6, erreur 11.
  await A.go('/settings'); await A.p.getByText('Se déconnecter').last().click(); await A.see('S’inscrire avec mon numéro');
  // Depuis l'audit du 23/10 (S7), « Se déconnecter » OUBLIE le numéro. « Bon retour ! » ne se voit plus que
  // si la session a pris fin sans déconnexion (expirée, compte réactivé…) : ce cas est SIMULÉ ici.
  await A.p.evaluate((v) => localStorage.setItem('dinerox:v1:phone:last', v), JSON.stringify({ e164, dial: '225' }));
  await A.go('/');
  await A.btn('Se connecter').click(); await A.see('Bon retour !');
  await A.keys('00', 400); await A.shot('05-connexion');
  await A.btn('⌫').last().click(); await A.btn('⌫').last().click();
  for (let i = 0; i < 5; i++) await A.keys('000000');
  await A.see('Trop d’essais'); await A.shot('10-erreur-trop-essais');
  await clearGuards();
  await A.go('/'); await A.btn('Se connecter').click(); await A.see('Bon retour !');
  await A.btn('Code secret oublié ?').click(); await A.see('Vos opérations, vos comptes');
  await A.shot('06-code-oublie');
  await A.btn('Recevoir le code').first().click(); await A.see('Entrez le code reçu');
  const pending = (await docs('phoneAuth')).filter((d) => d.purpose === 'reset').sort((a, c) => a.createdAt - c.createdAt).pop();
  await fetch(`http://127.0.0.1:8080/v1/${pending.name}?updateMask.fieldPaths=expiresAt`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { expiresAt: { integerValue: String(Date.now() - 1000) } } }) });
  await A.keys(await lastCode(e164)); await A.see('Ce code a expiré'); await A.shot('11-erreur-code-expire');
  await A.ctx.close();

  // 7 — nouveau téléphone.
  await clearGuards();
  const B = await open();
  await B.go('/phone?start=signin');
  await B.p.getByLabel('Numéro de téléphone', { exact: true }).fill(local);
  await B.btn('Continuer').click(); await B.see('Votre code secret');
  await B.keys(SECRET); await B.see('Nouveau téléphone'); await B.shot('07-nouveau-telephone');
  await B.ctx.close();
  }

  // 8 — « Ajouter mon numéro » depuis un compte e-mail.
  const C = await open();
  const email = `capt${Date.now()}@ex.com`;
  await C.go('/sign-up');
  const fill = (label, v, exact = false) => C.p.getByLabel(label, { exact }).first().fill(v);
  await fill('Nom', 'Koné', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', email);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await C.p.getByRole('switch').first().click(); await C.btn('Créer mon compte').click();
  await C.see('Dans quel pays vivez-vous actuellement ?'); await C.p.getByText('Plus tard', { exact: true }).click();
  await C.see('Bonjour Awa');
  // Le thème suit la préférence du profil, pas celle du navigateur : on la choisit dans les Réglages.
  if (theme === 'dark') { await C.go('/settings'); await C.p.getByText('Sombre', { exact: true }).first().click(); await C.p.waitForTimeout(1500); }
  await C.go('/settings/add-phone');
  await C.p.getByLabel('Numéro de téléphone', { exact: true }).fill('0708091011');
  await C.p.getByLabel('Numéro de téléphone', { exact: true }).blur();
  await C.shot('08-ajouter-numero');
  await C.ctx.close();

  // Bienvenue : maquette v2 du fondateur (23/10, DECISIONS.md §5ter) ; l'ancienne preuve est retirée.
  if (shots['01-bienvenue']) {
    fs.rmSync(path.join(OUT, `01-bienvenue-${suffix}.png`), { force: true });
    await sideBySide(path.join(MAQ, '..', `01-bienvenue-v2-${suffix}.png`), shots['01-bienvenue'], path.join(OUT, `01-bienvenue-v2-${suffix}.png`));
    console.log('✓', `01-bienvenue-v2-${suffix}.png`);
  }
  for (const f of fs.readdirSync(MAQ).filter((n) => n.endsWith(`-${suffix}.png`) && !n.startsWith('planche') && !n.startsWith('01-bienvenue'))) {
    const key = Object.keys(shots).find((k) => f.startsWith(k));
    if (!key) { fs.rmSync(path.join(OUT, f), { force: true }); console.log('— pas de capture (avant connexion : thème clair seulement) :', f); continue; }
    await sideBySide(path.join(MAQ, f), shots[key], path.join(OUT, f));
    console.log('✓', f);
  }
}

(async () => {
  // Écrans « numéro » : l'interrupteur publié doit être activé (désactivé par défaut, audit 23/10 C5).
  await setPhoneAuthSwitch(true);
  b = await launch();
  fs.mkdirSync(OUT, { recursive: true });
  for (const theme of ['light', 'dark']) await run(theme);
  fs.rmSync(path.join(OUT, '.app'), { recursive: true, force: true });
  await setPhoneAuthSwitch(null);
  await b.close();
  process.exit(0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message.slice(0, 400));
  await setPhoneAuthSwitch(null).catch(() => undefined);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
