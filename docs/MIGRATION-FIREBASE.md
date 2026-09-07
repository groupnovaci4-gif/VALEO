# Migration VALEO vers Firebase

> État : **phase 2 livrée** (authentification). Phases 3 à 6 à venir.
> Ce document dit ce qui est fait, ce qu'il reste à faire, et **ce que vous
> devez faire vous-même** dans la console Firebase.

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

## Phases suivantes — état

| Phase | État | Remarque |
|---|---|---|
| 1 — Projet Firebase, outils | fait par vous | — |
| **2 — Authentification** | **livrée** | reste à configurer et reconstruire l'APK |
| **3 — MongoDB → Firestore** | **livrée** | reste à basculer les données et `DATA_BACKEND` |
| 4 — FastAPI → Cloud Run | à faire | conteneuriser tel quel, la moindre réécriture |
| 5 — Frontend + Hosting | à faire | — |
| 6 — Bascule | à faire | ne pas couper l'existant avant que Firebase tourne en parallèle |

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
