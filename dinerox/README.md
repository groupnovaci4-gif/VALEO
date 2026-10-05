# DineroX — copilote financier personnel et familial

> **DineroX** — nom, logo typographique et couleurs sont
> centralisés dans [`src/config/brand.ts`](src/config/brand.ts) (et lus par
> `app.config.ts`) : renommer l'application = modifier ce fichier.

Application mobile (Android / iOS) de gestion financière pour l'Afrique
francophone, premier marché la Côte d'Ivoire (FCFA / XOF). DineroX aide à
comprendre où va l'argent, planifier un budget par enveloppes, réaliser des
projets (objectifs), suivre l'épargne, les dettes et le patrimoine, gérer les
finances d'une famille, et parler à un assistant qui comprend
« J'ai dépensé 5 000 au restaurant ».

DineroX **n'est pas** une banque, un établissement de crédit, un service de
paiement ni un conseiller financier réglementé : il ne détient jamais l'argent
des utilisateurs et ne se connecte (pour l'instant) à aucun opérateur.

---

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Fonctionnalités](#fonctionnalités)
3. [Architecture](#architecture)
4. [Structure du projet](#structure-du-projet)
5. [Modèle de données Firestore](#modèle-de-données-firestore)
6. [Sécurité](#sécurité)
7. [Mode hors-ligne et synchronisation](#mode-hors-ligne-et-synchronisation)
8. [IA DineroX](#ia-dinerox)
9. [Variables d'environnement et environnements](#variables-denvironnement-et-environnements)
10. [Firebase : configuration et déploiement](#firebase--configuration-et-déploiement)
11. [Tests](#tests)
12. [Builds Android / iOS](#builds-android--ios)
13. [Décisions techniques](#décisions-techniques)
14. [Limites connues et feuille de route](#limites-connues-et-feuille-de-route)

---

## Démarrage rapide

Prérequis : Node 22, npm, (Java 21 pour les émulateurs Firebase), un téléphone
avec **Expo Go** (SDK 57) ou un simulateur.

```bash
cd dinerox
npm install
cp .env.example .env        # laisser vide pour essayer en « mode local »
npx expo start              # puis scanner le QR code avec Expo Go
```

Sans configuration Firebase, l'application démarre en **mode local** : toutes
les fonctionnalités personnelles marchent, les données restent sur l'appareil
(signalé à l'écran). La famille, la connexion et l'IA distante nécessitent
Firebase.

En développement, **Paramètres › Mes données › Générer des données de
démonstration** crée un espace « Démo » séparé (revenu 450 000, logement
100 000, nourriture 80 000, transport 40 000, famille 50 000, objectif Moto
1 200 000…), jamais mélangé aux données réelles.

## Fonctionnalités

| Domaine | Ce qui est livré |
|---|---|
| Authentification | Inscription, connexion, déconnexion, mot de passe oublié, changement de mot de passe (réauthentification), vérification e-mail, Google (si configuré), session persistante, mode local sans compte |
| Première connexion | Profil financier en 6 étapes toutes facultatives (pays et devise préremplis ; Passer / Retour / Plus tard) : situation, revenus fixes/variables/irréguliers/aucun, sources d'argent du pays (avec « pas de compte bancaire »), charges principales, projets. « Tester sans données » ouvre une démonstration séparée. |
| Pays et devises | 37 pays (Afrique de l'Ouest, centrale, du Nord, de l'Est ; Europe) + « Autre » ; 20 devises ; pays ≠ devise. Sources d'argent, revenus, charges, objectifs et mots locaux propres au pays (woro-woro, clando, zémidjan, susu, LAMal, Council Tax…). Registre surchargeable par les admins. |
| Intelligence financière | Capacité d'épargne réaliste, charges fixes et leur part des revenus, budget personnalisé (pas de règle universelle), alertes (hausse inhabituelle, objectifs non finançables, risque de solde insuffisant, endettement), calendrier financier, simulation d'indépendance financière. Chaque chiffre affiche sa provenance (vos données / déclaré / estimation). |
| Tableau de bord | Solde disponible (hors épargne et argent mis de côté), revenus/dépenses du mois, épargne, budget restant, alertes, enveloppes, objectifs prioritaires, dernières opérations, autres devises non converties |
| Opérations | Dépense / revenu / transfert, catégories (système + personnalisées), enveloppe, bénéficiaire, note, photo justificative, date, modification, suppression, filtres et recherche, liste virtualisée |
| Saisie rapide | Bouton « + » partout : dépense, revenu, transfert, épargne, objectif, « Dire à DineroX » |
| Comptes | Cash, Orange Money, MTN, Moov, Wave, banque, épargne, carte ; solde d'ouverture, devise, couleur, actif/inactif ; **suivi manuel** |
| Transferts | Déplacent l'argent sans être ni revenu ni dépense ; entre devises : montant reçu saisi (aucun taux inventé) |
| Budget | Enveloppes, plan mensuel, alertes 70/90/100 %/dépassement, historique 6 mois, budget automatique (enveloppes, 50/30/20, budget zéro) modifiable avant validation |
| Objectifs | Voir ci-dessous |
| Épargne | Comptes d'épargne par type (général, urgence, projet, enfant, retraite), objectifs liés |
| Dettes | Je dois / on me doit, 6 types, mensualité, échéance, taux, remboursements (avec opération sur un compte au choix), retard, trop-perçu |
| Famille | Espaces familiaux, invitations par e-mail vérifié, rôles admin / conjoint / enfant, bascule « Mes finances » ↔ « Finances familiales » |
| IA DineroX | Compréhension locale du français, propositions à confirmer, réponses calculées sur les données, analyse détaillée distante (Plus, consentement) |
| Analyses | Hausse par catégorie, baisse de revenus, dépassements (dont mois consécutifs), dépenses inhabituelles, paiements récurrents, capacité d'épargne, progression des objectifs, échéances |
| Rapports | Jour / semaine / mois / année, graphiques, catégories, épargne, comparaison, export CSV et PDF |
| Notifications | Budget, objectif proche, salaire, dépense inhabituelle, rappel d'épargne, échéance de dette, résumés hebdo/mensuel — chacune désactivable |
| Abonnements | Gratuit / Plus (1 500 F) / Family (3 000 F) : droits et limites appliqués ; **aucun paiement intégré** (architecture prête) |
| Patrimoine | Biens + comptes + créances − dettes = patrimoine net (formule Family) |
| Sécurité | PIN + Face ID / empreinte, verrouillage automatique, export des données, suppression du compte |
| Administration | Statistiques agrégées uniquement, catégories d'objectifs publiables sans mise à jour |

### Module Objectifs

Un objectif est un **projet de vie**, pas une ligne comptable (« DineroX vous aide à
transformer votre argent en projets concrets »).

- **Création** : cartes de catégories (Véhicule, Immobilier, Professionnel,
  Éducation, Famille, Vie personnelle, Finance) avec leurs modèles, **et
  toujours** « ✏️ Créer mon propre objectif » en texte libre, avec suggestion
  automatique de catégorie (« Je pense que cet objectif correspond à la
  catégorie Professionnel — Oui | Modifier »).
- **Catégories extensibles** (`src/core/goalCategories.ts`) : nom, icône,
  description, ordre, actif/inactif ; les administrateurs en ajoutent ou en
  désactivent via `config/goalCategories/items` sans mise à jour.
- **Informations** : nom, catégorie, montant cible, déjà disponible, date
  (facultative), priorité (faible → urgente), contribution mensuelle
  (facultative), compte associé, portée (personnel / couple / familial) avec
  contributions prévues par membre.
- **Calcul automatique** (`src/core/goals.ts`) — exemples de la spécification
  couverts par des tests : 8 M − 1,5 M = 6,5 M en 26 mois ⇒ 250 000/mois ; à
  200 000/mois ⇒ 33 mois et +50 000/mois pour tenir la date ; sans date,
  5 M à 100 000/mois ⇒ 50 mois ; hebdomadaire ; date estimée.
- **Contributions** avec historique (date, montant, compte, note) ;
  déplacement **réel** de l'argent (transfert vers le compte associé) ou simple
  mise de côté. L'argent affecté à un objectif n'est jamais compté comme
  disponible.
- **Priorités** réordonnables et répartition de la capacité d'épargne
  (financement par ordre de priorité).
- **Objectifs suggérés** à partir de la capacité d'épargne réelle.
- **Célébration à 100 %**, puis réalisé / archivé / nouvel objectif ;
  pause, abandon, réactivation ; **historique des changements** (montant,
  date, priorité, statut…).
- **Assistant** : « Je veux acheter une voiture à 8 millions dans trois ans »
  ⇒ proposition d'objectif (36 mois, ≈ 223 000/mois) à confirmer ou modifier.

## Architecture

```
┌──────────────────────────── Application Expo (React Native) ───────────────────────────┐
│  src/app (Expo Router)  →  écrans, aucun calcul métier                                  │
│  src/features, src/components  →  composants réutilisables + design system              │
│  src/hooks/useFinance  →  calculs dérivés mémorisés                                      │
│  src/store/actions  →  SEUL point d'écriture (validation, rôles, limites de formule)     │
│  src/store/app  →  session, profil, espaces, moteur de synchro                           │
│  src/services/sync  →  cache local + outbox + écoute incrémentale Firestore              │
│  src/core  →  logique PURE et testée (argent, budget, objectifs, IA locale, synchro…)    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
            │ SDK Firebase JS (Auth, Firestore, Functions, Storage)
┌─────────────────────────────────── Firebase ───────────────────────────────────────────┐
│  Firestore (règles strictes)  ·  Cloud Functions (membres, compte, IA, admin, push)     │
│  Storage (justificatifs)      ·  Secret Manager (clé IA)                                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Espaces** : toutes les données vivent dans `spaces/{spaceId}/…`. Chaque
  utilisateur a un espace personnel (id = uid) et peut appartenir à des
  familles. Mêmes écrans et calculs ; seules les permissions changent.
- **Soldes dérivés** : le solde d'un compte = solde d'ouverture ± opérations.
  Jamais stocké, donc jamais « écrasé » par un autre appareil.
- **Montants** en entiers d'unités mineures (FCFA = unité ; EUR = centimes).
- **Pas de conversion automatique** entre devises sans taux fiable : les
  totaux portent sur la devise principale ; les autres sont affichées à part.
- **Intégrations futures** (Mobile Money, banques, paiements) : contrats
  abstraits dans `src/services/providers` (`AccountDataProvider`,
  `MobileMoneyProvider`, `BankProvider`, `PaymentProvider`) et
  `src/services/billing.ts` — **aucune fausse intégration**.

## Structure du projet

```
dinerox/
├── app.config.ts           Configuration Expo (lit la marque et APP_ENV)
├── eas.json                Profils de build development / staging / production
├── firebase.json           Firebase (règles, index, functions, émulateurs)
├── firebase/
│   ├── firestore.rules     Règles de sécurité (commentées)
│   ├── firestore.indexes.json
│   ├── storage.rules
│   └── functions/          Cloud Functions TypeScript
├── src/
│   ├── app/                Écrans (Expo Router) : (auth), (tabs), goals, debts…
│   ├── components/         Design system (ui/), graphiques, verrouillage…
│   ├── config/             brand.ts, env.ts, pays, légal
│   ├── content/            Textes légaux (modèles)
│   ├── core/               Domaine pur : money, dates, balance, budget, goals,
│   │                       goalCategories, debts, networth, recurring, insights,
│   │                       reports, subscription, permissions, sync, defaults,
│   │                       demo, ai/{parser,answers,summary}
│   ├── features/           Composants métier (lignes, objectifs, saisie rapide…)
│   ├── hooks/              useFinance, useInsightText
│   ├── i18n/               fr.ts (référence), en.ts, provider
│   ├── services/           firebase, auth, profile, spaces, sync/, ai, analytics,
│   │                       notifications, security, export, receipts, providers/…
│   ├── store/              app.tsx (état global), actions.ts (écritures)
│   └── theme/              Jetons (couleurs clair/sombre, typo, espacements…)
└── tests/                  Vitest (domaine, synchro) + tests/rules (émulateur)
```

## Modèle de données Firestore

| Chemin | Contenu | Écrit par |
|---|---|---|
| `users/{uid}` | Profil, préférences, consentements, **abonnement** | client (sauf `subscription`) |
| `users/{uid}/devices/{id}` | Jetons push | client |
| `subscriptions/{uid}` | Preuves d'achat vérifiées | serveur |
| `spaces/{spaceId}` | Espace (personnel/famille), membres et rôles | client (création, nom), serveur (membres) |
| `spaces/{id}/accounts` | Comptes | membres |
| `spaces/{id}/transactions` | Opérations (revenu, dépense, transfert) | membres (enfant : ses dépenses) |
| `spaces/{id}/categories` | Catégories système et personnalisées | membres |
| `spaces/{id}/recurring` | Règles récurrentes | membres |
| `spaces/{id}/envelopes`, `budgets` | Enveloppes, plan mensuel (id = `YYYY-MM`) | membres |
| `spaces/{id}/goals`, `goalContributions` | Objectifs, contributions | membres (enfant : contributions) |
| `spaces/{id}/debts`, `debtPayments` | Dettes, remboursements | admin/conjoint |
| `spaces/{id}/assets` | Patrimoine | admin/conjoint |
| `invites/{id}` | Invitations familiales | serveur |
| `config/goalCategories/items/{id}` | Catégories d'objectifs publiées | administrateurs plateforme |
| `analyticsEvents/{id}` | Événements anonymes (avec consentement) | client, écriture seule |
| `usage/{uid}` | Quota IA quotidien | serveur |

Chaque document synchronisé porte `id`, `createdAt`, `updatedAt`, `createdBy`,
`deleted?` et `syncedAt` (horodatage serveur, curseur de synchronisation).

## Sécurité

- **Règles Firestore strictes** ([`firebase/firestore.rules`](firebase/firestore.rules)) :
  isolation par espace, rôles, validation des types et montants, refus par
  défaut, pas de suppression physique côté client, abonnement non modifiable
  par le client, membres modifiables uniquement par les Cloud Functions,
  protection contre l'occupation du chemin d'un espace personnel.
- **Conflits arbitrés par le serveur** : une écriture plus ancienne que la
  version stockée est refusée.
- **Cloud Functions** pour tout ce qui est sensible : invitations (e-mail
  **vérifié** obligatoire pour accepter), rôles (toujours un administrateur),
  suppression complète du compte, IA (clé dans Secret Manager, quota
  quotidien, consentement et formule vérifiés côté serveur), statistiques
  d'administration agrégées (moindre privilège : aucune donnée individuelle).
- **Aucun secret dans l'application** : seules les clés publiques Firebase.
- **Appareil** : PIN haché (SHA-256 salé, itéré) dans SecureStore, blocage
  progressif après 5 erreurs, biométrie, verrouillage automatique.
- **Journaux contrôlés** : aucune donnée personnelle ni financière dans les logs.
- **Confidentialité** : export complet (JSON), suppression du compte,
  consentements explicites (IA distante, statistiques), textes légaux modèles.
- **Recommandé avant production** : activer **App Check** (Play Integrity /
  DeviceCheck), budgets d'alerte de facturation, sauvegardes Firestore.

## Mode hors-ligne et synchronisation

`src/services/sync/engine.ts` + logique pure `src/core/sync.ts` :

1. Au démarrage, le cache local (AsyncStorage) de l'espace est chargé : l'app
   s'ouvre sans réseau.
2. Toute écriture est appliquée localement puis placée dans une **outbox
   persistante** ; elle est poussée dès que le réseau revient (backoff
   exponentiel), survit à la fermeture de l'app.
3. Les changements distants arrivent par écoute **incrémentale**
   (`syncedAt > curseur`) : seul ce qui a changé est téléchargé, pas tout
   l'historique à chaque ouverture.
4. Conflits : par document, **le plus récent gagne** (`updatedAt`, strictement
   croissant même si l'horloge recule), règle également appliquée par
   Firestore. Les opérations étant des documents indépendants et les soldes
   dérivés, deux saisies concurrentes ne se perdent jamais.
5. Les échéances récurrentes ont un identifiant déterministe : deux appareils
   hors-ligne ne créent pas de doublon.

Une bannière indique « hors connexion » et le nombre de modifications en attente.

## IA DineroX

Couche distincte (`src/core/ai`, `src/services/ai.ts`, `firebase/functions/src/assistant.ts`) :

- **Compréhension locale** du français (gratuite, hors-ligne) : montants
  (« 5k », « 250 mille », « 8 millions », « deux millions »), dates (« hier »),
  durées (« dans trois ans »), comptes (« Wave », « Orange Money »),
  catégories, bénéficiaires (« à maman »), intentions (dépense, revenu,
  transfert, objectif, 12 types de questions).
- **Jamais d'opération sans confirmation** : chaque intention devient une
  carte « Confirmer / Modifier / Annuler ». « J'ai reçu 250 000 » propose une
  répartition par enveloppe avant confirmation.
- **Réponses fondées sur les données** (`answers.ts`) : clés + paramètres
  calculés, aucun chiffre inventé ; s'il manque des données, l'assistant le dit.
- **Analyse détaillée distante** (Plus + consentement) : Cloud Function
  `financeAssistant` → Claude (`claude-opus-5-5`, repli serveur `fallbacks:
  "default"` activé) avec un **résumé agrégé** (sans bénéficiaires, notes ni
  coordonnées), consignes strictes (n'utiliser que les chiffres fournis,
  signaler les estimations, pas de conseil réglementé), quota 30/jour.
- La conversation reste sur l'appareil.

## Variables d'environnement et environnements

Voir [`.env.example`](.env.example). Trois environnements, chacun avec **son
propre projet Firebase** et son identifiant d'application
(`com.dinerox.app.development`, `.staging`, et `com.dinerox.app` en production) :

```bash
APP_ENV=development npx expo start         # .env
APP_ENV=staging npx expo start             # variables du projet staging
eas build --profile production             # APP_ENV=production (eas.json)
```

Pour EAS, définir les variables `EXPO_PUBLIC_*` par environnement avec
`eas env:create` (ou dans le tableau de bord EAS). Les fichiers `.env*`
(hors `.env.example`) sont ignorés par Git.

## Firebase : configuration et déploiement

1. Créer trois projets (dev, staging, prod) ; activer **Authentication**
   (E-mail/Mot de passe, Google), **Firestore** (mode production),
   **Storage**, **Functions** (forfait Blaze).
2. Ajouter une application Web dans chaque projet ; reporter la configuration
   dans les variables `EXPO_PUBLIC_FIREBASE_*`.
3. `cp .firebaserc.example .firebaserc` et renseigner les identifiants.
4. Secret IA : `firebase functions:secrets:set ANTHROPIC_API_KEY --project <id>`.
5. Déployer :
   ```bash
   npm --prefix firebase/functions install
   npx firebase deploy --project staging --only firestore:rules,firestore:indexes,storage,functions
   ```
6. Administrateur plateforme (statistiques, catégories) :
   `npm --prefix firebase/functions run build && GOOGLE_APPLICATION_CREDENTIALS=… node firebase/functions/lib/scripts/setAdmin.js admin@exemple.com`
7. Recommandé : App Check, alertes de budget, sauvegardes planifiées.

Émulateurs locaux : `npx firebase emulators:start` puis
`EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=<ip du poste>` dans `.env`.

## Tests

```bash
npm test              # 120+ tests Vitest : domaine pur + moteur de synchro
npm run test:rules    # 23 tests des règles Firestore sur l'émulateur (Java requis)
npm run typecheck     # TypeScript strict
npm run lint          # ESLint (expo)
npm run check         # typecheck + lint + tests
npm --prefix firebase/functions run typecheck
```

Couverture des fonctions critiques : soldes, budget et enveloppes (seuils),
budget automatique (somme exacte), objectifs (exemples de la spécification),
transferts (y compris entre devises), dettes (trop-perçu), patrimoine,
récurrences (fin de mois, pas de doublon, pas de rétroactivité), abonnements
(expiration, limites), permissions (miroir des règles), synchronisation
(hors-ligne, conflits, refus serveur, persistance), IA (montants, intentions,
réponses sans invention, résumé sans données personnelles), i18n (clés et
paramètres identiques FR/EN), rapports et export CSV (injection de formules).
Cas limites : montant 0, négatif, décimal, dépassement, suppression, devise
différente, opération hors-ligne.

## Builds Android / iOS

```bash
npm i -g eas-cli && eas login
eas init                                   # renseigne EAS_PROJECT_ID
eas build --profile development --platform android   # client de dev (Face ID, push)
eas build --profile staging --platform android       # APK interne
eas build --profile production --platform all        # AAB + IPA
eas submit --platform android|ios
```

Expo Go suffit pour développer ; un **build de développement** est
nécessaire pour tester les notifications push distantes, la biométrie iOS
(Face ID) et la connexion Google native.

## Décisions techniques

| Décision | Raison |
|---|---|
| Expo SDK 57, Expo Router, TypeScript strict | Version supportée par Expo Go ; routing par fichiers |
| SDK Firebase **JS** (pas React Native Firebase) | Compatible Expo Go, une seule base de code ; la persistance hors-ligne est assurée par notre moteur |
| Moteur de synchro maison | Le SDK JS n'a pas de cache persistant sur React Native ; besoin d'une outbox durable (marché à connectivité faible) |
| Espaces unifiés (personnel / famille) | Mêmes écrans, permissions seules différentes ; finances personnelles privées |
| Soldes dérivés, montants entiers | Pas de conflit sur les soldes, pas d'erreur d'arrondi |
| Logique dans `src/core` (pur) | Testable sans téléphone, réutilisable pour web/API |
| IA locale + IA distante optionnelle | Gratuit et hors-ligne pour la saisie ; minimisation des données envoyées |
| i18n maison typée | Clés vérifiées à la compilation, pas de dépendance lourde |
| Graphiques SVG simples | Lisibles, palette validée pour le daltonisme, valeurs au toucher |

## Limites connues et feuille de route

Phases 1 à 10 de la spécification livrées dans leur périmètre « première
version ». Restent volontairement hors périmètre ou à faire :

- **Paiements** : aucun fournisseur branché (Google Play Billing, App Store,
  Stripe, Mobile Money) — `verifyPurchase` répond « non disponible ».
- **Intégrations Mobile Money / banques** : contrats prêts, aucune connexion.
- **Conversion de devises** : non faite tant qu'aucune source de taux fiable
  n'est intégrée (les autres devises sont affichées séparément).
- **Langues africaines** : architecture prête (`src/i18n`), traductions à produire.
- **Textes légaux** : modèles à faire valider (loi ivoirienne n° 2013-450, ARTCI).
- **Assistant** : la conversation n'est pas sauvegardée (choix de confidentialité).
- **Historique très long** : la première synchronisation télécharge tout
  l'historique de l'espace une fois (incrémentale ensuite) ; au-delà de
  dizaines de milliers d'opérations, prévoir des agrégats mensuels côté serveur.
- **Tests d'interface automatisés** : parcours vérifiés manuellement sur le
  build web (Playwright) ; à industrialiser (Maestro / Detox).
