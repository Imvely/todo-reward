---
description: 퇴근 마감 — 오늘 작업 정리·워크로그 저장·테스트·git 커밋·내일 계획 수립
argument-hint: "[추가로 기록할 메모 (선택)]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(docker compose exec api pytest:*)
---

# /evening — 하루 마감 프로토콜

사용자 개입 없이 아래를 순서대로 완료하고 마지막에 마감 보고만 남긴다.

## 자동 수집 컨텍스트

- 오늘 변경사항: !`git status --short`
- 오늘 diff 통계: !`git diff --stat HEAD`
- 최근 커밋: !`git log --oneline -5`

## 수행 단계

1. **오늘 한 일 집계**: 이 세션의 대화 내용 + 위 git 변경사항으로 오늘 실제로 한 일을 정리한다.
   `$ARGUMENTS`가 있으면 메모로 함께 기록한다.
2. **검증**: 백엔드 코드가 변경됐다면 `docker compose exec api pytest -q`를 실행한다.
   - 포인트/코인/연속 로직이 변경됐다면 TECH_DESIGN §6 시나리오 테스트 통과를 반드시 확인한다.
   - 실패하면: 실패 내용을 워크로그 "이슈"에 기록하고, 커밋 메시지에 `WIP:`를 붙이며, 내일 할 일 1순위로 올린다. (테스트 실패를 숨기지 않는다)
3. **워크로그 마감**: `docs/worklog/YYYY-MM-DD.md`(오늘)를 갱신한다 —
   "완료한 일"(구체적으로), "이슈 / 배운 것", "내일 할 일"(내일 아침 /morning이 그대로 집을 수 있게 구체적·실행가능하게).
   오늘 워크로그가 없으면 TEMPLATE.md 형식으로 새로 만들어 채운다.
4. **백로그 갱신**: `docs/worklog/BACKLOG.md`에서 완료 항목 체크, 오늘 발견된 새 작업 추가.
5. **git 커밋**:
   - `git add`로 오늘 작업 파일 + 워크로그를 스테이징한다 (무관한 파일 제외, 비밀정보/자격증명 파일 절대 포함 금지).
   - 커밋 메시지: 첫 줄은 변경 요약(한국어 가능), 본문에 주요 변경 나열. 마지막 줄에
     `Co-Authored-By: Claude <noreply@anthropic.com>`.
   - **push는 하지 않는다** (사용자가 명시 요청할 때만).
6. **마감 보고** (사용자에게 5~8줄): ① 오늘 완료한 일 ② 테스트 결과 ③ 커밋 해시/메시지 ④ 내일 할 일 ⑤ 사용자 결정이 필요한 질문(있으면).

## 규칙

- 모든 기록은 `.md`로만 저장한다 (.txt 금지 — 회사 정책).
- 커밋 전 `git diff --stat`으로 스테이징 내용을 확인하고, 의도하지 않은 파일이 섞이지 않게 한다.
