# L'argent de l'utilisateur : modèle comptable (v2, décisions du fondateur du 2026-10-18)

Ce document fait foi pour tout calcul d'argent dans l'application. Il remplace la v1 du même
jour, et, sur les points qu'il traite, les règles 10, 11, 17, 18, 19, 20, 21 et 29 de
`CLAUDE.md` (liste exacte au §15).

Il vient :

- des tests sur téléphone du fondateur (cahier de tests : CPT-20, CPT-21, CPT-29, CPS-13,
  CPS-14, tous « Calcul faux », dont deux bloquants) ;
- de quatre audits du code au commit `c58c0e6` (grand livre ; flux du mois ; épargne,
  objectifs, tontines et dettes ; coach, saisie et famille). Ces audits ont relevé plus de
  cent incohérences.

**La règle d'or : pas un franc n'apparaît ni ne disparaît sans une opération qui dit d'où il
vient et où il va.** Tout le reste en découle.

---

## 0. Décisions du fondateur

| # | Question | Décision |
|---|---|---|
| D1 | Le revenu déclaré au profil est-il de l'argent ? | **Non.** C'est une information. Seul l'argent réellement là compte. |
| D2 | Épargne créée avec un montant | On demande d'où vient l'argent : pris sur le disponible, ou épargne que j'avais déjà avant. |
| D3 | Pas assez d'argent sur le compte qui paie | On propose de compléter, avec accord, avant tout enregistrement. Le contrôle se fait par compte. |
| D4 | Anciennes données | Les testeurs repartent de zéro. Il n'y a aucune migration, et rien n'est effacé. |
| D5 | Cagnotte de tontine reçue | C'est un **retour d'épargne**, plus une **avance du groupe** s'il y a lieu. **Jamais un revenu.** |
| D6 | « Cotisation sans tour » (association, mutuelle, ressortissants, caisse de décès) | C'est une **dépense** : l'argent ne revient pas. Tournante et collecteur restent de l'épargne. |
| D7 | Récurrences (salaire, loyer, abonnements) | Elles ne sont **jamais enregistrées seules**. Le jour prévu, on confirme d'un geste (« reçu ? », « payé ? »). |
| D8 | Période du reste par jour | Jusqu'à la veille de la **prochaine paie** si le jour de paie est connu, sinon jusqu'à la fin du mois. |

Limites de formule : **aucune ne change**. Les règles de calcul sont **identiques pour toutes
les formules**. Une formule peut réserver un ÉCRAN (par exemple Patrimoine), jamais la justesse
d'un total.

---

## 1. Vocabulaire

| Terme | Définition |
|---|---|
| **Compte courant (CC)** | Espèces, Mobile Money (Orange, MTN, Moov, Wave…), banque, carte. `isSavings: false`. |
| **Compte d'épargne (CE)** | Compte réservé à l'épargne : livret, épargne, investissement, compte Tontine. `isSavings: true`. |
| **Poche** | Objectif, réserve famille, tontine, prêt accordé, emprunt. Une poche n'est pas un compte : son argent est **adossé** à un compte, ou déclaré hors comptes (§5). |
| **Mise de côté** | Argent d'un objectif ou d'une réserve qui reste physiquement sur un CC précis, mais qui n'est plus disponible. |
| **Hors comptes** | Épargne qui existait avant l'application et qui n'est sur aucun compte saisi (argent confié à la famille, terrain, autre banque non saisie). Elle est déclarée, avec sa provenance. |
| **Extérieur** | Le reste du monde. Un revenu vient de l'extérieur, une dépense y va. |
| **Revenu déclaré** | Profil financier (« chaque mois je perçois environ… »). C'est une information, jamais de l'argent. |

Montants : entiers en unités mineures, jamais de conversion implicite de devise (règle 5).

---

## 2. Le grand livre

### 2.1 Équation

```
solde(compte, date) = ouverture + Σ entrées datées ≤ date − Σ sorties datées ≤ date
```

Le solde se dérive toujours des écritures : on ne le stocke jamais et on ne le modifie jamais
directement.

### 2.2 Les seules façons de créer ou de détruire de l'argent

La somme de tous les comptes et de l'épargne hors comptes, devise par devise, ne change QUE par :

