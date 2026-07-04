"""하루 마감 정산 테스트 — TECH_DESIGN §6-3, §4.6.

미션 포인트를 포함한 그날의 모든 포인트가 여기서만, 한 번에 지급된다.
- 완주: 미션 합계 + 완주 + 연속 (N=1,2,3) 정확 지급 + daily_bonus_log(미션 포함).
- 부분 완료: 미션만 지급 + streak 0 리셋.
- TODO 0개: 지급 0 + streak 리셋.
- 멱등: 같은 날 2회 실행 무변화 (미완주 날 포함 — 모든 날에 로그 행).
- streak_reset_days 반영, 과거 재실행 가드.
"""

import datetime

from sqlalchemy import func, select

from app.core.security import hash_password
from app.models.points import DailyBonusLog, PointTransaction
from app.models.todo import Todo
from app.models.user import User
from app.services.day_boundary import get_settings
from app.services.day_close import close_day_for_user

D = datetime.date(2026, 6, 10)  # 대상일
DM1 = D - datetime.timedelta(days=1)  # 어제


def _mk_user(db, streak=0, last_complete=None):
    u = User(
        username="t_user_close",
        password_hash=hash_password("x"),
        role="user",
        current_streak=streak,
        last_complete_date=last_complete,
    )
    db.add(u)
    db.flush()
    return u


def _mk_todo(db, user, due_date, done=False, content="task"):
    t = Todo(user_id=user.id, due_date=due_date, content=content, is_done=done)
    db.add(t)
    db.flush()
    return t


def _ledger_sum(db, user_id, kind):
    return db.scalar(
        select(func.coalesce(func.sum(PointTransaction.amount), 0)).where(
            PointTransaction.user_id == user_id, PointTransaction.kind == kind
        )
    )


def _assert_ledger_matches_balance(db, user):
    assert _ledger_sum(db, user.id, "A") == user.point_a
    assert _ledger_sum(db, user.id, "B") == user.point_b


# ── 완주: 미션+완주+연속 합산 지급 (N=1,2,3) ──────────────────────────
def test_close_completed_n1_includes_missions(db_session):
    u = _mk_user(db_session)  # → N=1
    _mk_todo(db_session, u, D, done=True)
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    # 미션 2×5=10 + 완주 10 + 연속 0 = 20
    assert (r.mission_points, r.day_bonus, r.streak_bonus, r.streak) == (10, 10, 0, 1)
    assert u.point_a == 20 and u.point_b == 20
    log = db_session.get(DailyBonusLog, {"user_id": u.id, "due_date": D})
    assert (log.mission_points, log.day_bonus, log.streak_bonus, log.streak_n) == (10, 10, 0, 1)
    assert u.last_complete_date == D
    _assert_ledger_matches_balance(db_session, u)


def test_close_completed_n2(db_session):
    u = _mk_user(db_session, streak=1, last_complete=DM1)  # → N=2
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    # 미션 5 + 완주 10 + 연속 10 = 25
    assert (r.mission_points, r.day_bonus, r.streak_bonus, r.streak) == (5, 10, 10, 2)
    assert u.point_a == 25 and u.point_b == 25
    _assert_ledger_matches_balance(db_session, u)


def test_close_completed_n3(db_session):
    u = _mk_user(db_session, streak=2, last_complete=DM1)  # → N=3
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    # 미션 5 + 완주 10 + 연속 20 = 35
    assert (r.mission_points, r.day_bonus, r.streak_bonus, r.streak) == (5, 10, 20, 3)
    assert u.point_a == 35 and u.point_b == 35
    _assert_ledger_matches_balance(db_session, u)


# ── 부분 완료: 미션만 + streak 리셋 ────────────────────────────────────
def test_close_partial_pays_missions_only(db_session):
    u = _mk_user(db_session, streak=5, last_complete=DM1)
    _mk_todo(db_session, u, D, done=True)
    _mk_todo(db_session, u, D, done=True)
    _mk_todo(db_session, u, D, done=False)  # 하나 미완료

    r = close_day_for_user(db_session, u, D)

    assert not r.completed
    assert (r.mission_points, r.day_bonus, r.streak_bonus) == (10, 0, 0)
    assert u.point_a == 10 and u.point_b == 10  # 미션만
    assert u.current_streak == 0  # 연속 끊김
    log = db_session.get(DailyBonusLog, {"user_id": u.id, "due_date": D})
    assert log is not None and log.mission_points == 10 and log.streak_n == 0
    _assert_ledger_matches_balance(db_session, u)


def test_close_zero_todos(db_session):
    u = _mk_user(db_session, streak=5, last_complete=DM1)

    r = close_day_for_user(db_session, u, D)

    assert not r.completed
    assert u.point_a == 0 and u.current_streak == 0
    # 지급 0이어도 멱등 키(로그 행)는 남는다
    assert db_session.get(DailyBonusLog, {"user_id": u.id, "due_date": D}) is not None
    # 0원 거래는 원장에 남기지 않는다
    assert _ledger_sum(db_session, u.id, "A") == 0


# ── 멱등: 완주 날 + 미완주 날 모두 2회 실행 무변화 ─────────────────────
def test_close_idempotent_completed(db_session):
    u = _mk_user(db_session)
    _mk_todo(db_session, u, D, done=True)

    close_day_for_user(db_session, u, D)
    a1 = u.point_a
    r2 = close_day_for_user(db_session, u, D)

    assert r2.already_closed is True
    assert u.point_a == a1
    mission_rows = db_session.scalars(
        select(PointTransaction).where(
            PointTransaction.user_id == u.id, PointTransaction.reason == "mission"
        )
    ).all()
    assert len(mission_rows) == 2  # A·B 각 1행뿐
    _assert_ledger_matches_balance(db_session, u)


def test_close_idempotent_partial(db_session):
    """미완주 날도 로그 행이 남아 재실행 시 이중 지급이 없다."""
    u = _mk_user(db_session)
    _mk_todo(db_session, u, D, done=True)
    _mk_todo(db_session, u, D, done=False)

    close_day_for_user(db_session, u, D)
    assert u.point_a == 5
    r2 = close_day_for_user(db_session, u, D)

    assert r2.already_closed is True
    assert u.point_a == 5  # 그대로
    _assert_ledger_matches_balance(db_session, u)


# ── streak_reset_days / 과거 재실행 가드 ───────────────────────────────
def test_close_streak_reset_days(db_session):
    s = get_settings(db_session)
    s.streak_reset_days = 3
    db_session.flush()
    u = _mk_user(db_session, streak=3, last_complete=DM1)  # N=4 → 3 초과 → N=1
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    assert r.streak == 1 and r.streak_bonus == 0
    assert u.point_a == 15  # 미션 5 + 완주 10
    _assert_ledger_matches_balance(db_session, u)


def test_close_old_miss_does_not_clobber_later_streak(db_session):
    u = _mk_user(db_session, streak=1, last_complete=D)  # 이미 D까지 완주함
    _mk_todo(db_session, u, DM1, done=False)  # 과거 미완주일 재실행

    r = close_day_for_user(db_session, u, DM1)

    assert not r.completed
    assert u.current_streak == 1  # 덮어쓰기 방지
    assert u.last_complete_date == D
