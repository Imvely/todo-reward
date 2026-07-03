"""비밀번호 해시(bcrypt)와 JWT 발급/검증. TECH_DESIGN §1 (JWT Bearer).

비밀번호 원문은 절대 저장하지 않는다 — bcrypt 해시만 (TECH_DESIGN §2 users).
"""

import datetime
import uuid

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

# bcrypt는 최대 72바이트만 사용한다. 초과분은 표준 관행대로 잘라 넘긴다.
_BCRYPT_MAX_BYTES = 72


def _to_bytes(plain: str) -> bytes:
    return plain.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_to_bytes(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))


def create_access_token(subject: uuid.UUID | str) -> str:
    """subject(user id)를 담은 JWT를 발급한다. 만료는 settings 참조."""
    now = datetime.datetime.now(datetime.UTC)
    expire = now + datetime.timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(subject), "iat": now, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    """유효하면 subject(user id 문자열)를, 아니면 None을 반환한다."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    return payload.get("sub")
