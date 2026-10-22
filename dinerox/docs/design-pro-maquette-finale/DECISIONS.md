# DÉCISIONS VALIDÉES PAR LE FONDATEUR — référence UNIQUE et COMPLÈTE (2026-10-22)

Tout ce dossier fait foi. Ce qui n'est pas écrit ici ne change pas. Les essais des autres dossiers
(fond vert dégradé, flottaisons A/B/C, mois dans la phrase, « gardés ailleurs », options A/B/C non
retenues) sont ABANDONNÉS.

## Images de référence (clair | sombre)
1. `FINAL-accueil.png` — Accueil (option B + partie « Enveloppes / Octobre / Objectifs » de l'option C)
2. `FINAL-accueil-mis-de-cote-deplie.png` — carte d'accueil, « Mis de côté » déplié
3. `FINAL-budget.png` — Budget (option C, carte principale verte et flottante)
4. `FINAL-objectifs.png` — Objectifs (option B, progression circulaire)
5. `FINAL-plus.png` — Plus (option B)
6. `FINAL-comptes.png` — Comptes (logos du fondateur)
7. `dictionnaire-icones.png` + `dictionnaire-icones.json` — libellé → icône
8. `FINAL-icones-gaz-coiffure-cochon.png` — nouvelles icônes
HTML exacts : `ecrans/` (Comptes : `ecrans/maquette-comptes-index.html?d=b&s=accountsfull&t=light&sit=0&hero=2&m=4&f=f4&demo=2`).

## A. Partout
- A1. Couleurs, polices (Plus Jakarta Sans + Inter), coins arrondis de la direction B. AUCUN dégradé.
  Fond sable en clair, fond sombre actuel en sombre.
- A2. En-tête des onglets : « Démo ▾ » (choix de l'espace) en texte simple, cloche (avec pastille du
  nombre de messages à lire), petit avatar rond. Plus de bandeau « DineroX » ni de bouton encadré.
- A3. Icônes de contenu 3D (Fluent, teinte moyenne-foncée, icônes composées validées) ; en sombre, petit
  rond clair #3A362F derrière. Navigation et boutons : icônes au trait.
- A4. LE LIBELLÉ DÉCIDE DE L'ICÔNE (`dictionnaire-icones.json`, 50 entrées) : libellé → objectif lié →
  sous-catégorie → catégorie → type ; sans tenir compte des majuscules ni des accents, mot entier.
  « Moto » = moto rouge (même pour un virement). Restaurant/garba = plat avec poisson ; alimentation =
  panier ; Canal+ = télévision.
- A5. Épargne = cochon DE PROFIL (jamais la tête de face). Gaz = bonbonnes bleues du fondateur. Coiffure =
  dessin du fondateur. Fichiers : `icones-a-ajouter/` (+ `cooking` pour cuisine).
- A6. Logos des opérateurs = fichiers du fondateur (`logos-fondateur/`), tuile blanche arrondie, image
  entière ; sur tous les écrans (Comptes, petit badge sur les opérations).
- A7. Cartes vertes flottantes (Accueil, Budget, Objectifs, Plus) : marges 8 dp, rayon 22, ombre verte
  marquée en clair ; en sombre liseré clair 1 dp + ombre noire + léger halo vert.
- A8. Aucun texte coupé ni « … » sur un nom ; texte agrandi (≥ 1,3) ou écran < 340 dp : moins de colonnes.
- A9. Aucune fonctionnalité retirée, aucun chiffre ni calcul changé, rien dans src/core, aucune clé i18n
  supprimée ; tout nouveau texte en FR et en EN.

## B. Accueil
- B1. « Bonjour 👋 », puis ligne discrète : pastille « Démo » + « Créer mon profil › » (le grand encadré
  de démonstration est supprimé ; son texte devient le libellé d'accessibilité).
- B2. Carte d'accueil compacte (≈ 200 dp) : « Votre plafond de dépenses par jour » (EN « Your daily
  spending limit »), montant, étiquette du mois en cours (« Octobre 2026 ») à droite, œil seul en haut à
  droite (accessibilité « Masquer les montants ») ; Argent disponible, « Mis de côté › », Total de vos
  comptes ; plus de phrase « Il vous reste … » ni de ligne « Masquer les montants » ni de petite ligne
  « dont … hors de vos comptes ». Puis « Comment c'est calculé ? ».
- B3. « Mis de côté › » se DÉPLIE : « Dans vos comptes » (comptes d'épargne, réserves posées sur un
  compte) puis « Gardé ailleurs » (montants déclarés au départ, tontines versées « à recevoir à votre
  tour ») ; somme du détail = montant affiché.
- B4. 4 grandes tuiles : Historique (bleu pâle), Revenu (vert pâle), Transfert (or pâle), Parler (vert
  plein) avec leur petite phrase.
- B5. « À lire · N » regroupe TOUS les messages du coach : alertes (budget, seuils 85 % / 100 % /
  dépassement…), conseils (conseil du jour, conseils IA), points de « Votre coach » (échéances, rappels)
  ET « Votre analyse » ; chacun avec son étiquette (« Alerte budget », « Conseil du jour », « Votre
  coach », « Votre analyse ») et « Écouter » ; voir E (notifications).
- B6. Dernières opérations groupées par jour, icône du dictionnaire, petit logo de l'opérateur, montant.
- B7. Enveloppes en bulles (anneau de progression autour de l'icône) dans une carte, « Gérer (N) ».
- B8. Octobre / Mois en cours : Revenus, Dépenses, Épargne nette, puis Reste à répartir.
- B9. Objectifs en liste avec anneaux ; Mes récompenses + DineroX IA ; Rapports. (« Votre analyse »
  n'est plus une carte à part : elle est dans « À lire », B5.)

## C. Budget
- C1. Carte principale VERTE et FLOTTANTE : anneau doré « % consommé », Reste dans les enveloppes,
  Prévu, Dépensé, À répartir.
- C2. Onglets Enveloppes / Notifications (N) ; enveloppes en bulles (% sous chacune) ; notifications avec
  « Tout marquer comme lu » ; boutons « Nouvelle » (enveloppe) et « Automatique ».

## D. Objectifs
- D1. « Objectifs » + bouton « Nouveau » ; carte verte flottante « Épargne pour vos projets » (%, montant,
  visé, reste, barre dorée).
- D2. Vignettes en 2 colonnes : fond pastel, ANNEAU de progression autour de l'icône, étiquette
  (Priorité N / Moment fort / Réserve), nom, montants, rythme, %, bouton +. Projets, moment fort et
  réserve.
- D3. « Ordre de priorité » ouvre le réglage de l'ordre (les ↑↓ existants y restent) ; texte d'aide de la
  réserve ; « Répartir chaque mois ».

## E. Notifications (Accueil et Budget)
- E1. Un message disparaît quand on touche × OU quand « Écouter » arrive à la fin.
- E2. S'il est toujours d'actualité, il peut revenir UNE fois en rappel après 3 jours (ou la veille d'une
  échéance), jamais en permanence ; une situation nouvelle crée un nouveau message.
- E3. Aucun message du coach n'est supprimé de l'application : alertes, conseils, analyses et points du
  coach arrivent TOUS dans « À lire » (Accueil) ; ceux qui concernent le budget aussi dans les
  notifications de l'onglet Budget. Sans doublon : un même message n'apparaît qu'une fois par liste.
  Si l'application a déjà un écran qui liste ces messages (ex. « Notifications »), un message lu y reste
  consultable ; sinon, ne rien créer de nouveau sans accord du fondateur.
- E4. Mémorisation locale par identifiant ; aucun calcul changé.

## F. Plus
- F1. Même en-tête que les autres onglets ; « Plus » + pastille d'état (« Local ») ; carte verte flottante
  « Patrimoine net consolidé » ; grille d'icônes pastel, 4 par ligne, rangées par thème (Mon argent,
  Intelligence, Planifier, Application) ; mêmes rubriques, même ordre, mêmes conditions d'affichage.

## G. Comptes
- G1. Comme `FINAL-comptes.png` : « Argent disponible », comptes et épargne en liste ; logos du fondateur ;
  icônes 3D pour Cash, banque, épargne (cochon de profil).

## H. À faire avant toute publication publique (pas pour le test du fondateur)
- H1. Écran « À propos » : « Icônes 3D : Fluent Emoji de Microsoft, licence MIT. » (texte à valider).

## I. Méthode
- I1. Reproduire À L'IDENTIQUE ; tout écart nécessaire → demander avant.
- I2. Preuve : images « maquette | application » côte à côte, à la même échelle, clair et sombre, pour
  chaque écran ; vérification par l'assistant du fondateur, puis accord du fondateur.
- I3. APK seulement après cet accord, pour le téléphone du fondateur uniquement.
