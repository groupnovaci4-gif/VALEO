# Audit pré-déploiement VALEO

> **Rapport complet.** Audit mené en trois passes, avec correctifs appliqués
> sur autorisation explicite après la deuxième.
>
> **Décision : 🟠 GO AVEC CORRECTIONS** (§14) — go pour le déploiement d'essai
> et les tests terrain, pas pour une mise en production auprès de vraies
> coopératives.
>
> Révision de départ : `60e70e0`. Branche `audit/pre-deploy`.
> Trois axes du périmètre demandé restent **non couverts** et sont signalés
> comme tels : le parcours de régression de bout en bout (§13), la revue du
> tableau de bord HTML admin, et l'analyse des dépendances transitives.

---

## 0. Méthode, et ce que cet audit ne peut pas faire

Distinguer ces trois choses est la condition pour que le rapport soit utile.

| Niveau | Signification | Statut |
|---|---|---|
| **N1 — exécuté** | commande réellement lancée, sortie observée | fait, ci-dessous |
| **N2 — audit par lecture** | code tracé, avec `fichier:ligne` | en cours |
| **N3 — appareil requis** | ne peut PAS être exécuté ici | checklist à produire |

**Limites matérielles de cet audit, à connaître avant de lire la suite :**

- L'audit tourne sur un **clone du dépôt dans un environnement isolé**, pas sur
  le poste de l'opérateur. Les commandes de niveau 1 sont réelles.
- **Aucun accès à la base Firestore de production**, ni au projet Firebase, ni
  à un appareil Android. Une répétition contre le vrai Firestore a été menée
  séparément par l'opérateur (24 contrôles, tous verts) ; elle est citée comme
  élément externe, pas comme un test de cet audit.
- **Aucun accès à la base MongoDB** de l'instance existante. Tout ce qui
  concerne le contenu réel de Mongo repose donc sur la déclaration de
  l'opérateur (« uniquement des données de test »), non vérifiée.
- L'accès réseau sortant est filtré : trois contrôles `expo-doctor` échouent
  pour cette raison et non à cause du projet (signalé au cas par cas).

---

## 1. Cartographie du dépôt

### 1.1 Points d'entrée

| Rôle | Fichier |
|---|---|
| Application (unique route) | `frontend/app/index.tsx` |
| Enveloppe de navigation | `frontend/app/_layout.tsx` |
| API | `backend/server.py` (2 035 lignes, 21 routes) |
| Persistance | `backend/depot.py` (400 lignes, Mongo **ou** Firestore) |
| Sessions Firebase | `backend/firebase_auth.py` (262 lignes) |

### 1.2 Frontend — 7 582 lignes de TypeScript

```
frontend/
├── app/                 3 fichiers SEULEMENT — voir constat É-3
│   ├── index.tsx        écran unique + barre de navigation + tout l'aiguillage
│   ├── _layout.tsx
│   └── +html.tsx        gabarit web
└── src/coop/
    ├── screens.tsx      1 857  écrans (accueils par rôle, prêts, bilan…)
    ├── sheets.tsx       1 689  feuilles d'action (pesée, avance, paiement…)
    ├── lib.ts           1 158  SOURCE DE VÉRITÉ : types + formules dérivées
    ├── store.ts           804  état global, push/pull, cache, session
    ├── ui.tsx             625  composants
    ├── auth.tsx           307  écran de connexion
    ├── geo.ts + geo/      229  localités de Côte d'Ivoire (module pur)
    ├── reports.ts         104  bilan de campagne
    ├── firebase.ts         85  session Firebase en REST (pas de SDK)
    ├── pin.ts              73  PBKDF2 — voir constat É-1
    ├── biometric.ts        65  JAMAIS IMPORTÉ — voir constat É-2
    ├── backend.ts          62  résolution de l'adresse de l'API (module pur)
    ├── sync.ts             61  prepareSync (module pur)
    ├── secureCache.ts      41  cache local chiffré AES
    └── backup.ts           34  export/import
```

**Modules purs** (testables par Node, sans Expo) : `lib.ts`, `sync.ts`,
`geo.ts`, `backend.ts`, `firebase.ts`. C'est là que vivent les formules
d'argent, et c'est ce qui rend les 153 tests frontend possibles.

### 1.3 Backend — 8 175 lignes de Python (dont 3 800 de tests)

21 routes. Toutes celles qui touchent aux données portent une garde explicite :

| Garde | Routes |
|---|---|
| `Depends(require_user)` | `/api/state` (GET, PUT), `/api/audit` (GET, POST), `/api/diag` |
| `Depends(require_admin)` | `/api/admin/{state,diag,audit,set-secret,revoke,purge-mouvements,change-password}` |
| **Aucune (volontaire)** | `/`, `/health`, `/api/`, les 3 connexions, `/api/auth/register`, `/api/admin` (page HTML) |

`server.py:1035-1437`. Aucune route de données n'est dépourvue de garde —
constat de lecture, à éprouver par des tests d'accès en section 4.

### 1.4 Tests existants

| Suite | Résultat observé |
|---|---|
| `pytest` (backend) | **494 passed, 18 skipped**, 9 failed + 3 errors |
| `yarn test` (modules purs) | **153 passed**, 0 fail |

Les 9 échecs et 3 erreurs proviennent **tous** de trois fichiers d'intégration
(`test_valeo_api.py`, `test_multicoop_isolation.py`,
`test_admin_change_password.py`) qui frappent une instance déployée à
`https://app-deploy-187.preview.emergentagent.com` — l'ancienne prévisualisation
Emergent, qui ne sert plus VALEO. Ils ne testent pas le code de ce dépôt tant
qu'`EXPO_PUBLIC_BACKEND_URL` ne pointe pas vers une instance vivante.

