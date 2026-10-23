/*
 * Audit du 23/10 (partie 1, design-pro) — preuves « avant | après » des écrans touchés.
 * Usage : node e2e/captures-audit-1023.js <url de la version d'avant> [url de la version d'après]
 * (export web d'avant les correctifs servi à part ; les émulateurs ne servent pas : démonstration locale).
 * Sortie : docs/audits/preuves-2026-10-23/<écran>.png (avant à gauche, après à droite).
 */
const fs = require('fs');
const path = require('path');
const { launch, dayOfMonth } = require('./env.js');
const BEFORE = process.argv[2];
const AFTER = process.argv[3] || 'http://localhost:8098';
const OUT = path.join(__dirname, '..', 'docs', 'audits', 'preuves-2026-10-23');
let b;

/** Démonstration, écrans touchés ; `dark` : thème sombre choisi dans les Réglages. */
async function shoot(base, tag, dark) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const go = async (u, w = 3000) => { await p.goto(base + u, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = p.getByRole('button', { name: 'Continuer', exact: true }); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const shots = {};
  const shot = async (name, full = false) => { const f = path.join(OUT, '.tmp', `${name}-${tag}.png`); await p.waitForTimeout(500); await p.screenshot({ path: f, fullPage: full }); shots[name] = f; };
  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  if (dark) {
    await go('/settings'); await p.getByText('Sombre', { exact: true }).first().click(); await p.waitForTimeout(1500);
    await go('/'); await closeCelebration();
    await p.screenshot({ path: path.join(OUT, '.tmp', `cloche-full-${tag}.png`), clip: { x: 230, y: 0, width: 160, height: 64 } });
    shots.cloche = path.join(OUT, '.tmp', `cloche-full-${tag}.png`);
    await ctx.close();
    return shots;
  }
  // Accueil : tuiles + « Saisir une opération » (D1), « Mis de côté » (R10).
  await p.getByRole('button', { name: /^Parler, / }).first().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -260));
  await shot('accueil-tuiles');
  // Objectifs : « Ajouter » une réserve (R1), « Nouveau » 48 dp (R10), date du moment fort (R7).
  await go('/goals'); await closeCelebration();
  await shot('objectifs', true);
  // Sous les vignettes : aide de la réserve, puis « Ajouter » (après) — centrés à l'écran.
  await p.getByText('L’argent de la réserve famille n’est plus compté comme disponible.').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot('objectifs-reserve');
  // Budget : onglets 48 dp (R10).
  await go('/budget'); await closeCelebration();
  await shot('budget');
  // Notifications : provenance du conseil et de « Votre analyse » (R4, R5).
  await go('/notifications'); await closeCelebration();
  await shot('notifications', true);
  await ctx.close();
  return shots;
}

async function sideBySide(left, right, out) {
  const page = await b.newPage({ viewport: { width: 1000, height: 400 } });
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:20px;padding:20px;align-items:flex-start;font:600 22px sans-serif">
    <figure style="margin:0"><figcaption style="color:#fff;margin-bottom:8px">Avant (design-pro 720c3d9)</figcaption><img src="${uri(left)}" style="width:480px"></figure>
    <figure style="margin:0"><figcaption style="color:#fff;margin-bottom:8px">Après (correctifs de l'audit)</figcaption><img src="${uri(right)}" style="width:480px"></figure></body>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

(async () => {
  if (!BEFORE) throw new Error('URL de la version d’avant manquante');
  fs.mkdirSync(path.join(OUT, '.tmp'), { recursive: true });
  b = await launch({ date: dayOfMonth(1) });
  for (const dark of [false, true]) {
    const before = await shoot(BEFORE, 'avant', dark);
    const after = await shoot(AFTER, 'apres', dark);
    for (const k of Object.keys(after)) {
      await sideBySide(before[k], after[k], path.join(OUT, `${k}.png`));
      console.log('✓', `${k}.png`);
    }
  }
  fs.rmSync(path.join(OUT, '.tmp'), { recursive: true, force: true });
  await b.close();
  process.exit(0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message.slice(0, 400));
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
