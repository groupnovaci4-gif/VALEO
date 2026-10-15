/*
 * Correctif « argent mis de côté » (cercle fermé, 2026-10-14) sur l'application réelle
 * (export web + émulateurs auth, firestore, functions) :
 *  1. revenu 100 000 sur Espèces + compte Épargne créé avec 60 000 → reste par jour sur 40 000 ;
 *  2. phrase « loyer 10 000 avec l'épargne » → dépense sur Espèces (jamais un versement),
 *     message « L'épargne ne paie pas directement une dépense… » ; épargne inchangée ;
 *  3. dépense qui fait passer le disponible sous zéro → « il manque 5 000 FCFA » ; carte de
 *     l'accueil ; « Retirer de mon épargne ou d'un objectif » → « D'où voulez-vous retirer… » →
 *     retrait prérempli → la carte disparaît ;
 *  4. personne qui n'a jamais renseigné son argent : ni message ni carte.
 */
const { BASE, launch, phraseField } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const num = (s) => Number(String(s ?? '').replace(/[^\d-]/g, ''));
let b;

(async () => {
  b = await launch();
  const page = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
    const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
    const btn = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
    const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
    const fill = (label, v, exact = false) => p.getByLabel(label, { exact }).first().fill(v);
    const tap = async (t, w = 300) => { await p.getByText(t, { exact: true }).first().click(); await p.waitForTimeout(w); };
    const signUp = async (first) => {
      await go('/'); await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(800);
      await fill('Nom', 'Test', true); await fill('Prénom', first); await fill('Adresse e-mail', `circle-${first.toLowerCase()}${Date.now()}@ex.com`);
      await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
      await p.getByRole('switch').first().click(); await btn('Créer mon compte').click();
      await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
      await p.getByText('Plus tard', { exact: true }).click();
      await p.getByText(`Bonjour ${first}`).first().waitFor({ timeout: 15000 }); await p.waitForTimeout(2500);
    };
    return { p, errs, text, btn, go, fill, tap, signUp };
  };
  const today = new Date();
  const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;

  const h = await page();
  const { p, text, btn, go, fill, tap } = h;
  const savingsTotal = async () => { await go('/savings'); return num(((await text()).match(/Épargne totale\s*\n\s*([^\n]+)/) || [])[1]); };
  const home = async () => { await go('/', 3500); const t = await text(); return { t, perDay: num((t.match(/Il vous reste ([\d ]+) FCFA par jour/) || [])[1]), available: num(((t.match(/Solde disponible\s*\n\s*([-−]?[\d ]+) FCFA/) || [])[1] || '').replace('−', '-')) }; };

  // ── 1. Revenu 100 000 + épargne 60 000 ──
  await h.signUp('Awa');
  await go('/transaction/new?type=income'); await fill('Montant', '100000'); await tap('Salaire'); await btn('Enregistrer').last().click(); await p.waitForTimeout(1500);
  await go('/accounts/edit?savings=1'); await fill('Nom du compte', 'Mon épargne'); await fill('Combien y a-t-il déjà sur ce compte ?', '60000'); await btn('Enregistrer').last().click(); await p.waitForTimeout(1500);
  let hm = await home();
  ok(hm.perDay === Math.floor(40_000 / daysLeft), `revenu 100 000, épargne 60 000 : reste par jour calculé sur 40 000 (${hm.perDay} = 40 000 / ${daysLeft})`);
  ok((await savingsTotal()) === 60_000, 'épargne : 60 000');

  // ── 2. « loyer 10 000 avec l'épargne » ──
  await go('/entry?mode=keyboard', 3500);
  await (await phraseField(p)).fill("loyer 10 000 avec l'épargne"); await btn('Comprendre').click(); await p.waitForTimeout(1500);
  ok(!p.url().includes('/savings/move'), `jamais compris comme un versement (${p.url().replace(BASE, '')})`);
  await btn('Tout valider').click(); await p.waitForTimeout(1200);
  let t = await text();
  ok(t.includes("L'épargne ne paie pas directement une dépense. Cette dépense est enregistrée sur") && t.includes("Pour utiliser votre épargne, retirez d'abord l'argent vers un compte courant."), 'message dans la conversation : l’épargne ne paie pas directement une dépense');
  // À la fermeture de la feuille : le même message, avec le bouton de retrait.
  await btn('Fermer').last().click(); await p.waitForTimeout(800);
  ok((await btn("Retirer de mon épargne ou d'un objectif").count()) > 0, 'feuille fermée : bouton « Retirer de mon épargne ou d’un objectif »');
  await p.screenshot({ path: `${S}/circle-redirect.png` });
  ok((await savingsTotal()) === 60_000, 'épargne inchangée : 60 000 (la dépense est sur Espèces)');
  hm = await home();
  ok(hm.available === 90_000, `solde disponible : 100 000 − 10 000 = 90 000 (${hm.available})`);

  // ── 3. Le disponible passe sous zéro ──
  await go('/transaction/new?type=expense'); await fill('Montant', '95000'); await tap('Alimentation & boissons'); await btn('Enregistrer').last().click(); await p.waitForTimeout(900);
  t = await text();
  ok(t.includes('Votre argent disponible est passé sous zéro : il manque 5 000 FCFA.'), 'après la dépense : « il manque 5 000 FCFA »');
  hm = await home();
  ok(hm.t.includes("Plus d'argent disponible") && /Votre argent disponible est à [-−]\s?5 000 FCFA\./.test(hm.t), 'accueil : carte « Plus d’argent disponible »');
  await p.screenshot({ path: `${S}/circle-card.png` });
  await btn("Retirer de mon épargne ou d'un objectif").first().click(); await p.waitForTimeout(1500);
  t = await text();
  ok(p.url().includes('/withdraw') && t.includes("D'où voulez-vous retirer 5 000 FCFA ?") && t.includes('Mon épargne'), `« D’où voulez-vous retirer 5 000 FCFA ? » (${p.url().replace(BASE, '')})`);
  await p.getByText('Mon épargne', { exact: true }).first().click(); await p.waitForTimeout(1500);
  ok(p.url().includes('/savings/move') && (await p.getByRole('textbox', { name: 'Montant', exact: true }).first().inputValue()).replace(/\D/g, '') === '5000', 'retrait prérempli : 5 000');
  await btn('Enregistrer le retrait').click(); await p.waitForTimeout(1500);
  hm = await home();
  ok(!hm.t.includes("Plus d'argent disponible") && hm.available === 0, `retrait fait : la carte disparaît (solde disponible ${hm.available})`);
  ok((await savingsTotal()) === 55_000, 'épargne : 55 000 (retrait visible)');

  // ── 4. Personne qui n'a jamais renseigné son argent ──
  const k = await page();
  await k.signUp('Kofi');
  await k.go('/transaction/new?type=expense'); await k.fill('Montant', '5000'); await k.tap('Alimentation & boissons'); await k.btn('Enregistrer').last().click(); await k.p.waitForTimeout(900);
  ok(!(await k.text()).includes('il manque'), 'jamais renseigné son argent : aucun message « il manque »');
  await k.go('/', 3500);
  ok(!(await k.text()).includes("Plus d'argent disponible"), 'jamais renseigné son argent : aucune carte sur l’accueil');

  const errs = [...h.errs, ...k.errs];
  ok(errs.length === 0, 'aucune erreur JS ' + errs.join(' | '));
  console.log(fails ? `ÉPARGNE (CERCLE) : ${fails} ÉCHEC(S)` : 'ÉPARGNE (CERCLE) : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message);
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
