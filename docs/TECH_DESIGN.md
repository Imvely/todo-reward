# 기술 설계 문서 (TECH_DESIGN)

> 이 문서는 @docs/SPEC.md 의 비즈니스 규칙을 "구현 가능한 형태"로 번역한 레시피다.
> DB 스키마, API 계약, 핵심 로직 흐름을 담는다. 구현 시 이 문서와 다르게 만들지 말 것.
> 이 문서와 SPEC이 충돌하면 SPEC이 우선이며, 충돌을 발견하면 사용자에게 보고한다.

---

## 1. 시스템 구성

- 클라이언트: React Native + Expo 단일 코드베이스 (Android / iOS / Web / 태블릿 반응형)
- 백엔드: FastAPI (Python 3.12+), SQLAlchemy 2.x (ORM), Alembic (마이그레이션)
- DB: PostgreSQL 16
- 로컬: Docker Compose / 클라우드: Render(API) + Supabase(DB·Storage) + Vercel(웹)

---

## 2. DB 스키마 (PostgreSQL DDL)

설계 원칙 3가지:
1. **원장(ledger) 패턴**: 포인트·코인 잔액은 users에 캐시로 두되,
   모든 증감은 반드시 transactions 테이블에 행(row)으로 남긴다.
   잔액과 원장 합계가 항상 일치해야 한다 (은행의 복식부기와 같은 원리).
2. **DB 제약으로 실수 차단**: 코드가 실수해도 DB가 거부하도록
   CHECK / UNIQUE / FK 제약을 적극 사용한다.
3. **하루 판정은 저장 시점에 확정**: TODO의 소속 날짜(due_date)는
   "하루 경계 시각" 설정을 반영해 백엔드가 계산·저장한다.

