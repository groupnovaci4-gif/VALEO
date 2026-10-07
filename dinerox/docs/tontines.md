# Tontines et cotisations (1.7)

DineroX est un **carnet de suivi** : l'application ne collecte, ne détient et
ne transfère jamais d'argent, et ne garantit pas les paiements des membres.
Aucune connexion (simulée ou réelle) à Wave, Orange Money, MTN, Moov ou une
banque. Les chiffres viennent du code ; rien n'est enregistré sans
confirmation.

## Plan du Lot T1 (écrit avant de coder)

### Modèle

Deux collections d'espace, ajoutées partout où le dépôt liste les collections
(`COLLECTIONS`, `emptySpaceData`, préfixes d'identifiants de `useActions`,
`knownCollection`/`validDoc` des règles + tests). La synchronisation,
l'outbox, l'export complet et la suppression de compte sont génériques sur
`COLLECTIONS` : rien d'autre à brancher.

- `tontines` : `type` (`rotating | collector | fixed_contribution`), `name`,
  `organizerName?`, `currency`, `amountPerShare`, `sharesHeld` (0,5 / 1 / 2…),
  `frequency` (`daily | weekly | biweekly | monthly | custom` + `customDays`),
  `startDate`, `membersCount` (tournante : nombre de **mains** au total =
  nombre de tours), `myTurns`, `potAmount?` (sinon calculé), `organizerFee?`,
  `latePenalty?` (informatifs), `cycleDays?`, `collectorCommission?`,
  `accountId?`, `status`, `linkedRecurringId?`.
- `tontineEntries` : `tontineId`, `kind` (`contribution | payout | fee |
  penalty`), `period` (numéro d'échéance), `amount`, `date`,
  `transactionId?`, `status` (`planned | done | late`).

`core/tontine.ts` (pur) : `buildSchedule` (dates, tour, « Vous » / « Tour n »,
cagnotte), statuts (`late` = échéance passée sans cotisation ; « Reporter »
écrit une entrée `planned` à la nouvelle date), position nette, rappels,
cotisations du mois pour le reste par jour, rapprochement d'une phrase avec
une tontine.

Règles de calcul (aucune règle locale inventée : frais, commission, pénalités
et ordre des tours sont saisis par l'utilisateur) :
- tournante : cotisation par échéance = `amountPerShare × sharesHeld` ;
  cagnotte = `potAmount` saisi, sinon `amountPerShare × membersCount` ; à
  chacun de mes tours je reçois une cagnotte entière par main, la demi-main
  reçoit la moitié de la cagnotte du tour partagé ;
- collecteur : une mise par échéance pendant `cycleDays` jours, rendue en fin
  de cycle moins la commission saisie ;
- cotisation fixe : échéances régulières, aucune redistribution.

### Écarts relevés (le dépôt fait foi)

1. `sub_informal_tontine` est une sous-catégorie de **dépense** (parent
   `cat_informal`, « Tontines et cotisations »), pas de revenu. Les
   cotisations l'utilisent. Pour la cagnotte reçue, aucune catégorie de revenu
   n'existe : ajout de `inc_tontine` (« Tontine reçue »), proposée par la mise à
   niveau du catalogue (clé de version relevée : ajout seul, jamais une
   catégorie supprimée par l'utilisateur). Repli sur « Autres revenus » si
   absente.
2. « Type de compte tontine » : c'est un **modèle de compte** (`acc.tontine`,
   type `other`, fournisseur `tontine`, épargne), pas un `AccountType`.
3. L'échéance `tontine` du calendrier vient des récurrences de catégorie
   `cat_informal` (dont la démo `demo_rec_tontine`) : conservée telle quelle ;
   les tontines complètes y ajoutent leurs cotisations et cagnottes.
4. Le parseur rangeait déjà « Tontine 10 000 » en `sub_informal_tontine`
   (vocabulaire) : la carte de confirmation y ajoute le rapprochement avec la
   tontine correspondante.
5. Conversion : la récurrence d'origine reste active sauf si l'utilisateur
   coche « Désactiver la récurrence d'origine ». Tant qu'elle reste active, la
   tontine ne compte pas une seconde fois ses cotisations dans le reste par
   jour (la récurrence les compte déjà) — sinon double comptage.
6. Nombre de membres : avec plusieurs mains ou des demi-mains, le nombre de
   tours dépend des **mains** ; le champ est présenté comme « nombre de mains
   (tours) au total, les vôtres comprises — souvent le nombre de membres ».

### Phases

| Phase | Contenu |
|---|---|
| 1 | Modèle, règles, `buildSchedule`, création en 4 écrans avec aperçu et rappel « carnet de suivi », conversion d'une récurrence, démo, formules (`tontine_multiple`, `tontine_group_create`, limite 1 tontine active en gratuit) |
| 2 | « Mes tontines », position nette, « J'ai cotisé » / « J'ai reçu la cagnotte » (opération réelle liée), retards, saisie vocale et écrite, rappels (`tontineDue`), reste par jour, patrimoine, calendrier, accueil |
| 3 | « Comprendre ma tontine », coût de la commission, événements du coach `tontine_due`, `tontine_late`, `tontine_payout_soon`, `tontine_all_on_time` |
