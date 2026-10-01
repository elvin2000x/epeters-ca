// ATP synthase cinematic: an illustrative ATP synthase in the inner mitochondrial membrane, drawn with three.js, plus a
// close-up of the real F1 head atoms from PDB 1MAB (rat liver). ES module: mount(containerEl, options) / unmount().
// Counts from Watt et al. 2010 (sources.json): a ring of 8 c-subunits, one proton per c-subunit per turn, 3 ATP per turn.
// The head is drawn at the width measured from 1MAB (f1-atoms.json, built by tools/hero_atp_build.py). Everything else
// in the machine view is a drawing, and the motion is slowed down. Words in atp.json. No external requests.
//
// options: { theme: 'light'|'dark' (default follows the page), realHref (default ../molecules/#atp-synthase),
//            embedded (true: vertical page scroll passes through the canvas, no wheel zoom),
//            startMode: 'machine'|'closeup', autoplay (default true unless reduced motion), noGL }
// API (resolved by mount): setMode(m), play(bool), labels(bool), destroy()

import * as THREE from '../vendor/three/0.170.0/build/three.module.js';

const HERE = new URL('./', import.meta.url);
const NC = 8;                       // c-subunits in the ring (bovine, Watt 2010)
const ATP_PER_TURN = 3;             // Watt 2010
const TURN_S = 6;                   // seconds per turn on screen (real: about 1/100 s)
const COL = { alpha: '#e0668a', beta: '#d9a23a', gamma: '#4d8fe8', ring: '#2fc6b4', door: '#e5534b', side: '#9a8fb8',
  proton: '#fff27a', aden: '#6aa8ff', phos: '#ffa53a', lipid: '#8fa3c0',
  C: '#a3adb8', N: '#4f7dff', O: '#ff4d4d', P: '#ff9d2e', MG: '#7cdc5a' };
