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

| Vérification | Résultat |
|---|---|
| `npm run check` (types, lint, tests) | vert — lint à zéro, 118 fichiers, 1 848 tests |
| `npm run test:rules` (JDK 21) | 73 / 73 |
| `npm --prefix firebase/functions run typecheck` | zéro erreur |
| `npm run test:functions` (vraies fonctions sur émulateurs) | 5 fichiers, 52 / 52 (dont 18 pour le téléphone) |
| e2e complet (`e2e/run-all.sh`, 35 parcours, dont `phone-auth.js`) | 35 / 35 verts ; `forms-audit` 140 / 140 (dont `/phone` et `/settings/add-phone`) ; `phone-auth` 26 / 26 |

Deux causes trouvées pendant le e2e (corrigées, pas « instable ») :

1. **Messages d'erreur génériques sur les écrans** : le SDK web ajoute le statut HTTP au message
   (`phone/wrong-secret [403]`), et `phoneErrorOf` ne reconnaissait pas le refus. Le test
   `tests/phone-errors.test.ts` a échoué d'abord (2 échecs), puis passe une fois le refus extrait.
2. **`multi-users.js` et `suspended.js`** cherchaient l'ancien lien « J'ai déjà un compte » de la
   bienvenue. Ils utilisent maintenant « J’ai un compte e-mail » ; `multi-users.js` relancé, vert.

## 4. Écarts à valider

1. **App Check en production** : le serveur l'exige déjà. L'application ne fournit un jeton qu'en
   mode émulateur (jeton de test). En production, il faudra le fournisseur natif Play Integrity
   (nouvelle APK) **avant** d'activer ces fonctions — sinon tout appel serait refusé.
2. **Alerte par e-mail** : aucun fournisseur d'e-mail en production pour l'instant. Le fournisseur
   simulé l'écrit dans `phoneOutbox` ; hors émulateur, l'alerte e-mail est seulement journalisée
   (sans adresse ni code). Le push passe par le canal Expo existant.
3. **Bienvenue (maquette 1)** : la photo est gardée sous un voile vert plein, car
   `tests/photos.test.ts` l'exige. « Créer mon compte » (e-mail) n'est plus sur la bienvenue
   (maquette) : l'inscription e-mail reste accessible par « J’ai un compte e-mail » →
   « Pas encore de compte ? ».
4. **Code reçu (maquette 3)** : pavé de l'application au lieu du clavier du système, car la règle
   15 n'autorise que `Field` comme champ de saisie (même pavé que le code secret).
5. **Textes ajoutés, à valider** (absents de TEXTES.md) : `phone.number.haveAccount`
   (« J’ai déjà un compte »), `phone.number.choose`, `phone.err.smsCountry`, `phone.err.tooSoon`,
   `phone.err.unavailable`, `phone.err.codeTooMany`.
6. **Numéro déjà inscrit à l'inscription** : rien n'est révélé avant le code ; après le code, la
   personne choisit un nouveau code secret (même compte) et l'alerte 5b part.
7. **Thème sombre avant connexion** : l'application suit la préférence du PROFIL ; sans session,
   elle est toujours claire (`_layout.tsx`, comportement existant, inchangé ici). Les maquettes
   sombres 1 à 7 et 9 à 12 ne peuvent donc pas être reproduites ; seul l'écran 8 (connecté) a sa
   preuve sombre. Pour suivre le thème du téléphone avant connexion, il faudrait modifier ce
   comportement : décision à prendre.
8. **Écarts visuels mineurs** (images `preuves/`) : le champ du numéro est en deux blocs
   (indicatif + `Field`, règle 15) au lieu d'un seul cadre, et le numéro n'est pas regroupé par
   paires pendant la saisie ; les mots en gras des bandeaux (« mêmes données, même abonnement »)
   sont en texte normal ; l'étiquette « Numéro de téléphone » est au-dessus du seul champ ;
   la bienvenue affiche le vrai logo et le numéro de version.
9. **Parcours e2e existants** : la bienvenue ne propose plus « Créer mon compte » ; ils vont
   directement sur `/sign-up` (inscription e-mail inchangée).
