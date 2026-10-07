# Lot A — Saisie sans effort et « reste par jour » (plan et suivi)

## Écarts avec le relevé de la mission (le dépôt fait foi)

- Le **Lot B est déjà livré** sur cette branche (coach 1.5.0 : seuils
  85/100/dépassement, moteur d'événements, voix de sortie `expo-speech` +
  premium `speak`, sons `expo-audio`, vibrations, récompenses, score, conseils
  et bouton « Écouter »). Seuls les écarts restants seront traités au Lot B.
- `app.config.ts` est déjà en **1.5.0** ; `expo-haptics`, `expo-speech`,
  `expo-audio` sont déjà dans `package.json`.
- L'onglet **Assistant** n'était déjà plus dans la barre (`href: null`) ; la
  barre actuelle est `Accueil | Opérations | Budget | Objectifs | Plus` avec un
  bouton flottant « + » (menu de saisie rapide).
- La saisie vocale avait été **préparée mais désactivée** (`services/speechInput.ts`,
  permission `RECORD_AUDIO` bloquée) : elle est activée dans ce lot.
- `envelopeLevel` renvoie déjà `ok | warning | reached | critical`.

## Plan par phase (fichiers réels)

| Phase | Fichiers |
|---|---|
| 0 — Barre + Historique | `app/(tabs)/_layout.tsx` (5 emplacements, micro central), `app/(tabs)/mic.tsx` (emplacement du micro), `app/transactions.tsx` et `app/assistant.tsx` (déplacés hors des onglets, mêmes URL), `core/history.ts` (filtres mois/catégorie, totaux — pur, testé), `components/ui/Toast.tsx` (actions « Annuler » / « Voir »), `features/rows.tsx` (appui long), `app/(tabs)/more.tsx` |
| 1 — Reste par jour | `core/dailyAllowance.ts` (pur, testé), `features/entry/DailyAllowanceCard.tsx`, `features/entry/EntryPrompt.tsx`, `app/(tabs)/index.tsx` (réordonné, rien retiré), `app/onboarding.tsx` (parcours rapide 60 s ajouté, parcours complet conservé), `core/types.ts` (`FinancialProfile.payday` optionnel) |
| 2 — Saisie rapide | `features/entry/EntrySheet.tsx` (pavé numérique, 6 catégories récentes, dernier compte, phrase écrite), `core/entry/recent.ts` (pur, testé) |
| 3 — Voix | `expo-speech-recognition` (57.1.0, alignée SDK 57, module Expo), `services/speechInput.ts` (fournisseur réel), `core/entry/parse.ts` + `core/entry/numbers.ts` (multi-opérations, nombres en lettres, dates, comptes, sens), `core/entry/vocabulary.json` (vocabulaire local, données), `features/entry/ConfirmCard.tsx`, `core/subscription.ts` (`voice_entry_unlimited`, limite `voiceEntriesPerDay`) |
| 4 — Rappel du soir | `core/entry/reminder.ts` (pur, testé), `services/notifications.ts`, `app/entry.tsx` (lien profond `dinerox://entry?mode=voice`), `app/settings/notifications.tsx` |
| 5 — Mesure | `services/analytics.ts` (nouveaux événements, propriétés sans contenu), `firebase/functions/src/index.ts` (`adminStats` agrégé), `app/admin.tsx` |
