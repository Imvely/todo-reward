/**
 * 백엔드 API 클라이언트 — 서버 응답만이 진실이다.
 * 클라이언트는 포인트를 자체 계산하지 않고, 서버의 awarded/balances를 그대로 반영한다
 * (CLAUDE.md 코드 규약).
 */
import { loadToken } from './storage';

// 웹(브라우저)에서 보는 것이 목표라 localhost 기준. 실제 네이티브 기기에서 열려면
// 이 값을 PC의 LAN IP(예: http://192.168.0.10:8001/api/v1)로 바꾼다.
export const API_BASE = 'http://localhost:8001/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (auth) {
    const token = await loadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(API_BASE + path, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // 본문이 JSON이 아니면 statusText 사용
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ── 타입 (백엔드 스키마와 1:1) ──
export type Me = {
  id: string;
  username: string;
  role: 'user' | 'admin';
  point_a: number;
  point_b: number;
  coin_balance: number;
  current_streak: number;
  last_complete_date: string | null;
};

export type Todo = {
  id: string;
  due_date: string;
  content: string;
  is_done: boolean;
  done_at: string | null;
  sort_order: number;
};

export type Award = { reason: string; amount: number };

export type ToggleResponse = {
  todo: Todo;
  awarded: Award[];
  streak: number;
  new_badges: string[];
  balances: { point_a: number; point_b: number };
};

// ── 엔드포인트 ──
export const login = (username: string, password: string) =>
  request<{ access_token: string; token_type: string }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username, password }) },
    false,
  );

export const getMe = () => request<Me>('/me');
export const getToday = () => request<{ date: string }>('/today');
export const getTodos = (date?: string) =>
  request<Todo[]>(`/todos${date ? `?date=${date}` : ''}`);
export const toggleTodo = (id: string) =>
  request<ToggleResponse>(`/todos/${id}/toggle`, { method: 'PATCH' });
export const reorderTodos = (items: { id: string; sort_order: number }[]) =>
  request<Todo[]>('/todos/reorder', { method: 'PATCH', body: JSON.stringify({ items }) });

// ── 관리자 ──
export const getManagedUser = () => request<Me>('/admin/user');
export const adminCreateTodo = (userId: string, dueDate: string, content: string) =>
  request<Todo>('/admin/todos', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, due_date: dueDate, content }),
  });
export const adminDeleteTodo = (id: string) =>
  request<null>(`/admin/todos/${id}`, { method: 'DELETE' });
