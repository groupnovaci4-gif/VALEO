# Identité visuelle VALEO

## Source unique

Le code n'utilise **qu'un seul** fichier de logo, déclaré dans
`src/coop/brand.ts` :

| Fichier | Utilisé par | Format attendu |
|---|---|---|
| `valeo-logo.png` | `brand.ts` → écran de connexion | Logo **complet** (écusson + nom + signature), carré, fond transparent, ≥ 1024 × 1024 |

Remplacer ce fichier met à jour l'application partout où le code affiche le
logo. Aucun autre `require` de logo n'existe dans les écrans — ne pas en
réintroduire, passer par `brand.ts`.

### ⚠️ Une commande à relancer après remplacement

```bash
cd frontend
yarn brand:build
```

Les **reçus imprimés** n'utilisent pas le fichier PNG : ils embarquent une
vignette en data-URI (`src/coop/logo-print.ts`, **généré**, versionné).
Embarquer le logo source de ~1 Mo alourdirait chaque reçu produit sur des
téléphones d'entrée de gamme ; `yarn brand:build` en tire une vignette de
240 px (~60 Ko), compositée sur blanc puisque c'est du papier.

Sans cette commande, l'appli affiche le nouveau logo à l'écran mais **les reçus
gardent l'ancien**. Le script n'a aucune dépendance : il décode, réduit et
réencode le PNG lui-même (`scripts/build-logo.mjs`). Il refuse explicitement
les PNG entrelacés ou en 16 bits par canal — réexporter le logo sans
entrelacement, en 8 bits, si le message apparaît.

## Icônes système (lues par Expo, pas par le code)

Déclarées dans `app.json`. Elles ne suivent PAS `brand.ts` : Expo les lit au
moment du build, il faut donc fournir chaque fichier.

| Fichier | Rôle | Taille | Contrainte |
|---|---|---|---|
| `icon.png` | Icône iOS et web | 1024 × 1024 | Carré plein, **sans transparence** (iOS l'affiche en noir sinon) |
| `adaptive-icon.png` | Icône Android | 1024 × 1024 | ⚠️ voir ci-dessous |
| `splash-image.png` | Écran de démarrage | 1024 × 1024 | Affiché à 240 pt de large (`app.json`), fond blanc |
| `favicon.png` | Onglet navigateur | 96 × 96 | Doit rester lisible à 16 px : l'écusson seul, sans texte |

### ⚠️ Le piège de l'icône Android

`adaptive-icon.png` est **recadré en cercle** par Android (le système applique
un masque, et seuls les ~66 % centraux sont garantis visibles). Un logo en
écusson avec un bandeau de texte en bas y perd son nom : le bandeau tombe hors
du cercle.

Il faut donc pour ce fichier **une version dédiée** : l'emblème seul (le
cercle, le planteur, la cabosse, les feuilles), **sans** le bandeau « VALEO »
ni la signature, centré, avec de la marge autour.

C'est exactement le défaut de la version actuelle : `adaptive-icon.png` est un
recadrage du logo complet, et les lettres tronquées du nom apparaissent en bas
de l'icône.

## À vérifier après remplacement

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json   # doit rester à zéro erreur
yarn lint                           # 8 erreurs préexistantes = niveau de référence
```

Puis reconstruire l'APK (`npx eas build`) : les icônes système sont figées dans
le binaire, un simple redéploiement du backend ne les met pas à jour.
