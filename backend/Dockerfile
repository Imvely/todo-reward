# TECH_DESIGN §1 — Python 3.12+
FROM python:3.12-slim

WORKDIR /app

# 의존성 먼저 복사해 레이어 캐시 활용
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -e .

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
