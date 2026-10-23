# Correctifs de l'audit du 23 octobre 2026

Rapport : `docs/audits/audit-securite-regression-2026-10-23.md` (branche
`claude/admiring-ritchie-h611hm`). Méthode : pour chaque constat, un test qui échoue d'abord, puis le
correctif. Tests de comportement autant que possible (fonctions pures, parcours e2e) ; une
vérification dans le code seulement quand le comportement demande un compte que les parcours n'ont
pas (enfant, IA payante en ligne). Aucun fichier de `src/core` modifié. Aucune clé de texte ajoutée
ni supprimée.

## Partie 1 — branche design-pro (base de l'APK de test)

Décision D1 du fondateur appliquée. Tous les constats ont été confirmés dans le code ; aucun n'a
paru faux.

| N° | Constat | Test (rouge d'abord) | Correctif |
|---|---|---|---|
| R1 | Impossible de créer une 2ᵉ réserve depuis Objectifs | e2e `reserve.js` : « Ajouter » présent avec une réserve (formule Famille), ouvre la création ; **2ᵉ réserve créée, deux vignettes** ; formule gratuite : pas de « Ajouter » | `(tabs)/goals.tsx` : « Ajouter » (nom lu « Ajouter, Réserves ») sous les vignettes, avec le même contrôle que l'écran de création (`withinLimit`, `family_reserve`) |
| R2 | Un message lu ne revenait plus quand sa situation changeait | `tests/audit-2026-10-23.test.ts` : même texte → reste lu ; texte changé → à lire ; un membre de groupe dont le texte change revient | `notifications/toRead.ts` : clé de lecture `readKeyOf(espace, identifiant, empreinte du texte)` |
| R2 | Un regroupement lu masquait les messages nouveaux | test : « 2 paiements réguliers » lu, un 3ᵉ arrive → le 3ᵉ est à lire | le groupe n'a pas de clé propre : « lu » marque ses SEULS membres (`readTargets`) |
| R3 | Mémoire « lu » par compte mais pas par espace | test : lu dans Privé → toujours à lire dans Famille | l'espace actif est dans la clé (`useToRead`) |
| R4 | « M'expliquer ce conseil (IA) » disparaissait une fois le conseil lu | test (dans le code : l'appel demande un compte en ligne, une formule payante et le consentement) | `app/notifications.tsx` : le conseil (lu ou non) porte sa provenance et `AdviceAi` |
| R5 | Provenance perdue sur « Votre analyse » | e2e `coach-advice.js` : « Votre analyse » trouvée (plus de repli sur une autre carte) avec « Vos données » / « Estimation DINEROX » | étiquette `SourceTag` sur l'Accueil et dans Notifications |
| R6 | Calculs du coach refaits par la cloche, l'Accueil, le Budget, Notifications | test : un seul `ToReadProvider` ; e2e `coach-open.js` : cloche = « À lire · N » avant et après lecture, à chaque réouverture | `ToReadProvider` (monté une fois dans `_layout.tsx`) ; `useToRead` lit son résultat |
| R7 | Objectif en retard plus signalé sur sa vignette | test : `goalPaceKind` → « overdue » avant tout rythme ; écrit en rouge | `features/goals/goalTile.ts` + `GoalTileCard` (`paceAlert`) : « La date est dépassée : il reste X à réunir. » |
| R7 | Date du moment fort disparue | e2e `family.js` : « Rentrée scolaire · 26 novembre » sur la vignette | nom de la vignette + date (`date()` de l'i18n) |
| R7 | Phrase « Les dettes, les tontines et les charges sont gérées par les parents… » plus écrite chez l'enfant | test (dans le code : aucun parcours ne se connecte en enfant) | `(tabs)/budget.tsx` : phrase écrite sous la carte |
| R8 / D1 | Aucun bouton visible pour saisir au clavier sur l'Accueil | e2e `lot-a-home.js` : « Saisir une opération » sous les tuiles, 48 dp, ouvre la saisie au clavier | `home/QuickTiles.tsx` (clé existante `entry.mic.labelKeyboard`) |
| R9 | Ajustement de solde positif sans « + » sur l'Accueil | test : `amountDirection` (ajustement à la hausse → « + ») utilisé par les deux listes | `home/dayGroups.ts › amountDirection` ; `RecentByDay.tsx` et `rows.tsx` |
| R10 | Zones de toucher sous 48 dp | e2e : onglets du Budget 48 et 48 dp (`coach-budget.js`), « Nouveau » 48 dp (`reserve.js`), « Mis de côté » 48 dp (`lot-a-home.js`) | zone de 48 dp, aspect inchangé (pastille de 36 dp gardée, marges négatives) |
| R11 | Mode sombre : chiffre blanc sur la pastille rose de la cloche (sous 4,5:1) | test : contraste ≥ 4,5:1 dans les deux thèmes | `theme/finalPalette.ts › bellBadge` (chiffre de `glyphOn`) |
| R12 | Course au chargement de la mémoire « lu » | test (stockage simulé) : deux demandes → UNE lecture ; un message fermé pendant le chargement ne réapparaît pas | `services/readState.ts` : un chargement par compte, partagé ; fusion de ce qui a été lu pendant le chargement |
| R13 | « Écouter » interrompu comptait comme lu | test (file vocale) : coupure → « stopped » sans autre voix ; fin non signalée → « stopped » | `voice/queue.ts` (`InterruptedError`, fin `false`), `device.ts` (`onStopped` = coupure, garde-fou = non confirmé), `premium.ts` |
| T1 | Tests affaiblis | `coach-open.js` : exactement min(3, N) messages sur l'Accueil ; × fait baisser N d'autant, cloche identique ; aucun message fermé ne revient aux réouvertures. `coach-advice.js` : « Votre analyse » exigée (plus de repli sur « Alerte budget »), provenance du conseil et de l'analyse. `lot-a-home.js` : lien clavier réel et 48 dp. `reserve.js` : 2ᵉ réserve depuis Objectifs | — |

Pour être exact sur le « rouge d'abord » :
- `tests/audit-2026-10-23.test.ts`, lancé sur le code d'origine (copie détachée de `720c3d9`) :
  19 rouges sur 20. Le seul vert est « fin réelle : spoken », un garde-fou du comportement qui
  doit rester vrai.
- Les vérifications e2e ajoutées portent sur des éléments absents ou trop petits dans la version
  d'origine : bouton « Ajouter », lien « Saisir une opération », zones de 44, 36 et 28 dp. Elles
  n'ont pas été relancées sur l'ancien export.
- Une vérification e2e a été corrigée en cours de route. `coach-open.js` exigeait le même nombre
  « À lire » à chaque réouverture. Or le résumé d'ouverture du coach peut apporter un point nouveau
  (un résumé par ouverture : 8 → 9 → 8). La vérification exige maintenant « jamais moins, cloche
  identique, aucun message fermé de retour ».

- D1 : le premier e2e complet a échoué sur `lot-a-reminder.js` et `voice-consent.js`. Quand le
  clavier est la méthode par défaut, le bouton central s'appelle déjà « Saisir une opération » (et la
  tuile devient « Saisir »), donc le lien faisait doublon. Le lien n'est affiché que si la voix est
  la méthode par défaut, ce qui est le cas de R8. Ces deux parcours existants servent de test rouge.
  **À valider par le fondateur** : la décision D1 ne précisait pas ce cas.

Changements visibles à connaître :
- Mémoire « lu » : les messages déjà lus avant cette version seront de nouveau à lire UNE fois, car
  la clé de lecture a changé.
- R13 : sur un téléphone qui ne signale jamais la fin de la lecture, « Écouter » ne marque plus le
  message comme lu. Le × reste disponible.

Vérifications (partie 1) :
- `npm run check` : vert, 1781 tests, lint à zéro.
- e2e complet (`e2e/run-all.sh`) : 33 parcours sur 33 de design-pro, exit 0, aucun ✗.
  `phone-auth.js`, le 34ᵉ, n'existe que sur connexion-telephone.

Preuves « avant | après » : `docs/audits/preuves-2026-10-23/`. Elles sont produites par
`e2e/captures-audit-1023.js` (démonstration, export d'avant servi à part) :
- `accueil-tuiles.png` : lien clavier, « Mis de côté » ;
- `objectifs.png` : « Nouveau », date du moment fort ;
- `objectifs-reserve.png` : « Ajouter » ;
- `budget.png` : onglets ;
- `notifications.png` : provenance de « Votre analyse » ;
- `cloche.png` : sombre, chiffre foncé sur le rose.
