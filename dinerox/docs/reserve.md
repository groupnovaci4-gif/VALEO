# Réserve famille et cérémonies (1.6)

Objectif : honorer les obligations familiales et sociales sans se mettre en
difficulté — mettre de côté à l'avance, voir l'impact d'une contribution avant
de dire oui, se préparer aux moments forts. L'application ne juge jamais : elle
montre des chiffres calculés par le code, l'utilisateur décide et confirme.

## Plan (écrit avant de coder)

### Choix d'implémentation de la réserve

Une réserve est un **objectif sans date de fin et rechargeable** :
`Goal.kind?: 'goal' | 'reserve'` (absent = `goal`). Rien dans le dépôt ne
contredit ce choix : apports et retraits (`goalContributions`, montant négatif
= retrait), compte de rangement (`accountId`), mise de côté avec ou sans
transfert, `moneyPosition` (l'argent réservé n'est plus « libre »), règles
Firestore, export et suppression de compte fonctionnent déjà pour `goals`.

- **Solde** = `goalSaved` (montant initial + apports − utilisations).
- **Plafond cible** = `targetAmount` ; **mise de côté mensuelle** =
  `monthlyContribution` ; pas de `targetDate`.
- **Utilisation** = contribution négative portant `linkedTransactionId`
  (l'opération de dépense qu'elle finance). Montant = `min(dépense, solde)` :
  le complément est montré, jamais bloqué. Supprimer l'opération supprime
  l'utilisation ; la modifier la recalcule. Si la réserve est rangée sur un
  compte d'épargne distinct, un transfert « réserve → compte payeur » est créé
  (comme un retrait d'objectif), pour que les soldes restent justes.
- **Qui** : `createdBy` (déjà présent) + `space.memberNames`.

### Écarts relevés (le dépôt fait foi)

1. **Catégories** : « Dépense familiale » n'existe pas sous ce nom ; la
   catégorie est `cat_family` (« Famille »). « Cérémonies et fêtes » est une
   sous-catégorie (`sub_social_ceremonies`) de `cat_social`
   (« Obligations sociales » : mariages, baptêmes, funérailles, cérémonies,
   dons). Catégories proposant la réserve : **`cat_family` et `cat_social`**
   (sous-catégories comprises). « Crédit familial » est un type de dette, et
   « Tontine / cotisation » (`cat_informal`) n'est pas une cérémonie : non
   concernés.
2. **Reste par jour (défaut existant)** : `dailyAllowance` ne déduisait que la
   part des contributions d'objectifs **pas encore versée** ; une fois versée,
   elle n'était plus déduite → mettre de l'argent de côté faisait **monter**
   le reste par jour. Correction : la mise de côté prévue du mois est déduite
   tout le mois, versée ou non (bornée par ce qu'il restait à épargner au
   début du mois). C'est indispensable pour la réserve.
3. **Catalogue distant** : la règle `config/{doc}/items/{id}` (lecture pour
   tout utilisateur connecté, écriture administrateur) existe déjà ; les dates
   des moments forts vivent dans `config/seasons/items` (test de règles ajouté).
4. **Export et suppression de compte** sont génériques (toutes les
   collections de chaque espace ; `recursiveDelete`) : réserves, utilisations
   et moments forts y sont inclus sans code spécifique (vérifié par test).
5. **Limites** : réserves et moments forts ont leurs propres limites et ne
   comptent pas dans la limite d'objectifs de la formule gratuite (2) — les
   abonnés actuels gardent exactement leurs droits.
6. **Plan hebdomadaire** : `computeGoalPlan` raisonne en mois (120 000 en
   8 semaines → 14 000/semaine). Pour un moment fort, le rythme par semaine est
   calculé sur les semaines réelles (15 000/semaine) ; le reste du plan vient
   de `computeGoalPlan`.
7. **Saisie rapide** : elle enregistre au toucher de la catégorie. Pour une
   catégorie famille/cérémonies avec une réserve non vide, le toucher ouvre la
   carte de confirmation (sinon la réserve ne pourrait pas être proposée).
8. **Notifications** : sobres elles aussi (jamais de bénéficiaire ni de décès
   sur l'écran verrouillé), pas seulement la voix.
9. Le Lot A (parseur, carte de confirmation, reste par jour) est livré : la
   réserve s'y branche directement.

### Phases

| Phase | Contenu |
|---|---|
| 1 | `Goal.kind`, `core/reserve.ts` (solde, utilisation, aide au plafond, rappel) ; `dailyAllowance` ; actions `useReserve`, liens suppression/modification ; carte de confirmation, formulaire, saisie rapide ; écrans réserve (création, fiche) ; section « Réserves » des Objectifs ; question facultative du démarrage rapide ; rappel mensuel ; formules ; règles + tests ; démo |
| 2 | Écran « Famille et obligations » (récurrences `cat_family`), totaux mois/an, part des revenus ; résumé IA sans bénéficiaires |
| 3 | Simulateur pur + écran ; accès réserve, famille, saisie, micro (`parseIntent`) ; 3 simulations/mois en gratuit |
| 4 | Moments forts : catalogue sans date codée en dur, dates distantes corrigeables, plan, rappels J-60/J-30/J-7, calendrier |
| Coach | `reserve_low`, `reserve_refilled`, `season_upcoming`, `obligation_due` |