```sql
-- ─────────────────────────────────────────────
-- users: 계정. 관리자 1명 + 사용자 1명 고정 구조
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- UUID: 전 세계적으로 겹치지 않는 무작위 식별자. 순번(1,2,3..) 대신 쓰면
    -- 나중에 데이터 병합·이전 시 충돌이 없다.
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    -- 비밀번호 원문은 절대 저장하지 않는다. bcrypt 해시만 저장.
    role          TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    -- CHECK 제약: 이 두 값 외에는 DB가 저장을 거부한다.
    point_a       INTEGER NOT NULL DEFAULT 0 CHECK (point_a >= 0),
    point_b       INTEGER NOT NULL DEFAULT 0 CHECK (point_b >= 0),
    coin_balance  INTEGER NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
    -- 잔액이 음수가 되는 버그를 DB 차원에서 원천 차단.
    current_streak     INTEGER NOT NULL DEFAULT 0,
    -- 현재 연속 완주 일수 N. 보너스 = 10×(N-1).
    last_complete_date DATE,
    -- 마지막으로 완주한 "논리적 날짜". 연속 판정에 사용.
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- settings: 관리자 설정 (단일 행)
-- ─────────────────────────────────────────────
CREATE TABLE settings (
    id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- id=1 강제: 이 테이블에는 행이 딱 1개만 존재한다 (싱글턴 패턴).
    streak_reset_days  INTEGER,          -- NULL = 리셋 안 함(기본)
    day_boundary_time  TIME NOT NULL DEFAULT '00:00',
    -- 하루 경계 시각. 모든 날짜 계산이 이 값을 참조한다. 자정 하드코딩 금지.
    timezone           TEXT NOT NULL DEFAULT 'Asia/Seoul'
);
INSERT INTO settings (id) VALUES (1);

-- ─────────────────────────────────────────────
-- todos: 날짜별 할 일
-- ─────────────────────────────────────────────
CREATE TABLE todos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    -- FK(외래키): 존재하지 않는 사용자의 TODO를 만들 수 없게 DB가 보장.
    routine_id  UUID REFERENCES routines(id),
    -- 루틴에서 자동 생성된 TODO면 출처 루틴을 가리킴. 수동 입력이면 NULL.
    due_date    DATE NOT NULL,
    -- "논리적 날짜". 하루 경계 시각을 반영해 백엔드가 계산한 값.
    content     TEXT NOT NULL,
    is_done     BOOLEAN NOT NULL DEFAULT false,
    done_at     TIMESTAMPTZ,           -- 완료 시각 (뱃지 시간대 판정용)
    sort_order  INTEGER NOT NULL DEFAULT 0,  -- 드래그앤드롭 정렬 순서
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_todos_user_date ON todos (user_id, due_date);
-- 인덱스: "이 사용자의 이 날짜 TODO" 조회가 앱의 최빈 쿼리라 목차를 만들어 둠.
CREATE INDEX idx_todos_content_trgm ON todos USING gin (content gin_trgm_ops);
-- 추천 검색어용. pg_trgm 확장(부분 문자열 검색 가속) 필요:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────
-- routines: 반복 TODO 생성 규칙
-- ─────────────────────────────────────────────
CREATE TABLE routines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id),
    content      TEXT NOT NULL,
    start_date   DATE NOT NULL,
    end_date     DATE,                  -- NULL = 무기한
    repeat_type  TEXT NOT NULL CHECK (repeat_type IN ('daily','weekdays','custom_days')),
    days_of_week SMALLINT[],            -- custom_days일 때 [0=일 .. 6=토]
    skip_holidays BOOLEAN NOT NULL DEFAULT false,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- TODO 생성 시점: 매일 하루 경계 시각에 크론이 "오늘 뜰 루틴"을 todos로 물질화(materialize).
-- (조회 시 즉석 계산이 아니라 실제 행으로 만들어야 완주 판정·정렬이 단순해진다)

-- ─────────────────────────────────────────────
-- point_transactions: 포인트 원장 (모든 증감의 진실)
-- ─────────────────────────────────────────────
CREATE TABLE point_transactions (
    id         BIGSERIAL PRIMARY KEY,   -- 원장은 순번이 편리 (시간순 감사)
    user_id    UUID NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL CHECK (kind IN ('A','B')),
    amount     INTEGER NOT NULL,        -- 지급 양수 / 회수·차감 음수
    reason     TEXT NOT NULL CHECK (reason IN (
                 'mission','mission_revoke',
                 'day_complete','day_complete_revoke',
                 'streak','streak_revoke',
                 'shop_purchase','settlement_convert')),
    ref_id     UUID,                    -- 관련 todo/item/결산 id (추적용)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ptx_user ON point_transactions (user_id, created_at);

-- ─────────────────────────────────────────────
-- shop_items / user_inventory: A상점과 옷장
-- ─────────────────────────────────────────────
CREATE TABLE shop_items (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category  TEXT NOT NULL,   -- 'top','bottom','dress','set','shoes','socks',
                               -- 'sunglasses','accessory','bag','background',
                               -- 'pet','misc','hair' 등
    name      TEXT NOT NULL,
    price     INTEGER NOT NULL CHECK (price >= 0),
    image_url TEXT NOT NULL,
    layer_z   INTEGER NOT NULL DEFAULT 0,
    -- 아바타 레이어 쌓는 순서(z-index). 배경 < 몸 < 하의 < 상의 < 헤어 < 액세서리 순.
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE user_inventory (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID NOT NULL REFERENCES users(id),
    item_id   UUID NOT NULL REFERENCES shop_items(id),
    equipped  BOOLEAN NOT NULL DEFAULT false,
    bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, item_id)   -- 같은 아이템 중복 구매 방지
);
-- 착용 규칙: 같은 category 안에서는 equipped=true 가 최대 1개.
-- (부분 유니크 인덱스로 DB가 강제:)
-- CREATE UNIQUE INDEX one_equipped_per_category
--   ON user_inventory (user_id, (SELECT category FROM ...)) ...
-- ↑ 서브쿼리 인덱스는 불가하므로 실제 구현은 inventory에 category를
--   비정규화 복사(denormalize)한 뒤 아래처럼 건다:
--   ALTER TABLE user_inventory ADD COLUMN category TEXT NOT NULL;
--   CREATE UNIQUE INDEX one_equipped_per_cat
--     ON user_inventory (user_id, category) WHERE equipped = true;
-- 원피스(dress) 착용 시 상의/하의 자동 해제는 서비스 로직에서 처리.

-- ─────────────────────────────────────────────
-- settlements + coin_transactions: 일요일 결산과 코인 원장
-- ─────────────────────────────────────────────
CREATE TABLE settlements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id),
    iso_year_week  TEXT NOT NULL,       -- 예: '2026-W27'
    converted      INTEGER NOT NULL,    -- 전환된 코인머니
    carried_over   INTEGER NOT NULL,    -- 이월된 자투리 B포인트
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, iso_year_week)
    -- ★ 멱등성의 핵심. 같은 주 결산이 두 번 돌면 두 번째 INSERT가 실패한다.
);

CREATE TABLE coin_transactions (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id),
    amount     INTEGER NOT NULL,        -- 전환 양수 / 출금 음수
    reason     TEXT NOT NULL CHECK (reason IN ('settlement','withdraw')),
    ref_id     UUID,                    -- settlement id 또는 출금 처리 id
    memo       TEXT,                    -- 관리자 출금 메모 (예: '7/6 계좌지급')
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- badges / user_badges: 뱃지 20종
-- ─────────────────────────────────────────────
CREATE TABLE badges (
    id        TEXT PRIMARY KEY,   -- 'first_mission', 'streak_3' 같은 사람이 읽는 코드
    name      TEXT NOT NULL,
    condition_key TEXT NOT NULL   -- 판정 로직이 참조하는 조건 식별자
);

CREATE TABLE user_badges (
    user_id   UUID NOT NULL REFERENCES users(id),
    badge_id  TEXT NOT NULL REFERENCES badges(id),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, badge_id)    -- 같은 뱃지 중복 획득 방지
);

-- ─────────────────────────────────────────────
-- daily_bonus_log: 하루 마감 정산 내역 + 멱등 키 (§4.6)
-- ─────────────────────────────────────────────
CREATE TABLE daily_bonus_log (
    user_id        UUID NOT NULL REFERENCES users(id),
    due_date       DATE NOT NULL,
    mission_points INTEGER NOT NULL DEFAULT 0,  -- 지급된 미션 포인트 합 (5×완료 수)
    day_bonus      INTEGER NOT NULL,      -- 지급된 완주 보너스 (완주 시 10, 아니면 0)
    streak_bonus   INTEGER NOT NULL,      -- 지급된 연속 보너스 10×(N-1)
    streak_n       INTEGER NOT NULL,      -- 지급 당시의 N (미완주 날은 0)
    PRIMARY KEY (user_id, due_date)
);
-- 마감(정산)한 날마다 행을 남긴다 — 완주 여부 무관. (user_id, due_date) PK가 이중 정산을 차단.
```

