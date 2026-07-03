"""todos, routines — TECH_DESIGN §2 DDL과 1:1."""

import datetime
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Routine(Base):
    __tablename__ = "routines"
    __table_args__ = (
        CheckConstraint(
            "repeat_type IN ('daily', 'weekdays', 'custom_days')",
            name="ck_routines_repeat_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)  # NULL = 무기한
    repeat_type: Mapped[str] = mapped_column(Text, nullable=False)
    # custom_days일 때 [0=일 .. 6=토]
    days_of_week: Mapped[list[int] | None] = mapped_column(ARRAY(SmallInteger), nullable=True)
    skip_holidays: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Todo(Base):
    __tablename__ = "todos"
    __table_args__ = (
        Index("idx_todos_user_date", "user_id", "due_date"),
        # 추천 검색어용 pg_trgm gin 인덱스 (마이그레이션에서 확장 생성 후 부여).
        Index(
            "idx_todos_content_trgm",
            "content",
            postgresql_using="gin",
            postgresql_ops={"content": "gin_trgm_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    # 루틴에서 자동 생성된 TODO면 출처 루틴, 수동 입력이면 NULL.
    routine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routines.id"), nullable=True
    )
    # "논리적 날짜". 하루 경계 시각을 반영해 백엔드가 계산한 값.
    due_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_done: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # 완료 시각 (뱃지 시간대 판정용).
    done_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
