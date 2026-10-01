// Home-page journey controller: maps page scroll (or the rail, the slider, or the arrow keys) to one zoom value,
// u = log10(view across, in metres), and keeps the readout, rail, caption and screen-reader text in step with it.
// The three.js side lives in scenes.js and is only loaded when WebGL works.
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const U_MIN = Math.log10(2.5e-10);
const U_INTRO = Math.log10(1.7e-3);

// view across in metres, written for the eye (readout) and for the ear (screen readers)
function fmt(m) {
  const [v, unit] = m >= 1e-3 ? [m * 1e3, 'mm'] : m >= 1e-6 ? [m * 1e6, 'µm'] : m >= 1e-9 ? [m * 1e9, 'nm'] : [m * 1e10, 'Å'];
  return (v < 9.95 ? v.toFixed(1) : Math.round(v).toString()) + ' ' + unit;
}
function fmtTick(m) {
  const [v, unit] = m >= 1e-3 ? [m * 1e3, 'mm'] : m >= 1e-6 ? [m * 1e6, 'µm'] : m >= 1e-9 ? [m * 1e9, 'nm'] : m >= 1e-10 ? [m * 1e10, 'Å'] : [m * 1e12, 'pm'];
  return Math.round(v) + ' ' + unit;
}
function spoken(m) {
  const [v, unit] = m >= 1e-3 ? [m * 1e3, 'millimetres'] : m >= 1e-6 ? [m * 1e6, 'micrometres'] : m >= 1e-9 ? [m * 1e9, 'nanometres'] : [m * 1e10, 'angstroms'];
  return (v < 9.95 ? v.toFixed(1) : Math.round(v)) + ' ' + unit;
}

// Scroll position (0..1) to zoom. Each level gets a short dwell where the zoom barely moves, so the caption can be read.
function buildMap(anchors) {
  const DWELL = 0.5, PER_DECADE = 0.45, HOLD = 0.06;
  const k = [{ w: 0, u: anchors[0] }];
  let w = 0;
  anchors.forEach((a, i) => {
    if (i > 0) { const from = k[k.length - 1].u, to = a + HOLD; w += (from - to) * PER_DECADE; k.push({ w, u: to, ease: true }); }
    w += DWELL; k.push({ w, u: a - HOLD, dwell: i });
  });
  w += (k[k.length - 1].u - U_MIN) * PER_DECADE; k.push({ w, u: U_MIN, ease: true });
  for (const p of k) p.p = p.w / w;
  const uAt = (p) => {
    p = clamp(p, 0, 1);
    let i = 1; while (i < k.length - 1 && p > k[i].p) i++;
    const a = k[i - 1], b = k[i], t = (p - a.p) / Math.max(1e-9, b.p - a.p);
    return a.u + (b.u - a.u) * (b.ease ? easeIO(t) : t);
  };
  const pAt = (u) => { let lo = 0, hi = 1; for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (uAt(m) > u) lo = m; else hi = m; } return (lo + hi) / 2; };
  const levelP = anchors.map((_, i) => { const end = k.find((x) => x.dwell === i), st = k[k.indexOf(end) - 1]; return (st.p + end.p) / 2; });
  return { uAt, pAt, levelP, screens: w };
}

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

