/*
 * Croissance, étape 5 — origine des installations (export web + émulateurs auth, firestore, functions).
 *  1. lien de campagne `/a?src=facebook&cmp=e2e&cnt=video1` sans session → inscription → la VRAIE
 *     fonction `recordSignupOrigin` compte l'origine (compteurs du jour +1), le profil ne garde que
 *     `originCounted: true` (jamais la source) ;
 *  2. second compte sur le même téléphone, même avec un autre lien : « Origine inconnue » ;
 *  3. liens `/t/{code}` et `/i/{code}` ouverts sur un téléphone neuf : origine retenue, jamais le code ;
 *  4. écran admin : chiffres regroupés (« Mois dernier » préparé), groupes de moins de 5 réunis sans nom ;
 *  5. « Créer un lien de campagne » : saisie refusée, liens Play et dinerox.app, copie ; champs vérifiés.
 */
const { BASE, launch } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const PROJECT = 'demo-dinerox';
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { 'content-type': 'application/json', authorization: 'Bearer owner' };
const stamp = Date.now();
let b;

const enc = (v) =>
  typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }
  : { stringValue: String(v) };
const dec = (f) => (f.integerValue !== undefined ? Number(f.integerValue) : f.booleanValue !== undefined ? f.booleanValue : f.mapValue ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : f.stringValue);
const readDoc = async (path) => { const r = await fetch(`${FS}/${path}`, { headers: OWNER }); if (r.status !== 200) return null; const j = await r.json(); return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, dec(v)])); };
const writeDoc = (path, data) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const uidOf = async (email) => (await (await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ email: [email] }) })).json()).users?.[0]?.localId;
const today = new Date().toISOString().slice(0, 10);
const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
const n = (c, k, sub) => (sub ? (c?.[k]?.[sub] ?? 0) : (c?.[k] ?? 0));

