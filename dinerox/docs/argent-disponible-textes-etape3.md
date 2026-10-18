# Argent disponible v2 — textes de l'étape 3 (fr + en)

Tous les textes d'interface ajoutés ou modifiés par l'étape 3 (3A et 3B), avec leur valeur
ACTUELLE dans `src/i18n/fr.ts` et `src/i18n/en.ts`. Les 11 messages d'erreur et
`sub_other_fees` (catalogue) ont été validés avant l'étape 3 et ne sont pas repris.

## 1. À valider — nouveaux, hors document (56)

| Clé | Français | English |
|---|---|---|
| `acc.balanceNow` | Solde actuel : {amount} | Current balance: {amount} |
| `acc.correct.done` | Solde corrigé. | Balance corrected. |
| `acc.leftover.title` | Ce compte a encore {amount}. | This account still holds {amount}. |
| `acc.opening.note` | D'où vient cet argent ? (facultatif) | Where does this money come from? (optional) |
| `acc.openingShown` | Solde de départ : {amount} | Starting balance: {amount} |
| `daily.item.debt` | Mensualité {label} — {date} : {amount} | Instalment {label} — {date}: {amount} |
| `daily.item.future` | Dépense prévue — {date} : {amount} | Planned expense — {date}: {amount} |
| `daily.item.goal` | Mise de côté prévue : {label} — {amount} | Planned saving: {label} — {amount} |
| `daily.item.recurring` | {label} — {date} : {amount} | {label} — {date}: {amount} |
| `daily.item.tontine` | Cotisation {label} — {date} : {amount} | Contribution {label} — {date}: {amount} |
| `debt.close.title` | Clôturer avec un reste de {amount} ? | Close with {amount} remaining? |
| `debt.interest` | Dont intérêts (facultatif) | Of which interest (optional) |
| `debt.interestHint` | Les intérêts sont une dépense ; seul le capital fait baisser la dette. | Interest is an expense; only the principal reduces the debt. |
| `debt.movement.given` | De quel compte l'argent est-il parti ? | Which account did the money leave from? |
| `debt.movement.hint` | L'emprunt reçu ou le prêt accordé s'enregistre sur ce compte : ni revenu, ni dépense. « Hors de mes comptes » : une dette d'avant, sans mouvement. | The loan received or given is recorded on this account: neither income nor expense. “Outside my accounts”: an earlier debt, with no movement. |
| `debt.movement.received` | Sur quel compte l'argent est-il arrivé ? | Which account did the money arrive on? |
| `debt.movement.required` | Choisissez un compte, ou « Hors de mes comptes ». | Choose an account, or “Outside my accounts”. |
| `goal.close.outside` | Dont {amount} hors de vos comptes : aucun argent ne bouge. | Of which {amount} outside your accounts: no money moves. |
| `goal.close.title` | Où va l'argent ({amount}) ? | Where does the money ({amount}) go? |
| `goal.origin.noteHint` | Par exemple : argent confié à ma mère, terrain, autre banque. | For example: money left with my mother, land, another bank. |
| `history.setAsideEnd` | Fin de mise de côté : {goal} → {account} | Set-aside ended: {goal} → {account} |
| `intel.rec.money_unknown` | Indiquez d'abord votre argent disponible : les conseils se calculeront à partir de l'argent réellement là. | First enter your available money: advice will be computed from the money you really have. |
| `intel.rec.overdue` | Une échéance de dette ou une cotisation est en retard : c'est la priorité avant toute autre dépense. | A debt instalment or a contribution is overdue: it comes before any other spending. |
| `money.opening.hint` | Ce qu'il y a aujourd'hui sur chaque compte. Ensuite, l'argent ne change que par vos opérations. | What is on each account today. After that, money only changes through your operations. |
| `money.opening.save` | Enregistrer mon argent disponible | Save my available money |
| `money.received.income` | Un revenu (salaire, vente, cadeau…) | Income (salary, sale, gift…) |
| `money.received.loan` | Un emprunt | A loan |
| `money.received.pot` | Une cagnotte de tontine | A tontine payout |
| `money.received.repayment` | Un remboursement d'un prêt que j'ai accordé | A repayment of a loan I gave |
| `money.received.title` | Quel argent avez-vous reçu ? | What money did you receive? |
| `money.source.goal` | Prendre sur {goal} ({account}), {amount} | Take it from {goal} ({account}), {amount} |
| `money.source.savings` | Prendre sur l'épargne : {account}, {amount} libres | Take it from savings: {account}, {amount} free |
| `nature.ajustement` | Correction | Correction |
| `nature.cotisation_association` | Cotisation sans tour | Membership dues |
| `nature.cotisation_tontine` | Cotisation de tontine | Tontine contribution |
| `nature.depense` | Dépense | Expense |
| `nature.emprunt_recu` | Emprunt reçu | Loan received |
| `nature.frais` | Frais | Fees |
| `nature.interets` | Intérêts | Interest |
| `nature.ouverture` | Solde de départ | Starting balance |
| `nature.pret_accorde` | Prêt accordé | Loan given |
| `nature.remboursement_achat` | Remboursement d'achat | Purchase refund |
| `nature.remboursement_capital` | Remboursement de dette | Debt repayment |
| `nature.remboursement_recu` | Remboursement reçu | Repayment received |
| `nature.retour_tontine` | Retour de tontine | Tontine payout |
| `nature.retrait_epargne` | Retrait d'épargne | Savings withdrawal |
| `nature.revenu` | Revenu | Income |
| `nature.transfert` | Transfert | Transfer |
| `nature.versement_epargne` | Versement d'épargne | Savings deposit |
| `reg.item` | {label} — {date} : {amount} | {label} — {date}: {amount} |
| `rep.result` | Résultat | Result |
| `salary.pending.cta` | Oui, l'enregistrer | Yes, record it |
| `tg.gotPot.account` | Sur quel compte ? | On which account? |
| `tontine.closeSuggest.cta` | Clôturer | Close |
| `tx.fee` | Frais (facultatif) | Fees (optional) |
| `tx.feeHint` | Frais d'envoi ou de retrait : une dépense liée au transfert, supprimée avec lui. | Transfer or withdrawal fees: an expense linked to the transfer, deleted with it. |

