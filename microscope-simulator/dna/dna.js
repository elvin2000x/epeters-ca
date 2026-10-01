// Cinematic DNA: an illustrative B-DNA double helix with real proportions, drawn with three.js.
// ES module. mount(containerEl, options) builds everything inside containerEl; unmount() removes it.
// Proportions (sources in sources.json): 0.34 nm per base pair, 10.5 base pairs per turn, about 2 nm wide,
// right-handed, antiparallel strands, A-T with 2 hydrogen bonds, G-C with 3. Units in the scene are nanometres.
// Close-up mode draws one base pair from the real 1BNA coordinates (../molecules/data/1BNA.cif).
// No external requests: three.js is vendored, words come from dna.json, citations from sources.json.
//
// options: { theme: 'light'|'dark' (default follows the page), homeHref, realHref (default ../molecules/#dna),
//            embedded (true: vertical page scroll passes through the canvas, no wheel zoom), startMode, noGL }

import * as THREE from '../vendor/three/0.170.0/build/three.module.js';

const HERE = new URL('./', import.meta.url);

// ---- Real proportions (nm) ----
const RISE = 0.34;                 // per base pair (OpenStax 14.2)
const BPT = 10.5;                  // base pairs per turn (Wang 1979: 10.4 +/- 0.1 in solution)
const TWIST = 2 * Math.PI / BPT;   // positive angle with rising y in a right-handed frame = right-handed helix
const R = 0.88;                    // backbone centre radius; with the tube the helix is about 2 nm wide
const TUBE = 0.13;
const PHI = 2.55;                  // angular offset of strand 2: unequal gaps make the major and minor grooves
const UNIT = 'CGCGAATTCGCG';       // the 1BNA sequence, repeated
const SEQ = UNIT.repeat(6), N = SEQ.length, MID = (N - 1) / 2;
const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
const CH = 2 * R * Math.sin(PHI / 2);
const GAP = 0.3, ROOT = TUBE * 0.55, HALF = CH / 2 - GAP / 2 - ROOT;
const HB_OFF = { 2: [-0.06, 0.06], 3: [-0.095, 0, 0.095] };
const BASE_COL = { A: '#ff7a2f', T: '#ffd166', G: '#22c27a', C: '#a6f5d0' };
const STRAND_COL = ['#49b8ff', '#b07cff'];
const REAL = { C: 3, G: 4, A: 5, T: 7 };   // chain A residue carrying that letter; partner is 25 - n on chain B
const EL_COL = { C: '#a3adb8', N: '#4f7dff', O: '#ff4d4d', P: '#ff9d2e' };
const EL_R = { C: 0.55, N: 0.58, O: 0.58, P: 0.75 };  // angstroms, ball-and-stick
const UZ_MAX = 0.62, UZ_W = 8;

