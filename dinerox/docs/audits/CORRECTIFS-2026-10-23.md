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

### Écran Notifications en direction B (demande du fondateur, après validation de la partie 1)

| Demande | Test (rouge d'abord) | Correctif |
|---|---|---|
| Fond sable, clair et sombre | e2e `notifications-screen.js` : fond `#F4F1EA` / `#13120F` | `app/notifications.tsx` dans `DesignV2` |
| Chaque message dans la carte de « À lire », sans × | même parcours : une carte par « Écouter », une étiquette, une pastille de 36 dp, « Écouter » hors de la zone touchable, aucun « Marquer comme lu » | carte extraite en `ToReadCard` (`notifications/ToReadList.tsx`), partagée par l'Accueil et Notifications ; × seulement avec `onRead` |
| Conseil du jour (« Vos données », « M'expliquer ce conseil (IA) ») et provenance de « Votre analyse » | même parcours ; `coach-advice.js` (« Votre analyse » exigée, avec provenance) | dans `ToReadCard`, inchangé |
| Les constats gardent leur action d'ouverture | même parcours : toucher un constat ouvre `/envelopes/…` | lien du message (`refPath`, identique à l'ancienne carte) |
| Titre jamais coupé ; réglages = bouton icône de 48 dp, même libellé lu | même parcours : titre entier, bouton « Réglages des notifications » de 48×48, libellé non écrit | `IconButton` |
| Rien ne disparaît : mêmes messages, même ordre | même parcours avec `NOTIF_REF` (export d'avant) : 5 messages identiques, même ordre | `useToRead().alerts` : chaque constat sans fusion, puis les autres messages, comme avant |

Sur l'export d'avant, `notifications-screen.js` donne 7 échecs ; sur le nouveau, tout est vert.
Trois tests qui lisent le texte du code (`audit-2026-10-23`, `etape5-j`, `etape5-notifications`)
suivent le déplacement de la carte, sans changer ce qu'ils vérifient. Aucun texte nouveau, rien
dans `src/core`.

À savoir : dans la démonstration, « Vos objectifs demandent… » s'affiche en « Votre coach » quand
le résumé d'ouverture du coach l'a déjà dit, sinon en « Votre analyse » avec sa provenance. C'est la
fusion de « À lire » (E3), inchangée : les images d'avant et d'après le montrent de la même façon.

Vérifications : `npm run check` vert (1781). Parcours verts : `coach-advice`, `coach-open`,
`coach-budget`, `lot-a-home`, `notifications-screen` (ajouté à `run-all.sh`) et `layout-audit`.
Images : `notifications-clair.png` et `notifications-sombre.png`, produites par
`e2e/captures-notifications.js`.

## Partie 2 — branche connexion-telephone

design-pro (dcc558e) fusionné dans connexion-telephone par un merge (0beadc0, un seul conflit :
la liste de `e2e/run-all.sh`, qui garde `phone-auth.js` ET `notifications-screen.js`). Aucun
fichier de `src/core` modifié. Rien n'est déployé : les règles, les fonctions et les index ne
changent que dans le code.

### Sécurité de la connexion par téléphone (S1 à S11)

| N° | Constat | Test (rouge d'abord) | Correctif |
|---|---|---|---|
| S1 | « Ajouter mon numéro » sans connexion récente, sans contrôle si le compte a déjà un numéro, sans alerte au premier ajout | `tests/functions/phone-audit.emulator.test.ts` › S1 : connexion de plus de 5 min refusée (envoi ET code secret) ; compte qui a déjà un numéro : refus sans le code secret actuel, avant tout envoi, accepté avec lui ; 5 faux codes actuels → blocage ; alerte notification + e-mail à chaque ajout, sans code. e2e `phone-auth.js` : écran « Votre code secret » avant un autre numéro, faux code → « Code secret incorrect. », aucun envoi ; alerte « numéro ajouté » | `phoneAuthApi.ts › assertCanLink` (envoi ET code secret) : `auth_time` de moins de 5 min, code secret actuel (même blocage que la connexion), alerte `linked` ; application : étape « code secret actuel » (`PhoneFlow.tsx`) |
| S2 | La suppression du compte laissait index, code secret, appareils et demandes : l'ancien code secret recréait un compte « fantôme » | test › S2 : après « Supprimer mon compte », plus rien ; l'ancien code ne rouvre rien ; numéro recyclé = compte neuf. Compte disparu (données restées) : numéro inconnu. `tests/backoffice/phone-accounts.test.ts` : même effacement par le back-office | `phoneData.ts › forgetPhoneData`, appelé par `deleteUserData` (application ET back-office) ; `ownerOf` : un index vers un compte disparu est effacé et le numéro traité comme inconnu |
| S3 | Un inconnu bloquait le propriétaire (5 faux codes, 5 envois) | test › S3 : bloqué sur l'autre appareil, pas sur l'appareil connu ; envois épuisés par un inconnu, « code oublié » encore possible depuis l'appareil connu | compteurs à part `known-<numéro>` pour un appareil déjà connu du compte (connexion et envois) |
| S4 | WhatsApp sans liste de pays ; jeton App Check réutilisable ; un seul plafond global | test › S4 : WhatsApp vers +1 refusé sans envoi ; SMS épuisé, WhatsApp continue ; un préfixe épuisé ne bloque pas les autres | liste des pays pour WhatsApp aussi (`phone/country`) ; `consumeAppCheckToken` sur `phoneStart` + refus d'un jeton rejoué, jeton à usage unique côté application ; plafonds du jour par canal (`PHONE_SMS_DAILY_CAP`, 500) et par préfixe (`PHONE_PREFIX_DAILY_CAP`, 300), alerte au back-office comme le plafond global |
| S5 | Numéro en clair gardé sans limite dans les demandes de code | test › S5 : demande utilisée ou annulée : plus de numéro en clair ; `deleteAt` (Timestamp) sur toute demande | numéro effacé quand le ticket est réservé et quand la demande est annulée ; champ `deleteAt` (24 h) prêt pour une règle TTL, **non activée** |
| S6 | Un numéro déjà posé dans Firebase Auth autrement ouvrait ce compte | test › S6 : inscription refusée (« numéro déjà relié »), aucune session | `phone/taken` au lieu d'ouvrir le compte |
| S7 | Le numéro du compte précédent restait affiché à la personne suivante | e2e `phone-auth.js` : après « Se déconnecter », le dernier numéro n'est plus gardé ; l'écran de connexion ne le montre pas | `forgetPhone()` dans `signOut` et `deleteAccount` (`services/auth.ts`, par où passent toutes les déconnexions) |
| S8 | Compte suspendu : message générique ; « code oublié » changeait quand même le code | test › S8 : connexion refusée (`phone/disabled`), « code oublié » refusé, code secret inchangé. e2e `suspended.js` (cas téléphone ajouté) : « Ce compte est suspendu… », aucune session | refus côté serveur ; message existant `auth.err.user-disabled` |
| S9 | « S'inscrire » sur un numéro déjà inscrit remplaçait le code secret | test › S9 : `phone/exists`, code secret inchangé, seul « code oublié » le change. e2e : écran « Ce numéro a déjà un compte » avec « Se connecter » / « Code secret oublié ? » | refus côté serveur ; écran `ExistsStep` |
| S10 | Un administrateur pouvait relier un numéro | test › S10 : droit `admin` ou collaborateur du back-office : refusé avant tout envoi | `phone/admin` (ajout et connexion) |
| S11 | Ordre risqué dans « Ajouter mon numéro » ; lecture différente si le numéro existe | test › S11 : ajout refusé (numéro d'un autre compte Auth) → l'ancien numéro reste intact (avant : erreur interne APRÈS avoir retiré l'ancien index) | tous les contrôles avant de réserver le ticket et d'écrire ; ancien index retiré dans le même lot ; connexion : même lecture (index, appareils, code secret, compte) pour un numéro inconnu |

### Comptes créés par numéro (C1, C2 = D2, C4, C5)

| N° | Constat | Test (rouge d'abord) | Correctif |
|---|---|---|---|
| C1 | Back-office : recherche et suppression impossibles sans e-mail | `tests/backoffice/phone-accounts.test.ts` : recherche par numéro (avec ou sans indicatif, espaces, « 00 »), numéro masqué ; suppression confirmée par l'identifiant retapé ; un compte avec e-mail exige toujours l'adresse | `boSearchUsers` (numéro complet), `boDeleteUser` (`confirmUid`) ; interface `admin/` : recherche « e-mail, numéro ou identifiant », confirmation par identifiant |
| C2 / D2 | Réglages › Sécurité : « Changer le mot de passe » inutile, rien pour le code secret | e2e : compte sans e-mail : pas de mot de passe ; « Changer mon code secret » → parcours « code oublié » sur le numéro du compte → retour à Sécurité, toujours connecté | `settings/security.tsx`, `settings/change-secret.tsx` (`PhoneFlow start="change"`) |
| C4 | Inscription par numéro sans liens CGU / confidentialité, sans code d'invitation, sans événement | e2e : champ « Vous avez un code d'invitation ? » et sa transparence ; liens CGU et confidentialité ; code mal formé refusé avant tout envoi ; `sign_up { method }` une fois | mêmes textes, même contrôle, même événement que l'inscription e-mail (`method: 'phone'`) |
| C5 | Une APK faite depuis connexion-telephone montrerait des boutons qui échouent | règle : `config/app/items/phoneAuth` lisible sans compte, écrit par un administrateur seulement. e2e : absent ou `false` → bienvenue d'origine ; `true` → boutons « numéro » | `services/phoneAuthSwitch.ts` ; `welcome.tsx` ; « Ajouter mon numéro » aussi caché tant que l'interrupteur est désactivé. **Par défaut : DÉSACTIVÉ** |

Petit détail du fondateur (notifications) : un « Votre coach » au ton « conseil » avait l'ampoule
violette du « Conseil du jour ». `look()` est sorti dans `features/notifications/look.ts` (pur) ;
l'ampoule suit maintenant l'ÉTIQUETTE. Test `tests/audit-2026-10-23-p2.test.ts` (2 rouges avant).

D3 (invitations familiales par numéro) : rien de fait, comme décidé.

### Pour être exact

- Rouges d'abord : 19 sur 19 dans `phone-audit.emulator.test.ts` (S11 tombait même en erreur
  interne) ; 2 sur 3 au back-office (le 3ᵉ vérifie que le cas avec e-mail ne change pas) ; la
  règle de l'interrupteur ; `phone-auth.js` et `suspended.js` s'arrêtaient sur la bienvenue ; 2
  sur l'icône. Écrits APRÈS le code, donc verts d'emblée : les tests des petites règles pures du
  serveur (`phone-server.test.ts` : préfixe, connexion récente, jeton rejoué), la traduction des
  nouveaux refus et la lecture de l'interrupteur (`audit-2026-10-23-p2.test.ts`).
- S4, jeton à usage unique : l'émulateur ne sait pas « consommer » un jeton App Check. Vérifié par
  le test du refus d'un jeton rejoué et une vérification dans le code (`consumeAppCheckToken: true`).
- Trois tests existants décrivaient l'ancien comportement et ont été changés :
  « inscription avec un numéro déjà inscrit » attendait le remplacement du code secret (c'est S9) ;
  « code oublié » compte maintenant les alertes « code secret changé » seulement (l'ajout du numéro
  a sa propre alerte, S1) ; le test des 20 essais en parallèle compte les blocages posés (S3 crée un
  compteur à part).
- Deux tests qui lisent le texte du code suivent les déplacements (`look` dans son module, lecture
  de l'interrupteur dans la bienvenue), sans changer ce qu'ils vérifient.
- Le back-office (`admin/`) n'a pas ses dépendances installées dans ce dossier : ses fichiers
  modifiés n'ont pas pu être vérifiés par `tsc` ici. Les fonctions du back-office, elles, sont
  testées (188 tests).

### Changements visibles à connaître

- S7 : après « Se déconnecter », l'application ne propose plus « Bon retour ! » avec le numéro : il
  faut le retaper. « Bon retour ! » reste quand la session finit sans déconnexion (session expirée,
  compte réactivé). Le profil rangé PAR COMPTE sur le téléphone (règle 14) garde son numéro ; il
  n'est montré qu'à ce compte.
- S2 : « code oublié » sur un numéro dont le compte a disparu crée un compte neuf, comme une
  inscription (comportement d'avant pour un numéro inconnu).
- S10 : un administrateur voit le message générique « Une erreur est survenue » (aucune clé
  ajoutée pour ce cas).
- Nouvelles clés FR + EN (3) : `phone.exists.title` (« Ce numéro a déjà un compte », texte de la
  consigne), `phone.secret.change` (« Changer mon code secret », décision D2), `phone.err.country`
  (le message SMS ne convenait pas pour WhatsApp). Aucune clé supprimée.
- À faire au déploiement (fondateur) : créer `config/app/items/phoneAuth` seulement le jour de
  l'activation ; activer la règle TTL de Firestore sur `phoneAuth.deleteAt` ; les plafonds
  `PHONE_SMS_DAILY_CAP` et `PHONE_PREFIX_DAILY_CAP` ont des valeurs par défaut (ce ne sont pas des
  secrets).

Vérifications (partie 2), toutes vertes :

- `npm run check` : 122 fichiers, 1896 tests, lint à zéro.
- `npm run test:rules` : 74/74 (JDK 21).
- `npm run test:functions`, deux fois de suite : 74/74 puis 74/74 (6 fichiers, dont les 19 tests de
  `phone-audit.emulator.test.ts`).
- `npm run test:backoffice` : 188/188.
- `npm --prefix firebase/functions run typecheck` : aucune erreur.
- e2e COMPLET (`e2e/run-all.sh`, export web neuf) : 35 parcours, 1072 vérifications, aucun échec,
  aucune erreur JS ; « MISE EN PAGE : TOUT EST OK ».
- Planches : `docs/audits/preuves-2026-10-23/telephone-1.png` (C5, C4, S9) et `telephone-2.png`
  (S1, C2, S8), faites depuis les captures de cet e2e ; preuves « maquette | application » de la
  connexion par téléphone régénérées (`e2e/captures-phone.js`).
- `src/core` : aucun fichier modifié.
