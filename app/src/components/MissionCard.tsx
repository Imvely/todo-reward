/** 미션 카드 — 큰 원형 체크를 눌러 완료를 토글한다. 완료 시 만족스러운 상태 전환. */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, shadow, space } from '../theme';
import type { Todo } from '../api';

type Props = {
  todo: Todo;
  disabled?: boolean;
  onToggle: (todo: Todo) => void;
};

export function MissionCard({ todo, disabled, onToggle }: Props) {
  const done = todo.is_done;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 완료 순간 체크가 살짝 튀어오른다
    Animated.sequence([
      Animated.spring(scale, { toValue: done ? 1.18 : 1, useNativeDriver: true, friction: 4 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
  }, [done, scale]);

  return (
    <Pressable
      onPress={() => !disabled && onToggle(todo)}
      style={({ pressed }) => [
        styles.card,
        done && styles.cardDone,
        pressed && !disabled && { transform: [{ scale: 0.99 }] },
      ]}
    >
      <Animated.View
        style={[styles.check, done ? styles.checkDone : styles.checkOpen, { transform: [{ scale }] }]}
      >
        {done ? <Text style={styles.checkMark}>✓</Text> : null}
      </Animated.View>
      <View style={styles.body}>
        <Text style={[styles.content, done && styles.contentDone]} numberOfLines={2}>
          {todo.content}
        </Text>
        <Text style={styles.reward}>미션 +5</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: space(4),
    paddingHorizontal: space(4),
    ...shadow.card,
  },
  cardDone: { backgroundColor: '#FBFDFB' },
  check: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOpen: { borderWidth: 2.5, borderColor: colors.line },
  checkDone: { backgroundColor: colors.b },
  checkMark: { color: colors.white, fontSize: 18, fontFamily: font.bodyBold, lineHeight: 20 },
  body: { flex: 1, gap: 2 },
  content: { fontFamily: font.bodyMedium, fontSize: 16, color: colors.ink },
  contentDone: { color: colors.subtext, textDecorationLine: 'line-through' },
  reward: { fontFamily: font.body, fontSize: 12, color: colors.subtext },
});
