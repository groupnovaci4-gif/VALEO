"""Authentification Firebase par **jeton personnalisé** (custom token).

Pourquoi ce mode, et pas le fournisseur « E-mail / Mot de passe »
-----------------------------------------------------------------
VALEO a trois circuits de connexion, et **aucun** n'entre dans le moule de
Firebase :

* un collaborateur se connecte par e-mail **ou par téléphone** ;
* un planteur se connecte par son code `VAL-XXXX-YY` **ou** son téléphone ;
* le propriétaire se connecte par un mot de passe, **sans aucun identifiant**.

Surtout, le code à 6 chiffres est haché **sur le téléphone** (`pin.ts`) : le
serveur ne voit jamais le clair. Le fournisseur « E-mail / Mot de passe »
exige l'inverse — un e-mail, et le mot de passe en clair. Importer les
empreintes ne réglerait rien : le problème n'est pas l'algorithme, c'est le
modèle d'identifiants.

Le jeton personnalisé laisse **toute la vérification là où elle est
aujourd'hui**. Le serveur valide le `pin` exactement comme avant, puis se
contente de frapper un jeton Firebase. Firebase n'intervient qu'après, pour la
session. Aucune règle métier ne change, aucun invariant n'est déplacé.

Ce que ce module ne fait PAS
----------------------------
Il ne remplace pas le jeton VALEO. L'application est **hors-ligne d'abord** :
un jeton d'identité Firebase vit une heure et se renouvelle *par le réseau*.
Un pisteur reste des jours sans réseau en tournée — s'il n'avait que Firebase,
il serait déconnecté au bout d'une heure, au milieu de la brousse, avec ses
pesées non synchronisées. Le jeton VALEO de 30 jours reste donc la session de
secours, et le serveur accepte les deux (`require_user`). Firebase apporte la
session **courte et révocable** quand le réseau est là ; VALEO garde la
session **longue** qui fait tenir le hors-ligne.

Activation
----------
Tout est inerte tant que les identifiants ne sont pas fournis. Renseigner
**l'une** de ces variables d'environnement suffit :

* `FIREBASE_SERVICE_ACCOUNT` — le JSON du compte de service, en une ligne ;
* `FIREBASE_SERVICE_ACCOUNT_FILE` — le chemin de ce même fichier JSON ;
* `GOOGLE_APPLICATION_CREDENTIALS` — la variable standard de Google.

Sans elles, `disponible()` renvoie faux et le serveur se comporte
**exactement** comme aujourd'hui. C'est ce qui permet de déployer ce code
avant d'avoir basculé quoi que ce soit.

Ne jamais committer ce JSON : c'est une clé privée qui donne tous les droits
sur le projet Firebase.
"""

import json
import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

try:  # firebase-admin est facultatif : sans lui, le module reste inerte.
    import firebase_admin
    from firebase_admin import auth as fb_auth
    from firebase_admin import credentials as fb_credentials
except Exception:  # pragma: no cover - dépend de l'environnement de déploiement
    firebase_admin = None
    fb_auth = None
    fb_credentials = None

# Une seule initialisation par processus, même sous plusieurs workers async.
_verrou = threading.Lock()
_app = None
_tente = False

# `verify_id_token(check_revoked=True)` interroge Google à chaque appel pour
# savoir si la session a été révoquée. C'est le prix de la révocation
# immédiate — c'est justement ce qu'on vient chercher — mais un déploiement
# peut le désactiver s'il devient trop coûteux.
CHECK_REVOKED = os.environ.get("FIREBASE_CHECK_REVOKED", "1") not in ("0", "false", "False", "")


def _identifiants():
    """Lit le compte de service, sans jamais le journaliser."""
    brut = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if brut:
        return fb_credentials.Certificate(json.loads(brut))
    chemin = os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE")
    if chemin:
        return fb_credentials.Certificate(chemin)
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return fb_credentials.ApplicationDefault()
    return None


def _init():
    """Initialise à la première utilisation, une seule fois, sans jamais lever.

    Une panne d'initialisation ne doit pas empêcher de se connecter : on
    retombe sur le jeton VALEO, qui suffit à faire tourner l'application.
    """
    global _app, _tente
    if _app is not None or _tente:
        return _app
    with _verrou:
        if _app is not None or _tente:
            return _app
        _tente = True
        if firebase_admin is None:
            return None
        try:
            cred = _identifiants()
            if cred is None:
                return None
            _app = firebase_admin.initialize_app(cred, name="valeo")
            logger.info("Authentification Firebase active.")
        except Exception as e:  # identifiants absents ou illisibles
            logger.warning("Firebase inactif (%s) : on garde le jeton VALEO seul.", type(e).__name__)
            _app = None
        return _app


