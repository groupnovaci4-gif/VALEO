# CLAUDE.md — VALEO

> Contexte projet pour Claude Code. Lis ce fichier avant toute modification.
> Réponds et commente le code **en français**. L'app cible des coopératives
> agricoles de Côte d'Ivoire (cacao, café, anacarde, hévéa).

## 1. Ce qu'est VALEO

Application mobile de gestion pour coopératives : le **patron** (acheteur) pilote
la coop, le **pisteur** collecte le cacao en tournée et pèse les planteurs, le
**magasinier** (`role = "commis"`) pèse et stocke, et le **planteur** consulte ses
livraisons, paiements et avances. Fonctionnement **hors-ligne d'abord** : chaque
appareil garde un cache local chiffré et se synchronise avec le backend.

Rôles (valeurs exactes stockées) : `"patron"`, `"pisteur"`, `"commis"` (= Magasinier).
Côté session : `side = "coop"` (staff) ou `side = "planteur"`.

## 2. Architecture (importante — ne pas la deviner)

- **Backend** : un seul fichier `backend/server.py` (FastAPI + MongoDB via `motor`).
  Le backend stocke un unique document `appstate` contenant TOUTES les coops, mais
  il n'est plus un simple coffre : il **autorise** chaque écriture selon le rôle du
  jeton et **fusionne enregistrement par enregistrement** (voir §4).
- **Frontend** : Expo SDK 54 / React Native (`react-native` 0.81), routing `expo-router`.
  Toute la logique de calcul d'argent est côté client (`lib.ts`) ; le serveur, lui,
  contrôle *qui a le droit d'écrire quoi*.
- **Auth** : JWT signés `HS256`. Jeton staff = `{sub, coopId, role, side:"coop"}`,
  jeton planteur = `{sub, coopId, side:"planteur"}`. Admin = jeton `{sub:"owner"}` séparé.

Fichiers clés du frontend (`frontend/src/coop/`) :
- `lib.ts` — **source de vérité** des types (`Data`, `Collection`, `Loan`, `Member`,
  `Staff`…), des formules dérivées (`memberStats`, `pisteurStats`, `outstandingReste`,
  `collectionComm`) et des helpers (`priceOf`, `commOf`, formatteurs `fF`/`fFull`/`fKg`).
  **Aucun import d'exécution** : le module est testable directement par Node.
- `sync.ts` — `prepareSync(local, baseline)` : horodate les enregistrements modifiés
  et calcule les suppressions explicites. Module **pur**, testé par `yarn test`.
- `store.ts` — hook d'état global + synchro (`push`/`pull`, `PUT /api/state` debouncé
  700 ms), création de collecte (`addCollection`), avances (`addLoan`/`approveLoan`/
  `refuseLoan`), soldes (`settleMemberDue`).
- `sheets.tsx` — feuilles d'action : **pesée** (`PeseeSheet`, calcul net/reste/paye),
  avance, paiement, approbation, réglages prix/commission.
- `screens.tsx` — écrans (accueil par rôle, prêts, planteurs, bilan…).
- `auth.tsx`, `home.tsx`, `../../app/index.tsx` — connexion et **routage par rôle**.

Endpoints backend : `GET/PUT /api/state`, `POST /api/auth/coop/login`,
`POST /api/auth/planteur/login`, `POST /api/auth/register`, `GET/POST /api/audit`,
`/api/admin/*` (+ tableau de bord HTML admin intégré dans `server.py`).

## 3. Commandes

Frontend (dossier `frontend/`) :
- `yarn start` (ou `npx expo start`) — serveur de dev. `yarn android` / `yarn ios` / `yarn web`.
- `yarn lint` — ESLint (`expo lint`). Config : `eslint.config.js`, `tsconfig.json`.
  ⚠️ 8 erreurs `react/no-unescaped-entities` **préexistantes** : c'est le niveau de
  référence, ne pas croire qu'on vient de les introduire.
- `yarn test` — tests des modules purs (`sync.ts`, `lib.ts`) avec le lanceur intégré
  de Node, après transpilation vers `.sync-build/`. Aucune dépendance de test.
- `npx tsc --noEmit -p tsconfig.json` — vérification de types (doit rester à zéro erreur).
- Build APK/IPA : **EAS Build** (`npx eas build`) — c'est Expo, indépendant de tout builder.

