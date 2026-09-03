"""Dépenses du pisteur / délégué : personnelles, et purge des mouvements.

Le pisteur n'est pas un salarié : c'est un prestataire, un apporteur d'affaires
rémunéré à la commission. Ses frais de tournée sont donc les siens — ils ne
sont ni des dépenses de la coopérative, ni l'affaire du patron.

Règles couvertes (invariant 24) :
  - le patron et le magasinier ne reçoivent pas les dépenses d'un pisteur ;
  - un pisteur ne reçoit que les siennes, jamais celles d'un autre pisteur ;
  - un pisteur continue de recevoir les siennes et de les enregistrer ;
  - personne d'autre — le patron compris — ne peut les créer, les modifier ou
    les supprimer ;
  - le renvoi à l'identique d'une ligne déjà stockée reste toléré (un téléphone
    resté hors ligne la porte encore en cache : refuser tout le PUT bloquerait
    son travail, cf. invariant 23).

Et la purge d'administration : effacer les mouvements sans toucher aux acteurs.
"""
from tests.test_state_authorization import (
    _auth, _collection, _get_state, _put, _seed_coop,
)


def _depense(did, pisteur_id, amount=25000, **kw):
    row = {
        "id": did, "pisteurId": pisteur_id, "category": "carburant",
        "amount": amount, "date": "2026-02-01T10:00:00.000Z", "note": "",
        "updatedAt": "2026-02-01T10:00:00.000Z",
    }
    row.update(kw)
    return row


def _pose_depense_pisteur(client, tokens, did="dep-pis", amount=25000):
    """Le pisteur enregistre sa dépense, comme le fait `addDepense`."""
    vue = _get_state(client, tokens["pisteur"])
    vue["depenses"].append(_depense(did, "st-pisteur", amount))
    assert _put(client, tokens["pisteur"], vue).status_code == 200
    return vue


# ------------------------ Périmètre : qui voit quoi ------------------------ #

class TestPerimetreDepenses:
    def test_le_pisteur_enregistre_et_retrouve_ses_depenses(self, app_client):
        t = _seed_coop(app_client)
        _pose_depense_pisteur(app_client, t)
        chez_lui = _get_state(app_client, t["pisteur"])["depenses"]
        assert [x["id"] for x in chez_lui] == ["dep-pis"]
        assert chez_lui[0]["amount"] == 25000

    def test_le_patron_ne_voit_pas_les_depenses_du_pisteur(self, app_client):
        t = _seed_coop(app_client)
        _pose_depense_pisteur(app_client, t)
        assert _get_state(app_client, t["patron"])["depenses"] == []

    def test_le_magasinier_ne_voit_pas_les_depenses_du_pisteur(self, app_client):
        t = _seed_coop(app_client)
        _pose_depense_pisteur(app_client, t)
        assert _get_state(app_client, t["commis"])["depenses"] == []

    def test_les_depenses_du_magasinier_restent_celles_de_la_coop(self, app_client):
        """Le magasinier, lui, est salarié : ses frais sont ceux de la coop."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["depenses"].append(_depense("dep-mag", "st-magasin", 12000))
        assert _put(app_client, t["commis"], vue).status_code == 200
        chez_patron = _get_state(app_client, t["patron"])["depenses"]
        assert [x["id"] for x in chez_patron] == ["dep-mag"]

    def test_un_pisteur_ne_voit_pas_les_depenses_dun_autre_pisteur(self, app_client):
        t = _seed_coop(app_client)
        # Le patron recrute un second pisteur, qui se connecte.
        state = _get_state(app_client, t["patron"])
        state["staff"].append({
            "id": "st-pisteur2", "nom": "Konan", "role": "pisteur", "tel": "0700000004",
            "pin": app_client.server.make_pin_record("444455"),
            "updatedAt": "2026-01-01T08:00:00.000Z",
        })
        assert _put(app_client, t["patron"], state).status_code == 200
        r = app_client.post("/api/auth/coop/login", json={"identifier": "0700000004", "secret": "444455"})
        assert r.status_code == 200, r.text
        autre = r.json()["token"]

        _pose_depense_pisteur(app_client, t)
        assert _get_state(app_client, autre)["depenses"] == []

    def test_le_planteur_ne_voit_toujours_aucune_depense(self, app_client):
        t = _seed_coop(app_client)
        _pose_depense_pisteur(app_client, t)
        assert _get_state(app_client, t["planteur"])["depenses"] == []


# ---- RÉGRESSION : une coopérative neuve n'a pas encore de barème ---------- #

class TestCooperativeSansBareme:
    """`POST /api/auth/register` crée la coop SANS `prices` ni `commissions`.

    Tant que le patron n'a pas réglé ses barèmes, la fiche coop n'en porte
    aucun. Le client renvoie cette fiche telle quelle à chaque synchro : s'il la
    complétait avec des valeurs par défaut, le serveur y lirait un changement de
    réglage et refuserait TOUT le PUT de l'agent (403). Plus personne, ni
    pisteur ni magasinier, ne pouvait alors rien enregistrer.
    """

    def test_la_coop_creee_na_pas_de_bareme(self, app_client):
        t = _seed_coop(app_client)
        co = _get_state(app_client, t["patron"])["coops"][0]
        assert co.get("prices") is None
        assert co.get("commissions") is None

    def test_le_pisteur_enregistre_malgre_labsence_de_bareme(self, app_client):
        t = _seed_coop(app_client)
        # Renvoi fidèle de la vue reçue, dépense en plus : c'est ce que produit
        # `prepareSync` une fois que `migrate` ne complète plus la fiche coop.
        vue = _get_state(app_client, t["pisteur"])
        vue["depenses"].append(_depense("dep-neuf", "st-pisteur", 45000))
        r = _put(app_client, t["pisteur"], vue)
        assert r.status_code == 200, r.text
        assert [x["id"] for x in _get_state(app_client, t["pisteur"])["depenses"]] == ["dep-neuf"]

    def test_le_magasinier_enregistre_malgre_labsence_de_bareme(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["collections"].append(_collection("col-neuf", "mb-1", "st-magasin"))
        assert _put(app_client, t["commis"], vue).status_code == 200

    def test_un_bareme_inventé_reste_refusé(self, app_client):
        """Le serveur, lui, ne bouge pas : poser un barème reste l'affaire du patron."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["coops"][0]["prices"] = {"cacao": 1800}
        r = _put(app_client, t["pisteur"], vue)
        assert r.status_code == 403, r.text
        assert "prices" in r.json()["detail"]


