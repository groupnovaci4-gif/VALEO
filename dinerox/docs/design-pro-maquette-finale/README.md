# Maquette FINALE — choix du fondateur (2026-10-22), à valider avant toute consigne à Claude Code

Choix : **Accueil B** avec la partie « Enveloppes (bulles) / Octobre / Objectifs (anneaux) » de C ;
**Budget C** avec la carte principale verte et flottante (comme la carte d'accueil) ;
**Objectifs B** avec progression CIRCULAIRE autour de l'icône ; **Plus B**.
Inchangés : carte d'accueil (plafond par jour…), logos des opérateurs du fondateur, couleurs, polices,
icônes 3D, barre d'onglets. Aucun dégradé.
Notifications : « À lire » (accueil) et notifications (budget) disparaissent une fois lues (× ou
« Tout marquer comme lu ») ; « Écouter » reste dans chaque notification.
Planches : `FINAL-accueil.png`, `FINAL-budget.png`, `FINAL-objectifs.png`, `FINAL-plus.png` (clair | sombre).
Écrans et HTML : `ecrans/`. Générateur : `base.py`, `opts.py`, `final.py`.

## Icônes : le LIBELLÉ décide (fondateur, 2026-10-22)
- `dictionnaire-icones.json` + `dictionnaire-icones.png` : libellé → icône (50 entrées). Règle : libellé de
  l'opération d'abord (ex. « Moto » → moto rouge, même pour un virement), puis objectif lié, puis
  sous-catégorie, puis catégorie ; insensible à la casse et aux accents.
- Épargne : cochon DE PROFIL (`icones-a-ajouter/pig*.webp`, Fluent « Pig » 3D), plus jamais la tête de face.
- `icones-a-ajouter/` : `pig` et `cooking` (cuisine) à ajouter à `assets/icons3d/` (mêmes tailles 1x/2x/3x).
- Enveloppe « Alimentation & boissons » : panier (basket) ; « Restaurant » : plat avec poisson.
- Gaz : `bonbonne_gaz` reste provisoire (dessin à faire faire par un designer, même nom de fichier).
- Toutes les icônes sont EMBARQUÉES dans l'application (aucun téléchargement).
- Gaz et coiffure : images FOURNIES PAR LE FONDATEUR (2026-10-22), utilisées sur sa décision et sous sa
  responsabilité ; fond blanc retiré, recadrées au carré : `icones-a-ajouter/bonbonne_gaz*.webp` (REMPLACE
  le provisoire) et `coiffure*.webp` (nouvelle). En sombre, le rond clair #3A362F derrière les icônes de
  contenu s'applique aussi à elles.

## Notifications « À lire » (fondateur, 2026-10-22)
- Contiennent : alertes budget, conseil du jour ET les points de VOTRE COACH (échéances, rappels…),
  chacun avec son étiquette (« Alerte budget », « Conseil du jour », « Votre coach »). Le coach n'est
  pas supprimé : ses messages sont ici. Un point du coach qui répète une alerte déjà affichée n'est
  pas montré deux fois. « Votre analyse » reste une carte à part.
- Une notification DISPARAÎT : quand on touche ×, OU quand la lecture « Écouter » arrive à la fin.
- RAPPEL : si la situation n'a pas changé (budget toujours dépassé, échéance pas réglée), elle peut
  revenir UNE fois en rappel après 3 jours (ou la veille d'une échéance) ; elle ne reste jamais affichée
  en permanence. Une situation NOUVELLE crée une nouvelle notification. Mémorisation locale par
  identifiant ; aucun calcul changé.
- Même comportement pour les notifications de l'onglet Budget.
