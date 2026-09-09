#!/usr/bin/env python3
"""AUDIT §5.10 — hors-ligne, synchronisation, conflits.

La question du brief : « vérifier qu'une donnée locale ne soit pas écrasée à
tort par une donnée distante ». Elle se décide sur un point unique — d'où vient
l'horodatage qui arbitre les conflits.

Réponse lue dans le code : `prepareSync` (sync.ts) pose
`new Date().toISOString()`, donc **l'horloge du téléphone**. Le serveur
compare ensuite (`merge_state`) et garde le plus récent. `_normalize_ts`
ramène une horloge en AVANCE (tolérance 5 min) mais **ne fait rien** d'une
horloge en RETARD. Ces sondes mesurent la conséquence réelle.

Lecture seule. Bases simulées.

    python3 audit/verifier_synchro.py
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BACKEND = RACINE / "backend"
for c in (str(BACKEND), str(BACKEND / "scripts")):
    if c not in sys.path:
        sys.path.insert(0, c)

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "valeo_audit")
os.environ.setdefault("ADMIN_PASSWORD", "audit-admin")
os.environ.setdefault("JWT_SECRET", "secret-audit-valeo-suffisamment-long")

import logging
logging.disable(logging.INFO)

from verifier_configuration import Rapport  # noqa: E402


def _monter(depot_choisi):
    for m in [m for m in list(sys.modules) if m in ("server", "depot")]:
        del sys.modules[m]
    import depot as depot_module
    from mongomock_motor import AsyncMongoMockClient
    from tests.faux_firestore import FauxFirestore
    import server
    server.db = AsyncMongoMockClient()["valeo_audit"]
    server.depot = (
        depot_module.DepotFirestore(FauxFirestore(), "(default)", "firestore|audit|(default)")
        if depot_choisi == "firestore"
        else depot_module.DepotMongo(lambda: server.db, "mongo|audit"))
    return server


def _iso(decalage):
    return (datetime.now(timezone.utc) + decalage).isoformat().replace("+00:00", "Z")


async def _sondes(server, depot_nom, res):
    import httpx

    marque = uuid.uuid4().hex[:6]
    transport = httpx.ASGITransport(app=server.app)
    async with server.app.router.lifespan_context(server.app):
        async with httpx.AsyncClient(transport=transport,
                                     base_url="http://audit", timeout=60) as api:
            r = await api.post("/api/auth/register", json={
                "email": f"p-{marque}@audit.ci", "password": "secret-patron",
                "nom": "Patron"})
            d = r.json()
            e = {"Authorization": f"Bearer {d['token']}"}
            pid = d["identity"]["sub"]

            def note(nom, ok, detail=""):
                res.setdefault(nom, {})[depot_nom] = (ok, detail)

            etat = (await api.get("/api/state", headers=e)).json()
            etat.setdefault("members", []).append({
                "id": "mb-1", "code": "VAL-1-AA", "nom": "Kouassi",
                "tel": "0700000010", "cropId": "cacao",
                "updatedAt": _iso(timedelta(0))})
            await api.put("/api/state", headers=e, json={"data": etat})

            # ---- SY-1 : horloge en AVANCE, sur une MODIFICATION -------------
            etat = (await api.get("/api/state", headers=e)).json()
            for m in etat["members"]:
                if m["id"] == "mb-1":
                    m["nom"] = "AVANCE D'UN AN"
                    m["updatedAt"] = _iso(timedelta(days=365))
            await api.put("/api/state", headers=e, json={"data": etat})
            relu = (await api.get("/api/state", headers=e)).json()
            nom = next(m["nom"] for m in relu["members"] if m["id"] == "mb-1")
            note("SY-1 une horloge en AVANCE ne fige pas l'enregistrement",
                 nom == "AVANCE D'UN AN", f"nom = {nom!r}")
            # ... et l'horodatage stocké doit avoir été ramené au présent,
            # sinon plus aucune écriture ultérieure ne pourrait le dépasser.
            ts = next(m.get("updatedAt") for m in relu["members"] if m["id"] == "mb-1")
            ramene = _parse(ts) < datetime.now(timezone.utc) + timedelta(minutes=10)
            note("SY-1b l'horodatage en avance est RAMENÉ au présent", ramene,
                 f"updatedAt stocké = {ts}")

            # ---- SY-2 : horloge en RETARD, sur une MODIFICATION -------------
            etat = (await api.get("/api/state", headers=e)).json()
            for m in etat["members"]:
                if m["id"] == "mb-1":
                    m["nom"] = "MODIF DEPUIS UN TELEPHONE EN RETARD"
                    m["updatedAt"] = _iso(timedelta(days=-400))
            code = (await api.put("/api/state", headers=e,
                                  json={"data": etat})).status_code
            relu = (await api.get("/api/state", headers=e)).json()
            nom = next(m["nom"] for m in relu["members"] if m["id"] == "mb-1")
            note("SY-2 une horloge en RETARD ne perd pas la modification",
                 nom == "MODIF DEPUIS UN TELEPHONE EN RETARD",
                 f"PUT = {code} mais la valeur stockée est restée {nom!r}")

            # ---- SY-3 : horloge en retard, sur une CRÉATION -----------------
            etat = (await api.get("/api/state", headers=e)).json()
            etat["members"].append({
                "id": "mb-retard", "code": "VAL-2-BB", "nom": "CREE EN RETARD",
                "tel": "0700000011", "cropId": "cacao",
                "updatedAt": _iso(timedelta(days=-400))})
            await api.put("/api/state", headers=e, json={"data": etat})
            relu = (await api.get("/api/state", headers=e)).json()
            note("SY-3 une CRÉATION passe malgré une horloge en retard",
                 any(m["id"] == "mb-retard" for m in relu["members"]))

            # ---- SY-4 : une absence n'est PAS une suppression ---------------
            etat = (await api.get("/api/state", headers=e)).json()
            etat["members"] = [m for m in etat["members"] if m["id"] != "mb-retard"]
            await api.put("/api/state", headers=e, json={"data": etat})  # sans deletions
            relu = (await api.get("/api/state", headers=e)).json()
            note("SY-4 une absence n'efface rien (invariant 3)",
                 any(m["id"] == "mb-retard" for m in relu["members"]))

            # ---- SY-5 : idempotence d'une pesée rejouée ---------------------
            def pesee(cid):
                return {"id": cid, "seq": 1, "memberId": "mb-1", "byStaffId": pid,
                        "date": _iso(timedelta(0)), "kg": 50, "prixKg": 1800,
                        "origine": "magasin", "brut": 90000, "net": 90000,
                        "paye": 90000, "reste": 0, "retenues": [],
                        "method": "espece", "note": "",
                        "clientOpId": "op-rejeu", "updatedAt": _iso(timedelta(0))}

            for cid in ("col-1", "col-2"):   # même clientOpId, deux identifiants
                etat = (await api.get("/api/state", headers=e)).json()
                etat.setdefault("collections", []).append(pesee(cid))
                await api.put("/api/state", headers=e, json={"data": etat})
            relu = (await api.get("/api/state", headers=e)).json()
            n = len([c for c in relu["collections"] if c.get("clientOpId") == "op-rejeu"])
            note("SY-5 une pesée rejouée n'est enregistrée qu'UNE fois", n == 1,
                 f"{n} collectes portent le même clientOpId")

            # ---- SY-6 : modification concurrente, champs différents ---------
            # Deux appareils partent de la MÊME copie. A change le village,
            # B (plus récent) change le téléphone sans savoir pour le village.
            base = (await api.get("/api/state", headers=e)).json()
            a = {k: v for k, v in base.items()}
            a["members"] = [dict(m) for m in base["members"]]
            for m in a["members"]:
                if m["id"] == "mb-1":
                    m["village"] = "VILLAGE POSE PAR A"
                    m["updatedAt"] = _iso(timedelta(seconds=-10))
            await api.put("/api/state", headers=e, json={"data": a})

            b = {k: v for k, v in base.items()}
            b["members"] = [dict(m) for m in base["members"]]
            for m in b["members"]:
                if m["id"] == "mb-1":
                    m["tel"] = "0799999999"
                    m["updatedAt"] = _iso(timedelta(0))
            await api.put("/api/state", headers=e, json={"data": b})

            relu = (await api.get("/api/state", headers=e)).json()
            mb = next(m for m in relu["members"] if m["id"] == "mb-1")
            note("SY-6 deux modifications concurrentes de champs DIFFÉRENTS "
                 "survivent toutes les deux",
                 mb.get("village") == "VILLAGE POSE PAR A" and mb.get("tel") == "0799999999",
                 f"village={mb.get('village')!r} tel={mb.get('tel')!r}")


def _parse(v):
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def main():
    res = {}
    for depot_nom in ("mongo", "firestore"):
        asyncio.run(_sondes(_monter(depot_nom), depot_nom, res))
    r = Rapport()
    r.titre("Synchronisation et conflits (deux dépôts)")
    for nom, par in res.items():
        m, f = par.get("mongo", (None, "")), par.get("firestore", (None, ""))
        if m[0] != f[0]:
            r.exige(nom, False, f"DIVERGENCE mongo={m} firestore={f}")
        else:
            r.exige(nom, bool(m[0]), "" if m[0] else m[1])
    print("\n".join(r.lignes))
    print(f"\n>>> {r.ok}/{r.ok + r.ko} sondes vertes, {r.ko} rouge(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
