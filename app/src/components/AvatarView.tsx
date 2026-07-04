/** 아바타 표시 — 베이스 몸 위에 착용 아이템을 카테고리별 앵커 좌표로 겹쳐 입힌다.
 *
 * SPEC §3.4 "레이어 겹치기" 구조의 이모지 플레이스홀더 구현:
 * - 위치 = ANCHORS(카테고리별 좌표), 쌓임 순서 = DB layer_z.
 * - 진짜 그래픽으로 교체할 때 이 좌표 체계를 그대로 쓰고 글리프만 이미지로 바꾼다.
 * 상점 미리보기·아바타 룸·캡처(utils/avatarCapture)가 공용으로 쓴다.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

export type WornItem = {
  category: string;
  name: string;
  image_url: string;
  layer_z: number;
};

export const CATEGORY_LABEL: Record<string, string> = {
  hair: '헤어',
  top: '상의',
  bottom: '하의',
  dress: '원피스',
  set: '셋업',
  shoes: '신발',
  socks: '양말',
  sunglasses: '선글라스',
  accessory: '액세서리',
  bag: '가방',
  background: '배경',
  pet: '펫',
  misc: '소품',
};

export const emojiOf = (url: string) => (url.startsWith('emoji:') ? url.slice(6) : '🎁');

/** 기준 무대(240×300) 안에서 각 부위의 중심 좌표와 글리프 크기.
 * 베이스 🧍‍♀️(150px)가 (120,170)에 서 있을 때의 몸 비례에 맞춘 값. */
export const STAGE = { w: 240, h: 300 };
export const BASE = { x: 120, y: 170, size: 150 };
export const ANCHORS: Record<string, { x: number; y: number; size: number }> = {
  background: { x: 120, y: 145, size: 230 }, // 뒤에 크게, 흐리게
  hair: { x: 120, y: 92, size: 44 }, // 머리 위
  sunglasses: { x: 120, y: 120, size: 30 }, // 얼굴
  accessory: { x: 149, y: 98, size: 28 }, // 머리 옆 (리본·왕관)
  top: { x: 120, y: 172, size: 46 }, // 가슴
  set: { x: 120, y: 178, size: 46 },
  dress: { x: 120, y: 188, size: 54 }, // 몸통 전체
  bottom: { x: 120, y: 208, size: 42 }, // 다리
  socks: { x: 120, y: 228, size: 26 },
  shoes: { x: 120, y: 243, size: 30 }, // 발
  bag: { x: 76, y: 186, size: 38 }, // 옆구리
  pet: { x: 186, y: 232, size: 42 }, // 발치 옆
  misc: { x: 192, y: 88, size: 38 }, // 공중 (풍선)
};

type Props = {
  items: WornItem[]; // 착용 중 아이템 (배경 포함)
  size?: 'small' | 'large';
};

export function AvatarView({ items, size = 'small' }: Props) {
  const scale = size === 'large' ? 1.15 : 0.72;
  const w = STAGE.w * scale;
  const h = STAGE.h * scale;

  // layer_z 순으로 그리면 나중 것이 위에 온다. 배경은 항상 맨 뒤.
  const sorted = [...items].sort((a, b) => a.layer_z - b.layer_z);

  return (
    <View style={[styles.stage, { width: w, height: h }]}>
      {sorted
        .filter((i) => i.category === 'background')
        .map((it) => (
          <Text
            key="bg"
            style={[
              styles.glyph,
              posStyle(ANCHORS.background, scale),
              { opacity: 0.22, zIndex: 0 },
            ]}
          >
            {emojiOf(it.image_url)}
          </Text>
        ))}

      {/* 베이스 몸 */}
      <Text style={[styles.glyph, posStyle(BASE, scale), { zIndex: 10 }]}>🧍‍♀️</Text>

      {/* 착용 아이템 — 몸 위에 겹쳐 입는다 */}
      {sorted
        .filter((i) => i.category !== 'background')
        .map((it) => {
          const a = ANCHORS[it.category] ?? ANCHORS.misc;
          return (
            <Text
              key={`${it.category}-${it.name}`}
              style={[styles.glyph, posStyle(a, scale), { zIndex: 10 + it.layer_z }]}
            >
              {emojiOf(it.image_url)}
            </Text>
          );
        })}
    </View>
  );
}

/** 중심 좌표(x,y)와 크기를 절대 배치 스타일로 변환. */
function posStyle(a: { x: number; y: number; size: number }, scale: number) {
  const s = a.size * scale;
  return {
    position: 'absolute' as const,
    left: a.x * scale - s, // 텍스트 폭 여유(이모지 폭 ≈ fontSize)를 두고 중앙 정렬
    top: a.y * scale - s * 0.62,
    width: s * 2,
    fontSize: s,
    lineHeight: s * 1.25,
    textAlign: 'center' as const,
  };
}

const styles = StyleSheet.create({
  stage: {
    alignSelf: 'center',
    overflow: 'visible',
    backgroundColor: colors.card,
  },
  glyph: { includeFontPadding: false } as object,
});
