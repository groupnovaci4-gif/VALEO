# Base des localités — Côte d'Ivoire

Sélection structurée de la localisation (coopérative et planteur) :
**District → Région → Département / Ville → Sous-préfecture → Village**.

| Fichier | Rôle |
|---|---|
| `ci-decoupage.csv` | **Source éditable** de la base. Une ligne = une localité feuille. |
| `ci-geo.json` | **Généré** par `yarn geo:build`. Consommé par l'application. Ne jamais l'éditer à la main. |
| `../geo.ts` | Accès : cascade, recherche, rapprochement des anciennes saisies. |
| `../../../scripts/import-geo.mjs` | Convertit un CSV en `ci-geo.json`. |

## Contenu actuel

| Niveau | Renseigné |
|---|---|
| District | ✅ 14 (dont 2 districts autonomes) |
| Région | ✅ 33 (31 régions + 2 entrées miroir pour Abidjan et Yamoussoukro, qui n'ont pas ce niveau) |
| Département / Ville | ✅ 108 |
| Sous-préfecture | ❌ à importer |
| Village / Localité | ❌ à importer |

Source : découpage administratif issu de la réforme de 2011-2012. Les
sous-préfectures (~500) et les villages (plusieurs milliers) **ne sont pas
inclus** : ils doivent venir d'une base officielle, pas d'une saisie
approximative.

Tant que le niveau village est vide, ce dernier champ reste en **saisie libre**,
signalée à l'écran et marquée `villageLibre: true` sur la fiche — ce qui permet
de la rapprocher automatiquement de la localité officielle après l'import, sans
perdre aucune donnée existante. Dès que la base contient des villages, le champ
devient une liste déroulante et la saisie libre disparaît.

## Charger une base complète

1. Obtenir une base officielle (INS / RGPH Côte d'Ivoire, GeoNames, HDX…).
2. L'exporter en CSV à cinq colonnes, en-tête compris :

   ```csv
   district,region,departement,sousPrefecture,village
   Lagunes,Agnéby-Tiassa,Sikensi,Sikensi,Gomon
   Lagunes,Agnéby-Tiassa,Sikensi,Sikensi,Bécédi-Brignan
   ```

   Les colonnes de droite peuvent être vides : la ligne s'arrête alors au
   dernier niveau renseigné. Les doublons sont fusionnés automatiquement.

3. Lancer l'import :

   ```bash
   cd frontend
   node scripts/import-geo.mjs /chemin/base-officielle.csv --source "INS Côte d'Ivoire 2021"
   ```

   Ou, pour régénérer depuis le CSV du dépôt : `yarn geo:build`.

4. Vérifier : `yarn test` (les tests contrôlent la cohérence des parents,
   l'unicité des identifiants et le fonctionnement de la cascade).

Aucun code applicatif n'est à modifier : l'application lit le JSON produit.

## Stabilité des identifiants

Les identifiants sont dérivés du nom **et de celui de ses parents**
(`DP-lagunes-agneby-tiassa-sikensi`). Deux conséquences :

- deux villages homonymes dans deux départements différents restent distincts ;
- réimporter la même base produit les mêmes identifiants, donc les fiches déjà
  enregistrées restent valides.

Renommer une localité dans la base change son identifiant : les fiches
existantes conservent alors le nom enregistré (jamais effacé) et devront être
rapprochées. Préférer un import additif à un renommage.

## Exploitation ultérieure

Chaque fiche stocke l'identifiant **et** le nom de chaque niveau
(`districtId`/`district`, `regionId`/`region`…). Les regroupements fiables
(planteurs par région, volumes par zone, avances par village) sont donc
possibles sans dépendre de l'orthographe. Ces statistiques ne sont pas encore
développées : la structure les rend seulement possibles.
