"""Phase 2 de la migration : sessions Firebase par **jeton personnalisé**.

Le fournisseur « E-mail / Mot de passe » de Firebase ne convient pas à VALEO :
un collaborateur se connecte par téléphone, un planteur par un code
`VAL-XXXX-YY`, le propriétaire sans aucun identifiant — et le code à 6 chiffres
est haché **sur le téléphone**, si bien que le serveur ne voit jamais le clair.
Le jeton personnalisé laisse toute la vérification là où elle est : le serveur
valide le `pin` comme avant, puis frappe un jeton Firebase.

Ce que ce fichier doit prouver, c'est qu'on n'a RIEN déplacé de ce qui protège
les données : l'isolation entre coopératives, la matrice de rôles et le
périmètre du planteur s'appliquent exactement pareil, que le porteur présente
un jeton VALEO ou une session Firebase. Et que rien ne change tant que
Firebase n'est pas configuré.

Firebase n'est pas joignable ici : on le simule avec de VRAIS jetons RS256
signés localement. L'aiguillage, la vérification, le refus d'un jeton étranger
et la révocation sont donc réellement parcourus.
"""
import base64
import time

import jwt
import pytest

from tests.test_state_authorization import (
    _auth, _collection, _get_state, _put, _register, _seed_coop,
)
from tests.test_admin_sync import _admin

# Une paire de clés pour toute la session : la génération est coûteuse.
_CLE = None


def _cle():
    global _CLE
    if _CLE is None:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        _CLE = (
            priv.private_bytes(serialization.Encoding.PEM,
                               serialization.PrivateFormat.PKCS8,
                               serialization.NoEncryption()).decode(),
            priv.public_key().public_bytes(serialization.Encoding.PEM,
                                           serialization.PublicFormat.SubjectPublicKeyInfo).decode(),
        )
    return _CLE


class FauxFirebase:
    """Imite `firebase_admin.auth` : frappe et vérifie de vrais jetons RS256."""

    def __init__(self):
        self.revoques = set()
        self.en_panne = False

    def create_custom_token(self, uid, claims=None, app=None):
        if self.en_panne:
            raise RuntimeError("Firebase injoignable")
        return jwt.encode({"uid": uid, "claims": claims or {}}, _cle()[0], algorithm="RS256").encode()

    # Le jeton d'identité que le téléphone obtient en échangeant le jeton
    # personnalisé : les revendications y sont à plat, à côté du `uid`.
    def id_token(self, uid, claims, cle=None, expire_dans=3600):
        maintenant = int(time.time())
        charge = {**claims, "uid": uid, "sub": uid, "iat": maintenant,
                  "exp": maintenant + expire_dans, "auth_time": maintenant}
        return jwt.encode(charge, cle or _cle()[0], algorithm="RS256")

    def verify_id_token(self, tok, app=None, check_revoked=False):
        p = jwt.decode(tok, _cle()[1], algorithms=["RS256"])
        if check_revoked and p.get("uid") in self.revoques:
            raise ValueError("jeton révoqué")
        return p

    def revoke_refresh_tokens(self, uid, app=None):
        self.revoques.add(uid)


@pytest.fixture()
def fb(app_client, monkeypatch):
    """Active un Firebase simulé sur le serveur importé par le test."""
    import firebase_auth

    faux = FauxFirebase()
    monkeypatch.setattr(firebase_auth, "fb_auth", faux)
    monkeypatch.setattr(firebase_auth, "_app", object())
    monkeypatch.setattr(firebase_auth, "_tente", True)
    monkeypatch.setattr(firebase_auth, "CHECK_REVOKED", True)
    return faux


def _session(fb, client, jeton_personnalise):
    """Reproduit l'échange fait par le téléphone : jeton perso → jeton d'identité."""
    p = jwt.decode(jeton_personnalise, _cle()[1], algorithms=["RS256"])
    return fb.id_token(p["uid"], p["claims"])


def _coop_id(client, token):
    return _get_state(client, token)["coops"][0]["id"]


