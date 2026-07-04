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

import { makeEnvTexture } from './avatarEnvs.web';
import { COMBOS, disposeProp, ENV_GRADIENTS, PROPS, TINTABLE_PREFIXES } from './avatarProps.web';
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

  // 착용 반영: prop(프롭) + combo(세트=프롭·리컬러·숨김 묶음) + tint(기본 옷 리컬러)
  useEffect(() => {
    const wanted = new Set(refsOf(items, 'prop:'));
    const tints = new Map<string, number>(); // 머티리얼 프리픽스 → 색
    const comboHides: string[] = [];
    for (const it of items) {
      const r = it.asset_ref;
      if (!r) continue;
      if (r.startsWith('combo:')) {
        const c = COMBOS[r.slice(6)];
        c?.props?.forEach((k) => wanted.add(k));
        c?.tints?.forEach(([pre, hex]) => tints.set(pre, hex));
        c?.hideMats?.forEach((h) => comboHides.push(h));
      } else if (r.startsWith('tint:')) {
        // 'tint:Tops:#ff5fa2' — 기본 의상/머리 리컬러 (몸에 딱 맞는 "다른 옷")
        const [, pre, hex] = r.split(':');
        if (pre && hex) tints.set(pre, parseInt(hex.replace('#', ''), 16));
      }
    }
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

    // 기본 의상 숨김(hideMats) + 리컬러(tint) — 머티리얼 단위 제어 (_CLOTH/_HAIR만).
    // combineSkeletons가 프리미티브를 병합해 material이 배열일 수 있으므로 메시가 아닌
    // 머티리얼 visible/color로 제어한다. 원래 색은 userData에 캐시해 벗으면 복원.
    const hidePrefixes = [...wanted].flatMap((k) => PROPS[k]?.hideMats ?? []).concat(comboHides);
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || typeof m.name !== 'string') continue;
        if (!m.name.includes('_CLOTH') && !m.name.includes('_HAIR')) continue;
        m.visible = !hidePrefixes.some((h) => m.name.startsWith(h));
        // 리컬러: MToon color 교체 (원본 캐시 후, 착용 틴트 적용 / 없으면 복원)
        const mc = m as THREE.Material & {
          color?: THREE.Color;
          map?: THREE.Texture | null;
          userData: Record<string, unknown>;
        };
        if (!mc.color) continue;
        if (mc.userData.__origColor === undefined) {
          mc.userData.__origColor = mc.color.getHex();
          mc.userData.__origMap = mc.map ?? null;
        }
        const pre = TINTABLE_PREFIXES.find((tp) => m.name.startsWith(tp));
        const tint = pre ? tints.get(pre) : undefined;
        if (tint !== undefined) {
          mc.color.setHex(tint);
          // 원단 텍스처가 어두우면 색 곱셈이 안 먹는다 → 틴트 중엔 단색 원단으로
          if (mc.map) {
            mc.map = null;
            mc.needsUpdate = true;
          }
        } else {
          mc.color.setHex(mc.userData.__origColor as number);
          if (mc.map !== (mc.userData.__origMap as THREE.Texture | null)) {
            mc.map = mc.userData.__origMap as THREE.Texture | null;
            mc.needsUpdate = true;
          }
        }
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

/** 배경 아이템 전용 데코 — 그라데이션 + 파티클 + 소품 + 모션까지 한 세트. */
function EnvDecor({ envKey }: { envKey: string }) {
  const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });

  const decor = useMemo(() => {
    const grp = new THREE.Group();
    if (envKey === 'night') {
      // (달·별은 배경 일러스트에 그림 — 3D는 움직이는 요소만)
      // 별똥별 2개 — 대각선으로 떨어지며 반복
      for (let i = 0; i < 2; i++) {
        const shoot = new THREE.Group();
        const headM = new THREE.Mesh(
          new THREE.SphereGeometry(0.02, 10, 8),
          std(0xffffff, { emissive: 0xfff2b8, emissiveIntensity: 1 }),
        );
        const trail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.004, 0.012, 0.34, 8),
          new THREE.MeshBasicMaterial({ color: 0xfff2b8, transparent: true, opacity: 0.6 }),
        );
        trail.position.set(0.12, 0.12, 0);
        trail.rotation.z = Math.PI / 4;
        shoot.add(headM, trail);
        shoot.userData.anim = { type: 'shoot', phase: i * 0.55 };
        grp.add(shoot);
      }
      // 폭죽 — 중심에서 방사형으로 퍼졌다 사라지는 불꽃 12발 × 2군데
      [
        [0.75, 1.75, -1.2, 0xff8fbe],
        [-0.35, 2.05, -1.3, 0xffd34d],
      ].forEach(([x, y, z, color], k) => {
        const burst = new THREE.Group();
        for (let i = 0; i < 12; i++) {
          const a = (i * 2 * Math.PI) / 12;
          const sparkM = new THREE.Mesh(
            new THREE.SphereGeometry(0.016, 8, 6),
            new THREE.MeshBasicMaterial({ color: color as number, transparent: true }),
          );
          sparkM.userData.dir = [Math.cos(a), Math.sin(a)];
          burst.add(sparkM);
        }
        burst.position.set(x as number, y as number, z as number);
        burst.userData.anim = { type: 'burst', phase: k * 0.5 };
        grp.add(burst);
      });
    } else if (envKey === 'space') {
      const planet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), std(0xb9a0ff, { emissive: 0x6a4fd0, emissiveIntensity: 0.5 }));
      planet.position.set(0.72, 1.85, -1.2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 10, 40), std(0xffd34d, { emissive: 0xcfa32e, emissiveIntensity: 0.5 }));
      ring.position.copy(planet.position);
      ring.rotation.x = Math.PI / 2.6;
      // 로켓 궤도 — 행성 주위를 도는 미니 로켓(캡슐+콘)
      const rocket = new THREE.Group();
      const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.05, 4, 10), std(0xffffff));
      const noseM = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.035, 10), std(0xff6b6b));
      noseM.position.y = 0.055;
      rocket.add(bodyM, noseM);
      rocket.userData.anim = { type: 'orbit', cx: 0.72, cy: 1.85, cz: -1.2, r: 0.42 };
      grp.add(planet, ring, rocket);
    } else if (envKey === 'xmas') {
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
      star.userData.anim = { type: 'spinY' };
      // 트리 방울 장식
      [0xff6b6b, 0xffd34d, 0x9ad8ff, 0xff8fbe].forEach((c2, i) => {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), std(c2, { emissive: c2, emissiveIntensity: 0.35 }));
        const a = i * 1.7;
        ball.position.set(Math.cos(a) * 0.18, 0.42 + i * 0.14, Math.sin(a) * 0.14 + 0.08);
        tree.add(ball);
      });
      tree.add(trunk, star);
      tree.position.set(-0.8, 0, -0.9);
      // 선물 상자 2개
      [
        [0xff8fbe, -0.5, 0.06, -0.75, 0.12],
        [0x9ad8ff, -1.05, 0.05, -0.7, 0.1],
      ].forEach(([c3, x, y, z, sz]) => {
        const gift = new THREE.Mesh(new THREE.BoxGeometry(sz as number, sz as number, sz as number), std(c3 as number));
        gift.position.set(x as number, y as number, z as number);
        grp.add(gift);
      });
      grp.add(tree);
    } else if (envKey === 'rainbow') {
      // (무지개 아치는 배경 일러스트에 그림)
      // 둥실대는 구름
      [-1.1, 1.1].forEach((x) => {
        const cloud = new THREE.Group();
        [
          [0, 0, 0, 0.14],
          [-0.12, -0.02, 0.02, 0.1],
          [0.12, -0.02, 0.02, 0.1],
        ].forEach(([cx, cy, cz, r]) => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(r as number, 14, 10), std(0xffffff, { roughness: 0.9 }));
          m.position.set(cx as number, cy as number, cz as number);
          cloud.add(m);
        });
        cloud.position.set(x, 0.3, -1.25);
        cloud.userData.anim = { type: 'bob' };
        grp.add(cloud);
      });
    } else if (envKey === 'ocean') {
      // 모래사장
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.012, 44), std(0xf2dcae, { roughness: 0.95 }));
      sand.position.y = 0.002;
      grp.add(sand);
      // 야자수 — 기울어진 줄기 + 잎 6장 + 코코넛
      const palm = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035 - i * 0.004, 0.042 - i * 0.004, 0.3, 10), std(0xb9825a));
        seg.position.set(i * 0.05, 0.15 + i * 0.28, 0);
        seg.rotation.z = -0.18;
        palm.add(seg);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i * 2 * Math.PI) / 6;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), std(0x3fae6a));
        leaf.position.set(0.2 + Math.cos(a) * 0.22, 1.28, Math.sin(a) * 0.22);
        leaf.rotation.set(Math.sin(a) * 1.25, 0, Math.PI / 2.2 + Math.cos(a) * 1.25);
        leaf.userData.anim = { type: 'sway', phase: i };
        palm.add(leaf);
      }
      [[-0.03, 0.05], [0.06, -0.04]].forEach(([dx, dz]) => {
        const coco = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std(0x8a5a3a));
        coco.position.set(0.2 + (dx as number), 1.16, dz as number);
        palm.add(coco);
      });
      palm.position.set(0.85, 0, -0.75);
      grp.add(palm);
      // 파도 — 해변으로 밀려오는 반투명 물결 2겹 (애니메이션)
      for (let i = 0; i < 2; i++) {
        const wave = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.15, 0.014, 44, 1, false),
          new THREE.MeshStandardMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.4, roughness: 0.15 }),
        );
        wave.position.set(0, 0.012 + i * 0.006, -0.55);
        wave.userData.anim = { type: 'wave', phase: i * 0.5 };
        grp.add(wave);
      }
    }
    if (envKey === 'sakura') {
      for (let i = 0; i < 12; i++) {
        const petal = new THREE.Mesh(
          new THREE.SphereGeometry(0.02, 8, 6),
          std(i % 2 ? 0xffafcb : 0xffd2e1, { side: THREE.DoubleSide }),
        );
        petal.scale.set(1, 0.45, 0.7);
        petal.userData.anim = { type: 'petal', phase: i / 12, x0: -1.1 + (i % 6) * 0.44 };
        grp.add(petal);
      }
    }
    if (envKey === 'xmas') {
      for (let i = 0; i < 16; i++) {
        const flake = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), std(0xffffff));
        flake.userData.anim = { type: 'snow', phase: i / 16, x0: -1.2 + (i % 8) * 0.34 };
        grp.add(flake);
      }
    }
    return grp;
  }, [envKey]);

  // 데코 모션: 별똥별/폭죽/파도/야자잎/구름/궤도
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    decor.traverse((o) => {
      const anim = o.userData.anim as { type: string; phase?: number; cx?: number; cy?: number; cz?: number; r?: number } | undefined;
      if (!anim) return;
      if (anim.type === 'shoot') {
        const cycle = 3.2;
        const k = ((t + (anim.phase ?? 0) * cycle) % cycle) / cycle;
        o.position.set(-1.3 + k * 2.1, 2.25 - k * 0.85, -1.35);
        const fade = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
        o.traverse((c) => {
          const m = (c as THREE.Mesh).material as THREE.Material & { opacity?: number };
          if (m) {
            m.transparent = true;
            m.opacity = fade * ((c as THREE.Mesh).geometry?.type === 'CylinderGeometry' ? 0.55 : 1);
          }
        });
      } else if (anim.type === 'burst') {
        const cycle = 2.6;
        const k = ((t + (anim.phase ?? 0) * cycle) % cycle) / cycle;
        const grow = Math.min(1, k * 2.2);
        const fade = k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.4);
        o.children.forEach((spark) => {
          const dir = spark.userData.dir as [number, number];
          spark.position.set(dir[0] * grow * 0.3, dir[1] * grow * 0.3, 0);
          const m = (spark as THREE.Mesh).material as THREE.Material & { opacity?: number };
          if (m) m.opacity = fade;
        });
      } else if (anim.type === 'wave') {
        const k = (Math.sin(t * 0.9 + (anim.phase ?? 0) * Math.PI * 2) + 1) / 2;
        o.position.z = -0.75 + k * 0.45; // 해변으로 밀려왔다 빠짐
        const m = (o as THREE.Mesh).material as THREE.Material & { opacity?: number };
        if (m) m.opacity = 0.18 + (1 - k) * 0.3;
      } else if (anim.type === 'petal') {
        const cycle = 6;
        const k = ((t * 0.9 + (anim.phase ?? 0) * cycle) % cycle) / cycle;
        o.position.set(
          ((anim as { x0?: number }).x0 ?? 0) + Math.sin(t * 1.7 + (anim.phase ?? 0) * 9) * 0.22,
          1.95 - k * 1.9,
          -0.5 - ((anim.phase ?? 0) % 0.4),
        );
        o.rotation.set(t * 2 + (anim.phase ?? 0) * 5, 0, t * 1.4);
      } else if (anim.type === 'snow') {
        const cycle = 7;
        const k = ((t * 0.8 + (anim.phase ?? 0) * cycle) % cycle) / cycle;
        o.position.set(
          ((anim as { x0?: number }).x0 ?? 0) + Math.sin(t + (anim.phase ?? 0) * 7) * 0.15,
          2.1 - k * 2.05,
          -0.55 - ((anim.phase ?? 0) % 0.5),
        );
      } else if (anim.type === 'sway') {
        o.rotation.y = Math.sin(t * 1.6 + (anim.phase ?? 0)) * 0.08;
      } else if (anim.type === 'bob') {
        o.position.y = 0.3 + Math.sin(t * 1.1 + o.position.x) * 0.03;
      } else if (anim.type === 'spinY') {
        o.rotation.y = t * 1.2;
      } else if (anim.type === 'orbit') {
        const a = t * 0.7;
        o.position.set(
          (anim.cx ?? 0) + Math.cos(a) * (anim.r ?? 0.4),
          (anim.cy ?? 0) + Math.sin(a) * 0.12,
          (anim.cz ?? 0) + Math.sin(a) * 0.2,
        );
        o.rotation.z = -a - Math.PI / 2;
      }
    });
  });

  return <primitive object={decor} />;
}

