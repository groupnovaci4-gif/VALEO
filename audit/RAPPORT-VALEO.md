# Audit pré-déploiement VALEO

> **Document en cours de rédaction.** Ceci est le **point de contrôle 1** :
> cartographie du dépôt et contrôles de niveau 1. Les sections 4 à 12 du
> livrable demandé (bugs, régressions, sécurité classée, Go/No-Go) ne sont pas
> encore établies — les écrire maintenant reviendrait à conclure avant d'avoir
> regardé.
>
> Révision auditée : `60e70e0`, branche `audit/pre-deploy`.

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

## 5. Suite du travail

Sections restant à établir : matrice de rôles et tests d'accès (§5.6),
règles métier (§5.7), invariants de données (§5.8), scénarios de bout en bout
(§5.9), offline/sync (§5.10), sécurité classée (§5.11), état Firebase (§5.12),
procédure APK (§5.13), décision Mongo (§5.2), moment du passage à Blaze,
et Go/No-Go.
