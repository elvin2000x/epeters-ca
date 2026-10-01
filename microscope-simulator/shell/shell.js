/* App shell for every page of the Cell and Molecule Explorer. One tag per page:
     <script type="module" src="../shell/shell.js" data-page="cells"></script>
   It adds: the header (app name, scale rail, search, paths, Learn menu, theme), global search (Ctrl+K or /),
   guided paths with a dock that follows you across pages, glossary popovers on description text, the
   "Test yourself" drawer and the connections panel. Page-specific wiring lives in PAGES below, so a page only
   needs the one tag. Words come from data/copy.json (shell.*, search.*, paths.*, quiz.*, glossary.*).
   Data: data/search.json, paths.json, glossary.json, quiz.json, links.json (all built by tools/build_*.py).
   Public API: window.CME (and the exports at the bottom): connections(ref), renderConnections(target, ref),
   openSearch(), openPaths(id?), openQuiz(section?), setLevel(level), glossarize(element), go(href). */

const SELF = new URL(import.meta.url);
const BASE = new URL('../', SELF);
const TAG = document.querySelector('script[src*="shell/shell.js"]');
const PAGE_ID = (TAG && TAG.dataset.page) || guessPage();
// The scale bar: five levels. Cell parts belong to the Cell level (one tab; the cells page zooms into the parts).
// Older data and links may still say 'part': lv() folds it into 'cell', so it shows the Cell tab and colour.
const LEVELS = ['atom', 'molecule', 'big', 'cell', 'organism'];
const lv = (l) => (l === 'part' ? 'cell' : l);
const RAIL_HREF = { atom: 'elements/', molecule: 'molecules/#water', big: 'molecules/#hemoglobin', cell: 'cells/', organism: 'microscope/' };
const QUIZ_SEC = { atom: 'atoms', molecule: 'molecules', big: 'molecules', cell: 'cells', organism: 'organisms' };
const LEARN = [['lab', 'lab/'], ['processes', 'processes/'], ['light', 'light/'], ['shrink', 'microscope/shrink.html'], ['heat', 'heat/'],
  ['spark', 'spark/'], ['nutrients', 'nutrients/'], ['teach', 'teach/']];

const hash = () => decodeURIComponent(location.hash.slice(1));
const stopOf = () => (/^s=([\w-]+)/.exec(hash()) || [])[1];
const elRef = () => { const h = hash().trim(); return h ? { type: 'element', id: h } : null; };
const MUSCLE_STOPS = { muscle: ['cell', { type: 'cell', id: 'muscle' }], fibre: ['cell', { type: 'cell', id: 'muscle' }], sarcomere: ['cell', { type: 'part', id: 'myofibrils' }], molecule: ['big', { type: 'molecule', id: 'actin' }] };

/* Per-page wiring. level: string or function; ref: what the connections panel describes; hide: the page's own header
   bits the shell replaces; themeBtn: the page's own theme button (the shell clicks it so the page's own theme code runs);
   glossary: containers whose description text gets glossary terms; conn: where the connections panel goes;
   hashNav: the page follows hash changes without a reload; overlay: the bar floats over a full-screen stage. */
const PAGES = {
  home: { overlay: true, hide: ['.jbar'], themeBtn: '#theme', level: null, glossary: [], main: '#main' },
  cells: {
    level: 'cell', // a whole cell (#animal) and one of its parts (#animal/nucleus) are both the Cell level
    ref: () => { const [c, p] = hash().split('/'); return p ? { type: 'part', id: p, cell: c } : { type: 'cell', id: c || 'animal' }; },
    glossary: ['#summary', '#partText'], conn: { after: '#partCard' }, hashNav: true, main: '#panel',
  },
  muscle: {
    level: () => (MUSCLE_STOPS[stopOf() || 'muscle'] || [])[0] || 'cell',
    ref: () => (MUSCLE_STOPS[stopOf() || 'muscle'] || [])[1] || null,
    hide: ['.stagewrap > a.brand'], glossary: ['#story', '#deeperText'], conn: { before: '#altCard' }, hashNav: true, main: '#panel',
  },
  elements: { level: 'atom', ref: elRef, hide: ['body > header.topbar'], themeBtn: '#theme', glossary: ['#card'], conn: { after: '#card' }, hashNav: true, main: '#main' },
  atom: { level: 'atom', ref: elRef, hide: ['body > header.topbar'], themeBtn: '#theme', glossary: ['#viewer .atomv-note'], conn: { after: '#viewer' }, hashNav: true, main: 'main' },
  molecules: {
    level: () => molLevel(hash().split('?')[0]),
    ref: () => { const id = hash().split('?')[0]; return id ? { type: 'molecule', id } : null; },
    hide: ['.stagewrap > a.brand', '#themeBtn'], glossary: ['#detail'], conn: { after: '#detail' }, hashNav: true, main: '#panel',
  },
  microscope: {
    level: 'organism', ref: () => { const h = hash(); return h && h !== 'pond' ? { type: 'organism', id: h } : null; },
    hide: ['.stagewrap > a.brand', '#themeBtn'], glossary: ['#introP', '#facts', '#pondFacts'], conn: { after: '#tray' }, hashNav: true, main: '#panel',
  },
  lab: { level: 'molecule', hide: ['body > header.topbar'], themeBtn: '#theme', glossary: ['#atomBody'], hashNav: true, main: 'main.lab' },
  processes: {
    level: () => PROCESS_LEVEL[hash().split('/')[0]] || null,
    ref: () => { const id = hash().split('/')[0]; return id ? { type: 'process', id } : null; }, conn: { after: '#steps' },
    hide: ['body > header.topbar > a.brand', '#theme', '.topnav a.navlink[href="../index.html"]'], themeBtn: '#theme',
    glossary: ['#exSummary', '#stepText'], hashNav: true, main: '#main',
  },
  teach: { level: null, glossary: [], hashNav: true },
  dna: { level: 'big', glossary: [], hashNav: false, main: '#dna' },
  // Hero scenes (Builder D): no own header to hide; they follow data-theme set by the shell's theme button.
  morph: { level: 'molecule', glossary: [], hashNav: false, main: '#morph' },
  'atp-scene': { level: 'molecule', glossary: [], hashNav: false, main: '#atp' },
  lineup: { level: 'molecule', glossary: [], hashNav: false, main: '#lineup' },
  // Follow a photon (Builder E, web/light/): sunlight into a leaf, drawn at the cell scale. Stops are hash routed.
  light: { level: 'cell', glossary: [], hashNav: true, main: '#light' },
  // Shrink yourself (Builder F, microscope/shrink.html): swimmer down to a bacterium. No Connections tray here.
  shrink: { level: 'cell', hide: ['.stagewrap > a.brand'], glossary: ['#introP', '#whoText', '#deeper'], hashNav: true, main: '#panel' },
  // Heat vs bonds (Builder G), Neuron spark (Builder H), Vitamins and minerals (Builder I).
  heat: { level: 'molecule', glossary: ['.ht-why', '.ht-learn'], hashNav: false, main: '#heat' },
  spark: { level: 'cell', glossary: ['#lab .sp-phase', '#learn'], hashNav: false, main: '#main' },
  nutrients: { level: 'molecule', hide: ['body > header.topbar'], themeBtn: '#theme', glossary: ['#detail'], hashNav: true, main: '#main' },
};
// How life works: the rail shows the scale each explainer's scene is drawn at.
const PROCESS_LEVEL = { 'dna-to-protein': 'big', mitosis: 'cell', respiration: 'cell', photosynthesis: 'cell', 'osmosis-lab': 'cell' };
const CFG = Object.assign({ level: null, hide: [], glossary: [], hashNav: false }, PAGES[PAGE_ID] || {});