const R_RING = 2.5, MEM = 2.0, HEAD_Y = 11.5;
const DELTA = 0.5;                  // radians before the door where a proton leaves the ring

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const fmt = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

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
.at-root { --at-ink: #e8f1f7; --at-muted: #a9bccb; --at-glass: rgba(7, 15, 27, 0.76); --at-line: rgba(150, 185, 215, 0.3);
  --at-accent: #5cd3ff; --at-on-accent: #03141f; --at-raised: rgba(14, 26, 44, 0.94); --at-tag: rgba(4, 10, 20, 0.78); --at-tag-ink: #eaf6ff;
  position: relative; width: 100%; height: 100%; min-height: 360px; overflow: hidden; color: var(--at-ink);
  font-family: var(--font-ui, "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif); font-size: 15px; line-height: 1.45;
  background: radial-gradient(120% 90% at 50% 40%, #0f2a33 0%, #071019 55%, #010306 100%); -webkit-font-smoothing: antialiased; }
.at-root.at-light { --at-ink: #0f1c28; --at-muted: #46596a; --at-glass: rgba(250, 252, 254, 0.88); --at-line: rgba(30, 55, 80, 0.24);
  --at-accent: #0a6f9e; --at-on-accent: #ffffff; --at-raised: rgba(255, 255, 255, 0.97); --at-tag: rgba(255, 255, 255, 0.9); --at-tag-ink: #10202e;
  background: radial-gradient(120% 90% at 50% 40%, #ffffff 0%, #edf3f5 55%, #d6e2e6 100%); }
.at-root *, .at-root *::before, .at-root *::after { box-sizing: border-box; }
.at-root [hidden] { display: none !important; }
.at-root button { font: inherit; color: inherit; cursor: pointer; }
.at-root a { color: var(--at-accent); }
.at-root :focus-visible { outline: 3px solid var(--at-accent); outline-offset: 2px; }
.at-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.at-view { position: absolute; inset: 0; outline: none; }
.at-view:focus-visible { outline: 3px solid var(--at-accent); outline-offset: -3px; }
.at-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
.at-root.at-embedded .at-view canvas { touch-action: pan-y; }
.at-vig { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(130% 100% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.5) 100%); }
.at-root.at-light .at-vig { background: radial-gradient(130% 100% at 50% 45%, transparent 60%, rgba(40, 60, 90, 0.14) 100%); }
.at-tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.at-tag { position: absolute; left: 0; top: 0; font-size: 12.5px; font-weight: 600; padding: 2px 9px; border-radius: 8px; color: var(--at-tag-ink); background: var(--at-tag);
  border-left: 3px solid var(--c, #fff); will-change: transform; white-space: nowrap; }
.at-tag.at-zone { border-left: 0; background: transparent; color: var(--at-muted); font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 700; }
.at-tag.at-pop { background: ${'#ffa53a'}; color: #241200; border-left: 0; border-radius: 999px; font-weight: 700; }
.at-top { position: absolute; left: 12px; right: 12px; top: calc(10px + env(safe-area-inset-top, 0px)); display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; pointer-events: none; }
.at-top > * { pointer-events: auto; }
.at-titlebox { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; }
.at-title { margin: 0; font-size: 17px; font-weight: 600; padding: 3px 10px; border-radius: 8px; background: var(--at-glass); border: 1px solid var(--at-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.at-badge { font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 10px; max-width: min(440px, 62vw); background: #ffd166; color: #2a1d00; border: 1px solid #e0a800; }
.at-count { font-size: 13.5px; font-weight: 600; padding: 4px 10px; border-radius: 10px; background: var(--at-glass); border: 1px solid var(--at-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font-variant-numeric: tabular-nums; display: flex; flex-wrap: wrap; gap: 2px 12px; }
.at-count small { width: 100%; font-weight: 500; color: var(--at-muted); font-size: 12px; }
.at-btn { min-height: 44px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--at-line); background: var(--at-glass); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; color: var(--at-ink); white-space: nowrap; }
.at-root a.at-btn { color: var(--at-ink); }
.at-btn:hover { border-color: var(--at-accent); }
.at-btn[aria-pressed="true"], .at-btn.at-primary { background: var(--at-accent); border-color: var(--at-accent); color: var(--at-on-accent); }
.at-root a.at-btn.at-primary { color: var(--at-on-accent); }
.at-btn.at-primary::after { content: "\\2192"; }
.at-closetag { position: absolute; left: 50%; top: calc(132px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); pointer-events: none; font-size: 13px; font-weight: 600;
  padding: 4px 12px; border-radius: 999px; background: #f4fbff; color: #06121d; white-space: nowrap; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
.at-bottom { position: absolute; left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; pointer-events: none; }
.at-bottom > * { pointer-events: auto; }
.at-info { width: min(440px, 100%); background: var(--at-glass); border: 1px solid var(--at-line); border-radius: 14px; padding: 10px 14px; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  max-height: 30vh; overflow-y: auto; }
.at-info p { margin: 0 0 4px; }
.at-info h3 { margin: 0 0 4px; font-size: 17px; line-height: 1.25; }
.at-muted { color: var(--at-muted); font-size: 14px; }
.at-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.at-seg { display: inline-flex; border-radius: 999px; border: 1px solid var(--at-line); background: var(--at-glass); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); padding: 2px; }
.at-seg .at-btn { border: 0; background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none; min-height: 40px; padding: 6px 12px; }
.at-seg .at-btn[aria-pressed="true"] { background: var(--at-accent); color: var(--at-on-accent); }
.at-legend { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 5px 12px; border-radius: 12px; background: var(--at-glass); border: 1px solid var(--at-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font-size: 13px; }
.at-li { display: inline-flex; align-items: center; gap: 6px; }
.at-sw { display: inline-block; width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0, 0, 0, 0.35); }
.at-sw.at-round { border-radius: 50%; }
.at-about { position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 100%); background: var(--at-raised); border-left: 1px solid var(--at-line); overflow-y: auto;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 18px calc(20px + env(safe-area-inset-bottom, 0px)); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); z-index: 5; }
.at-about h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--at-muted); margin: 16px 0 6px; }
.at-about p, .at-about li { font-size: 14.5px; }
.at-about ul { padding-left: 18px; margin: 0; }
.at-about ul li { margin-bottom: 4px; }
.at-about ol { padding-left: 22px; margin: 0; }
.at-about ol li { margin-bottom: 6px; font-size: 13px; color: var(--at-muted); }
.at-about ol a { overflow-wrap: anywhere; }
.at-about sup a { text-decoration: none; font-family: var(--font-data, ui-monospace, monospace); font-size: 11px; }
.at-abouthead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.at-abouthead h2 { margin: 0; }
.at-nogl { position: absolute; inset: 0; overflow-y: auto; padding: 120px 16px 24px; display: flex; flex-wrap: wrap; gap: 18px; align-content: flex-start; justify-content: center; }
.at-nogl svg { flex: none; width: min(360px, 90vw); height: auto; }
.at-nogl .at-nogltext { max-width: 56ch; background: var(--at-glass); border: 1px solid var(--at-line); border-radius: 14px; padding: 12px 16px; }
@media (max-width: 560px) {
  .at-title { font-size: 15px; }
  .at-badge { font-size: 11.5px; max-width: 64vw; }
  .at-btn { padding: 8px 11px; font-size: 13.5px; }
  .at-seg .at-btn { padding: 6px 9px; }
  .at-info { max-height: 22vh; padding: 8px 12px; }
  .at-info h3 { font-size: 15.5px; }
  .at-info p { font-size: 14px; }
  .at-legend { font-size: 12px; padding: 4px 10px; }
  .at-tag { font-size: 11px; padding: 1px 7px; }
  .at-count { font-size: 12.5px; }
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

function cine(mat, rimColor, rimK) {
  const uRim = { value: new THREE.Color(rimColor) }, uK = { value: rimK };
  mat.userData.rim = uK;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = uRim; sh.uniforms.uRimK = uK;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimK;')
      .replace('#include <dithering_fragment>',
        'float rimF = pow(1.0 - saturate(dot(normal, geometryViewDir)), 2.6);\n' +
        'gl_FragColor.rgb += uRim * rimF * uRimK;\n#include <dithering_fragment>');
  };
  return mat;
}

// ---------------------------------------------------------------------------------------------
function createView(container, opts) {
  const disposers = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); disposers.push(() => t.removeEventListener(ev, fn, o)); };
  let ui = {}, facts = [], caps = {}, sources = {};
  let destroyed = false;

  let style = document.getElementById('at-style');
  if (!style) { style = el('style', { id: 'at-style' }); style.textContent = CSS; document.head.appendChild(style); }
  const root = el('div', { class: 'at-root' + (opts.embedded ? ' at-embedded' : '') });
  container.appendChild(root);

  // ---------- state ----------
  let light = false;
  let mode = opts.startMode === 'closeup' ? 'closeup' : 'machine';
  let playing = false, labelsOn = true, peekOn = false;
  let theta = 0, time = 0, autoYaw = 0;
  let yawUser = 0, pitchUser = 0, zoom = 1;
  let running = false, raf = 0, lastT = 0, dirty = true, inViewport = true;
  let renderer = null, scene = null, camera = null, camLight = null, mobile = false;
  let machine = null, atomsGroup = null, atomsLoading = null;
  let nProtons = 0, nAtp = 0;
  const refs = {};
  const srcOrder = [];

  const applyTheme = () => {
    let t = opts.theme;
    if (t !== 'light' && t !== 'dark') {
      const h = document.documentElement.dataset.theme;
      t = (h === 'light' || h === 'dark') ? h : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    light = t === 'light';
    root.classList.toggle('at-light', light);
    if (scene) { scene.fog.color.set(light ? 0xe4ecef : 0x071019); dirty = true; }
  };
  applyTheme();
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  on(mqDark, 'change', applyTheme);
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  disposers.push(() => themeObs.disconnect());

  const api = {};
  const view = { root, api, destroy, ready: null };

  function t(k, o) { return fmt(ui[k] != null ? ui[k] : k, o || {}); }
  function srcNum(key) { let i = srcOrder.indexOf(key); if (i < 0) { srcOrder.push(key); i = srcOrder.length - 1; } return i + 1; }

  view.ready = (async () => {
    try {
      const [d, s] = await Promise.all([
        fetch(new URL('atp.json', HERE)).then((r) => r.json()),
        fetch(new URL('sources.json', HERE)).then((r) => r.json()),
      ]);
      ui = d.ui || {}; facts = d.facts || []; caps = d.captions || {}; sources = (s && s.sources) || {};
    } catch (e) { ui = {}; }
    if (destroyed) return;
    build();
  })();

  function build() {
    const altId = 'at-alt-' + Math.random().toString(36).slice(2, 7);
    const keysId = altId + 'k';
    root.innerHTML = '';
    const viewEl = el('div', { class: 'at-view', tabindex: '0', role: 'group', 'aria-label': t('viewAria'), 'aria-describedby': altId + ' ' + keysId });
    const altSr = el('p', { class: 'at-sr', id: altId, text: t('alt') });
    const keysSr = el('p', { class: 'at-sr', id: keysId, text: t('keys') });
    const vig = el('div', { class: 'at-vig', 'aria-hidden': 'true' });
    const tags = el('div', { class: 'at-tags', 'aria-hidden': 'true' });

    const top = el('div', { class: 'at-top' });
    const titleBox = el('div', { class: 'at-titlebox' });
    titleBox.appendChild(el('h2', { class: 'at-title', text: t('title') }));
    titleBox.appendChild(el('span', { class: 'at-badge', text: t('badge') }));
    const count = el('div', { class: 'at-count', role: 'group', 'aria-label': t('counterLabel') });
    titleBox.appendChild(count);
    const realA = el('a', { class: 'at-btn at-primary', href: opts.realHref || '../molecules/#atp-synthase', title: t('realTitle'), text: t('real') });
    top.append(titleBox, realA);
    const closeTag = el('div', { class: 'at-closetag', hidden: '', text: t('closeTag') });

    const bottom = el('div', { class: 'at-bottom' });
    const info = el('section', { class: 'at-info', 'aria-live': 'polite' });
    const legend = el('div', { class: 'at-legend', role: 'group', 'aria-label': t('legendLabel') });
    const bar = el('div', { class: 'at-row' });
    const seg = el('div', { class: 'at-seg', role: 'group', 'aria-label': t('modesLabel') });
    const modeBtns = {};
    for (const m of ['machine', 'closeup']) {
      const b = el('button', { class: 'at-btn', type: 'button', 'aria-pressed': 'false', text: t(m) });
      on(b, 'click', () => setMode(m));
      modeBtns[m] = b; seg.appendChild(b);
    }
    const playBtn = el('button', { class: 'at-btn', type: 'button', 'aria-pressed': 'false', text: t('play') });
    const labelsBtn = el('button', { class: 'at-btn', type: 'button', 'aria-pressed': 'true', text: t('labels') });
    const peekBtn = el('button', { class: 'at-btn', type: 'button', 'aria-pressed': 'false', title: t('peekTitle'), text: t('peek'), hidden: '' });
    const aboutBtn = el('button', { class: 'at-btn', type: 'button', 'aria-expanded': 'false', text: t('about') });
    bar.append(seg, playBtn, labelsBtn, peekBtn, aboutBtn);
    bottom.append(info, legend, bar);

    const about = el('section', { class: 'at-about', hidden: '', 'aria-label': t('about'), tabindex: '-1' });
    const sup = (list) => (list || []).map((k) => `<sup><a href="#at-src-${esc(k)}">[${srcNum(k)}]</a></sup>`).join('');
    const factsHtml = facts.map((f) => `<li>${esc(f.t)}${sup(f.s)}</li>`).join('');
    const honestSup = sup(['watt-2010', 'rcsb-1MAB', 'calc']);
    for (const k in caps) for (const s of caps[k].s || []) srcNum(s);
    const srcHtml = srcOrder.map((k) => {
      const s = sources[k] || {};
      const link = s.url ? ` <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.url)}</a>` : '';
      return `<li id="at-src-${esc(k)}">${esc(s.cite || k)}${s.doi ? ' DOI ' + esc(s.doi) + '.' : ''}${link}</li>`;
    }).join('');
    about.innerHTML =
      `<div class="at-abouthead"><h2>${esc(t('factsHeading'))}</h2><button class="at-btn" type="button" data-close>${esc(t('aboutClose'))}</button></div>` +
      `<ul>${factsHtml}</ul>` +
      `<h2>${esc(t('honestHeading'))}</h2><p>${esc(t('honest'))}${honestSup}</p>` +
      `<p class="at-muted">${esc(t('slowNote', { s: TURN_S }))}</p>` +
      `<h2>${esc(t('altHeading'))}</h2><p>${esc(t('alt'))}</p>` +
      `<h2>${esc(t('keysHeading'))}</h2><p>${esc(t('keys'))}</p>` +
      `<h2>${esc(t('sourcesHeading'))}</h2><ol>${srcHtml}</ol>`;

    const live = el('div', { class: 'at-sr', 'aria-live': 'polite' });
    root.append(viewEl, vig, tags, top, closeTag, bottom, about, altSr, keysSr, live);
    Object.assign(refs, { viewEl, tags, info, bottom, legend, bar, count, closeTag, modeBtns, playBtn, labelsBtn, peekBtn, aboutBtn, about, live });

    on(playBtn, 'click', () => setPlaying(!playing));
    on(labelsBtn, 'click', () => setLabels(!labelsOn));
    on(peekBtn, 'click', () => setPeek(!peekOn));
    on(aboutBtn, 'click', () => toggleAbout());
    on(about.querySelector('[data-close]'), 'click', () => toggleAbout(false));
    on(root, 'keydown', onKey);

    updateCount();
    const glOk = !opts.noGL && !new URLSearchParams(location.search).has('nogl') && initGL(viewEl);
    if (!glOk) { buildFallback(); return; }
    setMode(mode, true);
    const auto = opts.autoplay != null ? !!opts.autoplay : !reduceMotion();
    setPlaying(auto);
    start();
  }

  function legendHtml() {
    const sw = (c, k, round) => `<span class="at-li"><span class="at-sw${round ? ' at-round' : ''}" style="background:${c}"></span>${esc(t(k))}</span>`;
    if (mode === 'closeup') return sw(COL.alpha, 'lgAlpha') + sw(COL.beta, 'lgBeta') + sw(COL.gamma, 'lgGamma') + sw(COL.P, 'lgLigand', true);
    return sw(COL.alpha, 'lgAlpha') + sw(COL.beta, 'lgBeta') + sw(COL.gamma, 'lgGamma') + sw(COL.ring, 'lgRing') + sw(COL.proton, 'lgProton', true) + sw(COL.phos, 'lgAtp', true);
  }

  function updateCount() {
    refs.count.innerHTML = `<span>${esc(t('protons', { n: nProtons }))}</span><span>${esc(t('atps', { n: nAtp }))}</span><small>${esc(t('ratio'))}</small>`;
  }

  // ---------- fallback ----------
  function buildFallback() {
    for (const k of ['viewEl', 'info', 'legend', 'count']) refs[k].hidden = true;
    for (const k of ['playBtn', 'labelsBtn', 'peekBtn']) refs[k].hidden = true;
    refs.bar.querySelector('.at-seg').hidden = true;
    const box = el('div', { class: 'at-nogl' });
    box.innerHTML = fallbackSvg(t('noglFig'), light) +
      `<div class="at-nogltext" role="status"><p><b>${esc(t('nogl'))}</b></p><p>${esc(t('alt'))}</p>` +
      facts.slice(0, 5).map((f) => `<p class="at-muted">${esc(f.t)}</p>`).join('') + `</div>`;
    root.insertBefore(box, refs.tags);
  }

  // ---------- WebGL ----------
  function initGL(viewEl) {
    const canvas = el('canvas', { 'aria-hidden': 'true' });
    viewEl.appendChild(canvas);
    try {
      const probe = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!probe) { canvas.remove(); return false; }
      mobile = matchMedia('(pointer: coarse)').matches;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
    } catch (e) { canvas.remove(); renderer = null; return false; }

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(light ? 0xe4ecef : 0x071019, 20, 70);
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    camera.position.set(0, 8, 40);
    scene.add(new THREE.HemisphereLight(0xdff6ff, 0x1a1830, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(6, 12, 9); scene.add(key);
    const back = new THREE.DirectionalLight(0x7fe0ff, 1.4); back.position.set(-8, -3, -10); scene.add(back);
    camLight = new THREE.DirectionalLight(0xffffff, 0.7); scene.add(camLight);

    buildMachine();
    buildTags();

    const ro = new ResizeObserver(resize); ro.observe(root); ro.observe(refs.bottom); disposers.push(() => ro.disconnect());
    const io = new IntersectionObserver((ents) => { inViewport = ents[0].isIntersecting; inViewport ? start() : stop(); });
    io.observe(root); disposers.push(() => io.disconnect());
    on(document, 'visibilitychange', () => (document.hidden ? stop() : start()));
    const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
    on(mqRM, 'change', () => { if (mqRM.matches) setPlaying(false); });
    on(canvas, 'pointerdown', onDown);
    on(canvas, 'pointermove', onMove);
    on(canvas, 'pointerup', onUp);
    on(canvas, 'pointercancel', onUp);
    if (!opts.embedded) on(canvas, 'wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); stop(); });
    resize();
    return true;
  }

  // ---------- the machine (illustrative) ----------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _col = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);
  const std = (c, rough = 0.4, rim = '#ffffff', rk = 0.7) => cine(new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.08, emissive: new THREE.Color(c).multiplyScalar(0.12) }), rim, rk);

  function buildMachine() {
    const g = new THREE.Group(); scene.add(g);
    const seg = mobile ? 14 : 22;

    // membrane: two leaflets of lipid heads with a soft core, a hole for the ring and the proton door
    const spacing = mobile ? 1.05 : 0.85, RMEM = 17;
    const heads = [];
    let r = 11; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let x = -RMEM; x <= RMEM; x += spacing) for (let z = -RMEM; z <= RMEM; z += spacing) {
      const jx = x + (rnd() - 0.5) * 0.3, jz = z + (rnd() - 0.5) * 0.3;
      const d = Math.hypot(jx, jz);
      if (d > RMEM || d < R_RING + 0.75) continue;
      if (jx > 3.0 && jx < 5.6 && Math.abs(jz) < 1.9) continue;
      for (const s of [-1, 1]) heads.push([jx, s * (MEM - 0.15) + (rnd() - 0.5) * 0.15, jz]);
    }
    const headMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.36, 1), std(COL.lipid, 0.6, '#cfe8ff', 0.4), heads.length);
    heads.forEach((p, i) => { headMesh.setMatrixAt(i, _m.makeTranslation(p[0], p[1], p[2])); });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(RMEM, RMEM, 2 * MEM - 0.6, 64, 1, true), new THREE.MeshBasicMaterial({ color: '#c7a65a', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    const coreTop = new THREE.Mesh(new THREE.RingGeometry(R_RING + 0.6, RMEM, 64), new THREE.MeshBasicMaterial({ color: '#d9b866', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    coreTop.rotation.x = -Math.PI / 2;
    g.add(headMesh, core, coreTop);

    // rotor: ring of 8 c-subunits (two helices each), the foot and the central stalk
    const rotor = new THREE.Group(); g.add(rotor);
    const ringMat = std(COL.ring, 0.35, '#c9fff6', 0.8);
    const helix = new THREE.CylinderGeometry(0.42, 0.42, 2 * MEM + 0.5, seg, 1);
    const cMesh = new THREE.InstancedMesh(helix, ringMat, NC * 2);
    const sites = [];
    for (let j = 0; j < NC; j++) {
      const a = j / NC * TAU;
      for (let h = 0; h < 2; h++) {
        const rr = h ? R_RING + 0.35 : R_RING - 0.55, aa = a + (h ? 0.12 : -0.12);
        cMesh.setMatrixAt(j * 2 + h, _m.makeTranslation(Math.cos(aa) * rr, 0, -Math.sin(aa) * rr));
      }
      sites.push(new THREE.Vector3(Math.cos(a) * (R_RING + 0.85), 0, -Math.sin(a) * (R_RING + 0.85)));
    }
    const gluMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ color: '#ff6b5a' }), NC);
    sites.forEach((p, j) => gluMesh.setMatrixAt(j, _m.makeTranslation(p.x, p.y, p.z)));
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.9, seg), std(COL.gamma, 0.35, '#d6e8ff', 0.6));
    foot.position.y = MEM + 0.55;
    const stalkMat = std(COL.gamma, 0.3, '#d6e8ff', 0.8);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, HEAD_Y + 1.5 - MEM, seg), stalkMat);
    stalk.position.y = (HEAD_Y + 1.5 + MEM) / 2;
    // a bump on the stalk shows which way it is pointing: it is what squeezes each beta part in turn
    const cam = new THREE.Mesh(new THREE.SphereGeometry(1, seg, 12), stalkMat);
    cam.scale.set(1.15, 2.4, 0.8); cam.position.set(0.75, HEAD_Y - 2.2, 0);
    rotor.add(cMesh, gluMesh, foot, stalk, cam);

    // stator: the proton door (a-subunit) and the side stalk
    const doorMat = std(COL.door, 0.45, '#ffd4cf', 0.6);
    const door = new THREE.Group();
    for (const [x, z, h] of [[4.15, -0.55, 4.6], [4.25, 0.55, 4.4], [5.05, 0, 4.2]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, h, seg), doorMat); m.position.set(x, 0, z); door.add(m);
    }
    const sideCurve = new THREE.CatmullRomCurve3([[4.8, 1.8, 0], [6.2, 4.5, 0.3], [6.9, 9, 0.4], [6.8, 13.5, 0.3], [5.6, 16.6, 0], [3, 17.4, 0], [0.9, 17.2, 0]].map((p) => new THREE.Vector3(...p)));
    const side = new THREE.Mesh(new THREE.TubeGeometry(sideCurve, mobile ? 40 : 70, 0.4, mobile ? 8 : 12, false), std(COL.side, 0.5, '#efe8ff', 0.5));
    g.add(door, side);

    // F1 head: three alpha and three beta parts, alternating, drawn to the width measured from 1MAB (12.1 nm)
    const lobes = [];
    const lobeGeo = new THREE.SphereGeometry(1, mobile ? 20 : 30, mobile ? 14 : 20);
    for (let k = 0; k < 6; k++) {
      const beta = k % 2 === 1, a = k / 6 * TAU;
      const m = new THREE.Mesh(lobeGeo, std(beta ? COL.beta : COL.alpha, 0.42, beta ? '#fff0c8' : '#ffd6e2', 0.7));
      const base = new THREE.Vector3(Math.cos(a) * 3.35, HEAD_Y, -Math.sin(a) * 3.35);
      m.position.copy(base); m.scale.set(2.7, 5.3, 2.5);
      m.rotation.y = a;
      g.add(m);
      lobes.push({ m, beta, a, base, squeeze: 0 });
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, seg, 12), std(COL.alpha, 0.5, '#ffd6e2', 0.4));
    cap.position.y = HEAD_Y + 5.0; cap.scale.y = 0.5;
    g.add(cap);

    // protons: bright core plus a soft additive halo
    const NP = 24;
    const pCore = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshBasicMaterial({ color: COL.proton }), NP);
    const pHalo = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshBasicMaterial({ color: COL.proton, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }), NP);
    for (const m of [pCore, pHalo]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; }
    g.add(pCore, pHalo);

    // ATP and ADP + phosphate: beads (adenosine plus phosphates)
    const NA = 8, BEADS = 5;
    const beadMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), std('#ffffff', 0.35, '#ffffff', 0.5), NA * BEADS);
    beadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); beadMesh.frustumCulled = false;
    for (let i = 0; i < NA * BEADS; i++) { beadMesh.setColorAt(i, _col.set(i % BEADS === 0 ? COL.aden : COL.phos)); beadMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
    g.add(beadMesh);

    machine = { g, rotor, sites, lobes, pCore, pHalo, NP, protons: [], beadMesh, NA, BEADS, mols: [], loaded: new Array(NC).fill(false), lastPhase: new Array(NC).fill(0), lastCam: 0 };
    // start with the ring already carrying protons, so it looks busy from the first frame
    const w = TAU / TURN_S, leadAng = w * LEAD;
    for (let j = 0; j < NC; j++) {
      const ph = wrap(j / NC * TAU);
      machine.lastPhase[j] = ph;
      if (ph < TAU - DELTA) { machine.loaded[j] = true; machine.protons.push({ st: 'ride', j, t: 0 }); }
      if (ph >= TAU - leadAng) {
        machine.protons.push({ st: 'in', j, t: (ph - (TAU - leadAng)) / w, from: new THREE.Vector3(4.2 + (j % 3 - 1), -8, (j % 2) * 2 - 1) });
      }
    }
    updateParticles(0);
  }

  // world angle convention: rotation.y = a maps +x to (cos a, 0, -sin a); the door faces angle 0 (+x)
  const DOOR_IN = new THREE.Vector3(3.55, -0.7, 0), DOOR_OUT = new THREE.Vector3(3.6, 0.8, 0);
  const LEAD = 1.5;                  // seconds a proton takes to reach the door from below

  function stepMachine(dt) {
    const M = machine;
    const w = TAU / TURN_S;
    theta += w * dt;
    M.rotor.rotation.y = theta;
    const leadAng = w * LEAD;
    for (let j = 0; j < NC; j++) {
      const ph = wrap(theta + j / NC * TAU), prev = M.lastPhase[j];
      const crossed = (target) => (prev < target && ph >= target) || (prev > ph && (prev < target || ph >= target));
      // a proton heads for the door so it arrives as this c-subunit does
      if (crossed(TAU - leadAng)) {
        M.protons.push({ st: 'in', j, t: 0, from: new THREE.Vector3(4.2 + (Math.random() - 0.5) * 3, -7.5 - Math.random() * 2, (Math.random() - 0.5) * 4) });
      }
      // release just before the door: the proton leaves into the matrix
      if (crossed(TAU - DELTA) && M.loaded[j]) {
        M.loaded[j] = false;
        const p = M.protons.find((q) => q.st === 'ride' && q.j === j);
        if (p) { p.st = 'out'; p.t = 0; p.from = siteWorld(j, new THREE.Vector3()); p.to = new THREE.Vector3(4 + (Math.random() - 0.5) * 3, 7 + Math.random() * 2, 2 + (Math.random() - 0.5) * 4); }
      }
      // at the door: the waiting proton hops on
      if (prev > ph) {
        const p = M.protons.find((q) => q.st === 'in' && q.j === j);
        if (p) { p.st = 'ride'; M.loaded[j] = true; nProtons++; countDirty = true; }
      }
      M.lastPhase[j] = ph;
    }
    // ATP: each beta part releases one ATP as the stalk's bump passes it (3 per turn)
    for (const L of M.lobes) {
      if (!L.beta) continue;
      const ph = wrap(theta - L.a), prev = wrap(theta - w * dt - L.a);
      const inAng = w * 1.6;
      if (prev < TAU - inAng && ph >= TAU - inAng) spawnMol(L, 'in');
      if (prev > ph) { spawnMol(L, 'out'); nAtp++; countDirty = true; }
      const near = Math.cos(ph);   // 1 when the bump points at this lobe
      L.squeeze = Math.max(0, near) ** 6;
      L.m.scale.set(2.7 - 0.25 * L.squeeze, 5.3, 2.5 - 0.15 * L.squeeze);
    }
    updateParticles(dt);
  }
  let countDirty = false;

  function siteWorld(j, out) {
    out.copy(machine.sites[j]).applyAxisAngle(UP, theta);
    return out;
  }

  function spawnMol(L, kind) {
    const dir = new THREE.Vector3(Math.cos(L.a), 0, -Math.sin(L.a));
    machine.mols.push({ kind, t: 0, dir, y: HEAD_Y - 1.5 + (Math.random() - 0.5), tagged: kind === 'out' });
    if (machine.mols.length > machine.NA) machine.mols.shift();
  }

  const _p = new THREE.Vector3();
  function updateParticles(dt) {
    const M = machine;
    // protons
    let k = 0;
    const keep = [];
    for (const p of M.protons) {
      p.t += dt;
      let pos = null, s = 1;
      if (p.st === 'in') {
        const f = clamp(p.t / LEAD, 0, 1);
        pos = _p.copy(p.from).lerp(DOOR_IN, smooth(f));
        pos.y += Math.sin(f * Math.PI) * 0.8;
        s = smooth(f * 4);
      } else if (p.st === 'ride') {
        pos = siteWorld(p.j, _p);
      } else {
        const f = clamp(p.t / 1.8, 0, 1);
        if (f >= 1) continue;
        pos = f < 0.3 ? _p.copy(p.from).lerp(DOOR_OUT, smooth(f / 0.3)) : _p.copy(DOOR_OUT).lerp(p.to, smooth((f - 0.3) / 0.7));
        s = 1 - smooth((f - 0.7) / 0.3);
      }
      keep.push(p);
      if (k < M.NP) {
        M.pCore.setMatrixAt(k, _m.makeScale(s, s, s).setPosition(pos));
        const hs = s * (0.85 + 0.15 * Math.sin(time * 6 + k));
        M.pHalo.setMatrixAt(k, _m.makeScale(hs, hs, hs).setPosition(pos));
        k++;
      }
    }
    M.protons = keep;
    M.pCore.count = k; M.pHalo.count = k;
    M.pCore.instanceMatrix.needsUpdate = true; M.pHalo.instanceMatrix.needsUpdate = true;

    // ATP out, ADP + phosphate in
    const B = M.BEADS;
    for (let i = 0; i < M.NA * B; i++) M.beadMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    popTag = null;
    M.mols = M.mols.filter((m) => m.t < (m.kind === 'out' ? 3.2 : 1.6));
    M.mols.forEach((m, i) => {
      m.t += dt;
      const side = new THREE.Vector3(-m.dir.z, 0, m.dir.x);
      let r0, s;
      if (m.kind === 'in') {
        const f = clamp(m.t / 1.6, 0, 1);
        r0 = 10 - 3.6 * smooth(f); s = 1 - smooth((f - 0.75) / 0.25);
      } else {
        const f = clamp(m.t / 3.2, 0, 1);
        r0 = 6.4 + 4 * smooth(f); s = Math.min(1, f * 6) * (1 + 0.25 * Math.sin(Math.min(1, f * 6) * Math.PI)) * (1 - smooth((f - 0.75) / 0.25));
      }
      const c = _a.copy(m.dir).multiplyScalar(r0); c.y = m.y + (m.kind === 'out' ? m.t * 0.5 : 0);
      for (let b = 0; b < B; b++) {
        let off;
        if (b === 0) off = 0;
        else if (m.kind === 'in' && b === 4) off = 2.0;          // the loose phosphate, a little apart
        else off = 0.5 + (b - 1) * 0.42;
        if (m.kind === 'in' && b === 3) { M.beadMesh.setMatrixAt(i * B + b, _m.makeScale(0, 0, 0)); continue; }   // ADP has two phosphates
        if (m.kind === 'out' && b === 4) continue;
        const r = (b === 0 ? 0.4 : 0.24) * s;
        _b.copy(c).addScaledVector(side, off);
        M.beadMesh.setMatrixAt(i * B + b, _m.makeScale(r, r, r).setPosition(_b));
        M.beadMesh.setColorAt(i * B + b, _col.set(b === 0 ? COL.aden : COL.phos));
      }
      if (m.kind === 'out' && m.t < 1.6) popTag = _c.copy(c).addScaledVector(side, 0.7).add(_s.set(0, 0.9, 0));
    });
    M.beadMesh.instanceMatrix.needsUpdate = true;
    if (M.beadMesh.instanceColor) M.beadMesh.instanceColor.needsUpdate = true;
  }
  let popTag = null;

  // ---------- real atoms (lazy) ----------
  async function loadAtoms() {
    if (atomsGroup) return atomsGroup;
    if (atomsLoading) return atomsLoading;
    atomsLoading = (async () => {
      const d = await fetch(new URL('f1-atoms.json', HERE)).then((r) => { if (!r.ok) throw new Error('atoms'); return r.json(); });
      if (destroyed) return null;
      const g = new THREE.Group();
      const geo = new THREE.IcosahedronGeometry(1, mobile ? 0 : 1);
      const ops = {};
      for (const k in d.opers) { const [mm, v] = d.opers[k]; ops[k] = { m: mm, v }; }
      const shade = { C: 1, N: 1.18, O: 0.82, S: 1.3 };
      for (const part of d.parts) {
        const protein = ['alpha', 'beta', 'gamma'].includes(part.kind);
        const n = part.el.length;
        for (const op of part.ops) {
          const mesh = new THREE.InstancedMesh(geo, std('#ffffff', 0.45, '#ffffff', protein ? 0.35 : 0.6), n);
          const { m: R, v } = ops[op];
          const base = new THREE.Color(protein ? COL[part.kind] : '#ffffff');
          for (let i = 0; i < n; i++) {
            const x = part.xyz[3 * i] / 10, y = part.xyz[3 * i + 1] / 10, z = part.xyz[3 * i + 2] / 10;   // angstroms
            const X = R[0] * x + R[1] * y + R[2] * z + v[0], Y = R[3] * x + R[4] * y + R[5] * z + v[1], Z = R[6] * x + R[7] * y + R[8] * z + v[2];
            // file z (the three-fold axis) becomes scene up, flipped so the stalk points down at the membrane
            const sx = X * 0.1, sy = -Z * 0.1 * d.measured.stalkDir, sz = Y * 0.1 * d.measured.stalkDir;
            const e = part.el[i].toUpperCase();
            const r = protein ? 0.16 : 0.17;
            mesh.setMatrixAt(i, _m.makeScale(r, r, r).setPosition(sx, sy, sz));
            if (protein) _col.copy(base).multiplyScalar(shade[e] || 1); else _col.set(COL[e === 'MG' ? 'MG' : e] || COL.C);
            mesh.setColorAt(i, _col);
          }
          mesh.userData.peek = op === '1' && (part.kind === 'alpha' || part.kind === 'beta');
          mesh.computeBoundingSphere();
          g.add(mesh);
        }
      }
      g.visible = false;
      scene.add(g);
      atomsGroup = g;
      return g;
    })();
    return atomsLoading;
  }

  // ---------- tags ----------
  const tagDefs = [
    { k: 'tagMatrix', p: [-11, 8.5, 5], zone: true },
    { k: 'tagIms', p: [-11, -6.5, 5], zone: true },
    { k: 'tagMembrane', p: [-12.5, 0, 7], c: COL.lipid },
    { k: 'tagHead', p: [-6.2, HEAD_Y + 3.5, 0], c: COL.beta },
    { k: 'tagRing', p: [-3.6, -3.4, 0], c: COL.ring },
    { k: 'tagStalk', p: [-1.6, 4.4, 0], c: COL.gamma },
    { k: 'tagSide', p: [7.6, 9, 0], c: COL.side },
    { k: 'tagA', p: [5.2, -3.4, 0], c: COL.door },
  ];
  let tagEls = [], popEl = null;
  function buildTags() {
    for (const d of tagDefs) {
      const e = el('span', { class: 'at-tag' + (d.zone ? ' at-zone' : ''), text: t(d.k) });
      if (d.c) e.style.setProperty('--c', d.c);
      refs.tags.appendChild(e);
      tagEls.push({ d, e, v: new THREE.Vector3(...d.p) });
    }
    popEl = el('span', { class: 'at-tag at-pop', text: t('tagAtp'), hidden: '' });
    refs.tags.appendChild(popEl);
  }
  function place(node, v) {
    _a.copy(v).project(camera);
    const w = root.clientWidth, h = root.clientHeight;
    const x = (_a.x * 0.5 + 0.5) * w, y = (-_a.y * 0.5 + 0.5) * h;
    const ok = _a.z < 1 && x > 20 && x < w - 20 && y > 20 && y < h - 20;
    node.style.visibility = ok ? 'visible' : 'hidden';
    if (ok) node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  function updateTags() {
    const show = mode === 'machine' && labelsOn;
    for (const { e, v } of tagEls) { e.hidden = !show; if (show) place(e, v); }
    if (popEl) { popEl.hidden = !(mode === 'machine' && popTag); if (!popEl.hidden) place(popEl, popTag); }
  }

  // ---------- controls ----------
  function announce(s) { refs.live.textContent = ''; setTimeout(() => { if (refs.live) refs.live.textContent = s; }, 30); }

  async function setMode(m, quiet) {
    if (!renderer) return;
    mode = m === 'closeup' ? 'closeup' : 'machine';
    for (const k in refs.modeBtns) refs.modeBtns[k].setAttribute('aria-pressed', String(k === mode));
    refs.peekBtn.hidden = mode !== 'closeup';
    refs.closeTag.hidden = mode !== 'closeup';
    refs.legend.innerHTML = legendHtml();
    yawUser = 0; pitchUser = 0; zoom = 1;
    machine.g.visible = mode === 'machine';
    const c = caps[mode] || {};
    refs.info.innerHTML = `<h3>${esc(c.h || '')}</h3><p>${esc(c.t || '')}</p>` + (mode === 'machine' ? `<p class="at-muted">${esc(t('slowNote', { s: TURN_S }))}</p>` : '');
    if (!quiet) announce(t(mode));
    if (mode === 'closeup') {
      if (!atomsGroup) refs.info.insertAdjacentHTML('beforeend', `<p class="at-muted" data-loading>${esc(t('closeLoading'))}</p>`);
      try { await loadAtoms(); } catch (e) { refs.info.innerHTML = `<p>${esc(t('closeFail'))}</p>`; return; }
      const ld = refs.info.querySelector('[data-loading]'); if (ld) ld.remove();
      if (destroyed || mode !== 'closeup' || !atomsGroup) return;
      atomsGroup.visible = true;
      applyPeek();
    } else if (atomsGroup) atomsGroup.visible = false;
    dirty = true; snapNext = true;
  }
  function setPlaying(v) {
    playing = !!v && !!renderer;
    refs.playBtn.textContent = playing ? t('pause') : t('play');
    refs.playBtn.setAttribute('aria-pressed', String(playing));
    if (playing) start();
    dirty = true;
  }
  function setLabels(v) { labelsOn = !!v; refs.labelsBtn.setAttribute('aria-pressed', String(labelsOn)); dirty = true; }
  function setPeek(v) { peekOn = !!v; refs.peekBtn.setAttribute('aria-pressed', String(peekOn)); applyPeek(); }
  function applyPeek() { if (atomsGroup) for (const m of atomsGroup.children) if (m.userData.peek) m.visible = !peekOn; dirty = true; }
  function toggleAbout(v) {
    const open = v == null ? refs.about.hidden : v;
    refs.about.hidden = !open;
    refs.aboutBtn.setAttribute('aria-expanded', String(open));
    if (open) refs.about.focus(); else refs.aboutBtn.focus();
  }
  function zoomBy(f) { zoom = clamp(zoom * f, 0.45, 2.2); dirty = true; }

  function onKey(e) {
    if (e.target.closest && e.target.closest('.at-about')) { if (e.key === 'Escape') toggleAbout(false); return; }
    const k = e.key;
    const onCtl = ['BUTTON', 'A', 'INPUT'].includes(e.target.tagName);
    if (!renderer) return;
    let used = true;
    if (k === '1') setMode('machine');
    else if (k === '2') setMode('closeup');
    else if (k === ' ' && !onCtl) setPlaying(!playing);
    else if (k === 'l' || k === 'L') setLabels(!labelsOn);
    else if ((k === 'p' || k === 'P') && mode === 'closeup') setPeek(!peekOn);
    else if (k === 'ArrowLeft') yawUser += 0.12;
    else if (k === 'ArrowRight') yawUser -= 0.12;
    else if (k === 'ArrowUp') pitchUser = clamp(pitchUser + 0.08, -0.9, 1.1);
    else if (k === 'ArrowDown') pitchUser = clamp(pitchUser - 0.08, -0.9, 1.1);
    else if (k === '+' || k === '=') zoomBy(0.88);
    else if (k === '-' || k === '_') zoomBy(1.14);
    else if (k === 'Escape' && !refs.about.hidden) toggleAbout(false);
    else used = false;
    if (used) { e.preventDefault(); dirty = true; }
  }

  const ptrs = new Map(); let pinch0 = 0;
  function onDown(e) {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  }
  function onMove(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) zoomBy(pinch0 / d); pinch0 = d; return;
    }
    yawUser -= dx * 0.008; pitchUser = clamp(pitchUser + dy * 0.006, -0.9, 1.1); dirty = true;
  }
  function onUp(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; }

  function resize() {
    if (!renderer) return;
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const off = w < 700 ? clamp((refs.bottom.offsetHeight - 60) / 2, 0, h * 0.3) : 0;
    if (off > 4) camera.setViewOffset(w, h, 0, off, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    dirty = true;
  }

  // ---------- loop ----------
  function start() {
    if (running || destroyed || !renderer || document.hidden || !inViewport) return;
    running = true; lastT = 0; dirty = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const camTarget = new THREE.Vector3(0, 6, 0), wantPos = new THREE.Vector3(), wantTarget = new THREE.Vector3();
  let fogNear = 20, fogFar = 70, snapNext = true;

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
    let animating = dirty;
    if (playing) {
      time += dt; animating = true;
      if (mode === 'machine') stepMachine(dt);
      autoYaw += dt * (mode === 'machine' ? 0.06 : 0.12);
    }
    if (countDirty) { updateCount(); countDirty = false; }

    const aspect = camera.aspect;
    let dist, fN, fF;
    if (mode === 'machine') {
      wantTarget.set(0, 6.2, 0);
      dist = (aspect < 0.8 ? 58 : 40) * zoom;
      fN = dist - 14; fF = dist + 30;
    } else {
      wantTarget.set(0, 0, 0);
      dist = (aspect < 0.8 ? 40 : 27) * zoom;
      fN = dist - 8; fF = dist + 14;
    }
    const yaw = autoYaw + yawUser + 0.5, pitch = (mode === 'machine' ? 0.16 : 0.35) + pitchUser;
    wantPos.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist).add(wantTarget);
    const k = (snapNext || reduceMotion()) ? 1 : 1 - Math.exp(-dt * 3);
    snapNext = false;
    camera.position.lerp(wantPos, k);
    camTarget.lerp(wantTarget, k);
    camera.lookAt(camTarget);
    camLight.position.copy(camera.position);
    fogNear += (fN - fogNear) * k; fogFar += (fF - fogFar) * k;
    scene.fog.near = fogNear; scene.fog.far = fogFar;
    if (camera.position.distanceTo(wantPos) > 0.01) animating = true;

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
    play: (v) => setPlaying(v == null ? !playing : !!v),
    labels: (v) => setLabels(v == null ? !labelsOn : !!v),
    destroy: () => unmount(),
  });
  return view;
}

