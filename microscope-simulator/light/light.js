// Light: follow a photon. Guided 5-stop scene: sunlight and a prism, a leaf in photon rain, into the cell, the
// antenna (real LHC-II, PDB 2BHW), and what next. Every word comes from light.json, every number from data/ and
// physics.js (sourced in sources.json). Same mount / unmount shape as web/dna/dna.js.
import { photon, makeSpectra, colourName, sci, prismDeviation, H, C, NM_MIN, NM_MAX, SEE_MIN } from './physics.js';
import { drawSolar, drawAbsorb } from './chart.js';

const HERE = new URL('./', import.meta.url);
const STOPS = ['sun', 'leaf', 'cell', 'antenna', 'payoff'];
const fmt = (s, o) => String(s == null ? '' : s).replace(/\{(\w+)\}/g, (m, k) => (o && k in o ? o[k] : m));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let inst = null;
export async function mount(containerEl, options = {}) {
  if (inst) unmount();
  inst = createView(containerEl, options);
  await inst.ready;
  return inst.api;
}
export function unmount() { if (inst) { inst.destroy(); inst = null; } }

// ---------------------------------------------------------------------------------------------------------------
const CSS = `
.lt-root { --lt-ink: #e8f1f7; --lt-muted: #a9bccb; --lt-glass: rgba(7, 15, 27, 0.78); --lt-line: rgba(150, 185, 215, 0.28);
  --lt-accent: #7fe08a; --lt-on-accent: #04170a; --lt-raised: rgba(10, 20, 34, 0.96); --lt-chip: rgba(255, 255, 255, 0.06);
  position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; color: var(--lt-ink);
  font-family: var(--font-ui, "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif); font-size: 15px; line-height: 1.45;
  background: #03070d; -webkit-font-smoothing: antialiased; }
.lt-root.lt-light { --lt-ink: #0f1c28; --lt-muted: #46596a; --lt-glass: rgba(250, 252, 254, 0.9); --lt-line: rgba(30, 55, 80, 0.22);
  --lt-accent: #1a7f37; --lt-on-accent: #ffffff; --lt-raised: rgba(255, 255, 255, 0.98); --lt-chip: rgba(15, 28, 40, 0.05); }
.lt-root *, .lt-root *::before, .lt-root *::after { box-sizing: border-box; }
.lt-root [hidden] { display: none !important; }
.lt-root button { font: inherit; color: inherit; cursor: pointer; }
.lt-root a { color: var(--lt-accent); }
.lt-root :focus-visible { outline: 3px solid var(--lt-accent); outline-offset: 2px; }
.lt-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.lt-skip { position: absolute; left: 8px; top: 8px; z-index: 20; padding: 8px 12px; border-radius: 8px; background: var(--lt-raised); transform: translateY(-200%); }
.lt-skip:focus { transform: none; }
.lt-stage { position: absolute; top: 0; bottom: 0; right: 0; left: 400px; outline: none; }
.lt-stage:focus-visible { outline: 3px solid var(--lt-accent); outline-offset: -3px; }
.lt-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.lt-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.lt-label { position: absolute; left: 0; top: 0; padding: 2px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap;
  color: #eaf6ff; background: rgba(4, 10, 20, 0.72); border: 1px solid rgba(160, 200, 230, 0.35); will-change: transform; }
.lt-label-soft { font-weight: 500; color: #cfe1ee; background: rgba(4, 10, 20, 0.55); }
.lt-label-photon { font-family: var(--font-data, "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace); border-color: var(--c, #fff); border-width: 2px; }
.lt-hint { position: absolute; right: 12px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); font-size: 12.5px; color: #cfe1ee; background: rgba(4, 10, 20, 0.6);
  padding: 3px 10px; border-radius: 999px; pointer-events: none; }
.lt-status { position: absolute; inset: 0; display: grid; place-items: center; color: #cfe1ee; font-size: 15px; padding: 16px; text-align: center; }
.lt-flatcard { position: absolute; left: 16px; right: 16px; top: 16px; max-width: 60ch; margin: auto; padding: 14px 16px; border-radius: 14px; color: #e8f1f7;
  background: rgba(7, 15, 27, 0.82); border: 1px solid rgba(150, 185, 215, 0.3); }
.lt-panel { position: absolute; left: 0; top: 0; bottom: 0; width: 400px; display: flex; flex-direction: column; background: var(--lt-glass);
  border-right: 1px solid var(--lt-line); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); z-index: 2; }
.lt-scroll { flex: 1; overflow-y: auto; padding: 14px 18px 10px; overscroll-behavior: contain; }
.lt-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.lt-title { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.lt-sub { margin: 2px 0 10px; color: var(--lt-muted); font-size: 13.5px; }
.lt-pills { display: flex; gap: 4px; margin: 0 0 12px; padding: 0; list-style: none; }
.lt-pills li { flex: 1; min-width: 0; }
.lt-pill { width: 100%; min-height: 44px; padding: 4px 4px; border-radius: 10px; border: 1px solid var(--lt-line); background: var(--lt-chip); font-size: 12px; line-height: 1.15;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
.lt-pill b { font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-size: 13px; }
.lt-pill[aria-current="step"] { background: var(--lt-accent); border-color: var(--lt-accent); color: var(--lt-on-accent); }
.lt-k { font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-size: 11.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--lt-muted); margin: 0; }
.lt-h { margin: 2px 0 6px; font-size: 21px; line-height: 1.2; font-weight: 600; }
.lt-p { margin: 0 0 8px; }
.lt-try { margin: 8px 0; padding: 8px 10px; border-radius: 10px; border: 1px dashed var(--lt-line); font-size: 14px; }
.lt-try b { color: var(--lt-accent); }
.lt-block { margin: 10px 0; }
.lt-wl label { display: flex; justify-content: space-between; align-items: baseline; font-weight: 600; font-size: 14px; }
.lt-range { width: 100%; height: 44px; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; }
.lt-range::-webkit-slider-runnable-track { height: 12px; border-radius: 6px; background: var(--rainbow); border: 1px solid var(--lt-line); }
.lt-range::-moz-range-track { height: 12px; border-radius: 6px; background: var(--rainbow); border: 1px solid var(--lt-line); }
.lt-range::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; margin-top: -8px; border-radius: 50%; background: var(--thumb, #fff); border: 3px solid #fff; box-shadow: 0 0 0 1px #000a, 0 2px 8px #0008; }
.lt-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: var(--thumb, #fff); border: 3px solid #fff; box-shadow: 0 0 0 1px #000a; }
.lt-read { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 2px 0 6px; }
.lt-read div { padding: 5px 6px; border-radius: 8px; background: var(--lt-chip); border: 1px solid var(--lt-line); min-width: 0; }
.lt-read span { display: block; font-size: 11px; color: var(--lt-muted); }
.lt-read b { display: block; font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lt-dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; vertical-align: -1px; margin-right: 4px; border: 1px solid #0006; }
.lt-formula { font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-size: 12px; color: var(--lt-muted); overflow-wrap: anywhere; margin: 0; }
.lt-warn { font-size: 13px; color: var(--lt-muted); margin: 4px 0 0; }
.lt-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.lt-btn { min-height: 44px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--lt-line); background: var(--lt-chip); font-size: 14px; font-weight: 500;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; color: var(--lt-ink); white-space: nowrap; }
.lt-btn:hover { border-color: var(--lt-accent); }
.lt-btn:disabled { opacity: 0.45; cursor: default; }
.lt-btn.lt-primary, .lt-btn[aria-pressed="true"] { background: var(--lt-accent); border-color: var(--lt-accent); color: var(--lt-on-accent); }
.lt-seg { display: inline-flex; flex-wrap: wrap; border-radius: 14px; border: 1px solid var(--lt-line); padding: 2px; gap: 2px; }
.lt-seg .lt-btn { border: 0; min-height: 40px; padding: 6px 10px; font-size: 13px; background: transparent; }
.lt-seg .lt-btn[aria-pressed="true"] { background: var(--lt-accent); color: var(--lt-on-accent); }
.lt-chart { width: 100%; height: 170px; display: block; border-radius: 10px; background: var(--lt-chip); border: 1px solid var(--lt-line); }
.lt-cap { font-size: 12.5px; color: var(--lt-muted); margin: 4px 0 0; }
.lt-counts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
.lt-counts div { padding: 6px 8px; border-radius: 10px; background: var(--lt-chip); border: 1px solid var(--lt-line); }
.lt-counts span { font-size: 12px; color: var(--lt-muted); display: block; }
.lt-counts b { font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-size: 18px; }
.lt-swatch { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.lt-swatch i { width: 32px; height: 22px; border-radius: 6px; border: 1px solid #0005; flex: none; }
.lt-result { min-height: 2.9em; font-size: 14px; margin: 6px 0; }
.lt-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; margin: 8px 0; padding: 0; list-style: none; }
.lt-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; border: 1px solid #0005; }
.lt-steps { margin: 6px 0; padding-left: 20px; font-size: 13.5px; }
.lt-steps li { margin-bottom: 3px; }
.lt-steps li:last-child { font-weight: 600; }
.lt-note { font-size: 13px; color: var(--lt-muted); margin: 8px 0; padding-left: 10px; border-left: 3px solid var(--lt-line); }
.lt-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--lt-line); margin-right: 6px; color: var(--lt-ink); }
.lt-badge.lt-real { border-color: var(--lt-accent); }
.lt-words summary { cursor: pointer; font-weight: 600; min-height: 32px; display: flex; align-items: center; }
.lt-words p { margin: 4px 0 8px; font-size: 14px; }
.lt-links { display: grid; gap: 8px; margin: 8px 0; padding: 0; list-style: none; }
.lt-links a { display: block; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--lt-line); background: var(--lt-chip); text-decoration: none; color: var(--lt-ink); }
.lt-links a:hover { border-color: var(--lt-accent); }
.lt-links b { display: block; color: var(--lt-accent); }
.lt-links span { font-size: 13.5px; color: var(--lt-muted); }
.lt-foot { display: flex; gap: 6px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--lt-line); }
.lt-foot .lt-btn { flex: 1; }
.lt-about { position: absolute; top: 0; right: 0; bottom: 0; width: min(440px, 100%); background: var(--lt-raised); border-left: 1px solid var(--lt-line); overflow-y: auto;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 18px calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 10; }
.lt-about h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--lt-muted); margin: 16px 0 6px; }
.lt-abouthead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.lt-abouthead h2 { margin: 0; }
.lt-about ul { padding-left: 18px; margin: 0; }
.lt-about li { font-size: 14px; margin-bottom: 5px; }
.lt-about ol { padding-left: 22px; margin: 0; }
.lt-about ol li { font-size: 12.5px; color: var(--lt-muted); }
.lt-about ol a { overflow-wrap: anywhere; }
.lt-about sup a { text-decoration: none; font-family: var(--font-data, ui-monospace, monospace); font-size: 11px; }
.lt-about p { font-size: 13.5px; }
.lt-vocab { margin: 0; display: grid; grid-template-columns: 1fr; gap: 2px; }
.lt-vocab dt { font-weight: 700; font-size: 14px; }
.lt-vocab dd { margin: 0 0 8px; font-size: 14px; }
@media (max-width: 760px) {
  .lt-stage { left: 0; bottom: 46vh; bottom: 46dvh; }
  .lt-panel { top: auto; height: 46vh; height: 46dvh; width: 100%; border-right: 0; border-top: 1px solid var(--lt-line); border-radius: 16px 16px 0 0; }
  .lt-scroll { padding: 10px 14px 8px; }
  .lt-sub { display: none; }
  .lt-h { font-size: 18px; }
  .lt-pill span { display: none; }
  .lt-pill { min-height: 40px; }
  .lt-chart { height: 140px; }
  .lt-hint { display: none; }
  .lt-read b { font-size: 13px; }
}
`;

