/* Vérification générique de TOUS les champs visibles d'un écran. */
module.exports.checkAllInputs = async (p, screen, ok, opts = {}) => {
  const handles = await p.$$('input:not([type=checkbox]),textarea');
  const visible = [];
  for (const h of handles) if (await h.evaluate((e) => !!e.offsetParent && !e.disabled && !e.readOnly)) visible.push(h);
  if (!visible.length) { ok(!opts.expectInputs, `${screen} : aucun champ de saisie`); return 0; }
  await p.evaluate(() => document.querySelectorAll('input,textarea').forEach((e, i) => (e.dataset.audit = e.dataset.audit || 'a' + i + '_' + Math.random().toString(36).slice(2))));
  let n = 0;
  for (const h of visible) {
    const name = (await h.evaluate((e) => e.getAttribute('aria-label') || e.placeholder || '?'));
    const id = await h.evaluate((e) => e.dataset.audit);
    // Signature « stacking context » des ancêtres (équivalent web de la règle Fabric).
    const sig = () => h.evaluate((e) => {
      const out = []; let el = e.parentElement;
      for (let i = 0; el && i < 8; i++, el = el.parentElement) { const c = getComputedStyle(el); out.push([c.opacity, c.transform, c.boxShadow === 'none' ? 'none' : 'shadow', c.zIndex, c.pointerEvents, c.overflow, c.position].join(',')); }
      return out.join('|');
    });
    const before = await sig();
    const original = await h.inputValue();
    await h.scrollIntoViewIfNeeded(); await h.click(); await p.waitForTimeout(150);
    const focusedOk = await h.evaluate((e) => document.activeElement === e);
    const seen = new Set();
    for (let i = 0; i < 6; i++) { seen.add(await p.evaluate(() => document.activeElement?.dataset?.audit || document.activeElement?.tagName)); await p.waitForTimeout(150); }
    const during = await sig();
    const maxLen = await h.evaluate((e) => e.maxLength);
    const short = maxLen > 0 && maxLen - original.length < 3;
    if (short) { await h.fill(''); }
    const base = short ? '' : original;
    await p.keyboard.press('End');
    await p.keyboard.type(short ? '12' : '123', { delay: 30 });
    const typed = await h.inputValue();
    await p.keyboard.press('Backspace');
    const erased = await h.inputValue();
    await p.keyboard.type('7', { delay: 30 });
    const modified = await h.inputValue();
    for (let i = 0; i < (short ? 2 : 3); i++) await p.keyboard.press('Backspace');
    const restored = await h.inputValue();
    const stillSame = await p.evaluate((x) => !!document.querySelector(`[data-audit="${x}"]`), id);
    await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(100);
    const after = await sig();
    const d = (x) => x.replace(/\D/g, '');
    const digitsOk = short ? d(typed) === '12' && d(erased) === '1' && d(modified) === '17' : d(typed).endsWith('123') && d(erased).endsWith('12') && d(modified).endsWith('127');
    const problems = [];
    if (!focusedOk) problems.push('focus non obtenu');
    if (seen.size !== 1 || ![...seen][0]?.startsWith('a')) problems.push('focus instable ' + [...seen].join(','));
    if (before !== during || during !== after) problems.push('structure du conteneur modifiée au focus');
    if (!digitsOk) problems.push(`saisie [${typed}] [${erased}] [${modified}]`);
    if (restored.replace(/\s/g, '') !== base.replace(/\s/g, '')) problems.push(`effacement [${original}]→[${restored}]`);
    if (!stillSame) problems.push('champ remonté');
    ok(!problems.length, `${screen} › ${name} : focus, stabilité, saisie, effacement, modification${problems.length ? ' — ' + problems.join(' ; ') : ''}`);
    n++;
  }
  return n;
};
