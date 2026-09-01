"""M5 — idempotence de la pesée et robustesse de la synchronisation.

Une pesée validée deux fois (double-tap, rejeu après une réponse perdue) ne
doit créer qu'une seule collecte, donc un seul paiement.
"""
from tests.test_state_authorization import _auth, _collection, _get_state, _put, _register, _seed_coop


class TestIdempotence:
    def test_meme_operation_envoyee_deux_fois_ne_cree_quune_pesee(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])

        pesee_a = _collection("col-1", "mb-1", "st-magasin")
        pesee_a["clientOpId"] = "op-abc"
        vue["collections"] = [pesee_a]
        assert _put(app_client, t["commis"], vue).status_code == 200

        # Rejeu : même opération, mais un nouvel id local (l'utilisateur a
        # re-validé sans avoir vu la première confirmation).
        vue2 = _get_state(app_client, t["commis"])
        pesee_b = _collection("col-2", "mb-1", "st-magasin")
        pesee_b["clientOpId"] = "op-abc"
        vue2["collections"] = vue2["collections"] + [pesee_b]
        assert _put(app_client, t["commis"], vue2).status_code == 200

        cols = _get_state(app_client, t["patron"])["collections"]
        assert len(cols) == 1, "le double envoi a créé deux pesées (double paiement)"
        assert cols[0]["id"] == "col-1"

    def test_deux_pesees_distinctes_restent_distinctes(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        a = _collection("col-1", "mb-1", "st-magasin")
        a["clientOpId"] = "op-1"
        b = _collection("col-2", "mb-2", "st-magasin")
        b["clientOpId"] = "op-2"
        vue["collections"] = [a, b]
        assert _put(app_client, t["commis"], vue).status_code == 200
        assert len(_get_state(app_client, t["patron"])["collections"]) == 2

    def test_renvoi_a_lidentique_ne_duplique_pas(self, app_client):
        """Le cas le plus courant : la même charge utile part deux fois."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["collections"] = [_collection("col-1", "mb-1", "st-magasin")]
        assert _put(app_client, t["commis"], vue).status_code == 200
        assert _put(app_client, t["commis"], vue).status_code == 200
        assert len(_get_state(app_client, t["patron"])["collections"]) == 1

    def test_la_commission_figee_est_conservee(self, app_client):
        """M4 : le barème est gelé sur la collecte, comme le prix."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        pesee = _collection("col-1", "mb-1", "st-magasin")
        pesee["commissionRate"] = 25
        vue["collections"] = [pesee]
        assert _put(app_client, t["commis"], vue).status_code == 200

        # Le patron change le barème courant : l'historique ne doit pas bouger.
        st = _get_state(app_client, t["patron"])
        st["coops"][0]["commissions"] = {"cacao": 60}
        assert _put(app_client, t["patron"], st).status_code == 200

        after = _get_state(app_client, t["patron"])
        assert after["collections"][0]["commissionRate"] == 25
        assert after["collections"][0]["prixKg"] == 1800

    def test_etat_neuf_contient_tous_les_tableaux(self, app_client):
        reg = _register(app_client, email="neuf@coop.ci", nom="Neuf")
        vue = _get_state(app_client, reg["token"])
        for key in ("staff", "members", "collections", "loans", "mandats", "depenses", "settlements", "coops"):
            assert key in vue, f"tableau « {key} » absent d'un état neuf"

    def test_cors_sans_identifiants(self, app_client):
        """`allow_credentials=True` avec `*` est inopérant et trompeur."""
        for m in app_client.server.app.user_middleware:
            if "CORS" in str(m):
                assert m.kwargs.get("allow_credentials") is False
                break
        else:  # pragma: no cover
            raise AssertionError("middleware CORS introuvable")
