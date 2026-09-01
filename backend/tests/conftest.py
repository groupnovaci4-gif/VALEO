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


@pytest.fixture()
def app_client():
    """TestClient FastAPI sur une base simulée, remise à zéro à chaque test."""
    try:
        from fastapi.testclient import TestClient
        from mongomock_motor import AsyncMongoMockClient
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        pytest.skip(f"Dépendances de test absentes : {exc}")

    server = _load_server_module()
    previous_db = server.db
    server.db = AsyncMongoMockClient()["valeo_test"]
    try:
        with TestClient(server.app) as client:
            client.server = server
            yield client
    finally:
        server.db = previous_db
