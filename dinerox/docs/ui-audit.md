# Audit UI/UX — DineroX (étape 1)

> Audit seul : **aucune ligne de code n'a été modifiée.**
> Périmètre : `src/theme`, `src/components/ui`, puis accueil, saisie, historique,
> budget/enveloppes, objectifs et épargne, tontines, réserve, réglages (+ onglet « Plus »).
> Méthode : lecture du code, calcul des contrastes de la palette réelle (`src/theme/tokens.ts`,
> formule WCAG 2.1), et confrontation aux règles ui-ux-pro-max (accessibilité, toucher,
> typographie, navigation, « pro-rules » mobiles).
> Cible : Android d'entrée de gamme, 320–360 dp, plein soleil, utilisateurs peu technophiles.

## Gravité

| Niveau | Sens |
|---|---|
| **Critique** | Empêche de lire ou d'utiliser l'écran pour une partie des utilisateurs (contraste, texte illisible, action introuvable). |
| **Élevée** | Ralentit fortement, trompe ou fatigue l'utilisateur ; contraire à un objectif explicite de la mission. |
| **Moyenne** | Incohérence visible, finition, dette qui empêchera un design system propre. |
| **Faible** | Détail, à traiter au passage. |

## Synthèse

**Points forts à garder.** Les jetons sont centralisés (`tokens.ts`) ; le texte principal est
bien contrasté (16:1 en clair) ; `MIN_TOUCH = 48` existe ; `Button`, `Row` et `SwitchRow`
portent des rôles et des états d'accessibilité corrects ; la règle 13 (champ stable) est
respectée par `fieldStyle.ts` ; le thème clair est le thème par défaut (`services/profile.ts`),
ce qui convient au plein soleil ; l'interrupteur touchable sur toute la ligne est un bon modèle.

**Les cinq problèmes qui comptent le plus.**

1. **Hiérarchie de l'accueil inversée** : jusqu'à 17 blocs, au moins 9 actions concurrentes ;
   le solde disponible arrive après les dernières opérations, le coach et le conseil du jour.
2. **Les montants ne sont pas « l'information la plus importante »** : ils sont souvent en 14 px
   (budget, tontines, épargne), réduits jusqu'à 60 % par `adjustsFontSizeToFit`, et
   l'agrandissement du texte système est plafonné à 130 %.
3. **Contrastes insuffisants en thème sombre** sur les cartes en dégradé (1,9:1) et sur les
   boutons « danger »/« succès » (2,4 à 3,5:1) ; contours de champs à 1,3:1 dans les deux thèmes.
4. **Composants dupliqués** : 21 fichiers d'écran recréent des cartes, pastilles et boutons en
   `Pressable` brut ; 3 façons de faire une pastille, 2 en-têtes concurrents, 51 « petits boutons »
   de 40 dp.
5. **Icônes seules et emoji-icônes** : bouton micro central sans libellé visible, cloche,
   « Écouter », flèches de priorité, pavé « clavier » ; emoji comme icônes d'état vide et
   d'espace, qui s'affichent mal sur les vieux Android.

---

## 1. Fondations : `src/theme`

### 1.1 Contrastes mesurés (WCAG 2.1, texte normal ≥ 4,5:1 ; élément graphique ≥ 3:1)

