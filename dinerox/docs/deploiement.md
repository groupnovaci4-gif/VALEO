# Déployer sur la production (`dinerox-app`)

Règles du fondateur (2026-10-14), appliquées par un garde-fou automatique.

1. **Une seule branche de déploiement : `dinerox-main`**, propre et identique à
   GitHub. Plus aucun déploiement depuis `backoffice`, `design-v2`,
   `croissance` ou une autre branche.
2. **Une seule commande : `npm run deploy`** (`scripts/deploy.mjs`), jamais
   `firebase deploy` directement :
   ```
   npm run deploy -- --only functions:myReferral,functions:applyReferral --project dinerox-app [--dry-run]
   ```
   - fonctions **par leur nom** (`functions:nom`) ; jamais `functions` seul ;
   - `firestore:rules` et `firestore:indexes` nommés ; jamais `firestore` seul ;
   - jamais `--force`. Si Firebase propose de supprimer une fonction : **NON**.
3. **Garde-fou** (`scripts/deploy-guard.mjs`, lancé par Firebase avant chaque
   cible via `firebase.json › predeploy`) : arrête tout déploiement sur
   `dinerox-app` qui ne passe pas par `npm run deploy`, qui ne part pas de
   `dinerox-main` à jour, ou — pour les fonctions — si une fonction en ligne
   manque dans le code (elle serait supprimée). Sans effet sur les émulateurs.
   Règles pures et tests : `scripts/deploy-rules.mjs`, `tests/deploy-guard.test.ts`.
4. Chaque déploiement : accord du fondateur, commande par commande, simulation
   (`--dry-run`) d'abord.

## Secret du parrainage (une seule fois, jamais modifié)

