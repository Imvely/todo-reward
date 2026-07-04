"""관리자 일반 라우터 — 관리 대상 사용자 조회 등.

관리자는 유일한 사용자(role='user') 계정의 미션을 관리한다(SPEC §1). 미션 생성 시
그 사용자의 id가 필요하므로 여기서 조회할 수 있게 노출한다.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.models.user import User
from app.schemas.auth import MeResponse
from app.services.users import get_the_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/user", response_model=MeResponse)
def get_managed_user(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> User:
    """관리자가 관리하는 유일한 사용자 계정."""
    return get_the_user(db)
