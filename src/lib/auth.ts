import axios from 'axios';
import { buildMobileConnectionBundle, type MobileConnectionBundle } from './mobile-connection';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

const PASSWORD_STORAGE_KEY = 'clipboard_password';
const ACCESS_TOKEN_STORAGE_KEY = 'clipboard_access_token';
const EMBEDDED_ACCESS_TOKEN_HASH_KEY = 'clipRelayAccessToken';

export function getStoredPassword(): string | null {
  return typeof window !== 'undefined' ? sessionStorage.getItem(PASSWORD_STORAGE_KEY) : null;
}

export function getStoredAccessToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
}

export function getStoredAuthCredential(): string | null {
  return getStoredAccessToken() || getStoredPassword();
}

export function getResolvedApiBase(): string {
  if (API_BASE) return API_BASE;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** 把 /api/... 相对路径解析成完整 API 地址（Cloudflare Pages + Worker 分离部署时必须） */
export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return getResolvedApiBase();
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getResolvedApiBase();
  if (!pathOrUrl.startsWith('/')) return `${base}/${pathOrUrl}`;
  return `${base}${pathOrUrl}`;
}

export function getMobileConnectionBundle(): MobileConnectionBundle | null {
  if (typeof window === 'undefined') return null;
  const accessToken = getStoredAccessToken();
  if (!accessToken) return null;
  return buildMobileConnectionBundle({
    serverUrl: window.location.origin,
    apiBase: getResolvedApiBase(),
    accessToken,
  });
}

export function storeAccessToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

export function consumeEmbeddedAccessTokenFromLocation(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return false;

  const params = new URLSearchParams(hash);
  const accessToken = params.get(EMBEDDED_ACCESS_TOKEN_HASH_KEY);
  if (!accessToken) return false;

  storeAccessToken(accessToken);
  params.delete(EMBEDDED_ACCESS_TOKEN_HASH_KEY);
  params.delete('clipRelayBootNonce');

  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
  return true;
}

// 获取认证头
export function getAuthHeaders(): HeadersInit {
  const credential = getStoredAuthCredential();
  if (!credential) {
    return {};
  }
  return {
    Authorization: `Bearer ${credential}`,
  };
}

// 验证密码
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const response = await fetch(resolveApiUrl('/api/auth/verify'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json().catch(() => null)) as { accessToken?: string | null } | null;
    sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
    if (data?.accessToken) {
      storeAccessToken(data.accessToken);
    }
    return true;
  } catch (error) {
    console.error('Password verification failed:', error);
    return false;
  }
}

export async function refreshAccessToken(): Promise<string> {
  const response = await authFetch('/api/auth/access-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = (await response.json().catch(() => null)) as { accessToken?: string; error?: string } | null;
  if (!response.ok || !data?.accessToken) {
    throw new Error(data?.error || '无法生成设备凭证');
  }
  storeAccessToken(data.accessToken);
  return data.accessToken;
}

// 清理存储的密码
export function clearPassword() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
  }
}

export function clearAccessToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

// 带认证的fetch函数
export async function authFetch(url: string, options: RequestInit = {}) {
  const fullUrl = resolveApiUrl(url);
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };
  const creds: RequestCredentials | undefined = options.credentials || 'include';

  return fetch(fullUrl, {
    ...options,
    headers,
    credentials: creds,
  });
}

// 登出（清理本地存储，同时请求服务端清除 Cookie）
export async function logout(): Promise<void> {
  try {
    await fetch(resolveApiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch {}
  clearPassword();
  clearAccessToken();
}

// 让 axios 也走同一个 API 基址 + 鉴权头（上传进度条依赖 axios）
if (typeof window !== 'undefined') {
  axios.defaults.baseURL = getResolvedApiBase() || undefined;
  axios.defaults.withCredentials = true;
  axios.interceptors.request.use((config) => {
    const headers = getAuthHeaders() as Record<string, string>;
    config.headers = config.headers || {};
    for (const [k, v] of Object.entries(headers)) {
      (config.headers as any)[k] = v;
    }
    // 若 baseURL 为空但设置了 NEXT_PUBLIC_API_BASE 的构建期值，再补一次
    if (!config.baseURL && API_BASE) config.baseURL = API_BASE;
    return config;
  });
}
