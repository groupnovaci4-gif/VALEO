# DineroX Business — document de cadrage (version 0, 2026-10-20)

Décisions du fondateur, à compléter ensemble avant toute instruction à Claude Code.
**Application à part entière**, séparée de DineroX (particuliers) : son propre code, ses propres
comptes, ses propres données, sa propre fiche sur le Play Store. DineroX et ses formules ne
changent pas.

## 1. Pour qui

- **Priorité absolue : les commerçants** (marché, boutique) et les **petites entreprises qui n'ont
  pas les moyens d'un comptable**, dans l'informel comme dans le formel.
- Ensuite : les PME jusqu'à environ 50 personnes.
- Premier pays : la Côte d'Ivoire (franc CFA), puis l'espace OHADA.

## 2. Le problème à résoudre

1. **Pas de comptabilité** : un comptable coûte trop cher, alors rien n'est tenu.
2. **L'argent de l'entreprise et l'argent personnel sont mélangés** : le patron ne sait pas si son
   commerce gagne de l'argent.
3. **Le stock** n'est pas suivi : ruptures, pertes, vols invisibles.
4. **Les factures et les crédits clients** : qui me doit quoi, depuis quand.

## 3. La promesse

> « La comptabilité de votre commerce, sans comptable. Vous notez vos ventes et vos achats comme
> vous parlez ; DineroX Business tient les comptes pour vous. »

Trois principes :
- **La caisse du commerce n'est pas le portefeuille du patron.** Quand le patron prend de l'argent
  pour lui, c'est un « prélèvement du patron », noté à part : ni une dépense du commerce, ni une
  perte. Le bénéfice du commerce reste juste.
- **La comptabilité se fait en coulisses.** Le commerçant ne voit jamais « débit » ni « crédit » :
  il note « J'ai vendu », « J'ai acheté », « J'ai payé le loyer ». L'application écrit les
  écritures comptables à sa place.
- **Hors ligne d'abord.** Au marché, le réseau est faible : tout fonctionne sans connexion et se
  synchronise ensuite.

## 4. Première version (V1) : le quotidien du commerçant

| Module | Ce qu'il fait |
|---|---|
| **Mon commerce** | nom, activité, pays, devise ; informel ou formel (numéro de contribuable facultatif) |
| **Caisse et comptes** | espèces, Mobile Money (Orange, MTN, Moov, Wave), banque ; solde du jour ; transferts |
| **Ventes** | vente au comptant ou à crédit (« Koffi paiera vendredi ») ; reçu envoyé par WhatsApp ou en PDF ; facture et devis simples |
| **Achats et charges** | achats de marchandises (comptant ou à crédit), fournisseurs ; charges : loyer de la boutique, électricité, transport, salaires |
| **Stock simple** | articles avec prix d'achat et prix de vente ; une vente fait baisser le stock, un achat le fait monter ; alerte de rupture ; marge par article |
| **Clients et fournisseurs** | qui me doit, qui je dois, depuis quand ; relance par WhatsApp |
| **Patron** | « Je prends 20 000 pour moi » = prélèvement du patron, compté à part |
| **Tableau de bord** | ventes du jour et du mois ; **bénéfice** (ventes − coût des marchandises vendues − charges) ; argent en caisse ; ce qu'on me doit ; ce que je dois ; valeur du stock |
| **IA et voix** | « J'ai vendu 3 sacs de riz à 25 000 à Koffi, il paiera vendredi » → une carte « Valider », comme dans DineroX |
| **Comptabilité en coulisses** | journal, grand livre et états de fin d'exercice simplifiés ; export pour un comptable |
| **Rôles** | patron (tout) et vendeur (ventes et caisse seulement, sans voir le bénéfice) |

**Référentiel comptable visé pour la V1** : le **Système minimal de trésorerie (SMT)** du
SYSCOHADA révisé, prévu pour les très petites entités et fondé sur les encaissements et les
décaissements, ce qui correspond exactement aux commerçants. Seuils d'éligibilité et formats des
états : **à valider par un expert-comptable OHADA** avant toute promesse.

## 5. Plus tard (pas dans la V1)

- **V2 — l'organisation** : bons de commande fournisseurs ; plusieurs boutiques ou points de
  vente ; rôle comptable (lecture et export) ; inventaire avec écarts ; impression de reçus sur
  petite imprimante Bluetooth.
- **V3 — la conformité** : comptabilité au système normal SYSCOHADA (bilan, compte de résultat
  complets) ; TVA et préparation des déclarations ; facturation électronique là où l'administration
  l'exige ; paie et cotisations sociales (CNPS). Chaque point validé par un expert.

## 6. Ce qu'on reprend de DineroX (recopié et adapté, jamais lié)

Moteur de soldes « à aujourd'hui » et opérations à venir ; IA qui comprend les phrases (téléphone
d'abord, Haiku en secours, carte « Valider ») ; saisie vocale ; pavés ; sécurité par règles ;
méthode de tests et de déploiement (photo de la production, simulation, une commande à la fois).

## 7. Technique (pour mémoire)

- Nouveau dossier ou nouveau dépôt, même socle (Expo, React Native, Firebase).
- **Projet Firebase séparé** : les données des entreprises ne côtoient jamais celles des
  particuliers.
- Calculs comptables dans des modules purs et testés, comme dans DineroX.

## 8. À valider avant de construire

- **Un expert-comptable OHADA** : SMT, plan de comptes, états, obligations selon la taille.
- **Les prix** : par exemple une offre gratuite limitée, une offre « Commerçant » et une offre
  « Entreprise » (à chiffrer avec le tableur de rentabilité).
- **Le nom définitif** de l'application.
- **Les pays de lancement** après la Côte d'Ivoire.

## 9. Questions ouvertes pour le fondateur

1. Le vendeur peut-il faire une remise ou modifier un prix, ou seulement le patron ?
2. Les commerçants impriment-ils des reçus, ou WhatsApp suffit-il au début ?
3. Faut-il gérer la vente « au détail » d'un article acheté en gros (un sac de riz vendu au kilo) dès
   la V1 ?
4. Le patron veut-il voir dans DineroX (personnel) l'argent qu'il prélève dans son commerce ?
