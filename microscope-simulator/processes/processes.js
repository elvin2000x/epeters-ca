// How life works: the hub and the explainer player (timeline, steps, keyboard, reduced motion, themes).
// Words come from processes.json ("ui" holds the interface words as keyed placeholders), sources from sources.json.
import { SCENES, makeG, VW, VH } from './scenes.js';
import { createLab, T_MAX, CELL_INSIDE, ISO_OUTSIDE } from './lab.js';
import { mountCodon } from './codon.js';
import { bindTheme } from '../common.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const STEP_SEC = 6.5;   // seconds per step when playing
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let DATA, SRC = {}, UI = {};
const fmt = (key, vars = {}) => String(UI[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => mqReduce.matches;

/* ---------- theme ---------- */
let THEME = null;
function readTheme() {
  const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
  const t = document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  THEME = { dark, ink: v('--ink'), muted: v('--muted'), panel: v('--panel'), raised: v('--raised'), line: v('--line') };
}

/* ---------- canvas view ---------- */
function fitCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return null;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const k = Math.min(W / VW, H / VH);
  return { dpr, k, ox: (W - VW * k) / 2, oy: (H - VH * k) / 2 };
}
function paint(cv, ctx, legend, fn) {
  const f = fitCanvas(cv); if (!f) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(f.dpr * f.k, 0, 0, f.dpr * f.k, f.dpr * f.ox, f.dpr * f.oy);
  fn(makeG(ctx, f.k, THEME, legend));
}
// The lab draws through the same text helper as the scenes.
const labHelpers = {
  text(g, s, x, y, o = {}) {
    const c = g.ctx; c.save();
    const size = Math.max(o.size || 14, 11.5 / g.k);
    c.font = `${o.weight || 600} ${size}px ${o.mono ? '"IBM Plex Mono", ui-monospace, monospace' : '"IBM Plex Sans", system-ui, sans-serif'}`;
    c.textAlign = o.align || 'center'; c.textBaseline = 'middle';
    c.strokeStyle = g.theme.panel; c.lineWidth = 3.5 / g.k; c.lineJoin = 'round'; c.globalAlpha = 0.9; c.strokeText(s, x, y);
    c.globalAlpha = 1; c.fillStyle = o.color || g.theme.ink; c.fillText(s, x, y); c.restore();
  }
};

/* ---------- boot ---------- */
async function boot() {
  bindTheme($('#theme'));
  readTheme();
  try {
    const [d, s] = await Promise.all([fetch('processes.json').then((r) => r.json()), fetch('sources.json').then((r) => r.json())]);
    DATA = d; UI = d.ui || {}; for (const x of s.sources) SRC[x.id] = x;
  } catch (e) {
    console.error(e);
    const lf = $('#loadFail'); lf.hidden = false; lf.textContent = 'The explainers could not load. Please refresh the page.';
    return;
  }
  for (const n of document.querySelectorAll('[data-ui]')) { const t = UI[n.dataset.ui]; if (t) n.textContent = t; }
  for (const n of document.querySelectorAll('[data-ui-label]')) { const t = UI[n.dataset.uiLabel]; if (t) n.setAttribute('aria-label', t); }
  const onTheme = () => { readTheme(); if (CUR) { renderLegend(); dirty = true; } else drawThumbs(); };
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  mqReduce.addEventListener('change', () => { if (CUR) applyReduced(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { if (CUR) dirty = true; else drawThumbs(); });
  route();
  requestAnimationFrame(frame);
}

/* ---------- routing ---------- */
let CUR = null;
function route() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (raw.startsWith('src-')) return; // a source footnote jump inside the page
  const [id, st] = raw.split('/');
  const P = DATA.processes.find((p) => p.id === id);
  if (P) {
    const step = clamp((parseInt(st, 10) || 1) - 1, 0, P.steps.length - 1);
    if (CUR && CUR.id === P.id) { if (step !== curStep()) goStep(step, false); return; }
    openExplainer(P, step);
  } else showHub(id ? fmt('notFound') : null);
}

/* ---------- hub ---------- */
function showHub(note) {
  stopAll(); CUR = null;
  $('#explainer').hidden = true; $('#hub').hidden = false; $('#allLink').hidden = true;
  document.title = fmt('page.docTitle');
  const hn = $('#hubNote'); hn.hidden = !note; hn.textContent = note || '';
  const list = $('#cards');
  if (!list.children.length) {
    for (const P of DATA.processes) {
      list.append(h('li', { class: 'pcard' },
        h('canvas', { 'aria-hidden': 'true', 'data-id': P.id }),
        h('div', { class: 'pbody' },
          h('h2', {}, h('a', { href: '#' + P.id, text: P.title })),
          h('p', { text: P.short }),
          h('p', { class: 'meta', text: fmt('hub.steps', { n: P.steps.length }) }))));
    }
  }
  requestAnimationFrame(drawThumbs);
}
let thumbLab = null;
function drawThumbs() {
  if (CUR || !DATA) return;
  for (const cv of document.querySelectorAll('#cards canvas')) {
    const P = DATA.processes.find((p) => p.id === cv.dataset.id), ctx = cv.getContext('2d');
    if (!P || !ctx) continue;
    if (P.extra === 'lab') {
      if (!thumbLab) { thumbLab = createLab(); thumbLab.reset(P.steps[2].lab); thumbLab.seek(12); }
      paint(cv, ctx, P.legend, (g) => thumbLab.draw(g, labHelpers));
    } else {
      paint(cv, ctx, P.legend, (g) => SCENES[P.id](g, P.thumbStep, 0.8, { T: 1.3, flowT: 1.3, rate: 0.9 }));
    }
  }
}

/* ---------- explainer ---------- */
let n = 0, p = 0, playing = false, stopAt = null, T = 0, flowT = 0, dirty = true, light = 80, lab = null, labStep = 0, cv, ctx;
const curStep = () => (CUR ? (CUR.extra === 'lab' ? labStep : Math.min(n - 1, Math.floor(p))) : 0);
const rateOf = (L) => (1 - Math.exp(-L / 28)) / (1 - Math.exp(-100 / 28));

function openExplainer(P, step) {
  stopAll();
  CUR = P; n = P.steps.length; p = 0; T = 0; flowT = 0; lab = null; labStep = 0;
  $('#hub').hidden = true; $('#explainer').hidden = false; $('#allLink').hidden = false;
  document.title = `${P.title}: ${fmt('page.title')}`;
  $('#exTitle').textContent = P.title;
  $('#exSummary').textContent = P.summary;
  $('#alt').textContent = P.alt;
  $('#badge').textContent = fmt(P.extra === 'lab' ? 'badge.model' : 'badge.illustrative');
  cv = $('#cv'); ctx = cv.getContext('2d');
  cv.setAttribute('aria-label', fmt('stage.label', { title: P.title }) + '. ' + P.alt);
  const stage = $('#stage');
  stage.classList.toggle('off', !ctx); $('#nocanvas').hidden = !!ctx; cv.hidden = !ctx;
  renderLegend(); renderSources(); renderStepList(); renderMarkers(); renderExtra();
  applyReduced();
  goStep(step, false, true);
  $('#exTitle').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function renderLegend() {
  const ul = $('#legend');
  ul.replaceChildren(...CUR.legend.map((l) => h('li', {}, h('span', { class: 'sw', style: `background:${THEME.dark ? l.dark : l.light}`, 'aria-hidden': 'true' }), h('span', { text: l.label }))));
}
let srcNum = {};
function renderSources() {
  srcNum = {}; const ids = [];
  for (const s of CUR.steps) for (const id of s.src || []) if (!ids.includes(id)) ids.push(id);
  ids.forEach((id, i) => { srcNum[id] = i + 1; });
  $('#sourceList').replaceChildren(...ids.map((id) => {
    const s = SRC[id] || { title: id, url: '#' };
    return h('li', { id: 'src-' + id }, h('a', { href: s.url, rel: 'noopener', text: s.title }), document.createTextNode(`. ${s.section}. ${s.publisher}, ${fmt('sources.read', { date: s.accessed })}.`));
  }));
}
function refs(ids) {
  const frag = document.createDocumentFragment();
  for (const id of ids || []) {
    const a = h('a', { href: '#src-' + id, 'aria-label': `${fmt('sources.title')} ${srcNum[id]}: ${SRC[id]?.title || id}`, text: String(srcNum[id]) });
    a.addEventListener('click', (e) => { e.preventDefault(); const t = document.getElementById('src-' + id); t?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); });
    frag.append(h('sup', { class: 'ref' }, a));
  }
  return frag;
}
function linkRow(links) { return (links || []).map((l) => h('a', { class: 'golink', href: l.href, text: l.label })); }
function renderStepList() {
  $('#stepList').replaceChildren(...CUR.steps.map((s, i) => h('li', { 'data-i': i },
    h('h3', { text: s.title }),
    h('p', {}, document.createTextNode(s.text + ' '), refs(s.src)),
    h('div', { class: 'sl-row' },
      h('button', { type: 'button', class: 'sl-go', onclick: () => { goStep(i, true); $('#stepCard').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); } }, fmt('steps.go')),
      ...(s.links || []).map((l) => h('a', { href: l.href, text: l.label })),
      h('span', { class: 'cur-tag', text: fmt('steps.current'), hidden: '' })))));
}
function renderMarkers() {
  $('#markers').replaceChildren(...CUR.steps.map((s, i) => h('button', { type: 'button', 'data-i': i, 'aria-label': `${i + 1}. ${s.title}`, onclick: () => goStep(i, true) }, String(i + 1))));
}
let shownStep = -1;
function syncStepUI(force) {
  const i = curStep();
  if (i !== shownStep || force) {
    shownStep = i;
    const s = CUR.steps[i];
    $('#stepPos').textContent = fmt('ctl.stepOf', { n: i + 1, total: n });
    $('#stepTitle').textContent = s.title;
    const st = $('#stepText'); st.replaceChildren(document.createTextNode(s.text + ' '), refs(s.src));
    $('#stepLinks').replaceChildren(...linkRow(s.links));
    for (const li of $('#stepList').children) { const on = +li.dataset.i === i; li.classList.toggle('cur', on); li.querySelector('.cur-tag').hidden = !on; }
    for (const b of $('#markers').children) { const j = +b.dataset.i; if (j === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); b.classList.toggle('done', j < i); }
    $('#prev').disabled = i === 0; $('#next').disabled = i === n - 1;
    const hash = `#${CUR.id}/${i + 1}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  $('#pos').textContent = CUR.extra === 'lab' ? fmt('lab.seconds', { t: lab.time.toFixed(1) }) : fmt('ctl.stepOf', { n: i + 1, total: n });
  const tl = $('#timeline');
  const v = CUR.extra === 'lab' ? Math.round((lab.time / T_MAX) * 1000) : Math.round((Math.min(p, n) / n) * 1000);
  if (document.activeElement !== tl || playing) tl.value = String(v);
  tl.setAttribute('aria-valuetext', CUR.extra === 'lab' ? `${CUR.steps[i].title}, ${fmt('lab.seconds', { t: lab.time.toFixed(1) })}` : fmt('ctl.valueText', { n: i + 1, total: n, title: CUR.steps[i].title }));
  const pb = $('#play');
  pb.setAttribute('aria-pressed', String(playing));
  $('#playTxt').textContent = reduced() && CUR.extra === 'lab' ? fmt('ctl.result') : playing ? fmt('ctl.pause') : (CUR.extra !== 'lab' && p >= n - 0.001 ? fmt('ctl.restart') : fmt('ctl.play'));
}
function applyReduced() {
  const r = reduced();
  $('#reducedNote').hidden = !r;
  $('#play').hidden = r && CUR.extra !== 'lab';
  if (r) { playing = false; if (CUR.extra !== 'lab') p = Math.min(n - 1, Math.floor(p)) + 0.999; }
  dirty = true; syncStepUI(true);
}
function stopAll() { playing = false; stopAt = null; shownStep = -1; }

function goStep(i, user, initial) {
  i = clamp(i, 0, n - 1);
  if (CUR.extra === 'lab') {
    labStep = i;
    const pre = CUR.steps[i].lab;
    lab.reset(pre);
    if (pre.start) lab.seek(pre.start);
    syncLabControls();
    if (reduced()) { playing = false; if (!initial) lab.seek(T_MAX); }
    else playing = !initial || !!user;
  } else if (reduced()) {
    playing = false; p = i + 0.999;
  } else {
    p = i; stopAt = i + 0.999; playing = !initial;
    if (initial) p = i + 0.999;
  }
  dirty = true; syncStepUI(true);
}
function togglePlay() {
  if (CUR.extra === 'lab') {
    if (reduced()) { lab.seek(T_MAX); dirty = true; syncStepUI(); return; }
    if (!playing && lab.time >= T_MAX - 0.01) lab.seek(0);
    playing = !playing;
  } else {
    if (reduced()) return;
    if (!playing && p >= n - 0.001) { p = 0; }
    playing = !playing; stopAt = null;
  }
  syncStepUI();
}

/* ---------- extras ---------- */
let labUI = null;
function renderExtra() {
  const box = $('#extra');
  box.hidden = !CUR.extra; labUI = null;
  if (CUR.extra === 'codon') mountCodon(box, { fmt, AA: DATA.aminoAcids, puzzles: DATA.codonPuzzles });
  else if (CUR.extra === 'light') renderLight(box);
  else if (CUR.extra === 'lab') { lab = createLab(); renderLab(box); }
  else box.replaceChildren();
}
function lightState(r) { return r <= 0.001 ? fmt('light.state0') : r < 0.3 ? fmt('light.state1') : r < 0.6 ? fmt('light.state2') : r < 0.9 ? fmt('light.state3') : fmt('light.state4'); }
function renderLight(box) {
  const out = h('p', { class: 'small', style: 'margin:0', 'aria-live': 'polite' });
  const bar = h('span');
  const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(light), id: 'lightIn' });
  const sync = () => { const r = rateOf(light); bar.style.width = `${Math.round(r * 100)}%`; out.textContent = fmt('light.value', { v: light, state: lightState(r) }); input.setAttribute('aria-valuetext', out.textContent); dirty = true; };
  input.addEventListener('input', () => { light = +input.value; sync(); });
  box.replaceChildren(
    h('h2', { text: fmt('light.title') }),
    h('div', { class: 'lightrow' }, h('label', { for: 'lightIn', class: 'sr-only', text: fmt('light.label') }), h('span', { class: 'lend', 'aria-hidden': 'true', text: fmt('light.dark') }), input, h('span', { class: 'lend', 'aria-hidden': 'true', text: fmt('light.bright') })),
    h('p', { class: 'small', style: 'margin:4px 0 0', text: fmt('light.rate') }),
    h('div', { class: 'gauge', 'aria-hidden': 'true' }, bar), out,
    h('p', { class: 'small', style: 'margin:8px 0 0' }, document.createTextNode(fmt('light.note') + ' '), refs(['os-8-2', 'yang-2020'])));
  sync();
}
function renderLab(box) {
  const mk = (id, label, max) => {
    const o = h('output', { for: id });
    const inp = h('input', { type: 'range', id, min: '0', max: String(max), step: '1' });
    return { wrap: h('div', { class: 'slider' }, h('label', { for: id }, h('span', { text: label }), o), inp), inp, o };
  };
  const L = mk('labLeft', fmt('lab.left'), 80), R = mk('labRight', fmt('lab.right'), 80), O = mk('labOut', fmt('lab.outside'), 420);
  const perm = h('input', { type: 'checkbox', id: 'labPerm' });
  const permWrap = h('label', { class: 'check', for: 'labPerm' }, perm, h('span', { text: fmt('lab.permeable') }));
  const insideNote = h('p', { class: 'small', style: 'margin:0', text: fmt('lab.inside', { n: CELL_INSIDE }) });
  const ratio = h('p', { class: 'small', style: 'margin:0' });
  const ton = h('p', { class: 'tonicity' });
  const burst = h('p', { class: 'burst', role: 'status', text: fmt('lab.burst'), hidden: '' });
  const dl = h('dl', { class: 'readout' });
  const reset = h('button', { type: 'button', class: 'choice', onclick: () => { lab.reset(lab.params); dirty = true; if (!reduced()) playing = true; syncStepUI(); } }, fmt('lab.reset'));
  const custom = () => {
    const prm = lab.params.mode === 'box' ? { mode: 'box', left: +L.inp.value, right: +R.inp.value, permeable: perm.checked } : { mode: 'cell', outside: +O.inp.value };
    lab.reset(prm); dirty = true; if (!reduced()) playing = true; else lab.seek(T_MAX);
    syncLabControls(); syncStepUI();
  };
  for (const x of [L, R, O]) { x.inp.addEventListener('input', () => { x.o.textContent = x.inp.value; }); x.inp.addEventListener('change', custom); }
  perm.addEventListener('change', custom);
  box.replaceChildren(
    h('h2', { text: fmt('lab.title') }),
    h('p', { class: 'intro', text: fmt('lab.intro') }),
    h('div', { class: 'labgrid' }, L.wrap, R.wrap, permWrap, O.wrap, insideNote, ratio, ton, reset, burst,
      h('div', {}, h('p', { class: 'small', style: 'margin:0 0 4px;font-weight:600', text: fmt('lab.readout') }), dl)),
    h('details', { style: 'margin-top:10px' }, h('summary', { text: fmt('lab.modelTitle') }), h('p', { class: 'small', text: fmt('lab.model') })),
  );
  labUI = { L, R, O, perm, permWrap, insideNote, ratio, ton, burst, dl, last: '' };
}
function syncLabControls() {
  if (!labUI || !lab) return;
  const prm = lab.params, box = prm.mode === 'box', u = labUI;
  u.L.wrap.hidden = !box; u.R.wrap.hidden = !box; u.permWrap.hidden = !box;
  u.O.wrap.hidden = box; u.insideNote.hidden = box; u.ratio.hidden = box; u.ton.hidden = box;
  if (box) { u.L.inp.value = prm.left; u.L.o.textContent = prm.left; u.R.inp.value = prm.right; u.R.o.textContent = prm.right; u.perm.checked = prm.permeable; }
  else {
    u.O.inp.value = prm.outside; u.O.o.textContent = prm.outside;
    const r = prm.outside / ISO_OUTSIDE;
    u.ratio.textContent = fmt('lab.ratio', { r: r.toFixed(1) });
    u.ton.textContent = fmt(r < 0.9 ? 'lab.tonHypo' : r > 1.1 ? 'lab.tonHyper' : 'lab.tonIso');
  }
}
let readFrame = 0;
function syncReadout(force) {
  if (!labUI) return;
  if (!force && (readFrame++ % 8)) return;
  const r = lab.readout(), u = labUI;
  const rows = r.mode === 'box'
    ? [[fmt('lab.waterLeft'), r.waterA], [fmt('lab.waterRight'), r.waterB], [fmt('lab.soluteLeft'), r.soluteA], [fmt('lab.soluteRight'), r.soluteB],
       [fmt('lab.netWater'), r.net === 0 ? fmt('lab.netNone') : r.net > 0 ? fmt('lab.netRight', { n: r.net }) : fmt('lab.netLeft', { n: -r.net })], [fmt('lab.time'), fmt('lab.seconds', { t: r.t.toFixed(1) })]]
    : [[fmt('lab.waterIn'), r.waterB], [fmt('lab.waterOut'), r.waterA], [fmt('lab.netWater'), r.net === 0 ? fmt('lab.netNone') : r.net > 0 ? fmt('lab.netIn', { n: r.net }) : fmt('lab.netOut', { n: -r.net })],
       [fmt('lab.size'), r.burst ? '-' : `${Math.round(r.size * 100)}%`], [fmt('lab.time'), fmt('lab.seconds', { t: r.t.toFixed(1) })]];
  const key = JSON.stringify(rows);
  if (key !== u.last) { u.last = key; u.dl.replaceChildren(...rows.flatMap(([a, b]) => [h('dt', { text: a }), h('dd', { text: String(b) })])); }
  u.burst.hidden = !r.burst;
}

/* ---------- loop ---------- */
let last = 0;
function frame(ts) {
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
  if (CUR) {
    if (playing) {
      if (CUR.extra === 'lab') {
        lab.advance(dt);
        if (lab.time >= T_MAX - 1e-6) playing = false;
        syncReadout();
      } else {
        p += dt / STEP_SEC; T += dt; flowT += dt * (CUR.extra === 'light' ? rateOf(light) : 1);
        if (stopAt != null && p >= stopAt) { p = stopAt; stopAt = null; playing = false; }
        if (p >= n) { p = n; playing = false; }
      }
      dirty = true; syncStepUI();
    }
    if (dirty && ctx) { dirty = false; draw(); if (CUR.extra === 'lab') syncReadout(true); }
  }
  requestAnimationFrame(frame);
}
function draw() {
  if (CUR.extra === 'lab') { paint(cv, ctx, CUR.legend, (g) => lab.draw(g, labHelpers)); return; }
  const s = Math.min(n - 1, Math.floor(p)), u = p >= n ? 1 : p - s;
  const still = reduced();
  const opt = { T: still ? 1.3 : T, flowT: still ? 1.3 : flowT, rate: CUR.extra === 'light' ? rateOf(light) : 1 };
  paint(cv, ctx, CUR.legend, (g) => SCENES[CUR.id](g, s, still ? 0.999 : u, opt));
}

/* ---------- controls ---------- */
$('#play').addEventListener('click', () => togglePlay());
$('#prev').addEventListener('click', () => goStep(curStep() - 1, true));
$('#next').addEventListener('click', () => goStep(curStep() + 1, true));
const tl = $('#timeline');
tl.addEventListener('input', () => {
  if (!CUR) return;
  playing = false; stopAt = null;
  const v = +tl.value / 1000;
  if (CUR.extra === 'lab') lab.seek(v * T_MAX);
  else { p = Math.min(n, v * n); if (reduced()) p = Math.min(n - 1, Math.floor(p)) + 0.999; }
  dirty = true; syncStepUI();
});
tl.addEventListener('keydown', (e) => {
  if (!CUR || CUR.extra === 'lab') return;
  const map = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
  if (e.key in map) { e.preventDefault(); goStep(curStep() + map[e.key], true); }
  else if (e.key === 'Home') { e.preventDefault(); goStep(0, true); }
  else if (e.key === 'End') { e.preventDefault(); goStep(n - 1, true); }
});
document.addEventListener('keydown', (e) => {
  if (!CUR || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest && e.target.closest('input, select, textarea, button, a, summary, [contenteditable="true"]')) return;
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goStep(curStep() - 1, true); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goStep(curStep() + 1, true); }
  else if (e.key === 'Home') { e.preventDefault(); goStep(0, true); }
  else if (e.key === 'End') { e.preventDefault(); goStep(n - 1, true); }
});
new ResizeObserver(() => { dirty = true; }).observe($('#stage'));

boot();