(async () => {
  b = await launch();
  const page = async () => {
    const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
    const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
    const go = async (path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
    const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
    const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
    const ls = (k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
    const signUp = async (first, email) => {
      await p.getByLabel('Prénom').first().waitFor({ timeout: 15000 });
      await fill('Nom', 'Test', true); await fill('Prénom', first); await fill('Adresse e-mail', email);
      await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
      await p.getByRole('switch').first().click(); await btn('Créer mon compte').click();
      await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
      await p.getByText('Plus tard', { exact: true }).click();
      await p.getByText(`Bonjour ${first}`).first().waitFor({ timeout: 15000 }); await p.waitForTimeout(5000);
    };
    return { p, errs, text, go, btn, fill, ls, signUp };
  };

  // ── 1. Lien de campagne → inscription → compté une fois ──
  const before = await readDoc(`originStats/${today}`);
  const a = await page();
  await a.go('/a?src=facebook&cmp=e2e&cnt=video1', 3000);
  ok(a.p.url().includes('/sign-up'), `lien /a sans session → inscription (${a.p.url().replace(BASE, '')})`);
  ok(JSON.stringify(await a.ls('dinerox:v1:device:pendingOrigin')) === JSON.stringify({ src: 'facebook', cmp: 'e2e', cnt: 'video1' }), 'origine retenue sur l’appareil : source, campagne, contenu');
  const awaEmail = `origin-awa${stamp}@ex.com`;
  await a.signUp('Awa', awaEmail);
  const awaUid = await uidOf(awaEmail);
  const profile = await readDoc(`users/${awaUid}`);
  ok(profile?.originCounted === true, 'profil : marqueur « déjà compté » posé par le serveur');
  ok(!/facebook|e2e|video1/.test(JSON.stringify(profile)) && !('src' in profile) && !('cmp' in profile), 'profil : ni source, ni campagne, ni contenu');
  let after = await readDoc(`originStats/${today}`);
  ok(n(after, 'total') - n(before, 'total') === 1 && n(after, 'src', 'facebook') - n(before, 'src', 'facebook') === 1, 'compteurs du jour : +1 inscription, +1 Facebook');
  ok(n(after, 'cmp', 'facebook~e2e') - n(before, 'cmp', 'facebook~e2e') === 1 && n(after, 'cnt', 'facebook~e2e~video1') - n(before, 'cnt', 'facebook~e2e~video1') === 1, 'compteurs du jour : campagne et contenu +1');
  ok(!JSON.stringify(after).includes(awaUid) && !JSON.stringify(after).includes('Awa'), 'compteurs : aucun identifiant ni prénom');
  ok((await a.ls('dinerox:v1:device:originUsed')) === true && (await a.ls('dinerox:v1:device:pendingOrigin')) === null, 'appareil : origine consommée par ce premier compte');

  // ── 2. Second compte sur le même téléphone : « Origine inconnue » ──
  await a.go('/settings'); await a.p.getByText('Se déconnecter').last().click(); await a.p.waitForTimeout(2500);
  await a.p.getByText('Créer mon compte').first().waitFor({ timeout: 10000 });
  const mid = await readDoc(`originStats/${today}`);
  await a.go('/a?src=tiktok', 3000);
  ok((await a.ls('dinerox:v1:device:pendingOrigin')) === null, 'même téléphone : un nouveau lien ne remplace rien');
  const kofiEmail = `origin-kofi${stamp}@ex.com`;
  await a.signUp('Kofi', kofiEmail);
  after = await readDoc(`originStats/${today}`);
  ok(n(after, 'total') - n(mid, 'total') === 1 && n(after, 'unknown') - n(mid, 'unknown') === 1 && n(after, 'src', 'tiktok') === n(mid, 'src', 'tiktok'), 'second compte : compté en « Origine inconnue »');
  ok((await readDoc(`users/${await uidOf(kofiEmail)}`))?.originCounted === true, 'second compte : marqueur posé');

  // ── 3. Liens /t/ et /i/ sur des téléphones neufs ──
  const t = await page();
  await t.go('/t/ABC234?src=whatsapp', 3000);
  const tOrigin = await t.ls('dinerox:v1:device:pendingOrigin');
  ok(JSON.stringify(tOrigin) === JSON.stringify({ src: 'whatsapp' }), `lien de tontine /t/ : source retenue, code de tontine absent (${JSON.stringify(tOrigin)})`);
  const i = await page();
  await i.go('/i/ABC234?src=sms', 3000);
  const iOrigin = await i.ls('dinerox:v1:device:pendingOrigin');
  ok(JSON.stringify(iOrigin) === JSON.stringify({ src: 'sms', invited: true }), `lien d’invitation /i/ : source + « lien d’invitation », jamais le code (${JSON.stringify(iOrigin)})`);

  // ── 4. Écran admin : chiffres regroupés ──
  await writeDoc(`originStats/${lastMonth}-03`, { total: 12, invited: 6, unknown: 2, src: { whatsapp: 7, facebook: 2, tiktok: 1 }, cmp: { 'whatsapp~lancement': 5, 'facebook~tante-awa': 2 } });
  const bossEmail = `origin-boss${stamp}@ex.com`;
  await fetch(`${AUTH}/accounts:batchCreate`, { method: 'POST', headers: OWNER, body: JSON.stringify({ users: [{ localId: `oboss${stamp}`, email: bossEmail, rawPassword: 'motdepasse123', createdAt: String(Date.now()), customAttributes: JSON.stringify({ admin: true }) }] }) });
  const boss = await page();
  await boss.go('/sign-in', 2500);
  await boss.p.getByLabel('Adresse e-mail').fill(bossEmail); await boss.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await boss.btn('Se connecter').click(); await boss.p.waitForTimeout(6000);
  if ((await boss.text()).includes('Dans quel pays')) { await boss.p.getByText('Plus tard', { exact: true }).click(); await boss.p.waitForTimeout(2500); }
  await boss.go('/admin', 6000);
  let txt = await boss.text();
  ok(txt.includes('Origine des inscriptions') && txt.includes('Chiffres regroupés uniquement : aucune personne n\'est identifiable.'), 'admin : carte « Origine des inscriptions » et mention');
  ok(/Comptées depuis le .*\. Les comptes créés avant n'ont pas d'origine\./.test(txt), 'admin : date du premier jour compté');
  await boss.p.getByText('Mois dernier', { exact: true }).first().click(); await boss.p.waitForTimeout(800);
  txt = await boss.text();
  const stats = txt.split('Origine des inscriptions')[1].split('Créer un lien de campagne')[0];
  ok(/Inscriptions\s*12/.test(stats) && /Dont venues d'un lien d'invitation\s*6/.test(stats) && /Origine inconnue[\s\S]*Moins de 5/.test(stats), 'mois dernier : 12 inscriptions, 6 par invitation, inconnue « Moins de 5 »');
  ok(stats.includes('WhatsApp') && stats.includes('7 · 58 %') && stats.includes('WhatsApp › lancement'), 'groupes d’au moins 5 : WhatsApp (7, 58 %), WhatsApp › lancement');
  ok(stats.includes('Autres (groupes de moins de 5)') && !/Facebook|TikTok|tante-awa/.test(stats), 'petits groupes réunis dans « Autres », sans leur nom');
  ok(stats.includes("Installation sans lien suivi : APK installé directement, iPhone, lien sans paramètre."), 'explication de « Origine inconnue » lisible en entier');
  await boss.p.screenshot({ path: `${S}/origin-admin.png`, fullPage: true });

  // ── 5. Générateur de liens ──
  await boss.p.getByLabel('Campagne (facultatif)').first().fill('Tante Awa'); await boss.p.waitForTimeout(400);
  txt = await boss.text();
  ok(txt.includes('Utilisez seulement des lettres minuscules, des chiffres, - et _.') && !txt.includes('play.google.com/store/apps/details'), 'saisie refusée (nom avec espace) : aucun lien');
  await boss.p.getByLabel('Campagne (facultatif)').first().fill('lancement'); await boss.p.waitForTimeout(400);
  txt = await boss.text();
  const play = 'https://play.google.com/store/apps/details?id=com.dinerox.app&referrer=src%3Dwhatsapp%26cmp%3Dlancement';
  ok(txt.includes(play) && txt.includes('https://dinerox.app/a?src=whatsapp&cmp=lancement'), 'liens Play et dinerox.app affichés');
  await boss.btn('Copier').first().click(); await boss.p.waitForTimeout(800);
  ok((await boss.p.evaluate(() => navigator.clipboard.readText())) === play && (await boss.text()).includes('Lien copié'), 'copie du lien Play');
  await checkAllInputs(boss.p, 'Admin › origine', ok, { expectInputs: true });

  const errs = [...a.errs, ...t.errs, ...i.errs, ...boss.errs];
  ok(errs.length === 0, 'aucune erreur JS ' + errs.join(' | '));
  console.log(fails ? `ORIGINE : ${fails} ÉCHEC(S)` : 'ORIGINE : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
