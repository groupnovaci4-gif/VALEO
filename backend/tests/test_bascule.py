"""Phase 6 : la bascule, et le risque de perdre des données en silence.

`EXPO_PUBLIC_BACKEND_URL` est figée au build (invariant 27). Un APK déjà
installé continuera donc d'appeler l'ANCIENNE instance après la bascule, quoi
qu'on fasse côté serveur. Ses pesées y seront bel et bien enregistrées — dans
une base que plus personne ne consulte — et l'application affichera
« Synchronisé ». C'est la perte de données la plus vicieuse du projet :
silencieuse, et du côté de l'utilisateur tout va bien.

D'où `BACKEND_DEPRECIE`, posé sur l'ancien déploiement : le serveur annonce
lui-même qu'il est hors service, dans un **en-tête**.

Pourquoi un en-tête et pas un champ de `/api/state` : `prepareSync` renvoie
TOUTES les lignes reçues, un champ ajouté à l'état repartirait donc au serveur
et serait lu comme une modification interdite — 403 sur tout le PUT
(invariant 23). L'en-tête ne touche pas aux données.
"""
import importlib
import os

import pytest

from tests.test_state_authorization import _auth, _seed_coop


ENTETE = "X-Valeo-Deprecie"


@pytest.fixture()
def deprecie(app_client, monkeypatch):
    """Déclare l'instance hors service, comme le ferait la variable d'env."""
    monkeypatch.setattr(app_client.server, "BACKEND_DEPRECIE",
                        "https://valeo-backend.run.app")
    return app_client


class TestSignalDeDepreciation:
    def test_par_defaut_aucun_signal(self, app_client):
        """Tant qu'on n'a pas basculé, rien ne doit alarmer personne."""
        assert ENTETE not in app_client.get("/health").headers

    def test_lentete_accompagne_toutes_les_reponses(self, deprecie):
        t = _seed_coop(deprecie)
        for chemin, entetes in (("/health", {}), ("/", {}),
                                ("/api/state", _auth(t["patron"])),
                                ("/api/state", _auth(t["planteur"]))):
            r = deprecie.get(chemin, headers=entetes)
            assert r.headers.get(ENTETE) == "https://valeo-backend.run.app", chemin

    def test_il_accompagne_aussi_les_refus(self, deprecie):
        """Un téléphone dont le jeton a expiré doit lui aussi être prévenu."""
        r = deprecie.get("/api/state")
        assert r.status_code == 401
        assert r.headers.get(ENTETE)

    def test_le_signal_ne_touche_PAS_aux_donnees(self, deprecie):
        """Invariant 23 : un champ ajouté à l'état ferait 403 sur tout le PUT."""
        t = _seed_coop(deprecie)
        etat = deprecie.get("/api/state", headers=_auth(t["patron"])).json()
        assert "deprecie" not in etat
        assert "X-Valeo-Deprecie" not in deprecie.get("/api/state", headers=_auth(t["patron"])).text

    def test_lapplication_continue_de_fonctionner(self, deprecie):
        """L'ancien serveur prévient, il ne se saborde pas : des agents sont
        peut-être encore en tournée avec des pesées à envoyer."""
        t = _seed_coop(deprecie)
        from tests.test_state_authorization import _collection, _get_state, _put

        vue = _get_state(deprecie, t["pisteur"])
        vue["collections"].append(_collection("col-apres-avis", "mb-1", "st-pisteur"))
        r = _put(deprecie, t["pisteur"], vue)
        assert r.status_code == 200, r.text
        assert r.headers.get(ENTETE)


class TestEnTeteTransportable:
    """Un en-tête HTTP ne véhicule que du latin-1.

    Défaut réel, trouvé en exécutant : un message écrit en français attrape
    naturellement un tiret cadratin ou une apostrophe courbe. Starlette lève
    alors, et le serveur répond **500 sur TOUTES les requêtes** — l'avertissement
    mettait à terre l'instance qu'il devait seulement annoter, au moment précis
    d'une bascule.
    """

    def test_les_caracteres_typographiques_sont_ramenes(self, app_client):
        f = app_client.server.entete_transportable
        assert f("https://x.run.app — mettez à jour") == "https://x.run.app - mettez à jour"
        assert f("l’application") == "l'application"
        assert f("“VALEO”") == '"VALEO"'
        assert f("suite…") == "suite..."

    def test_les_accents_passent(self, app_client):
        """Ils sont dans latin-1 : les retirer abîmerait le message pour rien."""
        assert app_client.server.entete_transportable("Mise à jour requise — coopérative") \
            == "Mise à jour requise - coopérative"

    def test_le_resultat_est_toujours_transportable(self, app_client):
        f = app_client.server.entete_transportable
        for brut in ("—’“…", "emoji \U0001F600 et 中文",
                     "normal", "", "  espaces  "):
            f(brut).encode("latin-1")  # ne doit jamais lever

    def test_un_message_impossible_nempeche_pas_de_repondre(self, app_client, monkeypatch):
        """Ceinture et bretelles : même mal assainie, la valeur ne doit pas
        pouvoir renvoyer 500. Elle annonce une panne, elle n'en crée pas."""
        monkeypatch.setattr(app_client.server, "BACKEND_DEPRECIE", "avis — non assaini")
        r = app_client.get("/health")
        assert r.status_code == 200, "le serveur doit répondre malgré tout"


class TestValeurLueDepuisLEnvironnement:
    def test_la_variable_est_assainie_au_chargement(self):
        """Le serveur ne doit pas dépendre de la propreté de la variable."""
        import server

        assert server.entete_transportable("https://x — y") == "https://x - y"
        # La constante est bien issue de l'environnement, assainie.
        assert server.BACKEND_DEPRECIE == server.entete_transportable(
            (os.environ.get("BACKEND_DEPRECIE") or "").strip())


class TestVisibiliteDansUnNavigateur:
    """Sur le web, un en-tête hors liste standard est MASQUÉ au JavaScript.

    Sans `expose_headers`, `r.headers.get("X-Valeo-Deprecie")` renvoie `null`
    dans un navigateur : l'avertissement existerait côté serveur et personne ne
    le verrait. Le harnais de test, lui, ne fait pas de CORS — il ne peut donc
    pas voir ce défaut, d'où ce contrôle sur la configuration elle-même.
    """

    def test_lentete_est_expose_au_javascript(self, app_client):
        from starlette.middleware.cors import CORSMiddleware

        cors = next((m for m in app_client.server.app.user_middleware
                     if m.cls is CORSMiddleware), None)
        assert cors is not None, "le middleware CORS a disparu"
        exposes = cors.kwargs.get("expose_headers") or []
        assert app_client.server.ENTETE_DEPRECIE in exposes, \
            "sans cela, le bandeau de mise à jour n'apparaîtra jamais sur le web"

    def test_les_identifiants_ne_sont_toujours_pas_autorises(self, app_client):
        """En exposant un en-tête, ne pas ouvrir au passage les cookies."""
        from starlette.middleware.cors import CORSMiddleware

        cors = next(m for m in app_client.server.app.user_middleware if m.cls is CORSMiddleware)
        assert cors.kwargs.get("allow_credentials") is False
