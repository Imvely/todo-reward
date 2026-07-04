"""포인트 원장 기록 헬퍼 — 잔액-원장 정합성의 단일 지점.

CLAUDE.md 불변 규칙: 잔액만 갱신하는 코드 금지. 모든 증감은 반드시 이 함수를 거쳐
point_transactions에 행을 남기고 users 잔액 캐시를 함께 갱신한다.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.points import PointTransaction
from app.models.user import User


def record_point(
    db: Session,
    user: User,
    kind: str,
    amount: int,
    reason: str,
    ref_id: uuid.UUID | None = None,
    clamp_nonneg: bool = False,
) -> int:
    """원장 1행 기록 + 잔액 캐시 갱신. 실제 적용된 amount를 반환한다.

    kind: 'A' | 'B'.  amount: 지급 양수 / 회수·차감 음수.
    clamp_nonneg=True: 회수로 잔액이 음수가 될 상황이면 0까지만 회수하고
      원장에는 '실제 회수액'을 기록한다 (TECH_DESIGN §4.2 완화 규칙). 잔액-원장은 계속 일치.
    """
    balance_attr = "point_a" if kind == "A" else "point_b"
    current: int = getattr(user, balance_attr)

    applied = amount
    if clamp_nonneg and current + amount < 0:
        applied = -current  # 0까지만 회수

    if applied == 0:
        return 0  # 0원 거래는 원장에 남기지 않는다 (노이즈 방지)

    db.add(
        PointTransaction(
            user_id=user.id,
            kind=kind,
            amount=applied,
            reason=reason,
            ref_id=ref_id,
        )
    )
    setattr(user, balance_attr, current + applied)
    return applied


def record_both(
    db: Session,
    user: User,
    amount: int,
    reason: str,
    ref_id: uuid.UUID | None = None,
    clamp_nonneg: bool = False,
) -> None:
    """A·B 두 지갑에 같은 양을 동시에 기록한다 (적립·회수 모두 항상 쌍으로).

    SPEC §2.1: 적립은 A·B 정확히 같은 양 동시. 완주/연속/미션 모든 '동시 증감'의 단일 지점.
    """
    record_point(db, user, "A", amount, reason, ref_id=ref_id, clamp_nonneg=clamp_nonneg)
    record_point(db, user, "B", amount, reason, ref_id=ref_id, clamp_nonneg=clamp_nonneg)
