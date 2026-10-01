// The spark in a neuron. ES module: mount(mainEl) builds the page inside mainEl, unmount() tears it down.
// Four parts: (1) a membrane slice and a live voltage trace driven by the Hodgkin-Huxley model in hh.js,
// (2) resting potential from Nernst and Goldman with sourced concentrations, (3) a myelinated vs bare axon race with
// sourced speeds, (4) the real KcsA potassium channel atoms from PDB 1BL8 (kcsa.json, built by tools/spark_build.py).
// Everything is 2D canvas, so no WebGL is needed. Words from spark.json, citations from sources.json, zero external requests.

import { createCell, HH, nernst, goldman, ratioFor } from './hh.js';

const HERE = new URL('./', import.meta.url);
const DPR_CAP = 2;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (s, o = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const sgn = (v, d = 0) => (v > 0 ? '+' : '') + v.toFixed(d);

let inst = null;
export async function mount(mainEl, options = {}) {
  if (inst) unmount();
  inst = { stop: [], mainEl };
  try {
    const get = (f) => fetch(new URL(f, HERE)).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
    const [D, S, K] = await Promise.all([get('spark.json'), get('sources.json'), get('kcsa.json')]);
    build(mainEl, D, S.sources, K, options);
  } catch (e) {
    mainEl.replaceChildren(h('p', { class: 'sp-err' }, 'Sorry, this page could not load its data. ' + e.message));
  }
  mainEl.removeAttribute('aria-busy');
  return inst;
}
export function unmount() {
  if (!inst) return;
  for (const f of inst.stop) try { f(); } catch (e) { /* already gone */ }
  inst.mainEl.replaceChildren();
  inst = null;
}

/* ---------- DOM helpers ---------- */
function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

/* ---------- palette from CSS tokens, refreshed on theme change ---------- */
const PAL = {};
function readPal() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['ink', 'muted', 'line', 'accent', 'na', 'k', 'volt', 'stim', 'o', 'chain', 'stage', 'membrane', 'tail', 'protein', 'grid', 'raised', 'panel'])
    PAL[k] = cs.getPropertyValue('--sp-' + k).trim() || '#888';
  PAL.font = cs.getPropertyValue('--sp-font-ui').trim() || 'sans-serif';
  PAL.mono = cs.getPropertyValue('--sp-font-data').trim() || 'monospace';
  const bg = PAL.stage.replace('#', '');
  PAL.dark = bg.length >= 6 && (parseInt(bg.slice(0, 2), 16) + parseInt(bg.slice(2, 4), 16) + parseInt(bg.slice(4, 6), 16)) < 200;
}

/* ---------- canvas helper: size to CSS box with capped DPR ---------- */
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: r.width, H: r.height };
}