function guessPage() {
  const p = location.pathname.replace(BASE.pathname, '');
  if (!p || p === 'index.html') return 'home';
  if (p.startsWith('muscle')) return 'muscle';
  return p.split('/')[0];
}

/* ---------- tiny helpers ---------- */
const $ = (s, root = document) => root.querySelector(s);
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v; // static icon markup only, never data
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
const cache = new Map();
function getJSON(rel) {
  if (!cache.has(rel)) cache.set(rel, fetch(new URL(rel, BASE)).then((r) => { if (!r.ok) throw new Error(rel + ' ' + r.status); return r.json(); }));
  return cache.get(rel);
}
let COPY = {};
function t(key, vars) {
  let s = COPY[key];
  if (typeof s !== 'string') s = key.split('.').pop().replace(/([A-Z])/g, ' $1').toLowerCase();
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}
const abs = (href) => new URL(href, BASE);
const uid = (() => { let n = 0; return (p) => `cme-${p}-${++n}`; })();
const ICON = {
  logo: '<svg class="cme-logo" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#0b7469"/><circle cx="16" cy="16" r="6" fill="none" stroke="#fff" stroke-width="3"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
  paths: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="6" r="2.2"/><path d="M7 18h6a3.5 3.5 0 0 0 0-7h-2a3.5 3.5 0 0 1 0-7h6"/></svg>',
  learn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8.5 12 4l10 4.5-10 4.5z"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5"/><path d="M22 8.5V14"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path class="fillme" d="M12 3.5a8.5 8.5 0 0 1 0 17z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M6 14l6 6 6-6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4M6 10l6-6 6 6"/></svg>',
  side: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
};
const levelName = (l) => t(`shell.level.${l}`);
const dot = (l) => el('span', { class: 'cme-dot', 'data-level': lv(l), 'aria-hidden': 'true' });
const isTyping = (n) => n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: the URL still carries the path */ } },
};

/* ---------- data helpers ---------- */
let LINKS = null;
async function links() { if (!LINKS) LINKS = await getJSON('data/links.json').catch(() => ({ molecules: {}, elements: {}, parts: {}, cells: {}, organisms: {}, atoms: { rows: {} } })); return LINKS; }
function molLevel(id) {
  const m = LINKS && LINKS.molecules && LINKS.molecules[id];
  return m ? (m.group === 'small' ? 'molecule' : 'big') : 'molecule';
}
function resolveElement(L, id) {
  const rows = (L.atoms && L.atoms.rows) || {};
  if (rows[id]) return id;
  const k = String(id).toLowerCase();
  return Object.keys(rows).find((s) => s.toLowerCase() === k || String(rows[s].z) === k) || null;
}

/* ---------- navigation ---------- */
function go(href, keepPath) {
  const u = abs(href);
  const pathParam = new URLSearchParams(location.search).get('path');
  if (keepPath && pathParam && !u.searchParams.has('path')) u.searchParams.set('path', pathParam);
  if (u.pathname === location.pathname && u.search === location.search) {
    if (u.hash === location.hash) return;
    if (CFG.hashNav) { location.hash = u.hash; return; }
    history.replaceState(null, '', u.href); location.reload(); return;
  }
  location.assign(u.href);
}
// Pages write their state into the URL with history.replaceState, which fires no event: wrap it once so the rail
// and the connections panel can follow along.
for (const fn of ['pushState', 'replaceState']) {
  const orig = history[fn];
  history[fn] = function (...a) { const r = orig.apply(this, a); queueMicrotask(() => document.dispatchEvent(new CustomEvent('cme:url'))); return r; };
}
window.addEventListener('hashchange', () => document.dispatchEvent(new CustomEvent('cme:url')));
window.addEventListener('popstate', () => document.dispatchEvent(new CustomEvent('cme:url')));

/* ---------- theme ---------- */
// Pages that do not restore the saved theme themselves get it here, so the choice follows the visitor everywhere.
try { const saved = localStorage.getItem('cme-theme'); if (!document.documentElement.dataset.theme && (saved === 'light' || saved === 'dark')) document.documentElement.dataset.theme = saved; } catch (e) { /* storage blocked */ }
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
function toggleTheme() {
  const own = CFG.themeBtn && $(CFG.themeBtn);
  if (own) own.click();
  else {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cme-theme', next); } catch (e) { /* private mode: still switches for this page */ }
  }
  document.dispatchEvent(new CustomEvent('cme:theme', { detail: { dark: isDark() } }));
  syncTheme();
}
function syncTheme() { document.querySelectorAll('[data-cme-theme]').forEach((b) => b.setAttribute('aria-pressed', String(isDark()))); }

