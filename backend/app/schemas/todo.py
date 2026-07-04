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


class AwardItem(BaseModel):
    """토글로 발생한 지급/회수 1건. amount는 지갑당 값(A·B 동일), 회수는 음수."""

    reason: str
    amount: int


class ToggleResponse(BaseModel):
    """PATCH /todos/{id}/toggle 응답 — 클라이언트가 '팡' 연출을 재생할 근거. TECH_DESIGN §3."""

    todo: TodoOut
    awarded: list[AwardItem]
    streak: int
    new_badges: list[str]
    balances: dict[str, int]  # {"point_a": .., "point_b": ..}


class AdminTodoCreate(BaseModel):
    """POST /admin/todos — TECH_DESIGN §3."""

    user_id: uuid.UUID
    due_date: datetime.date
    content: str


class AdminTodoUpdate(BaseModel):
    """PATCH /admin/todos/{id} — 내용/날짜 수정. 부분 갱신."""

    content: str | None = None
    due_date: datetime.date | None = None
