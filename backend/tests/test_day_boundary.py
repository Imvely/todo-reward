"""하루 경계 헬퍼 단위 테스트 — DB 불필요, 순수 함수. SPEC §2.3."""

import datetime
from zoneinfo import ZoneInfo

from app.services.day_boundary import logical_date

KST = "Asia/Seoul"
UTC = datetime.UTC


def _utc(y, m, d, hh, mm=0):
    return datetime.datetime(y, m, d, hh, mm, tzinfo=UTC)


def test_midnight_boundary_uses_local_date():
    # 경계 00:00: 논리적 날짜 = 로컬(KST) 날짜.
    # 2026-07-03 00:00 UTC = 2026-07-03 09:00 KST → 7/3.
    d = logical_date(_utc(2026, 7, 3, 0, 0), datetime.time(0, 0), KST)
    assert d == datetime.date(2026, 7, 3)


def test_midnight_boundary_utc_evening_rolls_to_next_kst_day():
    # 2026-07-02 15:00 UTC = 2026-07-03 00:00 KST → 경계 00:00이므로 7/3.
    d = logical_date(_utc(2026, 7, 2, 15, 0), datetime.time(0, 0), KST)
    assert d == datetime.date(2026, 7, 3)


def test_0900_boundary_before_boundary_is_previous_day():
    # 경계 09:00. 로컬 08:59 → 아직 어제(7/2).
    # 2026-07-02 23:59 UTC = 2026-07-03 08:59 KST → 경계 이전 → 7/2.
    d = logical_date(_utc(2026, 7, 2, 23, 59), datetime.time(9, 0), KST)
    assert d == datetime.date(2026, 7, 2)


def test_0900_boundary_at_boundary_is_current_day():
    # 로컬 09:00 정각 → 오늘(7/3).
    # 2026-07-03 00:00 UTC = 2026-07-03 09:00 KST → 경계 정각 → 7/3.
    d = logical_date(_utc(2026, 7, 3, 0, 0), datetime.time(9, 0), KST)
    assert d == datetime.date(2026, 7, 3)


def test_0900_boundary_after_boundary_is_current_day():
    # 로컬 09:30 → 오늘(7/3).
    # 2026-07-03 00:30 UTC = 2026-07-03 09:30 KST → 7/3.
    d = logical_date(_utc(2026, 7, 3, 0, 30), datetime.time(9, 0), KST)
    assert d == datetime.date(2026, 7, 3)


def test_naive_datetime_rejected():
    import pytest

    with pytest.raises(ValueError):
        logical_date(
            datetime.datetime(2026, 7, 3, 0, 0),  # noqa: DTZ001 (의도적 naive)
            datetime.time(0, 0),
            KST,
        )


def test_accepts_aware_input_in_any_tz():
    # 입력이 KST-aware여도 동일 결과 (내부에서 tz_name으로 재변환).
    kst_now = datetime.datetime(2026, 7, 3, 8, 59, tzinfo=ZoneInfo(KST))
    d = logical_date(kst_now, datetime.time(9, 0), KST)
    assert d == datetime.date(2026, 7, 2)
