import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken } from '../api.js';
import { SSO_FLAG_KEY, getMsalInstance, initSso } from './msal.js';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoAutoRedirect, setSsoAutoRedirect] = useState(false);
  const [ssoError, setSsoError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1) SSO-Laufzeitkonfiguration laden und ggf. Rückkehr vom
      //    Entra-ID-Login verarbeiten (Redirect-Flow)
      let instance = null;
      try {
        const sso = await initSso();
        instance = sso.instance;
        if (!cancelled) {
          setSsoEnabled(sso.config.enabled === true);
          setSsoAutoRedirect(Boolean(sso.config.autoRedirect));
        }
      } catch {
        /* SSO bleibt deaktiviert */
      }
      if (instance) {
        try {
          const result = await instance.handleRedirectPromise();
          if (result?.idToken) {
            const d = await api('/auth/sso', { method: 'POST', body: { idToken: result.idToken } });
            if (cancelled) return;
            setToken(d.token);
            localStorage.setItem(SSO_FLAG_KEY, '1');
            setUser(d.user);
            setLoading(false);
            return;
          }
        } catch (e) {
          if (!cancelled) setSsoError(e.message || 'SSO-Anmeldung fehlgeschlagen.');
        }
      }

      // 2) Bestehende Sitzung (App-JWT) prüfen
      if (!getToken()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const d = await api('/auth/me');
        if (!cancelled) setUser(d.user);
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(d.token);
    localStorage.removeItem(SSO_FLAG_KEY);
    setUser(d.user);
  }, []);

  // Weiterleitung zum Microsoft-Login; zurück geht es über handleRedirectPromise.
  const loginSso = useCallback(async () => {
    setSsoError('');
    const instance = getMsalInstance();
    if (!instance) throw new Error('SSO ist nicht aktiviert.');
    await instance.loginRedirect({ scopes: ['openid', 'profile', 'email'] });
  }, []);

  const logout = useCallback(() => {
    const wasSso = localStorage.getItem(SSO_FLAG_KEY) === '1';
    clearToken();
    localStorage.removeItem(SSO_FLAG_KEY);
    setUser(null);
    // Bei SSO-Sitzungen auch die Entra-ID-Sitzung sauber beenden.
    const instance = getMsalInstance();
    if (wasSso && instance) {
      instance.logoutRedirect().catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, loginSso, ssoEnabled, ssoAutoRedirect, ssoError }}
    >
      {children}
    </AuthContext.Provider>
  );
}
