"""Dépôt Firestore : un document par enregistrement, écriture différentielle.

Ce fichier couvre ce que la double exécution de la suite ne peut PAS voir. Les
386 tests de sécurité prouvent que le comportement ne change pas ; ils ne
disent rien de la **forme** du stockage ni de son **coût**. Or c'est là que se
joue la phase 3 :

* MongoDB rangeait tout l'état dans un unique document. Firestore plafonne un
  document à **1 Mio** : quelques milliers de pesées et la coopérative ne peut
  plus rien enregistrer. D'où un document par enregistrement.
* Firestore facture **à l'opération**. Réécrire toute la base à chaque
  synchronisation coûterait une fortune et se heurterait à la limite d'environ
  une écriture par seconde sur un même document. D'où l'écriture
  différentielle.

Ces deux propriétés doivent être vérifiées, pas supposées.
"""
import asyncio

import pytest

from tests.faux_firestore import FauxFirestore
from tests.test_state_authorization import _auth, _collection, _get_state, _put, _seed_coop

import depot as depot_module


def _fs(app_client):
    if app_client.depot_nom != "firestore":
        pytest.skip("propre au dépôt Firestore")
    return app_client.firestore


class TestUnDocumentParEnregistrement:
    def test_chaque_ligne_a_son_document(self, app_client):
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        etat = _get_state(app_client, t["patron"])
        assert fs.compte("members") == len(etat["members"]) == 2
        assert fs.compte("staff") == len(etat["staff"]) == 3
        assert fs.compte("coops") == 1

    def test_aucun_document_ne_contient_tout_letat(self, app_client):
        """Le défaut à ne pas transposer : l'unique document `appstate`."""
        fs = _fs(app_client)
        _seed_coop(app_client)
        assert "appstate" not in fs.base
        for nom, docs in fs.base.items():
            for doc in docs.values():
                for tableau in depot_module.TABLEAUX:
                    assert tableau not in doc, f"{nom} porte encore le tableau « {tableau} »"

    def test_les_scalaires_vivent_dans_meta(self, app_client):
        fs = _fs(app_client)
        _seed_coop(app_client)
        meta = fs.documents("meta")["etat"]
        assert meta["seq"] >= 1 and meta["memberSeq"] >= 1
        assert "updatedAt" in meta

    def test_le_document_porte_son_identifiant_metier(self, app_client):
        fs = _fs(app_client)
        _seed_coop(app_client)
        assert fs.documents("members")["mb-1"]["id"] == "mb-1"


class TestEcritureDifferentielle:
    def _ecritures(self, fs):
        """Compte les écritures réellement envoyées à Firestore."""
        compteur = {"n": 0}
        original = fs.batch

        def compte():
            lot = original()
            ajouter = lot.set
            supprimer = lot.delete

            def set_(ref, data, merge=False):
                compteur["n"] += 1
                return ajouter(ref, data, merge=merge)

            def delete_(ref):
                compteur["n"] += 1
                return supprimer(ref)

            lot.set, lot.delete = set_, delete_
            return lot

        fs.batch = compte
        return compteur

    def test_une_pesee_necoute_pas_toute_la_base(self, app_client):
        """Le cœur de la phase 3 : une pesée = une écriture, pas mille."""
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        total = sum(len(d) for d in fs.base.values())
        assert total >= 7, "l'état de départ doit être non trivial"

        compteur = self._ecritures(fs)
        vue = _get_state(app_client, t["pisteur"])
        vue["collections"].append(_collection("col-1", "mb-1", "st-pisteur"))
        assert _put(app_client, t["pisteur"], vue).status_code == 200

        # La collecte + l'horodatage de `meta`. Rien d'autre ne doit partir.
        assert compteur["n"] == 2, f"{compteur['n']} écritures pour une seule pesée"

    def test_un_put_sans_changement_necrit_presque_rien(self, app_client):
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        compteur = self._ecritures(fs)
        assert _put(app_client, t["patron"], vue).status_code == 200
        # Seul l'horodatage bouge : sans lui, « dernière écriture » resterait figé.
        assert compteur["n"] == 1

    def test_modifier_une_ligne_nen_reecrit_quune(self, app_client):
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["planteur"])
        moi = next(m for m in vue["members"] if m["id"] == "mb-1")
        moi["momo"] = {"operateur": "orange", "numero": "0700000010"}
        moi["updatedAt"] = "2026-03-01T10:00:00.000Z"
        compteur = self._ecritures(fs)
        assert _put(app_client, t["planteur"], vue).status_code == 200
        assert compteur["n"] == 2  # la fiche + l'horodatage

    def test_une_suppression_efface_vraiment_le_document(self, app_client):
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"].append(_collection("col-a-jeter", "mb-1", t["patron_id"]))
        assert _put(app_client, t["patron"], vue).status_code == 200
        assert "col-a-jeter" in fs.documents("collections")

        vue = _get_state(app_client, t["patron"])
        vue["collections"] = [c for c in vue["collections"] if c["id"] != "col-a-jeter"]
        r = app_client.put("/api/state", json={"data": vue, "deletions": {"collections": ["col-a-jeter"]}},
                           headers=_auth(t["patron"]))
        assert r.status_code == 200, r.text
        assert "col-a-jeter" not in fs.documents("collections")

    def test_une_absence_nefface_aucun_document(self, app_client):
        """Invariant 3 : seule la liste `deletions` supprime.

        Le piège de l'écriture différentielle : un client au périmètre réduit
        renvoie moins de lignes qu'il n'en existe. Les effacer parce qu'elles
        « manquent » viderait la coopérative.
        """
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        avant = set(fs.documents("members"))
        vue = _get_state(app_client, t["planteur"])   # le planteur ne voit que mb-1
        assert [m["id"] for m in vue["members"]] == ["mb-1"]
        assert _put(app_client, t["planteur"], vue).status_code == 200
        assert set(fs.documents("members")) == avant, "mb-2 a disparu"


