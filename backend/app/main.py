"""FastAPI 엔트리포인트.

라우터는 얇게 유지하고 비즈니스 로직은 app/services/ 에만 둔다 (CLAUDE.md 불변 규칙).
현재는 뼈대만 — 인증/TODO/포인트 라우터는 후속 작업에서 붙인다.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, admin_todos, auth, internal, me, shop, todos

app = FastAPI(title="Todo Reward API", version="0.1.0")

# CORS: Expo 웹/앱 클라이언트가 다른 오리진(예: localhost:8081)에서 API를 호출한다.
# 인증은 Bearer 토큰(쿠키 미사용)이라 credentials 불필요 → 로컬 개발은 전체 허용.
# (클라우드 전환 시 실제 프론트 도메인으로 좁힌다 — Phase 6)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 모든 API 경로에 /api/v1 접두사 (TECH_DESIGN §3).
API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(me.router, prefix=API_PREFIX)
app.include_router(todos.router, prefix=API_PREFIX)
app.include_router(admin_todos.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(shop.router, prefix=API_PREFIX)
app.include_router(internal.router, prefix=API_PREFIX)


@app.get("/health")
def health() -> dict[str, str]:
    """헬스체크. 컨테이너/로드밸런서 기동 확인용."""
    return {"status": "ok"}
