/**
 * B상점 = 적립 통장 (SPEC §4). 소비하는 곳이 아니라 모이는 곳.
 * 매주 일요일이 끝나는 하루 경계에 자동 캡전환 — 예상 전환액은 서버 값만 표시.
 * 출금은 관리자가 수동 처리 (SPEC §4.1) — 여기선 잔액과 내역만 보여준다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ApiError, getCoins, type Coins } from '../api';
import { colors, font, radius, shadow, space } from '../theme';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function SavingsScreen({ onBack }: { onBack: () => void }) {
  const [coins, setCoins] = useState<Coins | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCoins(await getCoins());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '통장을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.b} size="large" />
      </View>
    );
  }

  const ns = coins?.next_settlement;
  const sundayLabel = ns ? fmtDate(ns.sunday) : '';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>적립 통장</Text>
          <Text style={styles.sub}>모은 B포인트가 매주 코인머니로 바뀌어요</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* 코인머니 잔액 */}
      <View style={styles.coinCard}>
        <Text style={styles.coinLabel}>💰 코인머니</Text>
        <Text style={styles.coinValue}>{(coins?.coin_balance ?? 0).toLocaleString()}원</Text>
        <Text style={styles.coinHint}>출금은 관리자가 계좌로 보내드려요</Text>
      </View>

      {/* 다음 결산 예고 — 서버 계산값만 표시 */}
      {ns ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextTitle}>
            다음 결산 · {sundayLabel}(일)이 끝나는 {ns.boundary_time}
          </Text>
          <View style={styles.nextRow}>
            <Text style={styles.nextLabel}>지금 B포인트</Text>
            <Text style={styles.nextValue}>{ns.point_b.toLocaleString()}</Text>
          </View>
          <View style={styles.nextRow}>
            <Text style={styles.nextLabel}>전환 예상</Text>
            <Text style={[styles.nextValue, { color: colors.b }]}>
              {ns.projected_convert.toLocaleString()}원
            </Text>
          </View>
          <View style={styles.nextRow}>
            <Text style={styles.nextLabel}>다음 주로 이월</Text>
            <Text style={styles.nextValue}>{ns.projected_carry.toLocaleString()}</Text>
          </View>
          <Text style={styles.nextHint}>
            500 이상이면 100원 단위로 전환되고, 자투리는 다음 주로 넘어가요.
          </Text>
        </View>
      ) : null}

      {/* 거래 내역 */}
      <Text style={styles.listTitle}>내역</Text>
      <View style={styles.list}>
        {(coins?.transactions.length ?? 0) === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyTitle}>아직 내역이 없어요</Text>
            <Text style={styles.emptyBody}>첫 일요일 결산 후 여기에 쌓여요.</Text>
          </View>
        ) : (
          coins!.transactions.map((t) => (
            <View key={t.id} style={styles.row}>
              <Text style={styles.rowEmoji}>{t.reason === 'settlement' ? '🔁' : '🏦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {t.reason === 'settlement' ? '주간 결산 전환' : '출금'}
                </Text>
                <Text style={styles.rowSub}>
                  {fmtDate(t.created_at)}
                  {t.memo ? ` · ${t.memo}` : ''}
                </Text>
              </View>
              <Text style={[styles.rowAmount, { color: t.amount >= 0 ? colors.b : colors.danger }]}>
                {t.amount >= 0 ? '+' : ''}
                {t.amount.toLocaleString()}원
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space(5), paddingBottom: space(16), maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backArrow: { fontSize: 20, color: colors.ink, lineHeight: 24 },
  title: { fontFamily: font.display, fontSize: 24, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 12, color: colors.subtext, marginTop: 1 },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger, marginTop: space(3) },
  coinCard: {
    backgroundColor: colors.b,
    borderRadius: radius.lg,
    padding: space(5),
    marginTop: space(5),
    ...shadow.card,
  },
  coinLabel: { fontFamily: font.bodyBold, fontSize: 13, color: '#D8F5EA' },
  coinValue: { fontFamily: font.display, fontSize: 38, color: colors.white, marginTop: 2 },
  coinHint: { fontFamily: font.body, fontSize: 12, color: '#BFEFDF', marginTop: space(1) },
  nextCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space(4),
    marginTop: space(3),
    gap: space(1.5),
    ...shadow.card,
  },
  nextTitle: { fontFamily: font.display, fontSize: 15, color: colors.ink, marginBottom: space(1) },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nextLabel: { fontFamily: font.body, fontSize: 13, color: colors.subtext },
  nextValue: { fontFamily: font.bodyBold, fontSize: 14, color: colors.ink },
  nextHint: { fontFamily: font.body, fontSize: 11, color: colors.subtext, marginTop: space(1), lineHeight: 16 },
  listTitle: { fontFamily: font.display, fontSize: 17, color: colors.ink, marginTop: space(6) },
  list: { marginTop: space(3), gap: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    ...shadow.card,
  },
  rowEmoji: { fontSize: 20 },
  rowTitle: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink },
  rowSub: { fontFamily: font.body, fontSize: 11, color: colors.subtext, marginTop: 1 },
  rowAmount: { fontFamily: font.display, fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: space(8), gap: space(2) },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontFamily: font.display, fontSize: 16, color: colors.ink },
  emptyBody: { fontFamily: font.body, fontSize: 12, color: colors.subtext },
});
