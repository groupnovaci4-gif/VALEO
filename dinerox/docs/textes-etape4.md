# Étape 4 — demande d'avis sur le store : nouveaux textes à valider

Statut : VALIDÉS par le fondateur le 2026-10-14, intégrés dans `src/i18n/fr.ts` et `src/i18n/en.ts`.
Format : `clé` — FR — EN. `{app}` = nom de marque (DineroX).

La fenêtre d'avis elle-même (étoiles + commentaire) est celle de Google Play
(et plus tard d'Apple) : son texte est écrit par Google / Apple, dans la langue
du téléphone. {app} n'y ajoute aucun texte, aucune question avant, aucun message après.

## Menu « Plus » › Application

Correction du fondateur : la ligne ouvre DIRECTEMENT la page {app} du Play Store
(plus tard de l'App Store), jamais la fenêtre de Google (qui peut ne rien
afficher à cause des quotas). Elle reste cachée tant que le réglage distant
`config/app/items/store` (`reviewMenu: true`) ne l'active pas.

- `more.review` — FR : « Donner mon avis sur {app} » — EN : « Rate {app} »
- `more.sub.review` — FR : « Votre note et votre commentaire sur le store » — EN : « Your rating and review on the store »

## Ce qui n'a volontairement AUCUN texte

- Aucune question « Vous aimez {app} ? » ni filtre avant la fenêtre (interdit par Google et Apple).
- Aucun remerciement, trophée, mois de Plus ou message lié à un avis (on ne sait d'ailleurs jamais si la personne a noté : Google et Apple ne le disent pas).
- Aucun message d'erreur : si le store n'est pas disponible, il ne se passe rien.
