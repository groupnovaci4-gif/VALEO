"""Phase 4 : le backend conteneurisé pour Cloud Run.

Ces tests couvrent une catégorie de défaut que la suite fonctionnelle ne voit
pas : **ce qui casse en production sans rien casser en test**. Trois cas réels,
rencontrés en préparant cette phase :

1. `requirements.txt` contient `emergentintegrations==0.2.0`, hérité du builder
   d'origine et **absent de PyPI** : un `pip install` dans une image Docker
   échoue purement et simplement. Les tests, eux, tournaient très bien.
2. Le serveur exigeait `MONGO_URL` même avec `DATA_BACKEND=firestore` : un
   déploiement Cloud Run + Firestore ne démarrait pas, faute d'une base dont il
   n'avait aucun usage.
3. Le démarrage attendait 30 secondes que MongoDB réponde avant d'abandonner.
   Sur Cloud Run une instance démarre à chaque montée en charge — devant un
   pisteur qui attend sa synchronisation.

Aucun de ces trois n'aurait été vu par un test fonctionnel.
"""
import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
RACINE = BACKEND.parent

# Modules du backend embarqués dans l'image (cf. Dockerfile).
MODULES = ["server.py", "depot.py", "firebase_auth.py"]

# Modules de la bibliothèque standard ou internes : rien à installer pour eux.
INTERNES = {"depot", "firebase_auth"}


def _imports_reels() -> set:
    """Paquets tiers réellement importés par le code embarqué."""
    paquets = set()
    for nom in MODULES:
        arbre = ast.parse((BACKEND / nom).read_text(encoding="utf-8"))
        for noeud in ast.walk(arbre):
            if isinstance(noeud, ast.Import):
                paquets |= {a.name.split(".")[0] for a in noeud.names}
            elif isinstance(noeud, ast.ImportFrom) and noeud.level == 0 and noeud.module:
                paquets.add(noeud.module.split(".")[0])
    return {p for p in paquets
            if p not in INTERNES and p not in sys.stdlib_module_names}


def _paquets_declares(fichier: str) -> set:
    lignes = (BACKEND / fichier).read_text(encoding="utf-8").splitlines()
    noms = set()
    for l in lignes:
        l = l.split("#")[0].strip()
        if not l:
            continue
        noms.add(re.split(r"[<>=!\[]", l)[0].strip().lower())
    return noms


# Correspondance nom de paquet PyPI → nom du module importé.
FOURNI_PAR = {
    "jwt": "pyjwt",
    "dotenv": "python-dotenv",
    "starlette": "fastapi",        # dépendance directe de FastAPI
    "google": "google-cloud-firestore",
    "firebase_admin": "firebase-admin",
}


class TestDependancesDeProduction:
    def test_chaque_import_est_declare(self):
        """Un import non déclaré ne casse que la production."""
        declares = _paquets_declares("requirements-prod.txt")
        manquants = []
        for module in sorted(_imports_reels()):
            attendu = FOURNI_PAR.get(module, module).lower()
            if attendu not in declares:
                manquants.append(f"{module} (attendu : {attendu})")
        assert not manquants, f"absents de requirements-prod.txt : {manquants}"

    def test_le_paquet_introuvable_du_builder_nest_pas_embarque(self):
        """`emergentintegrations` n'existe pas sur PyPI : il ferait échouer le build."""
        assert "emergentintegrations" not in _paquets_declares("requirements-prod.txt")
        # Il est toujours dans le fichier de développement : c'est voulu, on ne
        # touche pas aux habitudes de travail — mais il ne part pas en image.
        assert "emergentintegrations" in _paquets_declares("requirements.txt")

    def test_les_grosses_dependances_inutilisees_restent_dehors(self):
        """Chaque mégaoctet se paie au démarrage à froid, devant un pisteur."""
        declares = _paquets_declares("requirements-prod.txt")
        for inutile in ("pandas", "numpy", "boto3", "jq", "typer", "passlib", "python-jose"):
            assert inutile not in declares, f"{inutile} n'est importé nulle part"

    def test_cryptography_est_present(self):
        """Sans elle, PyJWT ne sait pas vérifier un RS256 : toute session
        Firebase serait rejetée en production, et nulle part ailleurs."""
        assert "cryptography" in _paquets_declares("requirements-prod.txt")