| Paire (jeton) | Clair | Sombre | Où on la voit |
|---|---|---|---|
| `text` / `background` | 16,1 ✅ | 19,3 ✅ | partout |
| `textMuted` / `surface` | 8,5 ✅ | 7,3 ✅ | sous-titres |
| `textSubtle` / `surfaceAlt` | 4,6 ✅ (limite) | **4,2 ❌** | légendes sur fonds gris (filtres, puces) |
| `heroMuted` / dégradé (début) | **3,9 ❌** | **1,9 ❌** | « Comptes courants, hors épargne… », « SOLDE DISPONIBLE », récompenses, objectifs, « Plus » |
| `heroMuted` / dégradé (fin) | 4,6 ✅ | **2,9 ❌** | idem |
| `onHero` / dégradé (début) | 5,0 ✅ | 4,6 ✅ (limite) | montants des cartes en dégradé |
| `onInverse` / `danger` (bouton `danger`) | 6,2 ✅ | **3,5 ❌** | boutons de suppression |
| `onInverse` / `success` (bouton `success`) | 6,4 ✅ | **2,4 ❌** | « J'ai reçu la cagnotte » (tontine) |
| `danger` / `dangerBg` | 5,0 ✅ | **4,5 ❌** (4,47) | bannières et alertes d'erreur |
| Trophée `#F5B301` / dégradé | **2,7 ❌** | — | tuile « Mes récompenses » |
| `border` / `surface` (contour de champ) | **1,3 ❌** | **1,2 ❌** | tous les `Field`, `DateField`, puces non choisies |
| `track` / `surface` (fond de barre) | 1,3 | 1,3 | barres de progression (acceptable si le texte donne le %) |
| Icône pastel dans `IconCircle` (couleur + fond à 13 %) | **2,2 ❌** (#14B8A6) | — | catégories, comptes, enveloppes |
| `chartExpense` / `surface` | 3,2 ✅ (juste) | — | graphiques |

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| T1 | En sombre, `heroMuted` (#94A3B8) est un gris pensé pour le fond nuit, réutilisé sur le dégradé vert : 1,9:1. En clair, `rgba(255,255,255,.82)` tombe à 3,9:1 sur le vert le plus clair. | **Critique** | `heroMuted` = blanc à 90 % minimum dans les deux thèmes, et dégradé un peu plus sombre au départ ; vérifier ≥ 4,5:1 sur les deux extrémités. |
| T2 | Boutons `danger`/`success` en sombre : texte clair sur couleurs vives (2,4 à 3,5:1). | **Critique** | Jeton `onDanger`/`onSuccess` (texte foncé sur couleur vive en sombre), ou couleurs pleines assombries. |
| T3 | Contour des champs à 1,3:1 : en plein soleil, on ne voit pas où taper (WCAG 1.4.11 exige 3:1 pour identifier un champ). | **Critique** | Jeton `borderStrong` (≥ 3:1) réservé aux contrôles (champs, puces, cases) ; `border` reste pour les séparateurs décoratifs. Ne varie qu'en couleur : compatible règle 13. |
| T4 | `IconCircle` dessine l'icône dans sa propre couleur sur un fond à 13 % de cette couleur : les couleurs claires choisies par l'utilisateur (`pickableColors` contient #EAB308, #38BDF8…) donnent 2:1. | Élevée | Icône foncée (`text`) sur une pastille teintée plus dense, ou couleur assombrie automatiquement jusqu'à 3:1. |
| T5 | Le thème sombre est décrit comme « la référence de la charte » et dicte des choix (halo vert, fonds nuit #020617), alors que l'usage dominant est en plein soleil. | Moyenne | Faire du clair la référence ; garder le sombre, mais calé sur les mêmes contrastes. |
| T6 | `textSubtle` sur `surfaceAlt` à 4,2:1 en sombre. | Moyenne | Éclaircir `textSubtle` sombre (≈ #8A99AE). |

### 1.2 Typographie

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| T7 | `Text` et `Field` imposent `maxFontSizeMultiplier={1.3}` ; la barre d'onglets `tabBarAllowFontScaling: false`. Un utilisateur qui a agrandi le texte de son téléphone à 150–200 % (fréquent chez les malvoyants et les personnes âgées) ne l'obtient pas. Contraire à l'objectif « texte agrandi par le système respecté ». | **Critique** | Lever le plafond (≥ 2,0) et corriger les mises en page qui casseraient (retour à la ligne au lieu de troncature). Vérifier chaque écran à 200 %. |
| T8 | `adjustsFontSizeToFit` + `minimumFontScale={0.6}` sur les montants (solde, reste par jour, cartes de stats, objectifs). Sur 320 dp, « 1 250 000 FCFA » en `h2` (22 px) descend à ~13 px : le montant le plus important devient le plus petit. | **Critique** | Montants sur leur propre ligne, pleine largeur, taille fixe ; autoriser 2 lignes ; réduction bornée à 0,85 au pire. |
| T9 | Tailles trop petites pour la cible : `caption` 12 px, `overline` 11 px (souvent en MAJUSCULES espacées), libellés d'onglets 10 px. | Élevée | Plancher à 13 px pour toute information, 12 px seulement pour du décoratif ; libellés d'onglets 12 px. |
| T10 | Trois familles (Plus Jakarta Sans, Inter, JetBrains Mono) = 9 fichiers de police chargés au démarrage sur des téléphones lents. JetBrains Mono (police de code) donne aux montants un air « technique » peu chaleureux. | Moyenne | Deux familles : titres + texte. Chiffres alignés via `fontVariant: ['tabular-nums']` d'Inter (à vérifier sur Android avec la police embarquée) plutôt qu'une police monospace. |
| T11 | Pas de jeton dédié aux montants (`amountXL`, `amountL`, `amountM`) : chaque écran choisit `display`, `h1`, `h2`, `bodyStrong` ou `small` pour un montant. | Élevée | Échelle « montant » dans les jetons, utilisée par un composant `<Amount>` unique (signe, couleur sémantique, masquage). |
| T12 | `toUpperCase()` sur 16 titres et pastilles (« SOLDE DISPONIBLE », en-têtes de « Plus » et des réglages, « ● COMPTE ACTIF »). Les majuscules se lisent plus lentement, surtout pour un lectorat peu à l'aise ; certains lecteurs d'écran épellent. | Moyenne | Casse normale ; réserver l'`overline` à de rares sur-titres. |

### 1.3 Espacements, rayons, ombres

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| T13 | Échelle d'espacements non respectée : valeurs en dur (6, 10, 14, 18, 22…) dans la plupart des écrans ; l'échelle elle-même (2, 4, 8, 12, 16, 20, 28, 40) mélange un pas de 4 et un de 8. | Moyenne | Échelle stricte de 4 (4, 8, 12, 16, 24, 32, 48) et interdiction des valeurs libres dans les écrans. |
| T14 | Ombres : `glowGreen`/`fab` ont une couleur (vert/or) que les Android < 9 ignorent (ombre grise via `elevation`), et un halo coûteux sur `GradientCard`. Ombre de carte uniquement en clair, filet uniquement en sombre : deux langages. | Faible | 2 niveaux d'élévation neutres ; pas de halo coloré. |
| T15 | 12 couleurs en dur hors du thème (or des récompenses, `rgba(255,255,255,…)` sur les cartes en dégradé, couleurs de `budget/auto.tsx`) et `brand.colors.green` utilisé directement par la barre d'onglets. | Moyenne | Jetons `onHeroSubtle`, `rewardGold/Silver/Bronze`, couleurs d'enveloppes par défaut dans les jetons. |

---

## 2. Composants : `src/components/ui`

| # | Composant | Problème | Gravité | Proposition |
|---|---|---|---|---|
| C1 | `Button small` | `minHeight: 40` (< 48 dp) et texte 14 px ; utilisé **51 fois**, y compris pour des actions principales (« Parler », « Saisir », « Payée », « J'ai reçu la cagnotte », « Verser »). | **Élevée** | Hauteur 48 dans tous les cas ; `small` = moins de marge horizontale, pas moins de hauteur. |
| C2 | `Chip`, `DateField`, `Segmented` (sans icône) | 40 dp de haut. | Élevée | 48 dp. |
| C3 | `Button` | 5 variantes mais aucune pour « lien » ni « destructif discret » : les écrans recréent un bouton « Se déconnecter » en `Pressable`. `ghost` n'a ni fond ni contour : sur 320 dp il ressemble à du texte. | Moyenne | Jeu fermé : `primary`, `secondary` (contour), `tertiary` (texte souligné/teinté), `destructive`. Une seule variante `primary` par écran. |
| C4 | `Button` (pressé/désactivé) | `opacity: 0.5` pour désactivé : en sombre, texte à 0,5 d'opacité ≈ illisible, et rien n'explique pourquoi c'est désactivé. | Moyenne | Couleurs « désactivé » dédiées ≥ 3:1 + texte d'aide à côté. |
| C5 | `IconButton` | Icône seule (cloche, retour, Écouter, ↑/↓, +/−, fermer). Bon libellé d'accessibilité, mais contraire à « jamais une icône seule » pour l'utilisateur voyant. | Élevée | Garder l'icône seule uniquement pour retour et fermer (conventions universelles) ; ailleurs, icône + texte. |
| C6 | `Card` cliquable | `accessibilityLabel` **remplace** tout le contenu : `GoalCard` n'annonce que le nom de l'objectif (ni montant, ni %), l'enveloppe de l'accueil que son nom (ni reste, ni dépassement). | **Élevée** | Libellé composé (nom + montant + état) ou laisser lire le contenu ; vérifier les sélecteurs e2e qui s'appuient sur ces libellés avant tout changement. |
| C7 | `Card` | Retour de pression = opacité 0,9 : quasi invisible au soleil. | Faible | Fond `surfaceAlt` au toucher (couleur, pas d'opacité). |
| C8 | `Badge` | Texte 12 px, padding 3 px vertical ; utilisé tantôt en statut, tantôt en libellé (« PRO », « IA », rang). Le rang n°1 d'un objectif est en **rouge danger** : le rouge doit garder un seul sens (alerte). | Moyenne | Badge 13 px minimum ; tons strictement sémantiques ; rang en ton neutre/primaire. |
| C9 | `Field` | Libellé 14 px/600, aide 12 px, erreur 12 px rouge **sans icône** ; contour à 1,3:1 (T3). Pas d'indication « facultatif ». | Élevée | Libellé 15–16 px, erreur avec icône + texte ≥ 13 px, contour `borderStrong`. Tout changement de focus en **couleur seulement** (règle 13). |
| C10 | `AmountField` | Bonne idée (montant formaté sous le champ), mais l'aperçu est en `caption` 12 px gris : c'est pourtant la ligne qui évite l'erreur de zéros. | Moyenne | Aperçu en 15 px, contraste plein. |
| C11 | `EmptyState` | Emoji 44 px comme illustration (13 emoji différents). Rendu variable selon la version d'Android (emoji anciens, carrés vides sur certains téléphones) ; impossible à teinter au thème. | Moyenne | Icône Ionicons dans une pastille de marque ; un seul gabarit. |
| C12 | `Loading` | Roue seule, aucun texte visible ; le libellé n'est lu que par le lecteur d'écran. Pas de squelette : contenu qui « saute » à l'arrivée. | Moyenne | Roue + texte visible (`common.loading`), squelettes pour les listes. |
| C13 | `ErrorState` | Utilisé dans **un seul écran** (admin). Les autres écrans qui chargent (profil financier, abonnement, assistant, export) gèrent l'erreur au cas par cas ou par toast. | Élevée | Voir §4 : un état d'erreur par écran qui charge. |
| C14 | `Banner` | `accessibilityRole="alert"` pour **toutes** les bannières, y compris info/démo/hors-ligne : le lecteur d'écran interrompt l'utilisateur à chaque ouverture d'écran. | Moyenne | `alert` seulement pour danger ; sinon région « polite ». |
| C15 | `Toast` | Succès affiché 2,2 s : trop court pour un lecteur lent ; placé à `bottom + 90`, il peut masquer le bouton principal d'un pied d'écran. | Moyenne | 4 s minimum ; position au-dessus du pied d'écran actif. |
| C16 | `ProgressBar` | État porté surtout par la couleur (vert/orange/rouge) dans `EnvelopeRow` (le texte d'état n'est que sur la carte d'accueil). | Moyenne | Toujours un mot d'état ou une icône à côté de la barre. |
| C17 | `Segmented` | Libellés `numberOfLines={1}` : à 320 dp avec 4 segments (Historique) et texte agrandi, « Transfert » est tronqué. | Moyenne | 3 segments max ; au-delà, puces défilantes ou feuille de filtres. |
| C18 | `Sheet` | Poignée 40×4 en `border` (1,3:1, invisible) ; titre `h3`. Correct sinon. | Faible | Poignée en `borderStrong`. |
| C19 | `GradientCard` | Un dégradé SVG par carte (3 sur l'accueil, 1 sur Objectifs et Plus) ; la tuile récompenses utilise la **même** carte que le solde : deux blocs « héros » se disputent l'œil. | Moyenne | Un seul héros par écran ; dégradé réservé au chiffre principal. |
| C20 | `Stepper` | Boutons +/− icône seule (44 dp) ; valeur `h3`. | Faible | 48 dp, valeur plus grande. |

---

## 3. Écrans

### 3.1 Accueil — `src/app/(tabs)/index.tsx`

Ordre actuel (fond de compte réel, toutes cartes visibles) : sélecteur d'espace → « Bonjour » +
puce d'état → puce « sécurisé » → bannières → reste par jour → tontine → nouvelles catégories →
bulle de saisie (2 boutons) → dernières opérations → coach → conseil du jour → **solde
disponible** → 3 tuiles (revenu/dépense/transfert) → récompenses → assistant → analyse →
« Mois en cours » (4 cartes) → alertes → enveloppes (5) → objectifs (3) → bouton rapports.

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| A1 | **Aucune action principale identifiable.** Saisir une opération est proposé 4 fois (micro central, « Parler », « Saisir », 3 tuiles revenu/dépense/transfert) ; s'y ajoutent assistant, récompenses, rapports, « Tout voir » ×5. | **Critique** | Une action principale : « Saisir » (micro central, déjà présent partout). Retirer la bulle + les tuiles de l'accueil, ou les fusionner en une seule rangée secondaire. |
| A2 | **Hiérarchie inversée** : le solde disponible (chiffre héros, en `display` 36 px) est le 12ᵉ bloc, sous le coach et le conseil du jour. À 640 dp de haut, il faut 2–3 écrans de défilement pour le voir. | **Critique** | Haut d'écran = un seul bloc héros : « Reste par jour » (le repère voulu par la règle 18) **avec** le solde disponible en dessous dans la même carte ; puis alertes ; puis dernières opérations. |
| A3 | Longueur : jusqu'à 17 blocs ; enveloppes (5) et objectifs (3) dupliquent les onglets Budget et Objectifs. | Élevée | Accueil = situation + alertes + récent ; enveloppes et objectifs résumés en une ligne chacun (« 2 enveloppes à surveiller → »). |
| A4 | Trois indicateurs d'état empilés : puce « Synchronisé », puce « Vos données sont protégées », `SyncBanner`. | Moyenne | Un seul indicateur, visible seulement quand il y a un problème (hors-ligne, en attente). |
| A5 | Cartes « Mois en cours » en 2 colonnes : à 320 dp, ~138 dp par carte, montant réduit à 60 % (T8). | **Élevée** | Liste verticale montant à droite, ou 2 colonnes avec montant sur sa propre ligne sans réduction. |
| A6 | Œil « masquer les montants » : icône 18 px, sans texte, collée au sur-titre ; zone de toucher ~42 dp. Bonne fonctionnalité, peu découvrable. | Moyenne | Bouton icône + texte (« Masquer ») en haut de la carte héros, 48 dp. |
| A7 | Montants masqués « •••••• » : le lecteur d'écran lit « puce puce puce… ». | Moyenne | Libellé d'accessibilité « Montant masqué » (**nouveau texte → à valider**, voir §6). |
| A8 | Couleur des tuiles : « Revenu » utilise `primary` (vert de marque) et « Budget restant » aussi : le vert signifie à la fois « marque », « entrée d'argent », « succès » et « action ». | Moyenne | Séparer `income` de `primary` dans les jetons (même teinte possible, mais rôle distinct). |
| A9 | La puce « sécurisé » est tronquée à une ligne sur 320 dp. | Faible | Retirer de l'accueil (déplacer dans Réglages > Sécurité). |

### 3.2 Saisie — `features/entry/EntrySheet.tsx`, `ConfirmCard.tsx`

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| S1 | Trois modes dans une même feuille : sélecteur Voix/Clavier, **puis** champ « phrase écrite » + bouton, **puis** « Autres actions », simulateur, « Plus de détails ». En mode clavier : pavé + catégories + 2 boutons fantômes + phrase + bouton + « Autres actions » ≈ 1,5 écran sur 640 dp. | **Élevée** | Mode clavier : montant + catégories + valider, rien d'autre au-dessus de la ligne de flottaison ; phrase écrite et options dans un repli « Autres façons de saisir ». Logique et textes inchangés. |
| S2 | Pavé numérique : touches de 48 dp de haut, chiffres en `h3` 18 px. Pour un pavé c'est petit (les pavés de paiement mobile font 56–64 dp). | Élevée | Touches de 56–60 dp, chiffres 24 px. |
| S3 | Montant saisi en `display` coloré rouge/vert : bien, mais réduit par `adjustsFontSizeToFit` sans plancher. | Moyenne | Plancher de réduction (T8). |
| S4 | Le gros bouton micro (84 dp) a un texte en dessous : bon modèle. Mais le bouton **central de la barre d'onglets** (62 dp) n'a **aucun libellé visible**. | **Élevée** | Afficher « Saisir » (clé existante `entry.mic`) sous le bouton central. |
| S5 | `ConfirmCard` : champs incertains surlignés (bon), mais à vérifier que le surlignage n'est pas porté par la couleur seule. | Moyenne | Icône « ? » + mot à côté du champ incertain. |
| S6 | Messages d'erreur micro (refusé, indisponible, limite) : fond `warningBg` sans icône. | Faible | Icône + texte, composant `Banner`. |

### 3.3 Historique — `src/app/transactions.tsx`

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| H1 | Avant la première opération : segments (4) + recherche + 3 rangées de puces défilantes (mois, comptes, catégories) + total. Sur 320×640, la liste commence vers la mi-hauteur ; les filtres ne sont pas regroupés. | **Élevée** | Recherche + un bouton « Filtres (n) » qui ouvre une feuille ; mois en sélecteur unique ; total collé en haut. |
| H2 | Suppression **uniquement** par appui long (annoncée seulement au lecteur d'écran) : introuvable pour la plupart des utilisateurs. | Élevée | Garder l'appui long, mais l'action « Supprimer » doit aussi exister, visible, dans la fiche de l'opération (à vérifier dans `transaction/[id]`). |
| H3 | En-tête de jour : date en 14 px gris, total du jour coloré sans signe visuel autre que la couleur et le « + ». | Faible | Correct ; date en gras plus contrastée. |
| H4 | Segmented « Tout / Dépense / Revenu / Transfert » tronqué à 320 dp avec texte agrandi (C17). | Moyenne | 3 segments + transfert dans les filtres, ou puces. |
| H5 | Aucun état « chargement » : la liste vient du cache local (instantané), acceptable ; mais pas de retour visuel pendant la synchro (seulement la bannière). | Faible | Indicateur discret de synchro dans l'en-tête. |

### 3.4 Budget / enveloppes — `src/app/(tabs)/budget.tsx`

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| B1 | Les trois chiffres clés (prévu, dépensé, **reste**) sont en `small` 14 px, sur 3 colonnes de ~85 dp à 320 dp. C'est l'écran du budget et ses montants sont les plus petits de l'app. | **Critique** | « Reste » en héros (32–36 px), prévu/dépensé en dessous en 16 px. |
| B2 | Double titre : en-tête de marque « BUDGET » + titre `h1` « Mon budget » (+ mois). Idem Objectifs, Plus, Réglages. | Élevée | Un seul titre d'écran (voir N2). |
| B3 | `EnvelopeRow` : état (ok / attention / dépassé) porté par la couleur de la barre seulement (C16). Pas de libellé d'accessibilité : sur Android, la ligne est lue comme un bloc de textes sans structure. | Élevée | Mot d'état + icône ; libellé composé. |
| B4 | Bouton « Budget automatique » `small` + `secondary` en haut à droite : c'est l'action principale quand il n'y a pas d'enveloppe, une action secondaire sinon. | Moyenne | Action principale contextuelle : « Créer mon budget » si vide, « Nouvelle enveloppe » sinon. |

### 3.5 Objectifs, réserve et épargne — `(tabs)/goals.tsx`, `reserve/[id].tsx`, `savings/index.tsx`

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| G1 | Deux boutons de création (carré « + » 52 dp icône seule en haut, et « Créer un nouvel objectif » pleine largeur plus bas). | Élevée | Un seul, avec texte. |
| G2 | Ordre : carte globale → astuce → réserves → moments forts → bouton créer → objectifs → répartition → terminés. Les objectifs (le cœur de l'onglet) arrivent après deux autres sections. | Moyenne | Garder réserves au-dessus (règle 19), mais en version compacte ; objectifs juste après. |
| G3 | Flèches ↑/↓ de priorité : icônes seules de 18 px, posées sous la carte avec `marginTop: -8` (chevauchement visuel). | Moyenne | Bouton « Changer l'ordre » qui passe la liste en mode tri, avec boutons « Monter »/« Descendre » textuels. |
| G4 | Rang n°1 en badge **rouge** (C8). | Moyenne | Ton primaire. |
| G5 | Félicitations : la mission demande de « féliciter chaque progrès » ; l'écran montre un % mais aucun moment de réussite visible hors de l'écran Récompenses (la `RewardCelebration` existe — à vérifier quand elle se déclenche). | Moyenne | État « succès » visible sur la carte de l'objectif (palier franchi), sans nouveau texte si possible. |
| R1 | Réserve : titre d'écran avec emoji ; 6 boutons sur l'écran (modifier, mettre de côté, ajouter autre, retirer, simulateur, obligations, fermer) dont 3 variantes visuelles. | Moyenne | Une action principale (« Mettre X de côté ») ; le reste en secondaire/tertiaire groupé. |
| R2 | Solde de la réserve en `h1` sans couleur, « sur X » en texte normal : correct ; barre 12 px avec % non affiché en chiffre. | Faible | Afficher le %. |
| E1 | Épargne : chaque compte porte **4 petits boutons** (Verser, Retirer, Ajuster, Historique) qui passent sur 2 lignes à 320 dp ; avec 3 comptes, 12 boutons sur l'écran. | **Élevée** | Ligne de compte cliquable + bouton « Verser » ; les autres actions dans la fiche du compte ou un menu. |
| E2 | Total d'épargne : carte simple, montant `h1` vert ; le bouton « Verser » principal est hors de la carte. | Faible | Montant + action principale dans le même bloc héros. |

### 3.6 Tontines — `tontines/index.tsx`, `tontines/[id].tsx`

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| N1 | Liste : cartes en `Pressable` faites main (pas `Card`) ; les deux informations utiles (prochaine cotisation, prochaine cagnotte) sont des **phrases** en 14 px où le montant est noyé. | Élevée | Carte tontine standard : nom + badge d'état, puis deux lignes « À payer » / « À recevoir » avec le montant en gras à droite et la date dessous. Textes existants réutilisés. |
| N2 | Fiche : 1ʳᵉ carte = 8 lignes de petits textes ; mention légale en 12 px gris (obligatoire, règle 20 : doit rester lisible). | Moyenne | Paramètres en liste clé/valeur ; mention légale en 13–14 px, contraste plein. |
| N3 | « À faire » : boutons `small` (40 dp) pour les gestes principaux (« Payée », « Reporter », « J'ai reçu la cagnotte »), ce dernier en variante `success` illisible en sombre (T2). | **Élevée** | Boutons 48 dp ; contraste corrigé. |
| N4 | Bouton « Mes tontines » en bas de la fiche : doublon du bouton retour. | Faible | À retirer ou garder en lien discret. |
| N5 | Échéancier : badge d'état à droite de chaque ligne (couleur + mot) : bon. | — | Garder. |

### 3.7 Réglages et « Plus » — `settings/index.tsx`, `(tabs)/more.tsx`

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| P1 | Réglages : écran empilé mais avec l'en-tête de marque (logo, cloche, avatar… qui ouvre les réglages eux-mêmes) **plus** un bouton retour fait main **plus** un `h1` « Réglages » : 3 éléments de titre. | Élevée | `Screen back title=…` comme les autres écrans empilés. |
| P2 | « Se déconnecter » : `Pressable` fait main (C3). | Faible | `Button` variante destructive. |
| P3 | Sections en MAJUSCULES ; badge « ● COMPTE ACTIF » (T12). | Faible | Casse normale. |
| M1 | « Plus » : 22 entrées en 4 groupes, chacune avec pastille de couleur arbitraire ; le **rouge** est utilisé pour « Obligations » et « Dettes » (cœur rouge = danger ?). | Moyenne | Pastilles neutres teintées de marque ; rouge réservé aux alertes. Regrouper/ordonner par fréquence d'usage. |
| M2 | Badge `label="PRO"` **écrit en dur** (règle 6 de CLAUDE.md : textes via `t()`). | Moyenne | Clé i18n (**nouveau texte → à valider**). |
| M3 | Icône de l'onglet « Plus » = `sparkles` (étincelles), qui désigne déjà l'IA/assistant ailleurs. | Moyenne | `grid` ou `ellipsis-horizontal`. |
| M4 | Carte en dégradé « Patrimoine / Total des comptes » : 3ᵉ carte héros de l'app. Utile, mais concurrence l'accueil. | Faible | Carte simple. |

### 3.8 Navigation transverse

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| N1 | En-tête de marque sur chaque onglet : 56 dp occupés par logo + « DINEROX » ; le **nom de l'écran** n'est qu'un sur-titre 11 px majuscule gris — puis répété en `h1` juste dessous. | Élevée | Marque seulement sur l'accueil ; ailleurs, titre d'écran lisible (h2) + cloche + avatar. |
| N2 | Barre d'onglets : libellés 10 px non agrandissables (T7/T9) ; bouton central sans texte (S4). | **Élevée** | Libellés 12 px agrandissables ; « Saisir » sous le micro. |
| N3 | Deux façons d'atteindre l'Historique (accueil « Tout voir », Plus) mais pas d'onglet : c'est l'écran le plus consulté d'une app de suivi. | Moyenne | À discuter : la règle actuelle (règle 18, `docs/lot-a.md`) a fait ce choix — **pas de changement sans votre accord**. |
| N4 | Avatar de l'en-tête = accès aux Réglages, sans libellé visible. | Faible | Garder (convention), libellé d'accessibilité déjà présent. |

---

## 4. États loading / empty / error / success

| Écran | Chargement | Vide | Erreur | Succès |
|---|---|---|---|---|
| Accueil | n/a (cache local) | ✅ (opérations, enveloppes, objectifs, comptes) | ❌ aucun (ex. échec du renvoi d'e-mail → toast seul : acceptable) | toast |
| Saisie | ✅ « traitement » (texte) | n/a | ✅ messages micro | toast 2,2 s (trop court, C15) |
| Historique | n/a | ✅ (+ filtré) | toast seulement à la suppression | toast |
| Budget | n/a | ✅ | ❌ | n/a |
| Objectifs / réserve | via `withSpaceReady` (réserve) | ✅ | via `useRunAction` (toast) | toast ; aucun moment « bravo » sur la carte (G5) |
| Épargne | ❌ (pas de `withSpaceReady`) | ✅ | toast | toast |
| Tontines | via `withSpaceReady` | ✅ | via `useRunAction` | toast |
| Réglages / profil / profil financier | ✅ `Loading` (roue seule, C12) | n/a | à vérifier | toast |

**Constat** : les états vides sont bien couverts ; les états **d'erreur visibles dans l'écran** ne
le sont presque jamais (tout passe par un toast éphémère) ; le chargement n'a pas de texte visible ;
le succès est un toast court. À l'étape 2, je proposerai un gabarit d'état unique (icône + titre +
texte + action) pour les quatre cas.

---

## 5. Accessibilité — synthèse

- **Bien** : rôles `button`/`switch`/`tab`/`progressbar`/`header` posés ; `accessibilityState`
  sur boutons et interrupteurs ; `IconButton` toujours libellé ; « Écouter » placé à côté de la
  zone cliquable (règle 17) ; `importantForAccessibility` sur les pastilles décoratives.
- **À corriger** : libellés qui écrasent le contenu (C6) ; texte système plafonné (T7) ; bannières
  toutes en `alert` (C14) ; montants masqués lus comme des puces (A7) ; ordre de lecture de
  l'accueil = ordre visuel actuel, donc le solde est lu en 12ᵉ position (A2) ; les `Card`
  non cliquables avec `accessibilityLabel` (reste par jour) n'ont pas `accessible` : le libellé
  peut être ignoré selon la plateforme.

---

## 6. Textes : propositions (non appliquées)

Conformément à la consigne, **aucun texte n'a été modifié**. Pistes pour l'étape 2/3, à valider :

| Où | Actuel | Proposition | Pourquoi |
|---|---|---|---|
| Montants masqués (lecteur d'écran) | « •••••• » | ajouter une clé « Montant masqué » (libellé d'accessibilité seulement) | A7 |
| Badge des fonctions payantes (« Plus ») | `"PRO"` en dur | clé i18n, valeur « Plus » ou « Famille » selon la formule (clés `sub.plus`/`sub.family` existantes ?) | M2, règle 6 |
| Bouton « masquer les montants » visible | (icône seule) | réutiliser `home.hideAmounts` / `home.showAmounts` comme texte visible | A6 — pas de nouveau texte |
| Bouton central | (icône seule) | réutiliser `entry.mic` (« Saisir ») comme libellé visible | S4 — pas de nouveau texte |
| Titres d'onglets | « Budget » + « Mon budget » | garder un seul des deux | B2 — suppression d'affichage, pas de réécriture |

---

## 7. Conflits ui-ux-pro-max ↔ CLAUDE.md / votre demande (signalés)

1. **Style recommandé par la base** pour « Personal Finance Tracker » / « Fintech » :
   *Glassmorphism + Dark Mode (OLED)*. **Écarté** : illisible en plein soleil, coûteux en flou sur
   Android d'entrée de gamme, et le verre dépoli varie selon le contenu derrière — contraire à
   l'objectif de contraste. Le thème clair reste la référence.
2. **Animations d'état au focus** (halo, mise à l'échelle) conseillées par la base pour les
   champs : **interdites** par la règle 13 autour d'un `TextInput`. Le focus ne changera que des
   couleurs (et l'opacité d'ombre déjà en place).
3. **« Pas d'emoji comme icône »** : appliqué aux icônes d'interface (états vides, sélecteur
   d'espace). **Pas** aux icônes d'objectifs et de réserves choisies par l'utilisateur
   (`goal.icon`) : ce sont des données, on n'y touche pas.
4. **Cibles de 44 pt** (iOS) proposées par la base : la mission impose **48 dp** ; c'est 48 qui
   s'applique.
5. La base n'a renvoyé aucune règle spécifique React Native pour l'agrandissement du texte
   système (deux recherches hors sujet) : la recommandation T7 s'appuie sur la règle générale
   « Dynamic Type » de sa liste de contrôle et sur WCAG 1.4.4.

---

## 8. Ce que l'audit ne change pas (rappel des contraintes)

- `src/core`, `src/store/actions.ts`, `src/services`, `firebase/` : non concernés par les
  propositions ; tout se fait dans `src/theme`, `src/components/ui` et le rendu des écrans.
- Formules, limites (`FREE_VOICE_ENTRIES_PER_DAY`…), fonctionnalités : aucune suppression ;
  les doublons d'accès proposés au retrait (A1, G1, N4) restent atteignables par un autre chemin.
- Les sélecteurs e2e reposent sur les textes et libellés d'accessibilité : toute modification de
  libellé (C6, B3) sera vérifiée contre `e2e/` avant d'être faite.
- Aucune nouvelle dépendance native : dégradés en SVG (déjà présent), icônes Ionicons (déjà
  présentes).

## 9. Ordre de traitement proposé (pour les étapes 3–4)

1. Jetons (contrastes T1–T3, échelle montants T11, tailles T9, `borderStrong`) — corrige des
   problèmes critiques partout d'un coup.
2. Composants (`Button` 48 dp, `Field`, `Badge`, `EmptyState`/`Loading`/`ErrorState`, `<Amount>`).
3. Accueil (pilote).
4. Saisie (voir §10.9 : trois commits) → Budget → Historique → Objectifs/Réserve/Épargne → Tontines → Réglages/Plus.

---

## 10. Écrans de la 1.9 — conversation vocale (ajout du 2026-10-11)

> Ajouté après la fusion de `dinerox-main` (1.9) dans `design-v2` (commit `8823b84`).
> Comme le reste de l'audit : **aucune ligne de code modifiée, aucun texte modifié.**
> Chaque proposition applique le design system validé (`docs/design-system.md`) ; les renvois
> « §8.x » pointent vers lui.
> Périmètre : `EntrySheet.tsx` (vues ajoutées ou modifiées par la 1.9), `ConversationView.tsx`,
> `ConfirmCard.tsx`, `RecorderBar.tsx`, les messages de quota et le consentement à l'IA.

### 10.0 Point de départ technique

- Le style v2 n'est actif que sous `<DesignV2>` : la feuille de saisie (montée au niveau de
  l'application, `EntryProvider`) est **encore entièrement en style v1**, même ouverte depuis
  l'accueil migré.
- Les composants v2 déjà prêts (lot 0) : `Button`, `Amount`, `Card` (tons), `Row`, `Banner`
  (= `InlineMessage` §8.10), états d'écran, `Text`.
- **Pas encore migrés**, alors que la saisie en dépend : `Chip` (40 dp), `Segmented` (40 dp sans
  icône), `Field`/`AmountField`, `DateField` (40 dp), `Sheet` (poignée 1,3:1), `Toast` (2,2 s).
  Le lot « saisie » doit commencer par eux (§8.6–8.8, 8.12, 8.15).

### 10.1 `EntrySheet` — ce que la 1.9 ajoute

La feuille réunit désormais **cinq vues** sous le même titre « Nouvelle opération » : saisie
(voix / clavier / phrase), **conversation** (1.9), confirmation (saisie rapide avec réserve),
**réponse** à une question et **ambiguïté** (« opération ou question ? »). Les constats S1–S6
(§3.2) restent valables pour la vue de saisie ; ci-dessous, ce qui est propre aux autres vues.

| # | Problème | Gravité | Proposition (design system) |
|---|---|---|---|
| S7 | Vues « réponse » et « ambiguïté » : la phrase de l'utilisateur est rappelée en `caption` 12 px gris (« « combien j'ai dépensé ? » ») ; les puces de la réponse en `small` 14 px alors qu'elles portent les montants. | Moyenne | Phrase rappelée en `small` `textMuted` ; réponse en `bodyStrong` ; puces en `body` 16. Les montants sont inclus dans des phrases traduites : on ne les découpe pas (pas de `Amount` ici, textes inchangés). |
| S8 | Vue « réponse » : aucun bouton n'est principal (« Ouvrir la conversation » `secondary`, « Fermer » `ghost`). | Faible | Garder : `secondary` + `tertiary`, pleine largeur empilés à ≥ 130 %. |
| S9 | Bouton micro 84 dp : retour de pression par **opacité** 0,85 (invisible au soleil, C7). | Faible | Couleur `primaryPressed` au toucher (§8.1). Le bouton n'englobe aucun champ : règle 13 non concernée. |
| S10 | Explication avant la demande du micro (`entry.voice.why`) : boîte `infoBg` faite main, sans icône, bouton `small` 40 dp. | Moyenne | `Banner tone="info"` + icône `mic-outline` ; « Autoriser le micro » en `Button secondary` 48 dp sous le texte (le grand micro reste l'action principale de la vue). |
| S11 | Messages « micro refusé / indisponible / rien entendu / limite » : boîte `warningBg` faite main, **sans icône**, et toutes en `accessibilityRole="alert"` (interrompent le lecteur d'écran alors que ce ne sont pas des erreurs bloquantes — C14). | Moyenne | `Banner tone="warning"` + icône (`mic-off-outline`, `alert-circle-outline`, `volume-mute-outline`, `hourglass-outline`), annonce **polie** ; `alert` réservé aux erreurs (§8.10). |

### 10.2 `ConversationView` — mini-conversation

Ordre affiché : bulle « Vous » (transcription) → bulle DineroX (reformulation) → « Je
réfléchis… » → note de quota IA → « Arrêter la voix » → boutons de réponse à la question →
**carte de confirmation** → bulles suivantes → zone de réponse (« Répondre à la voix », champ
« Votre réponse » + « Envoyer »). Après « oui » : « Annuler », propositions (enveloppe, salaire),
« Fermer ».

| # | Problème | Gravité | Proposition (design system) |
|---|---|---|---|
| V1 | **Trois boutons pleins** en même temps : « Tout valider » (carte), « Répondre à la voix » et « Envoyer ». L'œil ne sait pas lequel est l'action principale (principe 2). | **Élevée** | « Tout valider » seul `primary`. « Répondre à la voix » → `secondary` (icône `mic-outline`) ; « Envoyer » → `secondary`. Après « oui » : « Fermer » reste le seul `primary`. |
| V2 | « Arrêter la voix » **apparaît puis disparaît** au-dessus de la carte de confirmation : à la fin de la lecture, la carte remonte de ~48 dp sous le doigt. Un toucher prévu sur « Arrêter la voix » peut tomber sur un bouton de réponse ou sur « Tout valider » (rattrapable 5 s par « Annuler », mais l'enregistrement est involontaire). | **Élevée** | Réserver l'emplacement (48 dp) tant qu'une lecture à voix haute est possible dans cette conversation (méthode voix, ou voix activée pour la saisie) ; hors lecture, l'emplacement reste vide. Aucun texte nouveau, aucun changement de logique. Règle 17 respectée : le bouton reste **à côté** des bulles, jamais dedans. |
| V3 | Bulles : texte DineroX sur `infoBg` (bleu-violet) ; nom « DineroX » en `caption` 12 px gras gris ; puces (qui contiennent les montants) en `small` 14 px. | Moyenne | Bulle DineroX : `infoBg` v2 (contraste vérifié par `design-tokens.test.ts`), rayon `lg` 16 avec coin `xs` 4 ; nom en `caption` 13 `textMuted` ; texte et puces en `body` 16. Bulle « Vous » : `surfaceAlt`, `body`. Espacements sur l'échelle de 4 (aujourd'hui 12 / 8 / 6). |
| V4 | Bulle « Vous » : `View` avec `accessibilityLabel` mais sans `accessible` (§5) — le libellé « Vous : … » peut être ignoré sur Android. Bulle DineroX : `Pressable` sans rôle ; l'indice « Arrêter la voix » n'existe que pendant la lecture. | Moyenne | `accessible` sur la bulle « Vous » ; rôle `button` sur la bulle DineroX **pendant la lecture seulement** (c'est alors qu'un toucher a un effet). Rôle et libellé ne créent pas de « stacking context » : compatible règle 13. |
| V5 | « Je réfléchis… » (appel à l'IA, jusqu'à 8 s) : texte seul, aucun signe d'activité. | Moyenne | État de chargement en ligne (§8.11) : roue `primary` + texte existant, annonce polie. |
| V6 | Zone de réponse : champ + « Envoyer » côte à côte, avec `marginBottom: 14` pour aligner le bouton sur la boîte du champ. À 320 dp et 160 %, le champ tombe sous ~150 dp et « Envoyer » passe sur deux lignes. Même montage pour la phrase écrite de la vue de saisie. | Moyenne | Au-dessus de 1,3 (taille de texte du système, lue une fois à l'ouverture — pas un état qui varie pendant la frappe, règle 13), « Envoyer » passe **sous** le champ, pleine largeur. Sinon côte à côte, aligné par le composant `Field` (plus de marge magique). |
| V7 | « Modifier le texte » (sous la bulle) et « Relancer » / « Annuler » en `small` 40 dp. | Moyenne | 48 dp (`small` = padding seulement, §8.1) ; « Modifier le texte » en `tertiary`, « Relancer » `secondary`, « Annuler » `tertiary`. |
| V8 | Boutons de réponse à la question (« Autres » / « Créer … ») : `secondary`, en ligne qui se replie : bon. | — | Garder ; 48 dp, texte sur 2 lignes si besoin, jamais tronqué. |
| V9 | Après « oui » : propositions « Créer l'enveloppe » (`primary small`) et « Voir la répartition » (`primary small`) à côté de « Fermer » (`primary`) : jusqu'à 3 boutons pleins. | Moyenne | Propositions en `secondary`, « Non merci » en `tertiary`, « Fermer » seul `primary` en bas. |
| V10 | Répartition du salaire : montants en `small` 14 gras, cadre `border` 1,3:1, aide en `caption` 12 gris. | Moyenne | Lignes `ListRow` sans chevron, montant `Amount size="S"` (16) à droite ; deux étages à ≥ 130 % (§2.3) ; aide en `caption` 13 `textSubtle`. Seul endroit de la conversation où les montants sont isolés : c'est là qu'ils passent par `Amount`. |
| V11 | Bilan après « oui » (bulle DineroX) : rien ne distingue visuellement « c'est enregistré » d'une simple réponse. | Faible | Bulle du bilan avec icône `checkmark-circle` `success` à gauche du nom (état « succès » dans la page, §8.11). Texte du bilan inchangé. |

### 10.3 `ConfirmCard` — carte de confirmation

| # | Problème | Gravité | Proposition (design system) |
|---|---|---|---|
| K1 | **Champ incertain signalé par la couleur seule** (contour et texte `warning`, fond `warningBg`) ; l'icône reste celle du champ. Le mot « à vérifier » n'existe que pour le lecteur d'écran. En plein soleil, l'orange sur orange clair se distingue mal du gris (audit S5). | **Élevée** | Pastille incertaine : icône `help-circle` à la place de l'icône du champ **et** mot « à vérifier » (clé existante `entry.confirm.toCheck`) après la valeur, contour `warning` 2 dp. Libellé d'accessibilité inchangé (les tests e2e qui cherchent « à vérifier » continuent de passer). |
| K2 | Le **montant** est une pastille de 14 px parmi cinq (type, montant, catégorie, compte, date) : ce que l'utilisateur doit vérifier en premier n'est pas plus visible qu'une date (principe 1). | **Élevée** | Première rangée de chaque ligne : pastille montant pleine largeur, montant en `amountM` (20) avec le signe et l'icône du type ; puis les autres pastilles. Même `Pressable`, même libellé, même comportement d'édition. |
| K3 | Pastilles : 40 dp de haut, texte `small` 14, contour `border` 1,3:1 (T3) : on ne voit pas qu'elles se touchent. | **Élevée** | 48 dp, texte `label` 15, contour `borderStrong` 1,5 dp (§8.7). Seules les couleurs varient selon l'état (règle 13 : ces pastilles n'englobent pas de champ, mais on garde la même discipline). |
| K4 | « Retirer cette ligne » : lien `caption` 12 px rouge, zone visible ~18 dp (élargie par `hitSlop`). | Moyenne | `Button variant="destructive" small` 48 dp, icône `trash-outline`, aligné à droite. |
| K5 | « À vérifier : catégorie, compte » : `caption` 12 px orange (4,5:1 au mieux) ; messages « montant manquant » / « compte d'épargne à choisir » en `small` rouge sans icône. | Moyenne | Ligne « À vérifier » en `small` 14 + icône `help-circle` ; messages manquants en `Banner tone="danger"` **juste au-dessus** de « Tout valider » : ils expliquent pourquoi le bouton est désactivé (§8.1, état désactivé). |
| K6 | Boutons « Tout valider » (`flexGrow`), « Corriger », « Annuler » sur une rangée qui se replie au hasard à 320 dp. | Moyenne | « Tout valider » `primary` pleine largeur (52 dp, pied de carte) ; dessous, « Corriger » `secondary` + « Annuler » `tertiary` côte à côte, empilés à ≥ 130 %. |
| K7 | Titre « J'ai compris 1 opération » en `bodyStrong`, aide « Touchez un élément… » en `caption` 12 gris ; cadre de chaque ligne `border` 1 dp rayon 16, padding 10. | Faible | Titre `titleS` ; aide `small` `textMuted` ; chaque ligne = `Card` niveau 0 (filet `border`, padding 16, espacement 8 entre pastilles). |
| K8 | Éditeurs ouverts sous la ligne (`Chip` type, `AmountField`, `ChipGroup` comptes, `CategoryPicker`, `DateField`) et « Ce n'est pas cette tontine » (`Chip`) : tous en v1 (40 dp). | Moyenne | Hérités des composants v2 (§10.0). Le `AmountField` apparaît **au toucher** de la pastille montant : c'est voulu (règle 15 vise les champs qui disparaissent selon une donnée différée, pas une action de l'utilisateur) — inchangé. |

### 10.4 `RecorderBar` — enregistreur (voix et réponse à la voix)

| # | Problème | Gravité | Proposition (design system) |
|---|---|---|---|
| R1 | Corbeille : icône 22 + padding 8 ≈ 38 dp visibles (< 48). | Élevée | Zone 48 × 48. |
| R2 | Corbeille et bouton d'arrêt : **icônes seules** (principe 3), avec de bons libellés d'accessibilité (« Annuler l'enregistrement », « Terminer l'enregistrement »). | Moyenne | **Décision à prendre (D-1 ci-dessous).** |
| R3 | Icône d'arrêt en `onPrimary` sur `danger` : en v2 le jeton dédié est `onDanger`. Retour de pression par opacité. | Faible | `onDanger` ; pression = couleur. La pastille rouge qui clignote (opacité animée) ne contient aucun champ : compatible règle 13. |

### 10.5 Messages de quota

Quatre messages, deux familles : quota de **saisies vocales** (formule gratuite) et quota de
**compréhension avancée** (appels à l'IA, 1.9).

| # | Message (clé) | Aujourd'hui | Gravité | Proposition |
|---|---|---|---|---|
| Q1 | Restant du jour — `entry.voice.quota` | `caption` 12 px gris sous le micro | Faible | `caption` 13 `textSubtle`, icône `mic-outline` 16 devant (information, pas d'alerte). |
| Q2 | Limite atteinte — `entry.voice.limit` + bouton `entry.voice.upgrade` | boîte `warningBg` sans icône, rôle `alert`, bouton `secondary small` 40 dp | Moyenne | `Banner tone="warning"`, icône `hourglass-outline`, annonce polie ; « Voir la formule Plus » en action `tertiary` du message (§8.10). Le message dit déjà que clavier et phrase restent illimités : la feuille garde ces deux chemins visibles juste dessous (aucun blocage, règle 10). |
| Q3 | Usage IA — `conv.aiQuota` (« Compréhension avancée : 2/3 aujourd'hui ») | `caption` 12 px gris | Faible | `caption` 13 `textSubtle` + icône `sparkles-outline` (l'étincelle désigne l'IA dans toute l'app, cf. M3). |
| Q4 | Quota IA atteint — `conv.aiQuotaReached` (phrase de 2 lignes, la conversation continue en local) | `caption` 12 px **gris** : une information qui change le comportement est écrite en plus petit et plus pâle que tout le reste | Moyenne | `Banner tone="info"` (pas `warning` : rien n'est bloqué, la saisie continue), icône `sparkles-outline`, texte `small` 14 contraste plein, annonce polie. |

### 10.6 Consentement à l'IA (renouvellement 1.9)

Affiché **à la place** de la conversation quand un accord antérieur à la 1.9 existe : le texte
`ai.remoteConsent` (≈ 430 caractères, une seule clé), « J'accepte » (`primary`) et « Non merci »
(`ghost`).

| # | Problème | Gravité | Proposition |
|---|---|---|---|
| C1 | **Choix déséquilibré** : « J'accepte » plein et coloré, « Non merci » en texte nu (sans fond ni contour en v1). Pour un consentement, le refus doit être aussi visible et aussi facile que l'accord. | **Élevée** | Les deux boutons pleine largeur, 48 dp, empilés, **même poids visuel**. **Décision à prendre (D-2).** |
| C2 | Bloc entier en `accessibilityRole="alert"` : le lecteur d'écran lit d'un trait 430 caractères en interrompant l'utilisateur ; ce n'est pas une erreur. | Moyenne | Annonce polie ; le texte reste lu en entier à la navigation. |
| C3 | Texte de 430 caractères en `body` dans un bloc sans repère : on ne voit pas qu'il s'agit d'une demande d'autorisation. | Moyenne | `Card` niveau 1 avec pastille `shield-checkmark-outline` (icône `primary` sur `primaryContainer`) au-dessus du texte, texte `body` 16 interligne 24, boutons sous la carte. Aucun titre ajouté (ce serait un texte nouveau). |
| C4 | L'utilisateur ne voit pas la phrase concernée au moment de décider (la conversation n'a pas commencé). | Faible | *Optionnel* : rappeler la phrase dictée au-dessus de la carte, dans une bulle « Vous » (même rendu que la conversation, texte de l'utilisateur, aucune clé nouvelle). |
| C5 | À 160 % sur 320 dp, le texte occupe ~2 écrans ; les boutons sont en bas. | Moyenne | Normal pour un consentement (le texte doit être lu) ; la feuille défile déjà. Vérifier que les deux boutons restent atteignables avec le clavier fermé. |

### 10.7 Décisions à prendre

| # | Question | Options | Recommandation |
|---|---|---|---|
| D-1 | Enregistreur : corbeille et arrêt restent-ils en icônes seules ? | **A.** Exception au principe 3, comme « Retour » et « Fermer » : convention WhatsApp voulue par la règle 18, libellés d'accessibilité déjà présents. **B.** Mot sous chaque icône — mais les clés existantes (« Annuler l'enregistrement », « Terminer l'enregistrement ») sont trop longues pour 320 dp à 160 % ; il faudrait deux textes courts nouveaux. | **A** (pas de nouveau texte, convention connue de la cible). |
| D-2 | Consentement : poids des deux boutons. | **A.** Deux `secondary` identiques (neutralité totale, mais aucun bouton principal). **B.** « J'accepte » `primary`, « Non merci » `secondary` plein (fond teinté, 48 dp, pleine largeur) : le refus reste un vrai bouton, pas un lien. | **B** (lisible, conforme au principe 2, refus visible) — **A** si vous voulez une neutralité stricte. |
| D-3 | Bilan après « oui » (V11) : icône de succès ? | Oui / non. | Oui (aucun texte nouveau). |
| D-4 | Consentement : rappeler la phrase de l'utilisateur (C4) ? | Oui / non. | Oui, si vous êtes d'accord pour que la feuille montre la phrase avant l'accord. |

### 10.8 Contraintes vérifiées

- **Textes** : aucune clé ajoutée ni modifiée dans les propositions ci-dessus (seule l'option B de
  D-1 en demanderait, et elle n'est pas recommandée).
- **Logique 1.9** : aucune proposition ne touche `useConversation`, `useEntrySave`,
  `core/entry/*`, `core/aiConsent.ts`, les quotas (`plans.ts` ↔ `subscription.ts`) ni l'ordre
  « rien sans oui / Tout valider ». Seul le rendu change.
- **e2e** : `voice-conversation.js` et les parcours de saisie s'appuient sur des textes visibles
  (« Tout valider », « Annuler », « Votre réponse », « Envoyer », « à vérifier ») : tous
  conservés. K1 ajoute « à vérifier » **visible** dans la pastille : les sélecteurs qui comptent
  ce mot seront relus dans le même commit.
- **Règle 13** : les seuls conteneurs de `TextInput` concernés (zone de réponse, phrase écrite,
  `AmountField` de la carte) ne reçoivent aucune propriété variable selon un état ; V6 dépend de
  la taille de texte du système, fixe pendant la saisie.
- **Règle 17** : « Arrêter la voix » reste à côté des bulles, jamais dans une zone cliquable (V2).

### 10.9 Effet sur l'ordre des lots (§9)

Le lot **Saisie** devient le plus gros :
1. composants restants : `Chip`, `Segmented`, `Field`/`AmountField`, `DateField`, `Sheet`, `Toast` ;
2. `EntrySheet` (S1–S11, avec le repli T-2 « Autres façons de saisir » à valider) + `RecorderBar` ;
3. `ConfirmCard` + `ConversationView` + quotas + consentement.

Je propose de le découper en **trois commits** dans cet ordre, avec un arrêt après chacun.
