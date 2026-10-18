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
| E1d | **Page d'action des e-mails** (`/action`, D18) | sans connexion, pour TOUS les comptes : choisir un nouveau mot de passe (mot de passe oublié de l'app), confirmer une adresse, confirmer un changement d'adresse, rétablir une adresse ; FR ou EN selon le lien. Un e-mail d'invitation y ouvre l'invitation. Textes : `admin/src/pages/actionTexts.ts` (à valider). | lien valide |
| E1c | **Accepter l'invitation** (lien reçu par e-mail ou copié) | sans connexion : qui invite, pour quel rôle, adresse invitée (masquée), date limite ; l'invité retape son adresse, choisit son mot de passe, accepte → puis E1 + E1b (double vérification). Lien expiré, annulé, déjà utilisé ou remplacé : message clair, aucune donnée affichée. Textes au §1.3. | lien valide |
| E2 | **Tableau de bord** | cartes de chiffres clés (utilisateurs, actifs 7 j, formules, suspendus), courbe des inscriptions, courbe des actifs, répartition des formules, accès rapides (selon les droits), dernières actions du journal (si `audit.view`). | `stats.view` |
| E2b | **Statistiques** | vue détaillée, filtres période et pays : inscriptions, actifs 7 j, comptes par pays, formules, familles, part des méthodes de saisie (statistiques anonymes déjà collectées par l'app). « Voir en tableau » sous chaque graphique. Chiffres agrégés uniquement. | `stats.view` |
| E3 | **Utilisateurs** | recherche exacte (e-mail ou identifiant), filtres (formule, statut, pays), liste paginée par 25, tri par date d'inscription. Bouton « Créer un utilisateur » dans la barre de filtres (si `users.create`). | `users.view` |
| E4 | **Fiche utilisateur** | identité, formule, statut (icône + mot), dates (inscription, dernière activité), espaces (personnel, familles et rôle), appareils (nombre), historique des actions du journal sur ce compte. Actions : Modifier, Changer de formule, Suspendre/Réactiver, Voir les opérations ; zone « Actions irréversibles » isolée en bas : Supprimer définitivement. | `users.view` + permission de chaque action |
| E5 | **Créer un utilisateur** (panneau) | prénom, nom (facultatif), e-mail, pays, devise (préremplie par le pays), langue. Message : « Un lien pour définir le mot de passe sera envoyé à cette adresse. » | `users.create` |
| E6a | **Données** (entrée de la barre) | recherche exacte d'un utilisateur, rappel des règles (motif, journal, lecture seule), bouton « Consulter les opérations » → E6 ; liste de **ses propres** dernières consultations. Raccourci aussi depuis la fiche (E4). | `data.view` |
| E6 | **Consulter les opérations** | 1) fenêtre « Motif de consultation » (liste courte + champ libre si « Autre ») ; 2) liste en lecture seule, par espace, 25 par page, montants au format de l'app. Sur chaque ligne : « Supprimer », **pour le Super Admin seulement** (`data.delete`) ; une Administratrice voit la liste sans aucun bouton de suppression (mention « Consultation seule »). Bandeau permanent : « Consultation enregistrée au journal · motif : … ». Pas d'export, pas de sélection multiple. | `data.view` (+ `data.delete`, Super Admin) |
| E7 | **Supprimer une opération** (fenêtre) | récapitulatif (date, type, montant, espace), liste des **effets liés** calculés par le serveur, motif interne, case « J'ai compris que… », puis 2e confirmation en retapant `SUPPRIMER`. | `data.delete` (Super Admin seulement) |
| E8 | **Équipe** | liste des collaborateurs (rôle, statut, double vérification active, dernière connexion), changer de rôle, suspendre, retirer, réinitialiser la double vérification. **Invitations** : inviter (adresse, nom, rôle), statut *envoyée / acceptée / expirée / annulée*, boutons « Renvoyer », « Annuler », « Copier le lien d'invitation » (pour WhatsApp). Un invité n'a **aucune** permission tant qu'il n'a pas accepté et activé sa double vérification. | `staff.manage` |
| E9 | **Rôles** | rôles fournis (lecture seule) et rôles sur mesure : nom + cases de permissions ; `data.view`, `data.delete` et `staff.manage` **affichées grisées et cadenassées** avec l'explication « Réservé aux rôles Super Admin et Administrateur » (`data.view`) ou « Réservé au rôle Super Admin » (`data.delete`, `staff.manage`). | `staff.manage` (Super Admin) |
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
(`data.view`), « Supprimer » une opération (`data.delete`, Super Admin seulement), zone « Supprimer définitivement »
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

### 1.3 Textes : invitation (validés le 12/10/2026, mot de passe du personnel : 12 caractères au moins)

Le portail est en français ; l'anglais est proposé pour plus tard. `{app}` = nom de marque
(`brand.ts`), `{inviter}`, `{name}`, `{role}`, `{email}`, `{date}` = données de l'invitation.

**Page « Accepter l'invitation » (E1c)**

