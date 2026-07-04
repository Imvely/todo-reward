"""TODO 관련 요청/응답 스키마. TECH_DESIGN §3."""

import datetime
import uuid

from pydantic import BaseModel


class TodoOut(BaseModel):
    """TODO 단건 응답."""

    id: uuid.UUID
    due_date: datetime.date
    content: str
    is_done: bool
    done_at: datetime.datetime | None
    sort_order: int

    model_config = {"from_attributes": True}


class ReorderItem(BaseModel):
    """PATCH /todos/reorder body 원소 — 순서만 변경 (내용 편집 아님)."""

    id: uuid.UUID
    sort_order: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


class PendingOut(BaseModel):
    """다음 하루 경계에 들어올 예정 포인트 (§4.2.1). 서버가 유일한 계산 지점."""

    date: datetime.date
    mission: int
    day_bonus: int
    streak_bonus: int
    total: int  # 지갑당 합계 (A·B 각각)
    boundary_time: str  # 'HH:MM'


class ToggleResponse(BaseModel):
    """PATCH /todos/{id}/toggle 응답. 잔액 불변 — pending이 실시간 표시 근거. TECH_DESIGN §3."""

    todo: TodoOut
    pending: PendingOut
    streak: int
    new_badges: list[str]
    balances: dict[str, int]  # {"point_a": .., "point_b": ..} (토글로는 안 변함)


class AdminTodoCreate(BaseModel):
    """POST /admin/todos — TECH_DESIGN §3."""

    user_id: uuid.UUID
    due_date: datetime.date
    content: str


class AdminTodoUpdate(BaseModel):
    """PATCH /admin/todos/{id} — 내용/날짜 수정. 부분 갱신."""

    content: str | None = None
    due_date: datetime.date | None = None
