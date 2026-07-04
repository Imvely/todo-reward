/**
 * 3D 아바타 무대 (웹 전용) — TECH_DESIGN §7.
 * three/R3F/three-vrm은 이 파일에서만 import한다 (.web.tsx → 네이티브 번들 미포함).
 *
 * 착용 반영 (B-1): 착용 아이템의 asset_ref에 따라
 *  - 'prop:*'  → avatarProps의 3D 프롭을 뼈에 부착/해제
 *  - 'fx:*'    → 파티클 이펙트 (Sparkles)
 *  - 'env:*'   → 무대 배경 그라데이션
 *  - 'mat:*'   → VRM 머티리얼 가시성 토글 (B-2 의상 에셋에서 사용 예정)
 * asset_ref가 없는 아이템은 3D 미표현 (상점에서 비활성 — seed_shop.ASSET_REFS).
 */
import { ContactShadows, OrbitControls, Sparkles } from '@react-three/drei';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import * as THREE from 'three';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { disposeProp, ENV_GRADIENTS, PROPS } from './avatarProps.web';
import type { WornItem } from './AvatarView';

export type AvatarStageProps = {
  items: WornItem[]; // 착용/시착 아이템 (asset_ref 기반 3D 반영)
  height?: number;
  /** 캡처 함수를 부모에 전달 — 호출 시 PNG dataURL 반환 */
  onReady?: (capture: () => string | null) => void;
};

const VRM_URL = '/avatar/base.vrm'; // app/public → 웹 루트에 정적 서빙

const refsOf = (items: WornItem[], prefix: string) =>
  items
    .map((i) => i.asset_ref)
    .filter((r): r is string => !!r && r.startsWith(prefix))
    .map((r) => r.slice(prefix.length));

function VrmModel({ items }: { items: WornItem[] }) {
  const gltf = useLoader(GLTFLoader, VRM_URL, (loader) => {
    (loader as GLTFLoader).register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = gltf.userData.vrm as VRM;
  const mounted = useRef<Map<string, THREE.Object3D>>(new Map());

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

  // 'prop:*' — 착용 변화에 따라 뼈에 프롭을 부착/해제 (§7.2)
  useEffect(() => {
    const wanted = new Set(refsOf(items, 'prop:'));
    for (const [key, obj] of mounted.current) {
      if (!wanted.has(key)) {
        obj.parent?.remove(obj);
        disposeProp(obj);
        mounted.current.delete(key);
      }
    }
    for (const key of wanted) {
      if (mounted.current.has(key)) continue;
      const def = PROPS[key];
      if (!def) continue;
      const obj = def.build();
      if (def.bone === 'world') {
        vrm.scene.add(obj);
        mounted.current.set(key, obj);
        continue;
      }
      const bone = vrm.humanoid?.getRawBoneNode(def.bone);
      if (!bone) continue;
      // ★ VRM 원시 뼈는 축 방향이 제각각 → 월드 회전을 상쇄하는 홀더를 끼워
      //   프롭 좌표계를 "월드 y=위, z=앞"으로 교정한다 (정적 포즈 전제, idle 도입 시 재검토).
      const holder = new THREE.Group();
      bone.add(holder);
      bone.updateWorldMatrix(true, false);
      const q = new THREE.Quaternion();
      bone.getWorldQuaternion(q);
      holder.quaternion.copy(q).invert();
      holder.add(obj);
      holder.userData = obj.userData; // spin/bob 애니메이션 플래그 승계
      mounted.current.set(key, holder);
    }
  }, [items, vrm]);

  // 스프링본 물리 + 프롭 애니메이션 (천사링 회전, 풍선 둥실)
  // 홀더의 보정 회전을 건드리지 않도록 내부 오브젝트를 움직인다.
  useFrame((state, delta) => {
    vrm.update(delta);
    for (const holder of mounted.current.values()) {
      const inner = (holder.children[0] ?? holder) as THREE.Object3D;
      if (holder.userData.spin) inner.rotation.y += delta * 1.6;
      if (holder.userData.bob) inner.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.02;
    }
  });

  return <primitive object={vrm.scene} />;
}

export function AvatarStage({ items, height = 460, onReady }: AvatarStageProps) {
  // 'env:*' — 배경 아이템이 무대 그라데이션을 바꾼다
  const envKey = refsOf(items, 'env:')[0] ?? 'default';
  const fxKeys = refsOf(items, 'fx:');

  return (
    <View style={{ height, width: '100%', borderRadius: 20, overflow: 'hidden' }}>
      <Canvas
        // 캡처("이미지로 저장")를 위해 드로잉 버퍼 보존
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        // 머리 위(모자·천사링)와 발치(펫·바닥)까지 여유 있게 잡는 프레이밍
        camera={{ position: [0, 1.0, 2.45], fov: 35 }}
        onCreated={({ gl }) => {
          onReady?.(() => {
            try {
              return gl.domElement.toDataURL('image/png');
            } catch {
              return null;
            }
          });
        }}
        style={{ background: ENV_GRADIENTS[envKey] ?? ENV_GRADIENTS.default }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[2, 3, 2]} intensity={1.4} />
        <Suspense fallback={null}>
          <VrmModel items={items} />
        </Suspense>
        {/* 'fx:*' — 이펙트 아이템 파티클 */}
        {fxKeys.includes('sparkle_gold') ? (
          <Sparkles count={45} scale={[0.9, 1.5, 0.9]} position={[0, 0.9, 0]} size={4} speed={0.35} color="#FFD34D" />
        ) : null}
        {fxKeys.includes('sparkle_pink') ? (
          <Sparkles count={45} scale={[0.9, 1.5, 0.9]} position={[0, 0.9, 0]} size={4} speed={0.5} color="#FF8FBE" />
        ) : null}
        {/* 발밑 부드러운 그림자 — 붕 뜬 느낌 제거 */}
        <ContactShadows position={[0, 0.01, 0]} opacity={0.32} scale={2.6} blur={2.6} far={0.9} />
        {/* 수평 회전 중심을 몸통(y≈0.9)에 두고, 위아래·줌은 제한 */}
        <OrbitControls
          target={[0, 0.9, 0]}
          enablePan={false}
          minDistance={1.4}
          maxDistance={3.2}
          minPolarAngle={Math.PI / 2.7}
          maxPolarAngle={Math.PI / 1.85}
        />
      </Canvas>
    </View>
  );
}
