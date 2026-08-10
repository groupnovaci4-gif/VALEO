"""VALEO multi-coop backend isolation test.

The backend stores a single blob in /api/state, but the shape must support
multiple coops with per-coop prices/commissions. This test pushes a 2-coop
state and asserts the round-trip is preserved.
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-deploy-187.preview.emergentagent.com").rstrip("/")


def _seed():
    return {
        "saison": "Campagne 2025-2026",
        "prixKg": 1800,
        "seq": 1,
        "memberSeq": 1,
        "commissionRate": 25,
        "coop": {"nom": "Coopérative", "momo": [], "filieres": []},
        "coops": [],
        "staff": [],
        "members": [],
        "collections": [],
        "loans": [],
        "mandats": [],
        "depenses": [],
        "settlements": [],
        "priceHistory": [],
    }


def test_multicoop_state_persists_two_coops():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    id_a = "TEST_" + uuid.uuid4().hex[:6]
    id_b = "TEST_" + uuid.uuid4().hex[:6]

    d = _seed()
    d["coops"] = [
        {
            "id": id_a,
            "nom": "TEST_ISOL_COOP_A",
            "momo": [],
            "filieres": [],
            "prices": {"cacao": 2000, "cafe": 1200, "anacarde": 500, "hevea": 400, "palmier": 100},
            "commissions": {"cacao": 30, "cafe": 25, "anacarde": 20, "hevea": 15, "palmier": 10},
        },
        {
            "id": id_b,
            "nom": "TEST_ISOL_COOP_B",
            "momo": [],
            "filieres": [],
            "prices": {"cacao": 1500, "cafe": 900, "anacarde": 400, "hevea": 350, "palmier": 80},
            "commissions": {"cacao": 20, "cafe": 20, "anacarde": 15, "hevea": 10, "palmier": 8},
        },
    ]
    d["staff"] = [
        {"id": "s1", "coopId": id_a, "role": "patron", "nom": "TEST_Patron_A"},
        {"id": "s2", "coopId": id_b, "role": "patron", "nom": "TEST_Patron_B"},
    ]
    d["members"] = [
        {"id": "m1", "coopId": id_a, "code": "PL-2026-9001", "nom": "TEST_Planteur_A", "village": "Va", "idNumber": "", "superficie": 3, "cropId": "cacao", "cultures": [{"cropId": "cacao", "superficie": 3}], "tel": "0700000010", "momo": None, "photo": None},
        {"id": "m2", "coopId": id_b, "code": "PL-2026-9002", "nom": "TEST_Planteur_B", "village": "Vb", "idNumber": "", "superficie": 2, "cropId": "cafe", "cultures": [{"cropId": "cafe", "superficie": 2}], "tel": "0700000011", "momo": None, "photo": None},
    ]
    d["collections"] = [
        {"id": "c1", "seq": 1, "coopId": id_a, "memberId": "m1", "byStaffId": "s1", "date": "2026-01-01T00:00:00Z", "kg": 10, "prixKg": 2000, "cropId": "cacao", "brut": 20000, "retenues": [], "net": 20000, "paye": 20000, "reste": 0, "method": "espece", "note": ""},
        {"id": "c2", "seq": 1, "coopId": id_b, "memberId": "m2", "byStaffId": "s2", "date": "2026-01-01T00:00:00Z", "kg": 5, "prixKg": 900, "cropId": "cafe", "brut": 4500, "retenues": [], "net": 4500, "paye": 4500, "reste": 0, "method": "espece", "note": ""},
    ]

    r = s.put(f"{BASE_URL}/api/state", json={"data": d}, timeout=15)
    assert r.status_code == 200, r.text
    got = s.get(f"{BASE_URL}/api/state", timeout=15).json()

    coop_ids = {c.get("id") for c in got.get("coops", [])}
    assert id_a in coop_ids and id_b in coop_ids

    prices_a = next(c for c in got["coops"] if c["id"] == id_a)["prices"]
    prices_b = next(c for c in got["coops"] if c["id"] == id_b)["prices"]
    assert prices_a["cacao"] == 2000 and prices_b["cacao"] == 1500

    # Each member is scoped to its own coopId
    a_members = [m for m in got["members"] if m.get("coopId") == id_a]
    b_members = [m for m in got["members"] if m.get("coopId") == id_b]
    assert len(a_members) == 1 and len(b_members) == 1
    assert a_members[0]["nom"] == "TEST_Planteur_A"
    assert b_members[0]["nom"] == "TEST_Planteur_B"

    # Collections scoped
    a_cols = [c for c in got["collections"] if c.get("coopId") == id_a]
    b_cols = [c for c in got["collections"] if c.get("coopId") == id_b]
    assert len(a_cols) == 1 and len(b_cols) == 1
    assert a_cols[0]["prixKg"] == 2000
    assert b_cols[0]["prixKg"] == 900
