# 1.8 — Enregistreur vocal, catalogue de catégories, épargne, audit

Mission en quatre parties : (1) enregistreur vocal « comme WhatsApp », (2)
catalogue de catégories de départ configurable, (3) versements dans « Mon
épargne », (4) audit de toute l'application (`docs/audit-bugs.md`).

## Décisions du fondateur (validées avant de coder)

| # | Sujet | Décision |
|---|---|---|
| 1 | Enregistreur | Approche A : reconnaissance continue + relance automatique, morceaux raccordés |
| 2 | Enveloppe « Épargne » | Compte les versements vers les comptes d'épargne du mois (+ anciennes dépenses `cat_savings`) |
| 3 | Anciennes dépenses `cat_savings` / `cat_investment` | Exclues des dépenses (épargne, pas consommation) |
| 4 | Masquage par profil | Seulement si la situation familiale est renseignée ET 0 enfant ET 0 personne à charge |
| 5 | Limite de 3 comptes (gratuit) | Inchangée ; message clair + `UpgradeCard` |
| 6 | Pays du catalogue v2 | CI, SN, BJ, TG, BF, ML, NE, GW, GN |
| 7 | Catégorie renommée par l'utilisateur | Garde son nom, son emoji et sa couleur |

## Partie 1 — Enregistreur « comme WhatsApp »

**Comportement.** Toucher le micro → l'enregistrement démarre (vibration).
On parle aussi longtemps qu'on veut, pauses comprises. Toucher ■ → arrêt
(vibration), le texte part vers la carte de confirmation existante.

**Supprimé :** l'arrêt automatique sur silence (`continuous: false`,
`EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000`, `no-speech` traité
comme une fin). La consigne « arrêt automatique après un silence » du prompt v3
est annulée.

**Seules fins possibles :** le toucher ■ ; la corbeille ; la fermeture de la
feuille ; la mise en arrière-plan ou un appel (arrêt propre, ce qui a été dit
est GARDÉ) ; la limite de sécurité invisible de 5 minutes (message à 4:30).

**Technique (approche A).**
- `core/entry/recorder.ts` — machine d'états PURE
  `idle → recording → processing → confirm` (+ `cancelled`, `denied`) ;
  chronomètre, limite, double toucher (400 ms), toucher < 1 s = annulation
  silencieuse, attente du dernier morceau après ■ (1,5 s au plus).
- Le moteur du téléphone s'arrête de lui-même quand il n'entend plus de voix :
  `engineEnd` / `no-speech` → **relance immédiate** (`restartEngine`). Garde-fou :
  8 arrêts IMMÉDIATS (< 1 s) de suite = moteur absent → arrêt propre. Un
  silence, même de plusieurs minutes, n'est jamais compté.
- `stitchTranscript` / `appendSegment` raccordent les morceaux : cumulatif
  (iOS) remplacé, répétition ignorée, chevauchement gardé une seule fois.
- `services/speechInput.ts` : `continuous: true` sur iOS, web et Android 13+ ;
  aucune option de silence ; niveau sonore (`volumechange`) pour l'onde.
- `services/voiceRecorder.ts` : exécute les ordres de la machine (moteur,
  horloge, vibrations, `AppState`). La dictée de l'assistant utilise la même
  règle (`recordUntilStopped`).
- `features/entry/RecorderBar.tsx` : pastille rouge qui clignote, chronomètre,
  onde (animation neutre si le niveau sonore n'est pas fourni, ex. web),
  corbeille, bouton ■. Dans la feuille de saisie, pas d'écran plein.

**Limite connue.** Sur certains Android, le système émet un bip à chaque
relance du moteur. Le couper demanderait un module natif (nouvelle dépendance
native, non ajoutée sans accord).

**Audio.** Jamais enregistré ni envoyé à un serveur DineroX ; la reconnaissance
reste celle du téléphone (sur l'appareil quand il le permet).

**Testé.**
- `tests/recorder.test.ts` (23) : silences de 5, 10, 30 s et 4 min sans
  arrêt ; seul le toucher arrête ; dernier morceau gardé ; annulation, double
  toucher, < 1 s ; limite 4:30 / 5:00 ; arrière-plan et appel ; micro refusé ;
  moteur en panne ; raccord sans doublon.
- `tests/voice-recorder.test.ts` (7) : contrôleur réel sur un faux moteur
  Android (arrêt spontané 3 s après la parole, `no-speech`, `busy` au
  redémarrage), horloge simulée.
- `e2e/voice-recorder.js` (application réelle, export web, moteur simulé
  comme Android) : pause de 10 s → toujours en enregistrement, chronomètre qui
  monte, 4 démarrages du moteur, texte raccordé → 2 opérations ; corbeille ;
  toucher < 1 s ; double toucher ; arrière-plan ; dictée de l'assistant.

**À vérifier sur un vrai téléphone (prioritaire).** Un enregistrement avec une
pause de 10 secondes au milieu ; puis 30 secondes ; un appel entrant pendant
l'enregistrement ; le bip éventuel à chaque relance ; Android 12 (pas de mode
continu, la relance fait tout).

## Partie 2 — Catalogue de catégories

### Phase 1 — Le catalogue est une donnée

- `src/core/categoryCatalog.v2.json` : **fichier de catalogue versionné**
  (`catalogVersion: 2`) : 12 catégories, 82 sous-catégories. Pour chacune :
  `id` stable, libellés FR et EN, emoji (catégories), `parentId`,
  `sortOrder`, `bucket` (besoin / envie / obligation / dette), `envelope`
  (compartiment du budget automatique), `countries`, `profileRules`,
  `defaultEnabled`, `keywords`.
- `src/core/categoryCatalog.ts` (pur) : `sanitizeCatalog` (rien d'invalide
  n'est accepté), `catalogStarterDocs`, `maskedByProfile`,
  `effectiveCategoryId` / `effectiveTransactions` (alias).
- **Mise à jour à distance** : `config/categories/items/v2` (lecture pour tout
  utilisateur connecté, écriture administrateur ; règle existante
  `config/{doc}/items/{id}`, testée). `services/categoryCatalog.ts` le charge
  au démarrage, le met en cache ; hors connexion, le cache puis le catalogue
  embarqué s'appliquent. Les catégories installées par le catalogue ont un
  libellé `catalog:<id>` : une correction publiée s'affiche partout, sauf si
  l'utilisateur a renommé la catégorie (son nom prime).
- **Alias, aucune réécriture** : une opération est comptée sous le parent
  ACTUEL de sa sous-catégorie (`effectiveTransactions`, appliqué dans
  `useFinance` → rapports, budgets, analyses, export CSV, Historique). Une
  enveloppe qui citait l'ancien identifiant garde ses opérations
  (`resolveEnvelopeId` lit d'abord l'identifiant enregistré). Le champ de vue
  `legacyCategoryId` n'est jamais écrit (`saveTransaction` le retire).
