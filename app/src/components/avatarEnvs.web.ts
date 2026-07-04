/**
 * 배경 일러스트 페인터 (웹 전용) — env:* 아이템의 "그림이 그려진 배경".
 *
 * 기법: 2D 캔버스에 풍경을 그려 THREE.CanvasTexture로 만들고, 캐릭터 뒤
 * 배경 평면(backdrop plane)에 입힌다 — 스타일라이즈드 씬의 표준 기법.
 * (참고: threejs.org/manual backgrounds, CanvasTexture 문서. 추후 진짜 일러스트/
 *  360 HDRI로 교체 시 이 텍스처만 이미지 로드로 바꾸면 된다.)
 *
 * 원칙: 반짝이 파티클(글리터)은 '이펙트' 상품 몫 — 배경은 풍경 요소만 그린다.
 */
import * as THREE from 'three';

const W = 1024;
const H = 640;

type Ctx = CanvasRenderingContext2D;

function skyGradient(ctx: Ctx, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function blob(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function cloud(ctx: Ctx, x: number, y: number, s: number, color = 'rgba(255,255,255,0.9)') {
  blob(ctx, x, y, 26 * s, color);
  blob(ctx, x - 30 * s, y + 8 * s, 20 * s, color);
  blob(ctx, x + 30 * s, y + 8 * s, 20 * s, color);
  blob(ctx, x + 4 * s, y + 12 * s, 22 * s, color);
}

/** 벚꽃나무 — 줄기 + 겹친 분홍 캐노피 */
function sakuraTree(ctx: Ctx, x: number, y: number, s: number) {
  ctx.strokeStyle = '#8a5a3a';
  ctx.lineWidth = 10 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 6 * s, y - 60 * s, x - 8 * s, y - 110 * s);
  ctx.stroke();
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(x - 2 * s, y - 70 * s);
  ctx.quadraticCurveTo(x + 30 * s, y - 95 * s, x + 44 * s, y - 120 * s);
  ctx.stroke();
  const pinks = ['#ffc4d8', '#ffb0cc', '#ffd3e2'];
  [
    [-8, -150, 46],
    [-48, -122, 36],
    [34, -138, 40],
    [66, -112, 30],
    [-20, -116, 34],
  ].forEach(([dx, dy, r], i) => blob(ctx, x + dx * s, y + dy * s, r * s, pinks[i % 3]));
}

function pine(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const w = (46 - i * 10) * s;
    const ty = y - (26 + i * 24) * s;
    ctx.beginPath();
    ctx.moveTo(x - w, ty + 26 * s);
    ctx.lineTo(x, ty - 10 * s);
    ctx.lineTo(x + w, ty + 26 * s);
    ctx.closePath();
    ctx.fill();
  }
}

