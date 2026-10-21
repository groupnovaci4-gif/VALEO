# Audit visuel — refonte « design-pro » (2026-10-21)

Branche `design-pro` (partie de `correction-defilement`, puis `dinerox-main` fusionnée : `8f84059`).
Captures : export web branché sur les émulateurs, **360 × 800**, mode démonstration (données
fictives), thème clair puis sombre — `docs/design-pro/captures/{light,dark}/`. Script :
`node e2e/captures-design-pro.js` (le même servira pour les captures « après »). Les captures sur
l'émulateur Android sont dans `captures/android/` (§ 14).

Aucun code de l'application n'a été modifié pour cet audit.

---

## 1. Le diagnostic en une phrase

L'application n'a pas **un** style mais **deux**, qui cohabitent : l'ancien (la plupart des
écrans) et le « v2 » commencé en octobre (Accueil, Budget, Saisie : 12 fichiers sur 74). Chaque
écran a donc son en-tête, sa façon d'écrire les montants, ses cartes et ses badges. C'est ce
mélange, plus que chaque détail, qui donne l'impression de « désorganisé » et de « fait par une
IA » : rien ne se répond d'un écran à l'autre.

## 2. Problèmes communs à toute l'application

| # | Problème | Où on le voit | Pourquoi c'est gênant |
|---|---|---|---|
| G1 | **Trois en-têtes différents** : « logo + DineroX + cloche « Notifications » écrite + avatar » (Accueil, Budget) ; « logo + DINEROX en capitales + nom de l'onglet en petites capitales » (Objectifs, Plus, Paramètres) ; « flèche + titre » (Historique, Comptes, Épargne…) | 10, 13, 14, 19, 20 | L'utilisateur ne reconnaît pas qu'il est dans la même application. Le mot « Notifications » écrit en toutes lettres prend la moitié de la largeur à 360 px. |
| G2 | **Trois polices** : Plus Jakarta Sans (titres), Inter (texte), **JetBrains Mono** (montants des listes : Historique, Comptes, Épargne) | 12, 15, 16 | Les montants en police « machine à écrire » font technique et bon marché. Sur Accueil/Budget les montants sont en Inter, ailleurs en mono : le même chiffre n'a pas la même allure. |
| G3 | **Le logo dans chaque en-tête** (carré noir, flèche orange et verte) | toutes les pages à onglets | Le carré noir à fort contraste attire l'œil avant le chiffre principal ; les banques sérieuses ne répètent pas leur logo sur chaque écran. |
| G4 | **Dégradés et halo** : carte « Reste par jour », carte « Épargne projets globale », carte « Patrimoine » en dégradé vert avec ombre colorée (halo turquoise en sombre) | 10, 14, 19 | Exactement le « look IA » à bannir. Coûteux à dessiner sur les téléphones d'entrée de gamme. |
| G5 | **Emojis dans l'interface** : 👋 (Bonjour, Bon retour), 🔴 ⚠️ 💡 🎯 🎉 dans les alertes, 🤝 réserve, 🏍 objectif, emojis de catégorie (🎉 🍛 🚕 👨‍👩‍👧) dans les listes de l'accueil | 02, 10, 13, 14 | Rendu différent selon le téléphone, ton « gadget ». Dans les alertes, l'emoji **double** l'icône déjà présente (« ! » rouge **puis** 🔴). |
| G6 | **Deux jeux d'icônes de catégorie** : emojis sur l'Accueil, icônes Ionicons sur fonds pastel dans Historique et Saisie, pour les **mêmes** opérations (Canal+ = 🎉 sur l'Accueil, 🎮 manette ailleurs) | 10-3 vs 12 | Incohérence visible immédiatement. |
| G7 | **Couleurs pastel au hasard** pour les catégories et les modules (violet, orange, bleu ciel, rose, jaune, vert) | 13-2, 19-2 | Aucune couleur n'a de sens ; le rouge et le vert « métier » (alerte, entrée) se perdent au milieu. |
| G8 | **Badges et pastilles partout** : « 2 actifs », « 20 % global », « Local », « COMPTE ACTIF », « DineroX DineroX Family », « 10 modules », « Démo » | 14, 19, 20 | Bruit visuel, informations rarement utiles. |
| G9 | **Coins très arrondis** (24 à 28 px sur les cartes, boutons en pilule) mélangés à des coins à 8 px (pavé numérique, puces) | partout | Effet « jouet » et incohérence. |
| G10 | **Cartes toutes pareilles** : bordure grise + ombre + fond blanc pour tout (chiffre clé, alerte, liste, réglage) | 13, 18, 19 | Rien ne dit ce qui est important ; la hiérarchie repose seulement sur la taille du texte. |
| G11 | **Deux noirs différents en mode sombre** : fond vert-noir (#0F1412) sur Accueil/Budget, bleu-nuit (#0B1120) sur Objectifs, Historique, Plus, et barre d'onglets bleu-nuit partout | dark/10, 12, 14 | On voit la couture entre l'ancien et le v2. |
| G12 | **Libellés qui passent à la ligne** sur 360 px : noms de comptes (« Compte / bancaire »), sous-titres des opérations sur 3 lignes, « Sortie / d'argent » | 10-2, 16, 11 | Les listes deviennent hautes et difficiles à parcourir ; un montant par écran au lieu de cinq. |
| G13 | **Montants tronqués** : « 4 385 500 F… » (Plus) | 19-1 | Le chiffre principal de l'écran est coupé. |
| G14 | **Écrans de connexion jamais en sombre** : avant connexion, l'application est toujours claire, même si le téléphone est en mode sombre (le thème vient du profil) | 01-03 | Flash blanc la nuit. À traiter dans le lot (e). |
| G15 | **Couleurs écrites en dur** : 14 codes couleur dans 3 fichiers d'écrans, hors jetons | code | Petit, mais à ranger dans les jetons. |

Ce qui est **déjà bien** et qu'on garde : une seule famille d'icônes (Ionicons) ; polices
embarquées (fonctionnent hors ligne) ; contraste du texte principal vérifié (≥ 4,5:1) ; zones de
toucher de 48 dp ; barre d'onglets à 5 places avec le micro au centre ; pavé numérique de la
Saisie (lisible, grand).

## 3. Accueil (`10-accueil-*`)

- **Hiérarchie** : avant le chiffre principal on traverse l'en-tête, le sélecteur « Démo », « Bonjour 👋 » et le bandeau violet de démonstration ; le « Reste par jour » n'arrive qu'au milieu de l'écran.
- **Le chiffre principal est dit deux fois** : « 38 681 FCFA » en grand, puis la phrase « Il vous reste 38 681 FCFA par jour… » juste dessous.
- Carte en dégradé : quatre montants blancs de tailles proches (« Argent disponible », « Mis de côté », « dont… », « Total ») qui se concurrencent.
- **Raccourcis** : « Historique » pleine largeur au-dessus de « Revenu » / « Transfert », bordures grises épaisses, ce qui donne trois boutons de poids égal.
- Carte « Dites-moi ce que vous avez dépensé… » : bloc vert pâle avec gros bouton « Parler » ; elle répète le bouton micro de la barre d'onglets.
- **Dernières opérations** : emojis de catégorie ; sous-titres sur 3 lignes ; seul le transfert a un cercle bleu plein.
- **À retenir** : alertes sur fond rose avec liseré rouge, icône « ! » **et** emoji 🔴, plus un bouton « Écouter » dans chaque carte. Trois signaux d'alerte pour une seule information.

## 4. Saisie (`11-saisie-*`)

- Bonne base : pavé numérique large, montant au centre.
- Deux sélecteurs segmentés empilés (Parler/Clavier, Sortie/Entrée) **identiques visuellement** alors qu'ils n'ont pas la même importance.
- « Sortie d'argent » passe à la ligne ; la coche ✓ dans le segment choisi fait doublon avec le fond blanc.
- **Montant à 0 en rouge vif** avant toute saisie : on voit une alerte alors que rien n'est faux.
- Puces de catégorie en contour gris avec icônes multicolores : on ne voit qu'une rangée et demie.
- Sur le web, la feuille ouvre directement le clavier (pas de micro dans le navigateur) ; l'enregistreur est capturé sur Android (§ 14).

## 5. Historique (`12-historique-*`)

- **Montants en police monospace**, alors que le total du jour au-dessus est en Inter : deux styles pour le même chiffre, côte à côte.
- **Trois rangées de puces** (mois, comptes, catégories) remplies en vert plein et coupées au bord droit : l'écran est rempli de filtres avant la première opération.
- Encadré « Période affichée » : quatre lignes colorées (vert, rouge, vert gras), pas de chiffre principal.
- Un « 0 FCFA » vert sur la journée du transfert : vert pour zéro.
- L'en-tête de jour répète la date déjà écrite dans le sous-titre de l'opération.

## 6. Budget (`13-budget-*`)

- Quatre pavés de chiffres de **même taille** (Reste, Prévu, Dépensé, Reste à répartir) : aucun chiffre principal.
- Les alertes sont des **pavés en grille de deux**, avec « ! » + 🔴 / ⚠️ + texte sur 3 lignes, puis « Écouter » détaché **sous** la carte (il flotte entre deux pavés).
- Enveloppes en grille de deux : pastilles de couleurs vives (violet, orange, bleu, rose), barres de progression épaisses en rouge ou or, et le statut dit deux fois (« Dépassé de 40 000 » puis « ! Dépassée »).
- En-tête « logo + Notifications + avatar » + sélecteur « Démo » : environ 230 px avant le titre.

## 7. Objectifs et épargne (`14-objectifs-*`, `15-epargne-*`)

- En-tête « DINEROX / OBJECTIFS » en capitales (différent de l'Accueil) ; sélecteur « Démo » d'un autre style (pastille grise, emoji 🧪 au lieu de l'icône).
- Titre « Objectifs » + badge « 2 actifs » + gros bouton « + » carré vert.
- Phrase d'accroche sous le titre (« DineroX vous aide à transformer… ») : ton marketing.
- Carte dégradée avec étoile, petites capitales espacées, badge « 20 % global », barre **orange** et halo : la carte la plus « IA » de l'application.
- Réserve : emoji 🤝 ; texte d'explication gris sous la carte.
- **Épargne** : le total en vert, le montant du compte en monospace, deux boutons pilule (plein et pastel) puis deux liens avec icônes, et un objectif avec emoji 🏍. Cinq styles d'action dans une même carte.

## 8. Comptes (`16-comptes-*`)

- Bandeau bleu « DineroX ne détient pas votre argent » toujours affiché en haut : il prend la place du chiffre principal.
- « Argent disponible » en noir (vert ailleurs) ; montants des comptes en monospace ; noms sur deux lignes.
- Bouton « + » en rond noir plein : un bouton noir unique dans toute l'application.
- **Incohérence de chiffre (voir § 15, point 1)** : « Argent disponible » = **705 500 FCFA** ici, **655 500 FCFA** sur l'Accueil, au même moment.

## 9. Tontines (`17-tontines-*`)

- Mention légale en gris en tête (obligatoire, règle 20) mais sans mise en forme : elle se lit comme du texte perdu.
- La carte de la tontine est un bloc de phrases (4 lignes), sans chiffre principal (prochaine cotisation, tour).
- Bouton « Nouvelle tontine » pleine largeur au milieu de l'écran, entre deux sections.
- La section « Tontines saisies comme récurrences » est une carte de texte avec une puce pastel.

## 10. Dettes (`18-dettes-*`)

- Deux pavés « Total que je dois » (rouge) / « Total qu'on me doit » (vert) : le rouge pour une dette normale ressemble à une alerte.
- La ligne de dette a une **barre de progression sans légende** (on ne sait pas ce qu'elle mesure) et « Prochaine échéance : … » coupé.
- Bouton « + » rond noir (comme Comptes).

## 11. Plus et Réglages (`19-plus-*`, `20-reglages-*`)

- **Plus** : surtitre « VUE D'ENSEMBLE », titre, pastille « Local », carte dégradée « Patrimoine net consolidé » avec un chiffre **tronqué**, puis « MON ARGENT · 10 modules » et une **grille de 10 pavés** identiques (icône pastel + titre + description de 3 lignes). Un menu qui ressemble à un tableau de bord : c'est le cliché « app générée ».
- La grille tient 4 pavés par écran : il faut faire défiler 3 écrans pour un simple menu.
- **Paramètres** : en-tête « DINEROX / PARAMÈTRES » **plus** une flèche « ← » et le titre « Paramètres » répété ; badge « COMPTE ACTIF » ; pastille « DineroX DineroX Family » (nom de démonstration + formule collés) ; sections en CAPITALES ; une deuxième section s'appelle encore « PARAMÈTRES ».
- Rangées de réglages avec des pastilles d'icônes de couleurs différentes (vert, or, violet) sans signification.

## 12. Famille et Assistant IA (`21-famille-*`, `22-assistant-*`)

- **Famille** (démo, hors ligne) : bandeau bleu + une phrase, puis un écran vide. Aucun état vide dessiné.
- **Assistant** : titre « Parler à DineroX » + avertissement sur 2 lignes dans l'en-tête ; bulle de bienvenue étiquetée « DineroX » en **or** ; six puces d'exemple en pilules blanches empilées (rendu « chatbot » générique) ; montants des exemples sans espace (« 5000 », « 450000 »).
- Bouton d'envoi gris, rond, à droite du micro : la zone de saisie est étroite.
- À présenter comme un **outil** : pas de mise en scène de conversation, pas de couleur réservée à l'IA.

## 13. Bienvenue, Connexion, Inscription (`01-03`)

- **Bienvenue** : photo plein écran avec voile vert, logo, nom, slogan en trois temps et pitch « Votre intelligence financière personnelle » (mot à bannir, cf. § 16). Deux gros boutons pilule puis deux liens avec icônes, puis la mention légale et la **version en monospace** (« v1.6.0 · 8f84059 · date ») visible par tous.
- **Connexion** : « Bon retour 👋 », logo centré, bouton « Se connecter » **désactivé en vert délavé** (on croit à un bug), « ou » isolé, lien « Inscrivez-vous » coupé en fin de ligne.
- **Inscription** : 7 champs à la suite, sans regroupement ; logo répété ; l'aide « ex. +225 07 07 07 07 07. » passe à la ligne.
- Aucune version sombre (G14).

## 14. Sur l'émulateur Android

Captures : `captures/android/` (émulateur Android 17, écran réglé à 360 × 800 dp, version de
développement, mode démonstration, thème clair) : Accueil, Saisie (voix et clavier), Budget,
Objectifs, Plus. Mêmes défauts que sur le web, plus :

- **Dégradés en bandes** : la carte « Reste par jour » montre une cassure verticale nette vers la
  droite et une bande horizontale en bas ; la carte « Patrimoine » une bande sous le montant
  (`10-accueil-1`, `10-accueil-2`, `19-plus-1`). C'est le dégradé dessiné par morceaux sur
  Android : il fait « bricolé ». Raison de plus pour des aplats.
- **Emojis Android** : 🔴 ⚠️ 👋 n'ont pas le même dessin que sur le web ou iPhone ; le rendu
  change d'un téléphone à l'autre.
- **Ombres** : les cartes ont une ombre grise plus marquée que sur le web (élévation Android),
  ce qui alourdit les grilles de pavés (Budget, Plus).
- **Saisie vocale** (`11-saisie-voix`) : le grand bouton micro, puis la question « Dicter avec
  le service de votre téléphone ? », un encadré violet de 5 lignes et deux boutons : l'écran
  est occupé par l'explication plutôt que par l'action. Le consentement doit rester (règle 22),
  mais sa mise en forme peut être plus calme.
- Le montant du patrimoine **n'est pas tronqué** sur Android (il l'est sur le web, police
  légèrement plus large) : le défaut G13 est donc limite, pas systématique ; à 320 dp ou en grand
  texte il le sera aussi sur téléphone.

## 15. Erreurs et incohérences repérées en route (rien n'est corrigé)

1. **« Argent disponible » : deux chiffres différents.** L'Accueil affiche 655 500 FCFA, l'écran
   Comptes 705 500 FCFA (démo, même moment). L'Accueil lit `useFinance().money`
   (`positionOf`, `core/position`) ; Comptes lit `useFinance().position`
   (`moneyPosition`, `core/balance`), une autre formule, sous le **même libellé**
   `home.available`.
   *Conséquence* : un utilisateur qui compare les deux écrans ne sait plus combien il a, ce qui
   ruine la confiance dans une appli financière.
   *Proposition* : que Comptes affiche `money.available` comme l'Accueil (changement d'une ligne
   d'écran, aucun fichier de `src/core`). Un test le vérifierait d'abord. **À ton accord.**
2. **« Patrimoine net consolidé » tronqué** sur Plus à 360 px sur le web (« 4 385 500 F… ») ;
   à la limite sur Android. Le chiffre principal de l'écran devient illisible dès 320 dp ou en
   grand texte. Sera traité par le lot (d).
3. **« DineroX DineroX Family »** dans les Paramètres : nom affiché + nom de formule collés sans
   séparateur (au moins en démonstration). Lot (d).
4. **Thème avant connexion** toujours clair (G14). Lot (e).
5. **Deux systèmes de design** dans le code (`DesignV2` + anciens jetons) : la refonte doit
   **remplacer** les deux par un seul, sinon on ajoute un troisième style.

## 16. Textes à revoir (aucun n'est changé — pour ton accord, à l'étape 4)

Relevé préliminaire ; la liste complète (clé, avant, après, raison, FR puis EN) sera donnée lot
par lot.

- 31 textes français contiennent un emoji (`auth.signin.title` « Bon retour 👋 », `home.hello`,
  `ins.envelope_threshold.*` 🔴 ⚠️, `ins.category_increase` 💡, `ins.goal_*` 🎯 🎉,
  `goal.custom` ✏️, `goal.empty.title` 🎯, `notif.savingsReminder.title` 🐷,
  `share.trophy.title` 🏆, les « ✓ » de confirmation…).
- « intelligence » : `auth.welcome.pitch` (« Votre intelligence financière personnelle… »),
  `more.intelligence` (« Intelligence financière »).
- Ton marketing : `goal` sous-titre « DineroX vous aide à transformer votre argent en projets
  concrets ».
- Exemples de l'assistant sans séparateur de milliers (« 5000 », « 450000 »).

## 17. Estimation

| Étape | Contenu | Durée estimée (travail de ma part) |
|---|---|---|
| 2 | Deux directions, 3 écrans × clair/sombre chacune, Figma | 1 jour |
| 3 | Jetons uniques, composants communs, retrait de l'ancien système, doc, Figma | 2 jours |
| 4a | Accueil, Saisie | 1 jour |
| 4b | Historique, Comptes, Épargne | 1 jour |
| 4c | Budget, Objectifs, Tontines, Dettes | 1,5 jour |
| 4d | Plus, Réglages, Famille, Assistant | 1 jour |
| 4e | Bienvenue, Connexion, Inscription, Onboarding (+ thème sombre avant connexion) | 1 jour |
| 5 | Vérification complète (320/360/768, clair/sombre, grand texte), rapport | 0,5 jour |
| | **Total** | **environ 9 jours de travail**, soit 2 à 3 semaines de calendrier avec tes relectures à chaque arrêt |

Le plus gros risque de délai : les écrans secondaires non listés (fiches d'un compte, d'une
dette, d'une tontine, catégories, rapports…) qui utilisent les mêmes composants et changeront
d'allure à l'étape 3. Ils seront capturés et vérifiés avec le lot le plus proche.
