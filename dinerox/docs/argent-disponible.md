# L'argent disponible : règles de calcul (décision du fondateur, 2026-10-18)

Ce document fait foi. Il remplace, sur les points qu'il traite, les règles 10 et 29 de
`CLAUDE.md` (voir la fin). Il vient des tests sur téléphone du fondateur (cahier de tests,
cas CPT-20, CPT-21, CPT-29, CPS-13, CPS-14, tous « Calcul faux », dont deux bloquants).

## Ce qui est faux aujourd'hui

Deux notions différentes sont mélangées :

- le **reste par jour** part d'un « revenu du mois », qui peut être le revenu **déclaré**
  dans le profil (`dailyAllowance`, `incomeSource: 'declared'`) ;
- le **solde disponible** additionne les soldes de départ des comptes, et une épargne
  saisie avec un solde de départ s'ajoute au lieu d'être prise sur le disponible.

Résultat : avec 100 000 de revenu et 60 000 d'épargne, l'appli affiche 160 000 au lieu de
40 000. Une dépense est enregistrée même sans aucun argent renseigné, et un compte peut
passer sous zéro. Les montants préremplis (budget allouable de 10 %, enveloppes à 5 000,
« 1 000 par jour » à l'inscription) inventent de l'argent.

## 1. Trois notions, jamais mélangées

| Notion | Ce que c'est | Où on la saisit | Sert à |
|---|---|---|---|
| **Revenu déclaré** | Une INFORMATION : « chaque mois je perçois environ… » | Profil financier (inscription, Paramètres) | Pourcentages et conseils seulement ; préremplir « J'ai reçu mon salaire » |
| **Argent disponible** | L'argent réellement là, qu'on peut dépenser | Accueil (premier renseignement), puis « J'ai reçu de l'argent » | TOUT : dépenses, budget, épargne, objectifs, réserve, tontines, reste par jour |
| **Argent mis de côté** | Comptes d'épargne, objectifs, réserve famille, tontines (cercle fermé, règle 29) | Mon épargne, Objectifs, Réserve, Tontines | Reste à part ; n'est jamais dépensé directement |

**Le revenu déclaré n'entre dans AUCUN solde, AUCUN total, AUCUN reste par jour, AUCUN
budget.** Il ne devient de l'argent que quand la personne confirme l'avoir reçu.

**Argent disponible** = somme des soldes des comptes courants actifs (Espèces, Mobile
Money, banque), dans la devise principale. Un compte courant n'est **jamais négatif**.

## 2. Comment l'argent disponible apparaît

1. **Inscription** : les questions sur les revenus (sources et montants) restent, et
   restent déclaratives. L'étape « Où se trouve votre argent ? » garde le choix des
   sources (elle crée les comptes), mais **sans montant** : les montants se saisissent à
   l'accueil. Le démarrage rapide n'affiche plus de « X par jour » calculé sur le revenu
   déclaré.
2. **Accueil, tant que rien n'est renseigné** : une carte « Votre argent disponible
   aujourd'hui », avec un champ par compte courant (Espèces par défaut). On l'enregistre
   comme solde de départ des comptes. Ensuite, on le modifie seulement par :
   - « J'ai reçu de l'argent » (revenu reçu, qui s'ajoute) : le bouton « J'ai reçu mon
     salaire » est prérempli avec le revenu déclaré, et la personne confirme le montant ;
   - « Ajuster le solde » (ajustement existant, ni revenu ni dépense).
3. **Aucune valeur préremplie** : ni budget, ni enveloppe, ni « budget allouable », ni
   reste par jour avant que la personne ait saisi ses montants.

## 3. Ce qui sort de l'argent disponible

Tout part de l'argent disponible : dépenses, versements à l'épargne, contributions aux
objectifs et à la réserve, cotisations de tontine payées depuis un compte courant.

### 3.1 Aucun argent renseigné → aucune dépense

Si la personne n'a jamais renseigné d'argent (aucun solde de départ, aucun revenu reçu,
aucun ajustement), une dépense est **refusée** avec : « Indiquez d'abord votre argent
disponible pour enregistrer une dépense », et un bouton qui ouvre la carte de l'accueil.
Même chose pour la saisie vocale et la phrase écrite. Rien n'est enregistré.

### 3.2 Pas assez sur le compte qui paie → on complète, avec accord

Une dépense ne fait jamais passer un compte courant sous zéro. S'il manque de l'argent
sur le compte qui paie, une feuille s'ouvre AVANT tout enregistrement :

> Il manque 10 000 F sur Espèces pour cette dépense. D'où voulez-vous les prendre ?

Les choix, dans cet ordre, en ne montrant que ceux qui ont assez d'argent :

1. un autre compte courant (« Prendre sur Orange Money — 40 000 F ») : un transfert ;
2. un compte d'épargne, la réserve famille ou un objectif : un retrait vers le compte qui
   paie (il apparaît dans l'historique) ;
3. « J'ai reçu de l'argent » : saisir un revenu reçu ;
4. « Annuler ».

Le complément et la dépense s'enregistrent **ensemble, tout ou rien**. Si rien ne
suffit, la dépense n'est pas enregistrée : « Vous n'avez pas assez d'argent pour cette
dépense. »

Pour une phrase ou une note vocale à plusieurs lignes, le contrôle porte sur le total par
compte, avant « Tout valider ».

La réserve famille garde son rôle (règle 19) : elle paie directement les dépenses pour
lesquelles elle existe, jusqu'à son solde, et le reste suit la règle ci-dessus.

### 3.3 Mettre de côté seulement l'argent qu'on a

Verser à l'épargne, contribuer à un objectif ou à la réserve, ou payer une cotisation
depuis un compte courant : jamais plus que le solde de ce compte. Sinon, la même feuille
s'ouvre, mais sans proposer de retirer du cercle pour y remettre l'argent.

### 3.4 Créer une épargne ou un objectif avec un montant

On demande d'où vient l'argent :

- **« Je le prends sur mon argent disponible »** (choix par défaut) : un transfert depuis
  un compte courant, qui doit avoir assez d'argent ; le disponible baisse ;
- **« C'est de l'épargne que j'avais déjà avant »** : un solde de départ du compte
  d'épargne (ou le montant initial de l'objectif). Le disponible ne bouge pas, et c'est
  écrit clairement dans l'historique.

L'épargne de départ « déjà avant » n'est plus déduite du reste par jour, puisqu'elle n'a
jamais été dans le disponible.

## 4. Le reste par jour

```
reste par jour = (argent disponible − engagements restants du mois) / jours restants
```

Les jours restants comptent aujourd'hui, et le résultat est arrondi vers le bas. Les
**engagements restants du mois** comprennent :

- les dépenses récurrentes encore à venir ce mois ;
- les cotisations de tontine encore à venir ce mois ;
- les mises de côté prévues pour les objectifs et réserves ce mois, moins ce qui a déjà
  été versé ce mois (jamais moins que zéro).

Plus de revenu déclaré, plus de « revenus − dépenses du mois ».

Trois cas à l'écran :

- **Argent jamais renseigné** : la carte « Votre argent disponible aujourd'hui » s'affiche
  à la place du montant.
- **Engagements supérieurs au disponible** : « Vos engagements du mois dépassent votre
  argent disponible de X F. »
- **Sinon** : « Il vous reste X F par jour jusqu'au … ». Le détail « Comment c'est
  calculé ? » montre l'argent disponible et chaque engagement.

## 5. Budget et enveloppes

- Les enveloppes démarrent **vides**. Aucun montant n'est prérempli, aucun « budget
  allouable » n'est calculé automatiquement. Le budget automatique (Plus) ne propose des
  montants que si la personne le demande.
- À côté de chaque enveloppe : sa part en % du revenu déclaré, à titre d'information.
- « Reste à répartir » = argent disponible − (budget − dépensé) de chaque enveloppe. Si
  c'est négatif : « Vos enveloppes dépassent votre argent disponible de X F. »

## 6. Coach, conseils et accueil

- Chaque montant du coach est calculé sur l'argent disponible ou sur les revenus REÇUS du
  mois, jamais sur le revenu déclaré. Exemple : « 10 % de 150 000 F » donne exactement
  15 000 F. Un test vérifie chaque message chiffré.
- « Solde disponible » à l'accueil = argent disponible SEULEMENT. L'épargne s'affiche à
  part (« Mis de côté »). Un total qui additionne les deux s'intitule « Total de vos
  comptes ».

## 7. Données déjà enregistrées

Décision du fondateur : les testeurs repartent de zéro avec un nouveau compte. Il n'y a
**aucune migration** et rien n'est effacé dans la base. Les anciennes données s'affichent
sans planter (un solde négatif ancien reste visible tel quel) ; les nouvelles opérations
suivent ces règles.

## 8. Exemples qui servent de tests (le 15 d'un mois de 31 jours : 17 jours restants)

| # | Situation | Résultat attendu |
|---|---|---|
| E1 | Compte neuf, « Plus tard », aucune somme. Dépense Transport 5 000 | Refusée : « Indiquez d'abord votre argent disponible… », rien n'est enregistré |
| E2 | Revenu déclaré 200 000 dans le profil, rien d'autre | Disponible 0 ; carte « Votre argent disponible aujourd'hui » ; aucun « par jour » |
| E3 | Disponible 100 000 (Espèces) | Reste par jour 100 000 / 17 = 5 882 |
| E4 | E3, puis versement de 60 000 à l'épargne « depuis mon disponible » | Disponible 40 000 ; épargne 60 000 ; total des comptes 100 000 (jamais 160 000) ; 40 000 / 17 = 2 352 |
| E5 | E4, puis dépense de 50 000 sur Espèces | Feuille « Il manque 10 000 F… ». « Prendre sur l'épargne » : retrait de 10 000, puis dépense. Espèces 0, épargne 50 000, aucun négatif |
| E6 | E5 avec « Annuler » | Rien n'est enregistré : Espèces 40 000, épargne 60 000 |
| E7 | Espèces 0, Orange Money 40 000, dépense de 5 000 en Espèces | Premier choix proposé : « Prendre sur Orange Money ». Résultat : Orange Money 35 000, Espèces 0 |
| E8 | Création d'un compte d'épargne de 500 000 « que j'avais déjà avant » | Disponible inchangé ; épargne 500 000 ; reste par jour inchangé |
| E9 | Revenu déclaré 800 000 ; enveloppes Maison 150 000 et Nourriture 150 000 ; disponible 800 000 | Reste à répartir 500 000 ; Maison 18,75 % et Nourriture 18,75 % du revenu ; aucun argent ajouté |
| E10 | Inscription complète avec revenu déclaré 150 000, sans rien d'autre | Aucune enveloppe préremplie, aucun budget allouable, aucun « 1 000 par jour » |
| E11 | Disponible 100 000 ; récurrence Loyer 30 000 le 28 ; objectif à 20 000 par mois | Engagements 50 000 ; (100 000 − 50 000) / 17 = 2 941 |
| E12 | Phrase « taxi 30 000 et marché 20 000 » avec Espèces 40 000 | La feuille s'ouvre avant « Tout valider » : il manque 10 000 sur le total |

## 9. Règles de CLAUDE.md à mettre à jour (décision du fondateur, 2026-10-18)

- **Règle 10** : « Aucun blocage de saisie » ne vaut plus pour les DÉPENSES. Une dépense
  demande de l'argent disponible (§3.1). `ensureCashAccount` crée toujours « Espèces »,
  à 0.
- **Règle 29** : « Pas assez d'argent… une dépense est TOUJOURS enregistrée » est
  remplacé par les §3.2 et §3.3 : jamais de compte courant négatif, et un complément
  demandé avec accord, pris sur un autre compte courant ou sur le cercle.
- **Nouveau** : le revenu déclaré n'est jamais de l'argent (§1).