def _connexion(client, identifiant, secret):
    r = client.post("/api/auth/coop/login", json={"identifier": identifiant, "secret": secret})
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------------------------- #
# 1. Sans configuration, rien ne change
# ------------------------------------------------------------------------- #

class TestInerteSansConfiguration:
    """Le code peut être déployé AVANT d'avoir basculé quoi que ce soit."""

    def test_aucun_jeton_firebase_dans_la_reponse_de_connexion(self, app_client):
        _seed_coop(app_client)
        rep = _connexion(app_client, "patron@coop.ci", "secret123")
        assert "firebase" not in rep
        assert rep["token"] and rep["identity"] and rep["state"]

    def test_la_connexion_admin_reste_identique(self, app_client):
        r = app_client.post("/api/admin/login", json={"password": "admin123"})
        assert r.status_code == 200 and "firebase" not in r.json()

    def test_lempreinte_dit_que_firebase_est_inactif(self, app_client):
        t = _seed_coop(app_client)
        assert app_client.get("/api/diag", headers=_auth(t["patron"])).json()["authFirebase"] is False


# ------------------------------------------------------------------------- #
# 2. Le jeton personnalisé porte exactement l'identité VALEO
# ------------------------------------------------------------------------- #

class TestJetonPersonnalise:
    def test_chaque_role_recoit_un_jeton_a_son_nom(self, app_client, fb):
        t = _seed_coop(app_client)
        coop = _coop_id(app_client, t["patron"])
        attendu = [("patron@coop.ci", "secret123", t["patron_id"], "patron"),
                   ("0700000002", "222222", "st-magasin", "commis"),
                   ("0700000003", "333333", "st-pisteur", "pisteur")]
        for identifiant, secret, sid, role in attendu:
            rep = _connexion(app_client, identifiant, secret)
            p = jwt.decode(rep["firebase"], _cle()[1], algorithms=["RS256"])
            assert p["uid"] == f"staff:{sid}"
            assert p["claims"] == {"coopId": coop, "side": "coop", "role": role}

    def test_le_planteur_aussi(self, app_client, fb):
        t = _seed_coop(app_client)
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700000010", "pin": "111111"})
        assert r.status_code == 200, r.text
        p = jwt.decode(r.json()["firebase"], _cle()[1], algorithms=["RS256"])
        assert p["uid"] == "planteur:mb-1"
        assert p["claims"] == {"coopId": _coop_id(app_client, t["patron"]), "side": "planteur"}
        assert "role" not in p["claims"]

    def test_le_jeton_valeo_reste_delivre(self, app_client, fb):
        """Le hors-ligne en dépend : un jeton Firebase expire en une heure."""
        _seed_coop(app_client)
        rep = _connexion(app_client, "patron@coop.ci", "secret123")
        assert rep["token"] and rep["firebase"] and rep["token"] != rep["firebase"]

    def test_ladmin_recoit_un_jeton_sans_coopérative(self, app_client, fb):
        r = app_client.post("/api/admin/login", json={"password": "admin123"})
        p = jwt.decode(r.json()["firebase"], _cle()[1], algorithms=["RS256"])
        assert p["uid"] == "owner" and p["claims"] == {"admin": True}
        assert "coopId" not in p["claims"]

    def test_une_panne_firebase_nempeche_pas_de_se_connecter(self, app_client, fb):
        """Un pisteur doit pouvoir aller peser même si Google est injoignable."""
        _seed_coop(app_client)
        fb.en_panne = True
        rep = _connexion(app_client, "0700000003", "333333")
        assert "firebase" not in rep and rep["token"]


# ------------------------------------------------------------------------- #
# 3. Une session Firebase ouvre les MÊMES portes, ni plus ni moins
# ------------------------------------------------------------------------- #

