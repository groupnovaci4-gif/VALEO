# Déployer pour les tests terrain sans carte bancaire

> **Ce document décrit un chemin de SECOURS, pas la production.**
> La cible reste Cloud Run (`backend/cloudbuild.yaml`, invariant 30). Ce
> chemin-ci existe pour une seule raison : Cloud Run exige un compte de
> facturation Google, donc une carte que Google accepte, et tant qu'elle
> manque il est impossible de construire un APK testable.
>
> **Données de test uniquement.** Les données réelles d'une coopérative ne
> vont pas sur une instance gratuite.

## Pourquoi la carte est refusée (la cause, pas le symptôme)

Google **refuse les cartes prépayées**, catégoriquement. Sont prépayées, donc
inutilisables :

- les cartes **Payoneer** (Mastercard prépayée) ;
- les cartes virtuelles adossées à **Wave, Orange Money, MTN Money, Moov
  Money** ;
- les cartes rechargeables de banques locales.

Attendre un code OTP sur une de ces cartes est sans issue : Google n'envoie pas
d'OTP, il tente une autorisation, et elle échoue avant toute étape de
vérification. Trois autres refus sont possibles et se cumulent :

| Cause | Ce qu'il faut demander à la banque |
|---|---|
| Carte prépayée | Une carte **débit ou crédit adossée à un compte** |
| OTP exigé à chaque transaction | L'autorisation des **prélèvements récurrents sans OTP** |
| Carte non internationale (GIM-UEMOA seule) | L'**activation du paiement en ligne à l'étranger** |
| Pays du profil de paiement ≠ pays de la carte | Rien : le pays d'un profil de paiement **ne se modifie pas**, il faut en créer un autre |

Le support facturation de Google est **gratuit**, sans contrat d'assistance, et
voit le motif exact du refus — ce que la console ne montre pas.

## Ce que ce chemin utilise

| | Choix | Pourquoi |
|---|---|---|
| Base | **Firestore**, plan Spark | C'est le chemin de code de la production. L'audit a trouvé une destruction croisée entre coopératives (B-01) qui n'existait **que** sur Firestore : tester sur MongoDB ne prouverait rien. Et les données saisies pendant les tests sont déjà dans la bonne base quand Cloud Run prend le relais. |
| Backend | **Render**, plan gratuit | Aucune carte demandée, et surtout : il construit **depuis le dépôt GitHub**, donc le code testé est le code du dépôt. Pas de copie, pas de divergence. |
| Blueprint | `render.yaml` | Le service est décrit dans le dépôt, relu et testé (`TestBlueprintRender`), pas cliqué dans un tableau de bord. |

Hugging Face Spaces **ne convient plus** : les Spaces Docker y sont passés en
formule payante, un compte gratuit ne peut plus en créer.

## Marche à suivre

### 1. Vérifier que Firestore existe (plan Spark, sans facturation)

```bash
gcloud firestore databases list
```

Attendu : une base `(default)` en `europe-west1`. Le plan Spark accorde
gratuitement **50 000 lectures, 20 000 écritures et 20 000 suppressions par
jour**, pour 1 Gio stocké. Aucune carte n'est nécessaire pour cela.

### 2. Créer un compte de service DÉDIÉ et limité

