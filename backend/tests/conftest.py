"""Harnais de test en processus pour le backend VALEO.

Les tests historiques (`test_valeo_api.py`, `test_multicoop_isolation.py`,
`test_admin_change_password.py`) frappent une instance déployée via
`EXPO_PUBLIC_BACKEND_URL`. Les tests de sécurité et de fusion ajoutés ici
tournent **en processus**, avec une base MongoDB simulée (`mongomock_motor`),
pour être exécutables sans réseau ni serveur lancé.

`client_app()` renvoie un `TestClient` FastAPI branché sur une base vierge :
chaque test part d'un état propre et n'interfère pas avec les autres workers
xdist.
"""
import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Variables obligatoires : `server.py` refuse de démarrer sans elles.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "valeo_test")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")
os.environ.setdefault("JWT_SECRET", "secret-de-test-valeo")


def _load_server_module():
    """Importe `server` ou saute proprement si les dépendances manquent."""
    try:
        import server  # noqa: WPS433 (import tardif volontaire)
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        pytest.skip(f"Backend non importable dans cet environnement : {exc}")
    return server


@pytest.fixture(params=["mongo", "firestore"])
def app_client(request):
    """TestClient FastAPI sur une base simulée, remise à zéro à chaque test.

    **Chaque test tourne deux fois** : une fois sur MongoDB (le dépôt
    d'aujourd'hui), une fois sur Firestore (celui de la migration, phase 3).
    C'est la seule façon de prouver — plutôt que d'affirmer — que le changement
    de base ne déplace aucune règle : isolation entre coopératives, matrice de
    rôles, périmètre du planteur et fusion par enregistrement doivent tomber
    identiques des deux côtés.
    """
    try:
        from fastapi.testclient import TestClient
        from mongomock_motor import AsyncMongoMockClient
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        pytest.skip(f"Dépendances de test absentes : {exc}")

    import depot as depot_module

    from tests.faux_firestore import FauxFirestore

    server = _load_server_module()
    previous_db, previous_depot = server.db, server.depot
    server.db = AsyncMongoMockClient()["valeo_test"]
    if request.param == "firestore":
        faux = FauxFirestore()
        server.depot = depot_module.DepotFirestore(faux, "valeo_test_fs", "firestore|projet-test|(default)")
    else:
        faux = None
        server.depot = depot_module.DepotMongo(lambda: server.db, "mongodb://test|valeo_test")
    try:
        with TestClient(server.app) as client:
            client.server = server
            client.depot_nom = request.param
            client.firestore = faux
            yield client
    finally:
        server.db, server.depot = previous_db, previous_depot