---

## 3. API 계약 (REST)

규약: 모든 응답은 JSON. 인증은 JWT Bearer 토큰. 시간은 ISO 8601(UTC 저장, 표시 변환).
경로 앞에 `/api/v1` 접두사. 아래 표의 권한: U=사용자, A=관리자.

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| POST | /auth/login | - | username/password → JWT 발급 |
| GET | /me | U,A | 내 정보 + 포인트/코인 잔액 + 연속 일수 |
| GET | /todos?date=YYYY-MM-DD | U,A | 해당 날짜 TODO 목록 (기본: 오늘) |
| PATCH | /todos/{id}/toggle | U | 완료 토글. **오늘 것만 허용**. 잔액 불변, 응답에 pending(예정 포인트)과 획득 뱃지 포함 |
| GET | /points/pending | U | 다음 하루 경계에 들어올 예정 포인트 (§4.2.1, 서버 계산) |
| PATCH | /todos/reorder | U | body: [{id, sort_order}] 일괄 순서 변경 |
| POST | /admin/todos | A | TODO 생성 (body: user_id, due_date, content) |
| PATCH | /admin/todos/{id} | A | 내용/날짜 수정 |
| DELETE | /admin/todos/{id} | A | 삭제 |
| GET | /admin/todos/suggest?q=... | A | 추천 검색어. 과거 content에서 부분일치 상위 5개, 최근 우선 |
| GET/POST/PATCH/DELETE | /admin/routines | A | 루틴 CRUD |
| GET | /shop/items?category=... | U | A상점 카탈로그 |
| POST | /shop/purchase | U | body: item_id. A포인트 차감+인벤토리 추가 (원자적) |
| GET | /inventory | U | 내 옷장 (카테고리별) |
| PATCH | /inventory/{id}/equip | U | 착용/해제. 같은 카테고리 기존 착용 자동 해제 |
| GET | /points/transactions | U,A | 포인트 원장 조회 (페이지네이션) |
| GET | /coins | U,A | 코인 잔액 + 원장 |
| POST | /admin/withdraw | A | body: user_id, amount, memo. 코인 차감 기록 |
| GET | /badges | U,A | 전체 뱃지 + 내 획득 여부 |
| GET/PATCH | /admin/settings | A | streak_reset_days, day_boundary_time 조회/수정 |
| GET | /admin/alerts | A | 오늘 TODO 미등록 여부 등 관리자 알림 |
| POST | /internal/settle | cron | 주간 결산 실행 (내부 비밀키 헤더로 보호) |
| POST | /internal/materialize | cron | 오늘자 루틴 → TODO 물질화 |
| POST | /internal/close_day | cron | 하루 마감: 전날 완주 판정 → 완주·연속 보너스 지급 (멱등, §4.6) |