export async function startJourney(copy = {}) {
  const t = (key, fallback) => (typeof copy[key] === 'string' && copy[key]) || fallback;
  const root = $('#journey'), stage = $('#stage');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let data;
  try { data = await (await fetch('journey/journey.json')).json(); } catch (e) { console.warn('journey.json did not load', e); return; }
  const levels = data.levels, anchors = levels.map((l) => Math.log10(l.view));
  const map = buildMap(anchors);
  const nameOf = (i) => t(levels[i].nameKey, levels[i].id);
  const railOf = (i) => t(levels[i].railKey, levels[i].id);
  const buttons = [...document.querySelectorAll('#levels button')];
  buttons.forEach((b, i) => { b.setAttribute('aria-label', `${railOf(i)}: ${nameOf(i)}, ${spoken(levels[i].view)} ${t('journey.across', 'across')}`); });
  buildSources(data, t);

  const gl = hasWebGL() && !/[?&]nogl\b/.test(location.search);
  if (!gl) { showStatic(levels, t, nameOf, railOf); return; }
  root.style.setProperty('--screens', (map.screens + 1).toFixed(2));
  root.classList.add('live');

  let J;
  try {
    const [{ createJourney }, atp] = await Promise.all([import('./scenes.js'), fetch('journey/atp.json').then((r) => r.json())]);
    const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;
    J = createJourney($('#gl'), { levels, atp, dark: isDark(), lowPower });
    $('#theme').addEventListener('click', () => J.setTheme(isDark()));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => J.setTheme(isDark()));
  } catch (e) {
    console.warn('The 3D journey could not start, showing the still version', e);
    root.classList.remove('live'); showStatic(levels, t, nameOf, railOf); return;
  }

  /* ----- state ----- */
  const t0 = performance.now();
  let uCur = reduce.matches ? anchors[0] : U_INTRO, last = t0, running = false, visible = true, level = -1, tween = null;
  const scrollP = () => {
    const r = root.getBoundingClientRect(), span = r.height - innerHeight;
    return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
  };
  const targetU = (now) => {
    const p = scrollP();
    let u = map.uAt(p);
    if (reduce.matches) {   // step through the levels: snap to the nearest one, no in-between zoom
      let best = 0; for (let i = 1; i < anchors.length; i++) if (Math.abs(map.levelP[i] - p) < Math.abs(map.levelP[best] - p)) best = i;
      return anchors[best];
    }
    const intro = clamp((now - t0) / 2600, 0, 1);
    if (p < 0.002 && intro < 1) u = U_INTRO + (anchors[0] - U_INTRO) * easeIO(intro);
    return u;
  };
  const scrollToP = (p, instant) => {
    const r = root.getBoundingClientRect(), top = scrollY + r.top + p * (r.height - innerHeight);
    if (tween) cancelAnimationFrame(tween.raf), tween = null;
    if (instant || reduce.matches) { scrollTo(0, top); return; }
    const y0 = scrollY, dist = top - y0, dur = clamp(700 + Math.abs(dist) / innerHeight * 260, 800, 2600), s = performance.now();
    const step = (now) => { const k = clamp((now - s) / dur, 0, 1); scrollTo(0, y0 + dist * easeIO(k)); if (k < 1) tween.raf = requestAnimationFrame(step); else tween = null; };
    tween = { raf: requestAnimationFrame(step) };
  };
  const stopTween = () => { if (tween) { cancelAnimationFrame(tween.raf); tween = null; } };
  addEventListener('wheel', stopTween, { passive: true });
  addEventListener('touchstart', stopTween, { passive: true });
  const goLevel = (i) => scrollToP(map.levelP[clamp(i, 0, levels.length - 1)]);
  const nudge = (du) => scrollToP(map.pAt(clamp(uCur + du, U_MIN, anchors[0])));

  /* ----- rail, slider, keys ----- */
  buttons.forEach((b, i) => b.addEventListener('click', () => goLevel(i)));
  const track = $('#track');
  const uToRail = (u) => {   // 0 at the first level, 1 at the last, evenly spaced between levels
    if (u >= anchors[0]) return 0;
    for (let i = 0; i < anchors.length - 1; i++) if (u >= anchors[i + 1]) return (i + (anchors[i] - u) / (anchors[i] - anchors[i + 1])) / (anchors.length - 1);
    return 1 + (anchors[anchors.length - 1] - u) / (anchors[anchors.length - 1] - U_MIN) * 0.06;
  };
  const railToU = (f) => {
    f = clamp(f, 0, 1) * (anchors.length - 1);
    const i = Math.min(Math.floor(f), anchors.length - 2), s = f - i;
    return anchors[i] + (anchors[i + 1] - anchors[i]) * s;
  };
  let dragging = false;
  const fromPointer = (e) => { const r = track.getBoundingClientRect(); scrollToP(map.pAt(railToU((e.clientY - r.top) / r.height)), true); };
  track.addEventListener('pointerdown', (e) => { dragging = true; track.setPointerCapture(e.pointerId); fromPointer(e); });
  track.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  track.addEventListener('pointerup', () => { dragging = false; });
  track.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') nudge(-0.25);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') nudge(0.25);
    else if (k === 'PageDown') goLevel(nearestAhead(1));
    else if (k === 'PageUp') goLevel(nearestAhead(-1));
    else if (k === 'Home') goLevel(0);
    else if (k === 'End') goLevel(levels.length - 1);
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  root.addEventListener('keydown', (e) => {
    if (e.target === track || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { goLevel(nearestAhead(1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { goLevel(nearestAhead(-1)); e.preventDefault(); }
  });
  const nearestAhead = (dir) => {
    // the next level in that direction from where the zoom is now (not from the last caption)
    if (dir > 0) { for (let i = 0; i < anchors.length; i++) if (anchors[i] < uCur - 0.08) return i; return anchors.length - 1; }
    for (let i = anchors.length - 1; i >= 0; i--) if (anchors[i] > uCur + 0.08) return i; return 0;
  };
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = stage.getBoundingClientRect(); J.setParallax((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  });

  /* ----- per-frame UI ----- */
  const hero = $('#hero'), cap = $('#caption'), roBig = $('#roBig'), roLine = $('#roLine'), roTick = $('#roTick'), thumb = $('#thumb'), fill = $('#trackFill'), live = $('#live');
  let liveTimer = 0, lastRo = '';
  function setLevel(i) {
    if (i === level) return;
    level = i;
    const L = levels[i];
    $('#capStep').textContent = `${i + 1} / ${levels.length}`;
    $('#capRail').textContent = railOf(i);
    $('#capTitle').textContent = nameOf(i);
    $('#capFact').textContent = L.fact;
    $('#capLink').href = L.link; $('#capLinkText').textContent = t(L.linkKey, 'Open');
    $('#capBadge').textContent = L.kind === 'real' ? t('journey.real', 'Atom positions are real.') : t('journey.illustrative', 'Illustrative drawing. The scale readout is real.');
    buttons.forEach((b, j) => { if (j === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      live.textContent = t('journey.sr', 'Level {n} of {total}, {rail}. The view is about {size} across. {fact}')
        .replace('{n}', i + 1).replace('{total}', levels.length).replace('{rail}', railOf(i)).replace('{name}', nameOf(i)).replace('{size}', spoken(L.view)).replace('{fact}', L.fact);
    }, 450);
  }
  function ui(u, p) {
    const view = Math.pow(10, u);
    const ro = fmt(view);
    if (ro !== lastRo) { roBig.textContent = ro; lastRo = ro; }
    const short = Math.min(stage.clientWidth, stage.clientHeight);
    const bar = Math.pow(10, Math.floor(Math.log10(view * 0.25)));
    roLine.style.width = (bar / view * short).toFixed(1) + 'px';
    roTick.textContent = fmtTick(bar);
    const f = uToRail(u);
    thumb.style.transform = `translateY(${(clamp(f, 0, 1.06) * 100).toFixed(2)}cqh)`;
    fill.style.transform = `scaleY(${clamp(f, 0, 1).toFixed(4)})`;
    track.setAttribute('aria-valuenow', Math.round(clamp(f, 0, 1) * 100));
    track.setAttribute('aria-valuetext', `${spoken(view)} ${t('journey.across', 'across')}`);
    let i = 0; while (i < anchors.length - 1 && u < (anchors[i] + anchors[i + 1]) / 2) i++;
    setLevel(i);
    const heroA = 1 - clamp(p / 0.035, 0, 1);
    hero.style.opacity = heroA.toFixed(3); hero.style.visibility = heroA < 0.01 ? 'hidden' : 'visible';
    cap.style.opacity = (1 - heroA).toFixed(3); cap.style.visibility = heroA > 0.99 ? 'hidden' : 'visible';
    root.classList.toggle('moved', p > 0.002);
  }

  /* ----- loop: runs only while the journey is on screen and the tab is visible ----- */
  let slow = 0, frames = 0, fpsT = performance.now();
  window.__journey = { fps: 0, u: () => uCur, goLevel, setU: (u) => scrollToP(map.pAt(u), true) };
  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const p = scrollP(), target = targetU(now);
    uCur = reduce.matches ? target : uCur + (target - uCur) * (1 - Math.exp(-dt * 7));
    if (Math.abs(target - uCur) < 1e-5) uCur = target;
    J.frame(uCur, (now - t0) / 1000, dt, reduce.matches);
    ui(uCur, p);
    frames++;
    if (now - fpsT > 1000) {
      window.__journey.fps = frames * 1000 / (now - fpsT);
      // adaptive quality: drop the pixel ratio if the device keeps missing frames
      if (window.__journey.fps < 40) { if (++slow >= 2) { const r = J.renderer.getPixelRatio(); if (r > 0.75) { J.renderer.setPixelRatio(Math.max(0.75, r - 0.25)); J.resize(); } slow = 0; } } else slow = 0;
      frames = 0; fpsT = now;
    }
  }
  const start = () => { if (running || !visible || document.hidden) return; running = true; last = performance.now(); requestAnimationFrame(tick); };
  const stop = () => { running = false; };
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); else stop(); }).observe(stage);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new ResizeObserver(() => { J.resize(); if (!running) J.frame(uCur, 0, 0, true); }).observe(stage);
  reduce.addEventListener('change', () => { uCur = targetU(performance.now()); });
  J.resize();
  // honour a deep link like index.html#zoom=atom
  const m = /#zoom=(\w+)/.exec(location.hash);
  if (m) { const i = levels.findIndex((l) => l.id === m[1]); if (i >= 0) { uCur = anchors[i]; requestAnimationFrame(() => scrollToP(map.levelP[i], true)); } }
  start();
}

