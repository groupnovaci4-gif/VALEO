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
