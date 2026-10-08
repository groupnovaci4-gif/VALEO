/*
 * Enregistreur vocal « comme WhatsApp » (1.8) sur l'application réelle (export web).
 * La reconnaissance du navigateur est remplacée par un moteur qui se comporte comme
 * Android : il livre une phrase puis s'ARRÊTE DE LUI-MÊME, et sans parole il s'arrête
 * au bout de 3 s (`no-speech`). L'enregistreur doit le relancer : seul le toucher ■ arrête.
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };

const FAKE_ANDROID = () => {
  window.__queue = [];
  window.__starts = 0;
  window.__aborts = 0;
  if (window.speechSynthesis) window.speechSynthesis.speak = () => undefined;
  const ev = (type, extra) => Object.assign(new Event(type), extra);
  class FakeRecognition extends EventTarget {
    start() {
      window.__starts++;
      const timers = (this.__timers = []);
      const at = (ms, fn) => timers.push(setTimeout(fn, ms));
      at(20, () => this.dispatchEvent(ev('start')));
      const say = window.__queue.shift();
      if (!say) {
        at(3000, () => this.dispatchEvent(ev('error', { error: 'no-speech', message: '' })));
        at(3040, () => this.dispatchEvent(ev('end')));
        return;
      }
      const words = say.split(' ');
      words.forEach((_, i) => at(100 + i * 120, () => this.dispatchEvent(ev('result', { results: [Object.assign([{ transcript: words.slice(0, i + 1).join(' '), confidence: 0.6 }], { isFinal: false })], resultIndex: 0 }))));
      at(150 + words.length * 120, () => this.dispatchEvent(ev('result', { results: [Object.assign([{ transcript: say, confidence: 0.9 }], { isFinal: true })], resultIndex: 0 })));
      // Fin de phrase : le moteur s'arrête tout seul ~1,5 s après.
      at(1700 + words.length * 120, () => this.dispatchEvent(ev('end')));
    }
    stop() { (this.__timers || []).forEach(clearTimeout); setTimeout(() => this.dispatchEvent(ev('end')), 30); }
    abort() { window.__aborts++; (this.__timers || []).forEach(clearTimeout); setTimeout(() => this.dispatchEvent(ev('end')), 10); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
};

let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.addInitScript(FAKE_ANDROID);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const home = async () => { await go('/'); await closeCelebration(); };
  const queue = (...s) => p.evaluate((l) => { window.__queue = l; }, s);
  const recording = async () => (await btn("Terminer l'enregistrement").count()) > 0;

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── Pause de 10 secondes au milieu : l'enregistrement continue ──
  await home();
  await queue('Taxi 2 000');
  await btn('Dicter une opération').click(); await p.waitForTimeout(1500);
  ok(await recording(), 'toucher le micro : l’enregistrement démarre (bouton ■ visible)');
  let t = await text();
  ok(/\b0:0[0-9]\b/.test(t), 'chronomètre affiché (0:0x)');
  ok((await btn("Annuler l'enregistrement").count()) > 0, 'corbeille visible');
  await p.waitForTimeout(10_000);
  t = await text();
  ok(await recording(), 'après 10 s de silence : TOUJOURS en enregistrement (aucun arrêt automatique)');
  ok(/\b0:1[0-9]\b/.test(t), `le chronomètre monte (${(t.match(/\b\d:\d\d\b/) || ['?'])[0]})`);
  ok((await p.evaluate(() => window.__starts)) >= 3, `le moteur, arrêté de lui-même, a été relancé (${await p.evaluate(() => window.__starts)} démarrages)`);
  ok(t.includes('Taxi 2 000'), 'le texte déjà dit reste affiché pendant la pause');
  await queue('et garba 500');
  await p.waitForTimeout(3500);
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(1200);
  t = await text();
  ok(t.includes("J'ai compris 2 opérations"), 'toucher ■ : un seul texte raccordé (« Taxi 2 000 et garba 500 ») → 2 opérations à confirmer');
  ok(!(await recording()), 'après ■ : la barre d’enregistrement disparaît');
  await p.screenshot({ path: `${S}/voice-recorder-confirm.png` });
  await p.keyboard.press('Escape');

  // ── Corbeille : rien n'est analysé ──
  await home(); await queue('Loyer 50 000');
  await btn('Dicter une opération').click(); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${S}/voice-recorder-bar.png` });
  await btn("Annuler l'enregistrement").click(); await p.waitForTimeout(800);
  t = await text();
  ok(!/J'ai compris \d+ opération/.test(t) && !(await recording()), 'corbeille : enregistrement annulé, aucune carte');

  // ── Toucher de moins d'une seconde : annulation silencieuse ──
  await home(); await queue('Pain 500');
  await btn('Dicter une opération').click(); await p.waitForTimeout(550);
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(800);
  t = await text();
  ok(!/J'ai compris \d+ opération/.test(t) && !t.includes("Je n'ai rien entendu") && !(await recording()), 'toucher < 1 s : annulé sans message');

  // ── Double toucher sur le micro : un seul enregistrement ──
  await home(); await queue('Pharmacie 3 500');
  await btn('Dicter une opération').dblclick(); await p.waitForTimeout(1800);
  ok(await recording(), 'double toucher : un seul enregistrement, toujours en cours');
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(1200);
  ok((await text()).includes("J'ai compris 1 opération"), 'double toucher puis ■ : une seule carte (1 opération)');
  await p.keyboard.press('Escape');

  // ── Mise en arrière-plan : arrêt propre, ce qui a été dit est gardé ──
  await home(); await queue('Garba 500');
  await btn('Dicter une opération').click(); await p.waitForTimeout(2200);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(800);
  t = await text();
  ok(t.includes("J'ai compris 1 opération") && !(await recording()), 'arrière-plan : arrêt propre, « Garba 500 » conservé → carte de confirmation');
  await p.keyboard.press('Escape');

  // ── Dictée de l'assistant : même règle ──
  await go('/assistant'); await closeCelebration();
  await queue('combien il me reste');
  await btn('Dicter un message').click(); await p.waitForTimeout(6000);
  ok((await btn('Arrêter la dictée').count()) + (await p.getByRole('button', { name: /Arrêter/ }).count()) > 0, 'assistant : après un silence, la dictée continue');
  await queue('pour la nourriture'); await p.waitForTimeout(5000);
  await p.getByRole('button', { name: /Arrêter/ }).first().click(); await p.waitForTimeout(1200);
  const v = await p.getByPlaceholder('Écrivez comme vous parlez…').inputValue();
  ok(v === 'combien il me reste pour la nourriture', `assistant : texte complet dans la zone de message, rien d’envoyé (« ${v} »)`);

  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'ENREGISTREUR : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
