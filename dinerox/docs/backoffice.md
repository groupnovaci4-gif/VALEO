# Back-office web DineroX — conception (étape 1)

> Document de conception. **Aucun code de l'application ni du portail n'est écrit à cette
> étape.** Maquette visuelle : [`docs/backoffice-preview.html`](./backoffice-preview.html)
> (s'ouvre directement dans le navigateur).
>
> Branche `backoffice` (worktree séparé, partie de `dinerox-main`). Toutes les règles de
> `CLAUDE.md` restent valables : aucune fonctionnalité retirée, aucune formule, aucun quota ni
> aucun texte de l'application modifié sans accord, aucune donnée perdue.
>
> Dans ce document, le **nom de marque** s'écrit `{app}` : le portail le lira dans
> `src/config/brand.ts`, comme l'application.

---

## 0. En deux minutes

- Le portail est un **site web séparé** (`dinerox/admin/`, React + Vite), hébergé sur un **site
  Firebase Hosting distinct** du projet `dinerox-app`.
- Le portail **ne lit ni n'écrit jamais Firestore**. Il n'embarque même pas le module Firestore
  du SDK : il ne parle qu'à **Firebase Auth** (connexion) et à des **Cloud Functions appelables**
  préfixées `bo…`. Chaque fonction vérifie, côté serveur, la permission de l'appelant.
- Les données d'administration (équipe, rôles, journal, suspensions, statistiques) vivent dans
  des collections **interdites à tout client** par les règles Firestore.
- Toute action (suspension, suppression d'une opération, etc.) laisse une ligne dans un
  **journal en ajout seul**, refus compris, **sans aucun montant**.
- Supprimer une opération depuis le portail utilise **le même mécanisme que l'application** :
  une marque « supprimée » horodatée, propagée à tous les téléphones. Les écritures liées
  (dette, objectif, tontine, réserve, épargne) partent avec elle. Une petite règle en plus
  empêche un téléphone resté hors ligne de la faire réapparaître.

---

## 1. Écrans du portail

Mise en page : **une seule barre, verticale, à gauche** (aucune barre horizontale), et le
**contenu** à droite. En haut du contenu, **uniquement le titre de la page** en cours (sur
téléphone, le bouton ☰ est placé à côté). Aucun bouton de navigation en haut : les actions
d'une page (« Créer un utilisateur », filtres, période…) sont dans la page, au plus près de ce
qu'elles touchent. Détail de la barre au §1.1.

| # | Écran | Contenu | Permission |
|---|---|---|---|
| E1 | **Connexion** | e-mail + mot de passe, puis code à 6 chiffres (double vérification, §8). Mot de passe oublié. Aucun lien d'inscription. | — |
| E1b | **Activer la double vérification** (1re connexion) | QR code à scanner, saisie d'un code, 8 codes de secours affichés une seule fois. | — |
| E2 | **Tableau de bord** | cartes de chiffres clés (utilisateurs, actifs 7 j, formules, suspendus), courbe des inscriptions, courbe des actifs, répartition des formules, accès rapides (selon les droits), dernières actions du journal (si `audit.view`). | `stats.view` |
| E2b | **Statistiques** | vue détaillée, filtres période et pays : inscriptions, actifs 7 j, comptes par pays, formules, familles, part des méthodes de saisie (statistiques anonymes déjà collectées par l'app). « Voir en tableau » sous chaque graphique. Chiffres agrégés uniquement. | `stats.view` |
| E3 | **Utilisateurs** | recherche exacte (e-mail ou identifiant), filtres (formule, statut, pays), liste paginée par 25, tri par date d'inscription. Bouton « Créer un utilisateur » dans la barre de filtres (si `users.create`). | `users.view` |
| E4 | **Fiche utilisateur** | identité, formule, statut (icône + mot), dates (inscription, dernière activité), espaces (personnel, familles et rôle), appareils (nombre), historique des actions du journal sur ce compte. Actions : Modifier, Changer de formule, Suspendre/Réactiver, Voir les opérations ; zone « Actions irréversibles » isolée en bas : Supprimer définitivement. | `users.view` + permission de chaque action |
| E5 | **Créer un utilisateur** (panneau) | prénom, nom (facultatif), e-mail, pays, devise (préremplie par le pays), langue. Message : « Un lien pour définir le mot de passe sera envoyé à cette adresse. » | `users.create` |
| E6a | **Données** (entrée de la barre) | recherche exacte d'un utilisateur, rappel des règles (motif, journal, lecture seule), bouton « Consulter les opérations » → E6 ; liste de **ses propres** dernières consultations. Raccourci aussi depuis la fiche (E4). | `data.view` |
| E6 | **Consulter les opérations** | 1) fenêtre « Motif de consultation » (liste courte + champ libre si « Autre ») ; 2) liste en lecture seule, par espace, 25 par page, montants au format de l'app. Sur chaque ligne : « Supprimer » (si `data.delete`). Bandeau permanent : « Consultation enregistrée au journal · motif : … ». Pas d'export, pas de sélection multiple. | `data.view` (+ `data.delete`) |
| E7 | **Supprimer une opération** (fenêtre) | récapitulatif (date, type, montant, espace), liste des **effets liés** calculés par le serveur, motif interne, case « J'ai compris que… », puis 2e confirmation en retapant `SUPPRIMER`. | `data.delete` |
| E8 | **Équipe** | liste des collaborateurs (rôle, statut, double vérification active, dernière connexion), inviter, changer de rôle, suspendre, retirer, réinitialiser la double vérification. | `staff.manage` |
| E9 | **Rôles** | rôles fournis (lecture seule) et rôles sur mesure : nom + cases de permissions ; `data.view`/`data.delete` **affichées grisées et cadenassées** avec l'explication « Réservé aux rôles Super Admin et Administrateur ». | `staff.manage` (Super Admin) |
| E10 | **Journal d'audit** | liste chronologique, filtres (auteur, action, cible, résultat, période), détail d'une ligne (avant/après). Lecture seule, pagination, **aucune suppression ni modification possible**. | `audit.view` |
| E11 | **Réglages** (bas de la barre) | thème (clair, sombre, automatique), état de la session (double vérification, expiration), lien « Mot de passe et codes de secours » (changer son mot de passe, régénérer ses codes, fermer toutes ses sessions). | — |
| — | **États** | chaque écran a ses états chargement (squelettes), vide, erreur (avec « Réessayer ») et succès (message dans la page + toast 4 s). Accès refusé : page dédiée « Vous n'avez pas accès à cette page ». | — |

### 1.1 Barre latérale

**Ordre, de haut en bas :**

| Zone | Contenu | Permission pour l'afficher |
|---|---|---|
| Marque | logo + nom (`brand.ts`) + « Back-office » | — |
| Recherche | champ « E-mail ou identifiant exact » (ouvre la fiche, ou la liste avec le résultat) | `users.view` |
| **Pilotage** | Tableau de bord · Statistiques | `stats.view` |
| **Gestion** | Utilisateurs · Données | `users.view` · `data.view` |
| **Contrôle** | Journal d'audit · Équipe et rôles | `audit.view` · `staff.manage` |
| Bas | mon profil (initiales, nom, rôle) · Réglages (thème clair / sombre / automatique, session, mot de passe et codes de secours) · Se déconnecter | — |

**Pourquoi ces groupes** (ta proposition, gardée avec deux précisions) :
- *Pilotage* = regarder (chiffres agrégés, aucune donnée individuelle) ; *Gestion* = agir sur
  des comptes et leurs données ; *Contrôle* = surveiller l'équipe elle-même. Chaque groupe
  correspond donc à un niveau de sensibilité croissant, ce qui aide aussi à comprendre ce qu'un
  rôle voit.
- La **recherche** est placée sous le logo plutôt que dans un groupe : c'est l'action la plus
  fréquente du support, elle doit rester à portée sans ouvrir « Utilisateurs ».
- « Données » est une entrée à part (et pas seulement un bouton de la fiche) pour que l'accès
  aux opérations, l'action la plus sensible, soit visible, distinct et réservé : il n'apparaît
  que pour Super Admin et Administrateur.

**Seules les entrées autorisées s'affichent.** Un groupe dont aucune entrée n'est autorisée
disparaît avec son titre. Après connexion, le portail ouvre la **première entrée autorisée**.
C'est un confort d'affichage : chaque fonction serveur revérifie la permission, et une adresse
ouverte « à la main » affiche « Vous n'avez pas accès à cette page » (le refus est journalisé).

| Rôle | Ce que montre la barre | Page d'accueil |
|---|---|---|
| Super Admin | les 6 entrées | Tableau de bord |
| Administrateur | Pilotage + Gestion (pas de Contrôle) | Tableau de bord |
| Support | Recherche + Utilisateurs | Utilisateurs |
| Analyste | Pilotage seulement (pas de recherche) | Tableau de bord |

Dans les pages, les boutons suivent la même règle : « Modifier » (`users.edit`), « Changer de
formule » (`users.changePlan`), « Suspendre » (`users.suspend`), « Voir les opérations »
(`data.view`), « Supprimer » une opération (`data.delete`), zone « Supprimer définitivement »
(`users.delete`, donc Super Admin seulement).

**Selon la taille de l'écran :**
- **Ordinateur** (plus de 1100 px) : barre complète, 272 px.
- **Tablette** (641 à 1100 px) : barre réduite aux **icônes** (80 px), titres de groupes
  remplacés par un filet. Le nom de l'entrée apparaît dans une bulle **au survol, au focus
  clavier et à l'appui long** (l'appui long montre le nom sans ouvrir la page). Chaque icône
  porte aussi son nom pour le lecteur d'écran. Les réglages s'ouvrent dans un petit panneau à
  côté de la barre.
