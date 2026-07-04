# 리얼/3D 아바타 + 실제 착용 시스템 기술 조사 (2026-07-04)

> 질문: 아바타를 3D 느낌으로 리얼하게, 착용도 실제처럼(옷이 몸에 맞게) 하려면 무엇이 필요한가.
> 현재 구조: AvatarView(카테고리 앵커 좌표 + layer_z) 위에 이모지 글리프를 겹치는 플레이스홀더.

## 핵심 결론 (요약)

| 단계 | 방식 | 3D 느낌 | 실제 착용감 | 제작 난이도 | 지금 구조 재사용 |
|---|---|---|---|---|---|
| **1단계 (권장)** | 프리렌더 2.5D — Blender에서 3D 캐릭터·의상을 부위별 투명 PNG로 렌더 → 런타임 레이어 합성 | ★★★☆ | ★★★☆ | 중 (에셋 제작만) | **100%** (image_url만 교체) |
| **2단계** | 진짜 3D — VRM 아바타 + three.js(three-vrm)로 실시간 렌더, 의상 메시 스왑 | ★★★★★ | ★★★★★ | 상 | 코드 신규 (DB 구조는 유지) |
| 비추천 | 셀피 기반 리얼 아바타 SaaS (Avatar SDK/Avaturn/Union) | ★★★★★ | SDK 의존 | 하 | 유료 + 가족 앱에 과함 |

## 시장 상황 (중요 변동)

