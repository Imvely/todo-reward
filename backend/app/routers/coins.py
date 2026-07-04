"""코인머니(적립 통장) 라우터. TECH_DESIGN §3 GET /coins.

예상 전환액 계산은 services/settlement.split_conversion 재사용 — 결산 크론과 같은 식.
"""

import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.coin import CoinTransaction
from app.models.user import User
from app.schemas.coin import CoinsResponse, CoinTransactionOut, NextSettlementOut
from app.services.day_boundary import current_logical_date, get_settings
from app.services.settlement import split_conversion
from app.services.users import resolve_todo_owner

router = APIRouter(tags=["coins"])


@router.get("/coins", response_model=CoinsResponse)
def get_coins(
    db: Session = Depends(get_db),
    requester: User = Depends(get_current_user),
) -> CoinsResponse:
    """코인 잔액 + 원장 + 다음 결산 예고. 관리자는 관리 대상 사용자 기준."""
    user = resolve_todo_owner(db, requester)

    today = current_logical_date(db)
    # 다음 결산 대상 일요일: 오늘이 일요일이면 오늘(오늘 밤 경계에 결산), 아니면 다가오는 일요일.
    days_until_sunday = (6 - today.weekday()) % 7
    next_sunday = today + datetime.timedelta(days=days_until_sunday)
    convert, carry = split_conversion(user.point_b)

    rows = db.scalars(
        select(CoinTransaction)
        .where(CoinTransaction.user_id == user.id)
        .order_by(CoinTransaction.created_at.desc(), CoinTransaction.id.desc())
        .limit(50)
    ).all()

    return CoinsResponse(
        coin_balance=user.coin_balance,
        next_settlement=NextSettlementOut(
            sunday=next_sunday,
            boundary_time=get_settings(db).day_boundary_time.strftime("%H:%M"),
            point_b=user.point_b,
            projected_convert=convert,
            projected_carry=carry,
        ),
        transactions=[CoinTransactionOut.model_validate(r) for r in rows],
    )
