# 1.9 — Fiche de test de la conversation vocale (sur téléphone)

Chaque scénario se teste en touchant le micro central, en parlant, puis en
touchant ■. Les réponses se disent avec « Répondre à la voix » (ou s'écrivent).
Colonne « Auto » : vérifié automatiquement par `e2e/voice-conversation.js`
(écran réel, reconnaissance simulée) et/ou les tests `tests/voice-*.test.ts`.

## Compréhension

| # | Dire | Attendu | Auto |
|---|---|---|---|
| 1 | « J'ai dépensé 30 000 en facture d'électricité, 30 000 en facture d'eau, 30 000 au marché, et 100 000 en loyer, 10 000 en transport, 5 000 en santé, ainsi de suite » | 6 lignes, 205 000, aucune question, lu et affiché | ✓ |
| 2 | « 30 000, non pardon 35 000 en électricité » | 1 ligne, 35 000 | ✓ |
| 3 | « taxi 1 000, garba 500, crédit 1 000, loyer 100 000, pharmacie 2 000, marché 15 000, essence 5 000, école 20 000, coiffure 3 000 et facture d'électricité 12 000 » | 10 lignes, 159 500 | ✓ |
| 4 | « trente mille au marché et deux mille cinq cents de crédit » | 30 000 + 2 500 | ✓ |
| 5 | « J'ai reçu mon salaire 250 000, j'ai mis 50 000 de côté et payé 10 000 de transport hier avec la banque » | revenu + épargne + dépense ; dépense datée d'hier sur la banque | ✓ |
| 6 | « pharmacie » | ligne « à vérifier : montant », « Tout valider » impossible | ✓ |
| 7 | « 2 000 pour djakarta » | sans IA : « à vérifier : catégorie » ; avec IA (scénario 20) : question « Autres ou créer ? » | ✓ / téléphone |
| 8 | « hier taxi 2 000 par Orange Money » | compte Orange Money, date d'hier | ✓ |
| 9 | « 30 000 en eau » | UNE question « facture d'eau ou eau à boire ? » | ✓ |
| 10 | « 30 000 en eau, 2 000 eau, 500 eau » | 2 questions au plus, la 3e ligne reste « à vérifier » | ✓ |
| 11 | refaire le 9 après avoir choisi « eau à boire » et validé | plus de question | ✓ (test) |
| 12 | « 30 balles de garba » | montant « à vérifier » (unité non validée) | ✓ (test) |

## Réponses dans la conversation

| # | Après le scénario 1, dire | Attendu | Auto |
|---|---|---|---|
| 13 | « Non, le loyer c'est 120 000 » | « Loyer corrigé à 120 000 », nouveau total 225 000 | ✓ |
| 14 | « Enlève la santé » | ligne retirée, nouveau total | ✓ |
| 15 | « Ajoute 2 000 de crédit téléphone » | ligne ajoutée, nouveau total | ✓ |
| 16 | « C'était hier » | toutes les lignes datées d'hier | ✓ |
| 17 | « Paie le loyer avec la banque » | seule la ligne du loyer change de compte | ✓ |
| 18 | « Combien il me reste pour le transport ? » | réponse calculée, lue | ✓ |
| 19 | « Non, annule » / « Laisse tomber » | « C'est annulé : rien n'a été enregistré » | ✓ |

## IA (compte réel, en ligne, consentement IA accordé)

| # | Faire | Attendu | Auto |
|---|---|---|---|
| 20 | dire « 2 000 pour djakarta » | « Je réfléchis… » (8 s au plus), puis question « Je n'ai pas de catégorie pour djakarta. Autres, ou je crée… ? » | téléphone (garde-fous : ✓ test) |
| 21 | même phrase en mode avion | aucune attente, ligne « à vérifier » | téléphone (✓ test) |
| 22 | consentement IA retiré (Réglages › Données) | parseur local seul | téléphone (✓ test) |
| 23 | 4e phrase complexe du jour en formule gratuite | le parseur local reste seul (quota 3/jour) | ✓ (test serveur) |

## Après « oui »

| # | Faire | Attendu | Auto |
|---|---|---|---|
| 24 | dire « Oui » | bilan : nombre, total, UNE phrase d'enveloppes, reste par jour | ✓ |
| 25 | « Annuler » dans les 5 s | toutes les lignes retirées d'un coup | ✓ |
| 26 | scénario 5 puis « Tout valider » | « Voulez-vous répartir ce salaire… ? » ; la répartition s'affiche, rien n'est modifié | ✓ |
| 27 | « dette 5 000 » puis valider (catégorie sans enveloppe) | « En créer une ? » une seule fois par catégorie | ✓ |
| 28 | vérifier Historique, Budget, Accueil | les opérations y sont aussitôt | ✓ (Historique) |
| 29 | vérifier que le coach ne répète pas l'alerte d'enveloppe du bilan | — | téléphone |

## Voix

| # | Faire | Attendu | Auto |
|---|---|---|---|
| 30 | écouter la reformulation | texte et voix en même temps | ✓ |
| 31 | toucher la bulle pendant la lecture | silence immédiat | ✓ |
| 32 | ouvrir le micro pendant la lecture | la voix se tait (jamais les deux) | ✓ |
| 33 | Réglages › couper « Lire les montants pendant la saisie vocale » | les montants ne sont plus lus, toujours affichés | ✓ |
| 34 | Réglages › « Mode silencieux (texte seulement) » | rien n'est lu | ✓ |
| 35 | réponse tapée au clavier | affichée, pas lue | ✓ |
| 36 | qualité de la voix du téléphone en français, volume « médias » | compréhensible | téléphone |