class TestMemesDroitsQueLeJetonValeo:
    def test_lecture_identique(self, app_client, fb):
        t = _seed_coop(app_client)
        rep = _connexion(app_client, "patron@coop.ci", "secret123")
        idt = _session(fb, app_client, rep["firebase"])
        par_firebase = app_client.get("/api/state", headers=_auth(idt))
        assert par_firebase.status_code == 200
        assert par_firebase.json() == _get_state(app_client, t["patron"])

    def test_ecriture_identique(self, app_client, fb):
        t = _seed_coop(app_client)
        rep = _connexion(app_client, "0700000003", "333333")
        idt = _session(fb, app_client, rep["firebase"])
        vue = _get_state(app_client, t["pisteur"])
        vue["collections"].append(_collection("col-fb", "mb-1", "st-pisteur"))
        r = app_client.put("/api/state", json={"data": vue}, headers=_auth(idt))
        assert r.status_code == 200, r.text
        assert any(c["id"] == "col-fb" for c in _get_state(app_client, t["patron"])["collections"])

    def test_la_matrice_de_roles_tient_toujours(self, app_client, fb):
        """Invariant 2 : seul le patron change un réglage. Firebase n'y change rien."""
        t = _seed_coop(app_client)
        rep = _connexion(app_client, "0700000003", "333333")
        idt = _session(fb, app_client, rep["firebase"])
        vue = _get_state(app_client, t["pisteur"])
        vue["coops"][0]["prices"] = {"cacao": 9999}
        assert app_client.put("/api/state", json={"data": vue}, headers=_auth(idt)).status_code == 403

    def test_le_planteur_ne_recoit_toujours_que_ses_donnees(self, app_client, fb):
        """Invariants 4 et 5 : ni les autres planteurs, ni la moindre empreinte."""
        _seed_coop(app_client)
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700000010", "pin": "111111"})
        idt = _session(fb, app_client, r.json()["firebase"])
        vue = app_client.get("/api/state", headers=_auth(idt))
        assert vue.status_code == 200
        assert [m["id"] for m in vue.json()["members"]] == ["mb-1"]
        assert "pin" not in vue.text and "verifierHex" not in vue.text

    def test_lisolation_entre_cooperatives_tient_toujours(self, app_client, fb):
        """Invariant 1, la garantie la plus importante : elle vient du JETON."""
        a = _seed_coop(app_client)
        b = _register(app_client, email="patron@coopb.ci", nom="Patron B")
        coop_a, coop_b = _coop_id(app_client, a["patron"]), b["identity"]["coopId"]
        assert coop_a != coop_b

        rep = _connexion(app_client, "patron@coop.ci", "secret123")
        idt = _session(fb, app_client, rep["firebase"])

        vue = _get_state(app_client, a["patron"])
        # Le patron de A tente d'écrire une collecte estampillée coop B.
        intrus = _collection("col-intrus", "mb-1", a["patron_id"])
        intrus["coopId"] = coop_b
        vue["collections"].append(intrus)
        assert app_client.put("/api/state", json={"data": vue}, headers=_auth(idt)).status_code == 200

        chez_b = _get_state(app_client, b["token"])
        assert all(c["id"] != "col-intrus" for c in chez_b["collections"]), "fuite entre coopératives"
        chez_a = _get_state(app_client, a["patron"])
        assert any(c["id"] == "col-intrus" and c["coopId"] == coop_a for c in chez_a["collections"])


# ------------------------------------------------------------------------- #
# 4. Ce qu'un jeton Firebase ne doit PAS ouvrir
# ------------------------------------------------------------------------- #

