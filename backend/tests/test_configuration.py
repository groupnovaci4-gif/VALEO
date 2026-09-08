"""Contrôle de configuration : ce qui fait rater un déploiement.

Le code des six phases est prêt et couvert. Ce qui reste à faire échouer un
déploiement, ce sont les détails de configuration — et ils ne se voient pas en
relisant du code. Ce fichier éprouve `scripts/verifier_configuration.py` sur
les cas réellement rencontrés, dont celui-ci :

    `firebase init` écrit des règles ouvertes à tout internet, installe un SDK
    dont on ne veut pas, et `npm install` pose un second arbre de dépendances —
    le tout sans qu'aucun test fonctionnel ne bronche.

Et le plus insidieux : `.firebaserc` désignant un projet, le compte de service
un autre. Hosting se déploie alors chez l'un pendant que le backend écrit chez
l'autre, et l'on retombe très exactement sur « rien ne remonte dans le tableau
de bord » (invariant 27).
"""
import importlib.util
import json
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location(
    "verif_conf", BACKEND / "scripts" / "verifier_configuration.py")
verif_conf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verif_conf)


REGLES_FERMEES = """rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
"""
# Ce que `firebase init` propose par défaut : la base ouverte pendant 30 jours.
REGLES_INIT = """rules_version='2'
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 10, 7);
    }
  }
}
"""

FIREBASE_JSON = {
    "hosting": {
        "public": "frontend/dist",
        "rewrites": [
            {"source": "/api/**", "run": {"serviceId": "valeo-backend", "region": "europe-west1"}},
            {"source": "/health", "run": {"serviceId": "valeo-backend", "region": "europe-west1"}},
            {"source": "**", "destination": "/index.html"},
        ],
    },
    "firestore": {"rules": "firestore.rules", "indexes": "firestore.indexes.json"},
}

ENV_SAINE = {
    "ADMIN_PASSWORD": "un-mot-de-passe",
    "JWT_SECRET": "f" * 64,
    "DATA_BACKEND": "mongo",
    "MONGO_URL": "mongodb://localhost:27017",
    "DB_NAME": "valeo",
}


@pytest.fixture()
def projet(tmp_path):
    """Une arborescence VALEO correctement configurée."""
    (tmp_path / "backend" / "scripts").mkdir(parents=True)
    (tmp_path / "frontend" / "dist").mkdir(parents=True)
    (tmp_path / "firebase.json").write_text(json.dumps(FIREBASE_JSON), encoding="utf-8")
    (tmp_path / "firestore.indexes.json").write_text('{"indexes":[]}', encoding="utf-8")
    (tmp_path / "firestore.rules").write_text(REGLES_FERMEES, encoding="utf-8")
    (tmp_path / ".firebaserc").write_text(
        json.dumps({"projects": {"default": "valeo-app-595db"}}), encoding="utf-8")
    (tmp_path / "frontend" / "package.json").write_text(
        json.dumps({"packageManager": "yarn@1.22.22", "dependencies": {"expo": "54.0.36"}}),
        encoding="utf-8")
    (tmp_path / "frontend" / ".env.example").write_text("EXPO_PUBLIC_BACKEND_URL=\n", encoding="utf-8")
    (tmp_path / "frontend" / ".env").write_text(
        "EXPO_PUBLIC_BACKEND_URL=\nEXPO_PUBLIC_FIREBASE_API_KEY=AIzaFactice\n", encoding="utf-8")
    return tmp_path


def _lancer(projet, env=None, cible="web"):
    return verif_conf.verifier(projet, {**ENV_SAINE, **(env or {})}, cible)


class TestConfigurationSaine:
    def test_une_configuration_correcte_passe(self, projet):
        r = _lancer(projet)
        assert r.ko == 0, "\n".join(r.lignes)

    def test_le_rapport_ne_montre_AUCUN_secret(self, projet):
        """Il sera collé dans une conversation d'assistance : rien ne doit fuir."""
        r = _lancer(projet, {"ADMIN_PASSWORD": "TRES-SECRET-123",
                             "JWT_SECRET": "a1b2c3" * 12,
                             "FIREBASE_SERVICE_ACCOUNT": json.dumps(
                                 {"project_id": "valeo-app-595db",
                                  "private_key": "-----BEGIN PRIVATE KEY-----XYZ"})})
        texte = "\n".join(r.lignes)
        for interdit in ("TRES-SECRET-123", "a1b2c3", "PRIVATE KEY", "XYZ"):
            assert interdit not in texte, interdit


class TestPiegesFirebaseInit:
    def test_les_regles_ouvertes_bloquent(self, projet):
        (projet / "firestore.rules").write_text(REGLES_INIT, encoding="utf-8")
        r = _lancer(projet)
        assert r.ko >= 1
        assert any("tout internet" in l for l in r.lignes)

    def test_le_sdk_firebase_bloque(self, projet):
        p = projet / "frontend" / "package.json"
        d = json.loads(p.read_text())
        d["dependencies"]["firebase"] = "^12.18.0"
        p.write_text(json.dumps(d), encoding="utf-8")
        assert _lancer(projet).ko >= 1

    def test_le_package_lock_bloque(self, projet):
        (projet / "frontend" / "package-lock.json").write_text("{}", encoding="utf-8")
        assert _lancer(projet).ko >= 1


