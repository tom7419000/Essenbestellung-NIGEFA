const TOKEN_KEY = 'essensbestellung.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // leere Antwort
  }

  if (!res.ok) {
    // Gesperrtes Konto: Token verwerfen und zur Hinweisseite. Gilt für den
    // Anmeldeversuch wie für eine Sperre mitten in der laufenden Sitzung –
    // der Server markiert beide Fälle mit `blocked`.
    if (data?.blocked) {
      clearToken();
      if (window.location.pathname !== '/gesperrt') window.location.href = '/gesperrt';
    } else if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      // Abgelaufene Sitzung: Token verwerfen und zur Anmeldung schicken.
      clearToken();
      window.location.href = '/login';
    }
    const err = new Error(data?.message || `Fehler ${res.status}`);
    err.status = res.status;
    err.blocked = Boolean(data?.blocked);
    throw err;
  }
  return data;
}

// Datei-Upload (z. B. Logo/Favicon): sendet die Datei als Roh-Body mit ihrem Content-Type.
export async function apiUpload(path, file) {
  const headers = { 'Content-Type': file.type || 'application/octet-stream' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method: 'POST', headers, body: file });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // leere Antwort
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Fehler ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