class TestVariablesDocumentees:
    """Une variable lue par le code et documentée nulle part est un piège.

    C'est ainsi qu'on déploie un backend qui refuse de démarrer sans que
    personne sache quoi renseigner : le dépôt ne contenait aucun `.env.example`,
    et les 18 variables du backend n'existaient que dans le code.
    """

    # Posées par la PLATEFORME (Cloud Run, App Engine), jamais par l'utilisateur.
    FOURNIES_PAR_LA_PLATEFORME = {"K_SERVICE", "GAE_ENV"}

    def _lues(self, fichiers, motif) -> set:
        trouvees = set()
        for nom in fichiers:
            for m in re.finditer(motif, (BACKEND.parent / nom).read_text(encoding="utf-8")):
                trouvees.add(m.group(1))
        return trouvees

    def _documentees(self, chemin: str) -> set:
        texte = (BACKEND.parent / chemin).read_text(encoding="utf-8")
        return set(re.findall(r"^#?\s*([A-Z][A-Z0-9_]+)=", texte, re.M))

    def test_chaque_variable_du_backend_est_documentee(self):
        lues = self._lues([f"backend/{n}" for n in MODULES],
                          r'os\.environ(?:\.get)?[\[(]"([A-Z_]+)"')
        manquantes = lues - self._documentees("backend/.env.example") - self.FOURNIES_PAR_LA_PLATEFORME
        assert not manquantes, f"absentes de backend/.env.example : {sorted(manquantes)}"

    def test_chaque_variable_du_frontend_est_documentee(self):
        lues = set()
        for dossier in ("frontend/src", "frontend/app"):
            for f in (BACKEND.parent / dossier).rglob("*.ts*"):
                lues |= set(re.findall(r"process\.env\.(EXPO_PUBLIC_[A-Z_]+)", f.read_text(encoding="utf-8")))
        manquantes = lues - self._documentees("frontend/.env.example")
        assert not manquantes, f"absentes de frontend/.env.example : {sorted(manquantes)}"

    def test_les_modeles_ne_contiennent_aucune_valeur_reelle(self):
        """Ils sont suivis par git : une valeur oubliée dedans est publiée."""
        for chemin in ("backend/.env.example", "frontend/.env.example"):
            texte = (BACKEND.parent / chemin).read_text(encoding="utf-8")
            assert "mongodb+srv" not in texte
            assert not re.search(r"^\s*(ADMIN_PASSWORD|JWT_SECRET)=.+$", texte, re.M), \
                f"{chemin} porte un secret renseigné"
            assert not re.search(r"AIzaSy[A-Za-z0-9_-]{10}", texte), f"{chemin} porte une clé réelle"

    def test_les_modeles_sont_bien_suivis_par_git(self):
        """`.gitignore` masque `.env*` : sans négation, les modèles n'arrivent
        jamais chez celui qui clone — et il ne sait pas quoi renseigner."""
        ignore = (BACKEND.parent / ".gitignore").read_text(encoding="utf-8")
        assert "!**/.env.example" in ignore


class TestConteneur:
    def _dockerfile(self):
        return (BACKEND / "Dockerfile").read_text(encoding="utf-8")

    def test_le_port_vient_de_lenvironnement(self):
        """Cloud Run IMPOSE $PORT. Un port codé en dur = service muet."""
        d = self._dockerfile()
        assert "${PORT}" in d or "$PORT" in d
        assert "--port 8000" not in d

    def test_lecoute_est_sur_toutes_les_interfaces(self):
        """127.0.0.1 dans un conteneur n'est joignable par personne."""
        assert "--host 0.0.0.0" in self._dockerfile()

    def test_le_conteneur_ne_tourne_pas_en_root(self):
        d = self._dockerfile()
        assert re.search(r"^USER\s+(?!root)", d, re.M), "aucun USER non privilégié"

    def test_il_installe_le_fichier_de_production(self):
        d = self._dockerfile()
        assert "requirements-prod.txt" in d
        assert not re.search(r"-r\s+requirements\.txt", d), "installerait le paquet introuvable"

    def test_les_tests_et_scripts_ne_partent_pas_en_image(self):
        ign = (BACKEND / ".dockerignore").read_text(encoding="utf-8")
        for exclu in ("tests/", "scripts/", ".env"):
            assert exclu in ign, exclu

    def test_le_env_ne_peut_pas_entrer_dans_limage(self):
        """Une image est poussée dans un registre : tout ce qu'elle contient
        est lisible par qui peut la tirer."""
        ign = (BACKEND / ".dockerignore").read_text(encoding="utf-8")
        assert ".env" in ign
        d = self._dockerfile()
        assert not re.search(r"^COPY\s+\.\s", d, re.M), "un COPY . emporterait tout"


