#!/usr/bin/env node
// PostToolUse 훅 (Write|Edit): 편집 직후 결정적 품질 가드
// 1) .py 파일 → ruff 자동 수정/포맷 (로컬에 ruff가 있으면; 없으면 조용히 통과)
// 2) CLAUDE.md 불변규칙 위반 패턴 감지 → exit 2 + stderr (Claude에게 비차단 피드백)
const { execFileSync } = require('child_process');
const fs = require('fs');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const fp = (input.tool_input && input.tool_input.file_path) || '';
  if (!fp || !fs.existsSync(fp)) process.exit(0);
  const rel = fp.replace(/\\/g, '/');
  const warnings = [];

  if (/\.py$/i.test(fp)) {
    try {
      execFileSync('ruff', ['check', '--fix', fp], { stdio: 'pipe' });
    } catch (e) {
      if (e.code !== 'ENOENT') {
        const out = ((e.stdout || '') + '').trim();
        if (out) warnings.push(`ruff check 미해결 경고:\n${out.slice(0, 1500)}`);
      }
    }
    try {
      execFileSync('ruff', ['format', fp], { stdio: 'pipe' });
    } catch {}
  }

  // 불변규칙 패턴 검사: 백엔드 앱 코드에만 적용 (모델/마이그레이션/테스트 제외)
  if (/backend\/app\//.test(rel) && /\.py$/i.test(fp) && !/\/(alembic|models|tests)\//.test(rel)) {
    let src = '';
    try {
      src = fs.readFileSync(fp, 'utf8');
    } catch {}
    if (/['"]00:00(:00)?['"]/.test(src))
      warnings.push(
        '불변규칙 의심: "00:00" 하드코딩 감지. 하루 경계 판정은 settings.day_boundary_time을 참조해야 한다 (CLAUDE.md 불변 규칙).'
      );
    if (/\bdate\.today\(\)/.test(src) || /\bdatetime\.now\(\)/.test(src))
      warnings.push(
        '불변규칙 의심: date.today()/datetime.now() 직접 사용 감지. "오늘" 판정은 하루 경계 시각(day_boundary_time)을 반영한 헬퍼를 거쳐야 한다.'
      );
    if (/point_[ab]\s*[+\-]=/.test(src) && !/point_transaction/i.test(src))
      warnings.push(
        '불변규칙 의심: 잔액(point_a/point_b) 직접 갱신이 있는데 이 파일에 원장(point_transactions) 기록이 보이지 않는다. 모든 증감은 원장에 행을 남겨야 한다.'
      );
    if (/\/routers\//.test(rel) && /point_[ab]|coin_balance|current_streak/.test(src))
      warnings.push(
        '불변규칙 의심: 라우터에서 포인트/코인/연속 필드를 다루고 있다. 비즈니스 로직은 backend/app/services/에만 둔다.'
      );
  }

  if (warnings.length) {
    // PostToolUse에서 exit 2: stderr가 Claude에게 전달되어 스스로 교정하게 함.
    // write 직후 process.exit()는 파이프에서 출력 유실 가능 → exitCode 설정 후 자연 종료.
    process.stderr.write('[post-edit-check] 자동 검사 결과 확인 필요:\n' + warnings.join('\n'));
    process.exitCode = 2;
    return;
  }
  process.exitCode = 0;
});
