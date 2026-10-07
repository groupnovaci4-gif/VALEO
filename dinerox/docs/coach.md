# Coach financier DineroX (version 1.5.0)

Le coach réagit aux opérations que l'utilisateur **saisit lui-même** dans
DineroX. Il ne suit ni Orange Money, ni Wave, ni aucune banque : aucun compte
externe n'est connecté, et rien ne se passe « en temps réel » en dehors de
l'application. Chaque message renvoie à des chiffres calculés sur l'appareil à
partir des opérations enregistrées.

## Principe directeur

| Décision | Qui la prend |
|---|---|
| Seuils, pourcentages, montants, alertes | Code **déterministe** (`src/core/coach/`, testé) |
| Choix et rythme des messages (anti-sur-alerte) | `planDelivery` (`policy.ts`, pur, testé) |
| Récompenses et score | Règles déclaratives (`rewards.ts`, `score.ts`) |
| Reformulation d'un conseil (facultative) | IA générative, **sur demande**, à partir du texte déjà calculé |
| Lecture à voix haute | Voix de l'appareil, ou voix premium côté serveur |

Aucune décision d'alerte et aucun calcul ne sont confiés à une IA générative.
Rien ne dépend de Claude Code en production : l'IA éventuelle passe par la
Cloud Function `financeAssistant` (clé `ANTHROPIC_API_KEY`, côté serveur).

## Architecture

```
src/core/coach/          logique PURE (Vitest, sans React Native)
  envelopeAlerts.ts      seuils 85 % / 100 % / dépassement, mémoire de répétition
  events.ts              CoachEvent, priorités, événements positifs
  policy.ts              planDelivery : dédoublonnage, délais, quotas de voix
  prefs.ts               préférences `coach` + migration douce
  voice.ts               texte prononcé (sans montant par défaut, émojis retirés)
  rewards.ts             catalogue de récompenses + anti-triche
  score.ts               score de comportement (30/25/20/15/10)
  advice.ts              conseil du jour + question de reformulation (≤ 500 car.)
src/features/coach/      orchestration React
  bus.ts                 notifyCoachWrite (écritures) + présentateur
  CoachProvider.tsx      déclencheurs « écriture » et « ouverture »
  VoiceHost.tsx          sons, vibrations, voix ; coupe tout hors premier plan
  CoachSummaryCard, AdviceOfDay, ListenButton, RewardCelebration, RewardsTile
src/services/
  coachMemory.ts         mémoire locale par uid (storageKey)
  coachHistory.ts        users/{uid}/coachEvents (déduplication entre appareils)
  rewards.ts             users/{uid}/rewards
  voice/                 file vocale, voix appareil, voix premium, sons
  speechInput.ts         dictée (expo-speech-recognition), voir lot-a.md
firebase/functions/src/
  voice.ts               validation, requête ElevenLabs, quota (pur, testé)
  index.ts               callable `speak`
```

### Seuils d'enveloppe

`envelopeLevel` (`core/budget.ts`) : `warning` dès 85 %, `reached` à
exactement 100 %, `critical` au-delà. Une enveloppe à 0 que l'utilisateur n'a
jamais définie ne déclenche rien (`hasDefinedBudget`) : sans cela les
enveloppes de démarrage produiraient de faux dépassements. Les transferts
entre comptes ne touchent pas les enveloppes.

Réaction immédiate : toute écriture passant par `useActions()` appelle
`notifyCoachWrite` ; seule l'enveloppe touchée est réévaluée. Un même niveau
n'est annoncé qu'une fois par mois ; après un retour sous le seuil, il se
réarme ; un dépassement n'est rappelé (une fois par jour au plus) que s'il
**s'aggrave**.

### Anti-sur-alerte (`planDelivery`)

- priorité : critical > warning > celebration > advice > info ;
- jamais deux fois le même événement : identifiant déterministe mémorisé
  localement et dans `users/{uid}/coachEvents` (sans aucun montant) ;
- délai minimal par type : 24 h (discret), 12 h (normal), 4 h (actif) — sauf
  dépassement et réaction à l'action qui vient d'être faite ;
- à l'ouverture : un seul résumé (1, 3 ou 5 points selon la fréquence) ;
- voix : 1 par ouverture, 3 par jour hors dépassement, 1 félicitation par jour,
  jamais hors premier plan (`AppState`).

### Voix

File unique (`services/voice/queue.ts`) : jamais deux voix à la fois.
Micro et voix ne se chevauchent jamais (`services/voice/micGate.ts`) :
l'ouverture du micro coupe la voix, et ni voix ni son tant qu'il est ouvert.
Repli : **premium → voix de l'appareil → texte seul** (le texte est toujours
affiché). Délai de 5 s pour démarrer la voix premium.

Par défaut aucun montant n'est prononcé (`speakAmounts: false`) : la voix lit
une variante sans montant (`<clé>.voice`) ou une phrase générique. Le bouton
« Écouter » est une demande explicite : il lit **le texte affiché**, montants
compris (émojis retirés), sans action ni navigation.

## Voix premium (ElevenLabs) — activation

Désactivée tant que les trois conditions ne sont pas réunies :
préférence « Voix premium » + formule Plus ou Famille (`voice_premium`) +
compte en ligne. Sinon l'application utilise la voix de l'appareil.

1. Créer une clé API ElevenLabs (compte ElevenLabs du propriétaire du projet).
2. L'enregistrer **uniquement** dans les secrets Functions :
   ```bash
   cd firebase/functions
   npx firebase functions:secrets:set ELEVENLABS_API_KEY
   ```
   Jamais dans l'application, `.env`, `eas.json` ni Git.
