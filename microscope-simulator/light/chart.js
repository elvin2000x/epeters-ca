// Light scene 2D charts (canvas). They work with or without WebGL and are the "real data" half of stops 1 and 2.
// drawSolar: ASTM G173-03 sunlight at the ground and above the air, visible band coloured by wavelength.
// drawAbsorb: PhotochemCAD chlorophyll a and b absorption, plus the chance-of-catch curve built in physics.js.
import { NM_MIN, NM_MAX } from './physics.js';

const fmt = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));

function setup(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(200, canvas.clientWidth), h = Math.max(120, canvas.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function axisFont(ctx) { ctx.font = '11px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace'; }

function marker(ctx, x, top, bottom, colour, label, w, pal) {
  ctx.save();
  ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = colour; ctx.strokeStyle = pal.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, bottom - 1, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = '600 12px "IBM Plex Sans", system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  const lx = Math.min(Math.max(x - tw / 2 - 6, 2), w - tw - 14);
  ctx.fillStyle = pal.chip; ctx.strokeStyle = pal.line; ctx.lineWidth = 1;
  roundRect(ctx, lx, top - 2, tw + 12, 19, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = pal.ink; ctx.fillText(label, lx + 6, top + 12);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawSolar(canvas, S, ui, nm, pal) {
  const { ctx, w, h } = setup(canvas);
  const L = 8, R = 8, T = 26, B = 22;
  const [x0, x1] = S.wideRange;
  let ymax = 0;
  for (let x = x0; x <= x1; x += 5) ymax = Math.max(ymax, S.wide('space', x));
  ymax *= 1.05;
  const X = (l) => L + (l - x0) / (x1 - x0) * (w - L - R);
  const Y = (v) => h - B - v / ymax * (h - T - B);

  // UV and IR zones
  ctx.fillStyle = pal.zone;
  ctx.fillRect(X(x0), T, X(NM_MIN) - X(x0), h - T - B);
  ctx.fillRect(X(NM_MAX), T, X(x1) - X(NM_MAX), h - T - B);

  // area under the ground curve, coloured in the visible band
  for (let l = x0; l < x1; l += 1) {
    const v = S.wide('global', l + 0.5);
    const vis = l >= NM_MIN && l < NM_MAX;
    ctx.fillStyle = vis ? S.cssOf(l + 0.5, false) : pal.muted;
    ctx.globalAlpha = vis ? 0.92 : 0.35;
    const xa = X(l), xb = X(l + 1);
    ctx.fillRect(xa, Y(v), Math.max(1, xb - xa + 0.4), h - B - Y(v));
  }
  ctx.globalAlpha = 1;
  // curves
  const line = (name, colour, dash) => {
    ctx.beginPath();
    for (let l = x0; l <= x1; l += 5) { const p = [X(l), Y(S.wide(name, l))]; l === x0 ? ctx.moveTo(...p) : ctx.lineTo(...p); }
    ctx.strokeStyle = colour; ctx.lineWidth = 1.5; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  };
  line('space', pal.muted, [4, 3]);
  line('global', pal.ink);

  // axis and labels
  ctx.strokeStyle = pal.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, h - B + 0.5); ctx.lineTo(w - R, h - B + 0.5); ctx.stroke();
  axisFont(ctx); ctx.fillStyle = pal.muted; ctx.textAlign = 'center';
  for (const t of [400, 600, 800, 1000, 1200]) if (t <= x1) ctx.fillText(String(t), X(t), h - 6);
  ctx.textAlign = 'left'; ctx.fillText(ui.nmUnit, X(x0) + 2, h - 6);
  ctx.fillText(ui.uv, X(x0) + 2, T + 12);
  ctx.textAlign = 'right'; ctx.fillText(ui.ir, X(x1) - 2, T + 12);
  ctx.textAlign = 'left';
  // legend
  ctx.font = '11.5px "IBM Plex Sans", system-ui, sans-serif';
  const lx = X(820);
  ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx, T + 30); ctx.lineTo(lx + 16, T + 30); ctx.stroke();
  ctx.fillStyle = pal.ink; ctx.fillText(ui.atGround, lx + 21, T + 34);
  ctx.strokeStyle = pal.muted; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(lx, T + 46); ctx.lineTo(lx + 16, T + 46); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = pal.muted; ctx.fillText(ui.inSpace, lx + 21, T + 50);

  const val = S.wide('global', nm);
  marker(ctx, X(nm), 4, h - B, S.cssOf(nm, false), `${Math.round(nm)} ${ui.nmUnit} · ${fmt(ui.irradianceAt, { w: val.toFixed(2) })}`, w, pal);
}

export function drawAbsorb(canvas, S, ui, nm, pal, recent) {
  const { ctx, w, h } = setup(canvas);
  const L = 8, R = 8, T = 26, B = 30;
  const x0 = NM_MIN, x1 = NM_MAX;
  const X = (l) => L + (l - x0) / (x1 - x0) * (w - L - R);
  const Y = (v) => h - B - v * (h - T - B);

  // chance of catch, shaded
  ctx.beginPath(); ctx.moveTo(X(x0), Y(0));
  for (let l = x0; l <= x1; l += 2) ctx.lineTo(X(l), Y(S.pCatch(l)));
  ctx.lineTo(X(x1), Y(0)); ctx.closePath();
  ctx.fillStyle = pal.catchFill; ctx.fill();
  // chlorophyll curves, scaled to the largest molar extinction of the two
  const curve = (name, colour, width) => {
    ctx.beginPath();
    for (let l = x0; l <= x1; l += 1) { const p = [X(l), Y(S.v(name, l) / S.epsMax)]; l === x0 ? ctx.moveTo(...p) : ctx.lineTo(...p); }
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.stroke();
  };
  curve('chla', pal.chlA, 2.2);
  curve('chlb', pal.chlB, 2.2);
  // rainbow strip
  for (let l = x0; l < x1; l++) { ctx.fillStyle = S.cssOf(l + 0.5); ctx.fillRect(X(l), h - B + 3, X(l + 1) - X(l) + 0.5, 8); }
  // recent photons from the rain: tiny ticks above the strip, up = bounced, down = caught
  if (recent && recent.length) {
    for (const r of recent) {
      ctx.fillStyle = S.cssOf(r.nm, false); ctx.globalAlpha = 0.85;
      ctx.fillRect(X(r.nm) - 1, r.caught ? h - B - 4 : h - B - 10, 2, r.caught ? 4 : 6);
    }
    ctx.globalAlpha = 1;
  }
  axisFont(ctx); ctx.fillStyle = pal.muted; ctx.textAlign = 'center';
  for (const t of [400, 450, 500, 550, 600, 650, 700]) ctx.fillText(String(t), X(t), h - 6);
  ctx.textAlign = 'left';
  // legend
  ctx.font = '11.5px "IBM Plex Sans", system-ui, sans-serif';
  const items = [[pal.chlA, ui.legChlA], [pal.chlB, ui.legChlB], [pal.catchLine, ui.chance]];
  let lx = X(505), ly = T + 6;
  for (const [c, t] of items) {
    ctx.fillStyle = c; ctx.fillRect(lx, ly - 8, 14, 4);
    ctx.fillStyle = pal.ink; ctx.fillText(t, lx + 19, ly - 3); ly += 15;
  }
  const p = Math.round(S.pCatch(nm) * 100);
  marker(ctx, X(nm), 4, h - B, S.cssOf(nm, false), `${Math.round(nm)} ${ui.nmUnit} · ${fmt(ui.chanceAt, { p })}`, w, pal);
}