class TestJetonsRefuses:
    def test_un_compte_firebase_sans_nos_revendications_nouvre_rien(self, app_client, fb):
        """Le vrai risque du mode « jeton personnalisé ».

        N'importe quel compte du projet Firebase peut présenter un jeton
        parfaitement valide pour Google. Sans `coopId` ni `side`, il ne doit
        franchir aucune porte : autrement, activer un jour un fournisseur
        externe ouvrirait l'application entière.
        """
        _seed_coop(app_client)
        etranger = fb.id_token("staff:inconnu", {})
        assert app_client.get("/api/state", headers=_auth(etranger)).status_code == 401
        assert app_client.get("/api/admin/state", headers=_auth(etranger)).status_code == 401

    def test_un_uid_qui_ment_sur_ses_revendications_est_refuse(self, app_client, fb):
        t = _seed_coop(app_client)
        menteur = fb.id_token("planteur:mb-1", {"coopId": _coop_id(app_client, t["patron"]),
                                                "side": "coop", "role": "patron"})
        assert app_client.get("/api/state", headers=_auth(menteur)).status_code == 401

    def test_un_jeton_dapplication_natteint_pas_ladministration(self, app_client, fb):
        t = _seed_coop(app_client)
        rep = _connexion(app_client, "patron@coop.ci", "secret123")
        idt = _session(fb, app_client, rep["firebase"])
        assert app_client.get("/api/admin/state", headers=_auth(idt)).status_code == 401
        assert app_client.get("/api/admin/diag", headers=_auth(idt)).status_code == 401

    def test_le_jeton_admin_natteint_pas_lapplication(self, app_client, fb):
        _seed_coop(app_client)
        r = app_client.post("/api/admin/login", json={"password": "admin123"})
        idt = _session(fb, app_client, r.json()["firebase"])
        assert app_client.get("/api/admin/state", headers=_auth(idt)).status_code == 200
        assert app_client.get("/api/state", headers=_auth(idt)).status_code == 401

    def test_un_jeton_signe_par_une_autre_cle_est_refuse(self, app_client, fb):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        t = _seed_coop(app_client)
        autre = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
        faux = fb.id_token(f"staff:{t['patron_id']}", {"coopId": _coop_id(app_client, t["patron"]),
                                                       "side": "coop", "role": "patron"}, cle=autre)
        assert app_client.get("/api/state", headers=_auth(faux)).status_code == 401

    def test_pas_de_confusion_dalgorithme(self, app_client, fb):
        """Un jeton HS256 déguisé en RS256 ne doit tromper aucun des deux chemins."""
        t = _seed_coop(app_client)
        vrai = jwt.encode({"sub": t["patron_id"], "coopId": _coop_id(app_client, t["patron"]),
                           "role": "patron", "side": "coop", "exp": int(time.time()) + 3600},
                          "secret-de-test-valeo", algorithm="HS256")
        # En-tête réécrite à la main : « alg: RS256 » sur une signature HS256.
        # L'aiguillage l'envoie donc chez Firebase, qui n'a jamais signé ça.
        entete = base64.urlsafe_b64encode(b'{"typ":"JWT","alg":"RS256"}').rstrip(b"=").decode()
        forge = entete + "." + vrai.split(".", 1)[1]
        assert app_client.get("/api/state", headers=_auth(forge)).status_code == 401
        # …et le jeton honnête passe : c'est bien l'en-tête qui a été rejetée.
        assert app_client.get("/api/state", headers=_auth(vrai)).status_code == 200

    def test_un_jeton_expire_est_refuse(self, app_client, fb):
        t = _seed_coop(app_client)
        perime = fb.id_token(f"staff:{t['patron_id']}", {"coopId": _coop_id(app_client, t["patron"]),
                                                         "side": "coop", "role": "patron"}, expire_dans=-60)
        assert app_client.get("/api/state", headers=_auth(perime)).status_code == 401


# ------------------------------------------------------------------------- #
# 5. La révocation — le gain que le jeton de 30 jours ne sait pas offrir
# ------------------------------------------------------------------------- #

class TestRevocation:
    def test_un_telephone_perdu_se_coupe_immediatement(self, app_client, fb):
        """Aujourd'hui un jeton VALEO perdu reste valable 30 jours."""
        import firebase_auth

        t = _seed_coop(app_client)
        rep = _connexion(app_client, "0700000003", "333333")
        idt = _session(fb, app_client, rep["firebase"])
        assert app_client.get("/api/state", headers=_auth(idt)).status_code == 200

        assert firebase_auth.revoquer({"sub": "st-pisteur", "side": "coop"}) is True
        assert app_client.get("/api/state", headers=_auth(idt)).status_code == 401
        # Le jeton VALEO du MÊME agent reste valable : la révocation Firebase ne
        # le couvre pas. À dire clairement plutôt qu'à laisser croire.
        assert app_client.get("/api/state", headers=_auth(t["pisteur"])).status_code == 200

    def test_la_revocation_ne_touche_que_le_compte_vise(self, app_client, fb):
        import firebase_auth

        _seed_coop(app_client)
        pisteur = _session(fb, app_client, _connexion(app_client, "0700000003", "333333")["firebase"])
        patron = _session(fb, app_client, _connexion(app_client, "patron@coop.ci", "secret123")["firebase"])
        firebase_auth.revoquer({"sub": "st-pisteur", "side": "coop"})
        assert app_client.get("/api/state", headers=_auth(pisteur)).status_code == 401
        assert app_client.get("/api/state", headers=_auth(patron)).status_code == 200