const PAINTERS: Record<string, (ctx: Ctx) => void> = {
  sakura(ctx) {
    skyGradient(ctx, [
      [0, '#ffeef5'],
      [0.6, '#ffd9e8'],
      [1, '#ffc9dd'],
    ]);
    // 먼 언덕
    ctx.fillStyle = '#f3b7cf';
    ctx.beginPath();
    ctx.ellipse(W * 0.25, H * 0.98, 420, 130, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#eda6c2';
    ctx.beginPath();
    ctx.ellipse(W * 0.8, H * 1.02, 460, 150, 0, Math.PI, 0);
    ctx.fill();
    // 벚꽃나무들
    sakuraTree(ctx, W * 0.14, H * 0.9, 1.15);
    sakuraTree(ctx, W * 0.88, H * 0.92, 1.3);
    sakuraTree(ctx, W * 0.62, H * 0.86, 0.75);
    // 흩날리는 꽃잎 (그림)
    for (let i = 0; i < 46; i++) {
      const px = ((i * 211) % W) + Math.sin(i) * 18;
      const py = ((i * 137) % (H * 0.8)) + 20;
      ctx.fillStyle = i % 3 ? 'rgba(255,175,203,0.85)' : 'rgba(255,210,225,0.9)';
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 3, (i * 37) % Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  ocean(ctx) {
    skyGradient(ctx, [
      [0, '#dff4ff'],
      [0.55, '#bfe9ff'],
      [0.56, '#79c7f2'], // 수평선
      [0.8, '#5db4e8'],
      [0.81, '#f2dcae'], // 모래사장
      [1, '#eed3a0'],
    ]);
    // 해
    blob(ctx, W * 0.82, H * 0.16, 42, '#fff2b8');
    blob(ctx, W * 0.82, H * 0.16, 30, '#ffe98f');
    cloud(ctx, W * 0.2, H * 0.14, 1.2);
    cloud(ctx, W * 0.52, H * 0.24, 0.8);
    // 파도 물결선
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 4;
    for (let row = 0; row < 3; row++) {
      const y = H * (0.62 + row * 0.055);
      ctx.beginPath();
      for (let x = -20; x < W + 20; x += 46) {
        ctx.arc(x, y, 20, Math.PI * 0.15, Math.PI * 0.85, false);
      }
      ctx.stroke();
    }
    // 요트
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(W * 0.32, H * 0.6);
    ctx.lineTo(W * 0.32, H * 0.5);
    ctx.lineTo(W * 0.37, H * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff8fbe';
    ctx.fillRect(W * 0.3, H * 0.6, 70, 10);
  },
  night(ctx) {
    skyGradient(ctx, [
      [0, '#1c1f42'],
      [0.7, '#33386b'],
      [1, '#474d8a'],
    ]);
    // 별 (정적인 그림 — 반짝이 이펙트 아님)
    for (let i = 0; i < 90; i++) {
      const sx = (i * 173) % W;
      const sy = (i * 97) % (H * 0.75);
      const r = 1 + ((i * 7) % 3) * 0.7;
      ctx.fillStyle = i % 5 ? 'rgba(255,246,216,0.9)' : 'rgba(200,214,255,0.9)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 달 + 은은한 광
    const glow = ctx.createRadialGradient(W * 0.2, H * 0.2, 10, W * 0.2, H * 0.2, 110);
    glow.addColorStop(0, 'rgba(255,240,190,0.9)');
    glow.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(W * 0.2 - 120, H * 0.2 - 120, 240, 240);
    blob(ctx, W * 0.2, H * 0.2, 46, '#fff3dc');
    blob(ctx, W * 0.185, H * 0.185, 10, '#efe2c4');
    blob(ctx, W * 0.215, H * 0.22, 7, '#efe2c4');
    // 도시 실루엣
    ctx.fillStyle = '#14163a';
    for (let i = 0; i < 14; i++) {
      const bw = 46 + ((i * 31) % 40);
      const bh = 60 + ((i * 53) % 120);
      const bx = i * 78 - 20;
      ctx.fillRect(bx, H - bh, bw, bh);
      // 창문 불빛
      ctx.fillStyle = 'rgba(255,223,107,0.85)';
      for (let wy = H - bh + 12; wy < H - 14; wy += 22) {
        for (let wx = bx + 8; wx < bx + bw - 10; wx += 18) {
          if ((wx + wy + i) % 3 === 0) ctx.fillRect(wx, wy, 6, 8);
        }
      }
      ctx.fillStyle = '#14163a';
    }
  },
  rainbow(ctx) {
    skyGradient(ctx, [
      [0, '#e8f6ff'],
      [0.7, '#d8efff'],
      [0.71, '#bfe8a8'], // 초원
      [1, '#a8dd8f'],
    ]);
    // 무지개 (그림)
    const bands = ['#ff9aa8', '#ffc48f', '#ffe98f', '#a8e3a0', '#9ad0ff', '#c9a8ff'];
    bands.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.72, 330 - i * 16, Math.PI, 0);
      ctx.stroke();
    });
    cloud(ctx, W * 0.17, H * 0.7, 1.5);
    cloud(ctx, W * 0.84, H * 0.7, 1.5);
    cloud(ctx, W * 0.65, H * 0.18, 0.9);
    // 초원 꽃
    for (let i = 0; i < 26; i++) {
      const fx = (i * 173) % W;
      const fy = H * 0.76 + ((i * 97) % (H * 0.2));
      blob(ctx, fx, fy, 5, i % 2 ? '#ffdf6b' : '#ff9ab5');
      blob(ctx, fx, fy, 2, '#ffffff');
    }
  },
  space(ctx) {
    skyGradient(ctx, [
      [0, '#12102b'],
      [0.6, '#251d4d'],
      [1, '#3a2a68'],
    ]);
    // 성운
    const neb = ctx.createRadialGradient(W * 0.7, H * 0.35, 20, W * 0.7, H * 0.35, 260);
    neb.addColorStop(0, 'rgba(198,140,255,0.4)');
    neb.addColorStop(1, 'rgba(198,140,255,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);
    const neb2 = ctx.createRadialGradient(W * 0.25, H * 0.7, 20, W * 0.25, H * 0.7, 220);
    neb2.addColorStop(0, 'rgba(255,143,190,0.3)');
    neb2.addColorStop(1, 'rgba(255,143,190,0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, W, H);
    // 별
    for (let i = 0; i < 130; i++) {
      const sx = (i * 211) % W;
      const sy = (i * 131) % H;
      ctx.fillStyle = i % 6 ? 'rgba(255,255,255,0.9)' : 'rgba(255,223,150,0.9)';
      ctx.beginPath();
      ctx.arc(sx, sy, 1 + ((i * 7) % 3) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // 행성 (지구풍 + 작은 달)
    blob(ctx, W * 0.16, H * 0.24, 52, '#7fb8f0');
    ctx.fillStyle = '#8fd6a0';
    ctx.beginPath();
    ctx.ellipse(W * 0.15, H * 0.23, 26, 14, 0.6, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, W * 0.88, H * 0.68, 20, '#e8c97a');
  },
  xmas(ctx) {
    skyGradient(ctx, [
      [0, '#2a3457'],
      [0.68, '#3f4d7d'],
      [0.7, '#f4f8ff'], // 눈밭
      [1, '#e3ecfa'],
    ]);
    // 내리는 눈 (그림)
    for (let i = 0; i < 70; i++) {
      const sx = (i * 151) % W;
      const sy = (i * 113) % (H * 0.66);
      blob(ctx, sx, sy, 2 + ((i * 7) % 3), 'rgba(255,255,255,0.85)');
    }
    // 먼 침엽수 숲
    for (let i = 0; i < 9; i++) {
      pine(ctx, 60 + i * 115, H * 0.7, 0.8 + ((i * 13) % 4) * 0.12, i % 2 ? '#28503c' : '#1e4232');
    }
    // 달
    blob(ctx, W * 0.85, H * 0.14, 34, '#fff3dc');
    // 눈사람
    blob(ctx, W * 0.2, H * 0.82, 34, '#ffffff');
    blob(ctx, W * 0.2, H * 0.74, 24, '#ffffff');
    blob(ctx, W * 0.193, H * 0.735, 3, '#2a2438');
    blob(ctx, W * 0.207, H * 0.735, 3, '#2a2438');
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(W * 0.2, H * 0.745);
    ctx.lineTo(W * 0.225, H * 0.752);
    ctx.lineTo(W * 0.2, H * 0.757);
    ctx.closePath();
    ctx.fill();
  },
};

/** env 키의 일러스트 배경 텍스처를 생성한다 (키가 없으면 null). */
export function makeEnvTexture(envKey: string): THREE.CanvasTexture | null {
  const paint = PAINTERS[envKey];
  if (!paint) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
