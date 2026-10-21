# Planche des icônes (design-pro, direction B) — 2026-10-21

Rien n'est intégré dans l'application : c'est une planche à valider.

## Ouvrir la planche

```bash
# depuis dinerox/ : servir le dossier docs/design-pro (n'importe quel serveur statique)
npx --yes http-server docs/design-pro -p 8099   # ou : python3 -m http.server 8099 -d docs/design-pro
```

- planche complète : http://localhost:8099/icones/ (`?t=dark` en sombre, `?r=<n>` une rubrique) ;
- exemples : http://localhost:8099/directions/?board=icons, ou un écran :
  `directions/?d=b&s=home|entry&t=light|dark&card=c&icons=3d`.

Captures Android (Chrome de l'émulateur, page de 360 × 800 dp) : `android/planche-01.png` à
`planche-41.png` dans l'ordre de la planche, et `android/exemple-{home,entry}-{light,dark}.png`.

Figma « DineroX — Directions » : planche (nœud 4-2) et exemples (nœud 5-2).

## Inventaire

`inventaire.mjs` (source, commentée) → `resolve.mjs` → `data.json`. **381 icônes**, 18 rubriques :

| Rubrique | Nombre |
|---|---|
| Dépenses — catégories principales | 12 |
| Dépenses — sous-catégories (catalogue v2) | 83 |
| Dépenses — sous-catégories des autres pays | 31 |
| Dépenses — anciennes catégories système | 6 |
| Revenus | 16 |
| Comptes | 15 |
| Objectifs — familles | 7 |
| Objectifs — modèles | 25 |
| Réserve et moments forts | 7 |
| Tontines | 6 |
| Dettes et prêts | 6 |
| Écrans vides | 20 |
| Récompenses | 9 |
| Score | 7 |
| Pavés de l'accueil | 11 |
| Pavés de Plus | 26 |
| Coach, assistant et cartes | 16 |
| Navigation et actions | 78 |

Contenu en 3D : 229 lignes ; au trait (Ionicons) : 131 lignes (accueil, Plus, coach, navigation) ;
21 lignes « À CHOISIR » ; 9 lignes « logo officiel ? ».

## Bibliothèque retenue : Fluent Emoji 3D (Microsoft, licence MIT)

- **Couverture** : environ 1 500 objets (nourriture, transports, maison, santé, argent,
  école, fêtes, animaux…) ; 3dicons (CC0) n'en a qu'environ 120, sans plats, taxi, moto,
  médicaments ni mouton : il aurait fallu mélanger deux bibliothèques.
- **Un seul style** : même lumière, mêmes matières, même angle pour toutes les icônes.
- **Licence** : MIT, usage commercial autorisé ; seule obligation : garder la mention de
  licence (`fluent/LICENSE-fluentui-emoji.txt`, à reprendre dans les mentions de l'application).
- **Limites** (lignes « À CHOISIR ») : pas de famille en 3D, pas de bouteille de gaz, de charbon,
  de groupe électrogène, de maquis, de garba, de tontine, de jauge ; les sujets sensibles
  (funérailles, baptême) sont laissés à ton choix.
- **Teinte de peau** : les personnages (🧓, 🧑‍🏫, 🤲…) sont en teinte « par défaut » (jaune) ;
  Fluent existe aussi en 5 teintes. À décider : par défaut, ou une teinte foncée.

## Poids dans l'APK (WebP qualité 80, encodeur de Chrome, mesuré)

124 images distinctes (une image sert à plusieurs lignes : 🛡️, 🧾, 🏦…).

| | 1x (48 px) | 2x (96 px) | 3x (144 px) | Total |
|---|---|---|---|---|
| Propositions (124) | 174 Ko | 276 Ko | 422 Ko | **873 Ko** |
| Avec les 18 candidates « À CHOISIR » (142) | 198 Ko | 315 Ko | 481 Ko | 993 Ko |

Sous la limite de 1,5 Mo, sans sacrifice. Si besoin de gagner encore : ne livrer que 2x et 3x
(699 Ko ; Android réduit l'image pour les écrans 1x, sans perte visible à 48 dp).
