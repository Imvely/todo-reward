/** 로그인 — 조용하고 따뜻한 진입. 워드마크 하나, 두 입력, 큰 버튼. */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError, login } from '../api';
import { saveToken } from '../storage';
import { Button } from '../components/Button';
import { colors, font, radius, shadow, space } from '../theme';

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  // 웹에서 바로 둘러볼 수 있게 데모 계정을 미리 채워둔다.
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('user1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { access_token } = await login(username.trim(), password);
      await saveToken(access_token);
      onSuccess();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '연결에 실패했어요. 서버가 켜져 있나요?';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.badge}>오늘의 보상</Text>
        <Text style={styles.wordmark}>하루하루{'\n'}미션 리워드</Text>
        <Text style={styles.tagline}>미션을 끝내면 포인트가 팡. 매일 조금씩, 습관이 쌓여요.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="아이디"
            placeholderTextColor={colors.subtext}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor={colors.subtext}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="로그인" onPress={submit} loading={loading} />
        </View>

        <Text style={styles.hint}>데모 계정 user / user1234 가 채워져 있어요</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(5),
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space(7),
    ...shadow.card,
  },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.a,
    backgroundColor: colors.aSoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  wordmark: {
    fontFamily: font.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.ink,
    marginTop: space(4),
  },
  tagline: {
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.subtext,
    marginTop: space(2),
  },
  form: { marginTop: space(6), gap: space(3) },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: space(4),
    fontFamily: font.body,
    fontSize: 16,
    color: colors.ink,
  },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger },
  hint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.subtext,
    textAlign: 'center',
    marginTop: space(5),
  },
});
