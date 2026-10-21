# Écrans complets — maquettes après les décisions du 2026-10-21

Accueil, Budget, Objectifs et Plus, du haut jusqu'en bas, en clair et en sombre (360 dp de large,
démonstration du 21 octobre 2026, journée normale : sans les cartes « selon la situation »).

Décisions appliquées : direction B, carte d'accueil (b), icônes de contenu Fluent 3D, Canal+ en
télévision, moto rouge, cloche seule, pavés regroupés avec ronds de couleur pleine (écran Plus,
pavés « Mes récompenses » / « DineroX IA » de l'accueil).

PROPOSITIONS à valider par le fondateur (pas encore décidées) :
- Budget : les gros pavés du résumé deviennent une seule carte (chiffre + barre + Prévu / Dépensé /
  Reste à répartir), enveloppes en liste, « Nouvelle enveloppe » et « Budget automatique » en ronds.
- Objectifs : réserve et moment fort en lignes, projets en liste (« Ajouter » et ↑↓ sous chaque projet).
- Enveloppe « Libre » : icône sacs de courses à la place de 🎉.
Chiffres de « Répartir ce qui me reste » : approximatifs (maquette).

`maquette-index.html` : page de maquettes (copie de directions/index.html complétée :
`?d=b&s=homefull|budgetfull|goalsfull&t=light|dark&sit=0`), à servir depuis docs/design-pro/.

## Essais du 2026-10-21 (soir) — à valider par le fondateur
- `5-carte-flottante-accueil.png` : carte « Reste par jour » flottante (ombre douce teintée de vert,
  légèrement décollée), sur fond sable, vert léger (s'efface vers le sable) ou vert dégradé partout.
- `6-fond-vert-plus.png` : écran Plus sur fond sable ou vert dégradé.
Paramètres de maquette : `&float=1` et `&bg=g1|g2`.

## Décisions du 2026-10-21 (soir)
- Fond : vert dégradé en CLAIR (`bg=g2`), fond sombre actuel en SOMBRE (le dégradé vert y est refusé).
- Carte d'accueil raccourcie (demande du fondateur) : titre « Votre plafond de dépenses par jour »
  (remplace « Reste par jour »), suppression de la phrase « Il vous reste … par jour jusqu'au … »,
  « Masquer les montants » devient l'œil seul en haut à droite (libellé d'accessibilité inchangé).
- `7-carte-flottante-v2.png` : trois façons de faire flotter la carte (A ombre tout autour,
  B effet « pile », C lévitation) — choix du fondateur à venir. Paramètres : `&hero=2&f=f1|f2|f3`.
- `8-carte-mois.png` : le mois sur la carte, 1 dans la phrase (« … par jour en octobre ») ou 2 en étiquette (« Octobre 2026 »). Paramètre : `&m=1|2`.
