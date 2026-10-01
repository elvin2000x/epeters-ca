// Shared helpers for the home page and the periodic table: theme toggle and copy loading.
// Words shown to visitors live in data/copy.json (one place, keyed); elements with data-copy="key" are filled from it.
export const $ = (s, root = document) => root.querySelector(s);
export const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};

export async function loadCopy(base) {
  let copy = {};
  try {
    const r = await fetch(base + 'data/copy.json');
    if (r.ok) copy = await r.json();
  } catch (e) { console.warn('copy.json did not load, keeping the words in the page', e); }
  for (const n of document.querySelectorAll('[data-copy]')) {
    const t = copy[n.dataset.copy];
    if (typeof t === 'string' && t) n.textContent = t;
  }
  for (const n of document.querySelectorAll('[data-copy-label]')) {
    const t = copy[n.dataset.copyLabel];
    if (typeof t === 'string' && t) n.setAttribute('aria-label', t);
  }
  return copy;
}

const KEY = 'cme-theme';
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
export function bindTheme(btn) {
  if (!btn) return;
  const sync = () => btn.setAttribute('aria-pressed', String(isDark()));
  btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: theme still switches for this page */ }
    sync();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  sync();
}