function el(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  if (html != null) e.innerHTML = html;
  return e;
}

const PAL = {
  dark: { ink: '#e8f1f7', muted: '#9fb3c4', line: 'rgba(150,185,215,0.3)', zone: 'rgba(150,170,200,0.10)', chip: 'rgba(7,15,27,0.92)',
    catchFill: 'rgba(120,220,140,0.18)', catchLine: 'rgba(120,220,140,0.7)', chlA: '#34d399', chlB: '#d4e157' },
  light: { ink: '#0f1c28', muted: '#4a5d6e', line: 'rgba(30,55,80,0.24)', zone: 'rgba(30,55,80,0.07)', chip: '#ffffff',
    catchFill: 'rgba(20,140,60,0.14)', catchLine: 'rgba(20,140,60,0.6)', chlA: '#0b8a5c', chlB: '#7a8800' },
};
const LEGEND = [['legChlA', '#34d399'], ['legChlB', '#d4e157'], ['legCarot', '#ff9f1c'], ['legMg', '#bfff59'], ['legProtein', '#9fb8de'], ['legElectron', '#66b3ff']];

// ---------------------------------------------------------------------------------------------------------------
function createView(container, opts) {
  const disposers = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); disposers.push(() => t.removeEventListener(ev, fn, o)); };
  let ui = {}, stops = [], facts = [], vocab = [], sources = {}, credits = '', S = null, lhc = null;
  let destroyed = false, stage = null;

  let style = document.getElementById('lt-style');
  if (!style) { style = el('style', { id: 'lt-style' }); style.textContent = CSS; document.head.appendChild(style); }
  const root = el('div', { class: 'lt-root' });
  container.appendChild(root);
  let themeName = 'dark';
  const applyTheme = () => {
    let t = opts.theme;
    if (t !== 'light' && t !== 'dark') {
      const h = document.documentElement.dataset.theme;
      t = (h === 'light' || h === 'dark') ? h : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    themeName = t;
    root.classList.toggle('lt-light', t === 'light');
    if (S) redrawCharts();
  };
  applyTheme();
  on(matchMedia('(prefers-color-scheme: dark)'), 'change', applyTheme);
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  disposers.push(() => themeObs.disconnect());

  const api = {};
  const view = { api, destroy, ready: null };
  root.appendChild(el('div', { class: 'lt-status', 'aria-busy': 'true' }));

  view.ready = (async () => {
    try {
      const get = (f) => fetch(new URL(f, HERE)).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
      const [d, s, sp, lh] = await Promise.all([get('light.json'), get('sources.json'), get('data/spectra.json'), get('data/lhc.json').catch(() => null)]);
      ui = d.ui || {}; stops = d.stops || []; facts = d.facts || []; vocab = (d.learn && d.learn.vocab) || []; credits = d.credits || ''; sources = (s && s.sources) || {};
      S = makeSpectra(sp); lhc = lh;
    } catch (e) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'lt-status', role: 'alert', text: ui.failed || 'Something went wrong loading this scene.' }));
      return;
    }
    if (destroyed) return;
    await build();
  })();

  // ---------- state ----------
  const st = { stop: 'sun', nm: 550, level: 0, cellPlay: false, cellTimer: 0, hops: null, reduced: reduceMotion(), countsDirty: false };
  const refs = {};
  const srcOrder = [];
  const t = (k, o) => fmt(ui[k] != null ? ui[k] : k, o);
  const stopData = (id) => stops.find((s) => s.id === id) || {};
  const srcNum = (key) => { let i = srcOrder.indexOf(key); if (i < 0) { srcOrder.push(key); i = srcOrder.length - 1; } return i + 1; };

  async function build() {
    root.innerHTML = '';
    const uid = 'lt' + Math.random().toString(36).slice(2, 7);
    const skip = el('a', { class: 'lt-skip', href: '#' + uid + '-panel', text: t('skipToPanel') });
    on(skip, 'click', (e) => { e.preventDefault(); refs.scroll.focus(); });

    // ---- stage ----
    const stageEl = el('div', { class: 'lt-stage', role: 'img', tabindex: '0', 'aria-describedby': uid + '-alt ' + uid + '-keys' });
    const hint = el('div', { class: 'lt-hint', 'aria-hidden': 'true', text: t('dragHint') });
    stageEl.appendChild(hint);
    refs.stageEl = stageEl; refs.hint = hint;

    // ---- panel ----
    const panel = el('section', { class: 'lt-panel', 'aria-label': t('title') });
    const scroll = el('div', { class: 'lt-scroll', id: uid + '-panel', tabindex: '-1' });
    const head = el('div', { class: 'lt-head' });
    head.append(el('h2', { class: 'lt-title', text: t('title') }), el('p', { class: 'lt-k', 'aria-hidden': 'true', id: uid + '-of' }));
    refs.of = head.lastChild;
    scroll.append(head, el('p', { class: 'lt-sub', text: t('subtitle') }));
    const nav = el('nav', { 'aria-label': t('stopsLabel') });
    const pills = el('ol', { class: 'lt-pills' });
    refs.pills = {};
    STOPS.forEach((id, i) => {
      const li = el('li');
      const b = el('button', { class: 'lt-pill', type: 'button' }, `<b>${i + 1}</b><span>${esc(stopData(id).name || id)}</span>`);
      b.setAttribute('aria-label', `${i + 1}. ${stopData(id).name || id}`);
      on(b, 'click', () => go(id, true));
      li.appendChild(b); pills.appendChild(li); refs.pills[id] = b;
    });
    nav.appendChild(pills); scroll.appendChild(nav);

    refs.k = el('p', { class: 'lt-k' });
    refs.h = el('h3', { class: 'lt-h', tabindex: '-1' });
    refs.body = el('p', { class: 'lt-p' });
    refs.try = el('p', { class: 'lt-try' });
    scroll.append(refs.k, refs.h, refs.body, refs.try);

    // wavelength block
    const wl = el('div', { class: 'lt-block lt-wl' });
    const rid = uid + '-nm';
    const lab = el('label', { for: rid }, `<span>${esc(t('wavelength'))}</span>`);
    const range = el('input', { class: 'lt-range', id: rid, type: 'range', min: String(NM_MIN), max: String(NM_MAX), step: '1', value: String(st.nm), 'aria-describedby': uid + '-wlh' });
    const stopsG = []; for (let nm = NM_MIN; nm <= NM_MAX; nm += 10) stopsG.push(`${S.cssOf(nm)} ${((nm - NM_MIN) / (NM_MAX - NM_MIN) * 100).toFixed(1)}%`);
    range.style.setProperty('--rainbow', `linear-gradient(90deg, ${stopsG.join(', ')})`);
    const help = el('p', { class: 'lt-sr', id: uid + '-wlh', text: t('wavelengthHelp') });
    const read = el('div', { class: 'lt-read', 'aria-hidden': 'true' });
    read.innerHTML = `<div><span>${esc(t('wavelength'))}</span><b data-r="nm"></b></div><div><span>${esc(t('colour'))}</span><b data-r="col"></b></div>` +
      `<div><span>${esc(t('frequency'))}</span><b data-r="thz"></b></div><div><span>${esc(t('energy'))}</span><b data-r="ev"></b></div>`;
    const formula = el('p', { class: 'lt-formula' });
    const dev = el('p', { class: 'lt-warn' });
    const warn = el('p', { class: 'lt-warn', text: t('outsideVisible') });
    wl.append(lab, range, help, read, formula, dev, warn);
    scroll.appendChild(wl);
    Object.assign(refs, { wl, range, read, formula, dev, warn });
    let nmTimer = 0;
    on(range, 'input', () => {
      setNm(+range.value);
      clearTimeout(nmTimer);
      nmTimer = setTimeout(() => { if (st.stop === 'antenna' && stage && stage.antenna) { stage.antenna().replay(); stage.kick(); } }, 450);
    });

    // per-stop blocks
    refs.blocks = {};
    // sun
    {
      const b = el('div', { class: 'lt-block' });
      const cv = el('canvas', { class: 'lt-chart', role: 'img', 'aria-label': stopData('sun').chart || '' });
      b.append(cv, el('p', { class: 'lt-cap', text: stopData('sun').chart || '' }));
      refs.solar = cv; refs.blocks.sun = b;
    }
    // leaf
    {
      const b = el('div', { class: 'lt-block' });
      const row = el('div', { class: 'lt-row' });
      const send = el('button', { class: 'lt-btn lt-primary', type: 'button', text: t('send') });
      const rain = el('button', { class: 'lt-btn', type: 'button', 'aria-pressed': 'true', text: t('rainOn') });
      on(send, 'click', sendOne);
      on(rain, 'click', () => { const l = stage && stage.leaf(); if (!l) return; l.setRain(!l.rain()); syncRain(); stage.kick(); });
      row.append(send, rain);
      const result = el('p', { class: 'lt-result', role: 'status' });
      const counts = el('div', { class: 'lt-counts' });
      counts.innerHTML = `<div><span>${esc(t('caught'))}</span><b data-c="caught">0</b></div><div><span>${esc(t('bounced'))}</span><b data-c="bounced">0</b></div>`;
      const mc = S.mixColours();
      const sw = el('div', { class: 'lt-row' });
      sw.innerHTML = `<span class="lt-swatch"><i style="background:${S.css(mc.inn)}"></i>${esc(t('swatchIn'))}</span>` +
        `<span class="lt-swatch"><i style="background:${S.css(mc.out)}"></i>${esc(t('swatchOut'))}</span>`;
      const cv = el('canvas', { class: 'lt-chart', role: 'img', 'aria-label': stopData('leaf').chart || '' });
      b.append(row, result, counts, sw, el('div', { style: 'height:8px' }), cv, el('p', { class: 'lt-cap', text: stopData('leaf').chart || '' }));
      Object.assign(refs, { send, rain, result, counts, absorb: cv }); refs.blocks.leaf = b;
    }
    // cell
    {
      const b = el('div', { class: 'lt-block' });
      const seg = el('div', { class: 'lt-seg', role: 'group', 'aria-label': t('levelsLabel') });
      refs.levelBtns = (stopData('cell').levels || []).map((L, i) => {
        const btn = el('button', { class: 'lt-btn', type: 'button', 'aria-pressed': 'false', text: L.name });
        on(btn, 'click', () => { stopCellPlay(); setLevel(i, false); });
        seg.appendChild(btn); return btn;
      });
      const row = el('div', { class: 'lt-row', style: 'margin-top:6px' });
      const out = el('button', { class: 'lt-btn', type: 'button', text: t('zoomOut') });
      const inn = el('button', { class: 'lt-btn lt-primary', type: 'button', text: t('zoomIn') });
      const play = el('button', { class: 'lt-btn', type: 'button', text: t('play') });
      on(out, 'click', () => { stopCellPlay(); setLevel(st.level - 1, false); });
      on(inn, 'click', () => { stopCellPlay(); setLevel(st.level + 1, true); });
      on(play, 'click', () => (st.cellPlay ? stopCellPlay() : startCellPlay()));
      row.append(out, inn, play);
      const lvl = el('p', { class: 'lt-p', style: 'margin-top:8px' });
      b.append(seg, row, lvl);
      Object.assign(refs, { zOut: out, zIn: inn, cellPlayBtn: play, levelBody: lvl }); refs.blocks.cell = b;
    }
    // antenna
    {
      const b = el('div', { class: 'lt-block' });
      const row = el('div', { class: 'lt-row' });
      const play = el('button', { class: 'lt-btn lt-primary', type: 'button', text: t('pause') });
      const step = el('button', { class: 'lt-btn', type: 'button', text: t('step') });
      const replay = el('button', { class: 'lt-btn', type: 'button', text: t('replay') });
      const prot = el('button', { class: 'lt-btn', type: 'button', 'aria-pressed': 'true', text: t('showProtein') });
      on(play, 'click', () => { const a = stage && stage.antenna && stage.antenna(); if (!a) return; a.playing() ? a.pause() : a.play(); syncAntenna(); stage.kick(); });
      on(step, 'click', () => { const a = stage && stage.antenna && stage.antenna(); if (!a) return; a.step(); syncAntenna(); stage.kick(); });
      on(replay, 'click', () => { const a = stage && stage.antenna && stage.antenna(); if (!a) return; a.replay(); syncAntenna(); stage.kick(); });
      on(prot, 'click', () => { const a = stage && stage.antenna && stage.antenna(); if (!a) return; const v = prot.getAttribute('aria-pressed') !== 'true'; prot.setAttribute('aria-pressed', String(v)); a.showProtein(v); stage.kick(); });
      row.append(play, step, replay, prot);
      const leg = el('ul', { class: 'lt-legend', 'aria-label': t('legendLabel') });
      leg.innerHTML = LEGEND.map(([k, c]) => `<li><i style="background:${c}"></i>${esc(t(k))}</li>`).join('');
      const stepsH = el('p', { class: 'lt-k', text: t('stepsLabel'), style: 'margin-top:8px' });
      const steps = el('ol', { class: 'lt-steps' });
      b.append(row, leg, stepsH, steps, el('p', { class: 'lt-cap', text: stopData('antenna').caption || '' }));
      Object.assign(refs, { aPlay: play, aStep: step, aReplay: replay, aProt: prot, steps }); refs.blocks.antenna = b;
    }
    // payoff
    {
      const b = el('div', { class: 'lt-block' });
      const recap = el('p', { class: 'lt-try' });
      const lh = el('p', { class: 'lt-k', text: t('linksTitle') });
      const links = el('ul', { class: 'lt-links' });
      links.innerHTML = (stopData('payoff').links || []).map((L) => `<li><a href="${esc(L.href)}"><b>${esc(L.name)}</b><span>${esc(L.blurb)}</span></a></li>`).join('');
      b.append(recap, lh, links);
      refs.recap = recap; refs.blocks.payoff = b;
    }
    Object.values(refs.blocks).forEach((b) => scroll.appendChild(b));

    refs.note = el('p', { class: 'lt-note' });
    const words = el('details', { class: 'lt-words' });
    words.append(el('summary', { text: t('inWords') }));
    refs.alt = el('p', { id: uid + '-alt' });
    words.appendChild(refs.alt);
    const keys = el('p', { class: 'lt-cap', id: uid + '-keys', text: t('keysHelp') });
    refs.still = el('p', { class: 'lt-cap', text: t('stillNote') });
    scroll.append(refs.note, words, refs.still, keys);

    const foot = el('div', { class: 'lt-foot' });
    const back = el('button', { class: 'lt-btn', type: 'button', text: t('back') });
    const next = el('button', { class: 'lt-btn lt-primary', type: 'button', text: t('next') });
    const about = el('button', { class: 'lt-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': uid + '-about', text: t('about') });
    on(back, 'click', () => move(-1)); on(next, 'click', () => move(1));
    foot.append(back, about, next);
    panel.append(scroll, foot);
    Object.assign(refs, { scroll, back, next, aboutBtn: about });

    // live region
    const live = el('div', { class: 'lt-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
    refs.live = live;

    // about drawer
    const aboutEl = el('section', { class: 'lt-about', id: uid + '-about', hidden: '', 'aria-label': t('aboutTitle'), tabindex: '-1' });
    const supHtml = (keys) => (keys || []).map((k) => `<sup><a href="#${uid}-src-${esc(k)}">[${srcNum(k)}]</a></sup>`).join('');
    const factsHtml = facts.map((f) => `<li>${esc(f.t)}${supHtml(f.src)}</li>`).join('');
    const vocabHtml = vocab.length ? `<h2>${esc(t('vocabTitle'))}</h2><dl class="lt-vocab">` +
      vocab.map((v) => `<dt>${esc(v.term)}</dt><dd>${esc(v.definition)}${supHtml(v.s)}</dd>`).join('') + '</dl>' : '';
    Object.keys(sources).forEach(srcNum);
    const srcHtml = srcOrder.map((k) => {
      const s = sources[k] || {};
      const lic = s.licence ? ` ${esc(s.licence)}.` : '';
      return `<li id="${uid}-src-${esc(k)}">${esc(s.cite || k)}${lic} ${s.url ? `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.url)}</a>` : ''}</li>`;
    }).join('');
    aboutEl.innerHTML = `<div class="lt-abouthead"><h2>${esc(t('aboutTitle'))}</h2></div>` +
      `<h2>${esc(t('factsTitle'))}</h2><ul>${factsHtml}</ul>${vocabHtml}<h2>${esc(t('sourcesTitle'))}</h2><ol>${srcHtml}</ol>` +
      `<h2>${esc(t('credits'))}</h2><p>${esc(credits)}</p>`;
    const close = el('button', { class: 'lt-btn', type: 'button', text: t('close') });
    aboutEl.firstChild.appendChild(close);
    const setAbout = (open) => {
      aboutEl.hidden = !open; about.setAttribute('aria-expanded', String(open));
      if (open) aboutEl.focus(); else about.focus();
    };
    on(about, 'click', () => setAbout(aboutEl.hidden));
    on(close, 'click', () => setAbout(false));
    on(aboutEl, 'keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAbout(false); } });
    refs.aboutEl = aboutEl;

    root.append(skip, stageEl, panel, aboutEl, live);

    // ---- the stage: 3D if we can, flat if not ----
    const ctx = {
      S, ui, lhc, reduced: st.reduced,
      onEvent,
      cardText: (id) => (id === 'cell' ? ((stopData('cell').levels || [])[st.level] || {}).alt : stopData(id).alt) || '',
    };
    let useGL = !opts.forceFlat && lhc;
    if (useGL) {
      try {
        const mod = await import('./scenes.js');
        if (!mod.hasWebGL()) throw new Error('no webgl');
        stage = mod.createStage(stageEl, ctx);
      } catch (e) { stage = null; useGL = false; }
    }
    if (!stage) {
      const { createFlat } = await import('./flat.js');
      stage = createFlat(stageEl, ctx);
      const note = el('p', { class: 'lt-note', role: 'note', text: t('noGL') });
      scroll.insertBefore(note, refs.k);
      hint.hidden = true;
    }
    if (destroyed) { stage.dispose(); return; }

    // keys, hash, motion
    on(root, 'keydown', onKey);
    on(window, 'hashchange', () => { const id = fromHash(); if (id && id !== st.stop) go(id, false); });
    const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
    on(mqRM, 'change', () => { st.reduced = mqRM.matches; stage.setReduced(st.reduced); refs.still.hidden = !st.reduced; if (st.reduced) stopCellPlay(); });
    refs.still.hidden = !st.reduced;
    on(window, 'resize', () => redrawCharts());

    setNm(st.nm, true);
    go(fromHash() || opts.startStop || 'sun', false, true);
    syncRain();
    Object.assign(api, { go, setNm, stage: () => stage });
  }

  // ---------- navigation ----------
  function fromHash() { const h = location.hash.replace('#', ''); return STOPS.includes(h) ? h : null; }
  function move(d) { const i = STOPS.indexOf(st.stop) + d; if (i >= 0 && i < STOPS.length) go(STOPS[i], true); }
  function go(id, focus, first) {
    if (!STOPS.includes(id)) return;
    st.stop = id;
    if (id !== 'cell') stopCellPlay();
    const i = STOPS.indexOf(id), sd = stopData(id);
    const nh = '#' + id;
    if (location.hash !== nh) { try { history.replaceState(null, '', nh); } catch (e) { /* file or sandbox */ } }
    for (const k of STOPS) { if (k === id) refs.pills[k].setAttribute('aria-current', 'step'); else refs.pills[k].removeAttribute('aria-current'); }
    refs.of.textContent = t('stopOf', { n: i + 1, total: STOPS.length });
    refs.k.textContent = `${t('stopOf', { n: i + 1, total: STOPS.length })} · ${sd.name || ''}`;
    refs.h.textContent = sd.heading || '';
    refs.body.textContent = sd.body || '';
    refs.try.hidden = !sd.try;
    refs.try.innerHTML = sd.try ? `<b>${esc(t('tryIt'))}:</b> ${esc(sd.try)}` : '';
    refs.wl.hidden = !(id === 'sun' || id === 'leaf' || id === 'antenna');
    refs.dev.hidden = id !== 'sun';
    for (const k in refs.blocks) refs.blocks[k].hidden = k !== id;
    const realStop = id === 'sun' || id === 'leaf' || id === 'antenna';
    refs.note.hidden = !sd.note;
    refs.note.innerHTML = sd.note ? `<span class="lt-badge${realStop ? ' lt-real' : ''}">${esc(realStop ? t('realData') : t('illustrative'))}</span>${esc(sd.note)}` : '';
    refs.alt.textContent = sd.alt || '';
    refs.back.disabled = i === 0; refs.next.disabled = i === STOPS.length - 1;
    refs.stageEl.setAttribute('aria-label', t('stageLabel', { n: i + 1, name: sd.name || id }));
    refs.hint.hidden = !!stage.flat || id === 'sun';
    if (id === 'cell') setLevel(st.level, false, true);
    if (id === 'payoff') updateRecap();
    if (id === 'antenna') { refs.steps.innerHTML = ''; }
    stage.setStop(id);
    if (id === 'antenna') syncAntenna();
    if (id === 'leaf') syncRain();
    refs.scroll.scrollTop = 0;
    redrawCharts();
    if (!first) announce(`${t('stopOf', { n: i + 1, total: STOPS.length })}: ${sd.heading || ''}`);
    if (focus) refs.h.focus({ preventScroll: true });
  }

  // ---------- wavelength ----------
  function setNm(nm, quiet) {
    nm = Math.max(NM_MIN, Math.min(NM_MAX, Math.round(nm)));
    st.nm = nm;
    const p = photon(nm);
    const name = colourName(nm, ui.colourNames || [[NM_MIN, '']]);
    const css = S.cssOf(nm, false);
    refs.range.value = String(nm);
    refs.range.style.setProperty('--thumb', css);
    refs.range.setAttribute('aria-valuetext', t('sliderText', { nm, colour: name, ev: p.eV.toFixed(2) }));
    const R = (k) => refs.read.querySelector(`[data-r="${k}"]`);
    R('nm').textContent = `${nm} ${t('nmUnit')}`;
    R('col').innerHTML = `<i class="lt-dot" style="background:${css}"></i>${esc(name)}`;
    R('thz').textContent = `${Math.round(p.THz)} ${t('thzUnit')}`;
    R('ev').textContent = `${p.eV.toFixed(2)} ${t('evUnit')}`;
    refs.formula.textContent = t('formulaLine', { h: sci(H, 3), c: sci(C, 3), nm, j: sci(p.J, 3), ev: p.eV.toFixed(3) });
    refs.dev.textContent = t('deviation', { deg: prismDeviation(nm).toFixed(1) });
    refs.warn.hidden = nm >= SEE_MIN;
    if (stage) stage.setNm(nm);
    if (st.stop === 'payoff') updateRecap();
    redrawCharts();
  }

  // ---------- leaf ----------
  function sendOne() {
    const l = stage && stage.leaf && stage.leaf();
    if (!l) return;
    l.send(st.nm);
    stage.kick();
  }
  function syncRain() {
    const l = stage && stage.leaf && stage.leaf(); if (!l || !refs.rain) return;
    const r = l.rain();
    refs.rain.setAttribute('aria-pressed', String(r));
    refs.rain.textContent = r ? t('rainOn') : t('rainOff');
  }

  // ---------- cell ----------
  function setLevel(i, animate, quiet) {
    const levels = stopData('cell').levels || [];
    i = Math.max(0, Math.min(levels.length - 1, i));
    const changed = i !== st.level;
    st.level = i;
    refs.levelBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    refs.zOut.disabled = i === 0; refs.zIn.disabled = i === levels.length - 1;
    refs.levelBody.textContent = levels[i] ? levels[i].body : '';
    if (st.stop === 'cell') refs.alt.textContent = (levels[i] && levels[i].alt) || stopData('cell').alt || '';
    if (stage && stage.cell && changed) { stage.cell().setLevel(i, animate); stage.kick(); }
    else if (stage && stage.cell && st.stop === 'cell') { const c = stage.cell(); if (c.level() !== i) c.setLevel(i, false); }
    if (stage && stage.refreshCard) stage.refreshCard();
    if (changed && !quiet) announce(`${t('levelsLabel')}: ${levels[i].name}. ${levels[i].body}`);
  }
  function startCellPlay() {
    if (st.reduced) { setLevel(st.level + 1, false); return; }
    st.cellPlay = true; refs.cellPlayBtn.textContent = t('pause');
    clearInterval(st.cellTimer);
    if (st.level >= (stopData('cell').levels || []).length - 1) setLevel(0, false);
    st.cellTimer = setInterval(() => {
      if (st.level >= (stopData('cell').levels || []).length - 1) { stopCellPlay(); return; }
      setLevel(st.level + 1, true);
    }, 4200);
  }
  function stopCellPlay() { st.cellPlay = false; clearInterval(st.cellTimer); if (refs.cellPlayBtn) refs.cellPlayBtn.textContent = t('play'); }

  // ---------- antenna ----------
  function syncAntenna() {
    const a = stage && stage.antenna && stage.antenna && !stage.flat ? stage.antenna() : null;
    const has = !!a;
    [refs.aPlay, refs.aStep, refs.aReplay, refs.aProt].forEach((b) => (b.disabled = !has));
    if (!has) return;
    refs.aPlay.textContent = a.playing() && !st.reduced ? t('pause') : t('play');
    refs.aPlay.hidden = st.reduced;
  }
  function updateRecap() {
    const p = photon(st.nm);
    refs.recap.textContent = st.hops != null ? t('recap', { nm: st.nm, ev: p.eV.toFixed(2), hops: st.hops }) : t('recapShort', { nm: st.nm, ev: p.eV.toFixed(2) });
  }

  // ---------- stage events ----------
  let lastAnnounce = 0, chartTimer = 0;
  function onEvent(name, d) {
    if (name === 'leafResult' && st.stop === 'leaf') {
      const msg = t(d.caught ? 'outCaught' : 'outBounced', { nm: Math.round(d.nm), p: Math.round(d.p * 100) });
      refs.result.textContent = msg;
    } else if (name === 'leafCount' && st.stop === 'leaf') {
      refs.counts.querySelector('[data-c="caught"]').textContent = String(d.caught);
      refs.counts.querySelector('[data-c="bounced"]').textContent = String(d.bounced);
      if (!chartTimer) chartTimer = setTimeout(() => { chartTimer = 0; redrawCharts(); }, 350);
    } else if (name === 'cellLevel') {
      if (d !== st.level) setLevel(d, false, true);
    } else if (name === 'antennaReset') {
      if (refs.steps) refs.steps.innerHTML = '';
    } else if (name === 'antennaStep' && st.stop === 'antenna') {
      const msg = t(d.key, d);
      refs.steps.appendChild(el('li', { text: msg }));
      if (refs.steps.children.length > 14) refs.steps.removeChild(refs.steps.firstChild);
      const now = performance.now();
      if (now - lastAnnounce > 900 || d.key === 'stepDone') { announce(msg); lastAnnounce = now; }
      syncAntenna();
    } else if (name === 'antennaDone') {
      st.hops = d.hops; syncAntenna();
    }
  }
  function announce(msg) {
    const L = refs.live; if (!L) return;
    L.textContent = '';
    setTimeout(() => { L.textContent = msg; }, 60);
  }

  // ---------- charts ----------
  function redrawCharts() {
    if (!S || !refs.solar) return;
    const pal = PAL[themeName] || PAL.dark;
    if (st.stop === 'sun') drawSolar(refs.solar, S, ui, st.nm, pal);
    if (st.stop === 'leaf') { const l = stage && stage.leaf && stage.leaf(); drawAbsorb(refs.absorb, S, ui, st.nm, pal, l ? l.recent : []); }
  }

  // ---------- keys ----------
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (!refs.aboutEl.hidden) return;
    if (/^[1-5]$/.test(e.key) && !typing) { go(STOPS[+e.key - 1], true); e.preventDefault(); return; }
    if (e.key === 'PageDown') { move(1); e.preventDefault(); return; }
    if (e.key === 'PageUp') { move(-1); e.preventDefault(); return; }
    if (e.key === ' ' && !typing && !['button', 'a', 'summary'].includes(tag)) {
      if (st.stop === 'antenna') refs.aPlay.click();
      else if (st.stop === 'leaf') sendOne();
      else if (st.stop === 'cell') refs.cellPlayBtn.click();
      e.preventDefault();
    }
  }

  function destroy() {
    destroyed = true;
    stopCellPlay();
    disposers.forEach((f) => f());
    if (stage) stage.dispose();
    root.remove();
  }
  return view;
}
