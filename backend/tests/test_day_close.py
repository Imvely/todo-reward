"""하루 마감 크론 시나리오 테스트 — TECH_DESIGN §6-3, §4.6.

완주 보너스·연속 보너스·streak 갱신은 이제 day_close가 담당한다.
- 완주 판정 N=1,2,3 정확 지급 + daily_bonus_log 기록.
- 미완주 / TODO 0개 → 보너스 없음 + streak 0 리셋.
- 멱등: 같은 날 2회 실행해도 무변화.
- streak_reset_days 반영.
- 오래된 미완주일 재실행이 이후 streak을 덮어쓰지 않는다(가드).
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


# ── 완주 판정 N=1,2,3 ──────────────────────────────────────────────────
def test_close_completed_n1(db_session):
    u = _mk_user(db_session)  # streak 0, last None → N=1
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    assert r.completed and not r.already_closed
    assert (r.day_bonus, r.streak_bonus, r.streak) == (10, 0, 1)
    assert u.point_a == 10 and u.point_b == 10  # 완주 10 (미션은 토글에서 별도)
    log = db_session.get(DailyBonusLog, {"user_id": u.id, "due_date": D})
    assert (log.day_bonus, log.streak_bonus, log.streak_n) == (10, 0, 1)
    assert u.current_streak == 1 and u.last_complete_date == D
    _assert_ledger_matches_balance(db_session, u)


def test_close_completed_n2(db_session):
    u = _mk_user(db_session, streak=1, last_complete=DM1)  # → N=2
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    assert (r.day_bonus, r.streak_bonus, r.streak) == (10, 10, 2)
    assert u.point_a == 20 and u.point_b == 20
    _assert_ledger_matches_balance(db_session, u)


def test_close_completed_n3(db_session):
    u = _mk_user(db_session, streak=2, last_complete=DM1)  # → N=3
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    assert (r.day_bonus, r.streak_bonus, r.streak) == (10, 20, 3)
    assert u.point_a == 30 and u.point_b == 30
    _assert_ledger_matches_balance(db_session, u)


# ── 미완주 / TODO 0개 → 보너스 없음 + streak 리셋 ──────────────────────
def test_close_incomplete_resets_streak(db_session):
    u = _mk_user(db_session, streak=5, last_complete=DM1)
    _mk_todo(db_session, u, D, done=True)
    _mk_todo(db_session, u, D, done=False)  # 하나 미완료 → 미완주

    r = close_day_for_user(db_session, u, D)

    assert not r.completed
    assert u.current_streak == 0  # 연속 끊김
    assert u.point_a == 0 and u.point_b == 0  # 보너스 없음
    assert db_session.get(DailyBonusLog, {"user_id": u.id, "due_date": D}) is None


def test_close_zero_todos_breaks_streak(db_session):
    u = _mk_user(db_session, streak=5, last_complete=DM1)
    # 그날 TODO가 하나도 없음 → 완주 불성립 (SPEC §2.3)

    r = close_day_for_user(db_session, u, D)

    assert not r.completed
    assert u.current_streak == 0
    assert db_session.get(DailyBonusLog, {"user_id": u.id, "due_date": D}) is None


# ── 멱등: 같은 날 2회 실행 무변화 ──────────────────────────────────────
def test_close_idempotent(db_session):
    u = _mk_user(db_session)
    _mk_todo(db_session, u, D, done=True)

    r1 = close_day_for_user(db_session, u, D)
    a_after_first = u.point_a
    r2 = close_day_for_user(db_session, u, D)

    assert r1.already_closed is False
    assert r2.already_closed is True
    assert u.point_a == a_after_first  # 이중 지급 없음
    # 원장에 완주 보너스는 A·B 각 1행씩만
    day_rows = db_session.scalars(
        select(PointTransaction).where(
            PointTransaction.user_id == u.id, PointTransaction.reason == "day_complete"
        )
    ).all()
    assert len(day_rows) == 2
    _assert_ledger_matches_balance(db_session, u)


# ── streak_reset_days 반영 ─────────────────────────────────────────────
def test_close_streak_reset_days(db_session):
    s = get_settings(db_session)
    s.streak_reset_days = 3
    db_session.flush()
    # streak 3에서 어제 완주 → 원래 N=4가 되겠지만 4 > 3이라 N=1로 리셋
    u = _mk_user(db_session, streak=3, last_complete=DM1)
    _mk_todo(db_session, u, D, done=True)

    r = close_day_for_user(db_session, u, D)

    assert r.streak == 1
    assert r.streak_bonus == 0  # N=1
    assert u.point_a == 10  # 완주 보너스만
    _assert_ledger_matches_balance(db_session, u)


# ── 가드: 오래된 미완주일 재실행이 이후 streak을 덮어쓰지 않음 ──────────
def test_close_old_miss_does_not_clobber_later_streak(db_session):
    # 사용자가 이미 이후 날짜(D)까지 완주해 streak=1, last_complete=D 상태.
    u = _mk_user(db_session, streak=1, last_complete=D)
    # 이제 과거의 미완주일(DM1)에 대해 close를 (재)실행 → streak을 건드리면 안 된다.
    _mk_todo(db_session, u, DM1, done=False)

    r = close_day_for_user(db_session, u, DM1)

    assert not r.completed
    assert u.current_streak == 1  # 덮어쓰기 방지 (DM1 < last_complete D)
    assert u.last_complete_date == D