/* ---------- header ---------- */
let railItems = [];
let currentLevel = null;
function buildBar() {
  const bar = el('header', { class: 'cme-bar', role: 'banner' });
  bar.append(el('a', { class: 'cme-brand', href: abs('index.html').href, 'aria-label': t('shell.homeLabel') },
    el('span', { html: ICON.logo, style: 'display:contents' }),
    el('span', { class: 'cme-brand-name', text: t('shell.brand') }),
    el('span', { class: 'cme-brand-short', 'aria-hidden': 'true', text: t('shell.brandShort') })));
  const ol = el('ol', { class: 'cme-rail' });
  railItems = LEVELS.map((l) => {
    const a = el('a', { class: 'cme-step', href: abs(RAIL_HREF[l]).href, 'data-level': l }, dot(l), el('span', { class: 'cme-lab', text: levelName(l) }));
    ol.append(el('li', {}, a));
    return a;
  });
  bar.append(el('nav', { class: 'cme-railnav', 'aria-label': t('shell.railLabel') }, ol));

  const learnId = uid('learn');
  const learnBtn = el('button', { class: 'cme-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': learnId, html: ICON.learn },
    el('span', { class: 'cme-txt', text: t('shell.learn') }));
  learnBtn.setAttribute('aria-label', t('shell.learn'));
  const menu = el('ul', { class: 'cme-menu', id: learnId, hidden: true });
  const close = (focus) => { menu.hidden = true; learnBtn.setAttribute('aria-expanded', 'false'); if (focus) learnBtn.focus(); };
  const item = (label, fn) => el('li', {}, el('button', { type: 'button', onclick: () => { close(); fn(); } }, label));
  menu.append(
    item(t('shell.learn.paths'), () => openPaths()),
    item(t('shell.learn.quiz'), () => openQuiz()),
    el('li', { 'aria-hidden': 'true' }, el('hr')),
    ...LEARN.map(([k, href]) => el('li', { 'data-learn': k }, el('a', { href: abs(href).href, text: t(`shell.learn.${k}`) }))),
    el('li', { class: 'cme-themeitem', 'aria-hidden': 'true' }, el('hr')),
    el('li', { class: 'cme-themeitem' }, el('button', { type: 'button', 'data-cme-theme': '', 'aria-pressed': 'false', onclick: () => toggleTheme() }, t('shell.theme'))),
  );
  let checked = false;
  learnBtn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open; learnBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const first = menu.querySelector('a, button'); if (first) first.focus();
      if (!checked) { checked = true; checkLearn(menu); }
    }
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('a, button')].filter((n) => n.offsetParent);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !learnBtn.contains(e.target)) close(); });
  document.addEventListener('focusin', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== learnBtn) close(); });

  const searchBtn = el('button', { class: 'cme-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-keyshortcuts': 'Control+K /', html: ICON.search, onclick: () => openSearch() },
    el('span', { class: 'cme-txt', text: t('shell.search') }), el('span', { class: 'cme-kbd', 'aria-hidden': 'true', text: t('shell.searchKey') }));
  searchBtn.setAttribute('aria-label', t('shell.search'));
  const pathsBtn = el('button', { class: 'cme-btn cme-paths-btn', type: 'button', 'aria-haspopup': 'dialog', html: ICON.paths, onclick: () => openPaths() },
    el('span', { class: 'cme-txt', text: t('shell.paths') }));
  const themeBtn = el('button', { class: 'cme-btn cme-theme-btn', type: 'button', 'data-cme-theme': '', 'aria-pressed': 'false', html: ICON.theme, onclick: () => toggleTheme() },
    el('span', { class: 'cme-txt', text: t('shell.theme') }));
  themeBtn.setAttribute('aria-label', t('shell.theme'));
  bar.append(el('div', { class: 'cme-actions' }, searchBtn, pathsBtn, el('div', { class: 'cme-learnwrap' }, learnBtn, menu), themeBtn));
  return bar;
}
async function checkLearn(menu) {
  for (const [k, href] of LEARN) {
    let ok = false;
    try { ok = (await fetch(abs(href.endsWith('/') ? href + 'index.html' : href), { method: 'HEAD' })).ok; } catch (e) { ok = false; }
    if (!ok) {
      const li = menu.querySelector(`[data-learn="${k}"]`);
      if (li) li.replaceChildren(el('span', { class: 'cme-soon' }, t(`shell.learn.${k}`), el('small', { text: t('shell.soon') })));
    }
  }
}
function setLevel(l) {
  currentLevel = LEVELS.includes(lv(l)) ? lv(l) : null;
  for (const a of railItems) {
    if (a.dataset.level === currentLevel) { a.setAttribute('aria-current', 'location'); a.setAttribute('aria-label', t('shell.youAreHere', { level: levelName(a.dataset.level) })); }
    else { a.removeAttribute('aria-current'); a.removeAttribute('aria-label'); }
  }
}
function levelNow() { return typeof CFG.level === 'function' ? CFG.level() : CFG.level; }

