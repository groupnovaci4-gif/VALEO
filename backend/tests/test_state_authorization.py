"""B1/B2/B3 — autorisation par rôle, fusion par enregistrement, périmètre planteur.

Tests en processus (base MongoDB simulée, cf. `conftest.py`) : ils vérifient les
garanties de sécurité et d'intégrité de `PUT /api/state`, qui acceptait
auparavant n'importe quelle écriture de n'importe quel utilisateur authentifié.
"""
import copy

import pytest


# --------------------------------- Helpers --------------------------------- #

def _register(client, email="patron@coop.ci", nom="Patron Test", password="secret123"):
    r = client.post("/api/auth/register", json={"nom": nom, "email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _get_state(client, token):
    r = client.get("/api/state", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


def _put(client, token, data, deletions=None):
    body = {"data": data}
    if deletions is not None:
        body["deletions"] = deletions
    return client.put("/api/state", json=body, headers=_auth(token))


def _pin_record(client, secret):
    return client.server.make_pin_record(secret)


def _seed_coop(client):
    """Patron + magasinier + pisteur + planteur, tous connectés.

    Renvoie un dict de jetons et l'état vu par le patron.
    """
    reg = _register(client)
    patron_token, patron_id = reg["token"], reg["identity"]["sub"]

    state = _get_state(client, patron_token)
    state["staff"] += [
        {"id": "st-magasin", "nom": "Bakary", "role": "commis", "tel": "0700000002",
         "pin": _pin_record(client, "222222"), "updatedAt": "2026-01-01T08:00:00.000Z"},
        {"id": "st-pisteur", "nom": "Yao", "role": "pisteur", "tel": "0700000003",
         "pin": _pin_record(client, "333333"), "updatedAt": "2026-01-01T08:00:00.000Z"},
    ]
    state["members"] += [
        {"id": "mb-1", "code": "VAL-1000-AA", "nom": "Kouassi", "village": "Sikensi", "tel": "0700000010",
         "momo": None, "photo": None, "cultures": [{"cropId": "cacao", "superficie": 3}],
         "pin": _pin_record(client, "111111"), "updatedAt": "2026-01-01T08:00:00.000Z"},
        {"id": "mb-2", "code": "VAL-2000-BB", "nom": "Aya", "village": "Divo", "tel": "0700000011",
         "momo": None, "photo": None, "cultures": [{"cropId": "cacao", "superficie": 2}],
         "pin": _pin_record(client, "444444"), "updatedAt": "2026-01-01T08:00:00.000Z"},
    ]
    assert _put(client, patron_token, state).status_code == 200

    tokens = {"patron": patron_token, "patron_id": patron_id}
    for key, ident, secret in (("commis", "0700000002", "222222"), ("pisteur", "0700000003", "333333")):
        r = client.post("/api/auth/coop/login", json={"identifier": ident, "secret": secret})
        assert r.status_code == 200, r.text
        tokens[key] = r.json()["token"]
    r = client.post("/api/auth/planteur/login", json={"phone": "0700000010", "pin": "111111"})
    assert r.status_code == 200, r.text
    tokens["planteur"] = r.json()["token"]
    return tokens


def _collection(cid, member_id, staff_id, kg=100, paye=180000, reste=0):
    return {
        "id": cid, "seq": 1, "memberId": member_id, "byStaffId": staff_id,
        "date": "2026-02-01T09:00:00.000Z", "kg": kg, "prixKg": 1800, "cropId": "cacao",
        "brut": kg * 1800, "retenues": [], "net": kg * 1800, "paye": paye, "reste": reste,
        "method": "espece", "note": "", "updatedAt": "2026-02-01T09:00:00.000Z",
    }


# ------------------------------- B3 — périmètre ------------------------------ #

class TestPlanteurScope:
    def test_planteur_ne_recoit_que_ses_donnees(self, app_client):
        t = _seed_coop(app_client)
        patron_state = _get_state(app_client, t["patron"])
        patron_state["collections"] = [
            _collection("col-1", "mb-1", "st-magasin"),
            _collection("col-2", "mb-2", "st-magasin"),
        ]
        patron_state["loans"] = [
            {"id": "ln-1", "memberId": "mb-1", "type": "argent", "amount": 50000, "motif": "Santé",
             "date": "2026-02-02T09:00:00.000Z", "status": "en_attente", "soldeRestant": 0, "decidedBy": None},
            {"id": "ln-2", "memberId": "mb-2", "type": "argent", "amount": 90000, "motif": "Scolarité",
             "date": "2026-02-02T09:00:00.000Z", "status": "en_attente", "soldeRestant": 0, "decidedBy": None},
        ]
        # Dépense du magasinier : c'est bien une dépense de la coopérative.
        # (Celles d'un pisteur/délégué lui sont personnelles — invariant 24 —
        # et le patron n'a pas le droit de les saisir à sa place.)
        patron_state["depenses"] = [
            {"id": "dp-1", "pisteurId": "st-magasin", "category": "transport", "amount": 5000,
             "date": "2026-02-02T09:00:00.000Z", "note": ""}
        ]
        assert _put(app_client, t["patron"], patron_state).status_code == 200

        vue = _get_state(app_client, t["planteur"])
        assert [m["id"] for m in vue["members"]] == ["mb-1"]
        assert [c["id"] for c in vue["collections"]] == ["col-1"]
        assert [l["id"] for l in vue["loans"]] == ["ln-1"]
        assert vue["depenses"] == [], "les dépenses internes ne regardent pas le planteur"
        assert vue["mandats"] == []

    def test_planteur_ne_recoit_ni_empreintes_ni_coordonnees_du_personnel(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["planteur"])
        for s in vue["staff"]:
            assert "pin" not in s, "empreinte de code secret exposée au planteur"
            assert "tel" not in s and "email" not in s
            assert s["nom"]  # l'annuaire reste utilisable pour nommer un agent
        for m in vue["members"]:
            assert "pin" not in m

    def test_aucun_role_ne_recoit_les_empreintes(self, app_client):
        t = _seed_coop(app_client)
        for role in ("patron", "commis", "pisteur"):
            vue = _get_state(app_client, t[role])
            assert all("pin" not in x for x in vue["staff"]), role
            assert all("pin" not in x for x in vue["members"]), role


# ---------------------------- B1 — autorisation ---------------------------- #

class TestPlanteurAuthorization:
    def test_planteur_ne_peut_pas_approuver_son_avance(self, app_client):
        t = _seed_coop(app_client)
        st = _get_state(app_client, t["patron"])
        st["loans"] = [{"id": "ln-1", "memberId": "mb-1", "type": "argent", "amount": 50000, "motif": "Santé",
                        "date": "2026-02-02T09:00:00.000Z", "status": "en_attente", "soldeRestant": 0, "decidedBy": None}]
        assert _put(app_client, t["patron"], st).status_code == 200

        vue = _get_state(app_client, t["planteur"])
        vue["loans"][0].update(status="approuve", soldeRestant=50000, decidedBy="mb-1",
                               updatedAt="2026-02-03T09:00:00.000Z")
        r = _put(app_client, t["planteur"], vue)
        assert r.status_code == 403, r.text
        assert _get_state(app_client, t["patron"])["loans"][0]["status"] == "en_attente"

    def test_planteur_ne_peut_pas_effacer_sa_dette(self, app_client):
        t = _seed_coop(app_client)
        st = _get_state(app_client, t["patron"])
        st["collections"] = [_collection("col-1", "mb-1", "st-magasin", paye=0, reste=180000)]
        assert _put(app_client, t["patron"], st).status_code == 200

        vue = _get_state(app_client, t["planteur"])
        vue["collections"][0].update(reste=0, paye=180000, updatedAt="2026-02-04T09:00:00.000Z")
        assert _put(app_client, t["planteur"], vue).status_code == 403
        assert _get_state(app_client, t["patron"])["collections"][0]["reste"] == 180000

    def test_planteur_ne_peut_pas_changer_le_prix(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["planteur"])
        vue["coops"][0]["prices"] = {"cacao": 9999}
        assert _put(app_client, t["planteur"], vue).status_code == 403

    def test_planteur_ne_peut_pas_demander_au_nom_dun_autre(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["planteur"])
        vue["loans"] = [{"id": "ln-x", "memberId": "mb-2", "type": "argent", "amount": 10000, "motif": "X",
                         "date": "2026-02-02T09:00:00.000Z", "status": "en_attente", "soldeRestant": 0,
                         "decidedBy": None, "updatedAt": "2026-02-02T09:00:00.000Z"}]
        assert _put(app_client, t["planteur"], vue).status_code == 403

    def test_planteur_peut_demander_une_avance_et_lier_son_momo(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["planteur"])
        vue["loans"] = [{"id": "ln-ok", "memberId": "mb-1", "type": "argent", "amount": 25000, "motif": "Santé",
                         "date": "2026-02-02T09:00:00.000Z", "status": "en_attente", "soldeRestant": 0,
                         "decidedBy": None, "updatedAt": "2026-02-02T09:00:00.000Z"}]
        vue["members"][0].update(momo={"operator": "wave", "number": "0700000010"},
                                 updatedAt="2026-02-02T09:05:00.000Z")
        assert _put(app_client, t["planteur"], vue).status_code == 200, "flux planteur légitime cassé"

        patron_vue = _get_state(app_client, t["patron"])
        assert patron_vue["loans"][0]["status"] == "en_attente"
        assert next(m for m in patron_vue["members"] if m["id"] == "mb-1")["momo"]["operator"] == "wave"

    def test_le_code_secret_du_planteur_survit_a_ses_ecritures(self, app_client):
        """Le client ne reçoit plus l'empreinte : la fusion ne doit pas l'effacer."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["planteur"])
        vue["members"][0].update(photo="data:image/png;base64,xxx", updatedAt="2026-02-05T09:00:00.000Z")
        assert _put(app_client, t["planteur"], vue).status_code == 200
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700000010", "pin": "111111"})
        assert r.status_code == 200, "le code secret a été perdu à la synchronisation"


class TestAgentAuthorization:
    def test_magasinier_ne_peut_pas_approuver_une_avance(self, app_client):
        t = _seed_coop(app_client)
        st = _get_state(app_client, t["patron"])
        st["loans"] = [{"id": "ln-1", "memberId": "mb-1", "type": "argent", "amount": 50000, "motif": "Santé",
                        "date": "2026-02-02T09:00:00.000Z", "status": "en_attente", "soldeRestant": 0, "decidedBy": None}]
        assert _put(app_client, t["patron"], st).status_code == 200

        vue = _get_state(app_client, t["commis"])
        vue["loans"][0].update(status="approuve", soldeRestant=50000, decidedBy="st-magasin",
                               updatedAt="2026-02-03T09:00:00.000Z")
        assert _put(app_client, t["commis"], vue).status_code == 403

    def test_pisteur_ne_peut_pas_changer_prix_ni_commission(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["coops"][0]["commissions"] = {"cacao": 500}
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_pisteur_ne_peut_pas_se_donner_un_mandat(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["mandats"] = [{"id": "md-x", "pisteurId": "st-pisteur", "amount": 5_000_000,
                           "date": "2026-02-02T09:00:00.000Z", "note": "", "updatedAt": "2026-02-02T09:00:00.000Z"}]
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_agent_ne_peut_pas_enregistrer_une_pesee_au_nom_dun_autre(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["collections"] = [_collection("col-x", "mb-1", "st-pisteur")]
        assert _put(app_client, t["commis"], vue).status_code == 403

    def test_agent_ne_peut_pas_supprimer_un_planteur(self, app_client):
        """Le recrutement se fait sur le terrain, la radiation reste au patron."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        assert _put(app_client, t["commis"], vue, deletions={"members": ["mb-2"]}).status_code == 403
        assert len(_get_state(app_client, t["patron"])["members"]) == 2

    def test_agent_ne_peut_pas_creer_un_planteur_rattache_a_un_autre(self, app_client):
        """Une fiche créée par un agent reste rattachée à son créateur."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        cree = copy.deepcopy(vue)
        cree["members"].append({"id": "mb-faux", "code": "VAL-9999-ZZ", "nom": "Faux", "village": "X",
                                "momo": None, "photo": None, "createdBy": "st-pisteur",
                                "updatedAt": "2026-02-02T09:00:00.000Z"})
        assert _put(app_client, t["commis"], cree).status_code == 403
        assert len(_get_state(app_client, t["patron"])["members"]) == 2

    def test_agent_ne_peut_pas_poser_de_code_secret(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["members"][0]["pin"] = _pin_record(app_client, "999999")
        vue["members"][0]["updatedAt"] = "2026-02-06T09:00:00.000Z"
        assert _put(app_client, t["commis"], vue).status_code == 403
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700000010", "pin": "999999"})
        assert r.status_code == 401, "un agent a pu réécrire le code secret d'un planteur"

    def test_magasinier_peut_peser_solder_et_depenser(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["collections"] = [_collection("col-a", "mb-1", "st-magasin", paye=0, reste=180000)]
        vue["depenses"] = [{"id": "dp-a", "pisteurId": "st-magasin", "category": "sacs", "amount": 12000,
                            "date": "2026-02-02T10:00:00.000Z", "note": "", "updatedAt": "2026-02-02T10:00:00.000Z"}]
        assert _put(app_client, t["commis"], vue).status_code == 200, "flux magasinier légitime cassé"

        # Solde d'un ancien reste : `resteSolde` + reçu de solde.
        vue = _get_state(app_client, t["commis"])
        vue["collections"][0].update(resteSolde=180000, updatedAt="2026-02-03T10:00:00.000Z")
        vue["settlements"] = [{"id": "se-a", "memberId": "mb-1", "byStaffId": "st-magasin", "amount": 180000,
                               "method": "espece", "date": "2026-02-03T10:00:00.000Z",
                               "updatedAt": "2026-02-03T10:00:00.000Z"}]
        assert _put(app_client, t["commis"], vue).status_code == 200, "solde du reste dû cassé"

    def test_patron_garde_tous_ses_droits(self, app_client):
        t = _seed_coop(app_client)
        st = _get_state(app_client, t["patron"])
        st["coops"][0]["prices"] = {"cacao": 2000}
        st["saison"] = "Campagne 2026-2027"
        st["mandats"] = [{"id": "md-1", "pisteurId": "st-pisteur", "amount": 1_000_000,
                          "date": "2026-02-02T09:00:00.000Z", "note": "", "updatedAt": "2026-02-02T09:00:00.000Z"}]
        st["loans"] = [{"id": "ln-1", "memberId": "mb-1", "type": "argent", "amount": 50000, "motif": "Santé",
                        "date": "2026-02-02T09:00:00.000Z", "status": "approuve", "soldeRestant": 50000,
                        "decidedBy": t["patron_id"], "updatedAt": "2026-02-02T09:00:00.000Z"}]
        assert _put(app_client, t["patron"], st).status_code == 200

        after = _get_state(app_client, t["patron"])
        assert after["coops"][0]["prices"]["cacao"] == 2000
        assert after["saison"] == "Campagne 2026-2027"
        assert after["loans"][0]["status"] == "approuve"


# ------------------------- B2 — fusion par enregistrement ------------------- #

class TestRecordMerge:
    def test_deux_agents_hors_ligne_ne_secrasent_plus(self, app_client):
        """Le bug historique : la pesée du magasinier disparaissait."""
        t = _seed_coop(app_client)
        vue_commis = _get_state(app_client, t["commis"])
        vue_pisteur = _get_state(app_client, t["pisteur"])  # instantané pris AVANT

        vue_commis["collections"] = [_collection("col-commis", "mb-1", "st-magasin")]
        assert _put(app_client, t["commis"], vue_commis).status_code == 200

        # Le pisteur synchronise avec son instantané périmé (sans col-commis).
        vue_pisteur["collections"] = [_collection("col-pisteur", "mb-2", "st-pisteur")]
        assert _put(app_client, t["pisteur"], vue_pisteur).status_code == 200

        ids = {c["id"] for c in _get_state(app_client, t["patron"])["collections"]}
        assert ids == {"col-commis", "col-pisteur"}, "une pesée a été écrasée à la synchronisation"

    def test_client_perime_ne_regresse_pas_une_modification(self, app_client):
        t = _seed_coop(app_client)
        perime = _get_state(app_client, t["patron"])

        recent = _get_state(app_client, t["patron"])
        next(m for m in recent["members"] if m["id"] == "mb-1").update(
            village="Abengourou", updatedAt="2026-03-01T09:00:00.000Z")
        assert _put(app_client, t["patron"], recent).status_code == 200

        # Le client périmé renvoie sa vieille copie (updatedAt inchangé) : elle perd.
        assert _put(app_client, t["patron"], perime).status_code == 200
        after = next(m for m in _get_state(app_client, t["patron"])["members"] if m["id"] == "mb-1")
        assert after["village"] == "Abengourou"

    def test_le_plus_recent_gagne(self, app_client):
        t = _seed_coop(app_client)
        st = _get_state(app_client, t["patron"])
        next(m for m in st["members"] if m["id"] == "mb-1").update(
            village="Ancien", updatedAt="2026-03-01T09:00:00.000Z")
        assert _put(app_client, t["patron"], st).status_code == 200

        st = _get_state(app_client, t["patron"])
        next(m for m in st["members"] if m["id"] == "mb-1").update(
            village="Nouveau", updatedAt="2026-03-02T09:00:00.000Z")
        assert _put(app_client, t["patron"], st).status_code == 200
        after = next(m for m in _get_state(app_client, t["patron"])["members"] if m["id"] == "mb-1")
        assert after["village"] == "Nouveau"

    def test_suppression_explicite_seulement(self, app_client):
        t = _seed_coop(app_client)
        st = _get_state(app_client, t["patron"])
        st["members"] = [m for m in st["members"] if m["id"] != "mb-2"]
        # Sans liste de suppressions : mb-2 est conservé (absence != suppression).
        assert _put(app_client, t["patron"], st).status_code == 200
        assert {m["id"] for m in _get_state(app_client, t["patron"])["members"]} == {"mb-1", "mb-2"}
        # Avec la liste explicite : suppression effective.
        assert _put(app_client, t["patron"], st, deletions={"members": ["mb-2"]}).status_code == 200
        assert {m["id"] for m in _get_state(app_client, t["patron"])["members"]} == {"mb-1"}

    def test_horloge_client_en_avance_est_ramenee(self, app_client):
        """Un téléphone mal réglé ne doit pas geler un enregistrement pour toujours."""
        t = _seed_coop(app_client)
        st = _get_state(app_client, t["patron"])
        next(m for m in st["members"] if m["id"] == "mb-1").update(
            village="Futur", updatedAt="2099-01-01T00:00:00.000Z")
        assert _put(app_client, t["patron"], st).status_code == 200
        stored = next(m for m in _get_state(app_client, t["patron"])["members"] if m["id"] == "mb-1")
        assert not stored["updatedAt"].startswith("2099"), "horodatage futur non borné"

    def test_isolation_entre_cooperatives_preservee(self, app_client):
        """Invariant n°1 du projet : une coop ne voit ni n'écrit chez une autre."""
        t = _seed_coop(app_client)
        autre = _register(app_client, email="autre@coop.ci", nom="Autre Patron")
        vue_autre = _get_state(app_client, autre["token"])
        assert vue_autre["members"] == [] and vue_autre["staff"][0]["nom"] == "Autre Patron"

        # Tentative d'écriture chez le voisin : le coopId est réécrit par le serveur.
        vue_autre["members"] = [{"id": "intrus", "coopId": t["patron_id"], "code": "VAL-0000-XX",
                                 "nom": "Intrus", "village": "X", "momo": None, "photo": None,
                                 "updatedAt": "2026-02-02T09:00:00.000Z"}]
        assert _put(app_client, autre["token"], vue_autre).status_code == 200
        assert {m["id"] for m in _get_state(app_client, t["patron"])["members"]} == {"mb-1", "mb-2"}
        assert {m["id"] for m in _get_state(app_client, autre["token"])["members"]} == {"intrus"}

    def test_ecriture_sans_jeton_refusee(self, app_client):
        assert app_client.put("/api/state", json={"data": {}}).status_code == 401
        assert app_client.get("/api/state").status_code == 401
