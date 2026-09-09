"""Isolation entre coopératives au niveau du STOCKAGE (invariant 1).

Pourquoi un fichier de plus alors que l'isolation est déjà couverte : les
tests existants prouvent qu'une coopérative ne **voit** pas les données d'une
autre (`scope_state`) et qu'un `coopId` falsifié est réécrit depuis le jeton
(`merge_state`). Aucun ne faisait écrire deux coopératives sur un **même
identifiant d'enregistrement**.

C'est pourtant là que la migration Firestore déplaçait une garantie. La clé de
document y était l'identifiant métier seul, dans des collections globales :
la coopérative B, en réutilisant l'identifiant d'une ligne de A, écrasait le
document de A. Poussé jusqu'au collaborateur, B remplaçait la fiche du patron
de A — empreinte `pin` comprise — et le patron de A ne pouvait plus se
connecter. Le `PUT` répondait 200 : aucune erreur nulle part.

Le mécanisme était vicieux : c'est `charger(coop_id)`, la lecture bornée à la
coopérative du jeton — une optimisation de coût — qui rendait la destruction
invisible. Le serveur ne pouvait pas constater qu'il écrasait, puisqu'il
n'avait pas lu la ligne écrasée.

Ces tests tournent sur les DEUX dépôts. C'est la seule forme acceptable : sur
MongoDB ils passaient déjà, et c'est précisément la divergence entre les deux
qu'il fallait rendre impossible.
"""
from tests.test_state_authorization import _get_state, _put, _register, _seed_coop


def _deux_coops(client):
    a = _seed_coop(client)
    b = _register(client, email="patron@coop-b.ci", nom="Patron B")
    return a, b


def _membre(mid, nom, tel):
    return {"id": mid, "code": "VAL-9000-ZZ", "nom": nom, "village": "Ailleurs",
            "tel": tel, "momo": None, "photo": None,
            "cultures": [{"cropId": "cacao", "superficie": 1}],
            "updatedAt": "2026-02-01T08:00:00.000Z"}


class TestCollisionDIdentifiant:
    """Deux coopératives peuvent porter le même identifiant sans se détruire."""

    def test_un_planteur_de_A_survit_a_un_meme_identifiant_chez_B(self, app_client):
        a, b = _deux_coops(app_client)

        vue = _get_state(app_client, a["patron"])
        vue["members"].append(_membre("mb-collision", "PLANTEUR DE A", "0700000077"))
        assert _put(app_client, a["patron"], vue).status_code == 200

        vue = _get_state(app_client, b["token"])
        vue["members"].append(_membre("mb-collision", "PLANTEUR DE B", "0700000078"))
        assert _put(app_client, b["token"], vue).status_code == 200

        chez_a = [m for m in _get_state(app_client, a["patron"])["members"]
                  if m["id"] == "mb-collision"]
        assert len(chez_a) == 1, "la fiche de A a disparu ou a été dupliquée"
        assert chez_a[0]["nom"] == "PLANTEUR DE A", "la coop B a écrasé la fiche de A"

        chez_b = [m for m in _get_state(app_client, b["token"])["members"]
                  if m["id"] == "mb-collision"]
        assert len(chez_b) == 1 and chez_b[0]["nom"] == "PLANTEUR DE B"

    def test_B_ne_peut_pas_ecraser_la_fiche_du_patron_de_A(self, app_client):
        """Le cas le plus grave : écraser un `staff` efface son empreinte."""
        a, b = _deux_coops(app_client)

        vue = _get_state(app_client, b["token"])
        vue["staff"].append({"id": a["patron_id"], "nom": "ECRASEUR",
                             "role": "pisteur", "tel": "0700000099",
                             "updatedAt": "2026-02-01T08:00:00.000Z"})
        assert _put(app_client, b["token"], vue).status_code == 200

        patron = next((s for s in _get_state(app_client, a["patron"])["staff"]
                       if s["id"] == a["patron_id"]), None)
        assert patron is not None, "la fiche du patron de A a disparu"
        assert patron["role"] == "patron"
        assert patron["nom"] != "ECRASEUR"

    def test_le_patron_de_A_peut_encore_se_connecter(self, app_client):
        """Le symptôme visible : plus d'empreinte, donc plus de connexion."""
        a, b = _deux_coops(app_client)

        vue = _get_state(app_client, b["token"])
        vue["staff"].append({"id": a["patron_id"], "nom": "ECRASEUR",
                             "role": "pisteur", "tel": "0700000099",
                             "updatedAt": "2026-02-01T08:00:00.000Z"})
        assert _put(app_client, b["token"], vue).status_code == 200

        r = app_client.post("/api/auth/coop/login",
                            json={"identifier": "patron@coop.ci", "secret": "secret123"})
        assert r.status_code == 200, (
            "le patron de A ne peut plus se connecter : son empreinte a été "
            f"écrasée depuis une autre coopérative (HTTP {r.status_code})")

    def test_une_collecte_de_A_survit_a_un_meme_identifiant_chez_B(self, app_client):
        """Même mécanisme sur une écriture financière."""
        from tests.test_state_authorization import _collection

        a, b = _deux_coops(app_client)

        vue = _get_state(app_client, a["patron"])
        col_a = _collection("col-collision", "mb-1", a["patron_id"])
        col_a["kg"] = 111
        vue["collections"].append(col_a)
        assert _put(app_client, a["patron"], vue).status_code == 200

        vue = _get_state(app_client, b["token"])
        col_b = _collection("col-collision", "mb-x", b["identity"]["sub"])
        col_b["kg"] = 999
        vue["collections"].append(col_b)
        assert _put(app_client, b["token"], vue).status_code == 200

        chez_a = [c for c in _get_state(app_client, a["patron"])["collections"]
                  if c["id"] == "col-collision"]
        assert len(chez_a) == 1 and chez_a[0]["kg"] == 111, \
            "la collecte de A a été écrasée par celle de B"


class TestSuppressionCloisonnee:
    def test_B_ne_peut_pas_supprimer_un_planteur_de_A(self, app_client):
        a, b = _deux_coops(app_client)

        vue = _get_state(app_client, a["patron"])
        vue["members"].append(_membre("mb-cible", "CIBLE", "0700000088"))
        assert _put(app_client, a["patron"], vue).status_code == 200

        vue = _get_state(app_client, b["token"])
        r = app_client.put("/api/state",
                           json={"data": vue, "deletions": {"members": ["mb-cible"]}},
                           headers={"Authorization": f"Bearer {b['token']}"})
        assert r.status_code == 200

        assert any(m["id"] == "mb-cible"
                   for m in _get_state(app_client, a["patron"])["members"]), \
            "la coop B a supprimé un planteur de la coop A"
