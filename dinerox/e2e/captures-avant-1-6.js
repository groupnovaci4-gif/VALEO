/*
 * Captures « avant la 1.6 » pour le fondateur : web, thème clair, mode démonstration.
 * Sortie : docs/captures-avant-1-6/<nn-nom>.png. Lancement (émulateurs + export servis) :
 *   node e2e/captures-avant-1-6.js
 *  - Accueil, Budget, Objectifs, Plus en 412×915, du haut jusqu'en bas (une image par écran de
 *    défilement), et Plus en 360×800 ;
 *  - un pavé au moment du toucher (vert) ;
 *  - inscription : mot de passe masqué, puis affiché ;
 *  - la carte des revenus irréguliers (§11.2).
 *   SCREENS=accueil,budget,objectifs node e2e/captures-avant-1-6.js   (ces écrans seulement)
 * Pas dans run-all.sh : ce n'est pas un test, c'est une galerie.
 */
const fs = require('fs');
const path = require('path');
const { BASE, launch } = require('./env.js');

const OUT = path.join(__dirname, '..', 'docs', 'captures-avant-1-6');
fs.mkdirSync(OUT, { recursive: true });
const log = [];

/** Le conteneur qui défile (le plus grand élément dont le contenu dépasse). */
async function scroller(p) {
  return p.evaluateHandle(() => {
    const all = [...document.querySelectorAll('div')].filter((e) => {
      const s = getComputedStyle(e);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 4 && e.getClientRects().length && e.checkVisibility();
    });
    all.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    return all[0] ?? null;
  });
}

async function run(size, screens, extras) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: size, locale: 'fr-FR', colorScheme: 'light', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const go = async (route, w = 3000) => { await p.goto(BASE + route, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const shot = async (name) => { await p.screenshot({ path: path.join(OUT, `${name}.png`) }); log.push(name); };
  const closeCelebration = async () => {
    for (const label of ['Continuer', 'Fermer']) {
      const c = p.getByRole('button', { name: label, exact: true }).filter({ visible: true });
      if (await c.count()) { await c.first().click().catch(() => {}); await p.waitForTimeout(500); }
    }
  };
  /** Un écran, du haut jusqu'en bas : une image par écran de défilement. */
  const pages = async (route, name) => {
    await go(route, 3500); await closeCelebration();
    const el = await scroller(p);
    if (!(await el.evaluate((e) => !!e))) { await shot(`${name}-1`); return; }
    const { total, view } = await el.evaluate((e) => ({ total: e.scrollHeight, view: e.clientHeight }));
    const stepPx = Math.floor(view * 0.85);
    let i = 1;
    for (let top = 0; ; top += stepPx) {
      await el.evaluate((e, y) => { e.scrollTop = y; }, Math.min(top, total - view));
      await p.waitForTimeout(500);
      await shot(`${name}-${i++}`);
      if (top + view >= total) break;
    }
  };

  await go('/');
  if (extras) {
    // ── Inscription : mot de passe masqué, puis affiché (avant la démonstration). ──
    await p.getByText('Créer mon compte', { exact: false }).first().click(); await p.waitForTimeout(1500);
    await p.getByLabel('Mot de passe', { exact: true }).first().fill('Motdepasse123');
    await p.getByLabel('Confirmer le mot de passe').first().fill('Motdepasse123');
    await p.getByLabel('Mot de passe', { exact: true }).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
    await shot('20-inscription-mot-de-passe-masque');
    await p.getByRole('button', { name: 'Afficher le mot de passe' }).first().click(); await p.waitForTimeout(400);
    await shot('21-inscription-mot-de-passe-affiche');
    await go('/');
  }
  await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(6000); await closeCelebration();

  for (const [route, name] of screens) await pages(route, name);

  if (extras) {
    // ── Un pavé au moment du toucher : « Mes récompenses » (accueil), doigt posé. ──
    await go('/', 3500); await closeCelebration();
    const tile = p.getByRole('button', { name: /^Mes récompenses/ }).first();
    await tile.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    const box = await tile.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.waitForTimeout(450);
    await shot('22-pave-au-toucher-vert');
    await p.mouse.move(2, 2); await p.mouse.up(); await p.waitForTimeout(500);

    // ── Revenus irréguliers : profil « Irréguliers », puis un revenu reçu de 25 000. ──
    await go('/settings/financial', 3500);
    await p.getByText('Irréguliers', { exact: true }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Enregistrer', exact: true }).filter({ visible: true }).last().click(); await p.waitForTimeout(1500);
    await go('/transaction/new?type=income', 3000);
    await p.getByLabel('Montant').first().fill('25000');
    await p.getByText('Commerce', { exact: false }).filter({ visible: true }).first().click().catch(() => {});
    await p.getByRole('button', { name: 'Enregistrer', exact: true }).filter({ visible: true }).last().click(); await p.waitForTimeout(2500);
    // Pas de rechargement (l'offre est gardée en mémoire) : l'onglet Accueil.
    if (!(await p.getByText('Mettre de côté', { exact: true }).count())) await p.getByRole('tab', { name: /Accueil/ }).first().click().catch(() => {});
    await p.waitForTimeout(1500);
    const card = p.getByText(/Vous avez reçu .* de côté maintenant/).first();
    // Le toast « Enregistré ✓ » (5 s) passe d'abord ; puis la carte au milieu de l'écran.
    await p.waitForTimeout(6000);
    await card.evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(600);
    await shot('23-carte-revenus-irreguliers');
  }
  await b.close();
}

(async () => {
  // SCREENS=accueil,budget,objectifs : ne refait que ces écrans (412×915), les autres images restent.
  const only = process.env.SCREENS ? process.env.SCREENS.split(',') : null;
  if (only) {
    const all = { accueil: ['/', '01-accueil-412'], budget: ['/budget', '02-budget-412'], objectifs: ['/goals', '03-objectifs-412'], plus: ['/more', '04-plus-412'] };
    const screens = only.map((k) => all[k]);
    for (const f of fs.readdirSync(OUT)) if (screens.some(([, n]) => f.startsWith(`${n}-`))) fs.unlinkSync(path.join(OUT, f));
    await run({ width: 412, height: 915 }, screens, false);
    console.log(log.join('\n'));
    console.log(`${log.length} captures → ${OUT}`);
    return;
  }
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  await run({ width: 412, height: 915 }, [['/', '01-accueil-412'], ['/budget', '02-budget-412'], ['/goals', '03-objectifs-412'], ['/more', '04-plus-412']], true);
  await run({ width: 360, height: 800 }, [['/more', '05-plus-360']], false);
  console.log(log.join('\n'));
  console.log(`${log.length} captures → ${OUT}`);
})().catch((e) => { console.log('ARRÊT ' + e.message); process.exit(1); });