class TestFideliteDesDonnees:
    def test_aller_retour_a_lidentique(self, app_client):
        _fs(app_client)
        t = _seed_coop(app_client)
        avant = _get_state(app_client, t["patron"])
        assert _put(app_client, t["patron"], avant).status_code == 200
        assert _get_state(app_client, t["patron"]) == avant

    def test_les_structures_imbriquees_survivent(self, app_client):
        """`loc`, `cultures`, `momo`, `retenues` : des objets dans des tableaux."""
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        m = next(x for x in vue["members"] if x["id"] == "mb-1")
        m["loc"] = {"district": {"id": "D1", "nom": "Lagunes"},
                    "village": {"id": "V9", "nom": "Gomon"}}
        m["cultures"] = [{"cropId": "cacao", "superficie": 3}, {"cropId": "hevea", "superficie": 1.5}]
        m["updatedAt"] = "2026-03-02T10:00:00.000Z"
        assert _put(app_client, t["patron"], vue).status_code == 200

        relu = next(x for x in _get_state(app_client, t["patron"])["members"] if x["id"] == "mb-1")
        assert relu["loc"] == m["loc"]
        assert relu["cultures"] == m["cultures"]
        assert fs.documents("members")["mb-1"]["loc"]["village"]["nom"] == "Gomon"

    def test_un_identifiant_avec_une_barre_oblique_ne_casse_rien(self, app_client):
        """Les identifiants viennent des téléphones : rien ne les valide.

        Une barre oblique créerait une sous-collection Firestore au lieu d'un
        document. On dérive donc une clé sûre, sans perdre l'identifiant réel.
        """
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"].append(_collection("col/avec/slash", "mb-1", t["patron_id"]))
        assert _put(app_client, t["patron"], vue).status_code == 200

        cles = fs.documents("collections")
        assert "col/avec/slash" not in cles
        assert any(v["id"] == "col/avec/slash" for v in cles.values())
        relu = _get_state(app_client, t["patron"])["collections"]
        assert any(c["id"] == "col/avec/slash" for c in relu)

    def test_lhorodatage_de_lempreinte_avance(self, app_client):
        _fs(app_client)
        t = _seed_coop(app_client)
        adm = app_client.post("/api/admin/login", json={"password": "admin123"}).json()["access_token"]
        avant = app_client.get("/api/admin/diag", headers=_auth(adm)).json()
        vue = _get_state(app_client, t["patron"])
        vue["collections"].append(_collection("col-diag", "mb-1", t["patron_id"]))
        assert _put(app_client, t["patron"], vue).status_code == 200
        apres = app_client.get("/api/admin/diag", headers=_auth(adm)).json()
        assert apres["compte"]["collections"] == avant["compte"]["collections"] + 1
        assert apres["majAt"] != avant["majAt"]


class TestLotsEtVolume:
    def test_au_dela_de_500_operations_les_lots_sont_decoupes(self, app_client):
        """Firestore refuse plus de 500 opérations dans un même lot."""
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"] += [_collection(f"c{i}", "mb-1", t["patron_id"]) for i in range(600)]
        assert _put(app_client, t["patron"], vue).status_code == 200
        assert fs.compte("collections") == 600
        assert len(_get_state(app_client, t["patron"])["collections"]) == 600

    def test_la_purge_efface_les_documents_de_mouvement(self, app_client):
        fs = _fs(app_client)
        t = _seed_coop(app_client)
        coop = _get_state(app_client, t["patron"])["coops"][0]["id"]
        vue = _get_state(app_client, t["patron"])
        vue["collections"] += [_collection(f"p{i}", "mb-1", t["patron_id"]) for i in range(5)]
        assert _put(app_client, t["patron"], vue).status_code == 200
        assert fs.compte("collections") == 5

        adm = app_client.post("/api/admin/login", json={"password": "admin123"}).json()["access_token"]
        r = app_client.post("/api/admin/purge-mouvements", json={"coopId": coop}, headers=_auth(adm))
        assert r.status_code == 200, r.text
        assert fs.compte("collections") == 0
        # Les ACTEURS restent : c'est tout l'intérêt de la purge.
        assert fs.compte("members") == 2 and fs.compte("staff") == 3


