# VALEO — App mobile de collecte coopérative agricole (Côte d'Ivoire)

## Problème / Origine
L'utilisateur a fourni une app web React (`coop-collecte.jsx`, single-file, lucide-react, inline styles, window.storage) et demande de l'améliorer et de la rendre prête à l'emploi, téléchargeable en APK.

## Décision d'architecture
- Reconstruction en **app mobile native Expo React Native** (téléchargeable en APK via Publish).
- **100% hors-ligne** : toutes les données stockées localement via `@/src/utils/storage` (AsyncStorage), clé `coop:data:v3`. Aucun backend.
- Identité VALEO conservée à l'identique (vert/teal, logo SVG, tagline).

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
- P1 : export récap campagne (PDF global), filtres par village/culture.
- P2 : sauvegarde/restauration des données (fichier), multi-campagnes.
