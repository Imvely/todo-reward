# BACKLOG — 마스터 할 일 목록

> 진실의 원천: 전체 로드맵은 SPEC §13, 구현 레시피는 TECH_DESIGN 참조.
> /morning이 여기서 오늘 할 일을 고르고, /evening이 완료 체크와 신규 항목 추가를 한다.
> 우선순위 = 위에서 아래 순서. 완료 항목은 체크(`[x]`)하되 삭제하지 않는다 (이력 보존).

## Phase 0 — 준비

- [x] SPEC.md / TECH_DESIGN.md / CLAUDE.md 작성
- [x] Claude Code 하네스 구축 (/morning, /evening, hooks, worklog) — 2026-07-03
- [ ] 색상 테마·목업 방향 확정 (SPEC §13-0)

## Phase 1 — 백엔드 뼈대 (로컬)

- [x] docker-compose.yml 작성 (FastAPI + PostgreSQL 16, TECH_DESIGN §1) — 2026-07-03 (호스트 포트 충돌로 db 5434, api 8001)
- [x] backend 폴더 구조 생성 (TECH_DESIGN §5) + FastAPI 엔트리 + ruff 설정 — 2026-07-03
- [x] Alembic 초기화 + 전체 스키마 마이그레이션 (TECH_DESIGN §2, pg_trgm 확장 포함) — 2026-07-03 (12테이블, 부분 유니크/트라이그램 인덱스, 왕복 검증)
- [x] 시드: 관리자 1 + 사용자 1 + settings 싱글턴 행 — 2026-07-03 (app/seed.py 멱등, bcrypt. settings는 마이그레이션에서 생성)
- [x] 인증: POST /auth/login (JWT), GET /me (TECH_DESIGN §3) — 2026-07-03 (bcrypt 직접 사용, HTTPBearer 의존성, e2e 검증)
- [x] 하루 경계 헬퍼: settings.day_boundary_time 기반 "논리적 오늘" 계산 (모든 날짜 판정의 단일 지점) — 2026-07-03 (services/day_boundary.py, 단위 테스트 7)
- [ ] TODO 조회/정렬 API: GET /todos, PATCH /todos/reorder
- [ ] 관리자 TODO CRUD: POST/PATCH/DELETE /admin/todos
- [ ] ★ 토글 서비스: 토글 ON (TECH_DESIGN §4.1) — 미션 +5, 완주 +10, 연속 +10×(N−1), daily_bonus_log
- [ ] ★ 토글 서비스: 토글 OFF (TECH_DESIGN §4.2) — 정확 회수 + streak 되돌림
- [ ] ★ TECH_DESIGN §6 시나리오 테스트 1~3 (미션/보너스/회수)

## Phase 2 — 사용자 앱 핵심 (로컬)

- [ ] Expo 프로젝트 셋업 (app/, RN + Expo, 웹 포함)
- [ ] 로그인 + 오늘의 TODO 목록 + 완료 토글 UI
- [ ] 포인트 잔액 표시 + 서버 awarded 기반 "팡" 연출 (클라이언트 자체 계산 금지)
- [ ] 드래그앤드롭 우선순위 정렬

## Phase 3 — 상점과 아바타 (로컬)

- [ ] A상점: 카탈로그/구매 API (§3, §6-5 테스트) + UI
- [ ] 옷장/착용: 카테고리당 1개 equipped (부분 유니크 인덱스, §6-6 테스트)
- [ ] 아바타 레이어 렌더링 (DiceBear 등 무료 에셋으로 시작, SPEC §3.4)
- [ ] 아바타 룸 + 캡처 저장
- [ ] ★ 일요일 결산 크론: 캡전환 + 멱등성 (TECH_DESIGN §4.3, §6-4 테스트)

## Phase 4 — 관리자 + 부가기능

- [ ] 관리자 화면: TODO 관리, 출금 처리(POST /admin/withdraw), 설정(streak_reset_days, day_boundary_time)
- [ ] 루틴 CRUD + 매일 물질화 크론 (POST /internal/materialize)
- [ ] TODO 미등록 알림 (GET /admin/alerts)
- [ ] 추천 검색어 자동완성 (TECH_DESIGN §4.5, pg_trgm)

## Phase 5 — 뱃지 + 다듬기

- [ ] 뱃지 20종 시드 + 이벤트별 판정 (TECH_DESIGN §4.4)
- [ ] 그래픽 에셋 교체·연출 다듬기

## Phase 6 — 클라우드 전환

- [ ] Render(API) + Supabase(DB/Storage) + Vercel(웹) + 크론 이전 (SPEC §11)

## Phase 7 — 보너스

- [ ] 안드로이드 홈 위젯 (SPEC §9)

## 사용자 결정 대기 (SPEC `[미정]` — 임의 결정 금지)

- [ ] 타임존을 고정 KST로 둘지
- [ ] 루틴을 사용자도 설정 가능하게 할지
- [ ] 공휴일 데이터 출처 (API vs 수동 등록)
- [ ] 뱃지 시간대(오전/밤) 판정 기준 시각
- [ ] 포인트 지급 시각 효과 구체 연출
