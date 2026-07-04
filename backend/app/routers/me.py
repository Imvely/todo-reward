"""현재 사용자 정보 라우터. TECH_DESIGN §3 GET /me."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import MeResponse
from app.services.day_boundary import current_logical_date

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
def read_me(user: User = Depends(get_current_user)) -> User:
    # 잔액은 users 캐시 컬럼을 그대로 노출 (원장 합계와 일치 보장은 서비스 계층 책임).
    return user


@router.get("/today")
def read_today(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, str]:
    """지금의 '논리적 오늘'(하루 경계 반영). 클라이언트가 날짜 표시·미션 생성에 사용."""
    return {"date": current_logical_date(db).isoformat()}
