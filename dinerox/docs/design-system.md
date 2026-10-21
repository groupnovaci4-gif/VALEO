# Design system DineroX — design-pro, direction B (fait foi)

> **Design-pro, étape 3 (2026-10-21).** Direction **B — chaleureuse et locale**, choisie par le
> fondateur (`docs/design-pro/directions.md`) : fond sable, **vert profond uni** (une seule couleur
> de marque), encre chaude, Plus Jakarta Sans (titres, chiffre principal) + Inter (texte), chiffres
> tabulaires, grille 4/8, coins mesurés, une ombre de 1 dp au plus, aucun dégradé, aucun halo,
> aucun verre dépoli. Icônes : **contenu en 3D** (Fluent Emoji 3D, MIT, et icônes composées
> validées), **navigation et actions au trait** (Ionicons). Clair et sombre aussi soignés.
>
> Ce document reprend celui de la v2 (même numérotation, citée dans le code) : les sections
> **1 (couleurs), 2.1 (familles), 4 (rayons), 5 (élévation), 6 (icônes) et 8.4 / 8.15 / 8.17
> (carte, feuille, carte d'accueil)** sont celles de la direction B ; le reste (accessibilité,
> texte agrandi, états, barre d'onglets…) est inchangé. Aperçu : `docs/design-system-preview.html`.
>
> Migration : le thème v2 (`<DesignV2>`) porte désormais la direction B ; les écrans encore hors v2
> restent inchangés jusqu'à leur lot (étape 4). Règles de CLAUDE.md conservées : `Field` /
> `AmountField` seuls champs, règle 13 (aucune propriété de « stacking context » qui varie autour
> d'un `TextInput`), `Screen`, `Sheet`, `t()`, `brand.ts`, aucune nouvelle dépendance native.
> `src/core` : inchangé, sauf UNE donnée de démonstration demandée par le fondateur (« Canal+ »
> rangée dans « Abonnements streaming »).

---

## 0. Principes

1. **Le montant d'abord.** Sur chaque écran, le chiffre qui répond à la question de l'utilisateur
   est le plus gros élément, lisible d'un coup d'œil, jamais rétréci pour tenir.
2. **Un écran, une action principale.** Un seul bouton plein (`primary`) par écran. Tout le reste
   est secondaire ou tertiaire.
3. **Toujours un mot à côté de l'icône.** Seules exceptions : « Retour » et « Fermer » (conventions
   universelles), qui gardent un libellé pour le lecteur d'écran.
4. **Lisible au soleil.** Thème clair = référence. Texte ≥ 4,5:1, contours de contrôles ≥ 3:1,
   aucune information portée par la couleur seule.
5. **Calme et chaleureux (direction B).** Fond sable, vert profond UNI de la marque, ocre pour
   « épuisé », rouge pour l'alerte seulement, vert pour l'argent qui entre ; une dépense est à
   l'encre (signe « − »). **Aucun dégradé**, aucun halo coloré, aucun verre dépoli, pas de violet.
6. **Léger pour les petits téléphones** (Android d'entrée de gamme, 360 × 800). Deux familles de
   police embarquées (hors ligne), une ombre de 1 dp au plus, aucune animation coûteuse.
7. **Un seul chiffre principal par écran**, aligné à gauche ; le reste en lignes « libellé —
   montant ». Des cartes de poids différent, jamais une grille de pavés tous pareils.
8. **Pas de signes de produit « fait par une IA »** : ni ✨, ni emoji dans l'interface (hors
   icônes de contenu), ni badges partout, ni coins trop ronds, ni pastels au hasard, ni « magique »
   ou « intelligent » dans les textes.

---

## 1. Couleurs

### 1.1 Jetons sémantiques

Les écrans n'utilisent **que** ces rôles (`src/theme/tokens.ts`, `lightV2Base` / `darkV2Base`).
Aucune valeur hexadécimale ou `rgba()` hors de ce fichier (sauf les couleurs des opérateurs,
qui sont des DONNÉES : `src/config/operators.json`).

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| `background` | `#F4F1EA` | `#13120F` | fond d'écran |
| `surface` | `#FFFCF7` | `#1D1B17` | cartes, feuilles, barre d'onglets |
| `surfaceAlt` | `#EDE7DC` | `#29261F` | fond pressé, zones groupées, segments |
| `border` | `#EAE3D7` | `#2C2923` | **séparateurs décoratifs uniquement** |
| `borderStrong` | `#8A8072` | `#827869` | contours des champs, puces, cases (≥ 3:1) |
| `text` | `#1F1C17` | `#F3EFE7` | texte principal, montants neutres |
| `textMuted` | `#564E43` | `#BDB4A4` | texte secondaire |
| `textSubtle` | `#6E6558` | `#A0968A` | légendes, textes d'aide |
| `primary` | `#0F4A3A` | `#4FB08F` | une seule couleur de marque : bouton principal, lien, onglet actif |
| `primaryPressed` | `#0A3529` | `#6CC4A4` | bouton principal pressé |
| `onPrimary` | `#FFFFFF` | `#0B2A21` | texte sur `primary` |
| `primaryContainer` | `#DCEBE3` | `#183A30` | bouton secondaire, puce choisie, pastille de marque |
| `onPrimaryContainer` | `#0B3329` | `#BFE6D6` | texte sur `primaryContainer` |
| `accent` | `#8A5A00` | `#D9A441` | or : réussites, récompenses (texte/icône) |
| `accentContainer` | `#F6EBD3` | `#3A2E16` | fond or (badge réussite) |
| `onAccentContainer` | `#3A2700` | `#F3DDB0` | texte sur fond or |
| `income` | `#1E7A45` | `#63C08A` | entrée d’argent (+) |
| `expense` | `#1F1C17` | `#F3EFE7` | dépense : signe « − » à l’encre (pas de rouge) |
| `success` | `#1E7A45` | `#63C08A` | états réussis |
| `successBg` | `#E1EFE4` | `#16301F` |  |
| `onSuccess` | `#FFFFFF` | `#0B2014` |  |
| `warning` | `#8A5A00` | `#D9A441` | « épuisé », à régulariser (ocre) |
| `warningBg` | `#F6EBD3` | `#3A2E16` |  |
| `danger` | `#B3261E` | `#EF6B61` | alerte (dépassement, solde négatif) |
| `dangerBg` | `#F8E3DF` | `#3D1A16` |  |
| `onDanger` | `#FFFFFF` | `#2B0805` |  |
| `info` | `#2F5373` | `#9DB7D3` | information (rare) |
| `infoBg` | `#E3EAF0` | `#1E2A36` |  |
| `heroFrom` | `#0F4A3A` | `#123A2F` | carte (b) : vert UNI (= heroTo) |
| `heroTo` | `#0F4A3A` | `#123A2F` | = heroFrom (aucun dégradé) |
| `onHero` | `#FFFFFF` | `#FFFFFF` | montant sur la carte héros |
| `onHeroMuted` | `#C9DED6` | `#C9DED6` | libellés sur la carte (b) |
| `heroTrack` | `rgba(255,255,255,0.24)` | `rgba(255,255,255,0.20)` | fond de barre dans la carte héros |
| `heroLine` | `rgba(255,255,255,0.10)` | `rgba(255,255,255,0.10)` | filet de 1 dp de la carte (b) |
| `heroPattern` | `rgba(255,255,255,0.10)` | `rgba(255,255,255,0.10)` | motif de losanges de la carte (b) |
| `track` | `#EAE3D7` | `#2C2923` | fond des barres de progression |
| `disabledBg` | `#E6E0D5` | `#29261F` | contrôles désactivés (sans opacité) |
| `onDisabled` | `#655C50` | `#9A907F` |  |
| `inverseSurface` | `#2A2620` | `#EDE7DC` | toasts |
| `onInverse` | `#F4F1EA` | `#1F1C17` |  |
| `overlay` | `rgba(31,28,23,0.5)` | `rgba(0,0,0,0.7)` | fond des feuilles modales |
| `chartIncome` | `#1E7A45` | `#63C08A` | séries de graphiques |
| `chartExpense` | `#B4561C` | `#E08A4F` |  |
| `iconHalo` | `transparent` | `#3A362F` | rond derrière les icônes de contenu (sombre seulement) |

Anciens rôles (`hero`, `secondary`, `primaryLight`…) : alias des rôles ci-dessus (`withAliases`).

### 1.2 Contrastes vérifiés

Calcul WCAG 2.1 sur les jetons réels (`tests/design-tokens.test.ts` vérifie 48 paires dans chaque
thème, `tests/design-pro-system.test.ts` la carte (b)). **0 échec.** Texte ≥ 4,5:1 ; contours et
graphiques ≥ 3:1. Extrait :

| Paire | Usage | Clair | Sombre | Min |
|---|---|---|---|---|
| `text` / `background` | texte principal | 15.05 | 16.33 | 4.5 |
| `text` / `surface` | texte sur carte | 16.59 | 14.99 | 4.5 |
| `textMuted` / `surface` | texte secondaire | 8.00 | 8.37 | 4.5 |
| `textMuted` / `surfaceAlt` | secondaire sur fond pressé | 6.65 | 7.35 | 4.5 |
| `textSubtle` / `surface` | légende | 5.60 | 5.91 | 4.5 |
| `textSubtle` / `background` | légende sur fond | 5.08 | 6.44 | 4.5 |
| `borderStrong` / `surface` | contour de champ/puce | 3.79 | 3.96 | 3 |
| `borderStrong` / `background` | contour sur fond | 3.44 | 4.32 | 3 |
| `primary` / `surface` | lien, onglet actif | 9.96 | 6.50 | 4.5 |
| `primary` / `background` | lien sur fond | 9.03 | 7.08 | 4.5 |
| `onPrimary` / `primary` | texte du bouton principal | 10.19 | 5.81 | 4.5 |
| `onPrimaryContainer` / `primaryContainer` | bouton secondaire | 11.21 | 9.19 | 4.5 |
| `income` / `surface` | entrée d’argent (+) | 5.23 | 7.73 | 4.5 |
| `expense` / `surface` | dépense (−, à l’encre) | 16.59 | 14.99 | 4.5 |
| `danger` / `dangerBg` | alerte | 5.31 | 5.12 | 4.5 |
| `warning` / `warningBg` | épuisé (ocre) | 5.01 | 5.90 | 4.5 |
| `success` / `successBg` | réussite | 4.50 | 6.39 | 4.5 |
| `info` / `infoBg` | information | 6.64 | 7.05 | 4.5 |
| `accent` / `surface` | récompense | 5.79 | 7.64 | 4.5 |
| `onHero` / `heroFrom` | chiffre et textes sur la carte (b) | 10.19 | 12.56 | 4.5 |
| `onHeroMuted` / `heroFrom` | libellés sur la carte (b) | 7.23 | 8.91 | 4.5 |
| `onInverse` / `inverseSurface` | message flottant | 13.33 | 13.80 | 4.5 |
| `chartIncome` / `surface` | graphique : entrées | 5.23 | 7.73 | 3 |
| `chartExpense` / `surface` | graphique : dépenses | 4.78 | 6.48 | 3 |
| `primary` / `track` | barre de progression | 7.99 | 5.48 | 3 |

Filet et motif de la carte (b) : décoratifs (≈ 1,5:1 voulu, aucun texte).

### 1.3 Couleurs choisies par l'utilisateur (comptes, enveloppes, catégories)

`pickableColors` reste une donnée (les couleurs déjà enregistrées ne changent pas). La règle
d'affichage change (audit T4) :

- la pastille est **remplie** de la couleur choisie ;
- le glyphe est **blanc ou encre** (`#121A17`), celui des deux qui contraste le plus.
  Fonction pure `glyphOn(color)` dans `src/theme` (testée) ;
- résultat sur les 13 couleurs de `pickableColors` : contraste du glyphe entre **4,2 et 10,4:1**
  (contre 1,9:1 aujourd'hui pour `#EAB308`).

**Catégories avec emoji** (décision 2) : l'emoji reste le glyphe de la catégorie, posé sur une
pastille teintée à 16 % de sa couleur. L'emoji ne porte jamais seul une information : le nom de
la catégorie est toujours écrit à côté.

### 1.4 Les 12 couleurs en dur de l'audit

| Fichier | Valeur en dur | Devient |
|---|---|---|
| `app/rewards.tsx` (`TIER`) | `#F5B301`, `#9AA5B1`, `#C27C46` | `medalGold`, `medalSilver`, `medalBronze` |
| `app/rewards.tsx` | `#FFFFFF` (glyphe) | `onMedal` |
| `features/coach/RewardCelebration.tsx` | mêmes trois métaux | mêmes jetons |
| `features/coach/RewardsTile.tsx` | `#F5B301`, `#FFFFFF` | `medalGold` + `onMedal`, `onHero` |
| `app/(tabs)/goals.tsx` | `rgba(255,255,255,0.18)` (pastille %) et `0.22` (barre) | `onHeroMuted` en texte sur pastille `heroTrack` ; barre sur `heroTrack` |
| `app/independence.tsx` | `rgba(255,255,255,0.22)` | `heroTrack` |
| `app/(tabs)/more.tsx` | `rgba(255,255,255,0.16)` | `heroTrack` |
| `app/budget/auto.tsx` | 9 couleurs d'enveloppes (`#6366F1`…) | `envelopeDefaults` dans les jetons (mêmes teintes, issues de `pickableColors` : ce sont des **données** enregistrées sur l'enveloppe, la teinte ne change pas) |
| `(tabs)/_layout.tsx` | `brand.colors.green` | `primary` |
| `theme/tokens.ts` (`shadow.fab`, `glowGreen`) | `#F59E0B`, `#14B8A6` | ombres neutres (§5) |

`brand.ts` garde ses couleurs pour l'écran de démarrage et l'icône (`app.config.ts`), comme
aujourd'hui ; les écrans n'y puisent plus.

---

## 2. Typographie

### 2.1 Familles (deux au lieu de trois)

| Famille | Graisses | Rôle |
|---|---|---|
| **Plus Jakarta Sans** | 700 (800 pour le chiffre de la carte d'accueil) | titres, chiffre principal |
| **Inter** | 400, 500, 600, 700 | texte courant, libellés, montants en liste (chiffres alignés) |

Les deux familles sont **embarquées** (fonctionnent hors ligne). Montants : chiffres tabulaires
(`fontVariant: ['tabular-nums']`), jamais de police à chasse fixe.

JetBrains Mono est retiré (police de code, peu chaleureuse, 2 fichiers de moins au démarrage). Les
montants en liste utilisent Inter avec `fontVariant: ['tabular-nums']`.
⚠️ **À vérifier sur appareil à l'étape 3** : que la version d'Inter embarquée par
`@expo-google-fonts/inter` expose bien les chiffres tabulaires sur Android. Repli si ce n'est pas
le cas : chiffres proportionnels d'Inter (l'alignement à droite suffit pour des listes courtes).
Aucune nouvelle dépendance dans les deux cas.

### 2.2 Échelle

Tailles **de base** (texte système à 100 %). Plancher absolu : **13 px** pour toute information.

| Jeton | Taille / interligne | Graisse | Famille | Usage |
|---|---|---|---|---|
| `amountHero` | 36 / 44 | 800 | Jakarta | LE chiffre de l'écran (reste par jour, reste du budget, solde) |
| `amountL` | 28 / 34 | 700 | Jakarta | chiffre principal d'une carte (objectif, réserve, épargne) |
| `amountM` | 20 / 26 | 700 | Inter tnum | chiffres secondaires (prévu, dépensé, solde sous le héros) |
| `amountS` | 16 / 22 | 600 | Inter tnum | montants dans les listes |
| `titleL` | 24 / 30 | 700 | Jakarta | titre d'écran sur l'accueil |
| `titleM` | 20 / 26 | 700 | Jakarta | titre d'écran (en-tête), titre de feuille |
| `titleS` | 17 / 24 | 700 | Jakarta | titre de section, titre de carte |
| `body` | 16 / 24 | 400 | Inter | texte courant |
| `bodyStrong` | 16 / 24 | 600 | Inter | titres de ligne, phrases clés |
| `label` | 15 / 20 | 600 | Inter | boutons, libellés de champ, puces |
| `small` | 14 / 20 | 400 | Inter | sous-titres de ligne, détails |
| `caption` | 13 / 18 | 500 | Inter | légendes, aides, badges |
| `tab` | 12 / 16 | 600 | Inter | libellés d'onglets |

Supprimés : `display`, `h1`…`h3`, `numeric`, `numericLg`, **`overline`** (plus de petites
majuscules espacées). Alias temporaires pendant la migration, comme pour les couleurs.
Plus aucun `toUpperCase()` sur un texte affiché (audit T12) : casse normale partout.

### 2.3 Texte agrandi par le système (décision 5)

Plafond par rôle, appliqué dans `Text` (et `Field`) :

| Rôles | Plafond | Taille max atteinte |
|---|---|---|
| `body`, `bodyStrong`, `label`, `small`, `caption`, `amountS`, `tab` | **1,6** | 16 → 25,6 px ; 13 → 20,8 px |
| `titleS`, `titleM`, `amountM` | 1,4 | 20 → 28 px |
| `titleL`, `amountL` | 1,25 | 28 → 35 px |
| `amountHero` | 1,15 | 36 → 41 px |

Les textes déjà très grands montent moins : à 160 %, un montant héros de 57 px ne tiendrait pas
sur 288 dp utiles (320 − 2 × 16), alors qu'à 41 px il dépasse déjà largement le seuil « grand
texte » (24 px). Tout ce qui est en dessous de 20 px suit le réglage jusqu'à 160 %.

**Règles de mise en page pour tenir à 160 % sur 320 dp :**

1. **Jamais de troncature d'un montant.** Plus de `numberOfLines={1}` + `adjustsFontSizeToFit`
   avec `minimumFontScale={0.6}`. Le composant `Amount` (§8.3) autorise une réduction de
   **0,85 au maximum**, en dernier recours, pour `amountHero`/`amountL` seulement.
2. **Devise plus petite que le nombre.** `Amount` affiche « 1 250 000 » en taille montant et
   « FCFA » en taille `titleS`. Découpage à l'affichage seulement : `formatMoney` (inchangé)
   renvoie `nombre + espace insécable + symbole` ; le composant sépare sur cette espace. Si le
   format ne correspond pas (devise préfixée, « $1,250 »), le texte est affiché d'un bloc.
   Calcul de place : « 12 500 000 » en 41 px Jakarta 800 ≈ 220 dp + « FCFA » en 24 px ≈ 60 dp
   = 280 dp ≤ 288 dp.
3. **Lignes de liste qui basculent.** Quand `PixelRatio.getFontScale() ≥ 1,3`, une ligne
   « titre à gauche / montant à droite » passe en **deux étages** : titre et sous-titre, puis le
   montant en dessous, aligné à droite. Plus de colonnes de 85 dp.
4. **Grilles qui s'empilent.** Au-delà de 1,3, les grilles à 2 ou 3 colonnes (stats, pavé de
   raccourcis) passent à une colonne.
