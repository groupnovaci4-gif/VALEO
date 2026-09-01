"""Anti-force-brute sur les connexions.

Un code secret fait 6 chiffres (10^6 combinaisons) et sa vérification coûte
quelques millisecondes : sans limitation, l'espace des codes est épuisable en
quelques heures. Ces tests vérifient le verrouillage progressif par identifiant.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from tests.test_state_authorization import _get_state, _register, _seed_coop


def _coop_login(client, identifier, secret):
    return client.post("/api/auth/coop/login", json={"identifier": identifier, "secret": secret})


def _planteur_login(client, phone, pin):
    return client.post("/api/auth/planteur/login", json={"phone": phone, "pin": pin})


def _fail_until_locked(login, *, tries=6):
    """Enchaîne les échecs et renvoie la première réponse verrouillée (429)."""
    for _ in range(tries):
        r = login()
        if r.status_code == 429:
            return r
    return None


class TestVerrouillageParIdentifiant:
    def test_le_planteur_est_verrouille_apres_plusieurs_echecs(self, app_client):
        t = _seed_coop(app_client)
        assert t  # coop peuplée : mb-1 / 0700000010 / code 111111

        locked = _fail_until_locked(lambda: _planteur_login(app_client, "0700000010", "000000"))
        assert locked is not None, "un code à 6 chiffres reste brute-forçable"
        assert locked.status_code == 429
        assert "Retry-After" in locked.headers
        assert int(locked.headers["Retry-After"]) > 0
        assert "Trop de tentatives" in locked.json()["detail"]

    def test_le_bon_code_est_refuse_pendant_le_verrou(self, app_client):
        _seed_coop(app_client)
        _fail_until_locked(lambda: _planteur_login(app_client, "0700000010", "000000"))
        # Le verrou porte sur l'identifiant : même le vrai code doit attendre.
        assert _planteur_login(app_client, "0700000010", "111111").status_code == 429

    def test_le_verrou_ne_touche_que_la_cible(self, app_client):
        t = _seed_coop(app_client)
        _fail_until_locked(lambda: _planteur_login(app_client, "0700000010", "000000"))
        # Un autre compte reste utilisable : pas de blocage collatéral.
        assert _coop_login(app_client, "0700000002", "222222").status_code == 200
        assert t["commis"]

    def test_la_connexion_coop_est_protegee_aussi(self, app_client):
        _seed_coop(app_client)
        locked = _fail_until_locked(lambda: _coop_login(app_client, "0700000002", "999999"))
        assert locked is not None and locked.status_code == 429

    def test_le_compte_admin_est_protege(self, app_client):
        locked = _fail_until_locked(lambda: app_client.post("/api/admin/login", json={"password": "faux"}))
        assert locked is not None and locked.status_code == 429
        assert app_client.post("/api/admin/login", json={"password": "admin123"}).status_code == 429

    def test_un_identifiant_inconnu_est_aussi_limite(self, app_client):
        # Sinon l'attaquant balaie les identifiants sans jamais être freiné.
        locked = _fail_until_locked(lambda: _planteur_login(app_client, "0799999999", "000000"))
        assert locked is not None and locked.status_code == 429


def _expirer_verrou(app_client, key):
    """Ramène la fin du verrou dans le passé, plutôt que d'attendre une minute."""
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    asyncio.run(app_client.server.db.login_attempts.update_one({"_id": key}, {"$set": {"lockedUntil": past}}))


class TestFinDuVerrou:
    def test_le_verrou_expire_et_la_connexion_repasse(self, app_client):
        _seed_coop(app_client)
        _fail_until_locked(lambda: _planteur_login(app_client, "0700000010", "000000"))
        assert _planteur_login(app_client, "0700000010", "111111").status_code == 429

        _expirer_verrou(app_client, "planteur:0700000010")
        assert _planteur_login(app_client, "0700000010", "111111").status_code == 200

    def test_une_connexion_reussie_remet_le_compteur_a_zero(self, app_client):
        _seed_coop(app_client)
        for _ in range(3):
            assert _planteur_login(app_client, "0700000010", "000000").status_code == 401
        assert _planteur_login(app_client, "0700000010", "111111").status_code == 200
        # Le compteur est reparti de zéro : 3 nouveaux échecs ne verrouillent pas.
        for _ in range(3):
            assert _planteur_login(app_client, "0700000010", "000000").status_code == 401


class TestNonEnumerationDesComptes:
    def test_meme_reponse_pour_un_compte_inconnu_et_un_mauvais_code(self, app_client):
        _seed_coop(app_client)
        inconnu = _planteur_login(app_client, "0788888888", "000000")
        mauvais = _planteur_login(app_client, "0700000010", "000000")
        assert inconnu.status_code == mauvais.status_code == 401
        assert inconnu.json()["detail"] == mauvais.json()["detail"]

    def test_la_cle_de_comptage_normalise_les_formats(self, app_client):
        """« 07 00 00 00 10 » et « 0700000010 » visent le même compte."""
        _seed_coop(app_client)
        for _ in range(3):
            _planteur_login(app_client, "07 00 00 00 10", "000000")
        for _ in range(3):
            _planteur_login(app_client, "0700000010", "000000")
        # 6 échecs au total sur la même cible malgré deux écritures différentes.
        assert _planteur_login(app_client, "0700000010", "111111").status_code == 429


class TestNonRegression:
    def test_une_connexion_valide_fonctionne_toujours(self, app_client):
        t = _seed_coop(app_client)
        assert _planteur_login(app_client, "0700000010", "111111").status_code == 200
        assert _coop_login(app_client, "0700000002", "222222").status_code == 200
        assert _get_state(app_client, t["patron"])["members"]

    def test_la_creation_de_compte_nest_pas_bloquee(self, app_client):
        for _ in range(6):
            _coop_login(app_client, "nouveau@coop.ci", "faux-mot-de-passe")
        # S'inscrire reste possible : le verrou ne porte que sur la connexion.
        assert _register(app_client, email="nouveau@coop.ci", nom="Nouveau")
