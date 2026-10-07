/* Coach — phase 6 : conseil du jour et boutons « Écouter » (texte lu = texte affiché, aucune action). */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const SPY = () => {
  window.__spoken = [];
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend({}), 30); };
    window.speechSynthesis.cancel = () => undefined;
  }
};
const norm = (s) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.addInitScript(SPY);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const nested = []; p.on('console', (m) => { if (/cannot (contain|be) a? ?(nested|descendant)/i.test(m.text())) nested.push(m.text().slice(0, 120)); });
  const go = async (path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const allSpoken = async () => (await p.evaluate(() => window.__spoken.slice())).map(norm);
  const lastSpoken = async () => (await allSpoken()).slice(-1)[0] || '';
  /** Vide la trace, clique, puis attend la lecture (la voix de l'appareil peut attendre 1,5 s la liste des voix). */
  const clickAndHear = async (loc) => {
    await p.evaluate(() => { window.__spoken = []; });
    await loc.click();
    await p.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 5000 }).catch(() => undefined);
    await p.waitForTimeout(2500);
  };
  const closeCelebration = async () => { const c = p.getByRole('button', { name: 'Continuer' }); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  /** Clique le bouton « Écouter » de la carte qui contient `marker` ; renvoie [texte de la carte, texte lu]. */
  const listenNear = async (marker, nth = 0) => {
    const found = await p.evaluate(({ m, nth }) => {
      const hits = [];
      document.querySelectorAll('[data-e2e-listen]').forEach((e) => e.removeAttribute('data-e2e-listen'));
      [...document.querySelectorAll('[aria-label="Écouter"]')].forEach((e) => {
        let el = e.parentElement;
        for (let k = 0; k < 6 && el; k++, el = el.parentElement) if ((el.innerText || '').includes(m)) {
          let box = el;
          for (let j = 0; j < 3 && box.parentElement && (box.innerText || '').trim().length < m.length + 40; j++) box = box.parentElement;
          hits.push({ e, text: box.innerText }); return;
        }
      });
      const h = hits[nth];
      if (!h) return null;
      h.e.setAttribute('data-e2e-listen', '1');
      return { text: h.text };
    }, { m: marker, nth });
    if (!found) return [null, ''];
    await clickAndHear(p.locator('[data-e2e-listen="1"]'));
    return [norm(found.text), await lastSpoken()];
  };
  const readsOne = (card, spoken) => { const r = !!card && spoken.length > 15 && card.includes(spoken.split(/[.:] /)[0].slice(0, 40)); if (!r && process.env.DBG) console.log('  carte:', JSON.stringify((card || '').slice(0, 300)), '\n  lu:', JSON.stringify(spoken.slice(0, 200))); return r; };
  /** La lecture demandée est la DERNIÈRE de la file (après une éventuelle voix proactive). */
  const reads = (card, spoken) => readsOne(card, spoken);

  // Résumé du coach (lu avant de le fermer avec « J'ai compris »).
  let [card, spoken] = await listenNear('Votre coach');
  ok(reads(card, spoken), `résumé du coach lu (« ${spoken.slice(0, 70)}… »)`);
  const dismiss = p.getByRole('button', { name: "J'ai compris" }); if (await dismiss.count()) await dismiss.first().click();

  // Conseil du jour : présent, lu tel qu'affiché, sans proposition d'IA sans compte en ligne ni consentement.
  [card, spoken] = await listenNear('Conseil du jour');
  ok(reads(card, spoken), `conseil du jour lu tel qu'affiché (« ${spoken.slice(0, 80)}… »)`);
  ok(!(await p.getByText("M'expliquer ce conseil (IA)").count()), 'sans compte en ligne ni consentement : aucun appel à l’IA proposé');
  // Recommandation de l'accueil (carte cliquable) : « Écouter » ne navigue pas.
  const url = p.url();
  [card, spoken] = await listenNear('Estimation', 1);
  if (!card) [card, spoken] = await listenNear('Selon vos opérations');
  ok(p.url() === url, 'appui sur « Écouter » dans une carte cliquable : aucune navigation, aucune action');
  ok(reads(card, spoken), `recommandation lue (« ${spoken.slice(0, 70)}… »)`);

  // Notifications (constats).
  await go('/notifications'); await closeCelebration();
  const firstCard = await p.evaluate(() => { const e = document.querySelector('[aria-label="Écouter"]'); return e ? e.parentElement.parentElement.innerText : ''; });
  await clickAndHear(p.getByRole('button', { name: 'Écouter', exact: true }).first());
  spoken = await lastSpoken();
  ok(reads(norm(firstCard), spoken), `constat lu tel qu'affiché (« ${spoken.slice(0, 70)}… »)`);

  // La carte elle-même reste cliquable (le bouton « Écouter » est à côté, pas dedans).
  const before = p.url();
  await p.getByText(spoken.slice(0, 20), { exact: false }).first().click(); await p.waitForTimeout(1200);
  ok(p.url() !== before, `appui sur la carte du constat : l'écran lié s'ouvre (${p.url().replace(BASE, '')})`);

  // Assistant : réponse lue.
  await go('/assistant'); await closeCelebration();
  await p.getByPlaceholder('Écrivez comme vous parlez…').fill('Fais-moi un résumé du mois');
  const nBefore = await p.getByRole('button', { name: 'Écouter', exact: true }).count();
  await p.getByRole('button', { name: 'Confirmer', exact: true }).last().click(); await p.waitForTimeout(1500);
  ok((await p.getByRole('button', { name: 'Écouter', exact: true }).count()) > nBefore, 'la nouvelle réponse de l’assistant a son bouton « Écouter »');
  const lastBtn = p.getByRole('button', { name: 'Écouter', exact: true }).last();
  card = norm(await lastBtn.evaluate((e) => e.parentElement.parentElement.innerText));
  await clickAndHear(lastBtn); spoken = await lastSpoken();
  ok(reads(card, spoken) && !spoken.startsWith('Bonjour'), `réponse de l'assistant lue (« ${spoken.slice(0, 70)}… »)`);

  // Plan d'objectif.
  await go('/goals'); await closeCelebration();
  await p.locator('[role=button]').filter({ hasText: /%/ }).first().click(); await p.waitForTimeout(1500);
  [card, spoken] = await listenNear('Montant restant');
  ok(spoken.startsWith('Montant restant'), `plan d'objectif lu (« ${spoken.slice(0, 70)}… »)`);

  // Budget automatique (proposition affichée).
  await go('/budget/auto'); await closeCelebration();
  const lb = p.getByRole('button', { name: 'Écouter', exact: true });
  if (await lb.count()) await clickAndHear(lb.first());
  spoken = await lastSpoken();
  ok(spoken.includes('Total'), `budget automatique : proposition lue (« ${spoken.slice(0, 70)}… »)`);
  await p.screenshot({ path: `${S}/advice.png` });
  ok(nested.length === 0, 'aucun bouton imbriqué dans un bouton (HTML valide) ' + nested.slice(0, 1).join(''));
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'COACH CONSEILS : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
