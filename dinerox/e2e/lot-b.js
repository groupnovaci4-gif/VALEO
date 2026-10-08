/* Lot B — compléments : récompense « saisie régulière », score personnel, coupure de la voix du coach à l'ouverture du micro. */
const { BASE, launch } = require('./env.js');
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
/** Synthèse vocale espionnée (lectures et coupures) + reconnaissance simulée LENTE (écoute de 1,5 s). */
const SPIES = () => {
  window.__spoken = []; window.__cancels = 0; window.__listening = false; window.__spokenWhileListening = 0;
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); if (window.__listening) window.__spokenWhileListening++; setTimeout(() => u.onend && u.onend({}), 30); };
    window.speechSynthesis.cancel = () => { window.__cancels++; };
  }
  const ev = (type, extra) => Object.assign(new Event(type), extra);
  class SlowRecognition extends EventTarget {
    start() {
      window.__listening = true;
      const final = [Object.assign([{ transcript: 'Taxi 2 000', confidence: 0.9 }], { isFinal: true })];
      setTimeout(() => this.dispatchEvent(ev('result', { results: final, resultIndex: 0 })), 1400);
      setTimeout(() => { window.__listening = false; this.dispatchEvent(ev('end')); }, 1500);
    }
    stop() { window.__listening = false; setTimeout(() => this.dispatchEvent(ev('end')), 30); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = SlowRecognition;
};
let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.addInitScript(SPIES);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // Récompenses : « Saisie régulière » au catalogue, avec sa règle.
  await go('/rewards');
  let t = await text();
  ok(t.includes('Saisie régulière') && t.includes('au moins 20 jours'), 'récompense « Saisie régulière » (20 jours de saisie dans le mois) au catalogue');

  // Score : espace personnel → calcul normal, avec la mention obligatoire.
  await go('/score');
  t = await text();
  ok(t.includes("Ce n'est pas une note de crédit ni une évaluation bancaire") && !t.includes('Votre score est personnel'), 'score sur l’espace personnel : mention obligatoire, pas de blocage');

  // Micro ouvert : la voix du coach est coupée (reconnaissance et synthèse ne se chevauchent jamais ;
  // le blocage pendant toute l'écoute est vérifié par les tests unitaires sur la vraie file vocale).
  await go('/'); await closeCelebration();
  await p.evaluate(() => { window.__cancels = 0; });
  await btn('Dicter une opération').click(); await p.waitForTimeout(300);
  ok((await p.evaluate(() => window.__listening)) && (await p.evaluate(() => window.__cancels)) > 0, 'micro ouvert : la voix du coach est coupée');
  await p.waitForTimeout(1600);
  ok((await p.evaluate(() => window.__cancels)) > 0 && !(await text()).includes("J'ai compris"), 'fin de phrase du moteur : l’enregistrement continue (seul ■ l’arrête)');
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(900);
  ok((await text()).includes("J'ai compris 1 opération"), 'toucher ■ : la carte de confirmation s’affiche');
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'LOT B : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
