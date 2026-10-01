// Diffusion and osmosis lab: a real (if simplified) particle simulation.
// Physics: every particle follows Langevin dynamics (random thermal kicks plus drag), so it does a random walk;
// particles do not collide with each other. Water crosses membranes freely. Solute particles that cannot cross
// bounce off the membrane. The push on the membrane is the osmotic pressure of an ideal solution (van 't Hoff),
// n kT / area, worked out from the live counts and areas on each side. The membrane (a piston in the box, a circle for the cell) moves under that push,
// against a spring that stands in for the pressure that builds as a compartment swells. Water then spreads
// evenly through whatever space each side has, so water ends up on the side with more solute.
// The run is deterministic (seeded random numbers) and snapshotted, so the timeline can be dragged back and forth.
export const T_MAX = 30;            // seconds of simulated time on the timeline
const DT = 1 / 60, SNAP_EVERY = 15;  // fixed physics step; a snapshot every quarter second
const BOX = { x1: 20, y1: 40, x2: 780, y2: 470 };
const MID = 400, CELL = { x: 400, y: 255, R0: 100 };
export const CELL_INSIDE = 20;       // solute particles inside the red blood cell
export const ISO_OUTSIDE = 188;      // outside count that matches the inside concentration (20 / inside area = 188 / outside area)
const N_WATER = 280;
const GAMMA = 1.5, SIG_W = 225, SIG_S = 190;        // drag 1/s; kick strength for water and solute (px / s^1.5)
const K_BOX = 5.4, M_BOX = 17, C_BOX = 32;         // piston spring, mass, damping
const K_CELL = 50, M_CELL = 25, C_CELL = 200;     // cell membrane spring, mass, damping
const KT = (SIG_S * SIG_S) / (2 * GAMMA);          // solute mass 1, so kT = mean squared speed per axis
const AREA = (BOX.x2 - BOX.x1) * (BOX.y2 - BOX.y1);
const BURST = 1.24;                               // the cell bursts above this radius ratio
const PASS_SOLUTE = 1;                            // chance a solute hit passes a permeable membrane

