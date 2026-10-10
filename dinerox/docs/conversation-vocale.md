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
