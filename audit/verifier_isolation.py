#!/usr/bin/env python3
"""AUDIT — sondes d'isolation entre coopératives, sur les DEUX dépôts.

Lecture seule vis-à-vis du projet : ce script n'importe que `server`, `depot`
et le double `tests/faux_firestore`. Il n'écrit dans aucune base réelle — la
MongoDB est simulée (`mongomock_motor`) et le Firestore est le double en
mémoire du projet. Rien n'est modifié dans le dépôt.

Chaque sonde est jouée sur les DEUX dépôts. Une sonde qui passe d'un côté et
échoue de l'autre est le résultat le plus intéressant : elle signale que la
migration déplace une garantie, ce que la suite existante est censée exclure.

    python3 audit/verifier_isolation.py
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BACKEND = RACINE / "backend"
for chemin in (str(BACKEND), str(BACKEND / "scripts")):
    if chemin not in sys.path:
        sys.path.insert(0, chemin)

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "valeo_audit")
os.environ.setdefault("ADMIN_PASSWORD", "audit-admin")
os.environ.setdefault("JWT_SECRET", "secret-audit-valeo-suffisamment-long")

import logging
logging.disable(logging.INFO)

from verifier_configuration import Rapport  # noqa: E402


class Sonde:
    """Un constat, avec le dépôt sur lequel il a été observé."""

    def __init__(self):
        self.resultats = {}   # (nom_sonde, depot) -> (ok, detail)

    def note(self, nom, depot, ok, detail=""):
        self.resultats[(nom, depot)] = (bool(ok), detail)

    def noms(self):
        vus = []
        for nom, _ in self.resultats:
            if nom not in vus:
                vus.append(nom)
        return vus


def _monter(depot_choisi):
    """Un `server` neuf, branché sur le dépôt demandé. Aucune base réelle."""
    for module in [m for m in list(sys.modules) if m in ("server", "depot")]:
        del sys.modules[module]
    import depot as depot_module
    from mongomock_motor import AsyncMongoMockClient
    from tests.faux_firestore import FauxFirestore

    import server
    server.db = AsyncMongoMockClient()["valeo_audit"]
    if depot_choisi == "firestore":
        server.depot = depot_module.DepotFirestore(
            FauxFirestore(), "(default)", "firestore|audit|(default)")
    else:
        server.depot = depot_module.DepotMongo(lambda: server.db, "mongo|audit")
    return server


async def _inscrire(api, marque, suffixe, nom):
    r = await api.post("/api/auth/register", json={
        "email": f"{suffixe}-{marque}@audit.ci", "password": f"secret-{suffixe}-123",
        "nom": nom})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"jeton": d["token"], "coopId": d["identity"]["coopId"],
            "staffId": d["identity"]["sub"],
            "entete": {"Authorization": f"Bearer {d['token']}"}}


async def _sondes(server, depot_nom, s: Sonde):
    import httpx

    marque = uuid.uuid4().hex[:6]
    transport = httpx.ASGITransport(app=server.app)
    async with server.app.router.lifespan_context(server.app):
        async with httpx.AsyncClient(transport=transport,
                                     base_url="http://audit", timeout=60) as api:
            A = await _inscrire(api, marque, "a", "Patron A")
            B = await _inscrire(api, marque, "b", "Patron B")

            # --- ISO-1 : collision d'identifiant entre coopératives ---------
            # A crée un planteur. B envoie un planteur portant LE MÊME id.
            # Sur Mongo, deux listes distinctes : aucune collision possible.
            # Sur Firestore, la cle de document EST l'identifiant metier
            # (depot.py:303) et les collections ne sont pas cloisonnees.
            idc = f"collision-{marque}"
            etatA = (await api.get("/api/state", headers=A["entete"])).json()
            etatA.setdefault("members", []).append({
                "id": idc, "coopId": A["coopId"], "code": "PL-A-0001",
                "nom": "PLANTEUR DE A", "tel": "0700000001", "cropId": "cacao"})
            r = await api.put("/api/state", headers=A["entete"], json={"data": etatA})
            assert r.status_code == 200, r.text

            etatB = (await api.get("/api/state", headers=B["entete"])).json()
            etatB.setdefault("members", []).append({
                "id": idc, "coopId": B["coopId"], "code": "PL-B-0001",
                "nom": "PLANTEUR DE B", "tel": "0700000002", "cropId": "cacao"})
            r = await api.put("/api/state", headers=B["entete"], json={"data": etatB})
            ecriture_b = r.status_code

            revuA = (await api.get("/api/state", headers=A["entete"])).json()
            chezA = next((m for m in (revuA.get("members") or [])
                          if m["id"] == idc), None)
            s.note("ISO-1 la fiche de A survit a un id identique chez B", depot_nom,
                   chezA is not None and chezA.get("nom") == "PLANTEUR DE A",
                   f"PUT de B = {ecriture_b} ; chez A : "
                   f"{(chezA or {}).get('nom', 'DISPARUE')!r}")

            revuB = (await api.get("/api/state", headers=B["entete"])).json()
            chezB = next((m for m in (revuB.get("members") or [])
                          if m["id"] == idc), None)
            s.note("ISO-2 B voit bien SA fiche, pas celle de A", depot_nom,
                   chezB is not None and chezB.get("nom") == "PLANTEUR DE B",
                   f"{(chezB or {}).get('nom', 'ABSENTE')!r}")

            # --- ISO-3 : coopId falsifie dans la charge utile ----------------
            faux_id = f"faux-{marque}"
            etatB = (await api.get("/api/state", headers=B["entete"])).json()
            etatB.setdefault("members", []).append({
                "id": faux_id, "coopId": A["coopId"],  # <- pretend etre chez A
                "code": "PL-X-0001", "nom": "INJECTE", "tel": "0700000003",
                "cropId": "cacao"})
            await api.put("/api/state", headers=B["entete"], json={"data": etatB})
            revuA = (await api.get("/api/state", headers=A["entete"])).json()
            s.note("ISO-3 un coopId falsifie n'atterrit pas chez la cible", depot_nom,
                   not any(m["id"] == faux_id for m in (revuA.get("members") or [])),
                   "la ligne doit etre reparentee sur la coop du jeton")

            # --- ISO-4 : suppression visant une ligne d'une autre coop -------
            # Identifiant NEUF, cree par A seul : sans cela la sonde heriterait
            # du resultat d'ISO-1 et ne prouverait rien.
            id_del = f"acibler-{marque}"
            etatA = (await api.get("/api/state", headers=A["entete"])).json()
            etatA.setdefault("members", []).append({
                "id": id_del, "coopId": A["coopId"], "code": "PL-A-0002",
                "nom": "CIBLE DE SUPPRESSION", "tel": "0700000004",
                "cropId": "cacao"})
            await api.put("/api/state", headers=A["entete"], json={"data": etatA})

            etatB = (await api.get("/api/state", headers=B["entete"])).json()
            await api.put("/api/state", headers=B["entete"],
                          json={"data": etatB, "deletions": {"members": [id_del]}})
            revuA = (await api.get("/api/state", headers=A["entete"])).json()
            s.note("ISO-4 B ne peut pas supprimer une fiche de A par deletions",
                   depot_nom,
                   any(m["id"] == id_del for m in (revuA.get("members") or [])),
                   "deletions ne doit porter que sur la coop du jeton")

            # --- ISO-7 : collision sur un COLLABORATEUR ----------------------
            # Le patron est souverain sur sa coop : il cree donc librement des
            # `staff`. Si la collision d'identifiant vaut aussi la, le patron B
            # ecrase la fiche du patron A -- empreinte `pin` comprise.
            revuA = (await api.get("/api/state", headers=A["entete"])).json()
            etatB = (await api.get("/api/state", headers=B["entete"])).json()
            etatB.setdefault("staff", []).append({
                "id": A["staffId"], "coopId": B["coopId"], "role": "pisteur",
                "nom": "ECRASEUR", "tel": "0700000009"})
            r = await api.put("/api/state", headers=B["entete"], json={"data": etatB})
            code_staff = r.status_code
            revuA2 = (await api.get("/api/state", headers=A["entete"])).json()
            patronA = next((x for x in (revuA2.get("staff") or [])
                            if x["id"] == A["staffId"]), None)
            s.note("ISO-7 le patron B n'ecrase pas la fiche du patron A", depot_nom,
                   patronA is not None and patronA.get("role") == "patron",
                   f"PUT de B = {code_staff} ; fiche de A : "
                   f"{(patronA or {}).get('nom', 'DISPARUE')!r} "
                   f"role={(patronA or {}).get('role')!r}")

            # --- ISO-8 : la connexion du patron A tient-elle encore ? --------
            r = await api.post("/api/auth/coop/login", json={
                "identifier": f"a-{marque}@audit.ci", "secret": "secret-a-123"})
            s.note("ISO-8 le patron A peut toujours se connecter", depot_nom,
                   r.status_code == 200, f"HTTP {r.status_code}")

            # --- ISO-5 : lecture croisee ------------------------------------
            revuB = (await api.get("/api/state", headers=B["entete"])).json()
            fuite = [c["id"] for c in (revuB.get("coops") or [])
                     if c["id"] != B["coopId"]]
            s.note("ISO-5 B ne voit aucune autre cooperative", depot_nom,
                   not fuite, f"{fuite}")

            # --- ISO-6 : les empreintes pin ne sortent pas -------------------
            pins = [x for x in (revuB.get("staff") or []) if "pin" in x]
            s.note("ISO-6 aucune empreinte pin dans l'etat rendu", depot_nom,
                   not pins, f"{len(pins)} fiche(s) avec pin")


def main():
    s = Sonde()
    for depot_nom in ("mongo", "firestore"):
        server = _monter(depot_nom)
        asyncio.run(_sondes(server, depot_nom, s))

    r = Rapport()
    divergences = 0
    r.titre("Sondes d'isolation entre coopératives (deux dépôts)")
    for nom in s.noms():
        m_ok, m_det = s.resultats.get((nom, "mongo"), (None, ""))
        f_ok, f_det = s.resultats.get((nom, "firestore"), (None, ""))
        if m_ok != f_ok:
            divergences += 1
            r.exige(f"{nom}", False,
                    f"DIVERGENCE — mongo={'ok' if m_ok else 'ECHEC'} ({m_det}) | "
                    f"firestore={'ok' if f_ok else 'ECHEC'} ({f_det})")
        else:
            r.exige(f"{nom}", bool(m_ok),
                    "" if m_ok else f"les DEUX depots echouent — {m_det}")

    print("\n".join(r.lignes))
    total = r.ok + r.ko
    print(f"\n>>> {r.ok}/{total} sondes vertes, {r.ko} rouge(s), "
          f"{divergences} divergence(s) entre les deux depots")
    return 1 if r.ko else 0


if __name__ == "__main__":
    sys.exit(main())
