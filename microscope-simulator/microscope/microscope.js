// Virtual microscope for the Cell and Molecule Explorer.
// Everything is drawn procedurally: a WebGL fragment shader (no library) with a 2D-canvas fallback.
// World units are micrometres (µm). The scale bar and the drawing share one number, pxPerUm, so the bar is true.
import { LIB, MAIN } from './shaders.js';
import { createPond, ARENA, SPECIES, NAMES, COLORS } from './pond.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
  }
  for (const k of kids) n.append(k);
  return n;
};

const [DATA, SRC] = await Promise.all([
  fetch('specimens.json').then((r) => r.json()),
  fetch('sources.json').then((r) => r.json()).then((j) => j.sources),
]);
const COPY = DATA.copy;
const STEPS = DATA.scope.steps.map((s) => {
  const n = s.immersion;
  const theta = Math.asin(Math.min(0.98, s.na / n));
  return {
    ...s,
    fovUm: (DATA.scope.fieldNumberMm * 1000) / s.objective, // FN / objective (mw-fov)
    tan: Math.tan(theta),
    dof: (0.55 * n) / (s.na * s.na), // wave-optics depth of field estimate, µm
  };
});
const ORGS = DATA.organisms;
const SPEEDS = [
  { v: 0.1, label: '1/10' },
  { v: 0.25, label: '1/4' },
  { v: 1, label: 'Real' },
];

/* ---------- state ---------- */
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const S = {
  org: 0, mag: 1, focus: 0, mode: 0, speed: 0.25,
  playing: !reduceMQ.matches, follow: true,
  simT: 0, cam: { x: 0, y: 0 }, inst: [], seed: 1, view: 'slides',
};
const hashId = location.hash.slice(1);
if (hashId) { const i = ORGS.findIndex((o) => o.id === hashId); if (i >= 0) S.org = i; }
const pond = createPond({ DATA, COPY, LIB, S, showNote: (t, ms) => showNote(t, ms), announce: (t) => announce(t), requestRender: () => requestRender() });

/* ---------- copy ---------- */
document.querySelectorAll('[data-copy]').forEach((n) => { const k = n.dataset.copy; if (COPY[k]) n.textContent = COPY[k]; });

/* ---------- theme ---------- */
const THEMES = ['auto', 'light', 'dark'];
let theme = 'auto';
try { theme = localStorage.getItem('cme-theme') || 'auto'; } catch (e) { /* storage blocked */ }
const applyTheme = () => {
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  $('themeBtn').textContent = `${COPY.theme}: ${theme}`;
  $('themeBtn').setAttribute('aria-label', `${COPY.theme}: ${theme}. Press to change.`);
};
applyTheme();
$('themeBtn').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
  try { localStorage.setItem('cme-theme', theme); } catch (e) { /* ignore */ }
  applyTheme();
});
// the app shell's theme button sets data-theme on <html>: keep this page's own state in step
document.addEventListener('cme:theme', () => { const d = document.documentElement.dataset.theme; theme = THEMES.includes(d) ? d : 'auto'; applyTheme(); });

/* ---------- seeded random ---------- */
let rs = 1;
const rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };

/* ---------- organisms: instances and motion ---------- */
function makeInstances() {
  rs = 12345 + S.org * 777;
  const o = ORGS[S.org];
  const I = [];
  if (o.kind === 0) {
    for (let i = 0; i < 3; i++) I.push({ x: i ? (rnd() - 0.5) * 1400 : 0, y: i ? (rnd() - 0.5) * 1400 : 0, h: rnd() * 6.28, roll: rnd() * 6.28, L: o.drawn.lengthUm * (i ? 0.9 + rnd() * 0.15 : 1), W: o.drawn.widthUm * (i ? 0.9 + rnd() * 0.15 : 1), seed: rnd() * 10 });
  } else if (o.kind === 1) {
    I.push({ x: 0, y: 0, h: 0.4, R0: 120, seed: 1.3 });
    I.push({ x: 900, y: -700, h: 2.4, R0: 95, seed: 4.1 });
  } else if (o.kind === 2) {
    for (let i = 0; i < 5; i++) I.push({ x: i ? (rnd() - 0.5) * 380 : 0, y: i ? (rnd() - 0.5) * 380 : 0, h: rnd() * 6.28, roll: rnd() * 6.28, L: o.drawn.lengthUm * (i ? 0.85 + rnd() * 0.2 : 1), W: o.drawn.widthUm, seed: rnd() * 10 });
  } else if (o.kind === 3) {
    for (let i = 0; i < 3; i++) I.push({ type: 0, x: (rnd() - 0.5) * 140, y: (rnd() - 0.5) * 140, h: rnd() * 6.28, ph: 0, L: o.drawn.spiralUm[0] * (0.85 + rnd() * 0.3), seed: rnd() * 10 });
    for (let i = 0; i < 5; i++) I.push({ type: 1, x: (rnd() - 0.5) * 150, y: (rnd() - 0.5) * 150, h: rnd() * 6.28, ph: 0, L: o.drawn.rodUm[0], seed: rnd() * 10 });
  } else if (o.kind === 5) {
    for (let i = 0; i < 4; i++) I.push({ x: i ? (rnd() - 0.5) * 420 : 0, y: i ? (rnd() - 0.5) * 420 : 0, h: rnd() * 6.28, L: o.drawn.lengthUm * (i ? 0.8 + rnd() * 0.25 : 1), W: o.drawn.widthUm * (i ? 0.9 + rnd() * 0.1 : 1), seed: rnd() * 10 });
  }
  S.inst = I;
}
const hasTarget = () => [0, 1, 2, 5].includes(ORGS[S.org].kind);

function steer(p, dt, R, rate, t) {
  // gentle wander plus a soft wall so organisms stay on the slide
  p.h += dt * rate * (0.6 * Math.sin(t * 0.5 + p.seed) + 0.4 * Math.sin(t * 0.23 + p.seed * 2));
  const d = Math.hypot(p.x, p.y);
  if (d > R) {
    const want = Math.atan2(-p.y, -p.x);
    let diff = Math.atan2(Math.sin(want - p.h), Math.cos(want - p.h));
    p.h += Math.sign(diff) * Math.min(Math.abs(diff), dt * rate * 2.5);
  }
}
function step(dt) {
  const k = ORGS[S.org].kind, t = S.simT;
  for (const p of S.inst) {
    if (k === 0) { // paramecium: 1000 µm/s (jana2012), rolls on its long axis while it swims
      steer(p, dt, 1300, 0.9, t);
      p.roll += dt * 6.28 * 1.1;
      p.x += Math.cos(p.h) * 1000 * dt; p.y += Math.sin(p.h) * 1000 * dt;
    } else if (k === 1) { // amoeba: slow crawl, illustrative
      steer(p, dt, 900, 0.05, t);
      p.x += Math.cos(p.h) * 3 * dt; p.y += Math.sin(p.h) * 3 * dt;
    } else if (k === 2) { // euglena: illustrative speed
      steer(p, dt, 260, 0.5, t);
      p.roll += dt * 6.28 * 0.9;
      p.x += Math.cos(p.h) * 45 * dt; p.y += Math.sin(p.h) * 45 * dt;
    } else if (k === 3) {
      if (p.type === 0) { steer(p, dt, 110, 0.3, t); p.ph -= dt * 9; p.x += Math.cos(p.h) * 14 * dt; p.y += Math.sin(p.h) * 14 * dt; } else {
        steer(p, dt, 110, 1.5, t);
        if (Math.sin(t * 0.9 + p.seed * 3) > 0.96) p.h += dt * 9; // tumble
        p.x += Math.cos(p.h) * 12 * dt; p.y += Math.sin(p.h) * 12 * dt;
      }
    } else if (k === 5) { // diatom: glides back and forth along its long axis, illustrative
      const dir = Math.sin(t * 0.12 + p.seed) > 0 ? 1 : -1;
      p.h += dt * 0.02 * Math.sin(t * 0.07 + p.seed);
      if (Math.hypot(p.x, p.y) > 320) { p.x *= 0.999; p.y *= 0.999; }
      p.x += Math.cos(p.h) * 4 * dir * dt; p.y += Math.sin(p.h) * 4 * dir * dt;
    }
  }
}
// the pose that is actually drawn (paramecium and euglena wobble on a helix as they roll)
function pose(p) {
  const k = ORGS[S.org].kind;
  if (k === 0 || k === 2) {
    const a = k === 0 ? 10 : 3;
    return { x: p.x - Math.sin(p.h) * a * Math.sin(p.roll), y: p.y + Math.cos(p.h) * a * Math.sin(p.roll), h: p.h + 0.08 * Math.cos(p.roll) };
  }
  return { x: p.x, y: p.y, h: p.h };
}

