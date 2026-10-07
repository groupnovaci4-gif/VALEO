# Lot A — Saisie sans effort et « reste par jour » (1.5.0)

Rapport de fin de Lot A. Lot B (coach) : voir [`lot-b.md`](lot-b.md).

## Écarts avec le relevé de la mission (le dépôt fait foi)

- Le **Lot B est déjà livré** sur cette branche (coach 1.5.0 : seuils
  85/100/dépassement, moteur d'événements, voix de sortie `expo-speech` et
  premium `speak`, sons `expo-audio`, vibrations, récompenses, score, conseils
  et bouton « Écouter » — voir `docs/coach.md`). Restent à faire au Lot B : la
  récompense « saisie régulière » (20 jours de saisie dans le mois).
- `app.config.ts` était déjà en **1.5.0** ; `expo-haptics`, `expo-speech`,
  `expo-audio` déjà installés. Le `versionCode` Android est géré par EAS
  (`appVersionSource: remote`, `autoIncrement` sur les profils `apk` et
  `production`) : il s'incrémente à chaque build, il n'est pas écrit dans le code.
- L'onglet **Assistant** n'était déjà plus dans la barre (`href: null`).
- `envelopeLevel` renvoie déjà `ok | warning | reached | critical`.
- Les **phases 2 et 3** partagent la même feuille de saisie et la même carte
  de confirmation : livrées dans un même commit, vérifiées ensemble.

## Ce qui est fait

| Phase | Contenu |
|---|---|
| 0 | Barre `Accueil · Budget · 🎤 · Objectifs · Plus` ; micro central surélevé (appui : voix, appui long : clavier). « Opérations » devient l'**Historique** à la même URL `/transactions` (filtres, recherche, groupes par jour, modification, suppression conservés) + mois, compte, catégorie, total de la période, suppression par appui long (avec confirmation), « Annuler » 5 s. Assistant à `/assistant` (écran de pile). Accès : accueil, toast « Voir », « Plus » (en tête), fiche compte, fiche enveloppe. |
| 1 | `core/dailyAllowance.ts` ; accueil : « Il vous reste X par jour jusqu'au … » en haut, bulle « Dites-moi ce que vous avez dépensé ou reçu », 5 dernières opérations, puis tous les blocs existants. Démarrage rapide (revenu, jour de paie, 3 charges fixes en récurrences, aperçu immédiat) ajouté à l'onboarding. |
| 2 | Saisie rapide : pavé numérique → catégorie récente → enregistré (3 gestes), compte = dernier utilisé ; « Plus de détails » → formulaire complet inchangé ; phrase écrite (même parseur que la voix). |
| 3 | `expo-speech-recognition` 57.1 ; `core/entry/parse.ts` (multi-opérations, montants en chiffres et en lettres, dates relatives, compte cité, sens) ; vocabulaire local `core/entry/vocabulary.json` (unités argotiques **inactives**) ; carte de confirmation obligatoire ; questions → assistant, doute → « opération ou question ? » ; limite gratuite 5 saisies vocales / jour (`voice_entry_unlimited` en Plus et Famille). |
| 4 | Rappel du soir (20 h par défaut, heure réglable), aucun le jour d'une saisie, hebdomadaire après 7 jours sans saisie ; la notification ouvre la saisie vocale (`dinerox://entry?mode=voice`). Réglages « Saisie » : rappel, heure, méthode par défaut, langue, reconnaissance sur l'appareil, exemples, « Tester le micro ». |
| 5 | Événements `entry_created`, `voice_entry_corrected`, `voice_entry_failed`, `daily_reminder_opened`, `history_opened`, `mic_routed` (liste blanche : jamais de montant, texte, bénéficiaire ni catégorie) ; vue agrégée dans l'écran d'administration (part de chaque méthode, taux de correction vocale). |

## Ce qui a réellement été testé, et comment

- **Tests unitaires (Vitest)** — calculs et logique purs : reste par jour
  (milieu de mois, dernier jour, déficit, sans revenu, revenu déclaré,
  récurrences mensuelles et hebdomadaires, objectifs, autre devise),
  démarrage rapide, Historique (mois, filtres, totaux par devise), parseur
  (**tout le tableau de la mission** + nombres en lettres, unités collées,
  dates, compte cité, propagation date/compte vers les opérations
  suivantes, unité argotique non devinée, devise à décimales), rappel du soir
  (jour déjà saisi, heure passée, passage en hebdomadaire), statistiques
  d'usage, liste blanche des événements, formules (non-régression incluse).
