"""VALEO backend API tests - public /api/state, admin login/state, and dashboard HTML."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://app-deploy-187.preview.emergentagent.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(api):
    r = api.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---- Public /api/state ----
class TestPublicState:
    def test_get_state_returns_json(self, api):
        r = api.get(f"{BASE_URL}/api/state", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("saison", "prixKg", "coop", "staff", "members", "collections", "loans"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["members"], list)

    def test_put_state_persists(self, api):
        # Load current state, add a marker, PUT, then GET verifies
        cur = api.get(f"{BASE_URL}/api/state", timeout=15).json()
        marker_name = "TEST_COOP_NAME_MARKER"
        cur["coop"]["nom"] = marker_name
        r = api.put(f"{BASE_URL}/api/state", json={"data": cur}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        got = api.get(f"{BASE_URL}/api/state", timeout=15).json()
        assert got["coop"]["nom"] == marker_name


# ---- Admin auth ----
class TestAdminAuth:
    def test_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/admin/login", json={"password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_login_correct(self, api):
        r = api.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "access_token" in j and j["token_type"] == "bearer"

    def test_admin_state_requires_token(self, api):
        r = api.get(f"{BASE_URL}/api/admin/state", timeout=15)
        assert r.status_code == 401

    def test_admin_state_with_token(self, api, token):
        r = api.get(f"{BASE_URL}/api/admin/state", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        assert "members" in r.json()

    def test_admin_put_requires_token(self, api):
        r = api.put(f"{BASE_URL}/api/admin/state", json={"data": {}}, timeout=15)
        assert r.status_code == 401


# ---- Admin -> public sync ----
class TestAdminSync:
    def test_admin_put_reflected_in_public(self, api, token):
        cur = api.get(f"{BASE_URL}/api/admin/state", headers={"Authorization": f"Bearer {token}"}, timeout=15).json()
        marker = "TEST_ADMIN_WRITE_MARKER"
        cur["coop"]["nom"] = marker
        r = api.put(
            f"{BASE_URL}/api/admin/state",
            headers={"Authorization": f"Bearer {token}"},
            json={"data": cur},
            timeout=15,
        )
        assert r.status_code == 200
        got = api.get(f"{BASE_URL}/api/state", timeout=15).json()
        assert got["coop"]["nom"] == marker


# ---- Admin dashboard HTML ----
class TestAdminDashboard:
    def test_dashboard_html(self, api):
        r = api.get(f"{BASE_URL}/api/admin", timeout=15)
        assert r.status_code == 200
        html = r.text
        assert "VALEO" in html
        assert 'id="pwd"' in html
        assert "Se connecter" in html
