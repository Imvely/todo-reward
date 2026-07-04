/**
 * 아바타 캡처 — 현재 착장을 PNG 이미지로 저장 (SPEC §3.3).
 *
 * 화면(AvatarView)과 동일한 ANCHORS 좌표로 합성한다 — 보는 그대로 저장.
 * 웹: 오프스크린 canvas → dataURL 다운로드.
 * 네이티브: 추후 react-native-view-shot + expo-media-library로 교체 (Phase 5 다듬기).
 */
import { Platform } from 'react-native';

import { ANCHORS, BASE, STAGE, emojiOf, type WornItem } from '../components/AvatarView';

const OUT = 512; // 출력 크기(px)

/** dataURL을 파일로 다운로드 (웹 전용). 3D 캡처·2D 합성이 공용으로 쓴다. */
export function downloadDataUrl(dataUrl: string): boolean {
  if (Platform.OS !== 'web') return false;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `avatar-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  return true;
}

export function captureAvatarPng(items: WornItem[], username: string): boolean {
  if (Platform.OS !== 'web') return false; // 네이티브 캡처는 추후

  const canvas = document.createElement('canvas');
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  // 무대 좌표(240×300)를 512 캔버스에 맞춰 스케일 (여백 포함 중앙 배치)
  const scale = Math.min((OUT * 0.9) / STAGE.w, (OUT * 0.86) / STAGE.h);
  const offX = (OUT - STAGE.w * scale) / 2;
  const offY = (OUT - STAGE.h * scale) / 2 - 10;
  const px = (x: number) => offX + x * scale;
  const py = (y: number) => offY + y * scale;

  ctx.fillStyle = '#FFF9F4';
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const sorted = [...items].sort((a, b) => a.layer_z - b.layer_z);

  // 배경 → 베이스 → 착용 아이템 순서로, 화면과 같은 자리에.
  const bg = sorted.find((i) => i.category === 'background');
  if (bg) {
    const a = ANCHORS.background;
    ctx.globalAlpha = 0.22;
    ctx.font = `${a.size * scale}px serif`;
    ctx.fillText(emojiOf(bg.image_url), px(a.x), py(a.y));
    ctx.globalAlpha = 1;
  }

  ctx.font = `${BASE.size * scale}px serif`;
  ctx.fillText('🧍‍♀️', px(BASE.x), py(BASE.y));

  for (const it of sorted) {
    if (it.category === 'background') continue;
    const a = ANCHORS[it.category] ?? ANCHORS.misc;
    ctx.font = `${a.size * scale}px serif`;
    ctx.fillText(emojiOf(it.image_url), px(a.x), py(a.y));
  }

  // 워터마크
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#8A7F76';
  ctx.fillText(`${username}의 아바타`, OUT / 2, OUT - 22);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `avatar-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  return true;
}