| Élément | Français | English |
|---|---|---|
| Titre | Rejoindre l'équipe {app} | Join the {app} team |
| Introduction | {inviter} vous invite à rejoindre l'équipe d'administration de {app} avec le rôle {role}. | {inviter} has invited you to join the {app} admin team as {role}. |
| Détail | Invitation pour {email} · valable jusqu'au {date} | Invitation for {email} · valid until {date} |
| Champ adresse | Votre adresse e-mail (celle qui a reçu l'invitation) | Your email address (the one that received the invitation) |
| Champ mot de passe | Choisissez un mot de passe | Choose a password |
| Aide | 12 caractères au moins. Vous seul le connaîtrez. | At least 12 characters. Only you will know it. |
| Confirmation | Confirmez le mot de passe | Confirm the password |
| Bouton | Accepter l'invitation | Accept the invitation |
| Lien discret | Vous n'attendiez pas cette invitation ? Fermez simplement cette page. | Weren't expecting this invitation? Just close this page. |
| Après acceptation | Invitation acceptée. Dernière étape : activez la double vérification pour protéger votre compte. | Invitation accepted. Last step: turn on two-step verification to protect your account. |
| Bouton suivant | Continuer | Continue |
| Lien expiré | Cette invitation a expiré. Demandez à la personne qui vous a invité de vous l'envoyer à nouveau. | This invitation has expired. Ask the person who invited you to send it again. |
| Lien annulé | Cette invitation a été annulée. | This invitation has been cancelled. |
| Déjà utilisé | Cette invitation a déjà été utilisée. Connectez-vous avec votre adresse et votre mot de passe. | This invitation has already been used. Sign in with your email address and password. |
| Lien non valable | Ce lien d'invitation n'est pas valable. Il a peut-être été remplacé par un lien plus récent. | This invitation link isn't valid. It may have been replaced by a newer one. |
| Autre adresse | Cette adresse ne correspond pas à l'invitation. Utilisez l'adresse qui a reçu l'invitation. | This address doesn't match the invitation. Use the address that received it. |
| Mot de passe trop court | Le mot de passe doit contenir au moins 12 caractères. | Your password must be at least 12 characters long. |
| Confirmation différente | Les deux mots de passe ne sont pas identiques. | The two passwords don't match. |

**Écran Équipe (E8)**

| Élément | Français | English |
|---|---|---|
| Bouton | Inviter un collaborateur | Invite a team member |
| Fenêtre : adresse | Adresse e-mail professionnelle | Work email address |
| Aide | Une adresse réservée au travail, différente de son compte personnel {app}. | A work-only address, different from their personal {app} account. |
| Fenêtre : nom / rôle | Nom · Rôle | Name · Role |
| Bouton | Envoyer l'invitation | Send invitation |
| Succès | Invitation envoyée à {email}. Le lien est valable 7 jours. | Invitation sent to {email}. The link is valid for 7 days. |
| Section | Invitations | Invitations |
| Statuts | Invitation envoyée · Acceptée · Expirée · Annulée | Invitation sent · Accepted · Expired · Cancelled |
| Ligne | Envoyée le {date} par {inviter} · expire le {date} | Sent on {date} by {inviter} · expires on {date} |
| Boutons | Renvoyer · Annuler · Copier le lien d'invitation | Resend · Cancel · Copy invitation link |
| Lien copié | Lien copié. Envoyez-le seulement à {name} : il donne accès à l'invitation. | Link copied. Send it only to {name}: it gives access to the invitation. |
| Renvoyée | Nouveau lien envoyé à {email}. L'ancien lien ne fonctionne plus. | A new link has been sent to {email}. The old link no longer works. |
| Annuler : titre | Annuler l'invitation de {name} ? | Cancel {name}'s invitation? |
| Annuler : texte | Le lien ne fonctionnera plus. Vous pourrez inviter cette personne à nouveau. | The link will stop working. You can invite this person again. |
| Annuler : boutons | Garder l'invitation · Annuler l'invitation | Keep invitation · Cancel invitation |
| Annulée | Invitation annulée. | Invitation cancelled. |

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
| `data.delete` | supprimer une opération d'un utilisateur — **réservée au Super Admin, codée en dur** |

### 2.2 Matrice rôles × permissions

✅ autorisé · — refusé · 🔒 refusé et **impossible à attribuer** (codé en dur côté serveur)

| Permission | Super Admin | Administrateur | Support | Analyste | Rôle sur mesure |
|---|:-:|:-:|:-:|:-:|:-:|
| `users.view` | ✅ | ✅ | ✅ | — | au choix |
| `users.create` | ✅ | ✅ | — | — | au choix |
| `users.edit` | ✅ | ✅ | — | — | au choix |
| `users.changePlan` | ✅ | 🔒 | 🔒 | 🔒 | 🔒 *(D8)* |
| `users.suspend` | ✅ | ✅ | ✅ | — | au choix |
| `users.delete` | ✅ | — | — | — | au choix |
| `stats.view` | ✅ | ✅ | — | ✅ | au choix |
| `audit.view` | ✅ | — | — | — | au choix |
| `staff.manage` | ✅ | 🔒 | 🔒 | 🔒 | 🔒 *(D3)* |
| `data.view` | ✅ | ✅ | 🔒 | 🔒 | 🔒 |
| `data.delete` | ✅ | 🔒 | 🔒 | 🔒 | 🔒 |

### 2.3 Règles invariantes (vérifiées par le serveur, testées)

1. `data.view` n'est accordée **que** par les rôles `superAdmin` et `admin` ; `data.delete`,
   `staff.manage` et `users.changePlan` (D8) **uniquement** par `superAdmin`. Ces listes sont écrites en dur dans le serveur :
   le calcul des droits ignore ces codes s'ils figurent dans un autre rôle (y compris `admin`
   pour `data.delete`), et la création ou la modification d'un rôle sur mesure qui les contient
   est **refusée** (et journalisée).
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
| `boLoginStart` | aucune (connexion) | vérifie le **mot de passe côté serveur**, puis que le compte est un collaborateur actif ; renvoie un défi de 5 min (et, au premier passage, le secret à scanner) (§8) |
| `boLoginVerify` | défi valide | code à 6 chiffres **ou** code de secours (usage unique) → session de 12 h + jeton personnalisé portant `boSid` (§8) |
| `boLogout` / `boNewRecoveryCodes` | collaborateur connecté | fermer la session côté serveur ; nouveaux codes de secours (exige un code valide) |
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
| `boListStaff` / `boSetStaffRole` / `boSetStaffSuspended` / `boRemoveStaff` / `boResetStaffMfa` | `staff.manage` | gestion de l'équipe + règles §2.3 (un collaborateur « invité » ne se modifie pas : Renvoyer / Annuler) |
| `boInviteStaff` / `boListInvites` / `boResendInvite` / `boRevokeInvite` / `boGetInviteLink` | `staff.manage` | invitations (§3.4) |
| `boViewInvite` / `boAcceptInvite` | aucune (le jeton du lien fait foi) | page « Accepter l'invitation » (§3.4) |
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

**Texte neutre proposé pour le modèle Firebase « Réinitialisation du mot de passe » (D7, à
valider avant tout changement dans la console).** Ce modèle sert à la fois au « mot de passe
oublié » de l'app et à la création d'un compte par le back-office : il ne doit donc parler ni
d'oubli ni de création. `%APP_NAME%`, `%EMAIL%` et `%LINK%` sont remplis par Firebase (le nom
public du projet, donc pas de nom de marque écrit dans le texte).

