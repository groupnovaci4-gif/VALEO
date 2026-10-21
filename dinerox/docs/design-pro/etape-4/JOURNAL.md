# Étape 4 — journal (référence : maquette validée, `docs/design-pro-maquette-validee` de la branche du fondateur)

Une ligne par étape : fait, preuve, captures. Captures web : Chrome, 360 × 800 dp, mode démonstration ;
captures Android à l'étape 6.

| Étape | Fait | Preuve | Captures |
|---|---|---|---|
| 0 | Ménage : ancien `coach-rewards.js` (autre session) et son Chrome de test arrêtés ; aucun émulateur, navigateur de test, Gradle ni émulateur Firebase actif (le Chrome personnel du fondateur n'a pas été touché). | `ps` : 0 processus restant | — |
| 1 | Accueil, haut : ligne « Démo » + « Créer mon profil › » (texte explicatif en libellé d'accessibilité) ; carte compacte flottante (f4) « Votre plafond de dépenses par jour », montant 36, étiquette du mois, œil seul ; phrase « Il vous reste … » et ligne « Masquer les montants » retirées ; « dont … hors de vos comptes » retiré (gardé dans le libellé d'accessibilité) ; « Mis de côté › » se déplie : « Dans vos comptes » / « Gardé ailleurs ». Parcours e2e qui lisaient la phrase : lisent la carte (`PER_DAY`). | `tests/etape4-accueil-haut.test.ts` (19 tests, rouges d'abord) ; somme du détail = « Mis de côté » (démo : 450 000 + 50 000 + 300 000 + 50 000 + 30 000 = 880 000) ; `npm run check` vert (1536) | `web/etape-1/accueil-{light,dark}-1.png` (fermé), `-2.png` (déplié) |
