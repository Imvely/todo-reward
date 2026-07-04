"""사용자 조회 헬퍼.

앱은 '사용자 1 + 관리자 1' 고정 구조(SPEC §1)다. TODO는 사용자 계정에 속하며,
관리자는 그 목록을 조회·관리한다. 여기서 '대상 사용자'를 한 곳에서 해석한다.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def get_the_user(db: Session) -> User:
    """유일한 role='user' 계정을 반환한다. 없으면 500 (시드 누락)."""
    user = db.scalar(select(User).where(User.role == "user"))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="사용자 계정이 없습니다 (시드 누락?)",
        )
    return user


def resolve_todo_owner(db: Session, requester: User) -> User:
    """조회 대상 TODO의 소유자를 해석한다.

    - 요청자가 사용자면 본인.
    - 요청자가 관리자면 유일한 사용자 계정 (관리자는 사용자의 목록을 조회).
    """
    if requester.role == "user":
        return requester
    return get_the_user(db)
