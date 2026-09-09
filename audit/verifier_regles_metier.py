#!/usr/bin/env python3
"""AUDIT — les VALEURS écrites sont-elles contrôlées côté serveur ?

`CLAUDE.md` §2 énonce le partage : « toute la logique de calcul d'argent est
côté client (`lib.ts`) ; le serveur, lui, contrôle *qui a le droit d'écrire
quoi* ». Ces sondes prennent cette phrase au mot et regardent ce qu'un client
MODIFIÉ peut écrire — car un garde-fou d'interface ne protège de rien.

Chaque sonde envoie une écriture que les invariants métier interdisent, avec
un jeton parfaitement légitime. Une sonde « rouge » ne veut pas dire que le
code est faux : elle veut dire que la règle n'est appliquée QUE côté client, ce
qui n'est une protection que contre les erreurs de saisie, pas contre un
appareil modifié.

Lecture seule vis-à-vis du projet. Bases simulées, rien de réel.

    python3 audit/verifier_regles_metier.py
"""
import asyncio
import os
import sys
import uuid
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


async def _terrain(api, server, marque):
    """Une coopérative avec patron, magasinier et pisteur connectés."""
    r = await api.post("/api/auth/register", json={
        "email": f"patron-{marque}@audit.ci", "password": "secret-patron", "nom": "Patron"})
    assert r.status_code == 200, r.text
    d = r.json()
    patron = {"jeton": d["token"], "id": d["identity"]["sub"],
              "coopId": d["identity"]["coopId"]}
    patron["entete"] = {"Authorization": f"Bearer {patron['jeton']}"}

    etat = (await api.get("/api/state", headers=patron["entete"])).json()
    etat["staff"] += [
        {"id": "st-commis", "nom": "Bakary", "role": "commis", "tel": "0700000002",
         "pin": server.make_pin_record("222222"), "updatedAt": "2026-01-01T08:00:00.000Z"},
        {"id": "st-pisteur", "nom": "Yao", "role": "pisteur", "tel": "0700000003",
         "pin": server.make_pin_record("333333"), "updatedAt": "2026-01-01T08:00:00.000Z"},
    ]
    etat["members"] = (etat.get("members") or []) + [
        {"id": "mb-1", "code": "VAL-1000-AA", "nom": "Kouassi", "village": "Sikensi",
         "tel": "0700000010", "momo": None, "photo": None,
         "cultures": [{"cropId": "cacao", "superficie": 3}],
         "updatedAt": "2026-01-01T08:00:00.000Z"},
    ]
    assert (await api.put("/api/state", headers=patron["entete"],
                          json={"data": etat})).status_code == 200

    agents = {}
    for cle, ident, secret in (("commis", "0700000002", "222222"),
                               ("pisteur", "0700000003", "333333")):
        r = await api.post("/api/auth/coop/login",
                           json={"identifier": ident, "secret": secret})
        assert r.status_code == 200, r.text
        j = r.json()["token"]
        agents[cle] = {"jeton": j, "id": f"st-{'commis' if cle == 'commis' else 'pisteur'}",
                       "entete": {"Authorization": f"Bearer {j}"}}
    return patron, agents


def _collecte(cid, staff_id, **surcharges):
    base = {"id": cid, "seq": 1, "memberId": "mb-1", "byStaffId": staff_id,
            "date": "2026-02-01T09:00:00Z", "kg": 100, "sacs": 0, "prixKg": 1800,
            "commissionRate": 30, "cropId": "cacao", "origine": "bord_champ",
            "brut": 180000, "net": 180000, "paye": 180000, "reste": 0,
            "retenues": [], "method": "espece", "note": "",
            "clientOpId": f"op-{cid}", "updatedAt": "2026-02-01T09:00:00.000Z"}
    base.update(surcharges)
    return base


async def _envoyer(api, acteur, collecte=None, avance=None):
    """Renvoie le code HTTP d'un PUT portant une écriture donnée."""
    etat = (await api.get("/api/state", headers=acteur["entete"])).json()
    if collecte is not None:
        etat.setdefault("collections", []).append(collecte)
    if avance is not None:
        etat.setdefault("loans", []).append(avance)
    r = await api.put("/api/state", headers=acteur["entete"], json={"data": etat})
    return r.status_code


