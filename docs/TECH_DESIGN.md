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
-- daily_bonus_log: 그날 지급된 보너스 기록 (토글 OFF 회수의 근거)
-- ─────────────────────────────────────────────
CREATE TABLE daily_bonus_log (
    user_id      UUID NOT NULL REFERENCES users(id),
    due_date     DATE NOT NULL,
    day_bonus    INTEGER NOT NULL,      -- 지급된 완주 보너스 (보통 10)
    streak_bonus INTEGER NOT NULL,      -- 지급된 연속 보너스 10×(N-1)
    streak_n     INTEGER NOT NULL,      -- 지급 당시의 N (회수 시 되돌릴 값)
    PRIMARY KEY (user_id, due_date)
);
-- 토글 OFF로 완주가 깨지면 이 로그를 보고 정확한 금액을 회수하고 행을 삭제한다.
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
| PATCH | /todos/{id}/toggle | U | 완료 토글. **오늘 것만 허용**. 응답에 지급/회수 내역과 획득 뱃지 포함 |
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

> ★ 완주·연속 보너스는 토글이 아니라 **하루 마감 크론(§4.6)**에서 지급한다 (SPEC §2.2/§2.3).
> 토글은 미션 ±5만 즉시 처리한다. 아래 §4.1/§4.2는 그 축소된 흐름이다.

### 4.1 토글 ON (한 트랜잭션 안에서 전부 수행)

트랜잭션(transaction) = "전부 성공 아니면 전부 취소"의 묶음. 포인트 지급 중
서버가 죽어도 반쪽짜리 상태(TODO는 완료인데 포인트는 없음)가 남지 않는다.

```
BEGIN TRANSACTION
1. todo 조회. due_date == 오늘(경계 시각 기준) 아니면 403 거부.
2. is_done=true, done_at=now 로 갱신.
3. point_transactions에 (A,+5,'mission')와 (B,+5,'mission') INSERT.
   users.point_a += 5, point_b += 5.
   ※ 완주 판정·완주 보너스·연속 보너스·daily_bonus_log는 여기서 하지 않는다.
     그날 완주 여부는 하루 경계에 §4.6이 판정·지급한다.
4. 뱃지 조건 검사(아래 4.4, 미션 계열만). 새 뱃지는 user_badges INSERT.
5. 응답 payload 구성 (awarded = mission +5).
COMMIT
```

### 4.2 토글 OFF (되돌리기)

```
BEGIN TRANSACTION
1. due_date == 오늘 아니면 403.
2. is_done=false, done_at=NULL.
3. (A,-5,'mission_revoke'), (B,-5,'mission_revoke') 기록 + 잔액 차감.
   ※ 당일 완주 보너스는 아직 지급 전(하루 경계 크론이 미도래)이므로 회수할 보너스가 없다.
     미션 -5만 처리한다.
COMMIT
```
주의: 회수로 잔액이 음수가 될 수 있는 경우(이미 상점에서 써버림)는
users의 CHECK 제약이 막는다 → 이때는 잔액을 0까지만 회수하고
원장에 실제 회수액을 기록한다. (2인용 앱이므로 이 완화 규칙으로 충분)

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

### 4.6 하루 마감 (완주 판정·보너스, 크론, 멱등)

하루 경계에 도는 크론이 "방금 끝난 논리적 날짜"의 완주 여부를 판정하고 완주·연속 보너스를
지급한다 (SPEC §2.2/§2.3). 토글은 미션 ±5만 하므로, 완주 보너스의 유일한 지급 지점이 여기다.

- **지급 시점**: 그날이 끝나는 하루 경계 시각 (settings.day_boundary_time 연동, 자정 하드코딩 금지).
  기본 00:00이면 자정, 09:00이면 다음 날 09:00. 대상 날짜 = 방금 끝난 논리적 날짜(기본: 어제).
- **멱등성**: daily_bonus_log (user_id, due_date) PK로 보장. 이미 행이 있으면 이미 마감된 날 →
  조용히 skip. 크론 중복/재실행에도 이중 지급 없음 (settlements 패턴과 동일).

```
close_day(target_date):  # 기본 target_date = 방금 끝난 논리적 날짜
  각 user (role='user')에 대해 BEGIN TRANSACTION:
    1. 이미 daily_bonus_log(user, target_date) 있으면 → skip (멱등).
    2. total = target_date의 TODO 수, remaining = 미완료 수.
    3. 완주 판정: total > 0 AND remaining == 0.
    4. 미완주(또는 total==0)라면:
         - current_streak = 0 리셋 (SPEC §2.3: 완주 못한 날은 연속 끊김).
         - last_complete_date는 갱신하지 않음(다음 완주일에 "어제 완주 아님"→N=1로 자연 리셋).
         - 보너스 없음. (daily_bonus_log도 남기지 않음 → 다음 재실행 시 재판정 가능)
       완주라면:
         a. 연속 계산: last_complete_date == target_date-1(어제)면 N = current_streak+1,
            아니면 N = 1. (streak_reset_days 설정 시 N > 설정값이면 N=1로 리셋)
         b. 완주 보너스 +10, 연속 보너스 +10×(N-1)을 A·B 각각 지급(원장 기록 포함).
         c. users.current_streak = N, last_complete_date = target_date.
         d. daily_bonus_log에 (target_date, 10, 10×(N-1), N) 기록.
    COMMIT
```
- 미완주 판정 시 daily_bonus_log를 남기지 않는 이유: 그날은 "지급할 것이 없는" 날이므로 멱등 키가
  불필요하고, 남기면 이후 관리자가 과거 TODO를 정리해도 재판정이 막힌다. 완주(지급 발생)한 날만
  멱등 키를 남긴다.
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

1. 미션 완료 → A·B 동시 +5, 원장 2행 생성. (토글은 미션만)
2. 토글 OFF → 미션 -5만 정확 회수 (당일 완주 보너스는 아직 미지급이므로 없음).
3. 하루 마감(§4.6) 완주 판정 → 완주+연속 보너스 정확 지급 (N=1,2,3 각각) + daily_bonus_log 기록.
   미완주/ TODO 0개 → 보너스 없음 + streak 0 리셋. 같은 날 2회 실행 시 무변화(멱등).
4. 결산: 470→전환0/이월470, 730→700/30, 500→500/0. 같은 주 2회 실행 시 무변화.
5. A상점 구매 → A만 차감, B 불변. 잔액 부족 시 400 + 아무 변화 없음.
6. 같은 카테고리 두 개 착용 시도 → 기존 것 자동 해제되어 1개만 equipped.
