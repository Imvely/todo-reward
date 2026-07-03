"""SQLAlchemy 2.x 엔진 / 세션 / Base.

모델은 app/models/ 에서 Base를 상속한다 (TECH_DESIGN §2 DDL과 1:1).
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """모든 ORM 모델의 베이스."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI 의존성: 요청당 세션 1개, 종료 시 닫는다."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
