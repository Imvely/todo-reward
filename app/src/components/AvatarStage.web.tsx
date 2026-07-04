/**
 * 3D 아바타 무대 (웹 전용) — TECH_DESIGN §7.
 * three/R3F/three-vrm은 이 파일에서만 import한다 (.web.tsx → 네이티브 번들 미포함).
 *
 * B-0 스파이크: VRM 로드 + 회전(드래그) + 캡처. 의상 메시 토글은 B-1에서
 * items의 asset_ref로 배선한다 (지금 카탈로그엔 asset_ref가 없어 3D에는 미반영).
 */
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { colors } from '../theme';
import type { WornItem } from './AvatarView';

export type AvatarStageProps = {
  items: WornItem[]; // 착용 아이템 (B-1에서 asset_ref 기반 메시 토글에 사용)
  height?: number;
  /** 캡처 함수를 부모에 전달 — 호출 시 PNG dataURL 반환 */
  onReady?: (capture: () => string | null) => void;
};

const VRM_URL = '/avatar/base.vrm'; // app/public → 웹 루트에 정적 서빙

function VrmModel({ items }: { items: WornItem[] }) {
  const gltf = useLoader(GLTFLoader, VRM_URL, (loader) => {
    (loader as GLTFLoader).register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = gltf.userData.vrm as VRM;

  // 경량화 + 기본 포즈 (마운트 시 1회). VRM 0.x 구모델만 180° 보정 (1.0은 기본이 정면).
  useMemo(() => {
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    if (vrm.meta?.metaVersion === '0') vrm.scene.rotation.y = Math.PI;
    // T-포즈 → 팔 내린 편안한 자세 (idle 애니메이션은 B-3에서)
    const l = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const r = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    if (l) l.rotation.z = -1.15;
    if (r) r.rotation.z = 1.15;
    return vrm;
  }, [vrm]);

  // B-1: items의 asset_ref ↔ 노드명 매칭으로 의상 가시성 토글 예정 (§7.2)
  useEffect(() => {
    void items;
  }, [items, vrm]);

  // 스프링본(리본·치마 물리)·표정 업데이트
  useFrame((_, delta) => vrm.update(delta));

  return <primitive object={vrm.scene} />;
}

export function AvatarStage({ items, height = 340, onReady }: AvatarStageProps) {
  return (
    <View style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden' }}>
      <Canvas
        // 캡처("이미지로 저장")를 위해 드로잉 버퍼 보존
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        camera={{ position: [0, 1.1, 1.9], fov: 32 }}
        onCreated={({ gl }) => {
          onReady?.(() => {
            try {
              return gl.domElement.toDataURL('image/png');
            } catch {
              return null;
            }
          });
        }}
        style={{ background: colors.paper }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[2, 3, 2]} intensity={1.4} />
        <Suspense fallback={null}>
          <VrmModel items={items} />
        </Suspense>
        {/* 수평 회전 중심을 상체(y≈0.95)에 두고, 위아래·줌은 제한 */}
        <OrbitControls
          target={[0, 0.95, 0]}
          enablePan={false}
          minDistance={1.2}
          maxDistance={3}
          minPolarAngle={Math.PI / 2.6}
          maxPolarAngle={Math.PI / 1.9}
        />
      </Canvas>
    </View>
  );
}

export function AvatarStageFallback({ height = 340 }: { height?: number }) {
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.a} size="large" />
    </View>
  );
}
