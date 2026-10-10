/*
 * 1.9 — Mini-conversation vocale (mode démonstration, export web).
 * Reconnaissance SIMULÉE comme dans lot-a-entry.js (le navigateur de test n'a pas de
 * micro) ; la synthèse vocale est CAPTÉE (`window.__spoken`) : on vérifie que la
 * réponse est affichée ET lue, que le toucher coupe la voix, et que rien n'est
 * enregistré avant « oui ».
 */
const { BASE, launch } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };

const FAKE_SPEECH = () => {
  window.__pending = null;
  window.__spoken = [];
  window.__cancels = 0;
  if (window.speechSynthesis) {
    // Lecture simulée : le texte est noté, la fin arrive après 2 s (sauf coupure).
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push(u.text);
      window.__speakingNow = u;
      setTimeout(() => { if (window.__speakingNow === u) { window.__speakingNow = null; u.onend && u.onend(new Event('end')); } }, 2000);
    };
    window.speechSynthesis.cancel = () => {
      window.__cancels++;
      const u = window.__speakingNow;
      window.__speakingNow = null;
      if (u && u.onend) u.onend(new Event('end'));
    };
    window.speechSynthesis.getVoices = () => [];
  }
  const ev = (type, extra) => Object.assign(new Event(type), extra);
  class FakeRecognition extends EventTarget {
    start() {
      const timers = (this.__timers = []);
      const at = (ms, fn) => timers.push(setTimeout(fn, ms));
      at(20, () => this.dispatchEvent(ev('start')));
      const say = window.__pending;
      window.__pending = null;
      if (!say) {
        at(3000, () => this.dispatchEvent(ev('error', { error: 'no-speech', message: '' })));
        at(3040, () => this.dispatchEvent(ev('end')));
        return;
      }
      const final = [Object.assign([{ transcript: say, confidence: 0.9 }], { isFinal: true })];
      at(300, () => this.dispatchEvent(ev('result', { results: final, resultIndex: 0 })));
      at(400, () => this.dispatchEvent(ev('end')));
    }
    stop() { (this.__timers || []).forEach(clearTimeout); setTimeout(() => this.dispatchEvent(ev('end')), 30); }
    abort() { (this.__timers || []).forEach(clearTimeout); setTimeout(() => this.dispatchEvent(ev('end')), 10); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
};

const REFERENCE = "J'ai dépensé 30 000 en facture d'électricité, 30 000 en facture d'eau, 30 000 au marché, et 100 000 en loyer, 10 000 en transport, 5 000 en santé, ainsi de suite.";

let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr-FR' });
  await ctx.addInitScript(FAKE_SPEECH);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  // Ce que DineroX a prononcé depuis `mark()` (le coach a pu parler avant, à l'ouverture).
  let from = 0;
  const mark = async () => { from = await p.evaluate(() => window.__spoken.length); };
  const spoken = async () => { await p.waitForTimeout(1600); return p.evaluate((f) => window.__spoken.slice(f), from); };
  const go = async (path, w = 3000) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const closeCelebration = async () => { const c = btn('Continuer'); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const historyCount = async () => { await go('/transactions'); return Number(((await text()).match(/Période affichée : (\d+)/) || [])[1] || 0); };
  /** Dicte une phrase : micro (ou « Répondre à la voix »), parler, ■. */
  const dictate = async (say, button = 'Dicter une opération') => {
    await p.evaluate((s) => { window.__pending = s; }, say);
    await btn(button).first().click();
    await p.waitForTimeout(1300);
    const stop = btn("Terminer l'enregistrement");
    if (await stop.count()) await stop.click();
    await p.waitForTimeout(1200);
  };

  await go('/');
  await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();
  const before = await historyCount();
  await go('/'); await closeCelebration();

  // ── 1. Exemple de référence, à la voix ──
  await mark();
  await dictate(REFERENCE);
  let t = await text();
  ok(t.includes(REFERENCE.replace(/'/g, "'")) || t.includes('30 000 en facture'), 'bulle de l’utilisateur : la transcription');
  ok(/(Bonjour|Bon après-midi|Bonsoir)( \S+)?, bien compris\./.test(t), 'salutation à la première interaction du jour');
  ok(t.includes("D'après ce que j'ai compris, vous avez dépensé :"), 'reformulation : introduction');
  ok(/Soit 205 000 FCFA au total, payés depuis .+\./.test(t), 'total 205 000 et compte utilisé');
  ok(t.includes('Je les enregistre ?'), '« Je les enregistre ? »');
  ok(t.includes("J'ai compris 6 opérations") && t.includes('Tout valider'), 'carte de confirmation intégrée : 6 lignes');
  ok(!/Pour l'eau/.test(t), '« facture d’eau » : aucune question');
  let said = await spoken();
  ok(said.length === 1 && said[0].includes('205 000 francs') && said[0].includes('Je les enregistre ?'), `réponse lue à voix haute (montants compris) : « ${(said[0] || '').slice(0, 90)}… »`);
  ok(said[0] && !said[0].includes('ainsi de suite'), '« ainsi de suite » : ni ligne ni lecture');
  ok((await historyCount()) === before, 'rien n’est enregistré avant « oui »');

  // Toucher la bulle de DineroX coupe la voix tout de suite.
  await go('/'); await closeCelebration();
  await dictate(REFERENCE);
  // Attendre que la voix lise réellement la reformulation, puis toucher la bulle.
  await p.waitForFunction(() => window.__speakingNow && /Je les enregistre/.test(window.__speakingNow.text), null, { timeout: 8000 });
  const cancels0 = await p.evaluate(() => window.__cancels);
  await p.getByText("D'après ce que j'ai compris, vous avez dépensé :").first().click();
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => window.__cancels)) > cancels0 && (await p.evaluate(() => window.__speakingNow)) === null, 'toucher la bulle coupe la voix immédiatement');

  // ── 2. Correction à la voix : « Non, le loyer c'est 120 000 » ──
  await mark();
  await dictate("Non, le loyer c'est 120 000", 'Répondre à la voix');
  t = await text();
  ok(t.includes('D\'accord, Loyer corrigé à 120 000 FCFA.') && t.includes('Nouveau total : 225 000 FCFA.'), 'correction dite : loyer 120 000, nouveau total 225 000 (reformulation courte)');
  said = await spoken();
  ok(said.at(-1).includes('Loyer corrigé à 120 000 francs') && said.at(-1).includes('225 000 francs'), 'la correction est lue aussi');
  // Micro et voix jamais en même temps : ouvrir le micro coupe la voix.
  const c1 = await p.evaluate(() => window.__cancels);
  await dictate('Enlève la santé', 'Répondre à la voix');
  ok((await p.evaluate(() => window.__cancels)) > c1, 'ouvrir le micro coupe la voix (jamais les deux)');
  ok((await text()).includes("D'accord, j'ai retiré Santé.") && (await text()).includes('Nouveau total : 220 000 FCFA.'), '« Enlève la santé » → 220 000');
  // Réponse ÉCRITE (même compréhension).
  await p.getByLabel('Votre réponse').fill('Ajoute 2 000 de crédit téléphone');
  await btn('Envoyer').click(); await p.waitForTimeout(500);
  ok((await text()).includes('Nouveau total : 222 000 FCFA.'), 'réponse écrite : ajout de 2 000 de crédit → 222 000');
  await p.getByLabel('Votre réponse').fill("C'était hier");
  await btn('Envoyer').click(); await p.waitForTimeout(500);
  ok(/D'accord, c'était le \d+ \S+\./.test(await text()), '« C’était hier » → date de la veille');
  ok((await spoken()).length === 2, 'réponses écrites : affichées sans être lues (seules les réponses dites sont lues)');
  await p.screenshot({ path: `${S}/voice-conversation-before-yes.png`, fullPage: true });

  // ── 3. « Oui » → enregistrement groupé, bilan calculé ──
  await mark();
  await dictate('Oui', 'Répondre à la voix');
  t = await text();
  ok(/C'est fait : 6 dépenses enregistrées, 222 000 FCFA\./.test(t), 'bilan : 6 dépenses, 222 000');
  ok(/Il vous reste .+ par jour jusqu'au \d+\./.test(t) || /dépassent vos revenus/.test(t), 'bilan : nouveau reste par jour (ou déficit)');
  ok((t.match(/Votre enveloppe|Vos enveloppes/g) || []).length <= 1, 'au plus UNE phrase d’enveloppes');
  await p.screenshot({ path: `${S}/voice-conversation-done.png`, fullPage: true });
  // « Annuler » du message d'enregistrement (5 s) : tout le groupe.
  ok(await btn('Annuler').count() > 0, '« Annuler » (5 s) proposé pour tout le groupe');
  await btn('Annuler').first().click(); await p.waitForTimeout(600);
  ok((await text()).includes('Enregistrement annulé'), '« Annuler » : la conversation le confirme');
  said = await spoken();
  ok(said.some((x) => x.startsWith("C'est fait")), `bilan lu : « ${(said.find((x) => x.startsWith("C'est fait")) || '').slice(0, 120)} »`);
  ok((await historyCount()) === before, '« Annuler » retire les 6 opérations d’un coup');

  // ── 4. Enregistrer pour de bon, puis vérifier l'Historique ──
  await go('/'); await closeCelebration();
  await dictate(REFERENCE);
  await btn('Tout valider').click(); await p.waitForTimeout(800);
  ok(/C'est fait : 6 dépenses enregistrées, 205 000 FCFA\./.test(await text()), '« Tout valider » : même bilan');
  ok((await historyCount()) === before + 6, 'Historique : 6 opérations de plus');

  // ── 5. Ambiguïté : « 30 000 en eau » → une seule question, réponse par bouton ──
  await go('/'); await closeCelebration();
  await dictate('30 000 en eau');
  t = await text();
  ok(t.includes("Pour l'eau : la facture d'eau ou de l'eau à boire ?") && (await btn("Facture d'eau").count()) && (await btn('Eau à boire').count()), 'question unique avec deux boutons');
  await btn('Eau à boire').click(); await p.waitForTimeout(500);
  ok((await text()).includes("C'est noté : Eau.") && (await text()).includes("Je l'enregistre ?"), 'réponse par bouton → « Je l’enregistre ? »');
  await dictate('Annule tout', 'Répondre à la voix');
  ok((await text()).includes("C'est annulé : rien n'a été enregistré."), '« Annule tout » : rien d’enregistré');

  // ── 6. Question dans la conversation → réponse calculée ──
  await go('/'); await closeCelebration();
  await dictate('Taxi 2 000');
  await p.getByLabel('Votre réponse').fill("Combien j'ai dépensé ce mois-ci ?");
  await btn('Envoyer').click(); await p.waitForTimeout(600);
  ok(/FCFA/.test((await p.locator('text=/dépensé/').last().innerText().catch(() => ''))) || /ce mois/.test(await text()), 'question dans la conversation : réponse de l’assistant (calculée)');

  await p.getByLabel('Votre réponse').fill('Est-ce que le prix du riz va monter ?');
  await btn('Envoyer').click(); await p.waitForTimeout(600);
  ok((await text()).includes("C'est une question ouverte") && (await btn('Ouvrir la conversation').count()) > 0, 'question ouverte : renvoyée à l’assistant (bouton à côté de la bulle)');

  // ── Scénarios de la mission, un par un (phrase écrite : même compréhension que la voix) ──
  const openKeyboard = async () => {
    const mic = btn('Dicter une opération'); const box = await mic.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(600);
  };
  const typed = async (phrase) => {
    await go('/'); await closeCelebration(); await openKeyboard();
    await p.getByLabel('Écrivez comme vous parlez').fill(phrase); await btn('Comprendre').click(); await p.waitForTimeout(700);
    return text();
  };
  const reply = async (r) => { await p.getByLabel('Votre réponse').fill(r); await btn('Envoyer').click(); await p.waitForTimeout(600); return text(); };

  t = await typed('30 000, non pardon 35 000 en électricité');
  ok(t.includes("J'ai compris 1 opération") && t.includes('Soit 35 000 FCFA au total'), 'auto-correction : 35 000 retenu (pas 30 000)');
  t = await typed('taxi 1 000, garba 500, crédit 1 000, loyer 100 000, pharmacie 2 000, marché 15 000, essence 5 000, école 20 000, coiffure 3 000 et facture d’électricité 12 000');
  ok(t.includes("J'ai compris 10 opérations") && t.includes('Soit 159 500 FCFA au total'), 'liste de 10 lignes : 159 500');
  t = await typed('trente mille au marché et deux mille cinq cents de crédit');
  ok(t.includes('Soit 32 500 FCFA au total'), 'montants en lettres : 30 000 + 2 500');
  t = await typed('pharmacie');
  ok(t.includes('À vérifier : montant') && (await btn('Tout valider').getAttribute('aria-disabled')) === 'true' && !t.includes('Soit 0 FCFA'), 'ligne sans montant : « à vérifier », validation impossible');
  t = await typed('2 000 pour djakarta');
  ok(t.includes('À vérifier : catégorie') && t.includes("Lignes à vérifier avant d'enregistrer : 1"), 'catégorie inconnue (sans IA) : « à vérifier »');
  t = await typed('hier taxi 2 000 par Orange Money');
  ok(t.includes('payés depuis Orange Money') && /Taxi/.test(t), 'compte cité : Orange Money');
  t = await reply('Paie le taxi avec le compte bancaire');
  ok(t.includes("D'accord, Taxi payé avec Compte bancaire."), 'réponse « paie le taxi avec le compte bancaire »');
  t = await reply('bof');
  ok(t.includes("Je n'ai pas bien compris"), 'réponse incomprise : on le dit, sans rien changer');
  t = await reply('laisse tomber');
  ok(t.includes("C'est annulé : rien n'a été enregistré."), '« laisse tomber » : annulé');
  t = await typed('30 000 en eau, 2 000 eau, 500 eau');
  ok((t.match(/Pour l'eau/g) || []).length === 1, '3 mots ambigus : une question à la fois');
  await btn("Facture d'eau").click(); await p.waitForTimeout(400);
  await btn('Eau à boire').click(); await p.waitForTimeout(400);
  t = await text();
  ok(t.includes("Lignes à vérifier avant d'enregistrer : 1") && (await btn('Eau à boire').count()) === 0, 'au plus 2 questions : la 3e ligne reste « à vérifier »');

  // Mélange revenu + épargne + dépense, puis proposition de répartition du salaire.
  const n2 = await historyCount();
  t = await typed("J'ai reçu mon salaire 250 000, j'ai mis 50 000 de côté et payé 10 000 de transport hier avec le compte bancaire");
  ok(t.includes('Revenus : 250 000 FCFA.') && t.includes('Épargne : 50 000 FCFA.') && t.includes('Dépenses : 10 000 FCFA.') && t.includes('Je les enregistre ?'), 'mélange : revenu + épargne + dépense, compte d’épargne trouvé');
  await btn('Tout valider').click(); await p.waitForTimeout(800);
  t = await text();
  ok(t.includes("C'est fait : 3 opérations enregistrées.") && t.includes('Voulez-vous répartir ce salaire dans vos enveloppes ?'), 'salaire : répartition PROPOSÉE');
  await btn('Voir la répartition').click(); await p.waitForTimeout(300);
  ok((await text()).includes("Proposition seulement : rien n'est modifié dans vos enveloppes."), 'répartition affichée, jamais appliquée');
  // Le compteur de l'Historique ne compte que entrées et sorties : le versement (transfert) n'y est pas.
  ok((await historyCount()) === n2 + 2, 'Historique : revenu et dépense comptés (le versement d’épargne est un transfert)');
  ok(/Compte épargne/.test(await text()), 'versement d’épargne visible dans l’Historique (transfert vers le compte épargne)');

  // Catégorie sans enveloppe : « En créer une ? », une seule fois.
  t = await typed('dette 5 000');
  await btn('Tout valider').click(); await p.waitForTimeout(800);
  t = await text();
  ok(/Vous n'avez pas d'enveloppe pour .+\. En créer une \?/.test(t), 'catégorie sans enveloppe : « En créer une ? »');
  await btn("Créer l'enveloppe").click(); await p.waitForTimeout(1500);
  ok((await text()).includes('Nouvelle enveloppe') || (await text()).includes('Enregistrer'), 'écran d’enveloppe ouvert, prérempli');
  t = await typed('dette 2 000');
  await btn('Tout valider').click(); await p.waitForTimeout(800);
  ok(!(await text()).includes("Vous n'avez pas d'enveloppe pour"), '« En créer une ? » n’est proposé qu’une fois par catégorie');

  // ── 7. Réglages : montants non lus, puis mode silencieux (texte seul) ──
  const toggle = async (label) => { await p.getByRole('switch', { name: label }).first().click(); await p.waitForTimeout(500); };
  await go('/settings/notifications');
  await toggle('Lire les montants pendant la saisie vocale');
  await go('/'); await closeCelebration();
  await mark();
  await dictate('Taxi 2 000 et loyer 100 000');
  said = await spoken();
  ok(said.length === 1 && !/\d/.test(said[0]) && said[0].includes('Je les enregistre ?'), `montants non lus si le réglage est coupé : « ${(said[0] || '').slice(0, 120)} »`);
  ok((await text()).includes('Soit 102 000 FCFA au total'), '… mais toujours affichés');
  await go('/settings/notifications');
  await toggle('Mode silencieux (texte seulement)');
  await go('/'); await closeCelebration();
  await mark();
  await dictate('Taxi 2 000');
  ok((await spoken()).length === 0 && (await text()).includes("Je l'enregistre ?"), 'mode silencieux : réponse écrite seulement, rien n’est lu');

  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'CONVERSATION VOCALE : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 400)); process.exitCode = 1; await b?.close(); });
