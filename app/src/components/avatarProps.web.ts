/**
 * 3D 프롭 카탈로그 (웹 전용) — asset_ref 'prop:*'를 three.js 프리미티브로 만든다.
 * TECH_DESIGN §7.2: 뼈(bone)에 부착하는 액세서리. VRoid 정식 에셋(B-2)로 교체되기 전의
 * "직접 만든 3D 소품" 단계 — 교체 시 build()만 GLB 로드로 바뀌면 된다.
 *
 * 좌표는 부착 뼈의 로컬 공간 기준 (모델 신장 ~1.6m 가정, 스크린샷으로 튜닝).
 */
import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';

// ── 파스텔 팔레트 (앱 테마와 결) ──
const C = {
  pink: 0xff5fa2,
  softPink: 0xffb3d1,
  gold: 0xffd34d,
  cream: 0xfff3dc,
  straw: 0xe8c97a,
  dark: 0x3a3344,
  white: 0xffffff,
  brown: 0xb9825a,
  mint: 0x8fe3c0,
  sky: 0x9ad8ff,
  red: 0xff6b6b,
  yellow: 0xffdf6b,
};

const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts });

const M = {
  sphere: (r: number, color: number, opts = {}) =>
    new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color, opts)),
  halfSphere: (r: number, color: number) =>
    new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color)),
  cylinder: (rt: number, rb: number, h: number, color: number, opts = {}) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 24), mat(color, opts)),
  cone: (r: number, h: number, color: number) =>
    new THREE.Mesh(new THREE.ConeGeometry(r, h, 20), mat(color)),
  torus: (r: number, tube: number, color: number, opts = {}) =>
    new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 32), mat(color, opts)),
  box: (w: number, h: number, d: number, color: number) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)),
  capsule: (r: number, len: number, color: number) =>
    new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat(color)),
  octa: (r: number, color: number, opts = {}) =>
    new THREE.Mesh(new THREE.OctahedronGeometry(r), mat(color, opts)),
};

const g = (...children: THREE.Object3D[]) => {
  const grp = new THREE.Group();
  children.forEach((c) => grp.add(c));
  return grp;
};
const at = <T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T => {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
};

export type PropDef = {
  bone: VRMHumanBoneName | 'world'; // 'world' = 씬 바닥 등 뼈와 무관
  build: () => THREE.Group;
  /** 착용 시 숨길 VRM 기본 의상 머티리얼 프리픽스 (예: 'Bottoms_01' → 기본 반바지 대체) */
  hideMats?: string[];
};

