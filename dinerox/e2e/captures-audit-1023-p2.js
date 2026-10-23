/*
 * Audit du 23/10, partie 2 (connexion-telephone) — planches de preuve à partir des captures prises
 * par `phone-auth.js` et `suspended.js` (lancés avec le même dossier de captures).
 * Usage : node e2e/captures-audit-1023-p2.js <dossier des captures e2e>
 * Sortie : docs/audits/preuves-2026-10-23/telephone-1.png et telephone-2.png.
 */
const fs = require('fs');
const path = require('path');
const { launch } = require('./env.js');
const SHOTS = process.argv[2];
const OUT = path.join(__dirname, '..', 'docs', 'audits', 'preuves-2026-10-23');

const BOARDS = {
  'telephone-1.png': [
    ['phone-00-accueil-sans-numero.png', 'C5 · interrupteur désactivé (par défaut) : bienvenue d’origine'],
    ['phone-02-numero.png', 'C4 · inscription : code d’invitation, CGU, confidentialité'],
    ['phone-14-deja-inscrit.png', 'S9 · numéro déjà inscrit'],
  ],
  'telephone-2.png': [
    ['phone-08b-code-actuel.png', 'S1 · autre numéro : code secret actuel d’abord'],
    ['phone-13-securite.png', 'C2 · compte sans e-mail : « Changer mon code secret »'],
    ['suspended-phone.png', 'S8 · compte suspendu, connexion par numéro'],
  ],
};

let b;
(async () => {
  if (!SHOTS) throw new Error('dossier des captures manquant');
  b = await launch();
  for (const [name, items] of Object.entries(BOARDS)) {
    const page = await b.newPage({ viewport: { width: 1290, height: 900 } });
    const uri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(SHOTS, f)).toString('base64')}`;
    const figs = items.map(([f, caption]) => `<figure style="margin:0;width:400px"><figcaption style="color:#fff;margin-bottom:8px;min-height:52px">${caption}</figcaption><img src="${uri(f)}" style="width:400px;border-radius:8px"></figure>`).join('');
    await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:20px;padding:20px;align-items:flex-start;font:600 20px sans-serif">${figs}</body>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, name), fullPage: true });
    await page.close();
    console.log('✓', name);
  }
  await b.close();
  process.exit(0);
})().catch(async (e) => {
  console.log('ARRÊT', e.message.slice(0, 400));
  if (b) await b.close().catch(() => undefined);
  process.exit(1);
});