function showStatic(levels, t, nameOf, railOf) {
  const box = $('#nogl'), list = $('#noglList');
  $('#journey').classList.add('still');
  levels.forEach((L, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="ng-size"></span><div><p class="ng-rail"></p><h3></h3><p class="ng-fact"></p><a class="cap-link"></a></div>`;
    li.querySelector('.ng-size').textContent = fmt(L.view);
    li.querySelector('.ng-rail').textContent = `${i + 1} / ${levels.length} · ${railOf(i)}`;
    li.querySelector('h3').textContent = nameOf(i);
    li.querySelector('.ng-fact').textContent = L.fact;
    const a = li.querySelector('a'); a.href = L.link; a.textContent = t(L.linkKey, 'Open');
    list.append(li);
  });
  box.hidden = false;
}

function buildSources(data, t) {
  const ol = $('#srcLevels');
  if (!ol) return;
  data.levels.forEach((L, i) => {
    const li = document.createElement('li');
    const h = document.createElement('p'); h.className = 'src-h';
    h.textContent = `${t(L.railKey, L.id)}: ${fmt(L.view)} ${t('journey.across', 'across')}`;
    const d = document.createElement('p'); d.className = 'small'; d.textContent = L.drawn;
    const ul = document.createElement('ul');
    for (const id of L.sources) {
      const s = data.sources[id]; if (!s) continue;
      const it = document.createElement('li'), a = document.createElement('a');
      a.href = s.url; a.rel = 'noopener'; a.textContent = s.cite;
      it.append(a, document.createTextNode('. ' + s.supports));
      ul.append(it);
    }
    li.append(h, d, ul); ol.append(li);
  });
}
