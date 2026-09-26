# `eas.json` — pourquoi ces profils, et pourquoi aucun commentaire dedans

## Ce fichier n'accepte AUCUNE clé hors schéma

`eas.json` portait un bloc `_commentaire` expliquant les profils. `eas-cli`
24.8.0 le **refuse** :

```
eas.json is not valid.
- "_commentaire" is not allowed
```

Les versions antérieures toléraient les clés inconnues à la racine ; celle-ci
valide strictement le schéma. Un commentaire dans ce fichier fait donc échouer
`eas build` **avant même la construction** — et rien d'autre ne le signale :
`npx tsc`, `yarn lint`, `yarn test` et `pytest` passent tous au vert, puisque le
fichier reste du JSON parfaitement valide.

D'où ce fichier-ci. Les seules clés permises à la racine sont `cli`, `build` et
`submit`, et un test (`TestConstructionEAS`) refuse désormais toute autre.

## Les quatre profils

| Profil | Sortie | Backend visé |
|---|---|---|
| `development` | APK avec client de dev | aucun (serveur local) |
| **`terrain`** | APK | l'instance de **test** gratuite (Render) |
| `preview` | APK | Cloud Run |
| `production` | **AAB** | Cloud Run |

**APK et AAB ne s'échangent pas.** Un AAB ne s'installe PAS à la main sur un
téléphone : c'est le format que Google Play réclame, et lui seul. Un APK, à
l'inverse, est refusé à la publication sur Play. Se tromper de profil ne
provoque aucune erreur à la construction — on s'en aperçoit un quart d'heure
plus tard, un fichier inutilisable à la main.

## Pourquoi `terrain` est séparé de `preview`

`EXPO_PUBLIC_BACKEND_URL` est **figée au build** (invariant 27) : Expo l'inline
dans le paquet. La changer côté serveur ne change rien à un APK déjà installé,
il faut reconstruire.

Si l'adresse de l'instance d'essai était collée dans `preview`, on livrerait un
jour un APK « partenaires » — ou une publication Play — parlant à un serveur de
test gratuit qui s'endort, avec des données de test. Rien ne le signalerait :
l'APK se construit, s'installe et affiche « Synchronisé ». Un profil nommé rend
la méprise visible à la commande, et un test
(`test_l_adresse_de_test_ne_fuit_PAS_dans_les_profils_livrables`) la refuse.

Cf. `docs/DEPLOIEMENT-SANS-CARTE.md` pour l'instance de test, et l'invariant 32
pour la bascule : `BACKEND_DEPRECIE` devra être posé sur l'instance `terrain`,
sans quoi un APK déjà installé écrira dans une base que plus personne ne lit,
en affichant « Synchronisé ».

## Le web ne figure pas ici

Le site garde `EXPO_PUBLIC_BACKEND_URL` **vide** : Firebase Hosting renvoie
`/api/**` vers Cloud Run, donc l'API est à la même origine (invariant 31).
