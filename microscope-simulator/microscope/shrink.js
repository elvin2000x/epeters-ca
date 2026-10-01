// "Shrink yourself": the same little swimmer from 1 m down to 2 µm. Reynolds number, coasting and Brownian jiggle
// are computed live (shrink-physics.js). Drawing is 2D canvas only, so there is no WebGL to fall back from; if the
// canvas cannot draw, every number and text still works. The drawing is to scale in body lengths and real seconds.
import { makePhysics } from './shrink-physics.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};

const [J, SRC0] = await Promise.all([
  fetch('shrink.json').then((r) => r.json()),
  fetch('sources.json').then((r) => r.json()).then((j) => j.sources).catch(() => ({})),
]);
const COPY = J.copy;
const SRC = { ...J.sources, ...SRC0 };
const PH = makePhysics(J.constants, J.anchors);
document.querySelectorAll('[data-copy]').forEach((n) => { const k = n.dataset.copy; if (COPY[k]) n.textContent = COPY[k]; });

/* ---------- number words ---------- */
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function num(x, p = 3) {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 0.01 && a < 1e6) {
    const s = Number(x.toPrecision(p));
    return s.toLocaleString('en', { maximumFractionDigits: 6 });
  }
  const e = Math.floor(Math.log10(a)), m = x / 10 ** e;
  const ms = Number(m.toPrecision(p)).toString();
  return `${ms === '1' ? '' : ms + ' × '}10${String(e).split('').map((c) => SUP[c]).join('')}`;
}
// spoken form for screen readers and the live region
function says(x, p = 2) {
  const a = Math.abs(x);
  if (a >= 0.01 && a < 1e6) return Number(x.toPrecision(p)).toLocaleString('en');
  const e = Math.floor(Math.log10(a)), m = Number((x / 10 ** e).toPrecision(p));
  return `${m} times 10 to the ${e < 0 ? 'minus ' : ''}${Math.abs(e)}`;
}
const UNITS = [[1, 'm', 'metres'], [1e-2, 'cm', 'centimetres'], [1e-3, 'mm', 'millimetres'], [1e-6, 'µm', 'micrometres'], [1e-9, 'nm', 'nanometres'], [1e-12, 'pm', 'picometres']];
function len(m, spoken) {
  for (const [f, u, w] of UNITS) if (m >= f * 0.999 || f === 1e-12) { const v = Number((m / f).toPrecision(m / f >= 100 ? 3 : 2)); return `${spoken ? says(v, 3) : num(v)} ${spoken ? w : u}`; }
  return '';
}
const TUNITS = [[1, 's', 'seconds'], [1e-3, 'ms', 'milliseconds'], [1e-6, 'µs', 'microseconds'], [1e-9, 'ns', 'nanoseconds']];
function dur(s, spoken) {
  for (const [f, u, w] of TUNITS) if (s >= f * 0.999 || f === 1e-9) { const v = Number((s / f).toPrecision(2)); return `${spoken ? says(v, 2) : num(v)} ${spoken ? w : u}`; }
  return '';
}
const spd = (v, spoken) => `${len(v, spoken)} ${spoken ? 'per second' : '/s'}`;

/* ---------- sources ---------- */
const srcIds = [];
function sup(ids) {
  const s = el('sup');
  for (const id of ids || []) {
    if (!SRC[id]) continue;
    if (!srcIds.includes(id)) srcIds.push(id);
    const n = srcIds.indexOf(id) + 1;
    s.append(el('a', { href: `#src-${id}`, 'aria-label': `source ${n}: ${SRC[id].title}`, text: `[${n}]` }));
  }
  return s;
}
function buildSources() {
  const ul = $('sourceList'); ul.textContent = '';
  srcIds.forEach((id, i) => {
    const s = SRC[id];
    ul.append(el('li', { id: `src-${id}` }, `[${i + 1}] ${s.title}. ${s.publisher}. `, el('a', { href: s.url, rel: 'noopener noreferrer', target: '_blank', text: s.url }), `. Checked ${s.checked}.`));
  });
}

