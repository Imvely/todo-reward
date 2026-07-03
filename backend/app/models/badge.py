"""badges, user_badges — TECH_DESIGN §2 DDL과 1:1."""

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # 'first_mission', 'streak_3' 등
    name: Mapped[str] = mapped_column(Text, nullable=False)
    condition_key: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # 판정 로직이 참조하는 조건 식별자


class UserBadge(Base):
    __tablename__ = "user_badges"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    badge_id: Mapped[str] = mapped_column(Text, ForeignKey("badges.id"), primary_key=True)
    earned_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