5. **Libellés sur plusieurs lignes.** Boutons, puces, titres de ligne : `numberOfLines` retiré
   (ou ≥ 2). Un bouton peut grandir en hauteur, jamais rétrécir son texte.
6. **Barre d'onglets.** Voir §8.13 : largeur des emplacements proportionnelle aux libellés.

---

## 3. Espacements

Pas de 4. Aucune valeur libre dans les écrans.

| Jeton | Valeur | Usage type |
|---|---|---|
| `xs` | 4 | icône ↔ texte serré, padding de badge |
| `sm` | 8 | entre éléments d'une ligne, entre puces |
| `md` | 12 | padding interne d'une ligne, entre champ et aide |
| `lg` | 16 | **marge d'écran**, padding de carte, entre cartes |
| `xl` | 24 | entre sections, padding de la carte héros |
| `xxl` | 32 | avant le bouton principal d'un formulaire |
| `xxxl` | 48 | bas de liste (au-dessus de la barre d'onglets : 48 + hauteur barre) |

Marge latérale fixe : **16 dp**. Largeur utile minimale de référence : **288 dp**.

## 4. Rayons

Direction B (`radiusV2`) :

| Jeton | Valeur | Usage |
|---|---|---|
| `card` | 16 | cartes, lignes groupées |
| `control` | 12 | champs, boutons, puces, messages, touches du pavé |
| `sheet` | 20 | haut des feuilles |
| `icon` | 12 | pastilles carrées d'icône au trait |
| `hero` | 16 | carte d'accueil (b) |
| `sm` / `pill` | 8 / 999 | badges ; ronds (icônes de contenu en sombre, interrupteurs) |

Plus aucun rayon de 24 en v2 : des coins mesurés, pas « trop ronds ».

Les boutons passent de « pilule » à **12** : plus de place pour le texte sur 320 dp, et une
forme distincte des puces de filtre.

## 5. Élévation

Direction B : **une seule ombre, de 1 dp**, neutre (`shadowB` : encre chaude 8 %, rayon 2,
décalage 1, `elevation: 1`), **en clair seulement**. En sombre, aucune ombre : la surface
(`#1D1B17`) se distingue du fond (`#13120F`). Les cartes n'ont plus de contour.

| Niveau | Clair | Sombre | Usage |
|---|---|---|---|
| 0 | rien (filets `border` entre les lignes) | rien | listes, lignes groupées |
| 1 | `surface` + `shadowB` | `surface` | cartes, carte d'accueil (b) (+ filet clair de 1 dp) |
| 2 | ombre `raised` (inchangée) | `surfaceAlt` | feuilles, bouton central |

Supprimés : `glowGreen`, `fab` coloré. **Règle 13** : aucune ombre, opacité, transformation ni
`zIndex` ne varie selon un état sur un conteneur qui englobe un `TextInput` ; le halo de focus
actuel (`fieldStyle.ts`, seule l'opacité d'ombre varie) est conservé tel quel.

## 6. Icônes

Deux familles, deux rôles (planche validée : `docs/design-pro/icones/`, 381 icônes) :

**Contenu → 3D.** Catégories et sous-catégories, comptes, objectifs, réserve, tontines, dettes,
écrans vides, récompenses, score : **Fluent Emoji 3D** (Microsoft, MIT — mention de licence à
garder : `docs/design-pro/icones/fluent/LICENSE-fluentui-emoji.txt`) et **icônes composées**
validées par le fondateur (famille, famille + cœur, tontine, garba, restaurant, moto rouge ;
emplacement `bonbonne_gaz` provisoire). Teinte de peau **moyenne-foncée**. Fichiers WebP
1x / @2x / @3x dans `assets/icons3d/` (134 icônes, ≈ 954 Ko).

- Composant : `ContentIcon` (`src/components/ui/ContentIcon.tsx`) ; choix PUR et testé :
  `iconSlugFor` / `transactionIconIds` (`contentIconMap.ts`), registre généré par
  `node scripts/content-icons.mjs` depuis la planche (`contentIcons.generated.ts`).
- Ordre de recherche : l'**emoji choisi par la personne** (objectif, réserve), puis les
  **identifiants** — dans une liste d'opérations, la **sous-catégorie** quand l'opération en a
  une, sinon la catégorie (Canal+ → « Abonnements streaming » → 📺) — puis l'emoji de la
  catégorie. Inconnue (catégorie ou emoji créés par la personne) : rendu actuel, rien n'est perdu.
- Clair : l'icône seule, sans pastille. **Sombre : léger rond clair `iconHalo` (#3A362F)** derrière
  chaque icône de contenu (l'icône y occupe 78 %).
- Décorative : masquée au lecteur d'écran, le texte voisin porte le sens.

**Comptes Mobile Money → logo de l'opérateur** (décision et responsabilité du fondateur ;
sources : `docs/design-pro/logos/SOURCES.md`) : Orange Money, MTN MoMo, Moov Money, Wave, Airtel ;
Free Money en **pastille** (initiales + couleur). Composant `AccountMark`. Un réglage PAR
opérateur, dans une donnée : `src/config/operators.json` (`affichage: "logo" | "pastille"`),
remplaçable sans nouvelle version par `config/operators/items/v1` (Firestore, écrit par
l'administrateur ; `services/operatorsConfig.ts`). Fichiers non modifiés, coins arrondis à
l'affichage seulement. Google et WhatsApp : logos Ionicons, comme avant.

**Navigation, actions, pavés de l'accueil et de Plus, cartes du coach → au trait.** Ionicons
uniquement, un seul trait. Contour (`-outline`) au repos, plein quand actif.

- Tailles : **20** dans une ligne de texte, **24** dans un bouton, une ligne ou un onglet,
  **28** pour le bouton central ; icônes de contenu : **40** (listes), **36** (enveloppes),
  **48** (saisie).
- **Toujours accompagnée d'un texte visible**, sauf « Retour », « Fermer » et la **cloche** de
  l'accueil (décision du fondateur, 2026-10-21) : libellé lecteur d'écran obligatoire, zone 48 dp.
- **Pas d'emoji dans l'interface** : ni dans les textes d'alerte (🔴, ⚠️, 💡, 🎯, 🎉 retirés des
  `ins.*`, décision du 2026-10-21), ni dans les états vides, ni dans les titres. Les emoji restent
  des DONNÉES (catégories, objectifs, réserves) et s'affichent en 3D quand l'icône existe.
- Correspondances fixes (une icône = un sens) : `arrow-down` revenu, `arrow-up` dépense,
  `swap-horizontal` transfert, `time` historique, `mic` saisir, `wallet` comptes,
  `trophy` récompenses, `chatbubble-ellipses` assistant (plus de `sparkles`), `grid` onglet
  « Plus », `warning` attention, `alert-circle` erreur, `checkmark-circle` succès.

## 7. Mouvement

- Feuilles : glissement 200–250 ms (natif de `Modal`). Bouton pressé : changement de **couleur**
  (pas d'opacité, pas d'échelle) — même règle partout, et sans risque pour la règle 13.
- Aucune animation en boucle. Si « réduire les animations » est activé (`AccessibilityInfo`),
  les célébrations de récompense s'affichent sans animation.

---

## 8. Composants et états

Chaque composant a **exactement** les variantes listées. Toute zone touchable : **48 × 48 dp
minimum** (taille visible, pas seulement `hitSlop`).

### 8.1 `Button`

| Variante | Apparence | Quand |
|---|---|---|
| `primary` | fond `primary`, texte `onPrimary` | **une seule fois par écran** |
| `secondary` | fond `primaryContainer`, texte `onPrimaryContainer` | actions importantes mais non principales |
| `tertiary` *(remplace `ghost`)* | sans fond, texte `primary` souligné au toucher, padding conservé | actions mineures, « Tout voir » |
| `destructive` *(remplace `danger`)* | fond `dangerBg`, texte `danger` ; version pleine (`danger`/`onDanger`) seulement dans une confirmation | supprimer, se déconnecter |

`success` est retiré : « J'ai reçu la cagnotte » devient un `primary` (c'est l'action principale
de cette ligne) avec l'icône `cash-outline`.

