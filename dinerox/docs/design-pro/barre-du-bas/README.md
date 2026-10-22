# Barre du bas et cloche — décisions du fondateur (22/10)

| Décision | Preuve |
|---|---|
| Barre du bas EXACTEMENT comme la maquette (`.tab` de `docs/design-pro-maquette-finale/ecrans/accueil-*.html`) : clair = pilule « Saisir » #0F4A3A, micro blanc, fond crème #FFFCF7 ; sombre = pilule #4FB08F, micro foncé (#0B2A21), fond gris-brun #1D1B17 (plus le bleu nuit #0B1120), onglet actif #4FB08F | `src/theme/layout.ts › tabBarColors` ; `tests/barre-du-bas.test.ts` (rouge d'abord : 4 échecs, puis vert) ; images `accueil-*.png`, `budget-*.png` |
| Mêmes action, accessibilité, zone de toucher 48 dp | `tests/etape5-j.test.ts` (J4) ; e2e `layout-audit.js` vert |
| Pastille de la cloche = le nombre de « À lire · N » (un message regroupé compte pour 1) | `useToRead().unread = items.length` ; `tests/cloche.test.ts` (rouge d'abord, puis vert) ; e2e `coach-open.js` : « cloche = À lire · 11 » |

Cause de l'écart en sombre : la barre est dessinée hors de `DesignV2` et prenait les anciennes
couleurs du thème (fond #0B1120, onglet actif #14B8A6) ; la pilule utilisait `heroFrom`
(#123A2F en sombre).

Images : maquette à gauche (haut de la page + barre collée en bas, prise dans le PNG de la
maquette), application à droite (émulateur Android, 360 × 800 dp, mode démonstration).

- **Micro** : il est foncé dans l'application, comme demandé. Le HTML de la maquette le dessine
  en blanc, mais le blanc sur #4FB08F est peu lisible.
- **Pastille de la cloche** : elle affiche « 9+ » parce que la démo compte aujourd'hui plus de
  9 messages à lire (11 dans le e2e).
