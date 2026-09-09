# Migration VALEO vers Firebase

> État : **phases 2 à 6 livrées**, sur la branche **`develop`**.
> Ce document dit ce qui est fait, ce qu'il reste à faire, et **ce que vous
> devez faire vous-même** dans la console Firebase.

---

## ⚠️ Avant tout : travailler sur `develop`

`main` est la branche par défaut du dépôt — **`git clone` y atterrit** — et elle
a plusieurs dizaines de commits de retard. Elle ne contient ni `depot.py`, ni
`firebase_auth.py`, ni le `Dockerfile`, ni la vérification des livraisons, ni
l'espace admin synchronisé, ni le diagnostic de connexion.

```bash
git checkout develop
git branch --show-current      # doit afficher : develop
```

Une modification écrite sur `main` est écrite contre du code qui n'existe plus.

### Ce qui se passe si on relance `firebase init`

Il écrase `firestore.rules` avec **des règles ouvertes à tout internet** :

```
allow read, write: if request.time < timestamp.date(2026, 10, 7);
```

N'importe qui connaissant l'identifiant du projet peut alors lire et effacer
toute la base — planteurs, pesées, avances — jusqu'à cette date. Les règles de
ce dépôt refusent tout accès direct, et c'est **correct** : le backend écrit
avec l'Admin SDK, qui les contourne (invariant 29). Deux tests
(`test_deploiement.py`) refusent désormais que les règles par défaut entrent
dans le dépôt. Ne jamais faire `firebase deploy --only firestore:rules` avec
les règles issues d'un `firebase init`.

### Ce qui ne doit PAS entrer dans le frontend

* **le paquet `firebase`** (SDK JS) : l'échange de jeton tient en deux requêtes
  REST (`src/coop/firebase.ts`). Le SDK pèse plusieurs centaines de kilo-octets
  pour des téléphones d'entrée de gamme, et surtout il ouvre la porte à un accès
  direct à Firestore depuis l'application — exactement ce que l'invariant 29
  exclut ;
* **`npm install`** : le projet est sur **yarn** (`packageManager` dans
  `package.json`). Un `package-lock.json` à côté de `yarn.lock`, ce sont deux
  arbres de dépendances qui divergent ;
* **tout code qui lit ou écrit Firestore depuis le téléphone**
  (`getFirestore`, `setDoc`, `getDoc`…) : la matrice de rôles n'existe pas de
  ce côté-là.

Ces trois points sont tenus par des tests.

---

## Phase 2 — Authentification : ce qui a été fait

### Le choix technique, et pourquoi

Le fournisseur **« E-mail / Mot de passe » de Firebase ne convient pas à
VALEO**, et ce n'est pas une question d'algorithme de hachage :

| Circuit | Identifiant | Ce que Firebase exige |
|---|---|---|
| Collaborateur | e-mail **ou téléphone** | un e-mail |
| Planteur | code `VAL-XXXX-YY` **ou téléphone** | un e-mail |
| Propriétaire | *aucun identifiant* | un e-mail |

S'y ajoute le point décisif : le code à 6 chiffres est haché **sur le
téléphone** (`frontend/src/coop/pin.ts`). Le serveur ne voit jamais le clair —
or « E-mail / Mot de passe » attend précisément qu'on lui envoie le clair.
Importer les empreintes ne réglerait donc rien.

Le mode retenu est **Custom Authentication** (jeton personnalisé) :

```
téléphone → code à 6 chiffres → hachage LOCAL (inchangé)
          → POST /api/auth/*/login → le serveur vérifie le `pin` (inchangé)
          → le serveur frappe un jeton personnalisé Firebase
          → le téléphone l'échange contre un jeton d'identité (1 h, révocable)
          → il présente ce jeton au backend
```

**Aucune règle métier ne bouge.** L'isolation entre coopératives, la matrice
de rôles, le périmètre du planteur : tout reste où c'était, parce que le jeton
Firebase porte exactement les mêmes revendications que le jeton VALEO
(`coopId`, `role`, `side`).

### Le point que le plan initial oubliait : le hors-ligne

Un jeton d'identité Firebase vit **une heure** et se renouvelle **par le
réseau**. Un pisteur passe des jours en tournée sans réseau. S'il n'avait que
Firebase, il serait déconnecté au bout d'une heure, loin de tout, avec ses
pesées non synchronisées.

**Les deux jetons coexistent donc, et c'est délibéré :**

| | Jeton VALEO | Jeton Firebase |
|---|---|---|
| Durée | 30 jours | 1 heure, renouvelé automatiquement |
| Révocable | non | **oui, immédiatement** |
| Sans réseau | continue de servir | ne peut pas être renouvelé |
| Rôle | **filet hors-ligne** | session courante quand le réseau est là |

L'application présente le jeton Firebase quand il est frais, et **retombe sur
le jeton VALEO** dès que le renouvellement échoue. Le serveur accepte les deux
(`require_user`), en aiguillant sur l'algorithme de signature : HS256 = VALEO,
RS256 = Firebase. Chaque vérificateur refuse ce qui n'est pas de son ressort,
donc aucune confusion d'algorithme n'est possible.