/* ---------- learning layer (static) ---------- */
function buildLearn() {
  const L = J.learn;
  const ol = $('remember');
  for (const k of L.keyIdeas) { const li = el('li', {}, k.text); li.append(sup(k.s)); ol.append(li); }
  const dv = $('deeper');
  for (const d of L.deeper) { dv.append(el('h3', { text: d.title })); const p = el('p', {}, d.text); p.append(sup(d.s)); dv.append(p); }
  const ul = $('myths');
  for (const m of L.misconceptions) {
    const p1 = el('p', {}, el('b', { text: `${COPY.myth}:` }), ` ${m.myth}`);
    const p2 = el('p', {}, el('b', { text: `${COPY.truth}:` }), ` ${m.truth}`); p2.append(sup(m.s));
    ul.append(el('li', {}, p1, p2));
  }
  const dl = $('vocab');
  for (const v of L.vocab) { const dd = el('dd', {}, v.definition); dd.append(sup(v.s)); dl.append(el('dt', { text: v.term }), dd); }
  $('modelNote').textContent = J.model.note; $('modelNote').append(sup(J.model.s));
  const cu = $('consts');
  for (const c of Object.values(J.constants)) { const li = el('li', {}, `${c.label}: ${num(c.value, 9)} ${c.unit}`); li.append(sup(c.s)); cu.append(li); }
  const au = $('anchorList');
  for (const a of J.anchors) { const li = el('li', {}, `${a.name}: ${a.note}`); li.append(sup(a.s)); au.append(li); }
  for (const ids of Object.values(J.drivesS)) sup(ids); // number every source before the list is built
}

/* ---------- size slider: log scale from 1 m (0) to 2 µm (1000) ---------- */
const Lmax = 1, Lmin = 2e-6, LOG = Math.log10(Lmax / Lmin);
const sizeOf = (v) => Lmax * 10 ** (-LOG * (v / 1000));
const sliderOf = (L) => Math.round((Math.log10(Lmax / L) / LOG) * 1000);
const slider = $('size');
const S = { L: 1, p: PH.at(1), playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, slow: false };

function buildPresets() {
  const box = $('presets');
  for (const pr of J.presets) {
    const b = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', 'data-l': String(pr.L) }, pr.label);
    b.addEventListener('click', () => setSize(pr.L, true));
    box.append(b);
  }
}

function setSize(L, user) {
  S.L = Math.min(Lmax, Math.max(Lmin, L));
  S.p = PH.at(S.L);
  slider.value = String(sliderOf(S.L));
  resetAnim();
  updateReadouts();
  if (user) { const a = J.anchors.find((x) => Math.abs(Math.log(x.L / S.L)) < 0.02); history.replaceState(null, '', a ? `#${a.id}` : location.pathname); }
  requestFrame();
}

