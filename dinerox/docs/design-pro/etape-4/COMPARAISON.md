# Étape 6 — vraie application Android à côté de la maquette validée

- **Maquette** : `maquette/` (copie des écrans de `docs/design-pro-maquette-validee/ecrans`, branche du fondateur).
- **Application** : `android/`, application de debug construite depuis `design-pro` (bbffe9d), émulateur Android 37, écran **360 × 800 dp** (720 × 1600 px, densité 320, texte du système à 1,0), mode démonstration.
- Chaque écran est capturé en entier, de haut en bas, glissé de 300 dp par 300 dp (`NN` = ordre de défilement), en clair puis en sombre.

## Accueil

| Maquette clair | Maquette sombre |
|---|---|
| <img src="maquette/homefull-clair.png" width="240"> | <img src="maquette/homefull-sombre.png" width="240"> |

« Mis de côté » **fermé** (clair, puis sombre) : `android/accueil-clair-ferme-01…13.png`, `android/accueil-sombre-ferme-01…13.png`

<img src="android/accueil-clair-ferme-01.png" width="180"> <img src="android/accueil-clair-ferme-02.png" width="180"> <img src="android/accueil-clair-ferme-03.png" width="180"> <img src="android/accueil-clair-ferme-04.png" width="180">
<img src="android/accueil-sombre-ferme-01.png" width="180"> <img src="android/accueil-sombre-ferme-02.png" width="180"> <img src="android/accueil-sombre-ferme-03.png" width="180"> <img src="android/accueil-sombre-ferme-04.png" width="180">

« Mis de côté » **déplié** (« Dans vos comptes » / « Gardé ailleurs ») : `android/accueil-clair-deplie-01…14.png`, `android/accueil-sombre-deplie-01…14.png`

<img src="android/accueil-clair-deplie-01.png" width="180"> <img src="android/accueil-clair-deplie-02.png" width="180"> <img src="android/accueil-sombre-deplie-01.png" width="180"> <img src="android/accueil-sombre-deplie-02.png" width="180">

## Plus

| Maquette clair | Maquette sombre |
|---|---|
| <img src="maquette/plusfull-clair.png" width="240"> | <img src="maquette/plusfull-sombre.png" width="240"> |

<img src="android/plus-clair-01.png" width="180"> <img src="android/plus-clair-02.png" width="180"> <img src="android/plus-clair-03.png" width="180"> <img src="android/plus-clair-04.png" width="180">
<img src="android/plus-sombre-01.png" width="180"> <img src="android/plus-sombre-02.png" width="180"> <img src="android/plus-sombre-03.png" width="180"> <img src="android/plus-sombre-04.png" width="180">

## Budget

| Maquette clair | Maquette sombre |
|---|---|
| <img src="maquette/budgetfull-clair.png" width="240"> | <img src="maquette/budgetfull-sombre.png" width="240"> |

<img src="android/budget-clair-01.png" width="180"> <img src="android/budget-clair-02.png" width="180"> <img src="android/budget-clair-03.png" width="180"> <img src="android/budget-clair-04.png" width="180"> <img src="android/budget-clair-05.png" width="180">
<img src="android/budget-sombre-01.png" width="180"> <img src="android/budget-sombre-02.png" width="180"> <img src="android/budget-sombre-03.png" width="180"> <img src="android/budget-sombre-04.png" width="180"> <img src="android/budget-sombre-05.png" width="180">

## Objectifs

| Maquette clair | Maquette sombre |
|---|---|
| <img src="maquette/goalsfull-clair.png" width="240"> | <img src="maquette/goalsfull-sombre.png" width="240"> |

<img src="android/objectifs-clair-01.png" width="180"> <img src="android/objectifs-clair-02.png" width="180"> <img src="android/objectifs-clair-03.png" width="180"> <img src="android/objectifs-clair-04.png" width="180"> <img src="android/objectifs-clair-05.png" width="180">
<img src="android/objectifs-sombre-01.png" width="180"> <img src="android/objectifs-sombre-02.png" width="180"> <img src="android/objectifs-sombre-03.png" width="180"> <img src="android/objectifs-sombre-04.png" width="180"> <img src="android/objectifs-sombre-05.png" width="180">

## Écarts constatés avec la maquette

1. **En-tête** : logo + sélecteur d'espace « Démo ⌄ » de l'application (la maquette n'a que « Démo ⌄ ») — non cité dans la consigne, gardé.
2. **Raccourcis** (Historique, Revenu, Transfert) et **bulle de saisie** : style actuel gardé (non cités).
3. **Budget** : « Écouter » gardé sous chaque alerte (le retirer supprimerait une fonctionnalité) ; nombre d'enveloppes en gris discret, pas en lien vert.
4. **Plus** : surtitre « VUE D'ENSEMBLE » et pastille « Local » gardés.
5. **Objectifs** : texte d'aide de la réserve gardé ; ↑↓ sans carré gris ; l'étiquette de rythme peut être « Atteint vers … » (logique du plan) ; sur Android, « ÉPARGNE PROJETS GLOBALE » passe sur deux lignes (police Android un peu plus large que le web, texte du système à 1,0 ; sur le web : une ligne).
6. **Textes ajoutés** (FR + EN) : « (sur {compte}) » / « (on {account}) » et la clé de mise en forme `withGoals` du détail « Mis de côté » ; l'étiquette du mois commence par une majuscule (« Octobre 2026 »).