- Hauteur **48** (52 dans un pied d'écran). `small` ne réduit **que** le padding horizontal.
- Icône 24 à gauche + texte `label`. Texte sur 2 lignes si besoin, jamais tronqué.
- États : **repos** ; **pressé** (`primaryPressed` / `surfaceAlt`) ; **désactivé**
  (`disabledBg`/`onDisabled`, et un texte d'aide sous le bouton explique pourquoi) ;
  **chargement** (roue à la place de l'icône, texte conservé, largeur inchangée, `busy`).
- Retour haptique conservé.

### 8.2 `IconButton`

Réservé à « Retour » et « Fermer ». Ailleurs, `Button` (icône + texte). La cloche et l'avatar de
l'en-tête deviennent des `HeaderAction`. La cloche : icône + texte existant (`notif.title`,
« Notifications »). À ≥ 130 %, les actions de l'en-tête passent sur une **deuxième ligne** sous le
titre plutôt que de perdre leur texte. L'avatar (initiales) reste seul : c'est une convention
(« moi ») et il porte le libellé `set.title`.
Le bouton « Écouter » (règle 17) devient icône + « Écouter » (clé existante `coach.listen`),
toujours **à côté** de la zone cliquable.

### 8.3 `Amount` *(nouveau)*

Affiche **tous** les montants. Entrées : valeur en unités mineures, devise, taille
(`hero`/`L`/`M`/`S`), ton (`neutral`, `income`, `expense`, `onHero`), `signed`, `hidden`.

- Formatage via `formatMoney` / `useMoney` uniquement (règle 5) ; découpage nombre/devise à
  l'affichage (§2.3).
- Ton : la couleur **et** le signe (« − » / « + ») portent le sens ; jamais la couleur seule.
- `hidden` : affiche « •••••• » et lit **« Montant masqué »** (nouvelle clé acceptée).
- Lecteur d'écran : un seul élément qui lit le montant complet (« 1 250 000 francs CFA » tel que
  formaté).

### 8.4 `Card`

| Variante | Apparence |
|---|---|
| `default` | `surface`, rayon 16, padding 16, sans contour, `shadowB` en clair |
| `interactive` | idem + fond `surfaceAlt` au toucher + chevron si elle ouvre un écran |
| `hero` | carte (b), voir §8.17 — **une seule par écran** |
| `tone` (`warning`/`danger`/`success`/`info`) | fond `…Bg`, filet gauche 4 dp de la couleur, icône + texte |

- Libellé d'accessibilité **composé** quand la carte est cliquable : nom + montant + état
  (ex. « Nourriture, reste 12 000 FCFA, attention »). Les sélecteurs e2e qui visent ces cartes
  par leur libellé seront mis à jour **dans le même commit** (vérifié avec `npm run e2e`).
- Le `Pressable` brut ne sert plus à fabriquer une carte (21 fichiers concernés).

### 8.5 `ListRow` *(ex-`Row`)*

- Hauteur min **56**. Gauche : pastille 40 (§1.3). Centre : titre `bodyStrong` (2 lignes),
  sous-titre `small` `textMuted` (2 lignes). Droite : `Amount size="S"` ou badge, puis chevron.
- Bascule en deux étages à ≥ 130 % (§2.3).
- États : repos, pressé (`surfaceAlt`), désactivé (`onDisabled`).
- Action secondaire (appui long) : toujours **doublée** d'une action visible ailleurs (fiche de
  détail) ; l'appui long reste un raccourci.