export function AvatarStage({ items, height = 460, onReady }: AvatarStageProps) {
  // 'env:*' — 배경 아이템 = 일러스트 배경(360° 실린더) + 3D 소품 + 그라데이션
  const envKey = refsOf(items, 'env:')[0] ?? 'default';
  const fxKeys = refsOf(items, 'fx:');
  const bgTex = useMemo(() => makeEnvTexture(envKey), [envKey]);
  useEffect(() => () => bgTex?.dispose(), [bgTex]);

  return (
    <View style={{ height, width: '100%', borderRadius: 20, overflow: 'hidden' }}>
      <Canvas
        // 캡처("이미지로 저장")를 위해 드로잉 버퍼 보존
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        // 머리 위(모자·천사링)와 발치(펫·바닥)까지 여유 있게 잡는 프레이밍
        camera={{ position: [0, 0.95, 2.8], fov: 36 }}
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
        {/* 일러스트 배경 — 캐릭터를 360°로 감싸는 실린더에 그림 텍스처 (회전해도 배경 유지) */}
        {bgTex ? (
          <mesh position={[0, 1.35, 0]}>
            <cylinderGeometry args={[2.7, 2.7, 5.4, 48, 1, true]} />
            <meshBasicMaterial map={bgTex} side={THREE.BackSide} toneMapped={false} />
          </mesh>
        ) : null}
        {/* 'env:*' — 배경 전용 3D 소품 (야자수·파도·별똥별·폭죽·트리 등) */}
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
        {/* 회전 + 확대(0.6까지 클로즈업) + 위아래 이동(드래그 두 손가락/우클릭)으로
            얼굴·신발 디테일까지 볼 수 있다 */}
        <OrbitControls
          target={[0, 0.85, 0]}
          enablePan
          screenSpacePanning
          panSpeed={0.8}
          minDistance={0.6}
          maxDistance={3.4}
          minPolarAngle={Math.PI / 3.2}
          maxPolarAngle={Math.PI / 1.75}
        />
      </Canvas>
    </View>
  );
}
