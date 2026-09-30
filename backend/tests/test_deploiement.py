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
    @staticmethod
    def _cibles():
        """Les cibles Hosting, indexées par nom.

        `hosting` vaut un objet tant qu'il n'y a qu'un site, une LISTE dès
        qu'il y en a plusieurs. On accepte les deux : la forme du fichier ne
        doit pas décider de ce que le test sait vérifier.
        """
        conf = json.loads((RACINE / "firebase.json").read_text(encoding="utf-8"))
        h = conf["hosting"]
        if isinstance(h, dict):
            return {h.get("target", "app"): h}
        return {c["target"]: c for c in h}

    def test_hosting_renvoie_lapi_vers_cloud_run(self):
        regles = self._cibles()["app"]["rewrites"]
        api = next(r for r in regles if r["source"] == "/api/**")
        assert "run" in api and api["run"]["serviceId"]
        # Le repli SPA doit venir EN DERNIER, sinon il attrape aussi l'API.
        assert regles[-1]["source"] == "**"

    def test_le_site_public_n_a_PAS_le_repli_spa(self):
        """Le site public et l'application ne partagent pas leur routage.

        Le repli SPA d'expo-router (`source: "**"`) attrape tout ce qui n'a pas
        déjà été servi. S'il vivait sur le site public, la politique de
        confidentialité et la page 404 disparaîtraient derrière l'application —
        et le site paraîtrait cassé sans que rien ne l'explique.
        """
        site = self._cibles().get("site")
        assert site, "la cible « site » doit exister"
        assert site["public"] == "site"
        assert not site.get("rewrites"), (
            "le site public ne doit porter AUCUN rewrite : il sert des fichiers")

    def test_le_site_public_ne_charge_aucune_ressource_externe(self):
        """Contrainte de conception, pas de style : la page s'ouvre en 3G.

        Une police Google ou un script d'analyse ajoute une résolution DNS, une
        poignée de main TLS et un aller-retour vers un serveur lointain, devant
        quelqu'un qui a deux barres de réseau. Le test le rend non négociable —
        et il vaut aussi comme garantie de confidentialité : aucune page ne
        prévient un tiers de la visite.
        """
        import re as _re
        pages = sorted((RACINE / "site").glob("*.html"))
        assert pages, "aucune page dans site/"
        for page in pages:
            texte = page.read_text(encoding="utf-8")
            externes = _re.findall(r'(?:src|href)="(https?://[^"]+)"', texte)
            # Un lien de navigation vers l'application est légitime ; charger
            # une RESSOURCE depuis un autre domaine ne l'est pas.
            charges = [u for u in externes if _re.search(r"\.(js|css|woff2?|ttf|png|jpe?g|svg)(\?|$)", u)]
            assert not charges, f"{page.name} charge des ressources externes : {charges}"
            assert "googletagmanager" not in texte and "google-analytics" not in texte, (
                f"{page.name} contient un traceur")

    def test_la_politique_de_confidentialite_existe_et_est_liee(self):
        """Le Play Store l'exige, et l'accueil doit y renvoyer.

        Une politique publiée mais orpheline ne remplit pas la condition : le
        formulaire du Play Store demande une URL atteignable depuis le site.
        """
        conf = RACINE / "site" / "confidentialite.html"
        assert conf.exists(), "politique de confidentialité manquante"
        texte = conf.read_text(encoding="utf-8")
        for attendu in ("PBKDF2", "europe-west1", "contact@valeo-scoop.com"):
            assert attendu in texte, f"la politique doit mentionner « {attendu} »"
        accueil = (RACINE / "site" / "index.html").read_text(encoding="utf-8")
        assert "confidentialite" in accueil, "l'accueil doit lier la politique"

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

    def test_aucune_substitution_indisponible_en_build_manuel(self):
        """`$SHORT_SHA` et consorts ne valent RIEN quand on lance le build à la
        main — et c'est la seule façon documentée de déployer ici.

        Cloud Build ne renseigne `COMMIT_SHA`, `SHORT_SHA`, `BRANCH_NAME`,
        `TAG_NAME`, `REVISION_ID` et `REPO_NAME` que pour un build DÉCLENCHÉ
        par un dépôt. Avec `gcloud builds submit`, elles sont vides :
        l'étiquette de l'image devient `valeo-backend:`, et Docker refuse la
        référence. Le tout PREMIER déploiement échouait donc, après plusieurs
        minutes d'attente, sur une erreur qui ne parle pas d'elle-même.

        Aucun test fonctionnel ne pouvait le voir : le fichier est un YAML
        parfaitement valide, et rien ne s'exécute avant Cloud Build.
        """
        build = (BACKEND / "cloudbuild.yaml").read_text(encoding="utf-8")
        # Seules les lignes actives comptent : les commentaires ont le droit de
        # nommer le piège, c'est même souhaitable.
        actives = "\n".join(l for l in build.splitlines()
                            if not l.lstrip().startswith("#"))
        for variable in ("SHORT_SHA", "COMMIT_SHA", "BRANCH_NAME",
                         "TAG_NAME", "REVISION_ID", "REPO_NAME"):
            assert f"${variable}" not in actives and f"${{{variable}}}" not in actives, (
                f"cloudbuild.yaml utilise ${variable}, vide en build manuel : "
                "l'étiquette d'image sera invalide")
        assert "${_TAG}" in actives, "l'étiquette doit venir d'une substitution à nous"

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
        placeholder compris — sinon on construit un APK muet sans le voir.

        Le contrôle porte sur TOUS les profils qui déclarent la variable, pas
        sur une liste écrite à la main : un profil ajouté plus tard serait
        sinon le seul à ne pas être vérifié.
        """
        profils = self._eas()["build"]
        vus = 0
        for nom, profil in profils.items():
            url = profil.get("env", {}).get("EXPO_PUBLIC_BACKEND_URL")
            if url is None:
                continue
            vus += 1
            assert url, f"profil « {nom} » : adresse de backend vide"
            assert url.startswith("https://"), \
                f"profil « {nom} » : « {url} » n'est pas une URL absolue en https"
        for obligatoire in ("preview", "production"):
            assert profils[obligatoire].get("env", {}).get("EXPO_PUBLIC_BACKEND_URL"), \
                f"profil « {obligatoire} » : aucune adresse de backend"
        assert vus >= 2

    def test_aucune_cle_hors_schema_a_la_racine(self):
        """`eas-cli` refuse toute clé inconnue à la racine, et RIEN d'autre ne
        le voit.

        Ce fichier portait un bloc `_commentaire` expliquant les profils.
        `eas-cli` 24.8.0 répond :

            eas.json is not valid.
            - "_commentaire" is not allowed

        La construction échoue avant même de démarrer. Or `tsc`, `eslint`,
        `yarn test` et `pytest` passaient tous au vert : le fichier reste du
        JSON parfaitement valide, c'est le SCHÉMA d'EAS qui le rejette. Le
        défaut ne se découvrait donc qu'en lançant un build — quinze minutes
        d'attente pour une erreur d'une ligne.

        La documentation des profils vit désormais dans `eas.README.md`.
        """
        permises = {"cli", "build", "submit"}
        trouvees = set(self._eas())
        assert trouvees <= permises, (
            f"clés interdites à la racine d'eas.json : {sorted(trouvees - permises)} — "
            "`eas build` refusera de démarrer. Documenter dans eas.README.md.")

    def test_les_profils_sont_expliques_hors_du_fichier(self):
        """Puisqu'on ne peut plus commenter `eas.json`, l'explication doit
        exister ailleurs — sinon le prochain lecteur remettra un commentaire
        dedans et rejouera la panne."""
        doc = RACINE / "frontend" / "eas.README.md"
        assert doc.exists(), "eas.README.md absent : les profils ne sont documentés nulle part"
        texte = doc.read_text(encoding="utf-8")
        assert "_commentaire" in texte, "le piège des clés hors schéma doit y être écrit"
        for profil in self._eas()["build"]:
            assert profil in texte, f"profil « {profil} » non documenté dans eas.README.md"

    def test_le_profil_des_tests_terrain_produit_aussi_un_APK(self):
        """`terrain` pointe sur l'instance gratuite (cf. render.yaml) : c'est un
        APK à installer à la main, jamais un AAB."""
        terrain = self._eas()["build"]["terrain"]
        assert terrain["android"]["buildType"] == "apk"
        assert terrain.get("env", {}).get("EXPO_PUBLIC_BACKEND_URL")

    def test_l_adresse_de_test_ne_fuit_PAS_dans_les_profils_livrables(self):
        """La raison d'être du profil `terrain` séparé.

        L'adresse est figée dans le paquet au build (invariant 27). Si l'URL de
        l'instance d'essai était collée dans `preview` ou `production`, on
        livrerait un APK « partenaires » — ou une publication Play — parlant à
        un serveur de test gratuit qui s'endort, avec des données de test. Rien
        à la construction ne le signalerait : l'APK se construit, s'installe et
        affiche « Synchronisé ».
        """
        profils = self._eas()["build"]
        essai = (profils["terrain"]["env"]["EXPO_PUBLIC_BACKEND_URL"] or "").lower()
        for nom in ("preview", "production"):
            url = (profils[nom]["env"]["EXPO_PUBLIC_BACKEND_URL"] or "").lower()
            assert url != essai, \
                f"profil « {nom} » : porte l'adresse de l'instance de test"
            for marqueur in ("render.com", "onrender.com", "hf.space", "ngrok"):
                assert marqueur not in url, \
                    f"profil « {nom} » : « {url} » est un hébergeur d'essai, pas la production"


class TestEntitesSynchronisees:
    """Trois listes d'entités doivent bouger ENSEMBLE, dans trois fichiers.

    `ENTITY_ARRAYS` (server.py), `TABLEAUX` (depot.py) et `ENTITIES`
    (sync.ts). En ajouter une seule à deux d'entre elles produit un défaut
    sournois : sur MongoDB tout fonctionne (l'état entier tient dans un
    document), et sur Firestore la nouvelle entité n'est **jamais lue ni
    écrite** — le PUT répond 200 et les données disparaissent.

    C'est arrivé en ajoutant `budgets` et `reglements` : quatre tests ont
    échoué, tous en `[firestore]`, aucun en `[mongo]`.
    """

    def _liste(self, fichier: str, nom: str) -> set:
        texte = (BACKEND / fichier).read_text(encoding="utf-8")
        m = re.search(rf"^{nom} = \[(.*?)\]", texte, re.S | re.M)
        assert m, f"{nom} introuvable dans {fichier}"
        return set(re.findall(r'"([a-zA-Z]+)"', m.group(1)))

    def test_le_depot_connait_toutes_les_entites_du_serveur(self):
        serveur = self._liste("server.py", "ENTITY_ARRAYS")
        depot = self._liste("depot.py", "TABLEAUX")
        manquantes = serveur - depot
        assert not manquantes, (
            f"absentes de TABLEAUX (depot.py) : {sorted(manquantes)} — sur "
            "Firestore elles ne seraient ni lues ni écrites, en silence")

    def test_le_frontend_synchronise_les_memes_entites(self):
        serveur = self._liste("server.py", "ENTITY_ARRAYS")
        texte = (RACINE / "frontend" / "src" / "coop" / "sync.ts").read_text(encoding="utf-8")
        m = re.search(r"export const ENTITIES = \[(.*?)\] as const;", texte, re.S)
        assert m, "ENTITIES introuvable dans sync.ts"
        front = set(re.findall(r'"([a-zA-Z]+)"', m.group(1)))
        assert serveur == front, (
            "ENTITY_ARRAYS et ENTITIES divergent : "
            f"serveur seul {sorted(serveur - front)}, frontend seul {sorted(front - serveur)}. "
            "Une entité absente de `sync.ts` n'est jamais envoyée ; absente du "
            "serveur, elle vaut 403 sur tout le PUT (invariant 23).")


class TestBlueprintRender:
    """`render.yaml` déploie le backend sur une instance gratuite, sans carte
    bancaire, le temps que Cloud Run soit payable.

    C'est un chemin de SECOURS pour les tests terrain, et il porte ses propres
    pièges — ceux-là mêmes qu'aucun test fonctionnel ne verrait.
    """

    def _render(self) -> str:
        chemin = RACINE / "render.yaml"
        assert chemin.exists(), "render.yaml absent : le blueprint de secours a disparu"
        return chemin.read_text(encoding="utf-8")

    def _variables(self) -> dict:
        """Les `envVars` du blueprint : nom -> `value: …` ou `sync: false`.

        Lu en texte, comme `cloudbuild.yaml` l'est déjà : le dépôt n'embarque
        aucun analyseur YAML, et en ajouter un pour trois lignes serait une
        dépendance de plus à installer avant de pouvoir tester.
        """
        paires = re.findall(
            r"^\s*-\s*key:\s*(\S+)\s*\n\s*(value:.*|sync:\s*\S+)\s*$",
            self._render(), re.M)
        return {nom: reste.strip() for nom, reste in paires}

    def test_la_branche_deployee_est_develop_et_pas_main(self):
        """LE piège de ce fichier.

        Render déploie la branche par défaut du dépôt quand on ne lui en donne
        pas : ici `main`, qui a des dizaines de commits de retard et ne contient
        ni `depot.py` ni `firebase_auth.py`. Le service démarrerait, `/health`
        répondrait 200, et l'on testerait pendant des jours un backend
        incapable de parler à Firestore.
        """
        assert re.search(r"^\s*branch:\s*develop\s*$", self._render(), re.M), \
            "render.yaml doit épingler `branch: develop` — sinon Render déploie `main`"

    def test_le_service_est_un_conteneur_construit_depuis_le_Dockerfile_reel(self):
        """Pas un second Dockerfile recopié : le même, sinon il divergerait."""
        texte = self._render()
        assert re.search(r"^\s*runtime:\s*docker\s*$", texte, re.M)
        chemin = re.search(r"^\s*dockerfilePath:\s*(\S+)\s*$", texte, re.M)
        contexte = re.search(r"^\s*dockerContext:\s*(\S+)\s*$", texte, re.M)
        assert chemin and contexte, "dockerfilePath et dockerContext sont requis"
        assert (RACINE / chemin.group(1).lstrip("./")).exists(), \
            f"dockerfilePath pointe sur un fichier absent : {chemin.group(1)}"
        # Le Dockerfile fait `COPY requirements-prod.txt ./` : le contexte de
        # construction doit être `backend/`, pas la racine du dépôt.
        dossier = RACINE / contexte.group(1).lstrip("./")
        assert (dossier / "requirements-prod.txt").exists(), \
            "dockerContext ne contient pas requirements-prod.txt : la construction échouera"

    def test_le_controle_de_vivacite_ne_depend_pas_de_la_base(self):
        """`/health` ne lit pas Firestore et n'exige aucun jeton. Un contrôle
        posé sur une route qui interroge la base ferait échouer le déploiement
        pour une panne extérieure."""
        assert re.search(r"^\s*healthCheckPath:\s*/health\s*$", self._render(), re.M)

    def test_les_tests_terrain_tournent_sur_FIRESTORE(self):
        """Tester sur MongoDB pour déployer sur Firestore ne prouve rien :
        l'audit a trouvé une destruction croisée entre coopératives (B-01) qui
        n'existait QUE sur Firestore. Et les données saisies pendant les tests
        sont alors déjà dans la base de destination."""
        variables = self._variables()
        assert variables.get("DATA_BACKEND") == "value: firestore", variables
        assert "MONGO_URL" not in variables, \
            "invariant 30 : avec Firestore, MongoDB n'est pas requis"

    def test_aucun_secret_n_est_ecrit_dans_le_blueprint(self):
        """Même règle que `cloudbuild.yaml`, même raison (invariant 30) : ce
        fichier est versionné. `sync: false` dit à Render de réclamer la valeur
        dans son tableau de bord et de ne jamais la stocker dans le dépôt."""
        variables = self._variables()
        for secret in ("ADMIN_PASSWORD", "JWT_SECRET", "FIREBASE_SERVICE_ACCOUNT"):
            assert secret in variables, f"{secret} n'est pas déclaré : le service ne démarrera pas"
            assert variables[secret] == "sync: false", \
                f"{secret} porte une valeur dans render.yaml — c'est un secret publié"
        texte = self._render()
        assert "BEGIN PRIVATE KEY" not in texte, "une clé privée est dans le dépôt"
        assert not re.search(r"^\s*value:\s*.*(private_key|admin123)", texte, re.M)

    def test_le_blueprint_se_dit_jetable(self):
        """Un fichier de déploiement sans avertissement finit par servir en
        production. Celui-ci doit porter, écrit noir sur blanc, qu'il est
        réservé aux tests et que la cible reste Cloud Run."""
        texte = self._render()
        assert "cloudbuild.yaml" in texte, "le blueprint doit renvoyer vers la cible réelle"
        assert "DONNÉES DE TEST UNIQUEMENT" in texte


class TestDepuisOuLanceLeBuild:
    """`cloudbuild.yaml` se lance depuis la RACINE du dépôt, pas depuis backend/.

    Défaut observé en vrai : le premier redéploiement du module comptabilité a
    échoué à l'étape 0 parce que la commande avait été lancée depuis `backend/`.
    Les chemins de l'étape Docker (`-f backend/Dockerfile`, contexte `backend`)
    sont relatifs à la racine de l'archive envoyée : depuis `backend/`, cette
    racine EST le dossier backend, et `backend/Dockerfile` n'y existe pas.

    Le message d'erreur de Cloud Build ne dit pas cela — il dit seulement
    « build step 0 failed ». D'où ce test : il lie les chemins du fichier à
    l'invocation que son en-tête documente, pour que l'un ne puisse plus
    changer sans l'autre.
    """

    @staticmethod
    def _cloudbuild():
        import pathlib
        return (pathlib.Path(__file__).resolve().parent.parent / "cloudbuild.yaml").read_text(encoding="utf-8")

    def test_les_chemins_docker_partent_de_la_racine(self):
        import re
        texte = self._cloudbuild()
        # L'argument -f et le contexte, tels qu'ils sont écrits dans le YAML.
        dockerfile = re.search(r"-\s*(backend/Dockerfile|Dockerfile)\s*$", texte, re.M)
        assert dockerfile, "l'étape Docker doit nommer son Dockerfile explicitement"
        assert dockerfile.group(1) == "backend/Dockerfile", (
            "le chemin doit partir de la racine du dépôt : sinon la commande "
            "documentée (`gcloud builds submit --config backend/cloudbuild.yaml`) "
            "échoue à l'étape 0.")
        assert re.search(r"^\s*-\s*backend\s*$", texte, re.M), (
            "le contexte de build doit être `backend`, relatif à la racine")

    def test_len_tete_documente_la_commande_qui_marche(self):
        texte = self._cloudbuild()
        assert "gcloud builds submit --config backend/cloudbuild.yaml" in texte, (
            "l'en-tête doit porter la commande exacte, chemin compris : c'est "
            "elle qu'on recopie, et une commande approximative coûte un build.")

    def test_le_dockerfile_ne_copie_que_ce_qui_existe(self):
        import pathlib
        import re
        racine = pathlib.Path(__file__).resolve().parent.parent
        dockerfile = (racine / "Dockerfile").read_text(encoding="utf-8")
        for ligne in re.findall(r"^COPY\s+(.+?)\s+\./?\s*$", dockerfile, re.M):
            for fichier in ligne.split():
                assert (racine / fichier).exists(), (
                    f"le Dockerfile copie « {fichier} », absent de backend/ : "
                    "l'image ne se construira pas, et aucun test fonctionnel "
                    "ne le verrait.")


class TestBaremesDeRepli:
    """Le barème de repli existe en DEUX exemplaires, qui doivent concorder.

    `DEFAULT_PRICES` / `DEFAULT_COMM` (frontend `lib.ts`) et `PRIX_DEFAUT` /
    `COM_DEFAUT` (tableau de bord admin, dans `server.py`) sont deux copies de
    la même table. Le commentaire du second dit « mêmes valeurs » — un
    commentaire ne l'a jamais garanti.

    Si elles divergent, le défaut est particulièrement vicieux : une
    coopérative neuve verrait un prix sur le téléphone et un autre dans
    l'espace d'administration, tous deux « justes » selon leur source, et rien
    ne signalerait l'écart. C'est exactement la classe de bug déjà rencontrée
    deux fois sur ce projet (les trois listes d'entités, le menu des rôles).
    """

    @staticmethod
    def _table(texte, nom, ouvrant="{", fermant="}"):
        import re
        m = re.search(re.escape(nom) + r"\s*[:=][^{]*\{([^}]*)\}", texte)
        assert m, f"table « {nom} » introuvable"
        return {
            cle.strip().strip('"\''): int(val)
            for cle, val in re.findall(r"(\w+)\s*:\s*(\d+)", m.group(1))
        }

    def _cotes(self):
        import pathlib
        racine = pathlib.Path(__file__).resolve().parent.parent.parent
        lib = (racine / "frontend" / "src" / "coop" / "lib.ts").read_text(encoding="utf-8")
        srv = (racine / "backend" / "server.py").read_text(encoding="utf-8")
        return lib, srv

    def test_les_prix_de_repli_concordent(self):
        lib, srv = self._cotes()
        assert self._table(lib, "DEFAULT_PRICES") == self._table(srv, "PRIX_DEFAUT"), (
            "le barème du téléphone et celui de l'espace admin ont divergé : "
            "une coopérative neuve verrait deux prix différents, sans alerte.")

    def test_les_commissions_de_repli_concordent(self):
        lib, srv = self._cotes()
        assert self._table(lib, "DEFAULT_COMM") == self._table(srv, "COM_DEFAUT")

    def test_chaque_culture_a_un_prix_et_une_commission(self):
        # Une culture ajoutée à `CROPS` sans barème retomberait sur 0 : la pesée
        # serait enregistrée à prix nul, et le planteur payé zéro franc.
        import re
        lib, _ = self._cotes()
        m = re.search(r"export const CROPS: Crop\[\] = \[(.*?)\];", lib, re.S)
        assert m, "liste CROPS introuvable"
        cultures = set(re.findall(r'id:\s*"(\w+)"', m.group(1)))
        prix = self._table(lib, "DEFAULT_PRICES")
        comm = self._table(lib, "DEFAULT_COMM")
        assert cultures <= set(prix), f"sans prix de repli : {sorted(cultures - set(prix))}"
        assert cultures <= set(comm), f"sans commission de repli : {sorted(cultures - set(comm))}"
        assert all(v > 0 for v in prix.values()), "un prix de repli nul paierait le planteur zéro"

    def test_l_etat_vide_du_serveur_suit_le_bareme_cacao(self):
        # `empty_state()["prixKg"]` est le repli historique, lu par les fiches
        # antérieures aux barèmes par filière. Le laisser derrière ferait payer
        # une coopérative neuve au prix de la campagne précédente.
        import re
        lib, srv = self._cotes()
        m = re.search(r'"prixKg":\s*(\d+)', srv)
        assert m, "prixKg de empty_state introuvable"
        assert int(m.group(1)) == self._table(lib, "DEFAULT_PRICES")["cacao"]


class TestSecuriteDuSitePublic:
    """La Content-Security-Policy du site, et le piège qu'elle tend.

    Le site public ne charge aucune ressource externe (un autre test le
    vérifie). Cette propriété permet une CSP réellement stricte —
    `default-src 'none'` — au lieu de la liste de domaines autorisés qu'on voit
    d'ordinaire et qui ne protège plus de grand-chose.

    Mais une CSP qui bloque le script du site est PIRE que pas de CSP : la page
    s'affiche normalement, le style est là, et rien ne fonctionne. Aucune erreur
    visible pour qui n'ouvre pas la console. C'est exactement le mode de panne
    silencieuse que ce dépôt refuse ailleurs (invariants 27 et 32), et c'est ce
    que cette classe verrouille.
    """

    def _site(self):
        conf = json.loads((RACINE / "firebase.json").read_text(encoding="utf-8"))
        return next(h for h in conf["hosting"] if h["target"] == "site")

    def _entetes(self):
        site = self._site()
        return {
            e["key"]: e["value"]
            for h in site["headers"] if h["source"] == "**"
            for e in h["headers"]
        }

    def _accueil(self):
        return (RACINE / "site" / "index.html").read_text(encoding="utf-8")

    def test_l_empreinte_de_la_CSP_correspond_au_script_en_ligne(self):
        """LE test de cette classe.

        Un seul script reste en ligne dans la page : l'amorce d'une ligne qui
        pose la classe « js » avant le rendu (elle ne peut pas être externalisée
        sans faire clignoter la page). Elle est autorisée par son empreinte
        SHA-256, inscrite dans `firebase.json`.

        Modifier cette ligne — ne serait-ce qu'une espace — invalide
        l'empreinte. Le navigateur refuse alors le script, `html` ne reçoit
        jamais la classe « js », et tout le site bascule dans son mode
        « sans JavaScript ». En production. Sans message.

        On recalcule donc l'empreinte depuis la page elle-même et on la compare
        à celle déclarée : le défaut devient un test rouge.
        """
        import base64
        import hashlib

        scripts = re.findall(r"<script>(.*?)</script>", self._accueil(), re.S)
        assert len(scripts) == 1, (
            "un seul script en ligne est prévu (l'amorce). Les autres doivent "
            f"vivre dans un fichier servi par 'self'. Trouvés : {len(scripts)}")

        empreinte = base64.b64encode(
            hashlib.sha256(scripts[0].strip().encode()).digest()).decode()
        csp = self._entetes()["Content-Security-Policy"]
        assert f"'sha256-{empreinte}'" in csp, (
            "l'empreinte de la CSP ne correspond plus au script en ligne.\n"
            f"  attendue dans firebase.json : sha256-{empreinte}\n"
            "  sinon le navigateur bloque le script SANS RIEN AFFICHER.")

    def test_la_CSP_refuse_tout_par_defaut(self):
        csp = self._entetes()["Content-Security-Policy"]
        assert "default-src 'none'" in csp, (
            "le site ne charge rien d'externe : la CSP doit partir de zéro")
        for directive in ("base-uri 'none'", "frame-ancestors 'none'",
                          "form-action 'none'"):
            assert directive in csp, f"directive manquante : {directive}"

    def test_aucun_script_arbitraire_n_est_autorise(self):
        """`'unsafe-inline'` dans `script-src` annulerait toute la protection.

        C'est la concession que font la plupart des sites, et elle rouvre
        exactement la faille que la CSP devait fermer : n'importe quel script
        injecté dans la page s'exécute. On l'accepte pour `style-src` — une
        feuille de style ne fait pas exécuter de code — jamais pour les scripts.
        """
        csp = self._entetes()["Content-Security-Policy"]
        script_src = next(d for d in csp.split(";") if d.strip().startswith("script-src"))
        assert "'unsafe-inline'" not in script_src, script_src
        assert "'unsafe-eval'" not in script_src, script_src

    def test_les_entetes_de_securite_essentiels_sont_poses(self):
        e = self._entetes()
        assert e["X-Content-Type-Options"] == "nosniff"
        assert e["X-Frame-Options"] == "DENY"
        assert "max-age=" in e["Strict-Transport-Security"]
        assert "camera=()" in e["Permissions-Policy"]
        assert e["Referrer-Policy"].startswith("strict-origin")

    def test_les_images_restent_lisibles_par_les_apercus_de_partage(self):
        """`Cross-Origin-Resource-Policy: same-origin` sur tout le site
        empêcherait WhatsApp, Facebook ou LinkedIn d'afficher la vignette
        `og:image` — un lien partagé apparaîtrait nu. Le dossier des images doit
        donc lever la restriction, et lui seul.
        """
        site = self._site()
        sources = [h["source"] for h in site["headers"]]
        assert len(sources) == len(set(sources)), (
            f"deux blocs portent la même source : Firebase n'applique que la "
            f"première, la seconde est silencieusement ignorée — {sources}")
        img = next((h for h in site["headers"] if h["source"] == "/img/**"), None)
        assert img, "aucun en-tête propre au dossier des images"
        corp = {e["key"]: e["value"] for e in img["headers"]}
        assert corp.get("Cross-Origin-Resource-Policy") == "cross-origin"

    def test_le_script_du_site_est_bien_servi_depuis_le_domaine(self):
        assert (RACINE / "site" / "valeo.js").exists(), "site/valeo.js manquant"
        assert 'src="/valeo.js"' in self._accueil()


class TestDefautsDAffichageDuSite:
    """Trois défauts trouvés en REGARDANT des captures d'écran, pas en relisant
    le code. Tous les trois compilent, ne lèvent aucune erreur, et passent
    inaperçus à la lecture. D'où ces garde-fous.
    """

    def _css(self):
        return (RACINE / "site" / "styles.css").read_text(encoding="utf-8")

    def test_un_element_masque_le_reste_vraiment(self):
        """`[hidden]` du navigateur vaut (0,1,0) : n'importe quelle classe qui
        pose un `display` le bat. `.roles-grille` est en `display:grid` — les
        CINQ panneaux de rôles s'affichaient donc simultanément, et la page
        faisait 10 000 px de haut au lieu de 8 000.
        """
        assert re.search(r"\[hidden\]\s*\{\s*display:\s*none\s*!important",
                         self._css()), (
            "sans `!important`, [hidden] perd contre toute classe qui pose un "
            "display : les panneaux masqués restent visibles")

    def test_le_libelle_des_boutons_reste_lisible(self):
        """`nav a` et `.bande-sombre a` valent (0,1,1) et battent `.btn` (0,1,0).

        Le libellé des boutons prenait donc la couleur des liens : or sur or
        dans le héros, vert sur vert dans la barre. Illisible dans les deux cas,
        et parfaitement invisible à la lecture du code.
        """
        # On découpe la feuille en règles « sélecteurs { corps } » et on garde
        # celles qui reprennent la couleur du libellé d'un bouton-lien.
        regles = [
            (sel.split("}")[-1].strip(), corps)
            for sel, corps in re.findall(r"([^{}]+)\{([^}]*)\}", self._css())
        ]
        reprises = [sel for sel, corps in regles
                    if "a.btn" in sel and "color:" in corps]
        assert reprises, "aucune règle ne reprend la couleur du libellé des boutons"
        selecteurs = " ".join(reprises)
        for contexte in ("nav a.btn", ".bande-sombre a.btn"):
            assert contexte in selecteurs, (
                f"{contexte} manque : le libellé y reprendra la couleur des liens")

    def test_le_bordereau_n_est_pas_efface_par_son_propre_masque(self):
        """La dentelure du ticket était dessinée avec `mask-image` +
        `mask-repeat: repeat-x` : le masque ne couvrait qu'une bande de 12 px en
        bas, donc TOUT le reste de la carte était masqué. Le bordereau était
        purement et simplement invisible sur la page — seule la dentelure
        s'affichait, flottant dans le vide.
        """
        css = self._css()
        bloc = re.search(r"\.bordereau\s*\{([^}]*)\}", css)
        assert bloc, ".bordereau introuvable"
        assert "mask" not in bloc.group(1), (
            "un masque sur .bordereau efface la carte entière ; dessiner la "
            "dentelure dans un pseudo-élément à part")

    def test_toutes_les_images_referencees_existent(self):
        """Une image manquante ne casse rien : elle laisse un cadre vide.

        C'est le défaut le plus courant d'un site statique, et le plus discret —
        la page se charge, le style est bon, il manque juste le logo. Personne
        ne s'en aperçoit avant un visiteur. Le test lit les références réelles
        des pages et vérifie que chaque fichier est là.
        """
        img = RACINE / "site" / "img"
        manquantes = []
        for page in sorted((RACINE / "site").glob("*.html")):
            if page.name == "maquette.html":
                continue  # fichier autonome : ses images sont encodées dedans
            texte = page.read_text(encoding="utf-8")
            for nom in set(re.findall(r"/img/([A-Za-z0-9_-]+\.[a-z0-9]{2,5})", texte)):
                if not (img / nom).is_file():
                    manquantes.append(f"{page.name} → {nom}")
        assert not manquantes, f"images référencées mais absentes : {manquantes}"

    def test_aucune_image_orpheline_n_est_publiee(self):
        """L'inverse : un fichier que plus aucune page n'utilise part quand même
        chez Firebase à chaque déploiement. Ce n'est pas grave, c'est sale — et
        au bout de quelques refontes on ne sait plus lesquels sont vivants.
        """
        site = RACINE / "site"
        refs = set()
        for f in list(site.glob("*.html")) + list(site.glob("*.css")):
            if f.name == "maquette.html":
                continue
            refs |= set(re.findall(r"/img/([A-Za-z0-9_-]+\.[a-z0-9]{2,5})",
                                   f.read_text(encoding="utf-8")))
        orphelines = sorted(p.name for p in (site / "img").iterdir()
                            if p.is_file() and p.name not in refs)
        assert not orphelines, f"images publiées mais jamais utilisées : {orphelines}"
