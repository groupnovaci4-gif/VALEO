/*
 * I1 (audit 2026-10) — où part le son de la dictée. Sur le web, pas de reconnaissance sur
 * l'appareil : la demande d'accord s'affiche une fois avant la première dictée.
 * « Non, je tape » : clavier, micro plus proposé (feuille, assistant, réglages) ; choisir
 * « Parler » dans les réglages repose la question ; « Oui, dicter » : l'enregistrement démarre.
 * Le chemin « sur l'appareil » et le pack de langue (Android) : tests purs + téléphone.
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const FAKE_SPEECH = () => {
  const ev = (type, extra) => Object.assign(new Event(type), extra);
  class FakeRecognition extends EventTarget {
    start() {
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
  const recording = async () => (await btn("Terminer l'enregistrement").count()) > 0;

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── 1. Première dictée : la demande d'accord, avant toute écoute ──
  await btn('Dicter une opération').click(); await p.waitForTimeout(1500);
  let t = await text();
  ok(t.includes('Dicter avec le service de votre téléphone ?'), 'titre : « Dicter avec le service de votre téléphone ? »');
  ok(t.includes('Votre téléphone ne sait pas reconnaître la voix sans connexion.') && t.includes('(Google ou Apple)') && t.includes('ne reçoit jamais ce son.'), 'texte de la proposition I1, tel quel');
  ok((await btn('Oui, dicter').count()) === 1 && (await btn('Non, je tape').count()) === 1 && !(await recording()), 'boutons « Oui, dicter » / « Non, je tape » ; micro pas encore ouvert');
  await p.screenshot({ path: `${S}/voice-consent-ask.png` });

  // ── 2. « Non, je tape » : clavier, plus de micro ──
  await btn('Non, je tape').click(); await p.waitForTimeout(800);
  t = await text();
  ok(t.includes('Touchez une catégorie pour enregistrer') && !(await recording()), '« Non, je tape » : saisie au clavier, rien n’est écouté');
  ok((await p.getByRole('tab', { name: 'Parler', exact: true }).count()) === 0, 'feuille de saisie : l’onglet « Parler » n’est plus proposé');
  await p.keyboard.press('Escape'); await go('/'); await closeCelebration();
  ok((await btn('Saisir une opération').count()) === 1 && (await btn('Dicter une opération').count()) === 0, 'accueil : le clavier devient la méthode par défaut (« Saisir une opération »)');
  ok((await btn('Parler').count()) === 0 && (await btn('Saisir').count()) > 0, 'bulle de l’accueil : « Parler » n’est plus proposé, « Saisir » reste');
  await go('/assistant');
  ok((await btn('Dicter un message').count()) === 0, 'assistant : le micro n’est plus proposé');
  await go('/settings/notifications');
  ok((await btn('Tester le micro').count()) === 0, 'réglages : « Tester le micro » n’est plus proposé');

  // ── 3. Le choix se change dans les réglages : « Parler » repose la question ──
  await p.getByRole('tab', { name: 'Parler', exact: true }).first().click(); await p.waitForTimeout(800);
  ok((await btn('Tester le micro').count()) === 1, 'réglages : choisir « Parler » → « Tester le micro » revient');
  await go('/'); await closeCelebration();
  await btn('Dicter une opération').click(); await p.waitForTimeout(1500);
  ok((await btn('Oui, dicter').count()) === 1 && !(await recording()), 'la demande d’accord revient (une fois)');

  // ── 4. « Oui, dicter » : l'enregistrement démarre, la mention « service du téléphone » est affichée ──
  await btn('Oui, dicter').click(); await p.waitForTimeout(1500);
  ok(await recording(), '« Oui, dicter » : l’enregistrement démarre');
  ok((await text()).includes('Le service vocal du téléphone peut traiter'), 'mention sous le micro : service du téléphone');
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(1500);
  ok((await text()).includes("J'ai compris 1 opération"), '« Taxi 2 000 » compris');
  await btn('Annuler').click(); await p.waitForTimeout(300);
  await go('/'); await closeCelebration();
  await btn('Dicter une opération').click(); await p.waitForTimeout(1500);
  ok((await recording()) && (await btn('Oui, dicter').count()) === 0, 'accord mémorisé : la dictée suivante démarre sans redemander');
  await btn("Annuler l'enregistrement").click(); await p.waitForTimeout(500);

  await p.screenshot({ path: `${S}/voice-consent.png` });
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'VOIX I1 : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
