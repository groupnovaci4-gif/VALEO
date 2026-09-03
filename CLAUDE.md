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
- `geo.ts` + `geo/` — base des localités de Côte d'Ivoire et sélection en cascade
  (District → Région → Département → Village). Module **pur**. La base est
  **générée** (`yarn geo:build`) depuis `geo/ci-decoupage.csv` : voir
  `geo/README.md` pour charger une base officielle complète.
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

### Reste à faire
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
