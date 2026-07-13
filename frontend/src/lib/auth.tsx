'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, clearTokens, getAccessToken, getRefreshToken, setTokens } from './api';
import { useI18n } from './i18n';
import type { AuthResponse, Locale, User } from './types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  locale: Locale;
}

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  /** Nach PATCH /users/me den lokalen Benutzer aktualisieren. */
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const { setLocale } = useI18n();
  const syncedUserIdRef = useRef<string | null>(null);

  // Initial: vorhandene Tokens validieren.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAccessToken() && !getRefreshToken()) {
        setStatus('unauthenticated');
        return;
      }
      try {
        const me = await api.get<User>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        clearTokens();
        setUser(null);
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Beim (erstmaligen) Laden eines Benutzers dessen Profilsprache übernehmen.
  useEffect(() => {
    if (user && syncedUserIdRef.current !== user.id) {
      syncedUserIdRef.current = user.id;
      setLocale(user.locale);
    }
  }, [user, setLocale]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.public.post<AuthResponse>('/auth/login', { email, password });
    setTokens(res.accessToken, res.refreshToken);
    syncedUserIdRef.current = null;
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await api.public.post<AuthResponse>('/auth/register', payload);
    setTokens(res.accessToken, res.refreshToken);
    syncedUserIdRef.current = null;
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // Logout ist Best-Effort — Tokens werden in jedem Fall gelöscht.
    }
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
    // Harte Navigation: leert sämtlichen In-Memory-State (Query-Cache etc.).
    window.location.href = '/login';
  }, []);

  const updateUser = useCallback((next: User) => {
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout, updateUser }),
    [user, status, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
