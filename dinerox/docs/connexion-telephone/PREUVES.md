# Connexion par téléphone — décisions → preuves

Branche `connexion-telephone`. Fournisseurs **SIMULÉS** uniquement : aucun vrai envoi, aucun
compte Meta / SMS, aucune clé, aucun déploiement, aucune APK. Les secrets sont seulement
**nommés** (`defineSecret`) : `PHONE_CODE_PEPPER`, `META_WHATSAPP_TOKEN`, `SMS_API_KEY`.
`REFERRAL_DEVICE_PEPPER` n'est pas touché.

Images « maquette | application » : `preuves/*.png` — les 8 écrans et les 4 erreurs en clair,
l'écran 8 en sombre (voir écart 7). Export web 360 × 800, émulateurs, fournisseur simulé —
`node e2e/captures-phone.js`.

## 1. Décisions du fondateur (DECISIONS.md §5bis)

| Décision | Où | Preuve (test qui a échoué d'abord, puis passe) |
|---|---|---|
| 5bis.1 Option (a) : WhatsApp Meta + SMS local, chacun derrière une interface ; aujourd'hui fournisseur SIMULÉ seulement | `firebase/functions/src/phoneProviders.ts` (`CodeSender`, `AlertSender`, `simulated()` réservé à l'émulateur ; hors émulateur → `phone/unavailable`) | `tests/functions/phone-auth.emulator.test.ts` (18 tests) ; `e2e/phone-auth.js` lit les codes dans `phoneOutbox` |
| 5bis.2 Code reçu : 10 min, usage unique, 5 essais | `phoneVerify` | émulateur : « mauvais code… 5e erreur : demande annulée », « usage unique », « après 10 minutes : code expiré » ; e2e : « Il vous reste 4 essais », « code expiré » |
| 5bis.2 5 envois/jour/numéro, 1 par minute | `phoneStart`, `core/phone.ts › sendDecision` | `tests/phone.test.ts` « 1 par minute, 5 par jour » ; émulateur « too-soon », « daily-limit » |
| 5bis.2 Blocage 15 min → 1 h → 24 h, par numéro tenté | `phoneSignIn`, `failureAfter`, `lockDuration` | `tests/phone.test.ts` « 5 erreurs → 15 min ; puis 1 h ; puis 24 h » ; émulateur « bloqué 15 min, même avec le bon code » ; e2e « bloqué 15 minutes, pavé désactivé » |
| 5bis.2 Numéro inconnu = même temps qu'un mauvais code | `phoneSignIn` (scrypt factice `DUMMY_SECRET`) | émulateur « numéro inconnu : même réponse et même temps de calcul » |
| 5bis.2 Plafond global par jour + alerte au back-office | `phoneStart` (`phoneGuard/global-{jour}`, `writeAudit('phone.dailyCap')` une fois) | émulateur « plafond global atteint : plus aucun envoi, alerte au back-office (une fois) » |
| 5bis.2 App Check sur les fonctions | `enforceAppCheck: true` sur les 4 fonctions | émulateur « sans jeton App Check : refusé ; avec : accepté » |
| 5bis.3 Verrou de l'application SÉPARÉ, `security.ts` inchangé | — | `tests/phone-screens.test.ts` : `security.ts` identique à `origin/design-pro` |
| 5bis.3 Code secret JAMAIS gardé sur le téléphone, même en empreinte | `services/phoneAuth.ts` (rien d'écrit sauf identifiant d'appareil et dernier numéro), `PhoneFlow` (mémoire seulement) | `tests/phone-screens.test.ts` (aucun SecureStore, aucun secret écrit) ; e2e « ni le code secret ni le code reçu gardés » (tout le `localStorage` relu) |
| Serveur : empreintes seulement | `phone.ts` (HMAC-SHA256 + poivre ; scrypt + sel + poivre) | `tests/phone-server.test.ts` ; émulateur « empreintes seulement » ; e2e « serveur : empreintes seulement » |
| 5bis.4 Slogan « Mieux gérer, mieux prévoir, mieux vivre » (EN « Manage better, plan better, live better ») ; autres textes de TEXTES.md tels quels ; marque via `{app}` | `i18n/fr.ts`, `en.ts`, `(auth)/welcome.tsx` | `tests/phone-screens.test.ts` (valeurs exactes de TEXTES.md, aucun « DineroX » en dur) ; e2e « slogan validé » |
| 5bis.5a SMS seulement vers les indicatifs des pays de `core/countries.ts` ; sinon refus SANS envoi | `core/phone.ts › smsDialCodes/smsAllowed`, `phoneStart` | `tests/phone.test.ts` (liste blanche = pays proposés, +1/+7/+86/+880 refusés) ; émulateur « indicatif hors liste (+1) par SMS : refusé, AUCUN envoi » |
| 5bis.5b Code secret changé → alerte aux appareils connectés et à l'e-mail du compte, SANS le code | `alertSecretChanged` (push + e-mail) | émulateur « alertes push + e-mail sans code » ; e2e « alerte envoyée à l'e-mail du compte », « alerte : jamais le code » |