// ---------------------------------------------------------------------------------------------
// Flat drawing for browsers without WebGL.
function fallbackSvg(label, light) {
  const bg = light ? '#edf3f5' : '#071019', ink = light ? '#10202e' : '#e8f1f7';
  let ring = '';
  for (let j = 0; j < NC; j++) ring += `<rect x="${118 + j * 16}" y="232" width="12" height="56" rx="6" fill="${COL.ring}"/>`;
  let head = '';
  for (let k = 0; k < 6; k++) head += `<ellipse cx="${110 + k * 28}" cy="88" rx="17" ry="52" fill="${k % 2 ? COL.beta : COL.alpha}" opacity="0.95"/>`;
  const H = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${COL.proton}"/>`;
  const atp = (x, y) => `<circle cx="${x}" cy="${y}" r="7" fill="${COL.aden}"/><circle cx="${x + 10}" cy="${y}" r="4.5" fill="${COL.phos}"/><circle cx="${x + 18}" cy="${y}" r="4.5" fill="${COL.phos}"/><circle cx="${x + 26}" cy="${y}" r="4.5" fill="${COL.phos}"/>`;
  return `<svg viewBox="0 0 360 360" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="360" height="360" rx="16" fill="${bg}"/>` +
    `<rect x="0" y="226" width="360" height="68" fill="#c7a65a" opacity="0.22"/>` +
    `<rect x="174" y="140" width="12" height="96" rx="6" fill="${COL.gamma}"/>${head}${ring}` +
    `<rect x="252" y="228" width="22" height="64" rx="8" fill="${COL.door}"/>` +
    `<path d="M282 230 C 300 180, 300 90, 268 34" fill="none" stroke="${COL.side}" stroke-width="7" stroke-linecap="round"/>` +
    H(262, 330) + H(250, 312) + H(270, 210) + H(290, 198) +
    `<path d="M262 322 V 300" stroke="${COL.proton}" stroke-width="2" marker-end="url(#atArr)"/>` +
    atp(14, 60) + atp(300, 120) +
    `<text x="12" y="24" font-size="13" font-weight="700" fill="${ink}">MATRIX</text>` +
    `<text x="12" y="346" font-size="13" font-weight="700" fill="${ink}">INTERMEMBRANE SPACE</text>` +
    `<defs><marker id="atArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="${COL.proton}"/></marker></defs></svg>`;
}
