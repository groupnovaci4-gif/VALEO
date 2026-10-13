# Déménagement de la base Firestore en Europe (europe-west1)

> Plan — **rien n'a été exécuté sur `dinerox-app`** à part la sauvegarde du 13/10/2026 et des
> commandes en lecture seule. Le back-office (docs/backoffice.md §16) est en pause : il sera
> installé directement sur la base européenne.

## 1. En bref

- La base `(default)` est aux États-Unis (`nam5`) ; les Cloud Functions sont déjà en Europe
  (`europe-west1`). Firebase ne permet pas de déplacer une base : il faut en recréer une et y
  recopier les données.
- **Méthode recommandée : supprimer puis recréer la base `(default)` en `europe-west1`**, en
  passant par une base européenne provisoire (`eu-staging`) qui garde une copie complète
  pendant toute la manœuvre. **L'app ne change pas** (même nom de base, même projet).
- La base est minuscule (916 documents, 12 comptes) : la coupure dure environ **20 minutes**,
  le coût total est de l'ordre de **quelques centimes**.
- **Condition avant de toucher à la production : une répétition complète sur un projet de test**
  (§6), pour confirmer deux points que la documentation ne garantit pas noir sur blanc.

## 2. Mesures (13/10/2026, lecture seule)

| Élément | Valeur |
|---|---|
| Base | `projects/dinerox-app/databases/(default)`, `nam5`, Firestore natif, créée le 04/10/2026 |
| Protection contre la suppression | désactivée |
| Restauration à un instant donné (PITR) | désactivée |
| App Engine | **aucune application** (l'emplacement de la base n'est donc pas verrouillé par App Engine) |
| Comptes de connexion (Firebase Auth) | 12, dont 0 désactivé |
| Documents | 916 : 768 catégories, 42 enveloppes, 41 opérations, 17 objectifs, 15 comptes, 11 profils, 11 espaces, 5 événements du coach, 4 récurrences, 2 contributions |
| Sauvegarde | `gs://dinerox-app-sauvegardes/2026-10-13-avant-demenagement` (464 259 octets, réussie) |
| Storage (justificatifs) | **aucun compartiment** : `dinerox-app.firebasestorage.app` n'existe pas |
| Autres compartiments | `dinerox-app-sauvegardes` (us-central1), deux compartiments techniques des Functions (europe-west1) |

Commandes de mesure : `firebase/functions/lib/scripts/countData.js` (des nombres seulement).

## 3. Ce qui dépend de l'emplacement

