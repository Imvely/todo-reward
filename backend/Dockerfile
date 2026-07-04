# TECH_DESIGN §1 — Python 3.12+
FROM python:3.12-slim

WORKDIR /app

# 의존성 먼저 복사해 레이어 캐시 활용.
# 로컬 개발 이미지이므로 dev 추가 의존(pytest/ruff/httpx)까지 설치해
# `docker compose exec api pytest -q` / ruff 를 컨테이너 안에서 바로 쓸 수 있게 한다.
# (클라우드 이미지는 Phase 6에서 별도 최적화)
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -e ".[dev]"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