토글 응답 예시 (클라이언트가 "팡 효과"를 정확히 재생할 근거):
```json
{
  "todo": { "id": "...", "is_done": true },
  "awarded": [
    { "reason": "mission", "amount": 5 },
    { "reason": "day_complete", "amount": 10 },
    { "reason": "streak", "amount": 20 }
  ],
  "streak": 3,
  "new_badges": ["streak_3"],
  "balances": { "point_a": 135, "point_b": 135 }
}
```

---

## 4. 핵심 로직 흐름

> ★ **토글은 포인트를 전혀 만지지 않는다.** 미션·완주·연속 모든 포인트는
> 하루 마감 크론(§4.6)이 마감 시점의 최종 상태로 합산 일괄 지급한다 (SPEC §2.2).
> 근거: 실시간 지급은 "지급→상점 소비→취소(회수 불가)→재완료→재지급" 무한 생성 구멍이
> 있었다 (2026-07-04 발견, 완화 규칙과 결합 시). 마감 정산으로 원천 차단.

### 4.1 토글 ON

```
BEGIN TRANSACTION
1. todo 조회. due_date == 오늘(경계 시각 기준) 아니면 403 거부.
2. is_done=true, done_at=now 로 갱신. (포인트·원장·잔액 변경 없음)
3. 뱃지 조건 검사(아래 4.4, 미션 계열만). 새 뱃지는 user_badges INSERT.
4. 응답 payload 구성 — awarded는 빈 배열, 대신 pending(오늘 들어올 예정 합계)을 내려준다.
COMMIT
```

### 4.2 토글 OFF (되돌리기)

```
BEGIN TRANSACTION
1. due_date == 오늘 아니면 403.
2. is_done=false, done_at=NULL. (포인트·원장·잔액 변경 없음)
3. 응답에 갱신된 pending 포함.
COMMIT
```

### 4.2.1 예정 포인트(pending) 계산 — 서버가 계산해 내려준다

클라이언트가 "다음 하루 경계에 들어올 포인트"를 실시간 표시할 근거 (자체 계산 금지).

```
pending(user, today):
  done  = 오늘 완료된 TODO 수, total = 오늘 TODO 수
  mission = 5 × done
  완주 예정(total>0 AND done==total)이면:
    N = (last_complete_date == 어제 ? current_streak+1 : 1)   # reset_days 반영
    day_bonus = 10, streak_bonus = 10×(N-1)
  아니면 day_bonus = streak_bonus = 0
  → {mission, day_bonus, streak_bonus, total_sum, boundary_time}
```
GET /points/pending 및 토글 응답에 포함. 이 값은 예상치일 뿐, 실제 지급은 §4.6이 확정한다.

