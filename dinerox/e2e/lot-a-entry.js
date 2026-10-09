/*
 * Lot A, phases 2-3 — saisie rapide, phrase écrite, saisie vocale (reconnaissance SIMULÉE :
 * le navigateur de test n'a pas de micro), carte de confirmation, routage, limite gratuite, « Annuler ».
 */
const { BASE, launch } = require('./env.js');
const { checkAllInputs } = require('./fieldcheck.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };

/**
 * Remplace la reconnaissance vocale du navigateur par un moteur qui se comporte comme
 * Android : chaque session livre la phrase en attente (`window.__pending`, posée par
 * `dictate`) puis s'arrête ; sans parole, elle s'arrête d'elle-même au bout de 3 s
 * (`no-speech`). L'enregistreur DOIT la relancer : seul le toucher ■ arrête.
 * `window.__sayError` simule une erreur du service.
 */
const FAKE_SPEECH = () => {
  window.__pending = null;
  window.__sayError = null;
  window.__cancels = 0;
  window.__starts = 0;
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = () => undefined;
    const c = window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.cancel = () => { window.__cancels++; try { c(); } catch { /* */ } };
  }
  const ev = (type, extra) => Object.assign(new Event(type), extra);
  class FakeRecognition extends EventTarget {
    start() {
      window.__starts++;
      const timers = (this.__timers = []);
      const at = (ms, fn) => timers.push(setTimeout(fn, ms));
      at(20, () => this.dispatchEvent(ev('start')));
      if (window.__sayError) {
        const delay = window.__sayError === 'no-speech' ? 3000 : 120;
        at(delay, () => this.dispatchEvent(ev('error', { error: window.__sayError, message: '' })));
        at(delay + 40, () => this.dispatchEvent(ev('end')));
        return;
      }
      const say = window.__pending;
      window.__pending = null;
      if (!say) {
        // Silence : le service s'arrête de lui-même (comme Android).
        at(3000, () => this.dispatchEvent(ev('error', { error: 'no-speech', message: '' })));
        at(3040, () => this.dispatchEvent(ev('end')));
        return;
      }
      const words = say.split(' ');
      const partial = [Object.assign([{ transcript: words.slice(0, 1).join(' '), confidence: 0.5 }], { isFinal: false })];
      at(150, () => this.dispatchEvent(ev('result', { results: partial, resultIndex: 0 })));
      const final = [Object.assign([{ transcript: say, confidence: 0.9 }], { isFinal: true })];
      at(450, () => this.dispatchEvent(ev('result', { results: final, resultIndex: 0 })));
      at(550, () => this.dispatchEvent(ev('end')));
    }
    stop() { (this.__timers || []).forEach(clearTimeout); setTimeout(() => this.dispatchEvent(ev('end')), 30); }
    abort() { (this.__timers || []).forEach(clearTimeout); setTimeout(() => this.dispatchEvent(ev('end')), 10); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
};

/** Dicte `say` : toucher le micro, parler, toucher ■ (l'enregistrement ne s'arrête jamais seul). */
const dictate = async (pg, say, { speakFor = 1300 } = {}) => {
  await pg.evaluate((s) => { window.__pending = s; }, say);
  await pg.getByRole('button', { name: 'Dicter une opération', exact: true }).click();
  await pg.waitForTimeout(speakFor);
  const stop = pg.getByRole('button', { name: "Terminer l'enregistrement", exact: true });
  if (await stop.count()) await stop.click();
  await pg.waitForTimeout(900);
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
  const historyCount = async () => { await go('/transactions'); return Number(((await text()).match(/Période affichée : (\d+)/) || [])[1] || 0); };
  const home = async () => { await go('/'); await closeCelebration(); };
  const openKeyboard = async () => { const mic = btn('Dicter une opération'); const box = await mic.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(600); };
  const phrase = async (s) => { await p.getByLabel('Écrivez comme vous parlez').fill(s); await btn('Comprendre').click(); await p.waitForTimeout(600); };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  const n0 = await historyCount();

  // ── Saisie rapide : montant au pavé → catégorie → enregistré (3 gestes) ──
  await home(); await openKeyboard();
  ok((await text()).includes('Touchez une catégorie pour enregistrer'), 'appui long sur le micro : saisie au clavier (pavé numérique)');
  await checkAllInputs(p, 'Saisie › phrase écrite', ok, { expectInputs: true });
  await p.getByLabel('Écrivez comme vous parlez').fill('');
  for (const k of ['2', '000']) await btn(k).click();
  ok((await text()).includes('2 000 FCFA'), 'pavé : montant affiché (2 000 FCFA)');
  const firstCat = p.locator('[role=button][aria-selected]').filter({ hasNotText: /Sortie|Entrée|Parler|Clavier|Famille|Finance sociale/ }).first();
  const catName = (await firstCat.getAttribute('aria-label')) || '';
  await firstCat.click(); await p.waitForTimeout(500);
  let t = await text();
  ok(/Enregistré ✓ — il vous reste [\d ]+ FCFA par jour/.test(t), `toast : « ${(t.match(/Enregistré ✓[^\n]*/) || [''])[0]} »`);
  ok((await btn('Voir').count()) > 0 && (await btn('Annuler').count()) > 0, 'toast : « Voir » et « Annuler »');
  const n1 = await historyCount();
  ok(n1 === n0 + 1, `saisie rapide enregistrée (${n0} → ${n1}, catégorie « ${catName} »)`);

  // « Annuler » pendant 5 secondes : l'opération disparaît.
  await home(); await openKeyboard();
  for (const k of ['7', '5', '0']) await btn(k).click();
  await p.locator('[role=button][aria-selected]').filter({ hasNotText: /Sortie|Entrée|Parler|Clavier|Famille|Finance sociale/ }).first().click(); await p.waitForTimeout(400);
  await btn('Annuler').click(); await p.waitForTimeout(600);
  ok((await text()).includes('Enregistrement annulé'), '« Annuler » : enregistrement annulé');
  ok((await historyCount()) === n1, '« Annuler » : l’opération est supprimée');

  // ── Phrase écrite : 3 opérations, confirmation obligatoire ──
  await home(); await openKeyboard();
  await phrase('Ce matin taxi 1 000, garba 500, crédit 1 000');
  t = await text();
  ok(t.includes("J'ai compris 3 opérations") && t.includes('Tout valider'), 'phrase : carte de confirmation (3 opérations)');
  ok((await historyCount()) === n1, 'rien n’est enregistré avant « Tout valider »');
  await home(); await openKeyboard(); await phrase('Ce matin taxi 1 000, garba 500, crédit 1 000');
  await btn('Tout valider').click(); await p.waitForTimeout(600);
  const n2 = await historyCount();
  ok(n2 === n1 + 3, `« Tout valider » : 3 opérations enregistrées (${n1} → ${n2})`);
  t = await text();
  ok(t.includes('Taxi') && t.includes('-1 000 FCFA') && t.includes('-500 FCFA'), 'historique : transport 1 000, alimentation 500');

  // Champ incertain : surligné, corrigeable ; sans montant : impossible d'enregistrer.
  await home(); await openKeyboard(); await phrase('15 000 maman');
  t = await text();
  ok(/À vérifier : sens, catégorie/.test(t), '« 15 000 maman » : sens et catégorie à vérifier (surlignés)');
  await p.getByRole('button', { name: /^catégorie :.*à vérifier/ }).click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Famille', exact: true }).last().click(); await p.waitForTimeout(300);
  ok(!/À vérifier : .*catégorie/.test(await text()), 'catégorie corrigée : n’est plus surlignée');
  await btn('Annuler').click(); await p.waitForTimeout(300);
  await home(); await openKeyboard(); await phrase('Taxi');
  await p.getByRole('button', { name: /^montant :/ }).click(); await p.waitForTimeout(300);
  await checkAllInputs(p, 'Saisie › carte de confirmation', ok, { expectInputs: true });
  await p.getByRole('button', { name: /^montant :/ }).click(); await p.waitForTimeout(200);
  t = await text();
  ok(t.includes('Indiquez le montant de chaque opération') && (await btn('Tout valider').isDisabled()), '« Taxi » sans montant : enregistrement impossible, montant demandé');
  await btn('Annuler').click(); await p.waitForTimeout(300);

  // ── Routage : question → réponse + conversation ; doute → « opération ou question ? » ──
  await home(); await openKeyboard(); await phrase("Combien j'ai dépensé ce mois-ci ?");
  t = await text();
  ok(t.includes('Ouvrir la conversation') && !t.includes('Tout valider'), 'question : réponse de l’assistant (pas d’opération)');
  await btn('Ouvrir la conversation').click(); await p.waitForTimeout(2500);
  ok(p.url().includes('/assistant') && (await text()).includes("Combien j'ai dépensé ce mois-ci"), '« Ouvrir la conversation » : l’assistant reprend la question');
  await home(); await openKeyboard(); await phrase('bonjour');
  ok((await text()).includes('Voulez-vous enregistrer une opération ou poser une question ?'), 'doute : « opération ou question ? »');
  await p.keyboard.press('Escape');

  // ── Voix (reconnaissance simulée) ──
  await home();
  await p.evaluate(() => { window.__cancels = 0; });
  await dictate(p, 'Taxi 2 000 et garba 500');
  t = await text();
  ok(t.includes("J'ai compris 2 opérations"), 'voix : « Taxi 2 000 et garba 500 » → 2 opérations à confirmer');
  ok((await p.evaluate(() => window.__cancels)) > 0, 'micro ouvert : la voix du coach est coupée (jamais les deux à la fois)');
  ok(!t.includes('Saisies vocales gratuites restantes'), 'formule Famille (démo de développement) : pas de quota vocal');
  await btn('Tout valider').click(); await p.waitForTimeout(600);
  const n3 = await historyCount();
  ok(n3 === n2 + 2, `voix validée : 2 opérations enregistrées (${n2} → ${n3})`);

  // Erreurs de reconnaissance : message clair, la phrase écrite reste disponible (jamais bloquant).
  await home(); await p.evaluate(() => { window.__sayError = 'network'; });
  await btn('Dicter une opération').click(); await p.waitForTimeout(1200);
  t = await text();
  ok(t.includes("La reconnaissance vocale n'est pas disponible") && (await p.getByLabel('Écrivez comme vous parlez').count()) > 0, 'erreur de reconnaissance : message + phrase écrite disponible');
  await home(); await p.evaluate(() => { window.__sayError = null; });
  await dictate(p, null, { speakFor: 4500 });
  ok((await text()).includes("Je n'ai rien entendu"), 'rien dit puis ■ : « Je n’ai rien entendu », rien d’enregistré');
  await home(); await p.evaluate(() => { window.__sayError = 'not-allowed'; });
  await btn('Dicter une opération').click(); await p.waitForTimeout(1200);
  ok((await text()).includes("Le micro n'est pas autorisé"), 'micro refusé : bascule vers la phrase écrite, sans blocage');
  await p.evaluate(() => { window.__sayError = null; });
  ok((await historyCount()) === n3, 'erreurs : aucune opération créée');

  await p.screenshot({ path: `${S}/lot-a-entry.png` });
  ok(errs.length === 0, 'démo : aucune erreur JS ' + errs.slice(0, 2).join(' | '));

  // ── Limite gratuite (vrai compte, formule gratuite) : 5 saisies vocales validées par jour,
  //    la 6e est refusée ; clavier et phrase écrite restent illimités. ──
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx2.addInitScript(FAKE_SPEECH);
  const q = await ctx2.newPage();
  const errs2 = []; q.on('pageerror', (e) => errs2.push(e.message)); q.on('dialog', (d) => d.accept());
  const qtext = async () => (await q.evaluate(() => document.body.innerText)).replace(/[\u00a0\u202f]/g, ' ');
  const qbtn = (name) => q.getByRole('button', { name, exact: true });
  const fill = (label, v, exact = false) => q.getByLabel(label, { exact }).first().fill(v);
  await q.goto(BASE + '/', { waitUntil: 'load' }); await q.waitForTimeout(3000);
  await q.getByText('Créer mon compte', { exact: false }).first().click(); await q.waitForTimeout(800);
  await fill('Nom', 'Gratuit', true); await fill('Prénom', 'Koffi'); await fill('Adresse e-mail', `gratuit${Date.now()}@ex.com`);
  await fill('Mot de passe', 'motdepasse123', true); await fill('Confirmer le mot de passe', 'motdepasse123');
  await q.getByRole('switch').first().click();
  await q.getByRole('button', { name: 'Créer mon compte' }).click();
  await q.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 });
  await q.getByText('Plus tard', { exact: true }).click();
  await q.getByText('Bonjour Koffi').first().waitFor({ timeout: 15000 }); await q.waitForTimeout(2500);
  const qhome = async () => { await q.goto(BASE + '/', { waitUntil: 'load' }); await q.waitForTimeout(3000); };
  for (let i = 1; i <= 5; i++) {
    await qhome();
    await q.evaluate(() => { window.__pending = 'Taxi 2 000'; });
    await qbtn('Dicter une opération').click();
    // Pendant l'écoute (avant la carte de confirmation) : quota restant affiché.
    if (i === 1 || i === 5) {
      await q.waitForTimeout(250);
      const left = 6 - i;
      ok((await qtext()).includes(`Saisies vocales gratuites restantes aujourd'hui : ${left} sur 5`), `formule gratuite : « ${left} sur 5 » affiché pendant l’écoute`);
    }
    await q.waitForTimeout(1300);
    await qbtn("Terminer l'enregistrement").click(); await q.waitForTimeout(900);
    await qbtn('Tout valider').click(); await q.waitForTimeout(800);
  }
  await qhome(); await qbtn('Dicter une opération').click(); await q.waitForTimeout(1500);
  let u = await qtext();
  ok(u.includes('Vous avez utilisé vos 5 saisies vocales gratuites') && !u.includes("J'ai compris"), '6e saisie vocale : refusée (limite gratuite), proposition de Plus');
  ok((await qbtn('Voir la formule Plus').count()) > 0, 'invitation douce vers Plus');
  await q.getByLabel('Écrivez comme vous parlez').fill('Garba 500'); await qbtn('Comprendre').click(); await q.waitForTimeout(600);
  ok((await qtext()).includes("J'ai compris 1 opération"), 'après la limite : la phrase écrite reste disponible');
  await qbtn('Annuler').click(); await q.waitForTimeout(300);
  // Clavier : appui long sur le micro.
  const mic = await qbtn('Dicter une opération').boundingBox();
  await q.mouse.move(mic.x + mic.width / 2, mic.y + mic.height / 2); await q.mouse.down(); await q.waitForTimeout(700); await q.mouse.up(); await q.waitForTimeout(600);
  for (const k of ['3', '0', '0']) await qbtn(k).click();
  await q.locator('[role=button][aria-selected]').filter({ hasNotText: /Sortie|Entrée|Parler|Clavier|Famille|Finance sociale/ }).first().click(); await q.waitForTimeout(600);
  ok((await qtext()).includes('Enregistré ✓'), 'après la limite : la saisie au clavier reste illimitée');
  ok(errs2.length === 0, 'compte gratuit : aucune erreur JS ' + errs2.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'LOT A SAISIE : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
