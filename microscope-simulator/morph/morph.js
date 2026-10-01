// Hemoglobin breathing: a morph between real deoxy (PDB 4HHB, T state) and oxy (PDB 1HHO, R state) human hemoglobin,
// drawn with three.js. ES module. mount(containerEl, options) builds everything inside containerEl; unmount() removes it.
// Data: hb-morph.json, built by tools/hero_morph_build.py from the two local mmCIF files (atoms matched by chain,
// residue and name; oxy superposed on the deoxy alpha1beta1 pair). The in-between frames are straight-line
// interpolation, labelled illustrative on screen. Words come from morph.json, citations from sources.json.
// No external requests.
//
// options: { theme: 'light'|'dark' (default follows the page), realHref (default ../molecules/#hemoglobin),
//            embedded (true: vertical page scroll passes through the canvas, no wheel zoom),
//            startView: 'whole'|'heme', startT: 0..1, autoplay (default true unless reduced motion), noGL }
// API (resolved by mount): setT(t), play(bool), setView(v), compare(bool), destroy()

import * as THREE from '../vendor/three/0.170.0/build/three.module.js';

const HERE = new URL('./', import.meta.url);
const NM = 0.1;                     // file units are angstroms; the scene is in nanometres
const COL = { alpha: '#e0668a', beta: '#4d8fe8', C: '#c8d0d8', N: '#5b86ff', O: '#ff4040', FE: '#ff8a1c' };
const RAD_COIL = 0.075, RAD_HELIX = 0.17;
const EL_R = { C: 0.05, N: 0.055, O: 0.06, FE: 0.11 };
// illustrative order in which the four oxygens land (start, end of each arrival, as a fraction of the slider)
const ARRIVE = [[0.06, 0.4], [0.36, 0.62], [0.55, 0.78], [0.7, 0.92]];
const HOLD = 1.4, SWING = 4.2;      // seconds held at each end, seconds per swing when playing

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
.hb-root { --hb-ink: #e8f1f7; --hb-muted: #a9bccb; --hb-glass: rgba(7, 15, 27, 0.76); --hb-line: rgba(150, 185, 215, 0.3);
  --hb-accent: #5cd3ff; --hb-on-accent: #03141f; --hb-raised: rgba(14, 26, 44, 0.94); --hb-tag: #f4fbff; --hb-tag-ink: #06121d;
  position: relative; width: 100%; height: 100%; min-height: 360px; overflow: hidden; color: var(--hb-ink);
  font-family: var(--font-ui, "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif); font-size: 15px; line-height: 1.45;
  background: radial-gradient(120% 90% at 50% 42%, #2a1230 0%, #0b0d1e 55%, #020309 100%); -webkit-font-smoothing: antialiased; }
.hb-root.hb-light { --hb-ink: #0f1c28; --hb-muted: #46596a; --hb-glass: rgba(250, 252, 254, 0.88); --hb-line: rgba(30, 55, 80, 0.24);
  --hb-accent: #0a6f9e; --hb-on-accent: #ffffff; --hb-raised: rgba(255, 255, 255, 0.97); --hb-tag: #10202e; --hb-tag-ink: #f4fbff;
  background: radial-gradient(120% 90% at 50% 42%, #ffffff 0%, #eef2f7 55%, #d9e1ea 100%); }
.hb-root *, .hb-root *::before, .hb-root *::after { box-sizing: border-box; }
.hb-root [hidden] { display: none !important; }
.hb-root button { font: inherit; color: inherit; cursor: pointer; }
.hb-root a { color: var(--hb-accent); }
.hb-root :focus-visible { outline: 3px solid var(--hb-accent); outline-offset: 2px; }
.hb-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.hb-view { position: absolute; inset: 0; outline: none; }
.hb-view:focus-visible { outline: 3px solid var(--hb-accent); outline-offset: -3px; }
.hb-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
.hb-root.hb-embedded .hb-view canvas { touch-action: pan-y; }
.hb-vig { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(130% 100% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.5) 100%); }
.hb-root.hb-light .hb-vig { background: radial-gradient(130% 100% at 50% 45%, transparent 60%, rgba(40, 60, 90, 0.16) 100%); }
.hb-tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.hb-tag { position: absolute; left: 0; top: 0; font-size: 12.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; color: var(--hb-tag-ink); background: var(--hb-tag);
  border: 2px solid var(--c, #fff); will-change: transform; white-space: nowrap; opacity: 0.92; }
.hb-top { position: absolute; left: 12px; right: 12px; top: calc(10px + env(safe-area-inset-top, 0px)); display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; pointer-events: none; }
.hb-top > * { pointer-events: auto; }
.hb-titlebox { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; }
.hb-title { margin: 0; font-size: 17px; font-weight: 600; padding: 3px 10px; border-radius: 8px; background: var(--hb-glass); border: 1px solid var(--hb-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.hb-badge { font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 10px; max-width: min(440px, 62vw); background: #ffd166; color: #2a1d00; border: 1px solid #e0a800; }
.hb-state { font-size: 14px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--hb-glass); border: 1px solid var(--hb-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font-variant-numeric: tabular-nums; }
.hb-btn { min-height: 44px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--hb-line); background: var(--hb-glass); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; color: var(--hb-ink); white-space: nowrap; }
.hb-root a.hb-btn { color: var(--hb-ink); }
.hb-btn:hover { border-color: var(--hb-accent); }
.hb-btn[aria-pressed="true"], .hb-btn.hb-primary { background: var(--hb-accent); border-color: var(--hb-accent); color: var(--hb-on-accent); }
.hb-root a.hb-btn.hb-primary { color: var(--hb-on-accent); }
.hb-btn.hb-primary::after { content: "\\2192"; }
.hb-bottom { position: absolute; left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: flex-start; gap: 8px; pointer-events: none; }
.hb-bottom > * { pointer-events: auto; }
.hb-info { width: min(440px, 100%); background: var(--hb-glass); border: 1px solid var(--hb-line); border-radius: 14px; padding: 10px 14px; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  max-height: 30vh; overflow-y: auto; }
.hb-info p { margin: 0 0 4px; }
.hb-info h3 { margin: 0 0 4px; font-size: 17px; line-height: 1.25; }
.hb-muted { color: var(--hb-muted); font-size: 14px; }
.hb-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.hb-sliderrow { width: min(560px, 100%); display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 4px; border-radius: 999px; background: var(--hb-glass); border: 1px solid var(--hb-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.hb-sliderrow .hb-btn { border: 0; background: var(--hb-accent); color: var(--hb-on-accent); min-width: 78px; }
.hb-end { font-size: 12.5px; font-weight: 700; white-space: nowrap; color: var(--hb-muted); }
.hb-end b { color: var(--hb-ink); }
.hb-range { flex: 1; min-width: 80px; height: 44px; margin: 0; accent-color: var(--hb-accent); cursor: pointer; background: transparent; }
.hb-seg { display: inline-flex; border-radius: 999px; border: 1px solid var(--hb-line); background: var(--hb-glass); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); padding: 2px; }
.hb-seg .hb-btn { border: 0; background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none; min-height: 40px; padding: 6px 12px; }
.hb-seg .hb-btn[aria-pressed="true"] { background: var(--hb-accent); color: var(--hb-on-accent); }
.hb-legend { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 5px 12px; border-radius: 12px; background: var(--hb-glass); border: 1px solid var(--hb-line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font-size: 13px; }
.hb-li { display: inline-flex; align-items: center; gap: 6px; }
.hb-sw { display: inline-block; width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0, 0, 0, 0.35); }
.hb-sw.hb-round { border-radius: 50%; }
.hb-sw.hb-ghost { background: transparent; border: 2px dashed var(--hb-muted); }
.hb-about { position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 100%); background: var(--hb-raised); border-left: 1px solid var(--hb-line); overflow-y: auto;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 18px calc(20px + env(safe-area-inset-bottom, 0px)); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); z-index: 5; }
.hb-about h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--hb-muted); margin: 16px 0 6px; }
.hb-about p, .hb-about li { font-size: 14.5px; }
.hb-about ul { padding-left: 18px; margin: 0; }
.hb-about ul li { margin-bottom: 4px; }
.hb-about ol { padding-left: 22px; margin: 0; }
.hb-about ol li { margin-bottom: 6px; font-size: 13px; color: var(--hb-muted); }
.hb-about ol a { overflow-wrap: anywhere; }
.hb-about sup a { text-decoration: none; font-family: var(--font-data, ui-monospace, monospace); font-size: 11px; }
.hb-abouthead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.hb-abouthead h2 { margin: 0; }
.hb-nogl { position: absolute; inset: 0; overflow-y: auto; padding: 120px 16px 24px; display: flex; flex-wrap: wrap; gap: 18px; align-content: flex-start; justify-content: center; }
.hb-nogl svg { flex: none; width: min(420px, 92vw); height: auto; }
.hb-nogl .hb-nogltext { max-width: 56ch; background: var(--hb-glass); border: 1px solid var(--hb-line); border-radius: 14px; padding: 12px 16px; }
@media (max-width: 560px) {
  .hb-title { font-size: 15px; }
  .hb-badge { font-size: 11.5px; max-width: 64vw; }
  .hb-btn { padding: 8px 11px; font-size: 13.5px; }
  .hb-seg .hb-btn { padding: 6px 9px; }
  .hb-info { max-height: 24vh; padding: 8px 12px; }
  .hb-info h3 { font-size: 15.5px; }
  .hb-info p { font-size: 14px; }
  .hb-legend { font-size: 12px; padding: 4px 10px; }
  .hb-end { font-size: 11.5px; }
  .hb-sliderrow .hb-btn { min-width: 64px; }
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

// Standard material plus a fresnel rim light (same look as the DNA scene).
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
  let ui = {}, facts = [], caps = {}, sources = {}, data = null;
  let destroyed = false;

  let style = document.getElementById('hb-style');
  if (!style) { style = el('style', { id: 'hb-style' }); style.textContent = CSS; document.head.appendChild(style); }
  const root = el('div', { class: 'hb-root' + (opts.embedded ? ' hb-embedded' : '') });
  container.appendChild(root);

  let light = false;
  const applyTheme = () => {
    let t = opts.theme;
    if (t !== 'light' && t !== 'dark') {
      const h = document.documentElement.dataset.theme;
      t = (h === 'light' || h === 'dark') ? h : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    light = t === 'light';
    root.classList.toggle('hb-light', light);
    if (scene) themeScene();
  };
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  on(mqDark, 'change', applyTheme);
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  disposers.push(() => themeObs.disconnect());

  const api = {};
  const view = { root, api, destroy, ready: null };

  // ---------- state ----------
  let tVal = clamp(+opts.startT || 0, 0, 1);          // slider position, 0 = T (deoxy), 1 = R (oxy)
  let shownT = -1;
  let playing = false, playDir = 1, holdLeft = 0;
  let spinOn = !reduceMotion();
  let viewMode = opts.startView === 'heme' ? 'heme' : 'whole';
  let ghostOn = false;
  let yawUser = 0, pitchUser = 0, zoom = 1, time = 0;
  let running = false, raf = 0, lastT = 0, dirty = true, inViewport = true;
  let renderer = null, scene = null, camera = null, model = null;
  let stage = '';
  const refs = {};
  const srcOrder = [];

  function t(k, o) { return fmt(ui[k] != null ? ui[k] : k, o || {}); }
  function srcNum(key) { let i = srcOrder.indexOf(key); if (i < 0) { srcOrder.push(key); i = srcOrder.length - 1; } return i + 1; }

  applyTheme();

  view.ready = (async () => {
    try {
      const [d, s, m] = await Promise.all([
        fetch(new URL('morph.json', HERE)).then((r) => r.json()),
        fetch(new URL('sources.json', HERE)).then((r) => r.json()),
        fetch(new URL('hb-morph.json', HERE)).then((r) => { if (!r.ok) throw new Error('data'); return r.json(); }),
      ]);
      ui = d.ui || {}; facts = d.facts || []; caps = d.captions || {}; sources = (s && s.sources) || {}; data = m;
    } catch (e) { data = null; }
    if (destroyed) return;
    build();
  })();

  // numbers measured from the files, used in captions and the About panel
  function nums() {
    const st = data.stats, hs = data.hemes;
    const offT = hs.map((h) => h.feOffsetT), offR = hs.map((h) => Math.abs(h.feOffsetR));
    return {
      ab1: st.ab1Rmsd.toFixed(2), turn: st.ab2TurnDeg.toFixed(0), feT: st.betaFeT.toFixed(1), feR: st.betaFeR.toFixed(1),
      planeT: Math.min(...offT).toFixed(2) + ' to ' + Math.max(...offT).toFixed(2), planeR: Math.max(...offR).toFixed(2),
      hemeAT: hs[0].feOffsetT.toFixed(2), hemeAR: Math.abs(hs[0].feOffsetR).toFixed(2),
    };
  }

  function build() {
    const altId = 'hb-alt-' + Math.random().toString(36).slice(2, 7);
    const keysId = altId + 'k';
    root.innerHTML = '';
    if (!data) { root.appendChild(el('p', { class: 'hb-info', style: 'margin:96px 16px', role: 'alert', text: t('loadFail') })); return; }
    const N = nums();

    const viewEl = el('div', { class: 'hb-view', tabindex: '0', role: 'group', 'aria-label': t('viewAria'), 'aria-describedby': altId + ' ' + keysId });
    const altSr = el('p', { class: 'hb-sr', id: altId, text: t('alt') });
    const keysSr = el('p', { class: 'hb-sr', id: keysId, text: t('keys') });
    const vig = el('div', { class: 'hb-vig', 'aria-hidden': 'true' });
    const tags = el('div', { class: 'hb-tags', 'aria-hidden': 'true' });

    const top = el('div', { class: 'hb-top' });
    const titleBox = el('div', { class: 'hb-titlebox' });
    titleBox.appendChild(el('h2', { class: 'hb-title', text: t('title') }));
    titleBox.appendChild(el('span', { class: 'hb-badge', text: t('badge') }));
    const stateEl = el('span', { class: 'hb-state', 'aria-hidden': 'true' });
    titleBox.appendChild(stateEl);
    const realA = el('a', { class: 'hb-btn hb-primary', href: opts.realHref || '../molecules/#hemoglobin', title: t('realTitle'), text: t('real') });
    top.append(titleBox, realA);

    const bottom = el('div', { class: 'hb-bottom' });
    const info = el('section', { class: 'hb-info', 'aria-live': 'polite' });
    const legend = el('div', { class: 'hb-legend', role: 'group', 'aria-label': t('legendLabel') });
    legend.innerHTML =
      `<span class="hb-li"><span class="hb-sw" style="background:${COL.alpha}"></span>${esc(t('alpha'))}</span>` +
      `<span class="hb-li"><span class="hb-sw" style="background:${COL.beta}"></span>${esc(t('beta'))}</span>` +
      `<span class="hb-li"><span class="hb-sw hb-round" style="background:${COL.C}"></span>${esc(t('hemeKey'))}</span>` +
      `<span class="hb-li"><span class="hb-sw hb-round" style="background:${COL.FE}"></span>${esc(t('iron'))}</span>` +
      `<span class="hb-li"><span class="hb-sw hb-round" style="background:${COL.O}"></span>${esc(t('oxygen'))}</span>` +
      `<span class="hb-li" data-ghostkey hidden><span class="hb-sw hb-ghost"></span>${esc(t('ghost'))}</span>`;

    const srow = el('div', { class: 'hb-sliderrow' });
    const playBtn = el('button', { class: 'hb-btn', type: 'button', 'aria-pressed': 'false', text: t('play') });
    const endT = el('span', { class: 'hb-end', 'aria-hidden': 'true', text: t('endT') });
    const range = el('input', { class: 'hb-range', type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(tVal * 100)), 'aria-label': t('sliderLabel') });
    const endR = el('span', { class: 'hb-end', 'aria-hidden': 'true', text: t('endR') });
    srow.append(playBtn, endT, range, endR);

    const bar = el('div', { class: 'hb-row' });
    const seg = el('div', { class: 'hb-seg', role: 'group', 'aria-label': t('viewLabel') });
    const viewBtns = {};
    for (const v of ['whole', 'heme']) {
      const b = el('button', { class: 'hb-btn', type: 'button', 'aria-pressed': 'false', text: t(v) });
      on(b, 'click', () => setView(v));
      viewBtns[v] = b; seg.appendChild(b);
    }
    const ghostBtn = el('button', { class: 'hb-btn', type: 'button', 'aria-pressed': 'false', title: t('compareTitle'), text: t('compare') });
    const spinBtn = el('button', { class: 'hb-btn', type: 'button', 'aria-pressed': String(spinOn), text: t('spin') });
    const aboutBtn = el('button', { class: 'hb-btn', type: 'button', 'aria-expanded': 'false', text: t('about') });
    bar.append(seg, ghostBtn, spinBtn, aboutBtn);
    bottom.append(info, legend, srow, bar);

    // about panel
    const about = el('section', { class: 'hb-about', hidden: '', 'aria-label': t('about'), tabindex: '-1' });
    const sup = (list) => (list || []).map((k) => `<sup><a href="#hb-src-${esc(k)}">[${srcNum(k)}]</a></sup>`).join('');
    const factsHtml = facts.map((f) => `<li>${esc(f.t)}${sup(f.s)}</li>`).join('');
    const numsHtml = [
      t('numAb1', { v: N.ab1 }), t('numTurn', { v: N.turn }), t('numFe', { t: N.feT, r: N.feR }), t('numPlane', { t: N.planeT, r: N.planeR }),
    ].map((s) => `<li>${esc(s)}${sup(['calc'])}</li>`).join('');
    const numsSup = sup(['rcsb-4HHB', 'rcsb-1HHO']);
    // captions cite sources too; register them so the list is complete
    for (const k in caps) for (const s of caps[k].s || []) srcNum(s);
    const srcHtml = srcOrder.map((k) => {
      const s = sources[k] || {};
      const link = s.url ? ` <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.url)}</a>` : '';
      return `<li id="hb-src-${esc(k)}">${esc(s.cite || k)}${s.doi ? ' DOI ' + esc(s.doi) + '.' : ''}${link}</li>`;
    }).join('');
    about.innerHTML =
      `<div class="hb-abouthead"><h2>${esc(t('factsHeading'))}</h2><button class="hb-btn" type="button" data-close>${esc(t('aboutClose'))}</button></div>` +
      `<ul>${factsHtml}</ul>` +
      `<h2>${esc(t('numbersHeading'))}</h2><ul>${numsHtml}</ul>` +
      `<h2>${esc(t('howHeading'))}</h2><p>${esc(t('how'))}${numsSup}</p>` +
      `<h2>${esc(t('altHeading'))}</h2><p>${esc(t('alt'))}</p>` +
      `<h2>${esc(t('keysHeading'))}</h2><p>${esc(t('keys'))}</p>` +
      `<h2>${esc(t('sourcesHeading'))}</h2><ol>${srcHtml}</ol>`;

    const live = el('div', { class: 'hb-sr', 'aria-live': 'polite' });
    root.append(viewEl, vig, tags, top, bottom, about, altSr, keysSr, live);
    Object.assign(refs, { viewEl, tags, info, bottom, stateEl, legend, srow, bar, playBtn, range, viewBtns, ghostBtn, spinBtn, aboutBtn, about, live });

    on(playBtn, 'click', () => setPlaying(!playing));
    on(range, 'input', () => { setPlaying(false); setT(+range.value / 100); });
    on(ghostBtn, 'click', () => setGhost(!ghostOn));
    on(spinBtn, 'click', () => setSpin(!spinOn));
    on(aboutBtn, 'click', () => toggleAbout());
    on(about.querySelector('[data-close]'), 'click', () => toggleAbout(false));
    on(root, 'keydown', onKey);

    const glOk = !opts.noGL && !new URLSearchParams(location.search).has('nogl') && initGL(viewEl);
    if (!glOk) { buildFallback(); return; }
    setView(viewMode, true);
    updateUI();
    const auto = opts.autoplay != null ? !!opts.autoplay : !reduceMotion();
    if (auto) setPlaying(true);
    start();
  }

  // ---------- fallback ----------
  function buildFallback() {
    for (const k of ['viewEl', 'srow', 'bar', 'info', 'legend']) refs[k].hidden = true;
    refs.stateEl.hidden = true;
    const box = el('div', { class: 'hb-nogl' });
    box.innerHTML = fallbackSvg(t('noglFig'), t('endT'), t('endR'), light) +
      `<div class="hb-nogltext" role="status"><p><b>${esc(t('nogl'))}</b></p><p>${esc(t('alt'))}</p>` +
      facts.slice(0, 4).map((f) => `<p class="hb-muted">${esc(f.t)}</p>`).join('') + `</div>`;
    root.insertBefore(box, refs.tags);
    const holder = el('div', { class: 'hb-row' });
    holder.appendChild(refs.aboutBtn);
    refs.bottom.appendChild(holder);
  }

  // ---------- WebGL ----------
  let mobile = false;
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
    scene.fog = new THREE.Fog(0x0b0d1e, 8, 30);
    camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
    camera.position.set(0, 2, 14);
    scene.add(new THREE.HemisphereLight(0xffe6f0, 0x1a1030, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(5, 8, 7); scene.add(key);
    const back = new THREE.DirectionalLight(0x9fd8ff, 1.6); back.position.set(-7, -2, -9); scene.add(back);
    // the key light rides with the camera so the close-up is always lit from the viewer's side
    camLight = new THREE.DirectionalLight(0xffffff, 0.9); scene.add(camLight);

    buildModel();
    buildTags();
    themeScene();

    const ro = new ResizeObserver(resize); ro.observe(root); ro.observe(refs.bottom); disposers.push(() => ro.disconnect());
    const io = new IntersectionObserver((ents) => { inViewport = ents[0].isIntersecting; inViewport ? start() : stop(); });
    io.observe(root); disposers.push(() => io.disconnect());
    on(document, 'visibilitychange', () => (document.hidden ? stop() : start()));
    const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
    on(mqRM, 'change', () => { if (mqRM.matches) { setSpin(false); setPlaying(false); } });
    on(canvas, 'pointerdown', onDown);
    on(canvas, 'pointermove', onMove);
    on(canvas, 'pointerup', onUp);
    on(canvas, 'pointercancel', onUp);
    if (!opts.embedded) on(canvas, 'wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); stop(); });
    resize();
    return true;
  }
  let camLight = null;

  function themeScene() {
    if (!scene) return;
    scene.fog.color.set(light ? 0xe6ecf3 : 0x0b0d1e);
    if (model) {
      model.ghostMat.color.set(light ? '#1d2b3a' : '#e8f1ff');
      model.ghostMat.opacity = light ? 0.16 : 0.13;
      for (const m of model.tubeMats) m.userData.rim.value = light ? 0.35 : 0.9;
    }
    dirty = true;
  }

  // ---------- model ----------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _col = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);

  function buildModel() {
    const g = new THREE.Group();
    scene.add(g);
    // turn the molecule so its two-fold axis (the one that swaps alpha1beta1 with alpha2beta2) points up
    const cen = (arr) => { const v = new THREE.Vector3(); const n = arr.length / 3; for (let i = 0; i < arr.length; i += 3) v.add(_a.set(arr[i], arr[i + 1], arr[i + 2])); return v.multiplyScalar(NM / n); };
    const [cA, cB, cC, cD] = data.chains.map((c) => cen(c.T));
    const axis = new THREE.Vector3().crossVectors(cA.clone().sub(cC), cB.clone().sub(cD)).normalize();
    const orient = new THREE.Quaternion().setFromUnitVectors(axis, UP);
    // and so the alpha1beta1 pair sits on the left
    const side = cA.clone().add(cB).multiplyScalar(0.5).applyQuaternion(orient); side.y = 0;
    const turn = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(side.z, side.x) + Math.PI);
    g.quaternion.copy(turn.multiply(orient));

    const chains = data.chains.map((c) => {
      const n = c.seq.length;
      const T = Float32Array.from(c.T, (v) => v * NM), R = Float32Array.from(c.R, (v) => v * NM);
      return { id: c.id, type: c.type, n, T, R, P: new Float32Array(n * 3), helix: c.helix };
    });
    const SUB = mobile ? 3 : 4, RAD = mobile ? 7 : 9;
    const tubeMats = [];
    for (const ch of chains) {
      ch.geo = tubeGeo(ch.n, SUB, RAD);
      const c = new THREE.Color(COL[ch.type]);
      const mat = cine(new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.18), roughness: 0.38, metalness: 0.08 }), ch.type === 'alpha' ? '#ffd0de' : '#cfe6ff', 0.9);
      ch.mesh = new THREE.Mesh(ch.geo, mat);
      tubeMats.push(mat);
      g.add(ch.mesh);
    }
    // ghost: the T state as a faint outline, built once
    const ghostMat = new THREE.MeshBasicMaterial({ color: '#e8f1ff', transparent: true, opacity: 0.13, depthWrite: false, wireframe: false });
    const ghost = new THREE.Group(); ghost.visible = false;
    for (const ch of chains) {
      const geo = tubeGeo(ch.n, SUB, 5);
      fillTube(geo, ch.T, ch.n, SUB, 5, ch.helix, 1.25);
      ghost.add(new THREE.Mesh(geo, ghostMat));
    }
    g.add(ghost);

    // hemes, the F8 histidines and the oxygens: ball and stick
    const atoms = [];   // { T: Vector3, R: Vector3, el, heme }
    const bonds = [];   // [i, j]
    const hemes = data.hemes.map((h, hi) => {
      const start = atoms.length;
      const add = (names, els, Tarr, Rarr) => {
        const first = atoms.length;
        for (let i = 0; i < names.length; i++) {
          atoms.push({ T: new THREE.Vector3(Tarr[3 * i], Tarr[3 * i + 1], Tarr[3 * i + 2]).multiplyScalar(NM),
            R: new THREE.Vector3(Rarr[3 * i], Rarr[3 * i + 1], Rarr[3 * i + 2]).multiplyScalar(NM), el: els[i], name: names[i], heme: hi });
        }
        return first;
      };
      const h0 = add(h.names, h.el, h.T, h.R);
      const his0 = add(h.his.names, h.his.el, h.his.T, h.his.R);
      const end = atoms.length;
      const fe = h0 + h.names.indexOf('FE');
      const ne2 = his0 + h.his.names.indexOf('NE2');
      // covalent bonds by distance in the T state; iron bonds allowed a little longer
      for (let i = start; i < end; i++) for (let j = i + 1; j < end; j++) {
        if ((i < his0) !== (j < his0) && !(i === fe && j === ne2)) continue;
        const d = atoms[i].T.distanceTo(atoms[j].T);
        const isFe = i === fe || j === fe;
        if (isFe ? d < 0.26 : (d > 0.04 && d < 0.19)) bonds.push([i, j]);
      }
      const nIdx = ['NA', 'NB', 'NC', 'ND'].map((n) => h0 + h.names.indexOf(n));
      // oxygen offsets from the iron in the R state
      const o2 = h.o2.map((p) => new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(NM).sub(atoms[fe].R));
      return { fe, ne2, nIdx, o2, chain: h.chain };
    });
    const nAtoms = atoms.length;
    const sph = new THREE.IcosahedronGeometry(1, 2);
    const aMat = cine(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.15 }), '#ffffff', 0.5);
    const am = new THREE.InstancedMesh(sph, aMat, nAtoms + hemes.length * 2);
    am.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    atoms.forEach((a, i) => am.setColorAt(i, _col.set(COL[a.el] || COL.C)));
    for (let i = 0; i < hemes.length * 2; i++) am.setColorAt(nAtoms + i, _col.set(COL.O));
    const bMat = cine(new THREE.MeshStandardMaterial({ roughness: 0.4, color: '#dfe6ee' }), '#ffffff', 0.3);
    const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1), bMat, bonds.length + hemes.length * 2);
    bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(am, bm);
    tubeMats.push(aMat, bMat);

    model = { g, chains, SUB, RAD, ghost, ghostMat, tubeMats, atoms, bonds, hemes, am, bm, nAtoms, cur: atoms.map(() => new THREE.Vector3()), o2pos: [], o2scale: [] };
    applyT(tVal, true);
  }

  function tubeGeo(n, SUB, RAD) {
    const M = (n - 1) * SUB + 1;
    const g = new THREE.BufferGeometry();
    const vc = M * (RAD + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vc * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vc * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < M - 1; i++) for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j, b = (i + 1) * (RAD + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    g.setIndex(idx);
    g.userData.samples = new Float32Array(M * 3);
    g.userData.radii = new Float32Array(M);
    return g;
  }

  // Catmull-Rom spline through the C-alpha points, swept with a parallel-transport frame. Thicker in helices.
  const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3();
  const _T = new THREE.Vector3(), _N = new THREE.Vector3(), _B = new THREE.Vector3(), _Tp = new THREE.Vector3(), _n = new THREE.Vector3();
  function fillTube(g, P, n, SUB, RAD, helix, radScale = 1) {
    const S = g.userData.samples, Rr = g.userData.radii;
    const M = (n - 1) * SUB + 1;
    const pt = (i, out) => { i = clamp(i, 0, n - 1); return out.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]); };
    let k = 0;
    for (let i = 0; i < n - 1; i++) {
      pt(i - 1, _p0); pt(i, _p1); pt(i + 1, _p2); pt(i + 2, _p3);
      for (let s = 0; s < SUB; s++) {
        const u = s / SUB, u2 = u * u, u3 = u2 * u;
        for (const ax of ['x', 'y', 'z']) {
          S[k * 3 + (ax === 'x' ? 0 : ax === 'y' ? 1 : 2)] = 0.5 * ((2 * _p1[ax]) + (-_p0[ax] + _p2[ax]) * u + (2 * _p0[ax] - 5 * _p1[ax] + 4 * _p2[ax] - _p3[ax]) * u2 + (-_p0[ax] + 3 * _p1[ax] - 3 * _p2[ax] + _p3[ax]) * u3);
        }
        const hf = helix[i] + (helix[i + 1] - helix[i]) * smooth(u);
        Rr[k] = (RAD_COIL + (RAD_HELIX - RAD_COIL) * hf) * radScale;
        k++;
      }
    }
    pt(n - 1, _p1); S[k * 3] = _p1.x; S[k * 3 + 1] = _p1.y; S[k * 3 + 2] = _p1.z; Rr[k] = RAD_COIL * radScale;
    // taper the two ends
    Rr[0] *= 0.6; Rr[M - 1] *= 0.6;
    const Pos = g.attributes.position.array, Nor = g.attributes.normal.array;
    let v = 0;
    for (let j = 0; j < M; j++) {
      const a = Math.max(0, j - 1), b = Math.min(M - 1, j + 1);
      _T.set(S[3 * b] - S[3 * a], S[3 * b + 1] - S[3 * a + 1], S[3 * b + 2] - S[3 * a + 2]).normalize();
      if (j === 0) {
        _N.set(0, 1, 0); if (Math.abs(_N.dot(_T)) > 0.9) _N.set(1, 0, 0);
        _N.addScaledVector(_T, -_N.dot(_T)).normalize();
      } else {
        _N.addScaledVector(_T, -_N.dot(_T)).normalize();   // parallel transport: remove the new tangent part
      }
      _B.crossVectors(_T, _N);
      const r = Rr[j];
      for (let i = 0; i <= RAD; i++) {
        const th = i / RAD * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        _n.copy(_N).multiplyScalar(cs).addScaledVector(_B, sn);
        Pos[v] = S[3 * j] + _n.x * r; Nor[v++] = _n.x;
        Pos[v] = S[3 * j + 1] + _n.y * r; Nor[v++] = _n.y;
        Pos[v] = S[3 * j + 2] + _n.z * r; Nor[v++] = _n.z;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  }

  function setStick(i, p, q, r) {
    _a.subVectors(q, p); const len = _a.length();
    if (len < 1e-5) { model.bm.setMatrixAt(i, _m.makeScale(0, 0, 0)); return; }
    _q.setFromUnitVectors(UP, _a.divideScalar(len));
    _b.addVectors(p, q).multiplyScalar(0.5);
    model.bm.setMatrixAt(i, _m.compose(_b, _q, _s.set(r, len, r)));
  }

  // place everything at slider position x (0 = T, 1 = R)
  function applyT(x, force) {
    if (!model || (!force && Math.abs(x - shownT) < 1e-5)) return;
    shownT = x;
    const { chains, SUB, RAD, atoms, cur, am, bm, bonds, hemes, nAtoms } = model;
    for (const ch of chains) {
      for (let i = 0; i < ch.n * 3; i++) ch.P[i] = ch.T[i] + (ch.R[i] - ch.T[i]) * x;
      fillTube(ch.geo, ch.P, ch.n, SUB, RAD, ch.helix);
    }
    atoms.forEach((a, i) => {
      cur[i].lerpVectors(a.T, a.R, x);
      const r = EL_R[a.el] || EL_R.C;
      am.setMatrixAt(i, _m.makeScale(r, r, r).setPosition(cur[i]));
    });
    bonds.forEach(([i, j], k) => setStick(k, cur[i], cur[j], 0.022));
    // oxygens: each lands on its iron in turn (illustrative order), dropping in along the iron-oxygen direction
    let k = bonds.length;
    hemes.forEach((h, hi) => {
      const [s0, s1] = ARRIVE[hi];
      const a = smooth((x - s0) / (s1 - s0));
      const fe = cur[h.fe];
      const dir = _c.copy(h.o2[0]).normalize();
      const drop = (1 - a) * 0.9;
      const p1 = _a.copy(fe).add(h.o2[0]).addScaledVector(dir, drop);
      const p2 = _b.copy(fe).add(h.o2[1]).addScaledVector(dir, drop);
      const r = EL_R.O * a;
      am.setMatrixAt(nAtoms + hi * 2, _m.makeScale(r, r, r).setPosition(p1));
      am.setMatrixAt(nAtoms + hi * 2 + 1, _m.makeScale(r, r, r).setPosition(p2));
      model.o2scale[hi] = a;
      setStick(k++, p1, p2, 0.024 * a);
      if (a > 0.98) setStick(k++, fe, p1, 0.02); else bm.setMatrixAt(k++, _m.makeScale(0, 0, 0));
    });
    am.instanceMatrix.needsUpdate = true; bm.instanceMatrix.needsUpdate = true;
    am.computeBoundingSphere(); bm.computeBoundingSphere();
    dirty = true;
  }

  // ---------- screen tags ----------
  let chainTags = [];
  function buildTags() {
    const names = { A: 'tagA1', B: 'tagB1', C: 'tagA2', D: 'tagB2' };
    for (const ch of model.chains) {
      const d = el('span', { class: 'hb-tag', text: t(names[ch.id]) });
      d.style.setProperty('--c', COL[ch.type]);
      refs.tags.appendChild(d);
      chainTags.push({ ch, d });
    }
  }
  const _w = new THREE.Vector3(), _ctr = new THREE.Vector3();
  function updateTags() {
    const show = viewMode === 'whole';
    const w = root.clientWidth, h = root.clientHeight;
    _ctr.set(0, 0, 0);
    for (const { ch, d } of chainTags) {
      d.hidden = !show;
      if (!show) continue;
      _w.set(0, 0, 0);
      for (let i = 0; i < ch.n; i++) _w.x += ch.P[3 * i], _w.y += ch.P[3 * i + 1], _w.z += ch.P[3 * i + 2];
      _w.multiplyScalar(1 / ch.n).multiplyScalar(1.55);
      model.g.localToWorld(_w); _w.project(camera);
      const x = (_w.x * 0.5 + 0.5) * w, y = (-_w.y * 0.5 + 0.5) * h;
      const ok = _w.z < 1 && x > 10 && x < w - 10 && y > 10 && y < h - 10;
      d.style.visibility = ok ? 'visible' : 'hidden';
      if (ok) d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  // ---------- UI text ----------
  function stageOf(x) { return x < 0.03 ? 'T' : x > 0.97 ? 'R' : 'mid'; }
  function updateUI() {
    const x = tVal, p = Math.round(x * 100);
    const st = stageOf(x);
    const label = st === 'T' ? t('stateT') : st === 'R' ? t('stateR') : t('stateMid', { p });
    refs.stateEl.textContent = st === 'mid' ? t('stateMidShort') + ' ' + p + '%' : (st === 'T' ? t('endT') : t('endR'));
    refs.range.setAttribute('aria-valuetext', label);
    if (Math.round(+refs.range.value) !== p) refs.range.value = String(p);
    const key = (viewMode === 'heme' ? 'heme' + st : st);
    if (key !== stage) {
      stage = key;
      const c = caps[key] || {};
      const N = nums();
      const v = key === 'hemeT' ? N.hemeAT : key === 'hemeR' ? N.hemeAR : '';
      refs.info.setAttribute('aria-live', playing ? 'off' : 'polite');
      refs.info.innerHTML = `<h3>${esc(c.h || '')}</h3><p>${esc(fmt(c.t || '', { v }))}</p>` +
        (key === 'T' && viewMode === 'whole' ? `<p class="hb-muted">${esc(t('dragHint'))}</p>` : '');
    }
  }

  function announce(s) { refs.live.textContent = ''; setTimeout(() => { if (refs.live) refs.live.textContent = s; }, 30); }

  // ---------- controls ----------
  function setT(x) { tVal = clamp(x, 0, 1); applyT(tVal); updateUI(); }
  function setPlaying(v) {
    if (!refs.playBtn) return;
    playing = !!v && !!renderer;
    if (playing) { playDir = tVal >= 0.999 ? -1 : tVal <= 0.001 ? 1 : playDir; holdLeft = 0; }
    refs.playBtn.textContent = playing ? t('pause') : t('play');
    refs.playBtn.setAttribute('aria-pressed', String(playing));
    refs.info.setAttribute('aria-live', playing ? 'off' : 'polite');
    if (playing) start();
  }
  function setView(v, quiet) {
    viewMode = v === 'heme' ? 'heme' : 'whole';
    for (const k in refs.viewBtns) refs.viewBtns[k].setAttribute('aria-pressed', String(k === viewMode));
    yawUser = 0; pitchUser = 0; zoom = 1;
    if (!quiet) announce(t(viewMode));
    updateUI(); dirty = true;
  }
  function setGhost(v) {
    ghostOn = !!v;
    if (model) model.ghost.visible = ghostOn;
    refs.ghostBtn.setAttribute('aria-pressed', String(ghostOn));
    refs.legend.querySelector('[data-ghostkey]').hidden = !ghostOn;
    dirty = true;
  }
  function setSpin(v) { spinOn = !!v; refs.spinBtn.setAttribute('aria-pressed', String(spinOn)); dirty = true; if (spinOn) start(); }
  function toggleAbout(v) {
    const open = v == null ? refs.about.hidden : v;
    refs.about.hidden = !open;
    refs.aboutBtn.setAttribute('aria-expanded', String(open));
    if (open) refs.about.focus(); else refs.aboutBtn.focus();
  }
  function zoomBy(f) { zoom = clamp(zoom * f, 0.45, 2.2); dirty = true; }

  function onKey(e) {
    if (e.target.closest && e.target.closest('.hb-about')) { if (e.key === 'Escape') toggleAbout(false); return; }
    const k = e.key;
    const onCtl = ['BUTTON', 'A', 'INPUT'].includes(e.target.tagName);
    const onRange = e.target === refs.range;
    if (!renderer) return;
    let used = true;
    if (k === ' ' && !onCtl) setPlaying(!playing);
    else if (k === '1') setView('whole');
    else if (k === '2') setView('heme');
    else if (k === 'c' || k === 'C') setGhost(!ghostOn);
    else if (onRange) used = false;               // the slider handles its own arrows, Home and End
    else if (k === 'ArrowRight') { setPlaying(false); setT(tVal + 0.05); }
    else if (k === 'ArrowLeft') { setPlaying(false); setT(tVal - 0.05); }
    else if (k === 'Home') { setPlaying(false); setT(0); }
    else if (k === 'End') { setPlaying(false); setT(1); }
    else if (k === 'ArrowUp') pitchUser = clamp(pitchUser + 0.08, -1.1, 1.1);
    else if (k === 'ArrowDown') pitchUser = clamp(pitchUser - 0.08, -1.1, 1.1);
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
    yawUser -= dx * 0.008; pitchUser = clamp(pitchUser + dy * 0.006, -1.1, 1.1); dirty = true;
  }
  function onUp(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; }

  function resize() {
    if (!renderer) return;
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // on narrow screens the controls cover the lower part: shift the picture up so the molecule stays in view
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

  const camTarget = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantTarget = new THREE.Vector3(), wantUp = new THREE.Vector3(0, 1, 0);
  const frameUp = new THREE.Vector3(), frameRef = new THREE.Vector3(), _o = new THREE.Vector3();
  let fogNear = 8, fogFar = 30, snapNext = true, autoYaw = 0;

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
    let animating = dirty;
    time += dt;

    if (playing) {
      if (holdLeft > 0) holdLeft -= dt;
      else {
        const nt = tVal + playDir * dt / SWING;
        if (nt >= 1) { setT(1); playDir = -1; holdLeft = HOLD; }
        else if (nt <= 0) { setT(0); playDir = 1; holdLeft = HOLD; }
        else setT(nt);
      }
      animating = true;
    }
    if (spinOn && viewMode === 'whole') { autoYaw += dt * 0.18; animating = true; }

    const aspect = camera.aspect;
    let fN, fF;
    if (viewMode === 'whole') {
      frameUp.set(0, 1, 0); frameRef.set(0, 0, 1);
      wantTarget.set(0, 0, 0);
      const dist = (aspect < 0.8 ? 17 : 12) * zoom;
      orbit(dist, autoYaw + yawUser, 0.22 + pitchUser);
      wantUp.set(0, 1, 0);
      fN = dist - 4.5; fF = dist + 9;
    } else {
      // close-up on the alpha 1 heme, seen edge-on: the ring is level, the histidine below, oxygen lands on top
      const h = model.hemes[0], cur = model.cur;
      const fe = cur[h.fe];
      _a.subVectors(cur[h.nIdx[2]], cur[h.nIdx[0]]); _b.subVectors(cur[h.nIdx[3]], cur[h.nIdx[1]]);
      frameUp.crossVectors(_a, _b).normalize();
      if (_c.subVectors(cur[h.ne2], fe).dot(frameUp) > 0) frameUp.negate();
      frameRef.copy(_a).normalize();
      wantTarget.copy(fe);
      model.g.localToWorld(wantTarget);
      frameUp.applyQuaternion(model.g.quaternion); frameRef.applyQuaternion(model.g.quaternion);
      const dist = (aspect < 0.8 ? 3.4 : 2.4) * zoom;
      orbit(dist, yawUser + Math.sin(time * 0.25) * (spinOn ? 0.35 : 0), 0.16 + pitchUser);
      wantUp.copy(frameUp);
      fN = dist - 1.2; fF = dist + 3.5;
    }

    const k = (snapNext || reduceMotion()) ? 1 : 1 - Math.exp(-dt * 3);
    snapNext = false;
    camera.position.lerp(wantPos, k);
    camTarget.lerp(wantTarget, k);
    camera.up.lerp(wantUp, k).normalize();
    camera.lookAt(camTarget);
    camLight.position.copy(camera.position).add(_o.set(0, 2, 0));
    fogNear += (fN - fogNear) * k; fogFar += (fF - fogFar) * k;
    scene.fog.near = fogNear; scene.fog.far = fogFar;
    for (const ch of model.chains) {
      const m = ch.mesh.material, op = viewMode === 'heme' ? 0.55 : 1;
      if (Math.abs(m.opacity - op) > 0.005) { m.opacity += (op - m.opacity) * k; animating = true; }
      const tr = m.opacity < 0.99; if (tr !== m.transparent) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
    }
    if (camera.position.distanceTo(wantPos) > 0.005) animating = true;

    if (animating) {
      renderer.render(scene, camera);
      updateTags();
      dirty = false;
    } else if (!playing && !spinOn) {
      // nothing moving: keep the loop alive cheaply only while the camera settles
    }
  }

  function orbit(dist, yaw, pitch) {
    _d.copy(frameRef).applyAxisAngle(frameUp, yaw);
    wantPos.copy(_d).multiplyScalar(Math.cos(pitch) * dist).addScaledVector(frameUp, Math.sin(pitch) * dist).add(wantTarget);
  }

  // ---------- teardown ----------
  function destroy() {
    destroyed = true;
    stop();
    for (const d of disposers) { try { d(); } catch (_) {} }
    if (scene) scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
    if (renderer) { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); }
    root.remove();
    renderer = null; scene = null; model = null;
  }

  Object.assign(api, {
    setT: (x) => { setPlaying(false); setT(+x || 0); },
    play: (v) => setPlaying(v == null ? !playing : !!v),
    setView: (v) => setView(v),
    compare: (v) => setGhost(v == null ? !ghostOn : !!v),
    destroy: () => unmount(),
  });
  return view;
}

// ---------------------------------------------------------------------------------------------
// Flat drawing for browsers without WebGL: the four chains as blobs, T on the left, R on the right.
// In R the alpha2beta2 pair is drawn turned 15 degrees (the published figure) and each heme carries an oxygen.
function fallbackSvg(label, endT, endR, light) {
  const bg = light ? '#eef2f7' : '#0b0d1e', ink = light ? '#10202e' : '#e8f1f7';
  const panel = (ox, turn, o2, title) => {
    const blob = (x, y, c, name, ang) => `<g transform="rotate(${ang} ${ox + 100} 120)"><ellipse cx="${ox + x}" cy="${y}" rx="40" ry="34" fill="${c}" opacity="0.92"/>` +
      `<rect x="${ox + x - 9}" y="${y - 3}" width="18" height="6" rx="2" fill="#c8d0d8"/><circle cx="${ox + x}" cy="${y}" r="4" fill="${COL.FE}"/>` +
      (o2 ? `<circle cx="${ox + x - 3}" cy="${y - 10}" r="4" fill="${COL.O}"/><circle cx="${ox + x + 4}" cy="${y - 14}" r="4" fill="${COL.O}"/>` : '') +
      `<text x="${ox + x}" y="${y + 24}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${name}</text></g>`;
    return blob(58, 78, COL.alpha, 'alpha 1', 0) + blob(58, 162, COL.beta, 'beta 1', 0) +
      blob(142, 162, COL.alpha, 'alpha 2', turn) + blob(142, 78, COL.beta, 'beta 2', turn) +
      `<text x="${ox + 100}" y="232" text-anchor="middle" font-size="15" font-weight="700" fill="${ink}">${esc(title)}</text>`;
  };
  return `<svg viewBox="0 0 420 250" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="420" height="250" rx="16" fill="${bg}"/>${panel(5, 0, false, endT)}${panel(215, 15, true, endR)}` +
    `<path d="M196 120 h26" stroke="${ink}" stroke-width="2.5" marker-end="url(#hbArr)"/>` +
    `<defs><marker id="hbArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="${ink}"/></marker></defs></svg>`;
}