### 8.6 `Field` / `AmountField`

- Libellé `label` (15) **au-dessus**, toujours visible (jamais seulement un « placeholder ») ;
  « (facultatif) » après le libellé si le champ l'est (clé existante `common.optional`).
- Boîte : hauteur 52, rayon 12, `surface`, contour **1,5 dp `borderStrong`** (épaisseur fixe).
- **Focus** : contour `primary` + halo dont **seule l'opacité** varie (inchangé, règle 13).
- **Erreur** : contour `danger` + ligne sous le champ : icône `alert-circle` 16 + texte
  `caption` `danger`, annoncée (`polite`).
- Aide : `caption` `textSubtle`.
- `AmountField` : nombre en `amountL`, devise à droite ; l'aperçu formaté sous le champ passe en
  `small` `text` (au lieu de 12 px gris).
- `collapsable={false}` conservé ; aucune propriété de stacking context ne dépend de l'état.

### 8.7 `Chip` et `ChipGroup`

- Hauteur **48**, rayon 12, contour `borderStrong`, texte `label`.
- Choisie : fond `primaryContainer`, texte `onPrimaryContainer`, icône `checkmark` à gauche
  (le choix ne repose pas sur la couleur seule).
- Catégorie : emoji ou icône de la catégorie à gauche (décision 2).