| Nature | Effet | Exemple |
|---|---|---|
| **Ouverture** | + (argent qui existait avant l'application) | Espèces : 35 000 « gardés à la maison » |
| **Revenu** | + | Salaire, ventes, commission, pension, aide familiale reçue, cadeau |
| **Dépense** | − | Marché, taxi, loyer, ciment, funérailles |
| **Frais** | − (une dépense, liée à l'opération qui les cause) | Frais d'envoi Orange Money, frais de retrait chez un agent |
| **Intérêts** | − (une dépense, liée au remboursement) | Intérêts d'un crédit |
| **Ajustement** | ± (correction d'un écart constaté, **motif obligatoire**) | Écart de caisse, frais bancaires oubliés |
| **Financement** | ± (lié à une dette ou à une créance) | Emprunt reçu, prêt accordé, remboursements du capital |

**Tout le reste est un déplacement** : la somme ne change pas. Transfert entre comptes,
versement ou retrait d'épargne, contribution à un objectif, utilisation d'une réserve,
cotisation et cagnotte de tontine. Un test pur le vérifie : pour toute suite de
déplacements, le total ne bouge pas, au franc près.

### 2.3 Natures (une seule fonction pure : `natureOf`)

Toute opération reçoit **une** nature calculée. Les rapports, l'historique, l'export, le budget,
le reste par jour, le coach et le score lisent cette fonction, et rien d'autre.

| Nature | Ce que c'est | Revenus | Dépenses | Disponible |
|---|---|---|---|---|
| `revenu` | `income` sans dette, sans tontine, hors remboursement d'achat | **oui** | — | + s'il arrive sur un CC |
| `remboursement_achat` | `income` de catégorie `inc_refund` | — | vient **en déduction** de la catégorie de dépense | + |
| `depense` | `expense` de consommation | — | **oui** | − |
| `frais` | dépense liée à un transfert, à une tontine ou à un compte (`sub_other_fees`, entrée de tontine `fee`/`penalty`) | — | **oui** | − |
| `interets` | dépense liée à un remboursement de dette (`sub_debts_interest`) | — | **oui** | − |
| `cotisation_association` | opération liée à une tontine de type `fixed_contribution` (D6) | — | **oui** | − |
| `transfert` | CC ↔ CC, CE ↔ CE | — | — | ± selon le sens (CC ↔ CC ne change pas le total des CC) |
| `versement_epargne` | CC → CE, contribution à un objectif ou à une réserve | — | — | − |
| `retrait_epargne` | CE → CC, sortie d'une poche | — | — | + |
| `cotisation_tontine` | opération liée à une tournante ou à un collecteur | — | — | − si elle est payée depuis un CC |
| `retour_tontine` | cagnotte ou remise reçue (D5) | — | — | + |
| `emprunt_recu` | `income` lié à une dette « je dois » | — | — | + |
| `remboursement_capital` | `expense` lié à une dette « je dois » | — | — (ligne « Remboursements » à part) | − |
| `pret_accorde` | `expense` lié à une dette « on me doit » | — | — | − |
| `remboursement_recu` | `income` lié à une dette « on me doit » | — | — | + |
| `ajustement` | `type: 'adjustment'` | — | — | ± sur un CC |
| `ouverture` | écriture d'ouverture d'un compte (§3) | — | — | + sur un CC (première fois seulement) |

Un salaire versé directement sur un compte d'épargne est un `revenu`, et c'est aussi de l'épargne
(voir E46). Il ne devient jamais un ajustement.

Les natures se **calculent** : il n'y a rien à migrer. Le passé est donc reclassé lui aussi, ce
qui est voulu (D5, D6, dettes). Un rapport d'un mois passé peut changer sur ces seules lignes.

---

## 3. Comptes : ouverture, correction, cycle de vie

### 3.1 Ouverture (l'argent qui existait avant l'application)

L'ouverture est une **écriture datée, avec sa provenance**. Ce n'est pas un champ qu'on modifie.

- Champs à ajouter (facultatifs, compatibles avec l'existant) : `openingDate`, et `openingNote`
  pour la provenance en texte libre (« argent gardé à la maison », « Livret A Société
  Générale », « reste du salaire de septembre »).
- Elle s'affiche en **première ligne** de l'historique du compte (« Solde de départ — argent
  que j'avais déjà : 35 000 F ») et elle est **exportée** (§10.3).
- Elle est **figée dès la première opération** du compte. Ensuite, toute correction passe par un
  ajustement (§3.2).
- Ouverture d'un **CC** : c'est de l'argent disponible.
- Ouverture d'un **CE**, « que j'avais déjà avant » : de l'épargne. Elle ne change **ni le
  disponible ni le reste par jour**, ni ce mois-ci ni plus tard. `dailyAllowance.ts:96-99`
  (épargne de départ comptée comme épargne du mois) est supprimé.
- À la création d'un CE, **un seul** choix : « D'où vient cet argent ? »
  - « Je le prends sur mon argent disponible » : c'est un transfert depuis un CC, qui doit avoir
    assez d'argent (§6). Le disponible baisse.
  - « C'est de l'épargne que j'avais déjà » : c'est une ouverture, avec sa provenance. Le
    disponible ne bouge pas.

  Les deux champs actuels (`edit.tsx:143` et `:158`), qui permettent de compter deux fois la
  même somme, disparaissent.

### 3.2 Correction de solde (ajustement)

- « Corriger le solde » est possible sur **tout** compte actif, courant ou d'épargne. Il faut
  indiquer le solde réel constaté, la date et un **motif obligatoire** (« écart de caisse »,
  « frais oubliés », « solde réel de la banque »…).
- L'application crée l'ajustement de l'**écart** (sens `in` ou `out`). L'ouverture n'est jamais
  réécrite.
- Un ajustement n'entre dans aucun revenu, aucune dépense, aucun budget, aucun score, aucun taux
  d'épargne. Il figure dans l'historique (« Corrections +x / −y ») et dans l'export.
- Il change le disponible, puisque c'est l'argent réel.
- Le champ « Solde actuel » de l'écran de modification d'un compte, qui réécrit en fait
  l'ouverture (`edit.tsx:143`, `fr.ts:588`), devient un affichage du solde courant, avec le
  bouton « Corriger le solde ».
- Un argent qui vient de l'extérieur et qui n'existait pas avant est un **revenu**, jamais un
  ajustement. Le texte d'aide qui cite « un virement direct de l'employeur »
  (`fr.ts:1862`) est corrigé.

### 3.3 Cycle de vie d'un compte

| Action | Règle |
|---|---|
| Désactiver | Seulement à **solde 0**. Sinon, deux choix sont proposés : « Transférer le reste vers… » (transfert) ou « Constater une perte » (ajustement `out`, avec motif). |
| Supprimer | Seulement sans opération **et** avec une ouverture à 0. Sinon, on désactive d'abord. |
| Changer la devise | **Interdit** dès la première écriture ou dès une ouverture différente de 0. Changer de devise = nouveau compte + transfert entre devises. |
| Passer en épargne (ou l'inverse) | Seulement à solde 0. Sinon, on propose un transfert vers un compte de l'autre famille. Les calculs passés ne doivent pas changer. |
| Changer la devise principale (profil) | Une confirmation liste les comptes qui resteront dans l'ancienne devise. |

Une seule fonction pure dit quels comptes entrent dans les totaux (`countsInPosition`). Toutes
les fonctions l'utilisent, pour mettre fin aux définitions divergentes des comptes inactifs.

### 3.4 Transferts, frais et devises

- **Même devise** : le montant reçu est égal au montant envoyé. `toAmount` est **interdit**,
  dans la validation pure et dans la règle Firestore.
- **Frais** (envoi, retrait chez un agent, tenue de compte) : c'est une **dépense liée** de nature
  `frais`, sous-catégorie système `sub_other_fees` (« Frais d'envoi, de retrait et de compte »).
  Elle s'ajoute au catalogue comme une donnée (règle 21). Elle est créée dans le même lot que le
  transfert et supprimée avec lui (`linkedTransactionId`). Le formulaire de transfert reçoit un
  champ « Frais » facultatif.
- **Entre devises** : deux jambes, et le montant reçu est saisi. Aucun taux n'est inventé, et
  chaque devise s'équilibre séparément. Les soldes s'affichent par devise, côte à côte
  (« Disponible : 344 043 F · 1 000,00 € »), sans jamais être additionnés. Un complément (§6)
  n'est jamais pris dans une autre devise.

### 3.5 Découvert et carte (Europe)

- Champ facultatif `overdraftLimit` (au moins 0) sur un compte bancaire. Il vaut 0 par défaut,
  donc rien ne change en Côte d'Ivoire.
- Le solde peut descendre jusqu'à −limite. Disponible du compte = max(0, solde). La partie
  négative est une **dette à court terme** au patrimoine.
- Une carte à débit différé est un compte dont le solde négatif est une dette, réglée par un
  transfert depuis la banque.

---

## 4. L'argent disponible

```
D = Σ sur les CC actifs de la devise principale de :
      max(0, solde à aujourd'hui) − mises de côté portées par ce compte
```

- Seules les opérations datées **jusqu'à aujourd'hui** comptent. Une opération à date future
  est « à venir » : une dépense future est un engagement (§7), un revenu futur ne compte pas.
- Ne comptent **jamais** dans D : le revenu déclaré, un revenu récurrent non confirmé, une
  cagnotte attendue, un remboursement attendu, un CE, l'épargne hors comptes.
- Le **disponible d'un compte** = max(0, solde) − ses mises de côté. C'est ce chiffre que la
  feuille de complément contrôle (§6).
- L'accueil affiche trois montants, jamais additionnés par erreur :
  - **Argent disponible** = D ;
  - **Mis de côté** = CE + mises de côté sur des CC + épargne hors comptes + créances nettes de
    tontine ;
  - **Total de vos comptes** = Σ des soldes de tous les comptes actifs (CC + CE), par devise.

  L'épargne hors comptes n'est pas dans le total des comptes. Elle est au patrimoine.
- **Argent jamais renseigné** : aucun CC n'a d'ouverture, aucun revenu n'a été reçu, aucun
  ajustement ni transfert entrant. On affiche alors la carte « Votre argent disponible
  aujourd'hui » à la place de tout montant (§12.1).

---

## 5. Les poches

### 5.1 Règles communes

- **Adossement.** Chaque franc d'une poche est sous exactement une forme :
  - **sur un CE**, par transfert (la contribution porte un `transferId`) ;
  - **mis de côté sur un CC précis** : contribution sans transfert, avec un `accountId`
    **obligatoire**, et c'est un CC ;
  - **hors comptes** : épargne d'avant, déclarée avec sa provenance.

  Invariant : pour chaque CC, les mises de côté portées par ce compte ne dépassent jamais son
  solde.
- **Rien sous zéro** : ni objectif, ni réserve, ni CE.
- **Traçabilité** : chaque entrée dans une poche ou sortie d'une poche est une ligne de
  l'historique, « source → destination ». Exemple : « Mise de côté : Espèces → Moto, 30 000 ».
  Aujourd'hui, la mise de côté virtuelle est invisible.
- **Fermeture** : archiver, abandonner ou terminer une poche demande un solde 0. S'il reste de
  l'argent, on demande où il va (« Remettre dans mon disponible », « Garder sur l'épargne »),
  et une opération est créée.

Pourquoi garder la mise de côté sur un CC : beaucoup d'utilisateurs n'ont qu'Espèces et un
Mobile Money. En formule gratuite (3 comptes), les obliger à créer un compte d'épargne
reviendrait à ajouter une limite. La mise de côté est donc gardée, mais **rattachée à un
compte et visible**.

### 5.2 Objectifs

- Contribuer depuis un **CC** : c'est refusé au-delà du disponible de ce compte, sinon la feuille
  du §6 s'ouvre, sans proposer de puiser dans l'épargne pour la remettre en épargne.
  - Si l'objectif est rangé sur un CE : c'est un transfert CC → CE.
  - Sinon : c'est une mise de côté sur ce CC.
- Contribuer depuis un **CE** : c'est une affectation de la part libre de ce CE. Le disponible
  ne bouge pas, et on ne retire rien deux fois. C'est le n° 13 de l'audit A, aujourd'hui −50 000.
- **Montant initial** : un choix est obligatoire.
  - « Je le prends sur mon argent disponible » : une vraie contribution (transfert ou mise de
    côté). `initialAmount` vaut alors 0.
  - « Il est déjà sur mon compte d'épargne X » : une affectation.
  - « C'est de l'épargne hors de mes comptes » : `initialAmount` est gardé, avec
    `initialSource: 'outside'` et `initialNote` pour la provenance. On l'affiche « hors
    comptes ».
- Retirer : depuis la part sur un CE, c'est un transfert vers un CC. Depuis la part mise de
  côté, la mise de côté prend fin (aucun argent ne bouge, D monte). Depuis la part hors comptes,
  c'est « Je les ai remis sur un compte » (entrée sur le CC, de nature `retrait_epargne`, jamais
  un revenu).
- Le compte d'un objectif est un CE ou un CC (mise de côté). Changer de compte avec un solde
  positif crée le transfert correspondant.

### 5.3 Réserve famille et cérémonies

Mêmes règles que l'objectif. Pour une utilisation sur une dépense éligible de montant M, la part
couverte est min(M, solde **réellement adossé**) :

- part sur le CE de la réserve : transfert CE → CC qui paie ;
- part mise de côté sur le CC qui paie : la mise de côté prend fin, sans transfert ;
- part mise de côté sur un autre CC : transfert entre les deux CC, puis fin de la mise de côté ;
- part hors comptes : elle ne paie rien, puisque l'argent n'est sur aucun compte.

Le reste de la dépense suit le §6. La réserve ne paie jamais avec un argent qui n'est pas là :
c'est le n° 8 de l'audit C, où l'épargne passait sous zéro. Le budget du mois continue de lire
la part hors réserve (règle 19).

### 5.4 Tontines

- **Cotisation (tournante, collecteur)** : déplacement source → tontine. La créance augmente.
  Ce n'est pas une dépense. Depuis un CC, D baisse ; depuis un CE ou un objectif, D ne bouge pas.
- **Cagnotte reçue P (D5)**. Soit `créance` = cotisé − déjà reçu, juste avant la réception.
  - retour d'épargne = min(P, max(0, créance)) ;
  - avance du groupe = P − retour d'épargne : c'est une **dette envers le groupe**, éteinte par
    les cotisations suivantes ;
  - **aucun revenu**. D monte de P, puisque l'argent est là.

  | Tour (10 mains × 10 000, cagnotte 100 000) | Cotisé avant | Retour d'épargne | Avance du groupe |
  |---|---|---|---|
  | 1 | 10 000 | 10 000 | 90 000 |
  | 6 | 60 000 | 60 000 | 40 000 |
  | 10 | 100 000 | 100 000 | 0 |

- **Clôture du cycle** (dernière échéance passée, ou « terminée ») : écart = cotisé − reçu.
  - S'il est positif : dépense **« Frais de tontine »** (entrée `fee` liée). Exemple : cagnotte
    de 95 000 pour 100 000 cotisés, soit 5 000 de frais.
  - S'il est négatif : revenu « Gain de tontine ».
  - Ensuite, la position vaut 0. Un collecteur suit la même règle : 31 × 1 000 cotisés et
    30 000 remis donnent une commission de 1 000.
- **Cotisation sans tour (D6)** : **dépense**, sous-catégorie `sub_informal_dues`. Elle entre dans
  le budget et ne crée aucune créance.
- **Une période = une seule opération.** Une récurrence convertie ne génère plus d'opération
  seule (D7) : sa confirmation **est** la cotisation de la période (`recordTontine`). On ne
  paie donc plus deux fois (n° 16 de l'audit C).
- La tontine partagée suit les mêmes règles, avec l'action « J'ai reçu la cagnotte ».
- Mettre une tontine en pause ne la retire pas du patrimoine.

### 5.5 Dettes et prêts

| Événement | Écritures | Revenus | Dépenses | D | Dette / créance |
|---|---|---|---|---|---|
| Emprunt reçu P sur un compte A | entrée sur A, liée à la dette | 0 | 0 | +P | dette +P |
| Remboursement M = capital c + intérêts i | sortie c (capital) + dépense i (intérêts) liée | 0 | +i | −M | dette −c |
| Prêt accordé P depuis A | sortie de A, liée à la créance | 0 | 0 | −P | créance +P |
| Remboursement reçu c (+ intérêts i) | entrée c + revenu i | +i | 0 | +(c + i) | créance −c |

- **Pas de mouvement sans compte** : « Aucun compte » n'est plus le choix par défaut. « Hors de
  mes comptes » reste possible si on le choisit explicitement, et c'est alors visible.
- **Reste dû** = principal − Σ capital remboursé. Les intérêts sont **saisis** (0 par défaut),
  jamais inventés.
- **Clôturer** avec un reste R : « Dette remise » ou « Créance abandonnée ». C'est une écriture
  de patrimoine, visible dans les rapports sur une ligne « Remises et pertes ». Elle n'entre ni
  dans le budget du mois ni dans le reste par jour, puisqu'aucun argent ne bouge.
- **Supprimer** une dette qui a des remboursements est refusé. On propose de la clôturer.
- Les mensualités dues entrent dans les engagements (§7).

### 5.6 Patrimoine

```
patrimoine = Σ comptes (CC + CE, solde > 0) + épargne hors comptes + biens
           + créances (prêts accordés, créances de tontine)
           − dettes (emprunts, avances de tontine, découverts, cartes)
```

On n'y ajoute **jamais** les objectifs ni les réserves : ils sont déjà dans les comptes ou dans
l'épargne hors comptes.

---

## 6. Contrôle de toute sortie d'argent, et feuille de complément

### 6.1 Une seule fonction pure

`canDebit` et `spendPlan` (nom à adapter) contrôlent **toute** nouvelle sortie d'un CC ou d'un
CE :

- dépense, transfert, versement, contribution, cotisation, remboursement, prêt accordé ;
- frais liés ;
- confirmation d'une récurrence de dépense.

La sortie est acceptée si :

```
montant ≤ min sur les dates d ≥ date de l'opération de : disponible du compte à d
```

On vérifie donc le solde à la date de l'opération ET à chaque date suivante, aujourd'hui
compris. Une opération antidatée ne peut pas créer un trou dans le passé.

- Découvert autorisé : le disponible du compte inclut la limite.
- **Plusieurs lignes** (phrase, note vocale, conversation) : le contrôle porte sur le **cumul
  par compte**, avant « Tout valider ». La part prise sur une réserve est déduite d'abord.
- **Modification** d'une opération : seule la différence est contrôlée.
- Le contrôle se fait **avant** `ensureCashAccount`, sur un compte « Espèces » virtuel à 0. On ne
  crée pas un compte pour refuser ensuite la dépense.

### 6.2 Aucun argent renseigné

La dépense est refusée : « Indiquez d'abord votre argent disponible pour enregistrer une
dépense. » Un bouton ouvre la carte de l'accueil. Rien n'est enregistré. C'est la même chose
pour la voix, la phrase écrite et l'assistant.

### 6.3 Pas assez sur le compte qui paie

Une feuille s'ouvre **avant tout enregistrement** :

> Il manque 10 000 F sur Espèces pour cette dépense. D'où voulez-vous les prendre ?

Les choix, dans cet ordre, en ne montrant que ceux qui suffisent seuls. Chaque source n'est
proposée qu'une fois, avec ce qui y est réellement libre :

1. une mise de côté **sur ce même compte** (« Prendre sur la Moto, déjà sur Espèces ») : la mise
   de côté prend fin, et aucun argent ne bouge ;
2. un autre CC (« Prendre sur Orange Money, 40 000 F libres ») : un transfert ;
3. un CE (sa part libre), une réserve ou un objectif adossé à un CE : un retrait vers le compte
   qui paie ;
4. « J'ai reçu de l'argent » : on choisit la nature (revenu, emprunt, remboursement reçu,
   cagnotte), et ce n'est jamais un revenu par défaut ;
5. « Annuler ».

- Le complément et la sortie s'enregistrent **ensemble, tout ou rien** (`writeMany`).
  L'annulation après coup (`useEntrySave.ts:167-171`) ne suffit plus.
- Si rien ne suffit : « Vous n'avez pas assez d'argent pour cette dépense. » Rien n'est
  enregistré.
- Pour une mise de côté (versement, contribution, cotisation), la même feuille s'ouvre, mais sans
  les choix 1 et 3 : on ne puise pas dans l'épargne pour la remettre en épargne.
- **Dernier rempart** : `actions.saveTransaction` refuse toute nouvelle sortie qui rendrait un
  compte négatif (`ActionError('noMoney' | 'shortfall', { accountId, missing })`).
  - L'assistant (`app/assistant.tsx:211,216`) passe par `useEntrySave`.
  - Le message « Pas assez d'argent… » affiché après enregistrement (`circleNotice`) disparaît :
    la feuille passe avant.

### 6.4 Corriger le passé, plusieurs téléphones

- **Supprimer ou réduire** un revenu, ou un transfert reçu, est une correction : c'est permis.
  Si le compte passe sous zéro, une confirmation le dit avant d'enregistrer : « Espèces passera
  à −20 000 F ; il faudra régulariser. »
- **Deux téléphones** (ou deux membres d'un espace famille) dépensent hors ligne le même argent :
  après la synchronisation, le solde négatif est **affiché tel quel**. Une carte propose
  « Régulariser » (transfert ou correction), et rien n'est masqué.
  - Une nouvelle sortie sur ce compte doit couvrir le montant **plus** le déficit.
  - Les calculs ne plantent jamais sur un négatif (D compte max(0, solde)).

### 6.5 Espace famille

- Seuls l'administrateur et le conjoint renseignent l'argent de l'espace, puisque seuls eux
  peuvent créer des comptes, des revenus et des corrections. Un enfant voit « Demandez à un
  parent d'indiquer l'argent de la famille ».
- Un enfant subit le même contrôle. Quand il manque de l'argent, il n'a qu'un seul choix :
  **« Demander à un parent »**. Il ne fait ni transfert, ni retrait, ni revenu.
- Le miroir des permissions est aligné : `permissions.ts` ne laisse à l'enfant **que** les
  dépenses, comme `firestore.rules` (règle 4), avec un test de règles.
- Le revenu déclaré est personnel : aucun pourcentage « du revenu déclaré » dans un espace
  familial.

---

## 7. Le reste par jour

### 7.1 Horizon (D8)

- Un jour de paie est renseigné (une **date**, pas un montant) : H = veille de la prochaine paie.
  Le jour réel vaut min(jour, dernier jour du mois) : une paie le 30 tombe le 28 février.
- Sinon (commerçant, revenus irréguliers, pas de jour) : H = dernier jour du mois.
- **Prudence** : tant que la paie attendue n'est pas confirmée reçue, le calcul suppose qu'elle
  n'est pas arrivée. H va alors jusqu'à la veille de la paie suivante, et une carte « Salaire
  attendu depuis le 25 : reçu ? » s'affiche.
- Jours restants = H − aujourd'hui + 1. Le résultat est arrondi **vers le bas**.
- Aucune valeur par défaut : la valeur « 25 par défaut » (`payDay ?? 25`) disparaît.

### 7.2 Engagements restants E sur [aujourd'hui ; H]

```
E = récurrences de DÉPENSE non confirmées dues dans l'horizon, et celles en retard
  + cotisations de tontine dues dans l'horizon ou en retard, non payées
  + mensualités de dettes « je dois » dues dans l'horizon ou en retard
  + dépenses saisies à une date future ≤ H
  + Σ objectifs et réserves : max(0, mise de côté prévue pour la période − déjà versé sur la période)
```

- « Déjà versé sur la période » = Σ des contributions de la période à **cet** objectif (transfert,
  mise de côté ou affectation).
- Les revenus attendus (salaire, cagnotte, remboursement d'un prêt accordé) **ne réduisent
  jamais** E.
- Une dépense payée par une réserve ne réduit D que de sa part hors réserve. C'est automatique,
  puisque la réserve paie avec son propre argent (§5.3).

### 7.3 Formule et affichage

```
argent jamais renseigné  → carte « Votre argent disponible aujourd'hui »
D − E < 0                → « Vos engagements d'ici le {date} dépassent votre argent disponible de {E − D} »
sinon                    → reste par jour = ⌊(D − E) / jours restants⌋
                           « Il vous reste X F par jour jusqu'au {date} »
```

- « Comment c'est calculé ? » montre D, chaque engagement et le nombre de jours.
- **Le revenu déclaré n'y entre jamais.** Pas plus que « revenus − dépenses du mois ». Le
  simulateur « Puis-je contribuer ? », le message « Enregistré ✓, il vous reste X par jour »
  et la conversation appellent **la même** fonction, sur la même vue des données.

---

## 8. Récurrences (D7)

- Une récurrence est un **engagement** (dépense) ou une **attente** (revenu). Elle n'est
  **jamais** enregistrée seule : `runRecurring` ne crée plus d'opération.
- Le jour J :
  - pour une dépense, une carte « Loyer 30 000 F : payé ? » propose [Oui, depuis {compte}],
    [Autre montant] et [Pas encore]. Le « Oui » passe par `saveTransaction`, donc par le §6 ;
  - pour un revenu, une carte « Salaire attendu : reçu ? » propose un montant **visible et
    modifiable** avant la validation : le dernier montant reçu, à défaut le revenu déclaré.
    Jamais un geste unique sur le déclaré.
- Tant qu'elle n'est pas confirmée, une dépense reste dans E. Un revenu non confirmé ne compte
  pas et **n'est jamais rattrapé** (fin des 24 échéances rattrapées d'un coup).
- Identifiants déterministes à la confirmation : deux téléphones ne créent pas deux loyers.
- L'inscription ne crée **plus** de récurrence de salaire (`defaults.ts:248-267`).
- Une récurrence sur un compte désactivé est signalée, avec un autre compte proposé. Elle n'est
  jamais sautée en silence.
- Calendrier : les revenus récurrents s'affichent « attendu, non reçu ».

---

## 9. Budget et enveloppes

- Les enveloppes démarrent **à 0**. Il n'y a plus de `proposeBudget(revenu déclaré)` à
  l'inscription (`defaults.ts:204`), plus de « Budget dispo, encore allouable » et plus
  d'enveloppe Épargne à 10 %. Le budget automatique (Plus) ne propose des montants que sur
  demande, à partir d'un champ « Montant à répartir » prérempli avec D, jamais avec le déclaré.
- **Reste à répartir** :

  ```
  resteARepartir = D − Σ enveloppes max(0, budget − dépensé) − engagements hors enveloppes
  ```

  - Le `max(0, …)` est indispensable : un dépassement est déjà sorti de D.
  - Un engagement dont la catégorie appartient à une enveloppe est déjà représenté par le budget
    de cette enveloppe : on ne le compte pas deux fois.
  - Si le résultat est négatif : « Vos enveloppes dépassent votre argent disponible de X F. »
- Pour chaque enveloppe, sa part en % du revenu déclaré, à **deux décimales**, présentée comme
  une information (« 18,75 % de votre revenu déclaré »). Rien de tel dans un espace familial.
- « Dépenses hors enveloppe » se calcule sur la même base que les enveloppes
  (`budgetTransactions`) : la part payée par une réserve n'y apparaît plus (n° 17 de l'audit B).
- Les mouvements du cercle (versements, cotisations de tournante) ne sont pas des dépenses.
  L'enveloppe Épargne, si elle existe, se remplit de ces mouvements.

---

## 10. Rapports, historique, export

### 10.1 Rapport d'une période (mêmes natures partout)

| Ligne | Contenu |
|---|---|
| **Revenus** (R) | nature `revenu` seulement |
| **Dépenses** (C) | `depense` + `frais` + `interets` + `cotisation_association` − `remboursement_achat` |
| **Remboursements de dettes** | `remboursement_capital` |
| **Épargne nette** (S) | versements − retraits (CE, objectifs, réserves, mises de côté, cotisations de tournante payées depuis un CC, retours de tontine) |
| **Financement** | emprunts reçus, prêts accordés, remboursements reçus, sur une ligne à part |
| **Corrections** | ajustements + / − |
| **Remises et pertes** | dettes remises, créances abandonnées |

Le **résultat** de la période vaut R − C − remboursements. Le mot « Solde » est réservé au solde
d'un compte.

### 10.2 Historique

- Les totaux de l'historique sont **identiques** à ceux du rapport de la même période : un test
  de parité le vérifie.
- **Vue par compte = relevé** : solde au début, entrées (revenus, transferts reçus, corrections +,
  retours), sorties, solde à la fin. Un test vérifie que **début + entrées − sorties = fin**.
- L'ouverture apparaît en tête. Chaque mise de côté et chaque utilisation de réserve est une
  ligne.

### 10.3 Export CSV

- Colonnes : date ; nature ; compte ; débit ; crédit ; devise ; compte de destination ; montant
  reçu ; devise reçue ; catégorie ; sous-catégorie ; motif ; provenance.
- Une ligne d'**ouverture** par compte.
- Test : pour chaque compte, ouverture + Σ crédits − Σ débits du CSV = solde affiché, au franc
  près.

---

## 11. Le coach, les conseils et le score

### 11.1 Définitions

Il y a une seule fonction pure par notion, dans `src/core`. Les montants sont dans la devise de
l'espace.

| Symbole | Définition |
|---|---|
| **D** | Argent disponible (§4) |
| **E** | Engagements restants (§7.2) |
| **R** | Revenus reçus sur la période (nature `revenu`). **Jamais le déclaré**, jamais une cagnotte, un emprunt ou un remboursement. |
| **C** | Dépenses de la période (§10.1) |
| **Rb** | Remboursements de dettes de la période (capital) |
| **S** | Épargne nette de la période (§10.1). Sur un cycle complet, une tournante donne S = 0, ce qui est juste. |
| **τ** | Taux d'épargne = S / R, seulement si R > 0 |
| **Marge** | R − C − Rb − S : l'argent non affecté. Elle remplace la « capacité d'épargne ». |
| **Ess** | Dépenses essentielles mensuelles : moyenne sur les mois clos (jusqu'à 3) de logement, alimentation, transport, santé, eau et énergie, scolarité, remboursements et soutiens familiaux réguliers. Les catégories sont prises **par identifiant**. |
| **F** | Épargne de précaution = CE de type urgence ou général + objectif « Fonds d'urgence » + réserve famille. Les objectifs à date (moto, mariage) n'en font pas partie. |
| **MC** | Mois couverts = F / Ess |
| **CF** | Part des charges fixes = charges fixes moyennes / R moyen |
| **TE** | Taux d'endettement = mensualités en cours / R moyen |
| **Irrégularité** | Revenus irréguliers si le profil le dit (`incomeNature` variable ou irrégulier), ou si l'écart-type de R sur 6 mois dépasse 30 % de sa moyenne |

Arrondis :

- un montant qu'on propose de **dépenser ou de mettre de côté** est arrondi **vers le bas** ;
- un montant **qui manque** est arrondi **vers le haut** ;
- un pourcentage affiché est arrondi vers le bas, à l'unité ;
- jamais « environ » devant un montant calculé exactement.

### 11.2 Règle des 10 %

```
conseil   = ⌊0,10 × R⌋                       (R = revenus reçus de la période en cours)
faisable  = min(conseil − déjà épargné, max(0, D − E))
```

- R = 150 000 : « 10 % de vos revenus reçus : 15 000 F. »
- R = 150 000, D = 40 000, E = 30 000 : « … Aujourd'hui, vous pouvez en mettre 10 000 F de côté
  sans toucher à vos engagements. »
- Déjà épargné 9 000 : « Vous avez déjà mis 9 000 F de côté (6 %). Encore 6 000 F pour
  atteindre 10 %. »
- R = 0, même avec un revenu déclaré : **aucun montant**. Le texte est : « Quand vous recevez de
  l'argent, mettre 10 % de côté tout de suite, c'est l'habitude qui protège. »
- **Revenus irréguliers** (commerce, agriculture, petits travaux) : à **chaque** revenu reçu, une
  carte « Mettre 2 500 F de côté maintenant ? » (pour 25 000 reçus) propose un versement à
  confirmer. C'est l'épargne à la source.

### 11.3 Indicateurs et seuils

Ce sont des **repères prudents de l'application** (provenance `estimate`, règle 11), les mêmes
dans tous les pays sauf mention contraire. Ils servent à informer, jamais à juger : des chiffres
et des options (règle 19).

| Indicateur | Repère | Message (exemple) |
|---|---|---|
| Engagements contre disponible | E > D : priorité absolue | « Vos engagements d'ici le 24 dépassent votre argent disponible de 12 000 F. » |
| Vivre selon ses moyens | C + Rb > R deux mois clos sur trois | « Ce mois-ci, vos dépenses et remboursements (165 000 F) ont dépassé vos revenus reçus (150 000 F) de 15 000 F. » |
| Épargne de précaution | 3 mois d'Ess ; **6 mois** si les revenus sont irréguliers | « Votre épargne de précaution couvre 2 mois de dépenses essentielles. Objectif : 3 mois, soit 270 000 F (encore 90 000 F). » |
| Taux d'épargne | Objectif 10 % ; 5 % = bon début | « Vous épargnez 15 % de vos revenus reçus. » |
| Charges fixes | < 50 % confortable ; 50 à 60 % vigilance ; > 60 % alerte | « Vos charges fixes prennent 60 % de vos revenus reçus. » |
| Endettement | Vigilance à 33 % (règle du tiers) ; alerte à 40 % | « Vos remboursements prennent 40 % de vos revenus reçus : mieux vaut éviter un nouveau crédit pour l'instant. » |
| Imprévus familiaux | Imprévus > 10 % de R sur 3 mois : on propose une réserve de 3 mois d'imprévus | « Une réserve famille de 54 000 F couvrirait trois mois d'imprévus. » |
| Tontine | Avant son tour : épargne. Après la cagnotte : les cotisations restantes remboursent l'avance | « Vous avez reçu la cagnotte ; vos 4 prochaines cotisations remboursent l'avance du groupe (40 000 F). » |

- Les seuils en montant (« plus de 10 000 », « 20 000 ») se **proportionnent à la devise** (table
  dans `core`), ou s'expriment en pourcentage de R. Ils ne sont jamais codés en FCFA pour tous.
- « Puis-je acheter… ? » compare à D − E, donc tient compte du loyer et des cotisations à venir.
- Aucun bénéficiaire, défunt ni nom saisi n'apparaît dans un texte du coach (règle 19).

### 11.4 Un seul producteur par conseil, dans cet ordre

1. Argent jamais renseigné : aucun conseil chiffré (carte du §12.1).
2. E > D.
3. Échéance de dette ou cotisation en retard.
4. MC < 1 mois.
5. C + Rb > R deux mois sur trois.
6. τ < 10 % : règle des 10 %.
7. CF > 60 %, ou TE ≥ 33 % (puis ≥ 40 %).
8. Objectifs : effort nécessaire, comparé à Marge + S.
9. Félicitations.

Chaque conseil a une seule clé, et les doublons entre `insights.ts` et `intelligence.ts`
disparaissent. Il n'y a qu'**un** moteur.

### 11.5 Score de comportement (sur 100, mois clos)

Le score n'est calculé que si R > 0 sur le mois, si l'argent est renseigné et si au moins
10 opérations ont été saisies. Une composante sans données est exclue, et les poids restants
sont recalculés.

| Composante | Poids | Valeur (0 à 1) |
|---|---|---|
| Taux d'épargne | 30 | min(1, τ / 10 %) |
| Vivre selon ses moyens | 25 | 1 si C + Rb ≤ R, sinon max(0, 1 − (C + Rb − R) / R) |
| Épargne de précaution | 20 | min(1, MC / cible), avec une cible de 3 ou 6 mois |
| Respect du budget | 15 | 1 − Σ max(0, dépensé − budget) / Σ budget (cercle exclu) |
| Dettes | 10 | 0,5 × (aucune échéance en retard) + 0,5 × (TE ≤ 33 %) |

1 F épargné ne donne plus 71/100 : le taux d'épargne vaut alors 0. Un fonds d'urgence de
3 000 F ne donne plus 100/100. Ne rien épargner ne compte jamais comme un budget tenu.

### 11.6 Écrans d'analyse, simulateurs, assistant

- La **capacité d'épargne** est remplacée par la Marge, calculée sur des **mois clos** de R
  observés. Sans mois clos : « Pas encore assez de données ». Jamais un montant tiré du
  déclaré (fin du « Vous pourriez consacrer 150 000 par mois »).
- Simulateur d'indépendance, budget automatique : ils sont préremplis seulement avec des valeurs
  observées. Sinon, les champs restent vides.
- L'alerte « solde bas » se calcule **date par date**, sans compter un revenu non reçu.
- Le résumé envoyé à l'assistant (`core/ai/summary.ts`) transmet D, E, R, C, S et les
  indicateurs déjà calculés. L'assistant reformule, il ne recalcule pas (règle 7). Le texte
  système dit le vrai pays de la personne, et non « Afrique francophone » pour tous.

### 11.7 Saisie (parseur)

Le sens des dettes est corrigé dans `core/entry/parse.ts` et `vocabulary.json` :

| Phrase | Avant | Après |
|---|---|---|
| « J'ai remboursé Paul 10 000 » | revenu | remboursement de dette (sortie), « dette à choisir » surligné |
| « On m'a prêté 50 000 », « J'ai emprunté 50 000 » | dépense | emprunt reçu (entrée), à confirmer |
| « J'ai prêté 20 000 à mon cousin » | dépense | prêt accordé (sortie) |
| « J'ai reçu le prêt de la banque 500 000 » | revenu | emprunt reçu |
| « J'ai reçu une facture de 20 000 » | revenu | dépense, champ surligné (règle 18 : jamais deviné) |
| « J'ai reçu la cagnotte 100 000 » | revenu | retour de tontine, tontine à choisir |

---

## 12. Parcours à l'écran

### 12.1 Inscription et accueil

- Les questions sur les revenus restent, et restent **déclaratives**. L'étape « Où se trouve
  votre argent ? » garde le choix des sources (elle crée les comptes à 0), **sans montant**.
- **Aucun** « X par jour », aucune enveloppe préremplie, aucune récurrence de salaire à
  l'inscription.
- Accueil, tant que l'argent n'est pas renseigné : carte « Votre argent disponible
  aujourd'hui », avec un champ par compte courant (Espèces par défaut) et une provenance
  facultative. Elle crée les **ouvertures** (§3.1).
  - La carte « Indiquer mon revenu », qui ouvre le profil (`DailyAllowanceCard.tsx:97-102`), est
    remplacée par celle-ci.
- Ensuite, l'argent ne change que par des opérations : « J'ai reçu de l'argent » (revenu ou autre
  entrée, la nature est choisie), une dépense, un transfert, « Corriger le solde ».

### 12.2 Textes

Tous les textes passent par `t('clé')`, en français puis en anglais avec les mêmes paramètres.
Les nouveaux textes et ceux qui changent sont listés dans le rapport de l'étape 3, **pour
l'accord du fondateur** avant la fusion. C'est la règle permanente : aucun texte ne change sans
son accord.

---

## 13. Données déjà enregistrées (D4)

- Il n'y a **aucune migration** et rien n'est effacé. Les anciennes données s'affichent sans
  planter. Un ancien solde négatif reste visible, avec « Régulariser ».
- Natures calculées (§2.3) : les anciennes cagnottes, cotisations sans tour et opérations liées
  à une dette sont reclassées à l'affichage, et les rapports passés changent sur ces lignes.
- Une ancienne contribution sans transfert et sans compte compte comme une mise de côté sur le
  premier CC actif, ce qui revient au calcul d'aujourd'hui.
- Un ancien montant initial d'objectif devient « hors comptes, provenance non précisée » : le
  disponible ne change pas.
- Les anciennes récurrences ne s'enregistrent plus seules : elles passent en « à confirmer »
  (D7). Les anciennes enveloppes préremplies sont gardées telles quelles.

---

## 14. Exemples qui servent de tests

Sauf mention contraire, on est le **15 d'un mois de 31 jours, sans jour de paie : 17 jours
restants**. Montants en FCFA. Chaque ligne devient au moins un test pur.

### Argent disponible et reste par jour

| # | Situation | Résultat attendu |
|---|---|---|
| E1 | Compte neuf, « Plus tard », aucune somme. Dépense Transport 5 000 | Refusée : « Indiquez d'abord votre argent disponible… ». Rien n'est enregistré, aucun compte n'est créé. |
| E2 | Revenu déclaré 200 000 au profil, rien d'autre | D = 0. Carte « Votre argent disponible aujourd'hui ». Aucun « par jour », aucun conseil chiffré. |
| E3 | Ouverture Espèces 100 000 | 100 000 / 17 = **5 882** |
| E4 | E3, puis versement de 60 000 sur un CE « depuis mon disponible » | D = 40 000 ; mis de côté 60 000 ; total des comptes 100 000 (jamais 160 000) ; 40 000 / 17 = **2 352** |
| E5 | E4, puis dépense de 50 000 sur Espèces | Feuille « Il manque 10 000 F… ». « Prendre sur l'épargne » : retrait de 10 000, puis la dépense, en un seul lot. Espèces 0, CE 50 000, aucun négatif. |
| E6 | E5, avec « Annuler » | Rien n'est enregistré : Espèces 40 000, CE 60 000. |
| E7 | Espèces 0, Orange Money 40 000, dépense de 5 000 en Espèces | Premier choix proposé : « Prendre sur Orange Money ». OM 35 000, Espèces 0. |
| E8 | Création d'un CE de 500 000 « que j'avais déjà », provenance « Livret à la banque » | D inchangé, reste par jour inchangé (ce mois-ci et le suivant). Mis de côté +500 000. Ouverture visible en tête de l'historique du CE. |
| E9 | Déclaré 800 000 ; enveloppes Maison 150 000 et Nourriture 150 000 ; D = 800 000 | Reste à répartir **500 000** ; Maison et Nourriture à **18,75 %** du revenu déclaré ; aucun argent ajouté. |
| E10 | Inscription complète avec un revenu déclaré de 150 000, sans rien d'autre | Aucune enveloppe préremplie, aucun budget allouable, aucun « par jour », aucune récurrence de salaire. |
| E11 | D = 100 000 ; loyer récurrent 30 000 le 28 ; objectif à 20 000 par mois, rien de versé | E = 50 000 ; 50 000 / 17 = **2 941** |
| E11b | E11 + une mensualité de dette de 25 000 le 30 | E = 75 000 ; 25 000 / 17 = **1 470** |
| E11c | E11, puis 20 000 versés à l'objectif depuis Espèces | D = 80 000, E = 30 000 : toujours **2 941** (verser ce qui était prévu ne change rien) |
| E12 | Phrase « taxi 30 000 et marché 20 000 », Espèces 40 000 | Feuille avant « Tout valider » : il manque 10 000 sur le cumul. |

### Paie, récurrences, dates

| # | Situation | Résultat attendu |
|---|---|---|
| E31 | 18 octobre, paie le 25, D = 42 000 ; tontine 10 000 le 20 ; loyer 30 000 le 28 | H = 24 octobre, 7 jours ; E = 10 000 (le loyer tombe après l'horizon) ; 32 000 / 7 = **4 571** |
| E32 | 25 octobre, salaire **confirmé** 200 000, D = 204 000 ; loyer 30 000 le 28 ; tontine 10 000 le 20 novembre ; objectif 20 000 | H = 24 novembre, 31 jours ; E = 60 000 ; 144 000 / 31 = **4 645** |
| E33 | 26 octobre, salaire du 25 **non confirmé**, D = 4 000 ; loyer 30 000 le 28 | « Vos engagements d'ici le 24 novembre dépassent votre argent disponible de 26 000 F », plus la carte « Salaire attendu : reçu ? ». Aucun revenu compté. |
| E34 | D = 100 000, loyer récurrent 30 000 le 5, on est le 6, rien de confirmé | D = 100 000 ; le loyer en retard est dans E. Confirmé le 7 : D = 70 000, et le loyer sort de E. |
| E35 | Le 10 : salaire saisi daté du 25 ; dépense de 15 000 datée du 20 | Le salaire ne compte pas dans D avant le 25 (affiché « à venir ») ; la dépense de 15 000 est dans E. |
| E36 | Six mois sans ouvrir l'application, avec une récurrence de salaire | Aucun revenu créé. Une seule carte « Salaire attendu : reçu ? ». |
| E37 | Deux téléphones confirment le même loyer hors ligne | Une seule opération après la synchronisation (identifiant déterministe). |

### Poches

| # | Situation | Résultat attendu |
|---|---|---|
| E13 | Espèces 100 000 ; contribution de 30 000 à la Moto, « laisser sur Espèces » | Solde Espèces 100 000 ; D = 70 000 ; Moto 30 000 ; total des comptes 100 000 ; ligne d'historique « Mise de côté : Espèces → Moto ». |
| E14 | E13, puis dépense de 80 000 sur Espèces | Il manque 10 000. Premier choix : « Prendre sur la Moto (déjà sur Espèces) », qui met fin à 10 000 de mise de côté sans transfert. Espèces 20 000, Moto 20 000, D = 0. |
| E15 | Espèces 100 000 ; objectif Moto créé avec 80 000 « hors de mes comptes » | D = 100 000 ; Moto 80 000 « hors comptes » ; total des comptes 100 000 ; patrimoine +80 000. |
| E16 | Espèces 100 000, CE 60 000 ; affectation de 60 000 du CE à la Moto | D = 100 000 (pas 40 000, pas −50 000) ; CE 60 000 dont Moto 60 000 ; mis de côté 60 000 (jamais 120 000). |
| E17 | Réserve de 50 000 sur un CE (50 000) ; funérailles de 70 000 payées en Espèces (30 000) | Transfert lié CE → Espèces de 50 000, puis la dépense de 70 000. Espèces 10 000, CE 0, réserve 0. Budget Famille : 20 000 ; hors enveloppe : 0. |
| E17b | Réserve de 50 000 « hors comptes », CE à 0 ; funérailles de 20 000 | La réserve ne paie rien. Le §6 s'applique, et aucun compte ne passe sous zéro. |
| E24 | Objectif mis de côté de 300 000, puis « Archiver » | La destination est demandée. « Remettre dans mon disponible » met fin à la mise de côté, avec une ligne d'historique ; D +300 000. |

### Tontines

| # | Situation | Résultat attendu |
|---|---|---|
| E18 | 10 mains × 10 000 par mois, salaire 150 000, mon tour au 6e mois : cotisation 10 000, puis cagnotte 100 000 | Revenus du mois = **150 000** (pas 250 000). Retour d'épargne 60 000, avance du groupe 40 000 (dette). Le conseil des 10 % vaut **15 000**. |
| E19 | Cycle complet (10 × 10 000, cagnotte 100 000) | Revenus 0, dépenses 0. D final = D initial, hors salaire. |
| E19b | Même cycle, cagnotte de 95 000, cycle clôturé | Dépense « Frais de tontine » de 5 000 ; position 0. |
| E20 | Collecteur 31 × 1 000, remise de 30 000 | Revenus 0 ; dépense « Commission » 1 000 à la clôture ; position 0. |
| E21 | Cotisation sans tour (association), 5 000 par mois | Dépense de 5 000 (`sub_informal_dues`), dans le budget ; D −5 000 ; aucune créance. |
| E25 | 6 cotisations de tournante de 10 000 depuis Espèces (formule gratuite) | D −60 000 ; mis de côté +60 000 (créance de tontine) ; patrimoine inchangé. |
| E25b | Récurrence convertie en tontine, échéance confirmée « payée » | Une seule cotisation pour la période, jamais deux (fin du double paiement de 20 000). |

### Dettes et prêts

| # | Situation | Résultat attendu |
|---|---|---|
| E22 | Emprunt de 200 000 reçu sur Orange Money | D +200 000 ; revenus 0 ; dette 200 000 ; patrimoine net inchangé. |
| E23 | Remboursement de 110 000, dont 10 000 d'intérêts | D −110 000 ; dette −100 000 ; dépenses +10 000 (Dettes › Intérêts) ; ligne « Remboursements » 100 000. |
| E23b | Crédit de 1 000 000, six mensualités saisies avec leur part d'intérêts | Reste dû = 1 000 000 − Σ capital : aucun écart dû aux intérêts. |
| E24b | Prêt de 50 000 au cousin, remboursé deux mois plus tard | Revenus 0 et dépenses 0 sur les deux mois ; créance 50 000, puis 0 ; D −50 000, puis +50 000. |
| E47 | Supprimer une dette qui a des remboursements | Refusé ; on propose de la clôturer. |
| E48 | Clôturer une dette avec un reste de 20 000 (remise) | Ligne « Remises et pertes » +20 000 au patrimoine ; ni revenu du mois, ni budget, ni reste par jour. |
| E49 | Remboursement saisi sans compte | Refusé par défaut. « Hors de mes comptes » seulement par choix explicite, et visible. |

### Comptes, frais, devises, corrections

| # | Situation | Résultat attendu |
|---|---|---|
| E25c | Transfert OM → Wave de 50 000, frais 500 | OM −50 500 ; Wave +50 000 ; dépenses +500 (frais) ; total des comptes −500. Supprimer le transfert supprime les frais. |
| E26 | Retrait chez un agent : OM → Espèces 20 000, frais 300 | OM −20 300 ; Espèces +20 000 ; dépenses +300. |
| E26b | Transfert en même devise avec un montant reçu différent | Refusé (validation pure et règle Firestore). |
| E27 | Désactiver Wave à 30 000 | Refusé. Après un transfert de 30 000 vers Espèces : accepté ; total inchangé. |
| E28 | Ouverture 100 000, dépense 30 000 (solde 70 000), argent compté réellement : 60 000 | « Corriger le solde » crée un ajustement `out` de 10 000, avec le motif « écart de caisse ». L'ouverture reste à 100 000, les dépenses du mois sont inchangées, D = 60 000. |
| E28b | Même compte, « corriger » à 70 000 | Aucun ajustement (le solde est déjà de 70 000). |
| E29 | Changer la devise d'un compte XOF déjà utilisé | Refusé. |
| E30 | Banque XOF 1 000 000 → compte EUR : envoyé 655 957, reçu 1 000,00 € | XOF 344 043 ; EUR 1 000,00 € ; affiché « 344 043 F · 1 000,00 € », jamais additionné ; revenus et dépenses inchangés. |
| E46 | Salaire de 300 000 viré directement sur un CE | R +300 000 ; S +300 000 ; D inchangé ; jamais un ajustement. |
| E49b | Supprimer un compte jamais utilisé avec une ouverture de 80 000 | Refusé ; on désactive d'abord (solde 0 exigé). |
| E50 | Passer en épargne un Wave à 50 000 | Refusé ; on propose un transfert vers un CE. |
| E40 | Espèces 40 000 ; deux téléphones dépensent chacun 30 000 hors ligne | Après la synchronisation : Espèces −20 000 affiché, carte « Régulariser ». Une nouvelle dépense de 5 000 sur Espèces : il manque 25 000. |
| E40b | Supprimer un revenu de 50 000 déjà dépensé (Espèces 10 000 après dépenses) | Confirmation : « Espèces passera à −40 000 F ; il faudra régulariser. » La suppression est permise. |
| E42 | Banque avec découvert autorisé de 300 €, solde 100 € ; dépense de 350 € | Acceptée ; solde −250 € ; D = 0 ; dette à court terme 250 €. Une dépense de 450 € : il manque 50 €. |
| E43 | Funérailles de 100 000, dont 80 000 pris sur la réserve | Hors enveloppe : **0** ; Famille dépensé : 20 000. |
| E44 | D = 100 000 ; Nourriture budget 50 000, dépensé 70 000 ; Maison 30 000, dépensé 0 (loyer récurrent dans Maison) ; tontine 10 000 hors enveloppe | Reste à répartir = 100 000 − (0 + 30 000) − 10 000 = **60 000** |
| E45 | D = 40 000 ; CE 60 000 dont objectif 60 000 ; tontine : 30 000 cotisés, rien reçu ; emprunt de 50 000 restant | Patrimoine = 40 000 + 60 000 + 30 000 − 50 000 = **80 000** (jamais 140 000) |
| E51 | Historique filtré sur Wave : début 0, transfert reçu 50 000, dépense 10 000 | Entrées 50 000, sorties 10 000, fin **40 000** |
| E52 | Revenu 100 000 et cotisation de tournante 10 000 sur le même mois | Historique et rapport identiques : Revenus 100 000, Dépenses 0, Épargne nette 10 000 |
| E53 | Export CSV d'un compte ouvert à 100 000, avec une dépense de 30 000 | Ligne d'ouverture + débit 30 000 ; la somme donne 70 000 = solde affiché |

### Coach, saisie, famille

| # | Situation | Résultat attendu |
|---|---|---|
| E38 | R = 150 000, D = 120 000, E = 40 000 | « 10 % de vos revenus reçus : 15 000 F. » |
| E38b | R = 150 000, D = 40 000, E = 30 000 | Faisable : **10 000** |
| E38c | Revenu déclaré 150 000, R = 0 | Aucun montant (fin de « Vous pourriez consacrer 150 000 F par mois ») |
| E38d | Commerçant (revenus irréguliers) qui reçoit 25 000 | Carte « Mettre 2 500 F de côté maintenant ? » |
| E39 | Salaire 200 000, dépenses 120 000, cotisations de tontine 50 000 | Marge = **30 000** (pas 80 000) ; τ = 25 % |
| E39b | Score avec 1 F épargné et R = 200 000 | Composante épargne = 0 (pas 100 %) |
| E39c | F = 180 000, Ess = 90 000, revenus réguliers | « … couvre 2 mois… Objectif : 3 mois, soit 270 000 F (encore 90 000 F). » |
| E39d | Phrases du §11.7 | Les natures de la colonne « Après » ; jamais un revenu pour un remboursement ou un emprunt |
| E41 | Enfant d'un espace famille, dépense supérieure au disponible du compte | Un seul choix : « Demander à un parent ». Rien n'est enregistré. |
| E41b | Un enfant tente un revenu ou un transfert | Refusé par `permissions.ts` ET par les règles (test de règles). |

---

## 15. Règles de `CLAUDE.md` à mettre à jour (à faire dans la même branche)

- **Règle 10** : « Aucun blocage de saisie » ne vaut plus pour les **sorties d'argent** (§6).
  `ensureCashAccount` crée toujours « Espèces » à 0, **après** le contrôle.
- **Règle 11** : le revenu déclaré (`declared`) ne sert qu'à des **pourcentages présentés comme
  tels** et au préremplissage d'un champ modifiable. Jamais à un montant.
- **Règle 17** : le coach lit les définitions du §11, et lui seul : un moteur, un producteur par
  conseil.
- **Règle 18** : « Reste par jour » = §7 (horizon de paie, engagements, jamais le déclaré).
- **Règle 19** : « complément montré, jamais bloqué » est remplacé par §5.3 et §6 : la réserve
  paie avec l'argent qui y est, et le reste passe par la feuille de complément.
- **Règle 20** : la cagnotte est un **retour d'épargne + avance du groupe**, jamais un revenu (D5).
  La cotisation sans tour est une dépense (D6). Une récurrence convertie ne génère plus
  d'opération seule (D7).
- **Règle 21** : la correction de solde (ajustement avec motif) existe sur **tous** les comptes.
  Ajout de la sous-catégorie `sub_other_fees` au catalogue (données, carte « Nouvelles catégories
  disponibles »).
- **Règle 29** (cercle fermé) : « une dépense est TOUJOURS enregistrée » est remplacé par le §6.
  Une cotisation de tournante ou de collecteur reste de l'épargne, mais **pas** une cotisation
  sans tour.
- **Nouvelles règles** :
  - le revenu déclaré n'est jamais de l'argent (§1) ;
  - toute opération a une nature calculée par `natureOf` (§2.3) ;
  - aucune récurrence n'est enregistrée sans confirmation (§8) ;
  - aucun compte n'est désactivé, supprimé, ni ne change de devise ou de statut avec un solde
    (§3.3) ;
  - toute sortie d'argent passe par le contrôle unique (§6).

---

## 16. Ordre de réalisation (une branche, trois étapes, arrêt pour relecture après chacune)

1. **Cœur pur (`src/core`), tests d'abord, aucun écran.** Les tests des exemples du §14 sont écrits
   d'abord et échouent, puis les fonctions les font passer :
   - `natureOf`, `countsInPosition`, position (D, mis de côté, total, patrimoine), adossement des
     poches ;
   - `canDebit` / `spendPlan` (sources ordonnées, cumul par compte, dates) ;
   - reste par jour v2 (horizon, engagements) et reste à répartir ;
   - classement des tontines et des dettes ; rapports, relevé et parité historique ; CSV ;
   - définitions du coach, règle des 10 %, indicateurs, score ;
   - correction du parseur.

   Champs nouveaux facultatifs dans `types.ts`, avec `firestore.rules` et un test de règles pour
   chacun (règle 3). Les tests qui figent l'ancien comportement (`demo-defaults.test.ts:26-28`,
   `daily-allowance.test.ts:52-57`, `onboarding-quick.test.ts`) sont mis à jour en le disant.
2. **Écritures (`useActions`)** :
   - lots atomiques (complément + sortie, transfert + frais, remboursement capital + intérêts) ;
   - garde-fous du cycle de vie des comptes ; ouverture datée avec provenance ; correction de
     solde partout ;
   - récurrences à confirmer ; inscription sans montant ni récurrence de salaire ;
   - dernier rempart dans `saveTransaction` ; assistant passé par `useEntrySave` ;
   - permissions de l'enfant alignées.
3. **Écrans et textes** :
   - carte de l'accueil, feuille de complément, cartes « reçu ? » et « payé ? » ;
   - relevé par compte, export, écrans d'analyse, coach ;
   - textes en français et en anglais, listés pour l'accord du fondateur ;
   - `e2e/forms-audit.js` et `layout-audit.js` complétés ;
   - captures de la galerie montrées au fondateur **avant** tout APK.
