# Maquette VALIDÉE par le fondateur (2026-10-21) — référence unique de l'étape 4

C'est CE dossier qui fait foi. Les essais des autres dossiers (fond vert dégradé, versions
flottantes A/B/C, mois dans la phrase…) sont abandonnés.

- `MAQUETTE-1-accueil.png`, `MAQUETTE-2-budget.png`, `MAQUETTE-3-objectifs.png`, `MAQUETTE-4-plus.png` :
  chaque écran du haut jusqu'en bas, en clair et en sombre (360 dp).
- `ecrans/` : les mêmes écrans en une seule image longue chacun (720 px = 360 dp × 2).
- `maquette-index.html` : `?d=b&s=homefull|budgetfull|goalsfull&t=light|dark&sit=0&hero=2&m=4&f=f4&demo=2`
  (à servir depuis `dinerox/docs/design-pro/` ; polices et icônes : `directions/fonts`, `icones/`).
- `maquette-plus-clair.html` / `maquette-plus-sombre.html` : écran Plus.
- Palette exacte des ronds de couleur : `../design-pro-paves-plus/README.md`.

Décisions :
1. Aucun dégradé. Fond sable en clair, fond sombre actuel en sombre.
2. Carte d'accueil compacte (≈ 200 dp au lieu de 319) : « Votre plafond de dépenses par jour »,
   montant, étiquette du mois en cours à droite du montant, œil seul (accessibilité : « Masquer
   les montants »), sans la phrase « Il vous reste … » ; 4 lignes de détail inchangées.
3. Cartes vertes (Accueil, Objectifs, Plus) flottantes : marges 8 dp, rayon 22 ; clair : ombre verte
   marquée ; sombre : liseré clair 1 dp + ombre noire + léger halo vert (CSS `f4`).
4. Menus et accès : ronds de couleur pleine (icône Ionicons pleine), regroupés dans des cartes,
   3 colonnes, sans description visible ; « Application » en liste.
5. Contenus (enveloppes, objectifs, réserves, moments forts) : en LISTE, icônes 3D validées ;
   « Libre » : sacs de courses.
6. Logos des opérateurs Mobile Money sur tous les écrans.
7. Mode démonstration : le grand encadré explicatif est SUPPRIMÉ de l'accueil. À la place, une ligne
   discrète : pastille « Démo » (icône fiole) à gauche, lien « Créer mon profil › » à droite (même
   action qu'avant). Le texte explicatif reste en libellé d'accessibilité (lecteur d'écran).
8. Carte d'accueil, « Mis de côté » (version du FONDATEUR, 2026-10-21 — remplace toute version antérieure) :
   la petite ligne « dont {montant} hors de vos comptes » est SUPPRIMÉE de la carte. La ligne
   « Mis de côté {montant} › » devient TOUCHABLE et se DÉPLIE sous elle avec tout le détail :
     Dans vos comptes : une ligne par compte d'épargne / réserve posée sur un compte
       (ex. « Compte épargne (Ma moto) 450 000 », « Réserve famille (sur Espèces) 50 000 ») ;
     Gardé ailleurs : objectifs et réserves « déclaré au départ » (ex. « Ma moto, déclaré au départ
       300 000 »), tontines « versé, à recevoir à votre tour » (ex. « Tontine du bureau, versé 30 000 »).
   La somme du détail = le montant « Mis de côté » affiché. Aucun calcul changé : réutiliser les
   fonctions existantes (`positionOf` / `accountPositions`, `goalBacking`, `tontineLedgerPositions`
   appelé tontine par tontine) depuis l'interface, sans modifier `src/core`. Le texte de l'ancienne
   ligne reste dans le libellé d'accessibilité. EN : « In your accounts » / « Kept elsewhere » /
   « declared at the start » / « paid in, to receive on your turn ».
