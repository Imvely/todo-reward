# CLAUDE.md

데일리 TODO 리워드 앱. 미션 완료로 A·B 두 포인트를 동시에 적립하고,
A는 아바타 꾸미기 상점, B는 주간 결산 후 코인머니 출금에 쓴다. 사용자 1 + 관리자 1.

## 문서 지도 (구현 전 반드시 해당 절을 먼저 읽는다)

- 비즈니스 규칙의 진실: @docs/SPEC.md
- 구현 레시피(스키마·API·로직 흐름): @docs/TECH_DESIGN.md
- 우선순위: SPEC > TECH_DESIGN > 이 파일. 충돌 발견 시 구현하지 말고 보고.

## 작업 절차 (모든 기능 작업에 적용)

1. TECH_DESIGN에서 해당 기능의 절 번호를 찾아 읽고, 계획에 그 절 번호를 인용한다.
   해당 절이 없으면 설계부터 제안하고 승인받는다. 즉흥 설계 금지.
2. 계획 → 승인 → 구현 → 테스트 실행 → 결과 보고 순서를 지킨다.
3. SPEC의 `[미정]` 항목은 임의로 정하지 않는다. 반드시 질문한다.
4. 포인트/코인/연속 로직을 수정했다면 TECH_DESIGN §6 시나리오 테스트를
   반드시 실행하고 통과를 확인한 뒤 완료를 선언한다.

## 데일리 하네스 (자동화 워크플로우)

- 세션 시작 시 SessionStart 훅이 오늘 날짜·워크로그 상태·BACKLOG 상위 항목·git 상태를 자동 주입한다.
- 하루 시작: `/morning` — 어제 로그와 BACKLOG를 읽고 오늘 계획을 세운 뒤 즉시 1순위 작업 시작.
- 하루 마감: `/evening` — 오늘 작업 정리, 테스트, 워크로그·BACKLOG 갱신, git 커밋, 내일 계획.
- 워크로그: `docs/worklog/YYYY-MM-DD.md` (TEMPLATE.md 형식, 섹션 제목 변경 금지).
  마스터 할 일 목록은 `docs/worklog/BACKLOG.md`.
- **모든 문서·메모·산출물은 반드시 `.md`로 저장한다. `.txt` 절대 금지.**
  (회사 보안 정책상 txt는 자동 암호화됨. 훅이 .txt 생성을 자동 차단한다)
- PostToolUse 훅이 ruff 자동 포맷과 불변규칙 패턴 검사를 수행한다.
  훅 경고(`[post-edit-check]`)가 뜨면 무시하지 말고 해당 코드를 재검토한다.

## 명령어

- 전체 기동: `docker compose up -d`
- 백엔드 테스트: `docker compose exec api pytest -q`
- 마이그레이션 생성/적용: `docker compose exec api alembic revision --autogenerate -m "..."` / `... alembic upgrade head`
- 앱 실행: `cd app && npx expo start`
(세팅 후 실제 값과 다르면 이 절을 갱신할 것)

## 불변 규칙 — 위반 코드는 작성 금지 (이유 포함)

- 포인트 잔액만 갱신하는 코드 금지. 모든 증감은 point_transactions /
  coin_transactions 원장에 행을 남긴다. (잔액-원장 불일치는 복구 불가 버그)
- A 차감 로직에서 B를 건드리지 않고, 그 역도 같다. (적립만 동시, 차감은 독립)
- 자정·'00:00' 하드코딩 금지. 날짜 판정은 settings.day_boundary_time 참조.
  (경계 시각은 관리자가 바꿀 수 있고 결산·연속 판정이 전부 이 값에 걸려 있다)
- 포인트 지급·회수·결산은 단일 DB 트랜잭션 안에서 수행. (반쪽 상태 방지)
- 결산은 settlements의 (user_id, iso_year_week) UNIQUE에 기대어 멱등하게.
  (크론 중복 실행 시 이중 지급 방지)
- 사용자 토글은 "오늘"만 허용, OFF 시 daily_bonus_log 근거로 정확 회수.
  (체크-해제 반복 채굴 차단)
- 비즈니스 로직은 backend/app/services/ 에만. 라우터·클라이언트에서
  포인트 계산 금지. (검증·테스트 지점을 한 곳으로)

## 코드 규약

- Python: ruff로 포맷/린트 (스타일 규칙은 린터에 위임, 여기 적지 않음).
- 클라이언트: 서버 응답의 awarded/new_badges를 근거로만 연출을 재생한다.
  클라이언트가 금액을 자체 계산해 표시하지 않는다.
