# Captures — argent disponible v2

Écrans nouveaux ou modifiés par l'étape 3 (`docs/argent-disponible.md`), pour relecture
AVANT tout APK. Web (export servi localement, émulateurs Firebase), thème clair, deux tailles
de téléphone : `360x800/` et `412x915/` (mêmes noms de fichiers).
Régénérer : `node e2e/captures-argent-v2.js` (émulateurs démarrés et export servi).

Un compte neuf (« Awa ») est créé, puis certains états difficiles à produire au clic
(échéances anciennes, compte sous zéro, tontine dont le cycle est passé, jour de paie) sont
amorcés directement dans l'émulateur (`e2e/seed.js`).

| Fichier | Ce que montre l'image | Doc |
|---|---|---|
| `01-accueil-argent-du-jour` | Accueil d'un compte neuf : la carte « Votre argent disponible aujourd'hui » demande l'argent présent sur chaque compte (montant + « D'où vient cet argent ? »), aucun reste par jour inventé. | §2, §7 |
| `02-feuille-aucun-argent` | Dépense saisie sans aucun argent déclaré : feuille « Votre argent disponible aujourd'hui » avec « Indiquer mon argent disponible » ; rien n'est enregistré. | §6.3 |
| `03-accueil-reste-par-jour` | Après déclaration de 100 000 FCFA : reste par jour, argent disponible, mis de côté, total des comptes. | §7.3 |
| `04-comment-c-est-calcule` | Détail « Comment c'est calculé ? » : argent disponible − engagements, sur N jours, et la liste des engagements. | §7.3 |
| `05-compte-nouveau-provenance` | Nouveau compte Orange Money : « Argent déjà sur ce compte » + « D'où vient cet argent ? (facultatif) ». | §3.1 |
| `06-feuille-complement` | Dépense plus grande que le compte : « Il manque … sur Cash pour cette dépense. D'où voulez-vous les prendre ? », les autres comptes avec leur montant libre, « J'ai reçu de l'argent ». | §6.3 |
| `07-feuille-j-ai-recu` | « Quel argent avez-vous reçu ? » : un revenu, un emprunt, un remboursement d'un prêt accordé, une cagnotte de tontine. | §6.3 |
| `08-transfert-frais` | Transfert avec le champ « Frais (facultatif) » (enregistrés en « Frais d'envoi et de retrait »). | §3.4 |
| `09-accueil-cartes` | Accueil avec états amorcés : Wave sous zéro (« il faudra régulariser »), cartes « payé ? / reçu ? » des échéances, liste « À régulariser », salaire attendu. L'argent disponible (140 000) dépasse le total des comptes (120 000) : D compte max(0, solde) par compte (§6.4), le total compte Wave à −20 000. | §6.4, §8 |
| `10-compte-edition` | Édition d'un compte : solde actuel, solde de départ et sa provenance, bouton « Corriger le solde ». | §3.2 |
| `11-feuille-corriger-le-solde` | « Solde réel constaté » + date + « Motif » : l'écart devient une correction (ni revenu ni dépense). | §3.2 |
| `12-feuille-reste-desactivation` | Désactiver un compte qui contient encore de l'argent : « Transférer le reste » ou « Constater une perte ». | §3.3 |
| `13-epargne-origine` | Nouveau compte d'épargne : « D'où vient cet argent ? » (pris sur le disponible, ou épargne que j'avais déjà). | §5 |
| `14-objectif-origine` | Nouvel objectif avec montant initial : disponible, compte d'épargne ou hors de mes comptes. | §5 |
| `15-feuille-fermeture-poche` | Archiver un objectif qui contient de l'argent : « Où va l'argent ? » (remettre dans mon disponible / garder sur l'épargne). | §5.1 |
| `16-dette-compte` | Nouvelle dette : « Sur quel compte l'argent est-il arrivé ? » (obligatoire, ou « Hors de mes comptes »). | §5.5 |
| `17-remboursement-interets` | Remboursement avec « Dont intérêts (facultatif) » : le capital baisse la dette, les intérêts sont une dépense. | §5.5 |
| `18-dette-cloture` | Fiche de la dette après le remboursement de 55 000 dont 5 000 d'intérêts : seuls 50 000 de capital sont remboursés (reste 150 000), « Marquer comme soldée » pour clore (remise ou abandon du reste). | §5.5 |
| `19-tontine-cloturer` | Tontine dont le cycle est passé : bandeau « clôturer ? » et bilan. | §5.6 |
| `20-rapport` | Rapport du mois par nature : revenus, dépenses, remboursements, résultat, financements, corrections, pertes. | §10 |
| `21-releve-compte` | Historique filtré sur un compte : relevé (solde au début, entrées, sorties, solde à la fin). | §10.2 |
| `22-budget-reste-a-repartir` | Budget : « Reste à répartir » calculé sur l'argent réel, part du revenu déclaré par enveloppe. | §9 |
| `23-analyse` | Analyse : marge sur les mois clos, « Pas encore assez de données » sinon. | §11 |
| `24-score` | Score de comportement v2 : taux d'épargne, vivre selon ses moyens, épargne de précaution, budget, dettes et échéances. | §11 |
| `25-reserve-origine` | Nouvelle réserve famille : plafond et montant de départ. | §5 |
| `26-inscription-sources-sans-montant` | Profil financier : plus de saisie d'argent présent (l'argent se déclare compte par compte). | §2 |
| `27-historique` | Historique : totaux « Revenus / Dépenses » par nature (transferts et corrections exclus). | §10.2 |

Un fichier `…-ERREUR.png` signalerait une étape que le script n'a pas pu atteindre ; il n'y en
a aucun dans la version commitée.