- Objet (FR) : `Choisissez votre mot de passe %APP_NAME%`
- Message (FR) :
  > Bonjour,
  >
  > Pour choisir le mot de passe de votre compte %APP_NAME% (%EMAIL%), ouvrez ce lien :
  > %LINK%
  >
  > Ce lien ne fonctionne qu'une fois et pendant une durée limitée. Si vous n'attendiez pas
  > cet e-mail, ignorez-le : rien ne change sur votre compte.
  >
  > L'équipe %APP_NAME%
- Subject (EN): `Choose your %APP_NAME% password`
- Message (EN):
  > Hello,
  >
  > To choose the password for your %APP_NAME% account (%EMAIL%), open this link:
  > %LINK%
  >
  > This link works only once and for a limited time. If you weren't expecting this email,
  > ignore it: nothing changes on your account.
  >
  > The %APP_NAME% team

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

### 3.4 Invitation d'un collaborateur

1. **Inviter** (`boInviteStaff`, Super Admin) : compte Auth **sans mot de passe** (adresse
   dédiée, D15), collaborateur `boStaff` au statut `invited` (**aucune permission**), invitation
   `boInvites` avec un jeton aléatoire de 256 bits **valable 7 jours**. Le jeton est stocké
   haché (pour le vérifier) et chiffré avec `BO_MFA_KEY` (pour « Copier le lien ») ; il n'est
   jamais écrit au journal. Seul un Super Admin invite au rôle `admin` ou `superAdmin`.
2. **E-mail** (modèle Firebase gratuit, D7) : le portail appelle
   `sendPasswordResetEmail(email, { url: lienInvitation })`. Le lien d'invitation
   (`https://<portail>/invitation?i=<id>#t=<jeton>`, jeton dans la partie `#` : jamais envoyé
   à un serveur ni dans un historique de proxy) est le **lien de suite** de l'e-mail. Voir D18.
3. **Accepter** (`boViewInvite` puis `boAcceptInvite`) : l'invité voit qui l'invite et pour quel
   rôle, retape l'adresse invitée, choisit son mot de passe (envoyé directement au serveur, qui
   l'enregistre ; aucun collaborateur ne le voit ni ne le tape). Le jeton est **consommé** dans
   une transaction (usage unique), le collaborateur passe à `active` — toujours sans permission
   tant que la double vérification n'est pas activée à sa première connexion (E1b).
