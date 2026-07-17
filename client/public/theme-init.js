// Theme vor dem ersten Rendern setzen (verhindert Aufblitzen des falschen
// Modus). Ausgelagert aus index.html, damit eine strikte Content-Security-
// Policy ohne Inline-Skripte (script-src 'self') möglich ist.
(function () {
  var t = localStorage.getItem('essensbestellung.theme');
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();
