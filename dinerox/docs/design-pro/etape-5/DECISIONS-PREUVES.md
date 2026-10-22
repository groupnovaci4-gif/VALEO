# Refonte finale — chaque décision, sa preuve (étape 10)

Référence : `docs/design-pro-maquette-finale/DECISIONS.md` (branche `claude/admiring-ritchie-h611hm`).
Images « maquette | application » : `comparaison/` — 6 écrans × clair et sombre, **même échelle**
(2 px par dp des deux côtés : maquette 360 dp = 720 px ; émulateur Android 720 × 1600 px à la
densité 320 = 360 × 800 dp). L'application est la VRAIE application (client de développement sur
l'émulateur Android, mode démonstration), écrans défilés puis recollés (décalage cherché pixel par
pixel, jamais supposé). Côté maquette : `ecrans/*.png` (Accueil, Budget, Objectifs, Plus), découpe
des téléphones de `FINAL-accueil-mis-de-cote-deplie.png` (premier écran) et de `FINAL-comptes.png`.

| Image | Écran |
|---|---|
| `comparaison/accueil-clair.png`, `accueil-sombre.png` | Accueil en entier |
| `comparaison/accueil-deplie-clair.png`, `accueil-deplie-sombre.png` | Accueil, « Mis de côté » déplié |
| `comparaison/budget-clair.png`, `budget-sombre.png` | Budget |
| `comparaison/objectifs-clair.png`, `objectifs-sombre.png` | Objectifs |
| `comparaison/plus-clair.png`, `plus-sombre.png` | Plus |
| `comparaison/comptes-clair.png`, `comptes-sombre.png` | Comptes |

Différences qui ne sont PAS des écarts : la barre d'état d'Android (heure, réseau) au-dessus de
l'application ; les chiffres qui dépendent du jour (« plafond par jour » 42 550 au lieu de 38 681,
rythme d'un objectif 84 000 au lieu de 75 000 / mois) — ce sont des calculs de `src/core`, non
touchés ; les noms exacts des données de démonstration (« Réserve famille et cérémonies »,
« Loisirs & divertissement », « Alimentation & boissons »).

## Tableau A1 à G1

