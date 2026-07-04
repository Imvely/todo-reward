"""A상점/옷장 라우터. TECH_DESIGN §3.

포인트 계산은 services/shop.py에만 (라우터는 얇게). 조회는 포인트 무관이라 여기서 처리.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.shop import ShopItem, UserInventory
from app.models.user import User
from app.schemas.shop import InventoryItemOut, PurchaseRequest, PurchaseResponse, ShopItemOut
from app.services.shop import purchase_item

router = APIRouter(tags=["shop"])


@router.get("/shop/items", response_model=list[ShopItemOut])
def list_items(
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ShopItem]:
    """A상점 카탈로그. 활성 아이템만, 선택적으로 카테고리 필터."""
    stmt = select(ShopItem).where(ShopItem.is_active.is_(True))
    if category is not None:
        stmt = stmt.where(ShopItem.category == category)
    return list(db.scalars(stmt.order_by(ShopItem.category, ShopItem.price)).all())


@router.post("/shop/purchase", response_model=PurchaseResponse)
def purchase(
    body: PurchaseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PurchaseResponse:
    """아이템 구매 — A포인트만 차감하고 옷장에 추가 (원자적, §6-5)."""
    result = purchase_item(db, user, body.item_id)
    return PurchaseResponse(
        inventory_id=result.inventory_id,
        item=ShopItemOut.model_validate(result.item),
        balances=result.balances,
    )


@router.get("/inventory", response_model=list[InventoryItemOut])
def list_inventory(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[InventoryItemOut]:
    """내 옷장 — 인벤토리 + 아이템 상세를 합쳐 카테고리별로 반환."""
    rows = db.execute(
        select(UserInventory, ShopItem)
        .join(ShopItem, ShopItem.id == UserInventory.item_id)
        .where(UserInventory.user_id == user.id)
        .order_by(UserInventory.category, ShopItem.name)
    ).all()
    return [
        InventoryItemOut(
            inventory_id=inv.id,
            item_id=item.id,
            category=inv.category,
            equipped=inv.equipped,
            name=item.name,
            image_url=item.image_url,
            price=item.price,
            layer_z=item.layer_z,
        )
        for inv, item in rows
    ]
