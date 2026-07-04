"""TODO 조회/정렬 라우터 (사용자 관점). TECH_DESIGN §3.

라우터는 얇게 유지한다 — 포인트 계산 로직은 넣지 않는다 (CLAUDE.md 불변 규칙).
조회/정렬은 포인트를 건드리지 않으므로 여기서 직접 처리한다.
"""

import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.todo import Todo
from app.models.user import User
from app.schemas.todo import PendingOut, ReorderRequest, TodoOut, ToggleResponse
from app.services.day_boundary import current_logical_date
from app.services.day_close import compute_pending
from app.services.toggle import toggle_todo
from app.services.users import resolve_todo_owner

router = APIRouter(tags=["todos"])


def _pending_out(p) -> PendingOut:
    return PendingOut(
        date=p.date,
        mission=p.mission,
        day_bonus=p.day_bonus,
        streak_bonus=p.streak_bonus,
        total=p.total,
        boundary_time=p.boundary_time,
    )


@router.patch("/todos/{todo_id}/toggle", response_model=ToggleResponse)
def toggle(
    todo_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ToggleResponse:
    """완료 토글. 오늘 것만 허용. 잔액 불변 — 지급은 하루 마감(§4.6)이 한다.

    응답의 pending/new_badges만이 클라이언트 표시의 근거다 (클라이언트 자체 계산 금지).
    """
    result = toggle_todo(db, user, todo_id)
    return ToggleResponse(
        todo=TodoOut.model_validate(result.todo),
        pending=_pending_out(result.pending),
        streak=result.streak,
        new_badges=result.new_badges,
        balances=result.balances,
    )


@router.get("/points/pending", response_model=PendingOut)
def get_pending(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PendingOut:
    """다음 하루 경계에 들어올 예정 포인트 (§4.2.1). 관리자는 관리 대상 사용자 기준."""
    owner = resolve_todo_owner(db, user)
    return _pending_out(compute_pending(db, owner))


@router.get("/todos", response_model=list[TodoOut])
def list_todos(
    date: datetime.date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Todo]:
    """해당 날짜의 TODO 목록 (기본: 논리적 오늘). 사용자·관리자 모두 조회 가능.

    2인 구조(사용자 1 + 관리자 1)이므로 대상은 항상 '사용자' 계정의 목록이다
    (SPEC §5: 캘린더/오늘 목록은 두 역할 모두 조회 O).
    """
    target_date = date if date is not None else current_logical_date(db)
    owner = resolve_todo_owner(db, user)
    rows = db.scalars(
        select(Todo)
        .where(Todo.user_id == owner.id, Todo.due_date == target_date)
        .order_by(Todo.sort_order, Todo.created_at)
    ).all()
    return list(rows)


@router.patch("/todos/reorder", response_model=list[TodoOut])
def reorder_todos(
    body: ReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Todo]:
    """드래그앤드롭 정렬 — 순서(sort_order)만 일괄 변경. 내용 편집 아님 (SPEC §6.1).

    사용자 전용. 본인 소유의 오늘 TODO만 재정렬할 수 있다
    (과거/미래 정렬은 무의미하고, 캘린더는 조회 전용).
    """
    if user.role != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="정렬은 사용자만 할 수 있습니다",
        )

    order_by_id: dict[uuid.UUID, int] = {item.id: item.sort_order for item in body.items}
    if not order_by_id:
        return []

    today = current_logical_date(db)
    rows = db.scalars(
        select(Todo).where(
            Todo.id.in_(order_by_id.keys()),
            Todo.user_id == user.id,
            Todo.due_date == today,
        )
    ).all()

    # 요청한 id 중 하나라도 본인 소유의 오늘 TODO가 아니면 전체 거부 (부분 적용 방지).
    if len(rows) != len(order_by_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="본인의 오늘 TODO만 정렬할 수 있습니다",
        )

    for todo in rows:
        todo.sort_order = order_by_id[todo.id]
    db.commit()

    updated = db.scalars(
        select(Todo)
        .where(Todo.user_id == user.id, Todo.due_date == today)
        .order_by(Todo.sort_order, Todo.created_at)
    ).all()
    return list(updated)
