// Size lineup: every molecule in the explorer standing on one line at true relative scale, drawn as one dot per atom
// from its real structure file. Canvas 2D (works without WebGL). ES module: mount(containerEl, options) / unmount().
// Data: lineup-data.json, built by tools/hero_lineup_build.py (sizes = widest span between atom centres).
// Words in lineup.json. No external requests.
//
// options: { theme: 'light'|'dark' (default follows the page), moleculesHref (default ../molecules/), embedded,
//            start: molecule id to select and zoom to }
// API (resolved by mount): select(id), zoomTo(id), fit(), destroy()

const HERE = new URL('./', import.meta.url);
const EL_COL = { H: '#ffffff', C: '#909090', N: '#3050f8', O: '#ff0d0d', P: '#ff8000', S: '#ffff30', FE: '#e06633', ZN: '#7d80b0', MG: '#8aff00', CA: '#3dff00', SE: '#ffa100', K: '#8f40d4', NA: '#ab5cf2', CL: '#1ff01f', X: '#ff9ad5' };
const ATOM_R = 0.15;                 // drawn atom radius in nm (a drawing size, not a measured one)
const S_MIN = 1, S_MAX = 1400;       // zoom range, pixels per nanometre

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let inst = null;

export async function mount(containerEl, options = {}) {
  if (inst) unmount();
  inst = createView(containerEl, options);
  await inst.ready;
  return inst.api;
}

export function unmount() {
  if (inst) { inst.destroy(); inst = null; }
}