3. Facultatif : choisir la voix (paramètre non secret) :
   ```bash
   # firebase/functions/.env.<identifiant du projet>  (ignoré par Git)
   ELEVENLABS_VOICE_ID=<identifiant de voix>
   ```
   Sans valeur, une voix multilingue par défaut est utilisée.
4. Déployer : `npx firebase deploy --only functions:speak,firestore:rules`.

Garde-fous côté serveur (`firebase/functions/src/voice.ts`) : utilisateur
authentifié, formule vérifiée dans `users/{uid}.subscription` (que le client
ne peut pas écrire), 300 caractères maximum, 60 synthèses par jour et par
utilisateur (`usage/{uid}`), délai réseau de 8 s, le texte n'est jamais
journalisé. Côté appareil, l'audio est mis en cache (empreinte texte + voix +
langue) : une même phrase n'est payée qu'une fois.

### Coûts

| Poste | Ordre de grandeur |
|---|---|
| Voix de l'appareil | Gratuite, hors ligne |
| ElevenLabs | Facturé au caractère : consulter la grille en vigueur. Plafond technique par utilisateur : 60 × 300 = 18 000 caractères/jour ; usage typique bien inférieur (messages de 60 à 150 caractères, 3 voix proactives/jour au plus, cache local) |
| Cloud Function `speak` | Une invocation par phrase non encore en cache |
| Reformulation IA | Comptée dans le quota existant de `financeAssistant` |

## Récompenses et score

- Récompenses déclaratives (`REWARDS`) évaluées sur le **mois clos**, jamais
  sur un mois de moins de 10 opérations ; un objectif ne compte que s'il a
  reçu une vraie contribution. Écrites une seule fois dans
  `users/{uid}/rewards` (création seule, identifiant `rewardId_période`).
- Score de comportement : budgets 30, épargne 25, objectifs 20, dettes 15,
  épargne de précaution 10 ; poids renormalisés quand une composante n'a pas
  de données ; aucun score avant un mois complet d'au moins 10 opérations.
  Personnel, jamais partagé ; avertissement obligatoire (indicateur
  pédagogique, pas une notation de crédit).
- Récompenses et score sont **strictement personnels** : rien n'est attribué
  depuis un espace familial, et l'écran du score n'y affiche aucun calcul.
- « Saisie régulière » (`regular_entry`) : au moins 20 jours distincts de
  saisie dans le mois (date de création ; récurrences automatiques exclues).

Famille et cérémonies (1.6, `familyEvents`, voir [`reserve.md`](reserve.md)) :
`reserve_low` (solde sous 25 % du plafond), `reserve_refilled` (plafond atteint,
célébration), `season_upcoming` (moment fort à 30 jours ou moins, épargne en
retard), `obligation_due` (soutien régulier à verser demain). Jamais de
bénéficiaire, de défunt ni de nom saisi dans les paramètres : libellés du
catalogue et montants seulement (montants jamais lus sans `speakAmounts`).

Tontines (1.7, `tontineEvents`, voir [`tontines.md`](tontines.md)) :
`tontine_due` (cotisation demain), `tontine_late`, `tontine_payout_soon`
(ma cagnotte dans 7 jours), `tontine_all_on_time` (célébration). Préférence
`tontineDue` ; voix sans montant ni nom de tontine sans `speakAmounts`.

Événements positifs (`detectPositiveEvents`) : mois respecté, épargne
régulière, dette soldée, échéance tenue, fonds d'urgence renforcé et
**catégorie en baisse** (`categoryDown` : ≥ 20 % sous la moyenne des trois
mois précédents, catégorie présente au moins deux de ces mois).

## Conseils et IA

Le conseil du jour (`adviceOfDay`) est choisi de façon déterministe parmi les
recommandations du moteur d'intelligence. Le bouton « M'expliquer ce conseil
(IA) » n'apparaît qu'avec un compte en ligne, le consentement IA (`aiConsent`)
et la fonctionnalité `ai_assistant` : il envoie **le texte déjà calculé**
(500 caractères max) et le résumé minimal `buildFinanceSummary`. L'IA
reformule ; elle ne décide de rien et aucune action n'est exécutée sans
confirmation.

## Saisie vocale (dictée)

Activée en 1.5.0 (Lot A) : `expo-speech-recognition`, permission micro
demandée au premier appui, texte → parseur local → carte de confirmation.
Voir [`lot-a.md`](lot-a.md) et [`lot-b.md`](lot-b.md). La voix du coach se
tait quand le micro s'ouvre.

## Builds (EAS)

La 1.5.0 ajoute des modules natifs (`expo-speech`, `expo-audio`) et change
les permissions Android : **un nouveau build natif est obligatoire** — une
mise à jour OTA ne suffit pas.

```bash
npx eas-cli build --platform android --profile development   # client de dev
npx eas-cli build --platform android --profile apk           # APK interne (versionCode auto-incrémenté)
npx eas-cli build --platform all --profile production        # stores
```

## Ce qui est testé, et comment

- Unitaires (Vitest) : seuils, mémoire d'alerte, politique de diffusion,
  messages vocaux, file vocale (délai, repli, arrêt), serveur `speak` (pur),
  récompenses, score, conseil du jour, saisie vocale.
- Règles Firestore sur l'émulateur : `coachEvents`, `rewards`,
  `subscription` non modifiable par le client.
- Parcours de bout en bout (`npm run e2e`, export web + émulateurs) avec
  espions de synthèse vocale et d'audio : `coach-*.js`.

Non vérifiables dans l'intégration continue (à tester sur téléphone) : voix
réelle de l'appareil, sons et vibrations, comportement en arrière-plan,
voix premium déployée (clé ElevenLabs), reformulation IA déployée.
