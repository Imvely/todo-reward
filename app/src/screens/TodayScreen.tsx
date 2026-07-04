/**
 * 오늘 — 이 앱의 심장. 진행 링이 차오르고, 미션을 완료하면 포인트가 팡 오른다.
 * 완주 보너스는 하루 마감 때 들어오므로(SPEC §2.2), 다 끝내면 그렇게 안내한다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  ApiError,
  getMe,
  getTodos,
  reorderTodos,
  toggleTodo,
  type Me,
  type Todo,
} from '../api';
import { clearToken } from '../storage';
import { MissionCard } from '../components/MissionCard';
import { PointPop } from '../components/PointPop';
import { ProgressRing } from '../components/ProgressRing';
import { WalletChip } from '../components/WalletChip';
import { colors, font, radius, space } from '../theme';

let popSeq = 0;

export function TodayScreen({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pops, setPops] = useState<{ id: number; amount: number }[]>([]);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [meRes, todoRes] = await Promise.all([getMe(), getTodos()]);
      setMe(meRes);
      setTodos(todoRes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '불러오지 못했어요. 서버 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onToggle = async (todo: Todo) => {
    try {
      const res = await toggleTodo(todo.id);
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? res.todo : t)));
      setMe((prev) =>
        prev
          ? { ...prev, point_a: res.balances.point_a, point_b: res.balances.point_b, current_streak: res.streak }
          : prev,
      );
      const mission = res.awarded.find((a) => a.reason.startsWith('mission'));
      if (mission) {
        const id = ++popSeq;
        setPops((p) => [...p, { id, amount: mission.amount }]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '토글에 실패했어요.');
    }
  };

  // 우선순위 정렬 — 순서(sort_order)만 바꾼다 (SPEC §6.1). 서버에 일괄 반영.
  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= todos.length) return;
    const next = [...todos];
    [next[index], next[j]] = [next[j], next[index]];
    const withOrder = next.map((t, i) => ({ ...t, sort_order: i }));
    setTodos(withOrder); // 낙관적 반영
    try {
      await reorderTodos(withOrder.map((t) => ({ id: t.id, sort_order: t.sort_order })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '정렬에 실패했어요.');
      load(); // 서버 순서로 되돌림
    }
  };

  const logout = async () => {
    await clearToken();
    onLogout();
  };

  const total = todos.length;
  const done = todos.filter((t) => t.is_done).length;
  const progress = total ? done / total : 0;
  const allDone = total > 0 && done === total;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.a} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.a}
        />
      }
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>오늘도 한 걸음</Text>
          <Text style={styles.sub}>미션을 끝내고 포인트를 모아요</Text>
        </View>
        <TouchableOpacity onPress={logout} hitSlop={8}>
          <Text style={styles.logout}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {/* 지갑 + 포인트 팡 */}
      <View>
        <View style={styles.wallets}>
          <WalletChip label="A · 아바타" value={me?.point_a ?? 0} tint={colors.a} soft={colors.aSoft} emoji="🎀" />
          <WalletChip label="B · 적립" value={me?.point_b ?? 0} tint={colors.b} soft={colors.bSoft} emoji="🌱" />
        </View>
        {pops.map((p) => (
          <PointPop
            key={p.id}
            amount={p.amount}
            onDone={() => setPops((cur) => cur.filter((x) => x.id !== p.id))}
          />
        ))}
      </View>

      {/* 진행 링 (시그니처) */}
      <View style={styles.ringWrap}>
        <ProgressRing progress={progress}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.ringNum}>
              {done}
              <Text style={styles.ringDen}> / {total}</Text>
            </Text>
            <Text style={styles.ringLabel}>오늘 완료</Text>
            <View style={styles.streakPill}>
              <Text style={styles.streakText}>🔥 {me?.current_streak ?? 0}일 연속</Text>
            </View>
          </View>
        </ProgressRing>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {allDone ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>오늘 다 끝냈어요! 🎉</Text>
          <Text style={styles.bannerBody}>완주·연속 보너스는 하루가 마감될 때 통장에 들어와요.</Text>
        </View>
      ) : null}

      {/* 미션 목록 */}
      {total > 0 ? (
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>오늘의 미션</Text>
          <TouchableOpacity onPress={() => setReordering((v) => !v)} hitSlop={8}>
            <Text style={[styles.reorderToggle, reordering && { color: colors.a }]}>
              {reordering ? '완료' : '순서 바꾸기'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.list}>
        {total === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗒️</Text>
            <Text style={styles.emptyTitle}>오늘 등록된 미션이 없어요</Text>
            <Text style={styles.emptyBody}>관리자가 미션을 추가하면 여기에 나타나요.</Text>
          </View>
        ) : reordering ? (
          todos.map((t, i) => (
            <View key={t.id} style={styles.reorderRow}>
              <Text style={styles.reorderGrip}>≡</Text>
              <Text style={[styles.reorderText, t.is_done && styles.reorderTextDone]} numberOfLines={1}>
                {t.content}
              </Text>
              <TouchableOpacity
                onPress={() => move(i, -1)}
                disabled={i === 0}
                hitSlop={6}
                style={[styles.arrowBtn, i === 0 && styles.arrowOff]}
              >
                <Text style={styles.arrow}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => move(i, 1)}
                disabled={i === total - 1}
                hitSlop={6}
                style={[styles.arrowBtn, i === total - 1 && styles.arrowOff]}
              >
                <Text style={styles.arrow}>▼</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          todos.map((t) => <MissionCard key={t.id} todo={t} onToggle={onToggle} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space(5), paddingBottom: space(12), maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hello: { fontFamily: font.display, fontSize: 26, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 13, color: colors.subtext, marginTop: 2 },
  logout: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.subtext },
  wallets: { flexDirection: 'row', gap: space(3), marginTop: space(5) },
  ringWrap: { alignItems: 'center', marginTop: space(7), marginBottom: space(2) },
  ringNum: { fontFamily: font.display, fontSize: 46, color: colors.ink, lineHeight: 50 },
  ringDen: { fontFamily: font.display, fontSize: 24, color: colors.subtext },
  ringLabel: { fontFamily: font.body, fontSize: 14, color: colors.subtext, marginTop: 2 },
  streakPill: {
    marginTop: space(3),
    backgroundColor: colors.streakSoft,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  streakText: { fontFamily: font.bodyBold, fontSize: 12, color: colors.streak },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger, marginTop: space(3), textAlign: 'center' },
  banner: {
    backgroundColor: colors.aSoft,
    borderRadius: radius.lg,
    padding: space(4),
    marginTop: space(4),
  },
  bannerTitle: { fontFamily: font.display, fontSize: 18, color: colors.a },
  bannerBody: { fontFamily: font.body, fontSize: 13, color: colors.inkSoft, marginTop: 4, lineHeight: 19 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space(6),
  },
  listTitle: { fontFamily: font.display, fontSize: 18, color: colors.ink },
  reorderToggle: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.subtext },
  list: { marginTop: space(3), gap: space(3) },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  reorderGrip: { fontSize: 18, color: colors.subtext },
  reorderText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 15, color: colors.ink },
  reorderTextDone: { color: colors.subtext, textDecorationLine: 'line-through' },
  arrowBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowOff: { opacity: 0.3 },
  arrow: { fontSize: 12, color: colors.ink },
  empty: { alignItems: 'center', paddingVertical: space(10), gap: space(2) },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontFamily: font.display, fontSize: 18, color: colors.ink },
  emptyBody: { fontFamily: font.body, fontSize: 13, color: colors.subtext, textAlign: 'center' },
});