### 8.8 `Segmented`

- **3 segments maximum**, hauteur 48. Au-delà : `ChipGroup`.
- Choisi : fond `surface` + texte `text` gras + icône `checkmark` (variante `filled` : `primary`).
- À ≥ 130 % : les segments passent sur deux lignes de texte si besoin, jamais tronqués.

### 8.9 `Badge`

- Texte `caption` (13), padding 4 × 8, rayon 8. Toujours un **mot** (jamais un point de couleur
  seul ; le « ● » des textes actuels est remplacé par une icône).
- Tons strictement sémantiques : `neutral`, `success`, `warning`, `danger`, `info`, `accent`.
  Le rang n°1 d'un objectif passe en `neutral`/`primary` (plus de rouge).
- « PRO » via `t()` (nouvelle clé acceptée).

### 8.10 `InlineMessage` *(ex-`Banner`)*

- Variante de `Card tone` : icône + texte `small` + action `tertiary` facultative.
- Rôle `alert` **seulement** pour `danger` ; sinon région `polite` (audit C14).
- Utilisé pour : hors-ligne, en attente de synchro, e-mail à vérifier, démo, erreurs dans la page.

### 8.11 États d'écran : `StateView` *(regroupe `EmptyState`, `ErrorState`, `Loading`)*

| État | Composition | Textes |
|---|---|---|
| **Chargement** | roue `primary` + texte visible ; pour une liste : 3 lignes-squelettes `surfaceAlt` | `common.loading` |
| **Vide** | pastille 64 `primaryContainer` + icône Ionicons 28 `primary` + titre `titleS` + texte `body` `textMuted` + 1 bouton `primary` | textes existants de chaque écran (les emoji sont retirés, décision 2) |
| **Erreur** *(décision 4)* | pastille `dangerBg` + `alert-circle` + titre + message + bouton `secondary` « Réessayer » | `error.generic` / `error.network` / message du `useRunAction` ; `common.retry` |
| **Succès** | message `success` dans la page, à l'endroit de l'action (ex. sous le bouton « Enregistrer »), + toast 4 s | textes de toast existants |