- **Téléphone** (640 px et moins) : barre cachée ; le bouton ☰ à côté du titre l'ouvre en
  tiroir par-dessus le contenu (fond assombri). Elle se **referme toute seule après un choix**,
  ainsi qu'avec la croix, un toucher sur le fond ou la touche Échap. Le focus va dans le tiroir
  à l'ouverture et revient sur ☰ à la fermeture.

**Couleurs :** fond nuit de `brand.ts` dans les deux thèmes ; le vert de marque `#14B8A6` n'y
sert qu'aux repères (entrée active, icônes actives, focus) car il n'est lisible que sur fond
sombre (≈ 7,9:1). Le contenu garde les jetons du design system v2.

### 1.2 Maquette : outils de test

Dans `docs/backoffice-preview.html`, le petit panneau pointillé jaune « **Outils de la
maquette** » (bouton en bas à droite) sert **uniquement à tester la maquette** : choix de
l'écran, du **rôle connecté** (pour voir la barre changer), du thème (dont « les deux côte à
côte ») et du format (ordinateur, tablette, téléphone). Il n'existera pas dans le portail. Tout
le reste de la page est le portail tel qu'il sera construit.

---

## 2. Rôles et permissions

### 2.1 Permissions

| Code | Ce qu'elle permet |
|---|---|
| `users.view` | rechercher, lister, ouvrir une fiche (sans données financières) |
| `users.create` | créer un compte utilisateur |
| `users.edit` | modifier prénom, nom, pays, devise, langue, e-mail |
| `users.changePlan` | attribuer ou retirer une formule manuellement |
| `users.suspend` | suspendre et réactiver un compte |
| `users.delete` | supprimer définitivement un compte |
| `stats.view` | tableau de bord et statistiques agrégées |
| `audit.view` | consulter le journal |
| `staff.manage` | gérer l'équipe et les rôles sur mesure |
| `data.view` | voir les opérations financières d'un utilisateur — **réservée, codée en dur** |
| `data.delete` | supprimer une opération d'un utilisateur — **réservée, codée en dur** |

