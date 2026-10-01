// Light scene, flat version for browsers without WebGL. A 2D canvas draws the prism (same flint glass angles as the
// 3D stage) and the leaf with its photon rain (same real catch chances). The cell and antenna stops show their
// words in a card. Same events as scenes.js so light.js does not care which one runs.
import { prismDeviation, NM_MIN, NM_MAX } from './physics.js';

const DEG = Math.PI / 180;
const FAN_X = 3;

export function createFlat(host, ctx) {
  const { S } = ctx;
  const canvas = document.createElement('canvas');
  canvas.className = 'lt-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const card = document.createElement('div');
  card.className = 'lt-flatcard';
  host.appendChild(card);
  const g = canvas.getContext('2d');
  const state = { stop: null, nm: 550, reduced: !!ctx.reduced, w: 1, h: 1, rain: !ctx.reduced, running: false, t: 0 };
  const drops = [];
  const flashes = [];
  const counts = { caught: 0, bounced: 0 };
  const recent = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = Math.max(1, host.clientWidth); state.h = Math.max(1, host.clientHeight);
    canvas.width = Math.round(state.w * dpr); canvas.height = Math.round(state.h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  const rgba = (rgb, a) => `rgba(${rgb.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)).join(',')},${a})`;

  function drawSun() {
    const { w, h } = state;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0b1a38'); bg.addColorStop(1, '#02040b');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const u = Math.min(w / 16, h / 9);
    const sun = [w * 0.1, h * 0.3], pr = [w * 0.42, h * 0.58];
    const glow = g.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], u * 3);
    glow.addColorStop(0, 'rgba(255,240,200,1)'); glow.addColorStop(0.3, 'rgba(255,190,90,0.6)'); glow.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(sun[0], sun[1], u * 3, 0, Math.PI * 2); g.fill();
    // white beam
    g.strokeStyle = 'rgba(255,250,235,0.85)'; g.lineWidth = Math.max(3, u * 0.18);
    g.beginPath(); g.moveTo(sun[0], sun[1]); g.lineTo(pr[0] - u * 0.6, pr[1] - u * 0.2); g.stroke();
    // fan: each band bent by the real deviation (3 times wider), brightness from the sunlight curve
    let smax = 0; for (let nm = NM_MIN; nm <= NM_MAX; nm += 5) smax = Math.max(smax, S.v('solar', nm));
    const d550 = prismDeviation(550), base = Math.atan2(pr[1] - u * 0.2 - sun[1], pr[0] - u * 0.6 - sun[0]);
    const out = [pr[0] + u * 0.6, pr[1] - u * 0.2], len = w - out[0] - u * 0.6;
    g.globalCompositeOperation = 'lighter';
    for (let nm = NM_MIN; nm <= NM_MAX; nm += 5) {
      const a = -0.12 - FAN_X * (prismDeviation(nm) - d550) * DEG;
      g.strokeStyle = rgba(S.colour(nm), 0.25 + 0.6 * S.v('solar', nm) / smax); g.lineWidth = Math.max(2, u * 0.12);
      g.beginPath(); g.moveTo(out[0], out[1]); g.lineTo(out[0] + Math.cos(a) * len, out[1] + Math.sin(a) * len); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    const a = -0.12 - FAN_X * (prismDeviation(state.nm) - d550) * DEG;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(out[0], out[1]); g.lineTo(out[0] + Math.cos(a) * len, out[1] + Math.sin(a) * len); g.stroke(); g.setLineDash([]);
    g.fillStyle = S.cssOf(state.nm, false); g.beginPath(); g.arc(out[0] + Math.cos(a) * len, out[1] + Math.sin(a) * len, 7, 0, Math.PI * 2); g.fill();
    // prism, apex down
    const s = u * 2.2;
    g.fillStyle = 'rgba(160,216,255,0.16)'; g.strokeStyle = 'rgba(190,235,255,0.8)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(pr[0] - s / 2, pr[1] - s * 0.3); g.lineTo(pr[0] + s / 2, pr[1] - s * 0.3); g.lineTo(pr[0], pr[1] + s * 0.57); g.closePath(); g.fill(); g.stroke();
  }

  function leafShape(cx, cy, L, W) {
    g.beginPath(); g.moveTo(cx - L / 2, cy);
    g.bezierCurveTo(cx - L / 4, cy - W, cx + L / 4, cy - W * 0.9, cx + L / 2, cy);
    g.bezierCurveTo(cx + L / 4, cy + W * 0.9, cx - L / 4, cy + W, cx - L / 2, cy); g.closePath();
  }
  function drawLeaf(dt) {
    const { w, h } = state;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#16354a'); bg.addColorStop(1, '#04110b');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.66, L = Math.min(w * 0.8, h * 1.3), W = L * 0.24;
    const lg = g.createLinearGradient(0, cy - W, 0, cy + W); lg.addColorStop(0, '#2f7d1f'); lg.addColorStop(1, '#0d3a0d');
    leafShape(cx, cy, L, W); g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(170,220,120,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - L / 2, cy); g.lineTo(cx + L / 2, cy); g.stroke();
    // rain
    if (state.rain && !state.reduced) {
      state.acc = (state.acc || 0) + dt * 20;
      while (state.acc > 1) { state.acc--; spawn(S.sampleNm(Math.random()), false); }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (!state.reduced) { d.x += d.vx * dt; d.y += d.vy * dt; }
      if (d.phase === 'fall' && d.y >= d.ty) land(d);
      if (d.phase === 'gone' || d.y < -20) { drops.splice(i, 1); continue; }
      g.fillStyle = S.cssOf(d.nm, false);
      g.beginPath(); g.arc(d.x, d.y, d.special ? 6 : 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(S.colour(d.nm), 0.45); g.lineWidth = d.special ? 3 : 1.5;
      g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - d.vx * 0.06, d.y - d.vy * 0.06); g.stroke();
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.age += state.reduced ? 0 : dt;
      if (f.age > 0.7) { flashes.splice(i, 1); continue; }
      g.strokeStyle = rgba(S.colour(f.nm), 1 - f.age / 0.7); g.lineWidth = 2;
      g.beginPath(); g.arc(f.x, f.y, 4 + f.age * 30, 0, Math.PI * 2); g.stroke();
    }
    state.leaf = { cx, cy, L, W };
  }
  function spawn(nm, special) {
    const lf = state.leaf; if (!lf) return null;
    const tx = lf.cx + (Math.random() - 0.5) * lf.L * 0.7, ty = lf.cy + (Math.random() - 0.5) * lf.W * 0.6;
    const d = { nm, special, x: tx - 80, y: -10, tx, ty, phase: 'fall' };
    const T = special ? 1.6 : 0.9; d.vx = (tx - d.x) / T; d.vy = (ty - d.y) / T;
    drops.push(d);
    if (state.reduced) { d.x = tx; d.y = ty; land(d); }
    return d;
  }
  function land(d) {
    const p = S.pCatch(d.nm), caught = Math.random() < p;
    if (caught) { counts.caught++; d.phase = 'gone'; flashes.push({ x: d.tx, y: d.ty, nm: d.nm, age: state.reduced ? 0.2 : 0 }); }
    else { counts.bounced++; d.phase = 'up'; d.vx = (Math.random() - 0.5) * 120; d.vy = -320; if (state.reduced) d.y -= 40; }
    recent.push({ nm: d.nm, caught }); if (recent.length > 160) recent.shift();
    if (d.special) ctx.onEvent('leafResult', { nm: d.nm, caught, p });
    ctx.onEvent('leafCount', counts);
  }

  function drawPlain(top, bottom) {
    const bg = g.createLinearGradient(0, 0, 0, state.h); bg.addColorStop(0, top); bg.addColorStop(1, bottom);
    g.fillStyle = bg; g.fillRect(0, 0, state.w, state.h);
  }

  let raf = 0, last = 0;
  function draw(dt = 0) {
    if (state.stop === 'sun') drawSun();
    else if (state.stop === 'leaf' || state.stop === 'payoff') drawLeaf(dt);
    else drawPlain('#0c1f2e', '#020507');
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    draw(dt);
    if (state.running && !state.reduced && (state.stop === 'leaf' || state.stop === 'payoff')) raf = requestAnimationFrame(frame);
  }
  function kick() { if (state.running && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
  const onVis = () => { state.running = !document.hidden; if (state.running) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize); ro.observe(host);
  state.running = !document.hidden;

  const leafApi = {
    send(nm) { spawn(nm, true); kick(); },
    setRain(on) { state.rain = on; kick(); },
    rain: () => state.rain,
    counts, recent,
    reset() { counts.caught = 0; counts.bounced = 0; recent.length = 0; },
  };

  return {
    flat: true,
    setStop(id) {
      state.stop = id;
      const showCard = id === 'cell' || id === 'antenna';
      card.hidden = !showCard;
      if (showCard) card.textContent = ctx.cardText(id);
      draw(); kick();
    },
    setNm(nm) { state.nm = nm; draw(); },
    setReduced(r) { state.reduced = r; kick(); },
    kick, start() { state.running = true; kick(); }, stop() { state.running = false; },
    leaf: () => leafApi,
    current: () => state.stop,
    refreshCard() { if (!card.hidden) card.textContent = ctx.cardText(state.stop); },
    dispose() { if (raf) cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.remove(); card.remove(); },
  };
}
