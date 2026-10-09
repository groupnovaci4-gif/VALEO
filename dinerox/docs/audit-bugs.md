# Audit 1.8 — journal des bugs

Mission « Enregistreur vocal, catalogue de catégories, épargne et chasse aux
bugs ». Ce journal ne prétend PAS que l'application n'a plus de bug : il liste
ce qui a été cherché, trouvé, corrigé et vérifié, et ce qui reste ouvert.

## Comment l'audit a été mené

- **Vérifications automatiques** (phase 8) : typage (`tsc`), lint (zéro
  avertissement), 557 tests unitaires, 40 tests de règles Firestore (émulateur),
  parité FR/EN des textes + présence d'un message pour chaque code d'erreur,
  export Android (`expo export --platform android`), compilation des Cloud
  Functions, `npm audit`, `expo-doctor`.
- **Parcours de bout en bout** (phase 9) sur l'application réelle (export web +
  émulateurs Auth/Firestore, comptes réels, formule gratuite) : 21 parcours —
  inscription, tous les formulaires (`forms-audit`), multi-utilisateurs, coach
  (budget, ouverture, voix, récompenses, score, conseils), navigation,
  accueil, saisie (clavier, phrase, voix), enregistreur, rappel du soir,
  mesure d'usage, lot B, catégories, épargne, réserve, famille et moments
  forts, tontines. Tous verts sur la version commitée.
- **Relecture ciblée du code** : chaque somme revenus/dépenses face au nouveau
  type « ajustement », liens entre opérations (dettes, objectifs, tontines,
  réserves) à la modification et à la suppression, export CSV, déconnexion et
  saisies en attente, compatibilité avec les anciennes versions de l'app.
- **Limite** : le web ne reproduit pas tout le natif (clavier Android, vrai
  moteur de dictée, notifications, build EAS). Ces points sont dans la liste
  « À tester sur téléphone » du rapport.

## Bugs trouvés et corrigés

Gravité : **bloquant** (empêche un parcours), **majeur** (résultat faux ou
perte d'usage), **mineur** (gêne, contournable).

| ID | Parcours | Gravité | Reproduction | Cause | Correction | Test | Statut |
|---|---|---|---|---|---|---|---|
| A1 | Build APK (EAS) | bloquant | `eas build -p android` → `lintVitalRelease` échoue (ExtraTranslation) | textes d'autorisation iOS à la racine de `locales/*.json`, copiés en ressources Android | rangés sous `ios` | `speech-input.test` (forme des fichiers) ; build relancé par le fondateur | corrigé (`b0bef55`) |
| A2 | Build EAS depuis un nouveau clone | majeur | clone neuf → projet EAS introuvable | `projectId`/`owner` absents de `app.json` | ajoutés | — (configuration) | corrigé (`9ec9fa8`) |
| A3 | Saisie vocale | majeur | parler, marquer une pause de 2-3 s → l'enregistrement s'arrête seul | arrêt sur silence (`continuous: false`, options `*_SILENCE_LENGTH_MILLIS`) | machine d'états `core/entry/recorder.ts` : seul le toucher arrête, moteur relancé, morceaux raccordés | `recorder.test` (23), `voice-recorder.test` (7), e2e `voice-recorder` (pause de 10 s) | corrigé (`cc7668c`) |
| A4 | Revenus (nouvel utilisateur pays v2) | majeur | nouvel espace CI → formulaire de revenu : aucune catégorie de revenu proposée | `shownByDefault` masquait les revenus du catalogue v2 | revenus toujours visibles | `category-catalog.test` (revenus visibles), e2e `categories` | corrigé (`2bc9c93`) |
| A5 | Récurrences | majeur | modifier une récurrence liée à une enveloppe → enveloppe remise à vide | enveloppe non reprise dans le brouillon d'édition | champs non affichés conservés à la modification | aucun test automatique (relu) — à vérifier sur téléphone | corrigé (`2bc9c93`) |
| A6 | Tontines | majeur | renommer la catégorie de tontine → cotisations rangées dans « Autres » | catégorie retrouvée par LIBELLÉ | par identifiant (`tontineContributionCategory`) | `category-catalog.test` (`tontineContributionCategory`), e2e `tontine` | corrigé (`2bc9c93`) |
| A7 | Réserve famille | majeur | dépense « Tontine » proposée comme prise sur la réserve | éligibilité par libellé | `reserveEligible` hors Tontine / Cotisation / Association | `category-catalog.test` (`reserveEligible`) | corrigé (`2bc9c93`) |
| A8 | Analyses, reste par jour | majeur | anciennes dépenses « Épargne » / « Investissement » comptées comme consommation | catégorie traitée comme dépense | `savingsFlows` (décisions 2 et 3) | `savings.test` « anciennes dépenses » | corrigé (`2bc9c93`) |
| A9 | Carte « Nouvelles catégories » | majeur | supprimer une catégorie du catalogue puis appliquer la mise à jour → elle revient | le plan ne voyait pas les documents supprimés | documents supprimés pris en compte (`engine.getDoc`) | `category-catalog.test` (le plan ne recrée pas une catégorie supprimée) ; branchement de la carte relu, sans test automatique | corrigé (`14b948b`) |
| A10 | Épargne (E1 à E8) | bloquant | test du fondateur : « Mon épargne » reste à 0, « J'ai épargné » = dépense… | voir le tableau des blocages | voir `docs/voix-categories-epargne.md` | `savings.test`, e2e `savings` | corrigé (`14b948b`) |
| A11 | Réglages › « Tester le micro » | majeur | toucher « Tester le micro » → l'écoute ne s'arrête jamais (et la voix du coach reste coupée) | depuis l'enregistreur 1.8, l'écoute dure jusqu'au toucher, mais l'écran n'avait pas de bouton d'arrêt (régression de A3) | le bouton devient « Terminer l'enregistrement » ; quitter l'écran arrête | e2e `lot-a-reminder` | corrigé (`14b948b`) |
| A12 | Objectifs + épargne | majeur | verser 20 000 dont 5 000 pour la Moto, puis modifier la note du versement → la Moto reçoit 20 000 | la part liée était recopiée sur le montant complet dès qu'ils différaient | `linkedPartAfterEdit` : part complète suit, part partielle gardée (plafonnée) | `savings.test` « modifier un versement » | corrigé (`14b948b`) |
| A13 | Épargne › objectif | majeur | « Affecter à un objectif » activé sans objectif choisi → versement enregistré SANS objectif, sans message | objectif présélectionné seulement s'il était lié au compte | seul objectif présélectionné ; sinon « Quel objectif ? » | e2e `savings` §4 | corrigé (`14b948b`) |
| A14 | Export CSV | mineur | ajustement à la baisse exporté positif ; tout montant négatif devenait du texte (`'-5000`) dans le tableur | protection anti-formule appliquée aux nombres | ajustement signé ; un nombre seul n'est pas neutralisé (une formule l'est toujours) | `savings.test` « export CSV » | corrigé (après `14b948b`) |

