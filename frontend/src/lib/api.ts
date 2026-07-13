// Typisierter Fetch-Wrapper mit Bearer-Auth, Single-Flight-Token-Refresh
// und automatischem Redirect zum Login bei fehlgeschlagenem Refresh.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const ACCESS_TOKEN_KEY = 'nigefa.accessToken';
export const REFRESH_TOKEN_KEY = 'nigefa.refreshToken';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  statusCode: number;
  /** Alle Meldungen aus der API-Antwort (Validierungsfehler kommen als Array). */
  messages: string[];
  errorCode?: string;

  constructor(statusCode: number, message: string | string[], errorCode?: string) {
    const messages = Array.isArray(message) ? message : [message];
    super(messages[0] ?? `HTTP ${statusCode}`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.messages = messages;
    this.errorCode = errorCode;
  }
}

/** Endpunkte, bei denen ein 401 KEINEN Refresh-Versuch auslösen darf. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let refreshPromise: Promise<boolean> | null = null;

/** Single-Flight: parallele 401er warten auf denselben Refresh. */
function refreshTokens(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        setTokens(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path.startsWith('/login') || path.startsWith('/register')) return;
  window.location.href = '/login';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Kein Authorization-Header anhängen. */
  skipAuth?: boolean;
}

/**
 * Kern: führt den Request aus; bei 401 einmaliger Refresh + Wiederholung.
 * Gibt die (ggf. wiederholte) Response zurück.
 */
async function authFetch(path: string, options: RequestOptions, isRetry = false): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (token && !options.skipAuth) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const basePath = path.split('?')[0];
  if (res.status === 401 && !isRetry && !options.skipAuth && !NO_REFRESH_PATHS.includes(basePath)) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return authFetch(path, options, true);
    }
    clearTokens();
    redirectToLogin();
  }
  return res;
}

async function parseError(res: Response): Promise<ApiError> {
  let payload: { message?: string | string[]; error?: string } | null = null;
  try {
    payload = (await res.json()) as { message?: string | string[]; error?: string };
  } catch {
    // Antwort ohne JSON-Body
  }
  return new ApiError(res.status, payload?.message ?? `HTTP ${res.status}`, payload?.error);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await authFetch(path, options);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  /** Ohne Authorization-Header (Login/Registrierung). */
  public: {
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body, skipAuth: true }),
  },
};

/**
 * Authentifizierter Binär-Download (PDF/Excel-Export).
 * Liefert Blob + Dateiname aus Content-Disposition (falls vorhanden).
 */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await authFetch(path, {});
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  let filename: string | null = null;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (utf8Match) filename = decodeURIComponent(utf8Match[1]);
  else if (plainMatch) filename = plainMatch[1];
  return { blob, filename };
}

/** Löst im Browser einen Datei-Download für einen Blob aus. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
