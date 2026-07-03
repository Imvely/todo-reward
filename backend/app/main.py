"""FastAPI 엔트리포인트.

라우터는 얇게 유지하고 비즈니스 로직은 app/services/ 에만 둔다 (CLAUDE.md 불변 규칙).
현재는 뼈대만 — 인증/TODO/포인트 라우터는 후속 작업에서 붙인다.
"""

from fastapi import FastAPI

from app.routers import auth, me

app = FastAPI(title="Todo Reward API", version="0.1.0")

# 모든 API 경로에 /api/v1 접두사 (TECH_DESIGN §3).
API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(me.router, prefix=API_PREFIX)


@app.get("/health")
def health() -> dict[str, str]:
    """헬스체크. 컨테이너/로드밸런서 기동 확인용."""
    return {"status": "ok"}