/* ---------- readouts ---------- */
const nearest = () => J.anchors.reduce((b, a) => (Math.abs(Math.log(a.L / S.L)) < Math.abs(Math.log(b.L / S.L)) ? a : b));
function verdict(p) { return p.coastBodies >= 1 ? COPY.verdictInertia : p.coastBodies >= 0.05 ? COPY.verdictMiddle : COPY.verdictViscous; }
function row(dl, label, value, note) { dl.append(el('dt', { text: label }), el('dd', {}, value, note ? el('small', { text: note }) : null)); }
let liveT = 0;
function updateReadouts() {
  const p = S.p, k = PH.constants;
  $('sizeOut').textContent = len(S.L);
  slider.setAttribute('aria-valuetext', `${len(S.L, true)}${p.anchor ? `, ${p.anchor.name} size` : ''}`);
  document.querySelectorAll('#presets button').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(Math.log(+b.dataset.l / S.L)) < 0.02)));
  $('verdict').textContent = verdict(p);
  const dl = $('nums'); dl.textContent = '';
  row(dl, COPY.speedRow, spd(p.v), `${num(p.speedBodies, 2)} ${COPY.bodyLengths}/s, ${p.anchor ? COPY.speedAnchor : COPY.speedBlend}`);
  row(dl, COPY.reRow, num(p.Re));
  row(dl, COPY.coastRow, len(p.coast), p.coast < 1e-8 ? `${num(p.coastAtoms, 2)} ${COPY.atomWidths}` : `${num(p.coastBodies, 2)} ${COPY.bodyLengths}`);
  row(dl, COPY.stopRow, dur(p.tStop));
  row(dl, COPY.jitterRow, len(p.jiggle1s), `${num(p.jiggleBodies, 2)} ${COPY.bodyLengths}`);
  const r = p.r;
  const m = $('maths'); m.textContent = '';
  const line = (t) => m.append(el('p', { text: t }));
  line(`Re = ρvL / μ = ${k.rho} × ${num(p.v)} × ${num(S.L)} / ${k.mu} = ${num(p.Re)}`);
  line(`Mass m = ρ × (4/3)πr³ with r = L/2 = ${num(r)} m, so m = ${num(p.m)} kg`);
  line(`Slow drag a = 6πμr = ${num(p.a)} N·s/m. Fast drag b = ½Cρπr² = ${num(p.b)} N·s²/m²`);
  line(`Coast to a tenth of the speed: x = (m/b) ln((a + bv) / (a + bv/10)) = ${num(p.coast)} m`);
  line(`Time to get there: t = (m/a) ln(10 (a + bv/10) / (a + bv)) = ${num(p.tStop)} s`);
  line(`Hydrogen atom ≈ 2a₀ = ${num(k.atom)} m, so the coast is ${num(p.coastAtoms)} atoms wide`);
  line(`D = kT / (6πμr) = ${num(k.k, 7)} ×${k.T} / (6π × ${k.mu} × ${num(r)}) = ${num(p.D)} m²/s`);
  line(`Jiggle in 1 s along one direction = √(2 × D × 1 s) = ${num(p.jiggle1s)} m`);
  // who lives near this size
  const a = nearest(), here = Math.abs(Math.log(a.L / S.L)) < 0.02;
  $('whoTitle').textContent = here ? a.name : `Nearest real swimmer: ${a.name}`;
  const wt = $('whoText'); wt.textContent = `${a.note} ${J.drives[a.drive]}`; wt.append(sup([...a.s, ...J.drivesS[a.drive]]));
  const wl = $('whoLinks'); wl.textContent = '';
  if (a.link) wl.append(el('a', { class: 'btn', href: a.link, text: COPY[a.linkKey] }));
  wl.append(el('a', { class: 'btn', href: 'index.html#pond', text: COPY.seePond }));
  updateAlt();
  clearTimeout(liveT);
  liveT = setTimeout(() => {
    $('live').textContent = `${len(S.L, true)}. ${verdict(p)} Reynolds number ${says(p.Re)}. Coasts ${len(p.coast, true)} after it stops pushing. Heat jiggle about ${len(p.jiggle1s, true)} in a second.`;
  }, 500);
}
function updateAlt() {
  const p = S.p;
  const coastTxt = p.coastBodies >= 1 ? `When it stops pushing it glides on for about ${num(p.coastBodies, 2)} body lengths.` : p.coastBodies >= 0.05 ? 'When it stops pushing it slides a little and stops.' : 'When it stops pushing it stops dead, with no glide at all.';
  const jig = p.jiggleBodies > 0.02 ? `While stopped it jiggles visibly, about ${num(p.jiggleBodies, 2)} body lengths in a second.` : 'It does not jiggle: heat kicks are far too small to see at this size.';
  const f = scallopGain(p.Re);
  const sc = f > 0.05 ? 'The scallop below creeps forward a little with each open and close.' : 'The scallop below moves forward as it closes and back as it opens, and ends up where it started.';
  const txt = `A swimmer ${len(S.L, true)} long, drawn against dots one body length apart. It pushes for ${PUSH} seconds at ${num(p.speedBodies, 2)} body lengths a second. ${coastTxt} ${jig} ${sc} The corkscrew next to it keeps turning and moves steadily forward.`;
  $('viewalt').textContent = txt;
  $('viewport').setAttribute('aria-label', `Shrink yourself view at ${len(S.L, true)}`);
}

