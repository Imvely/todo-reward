/**
 * 미션 관리 (관리자) — 사용자에게 오늘의 미션을 넣고 뺀다 (SPEC §6.2).
 * 관리자는 완료 토글을 하지 않으므로(권한 매트릭스), 목록은 읽기 전용 + 추가/삭제만.
 * 사용자 화면의 핑크와 구분해 관리자 모드는 민트(B) 톤을 쓴다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  ApiError,
  adminCreateTodo,
  adminDeleteTodo,
  getManagedUser,
  getToday,
  getTodos,
  type Me,
  type Todo,
} from '../api';
import { clearToken } from '../storage';
import { colors, font, radius, shadow, space } from '../theme';

export function AdminScreen({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<Me | null>(null);
  const [date, setDate] = useState<string>('');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, t] = await Promise.all([getManagedUser(), getToday()]);
      setUser(u);
      setDate(t.date);
      setTodos(await getTodos(t.date));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요. 서버 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const text = content.trim();
    if (!text || !user || !date) return;
    setAdding(true);
    setError(null);
    try {
      const created = await adminCreateTodo(user.id, date, text);
      setTodos((prev) => [...prev, created]);
      setContent('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '추가에 실패했어요.');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    const prev = todos;
    setTodos((cur) => cur.filter((t) => t.id !== id)); // 낙관적 제거
    try {
      await adminDeleteTodo(id);
    } catch (e) {
      setTodos(prev); // 실패 시 되돌림
      setError(e instanceof ApiError ? e.message : '삭제에 실패했어요.');
    }
  };

  const logout = async () => {
    await clearToken();
    onLogout();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.b} size="large" />
      </View>
    );
  }

  const doneCount = todos.filter((t) => t.is_done).length;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.badge}>관리자</Text>
          <Text style={styles.title}>미션 관리</Text>
          <Text style={styles.sub}>
            {user?.username} 님의 오늘 · {date}
          </Text>
        </View>
        <TouchableOpacity onPress={logout} hitSlop={8}>
          <Text style={styles.logout}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {/* 사용자 현황 요약 (읽기) */}
      <View style={styles.statCard}>
        <Stat label="완료" value={`${doneCount}/${todos.length}`} tint={colors.b} />
        <Stat label="🔥 연속" value={`${user?.current_streak ?? 0}일`} tint={colors.streak} />
        <Stat label="A / B" value={`${user?.point_a ?? 0} / ${user?.point_b ?? 0}`} tint={colors.a} />
      </View>

      {/* 미션 추가 */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="오늘 넣을 미션을 입력…"
          placeholderTextColor={colors.subtext}
          value={content}
          onChangeText={setContent}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Pressable
          onPress={add}
          style={({ pressed }) => [
            styles.addBtn,
            (adding || !content.trim()) && { opacity: 0.5 },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.addBtnText}>{adding ? '…' : '추가'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* 오늘의 미션 목록 (읽기 + 삭제) */}
      <View style={styles.list}>
        {todos.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyTitle}>아직 오늘 미션이 없어요</Text>
            <Text style={styles.emptyBody}>위에 미션을 입력해 사용자에게 넣어주세요.</Text>
          </View>
        ) : (
          todos.map((t) => (
            <View key={t.id} style={styles.row}>
              <View style={[styles.dot, t.is_done ? styles.dotDone : styles.dotOpen]}>
                {t.is_done ? <Text style={styles.dotMark}>✓</Text> : null}
              </View>
              <Text style={[styles.rowText, t.is_done && styles.rowTextDone]} numberOfLines={2}>
                {t.content}
              </Text>
              <TouchableOpacity onPress={() => remove(t.id)} hitSlop={8}>
                <Text style={styles.del}>삭제</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space(5), paddingBottom: space(12), maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: font.bodyBold,
    fontSize: 11,
    color: colors.b,
    backgroundColor: colors.bSoft,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  title: { fontFamily: font.display, fontSize: 26, color: colors.ink, marginTop: space(2) },
  sub: { fontFamily: font.body, fontSize: 13, color: colors.subtext, marginTop: 2 },
  logout: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.subtext },
  statCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space(4),
    marginTop: space(5),
    ...shadow.card,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: font.display, fontSize: 20 },
  statLabel: { fontFamily: font.body, fontSize: 12, color: colors.subtext },
  addRow: { flexDirection: 'row', gap: space(2), marginTop: space(5) },
  input: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: space(4),
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  addBtn: {
    height: 50,
    paddingHorizontal: space(5),
    borderRadius: radius.md,
    backgroundColor: colors.b,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.white, fontFamily: font.display, fontSize: 16 },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger, marginTop: space(3) },
  list: { marginTop: space(5), gap: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space(3.5),
    paddingHorizontal: space(4),
    ...shadow.card,
  },
  dot: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dotOpen: { borderWidth: 2, borderColor: colors.line },
  dotDone: { backgroundColor: colors.b },
  dotMark: { color: colors.white, fontSize: 13, fontFamily: font.bodyBold },
  rowText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 15, color: colors.ink },
  rowTextDone: { color: colors.subtext, textDecorationLine: 'line-through' },
  del: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.danger },
  empty: { alignItems: 'center', paddingVertical: space(10), gap: space(2) },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontFamily: font.display, fontSize: 18, color: colors.ink },
  emptyBody: { fontFamily: font.body, fontSize: 13, color: colors.subtext, textAlign: 'center' },
});
