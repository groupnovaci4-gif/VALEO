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

## Auth PIN v7 (2026-06) — TERMINÉE & TESTÉE (iteration_7, full pass)
- Code secret à 4 chiffres obligatoire à la connexion :
  - Planteur : (code planteur OU téléphone) + code 4 chiffres.
  - Patron / Pisteur-Délégué / Magasinier : Nom + Téléphone + code 4 chiffres.
- src/coop/pin.ts : vérificateur PBKDF2-HMAC-SHA-256 (100k itérations, sel aléatoire 16o) via @noble/hashes + expo-crypto. `createPinRecord` (async), `verifyPin` (sync, temps constant). Le PIN n'est JAMAIS stocké en clair (PinRecord = {scheme, iterations, saltHex, verifierHex, version}). Vérification 100% hors-ligne.
- Types Member.pin / Staff.pin (PinRecord | null).
- Formulaires : CreatePlanteur, CreateCoop (patron), MemberSheet et CollaborateurSheet capturent code + confirmation. Code obligatoire à la création, optionnel en édition (vide = conserver). Téléphone désormais requis pour les collaborateurs (nécessaire au login).
- Comptes legacy sans PIN : connexion par identifiant seul (fallback, pas de blocage).

## Fonctions v8 (2026-06) — TERMINÉES & TESTÉES (iteration_8, full pass)
1. **Réinitialiser le code secret** (Patron) : bouton dans la fiche planteur (testID member-resetpin) et collaborateur (staff-resetpin) → ResetPinSheet (sheets.tsx) → nouveau code 4 chiffres + confirmation → store.updateMember/updateStaff {pin}.
2. **Mot de passe admin** (web) : POST /api/admin/change-password (JWT requis), verify_admin_password avec hash PBKDF2 stocké dans Mongo (collection admin_config), fallback env ADMIN_PASSWORD. Carte « Sécurité » ajoutée dans le dashboard admin (settingsPanel). Défaut : admin123.
3. **Identifiant de connexion** : cartes info dans les fiches (StaffLoginCard = Nom+Téléphone+code secret ; planteur = code PL + téléphone + code secret).
4. **Journal d'activité** (Patron) : bouton dash-journal sur le Bilan → ActivityLog (screens.tsx) fusionne pesées/prêts/mandats/dépenses horodatés, triés du plus récent (fDateTime helper).
- Dépendances ajoutées : @noble/hashes, expo-crypto. Tests backend : /app/backend/tests/ (11/11).

## Fonctions v9 (2026-06) — TERMINÉES & TESTÉES E2E (iteration_9, full pass)
- **Solder le reste dû** : bouton vert « Solder le reste dû (X F) » dans la fiche planteur (MemberDetail, testID member-settle), visible pour tout rôle coop (Patron, Magasinier, Pisteur/Délégué) quand reste>0 → confirmation (bouton « Solder ») → store.settleMemberDue(memberId) marque les collectes avec reste comme payées (paye+=reste, reste=0). Paiement hors livraison.
- **Report du reste à la pesée** : PeseeSheet calcule oldReste = memberStats(memberId).reste ; totalDu = net + oldReste. Bande orange + lignes « + Reste dû (précédent) » / « Total à payer » affichées si oldReste>0. « Payer tout » règle le total et solde l'ancien ; en partiel, paiement appliqué d'abord aux anciens restes (FIFO) via champ _settle traité par store.addCollection.

## Branding v10 (2026-06)
- Logo officiel VALEO (image fournie) intégré : assets/images/valeo-logo.png affiché sur l'écran de connexion (carte blanche). Ancien logo SVG (Logo.tsx) remplacé.
- Icônes régénérées depuis le logo : icon.png & adaptive-icon.png (emblème recadré, fond blanc), splash-image.png (lockup complet), favicon.png. app.json : splash + adaptiveIcon en fond blanc. Les icônes ne s'appliquent qu'après un nouveau build (Publish).

