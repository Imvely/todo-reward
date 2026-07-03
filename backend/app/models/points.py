"""point_transactions, daily_bonus_log — TECH_DESIGN §2 DDL과 1:1.

포인트 원장(ledger)은 모든 증감의 진실. 잔액(users.point_a/b)은 캐시일 뿐이고
모든 변화는 여기 행으로 남는다 (CLAUDE.md 불변 규칙).
"""

import datetime
import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# reason 허용값 — 지급/회수/차감/결산 사유. CHECK로 오타 차단.
POINT_REASONS = (
    "mission",
    "mission_revoke",
    "day_complete",
    "day_complete_revoke",
    "streak",
    "streak_revoke",
    "shop_purchase",
    "settlement_convert",
)


class PointTransaction(Base):
    __tablename__ = "point_transactions"
    __table_args__ = (
        CheckConstraint("kind IN ('A', 'B')", name="ck_ptx_kind"),
        CheckConstraint(
            "reason IN (" + ", ".join(f"'{r}'" for r in POINT_REASONS) + ")",
            name="ck_ptx_reason",
        ),
        Index("idx_ptx_user", "user_id", "created_at"),
    )

    # 원장은 순번이 편리 (시간순 감사).
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # 'A' or 'B'
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # 지급 양수 / 회수·차감 음수
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DailyBonusLog(Base):
    """그날 지급된 보너스 기록. 토글 OFF로 완주가 깨질 때 정확 회수의 근거."""

    __tablename__ = "daily_bonus_log"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    due_date: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    day_bonus: Mapped[int] = mapped_column(Integer, nullable=False)  # 지급된 완주 보너스 (보통 10)
    streak_bonus: Mapped[int] = mapped_column(
        Integer, nullable=False
    )  # 지급된 연속 보너스 10×(N-1)
    streak_n: Mapped[int] = mapped_column(
        Integer, nullable=False
    )  # 지급 당시 N (회수 시 되돌릴 값)
