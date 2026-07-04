/**
 * A상점 v3 — 드레스업 표준 레이아웃 (ZEPETO·포켓콜로니 패턴):
 *   [고정] 3D 캐릭터 무대 — 어떤 아이템을 눌러도 착용이 즉시 눈앞에서 보인다
 *   [고정] 카테고리 칩 (가로 스크롤) — 긴 목록 대신 부위별 탐색
 *   [스크롤] 아이템 트레이 (선택 카테고리)
 *   [고정] 하단 구매 바 → "구매하시겠습니까?" 확인 모달 → "네"에서만 차감
 * 판매 아이템 = 3D 캐릭터에 실제 착용 가능한 것만 (asset_ref 보유, seed_shop.ASSET_REFS).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  ApiError,
  equipItem,
  getInventory,
  getMe,
  getShopItems,
  purchaseItem,
  type InventoryItem,
  type ShopItem,
} from '../api';
import { AvatarStage } from '../components/AvatarStage';
import { CATEGORY_LABEL, CATEGORY_ORDER, emojiOf } from '../components/AvatarView';
import { colors, font, radius, shadow, space } from '../theme';

// 동시 착용 불가 조합 — 서버(services/shop.py)와 같은 규칙을 미리보기에도 적용
const CONFLICTS: Record<string, string[]> = {
  dress: ['top', 'bottom'],
  top: ['dress'],
  bottom: ['dress'],
  glasses: ['sunglasses'],
  sunglasses: ['glasses'],
  hat: ['ears'],
  ears: ['hat'],
};

export function ShopScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [pointA, setPointA] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  // 착용 미리보기 — 카테고리당 1개. 보유 아이템은 서버 착장(equip)과 동기화된다.
  const [tryOn, setTryOn] = useState<Record<string, ShopItem>>({});
  const [confirming, setConfirming] = useState(false);
  const [buying, setBuying] = useState(false);

  const owned = new Set(inv.map((i) => i.item_id));

  const load = useCallback(async () => {
    setError(null);
    try {
      const [me, catalog, wardrobe] = await Promise.all([
        getMe(),
        getShopItems(),
        getInventory(),
      ]);
      setPointA(me.point_a);
      setItems(catalog);
      setInv(wardrobe);
      // 서버에 저장된 착장으로 미리보기 초기화 (새로고침해도 유지)
      const worn: Record<string, ShopItem> = {};
      for (const w of wardrobe) {
        if (!w.equipped) continue;
        const item = catalog.find((c) => c.id === w.item_id);
        if (item) worn[item.category] = item;
      }
      setTryOn(worn);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '상점을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 보유 아이템의 착용 상태를 서버에 저장하고 옷장을 동기화한다. */
  const persistEquip = async (item: ShopItem, equipped: boolean) => {
    const row = inv.find((i) => i.item_id === item.id);
    if (!row) return;
    try {
      setInv(await equipItem(row.inventory_id, equipped));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '착용 저장에 실패했어요.');
    }
  };

  /** 아이템 탭: 착용 중이면 해제, 아니면 착용(같은 카테고리·충돌 카테고리 교체). */
  const toggleTryOn = (item: ShopItem) => {
    const wearing = tryOn[item.category]?.id === item.id;
    setTryOn((prev) => {
      const next = { ...prev };
      if (wearing) {
        delete next[item.category];
      } else {
        next[item.category] = item;
        for (const c of CONFLICTS[item.category] ?? []) delete next[c];
      }
      return next;
    });
    if (owned.has(item.id)) persistEquip(item, !wearing);
  };

  const wornItems = Object.values(tryOn);
  const toBuy = wornItems.filter((it) => !owned.has(it.id));
  const total = toBuy.reduce((s, it) => s + it.price, 0);
  const canBuy = toBuy.length > 0 && total <= pointA && !buying;

  /** 확인 팝업에서 "네" → 실제 구매(차감) + 입고 있던 아이템은 착장으로 저장. */
  const confirmPurchase = async () => {
    setBuying(true);
    setError(null);
    try {
      let wardrobe = inv;
      for (const it of toBuy) {
        const res = await purchaseItem(it.id); // 순차 구매, 서버 잔액만 반영
        setPointA(res.balances.point_a);
        wardrobe = await equipItem(res.inventory_id, true); // 입은 채로 샀으니 착용 저장
        setInv(wardrobe);
      }
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '구매에 실패했어요.');
      setConfirming(false);
      load();
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.a} size="large" />
      </View>
    );
  }

  // 카테고리 칩 목록 (실제 판매 중인 카테고리만, 진열 순서대로)
  const presentCats = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c));
  const shown = category === 'all' ? items : items.filter((i) => i.category === category);
  // '전체'에서도 진열 순서 유지
  const shownSorted = [...shown].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );

  return (
    <View style={styles.root}>
      <View style={styles.inner}>
        {/* 헤더 (컴팩트) */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>상점</Text>
          <View style={{ flex: 1 }} />
          <View style={styles.wallet}>
            <Text style={styles.walletEmoji}>🎀</Text>
            <Text style={styles.walletValue}>{pointA.toLocaleString()}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* ★ 고정 캐릭터 무대 — 트레이를 스크롤해도 항상 보인다 */}
        <View style={styles.stage}>
          <AvatarStage items={wornItems} height={264} />
        </View>

        {/* 카테고리 칩 — 가로 스크롤은 웹에서 가려지므로 전부 줄바꿈 표시 */}
        <View style={styles.chipsWrap}>
          {['all', ...presentCats].map((c) => {
            const active = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {c === 'all' ? '전체' : CATEGORY_LABEL[c] ?? c}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 아이템 트레이 (스크롤 영역) */}
        <ScrollView style={styles.tray} contentContainerStyle={styles.trayContent}>
          <View style={styles.grid}>
            {shownSorted.map((it) => {
              const isOwned = owned.has(it.id);
              const isWorn = tryOn[it.category]?.id === it.id;
              return (
                <Pressable
                  key={it.id}
                  onPress={() => toggleTryOn(it)}
                  style={({ pressed }) => [
                    styles.card,
                    isWorn && styles.cardWorn,
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                >
                  <Text style={styles.itemEmoji}>{emojiOf(it.image_url)}</Text>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.name}
                  </Text>
                  {isOwned ? (
                    <View style={styles.ownedBadge}>
                      <Text style={styles.ownedText}>보유중</Text>
                    </View>
                  ) : (
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceText}>{it.price} A</Text>
                    </View>
                  )}
                  {isWorn ? (
                    <View style={styles.wornMark}>
                      <Text style={styles.wornMarkText}>착용중</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.comingSoon}>👗 원피스·수트 같은 진짜 옷들은 3D 의상 공방에서 제작 중!</Text>
        </ScrollView>

        {/* 하단 고정 구매 바 */}
        {toBuy.length > 0 ? (
          <View style={styles.buyBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.buyBarCount}>{toBuy.length}개 입어보는 중</Text>
              <Text style={styles.buyBarTotal}>{total} A</Text>
            </View>
            <Pressable
              onPress={() => canBuy && setConfirming(true)}
              style={({ pressed }) => [
                styles.buyBtn,
                !canBuy && { opacity: 0.5 },
                pressed && canBuy && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={styles.buyBtnText}>{total > pointA ? 'A포인트 부족' : '구매하기'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* 구매 확인 팝업 — "네"를 눌러야만 차감된다 */}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>구매하시겠습니까?</Text>
            {toBuy.map((it) => (
              <View key={it.id} style={styles.buyRow}>
                <Text style={styles.buyName}>
                  {emojiOf(it.image_url)} {it.name}
                </Text>
                <Text style={styles.buyPrice}>{it.price} A</Text>
              </View>
            ))}
            <View style={styles.buyTotalRow}>
              <Text style={styles.buyTotalLabel}>합계</Text>
              <Text style={styles.buyTotal}>{total} A</Text>
            </View>
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setConfirming(false)}
                style={({ pressed }) => [styles.modalBtn, styles.modalNo, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.modalNoText}>아니오</Text>
              </Pressable>
              <Pressable
                onPress={confirmPurchase}
                disabled={buying}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalYes,
                  (pressed || buying) && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.modalYesText}>{buying ? '구매 중…' : '네'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  inner: { flex: 1, maxWidth: 560, width: '100%', alignSelf: 'center', paddingHorizontal: space(4), paddingTop: space(4) },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(3) },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backArrow: { fontSize: 19, color: colors.ink, lineHeight: 23 },
  title: { fontFamily: font.display, fontSize: 22, color: colors.ink },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    backgroundColor: colors.aSoft,
    paddingVertical: space(1.5),
    paddingHorizontal: space(3),
    borderRadius: radius.pill,
  },
  walletEmoji: { fontSize: 14 },
  walletValue: { fontFamily: font.display, fontSize: 16, color: colors.ink },
  error: { fontFamily: font.body, fontSize: 12, color: colors.danger, marginBottom: space(2) },
  stage: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1.5),
    marginTop: space(3),
  },
  chip: {
    paddingVertical: space(1),
    paddingHorizontal: space(2.5),
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.a, borderColor: colors.a },
  chipText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.inkSoft },
  chipTextActive: { color: colors.white, fontFamily: font.bodyBold },
  tray: { flex: 1, marginTop: space(3) },
  trayContent: { paddingBottom: space(6) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5) },
  card: {
    width: '31%',
    flexGrow: 1,
    maxWidth: 130,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space(2.5),
    alignItems: 'center',
    gap: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadow.card,
  },
  cardWorn: { borderColor: colors.a, backgroundColor: '#FFF5FA' },
  itemEmoji: { fontSize: 30 },
  itemName: { fontFamily: font.bodyMedium, fontSize: 11.5, color: colors.ink, paddingHorizontal: 4 },
  priceBadge: { backgroundColor: colors.aSoft, paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill },
  priceText: { fontFamily: font.bodyBold, fontSize: 10.5, color: colors.a },
  ownedBadge: { backgroundColor: colors.bSoft, paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill },
  ownedText: { fontFamily: font.bodyBold, fontSize: 10.5, color: colors.b },
  wornMark: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: colors.a,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
  },
  wornMarkText: { fontFamily: font.bodyBold, fontSize: 8.5, color: colors.white },
  comingSoon: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.subtext,
    textAlign: 'center',
    marginTop: space(4),
  },
  buyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: space(2.5),
    paddingHorizontal: space(4),
    marginBottom: space(3),
    ...shadow.card,
  },
  buyBarCount: { fontFamily: font.body, fontSize: 11, color: colors.subtext },
  buyBarTotal: { fontFamily: font.display, fontSize: 18, color: colors.a },
  buyBtn: {
    backgroundColor: colors.a,
    borderRadius: radius.md,
    height: 44,
    paddingHorizontal: space(5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: { color: colors.white, fontFamily: font.display, fontSize: 14 },
  buyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  buyName: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.ink, flexShrink: 1 },
  buyPrice: { fontFamily: font.bodyBold, fontSize: 13, color: colors.a },
  buyTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space(2),
    marginTop: space(1),
  },
  buyTotalLabel: { fontFamily: font.bodyBold, fontSize: 13, color: colors.inkSoft },
  buyTotal: { fontFamily: font.display, fontSize: 17, color: colors.a },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,36,56,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space(5),
    gap: space(2),
  },
  modalTitle: { fontFamily: font.display, fontSize: 19, color: colors.ink, marginBottom: space(1) },
  modalBtns: { flexDirection: 'row', gap: space(2.5), marginTop: space(3) },
  modalBtn: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalNo: { backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.line },
  modalNoText: { fontFamily: font.bodyBold, fontSize: 14, color: colors.inkSoft },
  modalYes: { backgroundColor: colors.a },
  modalYesText: { fontFamily: font.display, fontSize: 15, color: colors.white },
});
