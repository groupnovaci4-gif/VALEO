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
- **Répétition faite le 13/10/2026 sur un projet de test jetable (§6) : méthode confirmée**, avec
  deux corrections intégrées au jour J : les testeurs ferment l'app pendant la manœuvre, et la
  dernière copie (8 s) est enchaînée avec la suppression, puis recréation + règles + copie (9 s)
  en une seule commande.

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
| 0. Prévenir | toi | Message aux personnes qui testent : « maintenance ce soir de HH:MM à HH:MM : fermez complètement l'app avant HH:MM et ne la rouvrez qu'après mon message de fin ». **Indispensable** : une saisie acceptée par l'ancienne base pendant la dernière copie ne serait pas recopiée (§6). | Réponse des testeurs. | — |
| 1. Copier les règles et les index en ligne | toi + moi | Console › Firestore › Règles : copier le texte et me l'envoyer ; `gcloud firestore indexes composite list --project=dinerox-app`. Je confirme que le dépôt contient exactement les mêmes. | Je confirme par écrit. | Sans objet. |
| 2. Sauvegarde fraîche | toi | `gcloud firestore export gs://dinerox-app-sauvegardes/AAAA-MM-JJ-jour-j --project=dinerox-app --database='(default)'` | opération `SUCCESSFUL` | Sans objet. |
| 3. Base provisoire en Europe + copie | toi | `gcloud firestore databases create --database=eu-staging --location=europe-west1 --type=firestore-native --project=dinerox-app` puis `GOOGLE_CLOUD_PROJECT=dinerox-app node firebase/functions/lib/scripts/copyDatabase.js --from "(default)" --to eu-staging --i-know-this-is-production` | `countData.js --database eu-staging --compare comptage-avant.json` : « OK ». Les téléphones n'écrivent jamais dans `eu-staging`. | Supprimer `eu-staging`. Rien n'a changé pour les utilisateurs. |
| 4. Rattrapage puis suppression (DÉBUT DE COUPURE) | toi | À l'heure annoncée (apps fermées), EN UNE COMMANDE : la copie de l'étape 3 (quelques secondes, seuls les changements sont réécrits) `&&` `gcloud firestore databases delete --database='(default)' --project=dinerox-app --quiet` | `gcloud firestore databases list` ne montre plus que `eu-staging`. | Recréer `(default)` en **nam5** et faire l'étape 7 vers elle : retour à l'état d'avant. |
| 5. Recréer en Europe (après 5 min d'attente) | toi | EN UNE COMMANDE, enchaînée avec 6 et 7 (pour qu'un espace familial ne reste jamais sans son document) : `gcloud firestore databases create --database='(default)' --location=europe-west1 --type=firestore-native --project=dinerox-app` | `gcloud firestore databases describe --database='(default)' --project=dinerox-app` : `locationId: europe-west1`. | Si refusé : la recréer en nam5, puis étape 7 (retour à l'état d'avant). |
| 6. Règles et index | toi | `&&` depuis le dossier `dinerox-main` (les règles de la production, PAS celles du back-office) : `firebase deploy --only firestore:rules,firestore:indexes --project dinerox-app`. **Les index ne survivent pas** à la suppression (vu en répétition) ; les règles, si, mais on les redéploie quand même. | Console › Règles et Index : identiques à l'étape 1. | Redéployer. |
| 7. Remplir la nouvelle base (FIN DE COUPURE) | toi | `GOOGLE_CLOUD_PROJECT=dinerox-app node firebase/functions/lib/scripts/copyDatabase.js --from eu-staging --to "(default)" --bump-synced-at --i-know-this-is-production` | `countData.js --compare comptage-avant.json` : « OK : aucune collection n'a perdu de document ». | `eu-staging` reste intacte : on peut recopier à tout moment. |
| 8. Test réel, puis fin de maintenance | toi | Sur ton téléphone : fermer complètement l'app, la rouvrir, vérifier tes données, ajouter une opération ; sur un second appareil (rouvert lui aussi), la voir arriver. Puis message aux testeurs : « vous pouvez rouvrir l'app ». **Rouvrir l'app est nécessaire** : l'écoute des changements s'arrête pendant la coupure et ne repart qu'à la réouverture (vu en répétition). | Tout est là, la synchronisation marche. | Étape 4 en sens inverse (recréer en nam5 et recopier). |
| 9. Protéger | toi | `gcloud firestore databases update --database='(default)' --delete-protection --project=dinerox-app` | `deleteProtectionState: DELETE_PROTECTION_ENABLED` | `--no-delete-protection` |
| 10. Ménage (7 jours après) | toi | `gcloud firestore databases delete --database=eu-staging --project=dinerox-app` | — | Garder la sauvegarde de l'étape 2. |

