# CLAUDE.md — VALEO

> Contexte projet pour Claude Code. Lis ce fichier avant toute modification.
> ⚠️ **La branche de travail est `develop`.** `main` est la branche par défaut du
> dépôt — donc celle où `git clone` atterrit — et elle a plusieurs dizaines de
> commits de retard : ni `depot.py`, ni `firebase_auth.py`, ni la vérification
> des livraisons, ni l'espace admin synchronisé. Vérifier
> `git branch --show-current` avant d'écrire quoi que ce soit.
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

- **Backend** : `backend/server.py` (FastAPI) — toute la logique d'autorisation et
  de fusion. Deux modules à côté, volontairement étroits :
  `backend/depot.py` (où les octets sont rangés : **MongoDB ou Firestore**, cf.
  invariant 29) et `backend/firebase_auth.py` (sessions Firebase, cf. invariant 28).
  Le backend n'est pas un simple coffre : il **autorise** chaque écriture selon le
  rôle du jeton et **fusionne enregistrement par enregistrement** (voir §4).
  Sur MongoDB, tout l'état tient dans un document `appstate` ; sur Firestore,
  **un document par enregistrement**.
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
- `geo.ts` + `geo/` — base des localités de Côte d'Ivoire et sélection en cascade
  (District → Région → Département → Village). Module **pur**. La base est
  **générée** (`yarn geo:build`) depuis `geo/ci-decoupage.csv` : voir
  `geo/README.md` pour charger une base officielle complète.
- `backend.ts` — **où l'application va chercher son API** : URL absolue (mobile)
  ou **même origine** (web servi par Hosting). Module **pur**, testé par `yarn test`.