## Correctif v11 (2026-06) — Boutons « figés » RÉSOLU (iteration_10, 7/7 PASS)
- Cause : le calcul du code secret (PBKDF2 100 000 itérations) bloquait le fil UI → boutons Se connecter/Enregistrer/etc. sans retour, perçus comme figés (surtout sur téléphones d'entrée de gamme).
- Fix : pin.ts itérations 100k→15k + yieldToUI() avant PBKDF2 + randomSalt avec repli ; verifyPinAsync (non bloquant). SaveBtn (ui.tsx) enveloppe onPress async → état busy interne, ActivityIndicator + « Veuillez patienter… », disabled anti double-clic, catch d'erreurs. Handlers de connexion async (verifyPinAsync).
- verifyPin lit record.iterations → les anciens comptes (100k) restent vérifiables.

## Correctif v12 (2026-06) — Isolation compte planteur RÉSOLU (iteration_11, PASS)
- Bug : le formulaire de prêt affichait un sélecteur de planteur même côté planteur → un planteur pouvait faire une demande au nom d'un autre (le memberId du Select écrasait session.memberId via le spread).
- Fix : LoanSheet accepte `fixedMember` → côté planteur, sélecteur remplacé par une carte lecture seule (planteur connecté) et onSave force memberId = fixedMember.id ; index.tsx addLoan force memberId=session.memberId (spread avant). Côté patron, sélecteur conservé.
- Écrans planteur (PlanteurPoids/Prets/Momo) filtrent déjà strictement par member.id ; aucune liste d'autres planteurs accessible au planteur.

## Fonctions v13 (2026-06) — Reçus de solde, horodatage & cloche (iteration_12, 6/6 PASS)
- Modèle : type Settlement + data.settlements ; Collection.oldRegle ; Loan.decidedAt. Migration : settlements=[] par défaut.
- store : settleMemberDue(memberId, staffId, method) enregistre un Settlement horodaté et RETOURNE le reçu ; addCollection enregistre un Settlement viaPesee + pose collection.oldRegle ; approveLoan/refuseLoan posent decidedAt.
- Reçu de solde : SettlementReceipt (sheets.tsx) — modal reçu (Date & heure, planteur, montant, mode, agent) avec Partager PDF / Imprimer / WhatsApp (settlementHtml). Ouvert auto après un solde.
- Bordereau : ligne verte distincte « Ancien reste soldé : X » quand oldRegle>0 (démarque l'ancien reste vs la pesée courante). savePesee (index.tsx) propage oldRegle au reçu affiché.
- Cloche : TopBar bell (testID topbar-bell) + badge = nb « À traiter ». buildNotifications(data, session) + NotificationsSheet (screens.tsx) : sections « À traiter » (prêts en attente, restes dus) et « Activité récente » (pesées payées, restes soldés, crédits accordés/refusés), horodatées. Portée par rôle (patron voit prêts ; planteur voit ses propres infos).
- ActivityLog inclut désormais les settlements.

## Multi-coop + prix par produit + refonte accueil v14 (2026-06) — TERMINÉ & TESTÉ (iteration_13, 10/10 backend + UI PASS)
- **Isolation multi-coopératives** : `data.coops[]` (chaque Coop a id/prices/commissions) ; `scopeData(raw, coopId)` (lib.ts) n'expose QUE les données de la coop connectée ; `store.setCoopScope` + `coopId` estampillé sur chaque écriture. Web admin garde la vue globale (state complet).
- **Prix & commissions par produit** : `priceOf`/`commOf(data, cropId)` ; SettingsSheet édite prix+commission des 5 cultures (Cacao/Café/Anacarde/Hévéa/Palmier) ; PeseeSheet applique le prix du produit sélectionné.
- **Superficie par culture** : CulturesPicker (ui.tsx) saisit une superficie (ha) distincte par culture cochée (déjà en place, confirmé).
- **Refonte accueil** : nouveau fichier `src/coop/home.tsx` — `QuickActions` (grille de petites icônes de raccourcis, testIDs quick-<label>) + `PartnersBanner` (bandeau défilant « En partenariat avec » CCC/MINADER/CNRA/ANADER/FIRCA, placeholders initiales, marquee Animated.loop, useNativeDriver conditionnel web). Câblé dans index.tsx sur l'accueil de chaque rôle (Patron/Bilan, Magasinier, Pisteur, Planteur).
- Backlog restant : logo VALEO dans l'en-tête PDF ; choix mode de paiement (Espèces/MoMo) au solde ; notifications par planteur ; sauvegarde quotidienne auto.

## Ajustements v15 (2026-06) — TERMINÉ
1. **Réglages : tous les produits** — SettingsSheet liste désormais TOUJOURS les 5 produits (Cacao/Café/Anacarde/Hévéa/Palmier), indépendamment des filières cochées (`crops = CROPS`). Prix + commission par produit, propagés aux autres comptes de la coop via store.setCoopSettings (scopé).
2. **Type de produit sur chaque pesée** — CollectionRow affiche un `CropTag` (emoji + nom du produit) ; MemberDetail & PlanteurPoids montrent le produit sur chaque livraison ; bordereau écran + PDF (`receiptHtml`) affichent la ligne « Produit » basée sur `c.cropId` (et non plus la 1ʳᵉ culture du planteur). Pesées de tous produits présentes dans l'historique au même titre que le cacao (aucun filtre cacao).
3. **En-tête profil enrichi** — TopBar affiche sous le nom : 🏢 nom de la coopérative + la fonction (Patron / Magasinier / Pisteur / Délégué / Planteur). Prop `coopNom` calculé dans index.tsx via `raw.coops[session.coopId]`.

## Correctif signature v16 (2026-06) — RÉSOLU
Symptôme : la signature du planteur ne « restait pas » / apparaissait vide.
- **Cause 1 (persistance)** : un `refresh()` (retour premier plan / pull-to-refresh) pouvait écraser une signature locale pas encore synchronisée (debounce 700ms). Fix store.ts : flag `dirty` + `dataRef` ; `refresh()` pousse d'abord les changements locaux au backend au lieu de tirer une version périmée.
- **Cause 2 (capture vide)** : sur le web, `nativeEvent.locationX/Y` pouvaient manquer → tracés enregistrés comme chaînes vides. Fix Signature.tsx : extraction robuste des coordonnées (locationX → offsetX → 0), pas d'enregistrement d'un tracé sans déplacement (`indexOf('L')`), `saveSig` (sheets.tsx) ignore une signature vide, `wRef` garantit une largeur valide, et `SigPreview`/`sigToSvg` (helper `sigDims`) déduisent les dimensions du tracé si w/h=0.
- Vérifié e2e : tracé capturé (601 chars, w=354/h=170), rendu à l'écran + persisté au backend, présent après fermeture/réouverture du bordereau.

## Refonte dashboards v17 (2026-06) — EN COURS
- **Tâche 1 — Écran Patron (TERMINÉ)** : `Dashboard` (screens.tsx) refait selon maquette — grille 4 cartes (Peser [vert foncé], Planteurs, Stock, Prêts+badge), carte « Volume collecté » (kg + collectes/planteurs + montant payé + répartition par produit `CropBreakdown`), cartes « Déjà payé / Reste à payer » (Voir détails→Journal, Initier paiement→Planteurs), carte Journal d'activité (3 derniers events), `CocoaHero` (LinearGradient). **Bandeau partenaires CONSERVÉ** (sous le CocoaHero — l'utilisateur a demandé de le garder). Nouvelle `StockSheet` (sheets.tsx) : stock en magasin par produit ; scope "all" (patron) / "mine" (pisteur, magasinier). Câblé index.tsx.
- **Tâche 2 — Pisteur/Délégué + Magasinier (TERMINÉ)** : composant partagé `CollectorTop` (screens.tsx) = carte verte « Volume collecté (vos propres poids) » (scope byStaffId) + `CardGrid` adaptatif. Pisteur : 4 cartes [Collecter, Planteurs, Stock, Dépenses] + KPIs/justification de caisse/segments conservés. Magasinier : 3 cartes [Peser, Planteurs, Stock] + historique. CocoaHero + PartnersBanner ajoutés. Stock scope "mine". QuickActions retirés de ces écrans.
- **Tâche 3 — Planteur (TERMINÉ)** : `PlanteurPoids` — grande carte « Total livré cette campagne » passée en vert foncé (`C.greenDark`) + `CropBreakdown` (répartition par produit) ; en-tête 3 icônes (Demander prêt/Mes prêts/Mobile Money via QuickActions) + carte « Mes prêts » (SubTabs) + Reçu/Reste dû + Mon profil conservés ; `CocoaHero` ajouté avant `PartnersBanner`. Conforme à la maquette image 3. Refonte v17 COMPLÈTE (Patron, Pisteur, Magasinier[+dépenses/prêts], Planteur).

## Module de pesée multi-pesées v18 (2026-06) — TERMINÉ & vérifié e2e
Remplace l'ancien PeseeSheet (sheets.tsx). 4 étapes : (1) planteur + produit (prix depuis Réglages) ; (2) NumPad 0-9+⌫ pour poids brut + stepper sacs, tare 1 kg/sac → net=brut−sacs, « Ajouter cette pesée » → liste editable/supprimable ; (3) « Calculer » → net total, tare totale, montant = net×prix ; (4) paiement conservé (Espèces/MoMo, tout/partiel, reste dû) → « Confirmer » → bordereau. Collection: +sacs, +weighings[]. Bordereau écran+PDF affiche « Sacs (tare) ». Retenues/remboursement-prêt retirés du flux. Vérifié : 615/5 sacs→610 ; 907 kg × 1800 = 1 632 600 F.
- **Ajout Magasinier : Dépenses + Prêts** — Magasinier a désormais Dépenses (comme le Pisteur : `store.addDepense{pisteurId:staffId}`, section « Mes dépenses » dans CollectorHome) et Prêts (créer + consulter via `PatronPrets canDecide={false}` → boutons Approuver/Refuser masqués, remplacés par « En attente de validation du Patron » ; création via LoanSheet coop → status en_attente ; approbation réservée au Patron). Cartes CollectorTop : onDepense + onPrets. Route tab "prets" ajoutée pour l'espace non-patron (onBack vers jour/tournee).

## Refonte écran de connexion + auth v19 (2026-06) — TERMINÉ & vérifié e2e
- **Code secret 4 → 6 chiffres** partout (pin.ts isValidPin \d{6}; tous les champs création/réinit auth.tsx + sheets.tsx: maxLength 6, slice(0,6), placeholder ••••••). Les comptes existants doivent recréer leur code.
- **Nouvel écran Login** (auth.tsx) conforme maquette : logo centré + slogan « TRACER. GÉRER. VALORISER. » ; switch 2 onglets (Espace Coopérative / Espace Planteur) actif fond blanc+ombre ; icône (building/sprout)+titre+sous-titre adaptatifs ; champ téléphone (icône) ; champ code 6 chiffres (icône clé + œil afficher/masquer) ; « Code oublié ? » ; bouton « Se connecter » (greenDark) ; séparateur « ou » ; bouton contour « Se connecter avec l'empreinte » ; bouton vert clair « Créer une coopérative/compte planteur » ; footer « © 2026 Valeo ».
- **Connexion coop = téléphone + code uniquement** (le nom retiré ; match staff par tel). Planteur = téléphone OU code + code.
- **Biométrie** (expo-local-authentication + expo-secure-store) : src/coop/biometric.ts (getBiometricState/promptBiometric/saveSession/readSession/clearSession, guard web). Après login réussi, la session est sauvegardée (SecureStore) ; bouton empreinte reconnecte le dernier compte. ⚠️ natif uniquement (pas web/Expo Go). app.json: plugin expo-local-authentication + NSFaceIDUsageDescription.
- **« Code oublié ? »** : ouvre WhatsApp (wa.me du numéro saisi) avec un message de demande de réinitialisation. NB: le code étant haché (PBKDF2), il n'est pas renvoyé en clair — c'est une demande d'aide/réinit, pas l'envoi du secret.
- Vérifié e2e : création coop code 246810 → logout → login par tel 0788000001 + 246810 → dashboard Patron.

## Identifiant planteur VAL-XXXX-YY v20 (2026-06) — TERMINÉ & vérifié
- Nouveau format **VAL-XXXX-YY** (préfixe VAL + 4 chiffres + 2 lettres maj). Helper `genMemberCode(existing)` + regex `MEMBER_CODE_RE` dans lib.ts : génération auto, unicité vérifiée (régénère en cas de collision), non modifiable après attribution.
- Utilisé à la création : store.ts addMember + createLoginPlanteur (remplace l'ancien `PL-2026-000X`).
- Migration : `migrate()` (lib.ts) régénère un identifiant VAL pour tout membre dont le code est absent / ancien format / doublon.
- Textes UI mis à jour (sheets.tsx CreatePlanteur, screens.tsx MemberDetail). Vérifié e2e : nouveau planteur → code VAL-4718-TV affiché (badge + « Identifiant de connexion »).

## Suppression auto-inscription Planteur v23 (2026-06) — TERMINÉ & vérifié
- **Règle métier** : un planteur ne peut PLUS créer son compte lui-même. Le compte est créé UNIQUEMENT par le Patron/Acheteur via Tableau de bord → Planteurs → Ajouter un planteur (MemberSheet → store.addMember, qui génère le code VAL-XXXX-YY + PIN 6 chiffres et rattache le planteur à `coopId` de la coop courante).
- **auth.tsx** : composant `CreatePlanteur` supprimé ; route/écran "create" retiré ; prop `onCreatePlanteur` retirée du composant Login (et de app/index.tsx). Sur l'onglet « Espace Planteur », le bouton « Créer un compte planteur » est remplacé par une note : « Votre compte est créé par votre coopérative. Contactez le Patron / Acheteur pour être enregistré. » L'écran de connexion Planteur ne propose donc que : connexion (téléphone + code 6 chiffres), biométrie, et « Code oublié ? ».
- La création de coopérative (bouton « Créer une coopérative ») reste disponible sur l'onglet « Espace Coopérative ». Vérifié e2e (web) : onglet Planteur n'affiche aucun bouton d'inscription.

## Admin web — navigation par coopérative v24 (2026-06) — TERMINÉ & vérifié
- Backend `server.py` (dashboard admin `/api/admin`, chaîne ADMIN_HTML) : réorganisation de la navigation UNIQUEMENT.
- Nouvelle rubrique principale **Coopératives** : accueil listant `state.coops` en cartes (Équipe/Planteurs/Collectes). Sélection d'une coop → espace indépendant.
- Dans l'espace coop : sélecteur + « ← Coopératives » + onglets Réglages, Planteurs, Équipe, Collectes, **Avances** (ex-Prêts), Mandats, Dépenses. Toutes les listes filtrées par `belongs()` = `coopId===currentCoop`. Mode mono/legacy (coops vide) → affiche tout dans un seul espace.
- Ajout d'un enregistrement : `row.coopId=currentCoop`. Selects de référence (planteur/agent/pisteur) filtrés par coop. Réglages édite `curCoopObj()` (coop sélectionnée), sync legacy `state.coop` si id `__legacy__`. wipeAll réinitialise aussi `coops`/`settlements`.
- Aucune donnée/règle/rôle modifié. Vérifié e2e (login admin123 → accueil Coopératives → ouverture coop → 7 onglets + Avances). ⚠️ Backend sur K8s : nécessite redeploy pour la production.