/* ---------- global search ---------- */
let searchDlg = null;
let ROWS = null;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
function scoreField(f, q) {
  if (!f) return 0;
  if (f === q) return 100;
  if (f.startsWith(q)) return 85 - Math.min(10, f.length - q.length) * 0.5;
  const words = f.split(/[\s,()\-/]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 70;
  if (f.includes(q)) return 52;
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    for (const w of words) {
      if (editDist(q, w.slice(0, q.length), max) <= max) return 44 - (w.length > q.length ? 2 : 0);
      if (editDist(q, w, max) <= max) return 42;
    }
  }
  if (q.length >= 3) { // letters in order, few gaps
    let i = 0, gaps = 0, last = -1;
    for (let j = 0; j < f.length && i < q.length; j++) if (f[j] === q[i]) { if (last >= 0 && j - last > 1) gaps++; last = j; i++; }
    if (i === q.length && gaps <= 2) return 26 - gaps * 4;
  }
  return 0;
}
function scoreRow(r, q) {
  const toks = q.split(' ');
  let total = 0;
  for (const tok of toks) {
    let best = scoreField(r._t, tok);
    for (const k of r._k) { if (k === tok) best = Math.max(best, 98); else best = Math.max(best, scoreField(k, tok) * 0.9); }
    if (r._s) best = Math.max(best, scoreField(r._s, tok) * 0.45);
    if (!best) return 0;
    total += best;
  }
  if (toks.length > 1 && r._t.includes(q)) total += 30;
  // shorter titles win ties (hemoglobin itself before "Inside, packed with hemoglobin")
  return total / toks.length + (r.l === 'page' ? -3 : 0) - Math.min(8, r._t.length * 0.12);
}
const GROUPS = ['organism', 'cell', 'big', 'molecule', 'atom', 'path', 'term', 'learn', 'page'];
function runSearch(qRaw) {
  const q = norm(qRaw);
  if (!ROWS) return [];
  let hits;
  if (!q) {
    const pick = new Set(['ATP', 'Mitochondria', 'Iron', 'Paramecium', 'DNA', 'Red blood cell']);
    hits = ROWS.filter((r) => r.l === 'path' || (pick.has(r.t) && r.l !== 'term')).map((r) => ({ r, s: 1 }));
  } else {
    hits = ROWS.map((r) => ({ r, s: scoreRow(r, q) })).filter((h) => h.s > 0).sort((a, b) => b.s - a.s);
  }
  const groups = new Map();
  for (const h of hits) {
    const g = groups.get(h.r.l) || [];
    if (g.length < (h.r.l === 'atom' || h.r.l === 'cell' ? 8 : 6)) g.push(h); // Cell holds cells and their parts
    groups.set(h.r.l, g);
  }
  return [...groups.entries()].sort((a, b) => (q ? b[1][0].s - a[1][0].s : GROUPS.indexOf(a[0]) - GROUPS.indexOf(b[0]))).slice(0, 8);
}
function highlight(text, qRaw) {
  const q = norm(qRaw).split(' ')[0];
  const span = el('span', { class: 'cme-opt-t' });
  const i = q ? norm(text).indexOf(q) : -1;
  if (i < 0 || norm(text).length !== text.length) { span.textContent = text; return span; }
  span.append(text.slice(0, i), el('mark', { text: text.slice(i, i + q.length) }), text.slice(i + q.length));
  return span;
}
async function openSearch(initial) {
  if (!searchDlg) searchDlg = buildSearch();
  const { dlg, input, render } = searchDlg;
  if (!dlg.open) dlg.showModal();
  if (typeof initial === 'string') input.value = initial;
  input.focus(); input.select();
  if (!ROWS) {
    try {
      const d = await getJSON('data/search.json');
      ROWS = d.rows.map((r) => ({ ...r, l: lv(r.l), _t: norm(r.t), _s: norm(r.s), _k: (r.k || []).map(norm) }));
    } catch (e) { ROWS = []; }
  }
  render();
}
function buildSearch() {
  const dlg = el('dialog', { class: 'cme-dlg search', 'aria-label': t('search.label') });
  const listId = uid('results'), helpId = uid('shelp');
  const input = el('input', {
    type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listId, 'aria-autocomplete': 'list',
    'aria-describedby': helpId, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: t('search.placeholder'), 'aria-label': t('search.label'),
  });
  const list = el('div', { class: 'cme-results', id: listId, role: 'listbox', 'aria-label': t('search.resultsLabel') });
  const status = el('p', { class: 'cme-sr', role: 'status', 'aria-live': 'polite' });
  const closeBtn = el('button', { class: 'cme-x', type: 'button', 'aria-label': t('shell.close'), html: ICON.close, onclick: () => dlg.close() });
  dlg.append(el('div', { class: 'cme-sbox', html: ICON.search }, input, closeBtn), list,
    el('p', { class: 'cme-shelp', id: helpId, text: t('search.help') }), status);
  let opts = [], active = -1, timer = 0;
  const setActive = (i) => {
    if (!opts.length) { active = -1; input.removeAttribute('aria-activedescendant'); return; }
    active = (i + opts.length) % opts.length;
    opts.forEach((o, k) => o.node.setAttribute('aria-selected', String(k === active)));
    input.setAttribute('aria-activedescendant', opts[active].node.id);
    opts[active].node.scrollIntoView({ block: 'nearest' });
  };
  const choose = (o, alt) => {
    if (!o) return;
    dlg.close();
    if (o.r.l === 'path') { startPath(o.r.p, 1); return; }
    const href = alt && o.r.x ? o.r.x.h : o.r.h;
    if (href) go(href);
  };
  const render = () => {
    const q = input.value;
    const groups = runSearch(q);
    list.replaceChildren(); opts = [];
    if (!ROWS) { list.append(el('p', { class: 'cme-empty', text: t('search.loading') })); return; }
    if (!groups.length) { list.append(el('p', { class: 'cme-empty', text: t('search.empty', { q }) })); }
    for (const [lvl, hits] of groups) {
      const gid = uid('g');
      const g = el('div', { role: 'group', 'aria-labelledby': gid },
        el('div', { class: 'cme-group-h', id: gid, role: 'presentation' }, LEVELS.includes(lvl) ? dot(lvl) : null, t(`search.group.${lvl}`)));
      for (const h of hits) {
        const r = h.r;
        const node = el('div', { class: 'cme-opt', role: 'option', id: uid('o'), 'aria-selected': 'false', 'data-level': LEVELS.includes(r.l) ? r.l : null });
        if (r.l === 'atom') node.append(el('span', { class: 'cme-sym', 'aria-hidden': 'true', text: (r.k && r.k[0]) || r.t.slice(0, 2) }));
        node.append(el('span', { class: 'cme-opt-main' }, highlight(r.t, q), r.s ? el('span', { class: 'cme-opt-s', text: r.s }) : null));
        if (r.x) {
          const altB = el('span', { class: 'cme-opt-alt', 'aria-hidden': 'true', text: t('search.alt3d') });
          altB.addEventListener('click', (e) => { e.stopPropagation(); choose(o, true); });
          node.append(altB);
        } else if (LEVELS.includes(r.l) && !q) node.append(el('span', { class: 'cme-badge' }, levelName(r.l)));
        const o = { r, node };
        node.addEventListener('click', () => choose(o));
        node.addEventListener('mousemove', () => { if (opts[active] !== o) setActive(opts.indexOf(o)); });
        opts.push(o); g.append(node);
      }
      list.append(g);
    }
    setActive(0);
    clearTimeout(timer);
    timer = setTimeout(() => { status.textContent = q ? t('search.count', { n: opts.length }) : ''; }, 400);
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(opts.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(opts[active], e.shiftKey); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  return { dlg, input, render };
}

/* ---------- guided paths ---------- */
let PATHS = null;
async function paths() { if (!PATHS) PATHS = (await getJSON('data/paths.json').catch(() => ({ paths: [] }))).paths; return PATHS; }
function pathState() {
  const p = new URLSearchParams(location.search).get('path');
  if (p) { const [id, n] = p.split('.'); const s = { id, step: Math.max(1, parseInt(n, 10) || 1) }; store.set('cme-path', s); return s; }
  return store.get('cme-path');
}
function stepUrl(path, n) {
  const s = path.steps[n - 1];
  const u = abs(s.href);
  u.searchParams.set('path', `${path.id}.${n}`);
  return u;
}
async function startPath(id, n) {
  const P = (await paths()).find((p) => p.id === id);
  if (!P) return;
  n = Math.min(Math.max(1, n), P.steps.length);
  store.set('cme-path', { id, step: n });
  const u = stepUrl(P, n);
  if (u.pathname === location.pathname && CFG.hashNav) {
    history.replaceState(null, '', u.pathname + u.search + location.hash);
    if (u.hash !== location.hash) location.hash = u.hash;
    renderDock();
  } else location.assign(u.href);
}
function exitPath() {
  store.set('cme-path', null);
  const u = new URL(location.href);
  if (u.searchParams.has('path')) { u.searchParams.delete('path'); history.replaceState(null, '', u.href); }
  renderDock();
}
function sentenceBlock(texts) {
  const srcs = [];
  const box = el('div', { class: 'cme-steptext' });
  for (const s of texts) {
    const nums = s.src.map((x) => { let i = srcs.findIndex((y) => y.id === x.id); if (i < 0) { srcs.push(x); i = srcs.length - 1; } return i + 1; });
    box.append(el('p', {}, s.t, el('sup', { 'aria-label': t('paths.sourcesNumbered', { n: nums.join(', ') }) }, `[${nums.join(',')}]`)));
  }
  if (texts.some((s) => s.computed)) box.append(el('p', { class: 'cme-note', text: t('paths.computed') }));
  const ol = el('ol', { class: 'cme-srcs', 'aria-label': t('paths.sources') });
  for (const s of srcs) ol.append(el('li', {}, s.u ? el('a', { href: s.u, target: '_blank', rel: 'noopener noreferrer', text: s.t }) : s.t));
  box.append(ol);
  return box;
}
let pathsDlg = null;
async function openPaths(id, n) {
  if (!pathsDlg) {
    const dlg = el('dialog', { class: 'cme-dlg', 'aria-labelledby': 'cme-paths-h' });
    const body = el('div', { class: 'cme-dlg-body' });
    dlg.append(el('div', { class: 'cme-dlg-head' }, el('h2', { id: 'cme-paths-h', text: t('paths.title') }),
      el('button', { class: 'cme-x', type: 'button', 'aria-label': t('shell.close'), html: ICON.close, onclick: () => dlg.close() })), body);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    pathsDlg = { dlg, body };
  }
  const { dlg, body } = pathsDlg;
  const P = await paths();
  const showList = () => {
    const ul = el('ul', { class: 'cme-plist' });
    for (const p of P) {
      ul.append(el('li', {}, el('button', { class: 'cme-pcard', type: 'button', onclick: () => showPath(p, 1) },
        el('strong', { text: t(p.titleKey) }), el('span', { text: t(p.introKey) }),
        el('span', { class: 'cme-pdots', 'aria-hidden': 'true' }, p.steps.map((s) => dot(s.level)), el('span', { text: t('paths.steps', { n: p.steps.length }) })))));
    }
    body.replaceChildren(el('p', { style: 'margin:0', text: t('paths.intro') }), ul);
    const f = body.querySelector('button'); if (f) f.focus();
  };
  const showPath = (p, k) => {
    const s = p.steps[k - 1];
    const prog = el('ol', { class: 'cme-progress', 'aria-label': t('paths.progress') });
    p.steps.forEach((st, i) => prog.append(el('li', {}, el('button', {
      type: 'button', 'data-level': lv(st.level), class: i + 1 < k ? 'done' : null, 'aria-current': i + 1 === k ? 'step' : null,
      'aria-label': t('paths.stepLabel', { n: i + 1, title: st.title }), onclick: () => showPath(p, i + 1), text: String(i + 1),
    }))));
    const back = el('button', { class: 'cme-btn', type: 'button', disabled: k === 1, onclick: () => showPath(p, k - 1), text: t('paths.back') });
    const next = el('button', { class: 'cme-btn', type: 'button', disabled: k === p.steps.length, onclick: () => showPath(p, k + 1), text: t('paths.next') });
    const open = el('a', { class: 'cme-btn primary', href: stepUrl(p, k).href, text: t('paths.open'), onclick: (e) => { e.preventDefault(); dlg.close(); startPath(p.id, k); } });
    const copyMsg = el('span', { class: 'cme-note', role: 'status' });
    const copy = el('button', { class: 'cme-btn', type: 'button', text: t('paths.copyLink'), onclick: async () => {
      try { await navigator.clipboard.writeText(stepUrl(p, k).href); copyMsg.textContent = t('paths.copied'); } catch (e) { copyMsg.textContent = stepUrl(p, k).href; }
    } });
    body.replaceChildren(
      el('button', { class: 'cme-btn', type: 'button', onclick: showList, text: t('paths.all') }),
      el('h3', { class: 'cme-steph', style: 'margin-top:12px', text: t(p.titleKey) }),
      prog,
      el('p', { class: 'cme-steplvl', 'data-level': lv(s.level) }, dot(s.level), `${t('paths.stepOf', { n: k, total: p.steps.length })} · ${levelName(lv(s.level))}`),
      el('h4', { class: 'cme-steph', id: 'cme-step-h', tabindex: '-1', text: s.title }),
      sentenceBlock(s.text),
      el('div', { class: 'cme-row' }, back, next, el('span', { class: 'cme-grow' }), open),
      el('div', { class: 'cme-row' }, copy, copyMsg),
    );
    $('#cme-step-h', body).focus();
  };
  if (!dlg.open) dlg.showModal();
  const st = id ? { id, step: n || 1 } : null;
  const p = st && P.find((x) => x.id === st.id);
  if (p) showPath(p, Math.min(st.step, p.steps.length)); else showList();
}
let dockEl = null;
async function renderDock() {
  const st = pathState();
  const P = st && (await paths()).find((p) => p.id === st.id);
  if (!P) { if (dockEl) dockEl.remove(); dockEl = null; document.body.classList.remove('cme-docked'); document.documentElement.style.setProperty('--cme-dock-h', '0px'); return; }
  const k = Math.min(st.step, P.steps.length), s = P.steps[k - 1];
  const nav = (n) => { store.set('cme-path', { id: P.id, step: n }); startPath(P.id, n); };
  const prev = el('button', { class: 'cme-btn', type: 'button', disabled: k === 1, onclick: () => nav(k - 1) }, el('span', { 'aria-hidden': 'true', text: '←' }), el('span', { class: 'cme-txt', text: t('paths.back') }));
  prev.setAttribute('aria-label', t('paths.back'));
  const last = k === P.steps.length;
  const next = el('button', { class: 'cme-btn primary', type: 'button', onclick: () => (last ? (exitPath(), openPaths()) : nav(k + 1)) },
    el('span', { class: 'cme-txt', text: last ? t('paths.done') : t('paths.next') }), el('span', { 'aria-hidden': 'true', text: last ? '✓' : '→' }));
  next.setAttribute('aria-label', last ? t('paths.done') : t('paths.next'));
  const exit = el('button', { class: 'cme-x', type: 'button', 'aria-label': t('paths.exit'), html: ICON.close, onclick: exitPath });
  const info = el('button', { class: 'cme-dock-info', type: 'button', 'aria-haspopup': 'dialog', onclick: () => openPaths(P.id, k) },
    el('b', { text: `${t(P.titleKey)} · ${t('paths.stepOf', { n: k, total: P.steps.length })}` }), el('span', { text: s.title }));
  const dock = el('aside', { class: 'cme-dock', 'aria-label': t('paths.dock'), 'data-level': lv(s.level) }, info, prev, next, exit);
  if (dockEl) dockEl.replaceWith(dock); else document.body.append(dock);
  dockEl = dock;
  document.body.classList.add('cme-docked');
  requestAnimationFrame(() => document.documentElement.style.setProperty('--cme-dock-h', dock.offsetHeight + 'px'));
}

/* ---------- glossary ---------- */
let TERMS = null;
const SKIP = 'a, button, sup, code, script, style, textarea, input, select, option, label, svg, canvas, h1, h2, h3, h4, .cme-term, .cme-noterm, [contenteditable], [aria-hidden="true"]';
async function terms() {
  if (!TERMS) {
    const d = await getJSON('data/glossary.json').catch(() => ({ terms: [] }));
    TERMS = d.terms.filter((x) => !x.scope || x.scope.includes(PAGE_ID)).map((x) => ({ ...x, rx: new RegExp(x.match, x.case ? '' : 'i') }));
  }
  return TERMS;
}
let glBusy = false;
function blockOf(node, root) {
  let n = node.parentElement;
  while (n && n !== root && !/^(P|LI|DD|BLOCKQUOTE|TD|SECTION|ARTICLE|DIV)$/.test(n.tagName)) n = n.parentElement;
  return n || root;
}
function glossarize(root) {
  if (!root || !TERMS || !TERMS.length) return;
  glBusy = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim().length > 2 && !(n.parentElement && n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let node of nodes) {
      const block = blockOf(node, root);
      // terms already marked in this block (read from the page, so text a page rewrites in place is marked again)
      const used = new Set([...block.querySelectorAll('.cme-term')].filter((b) => blockOf(b, root) === block).map((b) => b.dataset.term));
      for (const id of [...used]) { const tm = TERMS.find((x) => x.id === id); if (tm) for (const o of TERMS) if (o.rx.source === tm.rx.source) used.add(o.id); }
      for (;;) {
        let best = null;
        for (const term of TERMS) {
          if (used.has(term.id)) continue;
          const m = term.rx.exec(node.nodeValue);
          // earliest match wins; at the same spot the longer phrase wins ("membrane potential" over "membrane")
          if (m && (!best || m.index < best.m.index || (m.index === best.m.index && m[0].length > best.m[0].length))) best = { term, m };
        }
        if (!best) break;
        const { term, m } = best;
        const after = node.splitText(m.index);
        const rest = after.splitText(m[0].length);
        const btn = el('button', { type: 'button', class: 'cme-term', 'data-term': term.id, 'aria-expanded': 'false', 'aria-haspopup': 'dialog', text: m[0] });
        after.replaceWith(btn);
        used.add(term.id);
        // the same term is not marked twice in one block; terms in the same text node are found in reading order
        for (const tm of TERMS) if (tm.rx.source === term.rx.source) used.add(tm.id);
        node = rest;
      }
    }
  } finally { queueMicrotask(() => { glBusy = false; }); }
}
function watchGlossary(sel) {
  const root = $(sel);
  if (!root) { // the page builds this part after the shell starts: wait for it (up to 15 s)
    const mo = new MutationObserver(() => { if ($(sel)) { mo.disconnect(); watchGlossary(sel); } });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 15000);
    return;
  }
  glossarize(root);
  let timer = 0;
  new MutationObserver(() => { if (glBusy) return; clearTimeout(timer); timer = setTimeout(() => glossarize(root), 120); })
    .observe(root, { childList: true, subtree: true, characterData: true });
}
let pop = null, popFrom = null;
function closePop(focus) {
  if (!pop) return;
  pop.remove(); pop = null;
  if (popFrom) { popFrom.setAttribute('aria-expanded', 'false'); if (focus) popFrom.focus(); }
  popFrom = null;
}
function openPop(btn) {
  const term = TERMS && TERMS.find((x) => x.id === btn.dataset.term);
  if (!term) return;
  closePop(false);
  const hid = uid('gl');
  const here = term.href && abs(term.href).href === location.href.replace(/[?&]path=[^#&]*/, '');
  pop = el('div', { class: 'cme-pop', role: 'dialog', 'aria-labelledby': hid, tabindex: '-1' },
    el('h2', {}, el('span', { id: hid, text: term.term }), el('button', { class: 'cme-x', type: 'button', 'aria-label': t('shell.close'), html: ICON.close, onclick: () => closePop(true) })),
    el('p', { text: term.def.t }),
    el('p', { class: 'cme-src' }, `${term.def.written ? t('glossary.written') : t('glossary.source')}: `,
      ...term.def.src.map((s, i) => [i ? '; ' : '', s.u ? el('a', { href: s.u, target: '_blank', rel: 'noopener noreferrer', text: s.t }) : s.t])),
    term.href && !here ? el('p', {}, el('a', { href: abs(term.href).href, onclick: (e) => { e.preventDefault(); closePop(false); go(term.href); }, text: t('glossary.see', { term: term.term }) })) : null);
  document.body.append(pop);
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(Math.max(12, r.left), innerWidth - w - 12);
  const top = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(12, r.top - h - 8);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  btn.setAttribute('aria-expanded', 'true'); popFrom = btn;
  pop.focus();
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); } });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.cme-term');
  if (b) { e.preventDefault(); e.stopPropagation(); if (popFrom === b) closePop(true); else openPop(b); return; }
  if (pop && !pop.contains(e.target)) closePop(false);
}, true);
document.addEventListener('focusin', (e) => { if (pop && !pop.contains(e.target) && e.target !== popFrom) closePop(false); });
window.addEventListener('scroll', () => closePop(false), { passive: true, capture: true });

