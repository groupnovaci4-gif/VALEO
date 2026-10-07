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
10. **Commits** : la phase 1 a son propre commit, validé seul. Les phases 2,
    3 et 4 (et le complément « budget du mois » de la phase 1) partagent de
    nombreux fichiers (textes FR/EN, coach, rappels) : elles ont été validées
    ensemble par la batterie complète et livrées dans un seul commit.

### Phases

| Phase | Contenu |
|---|---|
| 1 | `Goal.kind`, `core/reserve.ts` (solde, utilisation, aide au plafond, rappel) ; `dailyAllowance` ; actions `useReserve`, liens suppression/modification ; carte de confirmation, formulaire, saisie rapide ; écrans réserve (création, fiche) ; section « Réserves » des Objectifs ; question facultative du démarrage rapide ; rappel mensuel ; formules ; règles + tests ; démo |
| 2 | Écran « Famille et obligations » (récurrences `cat_family`), totaux mois/an, part des revenus ; résumé IA sans bénéficiaires |
| 3 | Simulateur pur + écran ; accès réserve, famille, saisie, micro (`parseIntent`) ; 3 simulations/mois en gratuit |
| 4 | Moments forts : catalogue sans date codée en dur, dates distantes corrigeables, plan, rappels J-60/J-30/J-7, calendrier |
| Coach | `reserve_low`, `reserve_refilled`, `season_upcoming`, `obligation_due` |

## Ce qui est fait