| N° | Décision (résumé) | État | Preuve / raison |
|---|---|---|---|
| A1 | Couleurs, polices (Jakarta + Inter), coins de la direction B ; aucun dégradé ; sable en clair, sombre actuel | **fait** | `tests/etape5-ensemble.test.ts` (A1) ; toutes les images |
| A2 | En-tête : « Démo ▾ » texte simple, cloche avec pastille, petit avatar ; plus de bandeau ni de bouton encadré | **fait** | `tests/etape5-ensemble.test.ts` (A2) ; haut de chaque image. Étape 10 : contenu collé à l'en-tête (marge de 16 dp retirée, comme `.page`) ; cloche et pastille décoratives (le bouton dit « Notifications, À lire · N ») |
| A3 | Icônes 3D (Fluent, teinte moyenne-foncée) ; en sombre petit rond clair derrière ; navigation au trait | **fait** | `tests/etape5-icones-logos.test.ts` ; images sombres (rond derrière chaque icône de contenu) |
| A4 | Le libellé décide de l'icône (dictionnaire, 50 entrées) | **fait** | `tests/etape5-libelle-icone.test.ts` (43 tests). Étape 10 : la règle vaut aussi pour les ENVELOPPES (« Alimentation & boissons » = panier, comme la maquette ; avant : plat) — `budget-*.png`, `accueil-*.png` |
| A5 | Épargne = cochon de profil ; gaz = bonbonnes ; coiffure = dessin du fondateur ; `cooking` | **fait** | `tests/etape5-icones-logos.test.ts` (empreintes SHA-256) ; `comptes-*.png`, `budget-*.png` (cochon) |
| A6 | Logos des opérateurs = fichiers du fondateur, tuile blanche, image entière ; Comptes + badge des opérations | **fait** | `tests/etape5-icones-logos.test.ts` ; `comptes-*.png` (Orange Money), `accueil-*.png` (badge 18 dp) |
| A7 | Cartes vertes flottantes (Accueil, Budget, Objectifs, Plus) : marges 8, rayon 22, ombres | **fait** | `tests/etape5-ensemble.test.ts` (A7) ; les 4 images |
| A8 | Aucun texte coupé ni « … » ; texte agrandi / écran < 340 dp : moins de colonnes | **fait** (avec 2 retouches, voir écarts 4 et 5) | `tests/etape5-ensemble.test.ts` (A8) ; `layout-audit.js` 18 tailles d'écran sans problème. La comparaison Android a montré 2 mots coupés par Android (« Indépen-dance », « récomp-enses ») : corrigés |
| A9 | Aucune fonctionnalité retirée, aucun calcul changé, rien dans `src/core`, aucune clé supprimée, FR + EN | **fait** | `git diff 8c711e1 -- src/core` : vide ; `src/i18n` : 36 clés AJOUTÉES (FR et EN), aucune supprimée ; e2e 33/33 (979 vérifications) ; voir les questions 1 à 3 |
| B1 | « Bonjour 👋 », pastille « Démo » + « Créer mon profil › » | **fait** | `tests/etape5-accueil.test.ts` ; `accueil-*.png` |
| B2 | Carte d'accueil compacte : plafond par jour, mois à droite, œil ; disponible, « Mis de côté › », total ; « Comment c'est calculé ? » | **fait** | `tests/etape5-accueil.test.ts` ; `accueil-*.png` |
| B3 | « Mis de côté » se déplie : « Dans vos comptes » puis « Gardé ailleurs » ; somme = montant | **fait** | `accueil-deplie-*.png` (mêmes lignes, mêmes montants que la maquette) |
| B4 | 4 grandes tuiles (Historique, Revenu, Transfert, Parler) | **fait** | `tests/etape5-accueil.test.ts` ; `accueil-*.png` ; e2e `lot-a-home`, `voice-consent` (« Parler » devient « Saisir » après « Non, je tape », I1). Voir question 2 |
| B5 | « À lire · N » regroupe TOUS les messages, étiquette + « Écouter » | **fait** — **question 1** | `tests/etape5-notifications.test.ts` ; `accueil-*.png`. La maquette montre 6 messages, l'application 17 (voir question 1) |
| B6 | Dernières opérations par jour, icône du dictionnaire, logo de l'opérateur, montant | **fait** | `tests/etape5-accueil.test.ts` ; `accueil-*.png` (« 20 OCT. », moto rouge, Canal+ = télévision, badge Orange) |
| B7 | Enveloppes en bulles (anneau), « Gérer (N) » | **fait** | `tests/etape5-accueil.test.ts`, `tests/etape5-budget.test.ts` ; `accueil-*.png` ; e2e `coach-budget` (« Dépassé de 20 000 FCFA ») |
| B8 | Mois en cours : Revenus, Dépenses, Épargne nette, Reste à répartir | **fait** | `tests/etape5-accueil.test.ts` ; `accueil-*.png` |
| B9 | Objectifs avec anneaux ; Mes récompenses + DineroX IA ; Rapports ; « Votre analyse » dans « À lire » | **fait** (écart 5) | `tests/etape5-accueil.test.ts` ; `accueil-*.png` |
| C1 | Carte verte flottante : anneau doré « % consommé », reste, Prévu, Dépensé, À répartir | **fait** | `tests/etape5-budget.test.ts` ; `budget-*.png` (mêmes chiffres que la maquette : 90 %, 44 000, 420 000, 376 000, 328 500) |
| C2 | Onglets Enveloppes / Notifications (N) ; bulles avec % ; « Tout marquer comme lu » ; « Nouvelle » et « Automatique » | **fait** — **question 1** | `tests/etape5-budget.test.ts` ; `budget-*.png`. « Notifications (5) » au lieu de « (3) » : même question que B5 |
| D1 | « Objectifs » + « Nouveau » ; carte verte « Épargne pour vos projets » (%, montant, visé, reste, barre dorée) | **fait** | `tests/etape5-objectifs.test.ts` ; `objectifs-*.png`. Étape 10 : « FCFA » en petit à côté du montant, comme la maquette |
| D2 | Vignettes 2 colonnes, anneau, étiquette, nom, montants, rythme, %, + ; projets, moment fort, réserve | **fait** | `tests/etape5-objectifs.test.ts` ; `objectifs-*.png` ; e2e `goals-contribute`, `reserve`, `family`. Étape 10 : bouton + de 48 dp (rond de 32 dessiné) ; la phrase « … dans N semaines : … par semaine » est lue sur la vignette du moment fort |
| D3 | « Ordre de priorité » ouvre les ↑↓ ; aide de la réserve ; « Répartir chaque mois » | **fait** (écart 6) | `tests/etape5-objectifs.test.ts` ; `objectifs-*.png` |
| E1 | Disparaît au × ou à la fin de « Écouter » | **fait** | `tests/etape5-notifications.test.ts` ; e2e `coach-open` (×), `coach-advice` (fin de lecture) |
| E2 | Un seul rappel après 3 jours ou la veille d'une échéance | **fait** | `tests/etape5-notifications.test.ts` |
| E3 | Aucun message supprimé ; tous dans « À lire », ceux du budget aussi dans Budget ; sans doublon | **fait** — **question 1** | `tests/etape5-notifications.test.ts` ; l'écran Notifications garde tous les constats ; e2e `coach-open` (un point du résumé qui est le même fait qu'une alerte n'est pas répété) |
| E4 | Mémoire locale par identifiant ; aucun calcul changé | **fait** | `tests/etape5-notifications.test.ts` (`services/readState.ts`, rangé par compte) |
| F1 | En-tête commun ; « Plus » + « Local » ; carte « Patrimoine net consolidé » ; grille pastel 4 par ligne par thème ; mêmes rubriques, même ordre, mêmes conditions | **fait** (écarts 4 et 7) | `tests/etape5-plus.test.ts` ; `plus-*.png`. Étape 10 : noms courts de la maquette (« Mon score », « Donner mon avis », « INTELLIGENCE »), nom complet lu ; « FCFA » en petit. Inviter / WhatsApp / Avis : cachés en démo locale (mêmes conditions qu'avant) |
| G1 | Comme `FINAL-comptes.png` : Argent disponible, comptes et épargne, logos, icônes 3D | **fait** — **question 3** | `tests/etape5-comptes.test.ts` ; `comptes-*.png` |

## Questions au fondateur (rien n'a été tranché à sa place)

1. **« À lire » : tous les messages ou les premiers ?** (B5, C2, E3) Sur les mêmes données de
   démonstration, la maquette montre « À lire · 6 » (3 alertes, le conseil du jour, l'échéance
   Tonton Yao, « Votre analyse ») et le Budget « Notifications (3) ». C'est exactement ce que
   l'ancien accueil affichait (les 3 premiers constats + « Voir tout » vers Notifications). E3
   demande que TOUS les messages arrivent dans « À lire » : l'application en montre 17 à 18 selon le jour
   (+ « Budget Épargne entièrement utilisé », « 2 mois consécutifs », 2 rythmes d'objectif,
   7 « paiement régulier détecté », « 18 % de plus que le mois dernier ») et le Budget 5 ; la cloche
   affiche « 9+ ». L'Accueil est donc beaucoup plus long que la maquette. Choix possibles :
   (a) garder tout (E3 à la lettre) ; (b) montrer les 3 premières alertes + le conseil + le coach
   + l'analyse, avec « Voir tout (N) » vers l'écran Notifications (comme la maquette).
2. **Tuile « Parler » après 10 saisies** (B4). L'ancienne bulle se réduisait à une ligne après
   10 saisies réussies ; la tuile de la maquette a une taille fixe, il n'y a plus rien à réduire
   (l'exemple reste). À confirmer.
3. **Comptes : cadre « Logos des opérateurs (fichiers du fondateur) »** (G1). La maquette le montre
   sous l'Épargne ; c'est une planche de présentation des fichiers, pas une fonction : il n'est pas
   ajouté à l'écran. Les logos sont utilisés partout où un compte d'opérateur apparaît.

## Écarts nécessaires (déjà faits, à valider)

4. **Grille de Plus : marge latérale 4 dp au lieu de 8** (A8 passe avant). « Indépendance »
   (Inter 600, 11 px) mesure 76,1 dp ; avec 8, la colonne fait 76 dp et Android coupait le mot
   (« Indépen-dance »). Différence invisible à l'œil.
5. **« Mes récompenses » / « DineroX IA » : marge 12, espace 8, icône 32** (maquette 14 / 10 / 36).
   « récompenses » (14 px, ≈ 92 dp) ne tenait pas dans les 85 dp offerts : Android coupait le mot.
6. **« Modifier le montant »** sous « Répartir chaque mois » (absent de la maquette) : garde la
   possibilité existante de changer ce montant (aucune fonctionnalité retirée).
7. **Icône « Famille » (Planifier)** : celle de l'application (deux personnes), dessin de la
   maquette non retrouvé dans le jeu d'icônes ; à confirmer.
8. Déplacés sans rien perdre (déjà notés aux étapes 3 à 7) : « dont … à venir » et part du revenu
   déclaré d'une enveloppe → fiche de l'enveloppe et lecteur d'écran ; phrase d'accroche, nombre
   d'objectifs et conseil d'épargne des Objectifs → lecteur d'écran et « À lire » ; « J'ai compris »
   du résumé du coach → × de chaque message.

## Contrôles

- `npm run check` : 1739 tests, lint à zéro.
- e2e d'un seul tenant sur le code final : 33/33 parcours, 979 vérifications, code de sortie 0.
- Aucune APK fabriquée, H1 (« À propos ») non touché, aucun déploiement.
