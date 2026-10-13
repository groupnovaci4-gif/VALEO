# Parrainage et liens DineroX (croissance, étape 1)

Statut : voir `docs/suivi-croissance.md`. Rien n'est « validé » sans le message
du fondateur « Étape 1 validée ».

## Règle (fondateur, 2026-10-13)

- Un filleul est **validé** quand il utilise DineroX régulièrement pendant une
  semaine : sur **7 jours consécutifs**, au moins **5 jours actifs**,
  **5 dépenses**, **1 revenu** et **2 objectifs créés**, la dernière condition
  remplie dans les **30 jours** après son inscription.
- Seul le **parrain** est récompensé : **1 mois de Plus par tranche de 5
  filleuls validés**, chaque filleul compté une seule fois. Le filleul ne
  reçoit rien du fait d'avoir été parrainé.
- **Plafond** : 2 mois offerts par mois civil (= 10 filleuls). Au-delà, les
  filleuls validés restent en réserve et sont convertis le mois suivant
  (report, passage de nuit). **Ambassadeur** : plafond réglable par l'admin
  (20 par défaut, 1000 au plus).
- Les mois offerts s'additionnent (mois civils) : « Plus offert jusqu'au … ».
- Parrain déjà abonné PAYANT : rien d'automatique, le mois est mis de côté
  (`grants.bankedMonths`) — décision du fondateur en attente.

Toutes les valeurs sont des constantes : `REFERRAL` dans
`firebase/functions/src/referral.ts` (le serveur fait foi) et son miroir
`src/core/referral.ts` (affichage) ; `tests/referral.test.ts` vérifie la parité.

## Ce qui compte (et ce qui ne compte pas)

Seules les opérations et objectifs de l'**espace personnel** du filleul,
saisis par lui, après son inscription. Ne comptent pas : opérations
supprimées moins de 48 h après leur création, doublons évidents (même type,
même montant, même catégorie, moins d'une minute d'écart), données de
démonstration (`demo_…`, et le mode démo, local, n'atteint jamais le serveur),
opérations générées par une récurrence, ajustements de solde. Un ancien
versement d'épargne (`cat_savings`, `cat_investment`) compte comme jour actif,
pas comme dépense. Le jour d'une opération est celui de sa création, dans le
fuseau du profil.

Fenêtre **glissante** : toute période de 7 jours qui commence un jour
d'activité convient (décision prise seul, à confirmer : la lecture littérale
« la fenêtre commence au premier jour d'activité » rendait inutile le délai
de 30 jours).

## Données (aucune donnée financière)

| Où | Quoi | Qui écrit | Qui lit |
|---|---|---|---|
| `referralCodes/{code}` | `uid`, `createdAt` | Functions | personne côté client |
| `users/{uid}/referral/state` | code, compteurs, plafond ambassadeur, refus, avis | Functions | le propriétaire |
| `users/{uid}/referrals/{filleul}` | statut, prénom, dates, compteurs de la semaine | Functions | le parrain |
| `users/{uid}.referredBy` | parrain (uid, code, prénom), source, date | Functions (une fois) | le filleul |
| `users/{uid}.referralProgress` | statut et compteurs de la semaine | Functions | le filleul |
| `users/{uid}.grants` | `plusUntil`, `bankedMonths` | Functions | le propriétaire, `effectivePlan` |
| `referralDevices/{empreinte}` | comptes vus, filleul de l'appareil | Functions | personne côté client |

L'identifiant d'appareil (`getAndroidId`, `identifierForVendor`, identifiant
d'installation sur le web) n'est jamais stocké en clair : HMAC-SHA256 avec le
secret `REFERRAL_DEVICE_PEPPER` (Secret Manager). Ce n'est pas un identifiant
publicitaire.

## Cloud Functions (europe-west1)

- `myReferral` : crée une fois / renvoie mon code ; note l'appareil du parrain.
- `applyReferral` : applique un code (7 jours après l'inscription, une fois,
  ni son propre code ni le téléphone du parrain, un appareil = un filleul).
- `referralOnTransaction`, `referralOnGoal` : réévaluent le filleul à chaque
  écriture de son espace personnel (lecture d'un seul profil sinon).
- `referralNightly` (2 h 15, Abidjan) : avance « jour n/7 », expire après
  30 jours, convertit les filleuls en réserve (report).
- `setAmbassador`, `adminReferralStats` : réservées au droit `admin`.
- `link` : page de redirection des liens (Hosting `/i/**`).
- `deleteAccount` : un filleul supprimé devient « Compte supprimé » chez son
  parrain (prénom effacé) ; son appareil reste « déjà filleul ».

Région : `options.ts` est importé en premier par chaque module qui déclare
des fonctions (sinon elles partiraient en us-central1).

## Liens

`https://dinerox.app/i/{code}` (+ `src`, `cmp`, `cnt` facultatifs) :
Android → Play Store avec `referrer=ref%3D{code}%26src%3D…` ; iPhone → « Bientôt
sur iPhone » (App Store absent) ; ordinateur → page avec QR code. Application
installée : Android App Links (`intentFilters`, `autoVerify`) — exige
`/.well-known/assetlinks.json` (empreinte SHA-256 de la clé de signature Play,
en attente). Domaine personnalisé plus tard : l'ajouter en tête de
`brand.linkHosts`, garder les anciens sur l'hébergement.

Premier lancement Android : `getInstallReferrerAsync()` (expo-application),
lu une seule fois ; le code est appliqué dès qu'une session en ligne existe.

## Tests

- `tests/referral.test.ts` (unitaires), `tests/rules/` (règles),
  `tests/functions/referral.emulator.test.ts` (`npm run test:functions` :
  vraies fonctions sur émulateurs), `e2e/referral.js` (navigateur).