/* ======================================================================================== */
function build(root, D, SRC, KC, options) {
  const U = D.ui;
  readPal();

  // numbered citations, in order of first use
  const order = [];
  const cite = (ids) => {
    if (!ids || !ids.length) return null;
    const sp = h('span', { class: 'sp-cite' });
    ids.forEach((id, i) => {
      if (!SRC[id]) return;
      if (!order.includes(id)) order.push(id);
      const n = order.indexOf(id) + 1;
      if (i) sp.append(',');
      sp.append(h('a', { href: '#src-' + id, 'aria-label': 'Source ' + n + ': ' + SRC[id].cite }, '[' + n + ']'));
    });
    return sp;
  };
  const para = (text, s, cls) => h('p', { class: cls }, text, cite(s));

  root.replaceChildren();

  /* ---------- hero ---------- */
  root.append(h('header', { class: 'sp-hero' },
    h('p', { class: 'sp-eyebrow' }, U.eyebrow),
    h('h1', {}, U.title),
    h('p', { class: 'sp-lede' }, U.lede),
    h('p', { class: 'sp-note' }, h('span', { class: 'sp-tag' }, U.modelTag), U.modelNote, cite(['hh-1952', 'hh-cellml', 'hh-mod'])),
    h('nav', { 'aria-label': U.jump }, h('ul', { class: 'sp-jump' },
      [['lab', U.jumpLab], ['rest', U.jumpRest], ['race', U.jumpRace], ['channel', U.jumpChannel], ['learn', U.jumpLearn]]
        .map(([id, t]) => h('li', {}, h('a', { href: '#' + id }, t)))))));

  const loop = makeLoop();
  const lab = buildLab(root, D, U, cite, para, loop);
  buildRest(root, D, U, cite, para);
  const race = buildRace(root, D, U, cite, para, loop);
  const chan = buildChannel(root, D, U, cite, para, KC, loop);
  buildLearn(root, D, U, cite, para);

  // sources (last, so the order list is complete)
  const sl = h('ol', { class: 'sp-sources' });
  for (const id of Object.keys(SRC)) if (!order.includes(id)) order.push(id);
  for (const id of order) {
    const s = SRC[id];
    const href = s.url;
    sl.append(h('li', { id: 'src-' + id }, s.cite + ' ', href ? h('a', { href }, /^https?:/.test(href) ? href.replace(/^https?:\/\//, '') : href) : null));
  }
  root.append(h('section', { class: 'sp-sec', id: 'sources', 'aria-labelledby': 'h-src' },
    h('h2', { id: 'h-src' }, U.sourcesTitle), h('p', { class: 'sp-small' }, U.sourcesIntro), sl));

  // theme follow
  const repaint = () => { readPal(); lab.redraw(); race.redraw(); chan.redraw(); };
  const mo = new MutationObserver(repaint);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', repaint);
  const onResize = () => { lab.redraw(); race.redraw(); chan.redraw(); };
  window.addEventListener('resize', onResize);
  inst.stop.push(() => { mo.disconnect(); mq.removeEventListener('change', repaint); window.removeEventListener('resize', onResize); loop.destroy(); });
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
}

/* ---------- one animation loop; pauses when the tab is hidden ---------- */
function makeLoop() {
  const jobs = new Set();
  let raf = 0, last = 0;
  const tick = (now) => {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    let any = false;
    for (const j of jobs) if (j.active()) { j.frame(dt); any = true; }
    if (any && !document.hidden) raf = requestAnimationFrame(tick); else last = 0;
  };
  const kick = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); };
  const vis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', vis);
  return {
    add(job) { jobs.add(job); kick(); },
    kick,
    destroy() { if (raf) cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); jobs.clear(); },
  };
}
function watchVisible(el, cb) {
  if (!('IntersectionObserver' in window)) { cb(true); return; }
  const io = new IntersectionObserver((es) => { for (const e of es) cb(e.isIntersecting); }, { rootMargin: '80px' });
  io.observe(el);
  inst.stop.push(() => io.disconnect());
}

/* ======================================================================================== */
/* 1. Fire a neuron: membrane slice + live trace                                            */
/* ======================================================================================== */
function buildLab(root, D, U, cite, para, loop) {
  const PH = Object.fromEntries(D.phases.map((p) => [p.id, p]));
  const cell = createCell();
  const SPEEDS = [[U.speedSlow, 1], [U.speedMid, 3], [U.speedFast, 10]];
  const WINDOW = 30, SAMPLE = 0.05;
  let speed = 3, paused = false, visible = true, amp = 10, threshold = null;
  let samples = [], sinceSample = 0, lastSpikeT = -1e9, phase = 'rest', phaseShownAt = 0, prevV = cell.v, lastMs = 0.05;
  let pending = null, readoutAt = 0;
  const NA_SCALE = 0.35, K_SCALE = 0.45;    // drawn gate width at these open fractions = fully open look

  // DOM
  const memCv = h('canvas', { role: 'img', 'aria-label': U.membraneLabel });
  const trCv = h('canvas', { role: 'img', 'aria-label': U.traceLabel });
  const stimBtn = h('button', { class: 'sp-btn primary', type: 'button' }, U.stimulate);
  const pauseBtn = h('button', { class: 'sp-btn', type: 'button', 'aria-pressed': 'false' }, U.pause);
  const resetBtn = h('button', { class: 'sp-btn', type: 'button' }, U.reset);
  const ampIn = h('input', { type: 'range', id: 'sp-amp', min: '0', max: '20', step: '0.5', value: String(amp), 'aria-describedby': 'sp-amp-help' });
  const ampOut = h('output', { for: 'sp-amp' });
  const thrHint = h('small', { id: 'sp-amp-help' }, U.strengthHelp);
  const speedSel = h('select', { id: 'sp-speed' }, SPEEDS.map(([t, v]) => h('option', { value: String(v), selected: v === speed }, t)));
  const speedNote = h('small', {});
  const rV = h('span', { class: 'sp-val' }), rPh = h('span', {}), rNa = h('span', { class: 'sp-val' }), rK = h('span', { class: 'sp-val' });
  const readout = h('div', { class: 'sp-readout' },
    h('span', {}, h('b', {}, U.voltage), rV), h('span', {}, h('b', {}, U.phase), rPh),
    h('span', {}, h('b', {}, U.naOpen), rNa), h('span', {}, h('b', {}, U.kOpen), rK));
  const srReadout = h('p', { class: 'sr-only', 'aria-live': 'off' });
  const said = h('p', { class: 'sp-said', 'aria-live': 'polite', role: 'status' });
  const phName = h('h3', {}), phText = h('p', {}), phCite = h('span', {});
  const phaseBox = h('div', { class: 'sp-phase' }, phName, h('p', {}, phText, phCite));
  const gate = (label, cls) => { const i = h('i'); const v = h('span', { class: 'sp-val' }); return { row: h('div', { class: 'sp-gate' }, h('span', {}, label), h('span', { class: 'sp-bar ' + cls, 'aria-hidden': 'true' }, i), v), i, v }; };
  const gM = gate(U.gateM, 'na'), gH = gate(U.gateH, 'na'), gN = gate(U.gateN, 'k');
  const steps = h('ol', { class: 'sp-steps' }, D.phases.map((p) => h('li', { 'data-id': p.id }, h('b', {}, p.name + '. '), p.text, cite(p.s))));
  const partsDl = h('dl', { class: 'sp-parts' }, Object.entries(D.parts).flatMap(([k, p]) => [h('dt', {}, U[k]), h('dd', {}, p.text, cite(p.s))]));

  const sec = h('section', { class: 'sp-sec', id: 'lab', 'aria-labelledby': 'h-lab' },
    h('h2', { id: 'h-lab' }, U.labTitle),
    h('p', { class: 'sp-intro' }, U.labIntro),
    h('div', { class: 'sp-grid2' },
      h('div', { class: 'sp-stage sp-membrane' }, memCv),
      h('div', { class: 'sp-stage sp-trace' }, trCv)),
    h('div', { class: 'sp-controls' },
      stimBtn,
      h('div', { class: 'sp-field' }, h('label', { for: 'sp-amp' }, U.strength, ' ', ampOut), ampIn, thrHint),
      h('div', { class: 'sp-field', style: 'flex:0 1 200px;min-width:160px' }, h('label', { for: 'sp-speed' }, U.speed), speedSel, speedNote),
      pauseBtn, resetBtn),
    said, readout, srReadout,
    h('p', { class: 'sp-small' }, U.tryTwice),
    phaseBox,
    h('div', { class: 'sp-gates' }, h('h3', {}, U.gatesTitle), gM.row, gH.row, gN.row, h('p', { class: 'sp-small' }, U.gatesNote, cite(['hh-mod', 'hh-cellml']))),
    h('p', { class: 'sp-small' }, h('span', { class: 'sp-tag illus' }, U.illustrative), U.illusMembrane),
    h('details', { class: 'sp-more' }, h('summary', {}, U.phasesTitle), h('p', { class: 'sp-small' }, U.phasesIntro), steps),
    h('details', { class: 'sp-more' }, h('summary', {}, U.pump + ', ' + U.naChan + ', ' + U.kChan + ', ' + U.leak), partsDl));
  root.append(sec);

  const setAmpText = () => { ampOut.textContent = fmt(U.strengthValue, { v: amp.toFixed(1) }); };
  const setSpeedText = () => { speedNote.textContent = fmt(U.speedNote, { ms: speed }); };
  setAmpText(); setSpeedText();
  ampIn.addEventListener('input', () => { amp = parseFloat(ampIn.value); setAmpText(); });
  speedSel.addEventListener('change', () => { speed = parseFloat(speedSel.value); setSpeedText(); });
  pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? U.play : U.pause; pauseBtn.setAttribute('aria-pressed', String(paused)); if (!paused) loop.kick(); });
  resetBtn.addEventListener('click', () => { cell.reset(); samples = []; lastSpikeT = -1e9; pending = null; fluxes.length = 0; said.textContent = ''; setPhase('rest', true); redraw(); });
  stimBtn.addEventListener('click', () => {
    cell.pulse(amp, 1);
    pending = { t0: cell.t, h0: cell.h, refr: cell.t - lastSpikeT < 15, peak: -1e9, spiked: false };
    said.textContent = '';
    if (paused) { paused = false; pauseBtn.textContent = U.pause; pauseBtn.setAttribute('aria-pressed', 'false'); }
    if (reduceMotion()) { runFor(25); }
    loop.kick();
  });

  // live threshold for the hint (computed from the model, 1 ms pulse)
  setTimeout(() => {
    let lo = 0, hi = 30;
    const fires = (a) => { const c = createCell(); c.pulse(a, 1); for (let i = 0; i < 1200; i++) { c.step(0.01); if (c.v > 0) return true; } return false; };
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (fires(m)) hi = m; else lo = m; }
    threshold = hi;
    thrHint.textContent = U.strengthHelp + ' ' + fmt(U.thresholdHint, { v: hi.toFixed(1) });
  }, 50);

  /* ---- ions ---- */
  const ions = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  // counts follow the direction of Table 35.1 (Na+ mostly outside, K+ mostly inside), not its exact numbers
  for (let i = 0; i < 34; i++) ions.push({ t: 'na', side: 0, x: Math.random(), y: Math.random() });
  for (let i = 0; i < 3; i++) ions.push({ t: 'k', side: 0, x: Math.random(), y: Math.random() });
  for (let i = 0; i < 34; i++) ions.push({ t: 'k', side: 1, x: Math.random(), y: Math.random() });
  for (let i = 0; i < 3; i++) ions.push({ t: 'na', side: 1, x: Math.random(), y: Math.random() });
  const fluxes = [];   // ions crossing: {t, x, dir (+1 = inward), p 0..1, speed}
  const acc = { na: 0, k: 0, leak: 0 };
  let pumpPhase = 0;
  const CH = { pump: 0.13, na: 0.40, k: 0.64, leak: 0.87 };

  function spawnFlux(dtModel) {
    // rate per model ms proportional to the current through each channel; sign gives the direction
    const r = 0.05;
    acc.na += Math.abs(cell.iNa) * r * dtModel;
    acc.k += Math.abs(cell.iK) * r * dtModel;
    acc.leak += 0.25 * dtModel;
    const add = (t, x, dir) => { if (fluxes.length < 140) fluxes.push({ t, x: x + rnd(-0.008, 0.008), dir, p: 0, sp: rnd(1.2, 1.8) }); };
    while (acc.na >= 1) { acc.na -= 1; add('na', CH.na, cell.iNa < 0 ? 1 : -1); }
    while (acc.k >= 1) { acc.k -= 1; add('k', CH.k, cell.iK > 0 ? -1 : 1); }
    while (acc.leak >= 1) { acc.leak -= 1; add('k', CH.leak, -1); }
  }

  /* ---- model stepping and phase tracking ---- */
  function advanceModel(ms) {
    let left = ms;
    while (left > 1e-9) {
      const d = Math.min(0.01, left);
      const vBefore = cell.v;
      cell.step(d); left -= d;
      if (vBefore < 0 && cell.v >= 0) lastSpikeT = cell.t;
      sinceSample += d;
      if (sinceSample >= SAMPLE) {
        sinceSample -= SAMPLE;
        samples.push({ t: cell.t, v: cell.v, na: cell.m ** 3 * cell.h, k: cell.n ** 4, s: cell.iStim > 0 ? 1 : 0 });
      }
      if (pending) {
        pending.peak = Math.max(pending.peak, cell.v);
        if (!pending.spiked && cell.v > 0) { pending.spiked = true; said.textContent = fmt(U.saidSpike, { peak: sgn(Math.round(maxAhead())) }); }
        if (cell.t - pending.t0 > 8) {
          if (!pending.spiked) said.textContent = pending.refr ? U.saidRefractory : fmt(U.saidNoSpike, { peak: sgn(Math.round(pending.peak)) });
          pending = null;
        }
      }
    }
    while (samples.length && samples[0].t < cell.t - WINDOW) samples.shift();
  }
  // peak of the coming spike, looked up on a copy of the model so the message can be said at once
  function maxAhead() {
    const c = createCell(); Object.assign(c, { t: cell.t, v: cell.v, m: cell.m, h: cell.h, n: cell.n, pulses: cell.pulses.slice() });
    let p = c.v; for (let i = 0; i < 300; i++) { c.step(0.01); p = Math.max(p, c.v); }
    return p;
  }
  function runFor(ms) { advanceModel(ms); spawnFlux(0); updateText(true); redraw(); }

  function classify() {
    const dv = (cell.v - prevV) / Math.max(1e-6, lastMs);  // mV per model ms
    const since = cell.t - lastSpikeT;
    const rest = HH.rest;
    if (cell.v > -50 && dv > 3) return 'rise';
    if (since < 30) {
      if (cell.v > 10) return 'peak';
      if (dv < -0.5 && cell.v > rest) return 'fall';
      if (cell.v < rest - 0.8) return 'under';
      if (cell.h < 0.45) return 'refr';
      return 'pump';
    }
    if (cell.iStim > 0 || cell.v > rest + 0.8) return 'push';
    return 'rest';
  }
  function setPhase(id, force) {
    const now = performance.now();
    if (!force && (id === phase || now - phaseShownAt < 180)) return;
    phase = id; phaseShownAt = now;
    const p = PH[id];
    phName.textContent = p.name;
    phText.textContent = p.text;
    phCite.replaceChildren(cite(p.s) || '');
    for (const li of steps.children) li.classList.toggle('on', li.dataset.id === id);
  }
  function updateText(force) {
    const now = performance.now();
    if (!force && now - readoutAt < 220) return;
    readoutAt = now;
    const na = Math.round(cell.m ** 3 * cell.h * 100), k = Math.round(cell.n ** 4 * 100);
    rV.textContent = fmt(U.mv, { v: sgn(cell.v, 1) });
    rPh.textContent = PH[phase].short;
    rNa.textContent = fmt(U.pct, { v: na });
    rK.textContent = fmt(U.pct, { v: k });
    srReadout.textContent = fmt(U.readout, { v: sgn(cell.v, 0), phase: PH[phase].name, na: na + '%', k: k + '%' });
    for (const [g, x] of [[gM, cell.m], [gH, cell.h], [gN, cell.n]]) { g.i.style.width = (x * 100).toFixed(1) + '%'; g.v.textContent = x.toFixed(2); }
  }

  /* ---- drawing: membrane slice ---- */
  function drawMembrane(dt) {
    const { ctx, W, H } = fitCanvas(memCv);
    const still = reduceMotion();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAL.stage; ctx.fillRect(0, 0, W, H);
    const mTop = H * 0.43, mBot = H * 0.59, mid = (mTop + mBot) / 2;
    const s = Math.max(0.7, Math.min(1.4, W / 620));
    // bands: outside / inside tint
    ctx.fillStyle = PAL.dark ? 'rgba(255,190,90,0.05)' : 'rgba(255,170,40,0.06)'; ctx.fillRect(0, 0, W, mTop);
    ctx.fillStyle = PAL.dark ? 'rgba(160,120,255,0.07)' : 'rgba(110,60,220,0.05)'; ctx.fillRect(0, mBot, W, H - mBot);
    // lipid bilayer
    const headR = 4.2 * s, step = headR * 2.3;
    ctx.strokeStyle = PAL.tail; ctx.lineWidth = 1.4 * s;
    for (let x = headR; x < W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, mTop + headR); ctx.lineTo(x, mid - 1); ctx.moveTo(x, mBot - headR); ctx.lineTo(x, mid + 1); ctx.stroke();
    }
    ctx.fillStyle = PAL.membrane;
    for (let x = headR; x < W; x += step) { circle(ctx, x, mTop + headR, headR); circle(ctx, x, mBot - headR, headR); }
    // charge signs on each face: outside positive at rest, flips when the inside goes positive
    const v = cell.v, a = clamp(Math.abs(v) / 70, 0.15, 1);
    ctx.lineWidth = 2 * s;
    for (let x = step * 1.5; x < W; x += step * 3.2) {
      sign(ctx, x, mTop - 8 * s, v < 0, s, `rgba(${v < 0 ? '220,60,50' : '60,110,220'},${a})`);
      sign(ctx, x, mBot + 8 * s, v >= 0, s, `rgba(${v >= 0 ? '220,60,50' : '60,110,220'},${a})`);
    }
    // proteins
    const pw = 30 * s;
    const prot = (cx, gap, col) => {
      ctx.fillStyle = col;
      const half = (pw - gap) / 2;
      rrect(ctx, cx - pw / 2 - 2 * s, mTop - 10 * s, half, mBot - mTop + 20 * s, 6 * s);
      rrect(ctx, cx + gap / 2 + 2 * s, mTop - 10 * s, half, mBot - mTop + 20 * s, 6 * s);
    };
    const naOpen = clamp(cell.m ** 3 / NA_SCALE, 0, 1), hOpen = clamp(cell.h / 0.6, 0, 1), kOpen = clamp(cell.n ** 4 / K_SCALE, 0, 1);
    // Na+ channel: activation gate (gap) and inactivation ball on the inside
    const xNa = W * CH.na, xK = W * CH.k, xL = W * CH.leak, xP = W * CH.pump;
    prot(xNa, 3 * s + naOpen * 12 * s, PAL.dark ? '#7a5a2a' : '#e6b36a');
    const ballX = xNa - pw / 2 - 6 * s + (1 - hOpen) * (pw / 2 + 6 * s), ballY = mBot + 14 * s - (1 - hOpen) * 6 * s;
    ctx.strokeStyle = PAL.dark ? '#c99a52' : '#a87a32'; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(xNa - pw / 2, mBot + 6 * s); ctx.quadraticCurveTo(xNa - pw / 2 - 4 * s, mBot + 16 * s, ballX, ballY); ctx.stroke();
    ctx.fillStyle = PAL.dark ? '#c99a52' : '#a87a32'; circle(ctx, ballX, ballY, 6 * s);
    // K+ channel
    prot(xK, 3 * s + kOpen * 11 * s, PAL.dark ? '#5a4690' : '#b8a2f0');
    // leak channel (always a little open)
    prot(xL, 7 * s, PAL.dark ? '#4a3a70' : '#d6c8f8');
    // pump: a rocking body
    pumpPhase += (still ? 0 : dt) * 0.7;
    const rock = Math.sin(pumpPhase * Math.PI * 2) * 3 * s;
    ctx.fillStyle = PAL.protein; rrect(ctx, xP - pw * 0.75, mTop - 14 * s + rock, pw * 1.5, mBot - mTop + 28 * s, 10 * s);
    ctx.fillStyle = PAL.dark ? '#a8c4d4' : '#3c5a6b'; ctx.font = `700 ${10 * s}px ${PAL.font}`; ctx.textAlign = 'center';
    ctx.fillText('ATP', xP, mid + 4 * s);
    // pump cargo: 3 Na+ go out, 2 K+ come in, one cycle per turn (slowed down)
    const cyc = pumpPhase % 1;
    if (!still) {
      for (let i = 0; i < 3; i++) { const y = mBot + 10 * s - cyc * (mBot - mTop + 30 * s); ion(ctx, xP - 9 * s + i * 9 * s, y, 'na', s, 1 - Math.abs(cyc - 0.5) * 0.6); }
      for (let i = 0; i < 2; i++) { const y = mTop - 10 * s + cyc * (mBot - mTop + 30 * s); ion(ctx, xP - 5 * s + i * 10 * s, y, 'k', s, 1 - Math.abs(cyc - 0.5) * 0.6); }
    }
    // bath ions
    const topH = mTop - 22 * s, botY = mBot + 22 * s, botH = H - botY - 4;
    for (const p of ions) {
      if (!still) { p.x += rnd(-1, 1) * 0.004 * dt * 30; p.y += rnd(-1, 1) * 0.006 * dt * 30; p.x = (p.x + 1) % 1; p.y = clamp(p.y, 0.04, 0.96); }
      const y = p.side === 0 ? 4 + p.y * topH : botY + p.y * botH;
      ion(ctx, p.x * W, y, p.t, s, 0.85);
    }
    // crossing ions
    for (let i = fluxes.length - 1; i >= 0; i--) {
      const f = fluxes[i];
      if (!still) f.p += dt * f.sp;
      if (f.p >= 1) { fluxes.splice(i, 1); continue; }
      const y0 = f.dir > 0 ? mTop - 30 * s : mBot + 30 * s, y1 = f.dir > 0 ? mBot + 40 * s : mTop - 40 * s;
      const x = f.x * W, y = y0 + (y1 - y0) * f.p;
      ion(ctx, x, y, f.t, s * 1.15, f.p > 0.8 ? (1 - f.p) * 5 : 1, true);
    }
    // arrows when motion is reduced: thickness follows the current
    if (still) {
      arrow(ctx, xNa, mid, cell.iNa < 0 ? 1 : -1, Math.min(1, Math.abs(cell.iNa) / 300), PAL.na, s, mTop, mBot);
      arrow(ctx, xK, mid, cell.iK > 0 ? -1 : 1, Math.min(1, Math.abs(cell.iK) / 300), PAL.k, s, mTop, mBot);
    }
    // labels
    ctx.textAlign = 'left'; ctx.fillStyle = PAL.muted; ctx.font = `600 ${11.5 * s}px ${PAL.font}`;
    ctx.fillText(D.ui.outside, 8, 16 * s);
    ctx.fillText(D.ui.inside, 8, H - 8);
    ctx.textAlign = 'center'; ctx.fillStyle = PAL.ink; ctx.font = `600 ${10.5 * s}px ${PAL.font}`;
    const lab = (t, x, y) => { const w = ctx.measureText(t).width + 8; ctx.fillStyle = PAL.dark ? 'rgba(10,20,24,0.78)' : 'rgba(255,255,255,0.85)'; rrect(ctx, x - w / 2, y - 11 * s, w, 15 * s, 4); ctx.fillStyle = PAL.ink; ctx.fillText(t, x, y); };
    lab(D.ui.pump, xP, mTop - 22 * s); lab(D.ui.naChan, xNa, mTop - 22 * s); lab(D.ui.kChan, xK, mTop - 22 * s); lab(D.ui.leak, xL, mTop - 22 * s);
    // legend
    const lgY = H - 10 * s, lgX = W - 10;
    ctx.textAlign = 'right'; ctx.font = `600 ${11 * s}px ${PAL.font}`;
    ctx.fillStyle = PAL.ink; ctx.fillText(D.ui.kIon, lgX, lgY); ion(ctx, lgX - ctx.measureText(D.ui.kIon).width - 9 * s, lgY - 4 * s, 'k', s, 1);
    const off = ctx.measureText(D.ui.kIon).width + 26 * s;
    ctx.fillStyle = PAL.ink; ctx.fillText(D.ui.naIon, lgX - off, lgY); ion(ctx, lgX - off - ctx.measureText(D.ui.naIon).width - 9 * s, lgY - 4 * s, 'na', s, 1);
  }
  const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  function rrect(ctx, x, y, w, hgt, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, hgt, r) : ctx.rect(x, y, w, hgt); ctx.fill(); }
  function sign(ctx, x, y, plus, s, col) {
    ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x - 4 * s, y); ctx.lineTo(x + 4 * s, y);
    if (plus) { ctx.moveTo(x, y - 4 * s); ctx.lineTo(x, y + 4 * s); }
    ctx.stroke();
  }
  function ion(ctx, x, y, t, s, alpha, ring) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = t === 'na' ? PAL.na : PAL.k;
    circle(ctx, x, y, (t === 'na' ? 3.6 : 4.4) * s);
    if (ring) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 5.6 * s, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function arrow(ctx, x, y, dir, mag, col, s, mTop, mBot) {
    if (mag < 0.02) return;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = (2 + 8 * mag) * s;
    const y0 = dir > 0 ? mTop - 40 * s : mBot + 40 * s, y1 = dir > 0 ? mBot + 34 * s : mTop - 34 * s;
    ctx.beginPath(); ctx.moveTo(x + 22 * s, y0); ctx.lineTo(x + 22 * s, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 22 * s, y1 + dir * 8 * s); ctx.lineTo(x + 14 * s, y1 - dir * 4 * s); ctx.lineTo(x + 30 * s, y1 - dir * 4 * s); ctx.fill();
  }

  /* ---- drawing: voltage trace ---- */
  function drawTrace() {
    const { ctx, W, H } = fitCanvas(trCv);
    const s = Math.max(0.75, Math.min(1.2, W / 560));
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAL.stage; ctx.fillRect(0, 0, W, H);
    const L = 42 * s, R = 10, T = 26 * s, gH = H * 0.2, B = H - 26 * s - gH - 10 * s;
    const vMin = -90, vMax = 60;
    const xOf = (t) => L + (1 - (cell.t - t) / WINDOW) * (W - L - R);
    const yOf = (v) => T + (vMax - v) / (vMax - vMin) * (B - T);
    ctx.font = `${10.5 * s}px ${PAL.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = PAL.grid; ctx.lineWidth = 1;
    for (let v = -80; v <= 60; v += 20) { const y = yOf(v); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.fillStyle = PAL.muted; ctx.fillText(String(v), L - 6, y); }
    ctx.textAlign = 'left'; ctx.fillStyle = PAL.muted; ctx.fillText(D.ui.axisMv, 4, T - 14 * s);
    // reference lines: rest, Na+ and K+ balance points of the model
    const ref = (v, col, label) => { const y = yOf(v); ctx.setLineDash([5, 4]); ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(label, W - R - 2, y - 8 * s); };
    ref(HH.eNa, PAL.na, D.ui.lineNa + ' ' + sgn(HH.eNa)); ref(HH.eK, PAL.k, D.ui.lineK + ' ' + HH.eK); ref(HH.rest, PAL.muted, D.ui.lineRest + ' ' + HH.rest);
    // voltage
    ctx.strokeStyle = PAL.volt; ctx.lineWidth = 2.6 * s; ctx.lineJoin = 'round'; ctx.beginPath();
    let first = true;
    for (const p of samples) { const x = xOf(p.t), y = yOf(p.v); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
    ctx.lineTo(xOf(cell.t), yOf(cell.v)); ctx.stroke();
    ctx.fillStyle = PAL.volt; circle(ctx, xOf(cell.t), yOf(cell.v), 4 * s);
    // channels strip: fraction open (0 to 0.6)
    const g0 = B + 10 * s, g1 = g0 + gH;
    ctx.strokeStyle = PAL.grid; ctx.strokeRect(L, g0, W - L - R, gH);
    const yG = (f) => g1 - clamp(f / 0.6, 0, 1) * gH;
    for (const [key, col] of [['na', PAL.na], ['k', PAL.k]]) {
      ctx.strokeStyle = col; ctx.lineWidth = 2 * s; ctx.beginPath(); first = true;
      for (const p of samples) { const x = xOf(p.t), y = yG(p[key]); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // stimulus marks
    ctx.fillStyle = PAL.stim;
    for (const p of samples) if (p.s) ctx.fillRect(xOf(p.t) - 1, g1 + 3 * s, 2.5, 6 * s);
    // time ticks
    ctx.fillStyle = PAL.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let a = 0; a <= WINDOW; a += 10) ctx.fillText(a ? String(a) : '0', xOf(cell.t - a), g1 + 11 * s);
    ctx.textAlign = 'left'; ctx.fillText(D.ui.axisMs, L, H - 13 * s);
    // legend
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `600 ${11 * s}px ${PAL.font}`;
    let lx = L;
    for (const [t, col] of [[D.ui.legendV, PAL.volt], [D.ui.legendNa, PAL.na], [D.ui.legendK, PAL.k], [D.ui.legendStim, PAL.stim]]) {
      ctx.fillStyle = col; ctx.fillRect(lx, 9 * s, 12 * s, 4 * s); ctx.fillStyle = PAL.ink; ctx.fillText(t, lx + 16 * s, 11 * s);
      lx += ctx.measureText(t).width + 30 * s;
      if (lx > W - 80) break;
    }
    ctx.textBaseline = 'alphabetic';
  }

  function redraw(dt = 0) { drawMembrane(dt); drawTrace(); }

  loop.add({
    active: () => visible && !paused,
    frame(dt) {
      prevV = cell.v;
      const ms = dt * speed; lastMs = ms;
      advanceModel(ms);
      spawnFlux(ms);
      setPhase(classify());
      updateText();
      redraw(dt);
    },
  });
  watchVisible(sec, (v) => { visible = v; if (v) loop.kick(); });
  // fill the trace with a little resting line so it is not empty at first
  advanceModel(2);
  setPhase('rest', true); updateText(true); redraw();
  return { redraw: () => redraw(0) };
}

/* ======================================================================================== */
/* 2. Why rest is negative: Nernst and Goldman                                               */
/* ======================================================================================== */
function buildRest(root, D, U, cite, para) {
  const C = D.concentrations, T = C.tempC;
  const row = (ion) => C.rows.find((r) => r.ion === ion);
  const na = row('Na+'), k = row('K+');
  const eK = nernst(k.out, k.in, 1, T), eNa = nernst(na.out, na.in, 1, T);
  const r70 = ratioFor(-70, k.out, k.in, na.out, na.in, T);
  const table = h('table', { class: 'sp-table' },
    h('caption', { class: 'sr-only' }, U.concTitle),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, U.concIon), h('th', { scope: 'col', class: 'num' }, U.concOut), h('th', { scope: 'col', class: 'num' }, U.concIn))),
    h('tbody', {}, C.rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.ion), h('td', { class: 'num' }, String(r.out)), h('td', { class: 'num' }, String(r.in))))));
  // slider: log scale for the Na:K leak ratio, from 1 to 1000 down to 1 to 1
  const toR = (x) => Math.pow(10, -3 + 3 * x / 1000);
  const toX = (r) => Math.round((Math.log10(r) + 3) / 3 * 1000);
  const slider = h('input', { type: 'range', id: 'sp-ratio', min: '0', max: '1000', step: '1', value: String(toX(0.2)) });
  const ratioOut = h('output', { for: 'sp-ratio' });
  const result = h('p', { class: 'sp-big', 'aria-live': 'polite' });
  const scale = h('div', { class: 'sp-scale', 'aria-hidden': 'true' });
  const VMIN = -110, VMAX = 80;
  const pos = (v) => ((v - VMIN) / (VMAX - VMIN) * 100).toFixed(2) + '%';
  const mkK = h('span', { class: 'mk', style: `left:${pos(eK)};color:var(--sp-k)` }, 'K+ ' + eK.toFixed(0));
  const mkNa = h('span', { class: 'mk', style: `left:${pos(eNa)};color:var(--sp-na)` }, 'Na+ ' + sgn(eNa, 0));
  const mkV = h('span', { class: 'mk v' });
  scale.append(h('span', { class: 'track' }), mkK, mkNa, mkV);
  const update = () => {
    const r = toR(parseFloat(slider.value));
    const v = goldman(k.out, k.in, na.out, na.in, r, T);
    ratioOut.textContent = fmt(U.ratioValue, { v: (1 / r) < 10 ? (1 / r).toFixed(1) : Math.round(1 / r) });
    result.textContent = fmt(U.goldmanResult, { v: sgn(v, 1) });
    mkV.style.left = pos(v); mkV.textContent = sgn(v, 0);
  };
  slider.addEventListener('input', update);
  const setBtn = h('button', { class: 'sp-btn', type: 'button', onclick: () => { slider.value = String(toX(r70)); update(); } }, U.goldmanSet);
  root.append(h('section', { class: 'sp-sec', id: 'rest', 'aria-labelledby': 'h-rest' },
    h('h2', { id: 'h-rest' }, U.restTitle),
    para(U.restIntro, ['ibn-2-4', 'chem-17-4'], 'sp-intro'),
    h('div', { class: 'sp-grid2' },
      h('div', {},
        h('h3', {}, U.concTitle), h('div', { class: 'sp-tablewrap' }, table), para(C.note, ['bio-35-2'], 'sp-small'),
        h('h3', {}, U.nernstTitle),
        h('p', { class: 'sp-formula' }, U.nernstFormula),
        h('ul', {}, h('li', {}, fmt(U.nernstK, { v: eK.toFixed(1) })), h('li', {}, fmt(U.nernstNa, { v: sgn(eNa, 1) }))),
        h('p', { class: 'sp-small' }, 'T = 37 °C, R = 8.314 J/(mol K), F = 96,485 C/mol', cite(['ap-1-5', 'nist-r', 'nist-f', 'chem-17-4']))),
      h('div', {},
        h('h3', {}, U.goldmanTitle),
        para(U.goldmanIntro, ['ibn-2-4', 'bio-35-2']),
        h('div', { class: 'sp-field' }, h('label', { for: 'sp-ratio' }, U.ratio, ' ', ratioOut), slider),
        scale, result, setBtn,
        para(fmt(U.goldmanBack, { x: Math.round(1 / r70) }), ['ap-12-4', 'bio-35-2']),
        h('p', { class: 'sp-formula' }, U.goldmanFormula),
        h('p', { class: 'sp-small' }, h('span', { class: 'sp-tag illus' }, U.illustrative), U.goldmanSimple)))));
  update();
}

/* ======================================================================================== */
/* 3. The speed race                                                                          */
/* ======================================================================================== */
function buildRace(root, D, U, cite, para, loop) {
  const F = D.fibres, vFast = F.raceFast, vSlow = F.raceSlow;
  const tFast = 1 / vFast * 1000, tSlow = 1 / vSlow * 1000;        // ms over 1 m
  const SLOW = 150;                                                 // shown this many times slower
  const NODES = 12;
  let running = false, tModel = 0, visible = true, done = false, flash = 0, lastNode = -1;
  const cv = h('canvas', { role: 'img', 'aria-label': U.raceLabel });
  const btn = h('button', { class: 'sp-btn primary', type: 'button' }, U.race);
  const res = h('p', { 'aria-live': 'polite', class: 'sp-big', style: 'font-size:17px' });
  const tbl = h('table', { class: 'sp-table' },
    h('caption', { class: 'sr-only' }, U.fibreTitle),
    h('thead', {}, h('tr', {}, [U.fibreType, U.fibreWidth, U.fibreSpeed, U.fibreMyelin].map((t, i) => h('th', { scope: 'col', class: i === 1 || i === 2 ? 'num' : null }, t)))),
    h('tbody', {}, F.rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.type), h('td', { class: 'num' }, r.width), h('td', { class: 'num' }, r.speed), h('td', {}, r.myelin ? U.yes : U.no)))));
  const sec = h('section', { class: 'sp-sec', id: 'race', 'aria-labelledby': 'h-race' },
    h('h2', { id: 'h-race' }, U.raceTitle),
    para(U.raceIntro, ['ap-12-4', 'ibn-2-4'], 'sp-intro'),
    h('div', { class: 'sp-stage sp-race' }, cv),
    h('div', { class: 'sp-controls' }, btn, h('span', { class: 'sp-small' }, fmt(U.raceSlowed, { x: SLOW }))),
    res,
    h('h3', {}, U.fibreTitle), h('div', { class: 'sp-tablewrap' }, tbl), para(F.extra, F.s, 'sp-small'),
    h('p', { class: 'sp-small' }, h('span', { class: 'sp-tag illus' }, U.illustrative), U.raceNote));
  root.append(sec);
  const finish = () => {
    done = true; running = false;
    res.textContent = fmt(U.raceResult, { fast: tFast.toFixed(1), slow: Math.round(tSlow), ratio: Math.round(tSlow / tFast), cm: (vSlow * tFast / 1000 * 100).toFixed(1) });
    btn.textContent = U.raceAgain;
  };
  btn.addEventListener('click', () => {
    tModel = 0; done = false; lastNode = -1; res.textContent = '';
    if (reduceMotion()) { tModel = tFast; finish(); draw(); return; }
    running = true; loop.kick();
  });
  function draw() {
    const { ctx, W, H } = fitCanvas(cv);
    const s = Math.max(0.75, Math.min(1.3, W / 700));
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = PAL.stage; ctx.fillRect(0, 0, W, H);
    const L = 16, R = 16, len = W - L - R;
    const lanes = [H * 0.36, H * 0.8];
    const fracFast = clamp(tModel / tFast, 0, 1), fracSlow = clamp(tModel * vSlow / 1000, 0, 1);
    ctx.textAlign = 'left'; ctx.font = `600 ${12.5 * s}px ${PAL.font}`; ctx.fillStyle = PAL.ink;
    ctx.fillText(fmt(U.laneFast, { v: vFast }), L, lanes[0] - 26 * s);
    ctx.fillText(fmt(U.laneSlow, { v: vSlow }), L, lanes[1] - 22 * s);
    ctx.textAlign = 'right'; ctx.fillStyle = PAL.muted; ctx.font = `${11 * s}px ${PAL.font}`; ctx.fillText(U.raceDistance, W - R, 16 * s);
    // axon cores
    const axon = (y, th) => { ctx.fillStyle = PAL.dark ? '#5a3a26' : '#c9a07a'; ctx.fillRect(L, y - th / 2, len, th); };
    axon(lanes[0], 6 * s); axon(lanes[1], 5 * s);
    // myelin bands with node gaps
    const seg = len / NODES, gap = 6 * s;
    for (let i = 0; i < NODES; i++) { ctx.fillStyle = PAL.dark ? '#d9d2bd' : '#f5edd5'; ctx.strokeStyle = PAL.dark ? '#8a8270' : '#cbbf9b'; ctx.lineWidth = 1; const x = L + i * seg + gap / 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, lanes[0] - 11 * s, seg - gap, 22 * s, 9 * s) : ctx.rect(x, lanes[0] - 11 * s, seg - gap, 22 * s); ctx.fill(); ctx.stroke(); }
    // fast signal: jumps node to node
    const node = Math.min(NODES, Math.floor(fracFast * NODES + 1e-9));
    if (node !== lastNode) { lastNode = node; flash = 1; }
    if (tModel > 0) {
      for (let i = 0; i <= node; i++) {
        const x = L + i * seg, a = i === node ? 0.35 + 0.65 * flash : 0.18;
        ctx.fillStyle = PAL.volt; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, lanes[0], (i === node ? 10 : 5) * s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // slow signal: a creeping glow
      const xs = L + fracSlow * len;
      const g = ctx.createLinearGradient(Math.max(L, xs - 60 * s), 0, xs + 1, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, PAL.volt);
      ctx.fillStyle = g; ctx.fillRect(Math.max(L, xs - 60 * s), lanes[1] - 4 * s, Math.min(60 * s, xs - L) + 1, 8 * s);
      ctx.fillStyle = PAL.volt; ctx.beginPath(); ctx.arc(xs, lanes[1], 6 * s, 0, Math.PI * 2); ctx.fill();
    }
    // finish line
    ctx.strokeStyle = PAL.stim; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(W - R, 22 * s); ctx.lineTo(W - R, H - 8); ctx.stroke(); ctx.setLineDash([]);
    // clocks
    ctx.textAlign = 'right'; ctx.font = `600 ${12 * s}px ${PAL.mono}`; ctx.fillStyle = PAL.ink;
    ctx.fillText(fmt(U.ms, { v: Math.min(tModel, tFast).toFixed(1) }), W - R - 6, lanes[0] + 30 * s);
    ctx.fillText(fmt(U.ms, { v: tModel.toFixed(1) }), W - R - 6, lanes[1] + 24 * s);
  }
  loop.add({
    active: () => running && visible,
    frame(dt) {
      tModel += dt * 1000 / SLOW;
      flash = Math.max(0, flash - dt * 4);
      if (tModel >= tFast) { tModel = tFast; finish(); }
      draw();
    },
  });
  watchVisible(sec, (v) => { visible = v; if (v) loop.kick(); });
  draw();
  return { redraw: draw };
}

/* ======================================================================================== */
/* 4. The real potassium channel (KcsA, PDB 1BL8), drawn in 2D with depth sorting            */
/* ======================================================================================== */
function buildChannel(root, D, U, cite, para, KC, loop) {
  const cv = h('canvas', { tabindex: '0', role: 'img', 'aria-label': U.chanLabel, class: '' });
  const spinBtn = h('button', { class: 'sp-btn', type: 'button', 'aria-pressed': 'false' }, U.chanSpin);
  const openBtn = h('button', { class: 'sp-btn primary', type: 'button', 'aria-pressed': 'false' }, U.chanOpen);
  const resetBtn = h('button', { class: 'sp-btn', type: 'button' }, U.chanReset);
  const M = KC.measured;
  const facts = h('ul', {},
    h('li', {}, fmt(U.chanSeq, { seq: KC.filterSeq }), cite(['rcsb-1BL8', 'doyle-1998'])),
    h('li', {}, fmt(U.chanO, { n: M.liningOxygens, span: M.liningSpan }), cite(['measured-1bl8'])),
    h('li', {}, fmt(U.chanK, { n: KC.ions.length, gaps: M.kkDistances.map((d) => d.toFixed(1)).join(' and ') }), cite(['measured-1bl8'])));
  const legend = h('ul', { class: 'sp-legend' },
    h('li', {}, h('i', { style: 'background:var(--sp-chain)' }), U.chanLegendChain),
    h('li', {}, h('i', { style: 'background:var(--sp-o)' }), U.chanLegendO),
    h('li', {}, h('i', { style: 'background:var(--sp-k)' }), U.chanLegendK),
    h('li', {}, h('i', { style: 'background:#9aa5ae' }), U.chanLegendAtoms));
  const stage = h('div', { class: 'sp-stage sp-chan' }, cv);
  const sec = h('section', { class: 'sp-sec', id: 'channel', 'aria-labelledby': 'h-chan' },
    h('h2', { id: 'h-chan' }, U.chanTitle),
    para(U.chanIntro, ['rcsb-1BL8', 'doyle-1998'], 'sp-intro'),
    h('div', { class: 'sp-grid2' },
      h('div', {}, stage,
        h('div', { class: 'sp-controls' }, openBtn, spinBtn, resetBtn),
        h('p', { class: 'sp-small' }, U.chanKeys), legend),
      h('div', {},
        h('h3', {}, U.chanFacts), facts,
        D.channel.how.map((x) => para(x.t, x.s)),
        h('p', {}, h('a', { href: '../molecules/#potassium-channel' }, U.chanOpenFull)))));
  root.append(sec);

  // geometry
  const chainIds = Object.keys(KC.chains);
  const cent = {};
  for (const c of chainIds) { const p = KC.chains[c]; cent[c] = [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[2], 0) / p.length]; }
  const ang = (c) => Math.atan2(cent[c][1], cent[c][0]);
  const a0 = chainIds[0];
  const opposite = chainIds.slice(1).sort((x, y) => Math.cos(ang(x) - ang(a0)) - Math.cos(ang(y) - ang(a0)))[0];
  const showPair = new Set([a0, opposite]);
  const yawPair = ang(a0);   // turn so the shown pair sits left and right
  const EL = { C: '#9aa5ae', N: '#4f7dff', O: null, S: '#e8c22e' };
  const RAD = { C: 0.55, N: 0.55, O: 0.6 };
  let yaw = 0.5, pitch = 0.18, spin = !reduceMotion(), open = false, zoom = 1, zoomT = 1, cy = -12, cyT = -12, visible = true;
  let drag = null, dirty = true;
  const setOpen = (o) => {
    open = o; openBtn.textContent = o ? U.chanClose : U.chanOpen; openBtn.setAttribute('aria-pressed', String(o));
    zoomT = o ? 2.3 : 1; cyT = o ? -1 : -12;
    if (o) { yaw = yawPair; pitch = 0.05; setSpin(false); }
    if (reduceMotion()) { zoom = zoomT; cy = cyT; }
    dirty = true; loop.kick();
  };
  const setSpin = (v) => { spin = v; spinBtn.textContent = v ? U.chanStop : U.chanSpin; spinBtn.setAttribute('aria-pressed', String(v)); loop.kick(); };
  setSpin(spin);
  openBtn.addEventListener('click', () => setOpen(!open));
  spinBtn.addEventListener('click', () => setSpin(!spin));
  resetBtn.addEventListener('click', () => { yaw = 0.5; pitch = 0.18; setOpen(false); });
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); setSpin(false); });
  cv.addEventListener('pointermove', (e) => { if (!drag) return; yaw += (e.clientX - drag.x) * 0.01; pitch = clamp(pitch + (e.clientY - drag.y) * 0.01, -1.4, 1.4); drag = { x: e.clientX, y: e.clientY }; dirty = true; loop.kick(); });
  const endDrag = () => { drag = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') yaw -= 0.15; else if (k === 'ArrowRight') yaw += 0.15;
    else if (k === 'ArrowUp') pitch = clamp(pitch - 0.15, -1.4, 1.4); else if (k === 'ArrowDown') pitch = clamp(pitch + 0.15, -1.4, 1.4);
    else if (k === ' ') setSpin(!spin);
    else if (k === 'o' || k === 'O') setOpen(!open);
    else return;
    e.preventDefault(); dirty = true; loop.kick();
  });

  function draw() {
    const { ctx, W, H } = fitCanvas(cv);
    dirty = false;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, PAL.dark ? '#13242c' : '#ffffff'); bg.addColorStop(1, PAL.stage);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const sc = Math.min(W, H) / 64 * zoom;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spc = Math.sin(pitch);
    const P = (p) => {
      const x1 = p[0] * cyw + p[2] * syw, z1 = -p[0] * syw + p[2] * cyw;
      const y = p[1] - cy;
      const y2 = y * cp - z1 * spc, z2 = y * spc + z1 * cp;
      return [W / 2 + x1 * sc, H / 2 - y2 * sc, z2];
    };
    const prims = [];
    const visibleChain = (c) => !open || showPair.has(c);
    for (const c of chainIds) {
      if (!visibleChain(c)) continue;
      const pts = KC.chains[c].map(P);
      for (let i = 1; i < pts.length; i++) {
        const a = KC.chains[c][i - 1], b = KC.chains[c][i];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 4.3) continue;
        prims.push({ z: (pts[i - 1][2] + pts[i][2]) / 2, k: 'seg', a: pts[i - 1], b: pts[i] });
      }
    }
    const fp = KC.filter.map((a) => (visibleChain(a.c) ? P(a.p) : null));
    for (const [i, j] of KC.bonds) if (fp[i] && fp[j]) prims.push({ z: (fp[i][2] + fp[j][2]) / 2, k: 'bond', a: fp[i], b: fp[j] });
    KC.filter.forEach((a, i) => { if (fp[i]) prims.push({ z: fp[i][2], k: 'atom', p: fp[i], e: a.e, lining: a.lining }); });
    for (const q of KC.ions) { const p = P(q); prims.push({ z: p[2], k: 'ion', p }); }
    for (const q of KC.water) { const p = P(q); prims.push({ z: p[2], k: 'water', p }); }
    prims.sort((a, b) => a.z - b.z);   // far first; z points toward the viewer
    for (const q of prims) {
      const f = clamp(0.62 + q.z / 50, 0.3, 1);
      if (q.k === 'seg') {
        ctx.strokeStyle = PAL.chain; ctx.globalAlpha = 0.25 + 0.7 * f; ctx.lineWidth = Math.max(1.5, 0.9 * sc * (open ? 0.7 : 1)); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q.a[0], q.a[1]); ctx.lineTo(q.b[0], q.b[1]); ctx.stroke();
      } else if (q.k === 'bond') {
        ctx.strokeStyle = PAL.dark ? '#b8c2c8' : '#6b7780'; ctx.globalAlpha = 0.4 + 0.6 * f; ctx.lineWidth = Math.max(1, 0.22 * sc);
        ctx.beginPath(); ctx.moveTo(q.a[0], q.a[1]); ctx.lineTo(q.b[0], q.b[1]); ctx.stroke();
      } else if (q.k === 'atom') {
        ctx.globalAlpha = 1;
        const r = (RAD[q.e] || 0.55) * sc * (q.lining ? 1.05 : 0.9);
        ball(ctx, q.p[0], q.p[1], r, q.e === 'O' ? PAL.o : EL[q.e] || '#aaa', f);
        if (q.lining) { ctx.strokeStyle = PAL.o; ctx.globalAlpha = 0.5 * f; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.p[0], q.p[1], r * 1.6, 0, Math.PI * 2); ctx.stroke(); }
      } else if (q.k === 'ion') {
        ctx.globalAlpha = 1; ball(ctx, q.p[0], q.p[1], 1.2 * sc, PAL.k, 1);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(9, 0.8 * sc)}px ${PAL.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (sc > 9) ctx.fillText('K+', q.p[0], q.p[1]);
      } else if (q.k === 'water') {
        ctx.globalAlpha = 0.85; ball(ctx, q.p[0], q.p[1], 0.6 * sc, '#5fb8ff', f);
      }
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    // outside / inside tags along the pore axis
    const top = P([0, 18, 0]), bot = P([0, -44, 0]);
    ctx.font = `600 ${12}px ${PAL.font}`; ctx.textAlign = 'center';
    const tag = (t, p) => { if (p[1] < 10 || p[1] > H - 4) return; const w = ctx.measureText(t).width + 10; ctx.fillStyle = PAL.dark ? 'rgba(10,20,24,0.8)' : 'rgba(255,255,255,0.88)'; ctx.fillRect(p[0] - w / 2, p[1] - 13, w, 18); ctx.fillStyle = PAL.ink; ctx.fillText(t, p[0], p[1]); };
    tag(U.chanOutside, top); if (!open) tag(U.chanInside, bot);
    ctx.textAlign = 'left'; ctx.fillStyle = PAL.muted; ctx.font = `11px ${PAL.mono}`; ctx.fillText('PDB 1BL8', 8, H - 8);
  }
  function ball(ctx, x, y, r, col, f) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, col); g.addColorStop(1, shade(col, 0.45));
    ctx.globalAlpha = Math.max(ctx.globalAlpha * f, 0.3); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  loop.add({
    active: () => visible && (spin || dirty || Math.abs(zoom - zoomT) > 0.002 || Math.abs(cy - cyT) > 0.02),
    frame(dt) {
      if (spin) yaw += dt * 0.5;
      zoom += (zoomT - zoom) * Math.min(1, dt * 5); cy += (cyT - cy) * Math.min(1, dt * 5);
      draw();
    },
  });
  watchVisible(sec, (v) => { visible = v; if (v) { dirty = true; loop.kick(); } });
  try { draw(); } catch (e) { stage.replaceWith(h('p', {}, U.chanNoCanvas)); }
  return { redraw: () => { dirty = true; draw(); } };
}
function shade(hex, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

/* ======================================================================================== */
/* 5. What to remember                                                                        */
/* ======================================================================================== */
function buildLearn(root, D, U, cite, para) {
  const L = D.learn;
  root.append(h('section', { class: 'sp-sec', id: 'learn', 'aria-labelledby': 'h-learn' },
    h('h2', { id: 'h-learn' }, U.learnTitle),
    h('ol', { class: 'sp-key' }, L.keyIdeas.map((k) => h('li', {}, k.t, cite(k.s)))),
    h('h3', {}, U.mythTitle),
    h('div', { class: 'sp-cards' }, L.misconceptions.map((m) => h('div', { class: 'sp-card' },
      h('p', { class: 'myth' }, h('b', {}, U.myth + ': '), m.myth),
      h('p', { class: 'truth' }, h('b', {}, U.truth + ': '), m.truth, cite(m.s))))),
    h('h3', {}, U.vocabTitle),
    h('dl', { class: 'sp-vocab' }, L.vocab.flatMap((v) => [h('dt', {}, v.term), h('dd', {}, v.definition, cite(v.s))])),
    h('h3', {}, U.linksTitle),
    h('ul', { class: 'sp-links' },
      [['../cells/#neuron', U.linkNeuron], ['../elements/#Na', U.linkNa], ['../elements/#K', U.linkK], ['../molecules/#potassium-channel', U.linkChannel],
        ['../molecules/#acetylcholine', U.linkAch], ['../molecules/#atp', U.linkAtp], ['../muscle.html', U.linkMuscle]]
        .map(([href, t]) => h('li', {}, h('a', { href }, t)))),
    para(U.linkMuscleNote, ['ap-10-3'], 'sp-small')));
}