### Fichiers

| Fichier | Rôle |
|---|---|
| `backend/firebase_auth.py` | frappe et vérifie les jetons, révocation. **Inerte sans configuration.** |
| `backend/server.py` | aiguillage des jetons, `POST /api/admin/revoke`, `authFirebase` dans l'empreinte |
| `frontend/src/coop/firebase.ts` | échange et renouvellement, **en REST, sans le SDK Firebase** |
| `frontend/src/coop/store.ts` | choix du jeton à présenter, repli hors-ligne |
| `backend/tests/test_firebase_auth.py` | 36 tests |
| `frontend/tests/firebase.test.mjs` | 12 tests |

Le SDK Firebase JS n'a **pas** été ajouté : il pèse plusieurs centaines de
kilo-octets et tire des dépendances natives, alors que tout ce dont on a besoin
tient en deux requêtes REST publiques. VALEO tourne sur des téléphones
d'entrée de gamme.

### Nouveauté fonctionnelle : révoquer un téléphone perdu

`POST /api/admin/revoke` — bouton **« Révoquer »** sur chaque compte du
tableau de bord. Il fait deux choses :

1. coupe **immédiatement** les sessions Firebase du compte ;
2. pose `desactive: true`, ce qui interdit toute reconnexion.

Soyez averti de la limite, elle est réelle : **un jeton VALEO déjà délivré
reste valable jusqu'à son expiration** (30 jours). C'est précisément le défaut
que Firebase corrige, et il ne disparaîtra complètement que le jour où le
jeton VALEO ne sera plus qu'un filet de secours court.

---

## Ce que vous devez faire, vous, dans la console

Rien de tout cela n'est fait par le code — ce sont des actions humaines.

1. **N'activez PAS « E-mail / Mot de passe ».** Vous ne vous en servirez pas.
   Dans *Authentication*, cliquez seulement sur **Commencer** pour initialiser
   le produit. Aucun fournisseur à activer : les jetons personnalisés n'en
   demandent aucun.

