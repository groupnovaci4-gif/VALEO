/*
 * Croissance, étape 2 — partage (export web + émulateurs auth, firestore, functions).
 * Rien ne part vraiment : l'ouverture de WhatsApp (window.open) et la feuille de
 * partage (navigator.share) sont INTERCEPTÉES pour vérifier ce qui serait envoyé.
 *  1. Inviter des amis : « Partager sur WhatsApp » → message prérempli, lien `src=whatsapp` ;
 *  2. trophée obtenu → « Partager mon trophée » : carte sans nom ni montant, image PNG partagée ;
 *     trophée non obtenu → rien à partager ;
 *  3. menu Plus : « Suivre DineroX sur WhatsApp » caché sans adresse, visible quand
 *     l'admin publie une adresse valide, caché de nouveau si l'adresse est invalide.
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
let b;

const enc = (v) => (typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) });
const writeDoc = (path, data) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const uidOf = async (email) => (await (await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ email: [email] }) })).json()).users?.[0]?.localId;

(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR' });
  // Interception : ce qui serait ouvert (WhatsApp) ou partagé (feuille de partage).
  await ctx.addInitScript(() => {
    window.__opened = [];
    window.__shared = [];
    window.open = (url) => { window.__opened.push(String(url)); return null; };
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => { window.__shared.push(data); } });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const go = async (path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);

  // Compte Awa (sans aucun montant saisi : la carte ne pourrait de toute façon pas en afficher).
  const email = `share${stamp}@ex.com`;
  await go('/'); await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
  await fill('Nom', 'Koné', true); await fill('Prénom', 'Awa'); await fill('Adresse e-mail', email);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await p.getByRole('switch').first().click(); await btn('Créer mon compte').click();
  await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await p.getByText('Plus tard', { exact: true }).click();
  await p.getByText('Bonjour Awa').first().waitFor({ timeout: 15000 });
  const uid = await uidOf(email);

  // ── 1. Inviter des amis → WhatsApp ──
  await go('/invite', 5000);
  const codeLabel = await p.locator('[aria-label^="Mon code : "]').first().getAttribute('aria-label');
  const code = (codeLabel || '').replace('Mon code : ', '').replace(/ /g, '');
  ok(/^[A-Z2-9]{6}$/.test(code), `code obtenu (${code})`);
  const wa = btn('Partager sur WhatsApp');
  const box = await wa.first().boundingBox();
  ok(!!box && box.height >= 48, `« Partager sur WhatsApp » visible, ≥ 48 dp (${box ? Math.round(box.height) : '?'})`);
  await wa.first().click(); await p.waitForTimeout(800);
  const opened = await p.evaluate(() => window.__opened.slice());
  const waUrl = opened.find((u) => u.startsWith('https://wa.me/?text=')) || '';
  ok(!!waUrl, 'WhatsApp ouvert (web : WhatsApp Web)');
  const msg = decodeURIComponent(waUrl.slice('https://wa.me/?text='.length));
  ok(msg === `J'utilise DineroX pour gérer mon argent : je dis mes dépenses à voix haute et l'appli me dit combien il me reste par jour. Essaie avec mon lien : https://dinerox.app/i/${code}?src=whatsapp`, `message prérempli exact, lien src=whatsapp (« ${msg.slice(-45)} »)`);
  ok(!/FCFA|Awa|Koné|chacun/.test(msg), 'message : ni montant, ni nom, ni « on gagne chacun »');
  ok((await p.evaluate(() => window.__shared.length)) === 0, 'rien d’autre n’est envoyé (aucune feuille de partage ouverte)');

  // ── 2. Trophée ──
  await go('/share-trophy?id=budget_master', 3000);
  ok((await text()).includes('Pas encore obtenue'), 'trophée non obtenu : rien à partager');
  const period = new Date().toISOString().slice(0, 7);
  await writeDoc(`users/${uid}/rewards/regular_entry_${period}`, { rewardId: 'regular_entry', period, earnedAt: Date.now(), spaceId: uid });
  await go('/rewards', 4000);
  const shareBtn = p.getByRole('button', { name: /^Partager mon trophée, / }).filter({ visible: true });
  ok((await shareBtn.count()) === 1, 'Récompenses : « Partager mon trophée » sur le seul trophée obtenu');
  await shareBtn.first().click(); await p.waitForTimeout(4000);
  ok(p.url().includes('/share-trophy?id=regular_entry'), `écran du trophée (${p.url().replace(BASE, '')})`);
  const cardText = (await p.locator('[aria-label^="Nouveau trophée sur DineroX"]').first().innerText()).replace(/[  ]/g, ' ');
  ok(cardText.includes('Nouveau trophée sur DineroX 🏆'), 'carte : « Nouveau trophée sur DineroX 🏆 »');
  ok(cardText.includes(`dinerox.app/i/${code}`) && cardText.includes(`Code d'invitation : ${code}`), 'carte : lien court et code d’invitation lisibles');
  // Le code (public) peut contenir des chiffres : on le retire partout avant de chercher un montant.
  ok(!/Awa|Koné|FCFA|\d{3}/.test(cardText.split(code).join('')), 'carte : ni nom, ni prénom, ni montant');
  await p.locator('[aria-label^="Nouveau trophée sur DineroX"]').first().screenshot({ path: `${S}/share-trophy-card.png` });
  await btn('Partager mon trophée').last().click(); await p.waitForTimeout(3000);
  const shared = await p.evaluate(() => window.__shared.map((d) => ({ url: String(d.url || ''), len: String(d.url || '').length })));
  ok(shared.length === 1 && shared[0].url.startsWith('data:image/png') && shared[0].len > 5000, `image PNG partagée par la feuille de partage (${shared[0] ? shared[0].len : 0} caractères)`);

  // ── 3. Chaîne WhatsApp ──
  await go('/more', 4000);
  ok(!(await text()).includes('Suivre DineroX sur WhatsApp'), 'Plus : ligne de la chaîne cachée sans adresse');
  const CHANNEL = 'https://whatsapp.com/channel/0029VaTestChannel01';
  await writeDoc('config/app/items/links', { whatsappChannelUrl: CHANNEL });
  await go('/more', 4000);
  const row = p.getByText('Suivre DineroX sur WhatsApp', { exact: true }).filter({ visible: true });
  ok((await row.count()) === 1 && (await text()).includes('Conseils et nouveautés, sur notre chaîne'), 'adresse publiée : ligne visible');
  await row.first().click(); await p.waitForTimeout(800);
  ok((await p.evaluate(() => window.__opened.slice())).includes(CHANNEL), 'la ligne ouvre la chaîne publiée');
  await writeDoc('config/app/items/links', { whatsappChannelUrl: 'https://evil.example/channel/0029VaTestChannel01' });
  await go('/more', 4000);
  ok(!(await text()).includes('Suivre DineroX sur WhatsApp'), 'adresse invalide : ligne cachée de nouveau');
  await writeDoc('config/app/items/links', { whatsappChannelUrl: '' });

  ok(errs.length === 0, 'aucune erreur JS ' + errs.join(' | '));
  console.log(fails ? `PARTAGE : ${fails} ÉCHEC(S)` : 'PARTAGE : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