## 2. Étapes 1 à 9 (PROPOSITION.md §7)

| # | Étape | Preuve |
|---|---|---|
| 1 | `src/core/phone.ts` (pur) | `tests/phone.test.ts` — 15 tests |
| 2 | Règles des collections fermées (`phoneAuth`, `phoneSecrets`, `phoneGuard`, `phoneDevices`, `phoneIndex`, `phoneOutbox`) | `tests/phone-rules.test.ts` (6) + `npm run test:rules` (« aucune donnée accessible à un client ») |
| 3 | `phoneStart` | émulateur : limites, plafond, 5a, App Check |
| 4 | `phoneVerify` | émulateur : 10 min, usage unique, 5 essais |
| 5 | `phoneSetSecret` | émulateur : empreintes, numéro déjà inscrit (`existing`), `phone/taken` |
| 6 | `phoneSignIn` | émulateur : blocage, même temps de calcul |
| 7 | Nouveau téléphone | émulateur « appareil inconnu → code requis » ; e2e « nouveau téléphone » |
| 8 | « Ajouter mon numéro » (compte e-mail) | émulateur « même uid, profil intact, e-mail toujours possible » ; e2e « numéro ajouté au MÊME compte », « connexion par e-mail toujours possible » |
| 9 | Écrans + `e2e/phone-auth.js` + `forms-audit` | `tests/phone-screens.test.ts`, `tests/phone-errors.test.ts` ; `e2e/phone-auth.js` (26/26) ; `forms-audit.js` contrôle `/phone` et `/settings/add-phone` |

## 3. Vérifications finales

Mise à jour du 23/10, après la bienvenue d'origine et les libellés clairs (§7 bis) :

| Vérification | Résultat |
|---|---|
| `npm run check` (types, lint, tests) | vert — lint à zéro, 120 fichiers, 1 859 tests |
| e2e complet (`e2e/run-all.sh`, 34 parcours) | 34 / 34 verts (code de sortie 0, aucun « ✗ ») ; `phone-auth` 36 / 36 ; `forms-audit` 140 / 140 |
| Preuves « maquette \| application » (`e2e/captures-phone.js`) | refaites ; `preuves/01-bienvenue-v2-clair.png` |

Règles et Functions non modifiées depuis la mise à jour précédente (ci-dessous).

Mise à jour précédente du 23/10 (après la fusion de design-pro, le correctif de sécurité et les retouches) :

| Vérification | Résultat |
|---|---|
| `npm run check` (types, lint, tests) | vert — lint à zéro, 120 fichiers, 1 857 tests |
| `npm run test:rules` (JDK 21) | 73 / 73 |
| `npm --prefix firebase/functions run typecheck` | zéro erreur |
| `npm run test:functions` (vraies fonctions sur émulateurs) | 5 fichiers, 55 / 55, deux fois de suite (dont 21 pour le téléphone) |
| e2e complet (`e2e/run-all.sh`, 34 parcours, dont `phone-auth.js`) | 34 / 34 verts (code de sortie 0, aucun « ✗ ») ; `forms-audit` 140 / 140 ; `phone-auth` 29 / 29 ; `coach-open` : « cloche = À lire · N » |

Correction : le premier compte rendu annonçait 35 parcours ; le lanceur en contient 34.

Deux causes trouvées pendant le premier e2e (corrigées, pas « instable ») :

1. **Messages d'erreur génériques sur les écrans** : le SDK web ajoute le statut HTTP au message
   (`phone/wrong-secret [403]`), et `phoneErrorOf` ne reconnaissait pas le refus. Le test
   `tests/phone-errors.test.ts` a échoué d'abord (2 échecs), puis passe une fois le refus extrait.
2. **`multi-users.js` et `suspended.js`** cherchaient l'ancien lien « J'ai déjà un compte » de la
   bienvenue. Ils utilisent maintenant « J’ai un compte e-mail » ; `multi-users.js` relancé, vert.

## 4. Décisions du fondateur sur les écarts (22/10)

