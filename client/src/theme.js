const KEY = 'essensbestellung.theme';

function apply(theme) {
  document.documentElement.dataset.theme = theme;
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// Beim Start: gespeicherte Wahl > Systemeinstellung. Ohne explizite Wahl
// folgt die App Änderungen der Systemeinstellung live.
export function initTheme() {
  const stored = localStorage.getItem(KEY);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  apply(stored || (media.matches ? 'dark' : 'light'));
  media.addEventListener('change', (e) => {
    if (!localStorage.getItem(KEY)) apply(e.matches ? 'dark' : 'light');
  });
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(KEY, next);
  apply(next);
  return next;
}
