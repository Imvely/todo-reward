"""토글 서비스 시나리오 테스트 — TECH_DESIGN §6-1/§6-2, §4.1/§4.2.

토글은 미션 ±5만 즉시 처리한다 (완주·연속 보너스는 day_close 크론 몫 → test_day_close.py).

1. 미션 완료 → A·B 동시 +5, 원장 2행.
2. 토글 OFF → 미션 -5만 정확 회수 (당일 완주 보너스는 미지급이므로 없음).

포인트 로직은 잔액-원장이 항상 일치해야 한다 → 매 검증에서 합계=잔액을 확인한다.
"""

from sqlalchemy import func, select

from app.core.security import hash_password
from app.models.points import DailyBonusLog, PointTransaction
from app.models.todo import Todo
from app.models.user import User
from app.services.day_boundary import current_logical_date
from app.services.toggle import toggle_todo


def _mk_user(db, streak=0, last_complete=None):
    u = User(
        username="t_user_toggle",
        password_hash=hash_password("x"),
        role="user",
        current_streak=streak,
        last_complete_date=last_complete,
    )
    db.add(u)
    db.flush()
    return u


def _mk_todo(db, user, due_date, content="task", order=0):
    t = Todo(user_id=user.id, due_date=due_date, content=content, sort_order=order)
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
    """잔액-원장 정합성 — 불변 규칙의 핵심."""
    assert _ledger_sum(db, user.id, "A") == user.point_a
    assert _ledger_sum(db, user.id, "B") == user.point_b


# ── 시나리오 1: 미션 완료 → A·B 동시 +5, 원장 2행 ──────────────────────
def test_mission_awards_a_and_b_two_ledger_rows(db_session):
    today = current_logical_date(db_session)
    u = _mk_user(db_session)
    t1 = _mk_todo(db_session, u, today, "a", 0)
    _mk_todo(db_session, u, today, "b", 1)

    res = toggle_todo(db_session, u, t1.id)

    assert u.point_a == 5 and u.point_b == 5
    rows = db_session.scalars(
        select(PointTransaction).where(PointTransaction.user_id == u.id)
    ).all()
    assert len(rows) == 2
    assert {r.kind for r in rows} == {"A", "B"}
    assert all(r.reason == "mission" and r.amount == 5 for r in rows)
    assert [a.reason for a in res.awarded] == ["mission"]
    _assert_ledger_matches_balance(db_session, u)


def test_completing_all_todos_gives_no_bonus_at_toggle_time(db_session):
    """마지막 TODO를 완료해도 토글 시점엔 완주 보너스가 없다 (하루 경계 크론 몫)."""
    today = current_logical_date(db_session)
    u = _mk_user(db_session)
    t = _mk_todo(db_session, u, today)  # 유일한 TODO

    res = toggle_todo(db_session, u, t.id)

    assert u.point_a == 5 and u.point_b == 5  # 미션만
    assert [a.reason for a in res.awarded] == ["mission"]
    assert res.streak == 0  # 아직 완주 확정 전
    assert db_session.get(DailyBonusLog, {"user_id": u.id, "due_date": today}) is None
    _assert_ledger_matches_balance(db_session, u)


# ── 시나리오 2: 토글 OFF → 미션 -5만 회수 ──────────────────────────────
def test_toggle_off_revokes_mission_only(db_session):
    today = current_logical_date(db_session)
    u = _mk_user(db_session)
    t = _mk_todo(db_session, u, today)

    toggle_todo(db_session, u, t.id)  # +5
    res = toggle_todo(db_session, u, t.id)  # -5

    assert u.point_a == 0 and u.point_b == 0
    assert [a.reason for a in res.awarded] == ["mission_revoke"]
    assert u.current_streak == 0
    assert t.is_done is False and t.done_at is None
    _assert_ledger_matches_balance(db_session, u)


def test_toggle_rejects_non_today(db_session):
    """과거 날짜 TODO 토글은 403 (캘린더 조회 전용)."""
    import datetime

    from fastapi import HTTPException

    u = _mk_user(db_session)
    past = current_logical_date(db_session) - datetime.timedelta(days=3)
    t = _mk_todo(db_session, u, past)
    try:
        toggle_todo(db_session, u, t.id)
        raise AssertionError("과거 토글이 허용되면 안 된다")
    except HTTPException as exc:
        assert exc.status_code == 403
