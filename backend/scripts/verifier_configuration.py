#!/usr/bin/env python3
"""Vérifie que la configuration est cohérente — AVANT de déployer.

Le code des six phases est prêt ; ce qui casse un déploiement, ce sont les
détails de configuration, et ils ne se voient pas en lisant. Ce script les
regarde tous d'un coup, en local, sans rien contacter ni rien modifier.

Ce qu'il contrôle
-----------------
1. **Les variables d'environnement** du backend : celles qui manquent, celles
   qui se contredisent (`DATA_BACKEND=firestore` sans compte de service), et un
   `JWT_SECRET` trop court pour ce qu'il protège.
2. **Le projet Firebase visé.** `.firebaserc` et le compte de service doivent
   nommer LE MÊME projet. S'ils diffèrent, Hosting se déploie chez l'un pendant
   que le backend écrit chez l'autre — et l'on retombe exactement sur « rien ne
   remonte dans le tableau de bord » (invariant 27).
3. **`firebase.json`** : les deux renvois vers Cloud Run doivent nommer la même
   région, et le repli SPA doit venir en DERNIER, sinon il attrape aussi l'API.
4. **`firestore.rules`** : tout accès direct refusé. Les règles par défaut de
   `firebase init` ouvrent la base à tout internet pendant 30 jours.
5. **Le frontend** : ni SDK Firebase, ni `package-lock.json` (le projet est sur
   yarn), et une adresse de backend cohérente avec la cible visée.

Usage
-----
    cd backend
    python scripts/verifier_configuration.py            # cible : web (Hosting)
    python scripts/verifier_configuration.py --cible apk

Code de sortie 0 = configuration cohérente. Aucun secret n'est affiché.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

RACINE_DEFAUT = Path(__file__).resolve().parent.parent.parent


class Rapport:
    """Trois niveaux : bloquant, à surveiller, conforme."""

    def __init__(self):
        self.ko = 0
        self.avis = 0
        self.ok = 0
        self.lignes = []

    def _dire(self, marque, texte, detail):
        self.lignes.append(f"  {marque}  {texte}" + (f" — {detail}" if detail else ""))

    def exige(self, texte, condition, detail=""):
        if condition:
            self.ok += 1
            self._dire("ok  ", texte, detail)
        else:
            self.ko += 1
            self._dire("KO  ", texte, detail)
        return bool(condition)

    def surveille(self, texte, condition, detail=""):
        if condition:
            self.ok += 1
            self._dire("ok  ", texte, detail)
        else:
            self.avis += 1
            self._dire("avis", texte, detail)
        return bool(condition)

    def titre(self, texte):
        self.lignes.append(f"\n{texte}")


def _lire_env(racine: Path, env: dict) -> dict:
    """Variables du processus, complétées par `backend/.env` s'il existe."""
    valeurs = dict(env)
    fichier = racine / "backend" / ".env"
    if fichier.exists():
        for ligne in fichier.read_text(encoding="utf-8").splitlines():
            ligne = ligne.strip()
            if not ligne or ligne.startswith("#") or "=" not in ligne:
                continue
            cle, _, val = ligne.partition("=")
            valeurs.setdefault(cle.strip(), val.strip())
    return valeurs


def _json_ou_none(chemin: Path):
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except Exception:
        return None


def _projet_du_compte_de_service(env: dict, racine: Path):
    """Identifiant du projet lu dans le compte de service, sans jamais l'afficher."""
    brut = env.get("FIREBASE_SERVICE_ACCOUNT")
    if brut:
        try:
            return json.loads(brut).get("project_id")
        except Exception:
            return None
    for cle in ("FIREBASE_SERVICE_ACCOUNT_FILE", "GOOGLE_APPLICATION_CREDENTIALS"):
        chemin = env.get(cle)
        if chemin:
            p = Path(chemin)
            if not p.is_absolute():
                p = racine / "backend" / chemin
            d = _json_ou_none(p)
            if d:
                return d.get("project_id")
    return None