class TestDeuxProjetsDifferents:
    """Le défaut le plus difficile à voir : tout marche, mais à deux endroits."""

    def _compte(self, projet, project_id):
        chemin = projet / "backend" / "compte.json"
        chemin.write_text(json.dumps({"project_id": project_id, "type": "service_account"}),
                          encoding="utf-8")
        return {"DATA_BACKEND": "firestore", "MONGO_URL": "", "DB_NAME": "",
                "FIREBASE_SERVICE_ACCOUNT_FILE": str(chemin)}

    def test_meme_projet_des_deux_cotes(self, projet):
        r = _lancer(projet, self._compte(projet, "valeo-app-595db"))
        assert r.ko == 0, "\n".join(r.lignes)

    def test_projets_differents_bloquent(self, projet):
        r = _lancer(projet, self._compte(projet, "un-autre-projet"))
        assert r.ko >= 1
        assert any("deux endroits" in l for l in r.lignes)

    def test_firestore_sans_compte_de_service_bloque(self, projet):
        r = _lancer(projet, {"DATA_BACKEND": "firestore", "MONGO_URL": "", "DB_NAME": ""})
        assert r.ko >= 1
        assert any("compte de service" in l for l in r.lignes)

    def test_sur_cloud_run_le_compte_est_ambiant(self, projet):
        """K_SERVICE est posé par la plateforme : aucune clé privée à déposer."""
        r = _lancer(projet, {"DATA_BACKEND": "firestore", "MONGO_URL": "", "DB_NAME": "",
                             "K_SERVICE": "valeo-backend"})
        assert r.ko == 0, "\n".join(r.lignes)


class TestRoutageHosting:
    def test_deux_regions_differentes_bloquent(self, projet):
        conf = json.loads((projet / "firebase.json").read_text())
        conf["hosting"]["rewrites"][1]["run"]["region"] = "africa-south1"
        (projet / "firebase.json").write_text(json.dumps(conf), encoding="utf-8")
        r = _lancer(projet)
        assert r.ko >= 1
        assert any("MÊME région" in l for l in r.lignes)

    def test_le_repli_spa_place_en_premier_bloque(self, projet):
        """Placé avant, il attrape /api/** : l'application reçoit du HTML."""
        conf = json.loads((projet / "firebase.json").read_text())
        conf["hosting"]["rewrites"].insert(0, conf["hosting"]["rewrites"].pop())
        (projet / "firebase.json").write_text(json.dumps(conf), encoding="utf-8")
        r = _lancer(projet)
        assert r.ko >= 1
        assert any("DERNIER" in l for l in r.lignes)

    def test_sans_renvoi_vers_cloud_run_ca_bloque(self, projet):
        conf = json.loads((projet / "firebase.json").read_text())
        conf["hosting"]["rewrites"] = [{"source": "**", "destination": "/index.html"}]
        (projet / "firebase.json").write_text(json.dumps(conf), encoding="utf-8")
        assert _lancer(projet).ko >= 1


class TestCibleWebOuApk:
    """Invariant 31 : web = même origine, APK = URL absolue figée au build."""

    def _url(self, projet, valeur):
        (projet / "frontend" / ".env").write_text(
            f"EXPO_PUBLIC_BACKEND_URL={valeur}\nEXPO_PUBLIC_FIREBASE_API_KEY=AIzaFactice\n",
            encoding="utf-8")

    def test_web_avec_une_url_figee_bloque(self, projet):
        self._url(projet, "https://valeo-backend.run.app")
        r = _lancer(projet, cible="web")
        assert r.ko >= 1
        assert any("même origine" in l for l in r.lignes)

    def test_apk_sans_url_bloque(self, projet):
        self._url(projet, "")
        r = _lancer(projet, cible="apk")
        assert r.ko >= 1
        assert any("URL absolue" in l for l in r.lignes)

    def test_apk_avec_une_url_https_passe(self, projet):
        self._url(projet, "https://valeo-backend.run.app")
        assert _lancer(projet, cible="apk").ko == 0

    def test_apk_en_http_bloque(self, projet):
        self._url(projet, "http://valeo-backend.run.app")
        assert _lancer(projet, cible="apk").ko >= 1


class TestVariablesDuBackend:
    def test_les_variables_obligatoires_manquantes_bloquent(self, projet):
        r = verif_conf.verifier(projet, {}, "web")
        assert r.ko >= 2

    def test_un_jwt_secret_court_est_signale_sans_bloquer(self, projet):
        """Il signe des sessions de 30 jours : une valeur devinable les forge."""
        r = _lancer(projet, {"JWT_SECRET": "court"})
        assert r.ko == 0 and r.avis >= 1

    def test_le_fichier_env_du_backend_est_pris_en_compte(self, projet):
        (projet / "backend" / ".env").write_text(
            "ADMIN_PASSWORD=depuis-le-fichier\nJWT_SECRET=" + "f" * 64 +
            "\nMONGO_URL=mongodb://x\nDB_NAME=valeo\n", encoding="utf-8")
        assert verif_conf.verifier(projet, {}, "web").ko == 0

    def test_backend_deprecie_est_signale(self, projet):
        """Posé par erreur sur le NOUVEAU déploiement, il dirait à tous les
        téléphones de partir ailleurs (invariant 32)."""
        r = _lancer(projet, {"BACKEND_DEPRECIE": "https://ailleurs"})
        assert r.avis >= 1
        assert any("ANCIEN" in l for l in r.lignes)