**C'est en soi un constat** : sur 12 items rouges permanents, une régression
réelle passerait inaperçue. Voir É-7.

---

## 2. Contrôles de niveau 1 — réellement exécutés

| # | Contrôle | Commande | Résultat |
|---|---|---|---|
| N1-1 | Types TypeScript | `npx tsc --noEmit` | ✅ **0 erreur** |
| N1-2 | Tests modules purs | `yarn test` | ✅ **153 passed** |
| N1-3 | Tests backend | `pytest` | ⚠️ **494 passed**, 12 rouges d'intégration (cf. É-7) |
| N1-4 | ESLint | `yarn lint` | ⚠️ **8 erreurs + 1 avertissement** |
| N1-5 | expo-doctor | `npx expo-doctor` | ⚠️ **15/18**, 3 échecs (2 dus au réseau filtré, 1 réel) |
| N1-6 | Config Android/iOS | lecture `app.json` | 🔴 voir É-4 |
| N1-7 | Configuration EAS | `ls eas.json` | 🔴 **absent** — voir É-5 |

**N1-4 — ESLint.** Les 8 erreurs sont toutes `react/no-unescaped-entities`
(apostrophes françaises dans du JSX) : `app/index.tsx:460`,
`src/coop/sheets.tsx:410,490,615,654,708,714`, `src/coop/ui.tsx:371`.
Aucun impact fonctionnel. Elles correspondent exactement au niveau de référence
annoncé dans `CLAUDE.md` §3 — donc **aucune régression de lint**. L'avertissement
est un import inutilisé (`Platform`, `src/coop/ui.tsx:8`).

**N1-5 — expo-doctor.** Deux échecs sont des artefacts de l'environnement
d'audit (le réseau sortant est filtré : « Host not i… » au lieu de JSON) et ne
disent rien du projet. Le troisième est réel : **quatre copies de
`expo-constants`** (18.0.13 à la racine, 18.0.14 dans `expo`, `expo-asset` et
`expo-linking`). Un module natif dupliqué peut faire échouer une compilation
native — donc précisément un build EAS. Gravité 🟡, à traiter avant le premier
APK.

---

## 3. Écarts entre le contexte annoncé et le code

C'est la section qui justifie l'audit : plusieurs éléments du contexte fourni ne
correspondent pas au code.

### É-1 🟠 — Les PIN ne sont **PAS** hachés côté client à la connexion

**Contexte annoncé :** « Les PIN sont hachés côté client (PBKDF2-SHA256), le
serveur ne reçoit que l'empreinte. »

**Réalité :** le code secret part **en clair** dans le corps de la requête.

Chaîne complète :
- `src/coop/auth.tsx:125` — `onLogin(await authLoginCoop(ident, pass))` où
  `pass` est le contenu brut du champ de saisie ;
- `src/coop/store.ts:301` — `body: JSON.stringify({ identifier, secret })` ;
- `backend/server.py:1080` — `verify_secret(body.secret, s.get("pin"))` ;
- `backend/server.py:198-211` — `verify_secret` prend le secret **en clair** et
  recalcule PBKDF2 avec le sel stocké.

Identique pour le planteur (`auth.tsx:131` → `store.ts:307` → `server.py:1109`).

`pin.ts` n'intervient qu'à la **création** d'un code (`sheets.tsx:97,595,626` via
`createPinRecord`), jamais à la vérification.

**Est-ce grave ?** Non — c'est même le schéma le plus sain. Transmettre le clair
sous TLS et laisser le serveur dériver est la pratique standard ; le modèle
annoncé, lui, ferait de l'empreinte l'équivalent d'un mot de passe (rejeu
d'empreinte). **Mais le modèle mental est faux, et il a des conséquences
concrètes** :
- il conditionne le choix de « jeton personnalisé » plutôt que
  « E-mail/Mot de passe » chez Firebase, justifié dans `CLAUDE.md` (invariant 28)
  par le fait que le code est « haché sur le téléphone ». L'argument invoqué ne
  tient pas ; **la conclusion reste bonne** pour d'autres raisons (téléphone,
  code planteur, propriétaire sans identifiant) ;
- il conditionne le nombre d'itérations PBKDF2 (15 000, justifié par la lenteur
  des téléphones d'entrée de gamme). Or **à la connexion, le calcul se fait sur
  le serveur**. L'argument ne s'applique qu'à la création d'un code. À creuser
  en section 7.

**Recommandation :** ne rien changer au code. Corriger la documentation.

### É-2 🟡 — Deux modules morts, dont un qui déclenche une permission Face ID

`src/coop/biometric.ts` (65 lignes) n'est **importé nulle part** — vérifié par
recherche sur `src/` et `app/`. `verifyPin` et `verifyPinAsync`
(`src/coop/pin.ts:56,71`) ne sont **appelés nulle part** non plus.

Conséquence directe : `app.json` déclare le greffon
`expo-local-authentication` et deux textes de permission —
`NSFaceIDUsageDescription` (iOS) et `faceIDPermission` — pour une
fonctionnalité **qui n'existe pas dans l'application**. Une revue App Store ou
Play peut le relever ; demander une permission biométrique inutilisée est aussi
un point de conformité (politique de données).

Corollaire pour la section 10 : `verifyPin` étant mort, **il n'y a aucune
connexion hors ligne**. Une session déjà ouverte survit sans réseau (jeton et
identité en SecureStore, `store.ts:265-274` ; données en cache AES chiffré,
`store.ts:241`), mais **une première connexion, ou une reconnexion après
déconnexion, exige le réseau**. Pour une application « hors-ligne d'abord »
destinée à des pisteurs en brousse, c'est à qualifier explicitement — ce n'est
pas forcément un défaut, mais ce doit être un choix assumé.

