"""Dépôt de données — Phase 3 de la migration : MongoDB **ou** Firestore.

Le pari de cette phase
----------------------
`authorize_state_write`, `merge_state` et `scope_state` ne bougent pas d'une
ligne. C'est délibéré : cette matrice de rôles est ce qui protège les
coopératives les unes des autres, et elle est couverte par près de deux cents
tests. La réécrire en *Security Rules* reviendrait à la refaire dans un langage
moins expressif et à repartir de zéro sur la preuve — une seule règle mal
traduite et une coopérative voit les données d'une autre.

Le **backend reste donc le seul écrivain** (option « a »). Le téléphone ne
parle jamais directement à Firestore : il parle au backend, qui autorise puis
écrit avec les droits d'administration. Ce qui change ici, c'est uniquement
*où* les octets sont rangés.

Pourquoi un document par enregistrement
---------------------------------------
MongoDB stockait TOUT l'état dans un unique document `appstate`. Transposé tel
quel à Firestore, ce modèle est doublement impossible :

* un document Firestore est plafonné à **1 Mio** — quelques milliers de pesées
  et la coopérative ne peut plus rien enregistrer ;
* Firestore facture **à l'opération** et limite un même document à environ une
  écriture par seconde : tout le trafic d'une coopérative sur un seul document,
  c'est un goulot d'étranglement autant qu'une facture.

Chaque enregistrement devient donc **son propre document**, dans une collection
par entité (`members/<id>`, `collections/<id>`…). Les champs qui ne sont pas
des tableaux (`seq`, `memberSeq`, `saison`, `priceHistory`) tiennent dans un
document `meta/etat`.

Et pour ne pas payer une écriture par ligne à chaque synchronisation, on
n'écrit **que ce qui a changé** : `charger()` retient une empreinte de chaque
ligne telle qu'elle a été lue, `enregistrer()` compare et n'envoie que les
différences. Une pesée = une écriture, pas mille.

L'empreinte est prise **à la lecture**, sur le contenu d'origine. Certains
appels modifient une ligne sur place (`ligne["desactive"] = True`) : comparer
des objets aurait laissé passer ces changements, comparer des empreintes figées
les détecte.
"""

import copy
import hashlib
import json
import os
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Optional

# Tableaux d'entités : une collection Firestore chacun. Doit rester aligné sur
# `ENTITY_ARRAYS` de `server.py` (+ `coops`, qui a le même traitement).
TABLEAUX = ["coops", "staff", "members", "collections", "loans", "mandats",
            "depenses", "settlements", "sorties"]
# Champs de l'état qui ne sont pas des tableaux d'enregistrements.
SCALAIRES = ["seq", "memberSeq", "saison", "priceHistory"]

META_DOC = "etat"
LIMITE_AUDIT = 300

# Empreintes des lignes telles qu'elles ont été LUES, par tâche asyncio (donc
# par requête : FastAPI traite chaque requête dans sa propre tâche). Une
# variable de module serait fausse dès deux requêtes simultanées.
_base: ContextVar[Optional[dict]] = ContextVar("depot_base", default=None)


