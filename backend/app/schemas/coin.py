"""코인머니/적립 통장 스키마. TECH_DESIGN §3 GET /coins."""

import datetime

from pydantic import BaseModel


class CoinTransactionOut(BaseModel):
    id: int
    amount: int  # 전환 양수 / 출금 음수
    reason: str  # 'settlement' | 'withdraw'
    memo: str | None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class NextSettlementOut(BaseModel):
    """다음 일요일 결산 예고 — 예상 전환액은 서버가 계산한다 (클라 자체 계산 금지)."""

    sunday: datetime.date  # 결산 대상 일요일
    boundary_time: str  # 'HH:MM' — "일요일이 끝나는" 경계 시각 (툴팁 안내용)
    point_b: int  # 현재 B 잔액
    projected_convert: int  # 지금 잔액 기준 전환될 코인머니
    projected_carry: int  # 이월될 자투리


class CoinsResponse(BaseModel):
    coin_balance: int
    next_settlement: NextSettlementOut
    transactions: list[CoinTransactionOut]
