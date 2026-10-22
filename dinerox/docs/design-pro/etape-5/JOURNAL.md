# Refonte finale — journal (consigne unique du fondateur, 2026-10-22)

Référence unique : `docs/design-pro-maquette-finale/` (branche `claude/admiring-ritchie-h611hm`),
`DECISIONS.md` sections A à I. Les numéros cités ci-dessous sont ceux de ce fichier.

| Étape | Décisions | Ce qui est fait | Preuve |
|---|---|---|---|
| 1 — Icônes et logos | A3, A5, A6 | `bonbonne_gaz` remplacée par le fichier du fondateur ; `coiffure`, `pig` (cochon de profil) et `cooking` ajoutées (1x, 2x, 3x) ; « Coiffure / beauté » = dessin du fondateur ; tête de cochon de face retirée (épargne = `pig` partout : compte d'épargne, ancienne catégorie, 🐷) ; `assets/operators/` = les 5 PNG du fondateur, sans retouche, dans une tuile blanche arrondie (image entière) ; générateur (`scripts/content-icons.mjs`) relancé, il embarque aussi les icônes du dictionnaire (`src/config/dictionnaire-icones.json`, copié tel quel) | `tests/etape5-icones-logos.test.ts` (7 tests, rouges puis verts, empreintes SHA-256 des fichiers du fondateur) ; `npm run check` : 1575 tests |