| Service | Situation | Effet du déménagement |
|---|---|---|
| Firestore `(default)` | nam5 | **déménagée** (§5) |
| Cloud Functions | europe-west1 | rien à faire ; elles parleront à une base proche (plus rapide) |
| Tâches planifiées (`weeklySummaryPush`) | 2e génération, europe-west1 | rien à faire (pas liées à l'emplacement par défaut) |
| Firebase Auth (comptes) | service mondial | **rien ne change** : mêmes comptes, mêmes mots de passe |
| Storage (justificatifs) | pas encore activé | rien à déménager. Le jour où il sera activé : choisir `europe-west1`. Le nom par défaut (`dinerox-app.firebasestorage.app`, déjà dans la configuration de l'app) ne change pas, donc l'app non plus. Ses règles lisent `/databases/(default)/…` : toujours valable. |
| Règles et index Firestore | attachés à la base | **redéployés** sur la nouvelle base (§5, étape 6) |
| Sauvegardes | us-central1 | inchangées ; les prochaines pourront aller dans un compartiment européen |

## 4. Méthodes possibles

| Méthode | L'app change ? | Avis |
|---|---|---|
| **A. Supprimer puis recréer `(default)` en europe-west1** (avec base provisoire `eu-staging`) | **Non** | **Recommandée.** Même nom, même projet, aucune nouvelle version de l'app. |
| B. Créer une base nommée (ex. `eu`) en Europe | Oui (nom de la base dans l'app et les Functions, règles par base) | Possible si A était refusée, mais demande une nouvelle version de l'app (en attente du domaine) et une période où les anciennes versions écrivent encore dans l'ancienne base. |
| C. Nouveau projet Firebase en Europe | Oui (configuration complète, migration des comptes) | Trop lourd pour le gain. |

**Pourquoi une base provisoire plutôt qu'un simple export / import ?** Un import écrase les
documents existants. Si un téléphone écrit dans la nouvelle base pendant la manœuvre, l'import
effacerait cette écriture. Notre copie (`copyDatabase`) applique « le plus récent gagne » comme
l'app, ne supprime jamais rien, et donne un nouvel horodatage serveur aux données synchronisées
pour que chaque téléphone les retélécharge.

## 5. Le jour J (méthode A)

Durée de la coupure : environ 20 minutes, surtout à cause du délai d'environ 5 minutes imposé
par Firebase avant de pouvoir réutiliser le nom `(default)`.

| Étape | Qui | Commande / action | Vérifier | Retour arrière |
|---|---|---|---|---|
| 0. Prévenir | toi | Message aux personnes qui testent : « maintenance de 20 min ce soir, l'app reste utilisable hors ligne ». | — | — |
| 1. Copier les règles et les index en ligne | toi + moi | Console › Firestore › Règles : copier le texte et me l'envoyer ; `gcloud firestore indexes composite list --project=dinerox-app`. Je confirme que le dépôt contient exactement les mêmes. | Je confirme par écrit. | Sans objet. |
| 2. Sauvegarde fraîche | toi | `gcloud firestore export gs://dinerox-app-sauvegardes/AAAA-MM-JJ-jour-j --project=dinerox-app --database='(default)'` | opération `SUCCESSFUL` | Sans objet. |
| 3. Base provisoire en Europe + copie | toi | `gcloud firestore databases create --database=eu-staging --location=europe-west1 --type=firestore-native --project=dinerox-app` puis `GOOGLE_CLOUD_PROJECT=dinerox-app node firebase/functions/lib/scripts/copyDatabase.js --from "(default)" --to eu-staging --i-know-this-is-production` | `countData.js --database eu-staging --compare comptage-avant.json` : « OK ». Les téléphones n'écrivent jamais dans `eu-staging`. | Supprimer `eu-staging`. Rien n'a changé pour les utilisateurs. |
| 4. Rattrapage puis suppression (DÉBUT DE COUPURE) | toi | Relancer la copie de l'étape 3 (seuls les changements récents sont réécrits), puis aussitôt : `gcloud firestore databases delete --database='(default)' --project=dinerox-app` | `gcloud firestore databases list` ne montre plus que `eu-staging`. | Recréer `(default)` en **nam5** et faire l'étape 7 vers elle : retour à l'état d'avant. |
| 5. Recréer en Europe (après 5 min d'attente) | toi | `gcloud firestore databases create --database='(default)' --location=europe-west1 --type=firestore-native --project=dinerox-app` | `gcloud firestore databases describe --database='(default)' --project=dinerox-app` : `locationId: europe-west1`. | Si refusé : la recréer en nam5, puis étape 7 (retour à l'état d'avant). |
| 6. Règles et index | toi | Depuis le dossier `dinerox-main` (les règles de la production, PAS celles du back-office) : `firebase deploy --only firestore:rules,firestore:indexes --project dinerox-app` | Console › Règles et Index : identiques à l'étape 1. | Redéployer. |
| 7. Remplir la nouvelle base (FIN DE COUPURE) | toi | `GOOGLE_CLOUD_PROJECT=dinerox-app node firebase/functions/lib/scripts/copyDatabase.js --from eu-staging --to "(default)" --bump-synced-at --i-know-this-is-production` | `countData.js --compare comptage-avant.json` : « OK : aucune collection n'a perdu de document ». | `eu-staging` reste intacte : on peut recopier à tout moment. |
| 8. Test réel | toi | Sur ton téléphone : ouvrir l'app, vérifier tes données, ajouter une opération ; sur un second appareil, la voir arriver. | Tout est là, la synchronisation marche. | Étape 4 en sens inverse (recréer en nam5 et recopier). |
| 9. Protéger | toi | `gcloud firestore databases update --database='(default)' --delete-protection --project=dinerox-app` | `deleteProtectionState: DELETE_PROTECTION_ENABLED` | `--no-delete-protection` |
| 10. Ménage (7 jours après) | toi | `gcloud firestore databases delete --database=eu-staging --project=dinerox-app` | — | Garder la sauvegarde de l'étape 2. |

## 6. Répétition sur un projet de test (avant toute chose)

Deux points ne sont pas garantis par la documentation et doivent être vus pour de vrai :

1. **La base `(default)` peut-elle être recréée dans un autre emplacement** après sa
   suppression, dans un projet sans App Engine ? (La documentation Firebase lie la base par
   défaut à « l'emplacement des ressources par défaut », réglage définitif quand App Engine
   existe ; `dinerox-app` n'en a pas.)
2. **Que reçoit un téléphone pendant la coupure ?** L'app actuelle réessaie plus tard (sans
   perte) pour la plupart des erreurs, mais si le serveur répond « refusé »
   (`permission-denied`, `invalid-argument`, `failed-precondition`), elle reprend la version du
   serveur et, si le serveur n'a rien, **retire le document de son cache local**. Il faut savoir
   ce que Firebase répond quand la base n'existe pas (attendu : `not-found`, donc « nouvel
   essai ») et juste après sa recréation.

Déroulé (toi, avec moi, environ 45 minutes, coût de l'ordre du centime) :
- créer un projet de test (ex. `dinerox-demenagement-test`) relié à ta facturation ; y créer
  `(default)` en `nam5` ; activer la connexion par e-mail ; déployer les règles de l'app ;
- lancer la **sonde** `scripts/migration/sonde-client.mjs` (elle se comporte comme l'app :
  connexion, une écriture toutes les 3 secondes, écoute des changements) et la laisser tourner ;
- jouer **exactement** les étapes 2 à 9 du §5 sur ce projet ;
- lire le journal de la sonde : chaque écriture doit être « ok » ou « nouvel essai », jamais
  « REFUSÉE » ; le nombre de documents doit être identique avant et après ;
- supprimer le projet de test (`gcloud projects delete …`).

Si l'un des deux points échoue, on s'arrête et on choisit ensemble (méthode B, ou ajustement).
Je te donnerai les commandes exactes une par une, comme pour la sauvegarde.

**Déjà répété sur l'émulateur** (`tests/backoffice/migration.test.ts`, vert) : copie complète
vers une base provisoire, rattrapage des écritures faites pendant ce temps, base vidée puis
remplie, une écriture plus récente faite par un téléphone pendant la manœuvre est **gardée**,
une version plus ancienne est **remplacée**, données serveur et parents « fantômes » copiés,
nombre de documents identique, et tous les documents ressortent de la requête
« syncedAt > curseur » (les téléphones retéléchargent tout). L'émulateur ne sait ni changer
d'emplacement ni simuler une base absente : c'est l'objet de la répétition sur projet de test.

## 7. Ce que vivent les utilisateurs pendant la coupure

- L'app **reste utilisable hors ligne** : les données sont sur le téléphone, les saisies sont
  gardées dans la file d'attente et l'indicateur de synchronisation montre des éléments en attente.
- À la fin, tout se synchronise : les saisies faites pendant la coupure partent vers la nouvelle
  base, et chaque téléphone retélécharge une fois ses données (quelques centaines de documents).
- Aucun compte, mot de passe ni réglage ne change. Aucune nouvelle version de l'app à installer.
- Risque résiduel, à confirmer par la répétition : une saisie faite pendant les quelques secondes
  entre la recréation de la base et la fin de la copie pourrait être refusée, si elle porte sur un
  espace FAMILIAL pas encore recopié (la copie commence par les espaces). Aujourd'hui, les 11
  espaces correspondent aux 11 profils : il s'agit très probablement d'espaces personnels, non
  concernés (un espace personnel ne demande aucune lecture côté règles). Faire la manœuvre de
  nuit et prévenir les testeurs réduit encore ce risque.

## 8. Vérifier que tout est arrivé

- `countData.js --json ~/dinerox-mesures/comptage-avant.json` juste avant l'étape 4, puis
  `countData.js --compare ~/dinerox-mesures/comptage-avant.json` après l'étape 7 : chaque
  collection doit avoir **au moins** autant de documents qu'avant (« plus » si quelqu'un a saisi
  pendant la coupure), sinon le script répond « ÉCHEC » et on ne va pas plus loin.
- Le rapport de `copyDatabase` indique les documents lus, écrits et gardés (versions plus
  récentes déjà présentes).
- Test réel sur ton téléphone et sur un second appareil (étape 8).

## 9. Coût

| Poste | Estimation (tarifs publics Google, à revérifier) |
|---|---|
| Sauvegardes (export) | 1 lecture par document : moins d'un centime |
| Copies (`copyDatabase`, 3 passages) | environ 3 × 916 lectures et 2 × 916 écritures : moins d'un centime |
| Retéléchargement par les téléphones | 916 lectures par appareil : moins d'un centime |
| Base provisoire `eu-staging` 7 jours | stockage de moins de 1 Mo : négligeable |
| Projet de test | quelques lectures / écritures : moins d'un centime |
| **Total** | **de l'ordre de quelques centimes** |

Après le déménagement, deux options payantes à discuter (pas nécessaires) : les sauvegardes
planifiées et la restauration à un instant donné (PITR).

## 10. Après le déménagement

- Reprendre la mise en ligne du back-office (docs/backoffice.md §16, à partir de 16.2) : ses
  règles et index partiront sur la base européenne.
- Le jour où les justificatifs (Storage) seront activés : choisir `europe-west1`.

## Outils (dans le dépôt)

| Fichier | Rôle |
|---|---|
| `firebase/functions/src/scripts/countData.ts` | comptages en lecture seule ; `--compare` vérifie avant / après |
| `firebase/functions/src/migration/copy.ts` + `src/scripts/copyDatabase.ts` | copie complète « le plus récent gagne », jamais de suppression ; refuse `dinerox-app` sans `--i-know-this-is-production` |
| `scripts/migration/sonde-client.mjs` | sonde « téléphone » pour la répétition (refuse `dinerox-app`) |
| `tests/backoffice/migration.test.ts` | répétition sur l'émulateur |

Sources : [Export et import Firestore](https://docs.cloud.google.com/firestore/docs/manage-data/export-import),
[Créer et gérer les bases](https://docs.cloud.google.com/firestore/docs/manage-databases),
[Emplacements des produits Firebase](https://firebase.google.com/docs/projects/locations).