**Erreurs dans la page** : tout écran qui enregistre affiche l'erreur **près du bouton** (et la
garde jusqu'à la prochaine tentative ou modification), en plus du toast. Tout écran qui charge à
distance (profil financier, abonnement, assistant, export, admin) affiche `StateView` erreur à la
place du contenu. Mise en œuvre côté écran uniquement : `useRunAction` renvoie déjà le résultat ;
on mémorise le message dans l'état de l'écran. `useRunAction` est dans `src/hooks` (hors
périmètre interdit) ; s'il faut lui faire renvoyer le message, ce sera un changement minimal et
signalé.

### 8.12 `Toast`

- Succès **4 s**, attention/erreur 6 s (inchangé), avec action « Voir »/« Annuler » si fournie.
- Placé au-dessus du pied d'écran actif (bouton principal) et de la barre d'onglets.
- Fond `inverseSurface`, icône d'état + texte `small`.

### 8.13 Barre d'onglets (5 emplacements, décision 1)

```
┌──────────────────────────────────────┐
│  ⌂        ◔       (🎤)      ⚑     ▦  │
│Accueil  Budget   Saisir  Objectifs Plus│
└──────────────────────────────────────┘
```

- Libellés `tab` 12 px, **agrandis jusqu'à 160 %** (`tabBarAllowFontScaling` activé).
- Hauteur = 56 + hauteur du libellé agrandi ; icônes 24 ; onglet actif : icône pleine +
  libellé gras + couleur `primary`.
- **Bouton central** : rond 56, `primary`, glyphe `mic` 28, surélevé de 12 dp, avec le libellé
  **« Saisir »** (`entry.mic`) **sous** le bouton, aligné sur les autres libellés.
- Icône « Plus » : `grid` (au lieu de `sparkles`).
- **Tenir à 160 % sur 320 dp** : à 19 px, les libellés mesurent environ Accueil 67, Budget 65,
  Saisir 50, Objectifs 81, Plus 38 dp ≈ 301 dp pour 320 dp disponibles. Avec 5 emplacements
  **égaux** (64 dp), « Objectifs » et « Accueil » ne tiennent pas. Proposition : emplacements de
  largeur **proportionnelle** à leur libellé (barre personnalisée via `tabBar`, sans nouvelle
  dépendance), padding de 2 dp. Repli si un libellé déborde : **tous** les libellés de la barre
  passent à 0,85 (≥ 16 px, soit 136 %), pour garder une taille homogène.
  Mesure dans `docs/design-system-preview.html` (Chrome, Inter web) : à 360 px tout tient jusqu'à
  160 % ; à 320 px tout tient jusqu'à 130 %, et à 160 % les libellés débordent de 1 à 3 px, d'où
  le repli. **À confirmer sur Android à l'étape 3.**

### 8.14 En-tête d'écran

- **Onglets** : titre d'écran `titleM` à gauche (lisible, plus de sur-titre de 11 px), à droite
  la **cloche seule** (zone 48 dp, libellé « Notifications » lu par le lecteur d'écran, plus
  écrit — décision du fondateur, 2026-10-21) et l'avatar. Logo + nom de marque (`brand.name`) **sur l'accueil
  seulement**.
- **Écrans empilés** : bouton retour = **flèche seule** (`chevron-back`), zone de 48 dp, libellé
  « Retour » (`common.back`) lu par le lecteur d'écran mais pas écrit (décision du 2026-10-12) ;
  titre `titleM` (2 lignes max) + au plus une action à droite (icône + texte). Les Réglages
  suivent ce modèle (audit P1).
- Un seul titre par écran : plus de `h1` qui répète le titre de l'en-tête (Budget, Objectifs,
  Plus, Réglages).

### 8.15 `Sheet`

Inchangée sur le fond (clavier, `inline`, retour Android). **Rayon 20** en haut. Poignée en
`borderStrong`, titre `titleM`, bouton « Fermer » 48. Le contenu au-dessus de la ligne de flottaison = l'action
principale de la feuille.

### 8.16 `ProgressBar`

Hauteur 8 (10 dans une carte héros), fond `track` ; couleur de remplissage selon l'état **et**
toujours un mot ou un pourcentage à côté (« 82 % · Attention »).

### 8.17 Carte d'accueil (b) — `GradientCard` en v2

Retenue par le fondateur (2026-10-21) ; la version (c) est abandonnée.

- Fond **vert profond UNI** (`heroFrom` = `heroTo` : `#0F4A3A` clair, `#123A2F` sombre), rayon 16,
  padding 20, **filet clair de 1 dp** (`heroLine`), **motif discret** de losanges au trait fin dans
  le coin haut droit (`heroPattern`, 10 %, décoratif, masqué au lecteur d'écran), ombre `shadowB`
  en clair seulement. Aucun dégradé.
- Textes : `onHero` blanc (10,19:1 / 12,56:1), `onHeroMuted` `#C9DED6` (7,23:1 / 8,91:1) — AA.
- Rien ne disparaît : Reste par jour, phrase, Argent disponible, Mis de côté (« dont … hors de vos
  comptes »), Total de vos comptes, ligne par autre devise, « Masquer les montants » ;
  « Comment c'est calculé ? » sous la carte. Les cartes qui dépendent de la situation (solde
  négatif, salaire attendu, « payé ? », « À régulariser », épargne à la source, tontine, coach,
  « À venir ce mois », autre devise…) gardent leur place : maquette `docs/design-pro/directions/`
  `?d=b&s=homefull`.

