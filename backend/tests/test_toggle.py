"""토글 서비스 테스트 — TECH_DESIGN §6-1/§6-2, §4.1/§4.2.

핵심: 토글은 잔액·원장을 절대 변경하지 않는다. 포인트는 하루 마감(§4.6)이 일괄 지급.
"ON→OFF→ON" 반복(과거 무한 생성 버그 시나리오)에도 원장은 0행이어야 한다.
pending(예정 포인트)은 토글마다 정확히 갱신된다.
"""

import datetime

from sqlalchemy import func, select

from app.core.security import hash_password
from app.models.points import PointTransaction
from app.models.todo import Todo
from app.models.user import User
from app.services.day_boundary import current_logical_date
from app.services.toggle import toggle_todo


def _mk_user(db, streak=0, last_complete=None, a=0, b=0):
    u = User(
        username="t_user_toggle",
        password_hash=hash_password("x"),
        role="user",
        current_streak=streak,
        last_complete_date=last_complete,
        point_a=a,
        point_b=b,
    )
    db.add(u)
    db.flush()
    return u


def _mk_todo(db, user, due_date, content="task", order=0):
    t = Todo(user_id=user.id, due_date=due_date, content=content, sort_order=order)
    db.add(t)
    db.flush()
    return t


def _ledger_count(db, user_id):
    return db.scalar(
        select(func.count())
        .select_from(PointTransaction)
        .where(PointTransaction.user_id == user_id)
    )


# ── §6-1: 토글은 잔액·원장 완전 불변 ────────────────────────────────────
def test_toggle_on_changes_no_points(db_session):
    today = current_logical_date(db_session)
    u = _mk_user(db_session)
    t1 = _mk_todo(db_session, u, today, "a", 0)
    _mk_todo(db_session, u, today, "b", 1)

    res = toggle_todo(db_session, u, t1.id)

    assert res.todo.is_done is True
    assert u.point_a == 0 and u.point_b == 0  # 잔액 불변
    assert _ledger_count(db_session, u.id) == 0  # 원장 0행
    assert res.balances == {"point_a": 0, "point_b": 0}


def test_toggle_spam_creates_no_points(db_session):
    """과거 버그 시나리오: ON→OFF 반복 — 원장 0행, 잔액 그대로."""
    today = current_logical_date(db_session)
    u = _mk_user(db_session, a=7, b=7)  # 기존 잔액이 있어도
    t = _mk_todo(db_session, u, today)

    for _ in range(5):
        toggle_todo(db_session, u, t.id)  # ON
        toggle_todo(db_session, u, t.id)  # OFF

    assert u.point_a == 7 and u.point_b == 7  # 한 푼도 안 변함
    assert _ledger_count(db_session, u.id) == 0


# ── §6-2: pending이 토글마다 정확히 갱신 ────────────────────────────────
def test_pending_updates_with_toggles(db_session):
    today = current_logical_date(db_session)
    u = _mk_user(db_session)  # streak 0 → 완주 시 N=1
    t1 = _mk_todo(db_session, u, today, "a", 0)
    t2 = _mk_todo(db_session, u, today, "b", 1)

    r1 = toggle_todo(db_session, u, t1.id)  # 1/2 완료
    assert (r1.pending.mission, r1.pending.day_bonus, r1.pending.streak_bonus) == (5, 0, 0)
    assert r1.pending.total == 5

    r2 = toggle_todo(db_session, u, t2.id)  # 2/2 완주 예정
    assert (r2.pending.mission, r2.pending.day_bonus, r2.pending.streak_bonus) == (10, 10, 0)
    assert r2.pending.total == 20

    r3 = toggle_todo(db_session, u, t2.id)  # 하나 취소 → 완주 예정 해제
    assert r3.pending.total == 5


def test_pending_projects_streak_bonus(db_session):
    """어제 완주(streak 2) 상태에서 오늘 완주 예정 → N=3 예상, 연속 +20."""
    today = current_logical_date(db_session)
    yesterday = today - datetime.timedelta(days=1)
    u = _mk_user(db_session, streak=2, last_complete=yesterday)
    t = _mk_todo(db_session, u, today)

    r = toggle_todo(db_session, u, t.id)
    assert (r.pending.mission, r.pending.day_bonus, r.pending.streak_bonus) == (5, 10, 20)
    assert r.pending.total == 35
    assert r.pending.boundary_time  # 'HH:MM' 안내 문자열 존재


# ── 가드: 오늘 것만 토글 가능 ──────────────────────────────────────────
def test_toggle_rejects_non_today(db_session):
    from fastapi import HTTPException

    u = _mk_user(db_session)
    past = current_logical_date(db_session) - datetime.timedelta(days=3)
    t = _mk_todo(db_session, u, past)
    try:
        toggle_todo(db_session, u, t.id)
        raise AssertionError("과거 토글이 허용되면 안 된다")
    except HTTPException as exc:
        assert exc.status_code == 403