### 4.3 일요일 결산 (크론, 멱등)

```
1. 지금이 "일요일이 끝나는 경계 시각"인지 확인 (settings 참조).
2. iso_year_week 계산 (예: '2026-W27').
3. BEGIN TRANSACTION
   a. settlements에 INSERT 시도. UNIQUE 충돌이면 이미 결산됨 → 조용히 종료.
   b. balance = users.point_b.
      balance >= 500 이면 convert = balance - (balance % 100), 아니면 convert = 0.
   c. convert > 0 이면:
      point_transactions (B, -convert, 'settlement_convert') 기록,
      coin_transactions (+convert, 'settlement') 기록,
      users.point_b -= convert, users.coin_balance += convert.
   d. settlements 행에 converted/carried_over 확정.
   COMMIT
```

### 4.4 뱃지 판정

- 토글/구매/루틴생성/정렬 등 "이벤트 발생 지점"에서 관련 뱃지만 검사한다
  (매번 20개 전부 검사하지 않음 → condition_key로 이벤트별 매핑).
- 시간대 뱃지 기준: 얼리버드 = done_at 05:00~11:59, 야행성 = 21:00~04:59 (로컬 시각).
- 획득 시 토글 응답의 new_badges에 실어 클라이언트가 축하 연출.

### 4.5 추천 검색어 (자동완성)

- 클라이언트: 300ms 디바운스 후 GET /admin/todos/suggest?q=...
- 백엔드: `SELECT DISTINCT content FROM todos WHERE user_id=? AND content ILIKE '%q%'
  ORDER BY max(created_at) DESC LIMIT 5` (pg_trgm 인덱스 활용)
- 고도화(선택): 임베딩 유사도 검색으로 교체 가능하도록 서비스 함수로 분리해 둘 것.

### 4.6 하루 마감 (전체 포인트 정산, 크론, 멱등)

하루 경계에 도는 크론이 "방금 끝난 논리적 날짜"를 정산한다. **미션 포인트를 포함한
그날의 모든 포인트가 여기서만 지급된다** (SPEC §2.2). 유일한 지급 지점.

- **지급 시점**: 그날이 끝나는 하루 경계 시각 (settings.day_boundary_time 연동, 자정 하드코딩 금지).
  기본 00:00이면 자정, 09:00이면 다음 날 09:00. 대상 날짜 = 방금 끝난 논리적 날짜(기본: 어제).
- **멱등성**: daily_bonus_log (user_id, due_date) PK로 보장. **완주 여부와 무관하게 마감한 날마다
  행을 남긴다** (미션 포인트가 미완주 날에도 지급되므로 모든 날에 멱등 키 필요).
  이미 행이 있으면 조용히 skip. 마감은 그날의 최종 확정이다 (이후 과거 TODO 편집은 정산에 불반영).

```
close_day(target_date):  # 기본 target_date = 방금 끝난 논리적 날짜
  각 user (role='user')에 대해 BEGIN TRANSACTION:
    1. 이미 daily_bonus_log(user, target_date) 있으면 → skip (멱등).
    2. done = 완료 TODO 수, total = 전체 TODO 수.
    3. mission = 5 × done. mission > 0이면 (A,+mission,'mission'), (B,+mission,'mission') 지급.
    4. 완주 판정: total > 0 AND done == total.
       완주라면:
         a. N = (last_complete_date == 어제 ? current_streak+1 : 1), reset_days 반영.
         b. 완주 +10, 연속 +10×(N-1)을 A·B 각각 지급(원장 기록).
         c. current_streak = N, last_complete_date = target_date.
       미완주(또는 total==0)라면:
         - target_date > last_complete_date 일 때만 current_streak = 0 리셋 (과거 재실행 가드).
    5. daily_bonus_log에 (target_date, mission, day_bonus, streak_bonus, N) 기록 — 항상.
    COMMIT
```
- daily_bonus_log에 mission_points 컬럼 추가 (마이그레이션). 회수 용도는 사라졌고
  이제 "그날 정산 내역 + 멱등 키" 역할이다.