## 2. À valider — modifiés, hors document (18)

| Clé | Avant (fr) | Français | English |
|---|---|---|---|
| `acc.openingBalance` | Solde actuel | Argent déjà sur ce compte | Money already on this account |
| `acc.openingBalanceHint` | Le montant présent aujourd'hui sur ce compte. Les opérations l'ajusteront ensuite. | Le montant présent aujourd'hui. Ensuite, il ne change que par des opérations ou « Corriger le solde ». | The amount there today. After that, it only changes through operations or “Correct the balance”. |
| `daily.detail` | Revenus {income} − dépenses {expenses} − à venir {upcoming} | Argent disponible {available} − engagements {commitments}, sur {days} jour(s) | Available money {available} − commitments {commitments}, over {days} day(s) |
| `daily.needsIncome.cta` | Indiquer mon revenu | Indiquer mon argent disponible | Enter my available money |
| `history.in` | Entrées {amount} | Revenus {amount} | Income {amount} |
| `history.net` | Solde {amount} | Résultat {amount} | Result {amount} |
| `history.out` | Sorties {amount} | Dépenses {amount} | Spending {amount} |
| `intel.capacityHint` | Vous pourriez actuellement consacrer environ {amount} par mois à l'épargne ou à vos objectifs. | Ces derniers mois, il vous est resté {amount} par mois, une fois vos dépenses, remboursements et épargne comptés. | In recent months, you had {amount} left each month after spending, repayments and savings. |
| `intel.capacityNone` | Vos dépenses atteignent ou dépassent vos revenus : commençons par identifier ce qui peut être ajusté. | Vos dépenses, remboursements et épargne atteignent ou dépassent vos revenus reçus : commençons par identifier ce qui peut être ajusté. | Your spending, repayments and savings reach or exceed the income you received: let's see what can be adjusted. |
| `intel.rec.capacity_negative` | Vos dépenses dépassent vos revenus d'environ {amount} par mois. Regardons ensemble les postes à ajuster. | Ces derniers mois, vos dépenses, remboursements et épargne ont dépassé vos revenus reçus de {amount} par mois. | In recent months, your spending, repayments and savings exceeded the income you received by {amount} a month. |
| `intel.rec.capacity_positive` | Vous pourriez consacrer environ {amount} par mois à l'épargne ou à vos objectifs. | Ces derniers mois, il vous est resté {amount} par mois, une fois vos dépenses, remboursements et épargne comptés. | In recent months, you had {amount} left each month after spending, repayments and savings. |
| `intel.rec.emergency_fund` | Constituez un fonds d'urgence : environ 3 mois de dépenses, soit {target}. | Constituez un fonds d'urgence : 3 mois de dépenses, soit {target}. | Build an emergency fund: 3 months of spending, i.e. {target}. |
| `intel.rec.goals_funded` | Votre capacité d'épargne couvre l'effort mensuel de vos objectifs ({need}). | Ce qui vous reste chaque mois couvre l'effort de vos objectifs ({need}). | What you have left each month covers your goals' monthly effort ({need}). |
| `intel.rec.goals_underfunded` | Vos objectifs demandent {need} par mois ; votre capacité actuelle est d'environ {capacity}. Il manque {gap} : allongez une échéance ou priorisez un objectif. | Vos objectifs demandent {need} par mois ; il vous reste {capacity} par mois. Il manque {gap} : allongez une échéance ou priorisez un objectif. | Your goals need {need} a month; you have {capacity} left a month. {gap} is missing: extend a deadline or prioritise a goal. |
| `intel.rec.low_balance_risk` | Risque de solde insuffisant : {outflows} de sorties prévues dans les 30 jours, il pourrait manquer environ {shortfall}. | Risque de solde insuffisant : {outflows} de sorties prévues dans les 30 jours, il pourrait manquer {shortfall}. | Risk of insufficient balance: {outflows} of outflows planned in the next 30 days, {shortfall} could be missing. |
| `rec.empty.body` | Ex. « Salaire : 450 000 FCFA tous les 25 du mois ». Elles sont enregistrées automatiquement à échéance. | Ex. « Salaire : 450 000 FCFA tous les 25 du mois ». Le jour prévu, l'application vous demande de confirmer : rien n'est enregistré seul. | E.g. “Salary: 450,000 FCFA every 25th”. On the day, the app asks you to confirm: nothing is recorded on its own. |
| `sav.move.from.alreadyHint` | Par exemple un virement direct de l'employeur, ou un solde jamais saisi : c'est un ajustement de solde, ni revenu ni dépense. | Argent qui était déjà sur ce compte sans avoir été saisi : c'est une correction de solde, ni revenu ni dépense. Un salaire versé directement ici est un revenu. | Money that was already on this account but never entered: a balance correction, neither income nor expense. A salary paid directly here is income. |
| `score.notEnough` | Votre score sera disponible après un mois complet comptant au moins 10 opérations enregistrées. | Votre score sera disponible après un mois complet avec des revenus reçus, votre argent renseigné et au moins 10 opérations enregistrées. | Your score will be available after a full month with income received, your money entered and at least 10 recorded operations. |

