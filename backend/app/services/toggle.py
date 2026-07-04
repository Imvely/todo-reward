"""TODO 완료 토글 서비스 — 완료 표시만 바꾼다. 포인트는 만지지 않는다.

TECH_DESIGN §4.1/§4.2: 미션·완주·연속 모든 포인트는 하루 마감(§4.6)이
마감 시점의 최종 상태로 합산 일괄 지급한다. 토글은 잔액·원장을 절대 변경하지 않는다.
(실시간 지급의 "소비 후 취소-재완료" 무한 생성 버그 차단 — 2026-07-04 결정)

응답에는 pending(다음 경계에 들어올 예정 포인트, §4.2.1)을 실어
클라이언트가 실시간 예정 금액을 표시할 근거를 준다 (자체 계산 금지).
"""

import datetime
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.todo import Todo
from app.models.user import User
from app.services.day_boundary import current_logical_date
from app.services.day_close import Pending, compute_pending


@dataclass
class ToggleResult:
    todo: Todo
    pending: Pending  # 다음 경계에 들어올 예정 포인트 (실시간 갱신 근거)
    streak: int
    new_badges: list[str]
    balances: dict[str, int]  # 토글로는 변하지 않는다 — 표시 동기화용


def toggle_todo(db: Session, user: User, todo_id) -> ToggleResult:
    """완료 토글. 현재 상태를 뒤집는다. 사용자 전용, '오늘'(논리적) TODO만 허용."""
    if user.role != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="완료 토글은 사용자만 할 수 있습니다",
        )

    todo = db.get(Todo, todo_id)
    if todo is None or todo.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TODO를 찾을 수 없습니다")

    today = current_logical_date(db)
    if todo.due_date != today:
        # 과거/미래 토글 차단 — 캘린더는 조회 전용 (SPEC §6.1.1).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="오늘의 TODO만 완료 토글할 수 있습니다",
        )

    if todo.is_done:
        todo.is_done = False
        todo.done_at = None
    else:
        todo.is_done = True
        todo.done_at = datetime.datetime.now(datetime.UTC)

    db.commit()
    db.refresh(todo)
    return ToggleResult(
        todo=todo,
        pending=compute_pending(db, user, today),
        streak=user.current_streak,
        new_badges=[],  # 뱃지 판정은 Phase 5 (TECH_DESIGN §4.4)에서 추가
        balances={"point_a": user.point_a, "point_b": user.point_b},
    )