# ------------------------------------------------------------------------- #
# 6. Le contrat du module lui-même
# ------------------------------------------------------------------------- #

class TestContratDuModule:
    """`require_user` rattrape déjà un jeton sans `coopId`, mais on ne veut pas
    dépendre d'une seule barrière : `verifier` doit refuser de son côté."""

    def test_verifier_refuse_un_jeton_sans_revendications(self, app_client, fb):
        import firebase_auth

        assert firebase_auth.verifier(fb.id_token("staff:x", {})) is None

    def test_verifier_refuse_un_side_inconnu(self, app_client, fb):
        import firebase_auth

        assert firebase_auth.verifier(fb.id_token("staff:x", {"coopId": "c1", "side": "admin"})) is None

    def test_verifier_refuse_une_coop_vide(self, app_client, fb):
        import firebase_auth

        assert firebase_auth.verifier(fb.id_token("staff:x", {"coopId": "", "side": "coop"})) is None

    def test_verifier_rend_lidentite_valeo_exacte(self, app_client, fb):
        import firebase_auth

        jeton = fb.id_token("staff:st-pisteur", {"coopId": "c1", "side": "coop", "role": "pisteur"})
        assert firebase_auth.verifier(jeton) == {"sub": "st-pisteur", "coopId": "c1",
                                                 "role": "pisteur", "side": "coop"}

    def test_verifier_ne_confond_pas_le_proprietaire(self, app_client, fb):
        """Un `uid` qui ressemble à `owner` n'est pas `owner`."""
        import firebase_auth

        assert firebase_auth.verifier(fb.id_token("owner", {"admin": True})) == {"sub": "owner"}
        assert firebase_auth.verifier(fb.id_token("owner:bis", {"admin": True})) is None

    def test_sans_configuration_le_module_ne_fait_rien(self, app_client):
        """Aucun jeton frappé, aucun jeton accepté, aucune révocation."""
        import firebase_auth

        assert firebase_auth.disponible() is False
        assert firebase_auth.creer_jeton({"sub": "x", "coopId": "c1", "side": "coop"}) is None
        assert firebase_auth.creer_jeton_admin() is None
        assert firebase_auth.verifier("peu importe") is None
        assert firebase_auth.revoquer({"sub": "x", "side": "coop"}) is False


# ------------------------------------------------------------------------- #
# 7. Le bouton de révocation, côté administration
# ------------------------------------------------------------------------- #