const CSS = `
.ln-root { --ln-ink: #e8f1f7; --ln-muted: #a9bccb; --ln-glass: rgba(7, 15, 27, 0.8); --ln-line: rgba(150, 185, 215, 0.3); --ln-base: rgba(170, 200, 225, 0.45);
  --ln-accent: #5cd3ff; --ln-on-accent: #03141f; --ln-raised: rgba(14, 26, 44, 0.96); --ln-bg: #08111d; --ln-sel: rgba(92, 211, 255, 0.14);
  position: relative; width: 100%; height: 100%; min-height: 360px; overflow: hidden; color: var(--ln-ink); background: var(--ln-bg);
  font-family: var(--font-ui, "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif); font-size: 15px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
.ln-root.ln-light { --ln-ink: #0f1c28; --ln-muted: #46596a; --ln-glass: rgba(250, 252, 254, 0.9); --ln-line: rgba(30, 55, 80, 0.24); --ln-base: rgba(30, 55, 80, 0.45);
  --ln-accent: #0a6f9e; --ln-on-accent: #ffffff; --ln-raised: rgba(255, 255, 255, 0.98); --ln-bg: #eef2f6; --ln-sel: rgba(10, 111, 158, 0.1); }
.ln-root *, .ln-root *::before, .ln-root *::after { box-sizing: border-box; }
.ln-root [hidden] { display: none !important; }
.ln-root button { font: inherit; color: inherit; cursor: pointer; }
.ln-root a { color: var(--ln-accent); }
.ln-root :focus-visible { outline: 3px solid var(--ln-accent); outline-offset: 2px; }
.ln-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.ln-scroll { position: absolute; left: 0; right: 0; top: 0; bottom: 0; overflow-x: auto; overflow-y: hidden; outline: none; scrollbar-width: thin; }
.ln-scroll:focus-visible { outline: 3px solid var(--ln-accent); outline-offset: -3px; }
.ln-spacer { height: 1px; }
.ln-canvas { position: sticky; left: 0; top: 0; display: block; touch-action: pan-x; cursor: pointer; }
.ln-top { position: absolute; left: 12px; right: 12px; top: calc(10px + env(safe-area-inset-top, 0px)); display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; pointer-events: none; }
.ln-top > * { pointer-events: auto; }
.ln-titlebox { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; }
.ln-title { margin: 0; font-size: 17px; font-weight: 600; padding: 3px 10px; border-radius: 8px; background: var(--ln-glass); border: 1px solid var(--ln-line); }
.ln-badge { font-size: 12.5px; font-weight: 500; padding: 2px 10px; border-radius: 999px; background: var(--ln-glass); border: 1px solid var(--ln-line); max-width: 70vw; }
.ln-btn { min-height: 44px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--ln-line); background: var(--ln-glass); font-size: 14px; font-weight: 500;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; color: var(--ln-ink); white-space: nowrap; }
.ln-root a.ln-btn { color: var(--ln-ink); }
.ln-btn:hover { border-color: var(--ln-accent); }
.ln-btn.ln-primary, .ln-btn[aria-pressed="true"] { background: var(--ln-accent); border-color: var(--ln-accent); color: var(--ln-on-accent); }
.ln-root a.ln-btn.ln-primary { color: var(--ln-on-accent); }
.ln-btn.ln-icon { min-width: 44px; padding: 8px; font-size: 20px; line-height: 1; }
.ln-bottom { position: absolute; left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; pointer-events: none; }
.ln-bottom > * { pointer-events: auto; }
.ln-card { width: min(440px, 100%); background: var(--ln-glass); border: 1px solid var(--ln-line); border-radius: 14px; padding: 10px 14px; }
.ln-card h3 { margin: 0 0 2px; font-size: 18px; line-height: 1.25; }
.ln-card p { margin: 0 0 4px; }
.ln-k { font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-size: 12px; letter-spacing: 0.04em; color: var(--ln-muted); }
.ln-big { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ln-muted { color: var(--ln-muted); font-size: 14px; }
.ln-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ln-zoom { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px 2px 2px; border-radius: 999px; background: var(--ln-glass); border: 1px solid var(--ln-line); }
.ln-zoom .ln-btn { border: 0; background: transparent; }
.ln-range { width: min(180px, 34vw); height: 44px; margin: 0; accent-color: var(--ln-accent); }
.ln-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 100%); background: var(--ln-raised); border-left: 1px solid var(--ln-line); overflow-y: auto;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 18px calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 5; }
.ln-panel h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ln-muted); margin: 16px 0 6px; }
.ln-panelhead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ln-panelhead h2 { margin: 0; }
.ln-panel p, .ln-panel li { font-size: 14.5px; }
.ln-panel ul { padding-left: 18px; margin: 0; }
.ln-panel ol.ln-src { padding-left: 22px; margin: 0; }
.ln-panel ol.ln-src li { margin-bottom: 6px; font-size: 13px; color: var(--ln-muted); }
.ln-panel ol.ln-src a { overflow-wrap: anywhere; }
.ln-panel sup a { text-decoration: none; font-family: var(--font-data, ui-monospace, monospace); font-size: 11px; }
.ln-list { list-style: none; margin: 0; padding: 0; }
.ln-list li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--ln-line); }
.ln-list .ln-name { flex: 1; min-width: 0; }
.ln-list .ln-name b { display: block; font-weight: 600; }
.ln-list .ln-name span { font-size: 13px; color: var(--ln-muted); font-variant-numeric: tabular-nums; }
.ln-list .ln-btn { min-height: 40px; padding: 6px 12px; font-size: 13.5px; }
@media (max-width: 560px) {
  .ln-title { font-size: 15px; }
  .ln-badge { font-size: 11.5px; }
  .ln-btn { padding: 8px 11px; font-size: 13.5px; }
  .ln-card { padding: 8px 12px; }
  .ln-card h3 { font-size: 16px; }
}
`;

function el(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (html != null) e.innerHTML = html;
  return e;
}

function niceNm(v) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  let best = steps[0];
  for (const s of steps) if (s <= v) best = s;
  return best;
}
const fmtNm = (v) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0));

