"""내부 크론 엔드포인트 — 외부 노출 X, 크론 비밀키 헤더로 보호. TECH_DESIGN §3/§4.6.

실제 스케줄러(Render Cron / pg_cron) 연결은 Phase 6. 지금은 엔드포인트+서비스+테스트만.
"""

import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.services.day_close import close_day

router = APIRouter(prefix="/internal", tags=["internal"])


def verify_cron_secret(x_cron_secret: str | None = Header(default=None)) -> None:
    """X-Cron-Secret 헤더가 설정값과 일치해야 통과. 크론 잡만 호출 가능."""
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="크론 인증 실패",
        )


@router.post("/close_day", dependencies=[Depends(verify_cron_secret)])
def run_close_day(
    date: datetime.date | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """하루 마감: 대상 날짜의 완주 판정 → 완주·연속 보너스 지급 (멱등, §4.6).

    date 미지정 시 '방금 끝난 논리적 날짜'(현재 논리적 오늘 - 1일)를 대상으로 한다.
    """
    results = close_day(db, target_date=date)
    return {
        "results": [
            {
                "user_id": r.user_id,
                "target_date": r.target_date.isoformat(),
                "completed": r.completed,
                "already_closed": r.already_closed,
                "streak": r.streak,
                "day_bonus": r.day_bonus,
                "streak_bonus": r.streak_bonus,
            }
            for r in results
        ]
    }
