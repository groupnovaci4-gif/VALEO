/* Lot A, phase 0 — barre à 5 emplacements, Historique (ex-« Opérations ») et assistant hors onglets. */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const dialogs = []; p.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // Barre du bas : Accueil | Budget | micro | Objectifs | Plus — plus d'onglet « Opérations ».
  const tabs = await p.evaluate(() => [...document.querySelectorAll('[role=tablist] [role=tab], [role=tablist] [role=button], [role=tablist] a')].map((e) => e.getAttribute('aria-label') || e.innerText).filter(Boolean));
  const bar = await p.evaluate(() => {
    const mic = document.querySelector('[aria-label="Dicter une opération"]');
    // Plus petit conteneur du micro qui contient aussi « Accueil » et « Plus » : la barre elle-même.
    let el = mic;
    while (el && !(/Accueil/.test(el.innerText) && /Plus/.test(el.innerText))) el = el.parentElement;
    // Mots uniquement (les icônes sont des glyphes de police, sans lettres).
    return el ? (el.innerText.match(/[A-Za-zÀ-ÿ]+/g) || []).join(' ') : '';
  });
  ok(!!(await btn('Dicter une opération').count()), 'micro central présent dans la barre');
  ok(/^Accueil Budget (Saisir )?Objectifs Plus$/.test(bar), `barre : Accueil · Budget · 🎤 · Objectifs · Plus (« ${bar.slice(0, 80)} »)`);
  void tabs;

  // Historique : même URL, titre renommé, filtres et total.
  await go('/transactions?from=home');
  let t = await text();
  ok(t.includes('Historique'), 'écran « Historique » à l’URL /transactions');
  ok(t.includes('Tous les mois') && t.includes('Toutes les catégories'), 'sélecteur de mois et filtre par catégorie');
  ok(/Période affichée : \d+ opération/.test(t) && t.includes('Entrées') && t.includes('Sorties'), 'total de la période filtrée');
  const before = (t.match(/Période affichée : (\d+)/) || [])[1];
  await p.getByPlaceholder('Rechercher').fill('zzz-introuvable'); await p.waitForTimeout(500);
  ok((await text()).includes('Aucune opération ne correspond'), 'recherche : état vide filtré');
  await btn('Effacer les filtres').click(); await p.waitForTimeout(400);
  ok(!(await text()).includes('Aucune opération ne correspond'), '« Effacer les filtres » réaffiche tout');
  // Filtre par mois : le total change ou reste cohérent (sous-ensemble).
  const monthChip = p.getByRole('button').filter({ hasText: /^(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}$/ }).first();
  if (await monthChip.count()) { await monthChip.click(); await p.waitForTimeout(400); }
  const after = ((await text()).match(/Période affichée : (\d+)/) || [])[1];
  ok(Number(after) <= Number(before) && Number(after) > 0, `filtre par mois : ${after} opération(s) sur ${before}`);
  // Toucher une ligne : modification (écran de l'opération).
  const firstRow = p.locator('[aria-label*=" · "]').filter({ hasText: /FCFA/ }).first();
  const rowLabel = await firstRow.getAttribute('aria-label');
  await firstRow.click(); await p.waitForTimeout(1200);
  ok(/\/transaction\//.test(p.url()), 'toucher une opération ouvre sa fiche (modification)');
  await p.goBack(); await p.waitForTimeout(1200);
  ok(p.url().includes('/transactions'), 'retour : on revient à l’Historique');
  // Appui long : suppression AVEC confirmation.
  const row = p.locator(`[aria-label="${rowLabel}"]`).first();
  const box = await row.boundingBox();
  const countBefore = Number(((await text()).match(/Période affichée : (\d+)/) || [])[1]);
  await p.mouse.move(box.x + 20, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(900); await p.mouse.up(); await p.waitForTimeout(800);
  ok(dialogs.some((d) => d.includes('Supprimer cette opération')), 'appui long : demande de confirmation');
  const countAfter = Number(((await text()).match(/Période affichée : (\d+)/) || [])[1]);
  ok(countAfter === countBefore - 1, `opération supprimée après confirmation (${countBefore} → ${countAfter})`);
  await p.screenshot({ path: `${S}/lot-a-history.png` });

  // Assistant : écran à part, URL /assistant conservée, bouton retour.
  await go('/assistant');
  ok((await text()).includes('Parler à') && (await btn('Retour').count()) > 0, '/assistant s’ouvre (avec bouton retour)');

  // « Plus » : Historique en tête, assistant accessible.
  await go('/more');
  t = await text();
  const iHist = t.indexOf('Historique des opérations');
  ok(iHist >= 0 && iHist < t.indexOf('Comptes'), '« Historique des opérations » en tête de « Plus »');
  ok(t.includes('Questions et saisie en langage courant'), 'assistant accessible depuis « Plus »');
  await p.getByText('Historique des opérations').click(); await p.waitForTimeout(1200);
  ok(p.url().includes('/transactions'), '« Plus » → Historique');

  // Accueil : « Tout voir » des dernières opérations → Historique.
  await go('/'); await closeCelebration();
  // Le « Tout voir » de la section « Dernières opérations » (le plus proche du titre).
  const yTitle = (await p.getByText('Dernières opérations', { exact: true }).first().boundingBox()).y;
  const seeAlls = p.getByRole('button', { name: /Tout voir/ });
  let best = 0, bestGap = Infinity;
  for (let i = 0; i < (await seeAlls.count()); i++) { const g = Math.abs((await seeAlls.nth(i).boundingBox()).y - yTitle); if (g < bestGap) { bestGap = g; best = i; } }
  await seeAlls.nth(best).click(); await p.waitForTimeout(1200);
  ok(p.url().includes('/transactions'), 'accueil « Tout voir » → Historique');

  // Lien profond /mic : ouvre la saisie sur l'accueil.
  await go('/mic', 3500);
  ok(!p.url().endsWith('/mic'), 'lien /mic : redirigé (ce n’est pas un écran)');

  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'LOT A NAVIGATION : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