/* ---------- canvas and geometry ---------- */
const stage = $('stagewrap'), view = $('viewport');
const glc = $('gl'), c2d = $('c2d');
let W = 0, H = 0, dprMax = Math.min(window.devicePixelRatio || 1, 1.5), quality = 1;
const G = { cx: 0, cy: 0, R: 0, pxPerUm: 1 }; // CSS pixels
function layout() {
  const r = stage.getBoundingClientRect();
  W = r.width; H = r.height;
  const avail = Math.min(W - 16, H - 20);
  G.R = Math.max(80, avail / 2);
  G.cx = W / 2; G.cy = H / 2;
  const dpr = dprMax * quality;
  for (const c of [glc, c2d]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  updateScale();
}
// largest round bar that fits in 30% of the field
function barFor(pxPerUm) {
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  let um = nice[0];
  for (const n of nice) if (n * pxPerUm <= 0.3 * 2 * G.R) um = n;
  return { um, px: um * pxPerUm };
}
function updateScale(animate) {
  const st = STEPS[S.mag];
  const target = (2 * G.R) / st.fovUm; // circle diameter in px / field of view in µm
  if (animate && !reduceMQ.matches && G.pxPerUm > 0 && Math.abs(Math.log(target / G.pxPerUm)) > 1e-3) G.anim = { from: G.pxPerUm, to: target, t0: performance.now(), dur: 450 };
  else { G.anim = null; G.pxPerUm = target; }
  applyScale();
}
// the bar is always computed from the pxPerUm being drawn, so it stays true during a zoom
function applyScale() {
  const st = STEPS[S.mag];
  const { um, px } = barFor(G.pxPerUm);
  $('bar').style.width = `${px}px`;
  $('barLbl').textContent = um >= 1000 ? `${um / 1000} mm` : `${um} µm`;
  const sb = $('scalebar');
  sb.style.left = `${G.cx - px / 2}px`; sb.style.top = `${G.cy + G.R * (W < 560 ? 0.56 : 0.66)}px`;
  S.bar = { um, px };
  $('readout').textContent = `${st.total}x · field ${fmtUm(st.fovUm)} · NA ${st.na}`;
}
const fmtUm = (um) => (um >= 1000 ? `${(um / 1000).toFixed(um % 1000 ? 1 : 0)} mm` : `${Math.round(um)} µm`);

/* ---------- WebGL ---------- */
const VS = `attribute vec2 aP; void main(){ gl_Position=vec4(aP,0.,1.); }`;
const FS = LIB + MAIN;

let gl = null, prog = null, U = {};
function initGL() {
  if (params.has('nogl')) return false;
  try {
    gl = glc.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: params.has('test'), powerPreference: 'low-power' });
  } catch (e) { gl = null; }
  if (!gl) return false;
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return false;
  prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aP'); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return false; }
  gl.useProgram(prog);
  fsBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  for (const n of ['uC', 'uR', 'uDpr', 'uPx', 'uCam', 'uFocus', 'uTan', 'uDof', 'uT', 'uBeat', 'uKind', 'uMode', 'uN', 'uA', 'uB', 'uArena', 'uLight']) U[n] = gl.getUniformLocation(prog, n);
  if (!pond.initGL(gl)) console.warn('pond renderer unavailable');
  glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); useFallback(); });
  return true;
}
let fsBuf = null;
const A8 = new Float32Array(32), B8 = new Float32Array(32);
function packInstances() {
  const k = ORGS[S.org].kind;
  S.inst.forEach((p, i) => {
    if (i > 7) return;
    const q = pose(p);
    let a = [q.x, q.y, q.h, p.roll || 0], b = [0, 0, 0, 0];
    if (k === 0) b = [p.L, p.W, p.seed, 6];
    else if (k === 1) { a = [p.x, p.y, p.h, 0]; b = [p.R0, p.seed, 0, 0]; }
    else if (k === 2) b = [p.L, p.W, Math.pow(Math.max(0, Math.sin(S.simT * 0.25 + p.seed)), 6), p.seed];
    else if (k === 3) { a = [p.x, p.y, p.h, p.ph]; b = [p.type, p.L, 0, 0]; }
    else if (k === 5) b = [p.L, p.W, p.seed, 0];
    A8.set(a, i * 4); B8.set(b, i * 4);
  });
}
function drawGL() {
  const dpr = glc.width / W, st = STEPS[S.mag], isPond = S.view === 'pond';
  gl.viewport(0, 0, glc.width, glc.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  if (!isPond) packInstances();
  const u = { cx: G.cx * dpr, cy: (H - G.cy) * dpr, R: G.R * dpr, dpr, px: G.pxPerUm * dpr, camx: S.cam.x, camy: S.cam.y, focus: S.focus, tan: st.tan, dof: st.dof, t: S.simT % 6000, beat: (S.simT * 30) % 1, mode: S.mode, w: glc.width, h: glc.height };
  gl.uniform2f(U.uC, u.cx, u.cy);
  gl.uniform1f(U.uR, u.R); gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uPx, u.px);
  gl.uniform2f(U.uCam, S.cam.x, S.cam.y);
  gl.uniform1f(U.uFocus, S.focus); gl.uniform1f(U.uTan, st.tan); gl.uniform1f(U.uDof, st.dof);
  gl.uniform1f(U.uT, u.t); gl.uniform1f(U.uBeat, u.beat);
  gl.uniform1i(U.uKind, isPond ? 7 : ORGS[S.org].kind); gl.uniform1i(U.uMode, S.mode); gl.uniform1i(U.uN, isPond ? 0 : Math.min(8, S.inst.length));
  gl.uniform4fv(U.uA, A8); gl.uniform4fv(U.uB, B8);
  gl.uniform1f(U.uArena, isPond ? ARENA : 0);
  const L = pond.P.light; gl.uniform3f(U.uLight, L.x, L.y, isPond ? L.r : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (isPond) pond.drawGL(gl, u);
}

/* ---------- 2D fallback (WebGL off): simpler drawing, same maths ---------- */
let ctx = null;
function blurPx(z) { const st = STEPS[S.mag]; return Math.max(Math.abs(S.focus - z) - st.dof / 2, 0) * st.tan * G.pxPerUm; }
function draw2D() {
  const dpr = c2d.width / W, k = ORGS[S.org].kind, bf = S.mode === 0;
  const ink = bf ? 'rgba(60,58,50,' : 'rgba(225,235,255,';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R + 6, 0, 7); ctx.fillStyle = '#090a0b'; ctx.fill();
  ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, 7); ctx.clip();
  const grd = ctx.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, G.R);
  grd.addColorStop(0, bf ? '#f3ecd6' : '#05070a'); grd.addColorStop(1, bf ? '#bdb6a2' : '#020304');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  const sx = (x) => G.cx + (x - S.cam.x) * G.pxPerUm, sy = (y) => G.cy - (y - S.cam.y) * G.pxPerUm, s = G.pxPerUm;
  if (S.view === 'pond') { pond.draw2D(ctx, sx, sy, s, bf); ctx.restore(); return; }
  const b = blurPx(0);
  ctx.filter = b > 0.6 ? `blur(${Math.min(b, 14).toFixed(1)}px)` : 'none';
  ctx.lineWidth = 1.5;
  const body = (fill, stroke) => { ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.fill(); ctx.stroke(); };
  if (k === 3 || k === 4) {
    const G0 = k === 3 ? 9 : 13, half = G.R / s;
    for (let gx = Math.floor((S.cam.x - half) / G0); gx <= (S.cam.x + half) / G0; gx++) {
      for (let gy = Math.floor((S.cam.y - half) / G0); gy <= (S.cam.y + half) / G0; gy++) {
        const h = Math.abs(Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453) % 1;
        if (h > 0.6) continue;
        const x = (gx + 0.3 + 0.4 * h) * G0, y = (gy + 0.3 + 0.4 * ((h * 7) % 1)) * G0;
        ctx.beginPath();
        if (k === 4) { ctx.arc(sx(x), sy(y), 2.5 * s, 0, 7); if (h < 0.3) ctx.arc(sx(x + 4.3), sy(y), 1.6 * s, 0, 7); }
        else if (h < 0.35) { ctx.ellipse(sx(x), sy(y), 1 * s, 0.35 * s, h * 20, 0, 7); }
        else ctx.arc(sx(x), sy(y), 0.45 * s, 0, 7);
        body(bf ? 'rgba(150,145,120,0.5)' : 'rgba(40,50,60,0.6)', `${ink}0.9)`);
      }
    }
  }
  S.inst.forEach((p) => {
    const q = pose(p);
    ctx.save(); ctx.translate(sx(q.x), sy(q.y)); ctx.rotate(-q.h);
    ctx.beginPath();
    if (k === 0) {
      ctx.ellipse(0, 0, p.L / 2 * s, p.W / 2 * s, 0, 0, 7); body(bf ? 'rgba(170,175,140,0.35)' : 'rgba(30,40,50,0.5)', `${ink}0.85)`);
      ctx.beginPath(); ctx.ellipse(0, 0, 24 * s, 12 * s, 0, 0, 7); body(bf ? 'rgba(120,120,100,0.3)' : 'rgba(80,90,110,0.3)', `${ink}0.5)`);
      ctx.strokeStyle = `${ink}0.45)`; ctx.lineWidth = 1;
      for (let a = 0; a < 6.28; a += 0.08) {
        const x = Math.cos(a) * p.L / 2 * s, y = Math.sin(a) * p.W / 2 * s;
        const n = Math.atan2(Math.sin(a) * p.L / 2, Math.cos(a) * p.W / 2);
        const lean = 0.6 * Math.sin(a * 9 - S.simT * 20);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(n + lean) * 10 * s, y + Math.sin(n + lean) * 10 * s); ctx.stroke();
      }
    } else if (k === 1) {
      for (let a = 0; a <= 6.3; a += 0.1) {
        let R = p.R0 * (0.9 + 0.08 * Math.sin(3 * a + S.simT * 0.3));
        for (let i = 0; i < 5; i++) { const da = Math.atan2(Math.sin(a - (i - 2) * 0.95), Math.cos(a - (i - 2) * 0.95)); R += p.R0 * (i === 2 ? 1 : 0.5) * Math.exp(-da * da / 0.12); }
        a === 0 ? ctx.moveTo(Math.cos(a) * R * s, Math.sin(a) * R * s) : ctx.lineTo(Math.cos(a) * R * s, Math.sin(a) * R * s);
      }
      ctx.closePath(); body(bf ? 'rgba(160,160,140,0.35)' : 'rgba(30,40,50,0.5)', `${ink}0.85)`);
      ctx.beginPath(); ctx.arc(-p.R0 * 0.25 * s, 0, 20 * s, 0, 7); body('rgba(120,120,100,0.3)', `${ink}0.6)`);
    } else if (k === 2) {
      ctx.ellipse(0, 0, p.L / 2 * s, p.W / 2 * s, 0, 0, 7); body(bf ? 'rgba(110,160,80,0.55)' : 'rgba(60,140,60,0.5)', `${ink}0.8)`);
      ctx.beginPath(); ctx.arc(p.L * 0.38 * s, 0, 2 * s, 0, 7); body('rgba(200,40,30,0.9)', 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.moveTo(p.L * 0.46 * s, 0);
      for (let x = 0; x <= p.L * 0.9; x += 2) ctx.lineTo((p.L * 0.46 + x) * s, Math.sin(x / 22 * 6.28 - S.simT * 14) * (1 + x / p.L * 5) * s);
      ctx.strokeStyle = `${ink}0.8)`; ctx.stroke();
    } else if (k === 3) {
      if (p.type === 0) { ctx.moveTo(-p.L / 2 * s, 0); for (let x = -p.L / 2; x <= p.L / 2; x += 0.5) ctx.lineTo(x * s, Math.sin(x / (p.L / 3) * 6.28 + p.ph) * 2.2 * s); ctx.lineWidth = Math.max(1, 1.5 * s); ctx.strokeStyle = `${ink}0.9)`; ctx.stroke(); }
      else { ctx.ellipse(0, 0, 1 * s, 0.35 * s, 0, 0, 7); body('rgba(120,115,100,0.6)', `${ink}0.9)`); }
    } else if (k === 5) {
      ctx.ellipse(0, 0, p.L / 2 * s, p.W / 2 * s, 0, 0, 7); body(bf ? 'rgba(190,150,80,0.4)' : 'rgba(120,90,40,0.5)', `${ink}0.95)`);
      ctx.strokeStyle = `${ink}0.35)`; ctx.lineWidth = 1;
      for (let x = -p.L / 2 + 4; x < p.L / 2 - 4; x += 2.2) { if (Math.abs(x) < 3) continue; ctx.beginPath(); ctx.moveTo(x * s, 2 * s); ctx.lineTo(x * s, p.W / 2.4 * s); ctx.moveTo(x * s, -2 * s); ctx.lineTo(x * s, -p.W / 2.4 * s); ctx.stroke(); }
    }
    ctx.restore();
  });
  ctx.restore();
  ctx.filter = 'none';
}
function useFallback() {
  gl = null; glc.hidden = true; c2d.hidden = false;
  ctx = c2d.getContext('2d');
  if (!ctx) { showNote(COPY.noWebgl); return; }
  showNote(COPY.noWebgl, 6000);
  requestRender();
}

