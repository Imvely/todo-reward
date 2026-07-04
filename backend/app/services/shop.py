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


# 동시 착용 불가 조합 (docs/research/item-catalog-plan.md).
# 원피스↔상·하의, 안경↔선글라스(눈), 모자↔동물귀(정수리) — 같은 부위는 자동 교체.
_CONFLICTS: dict[str, tuple[str, ...]] = {
    "dress": ("top", "bottom"),
    "top": ("dress",),
    "bottom": ("dress",),
    "glasses": ("sunglasses",),
    "sunglasses": ("glasses",),
    "hat": ("ears",),
    "ears": ("hat",),
}


def set_equipped(db: Session, user: User, inventory_id: uuid.UUID, equipped: bool) -> None:
    """옷장 아이템 착용/해제 (§6-6). 같은 카테고리 기존 착용은 자동 해제.

    DB 부분 유니크 인덱스(one_equipped_per_cat)가 최후 방어선이지만,
    여기서 먼저 해제해 사용자 흐름에서는 항상 성공하게 한다.
    """
    if user.role != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="옷장은 사용자만 이용할 수 있습니다",
        )

    inv = db.get(UserInventory, inventory_id)
    if inv is None or inv.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="옷장에서 찾을 수 없습니다"
        )

    if equipped:
        # 같은 카테고리 + 충돌 카테고리(원피스↔상·하의)의 기존 착용을 해제.
        conflict_cats = (inv.category, *_CONFLICTS.get(inv.category, ()))
        worn = db.scalars(
            select(UserInventory).where(
                UserInventory.user_id == user.id,
                UserInventory.category.in_(conflict_cats),
                UserInventory.equipped.is_(True),
                UserInventory.id != inv.id,
            )
        ).all()
        for w in worn:
            w.equipped = False
        db.flush()  # 부분 유니크 인덱스 위반 방지 — 해제를 먼저 반영
        inv.equipped = True
    else:
        inv.equipped = False
    db.commit()
