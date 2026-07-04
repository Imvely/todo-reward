/**
 * 진행 링 — 이 앱의 시그니처. 오늘 완료한 미션 비율만큼 링이 차오른다.
 * 완주(1.0)에 가까울수록 색이 amber(연속)에서 pink(보상)로 흐른다.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { colors } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  strokeWidth?: number;
  progress: number; // 0..1
  children?: React.ReactNode;
};

export function ProgressRing({ size = 220, strokeWidth = 18, progress, children }: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: Math.max(0, Math.min(1, progress)),
      useNativeDriver: false, // strokeDashoffset는 네이티브 드라이버 미지원
      friction: 8,
      tension: 60,
    }).start();
  }, [progress, anim]);

  const dashoffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.streak} />
            <Stop offset="1" stopColor={colors.a} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.line}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          // 12시 방향에서 시작하도록 -90도 회전
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
