"""초기 시드: 관리자 1 + 사용자 1 (2인 고정 구조, SPEC §1).

멱등: username 존재 시 건너뛴다. settings 싱글턴은 마이그레이션에서 이미 생성됨.
자격증명은 환경변수로 덮어쓸 수 있고, 미지정 시 개발용 기본값을 쓴다.

실행: docker compose exec api python -m app.seed
"""

import os

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.user import User

# 개발용 기본 자격증명. 운영 배포 전 반드시 환경변수로 교체할 것.
_ACCOUNTS = [
    (
        os.getenv("ADMIN_USERNAME", "admin"),
        os.getenv("ADMIN_PASSWORD", "admin1234"),
        "admin",
    ),
    (
        os.getenv("USER_USERNAME", "user"),
        os.getenv("USER_PASSWORD", "user1234"),
        "user",
    ),
]


def seed() -> None:
    with SessionLocal() as db:
        for username, password, role in _ACCOUNTS:
            exists = db.scalar(select(User).where(User.username == username))
            if exists is not None:
                print(f"skip: {role} '{username}' 이미 존재")
                continue
            db.add(
                User(
                    username=username,
                    password_hash=hash_password(password),
                    role=role,
                )
            )
            print(f"created: {role} '{username}'")
        db.commit()


if __name__ == "__main__":
    seed()
