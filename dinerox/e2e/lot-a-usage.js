/*
 * Lot A, phase 5 — mesure d'usage : les événements réellement émis par l'application (journal
 * de développement) sont capturés et vérifiés : bons noms, bonnes propriétés, AUCUN contenu
 * (ni montant, ni texte prononcé ou écrit, ni bénéficiaire, ni catégorie).
 */
const { BASE, launch } = require('./env.js');
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
const FAKE_SPEECH = () => {
  window.__say = 'Taxi 2 000';
  window.__sayError = null;
  const ev = (type, extra) => Object.assign(new Event(type), extra);
  class FakeRecognition extends EventTarget {
    start() {
      if (window.__sayError) { setTimeout(() => this.dispatchEvent(ev('error', { error: window.__sayError, message: '' })), 100); setTimeout(() => this.dispatchEvent(ev('end')), 150); return; }
      const final = [Object.assign([{ transcript: window.__say, confidence: 0.9 }], { isFinal: true })];
      setTimeout(() => this.dispatchEvent(ev('result', { results: final, resultIndex: 0 })), 300);
      setTimeout(() => this.dispatchEvent(ev('end')), 400);
    }
    stop() { setTimeout(() => this.dispatchEvent(ev('end')), 30); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
};
const ALLOWED = new Set(['method', 'plan', 'intent', 'source', 'step', 'kind', 'count', 'reason', 'to']);
let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.addInitScript(FAKE_SPEECH);
  const p = await ctx.newPage();
  const events = [];
  p.on('console', async (msg) => {
    if (!msg.text().startsWith('[analytics]')) return;
    const args = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => null)));
    events.push({ event: args[1], props: args[2] ?? {} });
  });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const phrase = async (s) => { await p.getByLabel('Écrivez comme vous parlez').fill(s); await btn('Comprendre').click(); await p.waitForTimeout(600); };
  const has = (event, props = {}) => events.some((e) => e.event === event && Object.entries(props).every(([k, v]) => e.props[k] === v));

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  // Saisie rapide.
  await go('/entry?mode=keyboard', 3500);
  for (const k of ['2', '000']) await btn(k).click();
  await p.locator('[role=button][aria-selected]').filter({ hasNotText: /Sortie|Entrée|Parler|Clavier/ }).first().click(); await p.waitForTimeout(500);
  // Phrase écrite (2 opérations).
  await go('/entry?mode=keyboard', 3500); await phrase('Taxi 1 000 et garba 500 pour Maman Awa'); await btn('Tout valider').click(); await p.waitForTimeout(500);
  // Voix, corrigée avant validation.
  await go('/entry?mode=voice', 3500);
  // Enregistrement « comme WhatsApp » : il ne s'arrête qu'au toucher ■.
  await btn("Terminer l'enregistrement").click(); await p.waitForTimeout(900);
  await p.getByRole('button', { name: /^catégorie :/ }).first().click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Alimentation & boissons', exact: true }).last().click(); await p.waitForTimeout(300);
  await btn('Tout valider').click(); await p.waitForTimeout(500);
  // Échec de reconnaissance, question, doute.
  await go('/'); await closeCelebration();
  await p.evaluate(() => { window.__sayError = 'network'; }); await btn('Dicter une opération').click(); await p.waitForTimeout(1200);
  await go('/entry?mode=keyboard', 3500); await phrase("Combien j'ai dépensé ce mois-ci ?");
  await go('/entry?mode=keyboard', 3500); await phrase('bonjour');
  // Formulaire complet, Historique depuis « Plus », rappel du soir.
  await go('/transaction/new?type=expense');
  await p.getByLabel('Montant', { exact: false }).first().fill('4500'); await p.waitForTimeout(200);
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).last().click(); await p.waitForTimeout(800);
  await go('/transactions?from=more');
  await go('/entry?mode=voice&from=reminder', 2500);

  ok(has('entry_created', { method: 'quick_manual', count: 1 }), 'entry_created · quick_manual');
  ok(has('entry_created', { method: 'text_phrase', count: 2 }), 'entry_created · text_phrase (2 opérations)');
  ok(has('entry_created', { method: 'voice', count: 1 }), 'entry_created · voice');
  ok(has('voice_entry_corrected'), 'voice_entry_corrected (champ corrigé sur la carte)');
  ok(has('voice_entry_failed', { reason: 'network' }), 'voice_entry_failed · reason');
  ok(has('mic_routed', { to: 'entry' }) && has('mic_routed', { to: 'assistant' }) && has('mic_routed', { to: 'ambiguous' }), 'mic_routed · entry / assistant / ambiguous');
  ok(has('entry_created', { method: 'full_form', count: 1 }), 'entry_created · full_form');
  ok(has('history_opened', { source: 'more' }), 'history_opened · source');
  ok(has('daily_reminder_opened'), 'daily_reminder_opened');
  // Aucune donnée de contenu : propriétés de la liste blanche uniquement, aucun montant ni mot saisi.
  const lot = events.filter((e) => ['entry_created', 'voice_entry_corrected', 'voice_entry_failed', 'daily_reminder_opened', 'history_opened', 'mic_routed'].includes(e.event));
  const extraKeys = lot.flatMap((e) => Object.keys(e.props).filter((k) => !ALLOWED.has(k)));
  ok(lot.length >= 10 && extraKeys.length === 0, `${lot.length} événements, propriétés hors liste blanche : ${extraKeys.length}`);
  const dump = JSON.stringify(lot).toLowerCase();
  ok(!/taxi|garba|maman|awa|nourriture|transport|combien|bonjour|4500|2000|1000|500\b/.test(dump), 'aucun montant, texte, bénéficiaire ni catégorie dans les événements');
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'LOT A MESURE : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