### É-3 🟡 — Il n'y a pratiquement pas de routage

**Contexte annoncé :** « probablement Expo Router ».

**Réalité :** `expo-router` est bien la dépendance (`package.json`,
`main: expo-router/entry`), mais `frontend/app/` ne contient que **trois
fichiers**, dont une seule route (`index.tsx`). Toute la navigation est un état
React interne à `app/index.tsx` (1 000+ lignes) avec une `NavBar` maison.

Conséquence sur le périmètre §5.4 demandé : **il n'y a pas de « gardes de
route » à auditer**, puisqu'il n'y a pas de routes. L'aiguillage par rôle se
fait par rendu conditionnel. C'est auditable, mais différemment — et cela veut
dire qu'aucune protection de navigation n'est structurelle. Il faut donc
vérifier que **le serveur** refuse tout ce que l'interface se contente de ne pas
afficher. C'est l'objet de la section 6 (matrice de rôles).

### É-4 🔴 — L'identifiant applicatif Android/iOS appartient au constructeur précédent

`frontend/app.json:14` et `:24` :

```json
"bundleIdentifier": "com.emergent.appdeploy.tyyn4z"
"package": "com.emergent.appdeploy.tyyn4z"
```

C'est un identifiant généré par le constructeur **Emergent**, pas par vous.

Pourquoi c'est classé rouge alors que l'application fonctionne : **l'identifiant
de paquet est définitif une fois publié**. Google Play et l'App Store en font la
clé d'identité de l'application ; il ne se change pas après publication — il
faut republier une application distincte et perdre les installations et les
avis. Le corriger coûte une ligne aujourd'hui, et n'est plus corrigeable après
le premier téléphone chez un partenaire.

Accessoirement, `"slug": "frontend"` et `"scheme": "frontend"` sont eux aussi
des valeurs par défaut.

### É-5 🟠 — Aucune configuration EAS

`eas.json` est **absent**, et il n'y a ni dossier `android/` ni `ios/` (projet
« managed »). En l'état, `npx eas build` demandera de créer la configuration.
`CLAUDE.md` §3 annonce pourtant EAS Build comme la méthode de construction.
Procédure complète à établir en section 11.

### É-6 🟡 — Durée de session non configurable

`server.py:320` : `issue_user_token` fixe `days=30` **en dur**.
`JWT_EXPIRE_MINUTES` (`server.py:45`) ne s'applique qu'au jeton
**administrateur** (`issue_token`, `server.py:123-127`) — ce que
`.env.example` documente correctement, mais qui surprend : la variable a un nom
général pour un effet particulier.

Sur la révocation, le contexte annoncé (« non révocable ») est **presque**
exact : `POST /api/admin/revoke` (`server.py:1354`) coupe les sessions Firebase
et pose `desactive`, ce qui bloque les **prochaines** connexions, mais un jeton
VALEO déjà délivré reste valable jusqu'à son terme. Cette limite est assumée et
documentée (invariant 28). À classer en section 7.

### É-7 🟠 — 12 tests rouges en permanence masquent les vraies régressions

Les trois fichiers d'intégration pointent par défaut sur une URL morte
(`test_valeo_api.py:6`, `test_multicoop_isolation.py:11`,
`test_admin_change_password.py:16`). Résultat : `pytest` sort **toujours** en
échec, avec 12 items rouges.

Le danger n'est pas le rouge : c'est l'habitude. Une suite qui échoue toujours
n'est plus lue, et la 13ᵉ ligne rouge — une vraie régression — passe inaperçue.

---

## 4. Isolation entre coopératives (§5.6) — **un blocage**

Sondes exécutées : `audit/verifier_isolation.py`, jouées sur les **deux dépôts**
(MongoDB simulée par `mongomock_motor`, Firestore par le double du projet
`tests/faux_firestore.py`). Aucune base réelle touchée.

```
ok    ISO-2  B voit bien SA fiche, pas celle de A
ok    ISO-3  un coopId falsifié n'atterrit pas chez la cible
ok    ISO-4  B ne peut pas supprimer une fiche de A par `deletions`
ok    ISO-5  B ne voit aucune autre coopérative
ok    ISO-6  aucune empreinte `pin` dans l'état rendu
KO    ISO-1  la fiche de A survit à un id identique chez B   -> mongo ok / firestore ÉCHEC
KO    ISO-7  le patron B n'écrase pas la fiche du patron A   -> mongo ok / firestore ÉCHEC
KO    ISO-8  le patron A peut toujours se connecter          -> mongo ok / firestore ÉCHEC
```

### B-01 🔴 CRITIQUE — Sur Firestore, une coopérative peut écraser et détruire les données d'une autre

**Ce qui se passe.** Le patron de la coopérative B envoie un enregistrement
dont l'`id` est celui d'un enregistrement de la coopérative A. Sur MongoDB, il
ne se passe rien : la fiche de A est intacte. **Sur Firestore, la fiche de A
est écrasée par celle de B.**

Poussé jusqu'au bout (ISO-7 / ISO-8) : le patron B envoie une fiche `staff`
portant l'identifiant du patron A. Résultat sur Firestore — la fiche du patron
A est remplacée (`nom` = « ECRASEUR », `role` = « pisteur », **empreinte `pin`
perdue**), et **le patron A ne peut plus se connecter : HTTP 401**. La
coopérative A perd l'accès à ses propres données, provoqué depuis un autre
compte, sans aucune erreur côté serveur (le `PUT` répond 200).

