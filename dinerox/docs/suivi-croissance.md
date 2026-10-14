# Suivi — Moteur de croissance (développement depuis `dinerox-main`)

Statuts autorisés : ⬜ À faire · 🟨 En cours · 🟧 Codé, non testé · 🟦 Testé
automatiquement · 📱 À vérifier sur téléphone · ⛔ Bloqué · ✅ Validé par le
fondateur (uniquement après son message « Étape N validée »).

| Étape | Fonctionnalité | Statut | Validé par le fondateur |
|---|---|---|---|
| 1 | Parrainage (+ socle des liens DineroX) | 📱 À vérifier sur téléphone (test final unique) — testé automatiquement et déployé ; parties ⛔ ci-dessous | |
| 2 | Bouton « Partager sur WhatsApp » | 📱 À vérifier sur téléphone (test final unique) — testé automatiquement ; chaîne ⛔ (pas encore d'adresse, ligne cachée) | |
| 3 | Tontine partagée (Lot T2) | 🟦 Testé automatiquement — 📱 test final (3 téléphones) ; serveur NON déployé (fonctions, règles, index, deleteUserData) | |
| 4 | Demande d'avis Google Play / App Store | ⬜ À faire | |
| 5 | Origine des installations (liens tracés par canal) | ⬜ À faire | |

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
| Déploiement (fonctions `tontineGroup`, `adminTontineStats`, règles, index, `deleteAccount` + `boDeleteUser`) | ⛔ | attend l'accord du fondateur, commande par commande |

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
