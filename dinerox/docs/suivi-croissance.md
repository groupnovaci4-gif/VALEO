# Suivi — Moteur de croissance (développement depuis `dinerox-main`)

Statuts autorisés : ⬜ À faire · 🟨 En cours · 🟧 Codé, non testé · 🟦 Testé
automatiquement · 📱 À vérifier sur téléphone · ⛔ Bloqué · ✅ Validé par le
fondateur (uniquement après son message « Étape N validée »).

| Étape | Fonctionnalité | Statut | Validé par le fondateur |
|---|---|---|---|
| 1 | Parrainage (+ socle des liens DineroX) | 📱 À vérifier sur téléphone (test final unique) — testé automatiquement et déployé ; parties ⛔ ci-dessous | |
| 2 | Bouton « Partager sur WhatsApp » | 📱 À vérifier sur téléphone (test final unique) — testé automatiquement ; chaîne ⛔ (pas encore d'adresse, ligne cachée) | |
| 3 | Tontine partagée (Lot T2) | 📱 À vérifier sur téléphone (test final unique, 3 téléphones) — testé automatiquement ; serveur déployé et vérifié en ligne | |
| 4 | Demande d'avis Google Play / App Store | 📱 À vérifier sur téléphone (test final unique) — testé automatiquement ; vraie fenêtre Google : piste « test interne » après les 5 étapes ; rien côté serveur | |
| 5 | Origine des installations (liens tracés par canal) | 🟦 Testé automatiquement — serveur NON déployé (règles, `recordSignupOrigin`, `adminOriginStats`) ; `link` et Hosting attendent le domaine ; 📱 test final | |

## Détail de l'étape 1

| Élément | Statut | Preuve / note |
|---|---|---|
| Codes (6 caractères lisibles, uniques, créés par le serveur) | 🟦 | `tests/referral.test.ts`, `tests/functions`, `e2e/referral.js` |
| Application d'un code : inscription, réglages (7 jours), lien `/i/{code}` | 🟦 | idem (web) |
| Referrer Google Play au premier lancement (Android) | 🟦 lecture simulée · 📱 réel | exige une installation depuis le Play Store : ⛔ application non publiée |
| Anti-triche (soi-même, appareil du parrain, appareil déjà filleul, code inconnu, une fois) | 🟦 | fonctions réelles sur émulateurs |
| Semaine régulière (5/7 jours, 5 dépenses, 1 revenu, 2 objectifs, 30 jours, exclusions) | 🟦 | unitaires + déclencheurs réels |
| Récompense parrain : 5 validés = 1 mois, filleul rien, plafond, report, ambassadeur | 🟦 | unitaires + émulateurs (dont passage de nuit) |
| « Plus offert » lu par `effectivePlan` (application et serveur) | 🟦 | unitaires |
| Règles Firestore (aucune écriture client du parrainage) | 🟦 | 44 tests de règles (mutation vérifiée) |
| Écran « Inviter des amis », carte « Votre semaine », carte de l'accueil, admin | 🟦 web · 📱 natif | `e2e/referral.js` (31 vérifications) |
| Message dans l'application (« 1/5 ») | 🟦 | `e2e/referral.js` |
| Notification push au parrain | 📱 | non vérifiable sur le web |
| Partage (feuille du téléphone) | 📱 | « Copier » testé ; « Partager » natif à vérifier |
| Page de redirection (Android / iPhone / ordinateur + QR) | 🟦 émulateur · ⛔ en ligne | domaine `dinerox.app` acheté le 2026-10-14 par le fondateur, à brancher sur Firebase Hosting ; `link` non déployée |
| Ouverture directe de l'application par le lien (App Links) | ⛔ | `assetlinks.json` : empreinte SHA-256 de la clé Play attendue |
| Secret `REFERRAL_DEVICE_PEPPER` en production | ✔ créé | version 1, créé par le fondateur le 2026-10-14 ; ne change plus jamais |
| Déploiement en production | ✔ fait | 2026-10-14 depuis `dinerox-main` : index (READY), règles (`94f5e5ca…`), 7 fonctions ; `link` et le site des liens NON déployés |
| Nettoyage du parrainage à la suppression d'un compte | ⛔ en ligne | `deleteAccount` et `boDeleteUser` en production = ancienne version : redéploiement à proposer |

## Détail de l'étape 2

| Élément | Statut | Preuve / note |
|---|---|---|
| Liens WhatsApp (encodage, `src=whatsapp`), repli feuille de partage | 🟦 | `tests/share.test.ts` |
| Inviter des amis : « Partager sur WhatsApp » | 🟦 web · 📱 WhatsApp réel | `e2e/share.js` |
| Trophée partagé en image (sans nom ni montant) | 🟦 web (PNG) · 📱 statut/discussion | `e2e/share.js`, carte vérifiée |
| Chaîne WhatsApp (menu Plus) | 🟦 · ⛔ | ligne cachée tant que l'adresse n'existe pas |
| Déclarations WhatsApp (Android, iPhone) | 🟦 | plugin testé + manifeste généré vérifié |
| `share_clicked` sans contenu | 🟦 | `tests/share.test.ts` |
| Défi 30 jours | — | n'existe pas dans l'application |

## Détail de l'étape 3

| Élément | Statut | Preuve / note |
|---|---|---|
| Créer (Plus/Family), inviter (aperçu sans membres, cotisation si cochée) | 🟦 | unitaires, émulateurs, `e2e/tontine-group.js` |
| Rejoindre : demande + validation de l'organisateur, gratuit | 🟦 | idem |
| Parrainage par l'organisateur (nouveau compte sans parrain ; existant inchangé) | 🟦 | émulateurs + e2e |
| Tirage unique, ordre, trésorier unique | 🟦 | idem |
| Paiements : déclaration, confirmation (historique : qui), contestation | 🟦 | idem |
| Statuts selon la personne (« en retard » : gestionnaires + intéressé) | 🟦 | parité + e2e (horloge décalée) |
| Opération réelle : même catégorie que le carnet | 🟦 | e2e (catégorie lue dans Firestore) |
| Rappels locaux, rappel préparé (sans nom) | 🟦 | unitaires + e2e |
| Départ, compte supprimé, organisateur → trésorier / tontine figée, avertissement | 🟦 | unitaires, émulateurs, e2e |
| Écran admin des statistiques de tontines | ⬜ | fonction faite ; textes de l'écran admin non proposés |
| Déploiement (fonctions `tontineGroup`, `adminTontineStats`, règles, index, `deleteAccount` + `boDeleteUser`) | 🟦 en ligne · 📱 | déployé le 2026-10-14 depuis `dinerox-main` 44e28eb, 4 commandes approuvées ; comptes jetables : création/invitation/aperçu, puis suppression d'un membre (compte, profil, opérations, code, demande effacés ; place « Ancien membre ») 17/17, tout nettoyé |

## Détail de l'étape 4

| Élément | Statut | Preuve / note |
|---|---|---|
| Règles (moments, 14 j, 7 jours de saisie, 120 j, 3 au total, arrêt après le menu, blocages) | 🟦 | `core/storeReview.ts`, `tests/store-review.test.ts` (25, mutations détectées) |
| Moment « Objectif atteint » fermé | 🟦 web · 📱 | `e2e/store-review.js` (web : aucune demande, pas de fenêtre native) |
| Moment « cagnotte reçue » (carnet : bouton et saisie confirmée) | 🟦 unitaires · 📱 | la tontine partagée n'enregistre pas de cagnotte reçue aujourd'hui |
| Jamais pendant une saisie : feuille, trophée affiché, clavier, micro, voix du coach | 🟦 unitaires · 📱 | `screenBusy()` ; `VoiceQueue.busy` testé |
| Fenêtre Google réelle (demande automatique) | 📱 · ⛔ avant publication | APK installé directement : la demande part mais Google n'affiche rien (normal) ; vraie fenêtre : piste « test interne » |
| Ligne « Donner mon avis » : page Play directe, cachée sans `config/app/items/store` | 🟦 web · 📱 Play Store réel | `e2e/store-review.js` ; iPhone : seulement avec `appStoreUrl` dans le réglage |
| Dépendance `expo-store-review ~57.0.3` | 🟦 | nouveau build natif (EAS) nécessaire |

## Détail de l'étape 5

| Élément | Statut | Preuve / note |
|---|---|---|
| Origine retenue sur l'appareil : referrer Play (lien, recherche organique), liens `/i/`, `/a`, `/t/` | 🟦 web · 📱 · ⛔ referrer réel | unitaires + `e2e/install-origin.js` ; vrai referrer : piste « test interne » |
| Comptée une fois à l'inscription, compteurs anonymes, marqueur oui/non | 🟦 | `tests/functions/install-origin.emulator.test.ts` (vraies fonctions), règles (mutations détectées) |
| Second compte sur un téléphone : « Origine inconnue » ; compte de plus de 7 jours : rien | 🟦 | émulateurs + e2e |
| Écran admin : chiffres regroupés, groupes de moins de 5 réunis sans nom | 🟦 | unitaires, émulateurs, e2e (capture) |
| Générateur de liens de campagne (Play + `dinerox.app/a`) | 🟦 | unitaires + e2e (copie vérifiée) |
| Défaut de l'étape 3 corrigé : `/t/{code}` (Hosting, Android, fonction `link`) | 🟦 · ⛔ domaine | unitaires ; en ligne seulement avec le domaine |
| `link.app.lead` et phrases de la politique de confidentialité | ⬜ à valider | `docs/textes-etape5.md` |
| Déploiement : règles, `recordSignupOrigin`, `adminOriginStats` | ⛔ | attend l'accord du fondateur, commande par commande |

## À faire après les 5 étapes

Demandé par le fondateur le 2026-10-14 ; aucun n'est commencé.

| Élément | Statut | Note |
|---|---|---|
| (a) Écran admin des statistiques de tontines | ⬜ | la fonction `adminTontineStats` est en ligne ; textes de l'écran à proposer puis valider |
| (b) Cotisations des tontines partagées comptées dans le « reste par jour », comme le carnet T1 | ⬜ | `core/dailyAllowance.ts` |
| (c) Fréquence personnalisée pour les tontines partagées | ⬜ | aujourd'hui : quotidienne, hebdomadaire, toutes les 2 semaines, mensuelle |
| (d) Piste « test interne » de Google Play (voir la vraie fenêtre d'avis avant la publication) | ⬜ | à préparer, liste ci-dessous |
| (e) Demande d'avis quand une cagnotte de TONTINE PARTAGÉE est reçue | ⬜ | quand ce moment existera (aujourd'hui seul le carnet enregistre une cagnotte reçue) : `markReviewMoment('tontine')` |

Préparer la piste « test interne » (décision du fondateur, 2026-10-14) :
1. **Compte développeur Google Play** (frais d'inscription unique de Google, vérification d'identité).
2. **Fiche minimale** : nom, description courte et longue, icône 512 px, image de présentation, captures d'écran, catégorie, coordonnées.
3. **Politique de confidentialité** publiée à une adresse publique (exigée par Google).
4. **Formulaire « Sécurité des données »** : données collectées, finalités, partage, chiffrement, suppression du compte.
5. **Questionnaire de classification du contenu**, public cible, déclaration « application financière » si demandée.
6. **Build AAB signé** (EAS) envoyé sur la piste interne ; liste des testeurs (adresses Gmail).
7. **Empreinte SHA-256** du certificat de signature de l'application (Play Console › Intégrité de l'application) à mettre dans `assetlinks.json` (liens `dinerox.app`, étape 1).
8. Puis : `config/app/items/store` › `reviewMenu: true` pour afficher la ligne « Donner mon avis » (seulement quand la page Play existe).