/* ---------- animation ---------- */
const PUSH = 1.5; // seconds of pushing in each cycle (sim time)
const A = { t: 0, x: 0, y: 0, u: 0, phase: 'push', tc: 0, sx: 0, cx: 0, stroke: 0 };
function resetAnim() { A.t = 0; A.x = 0; A.y = 0; A.phase = 'push'; A.tc = 0; A.sx = 0; A.cx = 0; A.stroke = 0; }
const coastHold = () => Math.min(5, Math.max(1.2, S.p.tStop)) + 1.2;
// illustrative: share of a scallop stroke kept as forward progress. Exactly 0 in the limit Re -> 0 (scallop theorem),
// close to 1 when inertia dominates. The shape of the blend is ours; only the two ends come from Purcell (1977).
const scallopGain = (Re) => Re / (Re + 10);
let gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function step(dt) {
  const p = S.p;
  A.t += dt;
  if (A.phase === 'push') {
    A.u = p.speedBodies;
    if (A.t >= PUSH) { A.phase = 'coast'; A.tc = 0; }
  } else {
    A.tc += dt;
    A.u = PH.vAfter(p, A.tc) / p.L;
    if (A.tc >= coastHold()) { A.phase = 'push'; A.t = 0; }
  }
  A.x += A.u * dt;
  // Brownian jiggle, true size: sigma = √(2 D dt) per axis, in body lengths
  const sg = Math.sqrt(2 * p.D * dt) / p.L;
  A.x += sg * gauss(); A.y += sg * gauss();
  A.y = Math.max(-0.5, Math.min(0.5, A.y * (1 - 0.2 * dt)));
  // scallop: close fast (0.3 of the cycle, forward 0.3 L), open slowly (back by 0.3 L minus the kept share)
  const T0 = 1, prev = A.stroke % T0; A.stroke += dt; const ph = A.stroke % T0;
  const f = scallopGain(p.Re);
  const fwd = (q) => (q < 0.3 ? q / 0.3 : 1 - (1 - f) * ((q - 0.3) / 0.7));
  A.sx += (ph >= prev ? fwd(ph) - fwd(prev) : fwd(T0) - fwd(prev) + fwd(ph)) * 0.3;
  A.cx += 0.25 * dt; // corkscrew: steady, illustrative rate in body lengths per second
}

/* ---------- drawing ---------- */
const cv = $('c2d');
let ctx = null;
try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
const stage = $('stagewrap');
let W = 0, H = 0, dpr = 1;
function layout() {
  const r = stage.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); requestFrame();
}
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drive() { return S.L > 5e-3 ? 'arms' : S.L > 30e-6 ? 'cilia' : 'corkscrew'; }

function dots(x0, y0, w, h, spacing, offset, ink) {
  ctx.fillStyle = ink;
  const start = -((offset * spacing) % spacing);
  for (let x = start; x < w + spacing; x += spacing) for (let y = spacing / 2; y < h; y += spacing) { ctx.beginPath(); ctx.arc(x0 + x, y0 + y, 2, 0, 7); ctx.fill(); }
}
function body(x, y, Lpx, ink, fill, kind, t, beating) {
  const th = Lpx * 0.36;
  ctx.save(); ctx.translate(x, y);
  ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.fillStyle = fill;
  // tail or hairs behind (left side), drawn first
  ctx.beginPath();
  if (kind === 'arms') {
    const fl = beating ? Math.sin(t * 12) * 0.35 : 0;
    ctx.moveTo(-Lpx / 2 + 4, 0); ctx.lineTo(-Lpx / 2 - Lpx * 0.22, -th * 0.6 + fl * th); ctx.lineTo(-Lpx / 2 - Lpx * 0.22, th * 0.6 + fl * th); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === 'cilia') {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, cx = Math.cos(a) * Lpx / 2, cy = Math.sin(a) * th / 2;
      const lean = beating ? 0.7 * Math.sin(a * 5 - t * 30) : 0;
      const n = Math.atan2(Math.sin(a) * Lpx / 2, Math.cos(a) * th / 2) + lean;
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(n) * Lpx * 0.07, cy + Math.sin(n) * Lpx * 0.07);
    }
    ctx.stroke();
  } else {
    const len = Lpx * 1.1, ph = beating ? t * 2 * Math.PI * 4 : 0;
    ctx.moveTo(-Lpx / 2, 0);
    for (let s = 0; s <= len; s += 2) ctx.lineTo(-Lpx / 2 - s, Math.sin(s / (Lpx * 0.25) * 2 * Math.PI + ph) * th * 0.28 * Math.min(1, s / 20));
    ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, Lpx / 2, th / 2, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(Lpx * 0.3, -th * 0.08, Math.max(2, Lpx * 0.025), 0, 7); ctx.fill();
  ctx.restore();
}
function label(text, x, y, ink) { ctx.fillStyle = ink; ctx.font = `600 13px ${css('--font-ui') || 'sans-serif'}`; ctx.fillText(text, x, y); }

