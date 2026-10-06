/**
 * Non-régression du clignotement des champs (Android, Fabric).
 *
 * Reprend la règle de react-native/ReactCommon/.../ViewShadowNode.cpp :
 * le conteneur du champ ne doit JAMAIS changer de nature native
 * (aplati / « stacking context ») entre repos, focus et erreur — sinon Fabric
 * déplace le TextInput actif, Android lui retire le focus et le donne au
 * champ suivant, en boucle.
 */
import { describe, expect, it } from 'vitest';
import { fieldBoxProps } from '../src/components/ui/fieldStyle';
import { darkColors, lightColors } from '../src/theme/tokens';

type Props = ReturnType<typeof fieldBoxProps>;
const meaningful = (c: unknown) => typeof c === 'string' && c !== 'transparent' && c !== '';

/** Port fidèle des prédicats `formsStackingContext` / `formsView` de Fabric (props pertinentes). */
function nativeTraits(p: Props & { style: Record<string, unknown> }) {
  const s = p.style as Record<string, unknown>;
  const stacking =
    p.collapsable === false ||
    (s.opacity !== undefined && s.opacity !== 1) ||
    (Array.isArray(s.transform) && s.transform.length > 0) ||
    (s.zIndex !== undefined && s.position !== undefined && s.position !== 'static') ||
    s.display === 'none' ||
    s.overflow === 'hidden' ||
    meaningful(s.shadowColor) ||
    s.pointerEvents === 'none' ||
    s.pointerEvents === 'box-only';
  const view = stacking || meaningful(s.backgroundColor) || (typeof s.borderWidth === 'number' && s.borderWidth > 0);
  return { stacking, view };
}

describe('champ de saisie : arbre natif stable au focus', () => {
  const palettes = [lightColors, darkColors];
  const states = [
    { focused: false, error: false },
    { focused: true, error: false },
    { focused: false, error: true },
    { focused: true, error: true },
  ];

  it('repos, focus et erreur ont exactement la même nature native', () => {
    expect(palettes.length).toBeGreaterThan(0);
    for (const c of palettes) {
      const traits = states.map((st) => JSON.stringify(nativeTraits(fieldBoxProps(st, c as never, 12, 48) as never)));
      expect(new Set(traits).size, JSON.stringify(traits)).toBe(1);
    }
  });

  it('le conteneur est un vrai stacking context (jamais aplati)', () => {
    const t = nativeTraits(fieldBoxProps({ focused: false, error: false }, palettes[0] as never, 12, 48) as never);
    expect(t).toEqual({ stacking: true, view: true });
  });

  it('seules des valeurs neutres changent au focus', () => {
    const a = fieldBoxProps({ focused: false, error: false }, palettes[0] as never, 12, 48).style as Record<string, unknown>;
    const b = fieldBoxProps({ focused: true, error: false }, palettes[0] as never, 12, 48).style as Record<string, unknown>;
    const changed = Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    expect(changed.sort()).toEqual(['borderColor', 'shadowOpacity']);
  });

  it("l'ancien style (halo ajouté au focus) aurait échoué", () => {
    // Reproduction du style de la v1.4.0 : shadowColor présent uniquement au focus, sans collapsable.
    const old = (focused: boolean) => ({ collapsable: undefined, style: { borderWidth: 1.5, backgroundColor: '#fff', ...(focused ? { shadowColor: '#00685F' } : null) } });
    expect(nativeTraits(old(false) as never).stacking).toBe(false);
    expect(nativeTraits(old(true) as never).stacking).toBe(true);
  });
});