class TestConfigurationDeploiement:
    def test_hosting_renvoie_lapi_vers_cloud_run(self):
        conf = json.loads((RACINE / "firebase.json").read_text(encoding="utf-8"))
        regles = conf["hosting"]["rewrites"]
        api = next(r for r in regles if r["source"] == "/api/**")
        assert "run" in api and api["run"]["serviceId"]
        # Le repli SPA doit venir EN DERNIER, sinon il attrape aussi l'API.
        assert regles[-1]["source"] == "**"

    def test_les_regles_firestore_refusent_tout_acces_direct(self):
        """Invariant 29 : le backend est le seul écrivain."""
        regles = (RACINE / "firestore.rules").read_text(encoding="utf-8")
        assert "allow read, write: if false;" in regles
        assert "if true" not in regles

    def test_les_regles_par_defaut_de_firebase_init_ne_sont_pas_la(self):
        """`firebase init` écrit des règles OUVERTES À TOUT INTERNET.

        Sa proposition par défaut est `allow read, write: if request.time <
        timestamp.date(...)` : n'importe qui connaissant l'identifiant du projet
        peut alors lire et effacer toute la base, jusqu'à la date indiquée. Le
        fichier de ce dépôt doit rester celui qui refuse tout — un `firebase
        init` relancé l'écrase sans prévenir.
        """
        regles = (RACINE / "firestore.rules").read_text(encoding="utf-8")
        assert "request.time" not in regles, "règles par défaut de firebase init : la base serait ouverte"
        assert "timestamp.date" not in regles

    def test_les_index_firestore_sont_declares(self):
        """Sans le fichier, `firebase deploy --only firestore` réclame."""
        import json as _json

        conf = _json.loads((RACINE / "firebase.json").read_text(encoding="utf-8"))
        assert conf["firestore"]["indexes"] == "firestore.indexes.json"
        _json.loads((RACINE / "firestore.indexes.json").read_text(encoding="utf-8"))

    def test_le_frontend_reste_sur_yarn(self):
        """Un `package-lock.json` à côté de `yarn.lock`, ce sont DEUX arbres de
        dépendances qui divergent : l'un sert au développement, l'autre à la
        construction, et le jour où ils ne coïncident plus le défaut n'est
        reproductible nulle part. `package.json` fixe `packageManager: yarn`.
        """
        front = RACINE / "frontend"
        conf = json.loads((front / "package.json").read_text(encoding="utf-8"))
        assert conf.get("packageManager", "").startswith("yarn")
        assert not (front / "package-lock.json").exists(), "installé avec npm : utiliser yarn"

    def test_le_sdk_firebase_nest_pas_une_dependance(self):
        """Invariant 28 : l'échange de jeton tient en deux requêtes REST.

        Le SDK JS pèse plusieurs centaines de kilo-octets et tire des
        dépendances natives, pour des téléphones d'entrée de gamme. Surtout, le
        faire entrer ouvre la porte à un accès direct à Firestore depuis
        l'application — exactement ce que l'invariant 29 exclut.
        """
        conf = json.loads((RACINE / "frontend" / "package.json").read_text(encoding="utf-8"))
        deps = {**conf.get("dependencies", {}), **conf.get("devDependencies", {})}
        assert "firebase" not in deps, "le SDK Firebase ne doit pas être installé"

    def test_aucun_secret_dans_la_configuration_de_build(self):
        build = (BACKEND / "cloudbuild.yaml").read_text(encoding="utf-8")
        assert "--set-secrets=" in build, "les secrets passent par Secret Manager"
        assert not re.search(r"(ADMIN_PASSWORD|JWT_SECRET)=(?!valeo-)[^\s,:]+", build)


class TestDemarrage:
    """Le serveur démarre-t-il vraiment dans les conditions de Cloud Run ?"""

    def _lancer(self, **env):
        base = {k: v for k, v in os.environ.items()
                if k not in ("MONGO_URL", "DB_NAME", "DATA_BACKEND", "ADMIN_PASSWORD", "JWT_SECRET")}
        base.update({"ADMIN_PASSWORD": "x", "JWT_SECRET": "y", **env})
        return subprocess.run([sys.executable, "-c", "import server"],
                              cwd=BACKEND, env=base, capture_output=True, text=True, timeout=90)

    def test_firestore_ne_reclame_pas_de_mongodb(self):
        """Le défaut corrigé : Cloud Run + Firestore refusait de démarrer."""
        r = self._lancer(DATA_BACKEND="firestore")
        assert "MONGO_URL" not in r.stderr, r.stderr[-600:]
        # Il s'arrête bien plus loin, faute de compte de service — ce qui est
        # attendu ici : Firebase n'est pas joignable depuis le harnais.
        assert "compte de service Firebase" in r.stderr

    def test_en_mode_mongo_labsence_de_base_est_dite_clairement(self):
        r = self._lancer()
        assert "MONGO_URL et DB_NAME sont requis" in r.stderr

    def test_mongo_reste_le_defaut(self):
        r = self._lancer(MONGO_URL="mongodb://127.0.0.1:27017", DB_NAME="valeo")
        assert r.returncode == 0, r.stderr[-600:]

    def test_le_demarrage_est_borne_dans_le_temps(self):
        """Sans borne, un MongoDB injoignable fait patienter 30 s à chaque
        démarrage à froid — mesuré, pas supposé."""
        src = (BACKEND / "server.py").read_text(encoding="utf-8")
        assert "asyncio.wait_for(depot.preparer()" in src
        assert "STARTUP_TIMEOUT_SECONDS" in src