/* ---------- connections ---------- */
let PATHS_CACHE = null;
async function connections(ref) {
  const L = await links();
  const P = PATHS_CACHE || (PATHS_CACHE = await paths());
  const out = { title: '', level: null, madeOf: [], partOf: [], seeAlso: [], basis: [] };
  const chip = (level, text, href, n, title) => ({ level: lv(level), text, href, n, title });
  const molChip = (id, n, el) => { const m = L.molecules[id]; return m && chip(m.group === 'small' ? 'molecule' : 'big', (m.short || m.name).split(' (')[0], `molecules/#${id}${el ? '?el=' + el : ''}`, n); };
  const partChip = (pid, cid) => { const p = L.parts && L.parts[pid]; if (!p) return null; const c = cid || p.cells[0]; return chip('part', p.name, `cells/#${c}/${pid}`, null, L.cells[c] && L.cells[c].name); };
  const inPaths = (type, id) => P.filter((p) => p.steps.some((s) => s.ref && s.ref.type === type && s.ref.id === id))
    .map((p) => ({ ...chip(null, t('shell.conn.inPath', { path: t(p.titleKey) }), null), path: p.id, step: p.steps.findIndex((s) => s.ref && s.ref.type === type && s.ref.id === id) + 1 }));
  if (!ref) return out;
  if (ref.type === 'element') {
    const sym = resolveElement(L, ref.id);
    const a = sym && L.atoms.rows[sym];
    if (!a) return out;
    out.title = a.name; out.level = 'atom';
    out.madeOf.push(chip(null, t('shell.conn.protons', { n: a.z })), chip(null, t('shell.conn.electrons', { n: a.z })));
    if (a.neutrons != null) out.madeOf.push(chip(null, t('shell.conn.neutrons', { n: a.neutrons, mass: a.massNumber })));
    for (const r of (L.elements[sym] || [])) out.partOf.push(molChip(r.molecule, r.count, sym));
    if (a.atom && PAGE_ID !== 'atom') out.seeAlso.push(chip('atom', t('shell.conn.atom3d', { name: a.name }), a.atom));
    if (PAGE_ID !== 'elements') out.seeAlso.push(chip('atom', t('shell.conn.inTable', { name: a.name }), a.href));
    out.seeAlso.push(...inPaths('element', sym));
    out.basis.push(t('shell.conn.basisAtom'));
    if ((L.elements[sym] || []).length) out.basis.push(t('shell.conn.basisCount'));
  } else if (ref.type === 'molecule') {
    const m = L.molecules[ref.id];
    if (!m) return out;
    out.title = m.name; out.level = m.group === 'small' ? 'molecule' : 'big';
    for (const [s, n] of Object.entries(m.elements)) out.madeOf.push(chip('atom', L.atoms.rows[s] ? L.atoms.rows[s].name : s, `elements/#${s}`, n));
    const seen = new Set();
    for (const c of m.cellParts) { const k = c.cell + '/' + c.part; if (!seen.has(k)) { seen.add(k); out.partOf.push(chip('part', c.partName, `cells/#${c.cell}/${c.part}`, null, c.cellName)); } }
    out.seeAlso.push(...inPaths('molecule', ref.id));
    out.basis.push(t('shell.conn.basisCount'));
    if (m.cellParts.length) out.basis.push(t('shell.conn.basisCells'));
  } else if (ref.type === 'part') {
    const p = L.parts && L.parts[ref.id];
    if (!p) return out;
    out.title = p.name; out.level = 'cell';
    if (p.molecule) out.madeOf.push(molChip(p.molecule));
    for (const c of p.cells) out.partOf.push(chip('cell', L.cells[c].name, L.cells[c].href));
    for (const [oid, o] of Object.entries(L.organisms || {})) for (const s of o.structures) if (s.part === ref.id) out.partOf.push(chip('organism', o.name, o.href, null, s.evidence));
    for (const [pid, q] of Object.entries(L.parts)) if (pid !== ref.id && q.name === p.name) for (const c of q.cells) out.seeAlso.push(chip('part', `${q.name}: ${L.cells[c].name}`, `cells/#${c}/${pid}`));
    out.seeAlso.push(...inPaths('part', ref.id));
    out.basis.push(t('shell.conn.basisCells'));
    if (out.partOf.some((c) => c.level === 'organism')) out.basis.push(t('shell.conn.basisOrganism'));
  } else if (ref.type === 'cell') {
    const c = L.cells && L.cells[ref.id];
    if (!c) return out;
    out.title = c.name; out.level = 'cell';
    for (const pid of c.parts) out.madeOf.push(partChip(pid, ref.id));
    for (const [oid, o] of Object.entries(L.organisms || {})) if (o.cell === ref.id) out.seeAlso.push(chip('organism', o.name, o.href, null, t('shell.conn.sameKind')));
    out.seeAlso.push(...inPaths('cell', ref.id));
    out.basis.push(t('shell.conn.basisCells'));
  } else if (ref.type === 'organism') {
    const o = L.organisms && L.organisms[ref.id];
    if (!o) return out;
    out.title = o.name; out.level = 'organism';
    for (const s of o.structures) out.madeOf.push({ ...chip(s.part ? 'part' : null, s.name, s.href), title: s.evidence, evidence: s });
    if (o.cell && L.cells[o.cell]) out.seeAlso.push(chip('cell', L.cells[o.cell].name, L.cells[o.cell].href, null, t('shell.conn.sameKind')));
    out.seeAlso.push(...inPaths('organism', ref.id));
    out.basis.push(t('shell.conn.basisOrganism'));
  } else if (ref.type === 'process') {
    const p = L.processes && L.processes[ref.id];
    if (!p) return out;
    out.title = p.name; out.level = PROCESS_LEVEL[ref.id] || null;
  }
  // Explore links (links.json "explore", built by tools/build_links.py): hands-on pages about this thing.
  const exId = ref.type === 'element' ? resolveElement(L, ref.id) : ref.id;
  const ex = ((L.explore || {})[ref.type] || {})[exId] || [];
  for (const x of ex) if (x.page !== PAGE_ID) out.seeAlso.push(chip(null, t(`shell.explore.${x.page}`), x.href));
  if (ex.length) out.basis.push(t('shell.conn.basisExplore'));
  else if (ref.type === 'process') out.title = ''; // nothing to show for this process: keep the panel hidden
  if (!out.title) return out;
  out.madeOf = out.madeOf.filter(Boolean); out.partOf = out.partOf.filter(Boolean); out.seeAlso = out.seeAlso.filter(Boolean);
  return out;
}
function chipNode(c) {
  const kids = [c.level ? dot(c.level) : null, el('span', { text: c.text }), c.n != null ? el('span', { class: 'cme-n', 'aria-label': t('shell.conn.count', { n: c.n }), text: '×' + c.n }) : null];
  if (c.path) return el('button', { class: 'cme-chip', type: 'button', onclick: () => openPaths(c.path, c.step) }, dot('cell'), el('span', { text: c.text }));
  if (!c.href) return el('span', { class: 'cme-chip plain', title: c.title || null }, ...kids);
  return el('a', { class: 'cme-chip', href: abs(c.href).href, 'data-level': c.level, title: c.title || null, onclick: (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); go(c.href, true); } }, ...kids);
}
async function renderConnections(target, ref) {
  return paintConnections(target || el('section'), await connections(ref));
}
function paintConnections(box, C) {
  box.className = 'cme-conn';
  const hid = box.id ? box.id + '-h' : uid('conn');
  box.setAttribute('aria-labelledby', hid);
  if (!C.title) { box.hidden = true; box.replaceChildren(); return box; }
  box.hidden = false;
  const col = (key, icon, items) => (items.length ? el('div', {}, el('h3', { html: icon }, t(`shell.conn.${key}`)), el('ul', { class: 'cme-chips' }, items.map((c) => el('li', {}, chipNode(c))))) : null);
  const ev = C.madeOf.filter((c) => c.evidence);
  const details = el('details', {}, el('summary', { text: t('shell.conn.why') }), el('ul', {},
    C.basis.map((b) => el('li', { text: b })),
    ev.map((c) => el('li', {}, `${c.text}: "${c.evidence.evidence}" `, ...c.evidence.sources.map((s, i) => [i ? '; ' : '', s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }) : s.title])))));
  box.replaceChildren(
    el('h2', { id: hid, text: t('shell.conn.title', { name: C.title }) }),
    el('div', { class: 'cme-conn-cols' }, col('madeOf', ICON.down, C.madeOf), col('partOf', ICON.up, C.partOf), col('seeAlso', ICON.side, C.seeAlso)),
    details);
  return box;
}
let connBox = null, connKey = '';
async function mountConnections() {
  if (!CFG.conn || !CFG.ref) return;
  const anchor = $(CFG.conn.after || CFG.conn.before);
  if (!anchor) return;
  if (!connBox) {
    connBox = el('section', { id: 'cme-connections', hidden: true });
    if (CFG.conn.after) anchor.after(connBox); else anchor.before(connBox);
  }
  const ref = CFG.ref();
  const key = JSON.stringify(ref);
  if (key === connKey) return;
  connKey = key;
  const C = await connections(ref);
  if (key !== connKey) return; // the visitor moved on while this one was loading: a newer call paints the panel
  paintConnections(connBox, C);
}

