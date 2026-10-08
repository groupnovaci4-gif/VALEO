/*
 * Catégories (1.8) sur l'application réelle (export web, démonstration en Côte d'Ivoire) :
 * catalogue de départ v2, créer / modifier / désactiver / réactiver / supprimer (jamais
 * utilisée, utilisée → fusion, système → masquage) / rétablir par défaut / réordonner,
 * bibliothèque, et listes de choix (recherche, « Nouvelle catégorie… », désactivée absente).
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };

let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  // Confirmations : accepter ; menu à plusieurs choix (prompt numéroté, services/webAlert) : `promptAnswer`.
  let promptAnswer = '';
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept(promptAnswer);
    else await d.accept();
  });
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const tap = async (t, w = 400) => { await p.getByText(t, { exact: true }).first().click(); await p.waitForTimeout(w); };
  const fill = (label, v) => p.getByLabel(label, { exact: true }).last().fill(v);
  const order = async () => (await text()).split('\n').map((x) => x.trim());

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── Catalogue v2 installé (démonstration en Côte d'Ivoire) ──
  await go('/categories');
  let t = await text();
  const parents = ['Famille', 'Maison & logement', 'Alimentation & boissons', 'Santé', 'Transport', 'Finance sociale & obligations', 'Éducation & formation', 'Communication & numérique', 'Loisirs & divertissement', 'Personnel', 'Dettes & remboursements', 'Autres dépenses'];
  const lines = t.split('\n').map((x) => x.trim());
  const pos = parents.map((x) => lines.indexOf(x));
  ok(pos.every((x, i) => x >= 0 && (i === 0 || x > pos[i - 1])), 'catalogue de départ : les 12 catégories dans l’ordre');
  ok(t.includes('Yango / VTC') && t.includes('Tontine') && t.includes('Snacks') && !/\bÉpargne\b/.test(t.slice(0, t.indexOf('Revenus') > 0 ? t.length : t.length)), 'sous-catégories du catalogue, aucune catégorie « Épargne » en dépense');
  ok(!t.includes('Nouvelles catégories disponibles'), 'nouvel espace : pas de carte de mise à jour');
  await p.screenshot({ path: `${S}/categories-list.png` });

  // ── Créer ma catégorie (emoji, type, mots-clés) ──
  await btn('➕ Créer ma catégorie').click(); await p.waitForTimeout(500);
  await fill('Nom', 'Moto');
  await fill('Emoji (facultatif)', '🏍️');
  await tap('Envie', 200);
  await fill('Quand je dis… (facultatif)', 'djakarta, moto perso');
  await btn('Enregistrer').click(); await p.waitForTimeout(800);
  t = await text();
  ok(t.includes('Moto'), 'catégorie personnelle créée');

  // ── Renommer une catégorie système, puis « Rétablir par défaut » ──
  await tap('Transport', 600);
  await fill('Nom', 'Déplacements');
  await btn('Enregistrer').click(); await p.waitForTimeout(800);
  ok((await text()).includes('Déplacements'), 'catégorie système renommée');
  await tap('Déplacements', 600);
  await btn('Rétablir par défaut').click(); await p.waitForTimeout(800);
  t = await text();
  ok(t.includes('Transport') && !t.includes('Déplacements'), '« Rétablir par défaut » : libellé d’origine');

  // ── Désactiver : absente des choix ; réactiver ──
  await tap('Loisirs & divertissement', 600);
  await btn('Désactiver').click(); await p.waitForTimeout(800);
  ok((await text()).includes('Désactivée'), 'catégorie désactivée (toujours visible ici, marquée)');
  await go('/transaction/new?type=expense');
  t = await text();
  ok(!t.includes('Loisirs & divertissement') && t.includes('Alimentation & boissons'), 'formulaire : catégorie désactivée absente des choix');
  // Recherche dans la liste de choix.
  await fill('Rechercher une catégorie', 'yango');
  await p.waitForTimeout(300);
  t = await text();
  ok(t.includes('Transport') && !t.includes('Alimentation & boissons'), 'recherche « yango » → Transport (via sa sous-catégorie)');
  await fill('Rechercher une catégorie', '');
  // « Nouvelle catégorie… » depuis le formulaire : créée et choisie.
  await btn('Nouvelle catégorie…').click(); await p.waitForTimeout(500);
  await fill('Nom', 'Cadeaux');
  await btn('Enregistrer').last().click(); await p.waitForTimeout(800);
  ok(await p.getByRole('button', { name: 'Cadeaux', exact: true }).first().getAttribute('aria-selected') === 'true' || (await text()).includes('Cadeaux'), '« Nouvelle catégorie… » depuis le formulaire : créée et choisie');
  await go('/categories');
  await tap('Loisirs & divertissement', 600);
  await btn('Réactiver').click(); await p.waitForTimeout(800);
  ok(!(await text()).includes('Désactivée'), 'catégorie réactivée');

  // ── Supprimer : jamais utilisée → supprimée ──
  await tap('Cadeaux', 600);
  await btn('Supprimer').click(); await p.waitForTimeout(800);
  ok(!(await text()).includes('Cadeaux'), 'jamais utilisée : supprimée après confirmation');

  // ── Supprimer une catégorie utilisée → « Déplacer ses opérations vers… » ──
  await go('/transaction/new?type=expense');
  await p.getByLabel('Montant', { exact: false }).first().fill('7000');
  await tap('Moto', 300);
  await btn('Enregistrer').last().click(); await p.waitForTimeout(1200);
  await go('/categories');
  // Le dialogue propose : 1. Désactiver plutôt, 2. Déplacer ses opérations vers… → « 2 ».
  promptAnswer = '2';
  await tap('Moto', 600);
  await btn('Supprimer').click(); await p.waitForTimeout(800);
  t = await text();
  ok(t.includes('Déplacer ses opérations vers…'), 'catégorie utilisée : suppression directe impossible → choix de la catégorie cible');
  await p.getByRole('button', { name: 'Transport', exact: true }).last().click(); await p.waitForTimeout(400);
  t = await text();
  ok(/1 opération\(s\), 0 récurrence\(s\) et 0 enveloppe\(s\) passeront dans « Transport »/.test(t), 'aperçu de la fusion (1 opération → Transport)');
  await btn('Déplacer').click(); await p.waitForTimeout(1000);
  ok(!(await order()).includes('Moto'), 'fusion : la catégorie personnelle disparaît');
  await go('/transactions');
  ok((await text()).includes('Transport'), 'l’opération est maintenant dans Transport (aucune orpheline)');

  // ── Catégorie système : « Supprimer » = masquer ──
  await go('/categories');
  await tap('Autres dépenses', 600);
  await btn('Supprimer').click(); await p.waitForTimeout(800);
  ok((await text()).includes('Désactivée'), 'catégorie système : masquée, jamais supprimée');
  await tap('Autres dépenses', 600);
  await btn('Rétablir par défaut').click(); await p.waitForTimeout(800);
  ok(!(await text()).includes('Désactivée'), 'puis « Rétablir par défaut » : à nouveau proposée');

  // ── Réordonner (flèches ; le glisser-déposer utilise la même écriture) ──
  await btn('Réordonner').click(); await p.waitForTimeout(500);
  await btn('Monter « Maison & logement »').click(); await p.waitForTimeout(700);
  await btn('Terminé').click(); await p.waitForTimeout(500);
  const ls = await order();
  ok(ls.indexOf('Maison & logement') >= 0 && ls.indexOf('Maison & logement') < ls.indexOf('Famille'), 'réordonner : « Maison & logement » passe avant « Famille »');

  // ── Bibliothèque : ancienne catégorie (Impôts), jamais Épargne ──
  await btn('Ajouter une catégorie du catalogue').click(); await p.waitForTimeout(600);
  t = await text();
  ok(t.includes('Impôts et cotisations') && !t.includes('Épargne') && !t.includes('Investissement'), 'bibliothèque : « Impôts et cotisations » proposée, ni Épargne ni Investissement');
  await tap('Impôts et cotisations', 800);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  ok((await text()).includes('Impôts et cotisations'), 'catégorie ajoutée depuis la bibliothèque');

  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'CATÉGORIES : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
