// Heat vs the bonds of life: the three illustrative models (DNA melting, a protein unfolding, water changing phase).
// Pure maths, no DOM and no three.js, so the same models feed the 3D renderer and the flat 2D fallback.
// Each sim: step(dt, T, still) advances it at temperature T (degrees C); build(frame) writes spheres, sticks and
// hydrogen bonds into a Frame; info() returns numbers for the status text. 'still' means no random motion
// (reduced motion or paused): the model settles straight to its state for that temperature.
// Measured temperatures come from heat.json (sources in sources.json); shapes and timings are illustrative.

export class Frame {
  constructor(maxS, maxK, maxH) {
    this.sp = new Float32Array(maxS * 4); this.sc = new Float32Array(maxS * 3); this.ns = 0; this.maxS = maxS;
    this.k = new Float32Array(maxK * 7); this.kc = new Float32Array(maxK * 3); this.nk = 0; this.maxK = maxK;
    this.h = new Float32Array(maxH * 7); this.nh = 0; this.maxH = maxH;
  }
  reset() { this.ns = 0; this.nk = 0; this.nh = 0; }
  s(x, y, z, r, c) {
    if (this.ns >= this.maxS) return;
    const i = this.ns++; this.sp.set([x, y, z, r], i * 4); this.sc.set(c, i * 3);
  }
  stick(a, b, w, c) {
    if (this.nk >= this.maxK) return;
    const i = this.nk++; this.k.set([a[0], a[1], a[2], b[0], b[1], b[2], w], i * 7); this.kc.set(c, i * 3);
  }
  hb(a, b, alpha) {
    if (alpha <= 0.02 || this.nh >= this.maxH) return;
    const i = this.nh++; this.h.set([a[0], a[1], a[2], b[0], b[1], b[2], Math.min(1, alpha)], i * 7);
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const logistic = (x) => 1 / (1 + Math.exp(-x));
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
function rng(seed) { // mulberry32: the same "random" shapes on every load
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------------------------------------------------------------------------------------------
// DNA: 30 base pairs. Left half seqA (about 40% G-C), right half seqB (67% G-C). Each half opens near its measured
// melting point (86.5 and 97 C); within a half, G-C pairs open a little later than A-T pairs (illustrative).
export function dnaSim(cfg) {
  const seq = (cfg.seqA + cfg.seqB).toUpperCase();
  const N = seq.length, half = cfg.seqA.length;
  const RISE = 0.34, BPT = 10.5, TW = 2 * Math.PI / BPT, R = 0.88, PHI = 2.55;
  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const COL = { A: hex('#ff7a2f'), T: hex('#ffd166'), G: hex('#22c27a'), C: hex('#8ff0c4') };
  const S1 = hex('#49b8ff'), S2 = hex('#b07cff'), STK = hex('#9fb4c8');
  const r = rng(7);
  const isGC = (L) => L === 'G' || L === 'C';
  let tm = Array.from(seq, (L, i) => (i < half ? cfg.tmA : cfg.tmB) + (isGC(L) ? 1.1 : -1.1) + (r() - 0.5) * 0.8);
  tm = tm.map((v, i) => 0.5 * v + 0.25 * (tm[Math.max(0, i - 1)] + tm[Math.min(N - 1, i + 1)]));
  const open = new Float32Array(N), flick = new Float32Array(N), eff = new Float32Array(N);
  let spin = 0, drift = 0, T = 37;

  function step(dt, temp, still) {
    T = temp;
    for (let i = 0; i < N; i++) {
      const target = logistic((T - tm[i]) / 0.9);
      open[i] = still ? target : open[i] + (target - open[i]) * Math.min(1, dt * 2.5);
      if (!still) {
        // breathing: near its melting point a pair flickers open for a moment and closes again
        const near = Math.exp(-Math.abs(T - tm[i]) / 2.5);
        if (Math.random() < near * dt * 1.6) flick[i] = 0.6 + Math.random() * 0.4;
        flick[i] = Math.max(0, flick[i] - dt * 1.8);
      } else flick[i] = 0;
    }
    for (let i = 0; i < N; i++) { // neighbours help: an open pair pulls the next one a little open (cooperative)
      const o = Math.max(open[i], flick[i]);
      const nb = Math.max(open[Math.max(0, i - 1)], open[Math.min(N - 1, i + 1)]);
      eff[i] = clamp(Math.max(o, nb * 0.35 * o + o), 0, 1);
    }
    if (!still) { spin += dt * 0.35; drift += dt; }
  }

  function build(f) {
    f.reset();
    const P1 = [], P2 = [], B1 = [], B2 = [];
    const allOpen = eff.reduce((a, b) => a + b, 0) / N;
    for (let i = 0; i < N; i++) {
      // smooth the separation along the helix so an open bubble looks like a bubble
      const e = (eff[Math.max(0, i - 1)] + 2 * eff[i] + eff[Math.min(N - 1, i + 1)]) / 4;
      const x = (i - (N - 1) / 2) * RISE * 1.0;
      const th = i * TW + spin;
      const sep = smooth(e) * (1.25 + allOpen * 0.9) + (allOpen > 0.97 ? Math.sin(drift * 0.8 + i * 0.3) * 0.12 : 0);
      const unw = smooth(e) * 0.9; // open strands unwind a little
      const p1 = v3(x, R * Math.cos(th - unw) + sep, R * Math.sin(th - unw));
      const p2 = v3(x, R * Math.cos(th + PHI + unw) - sep, R * Math.sin(th + PHI + unw));
      const mid = vlerp(p1, p2, 0.5);
      const reach = lerp(0.78, 0.42, smooth(e));
      P1.push(p1); P2.push(p2); B1.push(vlerp(p1, mid, reach)); B2.push(vlerp(p2, mid, reach));
    }
    for (let i = 0; i < N; i++) {
      const L = seq[i], M = COMP[L];
      f.s(...P1[i], 0.17, S1); f.s(...P2[i], 0.17, S2);
      f.s(...B1[i], 0.2, COL[L]); f.s(...B2[i], 0.2, COL[M]);
      f.stick(P1[i], B1[i], 0.07, COL[L]); f.stick(P2[i], B2[i], 0.07, COL[M]);
      if (i < N - 1) { f.stick(P1[i], P1[i + 1], 0.08, S1); f.stick(P2[i], P2[i + 1], 0.08, S2); }
      const n = isGC(L) ? 3 : 2, a = 1 - smooth(eff[i]) * 1.15;
      if (a > 0) for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * 0.09;
        f.hb([B1[i][0] + off, B1[i][1], B1[i][2]], [B2[i][0] + off, B2[i][1], B2[i][2]], a);
      }
    }
    void STK;
  }

  function info() {
    let n = 0; for (let i = 0; i < N; i++) if (open[i] > 0.5) n++;
    return { open: n, n: N, state: n === 0 ? 'closed' : n === N ? 'all' : 'some' };
  }
  return { step, build, info, view: { w: 11.6, h: 6.4 }, max: [N * 4, N * 4, N * 3], half };
}

// ---------------------------------------------------------------------------------------------
// Protein: a 36 bead chain folded into a coil (each bead hydrogen bonded to the bead 4 along) and a two strand sheet.
// Unfolds near td (ovalbumin, 80.22 C). Like a cooked egg white it stays unfolded once cooked, until reset().
export function proteinSim(cfg) {
  const N = 36, r = rng(11);
  const F = [];
  for (let i = 0; i < 14; i++) { const a = i * (100 * Math.PI / 180); F.push(v3(-3.2 + i * 0.5, 0.9 * Math.cos(a), 0.9 * Math.sin(a))); }
  F.push(v3(3.9, -0.6, 0.4), v3(4.1, -1.4, 0.2), v3(3.7, -2.0, 0));
  for (let j = 0; j < 9; j++) F.push(v3(3.0 - j * 0.75, -2.1, j % 2 ? 0.25 : -0.25));
  F.push(v3(-3.7, -2.7, 0));
  for (let j = 0; j < 9; j++) F.push(v3(-3.0 + j * 0.75, -3.3, j % 2 ? 0.25 : -0.25));
  const c = F.reduce((s, p) => [s[0] + p[0] / N, s[1] + p[1] / N, s[2] + p[2] / N], [0, 0, 0]);
  F.forEach((p) => { p[0] -= c[0]; p[1] -= c[1]; p[2] -= c[2]; });
  const LEN = []; for (let i = 0; i < N - 1; i++) LEN.push(dist(F[i], F[i + 1]));
  // unfolded: a random coil with the same bead spacing, centred
  const U = [v3(-4.5, 0.5, 0)];
  let dir = [1, 0, 0];
  for (let i = 1; i < N; i++) {
    const t = [dir[0] + (r() - 0.5) * 1.6, dir[1] + (r() - 0.5) * 1.6, dir[2] + (r() - 0.5) * 1.2];
    const m = Math.hypot(...t); dir = t.map((v) => v / m);
    const p = U[i - 1]; U.push(v3(p[0] + dir[0] * LEN[i - 1], p[1] + dir[1] * LEN[i - 1] * 0.8, p[2] + dir[2] * LEN[i - 1]));
  }
  const cu = U.reduce((s, p) => [s[0] + p[0] / N, s[1] + p[1] / N, s[2] + p[2] / N], [0, 0, 0]);
  U.forEach((p) => { p[0] -= cu[0]; p[1] -= cu[1]; p[2] -= cu[2]; });
  const HB = [];
  for (let i = 0; i + 4 < 14; i++) HB.push([i, i + 4]);
  for (let j = 0; j < 9; j += 2) HB.push([17 + j, 27 + (8 - j)]);
  const hbA = new Float32Array(HB.length).fill(1), drop = new Float32Array(HB.length);
  const stagger = Array.from({ length: N }, (_, i) => Math.abs(i - N / 2) / N + r() * 0.2);
  const phase = Array.from({ length: N * 3 }, () => r() * Math.PI * 2);
  const COLA = hex('#2ec4b6'), COLB = hex('#ffb347'), STK = hex('#a7b8c6');
  const colors = Array.from({ length: N }, (_, i) => [0, 1, 2].map((k) => lerp(COLA[k], COLB[k], i / (N - 1))));
  let u = 0, cooked = false, T = 37, time = 0, P = F.map((p) => p.slice());

  function step(dt, temp, still) {
    T = temp;
    let target = logistic((T - cfg.td) / 1.2);
    if (target > 0.5) cooked = true;
    if (cooked) target = 1;
    u = still ? target : u + (target - u) * Math.min(1, dt * 1.6);
    if (!still) time += dt;
    const heat = (T + 273.15) / 310.15;
    const amp = still ? 0 : (0.05 + 0.16 * u) * heat;
    for (let i = 0; i < N; i++) {
      const ui = smooth(u * 1.35 - stagger[i] * 0.35);
      const b = vlerp(F[i], U[i], ui);
      P[i] = [b[0] + amp * Math.sin(time * 2.1 + phase[i]), b[1] + amp * Math.sin(time * 1.7 + phase[N + i]), b[2] + amp * Math.sin(time * 2.4 + phase[2 * N + i])];
    }
    for (let it = 0; it < 3; it++) for (let i = 0; i < N - 1; i++) { // keep the beads one bond apart
      const a = P[i], bq = P[i + 1], d = dist(a, bq) || 1e-6, k = (d - LEN[i]) / d * 0.5;
      for (let m = 0; m < 3; m++) { const dm = (bq[m] - a[m]) * k; a[m] += dm; bq[m] -= dm; }
    }
    HB.forEach(([i, j], k) => {
      const base = clamp(1 - smooth(u * 1.35 - stagger[i] * 0.35) * 1.4, 0, 1);
      if (!still && base > 0 && base < 1 && Math.random() < dt * 2.5) drop[k] = 0.3 + Math.random() * 0.4;
      drop[k] = still ? 0 : Math.max(0, drop[k] - dt * 2);
      hbA[k] = drop[k] > 0 ? base * 0.15 : base;
    });
  }

  function build(f) {
    f.reset();
    for (let i = 0; i < N; i++) f.s(...P[i], 0.3, colors[i]);
    for (let i = 0; i < N - 1; i++) f.stick(P[i], P[i + 1], 0.1, STK);
    HB.forEach(([i, j], k) => f.hb(P[i], P[j], hbA[k]));
  }

  function info() {
    const broken = 1 - hbA.reduce((a, b) => a + b, 0) / HB.length;
    const pct = Math.round(broken * 100);
    let state = 'folded';
    if (cooked && u > 0.9) state = T < cfg.td - 5 ? 'cookedCool' : 'cooked';
    else if (pct > 4) state = 'melting';
    return { pct, state, cooked };
  }
  function reset() { cooked = false; u = 0; }
  return { step, build, info, reset, view: { w: 10.5, h: 7.5 }, max: [N, N, HB.length] };
}

// ---------------------------------------------------------------------------------------------
// Water: 40 molecules. Below melt: a puckered honeycomb crystal (like a layer of ice) with fixed hydrogen bonds.
// Between melt and boil: a jostling liquid whose hydrogen bonds flicker. At boil and above: steam.
export function waterSim(cfg) {
  const r = rng(23);
  const L = []; // honeycomb lattice, spacing 1
  for (let j = -4; j <= 4; j++) for (let i = -5; i <= 5; i++) for (let b = 0; b < 2; b++) {
    const x = i * Math.sqrt(3) + j * Math.sqrt(3) / 2, y = j * 1.5 + b;
    L.push(v3(x, y, b ? 0.17 : -0.17));
  }
  L.sort((a, b) => Math.hypot(a[0] * 0.75, a[1]) - Math.hypot(b[0] * 0.75, b[1]));
  const N = 40, LAT = L.slice(0, N);
  const NB = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (dist(LAT[i], LAT[j]) < 1.1) NB.push([i, j]);
  const hDir = LAT.map((p, i) => { // two hydrogens point at two neighbours (ice rule, illustrative)
    const ns = NB.filter(([a, b]) => a === i || b === i).map(([a, b]) => (a === i ? b : a));
    const ang = ns.map((n) => Math.atan2(LAT[n][1] - p[1], LAT[n][0] - p[0]));
    if (ang.length >= 2) return (ang[0] + ang[1]) / 2 + (Math.abs(ang[0] - ang[1]) > Math.PI ? Math.PI : 0);
    return ang.length ? ang[0] : r() * Math.PI * 2;
  });
  const P = LAT.map((p) => p.slice()), V = LAT.map(() => v3()), A = hDir.slice(), W = LAT.map(() => (r() - 0.5) * 2);
  const ph = Array.from({ length: N * N }, () => r() * Math.PI * 2);
  const O = hex('#ff4d4d'), H = hex('#f2f6fa'), STK = hex('#dfe7ee');
  const BOX = { x: 6.2, yLo: -3.6, yHi: 3.9, z: 0.8 };
  let phase = 'liquid', T = 37, time = 0, hbNow = 0, hbList = [];

  function warm() { // first look: a settled liquid
    for (let s = 0; s < 240; s++) step(1 / 30, 37, false, true);
  }

  function step(dt, temp, still, quiet) {
    T = temp; if (!still) time += dt;
    const next = T < cfg.melt ? 'ice' : T >= cfg.boil ? 'steam' : 'liquid';
    if (next !== phase) {
      if (next === 'steam') V.forEach((v) => { v[0] += (r() - 0.5) * 4; v[1] += r() * 3; v[2] += (r() - 0.5) * 0.5; });
      phase = next;
    }
    const kT = (T + 273.15) / 310.15;
    const n = still ? 0 : 1;
    const sub = 2, h = Math.min(dt, 1 / 20) / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < N; i++) {
        const p = P[i], v = V[i];
        if (phase === 'ice') {
          const t = LAT[i], vib = 0.03 * kT * n;
          for (let m = 0; m < 3; m++) { v[m] += (t[m] - p[m]) * 20 * h; v[m] *= 1 - Math.min(1, 6 * h); }
          p[0] += v[0] * h + vib * Math.sin(time * 9 + ph[i]); p[1] += v[1] * h + vib * Math.sin(time * 8 + ph[N + i]); p[2] += v[2] * h;
          A[i] += (hDir[i] - A[i]) * Math.min(1, 6 * h);
          continue;
        }
        const liquid = phase === 'liquid';
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const q = P[j], dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2], d = Math.hypot(dx, dy, dz) || 1e-6;
          let fm = 0;
          if (d < 0.95) fm = (0.95 - d) * 40;
          else if (liquid && d < 1.7) fm = -(d - 0.95) * 1.2;
          v[0] += dx / d * fm * h; v[1] += dy / d * fm * h; v[2] += dz / d * fm * h;
        }
        if (liquid) {
          v[1] -= 2.2 * h; // pools at the bottom of the box
          const kick = 2.4 * Math.sqrt(kT) * n;
          v[0] += (Math.random() - 0.5) * kick * h * 6; v[1] += (Math.random() - 0.5) * kick * h * 6; v[2] += (Math.random() - 0.5) * kick * h * 3;
          for (let m = 0; m < 3; m++) v[m] *= 1 - Math.min(1, (still ? 8 : 1.6) * h);
        } else {
          const sp = Math.hypot(...v), want = 3.2 * Math.sqrt(kT) * n;
          if (n && sp < want) for (let m = 0; m < 3; m++) v[m] *= 1 + (want - sp) / (want + 1e-6) * h * 2;
          if (!n) for (let m = 0; m < 3; m++) v[m] *= 1 - Math.min(1, 8 * h);
        }
        for (let m = 0; m < 3; m++) p[m] += v[m] * h;
        if (p[0] < -BOX.x) { p[0] = -BOX.x; v[0] = Math.abs(v[0]); }
        if (p[0] > BOX.x) { p[0] = BOX.x; v[0] = -Math.abs(v[0]); }
        if (p[1] < BOX.yLo) { p[1] = BOX.yLo; v[1] = Math.abs(v[1]); }
        if (p[1] > BOX.yHi) { p[1] = BOX.yHi; v[1] = -Math.abs(v[1]); }
        if (p[2] < -BOX.z) { p[2] = -BOX.z; v[2] = Math.abs(v[2]); }
        if (p[2] > BOX.z) { p[2] = BOX.z; v[2] = -Math.abs(v[2]); }
        A[i] += W[i] * h * 2 * n;
      }
    }
    // hydrogen bonds right now
    hbList = []; hbNow = 0;
    if (phase === 'ice') { NB.forEach(([i, j]) => hbList.push([i, j, 1])); hbNow = NB.length; }
    else {
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const d = dist(P[i], P[j]);
        if (d > 1.2) continue;
        let a = 1;
        // liquid: each bond flickers on and off; the hotter, the larger the share that is broken (illustrative)
        const thr = clamp(0.3 + T / 220, 0, 0.8);
        if (phase === 'liquid') a = n ? clamp((0.5 + 0.5 * Math.sin(time * (2.5 + (ph[i * N + j] % 1.5)) + ph[i * N + j]) - thr) / (1 - thr), 0, 1) : 1 - thr;
        if (phase === 'steam') a = 0.3;
        a *= clamp((1.2 - d) / 0.2, 0, 1);
        if (a > 0.05) hbList.push([i, j, a]);
        if (a > 0.5 && phase === 'liquid') hbNow++;
      }
    }
    void quiet;
  }

  function build(f) {
    f.reset();
    for (let i = 0; i < N; i++) {
      const p = P[i], a = A[i], spread = 0.91; // how far the two hydrogens fan out (illustrative drawing)
      const h1 = v3(p[0] + 0.36 * Math.cos(a - spread), p[1] + 0.36 * Math.sin(a - spread), p[2] + 0.08);
      const h2 = v3(p[0] + 0.36 * Math.cos(a + spread), p[1] + 0.36 * Math.sin(a + spread), p[2] - 0.08);
      f.s(...p, 0.27, O); f.s(...h1, 0.15, H); f.s(...h2, 0.15, H);
      f.stick(p, h1, 0.06, STK); f.stick(p, h2, 0.06, STK);
    }
    hbList.forEach(([i, j, a]) => f.hb(P[i], P[j], a * 0.9));
  }

  function info() { return { state: phase, n: hbNow }; }
  warm();
  return { step, build, info, view: { w: 13.4, h: 8.4 }, max: [N * 3, N * 2, N * 6] };
}
