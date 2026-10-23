/*
 * Écran Notifications (« Voir les N », cloche) en direction B (demande du fondateur, 23/10).
 * Fond sable ; chaque message dans la carte de « À lire » (étiquette, pastille, texte, « Écouter » À CÔTÉ),
 * sans × (cet écran garde tout) ; titre jamais coupé, « Réglages des notifications » = bouton icône 48 dp.
 * Rien ne disparaît : avec NOTIF_REF=<url d'un export d'avant>, mêmes messages dans le même ordre.
 */
const { BASE, launch, dayOfMonth } = require('./env.js');
const S = process.argv[2] || '.';
const REF = process.env.NOTIF_REF;
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const LABELS = ['ALERTE BUDGET', 'CONSEIL DU JOUR', 'VOTRE COACH', 'VOTRE ANALYSE'];
const SOURCE = /Vos données|Déclaré|Estimation DINEROX/;

/** Textes des messages, dans l'ordre : le plus petit bloc qui contient UN « Écouter ». */
const messages = (p) => p.evaluate(() => {
  const noise = /^(Alerte budget|Conseil du jour|Votre coach|Votre analyse|Écouter|Vos données|Déclaré|Estimation DINEROX)$/i;
  return [...document.querySelectorAll('[aria-label="Écouter"]')].filter((b) => b.offsetParent).map((b) => {
    let e = b;
    while (e.parentElement && e.parentElement.querySelectorAll('[aria-label="Écouter"]').length === 1) e = e.parentElement;
    return e.innerText.split('\n').map((l) => l.trim()).filter((l) => /[A-Za-zÀ-ÿ0-9]/.test(l) && !noise.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  });
});

(async () => {
  const b = await launch({ date: dayOfMonth(1) });
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  const closeCelebration = async () => { const c = p.getByRole('button', { name: 'Continuer', exact: true }); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const go = async (base, u, w = 3000) => { await p.goto(base + u, { waitUntil: 'load' }); await p.waitForTimeout(w); await closeCelebration(); };
  /** Fond de l'écran : premier ancêtre opaque du titre. */
  const screenBg = () => p.getByRole('heading', { name: 'Notifications', exact: true }).first().evaluate((h) => {
    for (let e = h; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; }
    return '';
  });

  await go(BASE, '/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  await go(BASE, '/notifications');

  // 1. Fond sable (direction B).
  ok((await screenBg()) === 'rgb(244, 241, 234)', `fond sable (${await screenBg()})`);

  // 2. Titre entier ; réglages = bouton icône, même libellé lu, 48 dp.
  const title = p.getByRole('heading', { name: 'Notifications', exact: true }).first();
  const cut = await title.evaluate((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
  ok(!cut, 'titre « Notifications » entier (jamais coupé)');
  const set = p.getByRole('button', { name: 'Réglages des notifications', exact: true });
  const sb = (await set.count()) === 1 ? await set.boundingBox() : null;
  ok(!!sb && sb.width >= 48 && sb.height >= 48, `« Réglages des notifications » : un bouton, zone ${sb ? `${Math.round(sb.width)}×${Math.round(sb.height)}` : '?'} dp`);
  ok((await p.getByText('Réglages des notifications', { exact: true }).count()) === 0, '« Réglages des notifications » : bouton icône (libellé lu, pas écrit)');

  // 3. Chaque message = carte « À lire » : étiquette en couleur, pastille, texte, « Écouter » à côté ; pas de ×.
  const cards = p.locator('[data-testid^="notif-"]').filter({ visible: true });
  const n = await cards.count();
  const listens = await p.getByRole('button', { name: 'Écouter', exact: true }).filter({ visible: true }).count();
  ok(n > 0 && n === listens, `un message = une carte (${n} carte(s), ${listens} « Écouter »)`);
  let labelled = 0;
  let outside = 0;
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    // Première ligne écrite (la pastille d'icône est un glyphe sans lettre).
    const first = (await c.innerText()).split('\n').map((l) => l.trim()).find((l) => /[A-Za-zÀ-ÿ]/.test(l)) || '';
    if (LABELS.some((l) => first.toUpperCase().startsWith(l))) labelled++;
    if (await c.getByRole('button', { name: 'Écouter', exact: true }).evaluate((e) => !e.parentElement.closest('[role="button"],[role="link"]'))) outside++;
  }
  ok(labelled === n, `étiquette sur chaque carte (${labelled}/${n})`);
  ok(outside === n, `« Écouter » à côté de la zone touchable, jamais dedans (${outside}/${n})`);
  ok((await p.getByRole('button', { name: 'Marquer comme lu', exact: true }).count()) === 0, 'aucun × : cet écran garde tout');
  // Pastille d'icône : un carré de 36 dp à gauche du texte dans chaque carte.
  const pills = await cards.evaluateAll((cs) => cs.filter((c) => [...c.querySelectorAll('div')].some((d) => { const r = d.getBoundingClientRect(); return Math.round(r.width) === 36 && Math.round(r.height) === 36; })).length);
  ok(pills === n, `pastille d'icône sur chaque carte (${pills}/${n})`);

  // 4. Provenance : « Votre analyse » et le conseil du jour, quand ils sont là. Le même fait déjà dit par le
  // résumé d'ouverture du coach n'est pas répété (fusion de « À lire », E3) : c'est alors « Votre coach ».
  // `coach-advice.js` exige « Votre analyse » avec sa provenance.
  const analysis = p.locator('[data-testid="notif-analysis"]');
  ok(!(await analysis.count()) || SOURCE.test(await analysis.innerText()), `« Votre analyse » : provenance (${(await analysis.count()) ? 'présente' : 'dite par le résumé du coach'})`);
  const advice = p.locator('[data-testid="notif-advice"]');
  ok(!(await advice.count()) || SOURCE.test(await advice.innerText()), `conseil du jour : provenance (${(await advice.count()) ? 'présent' : 'absent de la démo'})`);

  // 5. Un constat garde son action d'ouverture (enveloppe, objectif…).
  const insight = p.locator('[data-testid="notif-insight"]').first();
  const shown = await messages(p);
  await p.screenshot({ path: `${S}/notifications-screen.png`, fullPage: true });
  if (await insight.count()) {
    const before = p.url();
    await insight.getByRole('button').first().click(); await p.waitForTimeout(1200);
    ok(p.url() !== before && /\/(envelopes|goals|debts|transaction)\//.test(p.url()), `constat : l'écran lié s'ouvre (${p.url().replace(BASE, '')})`);
  } else ok(false, 'constat présent dans la démo');

  // 6. Mêmes messages, même ordre qu'avant (export de référence).
  if (REF) {
    const r = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
    const q = await r.newPage();
    await q.goto(REF + '/', { waitUntil: 'load' }); await q.waitForTimeout(3000);
    await q.getByText('Tester sans données (démonstration)').click(); await q.waitForTimeout(5500);
    const c = q.getByRole('button', { name: 'Continuer', exact: true }); if (await c.count()) await c.first().click();
    await q.goto(REF + '/notifications', { waitUntil: 'load' }); await q.waitForTimeout(3000);
    const ref = await messages(q);
    await r.close();
    ok(JSON.stringify(ref) === JSON.stringify(shown), `mêmes messages, même ordre qu'avant (${ref.length} → ${shown.length})${JSON.stringify(ref) === JSON.stringify(shown) ? '' : `\n  avant : ${JSON.stringify(ref)}\n  après : ${JSON.stringify(shown)}`}`);
  }

  // 7. Sombre : fond sable sombre de la direction B.
  await go(BASE, '/settings'); await p.getByText('Sombre', { exact: true }).first().click(); await p.waitForTimeout(1200);
  await go(BASE, '/notifications');
  ok((await screenBg()) === 'rgb(19, 18, 15)', `sombre : fond de la direction B (${await screenBg()})`);

  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'NOTIFICATIONS : TOUT EST OK');
  await b.close();
  process.exit(process.exitCode);
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exit(1); });
