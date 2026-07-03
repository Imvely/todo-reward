"""하루 경계 시각 기반 "논리적 날짜" 계산 — 모든 날짜 판정의 단일 지점.

SPEC §2.3: 관리자가 정한 경계 시각이 하루의 시작/끝을 정한다.
예) 경계 09:00이면 하루는 "오전 9시 ~ 다음 날 오전 9시".
    → 로컬 08:59는 아직 어제, 09:00은 오늘.
이 경계는 연속 판정·완주 판정·일요일 결산에 일관되게 적용된다 (TECH_DESIGN §2 원칙3, §4.1).

자정('00:00') 하드코딩 금지 (CLAUDE.md 불변 규칙). 항상 settings 값을 참조한다.
"""

import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import Settings


def logical_date(
    now: datetime.datetime,
    boundary_time: datetime.time,
    tz_name: str,
) -> datetime.date:
    """주어진 시점이 속하는 "논리적 날짜"를 반환한다.

    now: 타임존 인식(aware) datetime. UTC 등 어떤 tz든 무방 — 내부에서 tz_name으로 변환한다.
    boundary_time: 하루 경계 시각 (settings.day_boundary_time).
    tz_name: 판정에 쓸 타임존 (settings.timezone).

    로직: 로컬 시각에서 경계 시각만큼 뒤로 민 뒤 날짜를 취한다.
    경계 이전 시각은 하루 앞 날짜로, 경계 이후는 당일로 떨어진다. 경계 00:00이면 로컬 날짜 그대로.
    """
    if now.tzinfo is None:
        raise ValueError("logical_date는 타임존 인식(aware) datetime을 요구한다")

    local = now.astimezone(ZoneInfo(tz_name))
    offset = datetime.timedelta(
        hours=boundary_time.hour,
        minutes=boundary_time.minute,
        seconds=boundary_time.second,
    )
    return (local - offset).date()


def get_settings(db: Session) -> Settings:
    """settings 싱글턴 행(id=1)을 반환. 없으면 예외 — 마이그레이션에서 항상 생성된다."""
    settings = db.scalar(select(Settings).where(Settings.id == 1))
    if settings is None:
        raise RuntimeError("settings 싱글턴 행이 없다 (마이그레이션 미적용?)")
    return settings


def current_logical_date(
    db: Session,
    now: datetime.datetime | None = None,
) -> datetime.date:
    """지금(또는 주어진 시점)의 논리적 날짜를 settings 기준으로 계산한다."""
    if now is None:
        now = datetime.datetime.now(datetime.UTC)
    settings = get_settings(db)
    return logical_date(now, settings.day_boundary_time, settings.timezone)
