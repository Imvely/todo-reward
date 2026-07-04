"""shop_items, user_inventory — TECH_DESIGN §2 DDL과 1:1."""

import datetime
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ShopItem(Base):
    __tablename__ = "shop_items"
    __table_args__ = (CheckConstraint("price >= 0", name="ck_shop_price_nonneg"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    # 'top','bottom','dress','set','shoes','socks','sunglasses',
    # 'accessory','bag','background','pet','misc','hair' 등
    category: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    # 3D 적용 참조 (TECH_DESIGN §7.2): 'prop:cap'(뼈 부착 프롭) / 'mat:Tops_01'(VRM 머티리얼 토글)
    # / 'fx:sparkle_gold'(파티클) / 'env:sakura'(무대 배경). NULL = 3D 미지원 → 판매 비활성 대상.
    asset_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 아바타 레이어 쌓는 순서(z-index). 배경 < 몸 < 하의 < 상의 < 헤어 < 액세서리 순.
    layer_z: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class UserInventory(Base):
    __tablename__ = "user_inventory"
    __table_args__ = (
        UniqueConstraint("user_id", "item_id", name="uq_inventory_user_item"),
        # 착용 규칙: 같은 category 안에서 equipped=true 는 최대 1개.
        # category를 비정규화 복사한 뒤 부분 유니크 인덱스로 DB가 강제.
        Index(
            "one_equipped_per_cat",
            "user_id",
            "category",
            unique=True,
            postgresql_where=text("equipped = true"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shop_items.id"), nullable=False
    )
    # shop_items.category 비정규화 복사 — 부분 유니크 인덱스가 참조.
    category: Mapped[str] = mapped_column(Text, nullable=False)
    equipped: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    bought_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
