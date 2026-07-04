import { Jua_400Regular, useFonts } from '@expo-google-fonts/jua';
import {
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_700Bold,
} from '@expo-google-fonts/noto-sans-kr';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getMe, type Me } from './src/api';
import { AdminScreen } from './src/screens/AdminScreen';
import { AvatarRoomScreen } from './src/screens/AvatarRoomScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SavingsScreen } from './src/screens/SavingsScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { clearToken, loadToken } from './src/storage';
import { colors } from './src/theme';

// null = 미인증 / Me = 인증됨(역할 포함) / undefined = 확인 중
type AuthState = Me | null | undefined;

export default function App() {
  const [fontsLoaded] = useFonts({
    Jua_400Regular,
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
  });
  const [auth, setAuth] = useState<AuthState>(undefined);

  const resolve = useCallback(async () => {
    const token = await loadToken();
    if (!token) {
      setAuth(null);
      return;
    }
    try {
      setAuth(await getMe()); // 역할에 따라 화면을 나눈다 (SPEC §10, role 분기)
    } catch {
      await clearToken(); // 토큰 만료/무효 → 로그인으로
      setAuth(null);
    }
  }, []);

  useEffect(() => {
    resolve();
  }, [resolve]);

  if (!fontsLoaded || auth === undefined) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.a} size="large" />
      </View>
    );
  }

  const logout = () => setAuth(null);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {auth === null ? (
        <LoginScreen onSuccess={resolve} />
      ) : auth.role === 'admin' ? (
        <AdminScreen onLogout={logout} />
      ) : (
        <UserFlow onLogout={logout} />
      )}
    </View>
  );
}

/** 사용자 화면 흐름 — A카드=상점, B카드=적립 통장, 아바타=룸, ←로 복귀. */
function UserFlow({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<'today' | 'shop' | 'savings' | 'room'>('today');
  if (view === 'shop') {
    return <ShopScreen onBack={() => setView('today')} />;
  }
  if (view === 'savings') {
    return <SavingsScreen onBack={() => setView('today')} />;
  }
  if (view === 'room') {
    return <AvatarRoomScreen onBack={() => setView('today')} onOpenShop={() => setView('shop')} />;
  }
  // key로 복귀 시 재마운트 → 상점/통장에서 바뀐 잔액이 바로 반영된다
  return (
    <TodayScreen
      key="today"
      onLogout={onLogout}
      onOpenShop={() => setView('shop')}
      onOpenSavings={() => setView('savings')}
      onOpenRoom={() => setView('room')}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  splash: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
});