## 3. Repris mot pour mot de `docs/argent-disponible.md` (validés avec le document)

### Nouveaux (70)

| Clé | Français | English |
|---|---|---|
| `acc.correct` | Corriger le solde | Correct the balance |
| `acc.correct.actual` | Solde réel constaté | Actual balance counted |
| `acc.correct.reason` | Motif | Reason |
| `acc.correct.reasonHint` | Par exemple : écart de caisse, frais oubliés, solde réel de la banque. | For example: cash difference, forgotten fees, actual bank balance. |
| `acc.leftover.loss` | Constater une perte | Record a loss |
| `acc.leftover.transfer` | Transférer le reste vers… | Transfer the rest to… |
| `acc.opening.noteHint` | Par exemple : argent gardé à la maison, reste du salaire de septembre. | For example: cash kept at home, what is left of last month's salary. |
| `acc.origin.already` | C'est de l'épargne que j'avais déjà | It is savings I already had |
| `acc.origin.available` | Je le prends sur mon argent disponible | I take it from my available money |
| `acc.origin.title` | D'où vient cet argent ? | Where does this money come from? |
| `budget.toAllocate` | Reste à répartir : {amount} | Left to allocate: {amount} |
| `budget.toAllocateOver` | Vos enveloppes dépassent votre argent disponible de {amount}. | Your envelopes exceed your available money by {amount}. |
| `debt.close.forgiven` | Dette remise | Debt forgiven |
| `debt.close.writtenOff` | Créance abandonnée | Claim written off |
| `debt.movement.outside` | Hors de mes comptes | Outside my accounts |
| `env.shareOfDeclared` | {percent} % de votre revenu déclaré | {percent}% of your declared income |
| `goal.close.available` | Remettre dans mon disponible | Put it back into my available money |
| `goal.close.savings` | Garder sur l'épargne | Keep it in savings |
| `goal.origin.available` | Je le prends sur mon argent disponible | I take it from my available money |
| `goal.origin.outside` | C'est de l'épargne hors de mes comptes | It is savings outside my accounts |
| `goal.origin.savings` | Il est déjà sur mon compte d'épargne | It is already on my savings account |
| `history.opening` | Solde de départ — argent que j'avais déjà : {amount} | Starting balance — money I already had: {amount} |
| `history.setAside` | Mise de côté : {account} → {goal} | Set aside: {account} → {goal} |
| `history.statement.end` | Solde à la fin : {amount} | Balance at end: {amount} |
| `history.statement.in` | Entrées : {amount} | In: {amount} |
| `history.statement.out` | Sorties : {amount} | Out: {amount} |
| `history.statement.start` | Solde au début : {amount} | Balance at start: {amount} |
| `home.setAside` | Mis de côté | Set aside |
| `home.totalAccounts` | Total de vos comptes | Total of your accounts |
| `intel.notEnoughData` | Pas encore assez de données | Not enough data yet |
| `intel.rec.commitments_over_available` | Vos engagements d'ici le {date} dépassent votre argent disponible de {amount}. | Your commitments until {date} exceed your available money by {amount}. |
| `intel.rec.congrats` | Vous épargnez {percent} % de vos revenus reçus. | You save {percent}% of the income you received. |
| `intel.rec.debt_load` | Vos remboursements prennent {percent} % de vos revenus reçus : mieux vaut éviter un nouveau crédit pour l'instant. | Your repayments take {percent}% of the income you received: better avoid new credit for now. |
| `intel.rec.fixed_charges` | Vos charges fixes prennent {percent} % de vos revenus reçus. | Your fixed costs take {percent}% of the income you received. |
| `intel.rec.living_beyond_means` | Ce mois-ci, vos dépenses et remboursements ({spent}) ont dépassé vos revenus reçus ({received}) de {over}. | This month, your spending and repayments ({spent}) exceeded the income you received ({received}) by {over}. |
| `intel.rec.precaution_low` | Votre épargne de précaution couvre {months} mois de dépenses essentielles. Objectif : {targetMonths} mois, soit {target} (encore {missing}). | Your emergency savings cover {months} months of essential spending. Target: {targetMonths} months, i.e. {target} ({missing} to go). |
| `intel.rec.ten_percent` | 10 % de vos revenus reçus : {amount}. Aujourd'hui, vous pouvez en mettre {feasible} de côté sans toucher à vos engagements. | 10% of the income you received: {amount}. Today, you can set aside {feasible} without touching your commitments. |
| `intel.rec.ten_percent_none` | Quand vous recevez de l'argent, mettre 10 % de côté tout de suite, c'est l'habitude qui protège. | When you receive money, setting 10% aside right away is the habit that protects you. |
| `intel.rec.ten_percent_partial` | Vous avez déjà mis {saved} de côté ({percent} %). Encore {missing} pour atteindre 10 %. | You have already set aside {saved} ({percent}%). {missing} more to reach 10%. |
| `money.askParent` | Demander à un parent | Ask a parent |
| `money.askParent.body` | Demandez à un parent d'indiquer l'argent de la famille. | Ask a parent to enter the family's money. |
| `money.insufficient` | Vous n'avez pas assez d'argent pour cette dépense. | You don't have enough money for this expense. |
| `money.negative.title` | {account} est à {amount} : il faudra régulariser. | {account} is at {amount}: it will need to be settled. |
| `money.opening.reason` | Argent que j'avais déjà | Money I already had |
| `money.regularize` | Régulariser | Settle |
| `money.sheet.title` | Il manque {amount} sur {account} pour cette dépense. D'où voulez-vous les prendre ? | {amount} is missing on {account} for this expense. Where do you want to take it from? |
| `money.source.account` | Prendre sur {account}, {amount} libres | Take it from {account}, {amount} free |
| `money.source.received` | J'ai reçu de l'argent | I received money |
| `money.source.setAside` | Prendre sur {goal}, déjà sur {account} | Take it from {goal}, already on {account} |
| `money.willBeNegative` | {account} passera à {amount} ; il faudra régulariser. | {account} will go to {amount}; it will need to be settled. |
| `nw.outside` | Épargne hors comptes | Savings outside your accounts |
| `rec.card.expense` | {label} {amount} : payé ? | {label} {amount}: paid? |
| `rec.card.income` | {label} attendu : reçu ? | {label} expected: received? |
| `rec.card.notYet` | Pas encore | Not yet |
| `rec.card.other` | Autre montant | Other amount |
| `rec.card.yesFrom` | Oui, depuis {account} | Yes, from {account} |
| `reg.notDue` | Pas due | Not due |
| `reg.owe` | Je la dois encore | I still owe it |
| `reg.paid` | Payée | Paid |
| `reg.title` | À régulariser | To settle |
| `rep.corrections` | Corrections | Corrections |
| `rep.financing` | Financement | Financing |
| `rep.repaid` | Remboursements de dettes | Debt repayments |
| `rep.writeOffs` | Remises et pertes | Write-offs |
| `salary.pending` | Salaire attendu depuis le {date} : reçu ? | Salary expected since {date}: received? |
| `score.c.means` | Vivre selon ses moyens | Living within your means |
| `tg.gotPot` | J'ai reçu la cagnotte | I received the payout |
| `tontine.close.fees` | Frais de tontine comptés à la clôture : {amount} | Tontine fees counted at closing: {amount} |
| `tontine.close.gain` | Gain de tontine compté à la clôture : {amount} | Tontine gain counted at closing: {amount} |
| `tontine.closeSuggest` | Cette tontine semble terminée : la clôturer ? | This tontine seems finished: close it? |

