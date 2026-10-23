/*
 * Écran Notifications en direction B (demande du fondateur, 23/10) — preuve « avant | après », clair et sombre.
 * Usage : node e2e/captures-notifications.js <url de la version d'avant> [url de la version d'après]
 * (démonstration locale ; export d'avant servi à part).
 * Sortie : docs/audits/preuves-2026-10-23/notifications-clair.png et notifications-sombre.png.
 */
const fs = require('fs');
const path = require('path');
const { launch, dayOfMonth } = require('./env.js');
const BEFORE = process.argv[2];
const AFTER = process.argv[3] || 'http://localhost:8098';
const OUT = path.join(__dirname, '..', 'docs', 'audits', 'preuves-2026-10-23');
let b;

async function shoot(base, tag, dark) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const closeCelebration = async () => { const c = p.getByRole('button', { name: 'Continuer', exact: true }); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const go = async (u) => { await p.goto(base + u, { waitUntil: 'load' }); await p.waitForTimeout(3000); await closeCelebration(); };
  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  if (dark) { await go('/settings'); await p.getByText('Sombre', { exact: true }).first().click(); await p.waitForTimeout(1500); }
  await go('/notifications');
  const f = path.join(OUT, '.tmp', `notifications-${dark ? 'sombre' : 'clair'}-${tag}.png`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: f, fullPage: true });
  await ctx.close();
  return f;
}

async function sideBySide(left, right, out) {
  const page = await b.newPage({ viewport: { width: 1000, height: 400 } });
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:20px;padding:20px;align-items:flex-start;font:600 22px sans-serif">
    <figure style="margin:0"><figcaption style="color:#fff;margin-bottom:8px">Avant (design-pro 1d324fd)</figcaption><img src="${uri(left)}" style="width:480px"></figure>
    <figure style="margin:0"><figcaption style="color:#fff;margin-bottom:8px">Après (direction B)</figcaption><img src="${uri(right)}" style="width:480px"></figure></body>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

(async () => {
  if (!BEFORE) throw new Error('URL de la version d’avant manquante');
  fs.mkdirSync(path.join(OUT, '.tmp'), { recursive: true });
  b = await launch({ date: dayOfMonth(1) });
  for (const dark of [false, true]) {
    const name = `notifications-${dark ? 'sombre' : 'clair'}.png`;
    await sideBySide(await shoot(BEFORE, 'avant', dark), await shoot(AFTER, 'apres', dark), path.join(OUT, name));
    console.log('✓', name);
  }
  fs.rmSync(path.join(OUT, '.tmp'), { recursive: true, force: true });
  await b.close();
  process.exit(0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message.slice(0, 400));
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
