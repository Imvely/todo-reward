"""모든 ORM 모델을 임포트해 Base.metadata에 등록한다.

Alembic autogenerate와 create_all이 전체 테이블을 보도록 하는 단일 지점.
"""

from app.models.badge import Badge, UserBadge
from app.models.coin import CoinTransaction, Settlement
from app.models.points import DailyBonusLog, PointTransaction
from app.models.shop import ShopItem, UserInventory
from app.models.todo import Routine, Todo
from app.models.user import Settings, User

__all__ = [
    "Badge",
    "CoinTransaction",
    "DailyBonusLog",
    "PointTransaction",
    "Routine",
    "Settings",
    "Settlement",
    "ShopItem",
    "Todo",
    "User",
    "UserBadge",
    "UserInventory",
]
