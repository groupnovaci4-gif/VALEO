# Identité visuelle VALEO

## Source unique

Le code n'utilise **qu'un seul** fichier de logo, déclaré dans
`src/coop/brand.ts`. **Tout le reste en dérive** — les quatre icônes système
comme la vignette des reçus — via deux commandes :

```bash
cd frontend
yarn brand:build   # vignette des reçus imprimés
yarn brand:icons   # icônes système (app.json)
```

| Fichier | Utilisé par | Format attendu |
|---|---|---|
| `valeo-logo.png` | `brand.ts` → écran de connexion, en-têtes de reçus | Logo **complet** (écusson + nom + signature), fond **transparent**, ≥ 1024 px de côté |

Le fond transparent n'est pas cosmétique : l'écran de connexion a un fond crème
(`C.bg`, `#F7F3EC`). Un logo sur fond blanc y dessinerait un carré visible
autour de l'écusson. Les icônes système, elles, sont aplaties sur blanc de
toute façon.

L'image n'a pas besoin d'être carrée : le recadrage et le centrage sont faits
par les scripts.

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

## Icônes système — GÉNÉRÉES

```bash
cd frontend
yarn brand:icons
```

Déclarées dans `app.json`, ces quatre images sont lues par **Expo au moment du
build** : elles ne suivent donc pas `brand.ts`. Les refaire à la main à chaque
changement d'identité est exactement ce qui avait produit une icône Android
aux lettres tronquées — d'où un script.

| Fichier | Rôle | Taille | Part occupée par le logo |
|---|---|---|---|
| `icon.png` | iOS et web | 1024 × 1024 | 92 % |
| `adaptive-icon.png` | Android | 1024 × 1024 | **66 %** — zone sûre du masque |
| `splash-image.png` | Écran de démarrage | 1024 × 1024 | 80 % |
| `favicon.png` | Onglet navigateur | 96 × 96 | 100 % |

Toutes sont produites **entièrement opaques**, aplaties sur blanc : iOS peint
un canal alpha en NOIR, ce qui donnerait une icône au fond noir.

Le script **recadre d'abord sur le motif** (`recadrerSurContenu`). Un logo
exporté depuis un outil de dessin porte presque toujours une marge
transparente — le logo actuel en a 322 px en haut et 328 en bas sur 2472, soit
plus d'un quart de la hauteur. Sans recadrage, réduire l'image entière
réduirait aussi ce vide, et le motif visible serait d'autant plus petit.

### Le piège de l'icône Android, et comment il est évité

Android applique un **masque** à `adaptive-icon.png` — cercle, goutte ou carré
arrondi selon le constructeur — et ne garantit que les **~66 % centraux**. Un
écusson qui remplit le carré y perd son pourtour, et un bandeau de texte en bas
disparaît purement et simplement.

Le script réduit donc le logo dans cette zone sûre : rien ne peut être rogné,
quel que soit le masque. C'est pour cela que l'icône Android paraît plus petite
que les autres — ce n'est pas un défaut de cadrage, c'est la contrainte.

**Le nom reste illisible à 48 dp**, et c'est normal : aucun logo en écusson
complet ne porte son texte à cette taille. Si vous voulez un nom lisible sur
l'icône, il faut fournir un fichier dédié (l'emblème seul, sans bandeau) —
**pas** agrandir le logo, ce qui le ferait rogner par le masque.

## À vérifier après remplacement

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json   # doit rester à zéro erreur
yarn lint                           # 8 erreurs préexistantes = niveau de référence
```

Puis reconstruire l'APK (`npx eas build`) : les icônes système sont figées dans
le binaire, un simple redéploiement du backend ne les met pas à jour.
