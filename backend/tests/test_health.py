"""뼈대 스모크 테스트: 앱이 뜨고 헬스체크가 응답하는지."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
