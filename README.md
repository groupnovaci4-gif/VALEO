# VALEO

Application de gestion pour coopératives agricoles de Côte d'Ivoire
(cacao, café, anacarde, hévéa). Expo / React Native + FastAPI.

---

## ⚠️ La branche de travail est `develop`, pas `main`

`main` est la branche par défaut du dépôt : **`git clone` y atterrit**, et elle
a plusieurs dizaines de commits de retard. Elle ne contient ni la vérification
des livraisons, ni le cloisonnement des dépenses, ni les avances par créancier,
ni l'espace admin synchronisé, ni le diagnostic de connexion, ni rien de la
migration Firebase.

Après un clone :

```bash
git checkout develop
```

Vérifiez toujours avant de travailler :

```bash
git branch --show-current      # doit afficher : develop
git log --oneline -1
```

Un correctif écrit sur `main` sera écrit contre du code qui n'existe plus.

---

## Par où commencer

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | **Le document de référence** : architecture, invariants métier, conventions. À lire avant toute modification. |
| `docs/MIGRATION-FIREBASE.md` | La migration vers Firebase, phase par phase, et la marche à suivre pour la bascule. |

## Commandes

```bash
# Frontend
cd frontend && yarn install     # ⚠️ yarn, PAS npm (cf. packageManager dans package.json)
yarn test                       # modules purs
npx tsc --noEmit -p tsconfig.json
yarn build:web                  # site pour Firebase Hosting

# Backend
cd backend
pip install -r requirements-dev.txt   # ⚠️ PAS requirements.txt : il ne s'installe pas
pytest                                # doit afficher ~489 passed, PAS « skipped »
uvicorn server:app --reload
```
