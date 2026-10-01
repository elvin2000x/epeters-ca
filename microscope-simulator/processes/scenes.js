// How life works: 2D canvas scenes for the four illustrated explainers. Every scene is drawn by code in a virtual
// 800 x 500 space and labelled "Illustrative, not to scale" on the page. Colours come from the legend in
// processes.json through g.c(key), so the colour key on screen always matches what is drawn.
// A scene is draw(g, s, u, opt): s = step index, u = progress through that step (0 to 1),
// opt.T = flow clock in seconds (frozen when paused or with reduced motion), opt.flowT = flow clock scaled by light.
export const VW = 800, VH = 500;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const ph = (u, a, b) => ease(clamp((u - a) / (b - a), 0, 1));
const frac = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;

/* ---------- drawing kit ---------- */
export function makeG(ctx, k, theme, legend) {
  const cols = {};
  for (const l of legend || []) cols[l.key] = theme.dark ? l.dark : l.light;
  return { ctx, k, theme, c: (key) => cols[key] || theme.ink, chipInk: theme.dark ? '#0b1211' : '#ffffff' };
}
const fs = (g, size) => Math.max(size, 11.5 / g.k);

function circ(g, x, y, r, fill, stroke, lw = 2, alpha = 1) {
  const c = g.ctx; c.save(); c.globalAlpha *= alpha; c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  c.restore();
}
function ell(g, x, y, rx, ry, fill, stroke, lw = 2, alpha = 1, fillAlpha = 1) {
  const c = g.ctx; c.save(); c.globalAlpha *= alpha; c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  if (fill) { c.globalAlpha *= fillAlpha; c.fillStyle = fill; c.fill(); c.globalAlpha /= fillAlpha; }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  c.restore();
}
function poly(g, pts, stroke, lw = 2, opts = {}) {
  if (pts.length < 2) return;
  const c = g.ctx; c.save(); c.globalAlpha *= opts.alpha ?? 1;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (opts.close) c.closePath();
  if (opts.fill) { c.globalAlpha *= opts.fillAlpha ?? 1; c.fillStyle = opts.fill; c.fill(); c.globalAlpha /= opts.fillAlpha ?? 1; }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; if (opts.dash) c.setLineDash(opts.dash); c.stroke(); }
  c.restore();
}
function rrect(g, x, y, w, h, r, fill, stroke, lw = 2, alpha = 1) {
  const c = g.ctx; c.save(); c.globalAlpha *= alpha; c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  c.restore();
}
function text(g, s, x, y, o = {}) {
  const c = g.ctx; c.save(); c.globalAlpha *= o.alpha ?? 1;
  const size = fs(g, o.size || 14);
  c.font = `${o.weight || 600} ${size}px ${o.mono ? '"IBM Plex Mono", ui-monospace, monospace' : '"IBM Plex Sans", system-ui, sans-serif'}`;
  c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
  if (o.halo !== false) { c.strokeStyle = o.haloColor || g.theme.panel; c.lineWidth = 3.5 / g.k; c.lineJoin = 'round'; c.globalAlpha *= 0.9; c.strokeText(s, x, y); c.globalAlpha /= 0.9; }
  c.fillStyle = o.color || g.theme.ink; c.fillText(s, x, y);
  c.restore();
}
function arrow(g, x1, y1, x2, y2, color, lw = 2, alpha = 1, dash) {
  const c = g.ctx; c.save(); c.globalAlpha *= alpha; c.strokeStyle = color; c.fillStyle = color; c.lineWidth = lw; c.lineCap = 'round';
  if (dash) c.setLineDash(dash);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]);
  const a = Math.atan2(y2 - y1, x2 - x1), h = 5 + lw * 2.2;
  c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)); c.lineTo(x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)); c.closePath(); c.fill();
  c.restore();
}
// A labelled pill for a small molecule (ATP, NADH, CO2 ...).
function chip(g, label, x, y, key, alpha = 1) {
  if (alpha <= 0.01) return;
  const c = g.ctx, size = fs(g, 12);
  c.save(); c.font = `700 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
  const w = c.measureText(label).width + size * 0.9, h = size * 1.55;
  c.restore();
  rrect(g, x - w / 2, y - h / 2, w, h, h / 2, g.c(key), null, 0, alpha);
  text(g, label, x, y + 0.5, { size: 12, mono: true, weight: 700, color: g.chipInk, halo: false, alpha });
}
// A labelled dot (H+, e-) that stays small.
function ion(g, x, y, key, label, alpha = 1, r = 6) {
  circ(g, x, y, r, g.c(key), null, 0, alpha);
  if (label && g.k > 0.7) text(g, label, x, y - r - 7, { size: 10, color: g.c(key), alpha, weight: 700 });
}
function pathLens(P) { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return L; }
function pathAt(P, L, d) {
  d = clamp(d, 0, L[L.length - 1]);
  let i = 1; while (i < L.length - 1 && L[i] < d) i++;
  const t = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  return [lerp(P[i - 1][0], P[i][0], t), lerp(P[i - 1][1], P[i][1], t)];
}
// Dots that travel along a path over and over: n dots, speed in path-lengths per second.
function flowDots(g, P, n, speed, T, key, label, alpha = 1, r = 5.5) {
  if (alpha <= 0.01 || n <= 0) return;
  const L = pathLens(P), tot = L[L.length - 1];
  for (let i = 0; i < n; i++) {
    const f = frac(T * speed + i / n);
    const [x, y] = pathAt(P, L, f * tot);
    const fade = Math.min(1, f * 8, (1 - f) * 8);
    ion(g, x, y, key, label, alpha * fade, r);
  }
}
function wavy(g, x1, y1, x2, y2, color, alpha, phase) {
  const n = 28, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), px = -dy / len, py = dx / len, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, w = Math.sin(t * 18 + phase) * 6; pts.push([x1 + dx * t + px * w, y1 + dy * t + py * w]); }
  poly(g, pts, color, 2.4, { alpha });
  arrow(g, x2 - dx * 0.04, y2 - dy * 0.04, x2, y2, color, 2.4, alpha);
}
function bilayer(g, y1, y2, x1, x2, key, alpha = 1) {
  const col = g.c(key);
  rrect(g, x1, y1, x2 - x1, y2 - y1, 6, col, null, 0, 0.13 * alpha);
  for (let x = x1 + 6; x < x2; x += 12) {
    circ(g, x, y1 + 5, 4.6, col, null, 0, alpha);
    circ(g, x, y2 - 5, 4.6, col, null, 0, alpha);
    poly(g, [[x - 1.5, y1 + 9], [x - 1.5, (y1 + y2) / 2 - 2]], col, 1.2, { alpha: 0.55 * alpha });
    poly(g, [[x + 1.5, y1 + 9], [x + 1.5, (y1 + y2) / 2 - 2]], col, 1.2, { alpha: 0.55 * alpha });
    poly(g, [[x - 1.5, y2 - 9], [x - 1.5, (y1 + y2) / 2 + 2]], col, 1.2, { alpha: 0.55 * alpha });
    poly(g, [[x + 1.5, y2 - 9], [x + 1.5, (y1 + y2) / 2 + 2]], col, 1.2, { alpha: 0.55 * alpha });
  }
}
// Pseudo-random but fixed scatter positions (so a pool of ions does not jump between frames).
function scatter(n, x1, y1, x2, y2, seed) {
  const out = []; let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) out.push([lerp(x1, x2, rnd()), lerp(y1, y2, rnd()), rnd() * TAU]);
  return out;
}
function atpSynthase(g, x, yMem1, yMem2, headUp, rot, alpha = 1) {
  const col = g.c('protein');
  const headY = headUp ? yMem1 - 70 : yMem2 + 70, stalkEnd = headUp ? headY + 30 : headY - 30;
  // stator arm
  poly(g, [[x + 46, (yMem1 + yMem2) / 2], [x + 46, headY]], col, 6, { alpha: 0.8 * alpha });
  // c-ring in the membrane with stripes that slide as it turns
  rrect(g, x - 42, yMem1 - 4, 84, yMem2 - yMem1 + 8, 14, col, g.theme.ink, 1.5, alpha);
  const c = g.ctx; c.save(); c.beginPath(); if (c.roundRect) c.roundRect(x - 42, yMem1 - 4, 84, yMem2 - yMem1 + 8, 14); else c.rect(x - 42, yMem1 - 4, 84, yMem2 - yMem1 + 8); c.clip();
  for (let i = 0; i < 8; i++) { const sx = x - 42 + frac(i / 8 + rot / TAU) * 84; poly(g, [[sx, yMem1 - 4], [sx, yMem2 + 4]], g.theme.panel, 3, { alpha: 0.75 * alpha }); }
  c.restore();
  // central stalk
  poly(g, [[x, (yMem1 + yMem2) / 2], [x, stalkEnd]], g.theme.ink, 5, { alpha: 0.8 * alpha });
  // head: six lobes, a turning cam in the middle
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; circ(g, x + Math.cos(a) * 20, headY + Math.sin(a) * 20, 15, col, g.theme.ink, 1.2, alpha * (i % 2 ? 0.75 : 1)); }
  ell(g, x + Math.cos(rot) * 7, headY + Math.sin(rot) * 7, 7, 7, g.theme.ink, null, 0, alpha);
  return headY;
}

/* ============================================================
   1. DNA to protein
   ============================================================ */
const SEQ = ['AUG', 'GCA', 'UUC', 'AAA', 'UGG', 'UAA'];
const AAS = ['Met', 'Ala', 'Phe', 'Lys', 'Trp'];
const COMP = { A: 'U', U: 'A', G: 'C', C: 'G' };
const NUC = { x: 215, y: 250, r: 190 };
const EXPORT_PATH = [[142, 215], [330, 215], [380, 235], [412, 250], [450, 290], [500, 340], [560, 372], [790, 372]];
const EXPORT_L = pathLens(EXPORT_PATH);
const MRNA_LEN = 190;
const RX = 610, CW = 51, MY = 384;

function nucleus(g) {
  const col = g.c('envelope');
  circ(g, NUC.x, NUC.y, NUC.r, col, null, 0, 0.08);
  const pores = [0, 0.95, -0.95, 2.2, -2.2, Math.PI];
  for (const r of [NUC.r, NUC.r - 9]) {
    const c = g.ctx; c.save(); c.strokeStyle = col; c.lineWidth = 3;
    const sorted = pores.map((a) => (a + TAU) % TAU).sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const a0 = sorted[i] + 0.06, a1 = (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU) - 0.06;
      c.beginPath(); c.arc(NUC.x, NUC.y, r, a0, a1); c.stroke();
    }
    c.restore();
  }
  for (const a of pores) {
    const x = NUC.x + Math.cos(a) * (NUC.r - 4.5), y = NUC.y + Math.sin(a) * (NUC.r - 4.5);
    circ(g, x + Math.cos(a + Math.PI / 2) * 7, y + Math.sin(a + Math.PI / 2) * 7, 3.2, col);
    circ(g, x - Math.cos(a + Math.PI / 2) * 7, y - Math.sin(a + Math.PI / 2) * 7, 3.2, col);
  }
  text(g, 'nucleus', NUC.x, 92, { size: 15, color: g.theme.muted });
  text(g, 'cytoplasm', 640, 60, { size: 15, color: g.theme.muted });
}
function dnaHelix(g, polx, open) {
  const c1 = g.c('dna'), y0 = 160, top = [], bot = [];
  for (let x = 60; x <= 370; x += 3) {
    const sep = open ? 18 * Math.exp(-Math.pow((x - polx) / 30, 2)) : 0;
    const w = 12 * Math.sin(x * 0.07);
    top.push([x, y0 - w - sep]); bot.push([x, y0 + w + sep]);
  }
  for (let i = 0; i < top.length; i += 4) {
    if (Math.abs(top[i][1] - bot[i][1]) > 30 || Math.abs(top[i][1] - bot[i][1]) < 4) continue;
    poly(g, [top[i], bot[i]], g.theme.muted, 1.4, { alpha: 0.6 });
  }
  poly(g, top, c1, 4); poly(g, bot, c1, 4, { alpha: 0.75 });
}
function mrnaAlongPath(g, d0, alpha = 1) {
  const pts = [];
  for (let i = 0; i <= 38; i++) pts.push(pathAt(EXPORT_PATH, EXPORT_L, d0 + (i / 38) * MRNA_LEN));
  const body = pts.slice(0, 33), tail = pts.slice(32);
  poly(g, body, g.c('mrna'), 5, { alpha });
  poly(g, tail, g.c('mrna'), 3, { alpha, dash: [4, 4] });
  circ(g, pts[0][0], pts[0][1], 6.5, g.c('mrna'), g.theme.ink, 1.5, alpha);
  return pts;
}
function trna(g, x, anti, aa, alpha = 1, showAA = true) {
  if (alpha <= 0.01) return;
  const col = g.c('trna');
  rrect(g, x - 15, 300, 30, 62, 9, col, null, 0, alpha * 0.9);
  poly(g, [[x - 15, 318], [x - 26, 312]], col, 6, { alpha });
  poly(g, [[x + 15, 318], [x + 26, 312]], col, 6, { alpha });
  text(g, anti, x, 352, { size: 11, mono: true, color: g.chipInk, halo: false, alpha, weight: 700 });
  if (showAA && aa) bead(g, x, 284, aa, alpha);
}
function bead(g, x, y, label, alpha = 1) {
  const size = fs(g, 10), r = Math.max(13, size * 1.25);
  circ(g, x, y, r, g.c('amino'), g.theme.ink, 1.2, alpha);
  text(g, label, x, y + 0.5, { size: 10, color: '#1a1400', halo: false, alpha, weight: 700 });
}
function chainPoints(ax, ay, n) {
  // n beads: index 0 sits on the tRNA, older ones trail up through the large subunit
  const out = [];
  for (let j = 0; j < n; j++) out.push([ax - 4 * j + 9 * Math.sin(j * 1.4), ay - 27 * j]);
  return out;
}
function drawChain(g, pts, labels, alpha = 1) {
  if (pts.length > 1) poly(g, pts, g.c('amino'), 3, { alpha });
  for (let j = pts.length - 1; j >= 0; j--) bead(g, pts[j][0], pts[j][1], labels[j], alpha);
}
function codonStrip(g, xs, alpha = 1, clipX = 420) {
  const c = g.ctx; c.save(); c.beginPath(); c.rect(clipX, 0, VW - clipX, VH); c.clip();
  poly(g, [[xs - 30, MY], [xs + 6 * CW + 40, MY]], g.c('mrna'), 5, { alpha });
  poly(g, [[xs + 6 * CW, MY], [xs + 6 * CW + 40, MY]], g.c('mrna'), 3, { alpha, dash: [4, 4] });
  circ(g, xs - 30, MY, 6.5, g.c('mrna'), g.theme.ink, 1.5, alpha);
  for (let i = 0; i < SEQ.length; i++) {
    poly(g, [[xs + i * CW, MY - 6], [xs + i * CW, MY + 6]], g.theme.ink, 1.2, { alpha: alpha * 0.6 });
    for (let j = 0; j < 3; j++) text(g, SEQ[i][j], xs + i * CW + 8.5 + j * 17, MY - 13, { size: 14, mono: true, weight: 700, alpha });
  }
  c.restore();
}
function ribosome(g, smallDy, largeDy, alpha = 1, labels = true) {
  const col = g.c('ribosome');
  ell(g, RX, 400 + smallDy, 82, 22, col, col, 2, alpha, 0.55);
  ell(g, RX, 318 + largeDy, 92, 56, col, col, 2, alpha, 0.22);
  if (labels) {
    text(g, 'large subunit', RX + 128, 288 + largeDy, { size: 12, color: g.theme.muted, align: 'left', alpha });
    text(g, 'small subunit', RX + 92, 420 + smallDy, { size: 12, color: g.theme.muted, align: 'left', alpha });
    ['E', 'P', 'A'].forEach((l, i) => text(g, l, RX + (i - 1) * CW, 270 + largeDy, { size: 13, mono: true, color: g.theme.muted, alpha: alpha * 0.9 }));
  }
}

function drawDnaToProtein(g, s, u, opt) {
  nucleus(g);
  // DNA and transcription
  let polx = 110;
  if (s === 1) polx = lerp(110, 330, ph(u, 0.05, 0.85));
  if (s <= 1) {
    rrect(g, 104, 132, 232, 56, 10, g.c('dna'), null, 0, 0.08);
    text(g, 'gene', 220, 124, { size: 13, color: g.c('dna') });
  }
  dnaHelix(g, polx, s === 1);
  if (s === 1) {
    const pts = [];
    for (let x = 110; x <= polx; x += 3) pts.push([x, 205 - 38 * Math.exp(-Math.pow((polx - x) / 26, 2))]);
    if (pts.length > 1) {
      poly(g, pts, g.c('mrna'), 5);
      text(g, "5'", 98, 206, { size: 12, mono: true });
      text(g, 'new mRNA', 150, 228, { size: 13, color: g.c('mrna') });
    }
    ell(g, polx, 160, 32, 26, g.c('pol'), g.theme.ink, 1.2, 1, 0.85);
    text(g, 'RNA polymerase II', polx, 118, { size: 13 });
  }
  if (s === 2) {
    const e = ph(u, 0.15, 0.85), ec = ph(u, 0, 0.3), et = ph(u, 0.2, 0.5);
    const segs = [['ex', 50], ['in', 35], ['ex', 60], ['in', 30], ['ex', 50]];
    let x = 110 + 32.5 * e; const y = 215, x0 = x;
    for (const [kind, L] of segs) {
      if (kind === 'ex') { poly(g, [[x, y], [x + L, y]], g.c('mrna'), 5); x += L; }
      else {
        const Lr = L * (1 - e);
        if (Lr > 0.5) {
          const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([x + Lr * t, y + Math.sin(t * Math.PI) * (14 + 10 * e)]); }
          poly(g, pts, g.c('intron'), 5, { alpha: 1 - e * 0.85 });
        }
        x += Lr;
      }
    }
    circ(g, x0 - 7, y, 6.5 * ec, g.c('mrna'), g.theme.ink, 1.5);
    if (et > 0) { const zz = []; for (let i = 0; i <= 10 * et; i++) zz.push([x + i * 3, y + (i % 2 ? -3 : 3)]); poly(g, zz, g.c('mrna'), 2.5); }
    if (e < 0.6) text(g, 'introns', 200, 258, { size: 13, color: g.c('intron'), alpha: 1 - e });
    text(g, "5' cap", x0 - 10, 240, { size: 12, alpha: ec });
    text(g, 'poly-A tail', x + 18, 240, { size: 12, alpha: et });
    if (e > 0.5) text(g, 'exons joined', 225, 190, { size: 13, color: g.c('mrna'), alpha: ph(u, 0.6, 0.9) });
  }
  if (s === 3) {
    const dEnd = EXPORT_L[EXPORT_L.length - 1] - MRNA_LEN - 60;
    mrnaAlongPath(g, lerp(0, dEnd, ph(u, 0.05, 0.9)));
    text(g, 'nuclear pore', 452, 232, { size: 13, align: 'left' });
    arrow(g, 448, 236, 418, 248, g.theme.ink, 1.5, 0.8);
  }
  if (s >= 4) {
    // translation
    let pIdx = 0, shift = 0;
    let eTrna = null, pTrna = { x: RX, i: 0 }, aTrna = null, chainAnchor = [RX, 284], chainN = 1, aBead = false;
    let smallDy = 0, largeDy = 0, ribAlpha = 1, morph = 1, releaseX = null, releaseA = 0, folded = 0, partA = 1;
    if (s === 4) {
      morph = ph(u, 0, 0.35); smallDy = 80 * (1 - ph(u, 0.3, 0.6)); largeDy = -120 * (1 - ph(u, 0.5, 0.8)); ribAlpha = ph(u, 0.3, 0.55);
      partA = ph(u, 0.7, 0.95);
    } else if (s === 5) {
      // four rounds: tRNA j+1 arrives at A, the chain moves onto its amino acid, then the ribosome moves one codon
      const q = clamp(u / 0.92, 0, 1) * 4, j = Math.min(3, Math.floor(q)), f = q >= 4 ? 1 : q - j;
      const fin = ph(f, 0, 0.35), xfer = ph(f, 0.35, 0.55), mv = ph(f, 0.55, 1);
      pIdx = j; shift = CW * mv;
      if (j > 0) eTrna = { x: RX - CW, i: j - 1, fade: 1 - ph(f, 0, 0.3), lift: 60 * ph(f, 0, 0.3) };
      pTrna = { x: RX - shift, i: j };
      aTrna = { x: lerp(RX + CW + 130, RX + CW, fin) - shift, i: j + 1, y: -140 * (1 - fin) };
      if (xfer < 1) { chainN = j + 1; aBead = true; chainAnchor = [lerp(RX, RX + CW, xfer) - shift, lerp(284, 257, xfer)]; }
      else { chainN = j + 2; chainAnchor = [RX + CW - shift, 284]; }
    } else if (s === 6) {
      pIdx = 4;
      pTrna = { x: RX, i: 4 };
      eTrna = { x: RX - CW, i: 3, fade: 1 - ph(u, 0, 0.2), lift: 60 * ph(u, 0, 0.2) };
      const a = ph(u, 0, 0.3); releaseX = lerp(RX + CW + 130, RX + CW, a); releaseA = 1;
      folded = ph(u, 0.3, 0.6);
      const c3 = ph(u, 0.6, 0.95); smallDy = 50 * c3; largeDy = -70 * c3; ribAlpha = 1 - 0.6 * c3;
      chainN = 5;
      partA = 1 - c3;
      if (c3 > 0) pTrna.fade = 1 - c3;
    }
    const xs = RX - CW / 2 - pIdx * CW - shift;
    // mRNA: morph from the export path into a straight strip
    if (morph < 1) {
      const dEnd = EXPORT_L[EXPORT_L.length - 1] - MRNA_LEN - 60, pts = [];
      for (let i = 0; i <= 38; i++) {
        const a = pathAt(EXPORT_PATH, EXPORT_L, dEnd + (i / 38) * MRNA_LEN);
        const b = [xs - 30 + (i / 38) * (6 * CW + 70), MY];
        pts.push([lerp(a[0], b[0], morph), lerp(a[1], b[1], morph)]);
      }
      poly(g, pts, g.c('mrna'), 5, { alpha: 1 - morph * 0.999 });
    }
    ribosome(g, smallDy, largeDy, ribAlpha, s !== 6 || u < 0.6);
    if (morph > 0.2) codonStrip(g, xs, ph(morph, 0.2, 1));
    const anti = (i) => SEQ[i].split('').map((b) => COMP[b]).join('');
    if (eTrna && eTrna.fade > 0.01) { const c = g.ctx; c.save(); c.translate(-eTrna.lift * 0.6, -eTrna.lift); trna(g, eTrna.x, anti(eTrna.i), null, eTrna.fade, false); c.restore(); }
    if (s === 4) trna(g, RX, anti(0), null, partA, false);
    else trna(g, pTrna.x, anti(pTrna.i), null, pTrna.fade ?? 1, false);
    if (aTrna) { const c = g.ctx; c.save(); c.translate(0, aTrna.y); trna(g, aTrna.x, anti(aTrna.i), null, 1, false); if (aBead) bead(g, aTrna.x, 284, AAS[aTrna.i], 1); c.restore(); }
    // the chain: newest amino acid first
    const labels = AAS.slice(0, chainN).reverse();
    if (s === 6 && folded > 0) {
      const pts = chainPoints(RX, 284, chainN).map((p, j) => {
        const ang = j * TAU / chainN + 0.4, tx = 705 + Math.cos(ang) * 24, ty = 130 + Math.sin(ang) * 24;
        return [lerp(p[0], tx, folded), lerp(p[1], ty, folded)];
      });
      drawChain(g, pts, labels, 1);
      if (folded > 0.8) text(g, 'finished chain folds into a protein', 705, 82, { size: 13, alpha: ph(folded, 0.8, 1) });
    } else if (s >= 5 || partA > 0.01) {
      drawChain(g, chainPoints(chainAnchor[0], chainAnchor[1], chainN), labels, s === 4 ? partA : 1);
    }
    if (releaseX !== null) {
      rrect(g, releaseX - 16, 300, 32, 62, 6, g.c('release'), g.theme.ink, 1.2, releaseA * (1 - ph(u, 0.65, 0.95)));
      text(g, 'release factor', releaseX + 26, 318, { size: 12, align: 'left', alpha: 1 - ph(u, 0.3, 0.6) });
    }
    if (s === 4) {
      text(g, 'start codon', RX, 452, { size: 13, alpha: partA });
      arrow(g, RX, 440, RX, 398, g.theme.ink, 1.5, partA * 0.8);
    }
    if (s === 5) text(g, 'peptide bond links each new amino acid', 470, 150, { size: 13, align: 'left', alpha: 0.9 });
    if (s === 6) text(g, 'stop codon UAA', RX + CW, 452, { size: 13, alpha: 1 - ph(u, 0.6, 0.9) });
  }
}

/* ============================================================
   2. Mitosis
   ============================================================ */
const CHROMS = [
  { key: 'chromA', L: 54, home: [352, 212], ang: 0.6, y: -84, seed: 1.3 },
  { key: 'chromB', L: 54, home: [446, 282], ang: -0.9, y: -28, seed: 2.9 },
  { key: 'chromA', L: 34, home: [430, 204], ang: 2.0, y: 28, seed: 4.1 },
  { key: 'chromB', L: 34, home: [364, 292], ang: 1.2, y: 84, seed: 5.7 }
];
const CX = 400, CY = 250;
function chromatid(g, cx, cy, ang, L, c, sgn, sepPx, bend, key, seed, alpha = 1) {
  const ax = Math.cos(ang), ay = Math.sin(ang), px = -ay, py = ax, A = 13 * (1 - c), Lh = (L / 2) * (1 + 1.4 * (1 - c));
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = -1 + (2 * i) / 40;
    const w = A * Math.sin(t * 13 + seed * 3 + sgn), wa = A * 0.6 * Math.cos(t * 10 + seed);
    pts.push([cx + ax * (t * Lh + wa) + px * (sgn * (sepPx + Math.abs(t) * bend) + w), cy + ay * (t * Lh + wa) + py * (sgn * (sepPx + Math.abs(t) * bend) + w)]);
  }
  poly(g, pts, g.c(key), lerp(2.6, 10, c), { alpha });
}
function centrosome(g, x, y, alpha = 1) {
  circ(g, x, y, 13, g.c('centro'), null, 0, 0.25 * alpha);
  rrect(g, x - 8, y - 3, 16, 6, 3, g.c('centro'), g.theme.ink, 1, alpha);
  rrect(g, x - 3, y - 8, 6, 16, 3, g.c('centro'), g.theme.ink, 1, alpha);
}
function drawMitosis(g, s, u) {
  // cell outline
  let rx = 232, ry = 176, pinch = 0;
  if (s === 4) { const a = ph(u, 0.1, 0.9); rx = lerp(232, 262, a); ry = lerp(176, 162, a); }
  if (s >= 5) { rx = 262; ry = 162; }
  if (s === 6) pinch = 0.96 * ph(u, 0.05, 0.9);
  const outline = [];
  for (let i = 0; i <= 160; i++) { const t = (i / 160) * TAU, co = Math.cos(t); outline.push([CX + rx * co, CY + ry * Math.sin(t) * (1 - pinch * Math.exp(-(co * co) / 0.05))]); }
  poly(g, outline, g.c('membrane'), 4, { close: true, fill: g.c('membrane'), fillAlpha: 0.08 });
  if (s === 6) text(g, 'cleavage furrow', CX, CY - ry * (1 - pinch) - 22, { size: 13, alpha: ph(u, 0.3, 0.6) });
  // poles
  const poleX = s === 4 ? lerp(190, 165, ph(u, 0.1, 0.9)) : s >= 5 ? 165 : 190;
  const poles = [[CX - (CX - poleX), CY], [CX + (CX - poleX), CY]];
  let cpos = poles;
  if (s === 0) cpos = [[CX - 7, 136], [CX + 7, 136]];
  if (s === 1) { const e = ph(u, 0.05, 0.8); cpos = [[lerp(CX - 7, poles[0][0], e), lerp(136, CY, e) - Math.sin(e * Math.PI) * 40], [lerp(CX + 7, poles[1][0], e), lerp(136, CY, e) - Math.sin(e * Math.PI) * 40]]; }
  // spindle
  let spA = 0, spLen = 1, kA = 0;
  if (s === 1) { spA = ph(u, 0.2, 0.9); spLen = spA; }
  if (s >= 2 && s <= 4) { spA = 1; kA = s === 2 ? ph(u, 0.2, 0.7) : 1; }
  if (s === 5) { spA = 1 - ph(u, 0.1, 0.8); kA = spA; }
  if (spA > 0) {
    for (const [i, P] of cpos.entries()) {
      const dir = i === 0 ? 1 : -1;
      for (const a of [-0.42, -0.24, -0.08, 0.08, 0.24, 0.42]) {
        const L = (s >= 2 ? Math.abs(CX - P[0]) + 30 : 210) * spLen;
        poly(g, [P, [P[0] + dir * Math.cos(a) * L, P[1] + Math.sin(a) * L]], g.c('spindle'), 1.6, { alpha: 0.55 * spA });
      }
      for (const a of [-0.9, -0.3, 0.3, 0.9]) poly(g, [P, [P[0] - dir * Math.cos(a) * 34 * spLen, P[1] + Math.sin(a) * 34 * spLen]], g.c('spindle'), 1.4, { alpha: 0.5 * spA });
    }
  }
  // nuclear envelope
  const envCol = g.c('envelope');
  if (s === 0) { circ(g, CX, CY, 104, envCol, null, 0, 0.07); circ(g, CX, CY, 104, null, envCol, 3); circ(g, CX, CY, 96, null, envCol, 2); }
  if (s === 1 || s === 2) {
    const a = s === 1 ? 1 - 0.45 * ph(u, 0.1, 0.9) : 0.55 * (1 - ph(u, 0, 0.6));
    const c = g.ctx; c.save(); c.setLineDash([16, 10 + (s === 1 ? 14 * u : 30)]); circ(g, CX, CY, 104, null, envCol, 3, a); c.restore();
  }
  // chromosomes
  for (const ch of CHROMS) {
    let c = 0, x = ch.home[0], y = ch.home[1], ang = ch.ang, sep = 2, bend = 0, split = 0, vbend = 0, ys = 1;
    const plateY = CY + ch.y;
    if (s === 1) c = 0.8 * ph(u, 0, 0.85);
    if (s === 2) { const e = ph(u, 0.1, 0.9); c = lerp(0.8, 1, e); x = lerp(ch.home[0], CX, e * 0.6); y = lerp(ch.home[1], plateY, e * 0.6); ang = lerp(ch.ang, Math.PI / 2 * Math.sign(ch.ang || 1), e); }
    if (s === 3) { const e = ph(u, 0, 0.8); c = 1; const sx = lerp(ch.home[0], CX, 0.6), sy = lerp(ch.home[1], plateY, 0.6); x = lerp(sx, CX, e); y = lerp(sy, plateY, e); ang = Math.PI / 2 * Math.sign(ch.ang || 1); }
    if (s >= 4) { c = 1; x = CX; y = plateY; ang = Math.PI / 2 * Math.sign(ch.ang || 1); }
    if (s === 4) { split = ph(u, 0.05, 0.9); ys = 1 - 0.32 * split; vbend = 20 * Math.sin(Math.min(1, split * 1.2) * Math.PI) ; }
    if (s >= 5) { split = 1; ys = 0.68; }
    if (s === 5) c = 1 - 0.6 * ph(u, 0.1, 0.9);
    if (s === 6) c = lerp(0.4, 0.15, ph(u, 0, 0.9));
    sep = lerp(2, 5, c); bend = 6 * c * (1 - split);
    if (s >= 3) { const dir = Math.sign(ch.ang || 1); ang = Math.PI / 2 * dir; }
    if (split > 0) {
      const d = 5 + split * 158;
      for (const sgn of [-1, 1]) {
        const cxp = CX + sgn * d, cyp = CY + ch.y * ys;
        // V shape: arms trail back toward the middle while moving
        chromatid(g, cxp, cyp, Math.PI / 2, ch.L, c, sgn, 0, vbend, ch.key, ch.seed);
        if (kA > 0) {
          circ(g, cxp + sgn * 6, cyp, 4, g.c('kinet'), null, 0, kA);
          poly(g, [[cxp + sgn * 6, cyp], sgn < 0 ? poles[0] : poles[1]], g.c('spindle'), 1.8, { alpha: 0.8 * kA });
        }
      }
    } else {
      for (const sgn of [-1, 1]) chromatid(g, x, y, ang, ch.L, c, sgn, sep, bend, ch.key, ch.seed);
      if (kA > 0) {
        const px = -Math.sin(ang), py = Math.cos(ang);
        for (const sgn of [-1, 1]) {
          const kx = x + px * sgn * (sep + 6), ky = y + py * sgn * (sep + 6);
          circ(g, kx, ky, 4, g.c('kinet'), null, 0, kA);
          const pole = kx < x ? poles[0] : poles[1];
          poly(g, [[kx, ky], pole], g.c('spindle'), 1.8, { alpha: 0.8 * kA });
        }
      }
    }
  }
  for (const P of cpos) centrosome(g, P[0], P[1]);
  // new nuclei
  if (s >= 5) {
    const a = s === 5 ? ph(u, 0.3, 0.95) : 1;
    for (const sgn of [-1, 1]) { circ(g, CX + sgn * 163, CY, 72, envCol, null, 0, 0.07 * a); circ(g, CX + sgn * 163, CY, 72, null, envCol, 3, a); }
    if (s === 5) text(g, 'new nuclear envelopes', CX, 78, { size: 13, alpha: a });
  }
  // labels
  if (s === 0) { text(g, 'nucleus', CX, 128 + 0, { size: 13, color: g.theme.muted }); text(g, 'loose chromosomes (chromatin)', CX, 380, { size: 13 }); text(g, 'centrosomes', CX + 60, 120, { size: 12, align: 'left' }); }
  if (s === 1) { text(g, 'centrosome', cpos[0][0], cpos[0][1] - 26, { size: 12 }); text(g, 'spindle', CX, 108, { size: 13, color: g.c('spindle'), alpha: spA }); }
  if (s === 2) text(g, 'kinetochores attach to spindle fibres', CX, 440, { size: 13, alpha: kA });
  if (s === 3 || s === 4) {
    const a = s === 3 ? ph(u, 0.4, 0.9) : 1 - ph(u, 0, 0.4);
    poly(g, [[CX, 96], [CX, 404]], g.theme.ink, 1.5, { dash: [6, 6], alpha: 0.7 * a });
    text(g, 'metaphase plate', CX, 86, { size: 13, alpha: a });
  }
  if (s === 4) text(g, 'sister chromatids pulled apart', CX, 440, { size: 13, alpha: ph(u, 0.2, 0.5) });
  if (s === 6) text(g, 'two cells, same chromosomes', CX, 462, { size: 13, alpha: ph(u, 0.6, 0.95) });
}

/* ============================================================
   3. Cellular respiration
   ============================================================ */
const MITO = { x: 565, y: 280, rx: 215, ry: 150 };
function mitochondrion(g) {
  const col = g.c('membrane');
  ell(g, MITO.x, MITO.y, MITO.rx, MITO.ry, col, col, 4, 1, 0.07);
  const pts = [];
  for (let i = 0; i <= 260; i++) {
    const t = (i / 260) * TAU, bump = Math.pow(0.5 + 0.5 * Math.cos(t * 9), 14) * 0.42;
    pts.push([MITO.x + (MITO.rx - 16) * (1 - bump) * Math.cos(t), MITO.y + (MITO.ry - 16) * (1 - bump) * Math.sin(t)]);
  }
  poly(g, pts, col, 3, { close: true, fill: col, fillAlpha: 0.1 });
  text(g, 'mitochondrion', MITO.x, MITO.y - MITO.ry - 16, { size: 14 });
  text(g, 'matrix', MITO.x + 120, MITO.y + 60, { size: 12, color: g.theme.muted });
}
function carbons(g, pts, key, alpha = 1, bonds = true) {
  if (bonds && pts.length > 1) poly(g, pts, g.c(key), 3, { alpha });
  for (const p of pts) circ(g, p[0], p[1], 7.5, g.c(key), g.theme.ink, 1.2, alpha);
}
function hexAt(x, y, r = 22) { const out = []; for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * TAU / 6; out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return out; }
function tally(g, vals, alpha = 1) {
  const x = 18, y = 372, w = 236, h = 112;
  rrect(g, x, y, w, h, 10, g.theme.raised, g.theme.line, 1.2, 0.92 * alpha);
  text(g, 'Running total per glucose', x + 12, y + 16, { size: 12, align: 'left', color: g.theme.muted, halo: false, alpha });
  const rows = [['ATP (net)', vals.atp, 'atp'], ['NADH', vals.nadh, 'nadh'], ['FADH2', vals.fadh2, 'fadh2'], ['CO2 released', vals.co2, 'co2']];
  rows.forEach(([lab, v, key], i) => {
    const yy = y + 38 + i * 20;
    circ(g, x + 18, yy, 6, g.c(key), null, 0, alpha);
    text(g, lab, x + 30, yy, { size: 12, align: 'left', halo: false, alpha });
    text(g, String(v), x + w - 14, yy, { size: 13, mono: true, align: 'right', halo: false, alpha, weight: 700 });
  });
}
function respTally(s, u) {
  const v = { atp: 0, nadh: 0, fadh2: 0, co2: 0 };
  const g1 = s > 1 ? 1 : s === 1 ? ph(u, 0.6, 0.9) : 0;
  v.atp += Math.round(2 * g1); v.nadh += Math.round(2 * g1);
  const p = s > 2 ? 1 : s === 2 ? ph(u, 0.5, 0.85) : 0;
  v.nadh += Math.round(2 * p); v.co2 += Math.round(2 * p);
  const k = s > 3 ? 1 : s === 3 ? ph(u, 0.25, 0.95) : 0;
  v.atp += Math.round(2 * k); v.nadh += Math.round(6 * k); v.fadh2 += Math.round(2 * k); v.co2 += Math.round(4 * k);
  return v;
}
const ETC_Y1 = 190, ETC_Y2 = 250;
function etcView(g, s, u, T, alpha = 1) {
  const c = g.ctx; c.save(); c.globalAlpha *= alpha;
  text(g, 'zoom: inner mitochondrial membrane', 400, 22, { size: 13, color: g.theme.muted });
  text(g, 'intermembrane space', 110, 60, { size: 13, color: g.theme.muted, align: 'left' });
  text(g, 'matrix', 110, 470, { size: 13, color: g.theme.muted, align: 'left' });
  bilayer(g, ETC_Y1, ETC_Y2, 20, 780, 'membrane');
  const prot = g.c('protein');
  const cx = { I: 140, III: 330, IV: 480 };
  rrect(g, cx.I - 38, ETC_Y1 - 20, 76, 110, 12, prot, g.theme.ink, 1.2, 0.95);
  rrect(g, cx.III - 30, ETC_Y1 - 22, 60, 84, 12, prot, g.theme.ink, 1.2, 0.95);
  rrect(g, cx.IV - 30, ETC_Y1 - 18, 60, 80, 12, prot, g.theme.ink, 1.2, 0.95);
  for (const [l, x] of Object.entries(cx)) text(g, l, x, ETC_Y1 + 30, { size: 14, mono: true, color: g.chipInk, halo: false, weight: 700 });
  circ(g, 235, 222, 9, prot, g.theme.ink, 1); circ(g, 405, 176, 9, prot, g.theme.ink, 1);
  text(g, 'electron transport chain', 310, 132, { size: 13 });
  // electrons
  const ePath = [[140, 300], [140, 222], [235, 222], [330, 220], [405, 176], [480, 220], [480, 300]];
  const e2 = [[235, 300], [235, 222], [330, 220], [405, 176], [480, 220], [480, 300]];
  chip(g, 'NADH', 140, 330, 'nadh'); chip(g, 'FADH2', 240, 330, 'fadh2');
  flowDots(g, ePath, 4, 0.16, T, 'electron', 'e-', 1, 5.5);
  flowDots(g, e2, 2, 0.16, T + 0.37, 'electron', null, 1, 5);
  // oxygen to water
  chip(g, 'O2', 452, 340, 'water'); arrow(g, 476, 340, 512, 340, g.theme.ink, 1.6, 0.8); chip(g, 'H2O', 542, 340, 'water');
  text(g, 'oxygen takes the electrons', 500, 372, { size: 12 });
  // H+ pumping
  const acc = s === 4 ? ph(u, 0, 0.9) : 1;
  for (const [i, x] of [cx.I, cx.III, cx.IV].entries()) flowDots(g, [[x + 22, 300], [x + 22, 120]], 2, 0.3, T + i * 0.21, 'hplus', null, 1, 5);
  const pool = scatter(Math.round(6 + 24 * acc), 40, 78, 600, 168, 7);
  for (const [px, py, ph0] of pool) ion(g, px + Math.sin(T * 1.7 + ph0) * 3, py + Math.cos(T * 1.3 + ph0) * 3, 'hplus', null, 0.85, 5);
  text(g, 'H+ pumped out of the matrix', 560, 60, { size: 12, color: g.c('hplus'), align: 'left' });
  // ATP synthase
  const rot = s >= 5 ? T * 3 : 0;
  atpSynthase(g, 680, ETC_Y1, ETC_Y2, false, rot, s >= 5 ? 1 : 0.6);
  text(g, 'ATP synthase', 680, ETC_Y1 - 30, { size: 13 });
  if (s >= 5) {
    flowDots(g, [[660, 120], [660, 175], [670, 222], [672, 270]], 4, 0.35, T, 'hplus', 'H+', 1, 5.5);
    for (let i = 0; i < 2; i++) { const f = frac(T * 0.32 + i / 2); chip(g, f < 0.35 ? 'ADP' : 'ATP', lerp(640, 760, f), lerp(395, 455, f), f < 0.35 ? 'co2' : 'atp', Math.min(1, (1 - f) * 5)); }
    text(g, 'ADP + phosphate → ATP', 690, 482, { size: 12 });
  }
  c.restore();
}
function drawRespiration(g, s, u, opt) {
  const T = opt.T;
  if (s <= 3) {
    mitochondrion(g);
    text(g, 'cytoplasm', 110, 60, { size: 14, color: g.theme.muted });
    // glucose and glycolysis
    if (s === 0) {
      const e = ph(u, 0, 0.7);
      carbons(g, hexAt(lerp(-20, 170, e), lerp(150, 220, e)), 'glucose');
      text(g, 'glucose (6 carbons)', lerp(-20, 170, e), 262, { size: 13, alpha: e });
    }
    if (s === 1) {
      const e1 = ph(u, 0, 0.3), e2 = ph(u, 0.3, 0.6), e3 = ph(u, 0.6, 0.9);
      const H = hexAt(170, 220);
      const A = H.slice(0, 3), B = H.slice(3);
      const off = (pts, dx, dy) => pts.map((p) => [p[0] + dx * e2, p[1] + dy * e2]);
      carbons(g, off(A, 60, -60), e2 > 0.5 ? 'pyruvate' : 'glucose');
      carbons(g, off(B, 60, 70), e2 > 0.5 ? 'pyruvate' : 'glucose');
      for (let i = 0; i < 2; i++) chip(g, e1 < 0.9 ? 'ATP' : 'ADP', lerp(110 + i * 60, 170, e1 * 0.8), lerp(330, 240, e1 * 0.8), e1 < 0.9 ? 'atp' : 'co2', 1 - e2);
      for (let i = 0; i < 4; i++) chip(g, 'ATP', 50 + i * 52, lerp(260, 330, e3), 'atp', e3);
      for (let i = 0; i < 2; i++) chip(g, 'NADH', 300, 130 + i * 160 - 30 + 0, 'nadh', e3);
      text(g, '2 ATP spent', 150, 360, { size: 12, alpha: e1 * (1 - e3) });
      text(g, '4 ATP made, so net 2', 130, 352, { size: 12, alpha: e3 });
      text(g, 'pyruvate (3 carbons) x 2', 230, 100, { size: 13, alpha: e2 });
    }
    if (s === 2) {
      const e = ph(u, 0, 0.5), f = ph(u, 0.5, 0.85);
      for (const [i, [sx, sy, tx, ty]] of [[230, 160, 450, 220], [230, 290, 450, 340]].entries()) {
        const x = lerp(sx, tx, e), y = lerp(sy, ty, e);
        const pts = [[x - 18, y], [x, y - 10], [x + 18, y]];
        carbons(g, pts.slice(0, 2), f > 0.5 ? 'pyruvate' : 'pyruvate');
        const co = [lerp(pts[2][0], pts[2][0] + 40, f), lerp(pts[2][1], pts[2][1] - 60 - i * 10, f)];
        if (f < 0.5) carbons(g, [pts[1], pts[2]], 'pyruvate');
        else chip(g, 'CO2', co[0], co[1], 'co2', 1);
        if (f > 0.5) { chip(g, 'CoA', x - 44, y + 4, 'pyruvate', ph(f, 0.5, 1)); chip(g, 'NADH', x + 10, y + 34, 'nadh', ph(f, 0.6, 1)); }
      }
      text(g, 'pyruvate enters', 300, 130, { size: 13, alpha: 1 - f });
      text(g, 'acetyl CoA', 450, 400, { size: 13, alpha: f });
    }
    if (s === 3) {
      const R = 62, cx = 620, cy = 270, rot = T * 1.1;
      for (let i = 0; i < 4; i++) {
        const a0 = rot + i * TAU / 4 + 0.15, a1 = a0 + TAU / 4 - 0.35;
        const c = g.ctx; c.save(); c.strokeStyle = g.c('pyruvate'); c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke(); c.restore();
        arrow(g, cx + Math.cos(a1 - 0.05) * R, cy + Math.sin(a1 - 0.05) * R, cx + Math.cos(a1 + 0.08) * R, cy + Math.sin(a1 + 0.08) * R, g.c('pyruvate'), 4);
      }
      text(g, 'citric acid', cx, cy - 8, { size: 12 }); text(g, 'cycle', cx, cy + 8, { size: 12 });
      const e = ph(u, 0, 0.25);
      for (const [i, sy] of [220, 340].entries()) carbons(g, [[lerp(450, cx - R, e) - 18, lerp(sy, cy, e) + i * 6], [lerp(450, cx - R, e), lerp(sy, cy, e) - 10 + i * 6]], 'pyruvate', 1 - ph(u, 0.2, 0.3));
      const prods = ['CO2', 'NADH', 'NADH', 'FADH2', 'CO2', 'NADH', 'ATP'], keys = { CO2: 'co2', NADH: 'nadh', FADH2: 'fadh2', ATP: 'atp' };
      for (let i = 0; i < 14; i++) {
        const t0 = 0.25 + 0.68 * (i / 14), life = clamp((u - t0) / 0.14, 0, 1);
        if (life <= 0 || life >= 1) continue;
        const a = -Math.PI / 2 + i * 0.9, d = R + 12 + 70 * life;
        chip(g, prods[i % 7], cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, keys[prods[i % 7]], Math.min(1, (1 - life) * 4));
      }
      text(g, 'two turns per glucose', cx, cy + R + 32, { size: 13 });
    }
    tally(g, respTally(s, u));
  } else {
    etcView(g, s, u, T, s === 6 ? 0.3 : 1);
    if (s === 6) {
      const x = 130, y = 120, w = 540, h = 250, a = ph(u, 0, 0.3), b = ph(u, 0.2, 0.8);
      rrect(g, x, y, w, h, 14, g.theme.raised, g.theme.line, 1.5, 0.96 * a);
      text(g, 'Where the ATP comes from', x + 24, y + 30, { size: 17, align: 'left', halo: false, alpha: a });
      const rows = [['Glycolysis', '2 ATP (net)', 'glucose'], ['Citric acid cycle', '2 ATP or GTP', 'pyruvate'], ['ATP synthase (chemiosmosis)', 'about 90 percent of all ATP', 'atp']];
      rows.forEach(([l, v, k], i) => { const yy = y + 66 + i * 28; circ(g, x + 32, yy, 7, g.c(k), null, 0, a); text(g, l, x + 48, yy, { size: 13, align: 'left', halo: false, alpha: a }); text(g, v, x + w - 24, yy, { size: 13, align: 'right', halo: false, alpha: a, weight: 700 }); });
      const by = y + 162, bw = w - 48;
      rrect(g, x + 24, by, bw, 24, 8, g.theme.line, null, 0, 0.3 * a);
      rrect(g, x + 24, by, bw * 0.9 * b, 24, 8, g.c('atp'), null, 0, a);
      rrect(g, x + 24 + bw * 0.9, by, bw * 0.1 * b, 24, 6, g.c('glucose'), null, 0, a);
      text(g, 'about 90%', x + 24 + bw * 0.45, by + 12, { size: 12, color: g.chipInk, halo: false, alpha: b });
      text(g, 'The total varies with species and the NADH shuttle; the source gives no single number.', x + w / 2, y + h - 30, { size: 12, color: g.theme.muted, halo: false, alpha: a });
    }
  }
}

/* ============================================================
   4. Photosynthesis
   ============================================================ */
const TY1 = 190, TY2 = 250;
function chloroplastOverview(g, T, r) {
  const col = g.c('thylakoid');
  ell(g, 400, 260, 330, 175, col, col, 3, 1, 0.07);
  ell(g, 400, 260, 318, 163, null, col, 2, 0.8);
  const stacks = [[190, 235], [300, 290], [405, 230], [510, 295], [615, 240]];
  for (let i = 0; i < stacks.length - 1; i++) poly(g, [stacks[i], stacks[i + 1]], col, 4, { alpha: 0.6 });
  for (const [x, y] of stacks) for (let j = 0; j < 6; j++) rrect(g, x - 34, y - 40 + j * 13.5, 68, 11, 5, col, g.theme.ink, 0.8, 0.85);
  text(g, 'granum (a stack of thylakoids)', 405, 158, { size: 13 });
  text(g, 'stroma', 300, 380, { size: 13, color: g.theme.muted });
  text(g, 'outer and inner membranes', 400, 70, { size: 13, color: g.theme.muted });
  for (let i = 0; i < 3; i++) { if (r <= 0) break; const f = frac(T * 0.4 * r + i / 3); wavy(g, 60 + i * 90 + f * 60, 20 + f * 120, 110 + i * 90 + f * 60, 70 + f * 120, g.c('photon'), Math.min(1, (1 - f) * 4) * 0.9, T * 6); }
}
function thylakoidView(g, s, u, flowT, r) {
  const e = (k) => (s > k ? 1 : s === k ? ph(u, 0, 0.5) : 0);
  text(g, 'stroma', 30, 40, { size: 13, color: g.theme.muted, align: 'left' });
  text(g, 'thylakoid lumen (inside the disc)', 30, 470, { size: 13, color: g.theme.muted, align: 'left' });
  text(g, 'zoom: thylakoid membrane', 400, 22, { size: 13, color: g.theme.muted });
  bilayer(g, TY1, TY2, 20, 780, 'thylakoid');
  const prot = g.c('complex');
  rrect(g, 110, TY1 - 24, 80, 108, 14, prot, g.theme.ink, 1.2); text(g, 'PSII', 150, TY1 + 30, { size: 13, mono: true, color: g.chipInk, halo: false, weight: 700 });
  rrect(g, 290, TY1 - 16, 60, 92, 12, prot, g.theme.ink, 1.2, 0.85);
  rrect(g, 440, TY1 - 24, 80, 108, 14, prot, g.theme.ink, 1.2); text(g, 'PSI', 480, TY1 + 30, { size: 13, mono: true, color: g.chipInk, halo: false, weight: 700 });
  circ(g, 235, 222, 9, prot, g.theme.ink, 1); circ(g, 400, 270, 9, prot, g.theme.ink, 1);
  rrect(g, 560, TY1 - 42, 50, 30, 10, prot, g.theme.ink, 1, e(3));
  const live = r > 0.001;
  // light
  const nPh = Math.max(0, Math.round(1 + 3 * r));
  for (const [tx, k] of [[150, 1], [480, 3]]) {
    if (e(k) <= 0 || !live) continue;
    for (let i = 0; i < nPh; i++) { const f = frac(flowT * 0.5 + i / nPh); wavy(g, tx - 90 + f * 70, 40 + f * 100, tx - 40 + f * 70, 90 + f * 100 - 4, g.c('photon'), Math.min(1, (1 - f) * 4) * e(k), flowT * 8); }
  }
  // water splitting at PSII
  if (e(1) > 0) {
    chip(g, 'H2O', 110, 320, 'water', e(1));
    if (live) {
      for (let i = 0; i < 2; i++) { const f = frac(flowT * 0.35 + i / 2); chip(g, 'O2', lerp(160, 260, f), lerp(330, 430, f), 'oxygen', e(1) * Math.min(1, (1 - f) * 4)); }
      flowDots(g, [[140, 300], [150, 236]], 2, 0.6, flowT, 'electron', null, e(1));
      flowDots(g, [[120, 300], [90, 380]], 2, 0.35, flowT + 0.2, 'hplus', null, e(1), 5);
    }
    text(g, 'water is split, oxygen released', 210, 455, { size: 12, alpha: e(1) });
  }
  // electron transport and H+ pumping
  const pool = scatter(Math.round(4 + 22 * (s >= 2 ? e(2) : 0) + (s >= 1 ? 4 * e(1) : 0)), 40, 270, 620, 440, 11);
  for (const [px, py, p0] of pool) ion(g, px + Math.sin(flowT * 1.6 + p0) * 3, py + Math.cos(flowT * 1.2 + p0) * 3, 'hplus', null, 0.8, 5);
  if (e(2) > 0 && live) {
    flowDots(g, [[150, 210], [235, 222], [320, 220], [400, 270], [480, 230]], 4, 0.22, flowT, 'electron', 'e-', e(2));
    flowDots(g, [[330, 110], [330, 300]], 2, 0.4, flowT + 0.3, 'hplus', 'H+', e(2), 5.5);
  }
  if (e(2) > 0) text(g, 'H+ pumped into the lumen', 330, 100, { size: 12, color: g.c('hplus'), alpha: e(2) });
  // PSI to NADPH
  if (e(3) > 0) {
    if (live) {
      flowDots(g, [[480, 210], [520, 170], [580, 160]], 2, 0.35, flowT, 'electron', null, e(3));
      for (let i = 0; i < 2; i++) { const f = frac(flowT * 0.3 + i / 2); chip(g, f < 0.3 ? 'NADP+' : 'NADPH', lerp(590, 600, f), lerp(140, 60, f), 'nadph', e(3) * Math.min(1, (1 - f) * 4)); }
    } else chip(g, 'NADP+', 595, 120, 'nadph', e(3) * 0.6);
  }
  // ATP synthase: H+ flows lumen -> stroma
  if (e(4) > 0) {
    const rot = flowT * 3;
    const headY = atpSynthase(g, 700, TY1, TY2, true, rot, e(4));
    if (live) {
      flowDots(g, [[690, 330], [700, 250], [700, 200], [700, headY + 30]], 3, 0.4, flowT, 'hplus', 'H+', e(4), 5.5);
      for (let i = 0; i < 2; i++) { const f = frac(flowT * 0.3 + i / 2); chip(g, f < 0.35 ? 'ADP' : 'ATP', lerp(735, 770, f), lerp(headY, headY - 70, f), f < 0.35 ? 'co2' : 'atp', e(4) * Math.min(1, (1 - f) * 4)); }
    }
    text(g, 'ATP synthase', 700, TY2 + 50, { size: 13, alpha: e(4) });
  }
}
function calvinView(g, s, u, flowT, r) {
  const col = g.c('thylakoid');
  bilayer(g, 430, 470, 20, 780, 'thylakoid', 0.8);
  text(g, 'thylakoid membrane: light reactions supply ATP and NADPH', 400, 418, { size: 12, color: g.theme.muted });
  text(g, 'stroma', 30, 30, { size: 13, color: g.theme.muted, align: 'left' });
  const cx = 420, cy = 215, R = 118, rot = flowT * 0.9 * 0.6;
  const c = g.ctx; c.save(); c.strokeStyle = col; c.lineWidth = 5; c.globalAlpha = 0.5; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke(); c.restore();
  for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6; arrow(g, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a + 0.12) * R, cy + Math.sin(a + 0.12) * R, col, 4, 0.9); }
  const node = (a) => [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  const nF = node(-Math.PI / 2), nR = node(Math.PI / 6), nG = node((5 * Math.PI) / 6);
  for (const [n, l] of [[nF, '1 Fixation'], [nR, '2 Reduction'], [nG, '3 Regeneration']]) { circ(g, n[0], n[1], 22, g.theme.raised, col, 3); text(g, l, n[0], n[1] + (n === nF ? -38 : 38), { size: 13 }); }
  text(g, 'RuBisCO', nF[0], nF[1], { size: 10, halo: false });
  text(g, '3-PGA', cx + 96, cy - 92, { size: 13, mono: true });
  text(g, 'G3P', cx, cy + R + 18, { size: 13, mono: true });
  text(g, 'RuBP', cx - 100, cy - 92, { size: 13, mono: true });
  text(g, 'Calvin cycle', cx, cy, { size: 16 });
  const live = r > 0.001;
  const carry = s === 6 ? 1 : 0.55;
  if (live) {
    for (let i = 0; i < 2; i++) { const f = frac(flowT * 0.25 + i / 2); chip(g, 'CO2', lerp(80, nF[0] - 26, f), lerp(60, nF[1], f), 'co2', Math.min(1, (1 - f) * 5)); }
    for (let i = 0; i < 2; i++) {
      const f = frac(flowT * 0.25 + i / 2 + 0.25);
      chip(g, 'ATP', lerp(600, nR[0] + 10, f), lerp(420, nR[1] + 24, f), 'atp', Math.min(1, (1 - f) * 5));
      chip(g, 'NADPH', lerp(690, nR[0] + 40, f), lerp(420, nR[1] + 10, f), 'nadph', Math.min(1, (1 - f) * 5));
      chip(g, 'ATP', lerp(200, nG[0] - 10, f), lerp(420, nG[1] + 24, f), 'atp', Math.min(1, (1 - f) * 5));
      const b = frac(f + 0.5);
      chip(g, 'ADP', lerp(nR[0] + 70, 520, b), lerp(nR[1] + 50, 420, b), 'co2', carry * Math.min(1, (1 - b) * 5));
      chip(g, 'NADP+', lerp(nR[0] + 120, 760, b), lerp(nR[1] + 40, 420, b), 'nadph', carry * 0.8 * Math.min(1, (1 - b) * 5));
    }
  } else {
    chip(g, 'CO2', 120, 70, 'co2', 0.6); chip(g, 'ATP', 600, 400, 'atp', 0.5); chip(g, 'NADPH', 690, 400, 'nadph', 0.5);
  }
  // G3P exported every 3 turns
  const turns = rot / TAU;
  const ex = frac(turns / 3);
  if (live && ex < 0.3) chip(g, 'G3P', lerp(nR[0] + 30, 760, ex / 0.3), lerp(nR[1], 250, ex / 0.3), 'sugar', Math.min(1, (0.3 - ex) * 12));
  if (s === 6) {
    const n = Math.floor(turns);
    rrect(g, 560, 30, 225, 92, 10, g.theme.raised, g.theme.line, 1.2, 0.94);
    text(g, `turns of the cycle: ${n}`, 574, 52, { size: 12, align: 'left', halo: false, mono: true });
    text(g, `G3P exported: ${Math.floor(n / 3)}`, 574, 74, { size: 12, align: 'left', halo: false, mono: true });
    text(g, '1 glucose needs 6 turns', 574, 98, { size: 12, align: 'left', halo: false, color: g.theme.muted });
  }
  if (!live) text(g, 'no light: no new ATP or NADPH', cx, 470 - 80, { size: 13, color: g.c('hplus') });
}
function drawPhotosynthesis(g, s, u, opt) {
  const r = opt.rate ?? 1, flowT = opt.flowT ?? opt.T;
  if (s === 0) chloroplastOverview(g, flowT, r);
  else if (s <= 4) thylakoidView(g, s, u, flowT, r);
  else calvinView(g, s, u, flowT, r);
  if (r <= 0.001 && s >= 1 && s <= 4) text(g, 'darkness: no light, so the light reactions stop', 400, 60, { size: 14, color: g.c('hplus') });
}

export const SCENES = {
  'dna-to-protein': drawDnaToProtein,
  mitosis: drawMitosis,
  respiration: drawRespiration,
  photosynthesis: drawPhotosynthesis
};