def disponible() -> bool:
    """Firebase est-il configuré sur CE déploiement ?"""
    return _init() is not None


def reinitialiser() -> None:
    """Repart de zéro. Réservé aux tests : jamais appelé en production."""
    global _app, _tente
    with _verrou:
        if _app is not None and firebase_admin is not None:
            try:
                firebase_admin.delete_app(_app)
            except Exception:
                pass
        _app = None
        _tente = False


# --------------------------------------------------------------------------- #
# Correspondance entre une identité VALEO et un compte Firebase
# --------------------------------------------------------------------------- #
# L'identifiant Firebase (`uid`) est **dérivé** de l'identité VALEO, jamais
# tiré au sort : il doit être le même à chaque connexion, sinon une révocation
# ne porterait que sur la session en cours et l'audit perdrait le fil.
UID_ADMIN = "owner"


def uid_de(identity: dict) -> str:
    prefixe = "planteur" if identity.get("side") == "planteur" else "staff"
    return f"{prefixe}:{identity['sub']}"


def claims_de(identity: dict) -> dict:
    """Les revendications portées par le jeton — la matrice de rôles en dépend.

    `coopId` en fait partie : c'est l'isolation entre coopératives (invariant
    1), et elle doit venir du jeton, jamais du corps de la requête.
    """
    c = {"coopId": identity.get("coopId"), "side": identity.get("side")}
    if identity.get("role"):
        c["role"] = identity["role"]
    return c


def creer_jeton(identity: dict) -> Optional[str]:
    """Frappe un jeton personnalisé pour un compte de l'application.

    Renvoie `None` si Firebase n'est pas configuré — l'appelant continue avec
    le seul jeton VALEO. Une panne Firebase ne doit jamais empêcher un pisteur
    de se connecter pour aller peser.
    """
    if not disponible():
        return None
    try:
        jeton = fb_auth.create_custom_token(uid_de(identity), claims_de(identity), app=_app)
        return jeton.decode("utf-8") if isinstance(jeton, bytes) else jeton
    except Exception as e:
        logger.warning("Jeton Firebase non délivré (%s).", type(e).__name__)
        return None


def creer_jeton_admin() -> Optional[str]:
    """Le propriétaire : un compte unique, hors coopérative."""
    if not disponible():
        return None
    try:
        jeton = fb_auth.create_custom_token(UID_ADMIN, {"admin": True}, app=_app)
        return jeton.decode("utf-8") if isinstance(jeton, bytes) else jeton
    except Exception as e:
        logger.warning("Jeton Firebase admin non délivré (%s).", type(e).__name__)
        return None


def verifier(id_token: str) -> Optional[dict]:
    """Vérifie un jeton d'identité Firebase et renvoie une identité VALEO.

    Renvoie `None` dès que le moindre doute existe : jeton invalide, expiré,
    révoqué, ou **dépourvu de nos revendications**. Ce dernier cas compte : un
    compte créé dans le projet Firebase par un autre moyen présenterait un
    jeton parfaitement valide pour Google, sans `coopId` ni `side`. Il ne doit
    ouvrir aucune porte.
    """
    if not disponible():
        return None
    try:
        p = fb_auth.verify_id_token(id_token, app=_app, check_revoked=CHECK_REVOKED)
    except Exception:
        return None

    uid = p.get("uid") or p.get("sub")
    if p.get("admin") is True:
        # Le propriétaire, et lui seul : un `uid` proche ne suffit pas.
        return {"sub": UID_ADMIN} if uid == UID_ADMIN else None

    side, coop_id = p.get("side"), p.get("coopId")
    if side not in ("coop", "planteur") or not coop_id:
        return None
    identity = {"sub": (uid or "").split(":", 1)[-1], "coopId": coop_id,
                "role": p.get("role"), "side": side}
    # Le `uid` doit correspondre aux revendications : sinon les deux ont été
    # posés séparément, et l'un des deux ment.
    if uid != uid_de(identity):
        return None
    return identity


def revoquer(identity: dict) -> bool:
    """Coupe immédiatement toutes les sessions Firebase d'un compte.

    C'est ce que le jeton VALEO de 30 jours ne sait pas faire : un téléphone
    perdu reste connecté jusqu'à expiration. Ici, la coupure est immédiate.
    """
    if not disponible():
        return False
    try:
        fb_auth.revoke_refresh_tokens(uid_de(identity), app=_app)
        return True
    except Exception as e:
        logger.warning("Révocation Firebase impossible (%s).", type(e).__name__)
        return False
