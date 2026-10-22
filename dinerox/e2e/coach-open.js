/* Coach — phase 2 : résumé unique à l'ouverture, aucune répétition, déduplication entre appareils. */
const { BASE, launch, declareMoney } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  const b = await launch();
  const errs = [];
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); return { ctx, p }; };
  const go = async (p, path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  // Points du résumé d'ouverture (null si aucun). Refonte finale E1 à E4 : ils sont dans « À lire »,
  // un message par point (`toread-summary`) : étiquette, texte, « Écouter » (bouton, pas un point), ×.
  const LISTEN = ['Écouter', 'Arrêter la lecture'];
  const card = async (p) => {
    const items = await p.locator('[data-testid="toread-summary"]').filter({ visible: true }).allInnerTexts();
    if (!items.length) return null;
    // Par point : on retire l'étiquette (1re ligne) et « Écouter ».
    return items.map((s) => s.split('\n').map((l) => l.trim()).filter((l) => /[A-Za-zÀ-ÿ]/.test(l) && !LISTEN.includes(l)).slice(1).join(' '));
  };
  // « J'ai compris » de l'ancienne carte = le × (« Marquer comme lu ») de chaque point.
  const readAll = async (p) => {
    for (let k = 0; k < 5; k++) {
      const x = p.locator('[data-testid="toread-summary"]').filter({ visible: true }).first().getByRole('button', { name: 'Marquer comme lu', exact: true });
      if (!(await x.count())) return;
      await x.click({ timeout: 10000 }); await p.waitForTimeout(400);
    }
  };

  // ── 1. Démonstration (local) : résumé à l'ouverture ──
  const d = await mk();
  await go(d.p, '/'); await d.p.getByText('Tester sans données (démonstration)').click();
  // Étape 4 : l'encadré du mode démo est devenu une ligne discrète (pastille « Démo » + « Créer mon profil »).
  await d.p.getByText('Créer mon profil').first().waitFor({ timeout: 8000 }); await d.p.waitForTimeout(4500);
  // Une éventuelle célébration de récompense (phase 4) s'affiche d'abord : on la ferme.
  const closeCelebration = async (p) => { const c = p.getByRole('button', { name: 'Continuer' }); if (await c.count()) { await c.first().click({ timeout: 5000 }); await p.waitForTimeout(400); } };
  await closeCelebration(d.p);
  const first = await card(d.p);
  // Refonte finale E3 : un point du résumé qui est le MÊME fait qu'une alerte déjà listée (même enveloppe, même
  // identifiant) n'est pas répété ; dans la démo, les 3 points (dépassements Maison / Alimentation…) sont ces alertes.
  const toReadCount = Number(((await d.p.locator('body').innerText()).match(/À lire · (\d+)/) || [])[1] || 0);
  ok((first === null || first.length <= 3) && toReadCount > 0 && (await d.p.getByText('Alerte budget', { exact: false }).count()) > 0, `ouverture : résumé dans « À lire » (${first ? first.length : 0} point(s) propre(s) ≤ 3, ${toReadCount} message(s), alertes budget présentes) — ${JSON.stringify(first)}`);
  // Décision du fondateur (22/10) : la cloche affiche le MÊME nombre que « À lire · N ».
  const bell = await d.p.locator('[role=button][aria-label^="Notifications, À lire · "]').first().getAttribute('aria-label').catch(() => null);
  ok(bell === `Notifications, À lire · ${toReadCount}`, `cloche = « À lire · ${toReadCount} » (${bell})`);
  ok((await d.p.locator('body').innerText()).includes('Selon les opérations enregistrées dans'),'mention : selon les opérations enregistrées (pas de suivi bancaire en temps réel)');
  await d.p.screenshot({ path: `${S}/coach-open-1.png` });
  await readAll(d.p);
  ok((await card(d.p)) === null, '× (marquer comme lu) : les points du résumé disparaissent');
  const seen = new Set(first ?? []);
  let repeated = 0;
  for (let k = 0; k < 2; k++) {
    await d.p.close(); d.p = await d.ctx.newPage(); d.p.on('pageerror', (e) => errs.push(e.message));
    await go(d.p, '/', 6500);
    await closeCelebration(d.p);
    const again = (await card(d.p)) ?? [];
    for (const l of again) { if (seen.has(l)) repeated++; seen.add(l); }
  }
  ok(repeated === 0, `réouvertures : aucun point déjà présenté n'est répété (${repeated} répétition)`);

  // ── 2. Deux appareils, même compte : pas de répétition entre appareils ──
  const email = `open${Date.now()}@ex.com`;
  const a = await mk();
  await go(a.p, '/'); await a.p.getByText('Créer mon compte').first().click(); await a.p.waitForTimeout(500);
  await a.p.getByLabel('Nom', { exact: true }).fill('Open'); await a.p.getByLabel('Prénom').fill('Awa'); await a.p.getByLabel('Adresse e-mail').fill(email);
  await a.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await a.p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
  await a.p.getByRole('switch').first().click(); await a.p.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 });
  await a.p.getByText('Plus tard', { exact: true }).click(); await a.p.getByText('Bonjour Awa').first().waitFor({ timeout: 10000 }); await a.p.waitForTimeout(2500);
  await declareMoney(a.p); // v2 : argent présent avant de dépenser
  await go(a.p, '/budget'); await a.p.getByText('Alimentation & boissons', { exact: true }).first().click(); await a.p.waitForTimeout(1200);
  await a.p.getByText('Modifier', { exact: true }).first().click(); await a.p.waitForTimeout(1200);
  await a.p.getByLabel('Budget mensuel').first().fill('100000'); await a.p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await a.p.waitForTimeout(2500);
  // Appareil B : dépense qui dépasse le budget → alerte immédiate sur B.
  const bdev = await mk();
  await go(bdev.p, '/sign-in'); await bdev.p.getByLabel('Adresse e-mail').fill(email); await bdev.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await bdev.p.getByRole('button', { name: 'Se connecter' }).click(); await bdev.p.getByText('Bonjour Awa').first().waitFor({ timeout: 12000 }); await bdev.p.waitForTimeout(3500);
  await go(bdev.p, '/transaction/new?type=expense'); await bdev.p.getByLabel('Montant').first().fill('120000'); await bdev.p.getByText('Alimentation & boissons', { exact: true }).first().click();
  await bdev.p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click();
  let toast = '';
  for (let i = 0; i < 20 && !toast; i++) { toast = (await bdev.p.locator('[role=alert][aria-live]').allInnerTexts()).join(' '); await bdev.p.waitForTimeout(150); }
  ok(toast.includes('dépassé votre budget Alimentation & boissons'), `appareil B : alerte immédiate (« ${toast.trim()} »)`);
  await bdev.p.waitForTimeout(3000);
  // Appareil A rouvert : la synchro apporte la dépense, mais l'alerte déjà donnée sur B n'est pas répétée.
  await a.p.close(); a.p = await a.ctx.newPage(); a.p.on('pageerror', (e) => errs.push(e.message));
  await go(a.p, '/', 8000);
  const t = (await a.p.locator('body').innerText()).replace(/[  ]/g, ' ');
  ok(t.includes('120 000'), 'appareil A : la dépense de B est synchronisée');
  const cA = (await card(a.p)) ?? [];
  ok(!cA.some((l) => l.includes('dépassé votre budget Alimentation & boissons')), `appareil A : l'alerte déjà donnée sur B n'est pas répétée (${JSON.stringify(cA)})`);
  await a.p.screenshot({ path: `${S}/coach-open-2.png` });
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'COACH OUVERTURE : TOUT EST OK');
  await b.close();
// process.exit : le navigateur resté ouvert empêcherait le processus de finir (suite e2e figée).
})().catch((e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exit(1); });
