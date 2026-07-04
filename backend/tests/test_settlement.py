"""주간 결산 시나리오 — TECH_DESIGN §6-4, §4.3, SPEC §4.0.

470→전환0/이월470, 730→700/30, 500→500/0, 1250→1200/50.
같은 주 2회 실행 시 무변화(멱등). B만 차감·A 불변. 일요일 아님 → 400/no-op.
"""

import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.security import hash_password
from app.models.coin import CoinTransaction, Settlement
from app.models.points import PointTransaction
from app.models.user import User
from app.services.settlement import settle_week, split_conversion

SUNDAY = datetime.date(2026, 6, 14)  # 일요일 (weekday 6)


def _mk_user(db, b=0, a=0):
    u = User(
        username="t_user_settle",
        password_hash=hash_password("x"),
        role="user",
        point_a=a,
        point_b=b,
    )
    db.add(u)
    db.flush()
    return u


def _coin_sum(db, user_id):
    return db.scalar(
        select(func.coalesce(func.sum(CoinTransaction.amount), 0)).where(
            CoinTransaction.user_id == user_id
        )
    )


def _b_ledger_sum(db, user_id):
    return db.scalar(
        select(func.coalesce(func.sum(PointTransaction.amount), 0)).where(
            PointTransaction.user_id == user_id, PointTransaction.kind == "B"
        )
    )


# ── 계산식 단위 검증 ────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("balance", "convert", "carry"),
    [(470, 0, 470), (499, 0, 499), (500, 500, 0), (730, 700, 30), (1250, 1200, 50)],
)
def test_split_conversion(balance, convert, carry):
    assert split_conversion(balance) == (convert, carry)


# ── §6-4: 결산 시나리오 ────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("balance", "convert", "carry"),
    [(470, 0, 470), (730, 700, 30), (500, 500, 0)],
)
def test_settle_scenarios(db_session, balance, convert, carry):
    u = _mk_user(db_session, b=balance, a=77)

    results = settle_week(db_session, sunday=SUNDAY)
    r = next(x for x in results if x.user_id == str(u.id))

    assert (r.converted, r.carried_over) == (convert, carry)
    assert u.point_b == carry  # 이월분만 B에 남는다
    assert u.coin_balance == convert
    assert u.point_a == 77  # A 불변 (B상점은 A와 무관)

    # 원장 검증: 전환 시 B -convert 1행 + 코인 +convert 1행, 미전환이면 0행
    if convert > 0:
        b_rows = db_session.scalars(
            select(PointTransaction).where(
                PointTransaction.user_id == u.id,
                PointTransaction.reason == "settlement_convert",
            )
        ).all()
        assert len(b_rows) == 1 and b_rows[0].kind == "B" and b_rows[0].amount == -convert
        assert _coin_sum(db_session, u.id) == convert == u.coin_balance
    else:
        assert _coin_sum(db_session, u.id) == 0

    # 결산 기록 확정
    s = db_session.scalar(select(Settlement).where(Settlement.user_id == u.id))
    assert (s.converted, s.carried_over) == (convert, carry)
    assert s.iso_year_week == "2026-W24"


def test_settle_idempotent_same_week(db_session):
    u = _mk_user(db_session, b=730)

    settle_week(db_session, sunday=SUNDAY)
    assert u.point_b == 30 and u.coin_balance == 700

    results2 = settle_week(db_session, sunday=SUNDAY)  # 같은 주 재실행
    r2 = next(x for x in results2 if x.user_id == str(u.id))

    assert r2.already_settled is True
    assert u.point_b == 30 and u.coin_balance == 700  # 무변화
    assert _coin_sum(db_session, u.id) == 700  # 코인 원장도 1건뿐
    count = db_session.scalar(
        select(func.count()).select_from(Settlement).where(Settlement.user_id == u.id)
    )
    assert count == 1


def test_settle_rejects_non_sunday(db_session):
    _mk_user(db_session, b=1000)
    with pytest.raises(HTTPException) as exc:
        settle_week(db_session, sunday=datetime.date(2026, 6, 15))  # 월요일
    assert exc.value.status_code == 400


def test_settle_default_noop_when_not_sunday_boundary(db_session):
    """날짜 미지정 + 방금 끝난 날이 일요일이 아니면 조용히 빈 결과 (매일 크론 안전)."""
    u = _mk_user(db_session, b=1000)
    # 테스트 실행일(2026-07-04 기준)의 어제는 금요일 → no-op
    results = settle_week(db_session)
    assert results == [] or all(x.user_id != str(u.id) for x in results)
    assert u.point_b == 1000 and u.coin_balance == 0
