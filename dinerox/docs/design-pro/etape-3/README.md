# Étape 3 — captures (2026-10-21)

Application RÉELLE (pas des maquettes), mode démonstration, version `8471dd1` + `AccountMark`.

- `android/clair/` et `android/sombre/` : émulateur Android, écran de **360 × 800 dp**
  (build de développement, Metro local) :
  - `accueil-01` à `accueil-16` : l'accueil en entier, défilé jusqu'en bas (en-tête avec la
    cloche seule, carte (b), Canal+ en 📺, alertes sans emoji, enveloppe Famille, objectif moto) ;
  - `saisie-1` (Parler) et `saisie-2` (Clavier) ;
  - `budget-NN` : l'onglet Budget en entier ;
  - `comptes-NN` : l'écran Comptes (logo Orange Money ; la démonstration n'a pas d'autre
    compte d'opérateur).
- `app-web/` : la même démonstration sur l'export web (Chrome, 360 px), clair et sombre.
- `systeme-apercu.png` : la page `docs/design-system-preview.html` (aussi dans Figma, nœud 6-2).

Les écrans pas encore passés en v2 (Comptes, une partie de la saisie, la barre d'onglets en
sombre…) gardent leur ancienne mise en page : ce sont les lots de l'étape 4.
