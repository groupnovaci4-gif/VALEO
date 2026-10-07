# Lot B — Coach financier (1.5.0)

Rapport de fin de Lot B. Fonctionnement détaillé du coach, secrets, coûts et
activation de la voix premium : [`coach.md`](coach.md).

## Écarts avec le relevé de la mission (le dépôt fait foi)

- L'essentiel du Lot B était **déjà livré** sur cette branche avant le
  Lot A (commits « DineroX coach — phase … ») : seuils 85 / 100 / dépassement
  et réaction immédiate dans `useActions`, moteur d'événements et
  `planDelivery`, `users/{uid}/coachEvents`, voix de l'appareil
  (`expo-speech`), voix premium (callable `speak`, ElevenLabs), sons
  (`expo-audio`), vibrations, récompenses, score, conseil du jour, bouton
  « Écouter », préférences `coach`, « Tester la voix ». Conformément à la
  consigne (« ignore ce qui est déjà en place »), ce lot ne refait rien de
  cela : il comble les manques relevés à l'audit.
- **Enveloppe à 0** : la mission demande « toute dépense est `critical` ».
  Une enveloppe à 0 que l'utilisateur n'a **jamais définie** (enveloppes de
  démarrage) ne déclenche rien (`hasDefinedBudget`), sinon chaque nouvel
  utilisateur recevrait de faux dépassements. Une enveloppe mise à 0
  volontairement suit la règle de la mission.
- **Phase conditionnelle « Coller un SMS »** : non réalisée (aucun exemple
  réel fourni), aucun format inventé.

## Ce qui a été ajouté dans ce lot

| Phase | Manque comblé |
|---|---|
| 7 | Événement positif **« catégorie en baisse »** (`core/coach/events.ts`, `categoryDown`) : mois clos d'au moins 10 opérations, catégorie présente au moins 2 des 3 mois précédents, baisse d'au moins 20 % par rapport à leur moyenne ; la plus forte baisse en valeur l'emporte ; l'épargne n'est pas une dépense « en baisse ». Message `coach.pos.category_down` (FR/EN), soumis à `planDelivery` et à la préférence « dépenses inhabituelles ». |
| 8 | **Micro et voix ne se chevauchent jamais** : `services/voice/micGate.ts` (état du micro). L'ouverture du micro coupe la voix en cours ; la file vocale refuse de parler et les sons se taisent tant que le micro est ouvert (`queue.ts`, `sounds.ts`, `speechInput.ts`). |
| 9 | Récompense **« Saisie régulière »** (`regular_entry`, `core/coach/rewards.ts`) : au moins 20 jours distincts avec une saisie dans le mois (date de création, pas date de l'opération : une saisie antidatée compte le jour où elle est faite), opérations récurrentes automatiques et supprimées exclues, mois d'au moins 10 opérations (anti-triche). |
| 9/10 | **Récompenses et score strictement personnels** : aucune récompense n'est attribuée depuis un espace familial ; l'écran du score, ouvert sur un espace familial, n'affiche aucun calcul et propose d'ouvrir l'espace personnel. |

## Ce qui a réellement été testé, et comment

- **Tests unitaires (Vitest)**, 361 au total, dont les nouveaux :
  catégorie en baisse (25 % → événement, 10 % → rien, moins de 10
  opérations → rien, épargne exclue) ; saisie régulière (20 jours → gagnée,
  19 jours → progression 0,95, saisies antidatées le même soir = 1 jour,
  récurrences exclues) ; la vraie file vocale ne parle pas micro ouvert, et
  l'ouverture du micro en pleine lecture l'arrête.
- **Règles Firestore** sur l'émulateur : 30 tests (inchangés, verts).
- **Parcours de bout en bout** (Playwright, export web + émulateurs), 15
  suites dont `lot-b.js` : « Saisie régulière » au catalogue avec sa règle ;
  score de l'espace personnel avec la mention obligatoire ; appui sur
  « Dicter une opération » pendant que la synthèse est espionnée → la voix
  est coupée ; fin d'écoute → carte de confirmation. La reconnaissance et la
  synthèse vocales y sont **SIMULÉES** (navigateur sans micro ni haut-parleur).
- **Export Android** (`npx expo export --platform android`) et compilation
  des Cloud Functions.

## Ce qui n'a PAS été testé

- **Voix réelle** de l'appareil (`expo-speech`), sons et vibrations sur
  téléphone ; enchaînement réel micro → coupure de la voix.
- **Voix premium déployée** : aucune clé ElevenLabs n'a été utilisée ; la
  fonction `speak` n'est testée que dans sa partie pure (validation, quota,
  requête construite).
- **Reformulation IA déployée** (`financeAssistant`).
- **Notifications** du coach en arrière-plan.
- **Écran du score sur un espace familial** : la logique est testée, l'écran
  n'est pas couvert par un parcours de bout en bout (il faut un compte Famille
  avec un espace partagé).
- **Build natif** Android / iOS.

## Tests à faire sur un téléphone

1. Enveloppe Alimentation à 10 000 : dépenser 8 500 → « Attention … 85 % » ;
   1 500 de plus → « entièrement utilisé » ; 500 de plus → dépassement.
   Une nouvelle dépense le même jour sans aggravation : aucun rappel.
2. Supprimer la dernière dépense → retour sous le seuil ; redépenser → l'alerte
   revient.
3. Voix : préférence « voix » activée, aucun montant prononcé par défaut ;
   « Écouter » lit le texte affiché, montants compris.
4. Pendant que le coach parle, appuyer sur le micro : la voix s'arrête
   immédiatement, aucun son pendant la dictée.
5. Application en arrière-plan pendant une alerte : aucune voix.
6. Quotas : au plus 1 voix par ouverture, 3 par jour (hors dépassement).
7. Mode silencieux du coach, fréquence « discret », « critiques seulement ».
8. Récompenses : écran « Mes récompenses » (depuis « Plus » et l'accueil),
   célébration (animation, son, voix si activée).
9. Score : « Pourquoi mon score a changé » ; espace familial → aucun score.
10. Voix premium (après activation, cf. `coach.md`) : compte Plus, coupure
    réseau → repli sur la voix de l'appareil en 5 s au plus.
11. Application en anglais : messages du coach et voix en-US.

## Mise en service

- Voix premium : secret `ELEVENLABS_API_KEY` (Functions uniquement), coûts et
  déploiement de `speak` : voir [`coach.md`](coach.md#voix-premium-elevenlabs--activation).
- Nouveau build natif obligatoire (modules natifs) :
  `npx eas-cli build --platform android --profile apk`.
