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


class TestDependancesDeDeveloppement:
    """`requirements.txt` ne s'installe pas, et il manque de quoi tester.

    Deux défauts distincts, tous deux invisibles jusqu'à ce qu'on essaie :

    1. `emergentintegrations==0.2.0` est absent de PyPI : `pip install -r
       requirements.txt` échoue sur cette ligne, donc RIEN ne s'installe ;
    2. `mongomock_motor` n'y figure pas, alors que `tests/conftest.py` en
       dépend entièrement. Sans lui, pytest ne rate pas — il **saute** les
       tests. On lit « skipped » et l'on croit la suite verte.
    """

    def test_le_fichier_de_developpement_sinstalle(self):
        assert "emergentintegrations" not in _paquets_declares("requirements-dev.txt")

    def test_il_couvre_de_quoi_lancer_les_tests(self):
        texte = (BACKEND / "requirements-dev.txt").read_text(encoding="utf-8")
        # `-r requirements-prod.txt` en tête : les dépendances d'exécution
        # viennent de là, sans être recopiées (donc sans pouvoir diverger).
        assert "-r requirements-prod.txt" in texte
        declares = _paquets_declares("requirements-dev.txt")
        for indispensable in ("pytest", "pytest-xdist", "mongomock-motor"):
            assert indispensable in declares, indispensable

    def test_mongomock_est_declare_car_tout_le_harnais_en_depend(self):
        """Le contrôle qui compte : sans lui, la suite entière saute."""
        conftest = (BACKEND / "tests" / "conftest.py").read_text(encoding="utf-8")
        assert "mongomock_motor" in conftest
        assert "mongomock-motor" in _paquets_declares("requirements-dev.txt")


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

    def test_une_cle_de_compte_de_service_ne_peut_pas_partir_dans_git(self):
        """Invariant 30 : ne jamais déposer de clé privée là où elle se publie.

        Une clé de compte de service donne TOUS les droits sur le projet,
        Firestore compris, en contournant `firestore.rules` par conception
        (c'est l'Admin SDK). Poussée sur un dépôt, elle vaut la base entière.

        Le `.gitignore` couvrait `credentials.json`, `*.key` et `*.pem` — mais
        pas le nom que Google donne réellement au fichier téléchargé,
        « <projet>-firebase-adminsdk-xxxxx-yyyyyyyy.json ». Un `git add .`
        distrait suffisait.

        Le test interroge `git check-ignore`, donc le vrai moteur de git : un
        motif qui a l'air juste mais ne correspond à rien (les globs ne
        connaissent pas l'optionnalité, `?` vaut exactement un caractère) est
        attrapé ici, pas en relisant le fichier.
        """
        pieges = [
            "valeo-firebase-adminsdk-a1b2c-3d4e5f6789.json",  # le nom de Google
            "backend/secrets/peu-importe-le-nom.json",
            "secrets/cle.json",
            "service-account.json",
            "service_account.json",
            "cle-service.json",
        ]
        legitimes = ["firebase.json", "package.json", "firestore.indexes.json",
                     "backend/.env.example"]
        try:
            def ignore(chemin):
                r = subprocess.run(["git", "check-ignore", "-q", chemin],
                                   cwd=RACINE, capture_output=True, timeout=15)
                if r.returncode not in (0, 1):
                    pytest.skip("git indisponible ou hors dépôt")
                return r.returncode == 0
            for chemin in pieges:
                assert ignore(chemin), f"{chemin} partirait dans git"
            for chemin in legitimes:
                assert not ignore(chemin), f"{chemin} est ignoré a tort"
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pytest.skip("git indisponible")

    def test_aucun_secret_dans_la_configuration_de_build(self):
        build = (BACKEND / "cloudbuild.yaml").read_text(encoding="utf-8")
        assert "--set-secrets=" in build, "les secrets passent par Secret Manager"
        assert not re.search(r"(ADMIN_PASSWORD|JWT_SECRET)=(?!valeo-)[^\s,:]+", build)

    def test_les_instances_chaudes_sont_reglables_et_valent_1_par_defaut(self):
        """Le coût se règle au déploiement, la valeur sûre reste le défaut.

        Deux erreurs opposées, et le défaut du fichier tranche entre elles :
        figer `--min-instances=0` fait payer un démarrage à froid au pisteur
        qui synchronise en bout de piste ; figer `1` fait tourner une instance
        24 h/24 pendant toute la mise au point, alors que personne ne s'en
        sert. Une substitution laisse choisir au déploiement — et comme
        l'oubli qui coûte de l'argent est plus facile à commettre que l'autre,
        c'est la valeur de PRODUCTION qui est le défaut : la mise au point
        passe `_MIN_INSTANCES=0` explicitement, et un redéploiement sans
        substitution revient tout seul au bon réglage.
        """
        build = (BACKEND / "cloudbuild.yaml").read_text(encoding="utf-8")
        assert "--min-instances=${_MIN_INSTANCES}" in build, \
            "min-instances doit rester réglable au déploiement"
        assert not re.search(r"--min-instances=\d", build), \
            "valeur figée en dur : le réglage ne serait plus possible"
        assert re.search(r"^\s+_MIN_INSTANCES:\s*'1'\s*$", build, re.M), \
            "le défaut doit être 1 — la valeur de production, pas celle de test"


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