def _empreinte_ligne(row: dict) -> str:
    return hashlib.sha1(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest()


def _index(state: dict) -> dict:
    """Empreinte de tout l'état : une par ligne, une pour les scalaires."""
    idx = {e: {} for e in TABLEAUX}
    for e in TABLEAUX:
        for row in state.get(e) or []:
            if isinstance(row, dict) and row.get("id"):
                idx[e][str(row["id"])] = _empreinte_ligne(row)
    return idx


def _cle_doc(rid: str) -> str:
    """Identifiant de document Firestore sûr, dérivé de l'identifiant métier.

    Les identifiants sont fabriqués par les téléphones : rien ne garantit
    qu'ils soient des chemins Firestore valides. Une barre oblique y crée une
    sous-collection, un nom commençant par « __ » est réservé, « . » et « .. »
    sont interdits. On dérive alors une clé, sans jamais perdre l'identifiant
    réel : il reste écrit dans le champ `id` du document.
    """
    sur = (rid and "/" not in rid and rid not in (".", "..")
           and not rid.startswith("__") and len(rid.encode()) <= 1500)
    return rid if sur else "x_" + hashlib.sha1((rid or "").encode()).hexdigest()


def _filtre_coop(coop_id: str):
    from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: WPS433

    return FieldFilter("coopId", "==", coop_id)


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# MongoDB — le comportement d'aujourd'hui, inchangé
# --------------------------------------------------------------------------- #

class DepotMongo:
    """Un seul document `appstate`, exactement comme avant cette phase.

    `obtenir_db` est un callable et non la base elle-même : le harnais de test
    remplace `server.db` par une base simulée, et le dépôt doit suivre.
    """

    def __init__(self, obtenir_db, origine: str):
        self._db = obtenir_db
        self._origine = origine

    @property
    def db(self):
        return self._db()

    @property
    def nom(self) -> str:
        return self.db.name

    @property
    def origine(self) -> str:
        return self._origine

    async def preparer(self) -> None:
        # Purge automatique des compteurs de tentatives (invariant 17) : sans
        # elle, un balayage d'identifiants ferait grossir la collection sans fin.
        await self.db.login_attempts.create_index("expiresAt", expireAfterSeconds=0)

    async def charger(self, vide, coop_id: Optional[str] = None) -> dict:
        # `coop_id` est ignoré : tout l'état tient dans un seul document, le
        # lire en entier ne coûte pas plus cher. Le filtrage reste fait par
        # `scope_state` et `merge_state`, comme toujours.
        doc = await self.db.appstate.find_one({"_id": "main"})
        if doc and isinstance(doc.get("data"), dict):
            return doc["data"]
        return vide()

    async def enregistrer(self, data: dict) -> None:
        await self.db.appstate.update_one(
            {"_id": "main"},
            {"$set": {"data": data, "updatedAt": _maintenant()}},
            upsert=True,
        )

    async def maj_at(self) -> Optional[str]:
        doc = await self.db.appstate.find_one({"_id": "main"}) or {}
        return doc.get("updatedAt")

    # -------------------------- configuration admin ------------------------ #
    async def admin_config(self) -> dict:
        return await self.db.admin_config.find_one({"_id": "admin"}) or {}

    async def admin_config_poser(self, champs: dict) -> None:
        await self.db.admin_config.update_one({"_id": "admin"}, {"$set": champs}, upsert=True)

    # ----------------------- compteurs de connexion ------------------------ #
    async def login_lire(self, cle: str) -> dict:
        return await self.db.login_attempts.find_one({"_id": cle}) or {}

    async def login_poser(self, cle: str, champs: dict) -> None:
        await self.db.login_attempts.update_one({"_id": cle}, {"$set": champs}, upsert=True)

    async def login_effacer(self, cle: str) -> None:
        await self.db.login_attempts.delete_one({"_id": cle})

    # ------------------------------- audit --------------------------------- #
    async def audit_ajouter(self, entree: dict) -> None:
        await self.db.audit.insert_one(dict(entree))

    async def audit_lister(self, coop_id: Optional[str] = None) -> list:
        filtre = {"coopId": coop_id} if coop_id else {}
        cur = self.db.audit.find(filtre, {"_id": 0}).sort("at", -1).limit(LIMITE_AUDIT)
        return await cur.to_list(length=LIMITE_AUDIT)

    async def audit_effacer(self, coop_id: Optional[str] = None) -> int:
        filtre = {"coopId": coop_id} if coop_id else {}
        res = await self.db.audit.delete_many(filtre)
        return getattr(res, "deleted_count", 0)


# --------------------------------------------------------------------------- #
# Firestore — un document par enregistrement, écriture différentielle
# --------------------------------------------------------------------------- #

class DepotFirestore:
    """Un document par enregistrement. N'écrit que ce qui a changé.

    Le client attendu est un client Firestore **asynchrone**
    (`google.cloud.firestore.AsyncClient`). On n'utilise qu'une petite partie
    de son interface — c'est ce qui rend le dépôt testable contre un double.
    """

    # Firestore refuse plus de 500 opérations par lot.
    TAILLE_LOT = 450

    def __init__(self, client, nom: str, origine: str):
        self._client = client
        self._nom = nom
        self._origine = origine

    @property
    def nom(self) -> str:
        return self._nom

    @property
    def origine(self) -> str:
        return self._origine

    async def preparer(self) -> None:
        # Rien à créer : Firestore indexe seul les champs simples. La purge des
        # compteurs de connexion se règle par une **règle TTL** sur le champ
        # `expiresAt` de la collection `login_attempts`, à activer une fois dans
        # la console (cf. docs/MIGRATION-FIREBASE.md). En attendant, on efface
        # aussi les compteurs périmés à la lecture.
        return None

    async def charger(self, vide, coop_id: Optional[str] = None) -> dict:
        """Lit l'état. `coop_id` borne la lecture à UNE coopérative.

        C'est le point où Firestore se paie : il facture à l'opération, et un
        `GET /api/state` qui relit les documents de toutes les coopératives
        coûterait proportionnellement à la base entière, pour un téléphone qui
        n'a le droit d'en voir qu'une tranche.

        Borner ne change **rien** au comportement : `scope_state` et
        `merge_state` filtrent déjà sur `coopId ==`, à l'identique. Les lignes
        écartées ici sont exactement celles qu'ils écartaient ensuite. Ce qui
        n'est pas lu n'est pas non plus dans la référence du diff, donc rien
        n'est pris pour une suppression (invariant 3).

        Sans `coop_id`, on lit tout : l'administration et les connexions en
        ont besoin (chercher un collaborateur par téléphone se fait sur toutes
        les coopératives).
        """
        state = vide()
        for e in TABLEAUX:
            lignes = []
            if coop_id and e == "coops":
                # Une lecture d'un document, pas un balayage de collection.
                snap = await self._client.collection("coops").document(_cle_doc(coop_id)).get()
                if getattr(snap, "exists", False):
                    row = snap.to_dict() or {}
                    row.setdefault("id", snap.id)
                    lignes.append(row)
            else:
                source = self._client.collection(e)
                if coop_id:
                    source = source.where(filter=_filtre_coop(coop_id))
                async for snap in source.stream():
                    row = snap.to_dict() or {}
                    row.setdefault("id", snap.id)
                    lignes.append(row)
            state[e] = lignes
        meta = await self._client.collection("meta").document(META_DOC).get()
        if getattr(meta, "exists", False):
            for k, v in (meta.to_dict() or {}).items():
                if k in SCALAIRES:
                    state[k] = v
        # On fige ici l'état tel qu'il a été lu : c'est la référence du diff.
        _base.set(_index(state))
        return state

    async def enregistrer(self, data: dict) -> None:
        base = _base.get() or {e: {} for e in TABLEAUX}
        courant = _index(data)
        operations = []

        for e in TABLEAUX:
            avant, apres = base.get(e) or {}, courant[e]
            lignes = {str(r["id"]): r for r in (data.get(e) or [])
                      if isinstance(r, dict) and r.get("id")}
            for rid, emp in apres.items():
                if avant.get(rid) != emp:
                    operations.append(("set", e, rid, lignes[rid]))
            # Une ligne présente à la lecture et absente à l'écriture a été
            # réellement supprimée (`deletions`, purge, suppression admin) :
            # `merge_state` garde tout le reste, une absence n'y est jamais
            # une suppression.
            for rid in avant:
                if rid not in apres:
                    operations.append(("delete", e, rid, None))

        # Le document `meta` porte les champs qui ne sont pas des tableaux et
        # l'horodatage lu par l'empreinte de diagnostic (`/api/diag`). Il est
        # écrit à CHAQUE enregistrement, complet : une seule opération dans
        # tous les cas, donc rien à économiser en le fractionnant, et le
        # document ne reste jamais à moitié rempli. Sans lui, « dernière
        # écriture » resterait figé alors que la base bouge.
        operations.append(("fusion", "meta", META_DOC,
                           {**{k: data.get(k) for k in SCALAIRES}, "updatedAt": _maintenant()}))

        for i in range(0, len(operations), self.TAILLE_LOT):
            lot = self._client.batch()
            for genre, coll, rid, charge in operations[i:i + self.TAILLE_LOT]:
                ref = self._client.collection(coll).document(_cle_doc(rid))
                if genre == "delete":
                    lot.delete(ref)
                elif genre == "fusion":
                    lot.set(ref, charge, merge=True)
                else:
                    lot.set(ref, charge)
            await lot.commit()
        # L'état écrit devient la nouvelle référence : un second enregistrement
        # dans la même requête ne doit pas tout réécrire.
        _base.set(courant)

    async def maj_at(self) -> Optional[str]:
        snap = await self._client.collection("meta").document(META_DOC).get()
        return (snap.to_dict() or {}).get("updatedAt") if getattr(snap, "exists", False) else None

    # -------------------------- configuration admin ------------------------ #
    async def admin_config(self) -> dict:
        snap = await self._client.collection("admin_config").document("admin").get()
        return (snap.to_dict() or {}) if getattr(snap, "exists", False) else {}

    async def admin_config_poser(self, champs: dict) -> None:
        await self._client.collection("admin_config").document("admin").set(dict(champs), merge=True)

    # ----------------------- compteurs de connexion ------------------------ #
    async def login_lire(self, cle: str) -> dict:
        snap = await self._client.collection("login_attempts").document(_cle_doc(cle)).get()
        return (snap.to_dict() or {}) if getattr(snap, "exists", False) else {}

    async def login_poser(self, cle: str, champs: dict) -> None:
        await self._client.collection("login_attempts").document(_cle_doc(cle)).set(dict(champs), merge=True)

    async def login_effacer(self, cle: str) -> None:
        await self._client.collection("login_attempts").document(_cle_doc(cle)).delete()

    # ------------------------------- audit --------------------------------- #
    async def audit_ajouter(self, entree: dict) -> None:
        ref = self._client.collection("audit").document()
        await ref.set(dict(entree))

    async def audit_lister(self, coop_id: Optional[str] = None) -> list:
        lignes = []
        async for snap in self._client.collection("audit").stream():
            row = snap.to_dict() or {}
            if coop_id is None or row.get("coopId") == coop_id:
                lignes.append(row)
        # Même ordre que MongoDB : le plus récent d'abord, 300 au plus.
        lignes.sort(key=lambda r: str(r.get("at") or ""), reverse=True)
        return lignes[:LIMITE_AUDIT]

    async def audit_effacer(self, coop_id: Optional[str] = None) -> int:
        a_effacer = []
        async for snap in self._client.collection("audit").stream():
            row = snap.to_dict() or {}
            if coop_id is None or row.get("coopId") == coop_id:
                a_effacer.append(snap.id)
        for i in range(0, len(a_effacer), self.TAILLE_LOT):
            lot = self._client.batch()
            for rid in a_effacer[i:i + self.TAILLE_LOT]:
                lot.delete(self._client.collection("audit").document(rid))
            await lot.commit()
        return len(a_effacer)


# --------------------------------------------------------------------------- #
# Choix du dépôt
# --------------------------------------------------------------------------- #

def choisir(obtenir_db, origine_mongo: str):
    """`DATA_BACKEND=firestore` bascule ; sinon MongoDB, comme aujourd'hui.

    Le défaut est **MongoDB** : ce code peut donc être déployé avant toute
    bascule, sans rien changer au comportement.
    """
    if os.environ.get("DATA_BACKEND", "mongo").lower() != "firestore":
        return DepotMongo(obtenir_db, origine_mongo)

    import firebase_auth
    from google.cloud import firestore  # noqa: WPS433 (import tardif volontaire)

    app = firebase_auth._init()
    if app is None:
        raise RuntimeError(
            "DATA_BACKEND=firestore mais aucun compte de service Firebase n'est "
            "configuré (FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_FILE / "
            "GOOGLE_APPLICATION_CREDENTIALS)."
        )
    projet = app.project_id
    base = os.environ.get("FIRESTORE_DATABASE", "(default)")
    client = firestore.AsyncClient(project=projet, credentials=app.credential.get_credential(),
                                   database=base)
    return DepotFirestore(client, base, f"firestore|{projet}|{base}")


def base_de_lecture():
    """Empreintes de la dernière lecture. Réservé aux tests."""
    return copy.deepcopy(_base.get())