- **Ready Player Me 사망**: 무료 3D 아바타의 사실상 표준이었으나 **Netflix에 인수되어 2026-01-31 서비스 종료**.
  RPM 기반 설계는 불가. ([TechCrunch](https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/), [공지](https://forum.readyplayer.me/t/ready-player-me-x-player-zero/1265))
- 대체 SaaS: [Avatar SDK(MetaPerson)](https://avatarsdk.com/ready-player-me-alternative/), [Avaturn](https://streamoji.com/blog/ready-player-me-alternatives-2026), Union Avatars — 전부 셀피→리얼 3D, **유료 SaaS**. 2인용 취미 앱엔 과금·의존성 부담.
- 살아있는 무료 생태계: **VRM 포맷 + VRoid Studio(무료 제작툴) + @pixiv/three-vrm(three.js 렌더러)** — 오픈 표준, 활발히 유지보수.

## "실제 착용"의 핵심 기술: 스킨드 메시 의상 스왑

진짜 3D에서 옷이 몸에 맞는 원리 ([GameDev](https://gamedev.net/forums/topic/710077-how-to-implement-a-modular-clothing-system/), [gltf-avatar-threejs](https://github.com/shrekshao/gltf-avatar-threejs)):

1. **하나의 스켈레톤(뼈대)을 모든 에셋이 공유** — 몸·옷·머리가 같은 뼈에 스키닝(정점별 가중치).
2. 옷 제작 시 **템플릿 몸 메시 위에 모델링** → 같은 Armature 포함해 GLB로 내보냄.
3. 런타임에 착용 = **의상 메시를 스켈레톤에 붙였다 뗐다** (애니메이션은 스켈레톤에 한 번만 적용).
4. 옷에 가려지는 몸 부위는 숨김 처리(뚫림 방지). 치마·리본 물리는 VRM 스프링본/클로스 시뮬.

→ 우리 DB(shop_items.category, layer_z, user_inventory.equipped)는 이 구조와 그대로 호환된다.
   바뀌는 건 image_url이 GLB/메시 참조가 되는 것뿐.

## 경로 A — 1단계: 프리렌더 2.5D (현실적 권장)

- **방법**: Blender(무료)에서 캐릭터 1구 + 의상들을 만들고, **카메라·포즈 고정** 상태로
  부위별 **투명 PNG 렌더** (몸, 각 의상, 헤어…). 앱은 지금처럼 레이어 합성만.
- 옷이 3D 모델에서 렌더되므로 몸 곡선에 맞게 입혀진 모습 — "3D 느낌 + 실제 착용감" 확보.
- 지금 코드에서 바꿀 것: `emoji:` → PNG URL, AvatarView 글리프 → `<Image>`. ANCHORS/layer_z 그대로.
- 캐릭터 소스: VRoid Studio로 만들면(무료, 애니 스타일) 2단계 3D 전환 시 같은 모델 재사용 가능.
- 한계: 회전·애니메이션 없음(고정 포즈). 아이템 추가마다 렌더 1회 필요(자동화 스크립트 가능).

## 경로 B — 2단계: 진짜 3D (VRM + three.js)

- **스택**:
  - 제작: [VRoid Studio](https://vroid.com/en/studio) (무료) — 캐릭터·의상·헤어 제작, .vrm 내보내기
  - 렌더: three.js + [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) (VRM 로더/스프링본 물리 포함)
  - React 통합: react-three-fiber(웹). 튜토리얼: [VTuber Studio with three-vrm](https://wawasensei.dev/tuto/vrm-avatar-with-threejs-react-three-fiber-and-mediapipe)
- **착용 구현**: 의상별 메시를 같은 스켈레톤에 스키닝해 두고 equipped에 따라 표시/숨김
  (또는 의상 조합별 VRM 스왑 — 조합 수 적으면 이쪽이 단순).
- **Expo 제약 (중요)**: R3F 네이티브는 expo-gl 의존 — **Expo SDK 최신과 버전 불일치로 실기기 크래시 이슈**가
  보고됨 ([R3F in RN+Expo 현황](https://trifonstatkov.medium.com/the-current-state-of-using-react-three-fiber-in-react-native-expo-c65918593eaf), [expo-three](https://github.com/expo/expo-three)).
  → **웹 먼저** (우리 주 사용처가 웹이라 적합). 네이티브는 WebView로 3D 뷰를 띄우는 우회가 안전.
- 물리(치마 찰랑, 리본 흔들림): VRM 스프링본이 기본 제공 — three-vrm이 처리.
- 애니메이션(대기 모션, 인사): Mixamo 리타게팅 또는 VRM 애니메이션(.vrma).

## 참고: 2D 고급 대안 (Live2D/Spine)

- 부위 파츠를 리깅해 숨쉬기·눈깜빡임 같은 생동감 — 버튜버식. [Live2D](https://www.live2d.com/en/learn/sample/)는 SDK 라이선스 유료,
  최근엔 [Spine으로 가는 추세](https://namu.wiki/w/Live2D). 파츠 분리 수작업이 커서 취미 프로젝트엔 무거움.
  단일 일러스트→파츠 자동 분리(Image2Live2D) 오픈소스가 예고되어 있어 향후 재검토 가치.

## 이 프로젝트 로드맵 제안

1. **지금**: 이모지 플레이스홀더 유지 (기능 개발 우선 — Phase 4·5).
2. **다듬기(Phase 5)**: 경로 A — VRoid로 캐릭터 제작 → Blender/VRoid 스크린샷 파이프라인으로
   부위별 PNG 추출 → image_url 교체. **하루~이틀 작업으로 "리얼 착용" 룩 확보.**
3. **그 후 욕심나면**: 경로 B — 웹 한정 three-vrm 뷰(아바타 룸만 3D 탭)부터 점진 도입.
   회전·애니메이션·물리까지. 네이티브는 WebView 임베드.

## 출처

- [Netflix acquires Ready Player Me — TechCrunch](https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/)
- [RPM 종료 공지 — RPM Forum](https://forum.readyplayer.me/t/ready-player-me-x-player-zero/1265)
- [RPM 대안 비교 2026 — Streamoji](https://streamoji.com/blog/ready-player-me-alternatives-2026) · [Avatar SDK 이전 가이드](https://avatarsdk.com/blog/2026/01/15/switch-from-ready-player-me-to-avatar-sdk-fast-familiar-production-ready/)
- [@pixiv/three-vrm — GitHub](https://github.com/pixiv/three-vrm) · [three-vrm 예제](https://pixiv.github.io/three-vrm/packages/three-vrm/examples/)
- [VRM 아바타 + R3F 튜토리얼 — Wawa Sensei](https://wawasensei.dev/tuto/vrm-avatar-with-threejs-react-three-fiber-and-mediapipe)
- [R3F in React Native + Expo 현황 — Medium](https://trifonstatkov.medium.com/the-current-state-of-using-react-three-fiber-in-react-native-expo-c65918593eaf) · [expo-three](https://github.com/expo/expo-three)
- [모듈러 의상 시스템 — GameDev.net](https://gamedev.net/forums/topic/710077-how-to-implement-a-modular-clothing-system/) · [gltf-avatar-threejs](https://github.com/shrekshao/gltf-avatar-threejs)
- [RPM 커스텀 의상 제작 문서](https://docs.readyplayer.me/ready-player-me/customizing-guides/create-custom-assets/create-custom-outfits) (기법 참고용)
- [Live2D — 나무위키](https://namu.wiki/w/Live2D) · [Live2D 샘플](https://www.live2d.com/en/learn/sample/)