def server_heure(reponse):
    """Valeur de l'en-tête d'heure, quelle que soit la casse."""
    return reponse.headers.get("X-Valeo-Heure") or reponse.headers.get("x-valeo-heure")


class TestHeureDuServeur:
    """L'en-tête qui permet à un téléphone de mesurer son décalage (B-03).

    `prepareSync` horodate depuis l'horloge du téléphone et `merge_state`
    garde la version la plus récente. Un appareil en RETARD voit donc ses
    modifications ignorées en silence : la requête répond 200, l'application
    affiche « Synchronisé », et rien n'est enregistré.

    Le serveur ne peut pas corriger l'horodatage sans casser le hors-ligne —
    un agent qui pèse le matin et synchronise le soir a légitimement un
    horodatage ancien, et ramener aussi le passé ferait gagner l'appareil qui
    synchronise en dernier. Il dit donc son heure, et l'application constate.
    """

    def test_l_heure_est_posee_sur_toutes_les_reponses(self, app_client):
        for chemin in ("/health", "/api/state", "/api/", "/"):
            r = app_client.get(chemin)
            assert server_heure(r), f"{chemin} ne porte pas l'heure du serveur"

    def test_l_heure_est_posee_meme_sur_un_REFUS(self, app_client):
        """Un jeton expiré doit renseigner l'horloge comme les autres."""
        r = app_client.get("/api/state", headers={"Authorization": "Bearer faux"})
        assert r.status_code == 401
        assert server_heure(r), "un refus doit porter l'heure lui aussi"

    def test_l_heure_est_lisible_et_datee_de_maintenant(self, app_client):
        from datetime import datetime, timezone
        valeur = server_heure(app_client.get("/health"))
        lu = datetime.fromisoformat(valeur.replace("Z", "+00:00"))
        assert lu.tzinfo is not None, "l'heure doit porter son fuseau"
        ecart = abs((datetime.now(timezone.utc) - lu).total_seconds())
        assert ecart < 60, f"heure serveur à {ecart} s de la nôtre"

    def test_l_heure_ne_voyage_JAMAIS_dans_l_etat(self, app_client):
        """Un champ ajouté à l'état repartirait au serveur et serait refusé.

        C'est l'invariant 23 : `prepareSync` renvoie toutes les lignes, donc
        un champ inconnu ajouté par le serveur reviendrait comme une
        modification interdite — 403 sur tout le PUT. D'où un EN-TÊTE.
        """
        from tests.test_state_authorization import _get_state, _seed_coop
        t = _seed_coop(app_client)
        etat = _get_state(app_client, t["patron"])
        for interdit in ("heure", "now", "serverTime", "heureServeur"):
            assert interdit not in etat, f"« {interdit} » ne doit pas être dans l'état"

    def test_l_entete_est_expose_au_javascript(self):
        """Sans `expose_headers`, un navigateur masque l'en-tête au JS.

        Le harnais de test ne fait pas de CORS : le contrôle porte donc sur la
        configuration elle-même, comme pour l'en-tête de dépréciation.
        """
        source = (BACKEND / "server.py").read_text(encoding="utf-8")
        bloc = re.search(r"expose_headers=\[([^\]]*)\]", source)
        assert bloc, "expose_headers absent de la configuration CORS"
        assert "ENTETE_HEURE" in bloc.group(1), \
            "l'en-tête d'heure doit être exposé, sinon le web ne le lit jamais"


