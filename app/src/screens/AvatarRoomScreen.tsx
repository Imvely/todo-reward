/** 아바타 룸 (SPEC §3.3) — 내 착장을 보고, 이미지로 저장한다. 꾸미기는 상점에서. */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ApiError, getInventory, getMe, type InventoryItem } from '../api';
import { AvatarStage } from '../components/AvatarStage';
import { captureAvatarPng, downloadDataUrl } from '../utils/avatarCapture';
import { colors, font, radius, shadow, space } from '../theme';

export function AvatarRoomScreen({
  onBack,
  onOpenShop,
}: {
  onBack: () => void;
  onOpenShop: () => void;
}) {
  const [username, setUsername] = useState('');
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // 3D 무대가 준비되면 캡처 함수를 받는다 (웹). 없으면 2D 합성으로 폴백.
  const [capture3d, setCapture3d] = useState<(() => string | null) | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [me, wardrobe] = await Promise.all([getMe(), getInventory()]);
      setUsername(me.username);
      setInv(wardrobe);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '아바타를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const worn = inv.filter((i) => i.equipped);

  const save = () => {
    // 3D 무대 스냅샷 우선, 안 되면 2D 합성 폴백
    const dataUrl = capture3d?.() ?? null;
    const ok = dataUrl ? downloadDataUrl(dataUrl) : captureAvatarPng(worn, username);
    setSaved(ok);
    if (!ok) setError('이 기기에서는 아직 저장을 지원하지 않아요.');
    else setTimeout(() => setSaved(false), 2500);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.a} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>아바타 룸</Text>
          <Text style={styles.sub}>{username}의 오늘 착장</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* 아바타 무대 — 웹은 3D(VRM, 드래그로 회전), 네이티브는 2D 폴백 (TECH_DESIGN §7) */}
      <View style={styles.stage}>
        <AvatarStage
          items={worn}
          height={360}
          onReady={(fn) => setCapture3d(() => fn)}
        />
        <Text style={styles.stageHint}>드래그해서 돌려보세요</Text>
        {worn.length === 0 ? (
          <Text style={styles.emptyHint}>아직 착용한 아이템이 없어요. 상점에서 꾸며보세요!</Text>
        ) : null}
      </View>

      {/* 액션 */}
      <View style={styles.actions}>
        <Pressable
          onPress={save}
          style={({ pressed }) => [styles.saveBtn, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <Text style={styles.saveBtnText}>{saved ? '저장했어요! 📸' : '이미지로 저장'}</Text>
        </Pressable>
        <Pressable
          onPress={onOpenShop}
          style={({ pressed }) => [styles.shopBtn, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <Text style={styles.shopBtnText}>옷 갈아입기 🎀</Text>
        </Pressable>
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
  stage: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginTop: space(5),
    paddingVertical: space(6),
    paddingHorizontal: space(4),
    alignItems: 'center',
    minHeight: 320,
    justifyContent: 'center',
    ...shadow.card,
  },
  stageHint: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.subtext,
    textAlign: 'center',
    marginTop: space(2),
  },
  emptyHint: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.subtext,
    textAlign: 'center',
    marginTop: space(3),
  },
  actions: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  saveBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.a,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: colors.white, fontFamily: font.display, fontSize: 15 },
  shopBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.aSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopBtnText: { color: colors.a, fontFamily: font.display, fontSize: 15 },
});