/* ---------- test yourself ---------- */
let QUIZ = null, quizDlg = null;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function drawFive(sec) {
  let pool = QUIZ.questions.filter((q) => sec === 'mixed' || q.sec === sec);
  if (sec === 'mixed') {
    const by = {};
    for (const q of shuffle(pool)) (by[q.sec] = by[q.sec] || []).push(q);
    const out = []; const secs = shuffle(Object.keys(by));
    for (let i = 0; out.length < 5 && i < 20; i++) { const s = by[secs[i % secs.length]]; if (s && s.length) out.push(s.pop()); }
    return out;
  }
  const out = [], seenV = new Set();
  for (const q of shuffle(pool)) { const k = JSON.stringify(q.v).toLowerCase(); if (seenV.has(k)) continue; seenV.add(k); out.push(q); if (out.length === 5) break; }
  return out;
}
async function openQuiz(sec) {
  if (!quizDlg) {
    const dlg = el('dialog', { class: 'cme-dlg drawer', 'aria-labelledby': 'cme-quiz-h' });
    const body = el('div', { class: 'cme-dlg-body' });
    dlg.append(el('div', { class: 'cme-dlg-head' }, el('h2', { id: 'cme-quiz-h', text: t('quiz.title') }),
      el('button', { class: 'cme-x', type: 'button', 'aria-label': t('shell.close'), html: ICON.close, onclick: () => dlg.close() })), body);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    quizDlg = { dlg, body };
  }
  const { dlg, body } = quizDlg;
  if (!dlg.open) dlg.showModal();
  if (!QUIZ) QUIZ = await getJSON('data/quiz.json').catch(() => ({ questions: [] }));
  const secs = ['mixed', 'atoms', 'molecules', 'cells', 'organisms'].filter((s) => s === 'mixed' || QUIZ.questions.some((q) => q.sec === s));
  let chosen = sec || QUIZ_SEC[currentLevel] || 'mixed';
  const intro = () => {
    const name = uid('sec');
    const seg = el('fieldset', { class: 'cme-seg' }, el('legend', { text: t('quiz.pick') }),
      secs.map((s) => el('label', {}, el('input', { type: 'radio', name, value: s, checked: s === chosen, onchange: () => { chosen = s; } }), el('span', { text: t(`quiz.sec.${s}`) }))));
    body.replaceChildren(el('p', { style: 'margin-top:0', text: t('quiz.intro') }), seg,
      el('div', { class: 'cme-row' }, el('button', { class: 'cme-btn primary', type: 'button', text: t('quiz.start'), onclick: () => run(drawFive(chosen)) })));
    const c = seg.querySelector('input:checked'); if (c) c.focus();
  };
  const run = (qs) => {
    let i = 0, score = 0;
    const ask = () => {
      if (i >= qs.length) {
        body.replaceChildren(el('p', { class: 'cme-score', tabindex: '-1', id: 'cme-q-score', text: t('quiz.score', { n: score, total: qs.length }) }),
          el('div', { class: 'cme-row' }, el('button', { class: 'cme-btn primary', type: 'button', text: t('quiz.again'), onclick: () => run(drawFive(chosen)) }),
            el('button', { class: 'cme-btn', type: 'button', text: t('quiz.change'), onclick: intro })));
        $('#cme-q-score', body).focus();
        return;
      }
      const q = qs[i];
      const opts = shuffle(q.o.map((text, k) => ({ text, right: k === 0 })));
      const name = uid('q'), clozeId = uid('cz');
      const isCloze = /Cloze$/.test(q.q);
      const stem = isCloze ? t(q.q, q.v) : t(q.q, q.v).replace('{text}', q.v.text || '');
      const fs = el('fieldset', { class: 'cme-q', 'aria-describedby': isCloze ? clozeId : null },
        el('legend', { tabindex: '-1', id: 'cme-q-legend', text: q.q === 'quiz.q.raw' ? q.v.text : stem }),
        isCloze ? el('p', { class: 'cme-cloze', id: clozeId, text: q.v.text }) : null,
        el('div', { class: 'cme-opts' }, opts.map((o) => el('label', {}, el('input', { type: 'radio', name, value: o.text }), el('span', { text: o.text }), el('span', { class: 'cme-mark', 'aria-hidden': 'true' })))));
      const fb = el('div', { class: 'cme-feedback', role: 'status', hidden: true });
      const check = el('button', { class: 'cme-btn primary', type: 'button', text: t('quiz.check') });
      const next = el('button', { class: 'cme-btn primary', type: 'button', hidden: true, text: i + 1 < qs.length ? t('quiz.next') : t('quiz.finish'), onclick: () => { i++; ask(); } });
      const msg = el('span', { class: 'cme-note', role: 'status' });
      check.addEventListener('click', () => {
        const pick = fs.querySelector('input:checked');
        if (!pick) { msg.textContent = t('quiz.pickOne'); return; }
        msg.textContent = '';
        const right = opts.find((o) => o.right);
        const ok = pick.value === right.text;
        if (ok) score++;
        fs.querySelectorAll('label').forEach((lab) => {
          const v = lab.querySelector('input').value;
          lab.querySelector('input').disabled = true;
          if (v === right.text) { lab.classList.add('right'); lab.querySelector('.cme-mark').textContent = '✓'; }
          else if (v === pick.value) { lab.classList.add('wrong'); lab.querySelector('.cme-mark').textContent = '✗'; }
        });
        fb.hidden = false;
        fb.replaceChildren(
          el('p', { class: 'cme-verdict ' + (ok ? 'ok' : 'no'), text: ok ? t('quiz.right') : t('quiz.wrong', { answer: right.text }) }),
          el('p', { text: q.why.t }),
          el('p', { class: 'cme-note' }, `${t('quiz.source')}: `, ...q.why.src.map((s, k) => [k ? '; ' : '', s.u ? el('a', { href: s.u, target: '_blank', rel: 'noopener noreferrer', text: s.t }) : s.t])),
          q.h ? el('p', {}, el('a', { href: abs(q.h).href, onclick: (e) => { e.preventDefault(); dlg.close(); go(q.h); }, text: t('quiz.see') })) : null);
        check.hidden = true; next.hidden = false; next.focus();
      });
      body.replaceChildren(el('p', { class: 'cme-qnum', text: t('quiz.qOf', { n: i + 1, total: qs.length }) }), fs, el('div', { class: 'cme-row' }, check, next, msg), fb);
      $('#cme-q-legend', body).focus();
    };
    ask();
  };
  intro();
}

