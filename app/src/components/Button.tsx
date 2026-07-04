/** 기본 버튼 — 크고 둥근, 누르면 살짝 눌리는 촉감. */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, radius, space } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tint?: string;
};

export function Button({ label, onPress, loading, disabled, tint = colors.a }: Props) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={() => !off && onPress()}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: tint },
        off && { opacity: 0.5 },
        pressed && !off && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
  },
  label: { color: colors.white, fontFamily: font.display, fontSize: 18, letterSpacing: 0.3 },
});
