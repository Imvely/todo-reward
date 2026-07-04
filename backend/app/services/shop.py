"""A상점 구매 서비스 — A포인트만 차감, B는 절대 건드리지 않는다.

불변 규칙(CLAUDE.md):
- A 차감 로직에서 B를 건드리지 않는다 (차감은 독립). 여기서는 kind='A'만 기록한다.
- 포인트 차감은 services에만. 모든 증감은 record_point로 원장에 남긴다.
- 구매는 단일 트랜잭션(차감 + 인벤토리 추가). 반쪽 상태 방지.
"""

import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.shop import ShopItem, UserInventory
from app.models.user import User
from app.services.points import record_point


@dataclass
class PurchaseResult:
    inventory_id: uuid.UUID
    item: ShopItem
    balances: dict[str, int]


def purchase_item(db: Session, user: User, item_id: uuid.UUID) -> PurchaseResult:
    """A상점 아이템 구매 (§6-5). A포인트만 차감하고 옷장에 추가한다.

    사용자 전용. 아이템 없음/비활성 404, 이미 보유 400, A포인트 부족 400(변화 없음).
    """
    if user.role != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="상점은 사용자만 이용할 수 있습니다",
        )

    item = db.get(ShopItem, item_id)
    if item is None or not item.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="아이템을 찾을 수 없습니다"
        )

    already = db.scalar(
        select(UserInventory).where(
            UserInventory.user_id == user.id, UserInventory.item_id == item.id
        )
    )
    if already is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="이미 보유한 아이템입니다"
        )

    if user.point_a < item.price:
        # 잔액 부족 — 아무 변화 없이 거부 (§6-5).
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A포인트가 부족합니다")

    # A만 차감 (B 미접촉). 원장에 shop_purchase로 기록.
    record_point(db, user, "A", -item.price, "shop_purchase", ref_id=item.id)
    inv = UserInventory(
        user_id=user.id,
        item_id=item.id,
        category=item.category,  # 부분 유니크 인덱스가 참조하는 비정규화 값
        equipped=False,
    )
    db.add(inv)
    db.commit()
    db.refresh(user)
    db.refresh(inv)
    return PurchaseResult(
        inventory_id=inv.id,
        item=item,
        balances={"point_a": user.point_a, "point_b": user.point_b},
    )
