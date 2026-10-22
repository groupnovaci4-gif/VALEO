/*
 * Audit de mise en page : chaque écran, chaque feuille, à chaque taille de téléphone et avec
 * chaque barre système Android (application « bord à bord », SDK 57).
 *
 * Marges système SIMULÉES dans Chrome (`Emulation.setSafeAreaInsetsOverride` → CSS
 * `env(safe-area-inset-*)`, que react-native-safe-area-context lit comme les marges d'un vrai
 * téléphone), plus de fausses barres fixes qui CAPTENT le toucher, comme la barre de navigation.
 *
 * Échec si un élément interactif (bouton, lien, champ, onglet, interrupteur…) est :
 *  - sous une barre système (même en partie) ;
 *  - sous la barre d'onglets ;
 *  - recouvert par un autre élément ;
 *  - inatteignable, même après défilement ;
 * si un texte ne peut pas être lu (sous une barre, caché, hors de l'écran sans défilement),
 * ou si l'écran déborde horizontalement (contenu coupé). Une capture PNG par échec.
 *
 * Exige les émulateurs (inscription réelle pour les écrans du mode en ligne), comme les autres parcours.
 * LAYOUT_ONLY=<expression régulière> : n'audite que les scènes dont le nom correspond.
 */
const fs = require('fs');
const path = require('path');
const { BASE, launch, phraseField } = require('./env.js');
const S = process.argv[2] || '.';
const SHOTS = path.join(S, 'layout');
fs.mkdirSync(SHOTS, { recursive: true });
const ONLY = process.env.LAYOUT_ONLY ? new RegExp(process.env.LAYOUT_ONLY) : null;

const SIZES = [[320, 568], [360, 640], [360, 800], [393, 852], [412, 915], [430, 932]];
// [nom, marge haute, marge basse] : barre de gestes, barre à 3 boutons, encoche (caméra en haut).
const PROFILES = [['gestes', 24, 24], ['3-boutons', 24, 48], ['encoche', 48, 24]];

let fails = 0;
let scenes = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };

/* ───────────── Côté page : l'audit lui-même (aucune dépendance) ───────────── */
function audit() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const issues = [];
  const bars = [...document.querySelectorAll('[data-fake-bar]')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
  const shown = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !e.closest('[aria-hidden="true"]');
  // Couche active : la dernière fenêtre modale visible (feuille, célébration…), sinon tout l'écran.
  // Sinon, la couche sous le centre de l'écran : premier ancêtre positionné (absolu ou fixe) qui couvre
  // au moins la moitié de la fenêtre — l'écran affiché de la pile, ou une superposition (célébration,
  // verrouillage). Les écrans masqués dessous ne sont pas audités.
  const modals = [...document.querySelectorAll('[aria-modal="true"]')].filter(shown);
  const layerOf = (e) => {
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      const q = a.getBoundingClientRect();
      if ((s.position === 'absolute' || s.position === 'fixed') && q.width * q.height >= 0.5 * W * H && !a.closest('[data-fake-bar]')) return a;
    }
    return document.body;
  };
  const center = document.elementFromPoint(W / 2, H / 2);
  const root = modals.length ? modals[modals.length - 1] : center ? layerOf(center) : document.body;
  const tablist = [...document.querySelectorAll('[role="tablist"]')].find(shown);
  const tabbar = tablist ? tablist.parentElement : null;
  const describe = (e) => (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.innerText || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 50);
  const overlap = (a, b) => Math.min(a.x2, b.right) - Math.max(a.x1, b.left) > 1 && Math.min(a.y2, b.bottom) - Math.max(a.y1, b.top) > 1;
  // Partie réellement visible : rectangle coupé par chaque ancêtre qui masque son débordement, puis par la fenêtre.
  const clip = (e) => {
    const r = e.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      const q = a.getBoundingClientRect();
      if (s.overflowX !== 'visible') { x1 = Math.max(x1, q.left); x2 = Math.min(x2, q.right); }
      if (s.overflowY !== 'visible') { y1 = Math.max(y1, q.top); y2 = Math.min(y2, q.bottom); }
    }
    return { x1: Math.max(x1, 0), y1: Math.max(y1, 0), x2: Math.min(x2, W), y2: Math.min(y2, H) };
  };
  const mark = (e, kind) => {
    e.setAttribute('data-layout-fail', '1');
    issues.push(`${describe(e)} : ${kind}`);
  };

  const SEL = 'button,a[href],input,textarea,select,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=slider],[role=menuitem],[role=combobox]';
  const free = H - bars.reduce((n, b) => n + b.height, 0);
  for (const e of root.querySelectorAll(SEL)) {
    if (!shown(e) || e.closest('[data-fake-bar]')) continue;
    const r0 = e.getBoundingClientRect();
    if (r0.width < 1 || r0.height < 1) continue;
    // Fond d'une feuille (toute la fenêtre, « toucher pour fermer ») : pas un élément à atteindre.
    if (r0.width * r0.height > 0.85 * W * H) continue;
    e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const c = clip(e);
    if (c.x2 - c.x1 < 2 || c.y2 - c.y1 < 2) { mark(e, 'inatteignable (hors de l’écran, même après défilement)'); continue; }
    const cx = (c.x1 + c.x2) / 2;
    const cy = (c.y1 + c.y2) / 2;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) { mark(e, 'inatteignable'); continue; }
    if (hit.closest('[data-fake-bar]')) { mark(e, 'sous une barre système'); continue; }
    if (tabbar && tabbar.contains(hit) && !tabbar.contains(e)) { mark(e, 'sous la barre d’onglets'); continue; }
    if (e !== hit && !e.contains(hit) && !(hit.contains(e) && getComputedStyle(e).pointerEvents === 'none')) { mark(e, `recouvert par « ${describe(hit)} »`); continue; }
    // Même en partie : un bouton à moitié sous la barre de navigation est touché par le geste « Accueil ».
    if (c.y2 - c.y1 <= free && bars.some((b) => overlap(c, b))) { mark(e, 'en partie sous une barre système'); continue; }
    // Barre d'onglets : seulement si elle est réellement peinte au-dessus (une superposition peut la couvrir).
    const tb = tabbar && !tabbar.contains(e) ? tabbar.getBoundingClientRect() : null;
    if (tb && overlap(c, tb)) {
      const under = document.elementFromPoint((Math.max(c.x1, tb.left) + Math.min(c.x2, tb.right)) / 2, (Math.max(c.y1, tb.top) + Math.min(c.y2, tb.bottom)) / 2);
      if (under && tabbar.contains(under)) mark(e, 'en partie sous la barre d’onglets');
    }
  }

  // Texte coupé : tout texte visible doit pouvoir être lu (amené à l'écran par défilement si besoin),
  // ni sous une barre système, ni caché par un autre élément (écran trop haut et sans défilement).
  for (const e of root.querySelectorAll('*')) {
    if (e.closest('[data-fake-bar]') || e.hasAttribute('data-layout-fail') || !shown(e)) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r0 = e.getBoundingClientRect();
    if (r0.width < 1 || r0.height < 1) continue;
    e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const c = clip(e);
    if (c.x2 - c.x1 < 2 || c.y2 - c.y1 < 2) { mark(e, 'texte hors de l’écran (même après défilement)'); continue; }
    const hit = document.elementFromPoint((c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2);
    if (!hit) continue;
    if (hit.closest('[data-fake-bar]')) { mark(e, 'texte sous une barre système'); continue; }
    if (tabbar && tabbar.contains(hit) && !tabbar.contains(e)) { mark(e, 'texte sous la barre d’onglets'); continue; }
    if (e !== hit && !e.contains(hit) && !hit.contains(e)) mark(e, `texte caché par « ${describe(hit)} »`);
  }

  // Débordement horizontal : la page, puis tout élément coupé par son conteneur de défilement
  // (ou par la fenêtre). Un défilement horizontal voulu (rangée de puces) n'est pas un débordement.
  const page = document.scrollingElement;
  if (page.scrollWidth > W + 1) issues.push(`page : débordement horizontal (${page.scrollWidth} > ${W})`);
  const cut = [];
  for (const e of root.querySelectorAll('*')) {
    if (e.closest('[data-fake-bar]') || cut.some((p) => p.contains(e)) || !shown(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    let x1 = r.left, x2 = r.right, left = 0, right = W, intended = false;
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      const sx = s.overflowX === 'auto' || s.overflowX === 'scroll';
      const sy = s.overflowY === 'auto' || s.overflowY === 'scroll';
      if (sx && a.scrollWidth > a.clientWidth + 1) { intended = true; break; }
      if (sx || sy) { const q = a.getBoundingClientRect(); left = q.left; right = q.right; break; }
      // Masqué exprès par une carte (décor arrondi) : seule la partie visible compte.
      if (s.overflowX !== 'visible') { const q = a.getBoundingClientRect(); x1 = Math.max(x1, q.left); x2 = Math.min(x2, q.right); }
    }
    if (intended || x2 <= x1) continue;
    // Plus large que la place offerte par son parent (marges comprises) : la carte touche ou dépasse les bords.
    const par = e.parentElement;
    if (par && getComputedStyle(e).position !== 'absolute' && getComputedStyle(par).overflowX === 'visible') {
      const ps = getComputedStyle(par);
      const inner = par.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
      if (par.clientWidth > 0 && r.width > inner + 1) { cut.push(e); mark(e, `plus large que son conteneur (${Math.round(r.width)} > ${Math.round(inner)})`); continue; }
    }
    if (x2 > right + 1 || x1 < left - 1) { cut.push(e); mark(e, `débordement horizontal (${Math.round(x1)}→${Math.round(x2)}, écran ${Math.round(left)}→${Math.round(right)})`); }
  }
  return [...new Set(issues)];
}

/* ───────────── Côté test ───────────── */
async function setEnv(p, cdp, [w, h], [, top, bottom]) {
  await p.setViewportSize({ width: w, height: h });
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left: 0, right: 0 } });
  await p.evaluate(({ top, bottom }) => {
    for (const [side, size] of [['top', top], ['bottom', bottom]]) {
      let bar = document.querySelector(`[data-fake-bar="${side}"]`);
      if (!bar) {
        bar = document.createElement('div');
        bar.setAttribute('data-fake-bar', side);
        // Capte le toucher comme la barre de navigation Android (et la barre d'état).
        bar.style.cssText = `position:fixed;left:0;right:0;${side}:0;z-index:2147483647;background:rgba(0,0,0,.55);pointer-events:auto`;
        bar.addEventListener('click', (ev) => ev.stopPropagation(), true);
        document.body.appendChild(bar);
      }
      bar.style.height = `${size}px`;
    }
  }, { top, bottom });
  // Marges relues par le fournisseur de zones sûres (transition CSS de 50 ms), puis nouveau rendu.
  await p.waitForTimeout(400);
}