const nBonds = (L) => (L === 'G' || L === 'C') ? 3 : 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const fmt = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// ---------------------------------------------------------------------------------------------
const CSS = `
.dna-root { --dna-ink: #e8f1f7; --dna-muted: #a9bccb; --dna-glass: rgba(7, 15, 27, 0.74); --dna-line: rgba(150, 185, 215, 0.3);
  --dna-accent: #5cd3ff; --dna-on-accent: #03141f; --dna-raised: rgba(14, 26, 44, 0.9);
  position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; color: var(--dna-ink);
  font-family: var(--font-ui, "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif); font-size: 15px; line-height: 1.45;
  background: radial-gradient(120% 90% at 50% 42%, #10264a 0%, #060d1b 52%, #010307 100%); -webkit-font-smoothing: antialiased; }
.dna-root.dna-light { --dna-ink: #0f1c28; --dna-muted: #46596a; --dna-glass: rgba(250, 252, 254, 0.86); --dna-line: rgba(30, 55, 80, 0.24);
  --dna-accent: #0a6f9e; --dna-on-accent: #ffffff; --dna-raised: rgba(255, 255, 255, 0.95); }
.dna-root *, .dna-root *::before, .dna-root *::after { box-sizing: border-box; }
.dna-root [hidden] { display: none !important; }
.dna-root button { font: inherit; color: inherit; cursor: pointer; }
.dna-root a { color: var(--dna-accent); }
.dna-root :focus-visible { outline: 3px solid var(--dna-accent); outline-offset: 2px; }
.dna-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.dna-view { position: absolute; inset: 0; outline: none; }
.dna-view:focus-visible { outline: 3px solid var(--dna-accent); outline-offset: -3px; }
.dna-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.dna-root.dna-embedded .dna-view canvas { touch-action: pan-y; }
.dna-view.dna-picky { cursor: pointer; }
.dna-vig { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(130% 100% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.55) 100%); }
.dna-tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.dna-end { position: absolute; left: 0; top: 0; font-family: var(--font-data, "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace); font-size: 13px; font-weight: 700;
  padding: 1px 7px; border-radius: 6px; color: #eaf6ff; background: rgba(4, 10, 20, 0.7); border: 1px solid var(--c, #49b8ff); will-change: transform; }
.dna-pill { position: absolute; left: 0; top: 0; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 14px; color: #06121d; background: #f4fbff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45); will-change: transform; white-space: nowrap; }
.dna-top { position: absolute; left: 12px; right: 12px; top: calc(10px + env(safe-area-inset-top, 0px)); display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; pointer-events: none; }
.dna-top > * { pointer-events: auto; }
.dna-titlebox { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.dna-title { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.005em; padding: 3px 10px; border-radius: 8px; background: var(--dna-glass); border: 1px solid var(--dna-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.dna-badge { font-size: 12.5px; font-weight: 500; padding: 2px 10px; border-radius: 999px; background: var(--dna-glass); border: 1px solid var(--dna-line); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.dna-home { font-size: 13px; padding: 2px 8px; border-radius: 6px; background: var(--dna-glass); }
.dna-links { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.dna-btn { min-height: 44px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--dna-line); background: var(--dna-glass); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; color: var(--dna-ink); white-space: nowrap; }
.dna-root a.dna-btn { color: var(--dna-ink); }
.dna-btn:hover { border-color: var(--dna-accent); }
.dna-btn[aria-pressed="true"], .dna-btn.dna-primary { background: var(--dna-accent); border-color: var(--dna-accent); color: var(--dna-on-accent); }
.dna-root a.dna-btn.dna-primary { color: var(--dna-on-accent); }
.dna-btn.dna-primary::after { content: "\\2192"; }
.dna-closetag { position: absolute; left: 50%; top: calc(104px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); pointer-events: none; font-size: 13px; font-weight: 600;
  padding: 4px 12px; border-radius: 999px; background: #f4fbff; color: #06121d; white-space: nowrap; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
.dna-bottom { position: absolute; left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; pointer-events: none; }
.dna-bottom > * { pointer-events: auto; }
.dna-info { width: min(430px, 100%); background: var(--dna-glass); border: 1px solid var(--dna-line); border-radius: 14px; padding: 10px 14px; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  max-height: 34vh; overflow-y: auto; }
.dna-info p { margin: 0 0 4px; }
.dna-info h3 { margin: 0 0 4px; font-size: 18px; line-height: 1.25; }
.dna-k { font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-size: 12px; letter-spacing: 0.04em; color: var(--dna-muted); }
.dna-muted { color: var(--dna-muted); font-size: 14px; }
.dna-letters { font-family: var(--font-data, ui-monospace, Menlo, Consolas, monospace); font-weight: 700; }
.dna-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dna-seg { display: inline-flex; border-radius: 999px; border: 1px solid var(--dna-line); background: var(--dna-glass); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); padding: 2px; }
.dna-seg .dna-btn { border: 0; background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none; min-height: 40px; padding: 6px 12px; }
.dna-seg .dna-btn[aria-pressed="true"] { background: var(--dna-accent); color: var(--dna-on-accent); }
.dna-legend { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 5px 12px; border-radius: 12px; background: var(--dna-glass); border: 1px solid var(--dna-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font-size: 13px; }
.dna-li { display: inline-flex; align-items: center; gap: 6px; }
.dna-sw { display: inline-block; width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0, 0, 0, 0.35); vertical-align: -2px; }
.dna-sw.dna-round { border-radius: 50%; }
.dna-small { font-size: 12.5px; color: var(--dna-muted); }
.dna-about { position: absolute; top: 0; right: 0; bottom: 0; width: min(400px, 100%); background: var(--dna-raised); border-left: 1px solid var(--dna-line); overflow-y: auto;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 18px calc(20px + env(safe-area-inset-bottom, 0px)); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); z-index: 5; }
.dna-about h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dna-muted); margin: 16px 0 6px; }
.dna-about h2:first-of-type { margin-top: 4px; }
.dna-about p, .dna-about li { font-size: 14.5px; }
.dna-about ul { padding-left: 18px; margin: 0; }
.dna-about ol { padding-left: 22px; margin: 0; font-size: 13px; color: var(--dna-muted); }
.dna-about ol li { margin-bottom: 6px; font-size: 13px; }
.dna-about ol a { overflow-wrap: anywhere; }
.dna-about sup a { text-decoration: none; font-family: var(--font-data, ui-monospace, monospace); font-size: 11px; }
.dna-abouthead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.dna-abouthead h2 { margin: 0; }
.dna-nogl { position: absolute; inset: 0; overflow-y: auto; padding: 96px 16px 24px; display: flex; flex-wrap: wrap; gap: 18px; align-content: flex-start; justify-content: center; }
.dna-nogl svg { flex: none; width: min(300px, 80vw); height: auto; }
.dna-nogl .dna-nogltext { max-width: 52ch; background: var(--dna-glass); border: 1px solid var(--dna-line); border-radius: 14px; padding: 12px 16px; }
@media (max-width: 560px) {
  .dna-title { font-size: 15px; }
  .dna-btn { padding: 8px 11px; font-size: 13.5px; }
  .dna-seg .dna-btn { padding: 6px 9px; }
  .dna-info { max-height: 30vh; padding: 8px 12px; }
  .dna-info h3 { font-size: 16px; }
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

// ---------------------------------------------------------------------------------------------
function createView(container, opts) {
  const disposers = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); disposers.push(() => t.removeEventListener(ev, fn, o)); };
  let ui = {}, facts = [], sources = {};
  let destroyed = false;

  // ---------- DOM ----------
  let style = document.getElementById('dna-style');
  if (!style) { style = el('style', { id: 'dna-style' }); style.textContent = CSS; document.head.appendChild(style); }
  const root = el('div', { class: 'dna-root' + (opts.embedded ? ' dna-embedded' : '') });
  container.appendChild(root);

  const applyTheme = () => {
    let t = opts.theme;
    if (t !== 'light' && t !== 'dark') {
      const h = document.documentElement.dataset.theme;
      t = (h === 'light' || h === 'dark') ? h : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    root.classList.toggle('dna-light', t === 'light');
  };
  applyTheme();
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  on(mqDark, 'change', applyTheme);
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  disposers.push(() => themeObs.disconnect());

  const api = {};
  const view = { root, api, destroy, ready: null };

  view.ready = (async () => {
    try {
      const [d, s] = await Promise.all([
        fetch(new URL('dna.json', HERE)).then((r) => r.json()),
        fetch(new URL('sources.json', HERE)).then((r) => r.json()),
      ]);
      ui = d.ui || {}; facts = d.facts || []; sources = (s && s.sources) || {};
    } catch (e) { ui = {}; }
    if (destroyed) return;
    build();
  })();

  // ---------- state ----------
  let mode = 'orbit';
  let motionOn = !reduceMotion();
  let selected = -1;
  let uz = 0, uzTarget = 0;
  let yawUser = 0, pitchUser = 0.1, zoom = 1;
  let time = 0, flyX = 0;
  let running = false, raf = 0, lastT = 0, dirty = true, inViewport = true;
  let renderer, scene, camera, tilt, spin, three = null;
  let atomsCache = null, atomGroup = null, atomPair = -1, atomInfo = null;
  const refs = {};
  const srcOrder = [];

  function t(k, o) { return fmt(ui[k] != null ? ui[k] : k, o || {}); }

  function srcNum(key) { let i = srcOrder.indexOf(key); if (i < 0) { srcOrder.push(key); i = srcOrder.length - 1; } return i + 1; }

  function build() {
    const altId = 'dna-alt-' + Math.random().toString(36).slice(2, 7);
    const keysId = altId + 'k';
    root.innerHTML = '';
    const viewEl = el('div', { class: 'dna-view', tabindex: '0', role: 'group', 'aria-label': t('viewLabel'), 'aria-describedby': altId + ' ' + keysId });
    const altSr = el('p', { class: 'dna-sr', id: altId, text: t('alt') });
    const keysSr = el('p', { class: 'dna-sr', id: keysId, text: t('keys') });
    const vig = el('div', { class: 'dna-vig', 'aria-hidden': 'true' });
    const tags = el('div', { class: 'dna-tags', 'aria-hidden': 'true' });

    // top bar
    const top = el('div', { class: 'dna-top' });
    const titleBox = el('div', { class: 'dna-titlebox' });
    if (opts.homeHref) titleBox.appendChild(el('a', { class: 'dna-home', href: opts.homeHref, text: t('home') }));
    titleBox.appendChild(el('h2', { class: 'dna-title', text: t('title') }));
    titleBox.appendChild(el('span', { class: 'dna-badge', text: t('badge') }));
    const links = el('div', { class: 'dna-links' });
    const realA = el('a', { class: 'dna-btn dna-primary', href: opts.realHref || '../molecules/#dna', title: t('realTitle'), text: t('real') });
    links.appendChild(realA);
    top.append(titleBox, links);

    const closeTag = el('div', { class: 'dna-closetag', hidden: '', text: t('closeTag') });

    // bottom
    const bottom = el('div', { class: 'dna-bottom' });
    const info = el('section', { class: 'dna-info', 'aria-live': 'polite' });
    const legend = el('div', { class: 'dna-legend', role: 'group', 'aria-label': t('legendLabel') });
    legend.innerHTML =
      `<span class="dna-li"><span class="dna-sw" style="background:${BASE_COL.A}"></span><span class="dna-sw" style="background:${BASE_COL.T}"></span><b>${esc(t('legendAT'))}</b> <span class="dna-small">${esc(t('bonds2'))}</span></span>` +
      `<span class="dna-li"><span class="dna-sw" style="background:${BASE_COL.G}"></span><span class="dna-sw" style="background:${BASE_COL.C}"></span><b>${esc(t('legendGC'))}</b> <span class="dna-small">${esc(t('bonds3'))}</span></span>` +
      `<span class="dna-li"><span class="dna-sw dna-round" style="background:${STRAND_COL[0]}"></span>${esc(t('strand1'))}</span>` +
      `<span class="dna-li"><span class="dna-sw dna-round" style="background:${STRAND_COL[1]}"></span>${esc(t('strand2'))}</span>`;
    const bar = el('div', { class: 'dna-row' });
    const seg = el('div', { class: 'dna-seg', role: 'group', 'aria-label': t('modesLabel') });
    const modeBtns = {};
    for (const m of ['orbit', 'fly', 'closeup']) {
      const b = el('button', { class: 'dna-btn', type: 'button', 'aria-pressed': 'false', text: t(m) });
      b.dataset.mode = m;
      on(b, 'click', () => setMode(m));
      modeBtns[m] = b; seg.appendChild(b);
    }
    const uzBtn = el('button', { class: 'dna-btn', type: 'button', 'aria-pressed': 'false', title: t('unzipNote'), text: t('unzip') });
    const motionBtn = el('button', { class: 'dna-btn', type: 'button', 'aria-pressed': 'false', text: motionOn ? t('pause') : t('play') });
    const aboutBtn = el('button', { class: 'dna-btn', type: 'button', 'aria-expanded': 'false', text: t('about') });
    bar.append(seg, uzBtn, motionBtn, aboutBtn);
    bottom.append(info, legend, bar);

    // about panel
    const about = el('section', { class: 'dna-about', hidden: '', 'aria-label': t('about'), tabindex: '-1' });
    const factsHtml = facts.map((f) => `<li>${esc(f.t)}${(f.s || []).map((k) => `<sup><a href="#dna-src-${esc(k)}">[${srcNum(k)}]</a></sup>`).join('')}</li>`).join('');
    const srcHtml = srcOrder.map((k) => {
      const s = sources[k] || {};
      const link = s.url ? ` <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.url)}</a>` : '';
      return `<li id="dna-src-${esc(k)}">${esc(s.cite || k)}${s.doi ? ' DOI ' + esc(s.doi) + '.' : ''}${link}</li>`;
    }).join('');
    about.innerHTML =
      `<div class="dna-abouthead"><h2>${esc(t('factsHeading'))}</h2><button class="dna-btn" type="button" data-close>${esc(t('aboutClose'))}</button></div>` +
      `<ul>${factsHtml}</ul>` +
      `<p class="dna-muted">${esc(t('unzipNote'))}</p>` +
      `<h2>${esc(t('altHeading'))}</h2><p>${esc(t('alt'))}</p>` +
      `<h2>${esc(t('keysHeading'))}</h2><p>${esc(t('keys'))}</p>` +
      `<h2>${esc(t('sourcesHeading'))}</h2><ol>${srcHtml}</ol>`;

    const live = el('div', { class: 'dna-sr', 'aria-live': 'polite' });
    root.append(viewEl, vig, tags, top, closeTag, bottom, about, altSr, keysSr, live);
    Object.assign(refs, { viewEl, tags, info, bottom, closeTag, modeBtns, uzBtn, motionBtn, aboutBtn, about, live, legend, bar });

    on(uzBtn, 'click', toggleUnzip);
    on(motionBtn, 'click', () => setMotion(!motionOn));
    on(aboutBtn, 'click', () => toggleAbout());
    on(about.querySelector('[data-close]'), 'click', () => toggleAbout(false));
    on(root, 'keydown', onKey);

    const glOk = !opts.noGL && !new URLSearchParams(location.search).has('nogl') && initGL(viewEl);
    if (!glOk) { buildFallback(); return; }
    setMode(opts.startMode && ['orbit', 'fly', 'closeup'].includes(opts.startMode) ? opts.startMode : 'orbit', true);
    showInfo();
    start();
  }

  // ---------- fallback ----------
  function buildFallback() {
    for (const k of ['viewEl', 'bar', 'info']) refs[k].hidden = true;
    const box = el('div', { class: 'dna-nogl' });
    box.innerHTML = helixSvg(t('noglFig')) +
      `<div class="dna-nogltext" role="status"><p><b>${esc(t('nogl'))}</b></p><p>${esc(t('alt'))}</p>` +
      `<p class="dna-muted">${esc(t('ruleAT'))} ${esc(t('ruleGC'))}</p></div>`;
    root.insertBefore(box, refs.tags);
    refs.aboutBtn.hidden = false;
    const holder = el('div', { class: 'dna-row' });
    holder.appendChild(refs.aboutBtn);
    root.querySelector('.dna-bottom').appendChild(holder);
  }

  // ---------- WebGL ----------
  function initGL(viewEl) {
    const canvas = el('canvas', { 'aria-hidden': 'true' });
    viewEl.appendChild(canvas);
    try {
      const probe = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!probe) { canvas.remove(); return false; }
      const mobile = matchMedia('(pointer: coarse)').matches;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      three = { mobile };
    } catch (e) { canvas.remove(); return false; }

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050b18, 10, 40);
    camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    camera.position.set(0, 2, 22);

    scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x1a1030, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(5, 8, 7); scene.add(key);
    const back = new THREE.DirectionalLight(0x7fd8ff, 2.2); back.position.set(-7, -2, -9); scene.add(back);
    const back2 = new THREE.DirectionalLight(0xc08cff, 1.6); back2.position.set(8, 3, -6); scene.add(back2);

    tilt = new THREE.Group(); spin = new THREE.Group();
    tilt.add(spin); scene.add(tilt);
    tilt.rotation.set(0.18, 0, 0.62);

    buildHelix();
    buildBokeh();
    buildTags();

    // events
    const ro = new ResizeObserver(resize); ro.observe(root); ro.observe(refs.bottom); disposers.push(() => ro.disconnect());
    const io = new IntersectionObserver((ents) => { inViewport = ents[0].isIntersecting; inViewport ? start() : stop(); });
    io.observe(root); disposers.push(() => io.disconnect());
    on(document, 'visibilitychange', () => (document.hidden ? stop() : start()));
    const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
    on(mqRM, 'change', () => setMotion(!mqRM.matches));
    on(canvas, 'pointerdown', onDown);
    on(canvas, 'pointermove', onMove);
    on(canvas, 'pointerup', onUp);
    on(canvas, 'pointercancel', onUp);
    on(canvas, 'pointerleave', () => { canvas.parentElement.classList.remove('dna-picky'); });
    if (!opts.embedded) on(canvas, 'wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); stop(); });
    resize();
    return true;
  }

  // ---------- helix geometry ----------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _col = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);

  function sepAt(tp) {
    if (uz <= 0) return 0;
    const fork = uz * (N + UZ_W) - UZ_W;
    const s = smooth((fork - tp) / UZ_W);
    return s * (0.9 + 0.045 * Math.max(0, fork - tp));
  }
  function sepFrac(tp) { if (uz <= 0) return 0; const fork = uz * (N + UZ_W) - UZ_W; return smooth((fork - tp) / UZ_W); }

  function strandPoint(s, tp, out) {
    const a1 = tp * TWIST, a = a1 + (s ? PHI : 0);
    let x = R * Math.cos(a), z = -R * Math.sin(a);
    const sep = sepAt(tp);
    if (sep > 0) {
      let dx = Math.cos(a1) - Math.cos(a1 + PHI), dz = -(Math.sin(a1) - Math.sin(a1 + PHI));
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const sg = s ? -1 : 1; x += sg * dx * sep; z += sg * dz * sep;
    }
    return out.set(x, (tp - MID) * RISE, z);
  }

  const T0 = -0.7, T1 = N - 1 + 0.7, RAD = 12;
  let SEGS = 0;
  function tubeGeo() {
    const g = new THREE.BufferGeometry();
    const vc = (SEGS + 1) * (RAD + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vc * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vc * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < SEGS; i++) for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j, b = (i + 1) * (RAD + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    g.setIndex(idx);
    return g;
  }
  function fillTube(g, s) {
    const P = g.attributes.position.array, Nn = g.attributes.normal.array;
    const T = new THREE.Vector3(), ref = new THREE.Vector3(), nm = new THREE.Vector3(), bn = new THREE.Vector3(), n = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i <= SEGS; i++) {
      const tp = T0 + (T1 - T0) * i / SEGS;
      strandPoint(s, tp, _c); strandPoint(s, tp + 0.02, _a); strandPoint(s, tp - 0.02, _b);
      T.subVectors(_a, _b).normalize();
      ref.set(_c.x, 0, _c.z).normalize();
      nm.copy(ref).addScaledVector(T, -ref.dot(T)).normalize();
      bn.crossVectors(T, nm);
      for (let j = 0; j <= RAD; j++) {
        const th = j / RAD * Math.PI * 2;
        n.copy(nm).multiplyScalar(Math.cos(th)).addScaledVector(bn, Math.sin(th));
        P[k] = _c.x + n.x * TUBE; Nn[k++] = n.x;
        P[k] = _c.y + n.y * TUBE; Nn[k++] = n.y;
        P[k] = _c.z + n.z * TUBE; Nn[k++] = n.z;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  }

  // Standard material plus a fresnel rim light and optional self glow from instance colours.
  function cine(mat, rimColor, rimK, selfGlow = 0) {
    const uRim = { value: new THREE.Color(rimColor) }, uK = { value: rimK }, uG = { value: selfGlow };
    mat.userData.rim = uK; mat.userData.glow = uG;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = uRim; sh.uniforms.uRimK = uK; sh.uniforms.uSelfGlow = uG;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimK; uniform float uSelfGlow;')
        .replace('#include <dithering_fragment>',
          'float rimF = pow(1.0 - saturate(dot(normal, geometryViewDir)), 2.6);\n' +
          'gl_FragColor.rgb += uRim * rimF * uRimK;\n' +
          '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n gl_FragColor.rgb += vColor.rgb * uSelfGlow;\n#endif\n' +
          '#include <dithering_fragment>');
    };
    return mat;
  }

  function glowMat(color, strength) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: strength }, uPush: { value: 0.11 } },
      vertexShader: `uniform float uPush; varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position + normal * uPush, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uK; varying vec3 vN; varying vec3 vV;
        void main() { float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 2.2) * uK; gl_FragColor = vec4(uColor * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }

  let tubes = [], glows = [], tubeMats = [], rungMesh, hbMesh, beadMesh, hitMesh, hbIndex = [], rungMat, hbMat;
  function buildHelix() {
    SEGS = Math.round((T1 - T0) * (three.mobile ? 5 : 7));
    for (let s = 0; s < 2; s++) {
      const g = tubeGeo(); fillTube(g, s);
      const c = new THREE.Color(STRAND_COL[s]);
      const m = cine(new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.45), roughness: 0.28, metalness: 0.25 }), s ? '#e4ccff' : '#c9f1ff', 1.3);
      const mesh = new THREE.Mesh(g, m);
      const gm = new THREE.Mesh(g, glowMat(STRAND_COL[s], 0.95));
      gm.renderOrder = 2;
      spin.add(mesh, gm); tubes.push(mesh); glows.push(gm); tubeMats.push(m);
    }
    // base rungs: two flattened cylinders per pair
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1);
    rungMat = cine(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }), '#ffffff', 0.8, 0.22);
    rungMesh = new THREE.InstancedMesh(cyl, rungMat, N * 2);
    rungMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N; i++) {
      rungMesh.setColorAt(2 * i, _col.set(BASE_COL[SEQ[i]]));
      rungMesh.setColorAt(2 * i + 1, _col.set(BASE_COL[COMP[SEQ[i]]]));
    }
    // hydrogen bonds: faint thin links in the gap
    let hbCount = 0; for (let i = 0; i < N; i++) { hbIndex.push(hbCount); hbCount += nBonds(SEQ[i]); }
    hbMat = new THREE.MeshBasicMaterial({ color: '#e6f7ff', transparent: true, opacity: 0.6, depthWrite: false });
    hbMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1), hbMat, hbCount);
    hbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // backbone beads, one per nucleotide, plus 4 end caps
    const beadMat = cine(new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.3 }), '#dff4ff', 0.45, 0.12);
    beadMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), beadMat, N * 2 + 4);
    beadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N * 2 + 4; i++) beadMesh.setColorAt(i, _col.set(STRAND_COL[i < N * 2 ? i % 2 : i % 2]));
    // invisible pick targets, one box per pair
    hitMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), N);
    hitMesh.visible = false;
    spin.add(rungMesh, hbMesh, beadMesh, hitMesh);
    tubeMats.push(rungMat, beadMat);
    updatePairs();
  }

  function setBasis(m, dir, len, thick, wide, pos) {
    // local Y along dir, local X along the helix axis (thin), local Z across (wide)
    _a.copy(UP).multiplyScalar(thick);
    _b.copy(dir).multiplyScalar(len);
    _d.crossVectors(UP, dir).normalize().multiplyScalar(wide);
    m.makeBasis(_a, _b, _d); m.setPosition(pos);
    return m;
  }

  const ACROSS = new THREE.Vector3(), PA = new THREE.Vector3(), PB = new THREE.Vector3(), DIR = new THREE.Vector3(), POS = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function updatePairs() {
    const hide = mode === 'closeup' && atomGroup && atomGroup.visible ? atomPair : -1;
    for (let i = 0; i < N; i++) {
      strandPoint(0, i, PA); strandPoint(1, i, PB);
      DIR.subVectors(PB, PA); const L = DIR.length(); DIR.divideScalar(L);
      const sel = i === selected;
      const w = sel ? 0.36 : 0.3, th = sel ? 0.1 : 0.08;
      if (i === hide) { rungMesh.setMatrixAt(2 * i, ZERO); rungMesh.setMatrixAt(2 * i + 1, ZERO); }
      else {
        POS.copy(PA).addScaledVector(DIR, ROOT + HALF / 2);
        rungMesh.setMatrixAt(2 * i, setBasis(_m, DIR, HALF, th, w, POS));
        POS.copy(PB).addScaledVector(DIR, -(ROOT + HALF / 2));
        rungMesh.setMatrixAt(2 * i + 1, setBasis(_m, DIR, HALF, th, w, POS));
      }
      // hydrogen bonds between the inner ends
      const fA = PA.clone().addScaledVector(DIR, ROOT + HALF), fB = PB.clone().addScaledVector(DIR, -(ROOT + HALF));
      const gl = fA.distanceTo(fB), vis = 1 - sepFrac(i);
      const mid = fA.add(fB).multiplyScalar(0.5);
      const offs = HB_OFF[nBonds(SEQ[i])];
      ACROSS.crossVectors(UP, DIR).normalize();
      for (let k = 0; k < offs.length; k++) {
        if (vis < 0.05 || i === hide) { hbMesh.setMatrixAt(hbIndex[i] + k, ZERO); continue; }
        POS.copy(mid).addScaledVector(ACROSS, offs[k]);
        const r = (sel ? 0.026 : 0.018) * vis;
        hbMesh.setMatrixAt(hbIndex[i] + k, setBasis(_m, DIR, gl, r, r, POS));
      }
      // beads
      for (let s = 0; s < 2; s++) {
        const p = s ? PB : PA;
        _m.makeScale(0.15, 0.15, 0.15).setPosition(p);
        beadMesh.setMatrixAt(2 * i + s, _m);
      }
      // pick box
      POS.addVectors(PA, PB).multiplyScalar(0.5);
      hitMesh.setMatrixAt(i, setBasis(_m, DIR, L, 0.3, 0.55, POS));
      // colour: brighten the selected pair
      const cA = _col.set(BASE_COL[SEQ[i]]); if (sel) cA.lerp(new THREE.Color('#ffffff'), 0.35); rungMesh.setColorAt(2 * i, cA);
      const cB = _col.set(BASE_COL[COMP[SEQ[i]]]); if (sel) cB.lerp(new THREE.Color('#ffffff'), 0.35); rungMesh.setColorAt(2 * i + 1, cB);
    }
    const ends = [[0, T0], [1, T0], [0, T1], [1, T1]];
    ends.forEach(([s, tp], k) => { strandPoint(s, tp, _c); _m.makeScale(TUBE, TUBE, TUBE).setPosition(_c); beadMesh.setMatrixAt(N * 2 + k, _m); });
    for (const m of [rungMesh, hbMesh, beadMesh, hitMesh]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
    rungMesh.instanceColor.needsUpdate = true;
    dirty = true;
  }

  // ---------- bokeh (fake depth of field) ----------
  let bokeh;
  function buildBokeh() {
    const n = three.mobile ? 150 : 240;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n), col = new Float32Array(n * 3);
    const pal = ['#5fc8ff', '#b48cff', '#ffd27a', '#9ff0ff', '#ffffff', '#ff9ad5'].map((c) => new THREE.Color(c));
    let r = 7; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let i = 0; i < n; i++) {
      pos[3 * i] = (rnd() - 0.5) * 40; pos[3 * i + 1] = (rnd() - 0.5) * 26; pos[3 * i + 2] = (rnd() - 0.5) * 40;
      size[i] = 0.04 + rnd() * rnd() * 0.22; seed[i] = rnd();
      const c = pal[Math.floor(rnd() * pal.length)].clone().multiplyScalar(0.55 + rnd() * 0.45);
      col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFocus: { value: 20 }, uScale: { value: 400 }, uPR: { value: 1 } },
      vertexShader: `attribute float aSize; attribute float aSeed; attribute vec3 aColor;
        uniform float uTime; uniform float uFocus; uniform float uScale; uniform float uPR;
        varying float vA; varying vec3 vC; varying float vCoc;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.11 + aSeed * 6.28), cos(uTime * 0.083 + aSeed * 11.0), sin(uTime * 0.067 + aSeed * 17.0)) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = max(-mv.z, 0.3);
          float coc = clamp(abs(d - uFocus) / d * 1.6, 0.0, 2.5);
          float px = (aSize + coc * 0.55) * uScale / d;
          gl_PointSize = clamp(px, 1.5, 180.0) * uPR;
          vA = 1.1 / (1.0 + coc * coc * 2.0) * smoothstep(0.3, 2.0, -mv.z);
          vC = aColor; vCoc = coc;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; varying vec3 vC; varying float vCoc;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
          float b = clamp(vCoc, 0.0, 1.0);
          float disc = 1.0 - smoothstep(mix(0.2, 0.86, b), 1.0, r);
          float ring = smoothstep(0.6, 0.94, r) * disc;
          float body = mix(exp(-r * r * 5.0), 0.5 + 0.6 * ring, b);
          float a = disc * body * vA;
          gl_FragColor = vec4(vC * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    bokeh = new THREE.Points(g, m);
    bokeh.frustumCulled = false;
    bokeh.renderOrder = 3;
    scene.add(bokeh);
  }

  // ---------- screen tags: 5' and 3' ends, selected pair pill ----------
  let endTags = [], pill;
  function buildTags() {
    const defs = [[0, T0, 'end5'], [0, T1, 'end3'], [1, T0, 'end3'], [1, T1, 'end5']];
    for (const [s, tp, k] of defs) {
      const d = el('span', { class: 'dna-end', text: t(k) });
      d.style.setProperty('--c', STRAND_COL[s]);
      refs.tags.appendChild(d);
      endTags.push({ s, tp: tp + (tp < 0 ? -0.9 : 0.9), d });
    }
    pill = el('span', { class: 'dna-pill', hidden: '' });
    refs.tags.appendChild(pill);
  }
  const _p = new THREE.Vector3();
  function placeTag(node, local, dy = 0) {
    _p.copy(local); spin.localToWorld(_p); _p.project(camera);
    const w = root.clientWidth, h = root.clientHeight;
    const x = (_p.x * 0.5 + 0.5) * w, y = (-_p.y * 0.5 + 0.5) * h + dy;
    const ok = _p.z < 1 && x > -40 && x < w + 40 && y > -20 && y < h + 20;
    node.style.visibility = ok ? 'visible' : 'hidden';
    if (ok) node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  function updateTags() {
    const showEnds = mode === 'orbit';
    for (const e of endTags) {
      e.d.hidden = !showEnds;
      if (showEnds) { strandPoint(e.s, e.tp, _c); _c.multiplyScalar(1).setX(_c.x * 1.35).setZ(_c.z * 1.35); placeTag(e.d, _c); }
    }
    if (selected >= 0 && mode !== 'closeup') {
      pill.hidden = false;
      pill.textContent = SEQ[selected] + '-' + COMP[SEQ[selected]];
      strandPoint(0, selected, PA); strandPoint(1, selected, PB);
      _c.addVectors(PA, PB).multiplyScalar(0.5);
      placeTag(pill, _c, -30);
    } else pill.hidden = true;
  }

  // ---------- real atoms close-up ----------
  async function loadAtoms() {
    if (atomsCache) return atomsCache;
    const txt = await fetch(new URL('../molecules/data/1BNA.cif', HERE)).then((r) => { if (!r.ok) throw new Error('cif'); return r.text(); });
    const atoms = [];
    for (const line of txt.split('\n')) {
      if (!line.startsWith('ATOM')) continue;
      const f = line.trim().split(/\s+/);
      if (f[4] !== '.' && f[4] !== 'A') continue;
      atoms.push({ el: f[2], name: f[3].replace(/"/g, ''), comp: f[5].replace(/^D/, ''), p: new THREE.Vector3(+f[10], +f[11], +f[12]), seq: +f[16], chain: f[18] });
    }
    atomsCache = atoms;
    return atoms;
  }

  function buildAtomGroup(i, atoms) {
    const L = SEQ[i], nA = REAL[L], nB = 25 - nA;
    const resA = atoms.filter((a) => a.chain === 'A' && a.seq === nA);
    const resB = atoms.filter((a) => a.chain === 'B' && a.seq === nB);
    const get = (res, nm) => (res.find((a) => a.name === nm) || {}).p;
    const c1A = get(resA, "C1'"), c1B = get(resB, "C1'");
    const nextA = get(atoms.filter((a) => a.chain === 'A' && a.seq === nA + 1), "C1'");
    const n1 = get(resA, 'N1'), n3 = get(resA, 'N3'), c5 = get(resA, 'C5');
    // frame of the real pair: X across the pair, Y along strand 1 (5' to 3'), Z = X x Y
    const Yr = new THREE.Vector3().crossVectors(n3.clone().sub(n1), c5.clone().sub(n1)).normalize();
    if (Yr.dot(nextA.clone().sub(c1A)) < 0) Yr.negate();
    const Xr = c1B.clone().sub(c1A); Xr.addScaledVector(Yr, -Xr.dot(Yr)).normalize();
    const Zr = new THREE.Vector3().crossVectors(Xr, Yr);
    // frame of the model pair
    uz = 0; uzTarget = 0;
    strandPoint(0, i, PA); strandPoint(1, i, PB);
    const Xt = PB.clone().sub(PA).normalize(), Yt = UP.clone(), Zt = new THREE.Vector3().crossVectors(Xt, Yt);
    const rot = new THREE.Matrix4().makeBasis(Xt, Yt, Zt).multiply(new THREE.Matrix4().makeBasis(Xr, Yr, Zr).transpose());
    const midR = c1A.clone().add(c1B).multiplyScalar(0.5), midT = PA.clone().add(PB).multiplyScalar(0.5);
    const M = new THREE.Matrix4().makeTranslation(midT.x, midT.y, midT.z).multiply(rot)
      .multiply(new THREE.Matrix4().makeScale(0.1, 0.1, 0.1)).multiply(new THREE.Matrix4().makeTranslation(-midR.x, -midR.y, -midR.z));

    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(M);
    const all = resA.concat(resB);
    const sph = new THREE.SphereGeometry(1, 20, 14);
    const aMat = cine(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }), '#ffffff', 0.6, 0.12);
    const am = new THREE.InstancedMesh(sph, aMat, all.length);
    all.forEach((a, k) => { _m.makeScale(EL_R[a.el] || 0.55, EL_R[a.el] || 0.55, EL_R[a.el] || 0.55).setPosition(a.p); am.setMatrixAt(k, _m); am.setColorAt(k, _col.set(EL_COL[a.el] || '#cccccc')); });
    // covalent bonds by distance inside each residue, drawn as two half sticks coloured by atom
    const bonds = [];
    for (const res of [resA, resB]) for (let x = 0; x < res.length; x++) for (let y = x + 1; y < res.length; y++) {
      const d = res[x].p.distanceTo(res[y].p); if (d > 0.4 && d < 1.9) bonds.push([res[x], res[y]]);
    }
    const bMat = cine(new THREE.MeshStandardMaterial({ roughness: 0.4 }), '#ffffff', 0.4, 0.08);
    const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 10, 1), bMat, bonds.length * 2);
    let k = 0;
    for (const [p, q] of bonds) {
      const m = p.p.clone().add(q.p).multiplyScalar(0.5);
      for (const [from, atom] of [[p.p, p], [q.p, q]]) {
        const v = m.clone().sub(from); const len = v.length(); v.normalize();
        _q.setFromUnitVectors(UP, v);
        _m.compose(from.clone().addScaledVector(v, len / 2), _q, _s.set(1, len, 1));
        bm.setMatrixAt(k, _m); bm.setColorAt(k++, _col.set(EL_COL[atom.el] || '#cccccc'));
      }
    }
    // hydrogen bonds measured between base N and O atoms of the two residues
    const isBase = (a) => !a.name.includes("'") && !a.name.startsWith('OP') && a.name !== 'P';
    const hb = [];
    // the Watson-Crick donor and acceptor atom pairs; distances are as measured in the crystal
    const WC = { AT: [['N6', 'O4'], ['N1', 'N3']], GC: [['O6', 'N4'], ['N1', 'N3'], ['N2', 'O2']] };
    const ca = resA[0].comp, cb = resB[0].comp;
    const purA = ca === 'A' || ca === 'G';
    const list = WC[(purA ? ca + cb : cb + ca)] || [];
    for (const [pu, py] of list) {
      const a = (purA ? resA : resB).find((x) => x.name === pu), b = (purA ? resB : resA).find((x) => x.name === py);
      if (!a || !b || !isBase(a) || !isBase(b)) continue;
      const d = a.p.distanceTo(b.p); if (d <= 3.4) hb.push([a, b, d]);
    }
    const dots = [];
    for (const [a, b] of hb) { const d = a.p.distanceTo(b.p); const n = Math.max(3, Math.round(d / 0.4)); for (let j = 1; j < n; j++) dots.push(a.p.clone().lerp(b.p, j / n)); }
    const dm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe066' }), Math.max(1, dots.length));
    dots.forEach((p, j) => { _m.makeTranslation(p.x, p.y, p.z); dm.setMatrixAt(j, _m); });
    dm.count = dots.length;
    g.add(am, bm, dm);
    g.userData.dispose = () => { for (const o of [am, bm, dm]) { o.geometry.dispose(); o.material.dispose(); } };
    atomInfo = { a: resA[0].comp, an: nA, b: resB[0].comp, bn: nB, n: hb.length, d: hb.map((h) => h[2].toFixed(1)).join(', ') };
    return g;
  }

  async function showAtoms(i) {
    atomPair = i;
    if (atomGroup) { spin.remove(atomGroup); atomGroup.userData.dispose(); atomGroup = null; }
    refs.info.innerHTML = `<p class="dna-muted">${esc(t('closeLoading'))}</p>`;
    let atoms;
    try { atoms = await loadAtoms(); } catch (e) { refs.info.innerHTML = `<p>${esc(t('closeFail'))}</p>`; return; }
    if (destroyed || mode !== 'closeup' || atomPair !== i) return;
    atomGroup = buildAtomGroup(i, atoms);
    spin.add(atomGroup);
    refillTubes();
    updatePairs();
    showInfo();
  }

  // ---------- info card ----------
  const baseName = (L) => t('base' + L);
  function showInfo() {
    const info = refs.info;
    if (mode === 'closeup' && atomInfo && atomGroup) {
      const ai = atomInfo;
      const swatch = (e) => `<span class="dna-li"><span class="dna-sw dna-round" style="background:${EL_COL[e]}"></span>${esc(t('el' + e))}</span>`;
      info.innerHTML = `<p class="dna-k">${esc(t('closeTag'))}</p>` +
        `<h3><span class="dna-letters">${ai.a}-${ai.b}</span></h3>` +
        `<p>${esc(t('closePair', { a: baseName(ai.a), an: ai.an, b: baseName(ai.b), bn: ai.bn }))}</p>` +
        `<p class="dna-muted">${esc(t('closeBonds', { n: ai.n, d: ai.d }))}</p>` +
        `<div class="dna-row dna-small">${['C', 'N', 'O', 'P'].map(swatch).join('')}<span class="dna-li"><span class="dna-sw dna-round" style="background:#ffe066"></span>${esc(t('hbond'))}</span></div>`;
      return;
    }
    if (selected < 0) { info.innerHTML = `<p class="dna-muted">${esc(t('tapHint'))}</p>`; return; }
    const a = SEQ[selected], b = COMP[a];
    const rule = (a === 'A' || a === 'T') ? t('ruleAT') : t('ruleGC');
    info.innerHTML = `<p class="dna-k">${esc(t('pairOf', { n: selected + 1, total: N }))}</p>` +
      `<h3><span class="dna-letters">${a}-${b}</span> ${esc(t('pairTitle', { a: baseName(a), b: baseName(b) }))}</h3>` +
      `<p>${esc(rule)}</p><p class="dna-muted">${esc(t('strandRule', { a, b }))}</p>` +
      `<div class="dna-row"><button class="dna-btn" type="button" data-atoms>${esc(t('seeAtoms'))}</button></div>`;
    const btn = info.querySelector('[data-atoms]');
    btn.addEventListener('click', () => setMode('closeup'));
  }

  function announce(s) { refs.live.textContent = ''; setTimeout(() => { if (refs.live) refs.live.textContent = s; }, 30); }

  // ---------- modes and controls ----------
  function setMode(m, quiet) {
    if (!renderer) return;
    mode = m;
    for (const k in refs.modeBtns) refs.modeBtns[k].setAttribute('aria-pressed', String(k === m));
    yawUser = 0; pitchUser = m === 'closeup' ? 0.2 : 0.1; zoom = 1;
    refs.closeTag.hidden = m !== 'closeup';
    if (m === 'closeup') {
      if (selected < 0) selected = nearestPair();
      setUnzip(false);
      showAtoms(selected);
    } else {
      if (atomGroup) atomGroup.visible = false;
      atomPair = -1;
      if (atomGroup) { spin.remove(atomGroup); atomGroup.userData.dispose(); atomGroup = null; }
      if (m === 'fly') flyX = -(N * RISE) / 2 + 2;
    }
    updatePairs();
    showInfo();
    if (!quiet) announce(t(m));
    dirty = true;
  }

  function nearestPair() {
    // the pair closest to the camera's look target, usually near the middle of the screen
    let best = Math.round(MID), bd = Infinity;
    for (let i = 0; i < N; i += 1) {
      strandPoint(0, i, PA); spin.localToWorld(PA);
      const d = PA.distanceTo(camTarget); if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function select(i, fromKey) {
    if (!renderer) return;
    selected = i < 0 ? -1 : (i + N) % N;
    if (mode === 'closeup') { showAtoms(selected); }
    updatePairs(); showInfo();
    if (selected >= 0 && fromKey) announce(t('pairOf', { n: selected + 1, total: N }) + ': ' + SEQ[selected] + '-' + COMP[SEQ[selected]]);
  }

  function setUnzip(v) {
    uzTarget = v ? UZ_MAX : 0;
    if (!motionOn) uz = uzTarget;
    refs.uzBtn.setAttribute('aria-pressed', String(!!v));
    refs.uzBtn.textContent = v ? t('rezip') : t('unzip');
    updatePairs(); refillTubes();
  }
  function toggleUnzip() {
    if (uzTarget === 0 && mode === 'closeup') setMode('orbit');
    setUnzip(uzTarget === 0);
    if (uzTarget > 0) announce(t('unzipNote'));
  }
  function refillTubes() { if (tubes.length) { fillTube(tubes[0].geometry, 0); fillTube(tubes[1].geometry, 1); } dirty = true; }

  function setMotion(v) {
    motionOn = v;
    refs.motionBtn.setAttribute('aria-pressed', String(!v));
    refs.motionBtn.textContent = v ? t('pause') : t('play');
    dirty = true;
  }

  function toggleAbout(v) {
    const open = v == null ? refs.about.hidden : v;
    refs.about.hidden = !open;
    refs.aboutBtn.setAttribute('aria-expanded', String(open));
    if (open) refs.about.focus(); else refs.aboutBtn.focus();
  }

  function zoomBy(f) { zoom = clamp(zoom * f, 0.45, 2.2); dirty = true; }

  function onKey(e) {
    if (e.target.closest && e.target.closest('.dna-about')) { if (e.key === 'Escape') toggleAbout(false); return; }
    const onButton = e.target.tagName === 'BUTTON' || e.target.tagName === 'A';
    const k = e.key;
    if (!renderer) return;
    let used = true;
    if (k === '1') setMode('orbit');
    else if (k === '2') setMode('fly');
    else if (k === '3') setMode('closeup');
    else if (k === 'ArrowLeft') { yawUser += 0.12; }
    else if (k === 'ArrowRight') { yawUser -= 0.12; }
    else if (k === 'ArrowUp') { if (mode === 'fly') flyX += 0.6; else pitchUser = clamp(pitchUser + 0.08, -1.2, 1.2); }
    else if (k === 'ArrowDown') { if (mode === 'fly') flyX -= 0.6; else pitchUser = clamp(pitchUser - 0.08, -1.2, 1.2); }
    else if (k === '+' || k === '=') zoomBy(0.88);
    else if (k === '-' || k === '_') zoomBy(1.14);
    else if (k === ']') select(selected < 0 ? 0 : selected + 1, true);
    else if (k === '[') select(selected < 0 ? N - 1 : selected - 1, true);
    else if (k === 'u' || k === 'U') toggleUnzip();
    else if ((k === ' ' || k === 'p' || k === 'P') && !onButton) setMotion(!motionOn);
    else if (k === 'Escape') { if (!refs.about.hidden) toggleAbout(false); else setMode('orbit'); }
    else used = false;
    if (used) { e.preventDefault(); dirty = true; }
  }

  // pointer: drag to turn, pinch to zoom, tap to pick
  const ptrs = new Map(); let downAt = null, dragged = false, pinch0 = 0;
  function onDown(e) {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY }; dragged = false; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dragged = true; }
  }
  function onMove(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) { hover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) zoomBy(pinch0 / d); pinch0 = d; return;
    }
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) dragged = true;
    if (dragged) { yawUser -= dx * 0.008; if (mode !== 'fly') pitchUser = clamp(pitchUser + dy * 0.006, -1.2, 1.2); dirty = true; }
  }
  function onUp(e) {
    const had = ptrs.delete(e.pointerId);
    if (had && ptrs.size === 0 && !dragged && e.type === 'pointerup') pick(e.clientX, e.clientY, true);
    if (ptrs.size < 2) pinch0 = 0;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(x, y) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    spin.updateMatrixWorld(true);
    const target = uz > 0.001 ? rungMesh : hitMesh;
    const hit = ray.intersectObject(target, false)[0];
    if (!hit || hit.instanceId == null) return -1;
    return target === rungMesh ? Math.floor(hit.instanceId / 2) : hit.instanceId;
  }
  function pick(x, y) { if (mode === 'closeup') return; const i = pickAt(x, y); if (i >= 0) select(i); }
  let hoverT = 0;
  function hover(e) {
    if (e.pointerType !== 'mouse' || mode === 'closeup') return;
    const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
    refs.viewEl.classList.toggle('dna-picky', pickAt(e.clientX, e.clientY) >= 0);
  }

  function resize() {
    if (!renderer) return;
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // on narrow screens the controls cover the lower part: shift the picture up so the subject stays in view
    const off = w < 700 ? clamp((refs.bottom.offsetHeight - 70) / 2, 0, h * 0.3) : 0;
    if (off > 4) camera.setViewOffset(w, h, 0, off, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    bokeh.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    bokeh.material.uniforms.uPR.value = renderer.getPixelRatio();
    dirty = true;
  }

  // ---------- loop ----------
  function start() {
    if (running || destroyed || !renderer || document.hidden || !inViewport) return;
    running = true; lastT = 0; dirty = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const camTarget = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantTarget = new THREE.Vector3(), wantUp = new THREE.Vector3(0, 1, 0);
  const tiltWant = new THREE.Vector3();
  let fogNear = 10, fogFar = 40, snapNext = true;

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
    let animating = dirty;
    if (motionOn) { time += dt; animating = true; }
    const L = N * RISE;

    // unzip animation
    if (Math.abs(uz - uzTarget) > 1e-4) {
      const step = dt * 0.13;
      uz = uz < uzTarget ? Math.min(uzTarget, uz + step) : Math.max(uzTarget, uz - step);
      if (!motionOn) uz = uzTarget;
      updatePairs(); refillTubes(); animating = true;
    }

    // per-mode targets
    const aspect = camera.aspect;
    let fN, fF;
    if (mode === 'orbit') {
      tiltWant.set(0.18, 0, 0.62);
      if (motionOn) spin.rotation.y += dt * 0.22;
      const drift = motionOn ? 1 : 0;
      const dz = Math.sin(time * 0.13) * 3 * drift, dy = Math.sin(time * 0.09) * 0.6 * drift;
      tilt.position.lerp(_a.set(0, dy, dz), motionOn ? 1 : 1 - Math.exp(-dt * 2));
      const dist = (aspect < 0.8 ? 25 : 19) * zoom;
      const yaw = yawUser + time * 0.04, pitch = pitchUser;
      wantTarget.copy(tilt.position).multiplyScalar(0.35);
      wantPos.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist).add(wantTarget);
      wantUp.set(0, 1, 0);
      fN = dist - 4; fF = dist + 16;
    } else if (mode === 'fly') {
      tiltWant.set(0, 0, -Math.PI / 2);
      if (motionOn) { spin.rotation.y += dt * 0.25; flyX += dt * 1.1; }
      if (flyX > L / 2 - 3) flyX = -L / 2 + 1; if (flyX < -L / 2 + 1) flyX = L / 2 - 3;
      tilt.position.lerp(_a.set(0, 0, 0), 1 - Math.exp(-dt * 2));
      const off = _b.set(-0.4, 1.45, 1.35).multiplyScalar(zoom);
      const rot = new THREE.Quaternion().setFromAxisAngle(_d.set(1, 0, 0), yawUser);
      off.applyQuaternion(rot);
      wantPos.set(flyX, 0, 0).add(off);
      wantTarget.set(flyX + 4, 0, 0);
      wantUp.set(0, 1, 0).applyQuaternion(rot);
      fN = 2.5; fF = 15;
    } else {
      tiltWant.set(0.18, 0, 0.62);
      tilt.position.lerp(_a.set(0, 0, 0), 1 - Math.exp(-dt * 2));
      const i = selected < 0 ? Math.round(MID) : selected;
      strandPoint(0, i, PA); strandPoint(1, i, PB);
      const mid = _c.addVectors(PA, PB).multiplyScalar(0.5);
      const out = _d.set(mid.x, 0, mid.z); if (out.lengthSq() < 1e-6) out.set(1, 0, 0); out.normalize();
      const ang = yawUser + time * 0.12;
      out.applyAxisAngle(UP, ang);
      const zf = zoom * (aspect < 0.8 ? 1.9 : 1.15);
      const lp = new THREE.Vector3().copy(mid).addScaledVector(out, 2.0 * zf).addScaledVector(UP, (0.6 + pitchUser * 2.5) * zf);
      tilt.updateMatrixWorld(true);
      wantTarget.copy(mid); spin.localToWorld(wantTarget);
      wantPos.copy(lp); spin.localToWorld(wantPos);
      wantUp.set(0, 1, 0);
      fN = 2.2 * zf; fF = 6.5 * zf;
    }

    const k = (snapNext || (!motionOn && reduceMotion())) ? 1 : 1 - Math.exp(-dt * 2.6);
    snapNext = false;
    tilt.rotation.x += (tiltWant.x - tilt.rotation.x) * k;
    tilt.rotation.z += (tiltWant.z - tilt.rotation.z) * k;
    camera.position.lerp(wantPos, k);
    camTarget.lerp(wantTarget, k);
    camera.up.lerp(wantUp, k).normalize();
    camera.lookAt(camTarget);
    fogNear += (fN - fogNear) * k; fogFar += (fF - fogFar) * k;
    scene.fog.near = fogNear; scene.fog.far = fogFar;
    const tubeOp = mode === 'closeup' && atomGroup ? 0.2 : 1;
    hbMat.opacity = 0.6 * (mode === 'closeup' ? 0.3 : 1);
    for (const m of tubeMats) { m.opacity += (tubeOp - m.opacity) * k; const tr = m.opacity < 0.99; if (tr !== m.transparent) { m.transparent = tr; m.needsUpdate = true; } }
    for (const g of glows) g.material.uniforms.uK.value = mode === 'closeup' ? 0.3 : 0.95;
    if (camera.position.distanceTo(wantPos) > 0.01 || Math.abs(tiltWant.z - tilt.rotation.z) > 0.001) animating = true;

    const bu = bokeh.material.uniforms;
    bu.uTime.value = time;
    bu.uFocus.value = camera.position.distanceTo(camTarget);

    if (animating) {
      renderer.render(scene, camera);
      updateTags();
      dirty = false;
    }
  }

  // ---------- teardown ----------
  function destroy() {
    destroyed = true;
    stop();
    for (const d of disposers) { try { d(); } catch (_) {} }
    if (scene) scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
    if (renderer) { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); }
    root.remove();
    renderer = null; scene = null;
  }

  Object.assign(api, {
    setMode: (m) => setMode(m),
    select: (i) => select(i),
    unzip: (v) => setUnzip(v == null ? uzTarget === 0 : !!v),
    setMotion: (v) => setMotion(!!v),
    destroy: () => unmount(),
  });
  return view;
}

// ---------------------------------------------------------------------------------------------
// Static SVG helix for browsers without WebGL. Same proportions: 0.34 nm rise, 10.5 pairs per turn, 2 nm wide.
function helixSvg(label) {
  const pxnm = 64, W = 300, pairs = 24, top = 24, cx = W / 2;
  const H = top * 2 + (pairs - 1) * RISE * pxnm;
  const X = (s, tp) => cx + R * pxnm * Math.cos(tp * TWIST + (s ? PHI : 0));
  const Zd = (s, tp) => -Math.sin(tp * TWIST + (s ? PHI : 0));
  const Y = (tp) => H - top - tp * RISE * pxnm;
  let back = '', front = '', rungs = '';
  for (let s = 0; s < 2; s++) {
    let seg = '', segFront = null;
    const flush = () => { if (seg) { const p = `<path d="${seg}" fill="none" stroke="${STRAND_COL[s]}" stroke-width="${segFront ? 9 : 7}" stroke-linecap="round" opacity="${segFront ? 1 : 0.45}"/>`; if (segFront) front += p; else back += p; } seg = ''; };
    for (let k = 0; k <= (pairs - 1) * 8; k++) {
      const tp = k / 8, f = Zd(s, tp) >= 0;
      if (segFront !== null && f !== segFront) { const keep = seg; flush(); seg = keep.slice(keep.lastIndexOf('L') >= 0 ? keep.lastIndexOf('L') : 0).replace(/^L/, 'M'); }
      segFront = f;
      seg += (seg ? 'L' : 'M') + X(s, tp).toFixed(1) + ' ' + Y(tp).toFixed(1);
    }
    flush();
  }
  for (let i = 0; i < pairs; i++) {
    const a = SEQ[i], b = COMP[a], x1 = X(0, i), x2 = X(1, i), y = Y(i), m = (x1 + x2) / 2;
    rungs += `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(m - 2).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${BASE_COL[a]}" stroke-width="5"/>` +
      `<line x1="${(m + 2).toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${BASE_COL[b]}" stroke-width="5"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${W}" height="${H.toFixed(0)}" rx="16" fill="#060d1b"/>${back}${rungs}${front}</svg>`;
}
