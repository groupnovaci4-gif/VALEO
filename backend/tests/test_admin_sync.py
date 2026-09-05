"""Espace d'administration : synchronisation réelle avec l'application.

L'admin n'est pas un tableau de bord de consultation : c'est une interface de
contrôle branchée sur LA MÊME base que les téléphones. Ce fichier couvre les
défauts constatés et leur correction.

  1. `PUT /api/admin/state` remplaçait le document ENTIER par la copie chargée
     dans le navigateur : toute écriture faite depuis un téléphone entre
     l'affichage de la page et l'enregistrement était **silencieusement
     détruite** (perte de mise à jour, corrigée côté application par B2).
  2. Les barèmes saisis dans l'admin allaient dans les anciens champs globaux
     `state.prixKg` / `commissionRate`, que l'application ne lit plus : le prix
     n'arrivait jamais sur les téléphones — et débordait sur les autres coops.
  3. Un compte créé depuis l'admin n'avait aucun moyen d'obtenir un code
     secret : il ne pouvait jamais se connecter.
  4. Aucune désactivation de compte n'existait.

S'y ajoute le périmètre : les empreintes de codes secrets ne partent pas non
plus vers le navigateur de l'admin (invariant 5), remplacées par un booléen
dérivé `aSecret`.
"""
from tests.test_state_authorization import (
    _auth, _collection, _get_state, _put, _seed_coop,
)

ADMIN = "admin123"