async function snap(p, file) {
  await p.evaluate(() => {
    const first = document.querySelector('[data-layout-fail]');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'instant' });
    for (const e of document.querySelectorAll('[data-layout-fail]')) e.style.outline = '3px solid #ff0040';
  });
  await p.screenshot({ path: file });
  await p.evaluate(() => {
    for (const e of document.querySelectorAll('[data-layout-fail]')) { e.style.outline = ''; e.removeAttribute('data-layout-fail'); }
  });
}

/** Audite l'état actuel de la page à toutes les tailles et avec toutes les barres système. */
async function scene(p, cdp, name, { sizes = SIZES, profiles = PROFILES } = {}) {
  if (ONLY && !ONLY.test(name)) return;
  scenes++;
  const bad = [];
  for (const size of sizes) {
    for (const prof of profiles) {
      await setEnv(p, cdp, size, prof);
      const issues = await p.evaluate(audit);
      if (!issues.length) continue;
      const tag = `${size[0]}x${size[1]}-${prof[0]}`;
      const file = path.join(SHOTS, `${name.replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '')}-${tag}.png`);
      await snap(p, file);
      bad.push(`   ${tag} : ${issues.slice(0, 4).join(' | ')}${issues.length > 4 ? ` (+${issues.length - 4})` : ''}`);
    }
  }
  const total = sizes.length * profiles.length;
  ok(bad.length === 0, `${name} — ${total - bad.length}/${total} combinaisons sans problème`);
  if (bad.length) console.log(bad.join('\n'));
}

/** Dossier de l'export : rend le stockage sécurisé disponible sur le web (pour afficher l'écran de verrouillage). */
async function enableSecureStore(ctx) {
  await ctx.route(/\/_expo\/static\/js\/web\/.*\.js$/, async (route) => {
    const res = await route.fetch();
    let body = await res.text();
    const i = body.indexOf('"node_modules/expo-secure-store/build/ExpoSecureStore.web.js"');
    const j = i > 0 ? body.lastIndexOf('={}}', i) : -1;
    if (j > 0 && i - j < 400) {
      const impl = '={getValueWithKeyAsync:async(k)=>localStorage.getItem("ss:"+k),setValueWithKeyAsync:async(v,k)=>localStorage.setItem("ss:"+k,v),deleteValueWithKeyAsync:async(k)=>localStorage.removeItem("ss:"+k)}';
      body = body.slice(0, j) + impl + body.slice(j + 3);
    }
    await route.fulfill({ response: res, body });
  });
}

