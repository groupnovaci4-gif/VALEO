/*
 * IA qui comprend toute l'application (docs/ia-comprend-tout.md §7) — en mode démonstration :
 *  1. question de tontine, réponse calculée sur le téléphone (« Parler à DineroX » et feuille de saisie) ;
 *  2. mise de côté : carte de validation, rien d'écrit avant « Valider », puis « Annuler » du toast ;
 *  3. phrase ambiguë → une question avec les choix tirés des données ;
 *  4. demande interdite → « Je ne peux pas faire ça ici » + lien ;
 *  5. phrase non comprise (hors ligne, sans repli) → 3 exemples et « Saisir à la main ».
 */
const { BASE, launch, phraseField } = require('./env.js');
const S = process.argv[2] || '.';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
let b;
(async () => {
  b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const go = async (path, w = 3500) => { await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(w); };
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/\u2060/g, '').replace(/[\u00a0\u202f]/g, ' ');
  const btn = (name) => p.getByRole('button', { name, exact: true });
  const closeCelebration = async () => { const c = p.getByRole('button', { name: 'Continuer' }); if (await c.count()) { await c.first().click(); await p.waitForTimeout(300); } };
  const say = async (phrase) => {
    await p.getByPlaceholder('Écrivez comme vous parlez…').fill(phrase);
    await p.getByRole('button', { name: 'Confirmer', exact: true }).last().click(); await p.waitForTimeout(1500);
    return text();
  };
  /** Solde du compte d'épargne de la démo, lu dans la réponse calculée. */
  const savings = async () => {
    const t = await say('Combien sur mon épargne ?');
    const m = [...t.matchAll(/Sur vos comptes d'épargne \(\d+\) : ([\d ]+) FCFA/g)].pop();
    return m ? Number(m[1].replace(/\D/g, '')) : NaN;
  };

  await go('/'); await p.getByText('Tester sans données (démonstration)').click(); await p.waitForTimeout(5500); await closeCelebration();

  // ── 1. Question de tontine (une seule tontine dans la démo : pas de question) ──
  await go('/assistant'); await closeCelebration();
  let t = await say('Quand est-ce que je paie ma tontine ?');
  ok(/Tontine du bureau : (prochaine cotisation de|la cotisation de) 10 000 FCFA/.test(t), `tontine : prochaine cotisation calculée (« ${(t.match(/Tontine du bureau :[^\n]*/) ?? [''])[0]} »)`);
  t = await say('À quand mon tour ?');
  ok(/Tontine du bureau : (votre tour est le|vous avez déjà eu votre tour)/.test(t), 'tontine : « À quand mon tour ? »');

  // ── 2. Mise de côté : carte, rien avant « Valider » ; « Annuler » du toast ; puis validée pour de bon ──
  const before = await savings();
  ok(Number.isFinite(before), `épargne avant : ${before}`);
  const card = async () => {
    let tt = await say("Retire 100 000 de l'argent disponible pour le mettre en épargne");
    if (tt.includes('Depuis quel compte ?')) {
      for (const name of ['Cash', 'Compte bancaire', 'Espèces', 'Banque', 'Orange Money']) if (await btn(name).count()) { await btn(name).last().click(); break; }
      await p.waitForTimeout(800);
      tt = await text();
    }
    return tt;
  };
  t = await card();
  ok(/Mettre 100 000 FCFA de côté/.test(t) && t.includes('Argent disponible après'), 'carte : « Mettre 100 000 FCFA de côté », argent disponible après');
  ok((await savings()) === before, 'rien n’est écrit avant « Valider »');
  t = await card();
  await btn('Valider').last().click(); await p.waitForTimeout(500);
  ok((await text()).includes('Opération enregistrée'), 'après « Valider » : toast « Opération enregistrée »');
  await btn('Annuler').last().click(); await p.waitForTimeout(1200);
  ok((await savings()) === before, 'toast « Annuler » : la mise de côté est retirée');
  await card();
  await btn('Valider').last().click(); await p.waitForTimeout(6500);
  ok((await savings()) === before + 100_000, 'validée (sans « Annuler ») : épargne + 100 000');

  // ── 3. Ambiguïté : deux objectifs → une question, puis la réponse ──
  t = await say('Où en est mon objectif ?');
  ok(t.includes('Quel objectif ?') && (await btn('Ma moto').count()) > 0, 'ambiguïté : « Quel objectif ? » avec les objectifs de la démo');
  await btn('Ma moto').last().click(); await p.waitForTimeout(800);
  ok(/Ma moto : [\d ]+ FCFA sur [\d ]+ FCFA/.test(await text()), 'réponse après le choix : Ma moto, mis de côté sur la cible');

  // ── 4. Interdit ──
  t = await say('Supprime ma dernière dépense');
  ok(t.includes('Je ne peux pas faire ça ici.') && (await btn('Ouvrir Historique des opérations').count()) > 0, 'interdit : refusé, avec le lien vers l’écran');
  t = await say('Envoie 10 000 à Koffi par Orange Money pour moi');
  ok(t.includes('ne détient ni ne transfère jamais d\'argent'), 'argent réel : refusé (règle 20)');

  // ── 5. Feuille de saisie : même moteur ; phrase non comprise (mode local : pas de repli) ──
  await go('/entry?mode=keyboard'); await closeCelebration();
  await (await phraseField(p)).fill('Combien je dois ?'); await btn('Comprendre').click(); await p.waitForTimeout(1200);
  ok(/Vous devez [\d ]+ FCFA au total/.test(await text()), 'feuille de saisie : même moteur (« Combien je dois ? »)');
  await go('/entry?mode=keyboard'); await closeCelebration();
  await (await phraseField(p)).fill('Explique-moi ma situation comme à un enfant'); await btn('Comprendre').click(); await p.waitForTimeout(1200);
  t = await text();
  ok(t.includes("Je n'ai pas compris.") && t.includes('Saisir à la main'), 'non compris : 3 exemples et « Saisir à la main »');

  ok(!errs.length, `aucune erreur JS ${errs.slice(0, 2).join(' | ')}`);
  console.log(fails ? `ÉCHECS ${fails}` : 'IA : TOUT EST OK');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.log('ARRÊT ' + e.message); if (b) await b.close(); process.exit(1); });