/* ---------- render loop: runs only while something moves and the view is visible ---------- */
let raf = 0, last = 0, dirty = true, visible = true, lastInput = performance.now();
const frames = [];
const moving = () => S.playing && visible && !document.hidden;
function frame(now) {
  raf = 0;
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
  last = now;
  if (moving()) {
    S.simT += dt * S.speed;
    if (S.view === 'pond') pond.step(dt * S.speed, dt * pond.LIFE, now / 1000); else step(dt * S.speed);
    frames.push(now); if (frames.length > 90) frames.shift();
    if (frames.length >= 60) adaptQuality();
    if (now - lastInput > 180000) { setPlaying(false); showNote(COPY.idlePaused); }
  }
  if (S.view !== 'pond' && S.follow && hasTarget() && S.inst[0]) {
    const q = pose(S.inst[0]), kk = 1 - Math.exp(-dt * 6);
    S.cam.x += (q.x - S.cam.x) * (dt ? kk : 1); S.cam.y += (q.y - S.cam.y) * (dt ? kk : 1);
  }
  if (G.anim) { // smooth magnification change, interpolated in log space
    const k = Math.min(1, (now - G.anim.t0) / G.anim.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    G.pxPerUm = Math.exp(Math.log(G.anim.from) + (Math.log(G.anim.to) - Math.log(G.anim.from)) * e);
    if (k >= 1) { G.pxPerUm = G.anim.to; G.anim = null; }
    applyScale();
  }
  if (gl) drawGL(); else if (ctx) draw2D();
  placeRing();
  if (S.view === 'pond') { placeLamp(); hudTick(now); }
  dirty = false;
  if (moving() || G.anim) raf = requestAnimationFrame(frame); else last = 0;
}
function requestRender() { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }
function fpsNow() { if (frames.length < 10) return null; return (frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1000); }
let lastAdapt = 0;
function adaptQuality() {
  const f = fpsNow(), now = performance.now();
  if (f && f < 32 && quality > 0.5 && now - lastAdapt > 1500) { quality = Math.max(0.5, quality * 0.85); lastAdapt = now; layout(); frames.length = 0; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });
new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) requestRender(); }).observe(stage);
reduceMQ.addEventListener('change', () => { if (reduceMQ.matches) setPlaying(false); });