4. **Renvoyer** : nouveau jeton, 7 jours à partir de maintenant ; l'ancien lien est refusé.
   **Annuler** : lien refusé, collaborateur invité retiré, compte Auth créé pour l'invitation
   supprimé (l'adresse peut être réinvitée). **Copier le lien** : le jeton en cours, déchiffré,
   action journalisée — à n'envoyer qu'à la personne invitée (le lien vaut une clé).
5. **Refus journalisés** : lien inconnu, jeton faux ou remplacé, expiré, annulé, déjà utilisé ;
   adresse différente de celle invitée (au 5e essai, l'invitation est annulée d'office) ; rôle
   élevé donné par un non-Super Admin ; Renvoyer/Copier/Annuler une invitation qui ne s'y prête
   pas. Pour une adresse tapée par erreur, le journal ne garde que le domaine et une empreinte.

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
- **Fait (étape 3)** dans `src/store/app.tsx`, sans nouvelle dépendance : au démarrage, au
  retour au premier plan et à chaque retour du réseau, l'app force le renouvellement du jeton
  (`getIdToken(true)`). Si Firebase répond `auth/user-disabled` (`core/accountStatus.ts`),
  l'app affiche une fois le message « Compte suspendu » (fenêtre) puis se déconnecte ; toute
  autre erreur (hors ligne…) ne change rien. Une connexion pendant la suspension affiche
  `auth.err.user-disabled`. Parcours `e2e/suspended.js`. Le cache local du compte est **conservé**
  (rangé par uid, règle 14) : à la réactivation, tout revient, y compris les saisies en attente.
- Délai : en pratique, dès que l'utilisateur ouvre l'app avec du réseau. Au pire, une heure
  pour un téléphone qui resterait ouvert en continu (durée de vie d'un jeton Firebase). Voir D5.

### 5.3 Texte (validé, D16 — ajouté à l'étape 3)

| Clé | Français | English |
|---|---|---|
| `auth.suspended.title` | Compte suspendu | Account suspended |
| `auth.suspended.body` | Votre compte {app} est suspendu : vous ne pouvez plus vous connecter pour le moment. Vos données sont conservées. Pour en savoir plus, écrivez-nous à {email}. | Your {app} account is suspended, so you can't sign in for now. Your data is kept. To find out more, write to us at {email}. |
| `auth.err.user-disabled` *(remplacement)* | Ce compte est suspendu. Écrivez-nous à {email} pour en savoir plus. | This account is suspended. Write to us at {email} to find out more. |

`{email}` s'écrit `{supportEmail}` dans les fichiers de textes : comme `{app}`, il est rempli
automatiquement depuis `brand.supportEmail`. Aucun motif n'est jamais montré à l'utilisateur.

---

## 6. Modèle de données (nouvelles collections)

Toutes **interdites au client** (lecture et écriture) — sauf `accountStatus`, lisible par son
seul propriétaire si D5 retient la variante « lecture ». Écrites uniquement par les Functions.

| Collection | Document | Champs principaux |
|---|---|---|
| `boInvites/{id}` | invitation | `email`, `displayName`, `roleId`, `uid`, `createdAuthUser`, `invitedBy`, `invitedByName`, `status` (`sent`/`accepted`/`revoked` ; « expirée » = `sent` dont `expiresAt` est passé), `tokenHash`, `tokenEnc`, `sentAt`, `expiresAt`, `acceptedAt`, `revokedAt`, `revokedBy`, `failedAttempts` |
| `boStaff/{uid}` | collaborateur | `email`, `displayName`, `roleId`, `status` (`invited`/`active`/`suspended`), `mfa` { `enrolled`, `secretEnc`, `recoveryHashes[]`, `failedCount`, `lockedUntil` }, `createdAt`, `createdBy`, `lastLoginAt` |
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

- **Mot de passe ET code sont vérifiés par le serveur** (`boLoginStart`, `boLoginVerify`) : le
  serveur voit donc chaque essai, le compte et le journalise. Le portail se connecte ensuite à
  Firebase avec un jeton personnalisé qui porte l'identifiant de session `boSid` ; une connexion
  directe à Firebase (sans passer par le portail) n'ouvre **aucun** droit.
- 1re connexion au portail : QR code → saisie d'un code → 8 codes de secours affichés une fois
  (stockés hachés avec la clé `BO_MFA_KEY`, comme le secret, chiffré AES-256-GCM).
- Chaque connexion : mot de passe puis code → `boSessions/{uid}` valable 12 h ; une nouvelle
  connexion remplace la session précédente ; un même code n'est jamais accepté deux fois.
- **Essais limités par compte** : 5 échecs (mot de passe, défi ou code, cumulés) → verrou
  15 min, sur l'adresse tentée (pas sur l'IP), y compris pour une adresse inconnue (rien ne
  révèle quels comptes existent). Chaque refus est une ligne `denied` au journal ; pour une
  adresse qui n'est pas celle d'un collaborateur, seuls le domaine et une empreinte sont gardés.
- Limite connue : quelqu'un qui essaie des mots de passe directement auprès de Firebase Auth
  (sans le portail) n'est pas compté par notre verrou (Firebase applique sa propre limite) et ne
  laisse pas de ligne au journal ; il n'obtient de toute façon aucun accès sans le code. Un Super Admin peut réinitialiser la double
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

**Aucun fichier de clé de compte de service** : le script utilise ton compte Google, connecté
dans le Terminal (identifiants « Application Default Credentials »). Ton compte doit avoir les
droits sur le projet `dinerox-app` (propriétaire, ou au moins Firebase Admin).

```bash
gcloud auth application-default login                          # ouvre le navigateur, une fois
gcloud auth application-default set-quota-project dinerox-app   # requis par l'API d'authentification
cd dinerox/firebase/functions
npm run build
GOOGLE_CLOUD_PROJECT=dinerox-app node lib/scripts/createSuperAdmin.js prenom@dinerox.app "Prénom Nom"
```

Options : `--reset-mfa` (Super Admin existant qui a perdu son appli d'authentification),
`--shared` (accepter une adresse qui a déjà un compte personnel dans l'app — déconseillé, D15),
`--emulator` (obligatoire quand `FIRESTORE_EMULATOR_HOST` est défini, interdit sinon).
À la fin : `gcloud auth application-default revoke` si tu ne veux pas garder ces identifiants.

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
  `auth.welcome.tagline` (« Mieux gérer. Mieux prévoir. Mieux vivre. ») : `brand.ts` n'a pas de champ
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
2. `data.view` : refusée à tout rôle autre que `superAdmin`/`admin`. `data.delete` et
   `staff.manage` : refusées à tout rôle autre que `superAdmin`, **Administrateur compris**
   (`boPreviewDelete` et `boDeleteTransaction` appelés par un admin → refus journalisé, aucune
   écriture). Un rôle sur mesure qui les contiendrait est refusé à la création ; et si l'on force
   un tel document en base (ou qu'on ajoute `data.delete` au document du rôle `admin`), le calcul
   des droits les ignore.
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
11. **Invitations** : statut `invited` sans permission (même avec une session forgée) et non
    activable à la main ; parcours complet (voir qui invite et le rôle, accepter avec
    l'adresse invitée, mot de passe choisi, double vérification, puis permissions) ; usage
    unique ; lien expiré, annulé, remplacé par « Renvoyer », inconnu ; autre adresse (5e essai
    = annulation) ; rôle élevé par un non-Super Admin ; jeton jamais stocké ni journalisé en
    clair ; chaque refus journalisé (`tests/backoffice/invites.test.ts`).
12. `npm run check`, `npm run test:rules`, `npm --prefix firebase/functions run typecheck`,
    compilation des Functions : verts, lint à zéro.

### Étape 3 — portail et app (fait)

- `admin/e2e/portal.mjs` (émulateurs Auth, Firestore, Functions) : 63 vérifications — connexion
  (refus clairs, activation, codes de secours), barre latérale et page d'accueil de chaque rôle,
  « accès refusé », suspension/réactivation, opérations avec motif (Administratrice : aucun
  bouton « Supprimer »), suppression avec effets liés (Super Admin), journal, invitation complète
  (copier, accepter, mot de passe de 12 caractères, double vérification, lien déjà utilisé,
  annulation), création d'un utilisateur, page d'action (resetPassword EN, verifyEmail FR,
  verifyAndChangeEmail, recoverEmail EN, lien non valable, invitation par e-mail), thème sombre,
  ordinateur / tablette / téléphone sans défilement horizontal, tiroir qui se referme.
- `npm --prefix admin run check` : types + tests unitaires (aucun import de Firestore, aucune
  marque écrite en dur, liens d'invitation, textes FR/EN de la page d'action).
- App : `e2e/suspended.js` (message D16, déconnexion, refus de connexion, réactivation sans perte).

Liste d'origine :

- Bout en bout sur l'export web + émulateurs (style `e2e/`) : connexion + code, chaque écran,
  chaque action, refus visibles, états vide/erreur. Une Administratrice ouvre les opérations
  (motif demandé, journal) et **ne voit aucun bouton « Supprimer »**.
- App : un compte suspendu pendant qu'il est connecté → déconnecté au retour réseau avec le
  message validé ; réactivé → reconnexion, données intactes.
- Captures d'écran clair et sombre, ordinateur / tablette / téléphone ; contrôle clavier et
  contrastes AA.

---

## 14. Décisions (validées le 12/10/2026)

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

**Réponses du fondateur (12/10/2026)** — maquette à barre latérale validée.

| # | Décision |
|---|---|
| D1 | **Oui.** Commit séparé, comportement de l'app identique ; `npm run check` et tous les parcours e2e verts avant et après. |
| D2 | **Oui.** Plus un test prouvant que l'app accepte le refus : synchronisation non bloquée, pas de nouvel essai en boucle, pas de message incompréhensible. |
| D3 | **Oui.** |
| D4 | **Oui, option B** : TOTP dans nos Functions, essais limités, codes de secours. |
| D5, D6 | **Oui.** |
| D7 | **Oui**, mais le texte neutre de l'e-mail est montré au fondateur avant tout changement dans la console (proposition au §3.1). |
| D8 | **Oui** : date de fin obligatoire, Super Admin seulement, journalisé. |
| D9 à D13, D15 | **Oui**, comme proposé. |
| D14 | **Oui**, après l'étape 3. |
| D16 | Texte du §5.3 **validé tel quel**. |
| D17 | 5 ans, à confirmer plus tard avec un juriste. |
| Matrice | **Correction : `data.delete` = Super Admin SEULEMENT.** L'Administrateur garde `data.view` (consulter, avec motif et journal) mais ne supprime pas (§2.2, §2.3, E6/E7, maquette, §13 mis à jour). |

---

## 15. Étape 2 — ce qui existe et comment le vérifier

**Fichiers** : `firebase/functions/src/backoffice/` (`permissions.ts`, `totp.ts`, `auditCore.ts`
purs ; `context.ts` garde-fou + journal ; `login.ts`, `users.ts`, `data.ts`, `staff.ts`,
`stats.ts` ; miroirs `removal.ts`, `profile.ts`, `registry.ts`), `accountDeletion.ts` (logique
unique de suppression de compte, utilisée par `deleteAccount` et `boDeleteUser`),
`scripts/createSuperAdmin.ts`, règles et index Firestore. Côté app : `src/core/removal.ts` (D1).

**Tests** (aucun ne touche `dinerox-app`) :

```bash
npm run check                 # types + lint + tests purs (matrice, codes, journal, parité app ↔ serveur, D2)
npm run test:rules            # règles Firestore sur l'émulateur
npm run test:backoffice       # Functions bo… + moteur de synchro de l'app sur émulateurs Auth/Firestore/Storage
npm --prefix firebase/functions run typecheck
```

Les émulateurs demandent Java 21 ou plus (`JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home`).

## 16. Mise en ligne sur `dinerox-app` — plan pas à pas (16.0 à 16.11 faites le 13/10/2026)

> **État au 13/10/2026** — compte rendu détaillé : §16.17. Faites : 16.0 à 16.11, sur la base
> européenne (docs/migration-europe.md). **16.12 bloquée par Firebase** (modification des modèles
> d'e-mail refusée pour ce projet, demande envoyée à l'assistance Firebase). 16.13 : plus tard,
> avec un test réel du « mot de passe oublié » sur le téléphone du fondateur.

Ordre à suivre. Rien ne part sans ton feu vert, étape par étape. « Moi » = Claude, « toi » =
le fondateur (les commandes qui touchent `dinerox-app` sont lancées par toi, depuis ton Mac,
dans `/Users/novaworkonline/dinerox-backoffice/dinerox`, avec ton compte : `firebase login`).

**Coûts, en résumé.** Le projet est déjà en formule Blaze (il a déjà des Cloud Functions).
Tout ce qui suit reste dans les quotas gratuits pour une petite équipe, sauf deux postes de
quelques centimes : Secret Manager (au-delà de 6 versions de secret actives gratuites, environ
0,06 $ par version et par mois ; le projet en a déjà 2) et le stockage des images des Functions
(Artifact Registry, environ 0,10 $ par Go et par mois au-delà de 0,5 Go gratuit). *Tarifs publics
Google Cloud, à revérifier sur leurs pages au moment de la mise en ligne.*

**Compatibilité.** Les règles et les Functions peuvent partir AVANT la nouvelle version de
l'app : aucune app existante n'écrit `adminDeleted`, et une app existante réagit déjà
correctement à un refus d'écriture. Une suspension marche aussi avec l'ancienne app (connexion
refusée par Firebase) ; seul le message D16 demande la nouvelle version (§16.3).

### 16.0 Préparation (moi)

| | |
|---|---|
| Quoi | Fusionner la dernière `dinerox-main` dans `backoffice` ; relancer `npm run check`, `npm run test:rules`, `npm run test:backoffice`, tous les e2e de l'app et du portail ; vérifier que le code des Functions de `backoffice` contient TOUT ce qui tourne aujourd'hui en production (voir 16.2). |
| Coût | Aucun. |
| Vérifier | Tous les tests verts, compte rendu envoyé. |
| Revenir en arrière | Sans objet (rien n'est en ligne). |

### 16.1 Sauvegarde (toi, conseillé)

| | |
|---|---|
| Quoi | Exporter Firestore avant tout changement : `gcloud firestore export gs://dinerox-app-sauvegardes/avant-backoffice --project dinerox-app` (créer le compartiment s'il n'existe pas). Rien de ce qui suit ne modifie les données, mais c'est la précaution d'usage. |
| Coût | Une lecture facturée par document exporté + le stockage (quelques centimes pour une base de cette taille). |
| Vérifier | `gcloud firestore operations list --project dinerox-app` : opération « SUCCESSFUL ». |
| Revenir en arrière | Sans objet (une sauvegarde ne change rien). |

### 16.2 État actuel de la production (toi + moi)

| | |
|---|---|
| Quoi | Toi : console › Firestore › Règles, copier les règles en ligne dans un fichier et me l'envoyer ; `firebase functions:list --project dinerox-app` et m'envoyer le résultat. Moi : comparer avec `backoffice`. Les règles se déploient en bloc : si la production contient une règle qui n'est pas dans `backoffice` (venue d'une autre branche), je l'ajoute d'abord, sinon elle disparaîtrait. |
| Coût | Aucun. |
| Vérifier | Je confirme par écrit : « seules les additions du back-office diffèrent ». |
| Revenir en arrière | Sans objet. |

### 16.3 Clé de chiffrement `BO_MFA_KEY` (toi)

| | |
|---|---|
| Quoi | `openssl rand -base64 32 \| firebase functions:secrets:set BO_MFA_KEY --data-file=- --project dinerox-app` — la clé n'est affichée nulle part et n'est jamais dans Git. **Ne jamais la détruire tant que le portail sert** : sans elle, plus aucune double vérification ne fonctionne (il faudrait réinitialiser chaque collaborateur). |
| Coût | Environ 0,06 $/mois si le projet dépasse 6 versions de secret actives. |
| Vérifier | `gcloud secrets versions list BO_MFA_KEY --project dinerox-app` : une version « enabled ». |
| Revenir en arrière | Après retrait des fonctions `bo…` : `firebase functions:secrets:destroy BO_MFA_KEY --project dinerox-app`. |

### 16.4 Clé d'API web publique `BO_WEB_API_KEY` (toi)

| | |
|---|---|
| Quoi | Créer `firebase/functions/.env.dinerox-app` contenant `BO_WEB_API_KEY=<clé web>` (la même que `EXPO_PUBLIC_FIREBASE_API_KEY` de l'app : elle est publique). Fichier ignoré par Git. Elle sert au serveur à vérifier un mot de passe. |
| Coût | Aucun. |
| Vérifier | `git check-ignore firebase/functions/.env.dinerox-app` affiche le chemin. |
| Revenir en arrière | Supprimer le fichier. |

### 16.5 Droit de créer les jetons de connexion (toi)

| | |
|---|---|
| Quoi | Le compte de service des Functions doit pouvoir signer les jetons du portail. `gcloud services enable iamcredentials.googleapis.com --project dinerox-app`, puis (NUMÉRO = numéro du projet, console › Paramètres du projet) : `gcloud iam service-accounts add-iam-policy-binding NUMÉRO-compute@developer.gserviceaccount.com --member=serviceAccount:NUMÉRO-compute@developer.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator --project dinerox-app` |
| Coût | Aucun. |
| Vérifier | `gcloud iam service-accounts get-iam-policy NUMÉRO-compute@developer.gserviceaccount.com --project dinerox-app` montre le rôle. Vérifié pour de bon à l'étape 16.10 (connexion au portail). |
| Revenir en arrière | Même commande avec `remove-iam-policy-binding`. |

### 16.6 Index Firestore (toi)

| | |
|---|---|
| Quoi | `firebase deploy --only firestore:indexes --project dinerox-app`. Si la commande propose de supprimer des index absents du fichier, répondre **non**. |
| Coût | Construction gratuite ; stockage des index négligeable. |
| Vérifier | Console › Firestore › Index : les nouveaux index (users, accountStatus, boStaff, boAudit) passent à « Activé » (quelques minutes). |
| Revenir en arrière | Inutile en pratique (un index inutilisé ne gêne rien) ; sinon les supprimer dans la console. |

### 16.7 Règles Firestore (toi)

| | |
|---|---|
| Quoi | Après 16.2 : `firebase deploy --only firestore:rules --project dinerox-app`. Ajouts : collections du back-office fermées à tout client, et `adminDeleted` (une opération supprimée par le back-office ne peut plus être réécrite par un téléphone). |
| Coût | Aucun. |
| Vérifier | Console › Règles : la nouvelle version contient `match /boStaff`. Sur ton téléphone : ajouter une opération, la modifier, la supprimer ; tout se synchronise sur un second appareil. |
| Revenir en arrière | Console › Firestore › Règles › historique : « Restaurer » la version précédente (immédiat). |

### 16.8 Cloud Functions (toi)

| | |
|---|---|
| Quoi | Déployer SEULEMENT les nouvelles fonctions et les deux modifiées (`adminStats` : D10 ; `deleteAccount` : même comportement, code mis en commun), sans toucher aux autres : `firebase deploy --only functions:boLoginStart,functions:boLoginVerify,functions:boLogout,functions:boMe,functions:boNewRecoveryCodes,functions:boChangePassword,functions:boSearchUsers,functions:boListUsers,functions:boGetUser,functions:boCreateUser,functions:boUpdateUser,functions:boSetPlan,functions:boSetSuspended,functions:boDeleteUser,functions:boOpenData,functions:boListTransactions,functions:boPreviewDelete,functions:boDeleteTransaction,functions:boMyDataAccess,functions:boListStaff,functions:boInviteStaff,functions:boListInvites,functions:boResendInvite,functions:boGetInviteLink,functions:boRevokeInvite,functions:boViewInvite,functions:boAcceptInvite,functions:boSetStaffRole,functions:boSetStaffSuspended,functions:boRemoveStaff,functions:boResetStaffMfa,functions:boListRoles,functions:boSaveRole,functions:boDeleteRole,functions:boStats,functions:boListAudit,functions:boStatsSnapshot,functions:adminStats,functions:deleteAccount --project dinerox-app` |
| Coût | Appels : gratuits jusqu'à 2 millions/mois ; aucune instance permanente (0 au repos). `boStatsSnapshot` (toutes les heures) ajoute une tâche planifiée : 3 tâches gratuites par compte, le projet en utilise 1 (`weeklySummaryPush`). Stockage des images : quelques centimes. |
| Vérifier | `firebase functions:list --project dinerox-app` : les fonctions `bo…` en `europe-west1`. Dans l'app : écran « Administration » (droit admin) toujours bon ; supprimer un compte de TEST depuis l'app : tout disparaît comme avant. |
| Revenir en arrière | `firebase functions:delete boLoginStart boLoginVerify boLogout boMe boNewRecoveryCodes boChangePassword boSearchUsers boListUsers boGetUser boCreateUser boUpdateUser boSetPlan boSetSuspended boDeleteUser boOpenData boListTransactions boPreviewDelete boDeleteTransaction boMyDataAccess boListStaff boInviteStaff boListInvites boResendInvite boGetInviteLink boRevokeInvite boViewInvite boAcceptInvite boSetStaffRole boSetStaffSuspended boRemoveStaff boResetStaffMfa boListRoles boSaveRole boDeleteRole boStats boListAudit boStatsSnapshot --region europe-west1 --project dinerox-app`, puis redéployer les versions d'avant de `adminStats` et `deleteAccount` depuis le dossier `dinerox-main` : `firebase deploy --only functions:adminStats,functions:deleteAccount --project dinerox-app`. |

### 16.9 Premier Super Admin (toi)

| | |
|---|---|
| Quoi | Commande du §10 (compte Google du Terminal, aucun fichier de clé), avec une adresse dédiée (ex. `prenom@dinerox.app`, D15). Elle affiche un lien à ouvrir pour choisir ton mot de passe (12 caractères au moins). |
| Coût | Aucun. |
| Vérifier | Le script affiche « Super Admin créé. » ; console › Firestore : document `boStaff/<ton uid>` ; ligne `staff.bootstrap` dans `boAudit`. |
| Revenir en arrière | Console : supprimer `boStaff/<uid>` (et le compte dans Authentication si besoin). Le journal garde la trace, c'est voulu. |

### 16.10 Portail en ligne (toi)

| | |
|---|---|
| Quoi | `firebase hosting:sites:create dinerox-admin --project dinerox-app` ; `firebase target:apply hosting admin dinerox-admin --project dinerox-app` (ajoute la cible dans `.firebaserc` : je la committerai) ; créer `admin/.env.production.local` avec `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN=dinerox-app.firebaseapp.com`, `VITE_FIREBASE_PROJECT_ID=dinerox-app`, `VITE_FIREBASE_APP_ID` (config web, console › Paramètres du projet) ; `npm --prefix admin ci && npm --prefix admin run build` ; `firebase deploy --only hosting:admin --project dinerox-app`. |
| Coût | Hébergement : gratuit jusqu'à 10 Go stockés et 10 Go transférés par mois (le portail fait moins de 2 Mo). |
| Vérifier | Ouvrir `https://dinerox-admin.web.app` : page de connexion. `curl -sI https://dinerox-admin.web.app \| grep -i -E "content-security\|x-frame"` montre les en-têtes de sécurité. Se connecter en Super Admin : QR code, code, codes de secours, tableau de bord. |
| Revenir en arrière | Console › Hosting › site `dinerox-admin` › historique : revenir à une version, ou `firebase hosting:disable --site dinerox-admin --project dinerox-app` (le site ne répond plus ; les données ne bougent pas). |

### 16.11 Domaine autorisé (toi)

| | |
|---|---|
| Quoi | Console › Authentication › Paramètres › Domaines autorisés : ajouter `dinerox-admin.web.app` (sinon les e-mails d'invitation ne peuvent pas renvoyer vers le portail). |
| Coût | Aucun. |
| Vérifier | Inviter une adresse de test depuis « Équipe et rôles » : l'e-mail arrive (voir 16.12 pour le texte). |
| Revenir en arrière | Retirer le domaine de la liste. |

### 16.12 Texte neutre de l'e-mail (D7, toi)

| | |
|---|---|
| Quoi | Console › Authentication › Modèles › « Réinitialisation du mot de passe » : objet et message validés (§3.1), en français et en anglais. Garde une copie de l'ancien texte. |
| Coût | Aucun (modèle Firebase gratuit). |
| Vérifier | « Mot de passe oublié » depuis l'app sur un compte de test : le nouveau texte arrive. |
| Revenir en arrière | Recoller l'ancien texte. |

### 16.13 URL d'action personnalisée (D18, toi avec moi)

| | |
|---|---|
| Quoi | Console › Authentication › Modèles › « Personnaliser l'URL d'action » : `https://dinerox-admin.web.app/action`. Juste après, **test réel** du « mot de passe oublié » depuis l'app (recevoir l'e-mail, ouvrir le lien, choisir un mot de passe, se connecter dans l'app), puis une invitation de test. |
| Coût | Aucun. |
| Vérifier | Le lien de l'e-mail ouvre la page du portail (logo, texte validé), le nouveau mot de passe marche dans l'app ; un e-mail d'invitation ouvre directement l'invitation. |
| Revenir en arrière | Même écran : vider le champ (ou remettre `https://dinerox-app.firebaseapp.com/__/auth/action`), enregistrer. Les e-mails suivants repassent par la page Firebase. |

### 16.14 Plus tard, séparément

- **D12** — copie verrouillée du journal (Cloud Logging, conservation 5 ans, D17) : le
  verrouillage est irréversible ; coût de quelques centimes par mois. À décider à part.
- **D14** — App Check sur les fonctions `bo…` (après la mise en ligne).

### 16.15 L'app : faire arriver le message « compte suspendu »

| Étape | Qui | Détail |
|---|---|---|
| a. Reporter dans `dinerox-main` | moi | Dans le dossier `/Users/novaworkonline/dinerox-main` : `git cherry-pick a3eac67` (D1) et `770bea9` (message « compte suspendu » + D5 + parcours `e2e/suspended.js`), puis `npm run check` et tous les e2e à 0 échec, puis push. Aucun coût. Retour arrière : `git revert` des deux commits. |
| b. Reporter dans `design-v2` | la session `design-v2` (ou moi quand elle sera terminée) | `design-v2` est ouverte dans `/Users/novaworkonline/DineroX` par une autre session : je n'y change pas de branche. Fusion de `dinerox-main` dans `design-v2` quand c'est possible, puis tests. |
| c. Nouvelle version de l'app | toi | Depuis la branche qui sera publiée (ex. `design-v2` une fois validée) : `npx eas build` (Android et iOS) puis publication sur les stores. Coût : celui de tes builds EAS habituels (formule gratuite ou payante selon ton compte) ; aucun coût Google. |
| d. Vérifier | toi | Sur un téléphone avec la nouvelle version, connecté à un compte de test : le suspendre depuis le portail, couper puis remettre le réseau → message « Compte suspendu » puis déconnexion ; le réactiver → reconnexion, données intactes. |
| Retour arrière | toi | Repasser à la version précédente sur les stores. Le portail et les suspensions continuent de fonctionner (l'ancienne app affiche alors seulement l'ancien message de connexion refusée). |

### 16.16 Page d'action des e-mails (D18)

`admin/src/pages/Action.tsx`, à l'adresse `/action` du portail. Modes gérés : `resetPassword`
(mot de passe oublié : 8 caractères au moins, règle de l'app), `verifyEmail`,
`verifyAndChangeEmail`, `recoverEmail` (avec un bouton pour recevoir un lien de nouveau mot de
passe) ; lien non valable ou mode inconnu : message clair. Langue : paramètre `lang` ajouté par
Firebase, sinon celle du navigateur (français par défaut). Un e-mail d'invitation
(`resetPassword` dont le lien de suite est `/invitation`) ouvre directement l'invitation. Le code
Firebase n'est utilisé qu'une fois, même si la page est rouverte. Testé de bout en bout
(`admin/e2e/portal.mjs`), en français et en anglais. Textes : `admin/src/pages/actionTexts.ts`
(validés le 12/10/2026).

Un collaborateur qui choisit par « mot de passe oublié » un mot de passe de moins de 12
caractères ne peut pas entrer dans le portail : la connexion le refuse avec un message lui
demandant d'en choisir un autre (journalisé). Depuis le portail, « Réglages › Mot de passe »
impose 12 caractères et demande le code du moment.

**Nouvelle décision (12/10/2026)**

| # | Question | Proposition |
|---|---|---|
| D18 | **E-mail d'invitation — accord du 12/10/2026, à trois conditions : tous les modes gérés (FR/EN, testés), réglage de la console seulement au déploiement avec le fondateur suivi d'un test réel, retour arrière documenté (§16)** | Le modèle Firebase « mot de passe » (D7) porte le lien d'invitation comme *lien de suite*. Mais le lien de l'e-mail lui-même passe d'abord par la page Firebase, et le code qu'il contient **expire au bout d'une heure** (durée fixée par Firebase). **Recommandé** : dans la console (Authentication › Modèles › URL d'action), faire pointer les liens des e-mails vers une page du portail ; elle ouvre directement l'invitation, **valable 7 jours** grâce à notre propre jeton, et sert aussi de page « nouveau mot de passe » pour l'app (même texte, à la marque). Sans ce réglage, le lien de l'e-mail ne marche qu'une heure ; « Copier le lien » reste valable 7 jours. Réglage à faire par toi au déploiement. |

### 16.17 Compte rendu de la mise en ligne — 13/10/2026

Commandes lancées par le fondateur une à une, vérifiées en lecture seule après chacune. Heures GMT.

| Étape | Résultat |
|---|---|
| 16.0 | `dinerox-main` incluse dans `backoffice` ; Functions et règles de `backoffice` = production + ajouts. |
| 16.1 | Sauvegardes `2026-10-13-avant-demenagement` et `2026-10-13-jour-j` (déménagement, migration-europe.md §11). |
| 16.2 | Règles en ligne = `dinerox-main` ; écart avec `backoffice` = additions seules (`adminDeleted`, collections `bo…`) ; 11 Functions en ligne toutes présentes dans le code ; `speak` existe dans le code mais n'est pas déployée (et ne l'a pas été). |
| 16.3 | Secret `BO_MFA_KEY` version 1 active. |
| 16.4 | `firebase/functions/.env.dinerox-app` (ignoré par Git) : `BO_WEB_API_KEY` (clé web publique) et `ELEVENLABS_VOICE_ID=a-remplacer` (même valeur que la production ; ne sert qu'à `speak`). |
| 16.5 | API IAM Credentials déjà active ; rôle `serviceAccountTokenCreator` donné au compte `653588987819-compute@…` sur lui-même. |
| 16.6 | 13 index (3 + 10 du back-office) `READY` à 12:13 ; 2 exceptions de champ conservées. |
| 16.7 | Règles `19fca60e…` publiées à 12:12 (identiques au fichier) ; version précédente `e3a1d04c…` dans l'historique. Test sur téléphone : ajout, modification, suppression synchronisés. |
| 16.8 | 37 fonctions `bo…` créées + `adminStats` et `deleteAccount` mises à jour (48 fonctions actives) ; tâche `boStatsSnapshot` toutes les heures. Écran « Administration » non testable (aucun compte n'a le droit `admin`) ; `deleteAccount` à vérifier plus tard avec un compte de test créé depuis le portail. |
| 16.9 | Super Admin `admin.dinerox@gmail.com` (nom affiché « Super Admin », aucun profil dans l'app, D15) ; mot de passe choisi ; journal `staff.bootstrap`. |
| 16.10 | Site `dinerox-admin` (cible `admin`, `.firebaserc`), portail construit avec la configuration web de `dinerox-app` (`admin/.env.production.local`, ignoré par Git) et publié à 14:18. En-têtes de sécurité présents. Première connexion : double vérification enrôlée (`auth.mfa-enrolled`), tableau de bord affiché. |
| 16.11 | `dinerox-admin.web.app` ajouté aux domaines autorisés (API Identity Toolkit, liste complète réécrite). |
| 16.12 | Nom public du projet changé de `project-653588987819` en « DineroX » (console). **Modèle d'e-mail : refusé par Firebase** (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` par l'API ; « mise à jour des modèles impossible pour ce projet » dans la console, langue du modèle comprise). Rien n'a changé. Demande envoyée à l'assistance Firebase le 13/10/2026. Texte bilingue validé (choix A : français puis anglais dans le même e-mail, Firebase n'acceptant qu'un texte) et copie de l'ancien modèle dans `~/dinerox-mesures/` (hors dépôt). |

**Incidents et corrections :**
- Au premier déploiement des Functions, une clé d'API ElevenLabs a été saisie à la place de
  `ELEVENLABS_VOICE_ID`. Corrigé le jour même : valeur remise à `a-remplacer`, fonctions
  redéployées, les 39 anciennes révisions qui la contenaient supprimées (vérifié : 0 restante),
  nouvelle clé enregistrée dans le secret
  `ELEVENLABS_API_KEY` (version 2 ; version 1 désactivée). Suppression de l'ancienne clé chez
  ElevenLabs : à confirmer par le fondateur. **Règle : un identifiant de voix
  n'est jamais une clé ; une clé ne se saisit que par `functions:secrets:set`.**
- Le lien de définition du mot de passe du Super Admin a été affiché dans la conversation ; il a
  été consommé aussitôt (mot de passe choisi), donc inutilisable.

**En attendant la réponse de l'assistance :** les e-mails envoyés par le portail (création
d'utilisateur, invitation) partent avec le texte Firebase standard, en français (langue du
portail) ; « Copier le lien » (invitation valable 7 jours) reste le moyen le plus fiable
d'inviter un collaborateur. 16.13 se règle sur le même écran de la console : elle pourrait être
bloquée de la même façon.
