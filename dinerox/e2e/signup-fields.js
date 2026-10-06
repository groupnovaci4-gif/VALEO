const { BASE, launch } = require('./env.js');
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); };
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.getByText('Créer mon compte').first().click(); await p.waitForTimeout(800);
  // Marqueur sur chaque champ : un remontage le ferait disparaître.
  const total = await p.evaluate(() => { const l = document.querySelectorAll('input'); l.forEach((el, i) => (el.dataset.mark = 'm' + i)); return l.length; });
  const fields = [
    { label: 'Nom', exact: true, v: 'Konan', next: 'Prénom' },
    { label: 'Prénom', v: 'César', next: 'Adresse e-mail' },
    { label: 'Adresse e-mail', v: 'test' + Date.now() + '@example.com', next: 'Téléphone (facultatif)' },
    { label: 'Téléphone (facultatif)', v: '+225 07 07 07 07 07', next: 'Mot de passe' },
    { label: 'Mot de passe', exact: true, v: 'Motdepasse123', next: 'Confirmer le mot de passe' },
    { label: 'Confirmer le mot de passe', v: 'Motdepasse123', next: null },
  ];
  const active = () => p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  for (const f of fields) {
    const el = p.getByLabel(f.label, { exact: !!f.exact }).first();
    await el.tap(); await p.waitForTimeout(300);
    ok((await active()) === f.label, `${f.label} : focus obtenu au toucher`);
    // Stabilité : le focus ne doit pas bouger tout seul (symptôme de la vidéo).
    const seen = new Set();
    for (let i = 0; i < 10; i++) { seen.add(await active()); await p.waitForTimeout(200); }
    ok(seen.size === 1, `${f.label} : focus stable 2 s (${[...seen].join(', ')})`);
    await p.keyboard.type(f.v.slice(0, -2), { delay: 40 });
    await p.keyboard.type(f.v.slice(-2), { delay: 40 });
    ok((await el.inputValue()) === f.v, `${f.label} : saisie caractère par caractère conservée`);
    await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
    ok((await el.inputValue()) === f.v.slice(0, -2), `${f.label} : effacement`);
    await p.keyboard.type(f.v.slice(-2), { delay: 40 });
    ok((await el.inputValue()) === f.v, `${f.label} : modification`);
    if (f.next) {
      await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      ok((await active()) === f.next, `${f.label} : « Suivant » → ${f.next}`);
    }
  }
  // Toutes les valeurs conservées, aucun champ remonté.
  for (const f of fields) ok((await p.getByLabel(f.label, { exact: !!f.exact }).first().inputValue()) === f.v, `${f.label} : valeur conservée à la fin`);
  const marks = await p.evaluate(() => [...document.querySelectorAll('input')].filter((e) => e.dataset.mark).length);
  const now = await p.evaluate(() => document.querySelectorAll('input').length);
  ok(marks === total && now === total, `aucun remontage de champ (${marks}/${total} éléments d'origine, ${now} présents)`);
  await p.getByRole('switch').first().click();
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  try { await p.getByText('Dans quel pays vivez-vous actuellement ?').waitFor({ timeout: 10000 }); ok(true, 'compte créé → onboarding'); } catch { ok(false, 'compte créé → onboarding'); }
  ok(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  process.exitCode = fails ? 1 : 0;
  console.log(fails ? `ÉCHECS ${fails}` : 'CHAMPS : TOUT EST OK'); await b.close();
})();