**Cause racine.** `backend/depot.py:303` :

```python
ref = self._client.collection(coll).document(_cle_doc(rid))
```

La clé de document Firestore **est l'identifiant métier**, et les collections
(`members`, `staff`, `collections`, `loans`…) sont **globales, non cloisonnées
par coopérative**. L'enchaînement est le suivant :

1. `server.py:1057` — `load_state(me["coopId"])` borne la lecture à la coop B.
   La ligne de A n'est donc **pas** dans la référence de lecture.
2. `server.py:522` — `merge_state` ne trouve pas l'`id` parmi les lignes de B :
   il **crée** la ligne, avec `coopId` forcé à B (l'anti-IDOR fonctionne).
3. `depot.py:275-283` — `enregistrer` compare à la référence de lecture, voit
   une empreinte nouvelle, et émet un `set` sur le document **de même clé**.
4. Ce document est celui de A. Il est remplacé.

Le paradoxe mérite d'être noté : **c'est la lecture bornée à la coopérative —
une optimisation de coût — qui rend la destruction invisible**. Le serveur ne
peut pas voir qu'il écrase, puisqu'il n'a pas lu la ligne qu'il écrase.

**Portée.** Le mécanisme est le même pour les neuf tableaux d'entités
(`depot.py:272-283` boucle sur `TABLEAUX`). Démontré sur `members` et `staff` ;
`collections`, `loans`, `settlements` et `sorties` suivent la même voie —
c'est-à-dire l'argent.

**Exploitabilité.** `frontend/src/coop/lib.ts:400` :

```js
export const uid = () => Math.random().toString(36).slice(2, 9);
```

Sept caractères base36, soit environ **36 bits**, tirés de `Math.random()` —
un générateur pseudo-aléatoire **non cryptographique** et prédictible à partir
de quelques sorties. Ces identifiants deviennent, sur Firestore, un **espace de
noms global qui sert de frontière de sécurité**. 36 bits non cryptographiques
ne sont pas une frontière de sécurité.

Deux voies distinctes :
- **malveillante** : un titulaire de n'importe quel compte peut énumérer. Les
  identifiants de coopérative et de collaborateur créés par `/api/auth/register`
  sont, eux, solides (`server.py:1127-1128`, `secrets.token_hex(6)` = 48 bits
  cryptographiques) ; mais tout ce que le téléphone fabrique — planteurs,
  collectes, avances, soldes — passe par `uid()` ;
- **accidentelle** : moins probable, mais non nulle sur la durée, et une
  collision accidentelle détruit silencieusement une fiche.

**Pourquoi la suite de tests ne l'a pas vu.** `CLAUDE.md` (invariant 29) pose
que « toute la suite de sécurité tourne sur les DEUX bases », ce qui est vrai —
mais une suite ne prouve que les scénarios qu'elle couvre. Vérifié : **aucun
test du dépôt ne fait écrire deux coopératives sur un même identifiant**
(recherche sur `backend/tests/`). Et le seul fichier consacré à l'isolation
multi-coopératives, `test_multicoop_isolation.py`, fait partie des trois
suites d'intégration qui pointent sur l'URL Emergent morte (cf. É-7) : **il ne
s'exécute jamais**. La garantie la plus importante du produit repose donc sur
un test qui ne tourne pas.

**Impact.** Perte de données entre locataires et prise de contrôle de compte,
uniquement **après** la bascule sur Firestore. Aujourd'hui, sur MongoDB,
l'application n'est pas affectée. C'est un **bloquant de migration**, pas un
incident en cours.

**Recommandations** (aucune appliquée — audit en lecture seule) :

1. **Cloisonner la clé de document par coopérative.** Le correctif minimal est
   de dériver la clé de `(coopId, id)` plutôt que de `id` seul, dans
   `_cle_doc` / `depot.py:303`. L'identifiant métier reste dans le champ `id`,
   donc rien ne change pour `charger`, `merge_state` ni `scope_state`.
   Attention au repli `row.setdefault("id", snap.id)` (`depot.py:252`), qui
   doit continuer de rendre l'identifiant métier et non la clé.
   La forme idiomatique Firestore serait `coops/{coopId}/members/{id}`, plus
   propre mais plus invasive.
2. **Renforcer `uid()`** vers un tirage cryptographique (`expo-crypto`).
   Nécessaire dans tous les cas, mais **ce n'est pas un correctif** : ça réduit
   la collision accidentelle, pas l'écrasement délibéré. Le cloisonnement est
   le correctif ; `uid()` est de l'hygiène.
3. **Ajouter les sondes ISO-1/7/8 à la suite du projet**, sur les deux dépôts,
   pour que la divergence ne puisse pas revenir.
4. **Remettre `test_multicoop_isolation.py` en état de tourner** (cf. É-7).

### Ce qui, en revanche, tient bien

Les quatre autres sondes passent identiquement des deux côtés, et méritent
d'être dites :

- **ISO-3** — un `coopId` falsifié dans la charge utile ne va nulle part :
  `merge_state` force `"coopId": coop_id` depuis le jeton
  (`server.py:522` et `:531`). L'anti-IDOR fonctionne exactement comme annoncé.
- **ISO-4** — `deletions` ne porte que sur les lignes de la coopérative du
  jeton (`server.py:532-533` : `merged.pop`, où `merged` est déjà filtré).
  Sonde jouée avec un identifiant **neuf**, créé par A seul : une première
  version héritait du résultat d'ISO-1 et ne prouvait rien.
- **ISO-5 / ISO-6** — `scope_state` ne rend que la coopérative du jeton, et
  aucune empreinte `pin` n'en sort, sur les deux dépôts.

## 5. Correctifs appliqués (sur autorisation explicite du 09/09)

L'audit est passé en mode correctif à votre demande. Commit `afdcb77`.

| # | Constat | État |
|---|---|---|
| B-01 | Écrasement entre coopératives sur Firestore | ✅ **corrigé** |
| — | `uid()` à 36 bits non cryptographiques | ✅ **corrigé** |
| É-7 | 12 tests rouges permanents | ✅ **corrigé** |
| É-1 | Documentation fausse sur le hachage des PIN | ✅ **corrigé** |
| É-4 | Identifiant de paquet `com.emergent.…` | ⏸️ **décision produit attendue** |
| É-2 | Modules morts + permission Face ID inutilisée | ✅ **permission retirée** (module conservé) |
| N1-5 | Quatre copies d'`expo-constants` | ⏸️ à traiter au premier build |

### B-01 — cloisonnement de la clé de document

`depot.py` : la clé Firestore se dérive désormais du couple **(coopérative,
identifiant)** et non de l'identifiant seul (`_cle_ligne`). Deux corollaires
qui ne se voient pas au premier regard :

- `_index` s'indexe par **clé de document** et non par identifiant métier ;
  sans cela le calcul des suppressions redevient ambigu dès que deux
  coopératives partagent un identifiant ;
- `charger` ne reprend plus `snap.id` comme identifiant métier. La clé ne lui
  appartient plus : l'identifiant vit dans le champ `id`.

**Aucune migration de données n'est requise** : la base Firestore est vide
(constaté dans la console, et la répétition la laisse vide).

### `uid()` — hygiène, pas correctif

`lib.ts` passe par `crypto.getRandomValues` quand il existe, avec un repli
sans dépendance (`lib.ts` doit rester sans import d'exécution). À dire
clairement : **ce n'est pas ce qui corrige B-01**. Le cloisonnement l'est.
Renforcer l'identifiant réduit la collision accidentelle ; il ne protège
d'aucun écrasement délibéré, puisqu'un attaquant choisit ses identifiants.

### É-7 — la suite est verte

`504 passed, 30 skipped, 0 failed`. Les trois fichiers d'intégration se
sautent sans instance configurée et **redeviennent actifs** dès
`EXPO_PUBLIC_BACKEND_URL` posée — vérifié dans les deux sens, pour ne pas
avoir remplacé un rouge permanent par un silence permanent.

### Preuve des correctifs

Chaque garde a été cassée pour vérifier qu'elle échoue :

- sans le cloisonnement, les 4 contrôles de collision de
  `test_isolation_coops.py` tombent côté Firestore et passent côté MongoDB —
  soit exactement la divergence d'origine ;
- avec l'ancien `uid()`, 2 des 5 contrôles de `tests/uid.test.mjs` tombent.

**Un de mes propres tests était défaillant.** Une première version éprouvait
`uid()` par collision sur 200 000 tirages. Avec l'ancien générateur (~36 bits),
une collision n'a qu'environ **une chance sur quatre** de survenir : le test
laissait donc passer trois fois sur quatre une implémentation cassée, en
rassurant. Remplacé par un contrôle déterministe de l'usage effectif de
`crypto.getRandomValues`.

### Ce que ces correctifs NE couvrent pas

- **`test_multicoop_isolation.py` ne tourne toujours pas** sans instance
  déployée. Il est désormais sauté au lieu d'échouer, ce qui est honnête, mais
  la couverture réelle vient de `test_isolation_coops.py`, en processus et sur
  les deux dépôts.
- **Rien n'a été éprouvé contre un vrai Firestore** depuis ce correctif. La
  répétition (`scripts/repetition_firestore.py`) doit être rejouée par
  l'opérateur avant toute bascule.
- Les sections §5.7 à §5.13 de l'audit (règles métier, invariants de données,
  offline, sécurité classée, APK) **ne sont pas faites**.

## 6. Règles métier et valeurs (§5.7 / §5.8)

Sondes : `audit/verifier_regles_metier.py`, deux dépôts.

`CLAUDE.md` §2 énonce le partage : « toute la logique de calcul d'argent est
côté client ; le serveur contrôle *qui a le droit d'écrire quoi* ». Pris au
mot, cela veut dire qu'un appareil modifié écrit ce qu'il veut. C'était le cas.

### B-02 🟠 — Aucune valeur n'était contrôlée par le serveur — **corrigé en partie**

Avant correctif, **4 règles sur 12** seulement étaient appliquées côté serveur.
Un agent muni d'un jeton légitime enregistrait, avec un `200` en retour :
−500 kg, un paiement négatif, un prix de 9 000 000 F/kg, une avance au statut
`"valide"`, un montant d'avance négatif. Le patron, souverain
(`server.py:838`, retour anticipé), n'était limité par rien.

Corrigé (`_valider_valeurs`) : refus de tout champ de poids ou d'argent
**négatif** (invariants 8 et 16) et de tout statut d'avance hors des quatre
valeurs (invariant 15), **pour tous les rôles, patron compris** — c'est une
règle de validité, pas d'autorisation. On passe à **7/12**.

### Ce qui reste volontairement côté client

| Règle | Pourquoi elle n'est PAS appliquée au serveur |
|---|---|
| `brut == kg × prixKg` | Les retenues et la tare par sac rendent l'égalité fausse sur une pesée légitime |
| `memberId` doit exister | En hors-ligne d'abord, une pesée arrive légitimement **avant** la fiche du planteur |
| Dates vraisemblables | Une horloge déréglée n'invalide pas la pesée réelle |
| `paye <= net` | Impossible d'établir qu'un dépassement est toujours illégitime |

Ce sont des **arbitrages**, pas des oublis : les serrer sans mesurer ce qu'ils
rejettent d'un usage réel casserait des flux normaux. Consigné en
invariant 19bis.

## 7. Hors-ligne et synchronisation (§5.10)

Sondes : `audit/verifier_synchro.py`. **5 vertes sur 7.**

Ce qui tient : une horloge en avance est ramenée au présent (`_normalize_ts`,
tolérance 5 min) sans figer l'enregistrement ; une création passe quelle que
soit l'horloge ; une absence n'efface rien (invariant 3) ; une pesée rejouée
n'est enregistrée qu'une fois (invariant 11).

### B-03 🟠 — Une horloge en RETARD perd des modifications, en silence

`prepareSync` (`sync.ts:47`) pose `new Date().toISOString()` : l'horodatage qui
arbitre les conflits vient de **l'horloge du téléphone**. `_normalize_ts`
(`server.py:472`) ramène une horloge en **avance** — mais ne fait rien d'une
horloge en **retard**.

Conséquence mesurée : un téléphone dont l'horloge retarde de plusieurs mois
voit ses **modifications** d'enregistrements existants silencieusement
ignorées. Le `PUT` répond `200`, l'application affiche « Synchronisé », et rien
n'a été enregistré.

Les créations passent (`merge_state` crée sans comparer d'horodatage) : c'est
donc un défaut **partiel**, ce qui le rend plus difficile à voir. Les cas
touchés sont des modifications qui comptent : la **déclaration de livraison**
d'un pisteur (`livraison` posé sur une collecte existante), la
**vérification** du magasinier (`verif`), le **solde d'un reste dû**
(`resteSolde`).

C'est exactement le mode de défaillance que l'invariant 27 combat — l'appareil
croit avoir synchronisé — mais la cause n'est pas le réseau, c'est l'horloge,
et le bandeau de synchro ne peut pas la voir.

**Pourquoi je ne l'ai PAS corrigé.** Ramener aussi les horodatages du passé
serait pire : un pisteur qui pèse à 8 h et synchronise à 18 h a légitimement un
horodatage ancien. Le ramener au présent ferait gagner l'appareil qui
synchronise en dernier, et écraserait des écritures valides. Depuis
l'horodatage seul, « ancien parce que hors ligne » et « ancien parce que
l'horloge est fausse » sont indiscernables.

**Recommandation** — rendre le décalage visible plutôt que de le deviner :
le serveur expose son heure (`/health` porte déjà un marqueur ; y ajouter
`now` ne touche pas `/api/state`, donc aucun risque au titre de l'invariant 23),
l'application compare à son horloge et affiche un avertissement au-delà d'un
seuil. Décision produit : je ne l'ai pas prise.

### B-04 🟡 — Deux modifications concurrentes : la plus récente emporte tout

Deux appareils partis de la même copie modifient des champs **différents** du
même enregistrement. Le second écrase le premier : mesuré, le `village` posé
par A disparaît quand B enregistre un changement de téléphone.

C'est le comportement documenté (« le `updatedAt` le plus récent gagne »,
invariant 3), mais la formule « la fusion est **champ par champ** » du même
invariant prête à confusion : elle décrit la préservation des champs que le
client ne reçoit pas (les `pin`), **pas** une fusion de modifications
concurrentes. La résolution est bien du dernier-écrivain-gagne par
enregistrement.

Portée réelle limitée : pour les rôles restreints, la liste de champs
autorisés transforme ce cas en **403** plutôt qu'en écrasement silencieux — un
champ modifié hors de la liste est refusé. Seul le **patron**, souverain,
écrase en silence. Le cas se présente donc quand le même patron travaille
depuis deux appareils, ou depuis l'application et le tableau de bord admin.

## 8. Sécurité (§5.11)

| Gravité | Constat | État |
|---|---|---|
| 🔴 | **B-01** — une coopérative écrase les données d'une autre (Firestore) | ✅ corrigé |
| 🟠 | **B-02** — aucune valeur contrôlée côté serveur | ✅ corrigé en partie |
| 🟠 | **B-03** — perte silencieuse sur horloge en retard | ⏸️ décision produit |
| 🟠 | `uid()` à 36 bits non cryptographiques | ✅ corrigé |
| 🟠 | 12 tests rouges permanents masquant les régressions | ✅ corrigé |
| 🟡 | **B-04** — écrasement concurrent (patron seul) | ⏸️ à arbitrer |
| 🟡 | Jeton de 30 jours non révocable ; durée non configurable | ⏸️ connu, documenté |
| 🟡 | Permission Face ID déclarée pour un module mort | ⏸️ décision produit |

### Ce qui a été vérifié et tient

- **Aucun secret versionné.** `git ls-files` ne remonte ni `.env`, ni clé, ni
  compte de service. `admin123` n'apparaît que dans les valeurs par défaut du
  harnais de test (`tests/conftest.py:26`), jamais dans du code de production.
- **Aucune route de données sans garde.** Les 21 routes ont été énumérées :
  toutes celles qui lisent ou écrivent portent `Depends(require_user)` ou
  `Depends(require_admin)`. Les seules routes ouvertes sont les trois
  connexions, l'inscription, `/health`, `/` et la page HTML admin.
- **Vérification du jeton stricte** (`server.py:352`) : algorithme épinglé
  (`algorithms=[JWT_ALGORITHM]`, donc pas de confusion RS256/HS256) et
  revendications obligatoires (`exp`, `sub`, `coopId`, `side`).
- **Empreintes `pin`** : ne sortent ni vers l'application, ni vers l'admin.
  Vérifié par sonde sur les deux dépôts (ISO-6).
- **Anti-force-brute** sur les trois circuits de connexion, verrou par
  identifiant tenté et non par IP, avec temps de calcul constant pour un compte
  inconnu (`burn_secret_time`).

### Ce que cet audit n'a PAS regardé

Pas de revue du tableau de bord HTML admin (injection dans le rendu), pas de
test de charge, pas d'analyse des dépendances transitives (`yarn audit` non
exécuté : le réseau sortant est filtré dans l'environnement d'audit), pas de
revue du chiffrement du cache local au-delà de la lecture de `secureCache.ts`.

## 9. État réel de l'intégration Firebase (§5.12)

| Composant | Réalité aujourd'hui |
|---|---|
| Base de données | **MongoDB** (`DATA_BACKEND=mongo` par défaut, `server.py:47`) |
| Firestore | Code prêt et éprouvé, base créée et **vide**, `europe-west1` — non branché |
| Firebase Auth | Code prêt, **inerte** sans compte de service (`firebase_auth.disponible()`) |
| Sessions applicatives | **Jeton VALEO HS256**, 30 jours. Firebase s'ajouterait, ne remplace pas |
| SDK Firebase JS | **Non installé**, délibérément (REST, `firebase.ts`) |
| Hosting | Configuré (`firebase.json`), **non déployé** |
| Cloud Run | Configuré (`cloudbuild.yaml`), **non déployé** — exige le plan Blaze |
| Règles Firestore | `allow read, write: if false` — correct, le backend est seul écrivain |

Autrement dit : **rien n'est encore branché sur Firebase**. Tout le code des
six phases existe, il est testé, et la répétition contre le vrai Firestore
passe — mais l'application en production tourne toujours sur MongoDB et sur
le jeton VALEO. C'est la position la plus sûre pour cette étape.

## 10. MongoDB : conserver ou repartir vierge ? (§5.2)

**Recommandation ferme : repartir sur une base vierge.**

Précision de méthode : je n'ai **aucun accès** à votre base MongoDB. « Données
de test uniquement » est un fait que **vous confirmez**, pas une constatation
technique de cet audit. La recommandation en dépend entièrement.

Cela posé, six raisons, dont deux qui ne relèvent pas du confort :

1. **La migration transporte les empreintes `pin`.** C'est justement ce qui la
   rend délicate (invariant 32 : ne jamais passer par `/api/admin/state`, qui
   les retire). Sur des données sans valeur, on prend ce risque pour rien.
2. **Les identifiants des données de test sont issus de l'ancien `uid()`** —
   7 caractères. Ils resteront tels quels après migration. Repartir vierge fait
   naître toutes les données avec des identifiants solides.
3. Une base vierge permet de **vérifier la bascule pour de vrai** :
   `verifier_bascule.py` refuse deux bases vides, donc vous éprouverez le
   circuit complet en créant vos vraies coopératives.
4. Les données de test portent des **noms d'essai** qui traîneront dans les
   bilans et les exports.
5. Un passage de migration en moins, c'est une occasion d'erreur en moins.
6. MongoDB n'est jamais modifié par la migration : garder l'instance quelques
   semaines vous laisse un filet, sans rien coûter.

**Transition propre, sans casser le code ni perdre de fonctionnalité** —
aucune modification n'est nécessaire :

1. `DATA_BACKEND=firestore` sur le nouveau déploiement. Rien d'autre à changer :
   `depot.py` est un port, `authorize_state_write`, `merge_state` et
   `scope_state` ne bougent pas.
2. **Ne pas exécuter** `migrer_vers_firestore.py`.
3. Créer les vraies coopératives par `POST /api/auth/register`, puis les
   collaborateurs et planteurs depuis l'application ou l'espace admin (le
   secret se pose par `POST /api/admin/set-secret`, haché côté serveur).
4. Garder MongoDB en l'état, sans le supprimer, jusqu'à ce que la production
   Firestore ait tourné plusieurs semaines.
5. Le retour arrière reste immédiat tant qu'aucune vraie pesée n'est
   enregistrée sur Firestore (invariant 32).

## 11. Plan Blaze : quand ? (§ demandé)

**Recommandation : maintenant, mais avec un budget posé — et pas avant d'avoir
rejoué la répétition Firestore sur le code corrigé.**

Raisonnement : les trois étapes qui restent (Cloud Run, Hosting, APK de test)
exigent toutes Blaze, et l'audit n'a plus rien à trouver sans un déploiement
réel. Continuer sans Blaze, c'est s'arrêter.

Le coût est maîtrisable : `_MIN_INSTANCES=0` pendant la mise au point ramène
Cloud Run à presque rien, et Firestore comme Hosting restent dans leurs paliers
gratuits pour quelques coopératives. Posez un budget avec alertes **avant** le
premier déploiement — en sachant qu'un budget Google **n'arrête rien**, il
prévient seulement.

## 12. APK Android (§5.13)

**État actuel** : projet Expo « managed » (SDK 54) — ni dossier `android/`, ni
`ios/`. **`eas.json` est absent**, donc aucune construction n'est configurée.
`google-services.json` n'est pas nécessaire : le SDK Firebase n'est pas
installé, tout passe en REST.

🔴 **À régler AVANT le premier APK** : `app.json:14` et `:24` portent
`com.emergent.appdeploy.tyyn4z`, hérité du constructeur précédent. **Cet
identifiant est définitif une fois publié** sur Google Play — il ne se change
pas, il faut republier une application distincte et perdre installations et
avis. C'est une ligne aujourd'hui, plus rien après.

**Procédure, étape par étape :**

```bash
# 1. Choisir l'identité de l'application (À FAIRE D'ABORD)
#    app.json : "package" et "bundleIdentifier" -> com.votredomaine.valeo
#                "slug" et "scheme"             -> valeo

# 2. Outillage
npm install -g eas-cli
eas login                       # compte Expo

# 3. Configurer la construction (crée eas.json)
cd frontend
eas build:configure -p android
```

`eas.json` doit contenir un profil produisant un **APK** (installable
directement) et non un AAB :

```json
{
  "build": {
    "preview":    { "android": { "buildType": "apk" },
                    "env": { "EXPO_PUBLIC_BACKEND_URL": "https://<cloud-run>" } },
    "production": { "android": { "buildType": "app-bundle" } }
  }
}
```

```bash
# 4. Construire (sur les serveurs Expo, ~15 min)
eas build -p android --profile preview
```

**Points d'attention :**

- **`EXPO_PUBLIC_BACKEND_URL` est figée AU BUILD** (invariant 27). Pour un APK,
  y mettre l'**URL absolue** de Cloud Run — un téléphone n'a pas d'origine.
  Changer d'adresse impose de **reconstruire**.
- **Signature** : EAS génère et conserve un magasin de clés à la première
  construction. Le sauvegarder (`eas credentials`) : le perdre interdit toute
  mise à jour de l'application sur Play.
- **APK vs AAB** : l'APK s'installe directement sur un téléphone (tests avec
  vos partenaires) ; **Google Play exige un AAB** (profil `production`).
- **Récupération** : le lien de téléchargement s'affiche en fin de
  construction et reste disponible sur `expo.dev` → votre projet → Builds.
- **Installation** : transférer l'APK sur le téléphone, autoriser
  « Installer des applications inconnues » pour l'application qui l'ouvre.
- **Résoudre d'abord les 4 copies d'`expo-constants`** (cf. N1-5) : un module
  natif dupliqué fait échouer une construction native.

## 13. Régression de bout en bout (§5.9)

**Non exécutée comme scénario unique.** Le parcours complet que vous décrivez
— créer un planteur → collecte → bordereau → paiement partiel → dette →
nouvelle collecte → remboursement → soldes finaux — n'a pas été rejoué de bout
en bout par cet audit.

Ce qui existe : les 552 tests du dépôt couvrent ces mécanismes **par
morceaux**, et les 159 tests frontend couvrent les formules d'argent
(`memberStats`, `pisteurStats`, `outstandingReste`, recouvrement FIFO,
`stockStats`, livraisons). C'est solide, mais ce n'est pas la même chose qu'un
enchaînement réel où les soldes doivent se recouper à la fin.

**C'est le manque le plus important de cet audit**, et il se comble mieux par
les tests physiques avec vos partenaires que par un script.

## 14. Décision — 🟠 **GO AVEC CORRECTIONS**

### Note globale : **74 / 100**

Décomposition, pour que le chiffre veuille dire quelque chose :

| Axe | Note | Motif |
|---|---|---|
| Architecture | 17/20 | Séparation nette, ports bien posés, invariants écrits et tenus |
| Sécurité | 14/20 | Un critique trouvé et corrigé ; il n'aurait pas dû exister |
| Qualité / tests | 17/20 | Discipline rare ; mais la garantie n°1 reposait sur un test qui ne tournait pas |
| Robustesse hors-ligne | 12/20 | Perte silencieuse sur horloge décalée, non corrigée |
| Préparation production | 14/20 | Identité applicative non fixée, pas d'`eas.json`, rien de déployé |

### GO pour quoi

**Oui** pour l'étape suivante : déployer sur Cloud Run, construire un APK et
faire tester par vos partenaires sur le terrain.

**Non** pour une mise en production auprès de vraies coopératives, tant que les
points ci-dessous ne sont pas réglés.

### Corrections requises, par ordre

1. 🔴 **Fixer l'identifiant de paquet** (`app.json`). Irréversible après
   publication. Une ligne, aujourd'hui.
2. 🟠 **Rejouer la répétition Firestore** sur le code corrigé
   (`scripts/repetition_firestore.py`). Le cloisonnement des clés n'a été
   éprouvé que contre le double en mémoire.
3. 🟠 **Trancher B-03** (horloge en retard). Au minimum, afficher un
   avertissement de décalage — un pisteur qui perd sa journée sans le savoir
   est le pire scénario pour ce produit.
4. 🟠 **Rejouer le parcours de bout en bout** (§13), en priorité pendant les
   tests physiques, en vérifiant que les soldes se recoupent.
5. 🟡 Décider du sort de `biometric.ts` et de la permission Face ID.
6. 🟡 Résoudre les 4 copies d'`expo-constants` avant le premier build.
7. 🟡 Arbitrer B-04 (écrasement concurrent côté patron).

### Ce qui rend ce GO possible

Le dépôt est dans un état inhabituellement bon : les invariants sont écrits,
les arbitrages sont documentés avec leurs raisons, et la suite de tests est
sérieuse. Le défaut critique trouvé (B-01) n'était pas un défaut de
négligence — il venait d'une optimisation légitime dont personne n'avait vu
la conséquence, et il ne concernait qu'une bascule pas encore faite. C'est
précisément ce qu'un audit avant déploiement doit attraper.

## 15. Suite du travail

Sections restant à établir : matrice de rôles et tests d'accès (§5.6),
règles métier (§5.7), invariants de données (§5.8), scénarios de bout en bout
(§5.9), offline/sync (§5.10), sécurité classée (§5.11), état Firebase (§5.12),
procédure APK (§5.13), décision Mongo (§5.2), moment du passage à Blaze,
et Go/No-Go.
