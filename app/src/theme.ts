/**
 * 디자인 토큰 — 이 앱만의 정체성을 한곳에서 정의한다.
 *
 * 컨셉: 생산성 체크리스트가 아니라 "보상 기계". 미션을 완료하면 포인트가 팡 터지며
 * 두 지갑(A=아바타 상점, B=적립 통장)으로 날아간다. 따뜻하고 둥근, 게임 같은 결.
 * A=핑크 / B=민트로 두 지갑을 색으로 구분한다 (SPEC §2.1).
 */

export const colors = {
  ink: '#2A2438', // 본문 — 순검정 대신 따뜻한 자두-잉크
  inkSoft: '#5A5266',
  subtext: '#8A7F76',
  paper: '#FFF9F4', // 배경 — 따뜻한 아이보리(크림 기본값보다 살짝 복숭아)
  card: '#FFFFFF',
  a: '#FF5FA2', // A 지갑 (아바타/상점)
  aSoft: '#FFE3EF',
  b: '#12B886', // B 지갑 (적립/코인)
  bSoft: '#D8F5EA',
  streak: '#FF8A3D', // 연속(불꽃)
  streakSoft: '#FFE8D6',
  line: '#EFE4DA', // 따뜻한 헤어라인
  danger: '#E5484D',
  white: '#FFFFFF',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

/** 4pt 간격 스케일. space(4)=16 */
export const space = (n: number) => n * 4;

export const font = {
  display: 'Jua_400Regular', // 둥글고 친근한 한글 디스플레이 — 포인트 숫자에도 사용
  body: 'NotoSansKR_400Regular',
  bodyMedium: 'NotoSansKR_500Medium',
  bodyBold: 'NotoSansKR_700Bold',
};

export const shadow = {
  card: {
    shadowColor: '#B89A86',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};