---

## 9. Accessibilité (règles transverses)

1. Ordre de lecture = ordre visuel ; le chiffre principal est lu en premier après le titre.
2. Chaque élément touchable : rôle, libellé, état (`selected`, `disabled`, `busy`, `checked`).
3. Libellés composés pour les cartes et lignes cliquables (§8.4).
4. Textes ≤ 160 % testés sur 320 dp : liste de contrôle à chaque lot (§12).
5. Aucune information par la couleur seule : signe, icône ou mot à côté.
6. `alert` réservé aux erreurs ; le reste en `polite`.
7. Les montants masqués lisent « Montant masqué ».

---

## 10. Maquettes décrites (320 × 640 dp, thème clair, texte à 100 %)

### 10.1 Accueil

Objectif : comprendre sa situation en 3 secondes, saisir en un geste, ouvrir l'Historique en un
toucher (décision 1).

```
┌────────────────────────────────────┐
│ [D] DineroX     🔔Notifications (AK)│  en-tête de marque (accueil seulement)
│ Bonjour Awa 👋                      │  titleL
│ ┌────────────────────────────────┐ │
│ │ Reste par jour   [👁 Masquer les│ │  CARTE HÉROS (dégradé) — onHeroMuted
│ │                    montants]    │ │  bouton tertiaire icône + texte, 48 dp
│ │ 4 300 FCFA                      │ │  amountHero (nombre) + devise en titleS
│ │ Il vous reste 4 300 FCFA par    │ │  bodyStrong onHero
│ │ jour jusqu'au 31 oct.           │ │
│ │ ───────────────────────────     │ │
│ │ Solde disponible   182 500 FCFA │ │  small + amountM (passe en 2 étages à ≥130 %)
│ └────────────────────────────────┘ │
│ ⚠ Tontine du quartier : 10 000 FCFA│  Card tone=warning (si échéance ≤ 3 j)
│   dans 2 jours                  ›  │
│ ┌────────────┐┌──────────────────┐ │
│ │🕘 Historique││⇄ Revenu/Transfert│ │  raccourcis secondaires 48 dp, icône+texte
│ └────────────┘└──────────────────┘ │
│ Dernières opérations     Tout voir │  titleS + tertiary → /transactions
│ 🍛 Marché         −2 500 FCFA      │  ListRow, montant amountS + signe
│ ⛽ Carburant       −5 000 FCFA      │
│ 💼 Salaire       +150 000 FCFA     │
├────────────────────────────────────┤
│  ⌂      ◔      (🎤)     ⚑      ▦   │
│Accueil Budget  Saisir Objectifs Plus│
└────────────────────────────────────┘
   … en défilant :
   Ce mois-ci (Revenus, Dépenses, Épargne, Budget dispo : 4 lignes ListRow, montant à droite)
   Votre coach (résumé) · Conseil du jour (une carte, « Écouter » à côté)
   Enveloppes à surveiller (2 lignes max + « Tout voir »)
   Objectifs prioritaires (1 ligne par objectif : nom, montant, % + mot d'état)
   Mes récompenses · Assistant (2 ListRow, plus de seconde carte en dégradé)
```

Choix et justifications :

- **Action principale = le micro central « Saisir »** ; la bulle « Dites-moi ce que vous avez
  dépensé… » est conservée pour les nouveaux utilisateurs (règle 18 : elle se réduit après 10
  saisies), mais **sans ses deux boutons** : toute la bulle ouvre la voix, un lien clavier reste
  (icône `keypad` + texte existant `entry.prompt.type`, « Saisir »). Elle se place sous la carte héros.
- **Historique en un toucher** : raccourci visible dès le premier écran (texte existant
  `history.title`), en plus de « Tout voir ».
- Les tuiles Revenu / Dépense / Transfert deviennent **un** raccourci secondaire (« Dépense » est
  déjà le cas par défaut du micro). Aucune fonction retirée : chaque type reste accessible.
