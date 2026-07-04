"""하루 마감 — 완주 판정 + 완주·연속 보너스 지급. TECH_DESIGN §4.6 (SPEC §2.2/§2.3).

토글은 미션 ±5만 처리하므로 완주·연속 보너스의 유일한 지급 지점이 여기다.
하루 경계에 도는 크론이 "방금 끝난 논리적 날짜"를 대상으로 호출한다.

불변 규칙(CLAUDE.md):
- 모든 증감은 record_both()로 원장에 남긴다.
- 지급은 단일 트랜잭션(사용자별) 안에서.
- 멱등: daily_bonus_log (user_id, due_date) PK로 이중 지급 차단.
- 자정 하드코딩 금지 — 기본 대상일은 current_logical_date 기준으로 계산.
"""

import datetime
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.points import DailyBonusLog
from app.models.todo import Todo
from app.models.user import User
from app.services.day_boundary import current_logical_date, get_settings
from app.services.points import record_both

DAY_COMPLETE_BONUS = 10  # 완주 보너스
STREAK_UNIT = 10  # 연속 보너스 단위 → 10×(N-1)


@dataclass
class CloseResult:
    user_id: str
    target_date: datetime.date
    completed: bool  # 그날 완주 여부
    already_closed: bool  # 멱등 skip (이미 마감된 날)
    streak: int  # 처리 후 current_streak
    day_bonus: int  # 지급한 완주 보너스 (지갑당)
    streak_bonus: int  # 지급한 연속 보너스 (지갑당)


def close_day(db: Session, target_date: datetime.date | None = None) -> list[CloseResult]:
    """대상 날짜의 완주 판정·보너스를 role='user' 전원에 대해 수행한다.

    target_date 기본값 = 방금 끝난 논리적 날짜(= 현재 논리적 오늘 - 1일).
    하루 경계 직후 크론이 호출하는 것을 가정한다.
    """
    if target_date is None:
        target_date = current_logical_date(db) - datetime.timedelta(days=1)

    users = db.scalars(select(User).where(User.role == "user")).all()
    return [close_day_for_user(db, user, target_date) for user in users]


def close_day_for_user(db: Session, user: User, target_date: datetime.date) -> CloseResult:
    """한 사용자의 target_date 완주 판정·보너스 지급 (단일 트랜잭션, 멱등)."""
    # 멱등: 이미 마감(완주 지급)된 날이면 아무 것도 하지 않는다.
    if db.get(DailyBonusLog, {"user_id": user.id, "due_date": target_date}) is not None:
        return CloseResult(
            user_id=str(user.id),
            target_date=target_date,
            completed=True,
            already_closed=True,
            streak=user.current_streak,
            day_bonus=0,
            streak_bonus=0,
        )

    total = db.scalar(
        select(func.count())
        .select_from(Todo)
        .where(Todo.user_id == user.id, Todo.due_date == target_date)
    )
    remaining = db.scalar(
        select(func.count())
        .select_from(Todo)
        .where(
            Todo.user_id == user.id,
            Todo.due_date == target_date,
            Todo.is_done.is_(False),
        )
    )
    completed = total > 0 and remaining == 0

    if not completed:
        # 완주 못한 날(또는 TODO 0개) → 연속 끊김 (SPEC §2.3).
        # 단, 이 미완주일이 마지막 완주일보다 뒤일 때만 리셋 (오래된 날 재실행이
        # 이후 완주로 쌓인 streak을 덮어쓰지 않도록).
        if user.last_complete_date is None or target_date > user.last_complete_date:
            user.current_streak = 0
        db.commit()
        db.refresh(user)
        return CloseResult(
            user_id=str(user.id),
            target_date=target_date,
            completed=False,
            already_closed=False,
            streak=user.current_streak,
            day_bonus=0,
            streak_bonus=0,
        )

    # 완주 — 연속 계산 (TECH_DESIGN §4.1a 로직을 여기로 이관)
    yesterday = target_date - datetime.timedelta(days=1)
    n = user.current_streak + 1 if user.last_complete_date == yesterday else 1
    reset_days = get_settings(db).streak_reset_days
    if reset_days is not None and n > reset_days:
        n = 1  # 리셋 주기 초과 → 1일째부터 다시

    day_bonus = DAY_COMPLETE_BONUS
    streak_bonus = STREAK_UNIT * (n - 1)

    record_both(db, user, day_bonus, "day_complete", None)
    if streak_bonus > 0:
        record_both(db, user, streak_bonus, "streak", None)

    user.current_streak = n
    user.last_complete_date = target_date
    db.add(
        DailyBonusLog(
            user_id=user.id,
            due_date=target_date,
            day_bonus=day_bonus,
            streak_bonus=streak_bonus,
            streak_n=n,
        )
    )
    db.commit()
    db.refresh(user)
    return CloseResult(
        user_id=str(user.id),
        target_date=target_date,
        completed=True,
        already_closed=False,
        streak=n,
        day_bonus=day_bonus,
        streak_bonus=streak_bonus,
    )