### Modifiés (10)

| Clé | Avant (fr) | Français | English |
|---|---|---|---|
| `budget.auto.income` | Revenu mensuel prévu | Montant à répartir | Amount to allocate |
| `daily.deficit` | Ce mois-ci, vos dépenses dépassent vos revenus de {amount}. | Vos engagements d'ici le {date} dépassent votre argent disponible de {amount} | Your commitments until {date} exceed your available money by {amount} |
| `daily.needsIncome` | Indiquez votre revenu du mois pour savoir combien vous pouvez dépenser par jour. | Votre argent disponible aujourd'hui | Your available money today |
| `home.available` | Solde disponible | Argent disponible | Available money |
| `intel.capacity` | Capacité d'épargne estimée | Marge | Margin |
| `rep.csv.headers` | Date;Type;Montant;Devise;Compte;Vers;Catégorie;Bénéficiaire;Note | date;nature;compte;débit;crédit;devise;compte de destination;montant reçu;devise reçue;catégorie;sous-catégorie;motif;provenance | date;nature;account;debit;credit;currency;destination account;amount received;currency received;category;subcategory;reason;origin |
| `rep.saved` | Épargné | Épargne nette | Net savings |
| `score.c.budgets` | Respect des budgets | Respect du budget | Staying on budget |
| `score.c.emergency` | Fonds d'urgence | Épargne de précaution | Emergency savings |
| `score.c.savings` | Régularité de l'épargne | Taux d'épargne | Savings rate |