- **Règles Firestore** sur l'émulateur (inchangées, 30 tests).
- **Parcours de bout en bout** sur l'application web exportée + émulateurs
  Firebase (Playwright), 14 suites, dont 5 nouvelles :
  `lot-a-nav` (barre, Historique, liens), `lot-a-home` (accueil, calcul
  affiché recoupé, démarrage rapide sur un vrai compte), `lot-a-entry`
  (pavé, phrase, voix, carte, routage, erreurs, limite gratuite sur un vrai
  compte, « Annuler »), `lot-a-reminder` (lien profond, réglages,
  « Tester le micro »), `lot-a-usage` (événements réellement émis, sans contenu).
  La **reconnaissance vocale y est SIMULÉE** (le navigateur de test n'a pas
  de micro) : on vérifie tout ce qui suit la transcription, pas la
  reconnaissance elle-même.
- **Statistiques d'administration** : la fonction de comptage du serveur
  (compilée) exécutée contre l'émulateur Firestore.
- **Export Android** (`npx expo export --platform android`) et compilation
  des Cloud Functions à chaque phase.

## Ce qui n'a PAS été testé

- **Reconnaissance vocale réelle** sur un téléphone : qualité en français
  ivoirien, accents, bruit (marché, maquis, taxi), mots locaux (woro-woro,
  gbaka, attiéké, placali), reconnaissance hors ligne sur l'appareil.
- **Build natif Android/iOS** (aucun SDK Android dans cet environnement) :
  plugin `expo-speech-recognition`, permission micro système, rendu du bouton
  central surélevé sur Android (Fabric), clavier dans la feuille.
- **Notifications réelles** du rappel du soir (programmation native), tap sur
  la notification au démarrage à froid sur téléphone.
- `adminStats` déployé (les requêtes de comptage n'ont tourné que sur
  l'émulateur, qui n'exige aucun index).
- Performances sur un téléphone d'entrée de gamme.

## Tests à faire sur un téléphone Android d'entrée de gamme

1. Installer le build 1.5.0 (nouveau build natif obligatoire).
2. Premier appui sur le micro : phrase d'explication, puis demande du système.
   Refuser : la phrase écrite doit rester utilisable. Réautoriser dans les
   réglages du téléphone, recommencer.
3. Dicter au calme : « Taxi 2 000 » → carte → « Tout valider » → toast
   « Enregistré ✓ — il vous reste … par jour » → « Annuler » (5 s).
4. Plusieurs opérations : « Ce matin taxi 1 000, garba 500, crédit 1 000 ».
5. Nombres en lettres : « Deux mille cinq cents pour l'alloco » ;
   « J'ai reçu 250 mille de salaire ».
6. Mots locaux : « Woro-woro 300 et gbaka 200 », « attiéké 500 »,
   « placali 1 000 », « tontine 10 000 ».
7. Bruit : au marché, dans un taxi. Noter les erreurs de transcription.
8. Mode avion : la dictée fonctionne-t-elle ? Tester l'option
   « Reconnaissance uniquement sur le téléphone ».
9. Silence : « Je n'ai rien entendu » ; rien n'est enregistré.
10. Le coach parle (dépassement d'enveloppe) puis appui sur le micro : la voix
    du coach doit s'arrêter.
11. Compte gratuit : 6e saisie vocale du jour refusée, clavier et phrase OK.
12. Saisie rapide en 3 gestes (appui long sur le micro → montant → catégorie).
13. Rappel du soir : ne rien saisir → notification à l'heure choisie → la
    toucher ouvre la dictée ; un autre jour, saisir avant l'heure → aucune
    notification ; changer l'heure.
14. Bouton retour Android depuis l'Historique et l'assistant ; liens
    `dinerox://transactions`, `dinerox://assistant`, `dinerox://entry?mode=voice`.
15. Bouton central : pas coupé, accessible au pouce ; la feuille de saisie et
    son clavier ne masquent pas le champ « Écrivez comme vous parlez ».
16. Démarrage rapide avec un nouveau compte : le reste par jour affiché à la
    fin est le même que sur l'accueil.
17. Temps d'ouverture de la feuille et de la carte sur un téléphone lent.
18. Application en anglais : textes, dictée en-US.

## Builds (EAS)

Nouveau build natif obligatoire (nouveau module `expo-speech-recognition`,
permission micro) — une mise à jour OTA ne suffit pas.

```bash
npx eas-cli build --platform android --profile development   # build de développement
npx eas-cli build --platform android --profile apk           # APK de test (versionCode auto-incrémenté)
npx eas-cli build --platform all --profile production        # production
```

Côté serveur (facultatif pour tester le Lot A, nécessaire pour la vue
d'administration) : `npx firebase deploy --only functions:adminStats --project dinerox-app`.