/* ---------- UI ---------- */
function showNote(text, ms) {
  const n = $('note'); n.textContent = text; n.hidden = false;
  clearTimeout(showNote.t); if (ms) showNote.t = setTimeout(() => { n.hidden = true; }, ms);
}
function announce(t) { $('live').textContent = t; }
function setPlaying(on) {
  S.playing = on; lastInput = performance.now();
  $('playBtn').textContent = on ? COPY.pause : COPY.play;
  $('playBtn').setAttribute('aria-pressed', String(!on));
  if (on) { $('note').hidden = true; requestRender(); }
}
// small round "slide" thumbnail for each tray button, drawn procedurally
function drawThumb(cv, kind) {
  const d = Math.min(window.devicePixelRatio || 1, 2), w = 44, h = 30;
  cv.width = w * d; cv.height = h * d;
  const c = cv.getContext('2d'); if (!c) return;
  c.scale(d, d);
  c.beginPath(); c.arc(w / 2, h / 2, 14, 0, 7); c.fillStyle = '#f1ead4'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#2a2a26'; c.stroke();
  c.save(); c.beginPath(); c.arc(w / 2, h / 2, 13, 0, 7); c.clip(); c.translate(w / 2, h / 2);
  c.strokeStyle = '#4a4538'; c.lineWidth = 1; c.fillStyle = 'rgba(120,112,90,0.35)';
  const blob = (f) => { c.beginPath(); f(); c.fill(); c.stroke(); };
  if (kind === 0) { c.rotate(-0.4); blob(() => c.ellipse(0, 0, 11, 3.6, 0, 0, 7)); for (let a = 0; a < 6.28; a += 0.35) { c.beginPath(); c.moveTo(Math.cos(a) * 11, Math.sin(a) * 3.6); c.lineTo(Math.cos(a) * 13, Math.sin(a) * 5.2); c.stroke(); } }
  else if (kind === 1) blob(() => { for (let a = 0; a <= 6.3; a += 0.2) { const r = 6 + 4 * Math.exp(-Math.pow(Math.sin((a - 0.5) / 2), 2) * 30) + 3 * Math.exp(-Math.pow(Math.sin((a - 2.8) / 2), 2) * 30) + 2.5 * Math.exp(-Math.pow(Math.sin((a - 4.6) / 2), 2) * 30); a ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); });
  else if (kind === 2) { c.rotate(0.3); c.fillStyle = 'rgba(70,150,60,0.55)'; blob(() => c.ellipse(-2, 0, 8, 2.6, 0, 0, 7)); c.beginPath(); c.moveTo(6, 0); for (let x = 0; x < 8; x += 0.5) c.lineTo(6 + x, Math.sin(x * 1.3) * 1.4); c.stroke(); c.fillStyle = '#c0392b'; c.beginPath(); c.arc(4.5, 0.3, 0.9, 0, 7); c.fill(); }
  else if (kind === 3) { c.fillStyle = 'rgba(90,85,70,0.7)'; for (let i = 0; i < 9; i++) { c.save(); c.translate(Math.cos(i * 2.4) * (3 + i), Math.sin(i * 2.4) * (2 + i * 0.8)); c.rotate(i * 1.3); c.beginPath(); c.ellipse(0, 0, 1.8, 0.7, 0, 0, 7); c.fill(); c.restore(); } }
  else if (kind === 4) { for (const [x, y, r] of [[-4, -2, 4], [3, 3, 3.6], [6, -3, 2.2], [-6, 5, 2.6]]) blob(() => c.arc(x, y, r, 0, 7)); }
  else if (kind === 5) { c.rotate(-0.3); c.fillStyle = 'rgba(176,128,60,0.45)'; blob(() => c.ellipse(0, 0, 11, 2.6, 0, 0, 7)); for (let x = -9; x <= 9; x += 1.6) { c.beginPath(); c.moveTo(x, -2); c.lineTo(x, -0.7); c.moveTo(x, 0.7); c.lineTo(x, 2); c.stroke(); } }
  c.restore();
}
function buildTray() {
  const tray = $('tray'); tray.textContent = '';
  ORGS.forEach((o, i) => {
    const cv = el('canvas', { 'aria-hidden': 'true', class: 'thumb' });
    const b = el('button', { type: 'button', 'aria-pressed': String(i === S.org), 'data-i': String(i) }, cv, el('span', { text: o.name }), ' ', el('small', { text: o.sizeLabel.split(',')[0] }));
    drawThumb(cv, o.kind);
    b.addEventListener('click', () => { if (trayDrag.suppress) { trayDrag.suppress = false; return; } if (S.view === 'pond') dropOrg(i); else setOrg(i, true); });
    b.addEventListener('pointerdown', (e) => trayDown(e, i));
    tray.append(el('li', {}, b));
  });
}

