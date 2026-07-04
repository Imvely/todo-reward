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
- [x] TODO 조회/정렬 API: GET /todos, PATCH /todos/reorder — 2026-07-04 (resolve_todo_owner로 2인 구조 대상 해석, reorder 원자적)
- [x] 관리자 TODO CRUD: POST/PATCH/DELETE /admin/todos — 2026-07-04 (순수 CRUD, sort_order=max+1)
- [x] ★ 토글 서비스: 토글 ON (TECH_DESIGN §4.1) — 2026-07-04 (미션+5, 완주+10, 연속+10×(N−1), daily_bonus_log)
- [x] ★ 토글 서비스: 토글 OFF (TECH_DESIGN §4.2) — 2026-07-04 (정확 회수 + streak 되돌림, clamp 완화규칙)
- [x] ★ TECH_DESIGN §6 시나리오 테스트 1~3 — 2026-07-04 (잔액-원장 일치 검증)
- [x] ★ 하루 마감 크론: 완주·연속 보너스 지급 (TECH_DESIGN §4.6, `POST /internal/close_day`, 멱등) — 2026-07-04
- [x] ★ 포인트 일괄정산 재설계 — 2026-07-04 밤 (실시간 지급의 "소비→취소→재완료" 무한 생성 버그를 사용자가 발견).
      토글은 잔액 불변, 미션+완주+연속 전부 하루 마감에 합산 지급. pending(§4.2.1) 실시간 표시. 마이그레이션 29ad3da1c7d0. 총 33 pass.
- [ ] 로컬 하루마감 자동 실행 임시 방편 (크론은 Phase 6) — /morning에서 전일 close_day 호출 검토

## Phase 2 — 사용자 앱 핵심 (로컬)

- [x] Expo 프로젝트 셋업 (app/, RN + Expo, 웹 포함) — 2026-07-04 (SDK 57, blank-TS, react-native-svg·AsyncStorage·Jua/NotoSansKR 폰트)
- [x] 로그인 + 오늘의 TODO 목록 + 완료 토글 UI — 2026-07-04 (LoginScreen·TodayScreen, 헤드리스 브라우저로 렌더 검증)
- [x] 포인트 잔액 표시 + 서버 awarded 기반 "팡" 연출 (클라이언트 자체 계산 금지) — 2026-07-04 (진행 링 + PointPop, balances는 서버 응답만 반영)
- [x] 우선순위 정렬 UI — 2026-07-04 ("순서 바꾸기" 모드 + ▲▼로 순서만 변경, PATCH /todos/reorder 반영·검증). 참고: SPEC은 드래그앤드롭 명시 → 웹 신뢰성 위해 ▲▼로 구현, 실제 drag는 후속 폴리시로 남김.

## Phase 3 — 상점과 아바타 (로컬)

- [x] A상점: 카탈로그/구매 API (§3, §6-5 테스트) + UI — 2026-07-04
      API: POST /shop/purchase(A만 차감·B불변·원자적), GET /shop/items, GET /inventory. §6-5 테스트 6개(총 31 pass).
      UI: ShopScreen(카테고리 그룹·보유중·잔액부족 표시·구매 팡) + 하단 탭(오늘/상점). seed_shop.py 17개(emoji: 플레이스홀더, UTF-8 .py 시드 — 인라인 shell은 한글 깨짐). 헤드리스 구매 검증.
- [x] 옷장/착용: 카테고리당 1개 equipped (부분 유니크 인덱스, §6-6 테스트) — 2026-07-04 밤
      PATCH /inventory/{id}/equip (같은 카테고리 + 원피스↔상·하의 자동 해제, services/shop.set_equipped).
      테스트 4개(총 37 pass). 상점 미리보기가 서버 착장과 동기화 — 구매 시 자동 착용 저장, 새로고침 유지 검증.
- [~] 아바타 레이어 렌더링 — AvatarView 공용 컴포넌트로 기반 마련 (emoji 플레이스홀더, layer_z 정렬).
- [ ] ★ 3D 아바타 (VRM) — TECH_DESIGN §7 설계 확정 (2026-07-04, 조사: docs/research/avatar-3d-research.md)
  - [x] B-0 스파이크 — 2026-07-04 (VRM 렌더+회전+캡처, .web.tsx 격리)
  - [x] B-1 확장판 — 2026-07-04 저녁~밤: asset_ref(prop/fx/env/tint/combo) + 3D 프롭 32종 +
        일러스트 배경 6종(CanvasTexture 360° 실린더 + 3D 소품·모션) + 틴트 리컬러(상·하의·신발·헤어) +
        스페셜 세트 7종(콤보) + 상점 시착 3D(고정 무대 드레스업 UX) + 뼈 실측 캘리브레이션.
        판매 65종 = 전부 실착용 가능 원칙.
  - [ ] B-2: VRoid Studio로 캐릭터·의상 에셋 제작 + 노드 매핑 (스타일은 사용자와 결정 [미정]) —
        원피스·한복·구두 등 "모양이 다른 옷"은 이것 이후 재활성
  - [ ] B-3: idle 애니메이션, 네이티브 WebView 임베드
- [ ] /morning 프로토콜에 전일 close_day + (월요일엔) settle 자동 호출 추가 — 크론 전(Phase 6)까지의 로컬 정산 루틴
- [x] 아바타 룸 + 캡처 저장 — 2026-07-04 심야 (AvatarRoomScreen: 착장 무대 + PNG 캡처 다운로드(웹 canvas, 네이티브는 Phase 5에 view-shot) + 상점 바로가기. 오늘 화면 헤더 🧍‍♀️ 버튼 진입)
- [x] ★ 일요일 결산 크론: 캡전환 + 멱등성 (TECH_DESIGN §4.3, §6-4 테스트) — 2026-07-04 심야
      services/settlement.py(500 미만 이월·100단위·B만 차감·(user,주차) UNIQUE 멱등), POST /internal/settle(비일요일 no-op, 매일 돌아도 안전), §6-4 테스트 11개 — 총 48 pass.
- [x] B상점(적립 통장) 화면 + GET /coins — 2026-07-04 심야 (B칩→통장: 코인 잔액·다음 결산 예고(서버 계산 전환/이월)·거래 내역. 헤드리스 검증)

## Phase 4 — 관리자 + 부가기능

- [~] 관리자 화면: TODO 관리, 출금 처리(POST /admin/withdraw), 설정(streak_reset_days, day_boundary_time)
      → TODO 관리(미션 추가/삭제) 화면 완료 (2026-07-04, AdminScreen + GET /admin/user·/today). 출금·설정은 남음.
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

- [x] 관리자가 완주 이후 TODO 편집 시 보너스 처리 → **해결(2026-07-04)**: 완주 보너스를 하루 경계(하루 마감 크론 §4.6)에 한 번만 판정·지급하기로 확정. 낮 동안 편집은 자유, 회수 왕복 없음.
- [ ] 타임존을 고정 KST로 둘지
- [ ] 루틴을 사용자도 설정 가능하게 할지
- [ ] 공휴일 데이터 출처 (API vs 수동 등록)
- [ ] 뱃지 시간대(오전/밤) 판정 기준 시각
- [ ] 포인트 지급 시각 효과 구체 연출
