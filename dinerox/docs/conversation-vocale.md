# 1.9 — Mini-conversation vocale

L'utilisateur parle ; DineroX répond à voix haute et par écrit, reformule, pose
au plus deux questions en cas de doute, puis enregistre tout après « oui ».

## Phase 1 — Compréhension : local d'abord, IA ensuite

**Parseur local** (`core/entry/parse.ts`, pur, testé) :
- listes longues : virgules, « et », « puis », « aussi » ;
- mots de remplissage retirés (`vocabulary.json` › `fillers`) : « ainsi de suite »,
  « etc. », « euh », « voilà », « d'accord » ne créent aucune ligne ;
- auto-corrections (`corrections`) : « 30 000, non pardon 35 000 » → 35 000 ;
- vocabulaire local : « facture d'électricité », « courant », « CIE » → Maison ›
  Électricité ; « facture d'eau », « SODECI » → Maison › Eau ; « marché »,
  « popote » → Alimentation › Marché ; « transport » → Transport ; « santé » → Santé ;
- « 30 balles » : unité argotique INACTIVE tant que le fondateur ne l'a pas validée ;
- versement d'épargne au milieu d'une liste → ligne `type: 'savings'` (un versement
  seul ouvre toujours l'écran « Mon épargne ») ;
- une liste de plusieurs montants n'est jamais prise pour un transfert ;
- **ambiguïtés** (`ambiguous`) : « 30 000 en eau » → question « facture d'eau ou
  eau à boire ? » ; « facture d'eau », « eau minérale » ou un mot APPRIS → aucune
  question ;
- **confiance** par ligne (`lineConfidence`) et d'ensemble (`overallConfidence`).

**IA si nécessaire** (`needsAi`) : rien compris, ligne sans montant ou sans
catégorie (hors question d'ambiguïté), montants dits mais absents des lignes.
Cloud Function `parseVoiceEntry` (`firebase/functions/src/voiceEntry.ts`, région et
style de `financeAssistant`) :
- entrée minimale : transcription écrite, langue, catégories actives (identifiant,
  sens, parent, libellé), NOMS des comptes, date du jour, devise ;
- sortie structurée imposée (schéma JSON), revérifiée côté serveur
  (`sanitizeLines` : identifiants limités à la liste envoyée) et côté application ;
- modèle `claude-haiku-5-5`, 7 s côté serveur, 8 s côté application ;
- consentement `aiConsent` vérifié côté serveur ; compteur `usage/{uid}.voiceParse`
  et plafond anti-abus de 50 appels par jour (quotas par formule : à valider) ;
- la transcription n'est jamais journalisée.

**Garde-fous** (`core/entry/aiGuard.ts`) : réponse non conforme → parseur local ;
montant non prononcé → retiré, ligne « à vérifier » ; autre devise → jamais
convertie ; catégorie inexistante, désactivée ou du mauvais sens → question
« Je n'ai pas de catégorie pour X. Autres, ou je crée X ? » ; date future ou de
plus d'un an → aujourd'hui. Sans connexion, sans consentement, délai dépassé ou
erreur → parseur local seul, sans blocage.

Tests : `tests/voice-understanding.test.ts`, `tests/voice-parse-server.test.ts`.

## Phase 2 — La mini-conversation

`core/entry/conversation.ts` (pur, testé) produit des PHRASES-MODÈLES (clé i18n +
paramètres) : l'IA ne rédige jamais la réponse.
- **Reformulation** (`recap`) : salutation « Bonjour / Bon après-midi / Bonsoir
  {prénom}, bien compris. » à la première interaction du jour seulement, sinon un
  accusé de réception en variantes (`nextAck` : jamais deux fois le même de suite),
  introduction, lignes, total et compte utilisé, puis UNE question ou « Je les
  enregistre ? ». Au plus 2 questions par note vocale (`MAX_QUESTIONS`) ; au-delà,
  les lignes restent « à vérifier ».
- **Réponses dites ou écrites** (`interpretReply`) : « oui / c'est bon / valide /
  enregistre » ; « non, annule / laisse tomber / annule tout » ; « le loyer c'est
  120 000 » ; « enlève la santé » ; « ajoute 2 000 de crédit » ; « c'était hier » ;
  « paie le loyer avec la banque » ; réponse à une question (« de l'eau à boire »,
  « mets dans autres », « crée la catégorie ») ; question → assistant.
- **Reformulation courte** après une correction (`applyCommand`) : ce qui a changé,
  le nouveau total, puis la question suivante ou « Je les enregistre ? ».

Écran : `features/entry/ConversationView.tsx` + `useConversation.ts`, dans la
feuille de saisie existante (voix ET phrase écrite). Bulle de l'utilisateur
(transcription, « Modifier le texte » → nouvelle analyse), bulles de DineroX, carte
de confirmation existante (lignes modifiables d'un toucher), boutons de réponse aux
questions, « Répondre à la voix » (même enregistreur) ou réponse écrite.
- **Voix et texte en même temps** : la réponse est affichée et lue
  (`services/voice`) quand l'utilisateur a PARLÉ ; une réponse écrite est affichée
  sans être lue. Toute la réponse s'affiche d'un coup (pas de surlignage ligne à ligne).
- **Couper la voix** : toucher une bulle de DineroX, « Arrêter la voix », ou ouvrir
  le micro (micro et voix jamais en même temps : `micGate`).
- **Montants lus** : réglage « Lire les montants pendant la saisie vocale »
  (`EntryPrefs.speakAmounts`, vrai par défaut) ; coupé, la voix utilise les
  variantes `.voice` sans montant. `CoachPrefs.speakAmounts` (alertes) est inchangé.
- **Mode silencieux** : `CoachPrefs.silent` → texte seul. Le mode silencieux du
  TÉLÉPHONE n'est pas détecté (il faudrait une dépendance native) ; la synthèse
  Android suit le volume « médias ».
- L'échange vit en mémoire, pour la feuille ouverte seulement (jamais stocké ni
  synchronisé). Seuls sont gardés sur l'appareil (par compte) : le jour de la
  dernière salutation, le dernier accusé de réception, les catégories pour
  lesquelles « En créer une ? » a déjà été proposé.

## Phase 3 — Après « oui » uniquement

- Enregistrement via `useEntrySave` → `useActions` (outbox, hors ligne compris), en
  une seule fois : un échec retire les lignes (et catégories) déjà créées. Un seul
  « Annuler », affiché DANS la conversation pendant 5 s, retire tout le groupe.
- Dépense : compte débité, catégorie, donc enveloppe (`resolveEnvelopeId`). Revenu :
  compte crédité ; salaire → « Voulez-vous répartir ce salaire dans vos enveloppes ? »
  (`proposeIncomeAllocation`, affichée, jamais appliquée). Versement d'épargne :
  `depositToSavings` (transfert, jamais une dépense). « Créer la catégorie X » :
  créée à la validation, avec le mot entendu comme mot-clé.
- Catégorie sans enveloppe (si l'utilisateur a des enveloppes) : « En créer une ? »
  une seule fois par catégorie (`/envelopes/edit?categoryId=`).
- Bilan (`savedSummary`) : nombre et total, UNE phrase pour toutes les enveloppes
  qui franchissent 85 %, 100 % ou un dépassement (`crossedEnvelopes`, budgets fixés
  seulement), nouveau reste par jour (`dailyAllowance`) ou déficit.
- Le coach reçoit les écritures comme d'habitude (`notifyCoachWrite`, regroupées en
  un seul signal) : sa politique (`planDelivery`) n'est pas contournée.

## Phase 4 — Questions dans la conversation

« Combien il me reste pour le transport ? » → réponse CALCULÉE (`answerQuestion`),
affichée et lue ; question ouverte → « Ouvrir la conversation » (assistant,
`financeAssistant` avec consentement).

Tests : `tests/voice-conversation.test.ts` (pur), `e2e/voice-conversation.js`
(écran réel, reconnaissance simulée, synthèse captée).
