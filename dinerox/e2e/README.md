# Tests de bout en bout (web)

Ils pilotent l'application réelle (export web) branchée sur les émulateurs
Firebase : inscription, **tous les formulaires**, enregistrements, réouverture,
reconnexion, et plusieurs comptes (même appareil et appareils simultanés).

`fieldcheck.js` vérifie chaque champ visible d'un écran : focus, focus stable,
saisie, effacement, modification, aucun remontage, et **structure du conteneur
inchangée au focus** (équivalent web de la règle Fabric qui faisait clignoter
les champs sur Android, voir CLAUDE.md §13).

## Lancer

```bash
# 1. Émulateurs
npx firebase emulators:start --only auth,firestore --project demo-dinerox
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