/* ---------- pond: adding organisms and food ---------- */
const POND_DROP = { paramecium: [1, 0], amoeba: [1, 0], euglena: [1, 0], bacteria: [8, 12], yeast: [4, 10], diatom: [1, 0] };
const FOOD_DROP = { bacteria: [16, 45], yeast: [8, 35], algae: [12, 45] };
function inDrop(w) { const r = Math.hypot(w.x, w.y), lim = ARENA - 20; return r > lim ? { x: w.x * lim / r, y: w.y * lim / r } : w; }
function dropAt(sp, w, n, spread, label) {
  const p = inDrop(w), added = pond.drop(sp, p.x, p.y, n, spread);
  if (added) { announce(`Added ${added === 1 ? `${/^[aeiou]/.test(NAMES[sp][0]) ? 'an' : 'a'} ${NAMES[sp][0]}` : `${added} ${NAMES[sp][1]}`} ${label || 'in the middle of the view'}.`); hudTick(0, true); }
}
function dropOrg(i, w) { const sp = ORGS[i].id, [n, spread] = POND_DROP[sp]; dropAt(sp, w || jitter(), n, spread, w ? 'where you dropped it' : ''); }
function jitter() { const a = Math.random() * 6.28, r = 0.08 * STEPS[S.mag].fovUm * Math.random(); return { x: S.cam.x + Math.cos(a) * r, y: S.cam.y + Math.sin(a) * r }; }
const trayDrag = { on: false, suppress: false };
function trayDown(e, i) {
  if (S.view !== 'pond') return;
  const btn = e.currentTarget, x0 = e.clientX, y0 = e.clientY, ghost = $('ghost');
  btn.setPointerCapture(e.pointerId);
  const move = (ev) => {
    if (!trayDrag.on && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { trayDrag.on = true; ghost.textContent = ORGS[i].name; ghost.hidden = false; }
    if (trayDrag.on) ghost.style.transform = `translate(${ev.clientX - 22}px, ${ev.clientY - 22}px)`;
  };
  const up = (ev) => {
    btn.removeEventListener('pointermove', move); btn.removeEventListener('pointerup', up); btn.removeEventListener('pointercancel', up);
    if (trayDrag.on) {
      trayDrag.on = false; trayDrag.suppress = true; ghost.hidden = true;
      setTimeout(() => { trayDrag.suppress = false; }, 400);
      const r = stage.getBoundingClientRect(), cx = ev.clientX - r.left, cy = ev.clientY - r.top;
      if (ev.type === 'pointerup' && Math.hypot(cx - G.cx, cy - G.cy) < G.R) dropOrg(i, worldAt(cx, cy));
    }
  };
  btn.addEventListener('pointermove', move); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
}

/* ---------- pond: lamp spot for euglena ---------- */
const lamp = $('lamp');
function placeLamp() {
  const L = pond.P.light, p = screenOf(L.x, L.y), on = Math.hypot(p.x - G.cx, p.y - G.cy) < G.R - 10;
  lamp.style.transform = `translate(${p.x - 22}px, ${p.y - 22}px)`;
  lamp.classList.toggle('off', !on);
}
function moveLamp(x, y) {
  const r = Math.hypot(x, y), lim = ARENA - 40;
  if (r > lim) { x *= lim / r; y *= lim / r; }
  pond.P.light.x = x; pond.P.light.y = y; placeLamp(); requestRender();
}
lamp.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); lamp.setPointerCapture(e.pointerId);
  const mv = (ev) => { const r = stage.getBoundingClientRect(); const w = worldAt(ev.clientX - r.left, ev.clientY - r.top); moveLamp(w.x, w.y); };
  const up = () => { lamp.removeEventListener('pointermove', mv); lamp.removeEventListener('pointerup', up); announce(lampWhere()); };
  lamp.addEventListener('pointermove', mv); lamp.addEventListener('pointerup', up);
});
lamp.addEventListener('keydown', (e) => {
  const d = 0.05 * STEPS[S.mag].fovUm, L = pond.P.light, k = e.key;
  if (!k.startsWith('Arrow')) return;
  e.preventDefault();
  moveLamp(L.x + (k === 'ArrowRight' ? d : k === 'ArrowLeft' ? -d : 0), L.y + (k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0));
  clearTimeout(lamp.t); lamp.t = setTimeout(() => announce(lampWhere()), 600);
});
function compass(dx, dy) {
  if (Math.hypot(dx, dy) < 0.05 * STEPS[S.mag].fovUm) return 'in the middle of the view';
  const a = Math.atan2(dy, dx) * 180 / Math.PI, names = ['right', 'upper right', 'top', 'upper left', 'left', 'lower left', 'bottom', 'lower right'];
  return `toward the ${names[((Math.round(a / 45) % 8) + 8) % 8]} of the view${Math.hypot(dx, dy) > STEPS[S.mag].fovUm / 2 ? ', outside the field' : ''}`;
}
function lampWhere() { const L = pond.P.light; return `Lamp spot ${compass(L.x - S.cam.x, L.y - S.cam.y)}.`; }