| Phase | Contenu |
|---|---|
| 1 | Réserve = objectif `kind: 'reserve'` ; solde, plafond, mise de côté mensuelle, historique avec « qui », compte de rangement facultatif. Aide au plafond (12 derniers mois complets, au moins 3 mois d'historique, sinon question). « Prendre sur la réserve ? (solde : X) » sur la carte de confirmation (voix, phrase), le formulaire complet et la saisie rapide (catégorie famille/cérémonies → carte). Complément montré, jamais bloqué. Suppression/annulation de l'opération → utilisation annulée ; modification → recalculée. Rappel mensuel « Mettre X de côté » le lendemain de la paie (confirmation obligatoire). Reste par jour : mise de côté prévue déduite, utilisation sans effet. Question facultative du démarrage rapide ; section « Réserves » des Objectifs. |
| 1 (suite) | Budget du mois (enveloppes, alertes du coach, constats, score, récompenses, résumé IA) : la part prise sur une réserve n'y pèse pas (`budgetTransactions`) ; seul le complément compte. |
| 2 | Écran « Famille et obligations » (Plus › et fiche de la réserve) : soutiens réguliers = récurrences existantes de catégorie Famille, libellé « Pour qui ? » libre ; totaux par mois, par an, part des revenus (source affichée), sans commentaire. Résumé IA : aucun bénéficiaire, réserves et moments forts sous un libellé générique. |
| 3 | « Puis-je contribuer ? » (`core/simulator.ts`) : solde de la réserve après contribution, nouveau reste par jour, enveloppes touchées par le complément, mises de côté non couvertes si le mois passe en négatif ; comparaison avec un autre montant. Issues : enregistrer (formulaire prérempli, à confirmer), enregistrer un montant différent, fermer. Accès : Plus, réserve, saisie (« Simuler avant d'enregistrer »), voix et phrase (« Si je donne 30 000 pour les funérailles, il me reste combien ? »). Gratuit : 3 simulations par mois (compteur local). |
| 4 | Moments forts (`core/seasons.ts`) : rentrée, Tabaski, fin du Ramadan, Noël et fin d'année, Pâques, moments personnels. Aucune date codée en dur : catalogue distant `config/seasons/items`, date toujours corrigeable, sinon « date à préciser ». Montant prérempli seulement s'il existe des dépenses à la même période l'an dernier. Plan : `computeGoalPlan` + rythme par semaine sur les semaines réelles. Rappels J-60, J-30, J-7 ; calendrier (« Moment fort ») ; section dans Objectifs. Gratuit : 1 moment fort. |
| Coach | `reserve_low`, `reserve_refilled`, `season_upcoming`, `obligation_due`, via `planDelivery` (dédoublonnage, quotas de voix). |

Formules : prix inchangés (0 / 1 500 / 3 000 FCFA), droits existants inchangés
(testé) ; ajout de `reserve_multiple`, `contribution_simulator`,
`seasonal_planning` (Plus, Famille) et `family_reserve` (Famille). Les limites
gratuites sont des constantes (`FREE_RESERVES`, `FREE_SIMULATIONS_PER_MONTH`,
`FREE_SEASONS`).

Aucune nouvelle dépendance native : livrable en mise à jour OTA (EAS Update)
si le build 1.5.0 est déjà installé.

## Catalogue des moments forts (administrateur)

Un document par événement, année et pays dans `config/seasons/items`
(console Firebase ; lecture : tout utilisateur connecté, écriture :
administrateur plateforme `admin: true`) :

```json
{ "eventId": "tabaski", "date": "AAAA-MM-JJ", "country": "CI" }
```

`eventId` : `school_start`, `tabaski`, `ramadan_end`, `christmas`, `easter`.
`country` : code pays (`CI`, `SN`…) ou `null` pour tous les pays (la date du
pays de l'utilisateur est prioritaire). Identifiant conseillé :
`tabaski_2027_CI`. Sans document, l'application affiche « date à préciser ».
Les dates religieuses ne sont jamais écrites dans le code.

## Espace famille

Réserve dans l'espace personnel ou familial (formule Famille). Administrateur
et conjoint apportent et utilisent ; l'enfant peut apporter, jamais utiliser
(interface + règles Firestore avec `get()` sur l'objectif). Chaque mouvement
porte son auteur (`createdBy`, affiché « par … » dans l'historique).

## Ce qui a réellement été testé, et comment

- **Tests unitaires (Vitest), 418 au total** — réserve (solde = apports −
  utilisations, complément, utilisation liée, `kind` absent = objectif),
  reste par jour (mise de côté déduite, utilisation sans effet, dépense
  famille sans réserve qui le fait baisser, réserve complète au début du mois),
  budget du mois (seul le complément pèse sur l'enveloppe), aide au plafond
  (12 mois, 3 mois, sans historique → question), rappel mensuel, obligations
  (totaux, part des revenus, sans revenu, dû demain), simulateur (trois
  montants, réserve suffisante ou non, fin de mois, disponible négatif),
  « Si je donne… » reconnu avec ou sans « ? », moments forts (catalogue sans
  date, date du pays, date corrigée, date inconnue, plan hebdomadaire,
  rappels J-60/J-30/J-7, montant de l'an dernier, retard à J-30), coach
  (4 événements), confidentialité (aucun bénéficiaire ni défunt dans les
  textes, la voix — avec ou sans montants — ni le résumé IA), formules
  (limites gratuites, Plus, Famille, prix et droits existants inchangés),
  démonstration.
- **Règles Firestore sur l'émulateur (34)** : `kind`, `linkedTransactionId`,
  enfant qui apporte mais n'utilise pas, auteur imposé, catalogue
  `config/seasons` (lecture connectée, écriture administrateur).
- **Parcours de bout en bout** (Playwright, export web + émulateurs), 17
  suites dont `reserve.js` et `family.js` : réserve sur la démo (fiche,
  historique « par vous », carte de confirmation, reste par jour inchangé,
  complément, « Annuler », modification, suppression, mise de côté
  confirmée, création avec l'aide au plafond), démarrage rapide et limite
  d'une réserve sur un vrai compte, obligations (totaux, ajout), simulateur
  (avec et sans réserve, comparaison, enregistrement confirmé, phrase
  « Si je donne… »), moments forts (plan 15 000 / semaine, date à préciser,
  calendrier), **date publiée dans le catalogue de l'émulateur** sur un vrai
  compte, limites gratuites (1 moment fort, 3 simulations). Tous les champs
  des nouveaux écrans passent l'audit des formulaires (103/103).
- **Export Android** (`npx expo export --platform android`) et compilation
  des Cloud Functions.

## Ce qui n'a PAS été testé

- Notifications réelles (rappel « Mettre X de côté », J-60/J-30/J-7) : leur
  programmation native ne tourne pas dans le navigateur ; seules les dates
  calculées sont testées.
- Messages du coach à l'ouverture et voix réelle sur téléphone (la logique
  et les textes sont testés ; la présentation dans l'application, non).
- Espace familial réel à plusieurs téléphones (droits testés par les règles
  sur l'émulateur, pas par un parcours à trois comptes).
- Catalogue distant en production (aucune date n'a été publiée sur le vrai
  projet) ; export complet et suppression de compte (génériques, non
  modifiés, non rejoués ici).
- Build natif et mise à jour OTA.

## Tests à faire sur un téléphone

1. Créer la réserve depuis Objectifs › Réserves (aide au plafond : avec un
   compte ancien, le chiffre des 12 derniers mois ; avec un nouveau compte, la
   question).
2. « Funérailles 20 000 » à la voix → carte → « Oui, sur la réserve » →
   « Tout valider » : le reste par jour ne bouge pas, l'enveloppe Famille non plus.
3. Montant supérieur au solde : complément annoncé, enregistrement possible.
4. « Annuler » du message (5 s), puis suppression depuis l'Historique : le
   solde de la réserve revient.
5. Saisie rapide (appui long sur le micro) avec la catégorie Famille ou
   Obligations sociales : la carte propose la réserve.
6. Rappel « Mettre X de côté » le lendemain de la paie : le toucher ouvre la
   réserve et demande confirmation.
7. Famille et obligations : ajouter « Maman — 20 000 / mois », vérifier les
   totaux et le calendrier ; la veille de l'échéance, le message du coach ne
   cite pas « Maman ».
8. Dire « Si je donne 30 000 pour les funérailles, il me reste combien ? » :
   le simulateur s'ouvre avec le calcul.
9. Moments forts : Tabaski (date à préciser puis date saisie), plan par
   semaine, rappels J-30 et J-7.
10. Espace familial (formule Famille) : un enfant fait un apport ; il ne voit
    pas « Prendre sur la réserve ? ».
11. Formule gratuite : deuxième réserve, deuxième moment fort, quatrième
    simulation du mois → offre, rien d'autre bloqué.
12. Application en anglais : textes de la réserve, du simulateur et des
    moments forts.
