#!/usr/bin/env node
// PreToolUse 가드: .txt 파일 생성/편집 차단 (회사 정책: txt는 자동 암호화 → 문서는 반드시 .md)
// 입력: stdin JSON {tool_name, tool_input}. 차단 시 permissionDecision:"deny" JSON 출력.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const REASON =
    '회사 보안 정책: .txt 파일은 자동 암호화되어 사용할 수 없습니다. 동일 내용을 .md 확장자로 저장하세요.';

  let denied = false;
  const deny = (reason) => {
    denied = true;
    // 주의: write 직후 process.exit()는 Windows 파이프에서 출력 유실 가능 → 자연 종료로 플러시 보장
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      })
    );
  };

  if (['Write', 'Edit', 'NotebookEdit'].includes(tool)) {
    const fp = ti.file_path || ti.notebook_path || '';
    if (/\.txt$/i.test(fp)) deny(`${REASON} (요청 경로: ${fp})`);
  }

  if (!denied && (tool === 'Bash' || tool === 'PowerShell')) {
    const cmd = ti.command || '';
    // 리다이렉션(> x.txt) 또는 파일 생성 계열 명령이 .txt 를 대상으로 하는 경우만 좁게 매칭
    const txtWrite =
      /(?:>{1,2}\s*"?[^\s"';|&]+\.txt\b)|(?:\b(?:Out-File|Set-Content|Add-Content|New-Item|tee|touch|copy|cp|mv|move|ren|Rename-Item)\b[^\n]*\.txt\b)/i;
    if (txtWrite.test(cmd)) deny(REASON);
  }

  process.exitCode = 0; // process.exit() 호출 금지 — 이벤트 루프가 stdout 플러시 후 자연 종료
});
