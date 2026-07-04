/**
 * 3D 아바타 무대 — 네이티브 폴백 (TECH_DESIGN §7.1).
 * three/expo-gl 호환 리스크를 피해 네이티브는 2D AvatarView를 쓴다.
 * (Phase 6에서 WebView 임베드로 3D 제공 예정)
 */
import { View } from 'react-native';

import { AvatarView, type WornItem } from './AvatarView';

export type AvatarStageProps = {
  items: WornItem[];
  height?: number;
  onReady?: (capture: () => string | null) => void;
};

export function AvatarStage({ items, height = 460, onReady }: AvatarStageProps) {
  // 네이티브 캡처는 추후 view-shot — 지금은 미지원 신호(null)
  onReady?.(() => null);
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      <AvatarView items={items} size="large" />
    </View>
  );
}
