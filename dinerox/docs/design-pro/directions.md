# Étape 2 — Deux directions (2026-10-21)

Maquettes : `docs/design-pro/directions/index.html`. Elles utilisent les polices et les icônes
EMBARQUÉES de l'application (Inter, Plus Jakarta Sans, Ionicons) et les chiffres que
l'application affiche en démonstration au 21 octobre. Aucun code de l'application n'a changé.

- Figma : fichier « DineroX — Directions »
  (https://www.figma.com/design/xDfOdmvIUHqlKGb1qEHNAD) : une page par direction (A, B) et une
  page pour les trois cartes d'accueil, en calques modifiables.
- Android : `directions/android/` : Chrome de l'émulateur Android, page de **360 × 800 dp**
  exactement (barre d'adresse recadrée). C'est le rendu Android des polices et des couleurs ;
  le rendu dans l'application elle-même viendra à l'étape 3.
- Relancer : `node e2e/serve.js docs/design-pro/directions 8099` puis
  `http://localhost:8099/?board=a`, `?board=b`, `?board=cards`, ou un écran seul :
  `?d=a&s=home|entry|budget&t=light|dark&card=a|b|c`.

## Ce qui est commun aux deux

- Un seul chiffre principal par écran, aligné à gauche ; le reste en lignes « libellé — montant ».
- Une seule couleur de marque (vert), utilisée pour le bouton Saisir, l'onglet actif, les liens.
  Rouge = alerte seulement ; une dépense n'est **pas** rouge (signe « − » en encre), une entrée
  est verte avec « + ». Ocre = « épuisé ».
- Chiffres tabulaires pour tous les montants. Plus de police à chasse fixe.
- Icônes Ionicons « outline » d'une seule couleur, sur fond neutre (plus d'emojis ni de pastels).
- Grille de 4 / 8 dp, marges de 16 dp, zones de toucher ≥ 48 dp, **aucun dégradé, aucun halo**,
  au plus une ombre de 1 dp.
- Barre d'onglets plate : le micro est une pastille pleine DANS la barre, sans relief flottant.
- Saisie : un seul sélecteur fort (Parler / Clavier), le sens (Sortie / Entrée) en onglets
  soulignés, montant à zéro en gris (plus en rouge), grille de 8 catégories visibles d'un coup.
- Budget : une carte de synthèse (reste + barre + Prévu / Dépensé / Reste à répartir), les
  alertes regroupées dans une seule carte, les enveloppes en LISTE (plus en grille de pavés).

## A — Sobre et bancaire

| | Clair | Sombre |
|---|---|---|
| Fond | `#F5F6F8` | `#0D1013` |
| Surface | `#FFFFFF` | `#161B1F` |
| Surface 2 | `#EEF0F3` | `#1F252A` |
| Filet | `#E6E9ED` | `#252C32` |
| Texte / 2 / 3 | `#0F1419` / `#4B5560` / `#646D78` | `#EDF0F2` / `#AEB6BE` / `#8E979F` |
| Marque | `#0B5D4B` | `#3DB394` |
| Entrée | `#137A47` | `#4CC38A` |
| Alerte | `#C0262D` | `#F0646B` |
| Attention | `#975A00` | `#E3A445` |

Police : **Inter seule** (600 pour titres et chiffres). Rayons : cartes 12, touches 10, feuilles 16,
icônes en cercle. Aucune ombre : des filets de 1 dp. Carte d'accueil : version (a), le chiffre posé
sur le fond. Références : Qonto, Revolut, Sumeria.

## B — Chaleureuse et locale

| | Clair | Sombre |
|---|---|---|
| Fond | `#F4F1EA` (sable) | `#13120F` |
| Surface | `#FFFCF7` | `#1D1B17` |
| Surface 2 | `#EDE7DC` | `#29261F` |
| Filet | `#EAE3D7` | `#2C2923` |
| Texte / 2 / 3 | `#1F1C17` / `#564E43` / `#6E6558` | `#F3EFE7` / `#BDB4A4` / `#A0968A` |
| Marque (vert profond) | `#0F4A3A` | `#4FB08F` (carte : `#123A2F`) |
| Entrée | `#1E7A45` | `#63C08A` |
| Alerte | `#B3261E` | `#EF6B61` |
| Attention (ocre) | `#8A5A00` | `#D9A441` |

Polices : **Plus Jakarta Sans** (titres et chiffre principal, 700) + **Inter** (texte). Rayons :
cartes 16, touches 12, feuilles 20, icônes 12. Ombre de 1 dp en clair, aucune en sombre. Carte
d'accueil : version (b), vert profond UNI, fin filet clair de 1 dp, motif discret de losanges en
traits fins (inspiré des tissages, une seule opacité de 10 %, dans le coin), ombre de 1 dp.
Références : Wave, Monzo, Nubank.

## Carte d'accueil — trois versions

(a) chiffre posé sur le fond + carte neutre des détails ; (b) vert profond uni (filet, motif,
ombre très légère — aucun dégradé) ; (c) carte claire avec un filet de marque à gauche. Chaque
version est montrée dans les deux directions, en clair et en sombre
(`android/carte-<version>-direction-<a|b>-<thème>.png`).

## Textes montrés autrement dans les maquettes (NON appliqués — à ton accord à l'étape 4)

| Clé (ou donnée) | Avant | Dans la maquette | Raison | EN avant → après |
|---|---|---|---|---|
| `home.hello` / `home.helloAnon` | Bonjour {name} 👋 | (retiré de l'en-tête) | place pour le chiffre principal ; plus d'emoji | Hello {name} 👋 → (removed) |
| phrase sous « Reste par jour » | Il vous reste 38 681 FCFA par jour jusqu'au 31 octobre | jusqu'au 31 octobre | le montant n'est plus écrit deux fois | You have … per day until 31 October → until 31 October |
| `ins.envelope_threshold.critical` | 🔴 Budget {name} dépassé de {over}. | Budget {name} dépassé de {over}. | l'icône d'alerte suffit | 🔴 {name} budget exceeded by {over}. → without 🔴 |
| statut d'enveloppe | Reste 7 000 FCFA + « Dans les limites » | Reste 7 000 | un seul statut | Left 7,000 + Within limits → Left 7,000 |
| lien « Nouvelle enveloppe » | Nouvelle enveloppe | Nouvelle | tient sur la ligne du titre | New envelope → New |
| dates des opérations | 18 octobre | 18 oct. | une ligne par opération | 18 October → 18 Oct |
| montants des listes | −10 000 FCFA | −10 000 | la devise est celle de l'espace ; allège les listes | idem |
| noms de catégories (grille de saisie) | Alimentation & boissons, Loisirs & divertissement | Alimentation, Loisirs | ce sont des DONNÉES du catalogue (règle 21), pas des textes : la grille réelle gardera les vrais noms sur 2 lignes | — |