## Journal

- 2026-10-13 : plan de l'étape 1 accepté. Domaine `dinerox.app`. Règle de
  récompense modifiée par le fondateur : seul le parrain est récompensé,
  1 mois de Plus par tranche de 5 filleuls validés.
- 2026-10-13 : étape 1 codée et testée automatiquement ; rapport envoyé,
  en attente de « Étape 1 validée ».
- 2026-10-14 : retours du fondateur. Corrigé : code saisi conservé avec
  « Continuer avec Google ». Règles et index réalignés sur la production
  (back-office) + parrainage, testés contre backoffice, dinerox-main,
  design-v2 et croissance. Décisions : semaine glissante OK, plafond
  2 mois/mois OK, mois du parrain payant mis de côté puis appliqué à la fin
  de l'abonnement (à revoir avec le paiement). Rien n'est déployé.
- 2026-10-14 : branches réunies (`integration` → `dinerox-main`), garde-fou de
  déploiement. Parrainage déployé (index, règles, 7 fonctions), vérifié en
  ligne avec un compte de test supprimé ensuite.
- 2026-10-14 : nouvelle méthode du fondateur — un seul test sur téléphone à la
  fin des 5 étapes (liste unique), aucun APK aux testeurs avant. Étape 1 →
  📱 À vérifier sur téléphone. Début de l'étape 2 (plan).
