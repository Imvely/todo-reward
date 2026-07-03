"""인증 관련 요청/응답 스키마. TECH_DESIGN §3."""

import datetime
import uuid

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    """GET /me — 내 정보 + 포인트/코인 잔액 + 연속 일수."""

    id: uuid.UUID
    username: str
    role: str
    point_a: int
    point_b: int
    coin_balance: int
    current_streak: int
    last_complete_date: datetime.date | None

    model_config = {"from_attributes": True}
