# 개발 환경 세팅 / 다른 PC에서 이어하기 (SETUP)

> 코드는 전부 깃에 있지만, 아래 4가지는 **깃에 안 올라가는 로컬 상태**라 새 PC마다 다시 만들어야 한다.
> (`.env`, DB 데이터, `.venv`, 도커/파이썬 자체)

---

## 전제 도구

- **Docker Desktop** (실행 중이어야 함)
- **Python 3.12+** (도커 밖에서 직접 실행할 때만 필요)

---

## 집/새 PC에서 이어하기 — 최단 경로

```bash
git pull
docker compose up -d                      # db(5434) + api(8001) 기동
docker compose exec api alembic upgrade head   # 빈 DB에 스키마 적용
docker compose exec api python -m app.seed     # 관리자/사용자 시드 (멱등)
```

- 확인: http://localhost:8001/health → `{"status":"ok"}`
- 로그인 스모크:
  ```bash
  curl -X POST http://localhost:8001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin1234"}'
  ```

> **왜 마이그레이션·시드를 다시 하나?** 적용된 스키마와 시드 데이터는 로컬 도커 볼륨
> `pgdata`에만 있고 깃/원격에는 없다. 새 PC의 DB는 비어 있으므로 매번 다시 올려야 한다.

---

## 포트

- compose가 **호스트 db 5434 → 컨테이너 5432**, **호스트 api 8001 → 컨테이너 8000**으로 노출한다.
  (원래 5432/8000이 다른 로컬 프로젝트와 충돌해서 옮긴 값. 새 PC에서 포트가 비어 있어도 그대로 동작한다.)

---

## `.env` (선택)

- **docker compose로만 돌리면 `.env` 없어도 된다.** compose 파일에 `${VAR:-기본값}`으로
  기본값(todo/todo, dev secret)이 들어 있다.
- **도커 밖에서** alembic/pytest/uvicorn을 직접 돌릴 때만 `DATABASE_URL`이 필요하다.
  `backend/.env.example`를 `backend/.env`로 복사해서 쓴다.
  기본 자격증명은 `ADMIN_USERNAME/ADMIN_PASSWORD`, `USER_USERNAME/USER_PASSWORD`로 덮어쓸 수 있다.

---

## 도커 밖에서 직접 실행 (선택 — 빠른 반복 개발용)

```bash
cd backend
python -m venv .venv
./.venv/Scripts/python -m pip install -e ".[dev]"   # Windows
# source .venv/bin/activate 후 pip install -e ".[dev]"  # macOS/Linux

export DATABASE_URL="postgresql+psycopg://todo:todo@localhost:5434/todo_reward"
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8001
```

- 테스트: `pytest -q` (인증 통합 테스트는 `DATABASE_URL`이 떠 있는 db를 가리켜야 통과. 순수 테스트는 DB 불필요.)

---

## 자주 쓰는 명령

| 목적 | 명령 |
|---|---|
| 전체 기동 | `docker compose up -d` |
| 중지 (데이터 보존) | `docker compose stop` |
| 중지 + 컨테이너 제거 (볼륨 보존) | `docker compose down` |
| DB 초기화 (볼륨까지 삭제) | `docker compose down -v` → 이후 마이그레이션·시드 재실행 |
| 백엔드 테스트 | `docker compose exec api pytest -q` |
| 마이그레이션 생성 | `docker compose exec api alembic revision --autogenerate -m "..."` |
| 마이그레이션 적용 | `docker compose exec api alembic upgrade head` |

---

## 기본 시드 계정 (개발용)

| 역할 | username | password |
|---|---|---|
| 관리자 | `admin` | `admin1234` |
| 사용자 | `user` | `user1234` |

> 운영 배포 전 반드시 환경변수로 교체할 것.
