/** 포인트 팡 — 토글 시 지갑 근처에서 +5가 튀어올라 사라진다 (SPEC §2.4). */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { colors, font } from '../theme';

export function PointPop({ amount, onDone }: { amount: number; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  const gain = amount >= 0;

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 900, useNativeDriver: true }).start(onDone);
  }, [t, onDone]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -54] }) },
            { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.15, 1] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.text, { color: gain ? colors.a : colors.subtext }]}>
        {gain ? `+${amount}` : amount}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, alignSelf: 'center' },
  text: { fontFamily: font.display, fontSize: 30 },
});
