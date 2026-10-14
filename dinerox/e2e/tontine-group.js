/*
 * Croissance, étape 3 — tontine partagée à 3 comptes (export web + émulateurs
 * auth, firestore, functions ; les VRAIES Cloud Functions répondent).
 *  Fatou (organisatrice, Plus) crée « Tontine du marché » (3 places) et invite ;
 *  Awa (compte ancien) et Kofi (nouveau compte → parrainé par Fatou) demandent
 *  à rejoindre ; Fatou valide, nomme Kofi trésorier, tire au sort ;
 *  Kofi déclare (et enregistre l'opération : même catégorie que le carnet) ;
 *  statuts selon la personne ; rappel préparé ; Awa quitte ; avertissement
 *  avant la suppression du compte de l'organisatrice sans trésorier.
 * WhatsApp et les boîtes de dialogue sont INTERCEPTÉS : rien ne part.
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
const D = 24 * 3600 * 1000;
const stamp = Date.now();
const browsers = [];

const enc = (v) => (v === null ? { nullValue: null } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } } : { stringValue: String(v) });
const dec = (f) => { if (!f) return undefined; if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, dec(v)])); if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec); if ('integerValue' in f) return Number(f.integerValue); if ('booleanValue' in f) return f.booleanValue; if ('nullValue' in f) return null; return f.stringValue; };
const readDoc = async (path) => { const r = await fetch(`${FS}/${path}`, { headers: OWNER }); if (!r.ok) return undefined; const j = await r.json(); return dec({ mapValue: { fields: j.fields } }); };
const listDocs = async (path) => { const r = await fetch(`${FS}/${path}?pageSize=300`, { headers: OWNER }); const j = await r.json(); return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...dec({ mapValue: { fields: d.fields } }) })); };
const patchField = (path, field, value) => fetch(`${FS}/${path}?updateMask.fieldPaths=${field}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { [field]: enc(value) } }) });
const uidOf = async (email) => (await (await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ email: [email] }) })).json()).users?.[0]?.localId;
const until = async (get, test, ms = 20000) => { const end = Date.now() + ms; let v = await get(); while (!test(v) && Date.now() < end) { await new Promise((r) => setTimeout(r, 400)); v = await get(); } return v; };

async function person(opts = {}) {
  const b = await launch(opts.date ? { date: opts.date } : {});
  browsers.push(b);
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR' });
  await ctx.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return null; };
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const go = async (path, w = 4000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
  const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
  return { p, errs, text, go, btn, fill };
}

async function signUp(h, first, email) {
  await h.go('/'); await h.p.getByText('Créer mon compte', { exact: false }).first().click(); await h.p.waitForTimeout(800);
  await h.fill('Nom', 'Test', true); await h.fill('Prénom', first); await h.fill('Adresse e-mail', email);
  await h.fill('Mot de passe', 'motdepasse123', true); await h.fill('Confirmer le mot de passe', 'motdepasse123');
  await h.p.getByRole('switch').first().click(); await h.btn('Créer mon compte').click();
  await h.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await h.p.getByText('Plus tard', { exact: true }).click();
  await h.p.getByText(`Bonjour ${first}`).first().waitFor({ timeout: 15000 });
}

async function signIn(h, email) {
  await h.go('/sign-in', 2500);
  await h.p.getByLabel('Adresse e-mail').fill(email); await h.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await h.btn('Se connecter').click(); await h.p.waitForTimeout(6000);
  if ((await h.text()).includes('Dans quel pays')) { await h.p.getByText('Plus tard', { exact: true }).click(); await h.p.waitForTimeout(2500); }
}

(async () => {
  // ── Fatou, organisatrice (formule Plus) ──
  const fatou = await person();
  const fatouEmail = `fatou${stamp}@ex.com`;
  await signUp(fatou, 'Fatou', fatouEmail);
  const fatouUid = await uidOf(fatouEmail);
  await fatou.go('/tontines/group/new', 3500);
  ok((await fatou.text()).includes('Créer une tontine partagée fait partie des formules Plus et Family. Rejoindre une tontine reste gratuit.'), 'formule gratuite : création réservée à Plus et Family');
  await patchField(`users/${fatouUid}`, 'subscription', { plan: 'plus', status: 'active', provider: 'manual', updatedAt: 1, expiresAt: null });
  await fatou.go('/tontines', 4000);
  await fatou.btn('Créer une tontine partagée').first().click(); await fatou.p.waitForTimeout(2500);
  let t = await fatou.text();
  ok(t.includes('Une tontine tournante : chaque place reçoit la cagnotte à son tour.') && t.includes("DineroX ne collecte ni ne garde d'argent"), 'création : explication et mention obligatoire');
  await checkAllInputs(fatou.p, 'Tontine partagée — création', ok, { expectInputs: true });
  await fatou.fill('Nom du groupe', 'Tontine du marché');
  await fatou.fill('Cotisation par place', '10000');
  await fatou.p.getByText('Chaque semaine', { exact: true }).first().click();
  await fatou.fill('Nombre de places (tours)', '3');
  await fatou.fill('Mes places', '1');
  await fatou.btn('Créer la tontine partagée').click(); await fatou.p.waitForTimeout(5000);
  const groupId = (fatou.p.url().match(/tontines\/group\/([^/?]+)/) || [])[1];
  ok(!!groupId && (await fatou.text()).includes('Tontine tournante · Chaque semaine · 3 places'), `groupe créé (${groupId})`);
  const g0 = await readDoc(`tontineGroups/${groupId}`);
  ok(g0?.memberUids?.length === 1 && g0.slots.filter((s) => s.uid).length === 1, 'serveur : seule l’organisatrice est membre, 2 places libres');

  // Invitation : cotisation NON cochée par défaut, partage par WhatsApp intercepté.
  await fatou.btn('Inviter').first().click(); await fatou.p.waitForTimeout(3000);
  t = await fatou.text();
  const code = (t.match(/\(code ([A-Z2-9]{6})\)/) || [])[1];
  ok(!!code, `invitation créée (code ${code})`);
  // Deux boutons WhatsApp chez l'organisatrice : le rappel (retards) puis l'invitation (en dernier).
  await fatou.btn('Partager sur WhatsApp').last().click(); await fatou.p.waitForTimeout(800);
  const invUrl = (await fatou.p.evaluate(() => window.__opened.slice())).find((u) => u.startsWith('https://wa.me/') && decodeURIComponent(u).includes('Rejoins')) || '';
  const invMsg = decodeURIComponent(invUrl.replace('https://wa.me/?text=', ''));
  ok(invMsg === `Rejoins notre tontine « Tontine du marché » sur DineroX pour suivre les tours et les cotisations : https://dinerox.app/t/${code}?src=whatsapp (code ${code})`, 'message d’invitation : nom, lien, code — ni membres, ni numéro, ni cotisation');

  // ── Awa : compte ancien (30 jours), aucune proposition de parrainage ──
  const awaEmail = `awa${stamp}@ex.com`;
  await fetch(`${AUTH}/accounts:batchCreate`, { method: 'POST', headers: OWNER, body: JSON.stringify({ users: [{ localId: `awa${stamp}`, email: awaEmail, displayName: 'Awa', rawPassword: 'motdepasse123', createdAt: String(Date.now() - 30 * D) }] }) });
  const awaUid = `awa${stamp}`;
  const awa = await person();
  await signIn(awa, awaEmail);
  await awa.go(`/tontines/join?code=${code}`, 3000);
  await checkAllInputs(awa.p, 'Tontine partagée — rejoindre (code)', ok, { expectInputs: true });
  await awa.btn('Voir la tontine').click(); await awa.p.waitForTimeout(3000);
  t = await awa.text();
  ok(t.includes('Tontine du marché · Chaque semaine · 3 places') && !t.includes('10 000'), 'aperçu : nom, fréquence, places ; cotisation cachée (non cochée)');
  ok(!/Fatou/.test(t.split('Tontine du marché · Chaque semaine')[1] || ''), 'aperçu : aucune liste de membres');
  ok(t.includes("DineroX ne collecte ni ne garde d'argent") && !t.includes("l'organisateur devient votre parrain"), 'avant de rejoindre : mention ; pas de parrainage pour un compte ancien');
  await awa.btn('Demander à rejoindre').click(); await awa.p.waitForTimeout(3000);
  ok((await awa.text()).includes("Demande envoyée. L'organisateur doit la valider avant que vous soyez membre."), 'Awa : demande envoyée');
  ok(!(await readDoc(`tontineGroups/${groupId}`)).memberUids.includes(awaUid), 'serveur : Awa n’est PAS membre avant validation');

  // ── Kofi : nouveau compte → l'organisatrice devient sa marraine, avec la transparence ──
  const kofi = await person();
  const kofiEmail = `kofi${stamp}@ex.com`;
  await signUp(kofi, 'Kofi', kofiEmail);
  const kofiUid = await uidOf(kofiEmail);
  await kofi.go(`/t/${code}`, 4000);
  ok(kofi.p.url().includes('/tontines/join'), 'lien /t/{code} → écran pour rejoindre, code prérempli');
  await kofi.btn('Voir la tontine').click(); await kofi.p.waitForTimeout(3000);
  t = await kofi.text();
  ok(t.includes("En rejoignant, l'organisateur devient votre parrain.") && t.includes('Votre parrain verra seulement où en est votre semaine DineroX'), 'nouveau compte : parrainage annoncé + texte de transparence');
  await kofi.btn('Demander à rejoindre').click(); await kofi.p.waitForTimeout(4000);
  const kofiProfile = await until(() => readDoc(`users/${kofiUid}`), (d) => !!d?.referredBy);
  ok(kofiProfile?.referredBy?.uid === fatouUid && kofiProfile?.referredBy?.source === 'tontine', 'serveur : Fatou devient la marraine de Kofi (source « tontine »)');

  // ── Fatou valide les demandes, nomme Kofi trésorier, tire au sort ──
  await fatou.go(`/tontines/group/${groupId}`, 5000);
  ok((await fatou.text()).includes('Demandes à valider'), 'Fatou : demandes à valider');
  await fatou.p.getByRole('button', { name: 'Membre 2', exact: true }).first().click(); await fatou.p.waitForTimeout(300);
  await fatou.btn('Valider, Awa').click(); await fatou.p.waitForTimeout(4000);
  await fatou.p.getByRole('button', { name: 'Membre 3', exact: true }).first().click(); await fatou.p.waitForTimeout(300);
  await fatou.btn('Valider, Kofi').click(); await fatou.p.waitForTimeout(4000);
  const g1 = await readDoc(`tontineGroups/${groupId}`);
  ok(g1.memberUids.includes(awaUid) && g1.memberUids.includes(kofiUid) && g1.slots[1].label === 'Awa' && g1.slots[2].label === 'Kofi', 'serveur : Awa (place 2) et Kofi (place 3) membres, avec le nom qu’ils ont choisi');
  await fatou.p.getByRole('button', { name: 'Kofi', exact: true }).first().click(); await fatou.p.waitForTimeout(3000);
  ok((await readDoc(`tontineGroups/${groupId}`)).treasurerUid === kofiUid, 'Kofi trésorier (choisi parmi les membres)');
  await fatou.btn('Tirer au sort').click(); await fatou.p.waitForTimeout(4000);
  ok((await fatou.text()).includes('Tirage au sort fait le'), 'tirage au sort fait, une seule fois');
  ok((await fatou.btn('Tirer au sort').count()) === 0, 'plus de bouton de tirage');
  // L'ordre affiché suit le tirage (jamais l'ordre d'avant) ; « Enregistrer l'ordre » inactif tant que rien n'est déplacé.
  const drawn = (await readDoc(`tontineGroups/${groupId}`)).slots.slice().sort((x, y) => x.turnOrder - y.turnOrder).map((x) => x.label);
  t = await fatou.text();
  const shown = (t.split('Ordre des tours')[1] || '').match(/\d\. (Fatou|Awa|Kofi)/g) || [];
  ok(shown.join(',') === drawn.map((n, k) => `${k + 1}. ${n}`).join(','), `ordre affiché = ordre tiré (${shown.join(' ')})`);
  ok(await fatou.btn("Enregistrer l'ordre").isDisabled(), "« Enregistrer l'ordre » inactif tant que rien n'est déplacé");
  await fatou.p.screenshot({ path: `${S}/tontine-group-organizer.png`, fullPage: true });

  // ── Kofi déclare son paiement du tour 1 et l'enregistre dans ses opérations ──
  await kofi.go(`/tontines/group/${groupId}`, 5000);
  await kofi.p.getByRole('button', { name: '1', exact: true }).first().click(); await kofi.p.waitForTimeout(500);
  await kofi.btn("J'ai payé").first().click(); await kofi.p.waitForTimeout(5000);
  const pay = await readDoc(`tontineGroups/${groupId}/payments/1_1_s3`);
  ok(pay?.status === 'declared' && pay.declaredBy === kofiUid, 'serveur : paiement de Kofi déclaré');
  const txs = await until(() => listDocs(`spaces/${kofiUid}/transactions`), (l) => l.some((x) => x.payee === 'Tontine du marché'));
  const tx = txs.find((x) => x.payee === 'Tontine du marché');
  const sub = await readDoc(`spaces/${kofiUid}/categories/sub_informal_tontine`);
  ok(tx?.type === 'expense' && tx.amount === 10000 && tx.subcategoryId === 'sub_informal_tontine' && tx.categoryId === sub?.parentId, `opération enregistrée chez Kofi avec la catégorie du carnet (${tx?.categoryId} › ${tx?.subcategoryId})`);

  // Statuts selon la personne : Awa (simple membre) voit « Pas encore » pour Kofi ; Fatou voit « Déclaré, à confirmer ».
  await awa.go(`/tontines/group/${groupId}`, 5000);
  await awa.p.getByRole('button', { name: '1', exact: true }).first().click(); await awa.p.waitForTimeout(500);
  t = await awa.text();
  ok(!t.includes('Déclaré, à confirmer') && t.includes('Pas encore'), 'Awa (membre) : « Pas encore » pour Kofi, jamais « déclaré »');
  await fatou.go(`/tontines/group/${groupId}`, 5000);
  await fatou.p.getByRole('button', { name: '1', exact: true }).first().click(); await fatou.p.waitForTimeout(500);
  ok((await fatou.text()).includes('Déclaré, à confirmer'), 'Fatou (organisatrice) : « Déclaré, à confirmer »');
  // Le trésorier confirme ; l'historique note qui a confirmé ; « Payé » pour tous.
  await kofi.go(`/tontines/group/${groupId}`, 5000);
  await kofi.p.getByRole('button', { name: '1', exact: true }).first().click(); await kofi.p.waitForTimeout(500);
  await kofi.btn('Confirmer le paiement, Kofi').click(); await kofi.p.waitForTimeout(4000);
  ok((await readDoc(`tontineGroups/${groupId}/payments/1_1_s3`))?.confirmedBy === kofiUid, 'serveur : confirmé par le trésorier');
  await awa.go(`/tontines/group/${groupId}`, 5000);
  await awa.p.getByRole('button', { name: '1', exact: true }).first().click(); await awa.p.waitForTimeout(500);
  t = await awa.text();
  ok(/Kofi\s*Payé/.test(t), 'Awa : Kofi « Payé »');
  ok(t.includes('Paiement confirmé par Kofi'), 'historique : « Paiement confirmé par Kofi »');

  // ── Retard : visible de l'organisatrice et de la personne, pas d'un autre membre ──
  const later = new Date(Date.now() + 10 * D);
  const awaLater = await person({ date: later });
  await signIn(awaLater, awaEmail);
  await awaLater.go(`/tontines/group/${groupId}`, 5000);
  await awaLater.p.getByRole('button', { name: '1', exact: true }).first().click(); await awaLater.p.waitForTimeout(500);
  t = await awaLater.text();
  ok(/Awa\s*En retard/.test(t), '10 jours plus tard : Awa voit SON retard');
  ok(/Fatou\s*Pas encore/.test(t), 'Awa ne voit pas le retard de Fatou (« Pas encore »)');
  const fatouLater = await person({ date: later });
  await signIn(fatouLater, fatouEmail);
  await fatouLater.go(`/tontines/group/${groupId}`, 5000);
  await fatouLater.p.getByRole('button', { name: '1', exact: true }).first().click(); await fatouLater.p.waitForTimeout(500);
  t = await fatouLater.text();
  ok(/Awa\s*En retard/.test(t), 'l’organisatrice voit le retard d’Awa');
  ok(t.includes('Retards'), 'organisatrice : tableau des retards');

  // ── Rappel préparé : nom du groupe, tour, date ; cotisation seulement si cochée ; aucun nom de membre ──
  t = await fatouLater.text();
  const reminder = (t.match(/Rappel : la cotisation du tour \d+ de « Tontine du marché » est attendue au plus tard le [^.]+\./) || [])[0];
  ok(!!reminder && !/Awa|Kofi|Fatou|FCFA/.test(reminder), `rappel : ${reminder}`);
  await fatouLater.p.getByRole('switch', { name: 'Ajouter le montant de la cotisation' }).click(); await fatouLater.p.waitForTimeout(500);
  ok((await fatouLater.text()).includes('Cotisation : 10 000 FCFA par place.'), 'cotisation ajoutée seulement après la case cochée');

  // ── Awa quitte : elle ne voit plus la tontine ; sa place devient « Ancien membre » ──
  await awa.go(`/tontines/group/${groupId}`, 5000);
  await awa.btn('Quitter la tontine').click(); await awa.p.waitForTimeout(5000);
  const g2 = await readDoc(`tontineGroups/${groupId}`);
  ok(!g2.memberUids.includes(awaUid) && g2.slots[1].former === true, 'serveur : Awa partie, place « ancien membre »');
  await fatou.go(`/tontines/group/${groupId}`, 5000);
  ok((await fatou.text()).includes('Ancien membre'), 'Fatou : « Ancien membre »');

  // ── Avertissement avant la suppression du compte de l'organisatrice sans trésorier ──
  await fatou.go('/settings/data', 4000);
  await fatou.btn('Supprimer mon compte').first().click(); await fatou.p.waitForTimeout(1500);
  ok(!(await fatou.text()).includes('Nommez un trésorier'), 'avec un trésorier : pas d’avertissement');
  await fatou.go(`/tontines/group/${groupId}`, 5000);
  await fatou.p.getByRole('button', { name: 'Pas de trésorier', exact: true }).first().click(); await fatou.p.waitForTimeout(3000);
  await fatou.go('/settings/data', 4000);
  await fatou.btn('Supprimer mon compte').first().click(); await fatou.p.waitForTimeout(1500);
  ok((await fatou.text()).includes('Vous organisez la tontine « Tontine du marché ». Nommez un trésorier avant de supprimer votre compte, sinon elle ne pourra plus être modifiée.'), 'sans trésorier : avertissement (la suppression reste possible)');

  const errs = [fatou, awa, kofi, awaLater, fatouLater].flatMap((h) => h.errs);
  ok(errs.length === 0, 'aucune erreur JS ' + errs.join(' | '));
  console.log(fails ? `TONTINE PARTAGÉE : ${fails} ÉCHEC(S)` : 'TONTINE PARTAGÉE : TOUT EST OK');
  for (const b of browsers) await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message);
  for (const b of browsers) await b.close().catch(() => undefined);
  process.exit(1);
});
