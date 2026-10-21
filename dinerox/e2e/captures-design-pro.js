/*
 * Captures de l'audit visuel « design-pro » (docs/design-pro/audit.md) : web, 360×800,
 * thème clair PUIS sombre, mode démonstration (aucun compte), émulateurs pour l'inscription.
 * Sortie : docs/design-pro/captures/<theme>/<nn-nom>-<page>.png (3 écrans de défilement au plus).
 *   node e2e/captures-design-pro.js            (OUT=… pour un autre dossier, ex. captures « après »)
 * Pas dans run-all.sh : ce n'est pas un test, c'est une galerie.
 */
const fs = require('fs');
const path = require('path');
const { BASE, launch } = require('./env.js');

const OUT = process.env.OUT || path.join(__dirname, '..', 'docs', 'design-pro', 'captures');
const MAX_PAGES = 3;
const log = [];

const AUTH = [['/', '01-bienvenue'], ['/sign-in', '02-connexion'], ['/sign-up', '03-inscription']];
const SCREENS = [
  ['/', '10-accueil'],
  ['/transactions', '12-historique'],
  ['/budget', '13-budget'],
  ['/goals', '14-objectifs'],
  ['/savings', '15-epargne'],
  ['/accounts', '16-comptes'],
  ['/tontines', '17-tontines'],
  ['/debts', '18-dettes'],
  ['/more', '19-plus'],
  ['/settings', '20-reglages'],
  ['/family', '21-famille'],
  ['/assistant', '22-assistant'],
];

/** Le conteneur qui défile (le plus grand élément visible dont le contenu dépasse). */
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

async function run(theme) {
  const dir = path.join(OUT, theme);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.unlinkSync(path.join(dir, f));
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR', colorScheme: theme, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const go = async (route, w = 3500) => { await p.goto(BASE + route, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const shot = async (name) => { await p.screenshot({ path: path.join(dir, `${name}.png`) }); log.push(`${theme}/${name}`); };
  const closeCelebration = async () => {
    for (const label of ['Continuer', 'Fermer']) {
      const c = p.getByRole('button', { name: label, exact: true }).filter({ visible: true });
      if (await c.count()) { await c.first().click().catch(() => {}); await p.waitForTimeout(500); }
    }
  };
  /** Un écran, du haut vers le bas : une image par écran de défilement, MAX_PAGES au plus. */
  const pages = async (route, name) => {
    await go(route); await closeCelebration();
    const el = await scroller(p);
    if (!(await el.evaluate((e) => !!e))) { await shot(`${name}-1`); return; }
    const { total, view } = await el.evaluate((e) => ({ total: e.scrollHeight, view: e.clientHeight }));
    const stepPx = Math.floor(view * 0.85);
    let i = 1;
    for (let top = 0; i <= MAX_PAGES; top += stepPx) {
      await el.evaluate((e, y) => { e.scrollTop = y; }, Math.min(top, total - view));
      await p.waitForTimeout(500);
      await shot(`${name}-${i++}`);
      if (top + view >= total) break;
    }
  };

  // Avant connexion, l'application est toujours en thème clair (préférence du profil) : une seule série.
  if (theme === 'light') for (const [route, name] of AUTH) await pages(route, name);
  await go('/');
  await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(6000); await closeCelebration();
  // Le thème suit la préférence du profil, pas celle du navigateur : on la choisit dans les Réglages.
  if (theme === 'dark') {
    await go('/settings'); await p.getByText('Sombre', { exact: true }).first().click(); await p.waitForTimeout(1500);
  }
  // Saisie : la feuille s'ouvre depuis le bouton central de la barre d'onglets, puis « Saisir » au clavier.
  try {
    await go('/'); await closeCelebration();
    await p.getByRole('button', { name: /^Saisir/ }).last().click(); await p.waitForTimeout(1500);
    await shot('11-saisie-voix');
    const kb = p.getByText(/Autres façons de saisir|Écrire|Clavier/).filter({ visible: true });
    if (await kb.count()) { await kb.first().click(); await p.waitForTimeout(1200); await shot('11-saisie-clavier'); }
  } catch (e) { log.push(`${theme}/11-saisie : ÉCHEC ${e.message.split('\n')[0]}`); }
  for (const [route, name] of SCREENS) {
    try { await pages(route, name); } catch (e) { log.push(`${theme}/${name} : ÉCHEC ${e.message.split('\n')[0]}`); }
  }
  await b.close();
}

(async () => {
  for (const theme of ['light', 'dark']) await run(theme);
  console.log(log.join('\n'));
  console.log(`${log.length} captures → ${OUT}`);
})().catch((e) => { console.log('ARRÊT ' + e.message); process.exit(1); });
