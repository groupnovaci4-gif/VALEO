# Refonte finale — journal (consigne unique du fondateur, 2026-10-22)

Référence unique : `docs/design-pro-maquette-finale/` (branche `claude/admiring-ritchie-h611hm`),
`DECISIONS.md` sections A à I. Les numéros cités ci-dessous sont ceux de ce fichier.

| Étape | Décisions | Ce qui est fait | Preuve |
|---|---|---|---|
| 1 — Icônes et logos | A3, A5, A6 | `bonbonne_gaz` remplacée par le fichier du fondateur ; `coiffure`, `pig` (cochon de profil) et `cooking` ajoutées (1x, 2x, 3x) ; « Coiffure / beauté » = dessin du fondateur ; tête de cochon de face retirée (épargne = `pig` partout : compte d'épargne, ancienne catégorie, 🐷) ; `assets/operators/` = les 5 PNG du fondateur, sans retouche, dans une tuile blanche arrondie (image entière) ; générateur (`scripts/content-icons.mjs`) relancé, il embarque aussi les icônes du dictionnaire (`src/config/dictionnaire-icones.json`, copié tel quel) | `tests/etape5-icones-logos.test.ts` (7 tests, rouges puis verts, empreintes SHA-256 des fichiers du fondateur) ; `npm run check` : 1575 tests |
| 2 — Le libellé décide de l'icône | A4 | `src/config/dictionnaire-icones.json` (copie exacte, 50 entrées) ; `labelIconSlug` / `transactionIconSlug` (`src/components/ui/contentIconMap.ts`, module pur hors `src/core`) : libellé → objectif lié (nom puis icône) → sous-catégorie → catégorie → type (icône actuelle), sans majuscules ni accents, mot entier ; plusieurs mots-clés : le premier dans le libellé, puis le plus long (« recharge gaz » avant « recharge »). « Moto » = moto rouge, même pour un virement. Branché sur la ligne d'opération (`TransactionRow`, toutes les listes) | `tests/etape5-libelle-icone.test.ts` (41 tests dont 31 libellés, rouges puis verts) ; `npm run check` : 1616 tests |