- `firebase.ts` — session Firebase (échange et renouvellement du jeton), **en REST,
  sans le SDK Firebase**. Module **pur**, testé par `yarn test`.
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
Côté administration : `GET/PUT /api/admin/state`, `POST /api/admin/set-secret`,
`GET /api/admin/audit`, `POST /api/admin/purge-mouvements`, `POST
/api/admin/revoke`, `POST /api/admin/login`, `POST /api/admin/change-password`. **Tous** exigent le jeton
administrateur (`require_admin`) : aucun jeton d'application ne les atteint.
Dont `POST /api/admin/purge-mouvements` : efface les **mouvements** d'une
coopérative (`MOVEMENT_ARRAYS` + journal d'audit) en conservant les **acteurs**
— coopératives, collaborateurs, planteurs, réglages et codes secrets. Réservé au
jeton administrateur, `coopId` **obligatoire** (l'isolation entre coops vaut
aussi pour une opération d'administration : une valeur vide ne doit jamais
dégénérer en purge de toutes les coopératives), double confirmation dans le
tableau de bord (recopie du nom de la coopérative). Après la purge, rouvrir l'application sur chaque
téléphone : le cache local se remet à jour au démarrage (`pull`).

## 3. Commandes

Frontend (dossier `frontend/`) :
- `yarn start` (ou `npx expo start`) — serveur de dev. `yarn android` / `yarn ios` / `yarn web`.
- `yarn lint` — ESLint (`expo lint`). Config : `eslint.config.js`, `tsconfig.json`.
  ⚠️ 8 erreurs `react/no-unescaped-entities` **préexistantes** : c'est le niveau de
  référence, ne pas croire qu'on vient de les introduire.
- `yarn test` — tests des modules purs (`sync.ts`, `lib.ts`, `geo.ts`) avec le
  lanceur intégré de Node, après transpilation vers `.sync-build/`. Aucune
  dépendance de test.
- `yarn build:web` — construit le site dans `frontend/dist` (SPA, `output: "single"`),
  c'est ce que Firebase Hosting sert. Laisser `EXPO_PUBLIC_BACKEND_URL` **vide**
  pour le web : l'API est à la même origine (invariant 31).
- `yarn geo:build` — régénère la base des localités depuis
  `src/coop/geo/ci-decoupage.csv` (voir `src/coop/geo/README.md`).
- `npx tsc --noEmit -p tsconfig.json` — vérification de types (doit rester à zéro erreur).
- Build APK/IPA : **EAS Build** (`npx eas build`) — c'est Expo, indépendant de tout builder.

Backend (dossier `backend/`) :
- Lancer : `uvicorn server:app --reload` (ou `--host 0.0.0.0 --port 8000`).
- Tests : `pytest` depuis `backend/`. ⚠️ `pytest.ini` impose `-n 2 --dist loadscope` :
  **ne pas modifier `addopts`**.
  - `test_state_authorization.py` et `test_state_idempotence.py` tournent **en
    processus** (MongoDB simulée via `mongomock_motor`, cf. `tests/conftest.py`) :
    aucun serveur ni réseau requis. Ce sont eux qu'il faut étendre.
  - ⚠️ La fixture `app_client` est **paramétrée** : chaque test tourne DEUX fois,
    une fois sur MongoDB, une fois sur Firestore (double en mémoire,
    `tests/faux_firestore.py`). Un test qui touche la base doit passer par
    `server.depot`, jamais par `server.db` — sinon il ne vaut que sur MongoDB.
  - `test_valeo_api.py`, `test_multicoop_isolation.py`, `test_admin_change_password.py`
    sont des tests d'intégration qui frappent une instance déployée via
    `EXPO_PUBLIC_BACKEND_URL` : lance le backend avant, ou pointe la variable vers
    l'instance de test.
- Format/lint Python disponibles : `black`, `isort`, `flake8`, `mypy`.

Variables d'environnement requises (backend, via `backend/.env`) :
`MONGO_URL`, `DB_NAME`, `ADMIN_PASSWORD`, `JWT_SECRET` (obligatoires — le serveur refuse
de démarrer sans `ADMIN_PASSWORD`/`JWT_SECRET`), `JWT_EXPIRE_MINUTES`, `CORS_ORIGINS`
et `LOGIN_MAX_FAILS` (optionnels). Migration Firebase (facultatives, cf. invariant 28) :
`FIREBASE_SERVICE_ACCOUNT` **ou** `FIREBASE_SERVICE_ACCOUNT_FILE` **ou**
`GOOGLE_APPLICATION_CREDENTIALS`, et `FIREBASE_CHECK_REVOKED`. Base de données
(cf. invariant 29) : `DATA_BACKEND` (`mongo` par défaut, ou `firestore`) et
`FIRESTORE_DATABASE`. Bascule (cf. invariant 32) : `BACKEND_DEPRECIE`
(à poser sur l'ANCIEN déploiement) et `STARTUP_TIMEOUT_SECONDS`.
Frontend : `EXPO_PUBLIC_BACKEND_URL` (base de l'API, lue dans `store.ts`) et
`EXPO_PUBLIC_FIREBASE_API_KEY` (facultative).
**Toutes** sont décrites dans `backend/.env.example` et `frontend/.env.example`
(copier en `.env`). Un test refuse qu'une variable lue par le code n'y figure
pas — sans quoi personne ne sait quoi renseigner. Avant tout déploiement :
`python backend/scripts/verifier_configuration.py` (n'affiche aucun secret).

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
   - *commis (magasinier)* : peser **à leur nom** (origine `magasin`), **vérifier**
     les poids ramenés par un pisteur (jamais les leurs), **créer un planteur**
     rattaché à eux, solder un reste dû, saisir **leurs** dépenses, déposer une
     demande d'avance en_attente ;
   - *pisteur / délégué* : collecter **à leur nom** (origine `bord_champ`),
     **créer un planteur** rattaché à eux, **accorder directement une avance**
     signée de leur nom, solder **uniquement leurs propres** restes dus, saisir
     **leurs** dépenses ; il ramasse puis **livre au magasin** — ni vente, ni
     expédition vers l'usine (`PISTEUR_SORTIES_INTERDITES`) — et jamais de
     vérification de poids ;
   - aucun des deux : mandat, réglages, suppression de planteur, création ou
     suppression de collaborateur, approbation d'une demande d'avance ;
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
10. **Caisse d'un agent** = `mandat − (paiements de ses pesées + anciens restes
    qu'il a soldés) − son manquant + son poids plus`. Ses **dépenses n'y entrent
    pas** : le mandat est confié pour *acheter* du cacao, et le pisteur/délégué
    est un prestataire rémunéré à la commission (invariant 24). Les soldes
    vivent dans `settlements`, jamais dans `collection.paye` : les oublier fait
    apparaître un manquant fictif.
    Les deux écarts de vérification sont de **vrais mouvements d'argent**,
    symétriques, valorisés au `prixKg` **figé sur la collecte** et imputés
    seulement **après** vérification (on ne règle pas un écart non constaté) :
    - **manquant** (`manquantVerif` = `max(0, kg − verif.kg) × prixKg`) —
      marchandise réglée au bord-champ jamais arrivée au magasin : de l'argent
      du mandat sorti sans contrepartie, **à la charge de l'agent** ;
    - **poids plus** (`poidsPlusVerif` = `max(0, verif.kg − kg) × prixKg`) — ce
      qui arrive au magasin au-delà du poids déclaré : **il revient à l'agent**.
      C'est la pratique du métier : le mandat est confié pour acheter un poids
      donné, et l'acheteur n'attend en retour que le poids correspondant au
      mandat octroyé ; le surplus est le fruit de la tournée et lui est versé.
    Chaque écart garde son montant propre à l'affichage ; dans la caisse, les
    deux se compensent naturellement puisqu'ils vont en sens inverse.
11. **Idempotence de la pesée.** Une saisie porte un `clientOpId` ; le serveur ignore
    une seconde création portant le même. Ne jamais créer une écriture financière sans.
12. **Numéro de bordereau par agent.** Format `P-<trigramme>-0000` : le trigramme est
    *dérivé* de l'identifiant de l'agent (`staffTag`, non stocké — un magasinier n'a
    pas le droit d'écrire sur une fiche de collaborateur), et la suite (`nextTicketSeq`)
    est propre à chaque agent. Le numéro est **figé** sur l'enregistrement (`ticket`)
    à l'émission ; l'affichage passe toujours par `ticketOf`, jamais par un recalcul.
13. **Stock = entrées − sorties, et l'entrée est le poids VÉRIFIÉ.**
    `stockStats(data, {scope, staffId})`. Les `Sortie` (expédition, vente,
    transfert, perte) sortent. Ne jamais présenter un cumul de collectes comme un
    stock. Le résultat n'est PAS borné à zéro : un stock négatif signale une
    erreur de saisie, le masquer serait pire. Une sortie est définitive pour un
    agent ; seul le patron corrige. Portées :
    - `scope: "all"` (**magasinier et patron**) = magasin de la coopérative :
      pesées `origine: "magasin"` (patron, magasinier) **+ collectes bord-champ
      vérifiées, au poids constaté** (`verif.kg`). Une collecte bord-champ non
      vérifiée n'y entre PAS : la marchandise est encore dans le véhicule.
      `stockStats(...).attente` l'expose à part, sans jamais la compter.
    - `scope: "mine"` (**pisteur**) = ce qu'il a collecté et **pas encore remis**,
      c'est-à-dire ses collectes bord-champ non vérifiées, au poids déclaré. La
      vérification transfère le poids de sa charge vers le magasin.
    - **planteur** : rien (mouvement interne).
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
18. **Localisation : sélection, jamais saisie libre.** La localisation d'une
    coopérative ou d'un planteur se choisit dans la base (`LieuPicker`), qui ne
    fait que filtrer une liste officielle — impossible de créer une localité
    avec une faute de frappe. Elle est stockée dans `loc` (identifiant **et**
    nom de chaque niveau, pour permettre des regroupements fiables), et les
    champs texte historiques (`Member.village`, `Coop.region`/`district`/
    `departement`/`localite`) restent alimentés par recopie : listes, filtres,
    reçus, PDF et espace admin continuent de fonctionner à l'identique. Ne
    jamais supprimer ces champs texte. Une valeur non retrouvée dans la base
    est conservée telle quelle (`villageLibre`), jamais effacée.
19. **Secrets** hachés en **PBKDF2-HMAC-SHA256** (jamais en clair). Ne pas régresser.
20. **Livraison au magasin, origine figée, vérification définitive.**
    Le flux du pisteur est : ramassage bord-champ → **livraison au magasin**
    (`Collection.livraison`, déclarée par lui) → alerte du patron ET du
    magasinier (`buildNotifications`, entrées `vf*`) → vérification → stock.
    Trois états, dans cet ordre (`statutLivraison`) : `collectee` (en tournée),
    `en_attente` (livrée, à vérifier), `verifiee`.
    La livraison n'est **PAS une `Sortie`** : une sortie retranche du stock, or
    le poids ne quitte la charge du pisteur qu'à la vérification. En créer une
    le décompterait deux fois. C'est le seul « motif de sortie » qui lui est
    offert : ni vente, ni expédition, ni transfert
    (`PISTEUR_SORTIES_INTERDITES`). Elle est signée de son auteur et
    **définitive** — sinon il retirerait sa marchandise de la file du magasin
    après coup. `aVerifier` exige la livraison : une collecte encore en tournée
    n'alerte personne et n'entre dans aucune file.
    **La vérification porte sur la LIVRAISON, jamais sur un planteur.** Le
    pisteur pèse chaque planteur au bord-champ, mais il remet **un chargement** :
    le magasinier le pèse **une seule fois**, en une ou plusieurs fournées de
    sacs, comme il veut. `Livraison.id` (posé par `livrerCollections`) regroupe
    les collectes remises ensemble ; `livraisons(data, …)` en donne la vue
    (`kgDeclare`, `kgVerifie`, `ecart`, `deficit`, `excedent`). Le détail par
    planteur reste conservé pour la traçabilité, mais n'est plus une étape.
    `repartirVerif` impute le poids global constaté sur les collectes du
    chargement : cette quote-part n'est PAS une mesure, c'est l'imputation de
    l'unique mesure. Elle laisse intactes les deux formules existantes — le
    stock reste `Σ verif.kg` (donc exactement le poids pesé, jamais le déclaré,
    jamais les deux additionnés) et l'écart reste valorisé au `prixKg` figé de
    chaque collecte, ce qui revient au prix moyen pondéré du chargement. La
    somme des quotes-parts est **exacte** (résidu d'arrondi sur la dernière) :
    sans cela le stock différerait du poids réellement pesé.
    Une livraison **antérieure** peut être à moitié vérifiée (la vérification se
    faisait alors collecte par collecte) : `LivraisonGroupe.enAttente` /
    `kgEnAttente` exposent ce qui RESTE à peser, et c'est cela que le magasinier
    voit et valide. Sans quoi le chargement resterait bloqué à jamais dans sa
    file, refusé parce que déjà partiellement vérifié.
    `verif.kg` d'une collecte n'étant plus une mesure mais une quote-part, on ne
    l'affiche **jamais** comme « poids vérifié de ce planteur » : les listes de
    collectes montrent le statut de la livraison, pas un poids.
    **La validation n'efface rien.** La livraison vérifiée reste consultable par
    le magasinier ET le patron (`HistoriqueLivraisons`) : pisteur, date et
    heure, poids déclaré, poids vérifié, écart, détail des planteurs. Stock
    **et** traçabilité, pas stock seul. Le journal d'audit horodate les deux
    actes côté serveur (`livraison_magasin`, `verification_livraison`).
    Le magasinier vérifie avec **la procédure de pesée habituelle**
    (`usePesee` / `PeseeCorps`, partagés avec `PeseeSheet`) : même pavé, même
    tare par sac, mêmes pesées multiples. Seul le paiement est absent — une
    vérification ne règle rien. Deux implémentations divergeraient au premier
    correctif. `Collection.origine`
    (`"magasin"` | `"bord_champ"`) est gelée à la création, comme `prixKg` ; le
    serveur refuse une origine qui ne correspond pas au rôle. Le circuit de
    vérification s'appuie sur le **seul champ enregistré**, jamais sur le rôle
    de l'agent : les collectes antérieures n'ont pas ce champ et restent
    comptées en magasin. Les déduire du rôle ferait chuter le stock existant et
    créerait une file d'attente fictive pour des livraisons déjà faites.
    La vérification (`Collection.verif`) est posée **par le magasinier**, jamais
    sur sa propre pesée, **une seule fois** (seul le patron corrige) ; elle
    n'altère ni `kg`, ni le montant, ni le bordereau déjà remis au planteur —
    l'écart (`ecartVerif`) reste lisible plutôt que masqué, et se règle sur la
    **caisse du pisteur** dans les deux sens (invariant 10 : manquant à sa
    charge, poids plus à son bénéfice), jamais en rouvrant le paiement du
    planteur. Chaîne conservée : pisteur → poids déclaré → poids vérifié →
    magasinier → date.
21. **Restes dus cloisonnés par agent.** Un pisteur ne voit et ne solde que les
    restes issus de **ses propres** pesées (`collectesPourRestes`,
    `restesAgent`) : ceux du patron, du magasinier **ou d'un autre pisteur** ne
    sortent pas de sa caisse, même sur un planteur qu'il suit. Appliqué **sur la
    donnée** — le serveur refuse un `resteSolde` posé par un pisteur sur la
    collecte d'un autre — et pas seulement à l'affichage. Les **notifications**
    comptent aussi : `buildNotifications` passe par `collectesPourRestes`, sans
    quoi la cloche du pisteur lui annonce des restes qu'il n'a pas le droit de
    voir. Le patron et le magasinier, eux, voient tout.
    Le cloisonnement porte sur **toute la cloche**, pas seulement sur la ligne
    « reste » : `buildNotifications` filtre aussi les « Pesée payée » et les
    « Reste soldé » sur les seules pesées et les seuls soldes de l'agent. Une
    pesée d'un autre agent lui livrait sinon le nom du planteur et la somme
    versée — la même fuite, sur une autre ligne.
    `buildNotifications` vit dans `lib.ts` (module pur) **parce que** c'est une
    règle métier : la loger dans un écran la rendait intestable, et c'est
    exactement là que la fuite était passée.
22. **Un seul système d'avance, trois origines.** `Loan.origine` :
    `"planteur"` (demandée depuis l'espace planteur → `en_attente`, décision du
    patron), `"pisteur"` (accordée sur le terrain → naît `approuve`, `decidedBy`
    = le pisteur, `soldeRestant` = `amount`), `"patron"`. Ne jamais créer un
    second circuit d'avance parallèle : le recouvrement, les statuts et le
    report entre campagnes restent communs. Le magasinier ne décide pas.
23. **`migrate()` ne complète jamais une fiche avec une valeur inventée.**
    `prepareSync` renvoie TOUTES les lignes : un champ ajouté au chargement
    voyage jusqu'au serveur, qui le lit comme une modification interdite et
    refuse **tout le PUT** (403). C'est ce qui cassait la demande d'avance du
    planteur (`cultures`). Les valeurs par défaut se dérivent à la lecture
    (`memberCultures`), jamais en réécrivant l'enregistrement.
    **La fiche coopérative aussi** : `POST /api/auth/register` la crée sans
    `prices` ni `commissions`, et `migrate` les remplissait avec les barèmes par
    défaut. Le serveur y lisait un changement de réglage réservé au patron, et
    refusait **toute** synchronisation du pisteur comme du magasinier (403
    « seul le patron peut changer "prices" ») : sur une coopérative neuve, plus
    aucun agent ne pouvait rien enregistrer. Les barèmes se dérivent à la
    lecture (`priceOf` / `commOf` retombent sur `DEFAULT_PRICES` /
    `DEFAULT_COMM`). `migrate` ne fait plus que **réparer** une valeur du
    mauvais type ; il n'ajoute jamais une clé que le serveur n'a pas envoyée.

24. **Les dépenses d'un pisteur / délégué n'appartiennent qu'à lui.**
    Il n'est pas salarié : c'est un **prestataire**, un apporteur d'affaires
    rémunéré à la commission, donc autonome sur ses frais. Conséquences, toutes
    appliquées **sur la donnée** :
    - `scope_state` ne transmet ses dépenses qu'à lui — ni au patron, ni au
      magasinier, ni à un autre pisteur (le planteur n'en recevait déjà aucune) ;
    - `_check_depenses_privees` interdit à quiconque d'autre de les créer, de
      les modifier ou de les supprimer — **le patron compris**, seule limite à
      sa souveraineté. Le renvoi *à l'identique* d'une ligne déjà stockée reste
      toléré : un téléphone hors ligne la porte encore en cache, et refuser tout
      le PUT rejouerait l'invariant 23 ;
    - elles **n'entament pas son mandat** (`pisteurStats.solde`), ni les
      dépenses de la coopérative (`DepensesPatron`), ni le journal d'activité,
      ni le bilan de campagne. `pisteurStats` renvoie toujours `depenses` :
      c'est son suivi personnel, affiché sur son seul écran.
    Les dépenses du **magasinier** et du **patron**, elles, restent celles de la
    coopérative — ils sont salariés.

25. **Avance du patron et avance du pisteur : deux créances indépendantes.**
    Un même planteur peut porter les deux. Le **créancier** d'une avance est le
    pisteur qui l'a signée (`origine === "pisteur"`, `decidedBy`), sinon la
    **coopérative** — patron et magasinier agissent pour elle
    (`creancierAvance`, `creancierAgent`, `peutRecouvrer`).
    - Chacun ne recouvre **que la sienne** : le FIFO de `addCollection` est
      filtré par créancier, et `_check_recouvrements` le refuse côté serveur.
      Sans ce filtre, le recouvrement d'un pisteur s'imputait à l'avance du
      patron (plus ancienne) : la sienne restait intacte.
    - L'existence de l'autre ne doit **jamais** bloquer. Le refus global qui
      régnait (`delta["loans"]["updated"]` interdit aux agents) rejetait **tout
      le PUT** de la pesée — collecte et paiement du planteur compris.
    - Un recouvrement ne change que `soldeRestant` (à la baisse) et `status`
      (→ `rembourse` à 0). **Approuver ou refuser reste au patron.**
    - Les montants ne sont jamais additionnés ni fusionnés : `PeseeSheet`
      affiche les avances de l'agent (recouvrables) et celles d'un autre
      créancier séparément, ces dernières pour information seulement.
    - Le planteur voit l'**origine** de chaque avance (`origineAvance`) :
      « Patron » ou « Pisteur / Délégué — Nom ». Jamais regroupées.

26. **L'espace Admin écrit dans la MÊME base, avec la même discipline.**
    C'est une interface de contrôle, pas un écran de consultation : `GET
    /api/admin/state` lit l'état réel, et `PUT /api/admin/state` passe par
    `merge_admin_state`, calqué sur `merge_state` (invariant 3).
    - Il remplaçait le document **entier** par la copie chargée dans le
      navigateur : toute écriture faite depuis un téléphone entre l'affichage
      de la page et l'enregistrement était **silencieusement détruite**. C'est
      la perte de mise à jour que B2 avait corrigée côté application.
    - Une absence n'est pas une suppression : seule la liste `deletions`
      supprime. Le tableau de bord l'alimente à chaque « Supprimer ».
    - Une ligne renvoyée **à l'identique** garde sa version stockée : un écran
      périmé ne réécrit pas ce qu'il n'a pas modifié. Une ligne réellement
      modifiée est **remplacée en entier** — l'admin voit la fiche complète,
      donc retirer un champ (réactiver un compte) doit vraiment l'effacer, là
      où un téléphone n'aurait pas le droit de le faire. Les compteurs (`seq`,
      `memberSeq`) ne redescendent jamais.
    - Les **barèmes** se posent sur `coops[].prices` / `commissions`, là où
      l'application les lit. Les écrire dans les anciens champs globaux
      `state.prixKg` / `commissionRate` n'avait aucun effet sur les téléphones
      et débordait sur les autres coopératives. La **campagne** reste commune.
    - **Les empreintes `pin` ne partent pas non plus vers l'admin** (invariant
      5 : pour aucun rôle). Un booléen dérivé `aSecret` dit si le compte a un
      code ; il est calculé à la lecture et **jamais stocké**. Le propriétaire
      pose ou réinitialise un secret par `POST /api/admin/set-secret`, haché
      côté serveur — un compte créé depuis l'admin n'avait sinon aucun moyen
      de se connecter.
    - **Désactivation** : `desactive: true` sur un `staff` ou un `member`
      refuse la connexion (403) alors même que le secret est bon. Contrôlé
      **à la connexion, côté serveur** ; le champ n'appartient à aucun
      ensemble modifiable par l'application, donc aucun rôle ne peut lever sa
      propre désactivation.
    - `GET /api/admin/audit` lit le **même** journal que `/api/audit` : l'admin
      n'a pas sa propre trace, il lit celle de l'application (acteur et
      horodatage posés par le serveur).

27. **Une seule source de vérité, et elle se prouve.**
    `/api/state` (application) et `/api/admin/state` (tableau de bord) lisent
    le **même document** via le **même objet `db`** du même processus : sur un
    backend donné, ils ne *peuvent pas* être sur deux bases. Une saisie qui ne
    « remonte » pas signifie donc toujours que le téléphone et l'admin parlent
    à **deux instances différentes** — jamais un défaut de code.
    - `GET /api/diag` (jeton d'application) et `GET /api/admin/diag` (jeton
      admin) renvoient la même **empreinte** : nom de la base, horodatage du
      document, comptages par entité. Ni chaîne de connexion, ni hôte, ni
      secret. L'écran « Connexion au serveur » de l'app et l'en-tête du
      tableau de bord l'affichent : deux empreintes différentes = deux
      instances, la cause est trouvée en deux secondes.
    - `GET /health` (et `/`) porte en plus un **marqueur d'instance** public :
      un condensé de la base réellement utilisée, sans jeton. C'est le seul
      contrôle possible avant d'être connecté — on ouvre `<url-app>/health` et
      `<url-admin>/health` dans un navigateur : marqueurs identiques = même
      base, marqueurs différents = deux déploiements. Il se recoupe avec le
      champ `instance` des deux empreintes. Comme elles, il ne livre ni hôte,
      ni nom de base, ni chaîne de connexion.
    - **L'application DIT quand elle ne synchronise pas.** Elle est hors-ligne
      d'abord : sans serveur joignable elle continue de tourner sur son cache,
      tout paraît normal, et plus rien ne remonte. C'était totalement
      silencieux (`syncError` n'était posé que sur un 403). `syncState` /
      `lastSyncAt` / `pending` alimentent un bandeau permanent, sur tous les
      rôles.
    - `EXPO_PUBLIC_BACKEND_URL` est **figée au build** par Expo : changer la
      variable côté serveur ne change rien à un APK déjà construit, il faut
      reconstruire. Aucun `eas.json` ne la fixe dans le dépôt — elle dépend
      entièrement de l'environnement au moment du build.

28. **Migration Firebase : Firebase s'AJOUTE, il ne remplace rien.**
    Phase 2 de la migration (cf. `docs/MIGRATION-FIREBASE.md`). Mode retenu :
    **jeton personnalisé** (`Custom Authentication`), jamais « E-mail /
    Mot de passe » — aucun des trois circuits n'entre dans son moule (un
    collaborateur se connecte par téléphone, un planteur par un code
    `VAL-XXXX-YY`, le propriétaire sans identifiant), et le code à 6 chiffres
    est haché **sur le téléphone** alors que ce fournisseur exige le clair.
    - **La vérification du secret ne bouge pas.** Le serveur valide le `pin`
      exactement comme avant, puis frappe le jeton. Firebase n'intervient
      qu'après, pour la session. Aucune règle métier n'est déplacée.
    - **Le jeton VALEO de 30 jours RESTE**, et c'est délibéré : un jeton
      d'identité Firebase vit une heure et se renouvelle *par le réseau*. Un
      pisteur passe des jours en tournée sans réseau — avec Firebase seul, il
      serait déconnecté au bout d'une heure, loin de tout, ses pesées non
      synchronisées. L'application présente le jeton Firebase quand il est
      frais et **retombe sur le jeton VALEO** dès que le renouvellement échoue.
      Ne jamais retirer ce repli sans avoir résolu le hors-ligne autrement.
    - **Le serveur accepte les deux**, en aiguillant sur l'algorithme de
      signature (`_algo_du_jeton`) : HS256 = VALEO, RS256 = Firebase. Chaque
      vérificateur refuse ce qui n'est pas de son ressort, donc aucune
      confusion d'algorithme n'est possible.
    - **Les revendications du jeton Firebase sont celles du jeton VALEO**
      (`coopId`, `role`, `side`) : toute la suite — isolation entre coops,
      matrice de rôles, périmètre du planteur — s'applique sans changement.
      Un jeton du projet Firebase **dépourvu** de ces revendications n'ouvre
      rien : sinon, activer un jour un fournisseur externe ouvrirait
      l'application entière. Le `uid` doit en outre correspondre aux
      revendications, sans quoi l'un des deux ment.
    - **Tout est inerte sans compte de service** : `disponible()` renvoie faux,
      aucun jeton n'est frappé, le comportement est identique à aujourd'hui.
      C'est ce qui permet de déployer le code avant de basculer. Une panne
      Firebase ne doit **jamais** empêcher une connexion : un pisteur doit
      pouvoir aller peser même si Google est injoignable.
    - **Révocation** (`POST /api/admin/revoke`, bouton « Révoquer ») : coupe
      les sessions Firebase **et** pose `desactive`. Dire la limite plutôt que
      la masquer — un jeton VALEO déjà délivré reste valable jusqu'à son terme.
    - Le **SDK Firebase JS n'est pas installé** : l'échange et le
      renouvellement tiennent en deux requêtes REST (`firebase.ts`). Le SDK
      pèse plusieurs centaines de kilo-octets et tire des dépendances natives,
      pour des téléphones d'entrée de gamme. Ne pas l'ajouter sans raison.

29. **Migration Firestore : le backend reste le SEUL écrivain.**
    Phase 3 de la migration (cf. `docs/MIGRATION-FIREBASE.md`). `depot.py`
    isole *où* les octets sont rangés ; `authorize_state_write`, `merge_state`
    et `scope_state` **ne changent pas d'une ligne**.
    - **Le téléphone ne parle jamais directement à Firestore.** Arbitrage
      retenu contre les *Security Rules* : la matrice de rôles est longue et
      subtile, couverte par des centaines de tests ; la réécrire dans un
      langage moins expressif reviendrait à repartir de zéro sur la preuve, et
      une seule règle mal traduite ferait voir à une coopérative les données
      d'une autre. On y perd la lecture temps réel côté client ; on n'y rejoue
      pas la sécurité du produit.
    - **Un document par enregistrement.** L'unique document `appstate` est
      intransposable : Firestore plafonne un document à 1 Mio, limite un même
      document à ~1 écriture/seconde, et facture à l'opération. Une collection
      par entité ; les champs non-tableaux (`seq`, `memberSeq`, `saison`,
      `priceHistory`) dans `meta/etat`.
    - **On n'écrit que ce qui a changé.** `charger()` retient une empreinte de
      chaque ligne *telle qu'elle a été lue* (à la lecture, car des appels
      modifient une ligne sur place — comparer des objets laisserait passer le
      changement) ; `enregistrer()` n'envoie que les différences. Une pesée =
      2 écritures, mesuré par un test.
    - **Une absence n'est toujours PAS une suppression** (invariant 3) : est
      supprimé ce qui était dans la référence de lecture et n'est plus dans
      l'état enregistré — donc ce que `merge_state` a réellement retiré, jamais
      ce que le client n'a pas envoyé. Ce qui n'a pas été lu ne peut pas être
      supprimé. C'est LE danger de l'écriture différentielle.
    - **On ne lit que la coopérative du jeton** (`load_state(coopId)`) : c'est
      une optimisation de lecture, pas une règle — `scope_state` et
      `merge_state` filtraient déjà sur `coopId ==`. Les connexions et
      l'administration lisent tout (chercher un collaborateur par téléphone se
      fait sur toutes les coopératives).
    - **Toute la suite de sécurité tourne sur les DEUX bases.** C'est la seule
      preuve acceptable que rien n'a bougé. Un test qui écrit dans
      `server.db` en direct ne vaut que sur MongoDB : passer par `server.depot`.
    - **`DATA_BACKEND=mongo` par défaut** : le code se déploie avant la bascule.
    - Un identifiant fabriqué par un téléphone n'est pas un chemin Firestore
      valide (`/`, `..`, préfixe `__`) : `_cle_doc` en dérive une clé sûre, et
      l'identifiant réel reste dans le champ `id`.

30. **Déploiement Cloud Run : ce qui casse en production sans casser un test.**
    Phase 4 de la migration (cf. `docs/MIGRATION-FIREBASE.md`). FastAPI est
    conteneurisé **tel quel** — aucune ligne d'application ne change.
    Couvert par `backend/tests/test_deploiement.py`, parce qu'aucun test
    fonctionnel ne voyait ces trois défauts :
    - **`requirements.txt` ne s'installe pas** : `emergentintegrations==0.2.0`
      est absent de PyPI, donc l'image ne se construit pas. C'est
      `requirements-prod.txt` qui part en image, et un test vérifie qu'il
      couvre TOUS les imports réels. Ne pas revenir à `requirements.txt` dans
      le `Dockerfile`, et ne pas y ajouter pandas/numpy/boto3 : chaque
      mégaoctet se paie au démarrage à froid, devant un pisteur qui attend.
      `cryptography` est **indispensable** (RS256 des jetons Firebase).
    - **Firestore ne doit pas réclamer MongoDB** : avec
      `DATA_BACKEND=firestore`, `MONGO_URL` n'est plus exigé et aucun client
      Motor n'est créé.
    - **Le démarrage est borné** (`STARTUP_TIMEOUT_SECONDS`, 5 s) : une base
      injoignable faisait patienter 30 s le pilote MongoDB avant d'abandonner,
      à *chaque* démarrage d'instance. « Best-effort » sans borne de temps
      n'est pas best-effort.
    - Sur Cloud Run le compte de service est **ambiant** (`K_SERVICE` le
      signale) : ne jamais y déposer une clé privée.
    - `$PORT` est **imposé** par Cloud Run, l'écoute est sur `0.0.0.0`, et le
      conteneur ne tourne pas en root.
    - `firestore.rules` **refuse tout accès direct** : c'est la règle correcte
      (invariant 29), pas une précaution paresseuse — le backend écrit avec
      l'Admin SDK, qui contourne ces règles. Ne pas « ouvrir un peu pour
      tester » : la matrice de rôles n'existe pas là-bas.
    - Les secrets vivent dans **Secret Manager**, jamais dans `cloudbuild.yaml`
      (les journaux de construction sont conservés) ni dans l'image
      (`.dockerignore` tient `.env` dehors : une image poussée dans un
      registre est lisible par qui peut la tirer).

31. **Sur le web, l'API est à la MÊME ORIGINE ; sur mobile, elle est figée.**
    Phase 5 de la migration (cf. `docs/MIGRATION-FIREBASE.md`). Firebase Hosting
    renvoie `/api/**` vers Cloud Run : le site n'a donc **pas** besoin d'une URL
    de backend, et ne doit pas en figer une.
    - `resoudreBackend` (`backend.ts`, module pur) distingue trois cas, et le
      troisième est le piège : une URL **absente** veut dire « le serveur est
      ici » sur le web, et « aucun serveur » sur mobile. `store.ts` testait
      `if (!BACKEND)` — en même-origine la base est **vide**, donc
      l'application se serait crue hors-ligne à jamais sans rien envoyer.
      C'est `SERVEUR.joignable` qui décide, jamais la longueur de l'URL.
    - **Le frontend ne parle toujours pas à Firestore** (invariant 29) : il
      appelle `/api/...`, le backend autorise. Rien à réécrire côté écrans.
    - **Web : laisser `EXPO_PUBLIC_BACKEND_URL` vide. APK : y mettre l'URL
      absolue du service Cloud Run**, et **reconstruire** à chaque changement
      d'adresse (invariant 27 — Expo l'inline au build).
    - **L'accès au diagnostic ne dépend pas d'une panne.** `BandeauSync`
      renvoyait `null` quand la synchro allait bien, or c'est le SEUL accès à
      « Connexion au serveur ». C'est justement quand l'application se croit
      synchronisée — parce qu'elle parle à une autre instance — qu'il faut
      pouvoir comparer les empreintes. Une ligne discrète remplace l'alerte :
      ne jamais la re-supprimer.

32. **Bascule : un ancien client écrit dans le vide sans le savoir.**
    Phase 6 de la migration (cf. `docs/MIGRATION-FIREBASE.md`). C'est la seule
    phase où l'on peut perdre des données.
    - **Le danger** : `EXPO_PUBLIC_BACKEND_URL` est figée au build
      (invariant 27), donc un APK déjà installé appellera l'ANCIENNE instance
      pour toujours. Ses pesées y seront enregistrées, dans une base que
      personne ne lit, et l'application affichera « Synchronisé ». Perte
      silencieuse, et de son côté le pisteur ne voit rien.
    - **Le remède** : `BACKEND_DEPRECIE` sur l'ancien déploiement. Le serveur
      ajoute `X-Valeo-Deprecie` à **toutes** ses réponses, refus compris (un
      jeton expiré doit prévenir aussi), et l'application l'affiche en rouge
      avant tout le reste. L'ancien **continue de servir** : des agents sont
      peut-être en tournée avec des pesées à envoyer.
    - **C'est un EN-TÊTE, jamais un champ de l'état.** Un champ ajouté à
      `/api/state` repartirait au serveur via `prepareSync` et serait lu comme
      une modification interdite — 403 sur tout le PUT (invariant 23).
    - **Un en-tête HTTP ne véhicule que du latin-1.** Un message en français
      attrape un tiret cadratin ou une apostrophe courbe, et le serveur répond
      alors **500 sur toutes les requêtes** : l'avertissement mettait à terre
      l'instance qu'il devait annoter. `entete_transportable` assainit au
      chargement (les accents passent) et le middleware ne peut jamais lever.
    - **`expose_headers` est indispensable** : sans lui un navigateur masque
      l'en-tête au JavaScript et le bandeau n'apparaît jamais sur le web. Le
      harnais de test ne fait pas de CORS, d'où un contrôle sur la
      configuration elle-même.
    - **NE JAMAIS migrer par `/api/admin/state`** : il retire les empreintes
      `pin` (invariant 5, et c'est correct). Les comptages concorderaient, les
      données seraient là, et **plus personne ne pourrait se connecter** le
      lendemain. Passer par `scripts/migrer_vers_firestore.py`, qui lit
      MongoDB côté serveur.
    - **Le dernier passage de migration se fait avec `--miroir`** : la
      migration écrit et n'efface jamais, donc une fiche supprimée entre deux
      passages survivrait dans Firestore et réapparaîtrait après la bascule.
    - **`scripts/verifier_bascule.py`** rend le « ne coupez rien avant » 
      exécutable : deux instances distinctes, comptages concordants, connexion
      d'un compte réel, écriture d'essai relue puis retirée, et dépréciation
      annoncée. Deux bases vides « concordent » : il refuse aussi ce cas.
    - **Le point de non-retour n'est pas le déploiement, c'est la première
      pesée enregistrée sur le nouveau.** Avant cela le retour est immédiat
      (`DATA_BACKEND=mongo`) : MongoDB n'est jamais modifié. Après, les
      écritures faites sur Firestore n'y sont pas, et aucun script ne fait le
      chemin inverse.

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

- **Rôles terrain (pisteur, magasinier) et vérification des poids.** Cf.
  invariants 20 à 22. Le pisteur et le magasinier recrutent un planteur ; le
  pisteur accorde une avance sur-le-champ (après avoir vu la situation du
  planteur) ; le magasinier vérifie les poids ramenés, et c'est le poids
  constaté qui entre en stock. Arbitrage retenu : la vérification **n'altère pas
  la pesée d'origine** — le planteur a déjà été payé au bord-champ sur le poids
  déclaré, et rouvrir ce calcul reviendrait à lui réclamer de l'argent après
  coup. L'écart est en revanche **réglé sur la caisse du pisteur** dans les deux
  sens (invariant 10) : le manquant est à sa charge — c'est lui qui a engagé
  l'argent de la coopérative sur un poids que le magasin n'a pas retrouvé — et
  le **poids plus** lui revient, le mandat n'ayant acheté qu'un poids donné.
- **Demande d'avance du planteur restaurée.** Cf. invariant 23 : la
  fonctionnalité existait, mais toute synchronisation du planteur était refusée
  (403) à cause d'un champ ajouté par `migrate()`.
- **Dépenses du pisteur cloisonnées.** Cf. invariant 24 : prestataire rémunéré à
  la commission, il est autonome sur ses frais — ils ne sortent plus de son
  compte et n'entament plus son mandat.
- **Purge des mouvements** dans l'espace admin : repartir d'une campagne vierge
  sans ressaisir les collaborateurs ni les planteurs.
- **Vérification globale par livraison.** Cf. invariant 20 : le magasinier pèse
  le chargement en une fois, plus planteur par planteur. Arbitrage retenu :
  imputer le poids global sur les collectes (`repartirVerif`) plutôt que créer
  une entité `livraisons` — le stock et la caisse gardent leurs formules, les
  livraisons antérieures restent lisibles, et la surface de changement reste
  minimale.
- **Avances indépendantes par créancier.** Cf. invariant 25.
- **Diagnostic de connexion.** Cf. invariant 27 : empreinte comparable des deux
  côtés, et l'application ne tombe plus en panne de synchro en silence.
- **Espace Admin réellement synchronisé.** Cf. invariant 26 : fusion par
  enregistrement au lieu du remplacement en bloc, barèmes écrits là où l'app
  les lit, gestion des comptes (code secret, désactivation, suppression),
  journal d'activité, et les empreintes ne quittent plus le serveur.

- **Migration Firebase, phase 2 (authentification).** Cf. invariant 28 et
  `docs/MIGRATION-FIREBASE.md`. Arbitrage retenu : jeton personnalisé plutôt
  que « E-mail / Mot de passe », et **coexistence** des deux jetons plutôt que
  remplacement — le hors-ligne l'impose.

- **Migration Firebase, phase 3 (Firestore).** Cf. invariant 29. Arbitrage
  retenu : **backend seul écrivain** plutôt que *Security Rules*, un document
  par enregistrement, écriture différentielle et lecture bornée à la
  coopérative. Script de bascule `backend/scripts/migrer_vers_firestore.py`.

- **Migration Firebase, phase 4 (Cloud Run).** Cf. invariant 30. FastAPI
  conteneurisé tel quel ; trois défauts de déploiement corrigés au passage,
  chacun invisible pour la suite fonctionnelle.
- **Migration Firebase, phase 5 (frontend + Hosting).** Cf. invariant 31.
  Aucun écran modifié : seule la résolution de l'adresse du backend change.
  Le site construit a été piloté dans un navigateur, servi comme par Hosting,
  jusqu'à vérifier qu'une pesée arrive bien en base.

- **Migration Firebase, phase 6 (outillage de bascule).** Cf. invariant 32 :
  signal de dépréciation pour les APK figés, migration en miroir, et contrôle
  de pré-bascule exécutable. La bascule elle-même reste une opération humaine.

### Reste à faire
- **Exécuter la bascule.** Suivre la marche à suivre de
  `docs/MIGRATION-FIREBASE.md` (§ Phase 6). Ne pas couper l'existant tant que
  Firebase n'a pas tourné en parallèle, et garder une sauvegarde de MongoDB.
- **Firestore : deux points à surveiller.** `priceHistory` vit dans le document
  `meta` (la limite de 1 Mio vaut aussi pour lui) ; les connexions balaient
  encore les collaborateurs de toutes les coopératives — un index serait le
  prochain gain si la facture surprend.
- **Base des villages.** `src/coop/geo/` ne contient que districts, régions et
  départements. Sous-préfectures et villages restent à importer depuis une base
  officielle (`node scripts/import-geo.mjs base.csv`) ; jusque-là le village est
  en saisie libre marquée `villageLibre`.
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
