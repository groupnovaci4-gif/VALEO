"""F2 - Admin change password endpoint tests.

Sequence:
- Login admin123 -> token
- change-password without token -> 401
- change-password wrong current -> 400
- change-password too-short new -> 400
- change-password admin123 -> nouveau2026 -> 200
- login admin123 -> 401 ; login nouveau2026 -> 200
- Reset back to admin123 at the end (finally) to preserve test suite integrity
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-deploy-187.preview.emergentagent.com").rstrip("/")


def _login(pw: str):
    return requests.post(f"{BASE_URL}/api/admin/login", json={"password": pw}, timeout=15)


def _change(token: str, current: str, new: str):
    return requests.post(
        f"{BASE_URL}/api/admin/change-password",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"current": current, "new": new},
        timeout=15,
    )


@pytest.fixture(scope="module")
def initial_token():
    r = _login("admin123")
    assert r.status_code == 200, f"expected admin123 to still be the password, got {r.status_code}: {r.text}"
    return r.json()["access_token"]


def test_change_password_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/change-password", json={"current": "admin123", "new": "nouveau2026"}, timeout=15)
    assert r.status_code == 401


def test_change_password_flow_and_restore(initial_token):
    tok = initial_token
    try:
        # wrong current -> 400
        r = _change(tok, "wrongpass", "nouveau2026")
        assert r.status_code == 400, r.text

        # too short new -> 400 (spec: '123')
        r = _change(tok, "admin123", "123")
        assert r.status_code == 400, r.text

        # valid change
        r = _change(tok, "admin123", "nouveau2026")
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # old password no longer works
        r_old = _login("admin123")
        assert r_old.status_code == 401, r_old.text

        # new password works
        r_new = _login("nouveau2026")
        assert r_new.status_code == 200, r_new.text
        new_tok = r_new.json()["access_token"]
        assert new_tok
    finally:
        # ALWAYS restore admin123 so subsequent tests keep working
        # We may already be on nouveau2026; use whichever token is valid.
        for cur in ("nouveau2026", "admin123"):
            login_r = _login(cur)
            if login_r.status_code == 200:
                tok2 = login_r.json()["access_token"]
                if cur == "admin123":
                    break  # already restored
                restore = _change(tok2, cur, "admin123")
                assert restore.status_code == 200, restore.text
                # verify
                back = _login("admin123")
                assert back.status_code == 200, back.text
                break