Backend (dossier `backend/`) :
- Lancer : `uvicorn server:app --reload` (ou `--host 0.0.0.0 --port 8000`).
- Tests : `pytest` depuis `backend/`. ⚠️ `pytest.ini` impose `-n 2 --dist loadscope` :
  **ne pas modifier `addopts`**.
  - `test_state_authorization.py` et `test_state_idempotence.py` tournent **en
    processus** (MongoDB simulée via `mongomock_motor`, cf. `tests/conftest.py`) :
    aucun serveur ni réseau requis. Ce sont eux qu'il faut étendre.
  - `test_valeo_api.py`, `test_multicoop_isolation.py`, `test_admin_change_password.py`
    sont des tests d'intégration qui frappent une instance déployée via
    `EXPO_PUBLIC_BACKEND_URL` : lance le backend avant, ou pointe la variable vers
    l'instance de test.
- Format/lint Python disponibles : `black`, `isort`, `flake8`, `mypy`.

Variables d'environnement requises (backend, via `backend/.env`) :
`MONGO_URL`, `DB_NAME`, `ADMIN_PASSWORD`, `JWT_SECRET` (obligatoires — le serveur refuse
de démarrer sans `ADMIN_PASSWORD`/`JWT_SECRET`), `JWT_EXPIRE_MINUTES`, `CORS_ORIGINS`
et `LOGIN_MAX_FAILS` (optionnels). Frontend : `EXPO_PUBLIC_BACKEND_URL` (base de l'API, lue dans `store.ts`).

## 4. Invariants métier — NE JAMAIS CASSER

Ces règles sont correctes aujourd'hui. Toute modif doit les préserver, et idéalement
être couverte par un test.

1. **Isolation entre coopératives.** Le serveur force le `coopId` du jeton sur chaque
   enregistrement entrant (anti-IDOR). Une coop ne doit JAMAIS voir ou écrire les
   données d'une autre. C'est la garantie la plus importante.
2. **Autorisation par rôle côté serveur** (`authorize_state_write`). Les garde-fous
   d'UI sont cosmétiques ; c'est le serveur qui décide. Matrice :
   - *planteur* : lier son Mobile Money, sa photo, signer ses bordereaux, déposer une
     demande d'avance **à son nom** et **en_attente** ;
   - *commis / pisteur* : peser **à leur nom**, solder un reste dû, saisir **leurs**
     dépenses, déposer une demande d'avance en_attente ; jamais d'approbation, de
     mandat, de réglages, ni de création/suppression de planteur ou de collaborateur ;
   - *patron* : souverain sur **sa seule** coopérative.
   Aucun rôle autre que le patron ne peut poser ou effacer un `pin`.
3. **Fusion par enregistrement.** `merge_state` fait un upsert par `id` ; le
   `updatedAt` le plus récent gagne ; la fusion est **champ par champ** (le client ne
   reçoit pas tout : jamais les `pin`, et le planteur n'a qu'un annuaire réduit du
   personnel — écraser l'enregistrement entier effacerait ces champs invisibles).
   Une absence n'est **pas** une suppression : seule la liste `deletions` supprime.
4. **Le planteur ne reçoit que ses données** (`scope_state`). Ni les autres planteurs,
   ni les dépenses/mandats internes, ni les coordonnées du personnel.
5. **Les empreintes `pin` ne quittent jamais le serveur**, pour aucun rôle.
6. **Prix ET commission figés sur la collecte.** `c.prixKg` et `c.commissionRate` sont
   gelés à la création. Les reçus, bilans et commissions utilisent ces valeurs figées,
   jamais les valeurs courantes (`collectionComm` fait le repli pour l'historique).
7. **Recouvrement d'avance borné.** Montant recouvré = `min(avanceDue, montant)`,
   appliqué FIFO par date aux avances `status === "approuve"` ; `soldeRestant` décrémenté ;
   passage à `status "rembourse"` quand il atteint 0. Ne jamais recouvrer plus que le dû.
8. **Net jamais négatif.** `netAPayer = max(0, montant - recouvre)`. Le net dû au
   planteur = poids **net** (après tare sacs) × prix, moins recouvrement.
9. **Ordre de paiement.** L'ancien reste dû est soldé avant le net de la livraison courante.
10. **Caisse d'un agent** = `mandat − (paiements de ses pesées + anciens restes qu'il a
    soldés) − ses dépenses`. Les soldes vivent dans `settlements`, jamais dans
    `collection.paye` : les oublier fait apparaître un manquant fictif.
11. **Idempotence de la pesée.** Une saisie porte un `clientOpId` ; le serveur ignore
    une seconde création portant le même. Ne jamais créer une écriture financière sans.
12. **Numéro de bordereau par agent.** Format `P-<trigramme>-0000` : le trigramme est
    *dérivé* de l'identifiant de l'agent (`staffTag`, non stocké — un magasinier n'a
    pas le droit d'écrire sur une fiche de collaborateur), et la suite (`nextTicketSeq`)
    est propre à chaque agent. Le numéro est **figé** sur l'enregistrement (`ticket`)
    à l'émission ; l'affichage passe toujours par `ticketOf`, jamais par un recalcul.
13. **Stock = entrées − sorties.** `stockStats(data, {scope, staffId})` : les pesées
    entrent, les `Sortie` (expédition, vente, transfert, perte) sortent. Ne jamais
    présenter un cumul de collectes comme un stock. Le résultat n'est PAS borné à
    zéro : un stock négatif signale une erreur de saisie, le masquer serait pire.
    Une sortie est définitive pour un agent (ni modification ni suppression) ; seul
    le patron corrige. Portées : le **magasinier et le patron** voient le magasin de
    la coopérative (`scope: "all"`), le **pisteur** ce qu'il a collecté et pas encore
    remis (`scope: "mine"`), le **planteur** rien (mouvement interne).
14. **Campagnes : la production est cloisonnée, les dettes sont reportées.**
    `scopeSaison(data)` filtre collectes, mandats, dépenses, soldes et sorties sur la campagne
    active — à utiliser pour les volumes, le stock, la caisse et la commission.
    Le **reste dû** et les **avances à recouvrer** ne sont JAMAIS filtrés : ils suivent
    le planteur d'une campagne à l'autre. Les historiques et journaux non plus.
15. **Statuts d'avance** (valeurs exactes) : `"en_attente"`, `"approuve"`, `"refuse"`,
    `"rembourse"`. Ne pas introduire d'autre orthographe.
16. **Poids net.** `net = max(0, brut - sacs)` (1 kg de tare par sac). Le montant se
    calcule sur le net, jamais sur le brut.
17. **Connexions limitées.** Toute vérification de secret (`/api/auth/*/login`,
    `/api/admin/login`, changement de mot de passe admin) passe par
    `guard_login` / `note_login_failure` / `note_login_success`, sinon un code à
    6 chiffres redevient brute-forçable. Le verrou porte sur l'**identifiant
    tenté**, jamais sur l'IP (derrière un ingress toutes les requêtes la
    partagent, et `X-Forwarded-For` est falsifiable). Un identifiant inconnu doit
    consommer le même temps de calcul qu'un mauvais code (`burn_secret_time`) :
    sinon la durée de réponse révèle quels comptes existent.
18. **Secrets** hachés en **PBKDF2-HMAC-SHA256** (jamais en clair). Ne pas régresser.

## 5. Feuille de route

### Fait (voir l'historique git)
- **B1 — Autorisation par rôle côté serveur.** Cf. invariant 2.
- **B2 — Fusion par enregistrement.** Cf. invariant 3. Deux agents hors-ligne ne
  s'écrasent plus.
- **B3 — Périmètre du planteur.** Cf. invariants 4 et 5.
- **M4 — Commission figée.** Cf. invariant 6.
- **M5 — Idempotence de la pesée.** Cf. invariant 11.
- **Mineurs** : `decideLoan` retiré ; l'édition admin d'une collecte recalcule
  `brut`/`net`/`reste` (`recomputeCollection`) ; CORS `allow_credentials=false` +
  `CORS_ORIGINS`.
- **Caisse des agents** corrigée (invariant 10) ; bordereau papier complété
  (« Ancien reste soldé » + « TOTAL REMIS ») ; connexion planteur par identifiant
  `VAL-XXXX-YY` **ou** téléphone ; retrait du bouton « Réinitialiser les données de
  démonstration » qui vidait toute la coopérative sans confirmation.

- **M6 — Cloisonnement par campagne.** Cf. invariant 13. Arbitrage retenu : les
  dettes sont **reportées** d'une campagne à l'autre, seule la production est
  cloisonnée.
- **Anti-force-brute sur les connexions.** Cf. invariant 17.
- **Stock magasin réel.** Cf. invariant 13. Modèle `Sortie` + `stockStats`.
- **Numéro de bordereau unique.** Cf. invariant 12. Arbitrage retenu : **préfixe par
  agent**, pour rester 100 % hors-ligne (aucune contrainte réseau à la pesée).

### Reste à faire
- **Sélecteur de campagne.** `saisons(data)` liste les campagnes présentes, mais les
  écrans n'affichent que la campagne active (`data.saison`) : il manque un sélecteur
  pour consulter une campagne close.
- **Même agent sur deux téléphones.** La suite par agent est dérivée de ses propres
  enregistrements : un agent qui pèse hors-ligne depuis deux appareils à la fois peut
  encore produire deux fois le même numéro. Cas rare, mais non couvert.
- **Jetons courts + révocation.** Le jeton dure 30 jours et rien ne permet de le
  révoquer : un téléphone perdu reste connecté jusqu'à expiration.
- OTP SMS ; certificate pinning (build natif).
- **Itérations PBKDF2 (15 000).** Volontairement basses : le calcul se fait en JS
  pur sur des téléphones d'entrée de gamme et 100 000 figeait l'interface (v11).
  Le verrou de connexion (invariant 17) compense. Ne remonter qu'avec une
  implémentation native du KDF.

## 6. Conventions & règles de contribution

- **Argent** : francs CFA, valeurs entières (arrondir). Toujours passer par les formatteurs
  de `lib.ts` (`fF`, `fFull`, `fKg`, `group`). Ne pas réinventer le formatage.
- **Types d'abord** : modifie/ajoute les types dans `lib.ts` avant de changer un écran.
- **Textes UI et commentaires en français.**
- **Hors-ligne d'abord** : toute écriture passe par `setData` du store (qui gère cache +
  synchro). Ne pas écrire directement au backend depuis un écran.
- **Ne jamais horodater à la main.** `prepareSync` calcule `updatedAt` par différence
  avec la dernière version serveur : une mutation ne peut donc pas être oubliée.
  Ajouter un tableau d'entités ⇒ l'ajouter à `ENTITIES` (`sync.ts`) **et** à
  `ENTITY_ARRAYS` (`server.py`).
- **Toute nouvelle écriture doit être autorisée explicitement** dans
  `authorize_state_write`. Le refus est la valeur par défaut : un champ oublié
  provoque un 403 visible, jamais une faille silencieuse.
- **Audit** : les actions sensibles (pesée, avance, solde) émettent un `logAudit`.
  L'acteur et l'horodatage sont posés **par le serveur** (`/api/audit`) — ne jamais les
  faire confiance au client. Conserve ce principe.
- **Tests** : ajoute un test backend (`backend/tests/`, pytest) pour tout correctif de
  logique ou de sécurité, et un test `frontend/tests/` si la formule est dans un module
  pur. Ne touche pas à `addopts` de `pytest.ini`.
- **Ne pas dégrader la sécurité pour "faire marcher"** : si un correctif casse un test
  d'isolation entre coops ou d'autorisation, c'est le correctif qui est faux.

## 7. Ce qu'il ne faut PAS faire

- Ne pas remettre de logique « le client a toujours raison » : le serveur arbitre les
  autorisations et les conflits.
- Ne pas renvoyer d'enregistrement brut au client sans passer par `scope_state`.
- Ne pas réintroduire un remplacement de tableau entier dans `merge_state`.
- Ne pas supprimer le dossier `.emergent/` sans raison (inoffensif ; hérité du builder).
- Ne pas committer de secrets (`.env`) ni de `MONGO_URL` réel.
- Ne pas remplacer le stack (Expo/FastAPI/Mongo) : les bugs étaient dans l'architecture
  de synchro et d'autorisation, pas dans le choix des technologies.

## 8. Déploiement

Backend et frontend doivent être **déployés ensemble**. Un ancien client n'horodate pas
ses écritures : le serveur les ignorerait silencieusement (le stocké gagne en l'absence
d'horodatage). Inversement, un nouveau client sur un ancien backend verrait ses
`deletions` ignorées.