/* ---------- pond: counts, chart, clock ---------- */
let hudT = 0;
function hudTick(now, force) {
  if (!force && now - hudT < 250) return;
  hudT = now || performance.now();
  const c = pond.counts(), ul = $('counts');
  if (ul.childElementCount !== SPECIES.length) {
    ul.textContent = '';
    for (const s of SPECIES) { const sw = el('i'); sw.style.background = COLORS[s]; ul.append(el('li', { 'data-s': s }, sw, el('span', { class: 'cn' }), el('b', { class: 'cv' }))); }
  }
  for (const li of ul.children) { const s = li.dataset.s; li.querySelector('.cn').textContent = c[s] === 1 ? NAMES[s][0] : NAMES[s][1]; li.querySelector('.cv').textContent = String(c[s]); li.classList.toggle('zero', !c[s]); }
  $('clock').textContent = `${S.speed === 1 ? 'Motion real speed' : `Motion ${SPEEDS.find((x) => x.v === S.speed).label}`} · ${COPY.lifeClock}`;
  drawChart();
  if (!force && now - (hudTick.alt || 0) > 1000) { hudTick.alt = now; updateAlt(); }
}
function drawChart() {
  const cv = $('popChart'), H0 = pond.P.hist;
  const w = cv.clientWidth || 300, h = 80, d = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = h * d; }
  const c = cv.getContext('2d'); if (!c) return;
  c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement);
  c.strokeStyle = cs.getPropertyValue('--line'); c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, h - 0.5); c.lineTo(w, h - 0.5); c.stroke();
  if (H0.length < 2) return;
  let mx = 5; for (const r of H0) for (const s of SPECIES) mx = Math.max(mx, r[s]);
  c.lineWidth = 2;
  for (const s of SPECIES) {
    if (!H0.some((r) => r[s])) continue;
    c.strokeStyle = COLORS[s]; c.beginPath();
    H0.forEach((r, i) => { const x = (i / 119) * w, y = h - 3 - (r[s] / mx) * (h - 8); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
  }
}

/* ---------- views: slides and pond ---------- */
function setView(v, user) {
  S.view = v; const pondOn = v === 'pond';
  document.body.classList.toggle('pond', pondOn);
  $('viewSlides').setAttribute('aria-pressed', String(!pondOn)); $('viewPond').setAttribute('aria-pressed', String(pondOn));
  $('pondPanel').hidden = !pondOn; $('trayHint').hidden = !pondOn; lamp.hidden = !pondOn; $('clock').hidden = !pondOn;
  $('slidesHd').textContent = pondOn ? COPY.addHeading : COPY.slidesHeading;
  $('badge').textContent = pondOn ? COPY.pondLabel : COPY.realSize;
  $('introP').textContent = pondOn ? COPY.pondIntro : COPY.intro;
  $('tray').querySelectorAll('button').forEach((b, j) => {
    if (pondOn) { b.removeAttribute('aria-pressed'); b.setAttribute('aria-label', `Add ${/^[aeiou]/i.test(ORGS[j].name) ? 'an' : 'a'} ${ORGS[j].name.toLowerCase()} to the slide`); }
    else { b.setAttribute('aria-pressed', String(j === S.org)); b.removeAttribute('aria-label'); }
  });
  $('guide').hidden = true; ring.hidden = true;
  if (pondOn) {
    pond.seed();
    $('orgTitle').textContent = COPY.modePond; $('orgLatin').textContent = '';
    document.title = `${COPY.modePond}: Virtual Microscope`;
    $('followBtn').hidden = true; S.follow = false;
    S.cam.x = 0; S.cam.y = 0; S.focus = 0;
    setMag(1);
    if (user) history.replaceState(null, '', '#pond');
    if (reduceMQ.matches) { setPlaying(false); showNote(COPY.reducedMotion); }
    hudTick(0, true);
    if (user) announce(`${COPY.modePond}. ${pond.summary()} ${COPY.lifeClockLong}`);
  } else {
    setOrg(S.org, false);
    if (user) { history.replaceState(null, '', `#${ORGS[S.org].id}`); announce(`${ORGS[S.org].name} slide.`); }
  }
  requestRender();
}
function buildSteps() {
  const ol = $('steps'); ol.textContent = '';
  STEPS.forEach((st, i) => {
    const b = el('button', { type: 'button', 'aria-label': `${st.total} times, field ${fmtUm(st.fovUm)}` }, `${st.total}x`, el('small', { text: fmtUm(st.fovUm) }));
    b.addEventListener('click', () => setMag(i));
    ol.append(el('li', {}, b));
  });
  const sp = $('speeds');
  SPEEDS.forEach((o) => {
    const b = el('button', { class: 'btn', type: 'button', 'aria-pressed': String(o.v === S.speed), 'aria-label': o.v === 1 ? 'Real time' : `${o.label} speed` }, o.label);
    b.addEventListener('click', () => { S.speed = o.v; sp.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(SPEEDS[j].v === o.v))); updateAlt(); if (!S.playing) setPlaying(true); });
    sp.append(b);
  });
}
function setMag(i) {
  S.mag = Math.max(0, Math.min(STEPS.length - 1, i));
  const st = STEPS[S.mag];
  $('steps').querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', String(j === S.mag)));
  const f = $('focus'); f.min = -st.focusRange; f.max = st.focusRange; f.step = st.focusRange >= 100 ? 2 : st.focusRange >= 30 ? 0.5 : 0.1;
  S.focus = Math.max(-st.focusRange, Math.min(st.focusRange, S.focus)); f.value = S.focus;
  $('focusMin').textContent = `-${st.focusRange} µm`; $('focusMax').textContent = `+${st.focusRange} µm`;
  setFocus(S.focus);
  updateScale(true); updateAlt();
  const tb = barFor((2 * G.R) / st.fovUm);
  announce(`${st.total}x. Field of view ${fmtUm(st.fovUm)}. Scale bar ${tb.um >= 1000 ? tb.um / 1000 + ' millimetre' : tb.um + ' micrometres'}.`);
  requestRender();
}
function setFocus(v) {
  S.focus = +v; $('focus').value = S.focus;
  $('focusOut').textContent = `${S.focus > 0 ? '+' : ''}${(+S.focus).toFixed(STEPS[S.mag].focusRange >= 30 ? 1 : 2).replace(/\.?0+$/, '') || 0} µm`;
  updateAlt(); requestRender();
}
function setMode(m) {
  S.mode = m;
  $('bf').setAttribute('aria-pressed', String(m === 0)); $('df').setAttribute('aria-pressed', String(m === 1));
  const ul = $('legend'); ul.textContent = '';
  for (const it of DATA.legend[m === 0 ? 'brightfield' : 'darkfield']) { const sw = el('i'); sw.style.background = it.swatch; ul.append(el('li', {}, sw, el('span', { text: it.text }))); }
  updateAlt(); requestRender();
}
function setFollow(on) {
  S.follow = on && hasTarget();
  $('followBtn').setAttribute('aria-pressed', String(S.follow));
  requestRender();
}
function setOrg(i, user) {
  S.org = i; const o = ORGS[i];
  $('tray').querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  $('orgTitle').textContent = o.name; $('orgLatin').textContent = o.latin;
  document.title = `${o.name}: Virtual Microscope`;
  makeInstances();
  S.cam.x = S.inst[0] ? S.inst[0].x : 0; S.cam.y = S.inst[0] ? S.inst[0].y : 0;
  S.focus = 0;
  $('followBtn').hidden = !hasTarget();
  setFollow(true);
  $('guide').hidden = true; ring.hidden = true;
  setMag(o.defaultMag);
  if (user) { history.replaceState(null, '', `#${o.id}`); announce(`${o.name} slide. ${STEPS[S.mag].total}x.`); }
}

