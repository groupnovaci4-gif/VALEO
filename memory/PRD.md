# VALEO — App mobile de collecte coopérative agricole (Côte d'Ivoire)

## Problème / Origine
L'utilisateur a fourni une app web React (`coop-collecte.jsx`, single-file, lucide-react, inline styles, window.storage) et demande de l'améliorer et de la rendre prête à l'emploi, téléchargeable en APK.

## Décision d'architecture
- App mobile **Expo React Native** (téléchargeable en APK via Publish).
- **CONNECTÉE (v4)** : backend **FastAPI + MongoDB** source de vérité. L'app charge `GET /api/state` au démarrage, `PUT /api/state` (debounce ~700ms) à chaque changement, refresh au premier plan + pull-to-refresh. Cache local `@/src/utils/storage` pour le hors-ligne.
- **Espace admin propriétaire** : page web servie à `{BASE}/api/admin`, protégée par mot de passe (`ADMIN_PASSWORD`, défaut `admin123`) + JWT bearer. CRUD complet (réglages, planteurs, équipe, collectes, prêts, mandats, dépenses) ; les modifications se répercutent dans l'app.
- **Données de démonstration supprimées** : l'app démarre vide (l'utilisateur crée coop & planteurs).
- Identité VALEO conservée ; logo compact encadré blanc sur l'écran de connexion.

## Personas
- **Patron / Acheteur** : gère la coop, l'équipe, approuve les prêts, règle prix/commission.
- **Commis péseur** : pèse et délivre les bordereaux.
- **Pisteur** : collecte en tournée, reçoit un mandat, justifie sa caisse.
- **Planteur** : suit ses poids, prêts et paiements Mobile Money.

## Core requirements (statique)
- Multi-rôles avec connexion / création de compte (coop & planteur).
- Pesée / collecte → bordereau (retenues, net, paiement espèces/MoMo, partiel).
- Prêts (demande planteur, approbation patron, remboursement auto sur livraisons).
- Mandats & dépenses pisteur, justification de caisse, commission.
- Comptes Mobile Money coop & planteur.
- Réglages (prix/kg, commission, campagne), reset démo.

## Implémenté (2026-06)
- Conversion complète web → Expo native (src/coop/: lib, store, ui, Icon, Logo, auth, screens, sheets ; app/index.tsx, _layout.tsx).
- Stockage hors-ligne + seed + migration.
- Toutes les icônes lucide mappées vers @expo/vector-icons ; logo VALEO en react-native-svg.
- Clavier géré via react-native-keyboard-controller (KeyboardAwareScrollView).
- **Améliorations v1** : partage/impression du bordereau en PDF (expo-print + expo-sharing) ; recherche de planteurs ; photos via expo-image-picker (caméra/galerie, permissions gérées).
- **Améliorations v2 (Next action items exécutés)** :
  - Récapitulatif de campagne en PDF (src/coop/reports.ts) — bilan global + détail par planteur + prêts + pisteurs, partageable.
  - Filtres Planteurs par village et par culture (chips horizontaux) en plus de la recherche.
  - Sauvegarde/Restauration des données via fichier JSON (src/coop/backup.ts : expo-file-system/legacy + expo-document-picker + expo-sharing ; store.replaceData).
  - Signature tactile du planteur sur le bordereau (src/coop/Signature.tsx, PanResponder + react-native-svg), incluse dans le PDF et persistée (store.setCollectionSignature).

## Backlog / Next
- **v5** : Création de coopérative enrichie — identité complète (nom officiel, sigle, agrément, type OHABA/SCOOPS, date, filières multi, description, photo), coordonnées (région/district/département/commune/localité/adresse/tél/email) et responsable détaillé (nom, prénoms, photo, tél, email, fonction, pièce d'identité). Affichée dans l'espace Coop + éditable dans l'admin (Coop type/staff étendus).
- **v3 (Next action items exécutés)** :
  - Reçu WhatsApp : bouton dans le bordereau envoyant un récap au numéro du planteur (wa.me, indicatif 225 auto) — src/coop/sheets.tsx, waNumber() dans lib.
  - Bilan par village : bouton "Bilan PDF de <village>" dans Planteurs quand un village est filtré (reports.campaignHtml accepte {village}).
  - Historique des prix : data.priceHistory, alimenté à chaque changement de prix, affiché dans Réglages.
  - Rappels de paiement : section sur le tableau de bord Patron listant les planteurs avec reste dû, triés décroissant (impaye-<id>).
- P2 restant : multi-campagnes, rappels planteurs automatiques, comparaison hebdo des prix.

## Refonte métier v6 (2026-06) — TERMINÉE & TESTÉE (iteration_6, full pass)
- Rôles renommés : « Pisteur / Délégué » (ex-Pisteur) et « Magasinier » (ex-Commis péseur) partout (UI + PDF).
- Écran de connexion : aucune donnée affichée (connexion par nom/tél pour la coop, code/tél pour le planteur).
- Planteurs multi-cultures : `Member.cultures: Culture[]` ({cropId, superficie}) via CulturesPicker ; migration auto depuis cropId/superficie.
- Patron : peut modifier/supprimer un planteur (MemberDetail, testIDs member-edit/member-delete + confirmation), et modifier/supprimer un Pisteur/Délégué et un Magasinier (PisteurRecon/CommisDetail, staff-edit/staff-delete).
- Patron : bouton « Nouveau prêt / créance » (LoanSheet avec sélecteur de planteur). Approbation via LoanApproveSheet (montant accordé ≤ demande + mode Espèces/Mobile Money) → store.approveLoan ; refus via store.refuseLoan.
- Visibilité : prêts/créances réservés au Patron ; Magasinier voit tous les planteurs mais seulement ses propres pesées ; Pisteur/Délégué voit seulement ses propres collectes (commission inchangée) ; sélection du produit à la pesée limitée aux cultures du planteur.
- Câblage finalisé dans app/index.tsx (états approveLoanObj/editMember/editCollab/confirm + modale de confirmation).

## Backlog restant
- Changement du mot de passe admin depuis l'espace web.
- Comptes de connexion individuels par collaborateur (code perso).
- Journal d'activité horodaté dans l'admin ; sauvegarde quotidienne automatique.
