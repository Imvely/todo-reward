"""TODO 완료 토글 서비스 — 미션 포인트만 즉시 처리. TECH_DESIGN §4.1(ON) / §4.2(OFF).

★ 완주·연속 보너스는 여기서 지급하지 않는다. 그날 완주 여부는 하루 경계에
   day_close 크론(§4.6)이 한 번 판정·지급한다 (SPEC §2.2/§2.3).
   → 낮 동안 관리자가 TODO를 추가/수정/삭제해도 미리 준 보너스를 회수할 일이 없다.

불변 규칙(CLAUDE.md):
- 모든 증감은 record_point()로 원장에 남긴다 (잔액만 갱신 금지).
- A 차감은 B를 건드리지 않고 그 역도 같다. 단 적립은 A·B 동시, 정확히 같은 양.
- 자정 하드코딩 금지 — '오늘'은 current_logical_date(settings 기준).
- 한 토글 = 한 트랜잭션(자체 commit).
"""

import datetime
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.todo import Todo
from app.models.user import User
from app.services.day_boundary import current_logical_date
from app.services.points import record_both

MISSION_POINT = 5  # 미션 1개 완료 (A·B 각각)


@dataclass
class Award:
    """클라이언트 '팡' 연출 근거. amount는 지갑당 값(A·B 동일). 회수는 음수."""

    reason: str
    amount: int


@dataclass
class ToggleResult:
    todo: Todo
    awarded: list[Award]
    streak: int
    new_badges: list[str]
    balances: dict[str, int]  # {"point_a": .., "point_b": ..}


def toggle_todo(db: Session, user: User, todo_id) -> ToggleResult:
    """완료 토글. 현재 상태를 뒤집는다: 미완료→ON(§4.1), 완료→OFF(§4.2). 미션 ±5만.

    사용자 전용, '오늘'(논리적) TODO만 허용. 본인 소유가 아니면 404/403.
    """
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
        awarded = _toggle_off(db, user, todo)
    else:
        awarded = _toggle_on(db, user, todo)

    db.commit()
    db.refresh(todo)
    db.refresh(user)
    return ToggleResult(
        todo=todo,
        awarded=awarded,
        streak=user.current_streak,
        new_badges=[],  # 뱃지 판정은 Phase 5 (TECH_DESIGN §4.4)에서 추가
        balances={"point_a": user.point_a, "point_b": user.point_b},
    )


def _toggle_on(db: Session, user: User, todo: Todo) -> list[Award]:
    """§4.1: 미션 +5(A·B) 즉시 지급. 완주 보너스는 하루 경계 크론(§4.6) 몫."""
    todo.is_done = True
    todo.done_at = datetime.datetime.now(datetime.UTC)
    record_both(db, user, MISSION_POINT, "mission", todo.id)
    return [Award("mission", MISSION_POINT)]


def _toggle_off(db: Session, user: User, todo: Todo) -> list[Award]:
    """§4.2: 미션 -5(A·B) 회수. 당일 완주 보너스는 미지급이므로 회수할 것 없음."""
    todo.is_done = False
    todo.done_at = None
    record_both(db, user, -MISSION_POINT, "mission_revoke", todo.id, clamp_nonneg=True)
    return [Award("mission_revoke", -MISSION_POINT)]