- 2026-10-14 : plan de l'étape 2 validé (view-shot 5.1.0, déclarations WhatsApp
  et WhatsApp Business, textes) ; codé et testé automatiquement.
- 2026-10-14 : étape 2 vérifiée par le fondateur → 📱 À vérifier sur téléphone ;
  fusion dans `dinerox-main` (avance rapide). Début de l'étape 3 (plan).
- 2026-10-14 : textes de l'étape 3 validés (92) et intégrés ; écrans, parcours à
  3 comptes ; deux défauts trouvés et corrigés (ordre affiché après tirage,
  ordre des demandes).
- 2026-10-14 : correction du fondateur — la cotisation enregistrée va sur le
  compte choisi par la personne (sélecteur du carnet), jamais de compte créé
  automatiquement ; testé (parcours à 3 comptes).
- 2026-10-14 : serveur de l'étape 3 déployé (index, règles, `tontineGroup`,
  `adminTontineStats`, `deleteAccount`, `boDeleteUser`) ; 57 fonctions, les 55
  autres inchangées ; vérifié en ligne avec des comptes jetables supprimés
  ensuite. Étape 3 → 📱 À vérifier sur téléphone.
- 2026-10-14 : déploiement de l'étape 3 vérifié par le fondateur. Ajout de la
  liste « À faire après les 5 étapes ». Étape 4 : plan proposé, rien de codé.
- 2026-10-14 : étape 4 — décisions du fondateur (2 moments sans trophées, fréquence,
  `expo-store-review ~57.0.3`, textes validés, test interne après les 5 étapes) et
  correction : la ligne du menu ouvre directement la page du store, cachée tant
  que `config/app/items/store` ne l'active pas. Codé et testé automatiquement ;
  rien côté serveur, aucun déploiement.
- 2026-10-14 : étape 4 vérifiée par le fondateur → 📱 À vérifier sur téléphone ;
  fusion dans `dinerox-main` (avance rapide), rien à déployer. Ajout du point (e).
  Début de l'étape 5 (plan).
- 2026-10-14 : décisions du fondateur sur l'étape 5 (compteurs seulement, sans
  consentement analytique car rien n'est rattaché à une personne, seuil 5,
  sources, lien `/a` + correction de `/t/`, textes validés sauf `link.app.lead`).
  Codé et testé automatiquement ; rien de déployé.