| Point | Décision |
|---|---|
| Thème avant connexion | Comportement actuel gardé : clair. Seul l'écran 8 (connecté) a une preuve sombre. |
| App Check en production | Branché le jour de l'activation (Play Integrity, nouvelle APK) ; rien à faire maintenant. Le serveur l'exige déjà. |
| Alerte « code secret changé » | Notification sur les téléphones dès maintenant (canal Expo existant) ; l'e-mail reste derrière son interface (fournisseur simulé), branché à l'activation. |
| Écarts visuels (numéro en deux blocs, pavé de l'application, photo sous le voile vert) | Acceptés. |
| 6 textes ajoutés (`phone.number.haveAccount`, `phone.number.choose`, `phone.err.smsCountry`, `phone.err.tooSoon`, `phone.err.unavailable`, `phone.err.codeTooMany`) | Validés tels quels. |

Rappels sans décision à prendre : un numéro déjà inscrit ne révèle rien avant le code (après le
code, nouveau code secret, même compte, alerte 5b) ; les parcours e2e d'inscription e-mail vont
directement sur `/sign-up`.

## 5. Sécurité : essais et tickets en parallèle (relecture de l'assistant)

| Défaut | Correctif | Preuve (rouge d'abord, puis vert) |
|---|---|---|
| `phoneSignIn` : des essais envoyés EN PARALLÈLE passaient tous le contrôle du blocage avant qu'un échec soit compté (plus de 5 essais possibles) | L'essai est RÉSERVÉ dans une transaction AVANT de vérifier le code secret (refus si bloqué, échec compté d'avance) ; remis à zéro en cas de succès | émulateur « 20 essais EN PARALLÈLE : au plus 5 vérifiés, puis bloqué » : avant, blocage de niveau 4 (24 h) après une seule rafale ; après, niveau 1, ≤ 4 « incorrect », le reste « bloqué » |
| Ticket de `phoneSetSecret` lu puis marqué « utilisé » plus tard : deux appels simultanés pouvaient s'en servir | `claimTicket` : lu ET marqué « utilisé » dans la même transaction ; le code secret est contrôlé AVANT (un code trop simple ne consomme pas le ticket) | émulateur « 6 phoneSetSecret simultanés avec le même ticket : un seul réussit » : avant, 4 réussites sur 6 |
| Ticket de nouveau téléphone (`phoneSignIn`) : même défaut | `claimTicket(…, ['device'], numéro)` : réservé en transaction, pour le MÊME numéro | émulateur « 6 appels simultanés : 1 réussit, 5 expirés, un seul appareil ajouté » : avant, 3 réussites sur 6 |

Pour être honnête sur le « rouge d'abord » : ces courses dépendent du minutage. Le défaut du
ticket de nouveau téléphone est apparu à une exécution, puis n'est pas apparu à la suivante, avant
le correctif. Pour `phoneSetSecret`, il a fallu préchauffer l'émulateur (6 appels refusés) :
sinon il traite les appels d'une même fonction l'un après l'autre. Après le correctif, la suite
complète des Functions est passée deux fois de suite.

## 6. Retouches visuelles (22/10)

| Retouche | Preuve |
|---|---|
| Bienvenue : « J’ai un compte e-mail » en bouton BLANC avec contour (nouvelle variante `outline` du bouton : surface, bordure, texte foncé) | `tests/phone-screens.test.ts` (rouge puis vert) ; e2e « bouton e-mail blanc avec contour » ; `preuves/01-bienvenue-clair.png` |
| « Bon retour ! » : numéro masqué sur UNE ligne (espaces insécables), « Code secret oublié ? » et « J’ai un compte e-mail » côte à côte | `tests/phone-screens.test.ts` (rouge puis vert) ; e2e « numéro masqué sur une ligne », « côte à côte » ; `preuves/05-connexion-clair.png`, `preuves/10-erreur-trop-essais-clair.png` |

## 7 bis. Écran de bienvenue d'origine et libellés clairs (fondateur, 23/10, DECISIONS.md §5ter)

Maquette : `maquettes/01-bienvenue-v2-clair.png` (copiée à l'identique depuis la branche du
fondateur, même empreinte git). Preuve : `preuves/01-bienvenue-v2-clair.png` (remplace
`01-bienvenue-clair.png`, l'ancienne carte verte flottante).

| Décision | Où | Preuve (rouge d'abord, puis vert) |
|---|---|---|
| Bienvenue de design-pro rétablie : photo plein écran, fondu `FADE`, logo, « DineroX », slogan, accroche, panneau clair, mention, version ; aucune carte flottante | `src/app/(auth)/welcome.tsx` | `tests/phone-screens.test.ts` : le fichier est IDENTIQUE à `origin/design-pro` hors du bloc des boutons ; `tests/photos.test.ts` vert ; e2e « accueil d’origine : slogan, accroche, mention », « photo sous le fondu vert » |
| Panneau : « S’inscrire avec mon numéro » → `/phone`, « Se connecter » → `/phone?start=signin`, « S’inscrire avec mon e-mail » → `/sign-up` ; démonstration et « sur ce téléphone » inchangés | idem | test (libellés, routes, ordre) ; e2e « panneau : … dans cet ordre », « S’inscrire avec mon e-mail ouvre l’inscription e-mail » |
| « J’ai déjà un compte » → « Se connecter » ; « J’ai un compte e-mail » → « Se connecter avec mon e-mail » | `PhoneFlow.tsx` | test ; e2e « inscription : … devient Se connecter », « côte à côte » |
| Titre « Se connecter » quand le numéro n'est pas connu sur ce téléphone ; « Bon retour ! » sinon (le lien e-mail est aussi sur l'écran du numéro) | `PhoneFlow.tsx` (`remembered`, `known`) | test ; e2e « numéro inconnu sur ce téléphone : titre Se connecter », « numéro retenu : Bon retour ! » |
| Nouvelles clés FR + EN, aucune supprimée | `phone.welcome.signupNumber`, `phone.welcome.signin`, `phone.welcome.signupEmail`, `phone.signin.withEmail` | test « nouvelles clés FR + EN ; aucune clé supprimée » |

Parcours e2e adaptés aux nouveaux libellés : `phone-auth.js`, `multi-users.js`, `suspended.js`,
`install-origin.js`, `forms-audit.js`, `captures-phone.js`.

Trois écarts restaient avec la maquette ; le fondateur les a tranchés (§7 ter).

## 7 ter. Les trois écarts tranchés (fondateur, 23/10)

| Décision | Où | Preuve (rouge d'abord, puis vert) |
|---|---|---|
| 1. « S’inscrire avec mon e-mail » en lien VERT (couleur de la marque), 48 dp ; « Tester sans données » et « Utiliser sur ce téléphone uniquement » gardent le style d'origine | nouvelle variante `link` du bouton (`components/ui/Button.tsx`, les deux rendus) ; `welcome.tsx` (bloc des boutons seulement, le reste toujours identique à design-pro) | `tests/phone-screens.test.ts` « écarts tranchés › 1 » ; e2e « lien vert (couleur = fond du bouton principal), démonstration inchangée, 48 px » ; `preuves/01-bienvenue-v2-clair.png` |
| 2. « Code secret oublié ? » et « Se connecter avec mon e-mail » l'un SOUS l'autre, centrés, chacun sur une ligne, 48 dp | `PhoneFlow.tsx` › `SignInStep` (« Bon retour ! » et « Se connecter ») | test « › 2 » ; e2e « l’un sous l’autre, centrés », « chaque lien sur une ligne, 48 dp (48 et 48 px) » ; `preuves/05-connexion-clair.png`, `preuves/10-erreur-trop-essais-clair.png` |
| 3. Écran du numéro en mode CONNEXION seulement : titre « Se connecter », texte « Entrez le numéro de votre compte, puis votre code secret. », bouton « Continuer » ; aucune mention de WhatsApp ; l'inscription ne change pas | `PhoneFlow.tsx` › `NumberStep` ; clés `phone.number.signinTitle`, `phone.number.signinBody`, `phone.number.signinCta` (FR + EN), aucune supprimée | test « › 3 » ; e2e « connexion, écran du numéro : … bouton Continuer, aucune mention de WhatsApp » |

Vérifications : `npm run check` vert (lint à zéro, 120 fichiers, 1 862 tests) ; `phone-auth`
39 / 39 ; `forms-audit` 140 / 140 ; `multi-users`, `suspended`, `install-origin`, `layout-audit`
verts ; preuves refaites par `e2e/captures-phone.js` (toutes régénérées : seules 01, 05 et 10
changent sur le fond, les autres ne diffèrent que par le numéro tiré au hasard). Parcours e2e
adaptés : `phone-auth.js`, `captures-phone.js` (« Continuer avec mon numéro » → « Continuer »).

## 7. Branche design-pro (fusionnée ici)

Barre du bas comme la maquette et cloche = « À lire · N » : voir
`docs/design-pro/barre-du-bas/README.md` (commit 720c3d9 sur design-pro, poussé, puis fusionné
dans connexion-telephone par un merge).
