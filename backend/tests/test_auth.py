"""인증 통합 테스트 — /auth/login, /me. TECH_DESIGN §3."""

from app.core.security import hash_password
from app.models.user import User


def _make_user(db, username="t_admin", password="pw123456", role="admin"):
    user = User(username=username, password_hash=hash_password(password), role=role)
    db.add(user)
    db.flush()
    return user


def test_login_success_then_me(client, db_session):
    _make_user(db_session)

    r = client.post("/api/v1/auth/login", json={"username": "t_admin", "password": "pw123456"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert r.json()["token_type"] == "bearer"

    r2 = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    body = r2.json()
    assert body["username"] == "t_admin"
    assert body["role"] == "admin"
    assert body["point_a"] == 0
    assert body["point_b"] == 0
    assert body["coin_balance"] == 0
    assert body["current_streak"] == 0
    assert body["last_complete_date"] is None


def test_login_wrong_password_401(client, db_session):
    _make_user(db_session)
    r = client.post("/api/v1/auth/login", json={"username": "t_admin", "password": "WRONG"})
    assert r.status_code == 401


def test_login_unknown_user_401(client, db_session):
    r = client.post("/api/v1/auth/login", json={"username": "nobody", "password": "x"})
    assert r.status_code == 401


def test_me_requires_token(client):
    r = client.get("/api/v1/me")
    assert r.status_code == 401


def test_me_rejects_garbage_token(client):
    r = client.get("/api/v1/me", headers={"Authorization": "Bearer not.a.valid.jwt"})
    assert r.status_code == 401
