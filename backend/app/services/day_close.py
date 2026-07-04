"""하루 마감 — 그날의 모든 포인트(미션+완주+연속)를 합산 일괄 정산. TECH_DESIGN §4.6.

토글은 포인트를 전혀 만지지 않으므로(§4.1/§4.2) 여기가 유일한 지급 지점이다.
근거: 실시간 지급은 "지급→소비→취소(회수 불가)→재완료→재지급" 무한 생성 구멍이 있었다
(2026-07-04 발견). 마감 시점의 최종 상태만 정산하면 원천 차단된다.

불변 규칙(CLAUDE.md):
- 모든 증감은 record_both()로 원장에 남긴다.
- 지급은 단일 트랜잭션(사용자별) 안에서.
- 멱등: daily_bonus_log (user_id, due_date) PK. 마감한 날마다 행을 남긴다(완주 여부 무관).
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

MISSION_POINT = 5  # 미션 1개당 (A·B 각각)
DAY_COMPLETE_BONUS = 10  # 완주 보너스
STREAK_UNIT = 10  # 연속 보너스 단위 → 10×(N-1)


@dataclass
class CloseResult:
    user_id: str
    target_date: datetime.date
    completed: bool  # 그날 완주 여부
    already_closed: bool  # 멱등 skip (이미 마감된 날)
    streak: int  # 처리 후 current_streak
    mission_points: int  # 지급한 미션 포인트 합 (지갑당)
    day_bonus: int  # 지급한 완주 보너스 (지갑당)
    streak_bonus: int  # 지급한 연속 보너스 (지갑당)


@dataclass
class Pending:
    """다음 하루 경계에 들어올 예정 포인트 (§4.2.1). 예상치 — 확정은 close_day가 한다."""

    date: datetime.date
    mission: int
    day_bonus: int
    streak_bonus: int
    total: int  # 지갑당 합계 (A·B 각각 이만큼)
    boundary_time: str  # 'HH:MM' — 클라이언트 안내 문구용


def _counts(db: Session, user_id, due_date: datetime.date) -> tuple[int, int]:
    """(완료 수, 전체 수)."""
    total = db.scalar(
        select(func.count())
        .select_from(Todo)
        .where(Todo.user_id == user_id, Todo.due_date == due_date)
    )
    done = db.scalar(
        select(func.count())
        .select_from(Todo)
        .where(Todo.user_id == user_id, Todo.due_date == due_date, Todo.is_done.is_(True))
    )
    return done or 0, total or 0


def _next_streak(db: Session, user: User, target_date: datetime.date) -> int:
    """target_date에 완주가 확정될 때의 N (TECH_DESIGN §4.6-4a, reset_days 반영)."""
    yesterday = target_date - datetime.timedelta(days=1)
    n = user.current_streak + 1 if user.last_complete_date == yesterday else 1
    reset_days = get_settings(db).streak_reset_days
    if reset_days is not None and n > reset_days:
        n = 1  # 리셋 주기 초과 → 1일째부터 다시
    return n


def compute_pending(db: Session, user: User, target_date: datetime.date | None = None) -> Pending:
    """오늘(논리적) 기준, 다음 경계에 들어올 예정 포인트 계산. 서버가 유일한 계산 지점."""
    if target_date is None:
        target_date = current_logical_date(db)
    done, total = _counts(db, user.id, target_date)
    mission = MISSION_POINT * done
    if total > 0 and done == total:
        n = _next_streak(db, user, target_date)
        day_bonus = DAY_COMPLETE_BONUS
        streak_bonus = STREAK_UNIT * (n - 1)
    else:
        day_bonus = 0
        streak_bonus = 0
    boundary = get_settings(db).day_boundary_time.strftime("%H:%M")
    return Pending(
        date=target_date,
        mission=mission,
        day_bonus=day_bonus,
        streak_bonus=streak_bonus,
        total=mission + day_bonus + streak_bonus,
        boundary_time=boundary,
    )


def close_day(db: Session, target_date: datetime.date | None = None) -> list[CloseResult]:
    """대상 날짜를 role='user' 전원에 대해 정산한다. 기본 = 방금 끝난 논리적 날짜(어제)."""
    if target_date is None:
        target_date = current_logical_date(db) - datetime.timedelta(days=1)

    users = db.scalars(select(User).where(User.role == "user")).all()
    return [close_day_for_user(db, user, target_date) for user in users]


def close_day_for_user(db: Session, user: User, target_date: datetime.date) -> CloseResult:
    """한 사용자의 target_date 정산 (단일 트랜잭션, 멱등). 마감은 그날의 최종 확정."""
    # 멱등: 이미 마감된 날이면 아무 것도 하지 않는다.
    if db.get(DailyBonusLog, {"user_id": user.id, "due_date": target_date}) is not None:
        return CloseResult(
            user_id=str(user.id),
            target_date=target_date,
            completed=False,
            already_closed=True,
            streak=user.current_streak,
            mission_points=0,
            day_bonus=0,
            streak_bonus=0,
        )

    done, total = _counts(db, user.id, target_date)
    completed = total > 0 and done == total

    # 1) 미션 포인트 — 완주 여부와 무관하게 완료한 만큼 지급.
    mission = MISSION_POINT * done
    if mission > 0:
        record_both(db, user, mission, "mission", None)

    # 2) 완주·연속 보너스 + streak 갱신.
    if completed:
        n = _next_streak(db, user, target_date)
        day_bonus = DAY_COMPLETE_BONUS
        streak_bonus = STREAK_UNIT * (n - 1)
        record_both(db, user, day_bonus, "day_complete", None)
        if streak_bonus > 0:
            record_both(db, user, streak_bonus, "streak", None)
        user.current_streak = n
        user.last_complete_date = target_date
    else:
        n = 0
        day_bonus = 0
        streak_bonus = 0
        # 연속 끊김 (SPEC §2.3). 과거 날짜 재실행이 이후 streak을 덮어쓰지 않게 가드.
        if user.last_complete_date is None or target_date > user.last_complete_date:
            user.current_streak = 0

    # 3) 정산 기록 — 항상 남긴다 (멱등 키 + 감사).
    db.add(
        DailyBonusLog(
            user_id=user.id,
            due_date=target_date,
            mission_points=mission,
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
        completed=completed,
        already_closed=False,
        streak=user.current_streak,
        mission_points=mission,
        day_bonus=day_bonus,
        streak_bonus=streak_bonus,
    )
