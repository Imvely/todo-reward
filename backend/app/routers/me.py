"""현재 사용자 정보 라우터. TECH_DESIGN §3 GET /me."""

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import MeResponse

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
def read_me(user: User = Depends(get_current_user)) -> User:
    # 잔액은 users 캐시 컬럼을 그대로 노출 (원장 합계와 일치 보장은 서비스 계층 책임).
    return user
