"""A상점/옷장 스키마. TECH_DESIGN §3."""

import uuid

from pydantic import BaseModel


class ShopItemOut(BaseModel):
    id: uuid.UUID
    category: str
    name: str
    price: int
    image_url: str
    layer_z: int

    model_config = {"from_attributes": True}


class PurchaseRequest(BaseModel):
    item_id: uuid.UUID


class PurchaseResponse(BaseModel):
    """구매 결과 — 클라이언트가 잔액을 서버 값으로만 갱신하도록 balances를 함께 준다."""

    inventory_id: uuid.UUID
    item: ShopItemOut
    balances: dict[str, int]  # {"point_a": .., "point_b": ..}


class EquipRequest(BaseModel):
    equipped: bool  # true=착용, false=해제


class InventoryItemOut(BaseModel):
    """옷장 한 칸 — 인벤토리 + 아이템 상세를 합친 뷰."""

    inventory_id: uuid.UUID
    item_id: uuid.UUID
    category: str
    equipped: bool
    name: str
    image_url: str
    price: int
    layer_z: int
