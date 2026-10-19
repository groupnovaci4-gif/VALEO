# Audit avant l'APK — logique des calculs, logique financière, usage au quotidien

Branche `audit-avant-apk`, créée depuis `ia-comprend-tout` (ae1051a), le 19 octobre 2026.
**Rien n'a été corrigé.** Chaque point attend votre accord. Les formules, les prix et les limites ne
changent dans aucune proposition.

Chaque défaut ci-dessous a été **prouvé** par un petit script lancé sur l'ordinateur (données de
test, jamais la production). Les chiffres des exemples sont ceux que les scripts ont réellement
obtenus.

Gravité :
- **BLOQUANT** : un chiffre faux, ou une donnée qui reste après une suppression ;
- **IMPORTANT** : deux écrans qui ne disent pas la même chose, ou une information qui manque ;
- **CONFORT** : juste, mais peut tromper ou gêner.

---

## A. Points BLOQUANTS

### B1 — Supprimer un transfert laisse ses frais

- **Gravité** : BLOQUANT
- **Où** : Historique › une opération › Supprimer (`src/core/removal.ts`, utilisé par `useActions().remove`) ;
  même chose dans le back-office (`firebase/functions/src/backoffice/removal.ts`).
- **Ce qui ne va pas** : un transfert enregistré avec des frais crée deux opérations : le transfert, et
  une dépense « frais » liée. Quand on supprime le transfert, seule la première disparaît.
  *Exemple : Awa transfère 50 000 FCFA de sa banque vers Orange Money, avec 500 FCFA de frais. Elle
  s'est trompée et supprime le transfert. Les 500 FCFA de frais restent : le solde de la banque passe de
  650 000 à 649 500 FCFA alors qu'il devrait revenir à 650 000.*
- **Conséquences** : un solde faux, une dépense « frais » sans transfert dans l'historique, et un
  argent disponible trop bas de la valeur des frais.
