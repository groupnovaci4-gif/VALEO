# Corrections de l'audit — textes nouveaux ou changés (fr / en)

Clés i18n (`src/i18n/fr.ts`, `src/i18n/en.ts`). « − » : supprimé, « + » : nouveau ou nouvelle version.

```diff
+  'home.upcomingMonth': 'À venir ce mois : revenus {income}, dépenses {expense}',
+  'home.otherCurrency': '{inCur} ce mois : revenus {income}, dépenses {expense} · comptes {balance} (non additionnés)',
+  'child.askParent': 'Demandez à un parent',
+  'child.askParent.why': 'Les dettes, les tontines et les charges sont gérées par les parents : ce chiffre ne peut pas être calculé ici.',
-  'home.otherCurrencies': 'Autres devises (non converties)',
+  'acc.upcoming': 'À venir : {amount} (dès le {date})',
+  'rep.otherCurrency': '{inCur} : revenus {income}, dépenses {expense} (non additionnés)',
+  'env.upcoming': 'dont {amount} à venir',
+  'ia.a.availableOther': '{inCur} : disponible {available} (total des comptes : {total}).',
+  'ia.a.reservePart': 'Dont {amount} pris sur la réserve.',
+  'ia.a.goalTargetDate': '{name} : date visée {date}, aucun rythme régulier pour l\'instant (reste {remaining}).',
+  'ia.a.recurringLate': '{name} : l\'échéance du {late} n\'est pas encore confirmée. La suivante : le {date}, {amount}.',
+  'ia.a.recurringLateCount': '{count} échéances attendent une confirmation.',
+  'ia.a.paydayMismatch': '« {name} » est noté le {day} du mois, mais votre jour de paie (profil) est le {payDay}.',
+  'ia.a.childAsk': 'Demandez à un parent : les dettes, les tontines et les charges sont gérées par les parents, ce chiffre ne peut pas être calculé ici.',
-  'ia.a.netWorth': 'Patrimoine net : {net} (biens {assets}, comptes {accounts}, dettes {liabilities}).',
+  'ia.a.netWorth': 'Patrimoine net : {net} (biens {assets}, comptes {accounts}, épargne hors comptes {outside}, créances {receivables}, dettes {liabilities}).',
-  'ia.card.envelope': 'Enveloppe {name} : {amount} par mois',
+  'ia.card.envelope': 'Enveloppe {name} : {amount} par mois, pour tous les mois',
+  'ia.ask.debtMode': 'Une dette avec cette personne existe déjà : nouvelle dette, ou celle qui existe ?',
+  'ia.ask.debtNew': 'Nouvelle dette',

+  'home.upcomingMonth': 'Coming up this month: income {income}, spending {expense}',
+  'home.otherCurrency': '{inCur} this month: income {income}, spending {expense} · accounts {balance} (not added up)',
+  'child.askParent': 'Ask a parent',
+  'child.askParent.why': 'Debts, tontines and bills are managed by the parents, so this figure can\'t be worked out here.',
-  'home.otherCurrencies': 'Other currencies (not converted)',
+  'acc.upcoming': 'Coming up: {amount} (from {date})',
+  'rep.otherCurrency': '{inCur}: income {income}, spending {expense} (not added up)',
+  'env.upcoming': 'of which {amount} coming up',
+  'ia.a.availableOther': '{inCur}: available {available} (total of accounts: {total}).',
+  'ia.a.reservePart': 'Of which {amount} taken from the reserve.',
+  'ia.a.goalTargetDate': '{name}: target date {date}, no regular pace yet ({remaining} to go).',
+  'ia.a.recurringLate': '{name}: the {late} payment isn\'t confirmed yet. Next one: {date}, {amount}.',
+  'ia.a.recurringLateCount': '{count} payments are waiting to be confirmed.',
+  'ia.a.paydayMismatch': '“{name}” is set for day {day} of the month, but your payday (profile) is day {payDay}.',
+  'ia.a.childAsk': 'Ask a parent: debts, tontines and bills are managed by the parents, so this figure can\'t be worked out here.',
-  'ia.a.netWorth': 'Net worth: {net} (assets {assets}, accounts {accounts}, debts {liabilities}).',
+  'ia.a.netWorth': 'Net worth: {net} (assets {assets}, accounts {accounts}, savings outside accounts {outside}, owed to you {receivables}, debts {liabilities}).',
-  'ia.card.envelope': '{name} envelope: {amount} a month',
+  'ia.card.envelope': 'Envelope {name}: {amount} a month, for every month',
+  'ia.ask.debtMode': 'There\'s already a debt with this person: a new debt, or the existing one?',
+  'ia.ask.debtNew': 'New debt',
```

Données `src/core/money.ts` (`inWords`, en-tête « En euros » des lignes par devise, mis en majuscule à l'affichage) : en francs CFA / in CFA francs, en euros / in euros, en dollars américains / in US dollars, en dollars canadiens / in Canadian dollars, en livres sterling / in pounds sterling, en francs suisses / in Swiss francs, en francs guinéens / in Guinean francs, en dirhams / in dirhams, en cedis / in cedis, en nairas / in naira, en dinars algériens / in Algerian dinars, en dinars tunisiens / in Tunisian dinars, en shillings kényans / in Kenyan shillings, en francs congolais / in Congolese francs, en couronnes suédoises / in Swedish kronor, en couronnes norvégiennes / in Norwegian kroner, en couronnes danoises / in Danish kroner, en złotys / in złoty, en couronnes tchèques / in Czech koruna (XAF : en francs CFA (CEMAC) / in CFA francs (CEMAC)).

Back-office (`admin/`, fr seulement) : « N opération(s) liée(s) (frais ou intérêts) » ; journal : « opération liée (frais ou intérêts) ».

Carte IA d'un transfert entre devises : champ « Montant reçu » / « Amount received » (clé existante `tx.toAmount`).

## Retouche — carte du coach chez un enfant (B6)

Chez un membre enfant, la carte « Votre coach » ne dit plus « Indiquez d'abord votre argent disponible » ; elle reprend l'idée de la carte du haut (capture 07).

```diff
+  'intel.rec.ask_parent': 'Demandez à un parent : les dettes, les tontines et les charges sont gérées par les parents.',
```

```diff
+  'intel.rec.ask_parent': 'Ask a parent: debts, tontines and bills are managed by the parents.',
```