### 2.2 Matrice rôles × permissions

✅ autorisé · — refusé · 🔒 refusé et **impossible à attribuer** (codé en dur côté serveur)

| Permission | Super Admin | Administrateur | Support | Analyste | Rôle sur mesure |
|---|:-:|:-:|:-:|:-:|:-:|
| `users.view` | ✅ | ✅ | ✅ | — | au choix |
| `users.create` | ✅ | ✅ | — | — | au choix |
| `users.edit` | ✅ | ✅ | — | — | au choix |
| `users.changePlan` | ✅ | — | — | — | au choix |
| `users.suspend` | ✅ | ✅ | ✅ | — | au choix |
| `users.delete` | ✅ | — | — | — | au choix |
| `stats.view` | ✅ | ✅ | — | ✅ | au choix |
| `audit.view` | ✅ | — | — | — | au choix |
| `staff.manage` | ✅ | — | — | — | 🔒 *(proposition D3)* |
| `data.view` | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| `data.delete` | ✅ | ✅ | 🔒 | 🔒 | 🔒 |

### 2.3 Règles invariantes (vérifiées par le serveur, testées)

1. `data.view` et `data.delete` ne sont accordées **que** par les rôles `superAdmin` et `admin`.
   Le calcul des droits ignore ces deux codes s'ils figurent dans un autre rôle, et la création
   ou la modification d'un rôle sur mesure qui les contient est **refusée** (et journalisée).
2. Seul un Super Admin attribue (ou retire) le rôle `admin` ou `superAdmin`.
3. Seul un Super Admin modifie, suspend ou retire un Super Admin.
4. Le **dernier** Super Admin actif ne peut être ni rétrogradé, ni suspendu, ni retiré (contrôle
   en transaction, pour que deux demandes simultanées ne passent pas toutes les deux).
5. Personne ne modifie **ses propres** droits (rôle, statut, retrait, réinitialisation de sa
   double vérification par un tiers seulement).
6. Un collaborateur suspendu, ou dont la double vérification n'est pas validée pour la session
   en cours, n'a **aucune** permission.
7. Un rôle sur mesure ne peut pas porter le nom réservé d'un rôle fourni.

### 2.4 Où vivent les droits

- **Pas dans le jeton.** Les permissions sont relues à **chaque appel** dans `boStaff/{uid}` et
  `boRoles/{roleId}` (une ou deux lectures). Un retrait de droit est donc **immédiat**, sans
  attendre l'expiration d'un jeton.
- Nom distinct de l'existant : l'application a déjà des rôles d'**espace famille** (`admin`,
  `partner`, `child`) et un droit `admin` sur le jeton (écran « Administration » de l'app,
  `config/*`). Les rôles du back-office sont rangés à part (`boStaff`) et ne touchent pas à ces
  rôles. L'écran « Administration » de l'app et le droit `admin` existant **restent tels quels**.

---

## 3. Cloud Functions (toutes appelables, région `europe-west1`)

Chaque fonction commence par le même garde-fou `requireStaff(req, permission)` :
session Firebase valide → collaborateur actif dans `boStaff` → session de double vérification
valide (§8) → permission présente → sinon `permission-denied` **et ligne `denied` au journal**.
Les fonctions vivent dans un nouveau fichier `firebase/functions/src/backoffice/` ; `index.ts`
ne fait que les exporter (les fonctions existantes ne changent pas, sauf `adminStats`, voir D10).

