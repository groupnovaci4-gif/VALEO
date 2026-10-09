/*
 * Lot A, phase 4 — rappel du soir : lien profond de la notification (saisie vocale), réglages
 * (rappel, heure, méthode par défaut, exemples, « Tester le micro »). La programmation des
 * notifications elle-même est native (testée unitairement : core/entry/reminder).
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const FAKE_SPEECH = () => {
  const ev = (type, extra) => Object.assign(new Event(type), extra);
  class FakeRecognition extends EventTarget {
    start() {
      // La phrase est dite une fois ; ensuite le moteur s'arrête seul (silence) et l'enregistreur
      // le relance (1.8 : seul le toucher ■ arrête) — d'où le flag `__said`, remis à zéro par le test.
      if (!window.__said) {
        window.__said = true;
        const final = [Object.assign([{ transcript: 'Taxi 2 000', confidence: 0.9 }], { isFinal: true })];
        setTimeout(() => this.dispatchEvent(ev('result', { results: final, resultIndex: 0 })), 300);
      }
      setTimeout(() => this.dispatchEvent(ev('end')), 400);
    }
    stop() { setTimeout(() => this.dispatchEvent(ev('end')), 30); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
};
let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.addInitScript(FAKE_SPEECH);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // Toucher la notification du rappel du soir = ouvrir /entry?mode=voice&from=reminder.
  await go('/entry?mode=voice&from=reminder', 3500);
  // L'enregistrement continue jusqu'au toucher ■ (1.8).
  ok((await btn("Terminer l'enregistrement").count()) > 0, 'rappel du soir → l’enregistrement démarre directement (bouton ■)');
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(1500);
  let t = await text();
  ok(!p.url().includes('/entry') && t.includes("J'ai compris 1 opération"), 'rappel du soir → saisie vocale ouverte directement (« Taxi 2 000 » compris)');
  await btn('Annuler').click(); await p.waitForTimeout(300);
  await go('/entry?mode=keyboard', 3500);
  ok((await text()).includes('Touchez une catégorie pour enregistrer'), 'lien profond /entry?mode=keyboard → saisie au clavier');

  // Réglages.
  await go('/settings/notifications');
  t = await text();
  ok(t.includes('Rappel du soir') && t.includes('Heure du rappel') && t.includes('20 h'), 'réglages : rappel du soir (actif par défaut) et heure (20 h)');
  ok((await p.getByRole('switch', { name: 'Rappel du soir' }).getAttribute('aria-checked')) === 'true', 'rappel du soir actif par défaut (migration douce)');
  await p.getByRole('button', { name: '21 h', exact: true }).click(); await p.waitForTimeout(600);
  await go('/settings/notifications');
  ok((await p.getByRole('button', { name: '21 h', exact: true }).getAttribute('aria-selected')) === 'true', 'heure du rappel enregistrée (21 h)');
  await btn('Tester le micro').click(); await p.waitForTimeout(1200);
  ok((await btn("Terminer l'enregistrement").count()) > 0, '« Tester le micro » : seul le toucher arrête (bouton « Terminer l’enregistrement »)');
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(1500);
  ok((await text()).includes("J'ai entendu : « Taxi 2 000 »"), '« Tester le micro » : texte compris affiché, rien d’enregistré');
  // Méthode par défaut : clavier → le bouton central ouvre le pavé ; exemples masqués.
  await p.getByRole('tab', { name: 'Clavier', exact: true }).first().click(); await p.waitForTimeout(500);
  await p.getByRole('switch', { name: 'Afficher des exemples de phrases' }).click(); await p.waitForTimeout(600);
  await go('/'); await closeCelebration();
  ok((await btn('Saisir une opération').count()) === 1, 'méthode par défaut « Clavier » : le bouton central s’appelle « Saisir une opération »');
  await btn('Saisir une opération').click(); await p.waitForTimeout(800);
  ok((await text()).includes('Touchez une catégorie pour enregistrer'), 'un appui ouvre le pavé numérique');
  await p.keyboard.press('Escape'); await go('/'); await closeCelebration();
  ok(!(await text()).includes('Par exemple :'), 'exemples de phrases masqués');

  await p.screenshot({ path: `${S}/lot-a-reminder.png` });
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'LOT A RAPPEL : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
