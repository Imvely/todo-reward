/**
 * 플랫폼 진입점 — 번들러가 .web.tsx(웹) / .native.tsx(네이티브)를 우선 해석한다.
 * 이 파일은 타입체커(tsc)용 기본 재수출일 뿐, 런타임에는 플랫폼 파일이 선택된다.
 */
export { AvatarStage, type AvatarStageProps } from './AvatarStage.native';
