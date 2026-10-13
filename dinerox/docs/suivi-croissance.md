# Suivi — Moteur de croissance (branche `croissance`)

Statuts autorisés : ⬜ À faire · 🟨 En cours · 🟧 Codé, non testé · 🟦 Testé
automatiquement · 📱 À vérifier sur téléphone · ⛔ Bloqué · ✅ Validé par le
fondateur (uniquement après son message « Étape N validée »).

| Étape | Fonctionnalité | Statut | Validé par le fondateur |
|---|---|---|---|
| 1 | Parrainage (+ socle des liens DineroX) | 🟦 Testé automatiquement (en attente de validation) — parties 📱 et ⛔ ci-dessous | |
| 2 | Bouton « Partager sur WhatsApp » | ⬜ À faire | |
| 3 | Tontine partagée (Lot T2) | ⬜ À faire | |
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
| Page de redirection (Android / iPhone / ordinateur + QR) | 🟦 émulateur · ⛔ en ligne | domaine `dinerox.app` à brancher sur Firebase Hosting (console) |
| Ouverture directe de l'application par le lien (App Links) | ⛔ | `assetlinks.json` : empreinte SHA-256 de la clé Play attendue |
| Secret `REFERRAL_DEVICE_PEPPER` en production | ⛔ | à créer (`firebase functions:secrets:set`) avant déploiement |

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