class TestDepotAutonome:
    """Le dépôt seul, sans passer par l'application."""

    def _depot(self):
        return depot_module.DepotFirestore(FauxFirestore(), "test", "firestore|test|(default)")

    def test_sans_lecture_prealable_rien_nest_supprime(self, app_client):
        """Filet de sécurité : un enregistrement sans lecture ne doit pas
        interpréter l'état comme une suppression massive."""
        d = self._depot()

        async def scenario():
            await d.enregistrer({"members": [{"id": "m1"}], "seq": 1})
            return await d.charger(lambda: {e: [] for e in depot_module.TABLEAUX})

        etat = asyncio.run(scenario())
        assert [m["id"] for m in etat["members"]] == ["m1"]

    def test_le_journal_daudit_reste_ordonne_et_borne(self, app_client):
        d = self._depot()

        async def scenario():
            for i in range(310):
                await d.audit_ajouter({"coopId": "c1", "action": f"a{i}", "at": f"2026-01-01T00:{i:03d}"})
            await d.audit_ajouter({"coopId": "c2", "action": "autre", "at": "2026-01-02T00:00"})
            return await d.audit_lister("c1"), await d.audit_lister(None), await d.audit_effacer("c1")

        c1, tous, efface = asyncio.run(scenario())
        assert len(c1) == 300, "le journal est borné à 300, comme sur MongoDB"
        assert c1[0]["at"] > c1[1]["at"], "le plus récent d'abord"
        assert all(x["coopId"] == "c1" for x in c1)
        assert len(tous) == 300 and efface == 310


class TestCoutDeLecture:
    """Firestore facture à l'opération : une lecture non bornée coûte la base.

    C'est le second point qui rendait le modèle d'origine intransposable. Le
    borner ne change aucune règle — `scope_state` et `merge_state` filtrent
    déjà sur `coopId ==` — mais il change la facture, et il faut le prouver.
    """

    def _deux_coops(self, app_client):
        from tests.test_state_authorization import _register

        a = _seed_coop(app_client)
        b = _register(app_client, email="patron@coopb.ci", nom="Patron B")
        vue = _get_state(app_client, b["token"])
        vue["collections"] += [_collection(f"b{i}", "mb-x", b["identity"]["sub"]) for i in range(30)]
        assert _put(app_client, b["token"], vue).status_code == 200
        return a, b

    def test_une_synchro_ne_lit_que_sa_cooperative(self, app_client):
        fs = _fs(app_client)
        a, b = self._deux_coops(app_client)
        assert fs.compte("collections") == 30, "la coop B a bien 30 collectes"

        fs.remettre_a_zero()
        assert _get_state(app_client, a["patron"]) is not None
        lu = fs.lectures
        assert lu < 15, f"{lu} documents lus alors que la coop A n'en a qu'une poignée"

        fs.remettre_a_zero()
        _get_state(app_client, b["token"])
        assert fs.lectures > lu, "la coop B, elle, a bien 30 collectes à lire"

    def test_la_lecture_bornee_ne_cache_rien(self, app_client):
        """Le risque de l'optimisation : perdre des lignes qu'on devait voir."""
        _fs(app_client)
        a, b = self._deux_coops(app_client)
        vue_b = _get_state(app_client, b["token"])
        assert len([c for c in vue_b["collections"] if c["id"].startswith("b")]) == 30
        assert vue_b["coops"][0]["id"] == b["identity"]["coopId"]

    def test_ecrire_dans_une_coop_ne_touche_pas_lautre(self, app_client):
        """Invariant 1 : ce qui n'est pas lu ne doit pas être pris pour supprimé."""
        fs = _fs(app_client)
        a, b = self._deux_coops(app_client)
        avant = set(fs.documents("collections"))

        vue = _get_state(app_client, a["patron"])
        vue["collections"].append(_collection("col-a", "mb-1", a["patron_id"]))
        assert _put(app_client, a["patron"], vue).status_code == 200

        apres = set(fs.documents("collections"))
        assert avant.issubset(apres), "des collectes de la coop B ont disparu"
        assert apres - avant == {"col-a"}
        assert len([c for c in _get_state(app_client, b["token"])["collections"]
                    if c["id"].startswith("b")]) == 30
