import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Admin auth config (secrets must be provided via environment / deployment secrets)
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
JWT_SECRET = os.environ.get("JWT_SECRET")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD environment variable is required")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))

STATE_ID = "main"

app = FastAPI()
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def empty_state() -> dict:
    return {
        "saison": "Campagne 2025-2026",
        "prixKg": 1800,
        "seq": 1,
        "memberSeq": 1,
        "commissionRate": 25,
        "coop": {"nom": "Coopérative", "momo": [], "filieres": []},
        "coops": [],
        "settlements": [],
        "staff": [],
        "members": [],
        "collections": [],
        "loans": [],
        "mandats": [],
        "depenses": [],
        "priceHistory": [],
    }


async def load_state() -> dict:
    doc = await db.appstate.find_one({"_id": STATE_ID})
    if doc and isinstance(doc.get("data"), dict):
        return doc["data"]
    return empty_state()


async def save_state(data: dict) -> None:
    await db.appstate.update_one(
        {"_id": STATE_ID},
        {"$set": {"data": data, "updatedAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


import hashlib
import secrets as _secrets


def _hash_password(pw: str, salt: Optional[bytes] = None, iterations: int = 200_000):
    if salt is None:
        salt = _secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", (pw or "").encode("utf-8"), salt, iterations)
    return salt.hex(), dk.hex(), iterations


async def verify_admin_password(pw: str) -> bool:
    cfg = await db.admin_config.find_one({"_id": "admin"})
    if cfg and cfg.get("pwd_hash") and cfg.get("pwd_salt"):
        _, dk_hex, _ = _hash_password(pw, bytes.fromhex(cfg["pwd_salt"]), cfg.get("iterations", 200_000))
        return _secrets.compare_digest(dk_hex, cfg["pwd_hash"])
    # Aucun mot de passe personnalisé enregistré : on retombe sur celui de l'environnement.
    return _secrets.compare_digest(pw or "", ADMIN_PASSWORD)


def issue_token() -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": "owner", "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def require_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié")
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        if payload.get("sub") != "owner":
            raise jwt.InvalidTokenError("wrong subject")
        return payload
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée")


class LoginRequest(BaseModel):
    password: str


class StateBody(BaseModel):
    data: dict
    # Suppressions explicites {entite: [id, ...]}. Sans cette liste, un
    # enregistrement absent de `data` est simplement inconnu du client, jamais
    # supprimé (cf. merge_state).
    deletions: Optional[dict] = None


class ChangePwdRequest(BaseModel):
    current: str
    new: str


# --------------------------- Auth utilisateurs (coop/planteur) --------------------------- #
ENTITY_ARRAYS = ["staff", "members", "collections", "loans", "mandats", "depenses", "settlements"]


def _norm_phone(p: Optional[str]) -> str:
    return "".join(ch for ch in (p or "") if ch.isdigit())


def _norm_text(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def verify_secret(secret: str, record: Optional[dict]) -> bool:
    """Vérifie un PinRecord PBKDF2-HMAC-SHA256 créé côté client (sans réinitialisation)."""
    if not record:
        return False
    try:
        salt = bytes.fromhex(record["saltHex"])
        expected = bytes.fromhex(record["verifierHex"])
        iterations = int(record.get("iterations", 15000))
        if not (1 <= iterations <= 10_000_000):
            return False
        dk = hashlib.pbkdf2_hmac("sha256", (secret or "").encode("utf-8"), salt, iterations, dklen=len(expected))
        return _secrets.compare_digest(dk, expected)
    except Exception:
        return False


def make_pin_record(secret: str, iterations: int = 15000) -> dict:
    salt = _secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", (secret or "").encode("utf-8"), salt, iterations, dklen=32)
    return {"scheme": "pbkdf2-sha256", "iterations": iterations, "saltHex": salt.hex(), "verifierHex": dk.hex(), "version": 1}


def issue_user_token(identity: dict) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({**identity, "iat": now, "exp": now + timedelta(days=30)}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def require_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié")
    try:
        p = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub", "coopId", "side"]})
        if not p.get("coopId"):
            raise jwt.InvalidTokenError("missing coopId")
        return {"sub": p["sub"], "coopId": p["coopId"], "role": p.get("role"), "side": p["side"]}
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée")


# Champs du profil coopérative jamais transmis à un planteur (comptes de
# encaissement de la coop). Le planteur n'en a aucun usage.
COOP_FIELDS_HIDDEN_FROM_PLANTEUR = {"momo"}
# Champs du personnel exposés au planteur : juste de quoi nommer l'agent sur un
# reçu. Jamais de téléphone, e-mail, pièce d'identité ni empreinte de code.
STAFF_PUBLIC_FIELDS = {"id", "coopId", "nom", "role", "fonction"}
# `pin` est une empreinte PBKDF2 : elle ne doit JAMAIS quitter le serveur, sinon
# un code à 6 chiffres (10^6 combinaisons) se casse hors-ligne en quelques minutes.
SECRET_FIELDS = {"pin"}


def _strip_secrets(row: dict) -> dict:
    return {k: v for k, v in row.items() if k not in SECRET_FIELDS}


def _public_staff(row: dict) -> dict:
    return {k: v for k, v in row.items() if k in STAFF_PUBLIC_FIELDS}


def scope_state(state: dict, coop_id: str, me: Optional[dict] = None) -> dict:
    """Tranche de l'état visible par l'appelant.

    Deux niveaux de cloisonnement :
    1. **Coopérative** (isolation tenant) — jamais les données d'une autre coop.
    2. **Rôle** — un planteur (`side="planteur"`) ne reçoit QUE ses propres
       données (B3) : sans cela, chaque téléphone de planteur détenait la liste
       complète des membres, collectes et avances de la coopérative.
    Dans tous les cas les empreintes de code secret (`pin`) sont retirées.
    """
    coops = state.get("coops") or []
    co = next((c for c in coops if c.get("id") == coop_id), None) or {}
    is_planteur = bool(me) and me.get("side") == "planteur"
    member_id = me.get("sub") if is_planteur else None

    if is_planteur:
        co = {k: v for k, v in co.items() if k not in COOP_FIELDS_HIDDEN_FROM_PLANTEUR}

    out = {
        "saison": state.get("saison"),
        "prixKg": state.get("prixKg"),
        "seq": state.get("seq", 1),
        "memberSeq": state.get("memberSeq", 1),
        "commissionRate": state.get("commissionRate", 25),
        "coops": [co] if co else [],
        "coop": co or state.get("coop", {}),
        "prices": co.get("prices") or state.get("prices"),
        "commissions": co.get("commissions") or state.get("commissions"),
        "priceHistory": state.get("priceHistory", []),
    }
    for e in ENTITY_ARRAYS:
        rows = [x for x in (state.get(e) or []) if isinstance(x, dict) and x.get("coopId") == coop_id]
        if is_planteur:
            if e == "members":
                rows = [x for x in rows if x.get("id") == member_id]
            elif e in ("collections", "loans", "settlements"):
                rows = [x for x in rows if x.get("memberId") == member_id]
            elif e == "staff":
                # Annuaire minimal : nommer l'agent sur un reçu, rien de plus.
                rows = [_public_staff(x) for x in rows]
            else:
                rows = []  # mandats, dépenses : affaires internes de la coop.
        out[e] = [_strip_secrets(x) for x in rows]
    return out


# ----------------------- Fusion par enregistrement (B2) ----------------------- #
# L'ancienne fusion remplaçait le tableau entier d'une coopérative par celui du
# client : deux agents hors-ligne s'écrasaient mutuellement à la synchro (une
# pesée pouvait disparaître définitivement). On fusionne désormais
# enregistrement par enregistrement, la version la plus récente gagnant.

# Tolérance d'avance d'horloge : au-delà, l'horodatage client est ramené à
# l'heure serveur pour qu'un téléphone mal réglé ne gèle pas un enregistrement.
CLOCK_SKEW_TOLERANCE = timedelta(minutes=5)


def _parse_ts(value) -> Optional[datetime]:
    """Analyse un horodatage ISO (client `...Z` ou serveur `...+00:00`)."""
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _normalize_ts(value, now: datetime):
    """(horodatage comparable, chaîne à stocker).

    La chaîne d'origine est conservée telle quelle : la réécrire dans un autre
    format ferait apparaître une différence à chaque renvoi et déclencherait de
    faux refus d'autorisation. Seule une horloge client en avance est ramenée.
    """
    ts = _parse_ts(value)
    if ts is None:
        return None, None
    if ts > now + CLOCK_SKEW_TOLERANCE:
        return now, now.isoformat()
    return ts, value


def _rows_by_id(rows) -> dict:
    out = {}
    for r in rows or []:
        if isinstance(r, dict) and r.get("id"):
            out[r["id"]] = r
    return out


def merge_state(state: dict, incoming: dict, coop_id: str, deletions: Optional[dict] = None) -> dict:
    """Fusionne la tranche reçue enregistrement par enregistrement.

    Règles :
    - `coopId` est toujours réécrit par le serveur (anti-IDOR).
    - un enregistrement absent de la charge utile n'est PAS supprimé : seule la
      liste explicite `deletions` supprime (sinon un client au périmètre réduit
      effacerait tout ce qu'il ne voit pas) ;
    - sur conflit, l'enregistrement au `updatedAt` le plus récent gagne ; sans
      horodatage, la version stockée est conservée (on ne régresse jamais).
    """
    now = datetime.now(timezone.utc)
    deletions = deletions or {}
    for e in ENTITY_ARRAYS:
        others = [x for x in (state.get(e) or []) if not isinstance(x, dict) or x.get("coopId") != coop_id]
        merged = _rows_by_id([x for x in (state.get(e) or []) if isinstance(x, dict) and x.get("coopId") == coop_id])
        # Idempotence (M5) : une pesée validée deux fois (double-tap, rejeu
        # réseau après une réponse perdue) porte le même `clientOpId` ; on ne
        # crée alors qu'un seul enregistrement, donc un seul paiement.
        seen_ops = {r["clientOpId"]: rid for rid, r in merged.items() if r.get("clientOpId")}
        for rid, incoming_row in _rows_by_id(incoming.get(e)).items():
            stored = merged.get(rid)
            incoming_ts, stamp = _normalize_ts(incoming_row.get("updatedAt"), now)
            if stored is None:
                op = incoming_row.get("clientOpId")
                if op and op in seen_ops and seen_ops[op] != rid:
                    continue  # doublon de la même opération : ignoré.
                merged[rid] = {**incoming_row, "coopId": coop_id, "updatedAt": stamp or now.isoformat()}
                if op:
                    seen_ops[op] = rid
                continue
            stored_ts = _parse_ts(stored.get("updatedAt"))
            if incoming_ts is not None and (stored_ts is None or incoming_ts > stored_ts):
                # Fusion CHAMP par champ : le client ne reçoit pas tout (les
                # empreintes `pin` ne quittent jamais le serveur, un planteur ne
                # voit qu'un annuaire réduit du personnel). Écraser
                # l'enregistrement entier effacerait ces champs invisibles.
                merged[rid] = {**stored, **incoming_row, "coopId": coop_id, "updatedAt": stamp}
        for rid in deletions.get(e) or []:
            merged.pop(rid, None)
        state[e] = others + list(merged.values())

    inc_coops = incoming.get("coops") or []
    inc_co = next((c for c in inc_coops if c.get("id") == coop_id), None) or (inc_coops[0] if inc_coops else None) or incoming.get("coop") or {}
    stored_co = next((c for c in (state.get("coops") or []) if c.get("id") == coop_id), None)
    # Le profil coop n'est envoyé complet que par le patron ; pour les autres
    # rôles, l'autorisation a déjà vérifié qu'il est inchangé.
    inc_co = {**(stored_co or {}), **inc_co, "id": coop_id}
    state["coops"] = [c for c in (state.get("coops") or []) if c.get("id") != coop_id] + [inc_co]
    state["seq"] = max(int(state.get("seq", 1) or 1), int(incoming.get("seq", 1) or 1))
    state["memberSeq"] = max(int(state.get("memberSeq", 1) or 1), int(incoming.get("memberSeq", 1) or 1))
    if incoming.get("saison"):
        state["saison"] = incoming["saison"]
    if incoming.get("priceHistory") is not None:
        state["priceHistory"] = incoming["priceHistory"]
    return state


# ------------------- Autorisation par rôle côté serveur (B1) ------------------- #
# Les garde-fous d'interface (`canDecide={false}`, boutons masqués) sont
# cosmétiques : un client modifié pouvait réécrire tout l'état de sa
# coopérative. On compare donc l'entrant au stocké et on refuse (403) toute
# modification que le rôle n'a pas le droit de faire.

# Champs qu'un rôle peut modifier sur un enregistrement existant.
# `updatedAt` accompagne toute écriture légitime.
PLANTEUR_MEMBER_FIELDS = {"momo", "photo", "updatedAt"}
PLANTEUR_COLLECTION_FIELDS = {"signature", "updatedAt"}
STAFF_SELF_FIELDS = {"photo", "updatedAt"}
# Pesée : signature du planteur et solde d'anciens restes dus (`resteSolde`).
AGENT_COLLECTION_FIELDS = {"signature", "resteSolde", "updatedAt"}
IMMUTABLE_FIELDS = {"id", "coopId"}
# Réglages financiers de la coopérative : patron uniquement.
COOP_SETTINGS_KEYS = ("prices", "commissions")


class Forbidden(HTTPException):
    def __init__(self, message: str):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=message)


def _changed_keys(before: dict, after: dict) -> set:
    """Champs réellement modifiés, `updatedAt` exclu (il n'est qu'un marqueur)."""
    return {k for k in set(before) | set(after) if k != "updatedAt" and before.get(k) != after.get(k)}


def _diff_entities(visible: dict, incoming: dict, coop_id: str, deletions: dict) -> dict:
    """Delta par entité : créations, modifications (avant/après) et suppressions.

    La comparaison se fait contre la **projection réellement reçue** par
    l'appelant (`scope_state`), pas contre l'état brut : un planteur ne voit
    qu'un annuaire réduit du personnel, et personne ne reçoit les empreintes
    `pin`. Comparer au brut ferait passer ces champs absents pour des
    modifications.
    """
    delta = {}
    for e in ENTITY_ARRAYS:
        before = _rows_by_id(visible.get(e))
        after = _rows_by_id(incoming.get(e))
        created = [row for rid, row in after.items() if rid not in before]
        updated = [(before[rid], row) for rid, row in after.items() if rid in before and _changed_keys(before[rid], {**before[rid], **row, "coopId": coop_id})]
        deleted = [before[rid] for rid in (deletions.get(e) or []) if rid in before]
        delta[e] = {"created": created, "updated": updated, "deleted": deleted}
    return delta


def _is_pending_loan(row: dict) -> bool:
    """Une demande d'avance créée par un non-patron doit rester non décidée."""
    return (
        row.get("status") == "en_attente"
        and not row.get("soldeRestant")
        and not row.get("decidedBy")
        and not row.get("decidedAt")
    )


def _deny_touching(delta: dict, entities, actor: str) -> None:
    for e in entities:
        d = delta.get(e) or {}
        if d.get("created") or d.get("updated") or d.get("deleted"):
            raise Forbidden(f"{actor} : modification non autorisée de « {e} ».")


def _check_updates(delta: dict, entity: str, allowed_fields: set, owns, actor: str) -> None:
    """Chaque modification doit porter sur un enregistrement possédé et n'affecter
    que les champs autorisés."""
    for before, after in (delta.get(entity) or {}).get("updated", []):
        if not owns(before):
            raise Forbidden(f"{actor} : modification d'un enregistrement « {entity} » qui ne vous appartient pas.")
        changed = _changed_keys(before, after)
        if changed & IMMUTABLE_FIELDS:
            raise Forbidden(f"{actor} : les champs {sorted(changed & IMMUTABLE_FIELDS)} sont immuables.")
        forbidden = changed - allowed_fields
        if forbidden:
            raise Forbidden(f"{actor} : champs non modifiables sur « {entity} » : {sorted(forbidden)}.")


def _check_coop_settings_untouched(visible: dict, incoming: dict, coop_id: str, actor: str) -> None:
    """Prix, commissions, campagne et profil de la coop : patron uniquement."""
    stored_co = next((c for c in (visible.get("coops") or []) if c.get("id") == coop_id), None) or {}
    inc_coops = incoming.get("coops") or []
    inc_co = next((c for c in inc_coops if c.get("id") == coop_id), None)
    if inc_co is None and inc_coops:
        inc_co = inc_coops[0]
    if inc_co is None:
        inc_co = incoming.get("coop")
    if isinstance(inc_co, dict):
        for key in COOP_SETTINGS_KEYS:
            if key in inc_co and inc_co.get(key) != stored_co.get(key):
                raise Forbidden(f"{actor} : seul le patron peut changer « {key} ».")
        profile_changed = {
            k for k in set(inc_co) | set(stored_co)
            if k not in COOP_SETTINGS_KEYS and inc_co.get(k, stored_co.get(k)) != stored_co.get(k)
        }
        if profile_changed:
            raise Forbidden(f"{actor} : seul le patron peut modifier le profil de la coopérative.")
    if incoming.get("saison") and incoming["saison"] != visible.get("saison"):
        raise Forbidden(f"{actor} : seul le patron peut changer la campagne.")
    if incoming.get("priceHistory") is not None and incoming["priceHistory"] != (visible.get("priceHistory") or []):
        raise Forbidden(f"{actor} : seul le patron peut modifier l'historique des prix.")


def authorize_state_write(stored: dict, incoming: dict, me: dict, deletions: dict) -> None:
    """Refuse (403) toute écriture que le rôle du jeton n'autorise pas.

    Le patron est souverain sur SA coopérative ; les autres rôles n'ont que les
    droits strictement nécessaires à leur métier.
    """
    coop_id = me["coopId"]
    side, role, me_id = me.get("side"), me.get("role"), me.get("sub")
    if side == "coop" and role == "patron":
        return  # souverain sur sa propre coopérative (isolation déjà garantie).

    # Seul le patron définit ou réinitialise un code secret : personne d'autre
    # ne doit pouvoir en poser un (ni en effacer un en envoyant `pin: null`).
    for e in ENTITY_ARRAYS:
        for row in incoming.get(e) or []:
            if isinstance(row, dict) and "pin" in row:
                raise Forbidden("Seul le patron peut définir ou réinitialiser un code secret.")

    visible = scope_state(stored, coop_id, me)
    delta = _diff_entities(visible, incoming, coop_id, deletions)

    if side == "planteur":
        actor = "Planteur"
        _check_coop_settings_untouched(visible, incoming, coop_id, actor)
        _deny_touching(delta, ["staff", "mandats", "depenses", "settlements"], actor)
        # Aucune création ni suppression de planteur, de collecte ou de solde.
        for e in ("members", "collections"):
            if (delta[e]["created"] or delta[e]["deleted"]):
                raise Forbidden(f"{actor} : création ou suppression de « {e} » non autorisée.")
        if delta["loans"]["updated"] or delta["loans"]["deleted"]:
            raise Forbidden(f"{actor} : une demande d'avance déjà enregistrée ne peut plus être modifiée.")
        for row in delta["loans"]["created"]:
            if row.get("memberId") != me_id:
                raise Forbidden(f"{actor} : impossible de demander une avance au nom d'un autre planteur.")
            if not _is_pending_loan(row):
                raise Forbidden(f"{actor} : une demande d'avance doit rester « en_attente ».")
        _check_updates(delta, "members", PLANTEUR_MEMBER_FIELDS, lambda r: r.get("id") == me_id, actor)
        _check_updates(delta, "collections", PLANTEUR_COLLECTION_FIELDS, lambda r: r.get("memberId") == me_id, actor)
        return

    if side == "coop" and role in ("commis", "pisteur"):
        actor = "Magasinier" if role == "commis" else "Pisteur / Délégué"
        _check_coop_settings_untouched(visible, incoming, coop_id, actor)
        # Les mandats sont confiés par le patron ; l'équipe ne se les attribue pas.
        _deny_touching(delta, ["mandats"], actor)
        # Comptes planteurs et collaborateurs : création/suppression réservées au patron.
        for e in ("members", "staff"):
            if delta[e]["created"] or delta[e]["deleted"]:
                raise Forbidden(f"{actor} : seul le patron crée ou supprime un enregistrement « {e} ».")
        if delta["collections"]["deleted"] or delta["settlements"]["deleted"] or delta["depenses"]["deleted"] or delta["loans"]["deleted"]:
            raise Forbidden(f"{actor} : les écritures financières ne peuvent pas être supprimées.")
        if delta["settlements"]["updated"]:
            raise Forbidden(f"{actor} : un reçu de solde est définitif.")
        if delta["depenses"]["updated"]:
            raise Forbidden(f"{actor} : une dépense enregistrée ne peut plus être modifiée.")
        if delta["loans"]["updated"]:
            raise Forbidden(f"{actor} : seul le patron approuve ou refuse une avance.")
        for row in delta["collections"]["created"]:
            if row.get("byStaffId") != me_id:
                raise Forbidden(f"{actor} : une pesée doit être enregistrée à votre nom.")
        for row in delta["settlements"]["created"]:
            if row.get("byStaffId") != me_id:
                raise Forbidden(f"{actor} : un solde doit être enregistré à votre nom.")
        for row in delta["depenses"]["created"]:
            if row.get("pisteurId") != me_id:
                raise Forbidden(f"{actor} : une dépense doit être enregistrée à votre nom.")
        for row in delta["loans"]["created"]:
            if not _is_pending_loan(row):
                raise Forbidden(f"{actor} : une avance créée doit rester « en_attente » jusqu'à validation du patron.")
        _check_updates(delta, "members", set(), lambda r: False, actor)
        _check_updates(delta, "staff", STAFF_SELF_FIELDS, lambda r: r.get("id") == me_id, actor)
        _check_updates(delta, "collections", AGENT_COLLECTION_FIELDS, lambda r: True, actor)
        return

    raise Forbidden("Rôle inconnu : écriture refusée.")


class CoopLoginBody(BaseModel):
    identifier: str
    secret: str


class PlanteurLoginBody(BaseModel):
    phone: str
    pin: str


class RegisterBody(BaseModel):
    nom: str
    email: str
    password: str


# ------------------------------- Public API ------------------------------- #
@app.get("/")
async def health_root():
    return {"status": "ok", "service": "VALEO"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/")
async def root():
    return {"message": "VALEO API"}


@app.get("/api/state")
async def get_state(me: dict = Depends(require_user)):
    state = await load_state()
    return scope_state(state, me["coopId"], me)


@app.put("/api/state")
async def put_state(body: StateBody, me: dict = Depends(require_user)):
    # Sync offline-first : le serveur ne fusionne QUE la coopérative du jeton
    # (isolation stricte), après avoir vérifié que le rôle a le droit de faire
    # chacune des modifications reçues.
    state = await load_state()
    deletions = {e: list(body.deletions.get(e) or []) for e in ENTITY_ARRAYS} if body.deletions else {}
    authorize_state_write(state, body.data, me, deletions)
    merge_state(state, body.data, me["coopId"], deletions)
    await save_state(state)
    return {"ok": True}


@app.post("/api/auth/coop/login")
async def coop_login(body: CoopLoginBody):
    state = await load_state()
    ident = (body.identifier or "").strip()
    staff = state.get("staff") or []
    if "@" in ident:
        s = next((x for x in staff if _norm_text(x.get("email")) == _norm_text(ident)), None)
    else:
        ph = _norm_phone(ident)
        s = next((x for x in staff if ph and _norm_phone(x.get("tel")) == ph), None)
    if not s or not verify_secret(body.secret, s.get("pin")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants incorrects")
    claims = {"sub": s["id"], "coopId": s.get("coopId"), "role": s.get("role"), "side": "coop"}
    return {"token": issue_user_token(claims), "identity": claims, "state": scope_state(state, s.get("coopId"), claims)}


@app.post("/api/auth/planteur/login")
async def planteur_login(body: PlanteurLoginBody):
    state = await load_state()
    ph = _norm_phone(body.phone)
    q = _norm_text(body.phone)
    m = next((x for x in (state.get("members") or []) if (ph and _norm_phone(x.get("tel")) == ph) or _norm_text(x.get("code")) == q), None)
    if not m or not verify_secret(body.pin, m.get("pin")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants incorrects")
    claims = {"sub": m["id"], "coopId": m.get("coopId"), "side": "planteur"}
    return {"token": issue_user_token(claims), "identity": claims, "state": scope_state(state, m.get("coopId"), claims)}


@app.post("/api/auth/register")
async def register_coop(body: RegisterBody):
    state = await load_state()
    email = _norm_text(body.email)
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Adresse e-mail invalide")
    if len(body.password or "") < 6:
        raise HTTPException(status_code=400, detail="Mot de passe : au moins 6 caractères")
    if any(_norm_text(x.get("email")) == email for x in (state.get("staff") or [])):
        raise HTTPException(status_code=409, detail="Un compte existe déjà pour cette adresse e-mail")
    coop_id = "c" + _secrets.token_hex(6)
    staff_id = "s" + _secrets.token_hex(6)
    coop = {"id": coop_id, "nom": "Ma coopérative", "momo": [], "filieres": []}
    patron = {"id": staff_id, "coopId": coop_id, "nom": (body.nom or "").strip(), "role": "patron",
              "fonction": "Responsable", "email": email, "pin": make_pin_record(body.password)}
    state.setdefault("coops", []).append(coop)
    state.setdefault("staff", []).append(patron)
    await save_state(state)
    claims = {"sub": staff_id, "coopId": coop_id, "role": "patron", "side": "coop"}
    return {"token": issue_user_token(claims), "identity": claims, "state": scope_state(state, coop_id, claims)}


class AuditBody(BaseModel):
    action: str
    meta: dict = {}


@app.post("/api/audit")
async def add_audit(body: AuditBody, me: dict = Depends(require_user)):
    # Journal d'audit inviolable côté client : acteur + horodatage posés par le SERVEUR.
    entry = {
        "coopId": me["coopId"],
        "actorId": me["sub"],
        "actorRole": me.get("role"),
        "side": me["side"],
        "action": body.action,
        "meta": body.meta or {},
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit.insert_one(entry)
    return {"ok": True}


@app.get("/api/audit")
async def list_audit(me: dict = Depends(require_user)):
    cur = db.audit.find({"coopId": me["coopId"]}, {"_id": 0}).sort("at", -1).limit(300)
    return await cur.to_list(length=300)


# ------------------------------- Admin API -------------------------------- #
@app.post("/api/admin/login")
async def admin_login(data: LoginRequest):
    if not await verify_admin_password(data.password or ""):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    return {"access_token": issue_token(), "token_type": "bearer", "expires_in": JWT_EXPIRE_MINUTES * 60}


@app.post("/api/admin/change-password")
async def admin_change_password(body: ChangePwdRequest, _: dict = Depends(require_admin)):
    if not await verify_admin_password(body.current or ""):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    if len(body.new or "") < 6:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 6 caractères")
    salt_hex, hash_hex, iters = _hash_password(body.new)
    await db.admin_config.update_one(
        {"_id": "admin"},
        {"$set": {"pwd_salt": salt_hex, "pwd_hash": hash_hex, "iterations": iters, "updatedAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@app.get("/api/admin/state")
async def admin_get_state(_: dict = Depends(require_admin)):
    return await load_state()


@app.put("/api/admin/state")
async def admin_put_state(body: StateBody, _: dict = Depends(require_admin)):
    await save_state(body.data)
    return {"ok": True}


@app.get("/api/admin", response_class=HTMLResponse)
async def admin_dashboard():
    return HTMLResponse(ADMIN_HTML)


# CORS : l'application s'authentifie par jeton Bearer (aucun cookie), donc
# `allow_credentials` reste désactivé. Restreindre les origines via la variable
# d'environnement CORS_ORIGINS (liste séparée par des virgules).
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=_cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>VALEO — Administration</title>
<style>
  :root{--teal:#0E8E80;--green:#1E7A4D;--ink:#241C15;--muted:#7A6E62;--bg:#F7F3EC;--line:#EAE2D5;--due:#B8791E;--loss:#B23B2E}
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
  header{background:var(--teal);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between}
  header .n{font-weight:900;font-size:22px;letter-spacing:1px}
  header small{opacity:.85}
  .wrap{max-width:1100px;margin:0 auto;padding:18px}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:16px}
  button{cursor:pointer;border:none;border-radius:10px;padding:9px 14px;font-weight:700;font-size:14px}
  .primary{background:var(--teal);color:#fff}.green{background:var(--green);color:#fff}.ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}.danger{background:#fff;border:1px solid #EAD7D2;color:var(--loss)}
  input,select,textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:14px;font-family:inherit}
  label{display:block;font-size:12px;color:var(--muted);margin:8px 0 4px;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--muted);text-transform:uppercase;font-size:11px;padding:8px 6px;border-bottom:2px solid var(--line)}
  td{padding:8px 6px;border-bottom:1px solid #F0EBE2}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .tab{background:#fff;border:1px solid var(--line);color:var(--muted)}
  .tab.on{background:var(--teal);color:#fff;border-color:var(--teal)}
  .kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{flex:1;min-width:150px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}
  .kpi .l{font-size:12px;color:var(--muted)}.kpi .v{font-size:20px;font-weight:800}
  .row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:180px}
  .center{display:grid;place-items:center;min-height:70vh;padding:20px}
  .login{width:100%;max-width:360px}
  .hide{display:none}
  dialog{border:none;border-radius:16px;padding:0;max-width:520px;width:92%}
  dialog .body{padding:18px}dialog h3{margin:0 0 8px}
  .muted{color:var(--muted);font-size:13px}
  .toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap}
</style></head>
<body>
<div id="loginView" class="center">
  <div class="card login">
    <div style="text-align:center"><div style="color:var(--teal);font-weight:900;font-size:30px;letter-spacing:1px">VALEO</div>
    <div class="muted" style="margin-bottom:14px">Espace administration propriétaire</div></div>
    <label>Mot de passe</label>
    <input id="pwd" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()"/>
    <div id="loginErr" class="muted" style="color:var(--loss);margin-top:8px"></div>
    <button class="primary" style="width:100%;margin-top:14px" onclick="doLogin()">Se connecter</button>
  </div>
</div>

<div id="app" class="hide">
  <header>
    <div><div class="n">VALEO — Admin</div><small id="sub"></small></div>
    <div><button class="ghost" onclick="load()">↻ Actualiser</button> <button class="danger" onclick="logout()">Déconnexion</button></div>
  </header>
  <div class="wrap">
    <div class="kpis" id="kpis"></div>
    <div class="tabs" id="tabs"></div>
    <div id="panel"></div>
  </div>
</div>

<dialog id="editor"><div class="body">
  <h3 id="edTitle">Modifier</h3>
  <div id="edFields"></div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="ghost" style="flex:1" onclick="document.getElementById('editor').close()">Annuler</button>
    <button class="green" style="flex:1" onclick="saveEditor()">Enregistrer</button>
  </div>
</div></dialog>

<script>
let token = sessionStorage.getItem("valeo_admin_token") || null;
let state = null;
let current = "settings";
let currentCoop = null;

const fF = n => (Math.round(n||0)+"").replace(/\B(?=(\d{3})+(?!\d))/g," ")+" F";
const $ = id => document.getElementById(id);

// --- Coopératives : chaque coop est un espace indépendant (mêmes données/règles, seulement regroupées). ---
function coopList(){ return (state.coops&&state.coops.length)? state.coops : [Object.assign({}, state.coop||{nom:"Coopérative"}, {id:"__legacy__"})]; }
function curCoopObj(){ const l=coopList(); return l.find(c=>c.id===currentCoop) || l[0]; }
// En mode mono-coopérative (données héritées sans coopId), tout appartient à l'unique espace.
function belongs(r){ const l=coopList(); if(l.length<=1) return true; return (r&&r.coopId||null)===currentCoop; }
function coopCounts(id){ const single=coopList().length<=1; const ok=r=>single?true:(r.coopId||null)===id;
  return { m:(state.members||[]).filter(ok).length, c:(state.collections||[]).filter(ok).length, s:(state.staff||[]).filter(ok).length }; }

async function doLogin(){
  const password = $("pwd").value;
  try{
    const r = await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
    if(!r.ok){ $("loginErr").textContent="Mot de passe incorrect"; return; }
    token = (await r.json()).access_token; sessionStorage.setItem("valeo_admin_token", token);
    await load();
  }catch(e){ $("loginErr").textContent="Erreur de connexion"; }
}
function logout(){ token=null; sessionStorage.removeItem("valeo_admin_token"); $("app").classList.add("hide"); $("loginView").classList.remove("hide"); }

async function api(path, opts={}){
  const r = await fetch(path,{...opts,headers:{"Content-Type":"application/json","Authorization":"Bearer "+token,...(opts.headers||{})}});
  if(r.status===401){ logout(); throw new Error("401"); }
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
async function load(){
  try{
    state = await api("/api/admin/state");
    $("loginView").classList.add("hide"); $("app").classList.remove("hide");
    render();
  }catch(e){ if((""+e).includes("401")) return; }
}
async function persist(){ await api("/api/admin/state",{method:"PUT",body:JSON.stringify({data:state})}); render(); }

const name = id => (state.members.find(m=>m.id===id)||{}).nom || (state.staff.find(s=>s.id===id)||{}).nom || "—";

const SCHEMAS = {
  members:{title:"Planteurs",arr:"members",cols:["code","nom","village","tel","cropId"],fields:[
    {k:"nom",l:"Nom & prénoms"},{k:"code",l:"Code"},{k:"village",l:"Localité"},{k:"idNumber",l:"Pièce d'identité"},
    {k:"superficie",l:"Superficie (ha)",t:"number"},{k:"cropId",l:"Culture",opt:["cacao","cafe","anacarde","hevea"]},{k:"tel",l:"Téléphone"}]},
  staff:{title:"Équipe",arr:"staff",cols:["nom","role","fonction","tel"],fields:[
    {k:"nom",l:"Nom (affiché)"},{k:"prenoms",l:"Prénoms"},{k:"role",l:"Rôle",opt:["patron","commis","pisteur"]},
    {k:"fonction",l:"Fonction"},{k:"tel",l:"Téléphone"},{k:"email",l:"Email"},{k:"idNumber",l:"Pièce d'identité"}]},
  collections:{title:"Collectes",arr:"collections",cols:["seq","_member","kg","net","paye","reste","method"],fields:[
    {k:"memberId",l:"Planteur",ref:"members"},{k:"byStaffId",l:"Agent",ref:"staff"},{k:"kg",l:"Poids (kg)",t:"number"},
    {k:"prixKg",l:"Prix/kg",t:"number"},{k:"paye",l:"Payé",t:"number"},
    {k:"method",l:"Paiement",opt:["espece","momo"]}]},
  loans:{title:"Avances",arr:"loans",cols:["_member","type","amount","status","soldeRestant"],fields:[
    {k:"memberId",l:"Planteur",ref:"members"},{k:"type",l:"Type",opt:["intrant","argent"]},{k:"amount",l:"Montant",t:"number"},
    {k:"motif",l:"Motif"},{k:"status",l:"Statut",opt:["en_attente","approuve","refuse","rembourse"]},{k:"soldeRestant",l:"Solde restant",t:"number"}]},
  mandats:{title:"Mandats",arr:"mandats",cols:["_pisteur","amount","note"],fields:[
    {k:"pisteurId",l:"Pisteur",ref:"staff"},{k:"amount",l:"Montant",t:"number"},{k:"note",l:"Note"}]},
  depenses:{title:"Dépenses",arr:"depenses",cols:["_pisteur","category","amount","note"],fields:[
    {k:"pisteurId",l:"Pisteur",ref:"staff"},{k:"category",l:"Catégorie"},{k:"amount",l:"Montant",t:"number"},{k:"note",l:"Note"}]},
};

function render(){
  const list = coopList();
  // Vue « Coopératives » : sélection de l'espace à consulter.
  if(!currentCoop || !list.find(c=>c.id===currentCoop)){ renderCoopsHome(list); return; }
  const co = curCoopObj();
  $("sub").textContent = (co.nom||"Coopérative")+" · "+(state.saison||"");
  const cols = (state.collections||[]).filter(belongs);
  const mem = (state.members||[]).filter(belongs);
  const kg = cols.reduce((s,c)=>s+(+c.kg||0),0), net=cols.reduce((s,c)=>s+(+c.net||0),0), reste=cols.reduce((s,c)=>s+(+c.reste||0),0);
  $("kpis").innerHTML = [["Planteurs",mem.length],["Collectes",cols.length],["Poids total",kg+" kg"],["Valeur nette",fF(net)],["Reste à payer",fF(reste)]]
    .map(([l,v])=>`<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join("");
  // Sélecteur de coopérative + retour à la liste.
  const opts = list.map(c=>`<option value="${c.id}" ${c.id===currentCoop?'selected':''}>${esc(c.nom||"Coopérative")}</option>`).join("");
  const bar = `<div class="toolbar" style="margin-bottom:14px">
    <button class="ghost" onclick="backToCoops()">← Coopératives</button>
    <div style="display:flex;align-items:center;gap:8px"><span class="muted" style="font-size:13px">Coopérative :</span>
    <select onchange="enterCoop(this.value)" style="min-width:200px">${opts}</select></div></div>`;
  const tabs = [["settings","Réglages"],...Object.entries(SCHEMAS).map(([k,s])=>[k,s.title])];
  $("tabs").innerHTML = bar + tabs.map(([k,l])=>`<button class="tab ${current===k?'on':''}" onclick="go('${k}')">${l}</button>`).join("");
  $("panel").innerHTML = current==="settings"? settingsPanel() : entityPanel(current);
}
function renderCoopsHome(list){
  $("sub").textContent = list.length+" coopérative"+(list.length>1?"s":"");
  $("kpis").innerHTML = "";
  $("tabs").innerHTML = `<div class="toolbar" style="margin-bottom:4px"><h3 style="margin:0">Coopératives</h3></div>`;
  const cards = list.map(c=>{ const n=coopCounts(c.id);
    return `<div class="card" style="cursor:pointer" onclick="enterCoop('${c.id}')">
      <div class="toolbar"><h3 style="margin:0">${esc(c.nom||"Coopérative")}</h3><button class="primary" onclick="event.stopPropagation();enterCoop('${c.id}')">Ouvrir →</button></div>
      <div class="muted" style="font-size:13px;margin-bottom:8px">${esc(c.type||"—")}${c.localite?(" · "+esc(c.localite)):""}</div>
      <div class="kpis" style="margin:0">
        <div class="kpi"><div class="l">Équipe</div><div class="v">${n.s}</div></div>
        <div class="kpi"><div class="l">Planteurs</div><div class="v">${n.m}</div></div>
        <div class="kpi"><div class="l">Collectes</div><div class="v">${n.c}</div></div>
      </div></div>`;
  }).join("");
  $("panel").innerHTML = cards || `<div class="card muted">Aucune coopérative.</div>`;
}
function enterCoop(id){ currentCoop=id; if(current!=="settings"&&!SCHEMAS[current]) current="settings"; render(); }
function backToCoops(){ currentCoop=null; render(); }
function go(k){ current=k; render(); }

const COOP_TYPES=["Société coopérative simplifiée (SCOOPS)","Coopérative avec conseil d'administration (COOP-CA)","Union de coopératives","Fédération / Confédération","Autre"];
const FILIERES=[["cacao","Cacao"],["cafe","Café"],["anacarde","Anacarde"],["hevea","Hévéa"]];
const esc=s=>(""+(s==null?"":s)).replace(/"/g,'&quot;');

function settingsPanel(){
  const co=curCoopObj()||{}; const fil=co.filieres||[];
  const typeOpts=COOP_TYPES.map(t=>`<option ${t===co.type?'selected':''}>${t}</option>`).join("");
  const filBoxes=FILIERES.map(([id,l])=>`<label style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:14px;color:var(--ink)"><input type="checkbox" data-fil="${id}" ${fil.includes(id)?'checked':''} style="width:auto"/> ${l}</label>`).join("");
  return `<div class="card"><h3>Identité de la coopérative</h3>
    <div class="row">
      <div><label>Nom officiel</label><input id="s_nom" value="${esc(co.nom)}"/></div>
      <div><label>Sigle / nom commercial</label><input id="s_sigle" value="${esc(co.sigle)}"/></div>
    </div>
    <div class="row">
      <div><label>N° d'enregistrement / agrément</label><input id="s_agr" value="${esc(co.agrement)}"/></div>
      <div><label>Date de création</label><input id="s_date" value="${esc(co.dateCreation)}" placeholder="JJ/MM/AAAA"/></div>
    </div>
    <label>Type de coopérative</label><select id="s_type">${typeOpts}</select>
    <label>Filières exploitées</label><div style="padding:6px 0">${filBoxes}</div>
    <label>Description / présentation</label><textarea id="s_desc" rows="3">${esc(co.description)}</textarea>
    <h3 style="margin-top:18px">Coordonnées</h3>
    <div class="row">
      <div><label>Région</label><input id="s_region" value="${esc(co.region)}"/></div>
      <div><label>District</label><input id="s_district" value="${esc(co.district)}"/></div>
    </div>
    <div class="row">
      <div><label>Département</label><input id="s_dept" value="${esc(co.departement)}"/></div>
      <div><label>Commune</label><input id="s_commune" value="${esc(co.commune)}"/></div>
    </div>
    <div class="row">
      <div><label>Localité / village</label><input id="s_loc" value="${esc(co.localite)}"/></div>
      <div><label>Adresse</label><input id="s_adr" value="${esc(co.adresse)}"/></div>
    </div>
    <div class="row">
      <div><label>Téléphone</label><input id="s_tel" value="${esc(co.tel)}"/></div>
      <div><label>Email</label><input id="s_email" value="${esc(co.email)}"/></div>
    </div>
    <button class="green" style="margin-top:16px" onclick="saveSettings()">Enregistrer l'identité</button>
  </div>
  <div class="card"><h3>Campagne & tarifs</h3>
    <div class="row">
      <div><label>Campagne</label><input id="s_saison" value="${esc(state.saison)}"/></div>
      <div><label>Prix bord champ (F/kg)</label><input id="s_prix" type="number" value="${state.prixKg||0}"/></div>
      <div><label>Commission pisteur (F/kg)</label><input id="s_com" type="number" value="${state.commissionRate||0}"/></div>
    </div>
    <button class="green" style="margin-top:14px" onclick="saveSettings()">Enregistrer</button>
  </div>
  <div class="card"><h3>Sécurité — Mot de passe administrateur</h3>
    <p class="muted">Modifiez le mot de passe d'accès à cet espace d'administration.</p>
    <div class="row">
      <div><label>Mot de passe actuel</label><input id="p_cur" type="password" autocomplete="current-password"/></div>
      <div><label>Nouveau mot de passe</label><input id="p_new" type="password" autocomplete="new-password"/></div>
      <div><label>Confirmer</label><input id="p_conf" type="password" autocomplete="new-password"/></div>
    </div>
    <div id="p_msg" class="muted" style="margin-top:8px"></div>
    <button class="green" style="margin-top:12px" onclick="changePassword()">Changer le mot de passe</button>
  </div>
  <div class="card"><h3>Zone dangereuse</h3><p class="muted">Vide toute la base (coopératives, planteurs, collectes, avances…). Irréversible.</p>
    <button class="danger" onclick="wipeAll()">Tout réinitialiser</button></div>`;
}
async function changePassword(){
  const cur=$("p_cur").value, nw=$("p_new").value, cf=$("p_conf").value;
  const msg=$("p_msg"); msg.style.color="var(--loss)";
  if((nw||"").length<6){ msg.textContent="Le nouveau mot de passe doit contenir au moins 6 caractères."; return; }
  if(nw!==cf){ msg.textContent="Les deux mots de passe ne correspondent pas."; return; }
  try{
    await api("/api/admin/change-password",{method:"POST",body:JSON.stringify({current:cur,new:nw})});
    msg.style.color="var(--green)"; msg.textContent="Mot de passe modifié avec succès.";
    $("p_cur").value=""; $("p_new").value=""; $("p_conf").value="";
  }catch(e){ msg.textContent=(""+e).includes("400")?"Mot de passe actuel incorrect.":"Erreur lors du changement du mot de passe."; }
}
async function saveSettings(){
  const co=curCoopObj(); const g=id=>{const e=$(id);return e?e.value:undefined;};
  const newPrix = +$("s_prix").value||0;
  if(newPrix!==state.prixKg){ state.priceHistory=[...(state.priceHistory||[]),{date:new Date().toISOString(),prixKg:newPrix}]; }
  co.nom=g("s_nom"); co.sigle=g("s_sigle"); co.agrement=g("s_agr"); co.dateCreation=g("s_date"); co.type=g("s_type");
  co.description=g("s_desc"); co.region=g("s_region"); co.district=g("s_district"); co.departement=g("s_dept");
  co.commune=g("s_commune"); co.localite=g("s_loc"); co.adresse=g("s_adr"); co.tel=g("s_tel"); co.email=g("s_email");
  co.filieres=[...document.querySelectorAll("[data-fil]:checked")].map(e=>e.dataset.fil);
  // Coopérative héritée (mono) : garder l'ancien champ state.coop synchronisé.
  if(co.id==="__legacy__" && state.coop){ Object.assign(state.coop, co); delete state.coop.id; }
  state.saison=g("s_saison"); state.prixKg=newPrix; state.commissionRate=+$("s_com").value||0;
  await persist();
}
async function wipeAll(){
  if(!confirm("Confirmer : vider toute la base de données ?")) return;
  state={saison:state.saison,prixKg:state.prixKg,seq:1,memberSeq:1,commissionRate:state.commissionRate,coop:{nom:(state.coop&&state.coop.nom)||"Coopérative",momo:[]},coops:[],staff:[],members:[],collections:[],loans:[],mandats:[],depenses:[],settlements:[],priceHistory:[]};
  currentCoop=null;
  await persist();
}

function cellVal(row,key){
  if(key==="_member") return name(row.memberId);
  if(key==="_pisteur") return name(row.pisteurId);
  if(typeof row[key]==="number") return (key==='kg')? row[key]+" kg" : (['net','paye','reste','amount','soldeRestant','prixKg'].includes(key)? fF(row[key]) : row[key]);
  return row[key]==null? "—" : row[key];
}
function entityPanel(k){
  const sc=SCHEMAS[k]; const arr=state[sc.arr]||[];
  const head = sc.cols.map(c=>`<th>${c.replace('_member','Planteur').replace('_pisteur','Pisteur')}</th>`).join("")+"<th></th>";
  const visible = arr.map((r,gi)=>[r,gi]).filter(([r])=>belongs(r));
  const rows = visible.map(([r,gi])=>`<tr>${sc.cols.map(c=>`<td>${cellVal(r,c)}</td>`).join("")}
    <td style="text-align:right;white-space:nowrap"><button class="ghost" onclick="openEdit('${k}',${gi})">Modifier</button>
    <button class="danger" onclick="del('${k}',${gi})">Suppr.</button></td></tr>`).join("");
  return `<div class="card"><div class="toolbar"><h3 style="margin:0">${sc.title} (${visible.length})</h3>
    <button class="primary" onclick="openEdit('${k}',-1)">+ Ajouter</button></div>
    <div style="overflow:auto"><table><tr>${head}</tr>${rows||`<tr><td colspan="9" class="muted" style="padding:16px;text-align:center">Aucune donnée</td></tr>`}</table></div></div>`;
}

let edCtx=null;
function openEdit(k,i){
  const sc=SCHEMAS[k]; const isNew=i<0; const row=isNew?{}:JSON.parse(JSON.stringify(state[sc.arr][i]));
  edCtx={k,i,row};
  $("edTitle").textContent=(isNew?"Ajouter — ":"Modifier — ")+sc.title;
  $("edFields").innerHTML = sc.fields.map(f=>{
    const val = row[f.k]==null?"":row[f.k];
    if(f.ref){ const opts=state[f.ref].filter(belongs).map(o=>`<option value="${o.id}" ${o.id===val?'selected':''}>${o.nom}</option>`).join(""); return `<label>${f.l}</label><select data-k="${f.k}"><option value="">—</option>${opts}</select>`; }
    if(f.opt){ const opts=f.opt.map(o=>`<option ${o===val?'selected':''}>${o}</option>`).join(""); return `<label>${f.l}</label><select data-k="${f.k}">${opts}</select>`; }
    return `<label>${f.l}</label><input data-k="${f.k}" type="${f.t||'text'}" value="${(""+val).replace(/"/g,'&quot;')}"/>`;
  }).join("");
  $("editor").showModal();
}
// Recalcule les montants derives d'une collecte pour qu'une edition manuelle
// ne laisse jamais brut/net/reste incoherents avec kg, prix et retenues.
function recomputeCollection(row){
  row.retenues = row.retenues || [];
  const retenues = row.retenues.reduce((s,r)=>s+(+r.amount||0),0);
  row.brut = Math.round((+row.kg||0) * (+row.prixKg||0));
  row.net = Math.max(0, row.brut - retenues);
  row.paye = Math.min(Math.max(0, +row.paye||0), row.net);
  row.reste = Math.max(0, row.net - row.paye);
  if(row.resteSolde != null) row.resteSolde = Math.min(Math.max(0, +row.resteSolde||0), row.reste);
  return row;
}
async function saveEditor(){
  const {k,i,row}=edCtx; const sc=SCHEMAS[k];
  $("edFields").querySelectorAll("[data-k]").forEach(el=>{
    const f=sc.fields.find(x=>x.k===el.dataset.k); let v=el.value;
    if(f.t==="number") v=+v||0; row[f.k]=v;
  });
  if(i<0){ row.id = "a"+Math.random().toString(36).slice(2,9); if(!row.date) row.date=new Date().toISOString();
    if(currentCoop && currentCoop!=="__legacy__") row.coopId=currentCoop;
    if(k==="collections"){ row.seq=state.seq; state.seq=(state.seq||1)+1; recomputeCollection(row); }
    if(k==="loans"){ row.status=row.status||"en_attente"; }
    state[sc.arr].push(row);
  } else {
    if(k==="collections") recomputeCollection(row);
    state[sc.arr][i]=row;
  }
  // Horodatage d'ecriture : l'admin est un ecrivain comme un autre pour la
  // fusion par enregistrement cote application mobile.
  row.updatedAt = new Date().toISOString();
  document.getElementById("editor").close();
  await persist();
}
async function del(k,i){ const sc=SCHEMAS[k]; if(!confirm("Supprimer cet élément ?")) return; state[sc.arr].splice(i,1); await persist(); }

if(token){ load(); }
</script>
</body></html>
"""