function mulberry(seed) { return seed >>> 0; }
function rnd(st) { // returns [value, newState]; mulberry32
  let t = (st.s += 0x6d2b79f5) | 0; st.s = t >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss(st) { const u = Math.max(1e-9, rnd(st)), v = rnd(st); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function createLab() {
  let P = { mode: 'box', left: 60, right: 0, permeable: true, outside: ISO_OUTSIDE };
  let S = null, snaps = [];

  function init(params) {
    P = { ...P, ...params };
    const st = { s: mulberry(20261001) };
    const nSol = P.mode === 'box' ? P.left + P.right : CELL_INSIDE + P.outside;
    const n = N_WATER + nSol;
    const s = {
      n, t: 0, frame: 0, st,
      x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
      type: new Uint8Array(n), side: new Int8Array(n),
      mx: MID, mv: 0, F: 0, R: CELL.R0, Rv: 0, burst: false, net: 0
    };
    let i = 0;
    const place = (type, test) => {
      for (let tries = 0; tries < 2000; tries++) {
        const x = BOX.x1 + 6 + rnd(st) * (BOX.x2 - BOX.x1 - 12), y = BOX.y1 + 6 + rnd(st) * (BOX.y2 - BOX.y1 - 12);
        if (test(x, y)) { s.x[i] = x; s.y[i] = y; break; }
      }
      const sig = type ? SIG_S : SIG_W, vr = sig / Math.sqrt(2 * GAMMA);
      s.vx[i] = gauss(st) * vr; s.vy[i] = gauss(st) * vr; s.type[i] = type; i++;
    };
    const inCell = (x, y) => Math.hypot(x - CELL.x, y - CELL.y) < CELL.R0 - 6;
    for (let k = 0; k < N_WATER; k++) place(0, () => true);
    if (P.mode === 'box') {
      for (let k = 0; k < P.left; k++) place(1, (x) => x < MID - 4);
      for (let k = 0; k < P.right; k++) place(1, (x) => x > MID + 4);
    } else {
      for (let k = 0; k < CELL_INSIDE; k++) place(1, inCell);
      for (let k = 0; k < P.outside; k++) place(1, (x, y) => Math.hypot(x - CELL.x, y - CELL.y) > CELL.R0 + 6);
    }
    for (let k = 0; k < n; k++) s.side[k] = sideOf(s, k);
    S = s; snaps = []; snap();
  }
  function sideOf(s, k) {
    if (P.mode === 'box') return s.x[k] < s.mx ? -1 : 1;
    return Math.hypot(s.x[k] - CELL.x, s.y[k] - CELL.y) < s.R ? 1 : -1; // 1 = inside
  }
  function snap() {
    const s = S;
    snaps[s.frame / SNAP_EVERY] = { ...s, st: { s: s.st.s }, x: s.x.slice(), y: s.y.slice(), vx: s.vx.slice(), vy: s.vy.slice(), side: s.side.slice(), type: s.type };
  }
  function restore(o) { S = { ...o, st: { s: o.st.s }, x: o.x.slice(), y: o.y.slice(), vx: o.vx.slice(), vy: o.vy.slice(), side: o.side.slice() }; }

  function step() {
    const s = S, st = s.st, sq = Math.sqrt(DT);
    const box = P.mode === 'box', movable = box && !P.permeable;
    for (let k = 0; k < s.n; k++) {
      const sig = s.type[k] ? SIG_S : SIG_W;
      s.vx[k] += -GAMMA * s.vx[k] * DT + sig * sq * gauss(st);
      s.vy[k] += -GAMMA * s.vy[k] * DT + sig * sq * gauss(st);
      let x = s.x[k] + s.vx[k] * DT, y = s.y[k] + s.vy[k] * DT;
      if (x < BOX.x1) { x = 2 * BOX.x1 - x; s.vx[k] = Math.abs(s.vx[k]); }
      if (x > BOX.x2) { x = 2 * BOX.x2 - x; s.vx[k] = -Math.abs(s.vx[k]); }
      if (y < BOX.y1) { y = 2 * BOX.y1 - y; s.vy[k] = Math.abs(s.vy[k]); }
      if (y > BOX.y2) { y = 2 * BOX.y2 - y; s.vy[k] = -Math.abs(s.vy[k]); }
      if (s.type[k] === 1) {
        if (box) {
          const was = s.side[k], now = x < s.mx ? -1 : 1;
          if (now !== was) {
            const pass = P.permeable && rnd(st) < PASS_SOLUTE;
            if (!pass) { s.vx[k] = -s.vx[k]; x = 2 * s.mx - x; if ((x < s.mx ? -1 : 1) !== was) x = s.mx + was * 0.5; }
          }
        } else if (!s.burst) {
          const dx = x - CELL.x, dy = y - CELL.y, r = Math.hypot(dx, dy) || 1e-6, nx = dx / r, ny = dy / r;
          const was = s.side[k], now = r < s.R ? 1 : -1;
          if (now !== was) {
            const vr = s.vx[k] * nx + s.vy[k] * ny;
            s.vx[k] -= 2 * vr * nx; s.vy[k] -= 2 * vr * ny;
            let rr = 2 * s.R - r; if ((rr < s.R ? 1 : -1) !== was) rr = s.R - was * 0.5;
            x = CELL.x + nx * rr; y = CELL.y + ny * rr;
          }
        }
      }
      s.x[k] = x; s.y[k] = y;
    }
    // the push on the membrane: ideal-solution osmotic pressure (n kT / area) of the solute held on each side
    if (movable) s.F = KT * (P.left / (s.mx - BOX.x1) - P.right / (BOX.x2 - s.mx));
    else if (!box && !s.burst) s.F = KT * (2 * CELL_INSIDE / s.R - P.outside * 2 * Math.PI * s.R / (AREA - Math.PI * s.R * s.R));
    if (movable) {
      const a = (s.F - K_BOX * (s.mx - MID) - C_BOX * s.mv) / M_BOX;
      s.mv += a * DT; s.mx = Math.min(640, Math.max(160, s.mx + s.mv * DT));
    } else if (!box && !s.burst) {
      const a = (s.F - K_CELL * (s.R - CELL.R0) - C_CELL * s.Rv) / M_CELL;
      s.Rv += a * DT; s.R = Math.min(170, Math.max(50, s.R + s.Rv * DT));
      if (s.R > CELL.R0 * BURST) s.burst = true;
    }
    // keep blocked solutes on their own side if the membrane moved past them; count water crossings
    for (let k = 0; k < s.n; k++) {
      if (s.type[k] === 1) {
        if (box && !P.permeable) { if ((s.x[k] < s.mx ? -1 : 1) !== s.side[k]) s.x[k] = s.mx + s.side[k] * 0.5; }
        else if (!box && !s.burst) {
          const dx = s.x[k] - CELL.x, dy = s.y[k] - CELL.y, r = Math.hypot(dx, dy) || 1e-6;
          if ((r < s.R ? 1 : -1) !== s.side[k]) { const rr = s.R - s.side[k] * 0.5; s.x[k] = CELL.x + dx / r * rr; s.y[k] = CELL.y + dy / r * rr; }
        }
        s.side[k] = sideOf(s, k);
      } else {
        const now = sideOf(s, k);
        if (now !== s.side[k]) { s.net += now; s.side[k] = now; }
      }
    }
    s.frame++; s.t = s.frame * DT;
    if (s.frame % SNAP_EVERY === 0 && !snaps[s.frame / SNAP_EVERY]) snap();
  }

  function seek(t) {
    const target = Math.round(Math.min(T_MAX, Math.max(0, t)) / DT);
    if (target < S.frame) {
      let i = Math.floor(target / SNAP_EVERY);
      while (i > 0 && !snaps[i]) i--;
      restore(snaps[i]);
    }
    while (S.frame < target) step();
  }
  function advance(dt) { seek(S.t + dt); }

  function readout() {
    const s = S; let wa = 0, wb = 0, sa = 0, sb = 0;
    for (let k = 0; k < s.n; k++) {
      const side = sideOf(s, k);
      if (s.type[k]) { if (side < 0) sa++; else sb++; } else { if (side < 0) wa++; else wb++; }
    }
    // box: a = left, b = right. cell: a = outside, b = inside
    return { mode: P.mode, t: s.t, waterA: wa, waterB: wb, soluteA: sa, soluteB: sb, net: s.net, size: s.R / CELL.R0, burst: s.burst, mx: s.mx };
  }

  function draw(g, helpers) {
    const { ctx } = g, s = S, ink = g.theme.ink;
    const rW = Math.max(2.6, 1.7 / g.k), rS = Math.max(5.5, 3.4 / g.k);
    ctx.save();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = g.theme.line;
    ctx.beginPath(); ctx.rect(BOX.x1, BOX.y1, BOX.x2 - BOX.x1, BOX.y2 - BOX.y1); ctx.stroke();
    ctx.fillStyle = g.c('water'); ctx.globalAlpha = 0.06; ctx.fill(); ctx.globalAlpha = 1;
    if (P.mode === 'box') {
      const mcol = g.c('membrane');
      ctx.strokeStyle = mcol; ctx.lineWidth = 6; ctx.lineCap = 'butt';
      const gap = P.permeable ? 12 : 5, seg = P.permeable ? 18 : 22;
      ctx.setLineDash([seg, gap]); ctx.beginPath(); ctx.moveTo(s.mx, BOX.y1); ctx.lineTo(s.mx, BOX.y2); ctx.stroke(); ctx.setLineDash([]);
      helpers.text(g, P.permeable ? 'membrane: water and solute can pass' : 'membrane: only water can pass', s.mx, BOX.y1 - 16, { size: 12 });
      if (!P.permeable && Math.abs(s.mx - MID) > 4) {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(MID, BOX.y1); ctx.lineTo(MID, BOX.y2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        helpers.text(g, 'start', MID, BOX.y2 + 14, { size: 11, color: g.theme.muted });
      }
    } else {
      const R = s.R, cr = g.c('cell');
      ctx.beginPath();
      const cren = s.burst ? 0 : Math.min(9, Math.max(0, (0.95 * CELL.R0 - R) * 0.4));
      for (let i = 0; i <= 180; i++) {
        const a = (i / 180) * Math.PI * 2, rr = R + cren * Math.sin(a * 14);
        const x = CELL.x + Math.cos(a) * rr, y = CELL.y + Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = cr; ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = cr; ctx.lineWidth = 4;
      if (s.burst) ctx.setLineDash([26, 18]);
      ctx.stroke(); ctx.setLineDash([]);
      helpers.text(g, s.burst ? 'burst (lysis)' : 'red blood cell', CELL.x, CELL.y - R - 18, { size: 13, color: s.burst ? cr : ink });
      if (!s.burst && Math.abs(R - CELL.R0) > 3) {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(CELL.x, CELL.y, CELL.R0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    // particles: water first, solute on top
    ctx.fillStyle = g.c('water'); ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let k = 0; k < s.n; k++) if (!s.type[k]) { ctx.moveTo(s.x[k] + rW, s.y[k]); ctx.arc(s.x[k], s.y[k], rW, 0, Math.PI * 2); }
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = g.c('solute'); ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < s.n; k++) if (s.type[k]) { ctx.moveTo(s.x[k] + rS, s.y[k]); ctx.arc(s.x[k], s.y[k], rS, 0, Math.PI * 2); }
    ctx.fill(); ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();
    // side counts on the canvas
    const r = readout();
    if (P.mode === 'box') {
      helpers.text(g, `water ${r.waterA} Â· solute ${r.soluteA}`, (BOX.x1 + s.mx) / 2, BOX.y2 + 16, { size: 12, mono: true });
      helpers.text(g, `water ${r.waterB} Â· solute ${r.soluteB}`, (s.mx + BOX.x2) / 2, BOX.y2 + 16, { size: 12, mono: true });
    } else {
      helpers.text(g, `inside: water ${r.waterB} Â· solute ${r.soluteB}`, 230, BOX.y2 + 16, { size: 12, mono: true });
      helpers.text(g, `outside: water ${r.waterA} Â· solute ${r.soluteA}`, 590, BOX.y2 + 16, { size: 12, mono: true });
    }
    helpers.text(g, `${s.t.toFixed(1)} s`, BOX.x2 - 6, BOX.y1 - 16, { size: 12, mono: true, align: 'right', color: g.theme.muted });
  }

  init({});
  return {
    get time() { return S.t; },
    get params() { return { ...P }; },
    reset(params) { init(params || {}); },
    seek, advance, readout, draw
  };
}