`REFERRAL_DEVICE_PEPPER` sert à hacher l'identifiant d'appareil (anti-triche).
**Il ne doit plus jamais changer ni recevoir de nouvelle version** : les
empreintes déjà enregistrées ne correspondraient plus, et un appareil déjà
filleul (ou celui d'un parrain) redeviendrait « neuf ». Ne jamais le détruire.

Création (par le fondateur, dans le Terminal ; la valeur est tirée au hasard et
ne s'affiche jamais) :
```
openssl rand -hex 32 | tr -d '\n' | npx firebase functions:secrets:set REFERRAL_DEVICE_PEPPER --data-file=- --project dinerox-app
```

## Photo de la production avant le parrainage

`deploy/production-2026-10-14/` (lecture seule, 2026-10-14) :
- `firestore.rules` — règles en ligne (jeu `19fca60e-3bf7-4db4-a9c4-17790f992084`,
  identiques à la branche `backoffice`) ; `firestore-rules-release.json` ;
- `firestore.indexes.json` — index en ligne (13 index, 2 réglages de champ) ;
- `functions.json` — les 48 fonctions en ligne (europe-west1).

## Retour arrière (si besoin, avec l'accord du fondateur)

| Ce qui a été déployé | Revenir en arrière |
|---|---|
| Règles Firestore | Remettre le jeu de règles d'avant, instantané (il reste dans l'historique Firebase) : console › Firestore › Règles › historique › version du 13/10/2026 12:12 UTC, ou : `curl -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: dinerox-app" -H "content-type: application/json" "https://firebaserules.googleapis.com/v1/projects/dinerox-app/releases/cloud.firestore" -d '{"release":{"name":"projects/dinerox-app/releases/cloud.firestore","rulesetName":"projects/dinerox-app/rulesets/19fca60e-3bf7-4db4-a9c4-17790f992084"}}'` |
| Index du parrainage (1 index + 4 réglages) | Ajouts seulement, sans effet sur l'existant : peuvent rester. Sinon : console › Firestore › Index › supprimer l'index `referrals (status, validatedAt)` et les réglages `referral.*` / `referrals.status`. |
| Les 7 fonctions du parrainage (nouvelles) | `npx firebase functions:delete myReferral applyReferral referralOnTransaction referralOnGoal referralNightly setAmbassador adminReferralStats --region europe-west1 --project dinerox-app` (aucune fonction existante n'est modifiée par ce déploiement, rien d'autre à restaurer). |
| Données du parrainage | `referralCodes`, `referralDevices`, `users/*/referral*` : sans effet sur le reste de l'application si les fonctions sont retirées ; à conserver (traçabilité) sauf décision contraire. |
| Secret | Ne pas le détruire (voir plus haut). |

Après un retour arrière : `npx firebase functions:list --project dinerox-app`
doit redonner exactement `deploy/production-2026-10-14/functions.json`.

## Étape 3 (tontine partagée) — photo et retour arrière (2026-10-14)

Photo AVANT le déploiement, lecture seule : `deploy/production-2026-10-14b/`
(règles `94f5e5ca-cf25-4d9f-89b4-13db263a2e2b`, 14 index + 6 réglages,
55 fonctions et leur date de mise à jour — `deleteAccount` 2026-10-13T13:06:23Z,
`boDeleteUser` 2026-10-13T13:06:12Z).

Déploiement prévu (depuis `dinerox-main`, `npm run deploy`, accord à chaque commande) :
1. `firestore:indexes` (2 réglages : `requests.uid`, `requests.newAccount`) ;
2. `firestore:rules` (ajouts seuls : `tontineGroups`, `tontineInvites`) ;
3. `functions:tontineGroup,functions:adminTontineStats` (nouvelles) ;
4. `functions:deleteAccount,functions:boDeleteUser` (modifiées : `deleteUserData`
   libère les places de tontine et efface les demandes).

| Déployé | Retour arrière |
|---|---|
| Règles | remettre le jeu `94f5e5ca-cf25-4d9f-89b4-13db263a2e2b` (même commande `curl … releases/cloud.firestore` qu'à l'étape 1, avec ce nom). |
| Réglages d'index | ajouts sans effet sur l'existant ; peuvent rester. |
| `tontineGroup`, `adminTontineStats` | `npx firebase functions:delete tontineGroup adminTontineStats --region europe-west1 --project dinerox-app` |
| `deleteAccount`, `boDeleteUser` | redéployer la version EN LIGNE AVANT : le code des fonctions de la branche `backoffice` au commit `f383576` (inchangé depuis `7f61adf`, donc celui déployé le 13/10). Exception d'urgence au garde-fou (ce commit ne l'a pas), avec l'accord du fondateur : voir ci-dessous. |

Remettre l'ancienne `deleteAccount` + `boDeleteUser` :
```
cd /Users/novaworkonline/DineroX && git worktree add --detach /Users/novaworkonline/dinerox-rollback f383576
cp /Users/novaworkonline/dinerox-main/dinerox/firebase/functions/.env.dinerox-app /Users/novaworkonline/dinerox-rollback/dinerox/firebase/functions/
cd /Users/novaworkonline/dinerox-rollback/dinerox && npm ci && npm --prefix firebase/functions ci
npx firebase deploy --only functions:deleteAccount,functions:boDeleteUser --project dinerox-app
cd /Users/novaworkonline/DineroX && git worktree remove /Users/novaworkonline/dinerox-rollback
```
Le filtre `--only` ne touche à aucune autre fonction ; si Firebase propose une suppression : NON.

## Étape 5 (origine des installations) — déployée le 2026-10-15 (règles `bf233018-…`, 2 fonctions créées)

Depuis `dinerox-main`, `npm run deploy`, simulation puis accord à chaque commande :
1. `firestore:rules` — ajouts seuls : `originCounted` interdit au client sur
   `users/{uid}` ; `originStats/{jour}` sans lecture ni écriture client ;
2. `functions:recordSignupOrigin,functions:adminOriginStats` (nouvelles ; aucune
   fonction existante modifiée).
