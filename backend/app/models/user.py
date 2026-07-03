"""users, settings — TECH_DESIGN §2 DDL과 1:1."""

import datetime
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Integer,
    SmallInteger,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        CheckConstraint("point_a >= 0", name="ck_users_point_a_nonneg"),
        CheckConstraint("point_b >= 0", name="ck_users_point_b_nonneg"),
        CheckConstraint("coin_balance >= 0", name="ck_users_coin_nonneg"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    username: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    point_a: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    point_b: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    coin_balance: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    # 현재 연속 완주 일수 N. 보너스 = 10×(N-1).
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    # 마지막으로 완주한 "논리적 날짜". 연속 판정에 사용.
    last_complete_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Settings(Base):
    """관리자 설정 싱글턴 (id=1 강제)."""

    __tablename__ = "settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_settings_singleton"),)

    id: Mapped[int] = mapped_column(
        SmallInteger, primary_key=True, server_default=text("1"), autoincrement=False
    )
    # NULL = 리셋 안 함(기본).
    streak_reset_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 하루 경계 시각. 모든 날짜 계산이 이 값을 참조한다. 자정 하드코딩 금지.
    day_boundary_time: Mapped[datetime.time] = mapped_column(
        Time, nullable=False, server_default=text("'00:00'")
    )
    timezone: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Asia/Seoul'"))