async def _sondes(server, depot_nom, resultats):
    import httpx

    marque = uuid.uuid4().hex[:6]
    transport = httpx.ASGITransport(app=server.app)
    async with server.app.router.lifespan_context(server.app):
        async with httpx.AsyncClient(transport=transport,
                                     base_url="http://audit", timeout=60) as api:
            patron, agents = await _terrain(api, server, marque)
            p = agents["pisteur"]

            def note(nom, refuse, detail=""):
                resultats.setdefault(nom, {})[depot_nom] = (refuse, detail)

            # RM-1 : poids négatif
            c = await _envoyer(api, p, _collecte("rm1", p["id"], kg=-500,
                                                 brut=-900000, net=-900000, paye=-900000))
            note("RM-1 un poids NÉGATIF est refusé", c != 200, f"HTTP {c}")

            # RM-2 : payé plus que dû, SANS aucune valeur négative — sinon la
            # sonde passerait grâce au garde-fou des négatifs et non parce que
            # la cohérence paye <= net serait contrôlée. Une première version
            # envoyait reste=-819999 et « réussissait » pour cette raison.
            c = await _envoyer(api, p, _collecte("rm2", p["id"], kg=100, prixKg=1800,
                                                 brut=180000, net=180000,
                                                 paye=999_999, reste=0))
            note("RM-2 un paiement SUPÉRIEUR au net est refusé", c != 200, f"HTTP {c}")

            # RM-3 : prix arbitraire, sans rapport avec le barème de la coop
            c = await _envoyer(api, p, _collecte("rm3", p["id"], prixKg=9_000_000,
                                                 brut=900_000_000, net=900_000_000,
                                                 paye=900_000_000))
            note("RM-3 un prix/kg ARBITRAIRE est refusé", c != 200, f"HTTP {c}")

            # RM-4 : montants incohérents entre eux (brut != kg * prixKg)
            c = await _envoyer(api, p, _collecte("rm4", p["id"], kg=10, prixKg=1800,
                                                 brut=5_000_000, net=5_000_000,
                                                 paye=5_000_000))
            note("RM-4 un brut INCOHÉRENT avec kg × prix est refusé", c != 200, f"HTTP {c}")

            # RM-5 : date absurde
            c = await _envoyer(api, p, _collecte("rm5", p["id"], date="1899-01-01T00:00:00Z"))
            note("RM-5 une date ABSURDE est refusée", c != 200, f"HTTP {c}")

            # RM-6 : le magasinier accorde une avance déjà approuvée
            c = await _envoyer(api, agents["commis"], avance={
                "id": "ln-commis", "memberId": "mb-1", "amount": 500000,
                "status": "approuve", "soldeRestant": 500000, "origine": "pisteur",
                "decidedBy": "st-commis", "date": "2026-02-01T10:00:00Z",
                "updatedAt": "2026-02-01T10:00:00.000Z"})
            note("RM-6 le magasinier ne peut pas APPROUVER une avance", c != 200, f"HTTP {c}")

            # RM-7 : statut d'avance inventé (invariant 15)
            c = await _envoyer(api, p, avance={
                "id": "ln-statut", "memberId": "mb-1", "amount": 1000,
                "status": "valide", "soldeRestant": 1000, "origine": "pisteur",
                "decidedBy": p["id"], "date": "2026-02-01T10:00:00Z",
                "updatedAt": "2026-02-01T10:00:00.000Z"})
            note("RM-7 un STATUT d'avance inventé est refusé", c != 200, f"HTTP {c}")

            # RM-8 : montant d'avance négatif
            c = await _envoyer(api, p, avance={
                "id": "ln-neg", "memberId": "mb-1", "amount": -750000,
                "status": "approuve", "soldeRestant": -750000, "origine": "pisteur",
                "decidedBy": p["id"], "date": "2026-02-01T10:00:00Z",
                "updatedAt": "2026-02-01T10:00:00.000Z"})
            note("RM-8 un montant d'avance NÉGATIF est refusé", c != 200, f"HTTP {c}")

            # RM-9 : collecte rattachée à un planteur INEXISTANT
            c = await _envoyer(api, p, _collecte("rm9", p["id"], memberId="fantome"))
            note("RM-9 une collecte sur un planteur INEXISTANT est refusée",
                 c != 200, f"HTTP {c}")

            # RM-11/12 : le PATRON est souverain — il sort de
            # `authorize_state_write` avant tout contrôle. Ces deux sondes
            # montrent qu'aucune validation de VALEUR n'existe ailleurs : si
            # RM-7 et RM-8 sont refusées, c'est par effet de bord du chemin
            # « avance accordée sur le terrain », pas par une règle générale.
            c = await _envoyer(api, patron, avance={
                "id": "ln-patron-statut", "memberId": "mb-1", "amount": -999999,
                "status": "valide", "soldeRestant": -999999, "origine": "patron",
                "date": "2026-02-01T10:00:00Z",
                "updatedAt": "2026-02-01T10:00:00.000Z"})
            note("RM-11 (patron) statut inventé + montant négatif refusés",
                 c != 200, f"HTTP {c}")

            c = await _envoyer(api, patron, _collecte("rm12", patron["id"],
                                                      origine="magasin", kg=-10_000,
                                                      brut=-1, net=-1, paye=-1,
                                                      reste=-1))
            note("RM-12 (patron) poids et montants négatifs refusés",
                 c != 200, f"HTTP {c}")

            # RM-10 : pesée au nom d'un AUTRE agent (contrôle de référence,
            # celui-ci DOIT être refusé — il valide que les sondes mordent)
            c = await _envoyer(api, p, _collecte("rm10", "st-commis"))
            note("RM-10 une pesée au nom d'un AUTRE agent est refusée",
                 c != 200, f"HTTP {c}")


def main():
    resultats = {}
    for depot_nom in ("mongo", "firestore"):
        asyncio.run(_sondes(_monter(depot_nom), depot_nom, resultats))

    r = Rapport()
    r.titre("Contrôle des VALEURS écrites (deux dépôts)")
    for nom, par_depot in resultats.items():
        m, f = par_depot.get("mongo", (None, "")), par_depot.get("firestore", (None, ""))
        if m[0] != f[0]:
            r.exige(nom, False, f"DIVERGENCE mongo={m} firestore={f}")
        else:
            r.exige(nom, bool(m[0]), "" if m[0] else f"ACCEPTÉ par le serveur ({m[1]})")

    print("\n".join(r.lignes))
    total = r.ok + r.ko
    print(f"\n>>> {r.ok}/{total} règles appliquées côté SERVEUR, "
          f"{r.ko} laissée(s) au seul client")
    return 0


if __name__ == "__main__":
    sys.exit(main())