Ne jamais utiliser le compte de service par défaut : il est **Éditeur du projet
entier**. Cette clé privée contourne `firestore.rules` par conception (c'est
l'Admin SDK, invariant 29) ; elle mérite le minimum de droits.

```bash
PROJET=$(gcloud config get-value project)

gcloud iam service-accounts create valeo-test-terrain \
  --display-name="VALEO — backend de test terrain"

gcloud projects add-iam-policy-binding "$PROJET" \
  --member="serviceAccount:valeo-test-terrain@${PROJET}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud iam service-accounts keys create backend/secrets/test-terrain.json \
  --iam-account="valeo-test-terrain@${PROJET}.iam.gserviceaccount.com"
```

`backend/secrets/` est ignoré par git **en entier** : la clé n'entrera pas dans
le dépôt. Pour la coller dans Render, il la faut sur une seule ligne :

```bash
python3 -c "import json,sys;print(json.dumps(json.load(open('backend/secrets/test-terrain.json'))))"
```

### 3. Déployer sur Render

1. Créer un compte sur Render (aucune carte demandée au moment de l'écriture de
   ce document — à confirmer en deux minutes, les conditions des offres
   gratuites changent).
2. **New → Blueprint**, connecter le dépôt `groupnovaci4-gif/valeo`. Render lit
   `render.yaml` à la racine.
3. Render réclame les trois valeurs marquées `sync: false` — elles ne sont
   **jamais** dans le dépôt :

   | Variable | Valeur |
   |---|---|
   | `ADMIN_PASSWORD` | un mot de passe fort et **nouveau**. Pas `admin123`, et pas celui de la production. |
   | `JWT_SECRET` | `openssl rand -hex 32`. **Différent de la production** — sinon un jeton frappé par l'instance de test ouvre la vraie. |
   | `FIREBASE_SERVICE_ACCOUNT` | le JSON de l'étape 2, sur une seule ligne. |

4. Vérifier dans le tableau de bord que la branche déployée est bien
   **`develop`**. `render.yaml` l'épingle, mais contrôlez-le : `main` a des
   dizaines de commits de retard et ne contient ni `depot.py` ni
   `firebase_auth.py`. Le service démarrerait, `/health` répondrait `200`, et
   vous testeriez pendant des jours un backend incapable de parler à Firestore.

### 4. Contrôler que le service écrit bien là où on croit

```bash
URL=https://valeo-backend-test.onrender.com   # l'adresse que Render affiche

curl -s "$URL/health"          # {"status":"ok","instance":"…"}
python3 backend/scripts/verifier_configuration.py   # n'affiche aucun secret
```

Le champ `instance` est le **marqueur d'instance** (invariant 27) : c'est lui
qui permettra de dire en deux secondes si le téléphone et le tableau de bord
admin parlent au même serveur. Notez-le.

### 5. Construire l'APK

L'adresse est **figée dans le paquet au build** (invariant 27). Remplacez le
gabarit du profil `terrain` — et de celui-là seul :

```bash
# frontend/eas.json, profil "terrain" :
#   "EXPO_PUBLIC_BACKEND_URL": "https://valeo-backend-test.onrender.com"

cd frontend
npx expo install --fix
npx eas build -p android --profile terrain
```

Le profil `terrain` existe **exprès** séparé de `preview` : coller l'adresse
d'essai dans `preview` ou `production` livrerait un jour un APK « partenaires »
parlant à un serveur de test. Rien ne le signalerait — l'APK se construit,
s'installe et affiche « Synchronisé ». Un test refuse désormais ce mélange
(`test_l_adresse_de_test_ne_fuit_PAS_dans_les_profils_livrables`).

## Les limites, chiffrées

**L'instance s'endort.** Au bout de 15 minutes sans trafic, le premier appel
suivant met 30 à 60 secondes. Il n'y a **aucune connexion hors-ligne** dans
VALEO : un agent qui ouvre l'application à froid attend devant son téléphone.
Prévenez les testeurs, sinon ils concluront que l'application est cassée.

**512 Mio de mémoire, 0,1 vCPU partagé.** `firebase-admin` et gRPC sont lourds ;
ça tient, mais sans marge. Une instance tuée pour dépassement mémoire se voit
dans les journaux Render.

**Le quota de lectures Firestore est la vraie borne, et ce sont les *lectures*,
pas les écritures.** `GET /api/state` **et** `PUT /api/state` appellent tous
deux `load_state(coopId)` : chaque synchronisation relit **tous les documents de
la coopérative**. Donc, pour une coopérative de `N` enregistrements :

    synchronisations par jour ≈ 50 000 / N

| Taille de la coopérative | Synchronisations/jour, tous téléphones confondus |
|---|---|
| 100 enregistrements | ~500 |
| 500 enregistrements | ~100 |
| 2 000 enregistrements | ~25 |

Un téléphone activement utilisé synchronise plusieurs dizaines de fois par jour
(le `PUT` est débouncé à 700 ms, et un `pull` a lieu à chaque ouverture). Trois
ou quatre téléphones sur une coopérative de quelques centaines
d'enregistrements passent sans problème ; une base déjà grosse, non. Quand le
quota est épuisé, Firestore **refuse les lectures** jusqu'au lendemain — et
l'application le dira par son bandeau de synchronisation, pas en silence.

Les écritures, elles, sont très au large : une pesée coûte **2 écritures**
(écriture différentielle, invariant 29), soit 10 000 pesées par jour avant
d'approcher la limite.

## Le jour où la carte fonctionne

L'ordre compte, et la dernière étape est celle qu'on oublie :

1. Activer Blaze, **poser une alerte de budget** avant toute chose.
2. Déployer sur Cloud Run :
   `gcloud builds submit --config backend/cloudbuild.yaml --substitutions=_MIN_INSTANCES=0`.
3. Comparer les **marqueurs d'instance** de `/health` des deux services : ils
   doivent différer (deux déploiements) mais viser la même base Firestore — les
   empreintes de `/api/diag` le diront.
4. Coller l'URL Cloud Run dans les profils `preview` et `production`, puis
   **reconstruire** l'APK. Un APK `terrain` déjà installé continuera d'appeler
   Render pour toujours.
5. **Poser `BACKEND_DEPRECIE` sur le service Render** (invariant 32), avec
   l'adresse du nouveau. Sans cela, un téléphone resté sur l'APK `terrain`
   enregistre ses pesées dans une base que plus personne ne lit, en affichant
   « Synchronisé ». C'est la seule perte de données silencieuse de tout le
   projet.
6. **Supprimer la clé du compte de service de test**, qui n'a plus de raison
   d'exister :

   ```bash
   gcloud iam service-accounts keys list \
     --iam-account="valeo-test-terrain@${PROJET}.iam.gserviceaccount.com"
   gcloud iam service-accounts keys delete <ID> \
     --iam-account="valeo-test-terrain@${PROJET}.iam.gserviceaccount.com"
   ```

7. Supprimer le service Render, et `render.yaml` avec lui.