Aucun index. `functions:link` et Hosting (`/a`, `/t/**`) : exclus tant que le
domaine `dinerox.app` n'est pas branché.
Photo refaite le 2026-10-15 avant la reprise (`deploy/production-2026-10-15/`) :
identique à celle du 14 (mêmes règles, index, 57 fonctions et dates).
Photo AVANT le déploiement, lecture seule : `deploy/production-2026-10-14c/`
(règles `d53857fd-7e9b-49e9-9608-52449c18deea` = celles de l'étape 3, 14 index +
8 réglages, 57 fonctions et leur date de mise à jour).

| Déployé | Retour arrière |
|---|---|
| Règles | remettre le jeu `d53857fd-7e9b-49e9-9608-52449c18deea` (même commande `curl … releases/cloud.firestore` qu'à l'étape 1, avec ce nom). |
| `recordSignupOrigin`, `adminOriginStats` | `npx firebase functions:delete recordSignupOrigin adminOriginStats --region europe-west1 --project dinerox-app` |
| Données | `originStats` (compteurs anonymes) et `users/*.originCounted` : sans effet si les fonctions sont retirées. |

## Audit 2026-10 — déployé le 2026-10-15

Photo AVANT, lecture seule : `deploy/production-2026-10-15b/` (règles
`bf233018-3760-4714-8b10-728f74cab253`, 14 index + 8 réglages, 59 fonctions et leur date).
Code déployé : `dinerox-main` `202099b` (audit fusionné en avance rapide, `1978269`).

1. `firestore:rules` (M3 statistiques, F1 auteur à la création) — 12:56 UTC,
   nouveau jeu **`58033097-b7af-4633-8cf4-5979b46c4171`** ; fonctions et index inchangés.
2. `functions:applyReferral,tontineGroup,referralOnTransaction,referralOnGoal,referralNightly,deleteAccount,boDeleteUser`
   (M2 compromis 3 jours, (i), F4, F5) — 13:01 UTC, 7 mises à jour, europe-west1 ;
   les 52 autres fonctions gardent leur date ; aucun avertissement ni erreur dans les journaux.

| Déployé | Retour arrière |
|---|---|
| Règles | remettre le jeu `bf233018-3760-4714-8b10-728f74cab253` (même commande `curl … releases/cloud.firestore`). |
| 7 fonctions | redéployer ces 7 fonctions depuis `11891cb` (dossier de retour arrière, comme à l'étape 3, `--only` avec leurs noms). |

### Vérification avec un compte jetable (2026-10-15, accord du fondateur)

Script : compte `test-audit-<horodatage>@example.com`, sans droit admin, supprimé à la fin.
Résultat **11/11** : code de tontine inconnu refusé normalement (`tg/unknown-invite`),
1 essai compté (F5) ; le compte ne peut pas écrire `accountStatus` (403) ;
`deleteAccount` efface `accountStatus` (F4), le compte, le profil et `usage`.

**Écriture faite avec les droits d'administration (traçabilité)** : une seule,
`accountStatus/{uid du compte jetable}` = `{status: 'active', since, by: 'test-audit',
reasonCode: 'other'}` (statut actif, jamais suspendu), effacée ensuite par
`deleteAccount`. Aucune autre écriture admin, aucun droit admin donné au compte.

| Comptage | Avant | Après |
|---|---|---|
| `accountStatus` (dont suspendus) | 0 (0) | 0 (0) |
| `tontineInvites` | 0 | 0 |
| `usage` | 0 | 0 |
| `users` | 11 | 11 |

### F6 — domaines autorisés de Firebase Auth (2026-10-15)

Avant : `localhost`, `dinerox-app.firebaseapp.com`, `dinerox-app.web.app`, `dinerox-admin.web.app`.
Après (relu) : `dinerox-app.firebaseapp.com`, `dinerox-app.web.app`, `dinerox-admin.web.app`.
Commande : `PATCH identitytoolkit admin/v2 …/config?updateMask=authorizedDomains`.
Retour arrière : même commande avec `localhost` ajouté en tête de liste.
