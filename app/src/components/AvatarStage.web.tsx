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

    // 기본 의상 교체: 착용 프롭의 hideMats에 따라 VRM 의상 머티리얼을 숨긴다
    // (예: 튜튜 착용 → 기본 반바지 'Bottoms_01_CLOTH' 숨김).
    // combineSkeletons가 프리미티브를 병합해 material이 배열일 수 있으므로
    // 메시가 아닌 "머티리얼 단위" visible로 제어한다 (_CLOTH만).
    const hidePrefixes = [...wanted].flatMap((k) => PROPS[k]?.hideMats ?? []);
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || typeof m.name !== 'string' || !m.name.includes('_CLOTH')) continue;
        m.visible = !hidePrefixes.some((h) => m.name.startsWith(h));
      }
    });
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

/** 배경 아이템 전용 데코 — "배경 = 그라데이션 + 파티클 + 소품" 세트로 값어치 있게. */
function EnvDecor({ envKey }: { envKey: string }) {
  const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });

  const decor = useMemo(() => {
    const grp = new THREE.Group();
    if (envKey === 'night') {
      // 달
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 24, 16),
        std(0xfff3dc, { emissive: 0xffe9b8, emissiveIntensity: 0.9 }),
      );
      moon.position.set(-0.72, 1.95, -1.1);
      grp.add(moon);
    } else if (envKey === 'space') {
      // 고리 행성
      const planet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), std(0xb9a0ff, { emissive: 0x6a4fd0, emissiveIntensity: 0.5 }));
      planet.position.set(0.72, 1.85, -1.2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 10, 40), std(0xffd34d, { emissive: 0xcfa32e, emissiveIntensity: 0.5 }));
      ring.position.copy(planet.position);
      ring.rotation.x = Math.PI / 2.6;
      grp.add(planet, ring);
    } else if (envKey === 'xmas') {
      // 트리 (3단 콘 + 별)
      const tree = new THREE.Group();
      const green = 0x2f9e5f;
      [
        [0.3, 0.34, 0.34],
        [0.24, 0.3, 0.6],
        [0.17, 0.26, 0.84],
      ].forEach(([r, h, y]) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 20), std(green));
        c.position.y = y;
        tree.add(c);
      });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 12), std(0xb9825a));
      trunk.position.y = 0.1;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), std(0xffd34d, { emissive: 0xcfa32e, emissiveIntensity: 0.8 }));
      star.position.y = 1.03;
      tree.add(trunk, star);
      tree.position.set(-0.8, 0, -0.9);
      grp.add(tree);
    } else if (envKey === 'rainbow') {
      // 무지개 아치 (반원 토러스 3겹)
      [0xff8fa9, 0xffdf6b, 0x8fe3c0].forEach((color, i) => {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.05 + i * 0.09, 0.035, 10, 48, Math.PI), std(color, { emissive: color, emissiveIntensity: 0.25 }));
        arc.position.set(0, 0.25, -1.3);
        grp.add(arc);
      });
    } else if (envKey === 'ocean') {
      // 물빛 바닥
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.3, 0.01, 40),
        std(0x9ad8ff, { transparent: true, opacity: 0.45, roughness: 0.2 }),
      );
      water.position.y = 0.004;
      grp.add(water);
    }
    return grp;
  }, [envKey]);

  return (
    <>
      <primitive object={decor} />
      {envKey === 'sakura' ? (
        <>
          <Sparkles count={70} scale={[2.4, 2.2, 1.6]} position={[0, 1.2, -0.3]} size={6} speed={0.25} color="#FFAFCB" />
          <Sparkles count={30} scale={[2, 2, 1.2]} position={[0, 1.1, -0.2]} size={3} speed={0.15} color="#FFFFFF" />
        </>
      ) : null}
      {envKey === 'ocean' ? (
        <Sparkles count={50} scale={[2.2, 2, 1.4]} position={[0, 1, -0.3]} size={4} speed={0.4} color="#7FD1FF" />
      ) : null}
      {envKey === 'night' ? (
        <Sparkles count={90} scale={[2.6, 2.4, 1.6]} position={[0, 1.4, -0.5]} size={2.5} speed={0.08} color="#FFF6D8" />
      ) : null}
      {envKey === 'rainbow' ? (
        <Sparkles count={40} scale={[2.2, 2, 1.2]} position={[0, 1.2, -0.4]} size={4} speed={0.3} color="#FFE28A" />
      ) : null}
      {envKey === 'space' ? (
        <>
          <Sparkles count={110} scale={[2.6, 2.6, 1.8]} position={[0, 1.3, -0.6]} size={2.5} speed={0.06} color="#FFFFFF" />
          <Sparkles count={35} scale={[2.2, 2.2, 1.4]} position={[0, 1.2, -0.5]} size={4} speed={0.12} color="#C9A8FF" />
        </>
      ) : null}
      {envKey === 'xmas' ? (
        <Sparkles count={80} scale={[2.4, 2.4, 1.6]} position={[0, 1.3, -0.3]} size={3.5} speed={0.5} color="#FFFFFF" />
      ) : null}
    </>
  );
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
        {/* 'env:*' — 배경 전용 데코 (파티클 + 소품) */}
        <EnvDecor envKey={envKey} />
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