def _admin(client, password=ADMIN):
    r = client.post("/api/admin/login", json={"password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _admin_get(client, token):
    r = client.get("/api/admin/state", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


def _admin_put(client, token, data, deletions=None):
    body = {"data": data}
    if deletions is not None:
        body["deletions"] = deletions
    return client.put("/api/admin/state", json=body, headers=_auth(token))


# ------------------- L'admin n'écrase plus le travail de l'app ------------- #

class TestPasDePerteDeMiseAJour:
    def test_une_pesee_arrivee_entre_temps_survit(self, app_client):
        """Le cœur du défaut : l'admin détruisait le travail des téléphones."""
        t = _seed_coop(app_client)
        adm = _admin(app_client)

        ecran = _admin_get(app_client, adm)          # l'admin ouvre sa page…
        vue = _get_state(app_client, t["pisteur"])   # …le pisteur pèse pendant ce temps
        vue["collections"].append(_collection("col-course", "mb-1", "st-pisteur"))
        assert _put(app_client, t["pisteur"], vue).status_code == 200

        ecran["saison"] = "Campagne 2026-2027"       # l'admin enregistre son écran périmé
        assert _admin_put(app_client, adm, ecran).status_code == 200

        apres = _admin_get(app_client, adm)
        assert any(c["id"] == "col-course" for c in apres["collections"]), "la pesée a été détruite"
        assert apres["saison"] == "Campagne 2026-2027", "et la modification de l'admin doit passer"

    def test_une_ligne_absente_nest_pas_une_suppression(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"].append(_collection("col-1", "mb-1", t["patron_id"]))
        assert _put(app_client, t["patron"], vue).status_code == 200

        adm = _admin(app_client)
        ecran = _admin_get(app_client, adm)
        ecran["collections"] = []                    # sans liste de suppression
        assert _admin_put(app_client, adm, ecran).status_code == 200
        assert any(c["id"] == "col-1" for c in _admin_get(app_client, adm)["collections"])

    def test_une_suppression_explicite_est_repercutee(self, app_client):
        t = _seed_coop(app_client)
        adm = _admin(app_client)
        ecran = _admin_get(app_client, adm)
        ecran["members"] = [m for m in ecran["members"] if m["id"] != "mb-2"]
        assert _admin_put(app_client, adm, ecran, {"members": ["mb-2"]}).status_code == 200
        assert all(m["id"] != "mb-2" for m in _get_state(app_client, t["patron"])["members"])

    def test_les_compteurs_ne_redescendent_jamais(self, app_client):
        """Deux bordereaux au même numéro sinon."""
        t = _seed_coop(app_client)
        adm = _admin(app_client)
        ecran = _admin_get(app_client, adm)
        ecran["seq"] = 40
        assert _admin_put(app_client, adm, ecran).status_code == 200
        vieux = _admin_get(app_client, adm)
        vieux["seq"] = 3                              # écran périmé
        assert _admin_put(app_client, adm, vieux).status_code == 200
        assert _admin_get(app_client, adm)["seq"] == 40


# ----------------------------- Admin → application ------------------------- #

class TestAdminVersApplication:
    def test_le_bareme_saisi_arrive_sur_les_telephones(self, app_client):
        t = _seed_coop(app_client)
        adm = _admin(app_client)
        ecran = _admin_get(app_client, adm)
        co = ecran["coops"][0]
        co["prices"] = {**(co.get("prices") or {}), "cacao": 2500}
        co["commissions"] = {**(co.get("commissions") or {}), "cacao": 40}
        assert _admin_put(app_client, adm, ecran).status_code == 200

        vue = _get_state(app_client, t["patron"])
        assert vue["prices"]["cacao"] == 2500, "c'est là que l'application lit le prix"
        assert vue["commissions"]["cacao"] == 40

    def test_un_bareme_ne_deborde_pas_sur_une_autre_cooperative(self, app_client):
        t = _seed_coop(app_client)
        r = app_client.post("/api/auth/register",
                            json={"nom": "Patron B", "email": "b@coop.ci", "password": "secret123"})
        assert r.status_code == 200
        autre = r.json()["token"]

        adm = _admin(app_client)
        ecran = _admin_get(app_client, adm)
        mien = next(c for c in ecran["coops"] if c["id"] == _get_state(app_client, t["patron"])["coops"][0]["id"])
        mien["prices"] = {"cacao": 2500}
        assert _admin_put(app_client, adm, ecran).status_code == 200

        assert _get_state(app_client, t["patron"])["prices"]["cacao"] == 2500
        assert (_get_state(app_client, autre).get("prices") or {}).get("cacao") != 2500

    def test_un_compte_cree_depuis_ladmin_peut_se_connecter(self, app_client):
        t = _seed_coop(app_client)
        coop_id = _get_state(app_client, t["patron"])["coops"][0]["id"]
        adm = _admin(app_client)

        ecran = _admin_get(app_client, adm)
        ecran["staff"].append({"id": "adm-new", "coopId": coop_id, "nom": "Recrue",
                               "role": "commis", "tel": "0700007777",
                               "updatedAt": "2026-09-05T09:00:00.000Z"})
        assert _admin_put(app_client, adm, ecran).status_code == 200
        # Sans code secret, il ne peut pas encore entrer.
        assert app_client.post("/api/auth/coop/login",
                               json={"identifier": "0700007777", "secret": "777777"}).status_code == 401

        r = app_client.post("/api/admin/set-secret",
                            json={"kind": "staff", "id": "adm-new", "secret": "777777"},
                            headers=_auth(adm))
        assert r.status_code == 200, r.text
        r = app_client.post("/api/auth/coop/login", json={"identifier": "0700007777", "secret": "777777"})
        assert r.status_code == 200, r.text
        assert r.json()["identity"]["role"] == "commis"

    def test_une_modification_de_fiche_arrive_dans_lapp(self, app_client):
        t = _seed_coop(app_client)
        adm = _admin(app_client)
        ecran = _admin_get(app_client, adm)
        for m in ecran["members"]:
            if m["id"] == "mb-1":
                m["nom"] = "Kouassi N'Guessan"
                m["village"] = "Sikensi"
        assert _admin_put(app_client, adm, ecran).status_code == 200
        m = next(x for x in _get_state(app_client, t["patron"])["members"] if x["id"] == "mb-1")
        assert m["nom"] == "Kouassi N'Guessan" and m["village"] == "Sikensi"
        # …et son code secret n'a pas été emporté au passage.
        assert app_client.post("/api/auth/planteur/login",
                               json={"phone": "0700000010", "pin": "111111"}).status_code == 200

    def test_reinitialiser_un_code_secret(self, app_client):
        t = _seed_coop(app_client)
        adm = _admin(app_client)
        r = app_client.post("/api/admin/set-secret",
                            json={"kind": "members", "id": "mb-1", "secret": "424242"},
                            headers=_auth(adm))
        assert r.status_code == 200, r.text
        assert app_client.post("/api/auth/planteur/login",
                               json={"phone": "0700000010", "pin": "111111"}).status_code == 401
        assert app_client.post("/api/auth/planteur/login",
                               json={"phone": "0700000010", "pin": "424242"}).status_code == 200

    def test_un_secret_trop_court_est_refuse(self, app_client):
        _seed_coop(app_client)
        adm = _admin(app_client)
        r = app_client.post("/api/admin/set-secret",
                            json={"kind": "members", "id": "mb-1", "secret": "12"}, headers=_auth(adm))
        assert r.status_code == 400


class TestDesactivationDeCompte:
    def _desactive(self, client, adm, entite, rid, valeur=True):
        ecran = _admin_get(client, adm)
        for x in ecran[entite]:
            if x["id"] == rid:
                if valeur:
                    x["desactive"] = True
                else:
                    x.pop("desactive", None)
        return _admin_put(client, adm, ecran)

    def test_un_collaborateur_desactive_ne_se_connecte_plus(self, app_client):
        _seed_coop(app_client)
        adm = _admin(app_client)
        assert self._desactive(app_client, adm, "staff", "st-pisteur").status_code == 200
        r = app_client.post("/api/auth/coop/login", json={"identifier": "0700000003", "secret": "333333"})
        assert r.status_code == 403, "le secret est bon, l'accès ne l'est plus"
        assert "désactivé" in r.json()["detail"]

    def test_la_reactivation_rend_lacces(self, app_client):
        """Retirer le champ doit vraiment l'effacer : l'admin voit la fiche entière."""
        _seed_coop(app_client)
        adm = _admin(app_client)
        assert self._desactive(app_client, adm, "staff", "st-pisteur").status_code == 200
        assert self._desactive(app_client, adm, "staff", "st-pisteur", False).status_code == 200
        r = app_client.post("/api/auth/coop/login", json={"identifier": "0700000003", "secret": "333333"})
        assert r.status_code == 200, r.text

    def test_un_planteur_desactive_ne_se_connecte_plus(self, app_client):
        _seed_coop(app_client)
        adm = _admin(app_client)
        assert self._desactive(app_client, adm, "members", "mb-1").status_code == 200
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700000010", "pin": "111111"})
        assert r.status_code == 403

    def test_aucun_role_de_lapp_ne_peut_reactiver_son_compte(self, app_client):
        """La désactivation ne doit pas se lever depuis un téléphone."""
        t = _seed_coop(app_client)
        adm = _admin(app_client)
        assert self._desactive(app_client, adm, "members", "mb-2").status_code == 200
        vue = _get_state(app_client, t["pisteur"])
        for m in vue["members"]:
            if m["id"] == "mb-2":
                m["desactive"] = False
                m["updatedAt"] = "2026-09-06T09:00:00.000Z"
        assert _put(app_client, t["pisteur"], vue).status_code == 403


# ----------------------------- Application → admin ------------------------- #

class TestApplicationVersAdmin:
    def test_toutes_les_operations_remontent(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"].append(_collection("c-up", "mb-1", t["patron_id"]))
        vue["loans"].append({"id": "l-up", "memberId": "mb-1", "type": "argent", "amount": 50000,
                             "motif": "Santé", "date": "2026-03-01T09:00:00.000Z", "status": "approuve",
                             "soldeRestant": 50000, "decidedBy": t["patron_id"],
                             "updatedAt": "2026-03-01T09:00:00.000Z"})
        vue["settlements"].append({"id": "s-up", "memberId": "mb-1", "byStaffId": t["patron_id"],
                                   "amount": 5000, "method": "espece", "date": "2026-03-02T09:00:00.000Z",
                                   "updatedAt": "2026-03-02T09:00:00.000Z"})
        vue["sorties"].append({"id": "so-up", "type": "vente", "cropId": "cacao", "kg": 50,
                               "byStaffId": t["patron_id"], "date": "2026-03-03T09:00:00.000Z",
                               "updatedAt": "2026-03-03T09:00:00.000Z"})
        vue["depenses"].append({"id": "d-up", "pisteurId": t["patron_id"], "category": "transport",
                                "amount": 9000, "date": "2026-03-04T09:00:00.000Z", "note": "",
                                "updatedAt": "2026-03-04T09:00:00.000Z"})
        assert _put(app_client, t["patron"], vue).status_code == 200

        raw = _admin_get(app_client, _admin(app_client))
        for entite, rid in (("collections", "c-up"), ("loans", "l-up"), ("settlements", "s-up"),
                            ("sorties", "so-up"), ("depenses", "d-up")):
            assert any(x["id"] == rid for x in raw[entite]), entite

    def test_les_depenses_privees_dun_pisteur_remontent_aussi(self, app_client):
        """Invisibles du patron (invariant 24), mais le propriétaire les voit."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["depenses"].append({"id": "d-pis", "pisteurId": "st-pisteur", "category": "carburant",
                                "amount": 45000, "date": "2026-03-05T09:00:00.000Z", "note": "",
                                "updatedAt": "2026-03-05T09:00:00.000Z"})
        assert _put(app_client, t["pisteur"], vue).status_code == 200
        assert _get_state(app_client, t["patron"])["depenses"] == []
        raw = _admin_get(app_client, _admin(app_client))
        assert any(d["id"] == "d-pis" for d in raw["depenses"])

    def test_le_journal_dactivite_est_lisible_par_ladmin(self, app_client):
        t = _seed_coop(app_client)
        coop_id = _get_state(app_client, t["patron"])["coops"][0]["id"]
        app_client.post("/api/audit", json={"action": "pesee", "meta": {"memberId": "mb-1", "kg": 500}},
                        headers=_auth(t["pisteur"]))
        adm = _admin(app_client)
        r = app_client.get(f"/api/admin/audit?coopId={coop_id}", headers=_auth(adm))
        assert r.status_code == 200, r.text
        entrees = r.json()
        assert len(entrees) == 1
        assert entrees[0]["action"] == "pesee"
        assert entrees[0]["actorId"] == "st-pisteur", "l'acteur est posé par le serveur"
        assert entrees[0]["at"], "et l'horodatage aussi"


# ---------------------------------- Sécurité ------------------------------- #

class TestSecuriteAdmin:
    def test_aucun_jeton_dapplication_natteint_ladmin(self, app_client):
        t = _seed_coop(app_client)
        for role in ("patron", "pisteur", "commis", "planteur"):
            h = _auth(t[role])
            assert app_client.get("/api/admin/state", headers=h).status_code in (401, 403), role
            assert app_client.put("/api/admin/state", json={"data": {}}, headers=h).status_code in (401, 403), role
            assert app_client.get("/api/admin/audit", headers=h).status_code in (401, 403), role
            assert app_client.post("/api/admin/set-secret",
                                   json={"kind": "staff", "id": "st-pisteur", "secret": "000000"},
                                   headers=h).status_code in (401, 403), role
            assert app_client.post("/api/admin/purge-mouvements",
                                   json={"coopId": "x"}, headers=h).status_code in (401, 403), role

    def test_sans_jeton_rien_nest_accessible(self, app_client):
        _seed_coop(app_client)
        assert app_client.get("/api/admin/state").status_code in (401, 403)
        assert app_client.post("/api/admin/set-secret",
                               json={"kind": "staff", "id": "x", "secret": "111111"}).status_code in (401, 403)

    def test_les_empreintes_ne_partent_pas_vers_ladmin(self, app_client):
        """Invariant 5 : pour aucun rôle — le propriétaire du projet compris."""
        _seed_coop(app_client)
        raw = _admin_get(app_client, _admin(app_client))
        assert all("pin" not in x for x in raw["staff"])
        assert all("pin" not in x for x in raw["members"])
        # Un booléen dérivé dit s'il existe un code, sans le livrer.
        assert all(x["aSecret"] is True for x in raw["staff"] if x["id"] == "st-pisteur")

    def test_le_booleen_derive_nest_jamais_stocke(self, app_client):
        """`aSecret` se calcule à la lecture : le renvoyer ne doit rien figer."""
        _seed_coop(app_client)
        adm = _admin(app_client)
        ecran = _admin_get(app_client, adm)
        for x in ecran["staff"]:
            x["nom"] = x["nom"] + " Modifié"           # provoque une vraie écriture
        assert _admin_put(app_client, adm, ecran).status_code == 200
        # Le secret fonctionne encore : l'empreinte n'a pas été écrasée par le
        # booléen que l'admin nous a renvoyé.
        assert app_client.post("/api/auth/coop/login",
                               json={"identifier": "0700000003", "secret": "333333"}).status_code == 200
        # Et la fusion elle-même n'écrit jamais le champ dérivé.
        stocke = {"staff": [{"id": "s1", "nom": "A", "pin": {"hash": "x"}, "coopId": "co1"}]}
        fusion = app_client.server.merge_admin_state(
            stocke, {"staff": [{"id": "s1", "nom": "B", "aSecret": True, "coopId": "co1"}]}, {},
        )
        ligne = fusion["staff"][0]
        assert ligne["nom"] == "B", "la modification de l'admin passe"
        assert "aSecret" not in ligne, "le booléen dérivé n'est jamais stocké"
        assert ligne["pin"] == {"hash": "x"}, "et l'empreinte est reportée depuis le stocké"

    def test_le_mot_de_passe_admin_reste_exige(self, app_client):
        assert app_client.post("/api/admin/login", json={"password": "mauvais"}).status_code == 401