# ------------------- Écriture : personne d'autre n'y touche ---------------- #

class TestEcritureDepenses:
    def test_le_patron_ne_peut_pas_creer_une_depense_au_nom_dun_pisteur(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["depenses"].append(_depense("dep-x", "st-pisteur"))
        r = _put(app_client, t["patron"], vue)
        assert r.status_code == 403, r.text
        assert "pisteur" in r.json()["detail"].lower()

    def test_le_patron_ne_peut_pas_modifier_une_depense_de_pisteur(self, app_client):
        t = _seed_coop(app_client)
        _pose_depense_pisteur(app_client, t)
        # Il ne la voit pas ; un client forgé la renverrait modifiée.
        vue = _get_state(app_client, t["patron"])
        vue["depenses"].append(_depense("dep-pis", "st-pisteur", 999999,
                                        updatedAt="2026-06-01T10:00:00.000Z"))
        assert _put(app_client, t["patron"], vue).status_code == 403
        # La dépense d'origine est intacte chez son auteur.
        chez_lui = _get_state(app_client, t["pisteur"])["depenses"]
        assert chez_lui[0]["amount"] == 25000

    def test_le_patron_ne_peut_pas_supprimer_une_depense_de_pisteur(self, app_client):
        t = _seed_coop(app_client)
        _pose_depense_pisteur(app_client, t)
        vue = _get_state(app_client, t["patron"])
        r = _put(app_client, t["patron"], vue, deletions={"depenses": ["dep-pis"]})
        assert r.status_code == 403, r.text
        assert [x["id"] for x in _get_state(app_client, t["pisteur"])["depenses"]] == ["dep-pis"]

    def test_le_magasinier_ne_peut_pas_creer_une_depense_au_nom_dun_pisteur(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["depenses"].append(_depense("dep-y", "st-pisteur"))
        assert _put(app_client, t["commis"], vue).status_code == 403

    def test_un_renvoi_a_lidentique_ne_bloque_pas_la_synchro(self, app_client):
        """Un téléphone resté hors ligne porte encore la ligne en cache.

        Refuser tout le PUT à cause d'une ligne inchangée reproduirait le bug
        de l'invariant 23 : une écriture anodine gèle tout le travail du poste.
        """
        t = _seed_coop(app_client)
        _pose_depense_pisteur(app_client, t)
        # On relit la ligne telle que le serveur l'a stockée (via le pisteur).
        stockee = _get_state(app_client, t["pisteur"])["depenses"][0]

        vue = _get_state(app_client, t["patron"])
        vue["depenses"].append(dict(stockee))
        vue["collections"].append(_collection("col-1", "mb-1", t["patron_id"]))
        r = _put(app_client, t["patron"], vue)
        assert r.status_code == 200, r.text
        # Son travail est bien passé…
        assert "col-1" in {c["id"] for c in _get_state(app_client, t["patron"])["collections"]}
        # …et la dépense du pisteur n'a pas bougé.
        assert _get_state(app_client, t["pisteur"])["depenses"][0]["amount"] == 25000


# --------------- Purge d'administration : mouvements vs acteurs ------------ #

def _admin_token(client, password="admin123"):
    r = client.post("/api/admin/login", json={"password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


class TestPurgeMouvements:
    def _etat_charge(self, client):
        """Une coopérative avec des acteurs ET des mouvements de toutes sortes."""
        t = _seed_coop(client)
        state = _get_state(client, t["patron"])
        state["collections"].append(_collection("col-1", "mb-1", t["patron_id"]))
        state["loans"].append({
            "id": "ln-1", "memberId": "mb-1", "type": "argent", "amount": 30000,
            "motif": "Scolarité", "date": "2026-03-02T09:00:00.000Z", "status": "approuve",
            "soldeRestant": 30000, "decidedBy": t["patron_id"],
            "updatedAt": "2026-03-02T09:00:00.000Z",
        })
        state["mandats"].append({
            "id": "md-1", "pisteurId": "st-pisteur", "amount": 500000,
            "date": "2026-02-01T08:00:00.000Z", "note": "",
            "updatedAt": "2026-02-01T08:00:00.000Z",
        })
        state["settlements"].append({
            "id": "se-1", "memberId": "mb-1", "byStaffId": t["patron_id"], "amount": 5000,
            "method": "espece", "date": "2026-03-03T09:00:00.000Z",
            "updatedAt": "2026-03-03T09:00:00.000Z",
        })
        state["sorties"].append({
            "id": "so-1", "type": "vente", "cropId": "cacao", "kg": 50,
            "byStaffId": t["patron_id"], "date": "2026-03-04T09:00:00.000Z",
            "destinataire": "Usine", "updatedAt": "2026-03-04T09:00:00.000Z",
        })
        assert _put(client, t["patron"], state).status_code == 200
        _pose_depense_pisteur(client, t)
        client.post("/api/audit", json={"action": "pesee", "meta": {}}, headers=_auth(t["patron"]))
        return t

    def test_la_purge_efface_les_mouvements_et_garde_les_acteurs(self, app_client):
        t = self._etat_charge(app_client)
        coop_id = _get_state(app_client, t["patron"])["coops"][0]["id"]
        admin = _admin_token(app_client)

        r = app_client.post(
            "/api/admin/purge-mouvements", json={"coopId": coop_id}, headers=_auth(admin),
        )
        assert r.status_code == 200, r.text
        assert r.json()["removed"]["collections"] == 1

        vue = _get_state(app_client, t["patron"])
        for e in ("collections", "loans", "mandats", "settlements", "sorties", "depenses"):
            assert vue[e] == [], f"{e} aurait dû être vidé"
        # Les acteurs, eux, sont intacts.
        assert {s["id"] for s in vue["staff"]} >= {"st-pisteur", "st-magasin"}
        assert {m["id"] for m in vue["members"]} == {"mb-1", "mb-2"}
        assert vue["coop"]["nom"]
        # Y compris la dépense personnelle du pisteur, qui est un mouvement.
        assert _get_state(app_client, t["pisteur"])["depenses"] == []
        # Et le journal d'audit de la coopérative.
        r = app_client.get("/api/audit", headers=_auth(t["patron"]))
        assert r.json() == []

    def test_la_purge_epargne_les_autres_cooperatives(self, app_client):
        """L'isolation vaut aussi pour une opération d'administration."""
        t = self._etat_charge(app_client)
        admin = _admin_token(app_client)
        r = app_client.post(
            "/api/admin/purge-mouvements", json={"coopId": "une-autre-coop"}, headers=_auth(admin),
        )
        assert r.status_code == 200, r.text
        vue = _get_state(app_client, t["patron"])
        assert [c["id"] for c in vue["collections"]] == ["col-1"]
        assert [m["id"] for m in vue["mandats"]] == ["md-1"]

    def test_la_purge_exige_un_jeton_administrateur(self, app_client):
        t = self._etat_charge(app_client)
        coop_id = _get_state(app_client, t["patron"])["coops"][0]["id"]
        r = app_client.post(
            "/api/admin/purge-mouvements", json={"coopId": coop_id}, headers=_auth(t["patron"]),
        )
        assert r.status_code in (401, 403)
        assert [c["id"] for c in _get_state(app_client, t["patron"])["collections"]] == ["col-1"]

    def test_la_purge_refuse_une_cooperative_non_designee(self, app_client):
        """Sans `coopId`, une purge « toutes coops » passerait en silence."""
        t = self._etat_charge(app_client)
        admin = _admin_token(app_client)
        for corps in ({}, {"coopId": ""}, {"coopId": "   "}):
            r = app_client.post("/api/admin/purge-mouvements", json=corps, headers=_auth(admin))
            assert r.status_code in (400, 422), (corps, r.text)
        assert [c["id"] for c in _get_state(app_client, t["patron"])["collections"]] == ["col-1"]

    def test_la_connexion_des_acteurs_survit_a_la_purge(self, app_client):
        """Les codes secrets ne sont pas touchés : chacun se reconnecte."""
        t = self._etat_charge(app_client)
        coop_id = _get_state(app_client, t["patron"])["coops"][0]["id"]
        admin = _admin_token(app_client)
        assert app_client.post(
            "/api/admin/purge-mouvements", json={"coopId": coop_id}, headers=_auth(admin),
        ).status_code == 200
        r = app_client.post("/api/auth/coop/login", json={"identifier": "0700000003", "secret": "333333"})
        assert r.status_code == 200, r.text
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700000010", "pin": "111111"})
        assert r.status_code == 200, r.text
