"""settlements, coin_transactions — TECH_DESIGN §2 DDL과 1:1."""

import datetime
import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Settlement(Base):
    """일요일 결산. (user_id, iso_year_week) UNIQUE가 멱등성의 핵심."""

    __tablename__ = "settlements"
    __table_args__ = (UniqueConstraint("user_id", "iso_year_week", name="uq_settlement_user_week"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    iso_year_week: Mapped[str] = mapped_column(Text, nullable=False)  # 예: '2026-W27'
    converted: Mapped[int] = mapped_column(Integer, nullable=False)  # 전환된 코인머니
    carried_over: Mapped[int] = mapped_column(Integer, nullable=False)  # 이월된 자투리 B포인트
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CoinTransaction(Base):
    __tablename__ = "coin_transactions"
    __table_args__ = (
        CheckConstraint("reason IN ('settlement', 'withdraw')", name="ck_coin_reason"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # 전환 양수 / 출금 음수
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)  # 관리자 출금 메모
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
