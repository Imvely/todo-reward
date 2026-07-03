"""DB 통합 테스트용 픽스처.

각 테스트를 커넥션 레벨 트랜잭션 안에서 돌리고 끝나면 롤백한다 → dev DB를 오염시키지 않는다.
DATABASE_URL 환경변수로 실제 postgres를 가리켜야 한다 (예: localhost:5434).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.main import app

_engine = create_engine(settings.database_url)


@pytest.fixture
def db_session():
    connection = _engine.connect()
    trans = connection.begin()
    # 요청 중 발생하는 flush/commit이 이 외부 트랜잭션 안에 갇히도록 savepoint 모드.
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        connection.close()


@pytest.fixture
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