function draw() {
  if (!ctx) return;
  const ink = css('--ink') || '#13201e', muted = css('--muted') || '#4c5e5b', acc = css('--accent') || '#0b7469', fill = css('--accent-soft') || 'rgba(11,116,105,0.12)', line = css('--line') || '#7d8d8a';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const top = document.body.classList.contains('cme-shell') ? 52 : 56, bottomPad = 40;
  const h1 = (H - top - bottomPad) * 0.58, y1 = top;
  // lane 1: push then stop
  const Lpx = Math.max(40, Math.min(W * 0.2, h1 * 0.55));
  dots(0, y1, W, h1, Lpx, A.x, line);
  label(`${COPY.laneCoast}: ${A.phase === 'push' ? COPY.pushing : COPY.coasting}`, 12, y1 + 18, ink);
  body(W * 0.42, y1 + h1 / 2 + A.y * Lpx, Lpx, acc, fill, drive(), A.t + A.tc, A.phase === 'push');
  // lane 2: scallop and corkscrew, side by side
  const y2 = y1 + h1 + 8, h2 = H - y2 - bottomPad, half = W / 2, sL = Math.max(28, Math.min(half * 0.22, h2 * 0.45));
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y2 - 4); ctx.lineTo(W, y2 - 4); ctx.moveTo(half, y2); ctx.lineTo(half, H - bottomPad); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(0, y2, half, h2); ctx.clip();
  dots(0, y2 + 18, half, h2 - 18, sL, A.sx, line);
  const ph = A.stroke % 1, open = ph < 0.3 ? 1 - ph / 0.3 : (ph - 0.3) / 0.7, ang = 0.15 + open * 0.55;
  const sx = half * 0.45, sy = y2 + 18 + (h2 - 18) / 2;
  ctx.strokeStyle = muted; ctx.fillStyle = fill; ctx.lineWidth = 2;
  for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx - sL / 2, sy); ctx.lineTo(sx + sL / 2 * Math.cos(ang), sy + sgn * sL / 2 * Math.sin(ang) * 1.6); ctx.stroke(); }
  ctx.restore();
  label(COPY.laneScallop, 12, y2 + 14, ink);
  ctx.save(); ctx.beginPath(); ctx.rect(half, y2, half, h2); ctx.clip();
  dots(half, y2 + 18, half, h2 - 18, sL, A.cx, line);
  body(half + half * 0.55, y2 + 18 + (h2 - 18) / 2, sL, acc, fill, 'corkscrew', A.stroke, true);
  ctx.restore();
  label(COPY.laneCorkscrew, half + 12, y2 + 14, ink);
  $('clockOut').textContent = `${S.slow ? COPY.timeSlow : COPY.timeReal} · ${COPY.gridNote}`;
}

let raf = 0, last = 0, visible = true;
const moving = () => S.playing && visible && !document.hidden;
function frame(now) {
  raf = 0;
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;
  if (moving()) step(dt * (S.slow ? 0.1 : 1));
  draw();
  if (moving()) raf = requestAnimationFrame(frame); else last = 0;
}
function requestFrame() { if (!raf) raf = requestAnimationFrame(frame); }
function setPlaying(on) { S.playing = on; $('playBtn').textContent = on ? COPY.pause : COPY.play; if (on) $('note').hidden = true; requestFrame(); }

/* ---------- wiring ---------- */
slider.addEventListener('input', () => setSize(sizeOf(+slider.value), false));
slider.addEventListener('change', () => setSize(sizeOf(+slider.value), true));
$('playBtn').addEventListener('click', () => setPlaying(!S.playing));
$('slowBtn').addEventListener('click', () => { S.slow = !S.slow; $('slowBtn').setAttribute('aria-pressed', String(S.slow)); requestFrame(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestFrame(); });
new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) requestFrame(); }).observe(stage);
new ResizeObserver(layout).observe(stage);
document.addEventListener('cme:theme', requestFrame);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', requestFrame);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { if (e.matches) setPlaying(false); });
window.addEventListener('hashchange', () => { const a = J.anchors.find((x) => x.id === location.hash.slice(1)); if (a) setSize(a.L, false); });

/* ---------- start ---------- */
buildPresets(); buildLearn();
const start = J.anchors.find((x) => x.id === location.hash.slice(1));
setSize(start ? start.L : 1, false);
buildSources();
layout();
setPlaying(S.playing);
if (!S.playing) { const n = $('note'); n.textContent = COPY.reducedMotion; n.hidden = false; }
if (!ctx) { const n = $('note'); n.textContent = COPY.noCanvas; n.hidden = false; }