- 실제 스케줄 연결(Render Cron/pg_cron)은 Phase 6. 지금은 `POST /internal/close_day` 엔드포인트와
  서비스·테스트까지 만들어 두고 수동/테스트로 호출한다.

---

## 5. 프로젝트 폴더 구조

```
todo-reward-app/
├── CLAUDE.md
├── docs/                # SPEC.md, TECH_DESIGN.md
├── docker-compose.yml   # api + postgres
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 엔트리
│   │   ├── core/            # 설정, DB 세션, 보안(JWT)
│   │   ├── models/          # SQLAlchemy 모델 (위 DDL과 1:1)
│   │   ├── schemas/         # Pydantic 요청/응답 스키마
│   │   ├── services/        # ★ 비즈니스 로직 (포인트/결산/뱃지) — 라우터에 로직 금지
│   │   ├── routers/         # API 엔드포인트 (얇게 유지)
│   │   └── crons/           # settle, materialize, close_day(하루 마감 완주 판정)
│   ├── tests/               # 포인트 로직은 반드시 테스트 (아래 6절)
│   └── alembic/             # 마이그레이션
└── app/                 # Expo 클라이언트 (사용자·관리자 화면 공유, role로 분기)
```

## 6. 반드시 테스트로 보호할 시나리오 (구현 시 필수 작성)

1. 토글 ON/OFF → 잔액·원장 완전 불변 (완료 표시만). "ON→OFF→ON" 반복 후에도 원장 0행.
2. pending 계산 → done×5 + (완주 예정 시 10 + 10×(N-1)) 정확 반영, 토글마다 갱신.
3. 하루 마감(§4.6) → 미션 합계 + 완주 + 연속을 한 번에 정확 지급 (N=1,2,3 각각) +
   daily_bonus_log(미션 포함) 기록. 부분 완료 날은 미션만 지급 + streak 0 리셋.
   TODO 0개 날은 지급 0 + streak 리셋. 같은 날 2회 실행 시 무변화(멱등, 미완주 날 포함).
4. 결산: 470→전환0/이월470, 730→700/30, 500→500/0. 같은 주 2회 실행 시 무변화.
5. A상점 구매 → A만 차감, B 불변. 잔액 부족 시 400 + 아무 변화 없음.
6. 같은 카테고리 두 개 착용 시도 → 기존 것 자동 해제되어 1개만 equipped.

---

## 7. 3D 아바타 (VRM) — 설계

> 배경 조사: docs/research/avatar-3d-research.md (2026-07-04).
> 목표: 아바타를 실시간 3D로 렌더하고, 착용을 "옷이 몸에 입혀지는" 방식으로.
> 원칙: 서버·DB의 착용 모델(user_inventory.equipped)은 그대로 — 3D는 표현 계층만 바뀐다.

### 7.1 스택과 플랫폼 전략

- 렌더: `three` + `@react-three/fiber`(R3F) + `@pixiv/three-vrm` (+ `@react-three/drei` OrbitControls)
- 아바타 포맷: **VRM** (glTF 2.0 확장, 오픈 표준). 제작 도구: **VRoid Studio v2** (무료, 옷 갈아입히기/XWear 공식 지원)
- **웹 전용으로 시작**: 3D 코드는 `*.web.tsx` 파일에만 두어 네이티브 번들에서 three가
  아예 임포트되지 않게 한다 (expo-gl 버전 충돌 리스크 회피).
  네이티브(`*.native.tsx`)는 기존 2D AvatarView 폴백 → Phase 6에서 WebView 임베드로 3D 제공.

### 7.2 착용(의상 스왑) 방식 — "단일 VRM + 메시 가시성 토글"

한 VRM 파일에 베이스 몸 + 카탈로그 의상 전부를 레이어로 포함시키고,
런타임에 착용된 것만 `visible=true`로 켠다. (소규모 고정 카탈로그에 최적)