- **Solution proposée** : quand on supprime une opération, supprimer aussi les opérations qui lui sont
  liées (frais d'un transfert). Même règle dans le back-office (le test de parité existe déjà).
  Pour l'utilisateur : supprimer un transfert remet tout comme avant.
- **Test** : sur le vrai `useActions` (comme `tests/ia-annuler.test.ts`) : transfert de 50 000 avec
  500 de frais, suppression → les données sont identiques à l'état de départ ; et le test de parité
  avec le back-office.

### B2 — Supprimer un remboursement de dette laisse les intérêts

- **Gravité** : BLOQUANT
- **Où** : Historique › l'opération de remboursement › Supprimer ; et « Annuler » d'un remboursement
  (`src/core/removal.ts`).
- **Ce qui ne va pas** : un remboursement de 110 000 FCFA dont 10 000 d'intérêts crée l'opération du
  capital (100 000) et une dépense « intérêts » (10 000) liée. En supprimant le remboursement (ou son
  opération), les 10 000 d'intérêts restent.
  *Exemple : Koffi rembourse 110 000 FCFA à la banque (dont 10 000 d'intérêts), puis supprime cette
  saisie faite par erreur. La dette redevient due en entier (normal), mais le compte garde une
  dépense de 10 000 FCFA d'intérêts : le solde de la banque reste 10 000 FCFA trop bas.*
- **Conséquences** : solde faux, intérêts comptés dans les dépenses du mois, dans le score et dans
  l'analyse.
- **Solution proposée** : la même règle que B1 (les opérations liées partent avec l'opération) couvre
  aussi les intérêts. Pour l'utilisateur : supprimer un remboursement efface tout ce qu'il avait créé.
- **Test** : remboursement de 110 000 dont 10 000 d'intérêts, suppression de l'opération puis du
  remboursement → données identiques à l'état de départ.

### B3 — L'IA répond 0 pour un compte en euros, et l'oublie dans la liste

- **Gravité** : BLOQUANT
- **Où** : « Parler à DineroX » et la feuille de saisie (`src/core/ai/localAnswers.ts`, sujets
  `account_balance` et `accounts_list`).
- **Ce qui ne va pas** : l'IA calcule les soldes dans la seule devise de l'espace.
  *Exemple : Moussa vit à Paris. Son espace est en FCFA, il a aussi un « Compte Paris » à 1 250,50 €.
  Il demande « Combien sur mon compte Paris ? » : l'IA répond « Solde de Compte Paris : 0 FCFA ».
  « Mes comptes ? » ne cite que son compte en FCFA.*
- **Conséquences** : un chiffre faux, très visible pour les utilisateurs de la diaspora.
- **Solution proposée** : pour un compte d'une autre devise, répondre avec son solde dans SA devise
  (« Compte Paris : 1 250,50 € »), sans jamais convertir ; la liste des comptes cite tous les comptes,
  chacun dans sa devise ; « Combien j'ai de disponible ? » ajoute une ligne par autre devise, comme
  l'accueil. Aucun nouveau calcul : on lit les positions par devise qui existent déjà.
- **Test** : espace en FCFA + compte en euros → la réponse donne 1 250,50 € ; la liste contient les
  deux comptes.

### B4 — L'IA tronque les montants à virgule (euros)

- **Gravité** : BLOQUANT
- **Où** : cartes de validation de l'IA (`src/core/ai/intent.ts`, lecture des montants).
- **Ce qui ne va pas** : dans un espace en euros, « Mets 12,50 de côté » donne une carte de **12 €**,
  et « Mets 1 500,75 de côté » donne **1 500 €**. La saisie classique (« J'ai payé 12,50 de taxi »)
  lit correctement 12,50 €. « Mets 1,500 de côté » donne 1 500 € alors qu'en français « 1,500 »
  veut dire 1,5.
- **Conséquences** : si la personne valide sans relire, un montant faux est enregistré. La règle
  « montant réellement prononcé » n'est pas respectée.
- **Solution proposée** : lire les montants des actions avec le même lecteur que la saisie (virgule
  décimale française, espaces des milliers) ; « 1,500 » reste ambigu : le montant est alors
  **surligné** sur la carte (à vérifier), jamais deviné.
- **Test** : en euros, « Mets 12,50 de côté » → 12,50 € ; « 1 500,75 » → 1 500,75 € ; « 1,500 » →
  montant surligné.

### B5 — Opération datée dans le futur : le solde du compte n'est pas le même partout

- **Gravité** : BLOQUANT
- **Où** : écran Comptes, fiche d'un compte, Mon épargne, versement d'épargne (`accountBalances` dans
  `src/hooks/useFinance.ts`), contre l'accueil, le total des comptes et l'IA (position à aujourd'hui,
  `src/core/position.ts`).
- **Ce qui ne va pas** : l'écran Comptes compte aussi les opérations datées dans le futur ; l'accueil
  et l'IA, non.
  *Exemple : le 15 octobre, Aya a 100 000 FCFA sur Orange Money. Elle note déjà son loyer de
  30 000 FCFA daté du 28. L'écran Comptes affiche 70 000 FCFA ; l'accueil (« Total de vos comptes »)
  et l'IA (« Combien sur Orange Money ? ») disent 100 000 FCFA.*
- **Conséquences** : la personne ne sait plus quel chiffre croire ; un retrait d'épargne est contrôlé
  sur un solde qui contient des opérations futures.
- **Solution proposée** : un seul solde « à aujourd'hui » partout (celui de l'accueil), et, sous le
  solde d'un compte, une ligne « À venir : −30 000 FCFA (28 oct.) » quand il y a des opérations
  futures. Pour l'utilisateur : le même chiffre sur tous les écrans, l'avenir écrit à part.
- **Test** : compte à 100 000 + dépense future de 30 000 → écran Comptes, total des comptes et IA
  donnent tous 100 000, et la ligne « À venir » affiche −30 000.

### B6 — Espace famille : l'enfant voit un « reste par jour » sans les engagements

- **Gravité** : BLOQUANT
- **Où** : accueil (carte du haut) et Budget pour un membre « enfant » (`dailyAllowanceV2`,
  `unallocated`), car les règles de sécurité ne lui donnent pas les récurrences, tontines et dettes.
- **Ce qui ne va pas** : dans le MÊME espace, le parent et l'enfant ne voient pas le même chiffre.
  *Exemple (données de test) : le parent voit « 900 FCFA par jour » (loyer, mensualités et
  cotisations à venir déduits) ; l'enfant voit « 49 400 FCFA par jour ». Le reste à répartir est de
  155 000 pour le parent et de 310 000 pour l'enfant.*
- **Conséquences** : l'enfant croit qu'il y a beaucoup d'argent libre et peut dépenser l'argent du
  loyer.
- **Solution proposée** (au choix du fondateur) : (a) le serveur calcule et partage le TOTAL des
  engagements de l'espace (un seul nombre, sans le détail) pour que l'enfant voie le même reste par
  jour ; ou (b) masquer le reste par jour et le reste à répartir chez l'enfant, avec « Demandez à un
  parent ». Aucune formule ne change dans les deux cas.
- **Test** : même espace, rôle parent et rôle enfant → même reste par jour (a), ou carte masquée (b).

---

## B. Points IMPORTANTS

### I1 — « Dépenses réglées ce mois » compte des dépenses pas encore payées

- **Où** : accueil, carte « Mois en cours » (`flowTotals` sur tout le mois), épargne nette du mois,
  IA (« Combien j'ai dépensé ce mois ? », « Les 10 % ? »), budget.
- **Ce qui ne va pas** : le mois est compté jusqu'au 31, opérations futures comprises.
  *Exemple : le 15, Aya note son loyer de 30 000 FCFA daté du 28. L'accueil affiche déjà
  « Dépenses : 30 000 FCFA, réglées ce mois ». De même, un salaire noté d'avance pour le 30 apparaît
  dans « Revenus, perçus ce mois », et le conseil des 10 % se calcule sur un revenu pas encore reçu.*
- **Conséquences** : les mots « réglées » et « perçus » sont faux ; le conseil des 10 % est trop
  élevé.
- **Solution proposée** : compter le mois jusqu'à aujourd'hui pour les montants « réglés » et
  « reçus », et afficher les opérations futures sur une ligne « À venir ce mois ». Les enveloppes
  peuvent garder les dépenses prévues (c'est un budget), mais avec la mention « dont à venir ».
- **Test** : dépense future de 30 000 → « Dépenses réglées » = 0, « À venir ce mois » = 30 000 ; même
  chiffre dans l'IA.

### I2 — Clôture d'une tontine : les rapports et l'accueil ne disent pas la même chose

- **Où** : Rapports (`periodReport`) contre accueil (`flowTotals`) et IA (`monthFlows`).
- **Ce qui ne va pas** : les frais (ou le gain) de clôture d'une tontine sont comptés dans les
  rapports, mais pas sur l'accueil ni dans l'IA.
  *Exemple : 3 cotisations de 10 000 FCFA, cagnotte reçue de 27 000 FCFA, tontine clôturée le
  10 octobre : 3 000 FCFA de frais. Rapports : « Dépenses : 3 000 FCFA ». Accueil et IA : 0.*
- **Conséquences** : deux chiffres différents pour le même mois.
- **Solution proposée** : un seul calcul des revenus et dépenses du mois (celui des rapports, qui
  connaît les clôtures), utilisé par l'accueil, l'IA, l'historique et les alertes.
- **Test** : le scénario ci-dessus → 3 000 FCFA partout.

### I3 — Remboursement d'achat : non déduit dans les dépenses par catégorie

- **Où** : IA (« Où part mon argent ? », « Comment dépenser moins ? »), alertes et analyse
  (`expensesByCategory`), contre l'accueil.
- **Ce qui ne va pas** : *Fatou achète une robe à 20 000 FCFA, la rend et se fait rembourser
  20 000 FCFA. Accueil : 0 dépense. Par catégorie : « Personnel : 20 000 FCFA ».*
- **Conséquences** : l'IA et l'analyse désignent une catégorie qui ne coûte en fait rien.
- **Solution proposée** : déduire le remboursement d'achat dans le total par catégorie, comme
  l'accueil le fait déjà.
- **Test** : achat de 20 000 + remboursement de 20 000 → 0 dans la catégorie.

### I4 — Le score n'est pas le même à l'écran Score et dans l'IA

- **Où** : écran Mon score (`latestScore`, sans le profil) contre l'IA (`scoreForMonth` avec le
  profil).
- **Ce qui ne va pas** : pour une personne aux revenus irréguliers, la cible d'épargne de précaution
  est de 6 mois (3 sinon). L'écran Score ne transmet pas le profil.
  *Exemple : même mois de septembre : écran Score 58/100 ; l'IA répond 46/100.*
- **Solution proposée** : l'écran Score transmet le profil, comme l'IA et le coach.
- **Test** : profil « revenus irréguliers » → même score à l'écran et dans l'IA.

### I5 — Diaspora : les opérations dans une autre devise sont invisibles, sans message

- **Où** : accueil (mois en cours), Budget, Rapports, score, coach.
- **Ce qui ne va pas** : la règle est juste (jamais de conversion), mais rien ne dit que des
  opérations sont laissées de côté.
  *Exemple : espace en FCFA. Moussa reçoit 2 500 € de salaire sur son compte de Paris et envoie
  150 € à sa famille. Le mois affiche 0 revenu et 0 dépense, l'enveloppe Famille 0, le score « pas
  assez de données ».*
- **Solution proposée** : sur l'accueil et les rapports, une ligne par autre devise :
  « En euros ce mois : revenus 2 500 €, dépenses 150 € (non additionnés au FCFA) ». Pour le budget,
  proposer des enveloppes dans la devise du compte. Aucune conversion.
- **Test** : le scénario ci-dessus → la ligne « En euros » affiche 2 500 € et 150 €.

### I6 — IA : transfert entre deux devises impossible depuis la carte

- **Où** : carte de validation (`src/features/ai/IntentResult.tsx`).
- **Ce qui ne va pas** : « Envoie 100 000 de Orange Money vers mon compte Paris » donne une carte
  sans champ « montant reçu » ; « Valider » échoue avec un message d'erreur. Il faut passer par
  « Modifier ».
- **Solution proposée** : quand les deux comptes n'ont pas la même devise, la carte demande le
  montant reçu (champ surligné), comme le formulaire.
- **Test** : transfert FCFA → euros depuis l'IA : le champ apparaît, « Valider » enregistre.

### I7 — « Prochaine paie » : l'IA et le reste par jour ne prennent pas la même date

- **Où** : IA (date de la récurrence « Salaire ») contre la carte du haut (jour de paie du profil).
- **Ce qui ne va pas** : *profil : paie le 30 ; récurrence « Salaire » : le 25. La carte dit « … par
  jour jusqu'au 29 octobre » ; l'IA dit « prochaine paie le 25 octobre ».*
- **Solution proposée** : une seule source (le jour de paie du profil), la récurrence servant
  seulement si le profil n'en a pas ; ou signaler l'écart à la personne (« votre salaire est noté le
  25 mais votre jour de paie est le 30 »).
- **Test** : profil le 30, récurrence le 25 → même date dans l'IA et sur la carte.

### I8 — « C'est quand le loyer ? » saute une échéance non payée

- **Où** : IA (`upcomingOccurrence`).
- **Ce qui ne va pas** : *le 15 octobre, le loyer du 5 octobre n'est pas confirmé ; l'IA répond
  « prochaine échéance le 5 novembre ».*
- **Conséquences** : la personne oublie un loyer en retard.
- **Solution proposée** : répondre « Le loyer du 5 octobre n'est pas encore confirmé ; le suivant est
  le 5 novembre » (lecture de `recurringToConfirm`, déjà utilisé par l'accueil).
- **Test** : loyer non confirmé → la réponse cite le 5 octobre.

---

## C. Points de CONFORT

### C1 — Patrimoine dans l'IA : le détail ne s'additionne pas
*Patrimoine net 3 989 000 FCFA, mais « biens + comptes − dettes » = 3 909 000 : les 80 000 FCFA de
créances (et l'épargne hors comptes) ne sont pas cités.* Proposition : citer toutes les parts, comme
l'écran Patrimoine. Test : la somme des parts affichées = le total.

### C2 — Export CSV : point décimal
Les montants sont écrits « 12.50 » avec le séparateur « ; » : Excel en français peut les lire comme du
texte (euros). Proposition : virgule décimale quand l'application est en français. Test : l'export en
euros contient « 12,50 ».

### C3 — IA : « au rythme actuel, vers {date} » quand il n'y a pas de rythme
Sans versements réguliers, l'IA cite la date CIBLE de l'objectif comme si c'était une estimation.
Proposition : « Date visée : … ; aucun rythme régulier pour l'instant ». Test : objectif sans rythme →
la phrase dit « date visée ».

### C4 — Quotas de l'IA comptés en heure universelle
Les quotas du jour changent à minuit heure universelle (2 h du matin à Paris en été). Proposition :
l'indiquer, ou compter selon le fuseau de l'appareil. Test : appel à 1 h heure de Paris → même quota
que la veille au soir.

### C5 — IA : « Koffi m'a prêté 100 000 » quand une dette envers Koffi existe déjà
L'IA crée une deuxième dette « Koffi » sans demander. Proposition : demander « Nouvelle dette ou
ajouter à la dette existante ? ». Test : la question est posée.

### C6 — IA : dépensé en catégorie et budget de l'enveloppe
« Combien j'ai dépensé pour la famille ? » compte aussi la part prise sur la réserve famille, alors
que l'enveloppe Famille ne la compte pas (règle 19). Les deux chiffres sont justes, mais différents.
Proposition : ajouter « dont X pris sur la réserve ». Test : la réponse cite la part de la réserve.

---

## D. Vérifié et trouvé juste

- Récurrences en fin de mois : une échéance du 31 retombe le 31 après février ; le 29 février est géré.
- Jour de paie le 31 en février : la paie tombe le 28, le reste par jour s'arrête la veille.
- Modifier une opération liée (remboursement, cotisation, versement d'objectif) met bien à jour
  l'élément lié.
- Tontines et objectifs ne se suppriment pas (on les clôture) : pas d'orphelin de ce côté.
- « Valider » puis « Annuler » dans l'IA : aucune donnée orpheline (test `tests/ia-annuler.test.ts`).
- Supprimer une dette sans remboursement retire aussi l'emprunt ou le prêt créé avec elle.
- L'enveloppe « Épargne » compte bien les versements ; le reste à répartir ne compte pas deux fois.
- Arrondis : 0,1 + 0,2 € donne bien 0,30 € ; 10 000 milliards de FCFA s'affichent correctement.
- Règles de sécurité : un client ne lit ni n'écrit les compteurs de l'IA, ni les quotas.

---

## E. Tableau récapitulatif

| N° | Titre | Gravité | Écran |
|---|---|---|---|
| B1 | Supprimer un transfert laisse ses frais | BLOQUANT | Historique, back-office |
| B2 | Supprimer un remboursement laisse les intérêts | BLOQUANT | Historique, « Annuler » |
| B3 | IA : compte en euros à 0, oublié dans la liste | BLOQUANT | IA |
| B4 | IA : montants à virgule tronqués | BLOQUANT | IA (cartes) |
| B5 | Opération future : solde différent selon l'écran | BLOQUANT | Comptes, Mon épargne |
| B6 | Enfant : reste par jour sans les engagements | BLOQUANT | Accueil, Budget (famille) |
| I1 | « Réglées ce mois » compte le futur | IMPORTANT | Accueil, IA |
| I2 | Clôture de tontine : rapports ≠ accueil | IMPORTANT | Rapports, accueil, IA |
| I3 | Remboursement d'achat non déduit par catégorie | IMPORTANT | IA, analyse, alertes |
| I4 | Score : écran ≠ IA | IMPORTANT | Mon score, IA |
| I5 | Autres devises invisibles sans message | IMPORTANT | Accueil, Budget, Rapports |
| I6 | IA : transfert entre devises impossible | IMPORTANT | IA (cartes) |
| I7 | Prochaine paie : IA ≠ carte du haut | IMPORTANT | IA, accueil |
| I8 | IA saute un loyer non payé | IMPORTANT | IA |
| C1 | Patrimoine IA : détail incomplet | CONFORT | IA |
| C2 | CSV : point décimal | CONFORT | Export |
| C3 | « Au rythme actuel » sans rythme | CONFORT | IA |
| C4 | Quotas en heure universelle | CONFORT | IA |
| C5 | Deuxième dette « Koffi » sans question | CONFORT | IA |
| C6 | Dépensé en catégorie ≠ enveloppe (réserve) | CONFORT | IA |

**Total : 6 BLOQUANTS, 8 IMPORTANTS, 6 de CONFORT.**

---

## F. Suggestions pour l'usage au quotidien (pas des erreurs)

1. **Envois au pays (diaspora)** : un parcours « J'envoie de l'argent à la famille » : compte en
   euros → montant envoyé, frais, montant reçu en FCFA, bénéficiaire ; le taux est SAISI (jamais
   inventé). Il manque aujourd'hui pour les utilisateurs de la diaspora.
2. **Frais Mobile Money** : retenir les derniers frais saisis par opérateur (Orange, Wave…) et les
   proposer (modifiables), sans jamais les inventer.
3. **« Ce mois seulement »** : « Mets le transport à 50 000 ce mois-ci » change aujourd'hui le
   montant de tous les mois ; proposer « ce mois seulement / tous les mois ».
4. **Revenus irréguliers** : sur l'accueil, une phrase simple quand aucun revenu n'est encore arrivé
   ce mois (« Pas encore de revenu ce mois : le reste par jour se base sur ce que vous avez »).
5. **Opérations « à venir »** : un endroit unique (Calendrier) pour tout ce qui est noté d'avance :
   loyers, cotisations, mensualités, salaires attendus.
6. **Espace famille** : expliquer à l'enfant ce qu'il voit et ne voit pas (« Les dettes et la tontine
   sont gérées par vos parents »).
7. **Lecture à voix haute** : proposer « Écouter » aussi sur les cartes de validation (personnes qui
   lisent difficilement).
8. **Tontines** : rappel la veille d'une cotisation et le jour du tour, avec le montant (déjà calculé),
   pour toutes les tontines suivies.
9. **Exemples de l'IA** : des exemples tirés des vrais noms de la personne (« Quand est-ce que je paie
   la Tontine du bureau ? ») au lieu d'exemples génériques.
10. **Argot validé** : les unités « bâton », « brique », « balle » restent inactives ; les faire valider
    par le fondateur permettrait de comprendre plus de phrases parlées.
