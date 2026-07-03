#!/usr/bin/env node
// SessionStart 훅: 세션 시작 시 컨텍스트 자동 주입 (stdout이 Claude 컨텍스트에 추가됨)
// 오늘 날짜, 워크로그 상태, 직전 로그의 "내일 할 일", BACKLOG 미완료 항목, git 상태를 요약한다.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const wl = path.join(root, 'docs', 'worklog');
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];

const safe = (cmd) => {
  try {
    return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

const lines = [];
lines.push(`[하네스 자동 컨텍스트 | SessionStart]`);
lines.push(`오늘: ${today} (${dow})`);

let files = [];
try {
  files = fs
    .readdirSync(wl)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
} catch {}

if (files.includes(`${today}.md`)) {
  lines.push(`오늘 워크로그: docs/worklog/${today}.md 존재 (진행 중)`);
} else {
  lines.push(`오늘 워크로그 없음 → 하루 시작이라면 /morning 프로토콜부터 수행할 것`);
}

const prev = files.filter((f) => f !== `${today}.md`).pop();
if (prev) {
  try {
    const txt = fs.readFileSync(path.join(wl, prev), 'utf8');
    const m = txt.match(/##\s*내일 할 일([\s\S]*?)(?=\n##\s|$)/);
    if (m && m[1].trim()) lines.push(`직전 워크로그(${prev})의 "내일 할 일":\n${m[1].trim()}`);
  } catch {}
}

try {
  const b = fs.readFileSync(path.join(wl, 'BACKLOG.md'), 'utf8');
  const open = b.split('\n').filter((l) => /^\s*- \[ \]/.test(l)).slice(0, 6);
  if (open.length) lines.push(`BACKLOG 미완료 상위:\n${open.join('\n')}`);
} catch {}

const branch = safe('git rev-parse --abbrev-ref HEAD');
const last = safe('git log -1 --oneline');
const dirty = safe('git status --porcelain');
lines.push(
  `git: ${branch || '?'} | 마지막 커밋: ${last || '(없음)'} | 미커밋 변경 ${
    dirty ? dirty.split('\n').length : 0
  }건`
);

lines.push(
  '상시 규칙 리마인드: 모든 문서는 .md로만 저장(.txt 금지) · 포인트/코인/연속 로직은 backend/app/services/에만 · 자정("00:00") 하드코딩 금지(settings.day_boundary_time 참조) · 포인트 로직 수정 시 TECH_DESIGN §6 시나리오 테스트 필수 실행'
);

process.stdout.write(lines.join('\n'));