## Points ouverts (non corrigés)

| ID | Sujet | Gravité | Constat | Pourquoi pas corrigé | Proposition |
|---|---|---|---|---|---|
| O1 | Dépendance `expo-asset` | à vérifier | `expo-doctor` : « Missing peer dependency: expo-asset (required by expo-audio) — your app may crash outside of Expo Go ». Le paquet est installé (57.0.19, via `expo`) mais pas en dépendance directe. | règle : pas de dépendance native ajoutée sans votre accord | `npx expo install expo-asset` (même version, déjà dans le build) — décision D1 |
| O2 | `npm audit` | faible | 36 alertes (12 modérées, 24 hautes), aucune critique. Origines : `@expo/cli` (node-forge, braces), `@expo/config-plugins` (uuid), `firebase` côté Node (@grpc/grpc-js, inutilisé par l'app), `expo-router` → `decode-uri-component` 0.2.2 (seul paquet exécuté dans l'app : déni de service sur une URL malformée). | corriger = monter des versions du SDK Expo / Firebase (« npm audit fix --force » casse le SDK) | à revoir à la prochaine mise à jour du SDK |
| O3 | `expo-doctor` incomplet | — | 2 contrôles non exécutés faute d'accès réseau ici (schéma `app.json` via exp.host, React Native Directory) | environnement | lancer `npx expo-doctor` sur le Mac |
| O4 | Versions mélangées dans un espace famille | majeur (temporaire) | un ajustement de solde (1.8) est ignoré par une ancienne version de l'app : solde du compte d'épargne plus bas sur l'ancien téléphone. Si les règles Firestore ne sont pas déployées AVANT la 1.8, les ajustements sont refusés à la synchronisation. | inhérent à un nouveau type d'opération | déployer `firestore.rules` avant de publier la 1.8 ; inviter les membres à mettre à jour |
| O5 | Déconnexion avec saisies non synchronisées | mineur | aucun avertissement ; les saisies restent sur l'appareil (rangées par compte) et partent à la reconnexion, mais sont perdues si l'app est désinstallée entre-temps | ajout d'un texte = votre accord | décision D3 |
| O6 | Version web : retour du réseau | mineur (web seulement) | dans le navigateur, NetInfo écoute `navigator.connection` : après une coupure simulée, le bandeau « Hors connexion » peut rester jusqu'au rechargement. Sur téléphone, NetInfo suit le réseau natif. | le web n'est pas la cible principale | décision D4 |
| O7 | Historique › filtre par type | mineur | les ajustements de solde apparaissent sous « Tout » mais n'ont pas de bouton de filtre propre | ajouter un 5e bouton change le design | décision D5 |

## Décisions pour le fondateur

- **D1** — Installer `expo-asset` en dépendance directe (recommandé : même
  version que celle déjà embarquée, aucun changement de comportement attendu,
  supprime l'alerte « peut planter hors Expo Go »).
- **D2** — « J'ai économisé 2 000 » ouvre l'écran de VERSEMENT (à confirmer).
  Si, pour vos utilisateurs, « économiser » veut aussi dire « dépenser moins »
  (« j'ai économisé 500 sur le taxi »), on peut retirer « économisé » des
  verbes reconnus et ne garder que « épargné / mis de côté / versé dans mon
  épargne ».
- **D3** — Prévenir à la déconnexion s'il reste des saisies non
  synchronisées (« N opérations pas encore envoyées : elles partiront à votre
  prochaine connexion sur ce téléphone »).
- **D4** — Version web : ajouter l'écoute des événements `online`/`offline`
  du navigateur, si le web est une cible.
- **D5** — Historique : ajouter un filtre « Ajustement » (ou ranger les
  ajustements sous « Transfert »).
- **D6** — Un ajustement de solde « à la hausse » sur un compte d'épargne
  n'est pas compté comme « épargné ce mois-ci » dans le rapport (ce n'est pas
  de l'argent pris sur le revenu saisi). À confirmer.
