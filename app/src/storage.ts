/** JWT 토큰 저장 — 웹은 localStorage, 네이티브는 AsyncStorage로 동일 API. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'tr_token';

export const saveToken = (token: string) => AsyncStorage.setItem(TOKEN_KEY, token);
export const loadToken = () => AsyncStorage.getItem(TOKEN_KEY);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);
