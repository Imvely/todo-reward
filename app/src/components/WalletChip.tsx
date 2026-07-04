/** 지갑 칩 — A(아바타/상점)·B(적립/코인) 두 지갑을 색으로 구분해 잔액을 보여준다. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, space } from '../theme';

type Props = {
  label: string;
  value: number;
  tint: string;
  soft: string;
  emoji: string;
};

export function WalletChip({ label, value, tint, soft, emoji }: Props) {
  return (
    <View style={[styles.chip, { backgroundColor: soft }]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View>
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.ink }]}>{value.toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingVertical: space(2.5),
    paddingHorizontal: space(3.5),
    borderRadius: radius.lg,
    flex: 1,
  },
  emoji: { fontSize: 22 },
  label: { fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 0.3 },
  value: { fontFamily: font.display, fontSize: 22, lineHeight: 26 },
});