- **에셋 제작 (VRoid Studio)**:
  1. 캐릭터 1구 제작, 판매할 의상·헤어·액세서리를 전부 같은 모델에 착장.
  2. VRM 내보내기 시 **"투명 메시 삭제" 해제, 머티리얼/메시 병합 해제** → 아이템별 개별 메시 유지.
  3. 내보낸 VRM을 스크립트로 열어 노드명 목록 추출 → 아이템↔노드 매핑 확정.
- **DB**: `shop_items.asset_ref TEXT NULL` 추가 (예: 'vrm:Tops_Hoodie01' — 노드명 프리픽스).
  image_url은 2D 썸네일/폴백으로 유지. asset_ref가 NULL인 아이템은 3D 무대에서 미표현(2D 뱃지만).
- **런타임 토글**:
  ```ts
  const wornRefs = new Set(equippedItems.map(i => i.asset_ref));   // 서버 equipped 기준
  vrm.scene.traverse(node => {
    const ref = findAssetRef(node.name);      // 노드명 → 카탈로그 asset_ref 매칭
    if (ref) node.visible = wornRefs.has(ref); // 의상 메시만 켜고 끄기 (몸은 항상 표시)
  });
  ```
- 확장(나중): 아이템 수가 커지면 아이템별 개별 GLB를 공용 스켈레톤에 부착하는
  스킨드 메시 어태치 방식(gltf-avatar-threejs 패턴)으로 전환. DB 구조는 동일.

### 7.3 컴포넌트 구조

```
app/src/components/
├── AvatarStage.web.tsx    # R3F Canvas + VRM 로드/토글/회전/캡처 (three는 여기서만 import)
├── AvatarStage.native.tsx # 2D AvatarView 폴백 (동일 props)
└── AvatarView.tsx         # 기존 2D 이모지 레이어 (폴백·썸네일용 유지)
```

- props 계약(공용): `{ items: WornItem[], size, onReady?(capture: () => string|null) }`
  — 호출부(룸·상점)는 웹/네이티브 구분을 모른다.
- VRM 로드: `useLoader(GLTFLoader, url, l => l.register(p => new VRMLoaderPlugin(p)))`
  → `gltf.userData.vrm`. 매 프레임 `vrm.update(delta)` (스프링본 물리 — 치마·리본 흔들림 포함).
- 회전: OrbitControls (수평 회전만 허용, 줌 제한).
- 캡처: Canvas `gl={{ preserveDrawingBuffer: true }}` → `canvas.toDataURL('image/png')`
  → 기존 다운로드 헬퍼 재사용 (아바타 룸 "이미지로 저장"이 3D 스냅샷이 된다).

### 7.4 에셋 서빙·성능

- `app/public/avatar/base.vrm` — Expo 웹 정적 서빙. (클라우드 전환 시 CDN/Supabase Storage)
- VRM 5~15MB 예상 → 로딩 스피너 필수, `VRMUtils.removeUnnecessaryVertices/Joints`로 경량화.
- three(≈150KB gzip)+VRM 로더는 웹 번들에만 포함 (.web.tsx 분리로 보장).

### 7.5 단계별 적용 계획

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| B-0 스파이크 | three-vrm 샘플 VRM으로 R3F 렌더 + 회전 + 캡처를 Expo 웹에서 검증 | 아바타 룸에 3D 모델이 돌고 PNG 저장됨 |
| B-1 토글 배선 | asset_ref 마이그레이션 + 노드 가시성 토글 + 룸 3D 전환(2D 폴백 유지) | equipped 변경이 3D에 반영 |
| B-2 에셋 제작 | VRoid로 우리 캐릭터 + 카탈로그 의상 제작·매핑 (스타일은 사용자와 결정) | 상점 아이템이 실제 3D 의상으로 |
| B-3 확장 | 상점 시착 3D화, idle 애니메이션, 네이티브 WebView | — |

리스크: VRoid 재내보내기 시 노드명 변동 → 내보내기 후 매핑 추출 스크립트로 자동 재생성.
아바타 스타일(§13-0 색상·목업과 함께)은 `[미정]` — B-2에서 사용자와 결정.