class TestRevocationDepuisLAdmin:
    """Un téléphone perdu : couper le présent ET fermer l'avenir."""

    def _revoquer(self, client, adm, coop, rid, side="coop"):
        return client.post("/api/admin/revoke", json={"coopId": coop, "id": rid, "side": side},
                           headers=_auth(adm))

    def test_la_session_firebase_tombe_et_le_compte_est_desactive(self, app_client, fb):
        t = _seed_coop(app_client)
        adm, coop = _admin(app_client), _coop_id(app_client, t["patron"])
        idt = _session(fb, app_client, _connexion(app_client, "0700000003", "333333")["firebase"])
        assert app_client.get("/api/state", headers=_auth(idt)).status_code == 200

        r = self._revoquer(app_client, adm, coop, "st-pisteur")
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True, "desactive": True, "firebase": True}
        # Le présent est coupé…
        assert app_client.get("/api/state", headers=_auth(idt)).status_code == 401
        # …et l'avenir aussi : plus aucune connexion possible.
        assert app_client.post("/api/auth/coop/login",
                               json={"identifier": "0700000003", "secret": "333333"}).status_code == 403

    def test_le_planteur_aussi(self, app_client, fb):
        t = _seed_coop(app_client)
        adm, coop = _admin(app_client), _coop_id(app_client, t["patron"])
        assert self._revoquer(app_client, adm, coop, "mb-1", side="planteur").status_code == 200
        assert app_client.post("/api/auth/planteur/login",
                               json={"phone": "0700000010", "pin": "111111"}).status_code == 403

    def test_sans_firebase_la_desactivation_joue_quand_meme(self, app_client):
        """Le bouton reste utile avant même la bascule Firebase."""
        t = _seed_coop(app_client)
        adm, coop = _admin(app_client), _coop_id(app_client, t["patron"])
        r = self._revoquer(app_client, adm, coop, "st-pisteur")
        assert r.status_code == 200 and r.json()["firebase"] is False
        assert app_client.post("/api/auth/coop/login",
                               json={"identifier": "0700000003", "secret": "333333"}).status_code == 403

    def test_il_faut_le_jeton_proprietaire(self, app_client):
        t = _seed_coop(app_client)
        coop = _coop_id(app_client, t["patron"])
        corps = {"coopId": coop, "id": "st-pisteur", "side": "coop"}
        assert app_client.post("/api/admin/revoke", json=corps).status_code in (401, 403)
        assert app_client.post("/api/admin/revoke", json=corps,
                               headers=_auth(t["patron"])).status_code in (401, 403)

    def test_on_ne_revoque_pas_le_compte_dune_autre_cooperative(self, app_client):
        """Invariant 1 : l'isolation vaut aussi pour l'administration."""
        a = _seed_coop(app_client)
        b = _register(app_client, email="patron@coopb.ci", nom="Patron B")
        adm = _admin(app_client)
        r = self._revoquer(app_client, adm, b["identity"]["coopId"], "st-pisteur")
        assert r.status_code == 404
        # Le pisteur de A n'a pas été touché.
        assert app_client.post("/api/auth/coop/login",
                               json={"identifier": "0700000003", "secret": "333333"}).status_code == 200

    def test_une_cible_inconnue_est_refusee(self, app_client):
        t = _seed_coop(app_client)
        adm, coop = _admin(app_client), _coop_id(app_client, t["patron"])
        assert self._revoquer(app_client, adm, coop, "st-fantome").status_code == 404
        assert self._revoquer(app_client, adm, coop, "").status_code == 400
        assert self._revoquer(app_client, adm, coop, "st-pisteur", side="admin").status_code == 400

    def test_la_revocation_est_journalisee(self, app_client, fb):
        t = _seed_coop(app_client)
        adm, coop = _admin(app_client), _coop_id(app_client, t["patron"])
        self._revoquer(app_client, adm, coop, "st-pisteur")
        journal = app_client.get("/api/admin/audit", headers=_auth(adm)).json()
        ligne = next(x for x in journal if x["action"] == "revocation_compte")
        assert ligne["meta"]["id"] == "st-pisteur" and ligne["at"]

    def test_le_telephone_deja_connecte_ne_se_prend_pas_un_403_general(self, app_client):
        """Piège de l'invariant 23 : un champ posé par l'admin voyage en retour.

        Le jeton VALEO de l'agent reste valable après la révocation (c'est
        justement sa limite). Son téléphone continue donc de pousser, et
        renvoie sa fiche telle qu'il l'a reçue — `desactive` compris. Si le
        serveur y lisait une modification interdite, il refuserait TOUT le PUT
        et l'agent perdrait ses pesées en attente.
        """
        t = _seed_coop(app_client)
        adm, coop = _admin(app_client), _coop_id(app_client, t["patron"])
        assert self._revoquer(app_client, adm, coop, "st-pisteur").status_code == 200

        vue = _get_state(app_client, t["pisteur"])
        vue["collections"].append(_collection("col-apres-revocation", "mb-1", "st-pisteur"))
        r = _put(app_client, t["pisteur"], vue)
        assert r.status_code == 200, r.text
        assert any(c["id"] == "col-apres-revocation" for c in _get_state(app_client, t["patron"])["collections"])