function createView(container, opts) {
  const disposers = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); disposers.push(() => t.removeEventListener(ev, fn, o)); };
  let ui = {}, facts = [], sources = {}, data = null;
  let destroyed = false;

  let style = document.getElementById('ln-style');
  if (!style) { style = el('style', { id: 'ln-style' }); style.textContent = CSS; document.head.appendChild(style); }
  const root = el('div', { class: 'ln-root' + (opts.embedded ? ' ln-embedded' : '') });
  container.appendChild(root);

  let light = false;
  const applyTheme = () => {
    let t = opts.theme;
    if (t !== 'light' && t !== 'dark') {
      const h = document.documentElement.dataset.theme;
      t = (h === 'light' || h === 'dark') ? h : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    light = t === 'light';
    root.classList.toggle('ln-light', light);
    request();
  };

  const api = {};
  const view = { root, api, destroy, ready: null };
  const refs = {};
  const srcOrder = [];
  let mols = [], scale = 40, selected = -1, totalNm = 0, raf = 0, W = 1, H = 1, dpr = 1, laneTop = 0, laneBottom = 0;
  const molHref = (id) => (opts.moleculesHref || '../molecules/') + '#' + encodeURIComponent(id);

  function t(k, o) { return fmt(ui[k] != null ? ui[k] : k, o || {}); }
  function srcNum(key) { let i = srcOrder.indexOf(key); if (i < 0) { srcOrder.push(key); i = srcOrder.length - 1; } return i + 1; }

  applyTheme();
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  on(mqDark, 'change', applyTheme);
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  disposers.push(() => themeObs.disconnect());

  root.appendChild(el('p', { class: 'ln-card', style: 'margin:96px 16px', role: 'status', text: 'Loading' }));
  view.ready = (async () => {
    try {
      const [d, s, m] = await Promise.all([
        fetch(new URL('lineup.json', HERE)).then((r) => r.json()),
        fetch(new URL('sources.json', HERE)).then((r) => r.json()),
        fetch(new URL('lineup-data.json', HERE)).then((r) => { if (!r.ok) throw new Error('data'); return r.json(); }),
      ]);
      ui = d.ui || {}; facts = d.facts || []; sources = (s && s.sources) || {}; data = m;
    } catch (e) { data = null; }
    if (destroyed) return;
    build();
  })();

  // ---------- layout in nanometres ----------
  function layout() {
    const els = data.els;
    let x = 0.6;
    mols = data.molecules.map((m, i) => {
      const w = m.boxNm[0], h = m.boxNm[1];
      const r = ATOM_R * Math.cbrt(m.stride);
      const n = m.pts.length / 4;
      const px = new Float32Array(n), py = new Float32Array(n), cols = new Array(n);
      let zmin = Infinity, zmax = -Infinity;
      for (let k = 0; k < n; k++) { const z = m.pts[4 * k + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
      for (let k = 0; k < n; k++) {
        px[k] = m.pts[4 * k] / 100 - m.minNm[0];        // nm from the left edge of its box
        py[k] = m.pts[4 * k + 1] / 100 - m.minNm[1];    // nm up from its base
        const depth = zmax > zmin ? (m.pts[4 * k + 2] - zmin) / (zmax - zmin) : 1;
        cols[k] = shade(EL_COL[els[m.pts[4 * k + 3]]] || EL_COL.X, 0.55 + 0.45 * depth);
      }
      const rec = { ...m, i, x0: x + r, w, h, r, px, py, cols };
      x += w + 2 * r + Math.max(0.5, 0.18 * (w + (data.molecules[i + 1] ? data.molecules[i + 1].boxNm[0] : w)) / 2);
      return rec;
    });
    totalNm = x + 0.6;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
    return `rgb(${r},${g},${b})`;
  }

  // ---------- build ----------
  function build() {
    root.innerHTML = '';
    if (!data) { root.appendChild(el('p', { class: 'ln-card', style: 'margin:96px 16px', role: 'alert', text: t('loadFail') })); return; }
    layout();
    const water = mols.find((m) => m.id === 'water') || mols[0];
    const big = mols[mols.length - 1];
    const altText = t('alt', { n: mols.length, water: fmtNm(water.spanNm), biggest: big.name, big: fmtNm(big.spanNm), ratio: Math.round(big.spanNm / water.spanNm) });
    const altId = 'ln-alt-' + Math.random().toString(36).slice(2, 7);

    const scroll = el('div', { class: 'ln-scroll', tabindex: '0', role: 'group', 'aria-label': t('viewAria'), 'aria-describedby': altId + ' ' + altId + 'k' });
    const canvas = el('canvas', { class: 'ln-canvas', 'aria-hidden': 'true' });
    const spacer = el('div', { class: 'ln-spacer', 'aria-hidden': 'true' });
    scroll.append(canvas, spacer);
    const altSr = el('p', { class: 'ln-sr', id: altId, text: altText });
    const keysSr = el('p', { class: 'ln-sr', id: altId + 'k', text: t('keys') });

    const top = el('div', { class: 'ln-top' });
    const titleBox = el('div', { class: 'ln-titlebox' });
    titleBox.append(el('h2', { class: 'ln-title', text: t('title') }), el('span', { class: 'ln-badge', text: t('badge') }));
    const topBtns = el('div', { class: 'ln-row' });
    const listBtn = el('button', { class: 'ln-btn', type: 'button', 'aria-expanded': 'false', text: t('list') });
    const aboutBtn = el('button', { class: 'ln-btn', type: 'button', 'aria-expanded': 'false', text: t('about') });
    topBtns.append(listBtn, aboutBtn);
    top.append(titleBox, topBtns);

    const bottom = el('div', { class: 'ln-bottom' });
    const card = el('section', { class: 'ln-card', 'aria-live': 'polite' });
    const zoomRow = el('div', { class: 'ln-row' });
    const zoom = el('div', { class: 'ln-zoom', role: 'group', 'aria-label': t('zoomLabel') });
    const zOut = el('button', { class: 'ln-btn ln-icon', type: 'button', 'aria-label': t('zoomOut'), title: t('zoomOut'), text: '−' });
    const range = el('input', { class: 'ln-range', type: 'range', min: '0', max: '1000', step: '1', 'aria-label': t('zoomLabel') });
    const zIn = el('button', { class: 'ln-btn ln-icon', type: 'button', 'aria-label': t('zoomIn'), title: t('zoomIn'), text: '+' });
    zoom.append(zOut, range, zIn);
    const fitBtn = el('button', { class: 'ln-btn', type: 'button', text: t('fit') });
    zoomRow.append(zoom, fitBtn);
    bottom.append(card, zoomRow);

    // list panel: also the full text alternative
    const listPanel = el('section', { class: 'ln-panel', hidden: '', tabindex: '-1', 'aria-label': t('listHeading') });
    const items = mols.map((m) => {
      const ratio = m.id === water.id ? '' : ' · ' + esc(t('vsWater', { x: ratioTo(m, water) }));
      return `<li><span class="ln-name"><b>${esc(m.name)}</b><span>${esc(t('span', { v: fmtNm(m.spanNm) }))}${ratio}</span></span>` +
        `<button class="ln-btn" type="button" data-show="${m.i}" title="${esc(t('showTitle', { name: m.name }))}">${esc(t('show'))}</button>` +
        `<a class="ln-btn" href="${esc(molHref(m.id))}" title="${esc(t('openTitle', { name: m.name }))}">${esc(t('open'))}</a></li>`;
    }).join('');
    listPanel.innerHTML = `<div class="ln-panelhead"><h2>${esc(t('listHeading'))}</h2><button class="ln-btn" type="button" data-close>${esc(t('listClose'))}</button></div>` +
      `<ol class="ln-list">${items}</ol>`;

    const aboutPanel = el('section', { class: 'ln-panel', hidden: '', tabindex: '-1', 'aria-label': t('about') });
    const sup = (list) => (list || []).map((k) => `<sup><a href="#ln-src-${esc(k)}">[${srcNum(k)}]</a></sup>`).join('');
    const factsHtml = facts.map((f) => `<li>${esc(f.t)}${sup(f.s)}</li>`).join('');
    const howSup = sup(['calc']);
    const srcHtml = srcOrder.map((k) => {
      const s = sources[k] || {};
      const link = s.url ? ` <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.url)}</a>` : '';
      return `<li id="ln-src-${esc(k)}">${esc(s.cite || k)}${link}</li>`;
    }).join('');
    aboutPanel.innerHTML = `<div class="ln-panelhead"><h2>${esc(t('howHeading'))}</h2><button class="ln-btn" type="button" data-close>${esc(t('aboutClose'))}</button></div>` +
      `<p>${esc(t('how'))}${howSup}</p><ul>${factsHtml}</ul>` +
      `<h2>${esc(t('altHeading'))}</h2><p>${esc(altText)}</p>` +
      `<h2>${esc(t('keysHeading'))}</h2><p>${esc(t('keys'))}</p>` +
      `<h2>${esc(t('sourcesHeading'))}</h2><ol class="ln-src">${srcHtml}</ol>`;

    root.append(scroll, top, bottom, listPanel, aboutPanel, altSr, keysSr);
    Object.assign(refs, { scroll, canvas, spacer, card, range, listBtn, aboutBtn, listPanel, aboutPanel, bottom, top, water });

    on(scroll, 'scroll', request, { passive: true });
    on(range, 'input', () => setScale(fromRange(+range.value), W / 2));
    on(zIn, 'click', () => setScale(scale * 1.6, W / 2));
    on(zOut, 'click', () => setScale(scale / 1.6, W / 2));
    on(fitBtn, 'click', fit);
    on(listBtn, 'click', () => togglePanel(listPanel, listBtn));
    on(aboutBtn, 'click', () => togglePanel(aboutPanel, aboutBtn));
    for (const p of [listPanel, aboutPanel]) on(p.querySelector('[data-close]'), 'click', () => togglePanel(p, p === listPanel ? listBtn : aboutBtn, false));
    on(listPanel, 'click', (e) => { const b = e.target.closest('[data-show]'); if (b) { togglePanel(listPanel, listBtn, false); select(+b.dataset.show, true); zoomTo(+b.dataset.show); } });
    on(root, 'keydown', onKey);
    on(canvas, 'pointerdown', onDown);
    on(canvas, 'pointerup', onUp);
    on(canvas, 'pointercancel', () => { downAt = null; });
    if (!opts.embedded) on(scroll, 'wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey) && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5) return;   // sideways scroll stays native
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); setScale(scale * Math.exp(-e.deltaY * 0.002), e.clientX - scroll.getBoundingClientRect().left); return; }
      e.preventDefault(); scroll.scrollLeft += e.deltaY;
    }, { passive: false });
    // pinch to zoom on touch
    on(canvas, 'touchstart', onTouchStart, { passive: true });
    on(canvas, 'touchmove', onTouchMove, { passive: false });
    const ro = new ResizeObserver(resize); ro.observe(root); disposers.push(() => ro.disconnect());

    resize();
    // start: everything fits in height, smallest first; the chosen molecule if one was asked for
    const startIdx = opts.start ? mols.findIndex((m) => m.id === opts.start) : -1;
    if (startIdx >= 0) { select(startIdx, true); zoomTo(startIdx); }
    else { fitHeight(); showCard(); }
  }

  function ratioTo(m, water) {
    const r = m.spanNm / water.spanNm;
    return r < 10 ? r.toFixed(1) : String(Math.round(r));
  }

  // ---------- scale and scroll ----------
  const toRange = (s) => Math.round(1000 * Math.log(s / S_MIN) / Math.log(S_MAX / S_MIN));
  const fromRange = (v) => S_MIN * Math.pow(S_MAX / S_MIN, v / 1000);
  function setScale(s, anchorPx) {
    s = clamp(s, S_MIN, S_MAX);
    const sc = refs.scroll;
    const worldAt = (sc.scrollLeft + anchorPx) / scale;
    scale = s;
    refs.spacer.style.width = Math.ceil(totalNm * scale) + 'px';
    sc.scrollLeft = worldAt * scale - anchorPx;
    refs.range.value = String(toRange(scale));
    refs.range.setAttribute('aria-valuetext', t('scaleBar', { v: fmtNm(W / scale) }));
    request();
  }
  function laneH() { return Math.max(60, laneBottom - laneTop); }
  function fit() { setScale(W / totalNm, 0); refs.scroll.scrollLeft = 0; request(); }
  function fitHeight() {
    const maxH = Math.max(...mols.map((m) => m.h + 2 * m.r));
    setScale(laneH() * 0.92 / maxH, 0); refs.scroll.scrollLeft = 0;
  }
  function zoomTo(i) {
    const m = mols[i];
    const want = Math.min((W * 0.5) / (m.w + 2 * m.r), (laneH() * 0.8) / (m.h + 2 * m.r));
    setScale(want, W / 2);
    const cx = (m.x0 - m.r + (m.w + 2 * m.r) / 2) * scale;
    const target = cx - W / 2;
    if (reduceMotion()) refs.scroll.scrollLeft = target;
    else refs.scroll.scrollTo({ left: target, behavior: 'smooth' });
    request();
  }

  function resize() {
    const sc = refs.scroll;
    W = Math.max(1, sc.clientWidth); H = Math.max(1, sc.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = refs.canvas;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    c.style.width = W + 'px'; c.style.height = H + 'px';
    const topH = refs.top.getBoundingClientRect().height;
    laneTop = topH + 30;
    laneBottom = H - refs.bottom.getBoundingClientRect().height - 64;
    refs.spacer.style.width = Math.ceil(totalNm * scale) + 'px';
    refs.spacer.style.marginTop = (-H) + 'px';
    request();
  }

  // ---------- drawing ----------
  function request() { if (!raf && data && refs.canvas) raf = requestAnimationFrame(draw); }
  function draw() {
    raf = 0;
    if (destroyed || !refs.canvas) return;
    const ctx = refs.canvas.getContext('2d');
    const cs = getComputedStyle(root);
    const ink = cs.getPropertyValue('--ln-ink').trim(), muted = cs.getPropertyValue('--ln-muted').trim(), base = cs.getPropertyValue('--ln-base').trim(), selBg = cs.getPropertyValue('--ln-sel').trim();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sx = refs.scroll.scrollLeft;
    const baseY = laneBottom;
    // baseline
    ctx.strokeStyle = base; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, baseY + 0.5); ctx.lineTo(W, baseY + 0.5); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let lastLabelRight = -Infinity;
    for (const m of mols) {
      const left = (m.x0 - m.r) * scale - sx, right = (m.x0 + m.w + m.r) * scale - sx;
      if (right < -60 || left > W + 60) { continue; }
      const rpx = m.r * scale;
      if (m.i === selected) {
        ctx.fillStyle = selBg;
        const pad = 8;
        ctx.fillRect(left - pad, Math.max(laneTop - 10, baseY - (m.h + 2 * m.r) * scale - pad), right - left + 2 * pad, Math.min(baseY, (m.h + 2 * m.r) * scale + pad) + 2);
      }
      const ox = m.x0 * scale - sx, oy = baseY - m.r * scale;
      if (rpx < 0.7) {
        for (let k = 0; k < m.px.length; k++) { ctx.fillStyle = m.cols[k]; ctx.fillRect(ox + m.px[k] * scale - 0.7, oy - m.py[k] * scale - 0.7, 1.4, 1.4); }
      } else {
        for (let k = 0; k < m.px.length; k++) {
          ctx.fillStyle = m.cols[k];
          ctx.beginPath(); ctx.arc(ox + m.px[k] * scale, oy - m.py[k] * scale, rpx, 0, Math.PI * 2); ctx.fill();
        }
      }
      // label under the molecule when there is room
      const cx = (left + right) / 2;
      ctx.font = '600 13px ' + (cs.getPropertyValue('--font-ui').trim() || 'system-ui, sans-serif');
      const name = m.name, sub = t('span', { v: fmtNm(m.spanNm) });
      const lw = Math.max(ctx.measureText(name).width, ctx.measureText(sub).width) + 10;
      if (cx - lw / 2 > lastLabelRight || m.i === selected) {
        ctx.fillStyle = ink;
        ctx.fillText(name, cx, baseY + 8);
        ctx.font = '500 12px ' + (cs.getPropertyValue('--font-data').trim() || 'monospace');
        ctx.fillStyle = muted;
        ctx.fillText(sub, cx, baseY + 26);
        lastLabelRight = cx + lw / 2;
      } else {
        // a small tick so tiny molecules can still be found
        ctx.fillStyle = muted; ctx.fillRect(cx - 0.5, baseY + 4, 1, 6);
      }
    }
    // scale bar
    const nm = niceNm(110 / scale), px = nm * scale;
    const bx = 14, by = baseY + 50;
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + px, by); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5); ctx.moveTo(bx + px, by - 5); ctx.lineTo(bx + px, by + 5); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink;
    ctx.font = '600 12px ' + (cs.getPropertyValue('--font-data').trim() || 'monospace');
    ctx.fillText(t('scaleBar', { v: nm }), bx + px + 8, by);
  }

  // ---------- selection ----------
  function select(i, quiet) {
    selected = clamp(i, 0, mols.length - 1);
    showCard();
    request();
    if (!quiet) {
      const m = mols[selected];
      const left = (m.x0 - m.r) * scale, right = (m.x0 + m.w + m.r) * scale, sc = refs.scroll;
      if (left < sc.scrollLeft + 20 || right > sc.scrollLeft + W - 20) sc.scrollLeft = (left + right) / 2 - W / 2;
    }
  }
  function showCard() {
    const card = refs.card;
    if (selected < 0) { card.innerHTML = `<p class="ln-muted">${esc(t('tapHint'))}</p>`; return; }
    const m = mols[selected], water = refs.water;
    const vs = m.id === water.id ? t('isWater') : t('vsWater', { x: ratioTo(m, water) });
    const atoms = m.stride > 1 ? t('atomsThin', { n: m.atoms.toLocaleString('en'), s: m.stride }) : t('atoms', { n: m.atoms.toLocaleString('en') });
    card.innerHTML = `<p class="ln-k">${esc(t('rank', { n: selected + 1, total: mols.length }))} · ${esc(m.code || '')}</p>` +
      `<h3>${esc(m.full)}</h3>` +
      `<p class="ln-big">${esc(t('spanLong', { v: fmtNm(m.spanNm) }))}</p>` +
      `<p>${esc(vs)}</p>` +
      `<p class="ln-muted">${esc(atoms)}${/assembly/.test(m.how) ? ' · ' + esc(t('assembly')) : ''}</p>` +
      `<div class="ln-row"><a class="ln-btn ln-primary" href="${esc(molHref(m.id))}" title="${esc(t('openTitle', { name: m.name }))}">${esc(t('open'))}</a>` +
      `<button class="ln-btn" type="button" data-prev ${selected === 0 ? 'disabled' : ''}>${esc(t('prev'))}</button>` +
      `<button class="ln-btn" type="button" data-next ${selected === mols.length - 1 ? 'disabled' : ''}>${esc(t('next'))}</button></div>`;
    card.querySelector('[data-prev]').addEventListener('click', () => select(selected - 1));
    card.querySelector('[data-next]').addEventListener('click', () => select(selected + 1));
  }

  function hitTest(clientX, clientY) {
    const rect = refs.canvas.getBoundingClientRect();
    const x = clientX - rect.left + refs.scroll.scrollLeft, y = clientY - rect.top;
    if (y > laneBottom + 44) return -1;
    let best = -1, bd = Infinity;
    for (const m of mols) {
      const l = (m.x0 - m.r) * scale - 6, r = (m.x0 + m.w + m.r) * scale + 6;
      const d = x < l ? l - x : x > r ? x - r : 0;
      if (d < bd) { bd = d; best = m.i; }
    }
    return bd <= 14 ? best : -1;
  }
  let downAt = null;
  function onDown(e) { downAt = { x: e.clientX, y: e.clientY, sl: refs.scroll.scrollLeft }; }
  function onUp(e) {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8 || Math.abs(refs.scroll.scrollLeft - downAt.sl) > 4;
    downAt = null;
    if (moved || pinching) return;
    const i = hitTest(e.clientX, e.clientY);
    if (i < 0) return;
    if (i === selected) { location.href = molHref(mols[i].id); return; }   // second tap opens it
    select(i, true);
  }
  let pinching = false, pinch0 = 0;
  function onTouchStart(e) { if (e.touches.length === 2) { pinching = true; pinch0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } else pinching = false; }
  function onTouchMove(e) {
    if (e.touches.length !== 2 || !pinch0) return;
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const mid = (e.touches[0].clientX + e.touches[1].clientX) / 2 - refs.scroll.getBoundingClientRect().left;
    setScale(scale * d / pinch0, mid); pinch0 = d;
  }

  function togglePanel(panel, btn, v) {
    const open = v == null ? panel.hidden : v;
    for (const [p, b] of [[refs.listPanel, refs.listBtn], [refs.aboutPanel, refs.aboutBtn]]) { if (p !== panel && open) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); } }
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) panel.focus(); else btn.focus();
  }

  function onKey(e) {
    const inPanel = e.target.closest && e.target.closest('.ln-panel');
    if (inPanel) { if (e.key === 'Escape') togglePanel(inPanel, inPanel === refs.listPanel ? refs.listBtn : refs.aboutBtn, false); return; }
    if (e.target.tagName === 'INPUT') return;
    const k = e.key;
    let used = true;
    if (k === 'ArrowRight') select(selected < 0 ? 0 : selected + 1);
    else if (k === 'ArrowLeft') select(selected < 0 ? 0 : selected - 1);
    else if (k === 'Home') select(0);
    else if (k === 'End') select(mols.length - 1);
    else if (k === 'Enter' && e.target === refs.scroll && selected >= 0) location.href = molHref(mols[selected].id);
    else if (k === '+' || k === '=') setScale(scale * 1.4, W / 2);
    else if (k === '-' || k === '_') setScale(scale / 1.4, W / 2);
    else if (k === '0') fit();
    else used = false;
    if (used) e.preventDefault();
  }

  function destroy() {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    for (const d of disposers) { try { d(); } catch (_) {} }
    root.remove();
  }

  Object.assign(api, {
    select: (id) => { const i = mols.findIndex((m) => m.id === id); if (i >= 0) select(i); },
    zoomTo: (id) => { const i = mols.findIndex((m) => m.id === id); if (i >= 0) { select(i, true); zoomTo(i); } },
    fit: () => fit(),
    destroy: () => unmount(),
  });
  return view;
}