2. **Récupérez la clé d'API Web** : *Paramètres du projet → Général → Vos
   applications → Application Web*. C'est la valeur `apiKey`. Elle n'est pas
   secrète (elle identifie le projet, elle n'autorise rien).

3. **Récupérez un compte de service** : *Paramètres du projet → Comptes de
   service → Générer une nouvelle clé privée*. Ce fichier JSON, lui, est un
   secret de haut niveau : il donne tous les droits sur le projet.
   **Ne le committez jamais.**

4. **Backend** — dans `backend/.env` (jamais dans git) :

   ```
   FIREBASE_SERVICE_ACCOUNT_FILE=/chemin/vers/compte-de-service.json
   # ou, si votre hébergeur ne permet que des variables :
   # FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}   (le JSON sur une ligne)
   ```

   Puis `pip install -r requirements.txt`.

5. **Frontend** — avant de reconstruire l'APK :

   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
   ```

   ⚠️ Les variables `EXPO_PUBLIC_*` sont **figées au build**. Un APK déjà
   construit ne verra jamais cette valeur : il faut **reconstruire**
   (`npx eas build`). Tant que ce n'est pas fait, les téléphones existants
   continuent de fonctionner avec le seul jeton VALEO — c'est voulu, et c'est
   ce qui rend la bascule progressive.

6. **Vérifiez** : ouvrez `GET /api/diag` (ou l'écran « Connexion au serveur »
   de l'application). Le champ `authFirebase` doit passer à `true`. S'il reste
   à `false`, le compte de service n'est pas lu — le serveur continue de
   tourner normalement, il le dit simplement dans ses journaux.

### Ordre de déploiement

Le code peut être déployé **avant** toute configuration : sans compte de
service, `firebase_auth.disponible()` est faux, aucun jeton n'est frappé, et
le comportement est identique à aujourd'hui, ligne pour ligne. C'est ce qui
permet de déployer maintenant et de basculer quand vous voulez.

---

## Phase 3 — La base : MongoDB → Firestore

### Le choix : le backend reste le seul écrivain (option « a »)

`authorize_state_write`, `merge_state` et `scope_state` **ne changent pas d'une
ligne**. Le téléphone ne parle jamais directement à Firestore : il parle au
backend, qui autorise puis écrit avec les droits d'administration.

C'est le point où le plan initial proposait l'inverse — laisser le frontend
écrire, sécurisé par les *Security Rules*. Pour VALEO ce serait le geste le
plus risqué de toute la migration : la matrice de rôles est longue et subtile
(qui pèse, avec quelle origine, qui vérifie, qui recouvre quelle avance, à qui
appartiennent quelles dépenses), et elle est couverte par des centaines de
tests. La réécrire en Security Rules, c'est la refaire dans un langage moins
expressif et repartir de zéro sur la preuve. Une règle mal traduite, et une
coopérative voit les données d'une autre.

Ce qu'on y perd : la lecture temps réel côté client. Ce qu'on y gagne : ne pas
rejouer toute la sécurité du produit. On pourra ouvrir l'accès direct plus
tard, collection par collection, en lecture seule.

### Ce qui change réellement : la forme du stockage

MongoDB rangeait **tout l'état dans un seul document** `appstate`. Ce modèle
est doublement intransposable :

| | Limite Firestore | Conséquence |
|---|---|---|
| Taille | **1 Mio par document** | quelques milliers de pesées et la coopérative est bloquée |
| Débit | ~1 écriture/seconde sur un même document | tout le trafic d'une coop sur un seul document |
| Prix | facturé **à l'opération** | réécrire toute la base à chaque synchro |

D'où deux décisions, l'une et l'autre vérifiées par des tests :

1. **Un document par enregistrement**, une collection par entité
   (`members/<id>`, `collections/<id>`…). Les champs qui ne sont pas des
   tableaux (`seq`, `memberSeq`, `saison`, `priceHistory`) tiennent dans
   `meta/etat`.
2. **On n'écrit que ce qui a changé.** `charger()` retient une empreinte de
   chaque ligne telle qu'elle a été lue ; `enregistrer()` compare et n'envoie
   que les différences. *Une pesée = 2 écritures* (la collecte + l'horodatage),
   pas une par ligne de la base. C'est mesuré par un test, pas supposé.
3. **On ne lit que la coopérative du jeton.** `scope_state` et `merge_state`
   filtraient déjà sur `coopId ==` : borner la lecture écarte exactement les
   mêmes lignes, mais ne les facture pas. Les connexions et l'administration
   lisent tout — chercher un collaborateur par téléphone se fait sur toutes
   les coopératives.

L'empreinte est prise **à la lecture**, sur le contenu d'origine : certains
appels modifient une ligne sur place (`ligne["desactive"] = True`), et comparer
des objets aurait laissé passer ces changements.

### Le point délicat : une absence n'est pas une suppression

C'est l'invariant 3, et l'écriture différentielle en est le principal danger.
Un planteur ne renvoie que sa propre fiche ; un pisteur, que ce qu'il voit.
Effacer les documents « manquants » viderait la coopérative à la première
synchronisation d'un téléphone au périmètre réduit.

La règle appliquée : **est supprimé ce qui était dans la référence de lecture
et n'est plus dans l'état enregistré** — donc ce que `merge_state` a réellement
retiré (`deletions`, purge, suppression admin), jamais ce qui n'a pas été
envoyé. Ce qui n'a pas été lu n'est pas non plus dans la référence, donc ne
peut pas être supprimé.

### Comment on sait que rien n'a bougé

**Toute la suite de sécurité tourne deux fois** : une fois sur MongoDB, une
fois sur Firestore (`conftest.py` paramètre la fixture). Isolation entre
coopératives, matrice de rôles, périmètre du planteur, fusion par
enregistrement, idempotence, verrou anti-force-brute, synchronisation admin,
authentification Firebase — tout doit tomber identique des deux côtés.

| Fichier | Rôle |
|---|---|
| `backend/depot.py` | le port : `DepotMongo` et `DepotFirestore` |
| `backend/tests/faux_firestore.py` | double en mémoire de l'API Firestore asynchrone |
| `backend/tests/test_depot_firestore.py` | forme du stockage, coût des lectures et des écritures |
| `backend/tests/test_migration_firestore.py` | le script de migration, y compris sa relance |
| `backend/scripts/migrer_vers_firestore.py` | la bascule des données |

### Basculer les données

```bash
cd backend
python scripts/migrer_vers_firestore.py            # simulation : ne écrit rien
python scripts/migrer_vers_firestore.py --ecrire   # bascule réelle
```

Le script **relit ce qu'il vient d'écrire et le compare ligne à ligne** à la
source — pas seulement les comptages : un document tronqué compterait pour un.
En cas d'écart il s'arrête avec un code d'erreur, et **MongoDB n'est jamais
modifié**. Il est idempotent : le relancer après une interruption reprend sans
créer de doublon.

Sont migrés : l'état complet, le mot de passe administrateur, le journal
d'audit. Ne le sont pas : les compteurs de tentatives de connexion, éphémères
et reconstruits seuls.

### Basculer le backend

```
DATA_BACKEND=firestore
FIRESTORE_DATABASE=(default)     # si vous n'avez pas nommé la base autrement
```

Sans cette variable, **MongoDB reste la base** : ce code peut être déployé
avant toute bascule sans rien changer.

Une action à faire une fois dans la console : activer une **règle TTL** sur le
champ `expiresAt` de la collection `login_attempts` (*Firestore → TTL*). Elle
remplace l'index TTL de MongoDB et évite qu'un balayage d'identifiants fasse
grossir la collection sans fin.

### Ce qui reste à surveiller

* `priceHistory` vit dans le document `meta` : s'il devait grossir beaucoup, il
  faudrait en faire une collection à son tour (la limite de 1 Mio vaut aussi
  pour lui).
* Les connexions et l'espace d'administration lisent encore l'ensemble des
  coopératives. C'est correct et peu fréquent, mais c'est le prochain endroit
  où regarder si la facture surprend : une connexion pourrait viser un index
  sur le téléphone plutôt que balayer les collaborateurs.

---

## Phase 4 — Le backend sur Cloud Run

FastAPI est **conteneurisé tel quel**. Aucune ligne d'application ne change :
même `server.py`, même matrice d'autorisation, mêmes invariants. Seul
l'emballage est nouveau. Réécrire chaque endpoint en Cloud Functions aurait
été beaucoup de travail pour un gain nul ici.

### Trois défauts qui auraient bloqué le déploiement

Ils ne cassaient aucun test — c'est précisément ce qui les rend dangereux.
Chacun a désormais son test (`backend/tests/test_deploiement.py`).

1. **`requirements.txt` ne s'installe pas.** Il contient
   `emergentintegrations==0.2.0`, hérité du builder d'origine et **absent de
   PyPI** : `pip install -r requirements.txt` échoue, donc l'image ne se
   construit pas. Il embarque aussi pandas, numpy, boto3, jq, typer, passlib,
   python-jose — qu'aucun module n'importe.
   → `backend/requirements-prod.txt` ne déclare que le nécessaire. Un test
   vérifie qu'il couvre **tous** les imports réels, et que les gros inutiles
   restent dehors. `requirements.txt` n'est pas modifié : il reste le fichier
   de développement.
2. **Firestore réclamait MongoDB.** `os.environ["MONGO_URL"]` était lu au
   chargement, donc un déploiement Cloud Run + Firestore refusait de démarrer
   faute d'une base dont il n'a aucun usage.
   → Avec `DATA_BACKEND=firestore`, MongoDB n'est plus exigé et aucun client
   n'est créé.
3. **Le démarrage attendait 30 secondes.** Si MongoDB n'était pas joignable, la
   préparation des index patientait jusqu'au délai du pilote avant d'abandonner.
   Sur Cloud Run une instance démarre à chaque montée en charge — devant un
   pisteur qui attend sa synchronisation en bout de piste. *Mesuré : 30 s avant,
   4 s après.*
   → `STARTUP_TIMEOUT_SECONDS` (5 s par défaut) borne l'attente.

S'y ajoute un quatrième point, propre à Cloud Run : le compte de service y est
**ambiant** (serveur de métadonnées), sans fichier ni variable. Le code le
détecte (`K_SERVICE`) et utilise les identifiants par défaut — inutile, et
dangereux, d'y déposer une clé privée.

### Fichiers

| Fichier | Rôle |
|---|---|
| `backend/Dockerfile` | image mince, utilisateur non privilégié, écoute sur `$PORT` |
| `backend/.dockerignore` | tient `.env`, tests et scripts hors de l'image |
| `backend/requirements-prod.txt` | dépendances d'exécution, et elles seules |
| `backend/cloudbuild.yaml` | construction + déploiement |
| `firebase.json` | Hosting renvoie `/api/**` vers Cloud Run |
| `firestore.rules` | **tout accès direct refusé** — le backend est seul écrivain |
| `backend/tests/test_deploiement.py` | 17 tests : dépendances, conteneur, démarrage |

### Avant de déployer : vérifier la configuration

Le code est prêt ; ce qui fait rater un déploiement, ce sont les détails de
configuration, et ils ne se voient pas en relisant.

```bash
cd backend
pip install -r requirements-dev.txt                 # PAS requirements.txt
python scripts/verifier_configuration.py            # cible : site web
python scripts/verifier_configuration.py --cible apk
```

Il ne contacte rien et ne modifie rien : il lit la configuration locale et
signale les incohérences. Il n'affiche **aucun secret** — le rapport peut être
collé tel quel dans une demande d'aide.

Ce qu'il rattrape, entre autres :

* **`.firebaserc` et le compte de service qui désignent deux projets
  différents.** Hosting se déploie alors chez l'un pendant que le backend écrit
  chez l'autre, et l'on retombe très exactement sur « rien ne remonte dans le
  tableau de bord » (invariant 27). C'est le défaut le plus difficile à voir :
  tout fonctionne, mais à deux endroits.
* `DATA_BACKEND=firestore` sans compte de service joignable — sauf sur Cloud
  Run, où il est ambiant.
* Les deux renvois de `firebase.json` qui ne visent pas la même région, ou le
  repli SPA placé avant `/api/**` (l'application recevrait du HTML).
* Les règles Firestore par défaut de `firebase init`, le SDK Firebase installé,
  un `package-lock.json` là où le projet est sur yarn.
* `EXPO_PUBLIC_BACKEND_URL` renseignée pour une cible web (elle doit rester
  vide : même origine) ou vide pour un APK (il lui faut une URL absolue).

Les variables elles-mêmes sont décrites dans `backend/.env.example` et
`frontend/.env.example` : copiez-les en `.env` et renseignez-les. Un test
vérifie que **toute** variable lue par le code y figure.

### Choisir la région — pendant que la base est encore vide

La localisation d'une base Firestore est **définitive** : on ne la déplace pas,
on recrée la base. C'est donc maintenant, avant qu'il y ait la moindre donnée,
que cela se décide. Trois contraintes à faire coïncider :

1. Firebase Hosting ne sait renvoyer vers Cloud Run que dans un **jeu de
   régions précis** — à vérifier dans la documentation Hosting avant de choisir.
2. Cloud Run et Firestore devraient être dans la **même région** : sinon chaque
   lecture traverse un continent, à chaque synchronisation de chaque téléphone.
3. La latence jusqu'à la Côte d'Ivoire.

**Décision prise : `europe-west1` pour tout** — Cloud Run *et* Firestore.

Ce n'est pas un réflexe européen. Depuis Abidjan, le trafic part de toute façon
vers l'Europe par les câbles sous-marins (SAT-3, WACS, MainOne, ACE) ; joindre
`africa-south1` (Johannesburg) repasse souvent *par* l'Europe. L'Europe est donc
en pratique plus proche de la Côte d'Ivoire que l'Afrique du Sud, et le choix
coloque en prime Cloud Run avec la base — pas de traversée de continent à chaque
synchronisation, pas de trafic inter-régions facturé.

`firebase.json` et `cloudbuild.yaml` déclarent déjà `europe-west1`, et un test
(`test_configuration.py`) refuse que les deux renvois de Hosting divergent. Si
vous déployez Cloud Run ailleurs, changez **les deux**.

⚠️ **Une base Firestore créée dans une autre région doit être recréée**, pas
déplacée. Tant qu'elle est vide, l'opération est sans risque et sans perte :

```bash
# Ce qui existe, et où
gcloud firestore databases list --format='table(name,locationId,type)'

# Si la base par défaut n'est PAS en europe-west1 et qu'elle est VIDE :
gcloud firestore databases delete --database='(default)'
gcloud firestore databases create --database='(default)' \
  --location=europe-west1 --type=firestore-native
```

Vérifier qu'elle est bien vide avant : la console Firebase → Firestore Database
doit annoncer une base sans collection. Après la première pesée enregistrée,
cette porte est fermée (cf. invariant 32, le point de non-retour).

### Répéter contre le vrai Firestore, avant de déployer

Toute la suite de sécurité tourne contre un double en mémoire
(`tests/faux_firestore.py`). C'est rigoureux, mais un double ne connaît ni la
conversion des types au passage du réseau, ni les identifiants de document que
Firestore refuse, ni les index qu'il réclame. Ces défauts-là n'apparaissent
qu'en production — donc, sans répétition, pendant la bascule.

`scripts/repetition_firestore.py` fait tourner le VRAI backend, en processus,
branché sur la vraie base. Aucune ligne d'application n'est simulée. Il ne
demande **ni Cloud Run, ni plan Blaze** : Firestore fonctionne sur le plan
gratuit, ce qui permet de tout éprouver avant d'engager la moindre dépense.

```bash
cd backend
set -a; source .env; set +a
DATA_BACKEND=firestore FIREBASE_SERVICE_ACCOUNT_FILE=secrets/cle-service.json \
    python3 scripts/repetition_firestore.py
```

Il crée une coopérative, s'y connecte, envoie une pesée, la relit, vérifie que
les montants et les types ont traversé intacts, crée une SECONDE coopérative
pour éprouver l'isolation, contrôle qu'aucune empreinte `pin` ne sort, mesure
que l'écriture reste différentielle, puis **efface tout ce qu'il a créé**.

Il refuse de tourner si la base n'est pas vide (`--forcer` pour passer outre,
`--garder` pour inspecter le résultat dans la console au lieu de nettoyer).

La clé de compte de service se dépose dans `backend/secrets/`, un dossier
ignoré par git en entier : c'est une clé privée qui donne tous les droits sur
le projet, en contournant `firestore.rules` par conception (Admin SDK).

### Déployer

Une fois, pour préparer le terrain :

```bash
gcloud config set project VOTRE-PROJET
gcloud services enable run.googleapis.com cloudbuild.googleapis.com     artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create valeo     --repository-format=docker --location=europe-west1

# Les secrets vivent dans Secret Manager, jamais dans une variable en clair
# ni dans un fichier de build (les journaux de construction sont conservés).
printf '%s' 'VOTRE-MOT-DE-PASSE-ADMIN' |     gcloud secrets create valeo-admin-password --data-file=-
printf '%s' "$(openssl rand -hex 32)" |     gcloud secrets create valeo-jwt-secret --data-file=-
```

Puis, à chaque déploiement :

```bash
gcloud builds submit --config backend/cloudbuild.yaml
```

Et pour router le frontend et l'API sur une seule origine :

```bash
firebase deploy --only hosting,firestore:rules
```

### Vérifier que ça tourne

```bash
curl https://VOTRE-SERVICE.run.app/health
```

Doit répondre `{"status":"ok","instance":"…"}`. Ce marqueur est celui de
l'invariant 27 : comparez-le avec celui affiché dans l'écran « Connexion au
serveur » de l'application. Marqueurs identiques = même base ; différents =
deux déploiements, et vous venez de trouver la cause en deux secondes.

### Ce qu'il faut savoir avant de basculer

* **`--min-instances`** vaut **1 par défaut**, délibérément. À zéro, chaque
  première synchronisation après une accalmie paie un démarrage à froid. Une
  instance chaude coûte quelques euros par mois ; un pisteur qui attend en
  bout de piste coûte plus cher.
  C'est la substitution `_MIN_INSTANCES` de `cloudbuild.yaml`. **Tant que le
  service n'est utilisé par personne** — mise au point, déploiements d'essai —
  déployer avec `--substitutions=_MIN_INSTANCES=0` : rien ne tourne entre deux
  requêtes, la facture Cloud Run tombe à presque rien, et le démarrage à froid
  n'est subi que par vous. Le jour de la mise en service, redéployer **sans**
  la substitution : le défaut du fichier reprend la main, il n'y a rien à
  remettre en place ni à se rappeler d'annuler.
* **Le plan Blaze est requis** pour tout ce qui suit : Cloud Run, Artifact
  Registry, Secret Manager, et les renvois de Hosting vers Cloud Run. Le plan
  Spark (gratuit) n'a pas de compte de facturation, et ces services y sont
  simplement indisponibles. Blaze n'est pas un abonnement : les paliers
  gratuits de Firestore et de Hosting sont conservés, on ne paie que
  au-delà. Poser un **budget avec alerte** dans la console Google Cloud avant
  de déployer coûte deux minutes et évite les surprises.
* **`--allow-unauthenticated` est correct ici.** L'application mobile n'a pas
  de jeton Google : c'est le JWT de VALEO qui autorise, pas IAM. Le service est
  joignable, il n'est pas ouvert.
* **Plusieurs instances en parallèle**, c'est nouveau. Sur Firestore, chaque
  instance n'écrit que les enregistrements qu'elle a modifiés : deux
  synchronisations simultanées sur deux coopératives — ou même sur deux pesées
  d'une même coopérative — ne se recouvrent pas. C'est *meilleur* que le
  document unique de MongoDB, où le dernier écrivain emportait tout. La
  résolution reste celle de `merge_state` : le `updatedAt` le plus récent gagne.
* **CORS** : `allow_credentials=false` et le jeton voyage dans l'en-tête
  `Authorization`, pas dans un cookie. Une fois Hosting devant Cloud Run, tout
  partage la même origine et la question ne se pose plus. `CORS_ORIGINS` reste
  disponible pour restreindre.

---

## Phase 5 — Le frontend et Firebase Hosting

### Ce qui NE change pas

Le plan initial disait « remplace les appels à l'ancienne API par le SDK
Firebase (Auth + Firestore) ». Avec l'option (a) — backend seul écrivain — il
n'y a **rien à remplacer** : le frontend continue de parler à `/api/...`, et
c'est le backend qui autorise. Aucun écran, aucune formule, aucune règle
métier n'est touchée.

### Ce qui change : l'API devient *même origine*

Firebase Hosting renvoie `/api/**` vers Cloud Run (`firebase.json`). Sur le
web, l'API est donc servie par **la même adresse que la page**. Deux
conséquences, et un piège.

**Conséquence 1 — plus d'URL figée au build.** `EXPO_PUBLIC_BACKEND_URL` est
inlinée par Expo au moment de la construction (invariant 27) : sur un APK,
c'est inévitable — un téléphone n'a pas d'origine. Sur le web servi par
Hosting, la laisser **vide** est le bon réglage : les appels partent en
chemin relatif, et changer d'adresse de backend ne demande plus de
reconstruire le site.

**Conséquence 2 — plus de CORS.** Une seule origine pour la page et l'API.

**Le piège**, et c'est le vrai travail de cette phase : `store.ts` faisait

```ts
if (!BACKEND) return null;   // « pas d'URL » ⇒ « pas de serveur »
```

En mode même-origine, l'URL de base est **vide** — et l'application se serait
crue définitivement hors-ligne, sans jamais rien envoyer. Le module
`src/coop/backend.ts` (pur, testé) distingue les trois cas :

| `EXPO_PUBLIC_BACKEND_URL` | Support | Mode | Joignable |
|---|---|---|---|
| une URL | mobile ou web | `absolu` | oui |
| vide | **web** | `meme-origine` | **oui** — chemins relatifs |
| vide | mobile | `aucun` | non — et l'application le DIT |

### Un défaut trouvé au passage : le diagnostic devenait inaccessible

`BandeauSync` renvoyait `null` quand la synchronisation allait bien — or
c'était le **seul** accès à l'écran « Connexion au serveur ».

C'est exactement le scénario qui vous avait occupé : l'application se croyait
synchronisée (elle l'était, mais avec une *autre* instance), donc pas de
bandeau, donc aucun moyen d'ouvrir l'écran qui aurait montré l'empreinte et
réglé la question en dix secondes. L'invariant 27 parlait pourtant d'un
« bandeau permanent, sur tous les rôles » : le code ne le tenait pas.

Désormais, quand tout va bien, une ligne discrète remplace l'alerte :
« ✓ Synchronisé · 07/09/2026 · 19:59 — Connexion au serveur › ». Pas de bruit,
mais l'accès existe toujours.

### Vérifié pour de vrai

Le site a été **construit** (`expo export -p web`), servi par un serveur qui
reproduit les règles de `firebase.json` à l'identique (statique, `/api/**`
vers le backend, repli SPA en dernier), et piloté dans un navigateur :

* la connexion appelle `http://…:8090/api/auth/coop/login` — **la même origine**,
  aucune URL figée ;
* aucun bandeau « pas de serveur » ne s'affiche à tort ;
* l'écran de diagnostic s'ouvre alors que la synchro est **OK**, annonce le
  mode « même origine » et lit l'empreinte de la base ;
* une pesée saisie à l'écran **arrive dans la base** (0 → 1 collecte), par le
  chemin même-origine.

14 contrôles, aucune erreur JavaScript.

### Construire et déployer

```bash
cd frontend
yarn build:web            # produit frontend/dist (SPA, output "single")
cd ..
firebase deploy --only hosting
```

Avant le premier déploiement : `firebase use --add` pour rattacher le dossier
à votre projet (cela crée `.firebaserc`, qui contient votre identifiant de
projet — il n'est pas dans le dépôt).

### Le web et l'APK ne se règlent pas pareil

| | Web (Hosting) | APK (EAS Build) |
|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | **vide** — même origine | l'URL absolue du service Cloud Run |
| Changement d'adresse | rien à refaire, Hosting redirige | **reconstruire l'APK** |

C'est le même invariant 27 vu des deux côtés : ce qui est figé au build ne se
change pas depuis le serveur.

---

## Phase 6 — La bascule

C'est la phase où l'on peut perdre des données. Les cinq précédentes étaient
réversibles : celle-ci décide de l'endroit où votre coopérative travaillera
demain.

### Le danger principal : les APK déjà installés

`EXPO_PUBLIC_BACKEND_URL` est **figée au build** (invariant 27). Un téléphone
qui a l'application aujourd'hui continuera d'appeler l'**ancienne** instance
après la bascule, quoi que vous fassiez côté serveur. Ses pesées y seront bien
enregistrées — dans une base que plus personne ne consulte — et l'application
affichera **« Synchronisé »**.

C'est la perte la plus vicieuse du projet : silencieuse, et du point de vue du
pisteur tout va bien.

**Le remède** : posez `BACKEND_DEPRECIE` sur l'ANCIEN déploiement.

```
BACKEND_DEPRECIE=https://valeo-backend.run.app - installez la nouvelle version
```

Le serveur ajoute alors un en-tête `X-Valeo-Deprecie` à **toutes** ses
réponses, y compris les refus (un jeton expiré doit prévenir lui aussi).
L'application l'affiche en rouge, avant tout le reste, sur tous les rôles :
« Cette version doit être mise à jour ».

L'ancien serveur **continue de fonctionner** : des agents sont peut-être encore
en tournée avec des pesées à envoyer. Il prévient, il ne se saborde pas.

Deux détails qui ont leur importance :

* c'est un **en-tête**, jamais un champ de `/api/state`. `prepareSync` renvoie
  toutes les lignes reçues : un champ ajouté à l'état repartirait au serveur et
  serait lu comme une modification interdite — 403 sur tout le PUT
  (invariant 23) ;
* un en-tête HTTP ne véhicule que du **latin-1**. Un message écrit en français
  attrape naturellement un tiret cadratin ou une apostrophe courbe, et Starlette
  lève alors — le serveur répondant **500 sur toutes les requêtes**. Le message
  est donc assaini au chargement (les accents, eux, passent). Défaut réel,
  trouvé en exécutant, pas en relisant.

### Ne migrez PAS par l'API d'administration

Trouvé pendant la préparation de cette phase, et ça aurait bloqué toute la
coopérative :

`GET /api/admin/state` **retire les empreintes `pin`** — c'est l'invariant 5,
et il est correct : les empreintes ne quittent jamais le serveur, pour aucun
rôle, l'administrateur compris. Copier l'état d'une instance à l'autre par
cette API transporte donc tout **sauf les codes secrets**. Les comptages
concordent, les données sont là… et le lendemain **plus personne ne peut se
connecter**.

Utilisez `scripts/migrer_vers_firestore.py`, qui lit MongoDB directement,
côté serveur, et transporte bien les empreintes (couvert par
`test_les_empreintes_de_code_secret_suivent`).

### Le contrôle de pré-bascule

« Ne coupe pas l'ancien tant que le nouveau ne tourne pas parfaitement en
parallèle » est un bon conseil, mais il ne se vérifie pas à l'œil.

```bash
cd backend
python scripts/verifier_bascule.py \
    --ancien https://ancienne-instance \
    --nouveau https://valeo-backend.run.app \
    --admin 'MOT-DE-PASSE-ADMIN' \
    --compte patron@votrecoop.ci --secret 'SON-CODE'
```

Il interroge les **deux** déploiements et refuse la bascule (code de sortie 1)
tant que :

1. les deux marqueurs de `/health` ne **diffèrent** pas — s'ils sont identiques,
   les deux URL désignent le même déploiement et il n'y a rien à basculer ;
2. l'ancien ne contient pas réellement de données — deux bases vides
   « concordent » parfaitement, et la comparaison ne veut alors rien dire ;
3. les comptages par entité ne concordent pas des deux côtés ;
4. un compte réel n'arrive pas à **se connecter** au nouveau — c'est ce
   contrôle qui rattrape les codes secrets perdus ;
5. une écriture d'essai n'est pas acceptée puis relue — une bascule vers un
   serveur en lecture seule ne se verrait qu'au premier pisteur qui pèse.
   L'essai est **retiré** derrière lui ;
6. l'ancien n'annonce pas encore sa dépréciation.

Renseignez `--compte` et `--secret` : sans eux, rien ne prouve que les codes
secrets ont suivi, et le script vous le dit.

### La marche à suivre

1. **Déployer** le nouveau backend (phase 4) et le site (phase 5), sans rien
   couper. Les deux instances tournent en parallèle.
2. **Migrer** les données : `python scripts/migrer_vers_firestore.py --ecrire`.
3. **Laisser tourner** en parallèle quelques jours. Les téléphones écrivent
   encore sur l'ancien.
4. **Vérifier** : `python scripts/verifier_bascule.py …` doit sortir en 0.
5. **Dernier passage de migration**, juste avant de basculer :
   ```bash
   python scripts/migrer_vers_firestore.py --ecrire --miroir
   ```
   `--miroir` est indispensable ici. La migration écrit et n'efface jamais :
   une fiche supprimée entre les deux passages survivrait dans Firestore et
   **réapparaîtrait** après la bascule. Le miroir retire de la cible ce qui
   n'existe plus à la source, et rien d'autre.
6. **Poser `BACKEND_DEPRECIE`** sur l'ancien déploiement.
7. **Reconstruire l'APK** avec la nouvelle URL (`npx eas build`) et le
   distribuer. Le site web, lui, est déjà à la bonne adresse — il est en mode
   même-origine (invariant 31).
8. **Attendre** que les téléphones aient migré. L'écran « Connexion au
   serveur » de chacun montre l'empreinte de l'instance qu'il atteint : c'est
   la façon de savoir qui est passé.
9. **Ne couper l'ancien qu'ensuite**, et pas avant d'avoir gardé une sauvegarde
   de sa base.

### Revenir en arrière

Tant que vous n'avez pas coupé l'ancien, le retour est immédiat : remettez
`DATA_BACKEND=mongo` et retirez `BACKEND_DEPRECIE`. MongoDB n'a jamais été
modifié — ni par la migration, ni par le contrôle de pré-bascule.

**Après** avoir laissé les téléphones écrire sur Firestore, ce n'est plus
vrai : les écritures faites là-bas ne sont pas dans MongoDB, et aucun script ne
fait le chemin inverse. Le point de non-retour n'est pas le déploiement, c'est
**la première pesée enregistrée sur le nouveau**.

---

## Phases suivantes — état

| Phase | État | Remarque |
|---|---|---|
| 1 — Projet Firebase, outils | fait par vous | — |
| **2 — Authentification** | **livrée** | reste à configurer et reconstruire l'APK |
| **3 — MongoDB → Firestore** | **livrée** | reste à basculer les données et `DATA_BACKEND` |
| **4 — FastAPI → Cloud Run** | **livrée** | reste à construire l'image et à déployer |
| **5 — Frontend + Hosting** | **livrée** | reste à construire et à déployer |
| **6 — Bascule** | **outillée** | la procédure est à exécuter par vous, avec `verifier_bascule.py` |

### Note sur la phase 3 (conservée : c'est la décision qui a été prise)

Le plan évoque de laisser le frontend parler **directement** à Firestore,
sécurisé par les *Security Rules*. Pour VALEO, ce serait le point le plus
risqué de toute la migration, et il faut le décider en connaissance de cause :

`authorize_state_write` (dans `server.py`) est une matrice de rôles longue et
subtile — qui peut peser, pour qui, avec quelle origine, qui vérifie quoi, qui
recouvre quelle avance, quelles dépenses appartiennent à qui. Elle est
couverte par près de 200 tests. **La réécrire en Security Rules, c'est la
réécrire entièrement, dans un langage moins expressif, et repartir de zéro sur
la preuve.** Une seule règle mal traduite, et une coopérative voit les données
d'une autre.

La voie sûre est celle que votre document appelle « l'alternative plus
simple » : **le backend reste le seul à écrire**, via l'Admin SDK, et garde
`authorize_state_write` telle quelle. Le frontend ne parle jamais directement
à Firestore. On y perd la lecture temps réel côté client ; on y gagne de ne
pas rejouer toute la sécurité du produit. Recommandation : commencer ainsi, et
n'ouvrir l'accès direct que sur des collections en lecture seule, une par une,
si le besoin apparaît.

Second point, budgétaire : Firestore facture **à l'opération**. VALEO stocke
aujourd'hui **un seul document** contenant tout l'état, lu et réécrit à chaque
synchronisation. Transposé tel quel, ce modèle est à la fois impossible
(limite de 1 Mo par document) et ruineux. La phase 3 est donc une vraie
refonte du modèle de données, pas un export/import — c'est le gros morceau.
