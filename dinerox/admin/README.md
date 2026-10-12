# Portail back-office

Site web séparé de l'application mobile (Vite + React). Il ne parle qu'à Firebase Auth et
aux Cloud Functions `bo…` : aucune lecture ni écriture Firestore. Conception :
[`docs/backoffice.md`](../docs/backoffice.md).

- Marque : lue dans `../src/config/brand.ts` (nom, couleurs, e-mail de support), jamais recopiée.
- Montants : `formatMoney` de l'app (`../src/core/money.ts`).
- Styles : jetons du design system v2 (copie, voir l'en-tête de `src/styles.css`).

## Voir le portail en local (émulateurs, données fictives)

```bash
cd dinerox
npm --prefix firebase/functions run build
# Clé de TEST des émulateurs (fichier ignoré par Git) — une seule fois :
printf 'BO_MFA_KEY=%s\nANTHROPIC_API_KEY=x\nELEVENLABS_API_KEY=x\n' "$(node -e "console.log(Buffer.alloc(32,7).toString('base64'))")" > firebase/functions/.secret.local
# Terminal 1 — émulateurs (Java 21 ou plus) :
npx firebase emulators:start --only auth,firestore,functions,storage --project demo-dinerox
# Terminal 2 — données fictives, puis le portail :
node admin/scripts/seed-emulators.mjs --reset
npm --prefix admin install
npm --prefix admin run dev:emulators     # → http://localhost:5175
```

Comptes de démonstration (mot de passe `Demo-Back-office-1`) :

| Rôle | Adresse | Code de double vérification |
|---|---|---|
| Super Admin | koffi@dinerox-demo.test | QR code à scanner à la 1re connexion (votre appli d'authentification) |
| Administrateur | clarisse@dinerox-demo.test | `node admin/scripts/demo-code.mjs clarisse@dinerox-demo.test` |
| Support | didier@dinerox-demo.test | `node admin/scripts/demo-code.mjs didier@dinerox-demo.test` |
| Analyste | awa@dinerox-demo.test | `node admin/scripts/demo-code.mjs awa@dinerox-demo.test` |

Les scripts refusent de viser autre chose qu'un projet d'émulation (`demo-…`).

## Tests

```bash
npm --prefix admin run check                       # types + tests unitaires du portail
# Bout en bout (émulateurs + portail lancés comme ci-dessus) :
PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node admin/e2e/portal.mjs /tmp/portail-captures
```

Le parcours de bout en bout vide puis remplit les émulateurs ; il produit des captures
(clair / sombre, ordinateur / tablette / téléphone) dans le dossier indiqué.

## Construire pour la production (pas de déploiement ici)

Variables (fichier `admin/.env.production.local`, ignoré par Git) : `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (configuration
web publique du projet). Puis `npm --prefix admin run build` → `admin/dist`. Déploiement :
voir `docs/backoffice.md` §16.
