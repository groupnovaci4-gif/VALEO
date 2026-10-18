# Tests de bout en bout (web)

Ils pilotent l'application réelle (export web) branchée sur les émulateurs
Firebase : inscription, **tous les formulaires**, enregistrements, réouverture,
reconnexion, et plusieurs comptes (même appareil et appareils simultanés).

`fieldcheck.js` vérifie chaque champ visible d'un écran : focus, focus stable,
saisie, effacement, modification, aucun remontage, et **structure du conteneur
inchangée au focus** (équivalent web de la règle Fabric qui faisait clignoter
les champs sur Android, voir CLAUDE.md §13).

Coach (1.5) : `coach-budget.js` (seuils et réaction immédiate),
`coach-open.js` (résumé à l'ouverture, déduplication), `coach-voice.js`
(voix, sons, quotas), `coach-rewards.js`, `coach-score.js`,
`coach-advice.js` (conseil du jour, boutons « Écouter », micro désactivé).
La synthèse vocale et les sons sont **espionnés** (`speechSynthesis.speak`,
`HTMLMediaElement.play`) : on vérifie ce qui serait lu ou joué, pas le son produit.

Objectifs : `goals-contribute.js` rejoue l'exemple du fondateur (voiture
1 000 000, versements datés depuis l'onglet Objectifs → 20 %, 30 %, 50 %, 90 %).

Parrainage (croissance, étape 1) : `referral.js` — code et lien, « Copier »,
lien `/i/{code}` ouvert sans compte (code prérempli à l'inscription), carte
« Votre semaine » du filleul, code saisi dans les réglages (erreurs claires),
semaine régulière validée par les VRAIES Cloud Functions, message « 1/5 » chez
la parraine, écran admin et mode ambassadeur, carte de l'accueil après 5 saisies.
Partage (étape 2) : `share.js` — « Partager sur WhatsApp » (message et lien
`src=whatsapp`), carte trophée sans nom ni montant partagée en image, ligne de la
chaîne WhatsApp selon l'adresse publiée ; WhatsApp et la feuille de partage sont
INTERCEPTÉS (rien ne part).
Avis sur le store (étape 4) : `store-review.js` — première ouverture retenue par
compte, « Objectif atteint » fermé puis Accueil sans aucune demande sur le web (pas
de fenêtre native), ligne « Donner mon avis » selon `config/app/items/store`, qui
ouvre directement la page Play (interceptée) et arrête les demandes automatiques.
Argent mis de côté (correctif, cercle fermé) : `savings-circle.js` — revenu 100 000 +
épargne 60 000 → reste par jour sur 40 000, « loyer avec l'épargne » → dépense sur un compte
courant + message, disponible sous zéro → message, carte de l'accueil, écran de retrait
prérempli ; personne sans argent renseigné : ni message ni carte.
Origine des installations (étape 5) : `install-origin.js` — lien `/a` → inscription →
la vraie fonction `recordSignupOrigin` compte (compteurs du jour), marqueur seul dans
le profil, second compte « inconnu », liens `/t/` et `/i/` (jamais le code), écran
admin regroupé (moins de 5 réunis sans nom), générateur de liens et copie.
Mise en page (correctif écrans) : `layout-audit.js` — chaque écran et feuille, en 320×568,
360×640, 360×800, 393×852, 412×915 et 430×932, avec barre de gestes (24/24), barre à
3 boutons (24/48) et encoche (48/24). Les marges sont SIMULÉES dans Chrome
(`Emulation.setSafeAreaInsetsOverride`, lues par l'application comme sur un téléphone) et
de fausses barres fixes captent le toucher. Échec si un élément interactif est sous une
barre système ou sous la barre d'onglets, recouvert, inatteignable après défilement, si
un texte est coupé ou si l'écran déborde horizontalement ; une capture par échec
(`<dossier>/layout/`). Écran de verrouillage : le stockage sécurisé, absent du web, est
remplacé dans le navigateur du test seulement.

Il exige l'émulateur **functions** (compilé avant : `npm --prefix firebase/functions run build`).

## Lancer

```bash
# 1. Émulateurs (functions : parrainage ; secrets fictifs créés par le script)
npm --prefix firebase/functions run build && node scripts/functions-test-secrets.mjs
npx firebase emulators:start --only auth,firestore,functions,storage --project demo-dinerox
# 2. Export web branché sur les émulateurs
EXPO_PUBLIC_FIREBASE_API_KEY=fake-api-key EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-dinerox \
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-dinerox.firebaseapp.com EXPO_PUBLIC_FIREBASE_APP_ID=1:1:web:1 \
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-dinerox.appspot.com EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 \
npx expo export --dev --platform web --output-dir dist-e2e
node e2e/serve.js dist-e2e 8098
# 3. Tests (navigateur : PW_CHROMIUM=/chemin/chrome, sinon celui de Playwright)
npm run e2e
```

Limite : le web ne reproduit pas tout le comportement natif (clavier Android,
fenêtres modales). Ces points restent à vérifier sur un téléphone.
