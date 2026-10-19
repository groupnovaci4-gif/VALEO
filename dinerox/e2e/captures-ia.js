/*
 * Captures « L'IA qui comprend toute l'application » pour le fondateur (docs/ia-comprend-tout.md) :
 * web, thème clair, mode démonstration, 412×915. Sortie : docs/captures-ia/<nn-nom>.png.
 *   node e2e/captures-ia.js
 *   ONLY=09 node e2e/captures-ia.js   (seules ces captures sont réécrites)
 * La démonstration n'a pas de dette envers « Koffi » : elle est ajoutée par le formulaire
 * Dettes (100 000) avant la question, comme le ferait la personne.
 * Pas dans run-all.sh : ce n'est pas un test, c'est une galerie.
 */
const fs = require('fs');
const path = require('path');
const { BASE, launch, phraseField } = require('./env.js');

const OUT = path.join(__dirname, '..', 'docs', 'captures-ia');
fs.mkdirSync(OUT, { recursive: true });
// ONLY=09 : seules ces captures sont réécrites (le parcours complet tourne, les autres images restent).
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((x) => x.trim())) : null;
const wanted = (name) => !ONLY || ONLY.has(name.slice(0, 2));
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png') && wanted(f)) fs.unlinkSync(path.join(OUT, f));
const log = [];

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, locale: 'fr-FR', colorScheme: 'light', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const go = async (route, w = 3000) => { await p.goto(BASE + route, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const shot = async (name) => { if (!wanted(name)) return; await p.screenshot({ path: path.join(OUT, `${name}.png`) }); log.push(name); };
  const closeCelebration = async () => { for (const l of ['Continuer']) { const c = btn(l).filter({ visible: true }); if (await c.count()) { await c.first().click().catch(() => {}); await p.waitForTimeout(400); } } };
  /** Une conversation neuve, une phrase, la capture. */
  const ask = async (name, phrase, after) => {
    await go('/assistant'); await closeCelebration();
    await p.getByPlaceholder('Écrivez comme vous parlez…').fill(phrase);
    await p.getByRole('button', { name: 'Confirmer', exact: true }).last().click(); await p.waitForTimeout(1800);
    if (after) await after();
    await shot(name);
  };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(6000); await closeCelebration();

  // Dette envers Koffi (formulaire Dettes), pour la question « Je dois combien à Koffi ? ».
  await go('/debts/edit'); await closeCelebration();
  await p.getByLabel('Personne / institution').first().fill('Koffi');
  await p.getByLabel('Montant initial').first().fill('100000');
  await p.getByText('Hors de mes comptes', { exact: true }).first().click(); await p.waitForTimeout(300);
  await btn('Enregistrer').last().click(); await p.waitForTimeout(1500);

  await ask('01-loyer-30000', "J'ai dépensé 30 000 en loyer");
  // La même phrase dans la feuille de saisie (bouton central « Saisir ») : la carte de la saisie.
  await go('/'); await closeCelebration();
  await go('/entry?mode=keyboard', 3500);
  await (await phraseField(p)).fill("J'ai dépensé 30 000 en loyer"); await btn('Comprendre').click(); await p.waitForTimeout(1500);
  await shot('02-loyer-30000-feuille-de-saisie');
  await ask('03-quand-je-paie-ma-tontine', 'Quand est-ce que je paie ma tontine ?');
  await ask('04-a-quand-mon-tour', 'À quand mon tour ?');
  await ask('05-je-dois-combien-a-koffi', 'Je dois combien à Koffi ?');
  await ask('06-combien-j-envoie-a-maman', "Combien j'envoie à Maman par mois ?");
  await ask('07-mettre-en-epargne-question', "Retire 100 000 de l'argent disponible pour le mettre en épargne");
  await btn('Cash').last().click(); await p.waitForTimeout(1000);
  await shot('08-mettre-en-epargne-carte');
  await btn('Valider').last().click(); await p.waitForTimeout(900);
  await shot('09-mettre-en-epargne-apres-valider');
  await ask('10-phrase-ambigue-question', 'Où en est mon objectif ?');
  await ask('11-demande-interdite', 'Supprime ma dernière dépense');
  await ask('12-argent-reel-interdit', 'Envoie 10 000 à Koffi par Orange Money pour moi');

  console.log(log.join('\n'));
  console.log(`${log.length} captures → ${OUT}`);
  await b.close();
})().catch((e) => { console.log('ARRÊT ' + e.message); process.exit(1); });