## 6. Répétition sur un projet de test — faite le 13/10/2026

Projet jetable `dinerox-demenagement-test` (sans App Engine, comme `dinerox-app`), base
`(default)` en `nam5`, environ 900 documents fictifs (11 profils, 11 espaces personnels, 1 espace
familial), règles et index de l'app. Une **sonde** (`scripts/migration/sonde-client.mjs`) se
comportait comme l'app : une écriture toutes les 3 secondes, alternativement dans son espace
personnel et dans l'espace familial, et l'écoute des changements.

**Point 1 — recréer `(default)` dans un autre emplacement : CONFIRMÉ.** Supprimée à 01:12:36
(nam5), recréée à 01:18:06 en `europe-west1` (après le délai d'environ 5 minutes), sans erreur.

**Point 2 — ce que reçoit un téléphone :**
- base supprimée : `not-found`, puis le SDK garde l'écriture et réessaie en silence (l'app voit
  son délai de 15 s) → « nouvel essai », **aucune perte** ;
- base recréée mais vide : les écritures PERSONNELLES sont acceptées (les règles ont survécu à la
  suppression) ; les écritures FAMILIALES sont **refusées** (`permission-denied`) tant que le
  document de l'espace n'est pas recopié. Pendant la répétition, on a volontairement laissé la
  base vide 18 minutes pour l'observer : 140 refus, tous de ce type. Correction : la recréation,
  les règles et la copie (qui commence par les espaces) sont enchaînées en une seule commande
  (9 s), et les apps sont fermées ;
- **une écriture acceptée par l'ancienne base pendant la dernière copie n'est pas recopiée**
  (le téléphone a reçu « ok » et l'a retirée de sa file) : vu sur les 75 dernières secondes avant
  la suppression lors du premier passage (copie de 81 s). Corrections : copie parallélisée
  (8 s) enchaînée avec la suppression, et **apps fermées pendant la manœuvre**. Second cycle,
  sonde arrêtée comme une app fermée : ses deux dernières écritures sont bien dans la nouvelle
  base (vérifié document par document), comptages « OK » ;
- **l'écoute des changements s'arrête** à la première erreur `not-found` et ne repart pas seule :
  il faut rouvrir l'app. Sonde rouverte : elle a retrouvé ses 801 opérations personnelles, puis
  toutes ses écritures (perso et famille) ont été « ok ».

**Autres constats :** les index ne survivent pas à la suppression (redéploiement obligatoire,
fait par l'étape 6) ; durées mesurées : copie complète 9 s, rattrapage 8 s, recréation 6 s.

Le projet de test a été supprimé à la fin de la répétition.

## 7. Ce que vivent les utilisateurs pendant la coupure

- L'app **reste utilisable hors ligne** : les données sont sur le téléphone, les saisies sont
  gardées dans la file d'attente et l'indicateur de synchronisation montre des éléments en attente.
- À la fin, tout se synchronise : les saisies faites pendant la coupure partent vers la nouvelle
  base, et chaque téléphone retélécharge une fois ses données (quelques centaines de documents).
- Aucun compte, mot de passe ni réglage ne change. Aucune nouvelle version de l'app à installer.
- Les testeurs ferment l'app pendant la maintenance et la rouvrent après le message de fin
  (indispensable, §6). Un testeur qui l'oublierait et saisirait pendant les quelques secondes de
  la dernière copie pourrait voir cette saisie rester seulement sur son téléphone ; s'il saisit
  dans un espace familial juste après la recréation, elle pourrait être refusée. Avec 12 comptes
  prévenus et une manœuvre de nuit, ce risque est minime.

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