class TestIdentiteDeLApplication:
    """L'identifiant de paquet est DÉFINITIF une fois publié.

    Google Play et l'App Store en font la clé d'identité de l'application : il
    ne se change pas après publication, il faut republier une application
    distincte et perdre installations et avis.

    Le dépôt a longtemps porté `com.emergent.appdeploy.tyyn4z`, hérité du
    constructeur précédent — l'application se serait donc publiée sous
    l'espace de noms d'un tiers. Corrigé en `com.valeoscoop.valeo`, dérivé du
    domaine réel (`valeo-scoop.com`), le tiret retiré parce qu'un segment de
    paquet Android doit être un identifiant Java valide.
    """

    def _expo(self):
        return json.loads((RACINE / "frontend" / "app.json").read_text(encoding="utf-8"))["expo"]

    def test_les_deux_plateformes_portent_le_MEME_identifiant(self):
        e = self._expo()
        assert e["android"]["package"] == e["ios"]["bundleIdentifier"], \
            "Android et iOS doivent porter le même identifiant"

    def test_l_identifiant_est_valide_pour_Android(self):
        """Segments = identifiants Java. Un tiret fait échouer la construction."""
        paquet = self._expo()["android"]["package"]
        segments = paquet.split(".")
        assert len(segments) >= 2, f"au moins deux segments : {paquet}"
        for s in segments:
            assert re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]*", s), \
                f"segment invalide « {s} » dans {paquet} (ni tiret, ni chiffre en tête)"

    def test_l_identifiant_n_appartient_a_personne_d_autre(self):
        """Ni le constructeur précédent, ni un espace de noms d'emprunt."""
        e = self._expo()
        valeurs = [e["android"]["package"], e["ios"]["bundleIdentifier"],
                   e.get("slug", ""), e.get("scheme", "")]
        interdits = ("emergent", "example", "expo.dev", "anonymous",
                     "com.valeo.", "changeme", "yourcompany")
        for v in valeurs:
            for mot in interdits:
                assert mot not in v, (
                    f"« {mot} » dans « {v} » : cet identifiant n'est pas le vôtre. "
                    "Il est DÉFINITIF une fois publié.")

    def test_slug_et_scheme_ne_sont_plus_les_valeurs_par_defaut(self):
        e = self._expo()
        assert e.get("slug") != "frontend", "slug laissé au défaut d'Expo"
        assert e.get("scheme") != "frontend", "scheme laissé au défaut d'Expo"


class TestConstructionEAS:
    """`eas.json` décide APK ou AAB — et les deux ne s'échangent pas.

    Un AAB ne s'installe PAS à la main sur un téléphone : c'est le format que
    Google Play réclame, et lui seul. Un APK, à l'inverse, est refusé à la
    publication sur Play. Se tromper de profil ne provoque aucune erreur à la
    construction : on s'en aperçoit un quart d'heure plus tard, un fichier
    inutilisable à la main.
    """

    def _eas(self):
        chemin = RACINE / "frontend" / "eas.json"
        assert chemin.exists(), "eas.json absent : `npx eas build` n'a rien à lire"
        return json.loads(chemin.read_text(encoding="utf-8"))

    def test_le_profil_de_test_produit_un_APK_installable(self):
        preview = self._eas()["build"]["preview"]
        assert preview["android"]["buildType"] == "apk", (
            "le profil `preview` sert aux tests terrain : il DOIT produire un "
            "APK, un AAB ne s'installe pas sur un téléphone")

    def test_le_profil_de_publication_produit_un_AAB(self):
        prod = self._eas()["build"]["production"]
        assert prod["android"]["buildType"] == "app-bundle", (
            "Google Play n'accepte que l'AAB ; un APK y serait refusé")

    def test_l_adresse_du_backend_est_ABSOLUE_pour_un_telephone(self):
        """Un téléphone n'a pas d'origine : une URL relative ou vide = aucun
        serveur (invariant 31). Le gabarit doit donc porter une URL absolue,
        placeholder compris — sinon on construit un APK muet sans le voir."""
        for nom in ("preview", "production"):
            url = self._eas()["build"][nom].get("env", {}).get("EXPO_PUBLIC_BACKEND_URL")
            assert url, f"profil « {nom} » : aucune adresse de backend"
            assert url.startswith("https://"), \
                f"profil « {nom} » : « {url} » n'est pas une URL absolue en https"