- Solde disponible **dans** la carte héros, sous le reste par jour : deux chiffres, une carte.
- Le détail (« Revenus − dépenses − à venir ») et la source « déclaré » passent sous le héros,
  en `small`, repliables (« Comment c'est calculé ? » : **texte nouveau → proposition §11**).
- Les puces « Synchronisé » et « Données protégées » disparaissent de l'accueil ; l'état n'apparaît
  qu'en cas de problème (`InlineMessage` hors-ligne / en attente). « Données protégées » reste
  dans Réglages > Sécurité.
- États : *déficit* → la carte héros devient une `Card tone="danger"` (pas de dégradé) avec le
  montant du déficit en `amountHero` `danger` ; *revenu à renseigner* → carte héros avec bouton
  `primary` « Indiquer mon revenu » (texte existant `daily.needsIncome.cta`) ; *vide* (aucune
  opération) → `StateView` vide dans « Dernières opérations ».

À 160 % : la carte héros garde le montant sur une ligne (41 px + devise 24 px), la phrase passe
sur 3–4 lignes ; « Solde disponible » passe en deux étages ; les deux raccourcis s'empilent.

### 10.2 Saisie (feuille, mode clavier)

```
┌────────────────────────────────────┐
│ ▬                                  │  poignée borderStrong
│ Nouvelle opération         ✕ Fermer│  titleM
│ ┌──────────────┬─────────────────┐ │
│ │ 🎤 Parler     │ ⌨ Clavier ✓     │ │  Segmented 48 dp
│ └──────────────┴─────────────────┘ │
│ ┌──────────────┬─────────────────┐ │
│ │↑ Sortie d'argent✓│↓ Entrée d'argent│  Segmented 48 dp
│ └──────────────┴─────────────────┘ │
│            12 500 FCFA             │  amountHero, couleur expense + signe
│ ┌────────┐┌────────┐┌────────┐     │
│ │   1    ││   2    ││   3    │     │  touches 58 dp, chiffres 24 px
│ └────────┘└────────┘└────────┘     │
│   4  5  6  /  7  8  9  /  000 0 ⌫  │
│ Touchez une catégorie pour         │  label
│ enregistrer                        │
│ [🍛 Nourriture] [🚕 Transport]     │  Chip 48 dp, emoji de catégorie gardé
│ [🏠 Logement]  [📱 Crédit]          │
│ ▸ Autres façons de saisir          │  repli : phrase écrite, simulateur,
│                                    │  « Plus de détails », « Autres actions »
└────────────────────────────────────┘
```

- Action principale : **toucher une catégorie enregistre** (comportement actuel inchangé).
- La phrase écrite, le simulateur, « Plus de détails » et « Autres actions » passent dans un
  repli fermé par défaut. Libellé du repli : **texte nouveau → proposition §11**.
- Mode voix : bouton micro 84 dp + texte dessous (déjà le bon modèle), messages d'erreur micro en
  `InlineMessage` (icône + texte), quota en `caption`.
- Carte de confirmation : champ incertain = contour `warning` + icône `help-circle` + mot ;
  bouton `primary` « Tout valider » en pied de feuille.
- Erreur d'enregistrement : `InlineMessage danger` au-dessus du bouton, en plus du toast.
- À 160 % : pavé en 3 colonnes conservé (touches plus hautes), puces sur plusieurs lignes, montant
  plafonné à 1,15.

### 10.3 Budget

```
┌────────────────────────────────────┐
│ Budget          🔔Notifications (AK)│  titleM (un seul titre)
│ octobre 2026                       │  small textMuted
│ ┌────────────────────────────────┐ │
│ │ Restant                         │ │  CARTE HÉROS (`budget.remaining`)
│ │ 48 000 FCFA                     │ │  amountHero
│ │ ███████████████░░░░  82 %       │ │  barre heroTrack + % en mot
│ │ Prévu        Dépensé            │ │  small onHeroMuted
│ │ 260 000 FCFA 212 000 FCFA       │ │  amountM (empilés à ≥ 130 %)
│ └────────────────────────────────┘ │
│ ⚠ Nourriture : 90 % utilisés    ›  │  Card tone=warning (alertes)
│ Enveloppes   + Nouvelle enveloppe  │  titleS + tertiary
│ 🍛 Nourriture                      │  ListRow : nom
│   Reste 12 000 FCFA                │  amountS
│   ⚠ Presque épuisée                │  mot d'état + icône
│   ██████████████████░░  90 %       │
│ 🚕 Transport                       │
│   Reste 20 000 FCFA                │
│   ✓ Dans les limites               │
│   ████████░░░░░░░░░░░░  40 %       │
└────────────────────────────────────┘
```

- Le reste du budget passe de 14 px à 36 px (audit B1). Le titre affiché est `budget.title`
  (« Budget ») une seule fois, dans l'en-tête.
- Action principale contextuelle : sans enveloppe → `StateView` vide avec `primary`
  « Proposer un budget » (texte existant `env.empty.cta`) ; avec enveloppes → pas
  de `primary` en haut, « Nouvelle enveloppe » en `tertiary`.
- Chaque enveloppe : mot d'état (textes existants `env.state.*`) + icône, jamais la couleur seule.
- Dépassement : montant `expense` avec « − » et `env.over` (texte existant).

---

## 11. Propositions de texte (à valider une par une)

Aucune n'est appliquée. Je vous les présenterai une à une au moment du lot concerné ; les voici
pour information.

| # | Où | Situation | Proposition |
|---|---|---|---|
| T-1 | Accueil, sous la carte héros | Le détail du calcul est toujours affiché | Repli intitulé « Comment c'est calculé ? » |
| T-2 | Saisie, mode clavier | Options secondaires repliées | Repli intitulé « Autres façons de saisir » |
| T-3 | Raccourci de l'accueil | Revenu et Transfert fusionnés en un raccourci | Libellé « Revenu ou transfert » (sinon : garder deux raccourcis avec `tx.income` et `tx.transfer`, sans nouveau texte) |

Déjà acceptés (décision 3) : « Saisir » sous le micro (clé existante), « Montant masqué »
(nouvelle clé, fr + en), badge « PRO » via `t()` (nouvelle clé, fr + en).
T-2 accepté le 2026-10-11 : « Autres façons de saisir » / « Other ways to enter » (clé
`entry.otherWays`) ; chaque option repliée reste à un toucher une fois le repli ouvert.

---

## 12. Application (étapes 3–4)

0. **Créer la branche `design-v2`** à partir de `claude/admiring-ritchie-h611hm` avant toute
   modification de code.
1. **Lot 0 — jetons et composants** : `tokens.ts` (nouveaux rôles + alias temporaires),
   `Text` (échelle, plafonds), `Amount`, `Button`, `Card`, `ListRow`, `Field`, `Chip`, `Badge`,
   `InlineMessage`, `StateView`, barre d'onglets, en-tête. `glyphOn` + test unitaire.
2. **Lot 1 — accueil (pilote)** → arrêt pour votre test sur téléphone.
3. **Lots suivants** : saisie → budget → historique → objectifs/réserve/épargne → tontines →
   réglages/plus → autres écrans → suppression des alias.

**Contrôle à chaque lot** : `npm run check` vert (types, lint à zéro, tests) ; `npm run e2e`
(textes et libellés d'accessibilité) ; vérification visuelle à 320 dp, texte à 100 % et 160 %,
thème clair et sombre ; règle 13 relue sur chaque conteneur de `TextInput` modifié.

### 12.1 Design-pro — étape 3 (2026-10-21) : fait

- **Jetons** : `lightV2Base` / `darkV2Base` = direction B ; `radiusV2` (cartes 16, contrôles 12,
  feuilles 20, icônes 12) ; `shadowB` (1 dp, clair seulement) ; rôles `heroLine`, `heroPattern`,
  `iconHalo`. Vérifiés par `tests/design-tokens.test.ts` et `tests/design-pro-system.test.ts`.
- **Composants partagés (en v2 seulement — les écrans hors v2 ne changent pas)** : `GradientCard`
  = carte (b) ; `Card` sans contour, ombre 1 dp ; `Sheet` rayon 20 ; `ContentIcon` et
  `AccountMark` (icônes 3D, logos d'opérateurs) utilisés par `TransactionRow`, `GoalTile`,
  `AccountRow`, `EnvelopeTile` ; en-tête de l'accueil avec la cloche seule.
- **Textes** : emojis retirés des alertes `ins.*` (fr et en), décision du fondateur.
- **Donnée de démonstration** : « Canal+ » dans « Abonnements streaming » (`src/core/demo.ts`,
  seule modification de `src/core`, demandée par le fondateur).
- **Réglage à distance des opérateurs** : `config/operators/items/v1` (`{ affichage: { orange:
  'pastille', … } }`), lu comme le catalogue (`services/operatorsConfig.ts`), règles existantes.
- Écrans déjà en v2 (accueil, budget, saisie, enveloppes…) : ils prennent la direction B dès
  maintenant ; leur MISE EN PAGE (pavés → listes, etc.) est l'objet des lots de l'étape 4.