let b;
(async () => {
  b = await launch();
  const errs = [];
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, locale: 'fr-FR' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('dialog', (d) => d.dismiss());
    const cdp = await ctx.newCDPSession(p);
    return { ctx, p, cdp };
  };
  const btn = (p, name) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
  const text = async (p) => (await p.evaluate(() => document.body.innerText)).replace(/[  ]/g, ' ');

  // ── 0. Les marges simulées arrivent bien dans l'application (barre d'onglets) ──
  const A = await mk();
  const go = async (route, w = 2500) => { await A.p.goto(BASE + route, { waitUntil: 'load' }); await A.p.waitForTimeout(w); };

  // ── 1. Déconnecté : accueil, inscription, connexion ──
  await go('/');
  await scene(A.p, A.cdp, 'welcome (déconnecté)');
  for (const r of ['/sign-in', '/sign-up', '/forgot-password', '/legal/privacy']) { await go(r); await scene(A.p, A.cdp, `${r} (déconnecté)`); }

  // ── 2. Démonstration : célébration d'une récompense, puis trophée à partager ──
  await go('/');
  await A.p.getByText('Tester sans données (démonstration)').click();
  await A.p.getByText('Nouvelle récompense !').waitFor({ timeout: 20000 });
  await A.p.waitForTimeout(1500);
  await scene(A.p, A.cdp, 'célébration d’une récompense (RewardCelebration)');
  await setEnv(A.p, A.cdp, [393, 852], PROFILES[0]);
  await btn(A.p, 'Partager mon trophée').first().click();
  await A.p.waitForTimeout(2500);
  await scene(A.p, A.cdp, 'share-trophy');

  // Contrôle : la barre d'onglets suit la marge basse simulée (preuve que l'application la lit).
  await go('/');
  const tabH = async (prof) => { await setEnv(A.p, A.cdp, [360, 640], prof); return A.p.evaluate(() => document.querySelector('[role="tablist"]').parentElement.getBoundingClientRect().height); };
  const h24 = await tabH(PROFILES[0]);
  const h48 = await tabH(PROFILES[1]);
  ok(Math.round(h48 - h24) === 24, `marges simulées lues par l’application (barre d’onglets ${Math.round(h24)} → ${Math.round(h48)} px)`);

  // ── 3. Tous les écrans (données de démonstration) ──
  const routes = [
    '/', '/budget', '/goals', '/more',
    '/accounts', '/accounts/demo_cash', '/accounts/edit', '/accounts/edit?id=demo_cash', '/accounts/edit?savings=1',
    '/admin', '/analysis', '/assets', '/assets/edit', '/assets/edit?id=demo_asset', '/assistant', '/budget/auto',
    '/calendar', '/categories', '/debts', '/debts/demo_debt', '/debts/edit', '/debts/edit?id=demo_debt',
    '/envelopes/demo_env_food', '/envelopes/edit', '/envelopes/edit?id=demo_env_food', '/family',
    '/goals/demo_goal_moto', '/goals/contribute?id=demo_goal_moto', '/goals/edit?id=demo_goal_moto', '/goals/new',
    '/independence', '/invite', '/invite-code', '/legal/privacy', '/legal/terms', '/notifications', '/obligations',
    '/recurring', '/recurring/edit', '/recurring/edit?id=demo_rec_rent', '/reports', '/reserve/demo_reserve', '/reserve/new',
    '/rewards', '/savings', '/savings/move', '/savings/move?mode=withdraw', '/savings/move?mode=adjust', '/score',
    '/seasons', '/seasons/new', '/settings', '/settings/data', '/settings/financial', '/settings/notifications',
    '/settings/profile', '/settings/security', '/simulate', '/subscription', '/tontines', '/tontines/demo_tontine',
    '/tontines/group/new', '/tontines/join', '/transaction/new?type=expense', '/transaction/new?type=transfer',
    '/transaction/demo_tx_1', '/transactions', '/withdraw', '/entry?mode=keyboard',
  ];
  for (const r of routes) {
    if (ONLY && !ONLY.test(r)) continue;
    await go(r);
    await scene(A.p, A.cdp, r);
  }

  // ── 4. Étapes et feuilles ──
  const step = async (name, fn) => {
    if (ONLY && !ONLY.test(name)) return;
    try { await setEnv(A.p, A.cdp, [393, 852], PROFILES[0]); await fn(); await scene(A.p, A.cdp, name); }
    catch (e) { ok(false, `${name} : ${e.message.split('\n')[0]}`); await A.p.screenshot({ path: path.join(SHOTS, `etape-${name.replace(/\W+/g, '_')}.png`) }); }
  };
  await step('/goals/new — objectif personnalisé (nom)', async () => { await go('/goals/new'); await A.p.getByText('Créer mon propre objectif', { exact: false }).first().click(); await A.p.waitForTimeout(600); });
  await step('/goals/new — objectif personnalisé (formulaire)', async () => { await A.p.getByPlaceholder('Ex. Acheter une machine à glace').fill('Audit'); await btn(A.p, 'Continuer').click(); await A.p.waitForTimeout(700); });
  // Argent disponible v2 : feuilles et cartes nouvelles.
  await step('/goals/new — origine du montant initial', async () => { await A.p.getByLabel('Montant de départ (facultatif)').first().fill('10000'); await A.p.waitForTimeout(600); });
  await step('/goals/new — origine hors de mes comptes (note)', async () => { await A.p.getByText('C\'est de l\'épargne hors de mes comptes', { exact: true }).first().click(); await A.p.waitForTimeout(600); });
  await step('feuille — complément (il manque de l’argent)', async () => {
    await go('/transaction/new?type=expense'); await A.p.getByLabel('Montant').first().fill('9000000');
    await A.p.getByText('Alimentation & boissons', { exact: true }).first().click(); await A.p.waitForTimeout(300);
    await btn(A.p, 'Enregistrer').last().click(); await A.p.waitForTimeout(1200);
  });
  await step('feuille — complément › « J’ai reçu de l’argent »', async () => { await btn(A.p, 'J\'ai reçu de l\'argent').last().click(); await A.p.waitForTimeout(900); });
  await step('feuille — corriger le solde', async () => { await go('/accounts/edit?id=demo_cash'); await btn(A.p, 'Corriger le solde').first().click(); await A.p.waitForTimeout(900); });
  await step('feuille — reste d’un compte désactivé', async () => { await go('/accounts/edit?id=demo_cash'); await A.p.getByRole('switch', { name: 'Compte actif' }).click(); await A.p.waitForTimeout(900); });
  await step('feuille — fermeture d’une poche (archiver un objectif)', async () => {
    await go('/goals/demo_goal_moto');
    // La confirmation (fenêtre du navigateur) est acceptée ici seulement : ailleurs, refusée.
    A.p.removeAllListeners('dialog'); A.p.once('dialog', (d) => { d.accept(); A.p.on('dialog', (x) => x.dismiss()); });
    await btn(A.p, 'Archiver').last().click(); await A.p.waitForTimeout(1200);
  });
  await step('/onboarding — étape 1', async () => { await go('/onboarding'); });
  await step('/onboarding — démarrage rapide', async () => { await go('/onboarding'); await btn(A.p, 'Démarrer rapidement').first().click(); await A.p.waitForTimeout(600); });
  await step('/onboarding — étape 2 (pied sur 2 rangées)', async () => { await go('/onboarding'); await btn(A.p, 'Continuer').last().click(); await A.p.waitForTimeout(800); });
  await step('feuille de saisie — voix (demande d’accord)', async () => { await go('/entry?mode=voice'); });
  await step('feuille — code PIN (réglages › sécurité)', async () => { await go('/settings/security'); await A.p.getByRole('switch').first().click(); await A.p.waitForTimeout(900); });
  await step('feuille — remboursement de dette', async () => { await go('/debts/demo_debt'); await btn(A.p, 'Enregistrer un remboursement').first().click(); await A.p.waitForTimeout(900); });
  await step('feuille — catalogue des catégories', async () => { await go('/categories'); await btn(A.p, 'Ajouter une catégorie du catalogue').first().click(); await A.p.waitForTimeout(900); });
  await step('/transaction/[id] — ajustement de solde (pied « Supprimer »)', async () => {
    await go('/savings/move?mode=adjust');
    await A.p.getByLabel('Solde réel aujourd\'hui').first().fill('123456');
    await A.p.getByLabel('Motif').first().fill('Audit'); // v2 §3.2 : motif obligatoire
    await btn(A.p, 'Enregistrer le nouveau solde').last().click(); await A.p.waitForTimeout(1500);
    const id = await A.p.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        // Opérations rangées par identifiant : "tx_…":{…,"type":"adjustment",…} (ordre des champs libre).
        const m = (localStorage.getItem(localStorage.key(i)) || '').match(/"(tx_[^"]+)":\{[^{}]*"type":"adjustment"/);
        if (m) return m[1];
      }
      return null;
    });
    if (!id) throw new Error('ajustement introuvable');
    await go(`/transaction/${id}`);
  });
  // IA qui comprend toute l'application : question « Lequel ? », carte de validation, réponse (assistant et feuille).
  const iaSay = async (phrase) => { await A.p.getByPlaceholder('Écrivez comme vous parlez…').fill(phrase); await btn(A.p, 'Confirmer').last().click(); await A.p.waitForTimeout(1500); };
  await step('IA — question « Depuis quel compte ? » (assistant)', async () => { await go('/assistant'); await iaSay('Mets 50 000 de côté'); });
  await step('IA — carte « Mettre de côté » (assistant)', async () => { await go('/assistant'); await iaSay('Mets 50 000 de Cash sur mon épargne'); });
  await step('IA — réponse et interdit (assistant)', async () => { await go('/assistant'); await iaSay('Quand est-ce que je paie ma tontine ?'); await iaSay('Supprime ma dernière dépense'); });
  await step('IA — carte dans la feuille de saisie', async () => { await go('/entry?mode=keyboard'); await (await phraseField(A.p)).fill('Mets 50 000 de Cash sur mon épargne'); await btn(A.p, 'Comprendre').click(); await A.p.waitForTimeout(1200); });
  await step('IA — non compris (feuille de saisie)', async () => { await go('/entry?mode=keyboard'); await (await phraseField(A.p)).fill('Explique-moi ma situation comme à un enfant'); await btn(A.p, 'Comprendre').click(); await A.p.waitForTimeout(1200); });
  await step('« Objectif atteint » (goals/[id])', async () => {
    await go('/goals/new'); await A.p.getByText('Créer mon propre objectif', { exact: false }).first().click(); await A.p.waitForTimeout(500);
    await A.p.getByPlaceholder('Ex. Acheter une machine à glace').fill('Audit atteint'); await btn(A.p, 'Continuer').click(); await A.p.waitForTimeout(700);
    await A.p.getByLabel('Montant cible').first().fill('1000');
    await A.p.getByRole('button', { name: "Créer l'objectif" }).or(A.p.getByRole('button', { name: 'Créer l’objectif' })).first().click(); await A.p.waitForTimeout(1500);
    await go('/goals');
    await btn(A.p, 'Ajouter de l’argent, Audit atteint').first().click(); await A.p.waitForTimeout(1200);
    // Nom exact et visible : l'onglet Objectifs (monté dessous) a un bouton « Modifier le montant » (D3).
    await A.p.getByLabel('Montant', { exact: true }).filter({ visible: true }).first().fill('1000');
    await btn(A.p, 'Enregistrer').last().click(); await A.p.waitForTimeout(2500);
    if (!(await text(A.p)).includes('Félicitations')) throw new Error('« Objectif atteint » non affiché');
  });

  // ── 5. Message (toast) d'une saisie : au-dessus du micro central ──
  if (!ONLY || ONLY.test('toast')) {
    for (const prof of PROFILES) {
      // Versement sur un objectif depuis l'onglet Objectifs : message « Contribution enregistrée ».
      await go('/goals');
      await setEnv(A.p, A.cdp, [360, 640], prof);
      await btn(A.p, 'Ajouter de l’argent, Ma moto').first().click(); await A.p.waitForTimeout(1200);
      await A.p.getByLabel('Montant', { exact: true }).filter({ visible: true }).first().fill('100');
      await btn(A.p, 'Enregistrer').last().click(); await A.p.waitForTimeout(700);
      // L'enregistrement ouvre la fiche de l'objectif : retour à l'onglet, message encore affiché (4 s).
      await btn(A.p, 'Retour').first().click(); await A.p.waitForTimeout(700);
      const g = await A.p.evaluate(() => {
        // Le message (toast) : zone « polite » posée en bas de l'écran, à la racine.
        const t = [...document.querySelectorAll('[role="alert"][aria-live="polite"]')].find((e) => getComputedStyle(e).position === 'absolute');
        const mic = [...document.querySelectorAll('[role="tablist"] [role="button"]')].find((e) => /opération/.test(e.getAttribute('aria-label') || '') && e.checkVisibility() && e.getBoundingClientRect().height > 0);
        if (!t || !mic) return null;
        const box = t.firstElementChild.getBoundingClientRect();
        // Haut réel du micro : le cercle dépasse au-dessus de la zone tactile (marge négative).
        const micTop = Math.min(...[mic, ...mic.querySelectorAll('*')].map((e) => e.getBoundingClientRect().top));
        return { toastBottom: Math.round(box.bottom), micTop: Math.round(micTop) };
      });
      const good = !!g && g.toastBottom <= g.micTop;
      if (!good) await A.p.screenshot({ path: path.join(SHOTS, `toast-360x640-${prof[0]}.png`) });
      ok(good, `message « Enregistré » (onglet Objectifs) au-dessus du micro central (360×640, ${prof[0]}) ${JSON.stringify(g)}`);
    }
  }

  // ── 6. Écran de verrouillage (code PIN) ──
  if (!ONLY || ONLY.test('verrouillage')) {
    const L = await mk();
    await enableSecureStore(L.ctx);
    await L.p.goto(BASE + '/', { waitUntil: 'load' }); await L.p.waitForTimeout(2500);
    await L.p.getByText('Tester sans données (démonstration)').click(); await L.p.waitForTimeout(6000);
    const cont = btn(L.p, 'Continuer'); if (await cont.count()) { await cont.first().click(); await L.p.waitForTimeout(400); }
    await L.p.goto(BASE + '/settings/security', { waitUntil: 'load' }); await L.p.waitForTimeout(2500);
    await L.p.getByRole('switch').first().click(); await L.p.waitForTimeout(800);
    for (const d of '12341234') { await btn(L.p, d).last().click(); await L.p.waitForTimeout(d === '4' ? 2500 : 150); }
    await L.p.goto(BASE + '/', { waitUntil: 'load' }); await L.p.waitForTimeout(3500);
    const locked = (await text(L.p)).includes('Code oublié');
    ok(locked, 'écran de verrouillage affiché (code PIN enregistré, application rouverte)');
    if (locked) await scene(L.p, L.cdp, 'écran de verrouillage (LockGate + PinPad)');
    await L.ctx.close();
  }

  // ── 7. Compte en ligne (émulateurs) : écrans réservés au mode en ligne ──
  if (!ONLY || ONLY.test('en ligne')) {
    const O = await mk();
    const og = async (route, w = 3000) => { await O.p.goto(BASE + route, { waitUntil: 'load' }); await O.p.waitForTimeout(w); };
    await og('/sign-up'); // inscription e-mail inchangée (la bienvenue propose le numéro)
    await O.p.getByLabel('Nom', { exact: true }).fill('Mise'); await O.p.getByLabel('Prénom').fill('Page'); await O.p.getByLabel('Adresse e-mail').fill(`layout${Date.now()}@ex.com`);
    await O.p.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123'); await O.p.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
    await O.p.getByRole('switch').first().click(); await btn(O.p, 'Créer mon compte').click();
    await O.p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 15000 }); await O.p.waitForTimeout(800);
    await scene(O.p, O.cdp, 'en ligne : onboarding après inscription');
    await setEnv(O.p, O.cdp, [393, 852], PROFILES[0]);
    await O.p.getByText('Plus tard', { exact: true }).click(); await O.p.getByText('Bonjour Page').first().waitFor({ timeout: 15000 }); await O.p.waitForTimeout(2000);
    // « / » : compte jamais déclaré → carte « argent disponible » de l'accueil (v2 §2).
    for (const r of ['/', '/invite-code', '/tontines/join', '/tontines/group/new', '/family', '/settings/data']) { await og(r); await scene(O.p, O.cdp, `en ligne : ${r}`); }
    await O.ctx.close();
  }

  console.log(`${scenes} scènes × ${SIZES.length} tailles × ${PROFILES.length} barres système`);
  ok(errs.length === 0, 'aucune erreur JS ' + errs.slice(0, 2).join(' | '));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'MISE EN PAGE : TOUT EST OK');
  await b.close();
})().catch(async (e) => { console.log('ARRÊT', e.message.slice(0, 300)); process.exitCode = 1; await b?.close(); });