| Fonction | Permission exigée | Rôle |
|---|---|---|
| `boMe` | collaborateur actif | renvoie son rôle, ses permissions, l'état de sa double vérification |
| `boMfaEnroll` / `boMfaVerify` | session Firebase (collaborateur) | enrôlement TOTP, vérification du code → ouvre une session de 12 h (§8) |
| `boMfaRecovery` | session Firebase (collaborateur) | utiliser un code de secours (usage unique) |
| `boStats` | `stats.view` | chiffres clés + séries (lus dans `boStats`, §6) |
| `boSearchUsers` | `users.view` | recherche **exacte** par e-mail (Auth `getUserByEmail`) ou identifiant |
| `boListUsers` | `users.view` | liste paginée (25, curseur), filtres formule / statut / pays |
| `boGetUser` | `users.view` | fiche (profil sans données financières, espaces, statut, nb d'appareils) |
| `boCreateUser` | `users.create` | crée le compte Auth sans mot de passe + profil comme l'app (gratuit) |
| `boUpdateUser` | `users.edit` | champs autorisés seulement (prénom, nom, pays, devise, langue, e-mail) |
| `boSetPlan` | `users.changePlan` | écrit `subscription` (fournisseur `manual`), voir D8 |
| `boSetSuspended` | `users.suspend` | suspend / réactive (§5) |
| `boDeleteUser` | `users.delete` | suppression définitive, même logique que `deleteAccount` (§3.2) |
| `boListTransactions` | `data.view` | opérations d'un utilisateur, 25 par page, **motif obligatoire** (§3.3) |
| `boPreviewDelete` | `data.delete` | calcule et renvoie les effets liés d'une suppression (aucune écriture) |
| `boDeleteTransaction` | `data.delete` | suppression synchronisée d'une opération (§4) |
| `boListAudit` | `audit.view` | journal paginé et filtré |
| `boListStaff` / `boInviteStaff` / `boSetStaffRole` / `boSetStaffSuspended` / `boRemoveStaff` / `boResetStaffMfa` | `staff.manage` | gestion de l'équipe + règles §2.3 |
| `boListRoles` / `boSaveRole` / `boDeleteRole` | `staff.manage` (Super Admin) | rôles sur mesure (refus de `data.*`) |
| `boStatsSnapshot` *(planifiée, toutes les heures)* | — (serveur) | calcule les compteurs agrégés dans `boStats` |

### 3.1 Création d'un utilisateur

1. `getAuth().createUser({ email, emailVerified: false })` — **aucun mot de passe**.
2. Profil `users/{uid}` construit par `serverDefaultProfile()`, **miroir** de
   `defaultProfile()` de l'app (`src/services/profile.ts`) avec la formule gratuite de
   `defaultSubscription()`. Un test de parité vérifie que les deux produisent les mêmes champs
   (comme `plans.ts` ↔ `subscription.ts` aujourd'hui). L'espace personnel est créé par l'app
   à la première connexion, comme pour une inscription normale.
3. Le portail appelle ensuite `sendPasswordResetEmail(auth, email)` (SDK Auth) : Firebase
   envoie son e-mail modèle avec le lien pour **définir** le mot de passe. Aucun collaborateur
   ne tape ni ne voit de mot de passe. (Voir D7 sur le texte du modèle.)
4. Journal : `user.create` (cible, e-mail, pays, langue ; jamais de mot de passe).

### 3.2 Suppression définitive d'un compte

Le corps de `deleteAccount` est extrait dans une fonction interne `deleteUserData(uid, email)`
**sans changer son comportement** ; `deleteAccount` (appelée par l'app) et `boDeleteUser` (portail)
l'appellent toutes les deux. Effets identiques : familles dont il est le seul administrateur
supprimées, retrait des autres familles, espace personnel, profil, abonnement, usage,
invitations, justificatifs, puis compte Auth. Le portail exige de **retaper l'e-mail** ; le
serveur revérifie que l'e-mail retapé correspond. Journal : `user.delete` (identifiant, e-mail
haché + domaine, voir D11).

### 3.3 Consultation des opérations (`data.view`)

- Entrée : `uid`, `spaceId` (facultatif : personnel par défaut, ou une famille dont il est
  membre), `reasonCode` ∈ {`client_request`, `verification`, `fraud_suspicion`, `other`},
  `reasonNote` (obligatoire si `other`, 200 caractères max), curseur.
- La 1re page ouvre un **accès** (`boAccess/{id}` : collaborateur, cible, motif, expiration
  30 min) et écrit `data.view` au journal avec le motif. Les pages suivantes portent l'`accessId`
  (pas de nouveau motif, mais rattachées au même accès). Fermer puis rouvrir = nouveau motif.
- Le motif n'est **jamais** écrit dans les données de l'utilisateur ni envoyé à l'utilisateur.
- Lecture seule, 25 lignes par page, tri par date décroissante (`orderBy('date')` + curseur),
  limite de 30 pages par minute et par collaborateur. Aucune route d'export.
- Champs renvoyés (minimisation, voir D9) : date, type, montant, devise, catégorie, compte,
  auteur (prénom du membre), indicateur « supprimée ». Note, bénéficiaire et justificatif
  **masqués** par défaut.

---

## 4. Supprimer une opération depuis le back-office (`data.delete`)

### 4.1 Rappel : comment l'app supprime aujourd'hui

- `SyncEngine.remove()` n'efface jamais : il réécrit le document avec `deleted: true` et un
  `updatedAt` strictement croissant (`stamp()` : `max(maintenant, ancien updatedAt + 1)`).
- Le document part vers Firestore avec `syncedAt: serverTimestamp()`.
- Chaque téléphone écoute `syncedAt > curseur` : il reçoit la marque, `mergeRemote` la fait
  gagner (plus récente), l'opération disparaît de `visible()`.
- `useActions().remove('transactions', id)` supprime aussi les **écritures liées** :
  1. `debtPayments` dont `transactionId == id` (remboursement de dette) ;
  2. `goalContributions` dont `transferId == id` (versement à un objectif / épargne) ;
  3. `tontineEntries` dont `transactionId == id` (cotisation ou cagnotte) ;
  4. `goalContributions` dont `linkedTransactionId == id` (utilisation d'une **réserve**),
     **et** leur transfert éventuel (`transferId`) ;
  et, dans l'autre sens, supprimer un `debtPayment` ou une `goalContribution` supprime
  l'opération qu'il représente.
- L'épargne (`depositToSavings`, `withdrawFromSavings`) passe par des transferts +
  contributions : elle est couverte par les cas 2 et 4. Les soldes, budgets, enveloppes,
  scores et le « reste par jour » sont **dérivés** : ils se recalculent seuls sur chaque
  téléphone, rien à écrire.

### 4.2 Ce que fait `boDeleteTransaction`

1. **Réutilisation, pas réécriture.** La liste des écritures liées est extraite de
   `useActions().remove` dans une fonction **pure** `planRemoval(data, col, id)` dans
   `src/core/removal.ts` (testée), que `actions.ts` appelle ensuite — comportement de l'app
   strictement identique, prouvé par les tests existants + un test dédié. Le serveur utilise un
   **miroir** de ce fichier (`firebase/functions/src/backoffice/removal.ts`), avec un **test de
   parité** qui fait tourner les deux sur les mêmes cas (même principe que `plans.ts`).
   Voir D1 (c'est une petite modification de code de l'app, à valider).
2. Le serveur charge les documents concernés par requêtes ciblées (jamais une collection
   entière) : l'opération, puis `debtPayments`/`goalContributions`/`tontineEntries` filtrés
   sur l'identifiant.
3. Dans **une seule transaction Firestore**, chaque document concerné reçoit exactement ce que
   l'app écrirait :
   `deleted: true`, `updatedAt: max(maintenant, ancien updatedAt + 1)`,
   `syncedAt: serverTimestamp()` ; `createdBy` et `createdAt` inchangés ; **plus un marqueur
   `adminDeleted: true`** (voir 4.3). Aucun effacement physique, aucun autre champ modifié.
4. Journal : `data.delete` avec motif, espace, identifiants des documents marqués et **types**
   d'effets liés (« 1 remboursement de dette, 1 utilisation de réserve ») — **jamais** de
   montant, de bénéficiaire, de note ni de catégorie.

### 4.3 « Ne revient jamais » : le cas du téléphone resté hors ligne

Sans précaution, un téléphone hors ligne dont l'horloge est en avance, ou qui modifie
l'opération juste après, pourrait la renvoyer avec un `updatedAt` plus grand et la faire
réapparaître (« le plus récent gagne »). Ajout dans `firestore.rules` (données d'espace) :

```
// Supprimée par le back-office : plus aucune modification client.
allow update: if … && resource.data.get('adminDeleted', false) != true;
```

Comportement **déjà présent** dans l'app pour une écriture refusée (`engine.ts`) : l'op est
retirée de la file, l'app relit la version serveur (la marque « supprimée ») et l'applique.
L'opération disparaît donc aussi de ce téléphone, **sans modifier l'app**.

### 4.4 Famille

Dans un espace familial, une opération est partagée : la supprimer la retire **pour tous les
membres**. La fenêtre de confirmation l'affiche en clair (« Espace familial « Famille K. » —
4 membres verront cette opération disparaître »).

---

## 5. Suspension et réactivation

### 5.1 Côté serveur (`boSetSuspended`)

- Suspendre : `updateUser(uid, { disabled: true })` + `revokeRefreshTokens(uid)` +
  `accountStatus/{uid}` = `{ status: 'suspended', since, by, reasonCode }` + journal.
- Réactiver : `disabled: false` + `accountStatus/{uid}.status = 'active'` + journal.
- **Aucune donnée n'est touchée** (profil, espaces, opérations, familles). Le compte reste membre
  de ses familles ; les autres membres ne voient aucun changement.
- `accountStatus` est une collection séparée : le client ne peut pas l'écrire (le profil
  `users/{uid}`, lui, est modifiable par son propriétaire — un drapeau posé dedans pourrait être
  effacé par l'utilisateur).
- Option D6 : retirer aussi les jetons push de ses appareils (sinon le résumé du lundi
  continuerait de lui être envoyé).

### 5.2 Côté application

- **Aujourd'hui** : une connexion d'un compte désactivé affiche déjà
  `auth.err.user-disabled` = « Ce compte a été désactivé. » Mais un téléphone **déjà connecté**
  garde son jeton jusqu'à une heure et n'est pas déconnecté proprement.
- **Proposé** (petit ajout dans `src/store/app.tsx`, sans nouvelle dépendance) : au démarrage,
  au retour au premier plan et à chaque retour du réseau, l'app force le renouvellement du jeton
  (`getIdToken(true)`). Si Firebase répond `auth/user-disabled`, l'app se déconnecte et affiche
  le message ci-dessous sur l'écran de connexion. Le cache local du compte est **conservé**
  (rangé par uid, règle 14) : à la réactivation, tout revient, y compris les saisies en attente.
- Délai : en pratique, dès que l'utilisateur ouvre l'app avec du réseau. Au pire, une heure
  pour un téléphone qui resterait ouvert en continu (durée de vie d'un jeton Firebase). Voir D5.

### 5.3 Texte proposé (à valider — rien n'est ajouté avant ton accord)

| Clé | Français | English |
|---|---|---|
| `auth.suspended.title` | Compte suspendu | Account suspended |
| `auth.suspended.body` | Votre compte {app} est suspendu : vous ne pouvez plus vous connecter pour le moment. Vos données sont conservées. Pour en savoir plus, écrivez-nous à {email}. | Your {app} account is suspended, so you can't sign in for now. Your data is kept. To find out more, write to us at {email}. |
| `auth.err.user-disabled` *(remplacement)* | Ce compte est suspendu. Écrivez-nous à {email} pour en savoir plus. | This account is suspended. Write to us at {email} to find out more. |

`{email}` = `brand.supportEmail`. Aucun motif n'est jamais montré à l'utilisateur.

---

## 6. Modèle de données (nouvelles collections)

Toutes **interdites au client** (lecture et écriture) — sauf `accountStatus`, lisible par son
seul propriétaire si D5 retient la variante « lecture ». Écrites uniquement par les Functions.

| Collection | Document | Champs principaux |
|---|---|---|
| `boStaff/{uid}` | collaborateur | `email`, `displayName`, `roleId`, `status` (`active`/`suspended`), `mfa` { `enrolled`, `secretEnc`, `recoveryHashes[]`, `failedCount`, `lockedUntil` }, `createdAt`, `createdBy`, `lastLoginAt` |
| `boRoles/{roleId}` | rôle | `name`, `permissions[]`, `builtIn` (bool), `createdAt`, `createdBy`, `updatedAt` — les 4 rôles fournis sont **dans le code**, pas modifiables |
| `boSessions/{uid}` | session double vérif. | `authTime` (du jeton), `verifiedAt`, `expiresAt` (12 h) |
| `boAccess/{id}` | accès aux opérations | `actorUid`, `targetUid`, `spaceId`, `reasonCode`, `expiresAt` |
| `boAudit/{id}` | ligne de journal | voir 6.1 |
| `boAuditHead/head` | chaînage | `lastId`, `lastHash`, `count` |
| `boStats/{AAAA-MM-JJ}` | instantané | `users`, `active7`, `families`, `plans` {free, plus, family}, `suspended`, `signups`, `generatedAt` |
| `accountStatus/{uid}` | statut du compte | `status`, `since`, `by`, `reasonCode` |

### 6.1 Journal en ajout seul

```
boAudit/{id} = {
  at: serverTimestamp, actorUid, actorEmail, actorRole,
  action: 'user.suspend' | 'data.view' | 'data.delete' | 'staff.role' | … ,
  targetUid?, targetLabel?,           // e-mail ou prénom pour l'affichage
  result: 'ok' | 'denied' | 'error',
  reasonCode?, reasonNote?,           // motifs internes
  before?, after?,                    // liste blanche : statut, formule, rôle, prénom, pays, langue…
  refs?,                              // ex. identifiants des documents marqués supprimés
  prevHash, hash                      // SHA-256(prevHash + contenu) : toute altération se voit
}
```

- Écrit **uniquement** par les Functions, dans la même transaction que l'action (pas d'action
  sans trace). Les refus sont écrits aussi (`result: 'denied'`).
- **Aucun montant** ni détail financier : la liste blanche `before/after` est dans le code et
  testée (un test échoue si un champ `amount`, `payee`, `note`, `categoryId`… y apparaît).
- Personne ne peut le modifier ni le supprimer : règles Firestore `allow read, write: if false`,
  et **aucune** fonction n'expose de modification. Le chaînage par empreintes rend visible une
  altération faite hors du portail (console, Admin SDK). Option D12 : copie vers un compartiment
  Cloud Logging verrouillé (immuabilité réelle, même pour un propriétaire du projet).

---

## 7. Règles Firestore (ajouts)

```
// Back-office : AUCUN accès client, tout passe par les Cloud Functions (Admin SDK).
match /boStaff/{id}       { allow read, write: if false; }
match /boRoles/{id}       { allow read, write: if false; }
match /boSessions/{id}    { allow read, write: if false; }
match /boAccess/{id}      { allow read, write: if false; }
match /boAudit/{id}       { allow read, write: if false; }
match /boAuditHead/{id}   { allow read, write: if false; }
match /boStats/{id}       { allow read, write: if false; }
match /accountStatus/{uid} { allow read: if false; allow write: if false; }

// Données d'espace : une opération supprimée par le back-office n'est plus modifiable (§4.3).
allow update: if … (conditions existantes) && resource.data.get('adminDeleted', false) != true;
```

Ces collections tomberaient déjà sous le « refus par défaut » ; les écrire explicitement
documente l'intention et permet de les **tester**. Aucune autre règle existante ne change.

---

## 8. Double vérification (mot de passe + code)

| | **A. TOTP natif Firebase** (Identity Platform) | **B. TOTP géré par nos Functions** *(recommandé)* |
|---|---|---|
| Principe | Passer le projet à « Firebase Authentication with Identity Platform » et activer la MFA TOTP. | Code à 6 chiffres d'une appli d'authentification (Google Authenticator, Microsoft Authenticator…), vérifié par `boMfaVerify`. Secret chiffré (clé dans Secret Manager), jamais lisible par un client. |
| Simplicité | La plus simple à coder. | ~150 lignes serveur + 2 écrans ; une petite bibliothèque TOTP pure JS **dans les Functions seulement**. |
| Coût | La mise à niveau concerne **tout le projet**, donc aussi les utilisateurs de l'app : gratuit jusqu'à 50 000 utilisateurs actifs par mois, puis environ 0,0055 $ par utilisateur actif au-delà (tarif dégressif). Exemple : 200 000 actifs/mois ≈ 800 $/mois. *Chiffres de sources tierces, à vérifier sur la page tarifs officielle.* | ≈ 0 € : Secret Manager ≈ 0,06 $/mois + accès négligeables. |
| Risque | Coût qui grandit avec l'app, pas avec l'équipe. | Code à maintenir ; couvert par des tests. |

**Recommandation : B.** Fonctionnement :

- 1re connexion au portail : QR code → saisie d'un code → 8 codes de secours affichés une fois
  (stockés hachés).
- Chaque connexion : mot de passe (Firebase Auth) puis code → `boSessions/{uid}` valable 12 h,
  liée à l'`auth_time` du jeton (une nouvelle connexion exige un nouveau code).
- 5 codes faux → verrou 15 min, journalisé. Un Super Admin peut réinitialiser la double
  vérification d'un autre collaborateur (jamais la sienne) ; en dernier recours, le script du
  Mac (§10) le fait pour un Super Admin.
- Le SMS est écarté : cher en Afrique de l'Ouest (jusqu'à ~0,46 $ par SMS selon les régions)
  et moins sûr.

---

## 9. Statistiques

- `boStatsSnapshot` (toutes les heures) calcule avec des **requêtes de comptage** (jamais de
  lecture de la collection entière) : utilisateurs, actifs 7 j (même définition que
  `adminStats` : `users.updatedAt` sur 7 jours), familles, formules, suspendus, inscriptions
  du jour. Coût : une lecture facturée par tranche de 1 000 entrées comptées, soit ≈ 1 000
  lectures par compteur à 1 million d'utilisateurs → quelques centimes par jour.
- Inscriptions : l'historique est **reconstituable** (comptage par jour sur `createdAt`, fait
  une fois sur 90 jours). Actifs 7 j : **pas d'historique possible** ; la courbe commence au
  déploiement. Le tableau de bord l'indique (« Données disponibles depuis le … »).
- Le tableau de bord affiche l'heure du dernier calcul (« Mis à jour il y a 12 min »).

---

## 10. Premier Super Admin (script lancé une fois depuis le Mac)

Nouveau script `firebase/functions/src/scripts/createSuperAdmin.ts`, même modèle que
`setAdmin.ts` (Admin SDK, jamais depuis le portail) :

```bash
cd dinerox/firebase/functions
npm run build
# Compte de service du projet dinerox-app (à télécharger depuis la console, à ne jamais committer)
GOOGLE_APPLICATION_CREDENTIALS=~/secrets/dinerox-app-admin.json \
  node lib/scripts/createSuperAdmin.js prenom.nom@exemple.com "Prénom Nom"
```

Le script : crée le compte Auth s'il n'existe pas (sans mot de passe) ou réutilise l'existant,
écrit `boStaff/{uid}` (rôle `superAdmin`, double vérification non enrôlée), écrit la ligne
`staff.bootstrap` au journal, puis affiche le **lien de définition du mot de passe**
(`generatePasswordResetLink`) à ouvrir soi-même. Option `--reset-mfa` pour le dernier recours.
Il refuse de s'exécuter contre l'émulateur sans `--emulator`, et inversement.

---

## 11. Portail : technique

- Dossier `dinerox/admin/` (package séparé : l'app mobile ne reçoit **aucune** dépendance).
  React 19 + Vite + TypeScript + React Router + Firebase JS SDK (**Auth et Functions
  uniquement** ; un test vérifie que `firebase/firestore` n'est importé nulle part).
- **Marque** : `brand.ts` importé directement (`../src/config/brand.ts`) — nom, slogan, couleurs
  de marque, e-mail de support. Le slogan affiché est le texte existant de l'app
  `auth.welcome.tagline` (« Votre argent, enfin lisible. ») : `brand.ts` n'a pas de champ
  slogan (voir D13).
- **Montants** : `formatMoney` importé de `src/core/money.ts` (module pur, sans dépendance)
  → format identique à l'app (« 12 500 FCFA »).
- **Design** : jetons du design system v2 (branche `design-v2`) **copiés** dans
  `admin/src/theme/tokens.css` (clair + sombre, avec la mention de leur origine), polices
  Plus Jakarta Sans + Inter auto-hébergées, icônes Ionicons (même jeu que l'app) en SVG.
- Hébergement : site Firebase Hosting distinct (ex. `dinerox-admin`), en-têtes de sécurité
  (CSP stricte, `X-Frame-Options: DENY`, `noindex`). Option D14 : App Check (reCAPTCHA
  Enterprise, gratuit jusqu'à 10 000 évaluations/mois) sur les fonctions `bo…`.
- Je ne déploie rien.

### 11.1 Design : arbitrages avec ui-ux-pro-max

Le skill a été consulté. Repris : liste de contrôle avant livraison (contrastes 4,5:1, focus
visible, `prefers-reduced-motion`, points de rupture 375 / 768 / 1024 / 1440), tableaux qui
deviennent des cartes sur téléphone, confirmation des actions irréversibles, message de succès
systématique, icônes SVG (jamais d'emoji). **Conflits, tranchés en faveur de la marque et du
design system validé :**

| Recommandation du skill | Retenu | Pourquoi |
|---|---|---|
| Style « Glassmorphism » (verre dépoli, flou) | Surfaces pleines, ombres neutres | DS v2 §0.5 : « pas de verre dépoli » |
| Polices Fira Sans / Fira Code | Plus Jakarta Sans + Inter (chiffres tabulaires) | DS v2 §2.1 |
| Palette ardoise + vert `#22C55E` | Jetons DS v2 (`primary` `#00685F` / `#4FD1C0`) + marque `#14B8A6`, or en accent | `brand.ts` + DS v2 |

Autre point à signaler : la charte de `brand.ts` (émeraude `#14B8A6`, fond nuit `#020617`)
n'atteint pas 4,5:1 en texte sur fond blanc (`#14B8A6` sur blanc ≈ 2,5:1). Comme dans le DS v2,
le portail utilise donc les jetons accessibles pour le texte et les boutons, et les couleurs de
`brand.ts` pour le logo, le panneau de marque de la page de connexion (fond nuit) et les
accents graphiques.

---

## 12. Paragraphe de conformité (à faire valider par un juriste)

**À ajouter à la politique de confidentialité — « Accès par notre équipe »**

> Pour assurer le support et la sécurité du service, un nombre restreint de membres habilités
> de l'équipe {app} peut accéder aux informations de votre compte (identité, formule, statut,
> espaces) au moyen d'un outil d'administration interne. Seuls les profils « Administrateur »
> et « Super Administrateur » peuvent, en cas de besoin précis — à votre demande, pour une
> vérification, ou en cas de suspicion de fraude ou d'utilisation abusive — consulter les
> opérations que vous avez enregistrées et, le cas échéant, supprimer une opération. Ces accès
> sont limités au strict nécessaire, en lecture seule sauf suppression motivée, et ne
> permettent aucune exportation massive. Chaque accès est enregistré dans un journal
> inaltérable indiquant son auteur, sa date et son motif ; ce journal ne contient aucun montant.
> {app} ne vend pas vos données et ne les utilise pas à d'autres fins. Vous pouvez demander à
> savoir si votre compte a fait l'objet d'un tel accès en écrivant à {email}.

**À ajouter aux conditions d'utilisation — « Suspension et suppression par {app} »**

> {app} peut suspendre un compte en cas de non-respect des présentes conditions, de suspicion
> de fraude ou pour protéger la sécurité du service ou de ses utilisateurs. Pendant la
> suspension, la connexion est impossible et les données du compte sont conservées ; la
> réactivation les rétablit à l'identique. Sur demande de l'utilisateur ou dans les cas prévus
> par la loi, {app} peut supprimer définitivement un compte et ses données. Les interventions
> de l'équipe sont tracées dans un journal interne.

*Points à faire vérifier par le juriste : base légale (intérêt légitime / exécution du
contrat), loi ivoirienne n° 2013-450 sur les données personnelles et déclaration éventuelle
auprès de l'ARTCI, durée de conservation du journal (proposition : 5 ans), information des
membres d'une famille quand une opération partagée est supprimée.*

---

## 13. Plan de tests

### Étape 2 — serveur (émulateurs Auth + Firestore + Functions)

1. **Matrice complète** : pour chaque rôle (`superAdmin`, `admin`, `support`, `analyste`, rôle
   sur mesure, non-collaborateur, collaborateur suspendu, collaborateur sans double
   vérification) × chaque fonction `bo…` → « autorisé » ou « refusé ». Le tableau attendu est
   **écrit à la main dans le test** (pas recalculé depuis le code), et chaque refus vérifie la
   ligne `denied` du journal.
2. `data.view`/`data.delete` : refusées à tout rôle autre que `superAdmin`/`admin`, y compris un
   rôle sur mesure qui les contiendrait (création refusée ; et si l'on force un tel document en
   base, le calcul des droits les ignore).
3. **Dernier Super Admin** : rétrogradation, suspension, retrait refusés ; deux demandes
   simultanées sur deux Super Admins → une seule passe.
4. **Ses propres droits** : changer son rôle, se suspendre, se retirer, réinitialiser sa propre
   double vérification → refusés.
5. Seul un Super Admin attribue `admin` ; un admin ne touche pas un Super Admin.
6. **Synchronisation** : deux moteurs `SyncEngine` de l'app branchés sur l'émulateur
   (téléphone A et B) ; le back-office supprime une opération liée à une dette, une réserve et
   une tontine → B reçoit les marques, l'opération et ses effets disparaissent ; B, resté hors
   ligne avec une modification plus récente, se reconnecte → écriture refusée, la marque est
   rétablie, **l'opération ne revient pas**.
7. Parité `planRemoval` app ↔ serveur ; parité `defaultProfile` app ↔ serveur.
8. Règles : chaque collection `bo*`/`accountStatus` refusée en lecture et écriture à tout
   client ; `adminDeleted` bloque une mise à jour.
9. Journal : aucun champ financier (`amount`, `payee`, `note`, `categoryId`…) dans une ligne ;
   chaînage des empreintes vérifié.
10. Suspension : compte Auth désactivé, jetons révoqués, données intactes ; réactivation
    → tout est revenu.
11. `npm run check`, `npm run test:rules`, `npm --prefix firebase/functions run typecheck`,
    compilation des Functions : verts, lint à zéro.

### Étape 3 — portail et app

- Bout en bout sur l'export web + émulateurs (style `e2e/`) : connexion + code, chaque écran,
  chaque action, refus visibles, états vide/erreur.
- App : un compte suspendu pendant qu'il est connecté → déconnecté au retour réseau avec le
  message validé ; réactivé → reconnexion, données intactes.
- Captures d'écran clair et sombre, ordinateur / tablette / téléphone ; contrôle clavier et
  contrastes AA.

---

## 14. Décisions à te soumettre

| # | Question | Ma proposition |
|---|---|---|
| **D1** | Extraire la liste des écritures liées de `actions.ts` vers `src/core/removal.ts` (fonction pure, comportement identique) pour que le serveur la réutilise. C'est une petite modification du code de l'app. | **Oui** (sinon le serveur réécrirait la logique, ce que tu ne veux pas). |
| **D2** | Règle `adminDeleted` (§4.3) : une opération supprimée par le back-office n'est plus modifiable par aucun téléphone. | **Oui**, c'est ce qui garantit « ne revient jamais ». |
| **D3** | `staff.manage` réservée au Super Admin (comme `data.*`, impossible à mettre dans un rôle sur mesure), pour éviter qu'un rôle sur mesure crée d'autres collaborateurs. | **Oui.** |
| **D4** | Double vérification : option A (Identity Platform, coût qui suit le nombre d'utilisateurs de l'app) ou B (TOTP dans nos Functions, ≈ gratuit). | **B.** |
| **D5** | Compte suspendu : renouvellement forcé du jeton au démarrage / premier plan / retour réseau (déconnexion en pratique immédiate, une heure au pire), **sans** contrôle supplémentaire dans les règles (qui coûterait une lecture par requête de tous les utilisateurs). | **Oui**, sans contrôle dans les règles. |
| **D6** | À la suspension, retirer les jetons push des appareils du compte (ils se réenregistrent à la reconnexion). | **Oui.** |
| **D7** | E-mail de définition du mot de passe : modèle Firebase « réinitialisation » (gratuit, mais **partagé** avec « mot de passe oublié » de l'app : texte à rendre neutre dans la console), ou envoi par un service d'e-mail (payant, texte dédié). | **Modèle Firebase**, texte neutre. |
| **D8** | `users.changePlan` (Super Admin seul) : formule écrite avec `provider: 'manual'` et une date de fin obligatoire. Cela change les quotas du compte ; aucune formule n'est vendue par ce biais. | **Oui**, date de fin obligatoire. |
| **D9** | Consultation des opérations : masquer note, bénéficiaire et justificatif (minimisation), ou les montrer. | **Masquer.** |
| **D10** | `adminStats` (écran « Administration » de l'app) accepte aussi les collaborateurs `stats.view`. Le droit `admin` existant reste valable. | **Oui.** |
| **D11** | Après suppression définitive d'un compte, le journal garde l'identifiant et le **domaine** de l'e-mail + une empreinte de l'e-mail (pas l'adresse en clair), par minimisation. | **Oui.** |
| **D12** | Copie du journal vers Cloud Logging avec compartiment verrouillé (immuabilité totale, quelques centimes par mois). | **Oui**, en plus de Firestore. |
| **D13** | `brand.ts` n'a pas de champ slogan. Le portail affiche le texte existant `auth.welcome.tagline`. Faut-il ajouter `brand.tagline` ? | Réutiliser le texte existant, **sans** modifier `brand.ts`. |
| **D14** | App Check sur les fonctions `bo…` (protection contre les appels automatisés hors portail). | **Oui**, plus tard (après l'étape 3), car il faut l'activer dans la console. |
| **D15** | Comptes du personnel : adresses dédiées (ex. `prenom@dinerox.app`), distinctes de leurs comptes personnels de l'app. | **Oui**, recommandé. |
| **D16** | Texte « compte suspendu » (§5.3). | À valider tel quel ou à corriger. |
| **D17** | Durée de conservation du journal. | 5 ans (à confirmer avec le juriste). |