export const PROPS: Record<string, PropDef> = {
  // ── 모자 (head) ──
  cap: {
    bone: 'head',
    build: () =>
      at(g(M.halfSphere(0.105, C.pink), at(M.cylinder(0.1, 0.1, 0.012, C.pink), 0, 0.004, 0.085)), 0, 0.15, 0.005),
  },
  straw_hat: {
    bone: 'head',
    build: () =>
      at(g(M.halfSphere(0.095, C.straw), at(M.cylinder(0.185, 0.185, 0.01, C.straw), 0, 0.006, 0), at(M.torus(0.096, 0.008, C.pink), 0, 0.03, 0, Math.PI / 2)), 0, 0.15, 0),
  },
  top_hat: {
    bone: 'head',
    build: () =>
      at(g(at(M.cylinder(0.082, 0.086, 0.15, C.dark), 0, 0.085, 0), M.cylinder(0.135, 0.135, 0.012, C.dark), at(M.torus(0.085, 0.01, C.gold), 0, 0.02, 0, Math.PI / 2)), 0, 0.155, 0),
  },
  grad_cap: {
    bone: 'head',
    build: () =>
      at(g(M.halfSphere(0.098, C.dark), at(M.box(0.24, 0.012, 0.24, C.dark), 0, 0.05, 0), at(M.sphere(0.012, C.gold), 0, 0.062, 0), at(M.cylinder(0.003, 0.003, 0.1, C.gold), 0.11, 0.01, 0.11)), 0, 0.145, 0),
  },
  // ── 안경/선글라스 (head, 눈높이) ──
  round_glasses: {
    bone: 'head',
    build: () =>
      at(g(at(M.torus(0.03, 0.0035, C.dark), -0.04, 0, 0), at(M.torus(0.03, 0.0035, C.dark), 0.04, 0, 0), at(M.box(0.022, 0.004, 0.004, C.dark), 0, 0.008, 0)), 0, 0.045, 0.118),
  },
  goggles: {
    bone: 'head',
    build: () =>
      at(g(at(M.cylinder(0.032, 0.032, 0.008, C.sky, { transparent: true, opacity: 0.75 }), -0.04, 0, 0, Math.PI / 2), at(M.cylinder(0.032, 0.032, 0.008, C.sky, { transparent: true, opacity: 0.75 }), 0.04, 0, 0, Math.PI / 2), at(M.box(0.16, 0.014, 0.006, C.mint), 0, 0, -0.004)), 0, 0.05, 0.116),
  },
  sunglasses: {
    bone: 'head',
    build: () =>
      at(g(at(M.cylinder(0.03, 0.03, 0.006, C.dark), -0.04, 0, 0, Math.PI / 2), at(M.cylinder(0.03, 0.03, 0.006, C.dark), 0.04, 0, 0, Math.PI / 2), at(M.box(0.024, 0.005, 0.005, C.dark), 0, 0.01, 0)), 0, 0.045, 0.12),
  },
  // ── 동물 귀 (head) ──
  cat_ears: {
    bone: 'head',
    build: () =>
      at(g(at(M.cone(0.048, 0.1, C.brown), -0.062, 0, 0, 0, 0, 0.28), at(M.cone(0.048, 0.1, C.brown), 0.062, 0, 0, 0, 0, -0.28), at(M.cone(0.026, 0.055, C.softPink), -0.058, -0.004, 0.022, 0, 0, 0.28), at(M.cone(0.026, 0.055, C.softPink), 0.058, -0.004, 0.022, 0, 0, -0.28)), 0, 0.205, 0),
  },
  rabbit_ears: {
    bone: 'head',
    build: () =>
      at(g(at(M.capsule(0.02, 0.085, C.white), -0.045, 0.04, 0, 0, 0, 0.12), at(M.capsule(0.02, 0.085, C.white), 0.045, 0.04, 0, 0, 0, -0.12), at(M.capsule(0.01, 0.055, C.softPink), -0.045, 0.04, 0.012, 0, 0, 0.12), at(M.capsule(0.01, 0.055, C.softPink), 0.045, 0.04, 0.012, 0, 0, -0.12)), 0, 0.15, 0),
  },
  // ── 머리 위 링 (head, 회전 애니메이션) ──
  halo: {
    bone: 'head',
    build: () => {
      const grp = at(g(at(M.torus(0.07, 0.011, C.gold, { emissive: 0xcfa32e, emissiveIntensity: 0.5 }), 0, 0, 0, Math.PI / 2)), 0, 0.25, 0);
      grp.userData.spin = true;
      return grp;
    },
  },
  // ── 액세서리 (head) ──
  crown: {
    bone: 'head',
    build: () =>
      at(g(M.cylinder(0.085, 0.092, 0.05, C.gold, { emissive: 0xcfa32e, emissiveIntensity: 0.35 }), at(M.cone(0.016, 0.035, C.gold), -0.05, 0.035, 0), at(M.cone(0.016, 0.035, C.gold), 0, 0.04, 0.05), at(M.cone(0.016, 0.035, C.gold), 0.05, 0.035, 0), at(M.cone(0.016, 0.035, C.gold), 0, 0.04, -0.05), at(M.sphere(0.012, C.red), 0, 0.01, 0.075)), 0, 0.2, 0),
  },
  ribbon_pin: {
    bone: 'head',
    build: () =>
      at(g(at(M.cone(0.03, 0.06, C.pink), -0.034, 0, 0, 0, 0, Math.PI / 2), at(M.cone(0.03, 0.06, C.pink), 0.034, 0, 0, 0, 0, -Math.PI / 2), M.sphere(0.016, C.softPink)), 0.095, 0.14, 0.065, 0, 0, -0.3),
  },
  flower_pin: {
    bone: 'head',
    build: () => {
      const petals = [0, 1, 2, 3, 4].map((i) => at(M.sphere(0.016, C.white), Math.cos((i * 2 * Math.PI) / 5) * 0.026, Math.sin((i * 2 * Math.PI) / 5) * 0.026, 0));
      return at(g(...petals, at(M.sphere(0.015, C.yellow), 0, 0, 0.01)), -0.095, 0.14, 0.065, 0, 0, 0.3);
    },
  },
  // ── 목걸이 (chest 기준 — 가슴 위에 확실히 드리우게, 실측 z 보정) ──
  pearl_necklace: {
    bone: 'chest',
    build: () => {
      const pearls = Array.from({ length: 11 }, (_, i) => {
        const a = (i * 2 * Math.PI) / 11;
        const front = (Math.sin(a) + 1) / 2; // 0=뒤, 1=앞
        return at(
          M.sphere(0.018, 0xffb7d3, { emissive: 0xff5fa2, emissiveIntensity: 0.55, roughness: 0.25 }),
          Math.cos(a) * 0.062,
          0.155 - front * 0.06,
          Math.sin(a) * 0.05 + 0.062,
        );
      });
      return g(...pearls);
    },
  },
  diamond_necklace: {
    bone: 'chest',
    build: () =>
      g(
        at(M.torus(0.06, 0.007, 0x6f7580), 0, 0.145, 0.06, Math.PI / 1.7),
        at(M.octa(0.03, C.sky, { emissive: 0x5fb8ff, emissiveIntensity: 0.9, roughness: 0.2 }), 0, 0.075, 0.115),
      ),
  },
  // ── 손에 드는 것 ──
  wand: {
    bone: 'rightHand',
    build: () =>
      at(g(at(M.cylinder(0.007, 0.007, 0.2, C.brown), 0, 0.06, 0), at(M.octa(0.028, C.gold, { emissive: 0xcfa32e, emissiveIntensity: 0.6 }), 0, 0.18, 0)), 0, -0.08, 0.02, 0.35, 0, 0.5),
  },
  icecream: {
    bone: 'leftHand',
    build: () =>
      at(g(at(M.cone(0.028, 0.08, C.straw), 0, 0, 0, Math.PI), at(M.sphere(0.032, C.softPink), 0, 0.055, 0), at(M.sphere(0.01, C.red), 0, 0.085, 0)), 0, -0.09, 0.025, 0.3, 0, -0.5),
  },
  umbrella: {
    bone: 'rightHand',
    build: () =>
      at(g(at(M.cylinder(0.006, 0.006, 0.3, C.brown), 0, 0.1, 0), at(M.cone(0.15, 0.08, C.yellow), 0, 0.28, 0), at(M.sphere(0.01, C.pink), 0, 0.33, 0)), 0, -0.08, 0.02, 0.25, 0, 0.45),
  },
  // ── 소품/가방 ──
  balloon: {
    bone: 'chest',
    build: () => {
      const grp = g(at(M.sphere(0.06, C.red, { roughness: 0.35 }), 0.2, 0.42, 0.02), at(M.cylinder(0.0015, 0.0015, 0.34, C.dark), 0.2, 0.24, 0.02));
      grp.userData.bob = true; // 둥실둥실
      return grp;
    },
  },
  backpack: {
    bone: 'chest',
    build: () =>
      at(g(M.box(0.15, 0.19, 0.075, C.pink), at(M.box(0.1, 0.07, 0.03, C.softPink), 0, -0.05, -0.045), at(M.cylinder(0.008, 0.008, 0.18, C.softPink), -0.05, 0, 0.05), at(M.cylinder(0.008, 0.008, 0.18, C.softPink), 0.05, 0, 0.05)), 0, 0.04, -0.1),
  },
  // ── 옷 (정적 포즈에서 통하는 리지드 의류 — 진짜 스킨드 의상은 B-2 VRoid 에셋) ──
  tutu: {
    bone: 'hips',
    hideMats: ['Bottoms_01'],
    build: () =>
      at(g(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.185, 0.1, 28, 1, true), mat(0xffb3d1, { side: THREE.DoubleSide })), at(M.torus(0.1, 0.012, C.pink), 0, 0.05, 0, Math.PI / 2)), 0, -0.06, 0),
  },
  cape: {
    bone: 'chest',
    build: () => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 24, 1, true), mat(C.red, { side: THREE.DoubleSide }));
      cone.scale.z = 0.45;
      return at(g(at(cone, 0, -0.13, -0.08), at(M.sphere(0.032, C.red), -0.11, 0.13, -0.01), at(M.sphere(0.032, C.red), 0.11, 0.13, -0.01), at(M.torus(0.022, 0.009, C.gold, { emissive: 0xcfa32e, emissiveIntensity: 0.5 }), 0, 0.12, 0.075)), 0, 0.04, -0.02);
    },
  },
  scarf: {
    bone: 'neck',
    build: () =>
      g(at(M.torus(0.055, 0.034, C.red), 0, -0.012, 0.028, Math.PI / 2.05), at(M.box(0.055, 0.15, 0.03, C.red), 0.032, -0.1, 0.07, 0.15, 0, 0.1)),
  },
  // ── 바닥 (world) ──
  flower_rug: {
    bone: 'world',
    build: () => {
      const flowers = [0, 1, 2, 3, 4, 5].map((i) => at(M.sphere(0.02, i % 2 ? C.softPink : C.yellow), Math.cos((i * Math.PI) / 3) * 0.32, 0.015, Math.sin((i * Math.PI) / 3) * 0.32));
      return g(at(M.cylinder(0.42, 0.42, 0.012, 0xffe3ee), 0, 0.006, 0), at(M.torus(0.42, 0.008, C.softPink), 0, 0.012, 0, Math.PI / 2), ...flowers);
    },
  },
  cloud_cushion: {
    bone: 'world',
    build: () => {
      const grp = g(at(M.sphere(0.16, C.white, { roughness: 0.9 }), 0, 0.03, 0), at(M.sphere(0.12, C.white, { roughness: 0.9 }), -0.16, 0.02, 0.03), at(M.sphere(0.12, C.white, { roughness: 0.9 }), 0.16, 0.02, -0.02));
      grp.scale.y = 0.45;
      return grp;
    },
  },
};

/** 그룹 지오메트리/머티리얼 정리 (탈착 시 메모리 누수 방지) */
export function disposeProp(obj: THREE.Object3D): void {
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
}

/** 무대 배경 프리셋 — asset_ref 'env:*' (배경 아이템) */
export const ENV_GRADIENTS: Record<string, string> = {
  default: 'linear-gradient(180deg, #FFF6EC 0%, #FFEAF3 78%, #FFE3EE 100%)',
  sakura: 'linear-gradient(180deg, #FFEFF5 0%, #FFD9E8 70%, #FFCCE0 100%)',
  ocean: 'linear-gradient(180deg, #E8F8FF 0%, #BFE9FF 70%, #A5DEFF 100%)',
  night: 'linear-gradient(180deg, #2A2C52 0%, #414479 70%, #565A96 100%)',
  rainbow: 'linear-gradient(180deg, #FFE9EC 0%, #FFF6D9 30%, #E3FFE5 60%, #DFEFFF 85%, #F1E3FF 100%)',
  space: 'linear-gradient(180deg, #191633 0%, #2E2359 60%, #45307E 100%)',
  xmas: 'linear-gradient(180deg, #F3FFF4 0%, #DFF5E1 60%, #FFE3E3 100%)',
};
