# Formules, prix et formule Pro (décisions du fondateur, 2026-10-18)

À réaliser **après** la refonte de l'argent (`docs/argent-disponible.md`), sur une branche à
part, avec l'accord du fondateur commande par commande pour toute mise en production.

## 1. Prix

| Formule | Afrique (même prix dans tout le continent) | Europe |
|---|---|---|
| Gratuite | 0 | 0 |
| Plus | **2 000 F CFA** par mois (avant : 1 500) | **9,99 €** par mois |
| Famille | **3 500 F CFA** par mois (avant : 3 000) | **14,99 €** par mois |
| Pro | **2 000 F CFA** par employé et par mois, à partir de **5** employés | **7,99 €** par employé et par mois, à partir de **5** employés |

- Hors zone franc CFA (Guinée-Conakry, Ghana, Nigeria…), on applique l'équivalent de ces
  montants dans la monnaie du pays. Les prix réels sont réglés pays par pays dans la console
  Google Play, par le fondateur.
- Il n'y a aucun abonné réel, seulement des testeurs : tout le monde passe directement au
  nouveau prix, sans période de maintien.
- Les **limites** des formules ne changent pas (objectifs, comptes, enveloppes, membres,
  voix, etc.). Seuls les prix changent, plus l'ajout de Pro.
- Les prix affichés dans l'application passent par `core/subscription.ts` (`priceXof`) et par
  un prix en euros à ajouter. Aucun prix n'est écrit en dur dans un écran.

## 2. Formule Pro

**Principe** : une entreprise achète l'application pour aider ses employés à mieux gérer leur
salaire. Elle paie, mais **ne voit jamais l'argent de ses employés**.

**Pour chaque employé**
- Tout ce que contient Plus, dans son propre espace, privé.
- La date de paie de l'entreprise, préremplie : le reste par jour va directement jusqu'à la
  prochaine paie (§7.1 de `argent-disponible.md`).
- S'il quitte l'entreprise, il garde toutes ses données. Il passe en gratuit, ou prend Plus à
  son nom.

**Pour l'entreprise**
- Un espace de gestion : acheter des places (**5 au minimum**, soit 10 000 F CFA ou 39,95 € par mois), inviter par lien ou par code,
  retirer une personne, voir le nombre de comptes activés.
- Une facture mensuelle au nom de l'entreprise, payée par virement ou Mobile Money. Les places
  sont activées depuis le back-office, qui sait déjà le faire (fournisseur `manual`).
- Des indicateurs **anonymes et regroupés**, seulement si au moins 10 personnes sont actives.
  Exemple : « 6 employés sur 10 ont une épargne de précaution d'au moins un mois ». Jamais un
  nom, jamais un montant individuel.
- Les leçons de l'Académie, à partager avec les employés.

**En dessous de 5 employés** : pas de formule Pro. Chacun prend Plus au prix normal.

**Seuil à 5 (décision du fondateur, 2026-10-18)** : la plupart des entreprises africaines ont
moins de 10 employés. Le gain par place est le même ; seul le coût de gestion par entreprise
augmente (environ −6 % de marge pour 1 000 employés). Paiement **d'avance** (mois ou trimestre),
pour éviter les impayés. Les indicateurs anonymes restent réservés aux entreprises d'**au moins
10 personnes actives** : en dessous, l'entreprise ne voit que le nombre de comptes activés.

**Exclu volontairement** : aucune avance sur salaire, aucun prêt, rien qui touche à l'argent.
L'application reste un outil de suivi (règle 20 : elle ne détient ni ne transfère jamais
d'argent).

## 3. Rentabilité

Tableur de calcul, avec des hypothèses modifiables : `docs/rentabilite-formules.xlsx`.

## 4. Points à vérifier avant de lancer

- **Coût réel par abonné** : voix ElevenLabs et intelligence artificielle (Claude). Plus donne
  20 saisies vocales intelligentes par mois. À mesurer sur les factures avant de figer les prix.
- **Commission** : Google prélève 15 % des abonnements payés dans l'application. La formule Pro
  est facturée directement, sans cette commission.
- **Règles** : abonnement et membres d'un espace s'écrivent **uniquement** par les Cloud
  Functions (règle 8), avec des tests de règles pour la nouvelle formule `pro`.
