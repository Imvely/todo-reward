"""주간 결산 — 일요일이 끝나는 하루 경계에 B포인트를 코인머니로 캡전환. TECH_DESIGN §4.3.

전환 규칙 (SPEC §4.0):
- 1:1 전환, 최소 500. 잔액 < 500이면 전액 이월.
- 500 이상이면 100 단위로만: convert = balance - (balance % 100), 자투리 이월.
- 이월은 B포인트로 그대로 남는다 (별도 계정 없음).

불변 규칙(CLAUDE.md):
- 멱등: settlements (user_id, iso_year_week) UNIQUE. 이미 있으면 skip.
- B만 차감, A 미접촉. 원장(point/coin) 기록 + 잔액 캐시를 한 트랜잭션에서.
- 자정 하드코딩 금지 — "일요일이 끝나는 경계"는 논리적 날짜로 판정.
"""

import datetime
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.coin import CoinTransaction, Settlement
from app.models.user import User
from app.services.day_boundary import current_logical_date
from app.services.points import record_point

MIN_CONVERT = 500  # 최소 전환 금액
CONVERT_UNIT = 100  # 전환 단위


def split_conversion(balance: int) -> tuple[int, int]:
    """(전환액, 이월액). SPEC §4.0 계산식."""
    if balance < MIN_CONVERT:
        return 0, balance
    convert = balance - (balance % CONVERT_UNIT)
    return convert, balance - convert


def iso_year_week(sunday: datetime.date) -> str:
    """예: '2026-W27'. 결산 대상 일요일의 ISO 연도-주차."""
    iso = sunday.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


@dataclass
class SettleResult:
    user_id: str
    iso_year_week: str
    converted: int
    carried_over: int
    already_settled: bool


def settle_week(db: Session, sunday: datetime.date | None = None) -> list[SettleResult]:
    """일요일 결산 실행. sunday 미지정 시 '방금 끝난 논리적 날짜'가 일요일일 때만 동작.

    크론이 매일 돌아도 안전: 일요일이 아니면 빈 목록, 중복 실행은 UNIQUE로 skip.
    """
    if sunday is None:
        just_ended = current_logical_date(db) - datetime.timedelta(days=1)
        if just_ended.weekday() != 6:  # 6 = 일요일
            return []  # 오늘은 결산일 아님 — 조용히 통과
        sunday = just_ended
    elif sunday.weekday() != 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="결산 대상 날짜는 일요일이어야 합니다",
        )

    week_key = iso_year_week(sunday)
    users = db.scalars(select(User).where(User.role == "user")).all()
    return [_settle_user(db, u, week_key) for u in users]


def _settle_user(db: Session, user: User, week_key: str) -> SettleResult:
    """한 사용자의 주간 결산 (단일 트랜잭션, 멱등)."""
    existing = db.scalar(
        select(Settlement).where(
            Settlement.user_id == user.id, Settlement.iso_year_week == week_key
        )
    )
    if existing is not None:
        # ★ 멱등의 핵심 — 같은 주 재실행은 무변화 (UNIQUE 제약이 최후 방어선).
        return SettleResult(
            user_id=str(user.id),
            iso_year_week=week_key,
            converted=existing.converted,
            carried_over=existing.carried_over,
            already_settled=True,
        )

    balance = user.point_b
    convert, carry = split_conversion(balance)

    settlement = Settlement(
        user_id=user.id,
        iso_year_week=week_key,
        converted=convert,
        carried_over=carry,
    )
    db.add(settlement)
    db.flush()  # settlement.id 확보 (원장 ref_id용)

    if convert > 0:
        # B만 차감 (A 미접촉) + 코인 지급 — 둘 다 원장 기록.
        record_point(db, user, "B", -convert, "settlement_convert", ref_id=settlement.id)
        db.add(
            CoinTransaction(
                user_id=user.id,
                amount=convert,
                reason="settlement",
                ref_id=settlement.id,
            )
        )
        user.coin_balance += convert

    db.commit()
    return SettleResult(
        user_id=str(user.id),
        iso_year_week=week_key,
        converted=convert,
        carried_over=carry,
        already_settled=False,
    )