/* field guide */
const srcIds = Object.keys(SRC);
function buildSources() {
  const ul = $('sourceList'); ul.textContent = '';
  srcIds.forEach((id, n) => {
    const s = SRC[id];
    ul.append(el('li', { id: `src-${id}` }, `[${n + 1}] ${s.title}. ${s.publisher}. `, el('a', { href: s.url, rel: 'noopener noreferrer', target: '_blank', text: s.url }), `. Checked ${s.checked}.`));
  });
}
function supFor(ids) {
  const sup = el('sup');
  ids.forEach((id) => sup.append(el('a', { href: `#src-${id}`, 'aria-label': `source ${srcIds.indexOf(id) + 1}: ${SRC[id].title}`, text: `[${srcIds.indexOf(id) + 1}]` })));
  return sup;
}
function factList(ol, items) { ol.textContent = ''; for (const f of items) { const li = el('li', {}, f.text); li.append(supFor(f.sources)); ol.append(li); } }
// target: an index into S.inst (slides), a point {x,y}, or {agent} (pond)
function identify(target, orgIndex = S.org) {
  const o = ORGS[orgIndex];
  $('guideTitle').textContent = ''; $('guideTitle').append(`${o.name} `, el('i', { text: o.latin }));
  factList($('facts'), o.story);
  factList($('pondFacts'), o.pond || []);
  $('pondFactsHd').hidden = !(o.pond && o.pond.length);
  $('guideSize').textContent = `${COPY.sizeDrawn} ${o.sizeLabel}. ${COPY.realSize}. ${o.motion.sources.length ? '' : o.motion.note}`;
  showGuide(target, `Identified: ${o.name}. ${(S.view === 'pond' && o.pond ? o.pond[0] : o.story[0]).text}`);
}
function identifyFood(a) {
  const f = DATA.food[a.sp];
  $('guideTitle').textContent = ''; $('guideTitle').append(`${f.name} `, el('i', { text: f.latin || '' }));
  const size = `${f.diameterUm} micrometres across`;
  factList($('facts'), [{ text: `Food for the pond. About ${size}.`, sources: f.sources }]);
  $('pondFacts').textContent = ''; $('pondFactsHd').hidden = true;
  $('guideSize').textContent = `${COPY.sizeDrawn} ${size}. ${COPY.realSize}.`;
  showGuide({ agent: a }, `Identified: ${f.name}, food. About ${size}.`);
}
function showGuide(target, say) {
  $('guide').hidden = false;
  S.ringTarget = target;
  ring.hidden = false; clearTimeout(identify.t); identify.t = setTimeout(() => { ring.hidden = true; }, 5000);
  placeRing();
  $('guide').focus({ preventScroll: true });
  $('guide').scrollIntoView({ block: 'nearest', behavior: reduceMQ.matches ? 'auto' : 'smooth' });
  announce(say);
}
const ring = $('ring');
function screenOf(x, y) { return { x: G.cx + (x - S.cam.x) * G.pxPerUm, y: G.cy - (y - S.cam.y) * G.pxPerUm }; }
function sizeOf(p) { const k = ORGS[S.org].kind; return k === 1 ? p.R0 * 3.2 : p.L; }
function agentSize(a) { return a.R0 ? a.R0 * a.g * 3 : a.L ? a.L * a.g : (a.r || 1) * 2; }
function placeRing() {
  if (ring.hidden) return;
  let x, y, d;
  const T = S.ringTarget;
  if (T && T.agent) {
    if (T.agent.dead) { ring.hidden = true; return; }
    const [px, py] = pond.pose(T.agent), sc = screenOf(px, py);
    x = sc.x; y = sc.y; d = Math.max(44, Math.min(agentSize(T.agent) * G.pxPerUm * 1.15, G.R * 2));
  } else if (typeof T === 'number' && S.inst[T]) {
    const p = S.inst[T], q = pose(p), sc = screenOf(q.x, q.y);
    x = sc.x; y = sc.y; d = Math.max(44, Math.min(sizeOf(p) * G.pxPerUm * 1.1, G.R * 2));
  } else if (T) { const sc = screenOf(T.x, T.y); x = sc.x; y = sc.y; d = 44; } else return;
  ring.style.width = ring.style.height = `${d}px`;
  ring.style.transform = `translate(${x - d / 2}px, ${y - d / 2}px)`;
}
function worldAt(cx, cy) { return { x: S.cam.x + (cx - G.cx) / G.pxPerUm, y: S.cam.y - (cy - G.cy) / G.pxPerUm }; }
function hitTest(w) {
  const k = ORGS[S.org].kind, tol = 14 / G.pxPerUm;
  let best = -1, bd = 1e9;
  S.inst.forEach((p, i) => {
    const q = pose(p), dx = w.x - q.x, dy = w.y - q.y;
    const u = dx * Math.cos(q.h) + dy * Math.sin(q.h), v = -dx * Math.sin(q.h) + dy * Math.cos(q.h);
    let inside;
    if (k === 1) inside = Math.hypot(dx, dy) < p.R0 * 1.8 + tol;
    else { const hw = k === 3 ? 3 : (p.W || 4) / 2; inside = Math.abs(u) < p.L / 2 + tol && Math.abs(v) < hw + tol; }
    const dist = Math.hypot(dx, dy);
    if (inside && dist < bd) { bd = dist; best = i; }
  });
  return best;
}
function identifyAgent(a) {
  const i = ORGS.findIndex((o) => o.id === a.sp);
  if (i >= 0) identify({ agent: a }, i); else identifyFood(a);
}
function identifyAt(cx, cy) {
  if (Math.hypot(cx - G.cx, cy - G.cy) > G.R) return;
  const w = worldAt(cx, cy);
  if (S.view === 'pond') {
    const a = pond.hit(w, 14 / G.pxPerUm);
    if (a) identifyAgent(a); else { showNote(COPY.missed, 3000); announce(COPY.missed); }
    return;
  }
  const k = ORGS[S.org].kind;
  if (k === 3 || k === 4) { identify(w); return; }
  const i = hitTest(w);
  if (i >= 0) identify(i); else { showNote(COPY.missed, 3000); announce(COPY.missed); }
}
function identifyCentre() {
  if (S.view === 'pond') {
    let best = null, bd = 1e9;
    for (const a of pond.P.agents) { if (a.cap) continue; const [x, y] = pond.pose(a), d = Math.hypot(x - S.cam.x, y - S.cam.y) - (a.R0 ? 0.6 * a.R0 : 0) + (['bacteria', 'yeast', 'algae'].includes(a.sp) ? 0.12 * STEPS[S.mag].fovUm : 0); if (d < bd) { bd = d; best = a; } }
    if (best && bd < STEPS[S.mag].fovUm / 2) identifyAgent(best); else { showNote(COPY.empty, 3000); announce(COPY.empty); }
    return;
  }
  const k = ORGS[S.org].kind;
  if (k === 3 || k === 4) { identify(worldAt(G.cx, G.cy)); return; }
  let best = 0, bd = 1e9;
  S.inst.forEach((p, i) => { const q = pose(p), d = Math.hypot(q.x - S.cam.x, q.y - S.cam.y); if (d < bd) { bd = d; best = i; } });
  identify(best);
}

/* text alternative */
function updateAlt() {
  const o = ORGS[S.org], st = STEPS[S.mag];
  const blurUm = Math.max(Math.abs(S.focus) - st.dof / 2, 0) * st.tan;
  const focusTxt = blurUm * G.pxPerUm < 1.5 ? 'The middle layer of the cells is in sharp focus.' : `The focus is ${Math.abs(S.focus)} micrometres ${S.focus > 0 ? 'above' : 'below'} the middle of the cells, so the middle layer looks ${blurUm * G.pxPerUm > 8 ? 'very blurred' : 'soft'}.`;
  const motion = !S.playing ? 'Movement is paused.' : `Movement is shown at ${S.speed === 1 ? 'real speed' : SPEEDS.find((x) => x.v === S.speed).label + ' of real speed'}.`;
  const light = S.mode ? 'darkfield light: a black background with glowing outlines' : 'brightfield light: a pale gold background with darker outlines';
  if (S.view === 'pond') {
    $('viewalt').textContent = `Pond slide in ${light}, at ${st.total}x. The round field shows a patch ${fmtUm(st.fovUm)} across, inside a drop of water ${fmtUm(ARENA * 2)} wide. ${pond.summary()} ${lampWhere()} Organisms sit at slightly different depths, so some look softer until you focus on them. ${motion} ${COPY.lifeClockLong} The scale bar reads ${S.bar ? fmtUm(S.bar.um) : ''}.`;
    return;
  }
  const main = S.inst[0];
  const sizeUm = main ? (o.kind === 1 ? 420 : main.L) : (o.kind === 4 ? 5 : 2);
  const pct = Math.round((sizeUm / st.fovUm) * 100);
  $('viewalt').textContent = `${o.name} slide in ${light}, at ${st.total}x. The round field shows a patch ${fmtUm(st.fovUm)} across. You can see ${o.parts}. Each is drawn at ${o.sizeLabel}, about ${pct < 1 ? 'less than 1' : pct} percent of the field width. ${focusTxt} ${motion} The scale bar reads ${S.bar ? fmtUm(S.bar.um) : ''}.`;
}