def verifier(racine: Path, env: dict, cible: str = "web") -> Rapport:
    r = Rapport()
    env = _lire_env(racine, env)
    backend, frontend = racine / "backend", racine / "frontend"

    # ---------------------------------------------------------------- 1. env
    r.titre("1. Variables d'environnement du backend")
    r.exige("ADMIN_PASSWORD est défini", bool(env.get("ADMIN_PASSWORD")),
            "" if env.get("ADMIN_PASSWORD") else "le serveur refusera de démarrer")
    secret = env.get("JWT_SECRET") or ""
    r.exige("JWT_SECRET est défini", bool(secret),
            "" if secret else "le serveur refusera de démarrer")
    if secret:
        # Il signe des sessions de 30 jours : une valeur devinable les forge toutes.
        r.surveille("JWT_SECRET est assez long", len(secret) >= 32,
                    f"{len(secret)} caractères — viser 32+ (`openssl rand -hex 32`)")

    base = (env.get("DATA_BACKEND") or "mongo").lower()
    r.surveille(f"DATA_BACKEND = « {base} »", base in ("mongo", "firestore"),
                "valeur inconnue : le code retombera sur mongo" if base not in ("mongo", "firestore") else "")
    if base == "firestore":
        compte = any(env.get(k) for k in ("FIREBASE_SERVICE_ACCOUNT",
                                          "FIREBASE_SERVICE_ACCOUNT_FILE",
                                          "GOOGLE_APPLICATION_CREDENTIALS"))
        ambiant = bool(env.get("K_SERVICE") or env.get("GAE_ENV") or env.get("FIREBASE_USE_ADC"))
        r.exige("un compte de service Firebase est joignable", compte or ambiant,
                "sur Cloud Run il est ambiant ; en local, renseigner "
                "FIREBASE_SERVICE_ACCOUNT_FILE")
        r.surveille("MONGO_URL n'est plus nécessaire", not env.get("MONGO_URL"),
                    "défini alors que la base est Firestore : sans effet, mais trompeur")
    else:
        r.exige("MONGO_URL et DB_NAME sont définis",
                bool(env.get("MONGO_URL") and env.get("DB_NAME")),
                "requis tant que DATA_BACKEND=mongo")

    avis = env.get("BACKEND_DEPRECIE") or ""
    if avis:
        r.surveille("BACKEND_DEPRECIE est posé — c'est l'ANCIEN déploiement",
                    False, "à ne mettre que sur l'instance qu'on abandonne (invariant 32)")

    # -------------------------------------------------------- 2. même projet
    r.titre("2. Un seul et même projet Firebase")
    rc = _json_ou_none(racine / ".firebaserc") or {}
    projet_cli = ((rc.get("projects") or {}).get("default")) if rc else None
    projet_compte = _projet_du_compte_de_service(env, racine)
    r.surveille(".firebaserc désigne un projet", bool(projet_cli),
                projet_cli or "absent : lancer `firebase use --add`")
    if projet_cli and projet_compte:
        r.exige("le compte de service vise LE MÊME projet", projet_cli == projet_compte,
                f"{projet_cli} vs {projet_compte} — Hosting et le backend "
                "écriraient à deux endroits (invariant 27)")
    elif projet_cli and base == "firestore":
        r.surveille("projet du compte de service lisible", False,
                    "impossible de vérifier qu'il s'agit du même projet")

    # -------------------------------------------------------- 3. firebase.json
    r.titre("3. firebase.json")
    conf = _json_ou_none(racine / "firebase.json")
    if not r.exige("firebase.json est lisible", conf is not None):
        return r
    hosting = conf.get("hosting") or {}
    rewrites = hosting.get("rewrites") or []
    vers_run = [x for x in rewrites if "run" in x]
    r.exige("l'API est renvoyée vers Cloud Run", len(vers_run) >= 1,
            "sans cela le site n'a aucune API en même origine")
    regions = {x["run"].get("region") for x in vers_run}
    r.exige("tous les renvois visent la MÊME région", len(regions) <= 1,
            " / ".join(sorted(str(x) for x in regions)))
    if regions:
        r.surveille(f"région Cloud Run déclarée : {sorted(regions)[0]}", True,
                    "doit être celle où le service est réellement déployé, "
                    "et de préférence celle de la base Firestore")
    if rewrites:
        r.exige("le repli SPA est en DERNIER", rewrites[-1].get("source") == "**",
                "placé avant, il attraperait aussi /api/**")
    public = hosting.get("public")
    r.surveille("le dossier publié existe", bool(public) and (racine / public).exists(),
                f"{public} — produit par `yarn build:web`" if public else "non déclaré")
    fs = conf.get("firestore") or {}
    r.exige("les règles Firestore sont déclarées", bool(fs.get("rules")))
    r.surveille("les index Firestore sont déclarés", bool(fs.get("indexes")),
                "sinon `firebase deploy --only firestore` réclame")

    # ------------------------------------------------------ 4. règles Firestore
    r.titre("4. Règles Firestore")
    regles = (racine / "firestore.rules")
    if r.exige("firestore.rules existe", regles.exists()):
        texte = regles.read_text(encoding="utf-8")
        r.exige("tout accès direct est refusé", "allow read, write: if false;" in texte,
                "le backend est le seul écrivain (invariant 29)")
        r.exige("ce ne sont pas les règles par défaut de `firebase init`",
                "request.time" not in texte and "timestamp.date" not in texte,
                "elles OUVRENT la base à tout internet pendant 30 jours")

    # ------------------------------------------------------------ 5. frontend
    r.titre("5. Frontend")
    pkg = _json_ou_none(frontend / "package.json") or {}
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    r.exige("le SDK Firebase n'est pas installé", "firebase" not in deps,
            "l'échange de jeton tient en deux requêtes REST (invariant 28)")
    r.exige("pas de package-lock.json", not (frontend / "package-lock.json").exists(),
            "le projet est sur yarn : deux arbres de dépendances divergeraient")
    r.surveille("un modèle .env.example est fourni", (frontend / ".env.example").exists())

    fenv = {}
    fichier = frontend / ".env"
    if fichier.exists():
        for ligne in fichier.read_text(encoding="utf-8").splitlines():
            if "=" in ligne and not ligne.strip().startswith("#"):
                c, _, v = ligne.partition("=")
                fenv[c.strip()] = v.strip()
    url = fenv.get("EXPO_PUBLIC_BACKEND_URL", "")
    if cible == "web":
        r.exige("EXPO_PUBLIC_BACKEND_URL est VIDE (cible web)", not url,
                f"« {url} » — sous Hosting l'API est à la même origine (invariant 31)")
    else:
        r.exige("EXPO_PUBLIC_BACKEND_URL est renseignée (cible APK)", bool(url),
                "un téléphone n'a pas d'origine : il lui faut une URL absolue")
        if url:
            r.exige("c'est une URL absolue en https", url.startswith("https://"), url)
    r.surveille("EXPO_PUBLIC_FIREBASE_API_KEY est renseignée",
                bool(fenv.get("EXPO_PUBLIC_FIREBASE_API_KEY")),
                "absente : les sessions Firebase restent inertes (le jeton VALEO suffit)")
    return r


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Contrôle de configuration VALEO, avant déploiement.")
    ap.add_argument("--cible", choices=["web", "apk"], default="web",
                    help="ce qu'on s'apprête à construire (défaut : web)")
    ap.add_argument("--racine", default=str(RACINE_DEFAUT), help=argparse.SUPPRESS)
    a = ap.parse_args(argv)

    r = verifier(Path(a.racine), os.environ, a.cible)
    print("\n".join(r.lignes))
    total = r.ok + r.avis + r.ko
    if r.ko:
        print(f"\n>>> {r.ko} BLOCAGE(S) — {total} contrôles ({r.avis} à surveiller)")
        print("Corrigez ce qui précède avant de déployer.")
        return 1
    print(f"\n>>> CONFIGURATION COHÉRENTE — {total} contrôles ({r.avis} à surveiller)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
