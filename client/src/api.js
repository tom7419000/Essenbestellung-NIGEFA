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
    // Abgelaufene Sitzung: Token verwerfen und zur Anmeldung schicken.
    if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      clearToken();
      window.location.href = '/login';
    }
    const err = new Error(data?.message || `Fehler ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