/* ---------- input ---------- */
let down = null;
view.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, cam: { ...S.cam }, moved: false }; view.setPointerCapture(e.pointerId); lastInput = performance.now(); });
view.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (!down.moved && Math.hypot(dx, dy) > 6) { down.moved = true; setFollow(false); }
  if (down.moved) { S.cam.x = down.cam.x - dx / G.pxPerUm; S.cam.y = down.cam.y + dy / G.pxPerUm; requestRender(); }
});
view.addEventListener('pointerup', (e) => {
  if (down && !down.moved) { const r = stage.getBoundingClientRect(); identifyAt(e.clientX - r.left, e.clientY - r.top); }
  down = null;
});
view.addEventListener('pointercancel', () => { down = null; });
view.addEventListener('wheel', (e) => { e.preventDefault(); const st = STEPS[S.mag]; setFocus(Math.max(-st.focusRange, Math.min(st.focusRange, S.focus - Math.sign(e.deltaY) * st.focusRange / 40))); }, { passive: false });
const FOOD_KEYS = { b: 'bacteria', y: 'yeast', g: 'algae' };
view.addEventListener('keydown', (e) => {
  lastInput = performance.now();
  const st = STEPS[S.mag], k = e.key, pan = 0.1 * st.fovUm;
  let used = true;
  if (k === 'Enter') identifyCentre();
  else if (k === ' ' || k === 'Spacebar') setPlaying(!S.playing);
  else if (k === '+' || k === '=') setMag(S.mag + 1);
  else if (k === '-' || k === '_') setMag(S.mag - 1);
  else if (k === 'PageUp') setFocus(Math.min(st.focusRange, S.focus + st.focusRange / 20));
  else if (k === 'PageDown') setFocus(Math.max(-st.focusRange, S.focus - st.focusRange / 20));
  else if (k.startsWith('Arrow')) {
    setFollow(false);
    S.cam.x += k === 'ArrowLeft' ? -pan : k === 'ArrowRight' ? pan : 0;
    S.cam.y += k === 'ArrowDown' ? -pan : k === 'ArrowUp' ? pan : 0;
    requestRender();
  } else if (k === 'l' || k === 'L') setMode(1 - S.mode);
  else if ((k === 'f' || k === 'F') && S.view !== 'pond') setFollow(!S.follow);
  else if (/^[1-6]$/.test(k)) { if (S.view === 'pond') dropOrg(+k - 1); else setOrg(+k - 1, true); }
  else if (S.view === 'pond' && FOOD_KEYS[k.toLowerCase()]) addFood(FOOD_KEYS[k.toLowerCase()]);
  else used = false;
  if (used) e.preventDefault();
});
function addFood(sp) { const [n, spread] = FOOD_DROP[sp]; dropAt(sp, jitter(), n, spread, 'near the middle of the view'); }
function fineFocus(dir) { const st = STEPS[S.mag], d = Math.max(st.dof / 4, st.focusRange / 200); setFocus(Math.max(-st.focusRange, Math.min(st.focusRange, Math.round((S.focus + dir * d) * 100) / 100))); }
document.addEventListener('pointerdown', () => { lastInput = performance.now(); }, true);
$('focus').addEventListener('input', (e) => { lastInput = performance.now(); setFocus(e.target.value); });
// in the pond, Refocus finds the organism nearest the middle of the view and focuses on its depth
$('refocus').addEventListener('click', () => {
  if (S.view !== 'pond') { setFocus(0); return; }
  let best = null, bd = 1e9;
  for (const a of pond.P.agents) { if (a.cap || ['bacteria', 'yeast', 'algae'].includes(a.sp)) continue; const d = Math.hypot(a.x - S.cam.x, a.y - S.cam.y); if (d < bd) { bd = d; best = a; } }
  const st = STEPS[S.mag], z = best && bd < st.fovUm ? best.z : 0;
  setFocus(Math.max(-st.focusRange, Math.min(st.focusRange, Math.round(z * 10) / 10)));
  if (best && bd < st.fovUm) announce(`Focused on the ${NAMES[best.sp][0]} nearest the middle.`);
});
$('fineUp').addEventListener('click', () => fineFocus(1));
$('fineDown').addEventListener('click', () => fineFocus(-1));
$('bf').addEventListener('click', () => setMode(0));
$('df').addEventListener('click', () => setMode(1));
$('playBtn').addEventListener('click', () => setPlaying(!S.playing));
$('followBtn').addEventListener('click', () => setFollow(!S.follow));
$('identifyBtn').addEventListener('click', identifyCentre);
$('viewSlides').addEventListener('click', () => { if (S.view !== 'slides') setView('slides', true); });
$('viewPond').addEventListener('click', () => { if (S.view !== 'pond') setView('pond', true); });
document.querySelectorAll('[data-food]').forEach((b) => b.addEventListener('click', () => addFood(b.dataset.food)));
$('clearBtn').addEventListener('click', () => { pond.clear(); ring.hidden = true; $('guide').hidden = true; hudTick(0, true); updateAlt(); announce(COPY.empty); });
new ResizeObserver(() => { layout(); requestRender(); }).observe(stage);
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (h === 'pond') { if (S.view !== 'pond') setView('pond', false); return; }
  const i = ORGS.findIndex((o) => o.id === h);
  if (i >= 0) { if (S.view === 'pond') { S.org = i; setView('slides', false); } else if (i !== S.org) setOrg(i, false); }
});

/* ---------- start ---------- */
buildTray(); buildSteps(); buildSources();
if (!initGL()) useFallback();
layout();
setMode(0);
setOrg(S.org, false);
if (hashId === 'pond') setView('pond', false);
setPlaying(S.playing);
if (reduceMQ.matches) showNote(COPY.reducedMotion);
requestRender();

// test hook (read-only numbers the done-test checks)
window.__scope = {
  get state() {
    const st = STEPS[S.mag], o = ORGS[S.org];
    return {
      view: S.view, organism: o.id, kind: o.kind, mag: st.total, fovUm: st.fovUm, circleDiameterPx: 2 * G.R, pxPerUm: G.pxPerUm, zooming: !!G.anim,
      bar: S.bar, focus: S.focus, playing: S.playing, simT: S.simT, renderer: gl ? 'webgl' : ctx ? '2d' : 'none', pondGL: pond.gl,
      fps: fpsNow(), quality, dpr: glc.width / W, cam: { ...S.cam },
      inst: S.inst.map((p) => ({ ...pose(p), L: p.L, W: p.W, R0: p.R0 })),
      pond: { counts: pond.counts(), size: pond.size, life: pond.P.life, light: { ...pond.P.light } },
    };
  },
  freeze(h = 0) { setPlaying(false); S.inst.forEach((p) => { p.h = h; if ('roll' in p) p.roll = 1.5708; }); if (S.inst[0]) { S.cam.x = pose(S.inst[0]).x; S.cam.y = pose(S.inst[0]).y; } requestRender(); },
  // test helpers for the pond: run the simulation forward without rendering, look at a point
  pondRun(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) pond.step(dt * S.speed, dt * pond.LIFE, performance.now() / 1000 + t); requestRender(); return pond.counts(); },
  look(x, y) { S.cam.x = x; S.cam.y = y; requestRender(); },
  agents() { return pond.P.agents.map((a) => ({ sp: a.sp, x: a.x, y: a.y, cap: !!a.cap, food: a.food, g: a.g })); },
};