/* ---------- start ---------- */
function onUrl() {
  setLevel(levelNow());
  mountConnections();
  const p = new URLSearchParams(location.search).get('path');
  if (p || dockEl) renderDock();
}
async function start() {
  const css = new Promise((res) => {
    if (document.querySelector('link[data-cme-shell]')) return res();
    const l = el('link', { rel: 'stylesheet', href: new URL('shell.css', SELF).href, 'data-cme-shell': '' });
    l.onload = res; l.onerror = res; document.head.append(l);
    setTimeout(res, 1500);
  });
  const [copy] = await Promise.all([getJSON('data/copy.json').catch(() => ({})), css, links()]);
  COPY = copy;
  document.body.classList.add('cme-shell');
  if (CFG.overlay) document.body.classList.add('cme-overlay');
  if ($('body > .app')) document.body.classList.add('cme-applike');
  for (const sel of CFG.hide) document.querySelectorAll(sel).forEach((n) => n.classList.add('cme-hidden'));
  const bar = buildBar();
  const skip = $('body > .skip, body > a.skip');
  if (skip) skip.after(bar);
  else {
    const main = CFG.main && $(CFG.main);
    if (main && !main.id) main.id = 'cme-main';
    if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    document.body.prepend(el('a', { class: 'cme-skip', href: main ? '#' + main.id : '#', text: t('shell.skip') }), bar);
    bar.previousSibling.after(bar);
  }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  setLevel(levelNow());
  document.addEventListener('cme:url', onUrl);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(document.activeElement) && !document.querySelector('dialog[open]')) { e.preventDefault(); openSearch(); }
  });
  renderDock();
  mountConnections();
  if (CFG.glossary.length) {
    await terms();
    const run = () => CFG.glossary.forEach(watchGlossary);
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 300);
  }
  window.dispatchEvent(new CustomEvent('cme:ready'));
}

const CME = { connections, renderConnections, openSearch, openPaths, openQuiz, setLevel, glossarize: async (n) => { await terms(); glossarize(n); }, go, page: PAGE_ID };
window.CME = CME;
start().catch((e) => console.warn('The explorer shell could not start', e));
export { connections, renderConnections, openSearch, openPaths, openQuiz, setLevel, go };
