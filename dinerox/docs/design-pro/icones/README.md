# Planche des icônes (design-pro, direction B) — 2026-10-21

Choix définitifs du fondateur appliqués. Rien n'est intégré dans l'application (étape 3).

## Ouvrir la planche

```bash
# depuis dinerox/ : servir le dossier docs/design-pro (n'importe quel serveur statique)
npx --yes http-server docs/design-pro -p 8099   # ou : python3 -m http.server 8099 -d docs/design-pro
```

- planche complète : http://localhost:8099/icones/ (`?t=dark` en sombre, `?r=<n>` une rubrique) ;
- mode sombre, proposition du rond clair : http://localhost:8099/icones/sombre.html ;
- logos à valider : http://localhost:8099/logos-a-valider/ (sources : `logos-a-valider/SOURCES.md`) ;
- exemples : `directions/?d=b&s=home|entry&t=light|dark&card=c&icons=3d`.

Captures Android (Chrome de l'émulateur, page de 360 × 800 dp), dans `android/` :
`planche-01.png` à `planche-39.png` dans l'ordre, `sombre-rond-01..02.png` (avant/après du rond
clair), `exemple-{home,entry}-{light,dark}.png` ; logos : `../logos-a-valider/android-01..03.png`.

## Inventaire

`inventaire.mjs` (source, commentée) → `resolve.mjs` → `data.json`. **381 icônes**, 18 rubriques
(mêmes nombres que la première planche), **plus aucune ligne « À CHOISIR »**.

- contenu en 3D : Fluent Emoji 3D, dont **12 lignes** sur une **icône composée** validée (`composees/`) ;
- pavés de l'accueil et de Plus, cartes du coach, navigation et actions : **Ionicons au trait** ;
- **6 opérateurs Mobile Money** : logo officiel (option A), réglage par opérateur dans
  `operateurs.json` ; en attendant la validation des fichiers, pastille (initiales + couleur) ;
- Google (connexion) et WhatsApp (partage, chaîne) : logos Ionicons, comme aujourd'hui.

### Choix par ligne (fondateur)

| Ligne(s) | Icône |
|---|---|
| Famille, Autres dépenses familiales, Personnes à charge, objectif Famille, Projet familial, « Aucun espace famille » | `composees/famille_3d_medium-dark` |
| Réserve famille et cérémonies | `composees/famille_coeur_3d_medium-dark` |
| Tontine (catégorie), compte Tontine, Tontine tournante | `composees/tontine_all_3d` |
| Tontine reçue | 💰 Money bag |
| Snacks (Garba / repas de rue) | `composees/garba_3d` |
| Restaurant | `composees/plat_poisson_3d` |
| Maquis | 🍻 Clinking beer mugs |
| Dette familiale, Crédit familial | 👥 Busts in silhouette |
| Funérailles / Baptême | 🕊️ Dove / 👶 Baby (moyenne-foncée) |
| Charbon / Groupe électrogène / Score | 🪵 Wood / 🔌 Electric plug / 📊 Bar chart |
| Gaz | **emplacement `composees/bonbonne_gaz`** (voir ci-dessous) |

### Emplacement réservé : bonbonne de gaz

Fluent n'a pas de bonbonne de gaz. Le fichier **`composees/bonbonne_gaz.webp`** contient
provisoirement 🛢️ Oil drum (`slot:bonbonne_gaz=🛢️` dans `inventaire.mjs`). Pour le remplacer par
une icône dessinée : garder le **même nom de fichier** (`bonbonne_gaz`, WebP 48/96/144 px, fond
transparent), sans toucher au code ni à l'inventaire. La planche marque la ligne « provisoire ».

## Teinte de peau : moyenne-foncée

Tout personnage ou toute main qui existe en plusieurs teintes est en **Medium-Dark** (7 images
Fluent : aîné, enfant, mains ouvertes, bébé, enseignant, mains jointes, vieil homme ; les icônes
composées famille et tontine le sont déjà). Les icônes sans variante (🫂, 🤝, 👥) restent telles quelles.

## Mode sombre : léger rond clair (PROPOSITION, à valider)

Mesure sur la surface sombre `#1D1B17` : part du contour de l'icône dont le contraste avec le
fond est < 1,5:1. **12 images** dépassent 25 % : silhouettes 👥 (80 %), enfant (56 %), famille
(45 %), lunettes, boîte-repas, famille + cœur, train, accolade, moto, tracteur, toque, tontine.
Proposition : un rond `#3A362F` derrière ces icônes, **en mode sombre seulement**
(`sombre.html`, captures `android/sombre-rond-*.png`). Alternative : un rond pour TOUTES les icônes
en sombre, plus régulier visuellement. Rien n'est appliqué sans ton accord.

## Poids dans l'APK (WebP qualité 80, encodeur de Chrome, mesuré)

134 images distinctes : 128 Fluent + 5 composées + l'emplacement gaz.

| | 1x (48 px) | 2x (96 px) | 3x (144 px) | Total |
|---|---|---|---|---|
| Icônes retenues (134) | 188 Ko | 302 Ko | 464 Ko | **954 Ko** |

Dont icônes composées et gaz : 61 Ko. Les logos d'opérateurs, une fois validés, ajouteront
environ 30 Ko (6 logos × 3 résolutions). **Total estimé ≈ 1 Mo, sous la limite de 1,5 Mo.**
Les trois résolutions sont gardées (décision du fondateur).

## Licences

`fluent/LICENSE-fluentui-emoji.txt` (MIT), à reprendre dans les mentions de l'application ;
logos des opérateurs : `../licences.md`.
