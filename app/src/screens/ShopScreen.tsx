/**
 * A상점 — A포인트로 아바타 아이템을 산다 (SPEC §3).
 * 흐름: 아이템 탭 → 우측 "내 아바타"에 착용 미리보기 (다시 탭하면 해제, 카테고리당 1개)
 *      → 구매하기 → "구매하시겠습니까?" 확인 팝업 → "네"를 눌러야 실제 차감.
 * 이미지 에셋 전 단계: image_url 'emoji:…' 규약을 이모지로 렌더링.
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
import { AvatarView, CATEGORY_LABEL, emojiOf } from '../components/AvatarView';
import { colors, font, radius, shadow, space } from '../theme';

// 원피스↔상·하의 동시 착용 불가 — 서버(services/shop.py)와 같은 규칙을 미리보기에도 적용
const CONFLICTS: Record<string, string[]> = {
  dress: ['top', 'bottom'],
  top: ['dress'],
  bottom: ['dress'],
};

export function ShopScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [pointA, setPointA] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 착용 미리보기 — 카테고리당 1개. 보유 아이템은 서버 착장(equip)과 동기화된다.
  const [tryOn, setTryOn] = useState<Record<string, ShopItem>>({});
  const [confirming, setConfirming] = useState(false); // 확인 팝업 표시
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

  /** 아이템 탭: 착용 중이면 해제, 아니면 착용(같은 카테고리·원피스↔상하의 교체). */
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
    // 보유 아이템이면 서버 착장에도 반영 (충돌 해제는 서버가 함께 처리)
    if (owned.has(item.id)) persistEquip(item, !wearing);
  };

  const wornItems = Object.values(tryOn);
  const toBuy = wornItems.filter((it) => !owned.has(it.id)); // 착용 중 + 미보유만 구매 대상
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
        // 미리보기에 입고 있던 채로 샀으니 바로 착용 저장 (충돌 해제는 서버 처리)
        wardrobe = await equipItem(res.inventory_id, true);
        setInv(wardrobe);
      }
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '구매에 실패했어요.');
      setConfirming(false);
      load(); // 서버 상태로 재동기화
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

  const groups: { category: string; items: ShopItem[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.category === it.category);
    if (g) g.items.push(it);
    else groups.push({ category: it.category, items: [it] });
  }

  return (
    <View style={styles.rootWrap}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {/* 헤더: ← 뒤로가기 + 제목 + A지갑 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>상점</Text>
            <Text style={styles.sub}>아이템을 눌러 입혀보고, 마음에 들면 구매!</Text>
          </View>
          <View style={styles.wallet}>
            <Text style={styles.walletEmoji}>🎀</Text>
            <Text style={styles.walletValue}>{pointA.toLocaleString()}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.body}>
          {/* 좌: 카탈로그 */}
          <View style={styles.catalog}>
            {groups.map((g) => (
              <View key={g.category} style={styles.group}>
                <Text style={styles.groupTitle}>{CATEGORY_LABEL[g.category] ?? g.category}</Text>
                <View style={styles.grid}>
                  {g.items.map((it) => {
                    const isOwned = owned.has(it.id);
                    const isWorn = tryOn[it.category]?.id === it.id;
                    return (
                      <Pressable
                        key={it.id}
                        onPress={() => toggleTryOn(it)}
                        style={({ pressed }) => [
                          styles.card,
                          isWorn && styles.cardWorn,
                          pressed && { transform: [{ scale: 0.97 }] },
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
              </View>
            ))}
          </View>

          {/* 우: 내 아바타 미리보기 + 구매 — 아이템이 몸 위에 실제로 입혀진다 */}
          <View style={styles.previewCol}>
            <View style={styles.preview}>
              <Text style={styles.previewTitle}>내 아바타</Text>
              <AvatarView items={wornItems} size="small" />
              {wornItems.length === 0 ? (
                <Text style={styles.previewHint}>아이템을 눌러{'\n'}입혀보세요</Text>
              ) : null}
            </View>

            {toBuy.length > 0 ? (
              <View style={styles.buyBox}>
                {toBuy.map((it) => (
                  <View key={it.id} style={styles.buyRow}>
                    <Text style={styles.buyName} numberOfLines={1}>
                      {emojiOf(it.image_url)} {it.name}
                    </Text>
                    <Text style={styles.buyPrice}>{it.price} A</Text>
                  </View>
                ))}
                <View style={styles.buyTotalRow}>
                  <Text style={styles.buyTotalLabel}>합계</Text>
                  <Text style={styles.buyTotal}>{total} A</Text>
                </View>
                <Pressable
                  onPress={() => canBuy && setConfirming(true)}
                  style={({ pressed }) => [
                    styles.buyBtn,
                    !canBuy && { opacity: 0.5 },
                    pressed && canBuy && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={styles.buyBtnText}>
                    {total > pointA ? 'A포인트가 부족해요' : '구매하기'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

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
  rootWrap: { flex: 1, backgroundColor: colors.paper },
  root: { flex: 1 },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space(5), paddingBottom: space(16), maxWidth: 680, width: '100%', alignSelf: 'center' },
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
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    backgroundColor: colors.aSoft,
    paddingVertical: space(2),
    paddingHorizontal: space(3.5),
    borderRadius: radius.pill,
  },
  walletEmoji: { fontSize: 15 },
  walletValue: { fontFamily: font.display, fontSize: 17, color: colors.ink },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger, marginTop: space(3) },

  body: { flexDirection: 'row', gap: space(4), marginTop: space(4), alignItems: 'flex-start' },
  catalog: { flex: 1.25 },
  group: { marginTop: space(4) },
  groupTitle: { fontFamily: font.display, fontSize: 16, color: colors.ink, marginBottom: space(2.5) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5) },
  card: {
    width: '47%',
    flexGrow: 1,
    maxWidth: 140,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: space(3.5),
    alignItems: 'center',
    gap: space(1),
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadow.card,
  },
  cardWorn: { borderColor: colors.a, backgroundColor: '#FFF5FA' },
  itemEmoji: { fontSize: 34 },
  itemName: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.ink, paddingHorizontal: 4 },
  priceBadge: {
    backgroundColor: colors.aSoft,
    paddingVertical: 2,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
  },
  priceText: { fontFamily: font.bodyBold, fontSize: 11, color: colors.a },
  ownedBadge: {
    backgroundColor: colors.bSoft,
    paddingVertical: 2,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
  },
  ownedText: { fontFamily: font.bodyBold, fontSize: 11, color: colors.b },
  wornMark: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.a,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
  },
  wornMarkText: { fontFamily: font.bodyBold, fontSize: 9, color: colors.white },

  previewCol: { flex: 1, gap: space(3) },
  preview: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space(4),
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 220,
    ...shadow.card,
  },
  previewBg: { position: 'absolute', fontSize: 120, opacity: 0.18, top: space(6) },
  previewTitle: { fontFamily: font.display, fontSize: 15, color: colors.a, alignSelf: 'flex-start' },
  avatarBase: { fontSize: 64, marginTop: space(2) },
  previewHint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.subtext,
    textAlign: 'center',
    marginTop: space(3),
    lineHeight: 18,
  },
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(2),
    marginTop: space(3),
    justifyContent: 'center',
  },
  slot: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    paddingVertical: space(1.5),
    paddingHorizontal: space(2.5),
    gap: 1,
  },
  slotEmoji: { fontSize: 22 },
  slotLabel: { fontFamily: font.body, fontSize: 10, color: colors.subtext },

  buyBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space(4),
    gap: space(2),
    ...shadow.card,
  },
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
  buyBtn: {
    backgroundColor: colors.a,
    borderRadius: radius.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space(1),
  },
  buyBtnText: { color: colors.white, fontFamily: font.display, fontSize: 15 },

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
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalNo: { backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.line },
  modalNoText: { fontFamily: font.bodyBold, fontSize: 14, color: colors.inkSoft },
  modalYes: { backgroundColor: colors.a },
  modalYesText: { fontFamily: font.display, fontSize: 15, color: colors.white },
});
