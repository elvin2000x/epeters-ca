// Heat vs the bonds of life: one temperature slider drives a live energy bar (heat energy RT against real bond
// energies) and three illustrative models (DNA melting, a protein unfolding, water changing phase).
// ES module: mount(containerEl, options) builds the page inside containerEl; unmount() removes it.
// Words and numbers: heat.json. Citations: sources.json. Models: sims.js. Drawing: render.js (three.js or flat 2D).
// options: { noGL: true } forces the flat drawings (also ?nogl=1). Zero external requests.

import { Frame, dnaSim, proteinSim, waterSim } from './sims.js';
import { webglOK, Renderer3D, Renderer2D } from './render.js';

const HERE = new URL('./', import.meta.url);
let inst = null;

export async function mount(containerEl, options = {}) {
  if (inst) unmount();
  inst = await create(containerEl, options);
  return inst.api;
}
export function unmount() { if (inst) { inst.destroy(); inst = null; } }

const fill = (s, o = {}) => String(s == null ? '' : s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
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
// "10^-23" and "e^(-E/RT)" become superscripts; everything else stays plain text
function sup(s) {
  const out = document.createDocumentFragment();
  String(s).split(/(\^\([^)]*\)|\^-?[\w.]+)/).forEach((part) => {
    if (part.startsWith('^')) out.append(h('sup', { text: part.slice(1).replace(/^\((.*)\)$/, '$1') }));
    else if (part) out.append(part);
  });
  return out;
}
const num = (v, d) => {
  const s = v.toFixed(d);
  return s.startsWith('-') ? '−' + s.slice(1) : s;
};
const sig = (v) => (v >= 100 ? Math.round(v).toLocaleString('en') : v >= 10 ? v.toFixed(0) : v.toFixed(1));

async function create(root, opts) {
  const [J, SRC] = await Promise.all(['heat.json', 'sources.json'].map((f) => fetch(new URL(f, HERE)).then((r) => { if (!r.ok) throw new Error(f); return r.json(); })));
  const U = J.ui, D = J.data, C = D.constants, S = SRC.sources;
  const srcKeys = Object.keys(S);
  const disposers = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); disposers.push(() => t.removeEventListener(ev, fn, o)); };

  const cite = (keys) => {
    if (!keys || !keys.length) return null;
    const span = h('span', { class: 'ht-cite' }, h('span', { class: 'ht-sr', text: U.srcLabel + ' ' }));
    keys.forEach((k, i) => {
      const n = srcKeys.indexOf(k) + 1;
      if (i) span.append(' ');
      span.append(h('a', { href: '#src-' + k, title: S[k] ? S[k].cite : k, text: '[' + n + ']' }));
    });
    return span;
  };

  // ---------- physics (formulas shown on the page) ----------
  const RT = (t) => C.R.v * (t + 273.15) / 1000;                 // kJ/mol
  const kT = (t) => C.k.v * (t + 273.15);                          // J per molecule
  const ionB = D.bonds.find((b) => b.id === 'ion');
  const ionVac = C.NA.v * C.e.v * C.e.v / (4 * Math.PI * C.ep0.v * ionB.calc.rNm * 1e-9) / 1000; // kJ/mol
  const ionWat = ionVac / ionB.calc.kappa;
  const bonds = D.bonds.map((b) => ({ ...b, lo: b.lo === 'calc' ? ionWat : b.lo }));
  const LMIN = Math.log10(0.03), LMAX = Math.log10(1500);
  const pos = (e) => ((Math.log10(e) - LMIN) / (LMAX - LMIN)) * 100;
  const odds = (e, t) => {
    const p = Math.exp(-e / RT(t));
    if (p > 0.5) return U.oddsEasy;
    const n = 1 / p;
    if (n < 1e4) return fill(U.oddsOne, { n: sig(n) });
    return fill(U.oddsPow, { p: Math.floor(Math.log10(n)) });
  };

  // ---------- page ----------
  root.classList.add('ht');
  const live = h('p', { class: 'ht-sr', 'aria-live': 'polite', role: 'status' });
  const head = h('header', { class: 'ht-head ht-wrap' },
    h('p', { class: 'ht-eyebrow', text: U.eyebrow }), h('h1', { text: U.title }), h('p', { class: 'ht-lede', text: U.lede }));

  // controls (sticky)
  const sl = D.slider;
  const slider = h('input', { type: 'range', id: 'ht-temp', min: sl.min, max: sl.max, step: sl.step, value: sl.start, 'aria-describedby': 'ht-help' });
  const bigT = h('output', { class: 'ht-big', for: 'ht-temp' });
  const subT = h('span', { class: 'ht-subt' });
  const here = h('span', { class: 'ht-here' });
  const ticks = h('div', { class: 'ht-ticks', 'aria-hidden': 'true' });
  const span = sl.max - sl.min, pct = (t) => ((t - sl.min) / span) * 100;
  D.marks.forEach((m) => {
    const w = Math.max(0.6, pct(m.hi) - pct(m.lo));
    ticks.append(h('span', { class: 'ht-tick ht-tick-' + m.id, style: `left:${pct(m.lo)}%;width:${w}%`, title: m.text }));
  });
  const presets = h('div', { class: 'ht-presets', role: 'group', 'aria-label': U.presetsLabel });
  const presetBtns = D.presets.map((p) => {
    const b = h('button', { type: 'button', class: 'ht-chip', 'aria-pressed': 'false', text: p.label, onclick: () => setT(p.t, true) });
    presets.append(b); return [p, b];
  });
  const pauseBtn = h('button', { type: 'button', class: 'ht-chip ht-pause', 'aria-pressed': 'false', text: U.pause });
  const controls = h('section', { class: 'ht-controls', 'aria-label': U.sliderLabel },
    h('div', { class: 'ht-wrap ht-ctl' },
      h('div', { class: 'ht-read' }, h('label', { for: 'ht-temp', class: 'ht-label', text: U.sliderLabel }), bigT, subT, here),
      h('div', { class: 'ht-slide' }, slider, ticks),
      h('p', { id: 'ht-help', class: 'ht-help', text: U.sliderHelp }),
      h('div', { class: 'ht-row' }, presets, pauseBtn)));

  // energy bar
  const rows = bonds.map((b) => {
    const bar = h('span', { class: 'ht-bar ht-bar-' + b.id });
    const mk = b.mark ? h('span', { class: 'ht-bmark', style: `left:${pos(b.mark)}%` }) : null;
    const rt = h('span', { class: 'ht-rt' });
    const times = h('span', { class: 'ht-times' }), od = h('span', { class: 'ht-odds' });
    const valTxt = b.lo === b.hi ? `${sig(b.lo)} kJ/mol` : `${b.lo < 1 ? b.lo.toFixed(b.id === 'ion' ? 1 : 2) : sig(b.lo)} to ${sig(b.hi)} kJ/mol`;
    bar.style.left = pos(b.lo) + '%'; bar.style.width = Math.max(1.2, pos(b.hi) - pos(b.lo)) + '%';
    const row = h('li', { class: 'ht-erow' },
      h('div', { class: 'ht-ename' }, h('strong', { text: b.name }), ' ', h('span', { class: 'ht-eval', text: valTxt }), h('small', { text: b.detail }), cite(b.s)),
      h('div', { class: 'ht-track', 'aria-hidden': 'true' }, bar, mk, rt),
      h('div', { class: 'ht-enum' }, times, od));
    return { b, row, rt, times, od };
  });
  const axis = h('div', { class: 'ht-axis', 'aria-hidden': 'true' });
  [0.1, 1, 10, 100, 1000].forEach((v) => axis.append(h('span', { style: `left:${pos(v)}%`, text: String(v) })));
  const rtLine = h('p', { class: 'ht-rtline' });
  const mathRT = h('span'), mathKT = h('span'), mathKE = h('span');
  const math = h('details', { class: 'ht-math' }, h('summary', { text: U.mathTitle }),
    h('ul', {}, h('li', {}, mathRT, ' ', cite(C.R.s)), h('li', {}, mathKT, ' ', cite(C.k.s)), h('li', {}, mathKE, ' ', cite(['os-chem-9-5'])),
      h('li', {}, sup(U.mathOdds), ' ', cite(['os-chem-12-5'])),
      h('li', {}, sup(fill(U.mathIon, { vac: ionVac.toFixed(0), kappa: ionB.calc.kappa, wat: ionWat.toFixed(1), r: ionB.calc.rNm })), ' ', cite(['nist-na', 'nist-e', 'nist-ep0', 'os-up2-8-5', 'wiki-saltbridge']))));
  const energy = h('section', { class: 'ht-card ht-wrap ht-energy', 'aria-labelledby': 'ht-eh' },
    h('h2', { id: 'ht-eh', text: U.energyTitle }), h('p', { class: 'ht-note', text: U.energyLede }), rtLine,
    h('ul', { class: 'ht-erows' }, rows.map((r) => r.row)),
    h('div', { class: 'ht-axiswrap' }, h('span', {}), axis, h('span', {})), h('p', { class: 'ht-axislabel', text: U.axis }), math);

  // scenes
  let gl = !opts.noGL && webglOK();
  const noglNote = h('p', { class: 'ht-note ht-nogl', text: U.nogl, hidden: true });
  const sceneDefs = [
    { id: 'dna', sim: dnaSim(D.dna), href: '../molecules/#dna', explain: J.scenes.dna.explain, src: D.dna.s },
    { id: 'protein', sim: proteinSim(D.protein), href: '../molecules/#lysozyme', explain: J.scenes.protein.explain, src: D.protein.s },
    { id: 'water', sim: waterSim(D.water), href: '../molecules/#water', explain: J.scenes.water.explain, src: D.water.s },
  ];
  const panels = sceneDefs.map((d) => {
    const stage = h('div', { class: 'ht-stage', role: 'img', 'aria-label': U[d.id + 'Alt'] });
    const over = h('div', { class: 'ht-over', 'aria-hidden': 'true' });
    if (d.id === 'dna') {
      over.append(h('span', { class: 'ht-tag ht-tag-l', text: fill(U.dnaBlockA, { t: D.dna.tmA }) }), h('span', { class: 'ht-tag ht-tag-r', text: fill(U.dnaBlockB, { t: D.dna.tmB }) }));
    }
    if (d.id === 'protein') over.append(h('span', { class: 'ht-tag ht-tag-l', text: fill(U.proteinNote, { t: D.protein.td }) }));
    over.append(h('span', { class: 'ht-tag ht-tag-ill', text: U.illustrative }));
    const status = h('p', { class: 'ht-status' });
    const egg = d.id === 'protein' ? h('button', { type: 'button', class: 'ht-chip', text: U.freshEgg, hidden: true }) : null;
    const why = h('details', { class: 'ht-why' }, h('summary', { text: U.why }),
      h('ul', {}, d.explain.map((x) => h('li', {}, x.t, ' ', cite(x.s)))));
    const fig = h('article', { class: 'ht-scene ht-scene-' + d.id, 'aria-labelledby': 'ht-st-' + d.id },
      h('h3', { id: 'ht-st-' + d.id, text: U[d.id + 'Title'] }),
      h('div', { class: 'ht-stagewrap' }, stage, over), status,
      h('div', { class: 'ht-row' }, egg, h('a', { class: 'ht-link', href: d.href, text: U.seeReal })), why);
    const p = { ...d, stage, status, egg, fig, frame: new Frame(...d.sim.max), yaw: 0, pitch: d.id === 'dna' ? 0.15 : 0.1, visible: true, last: '' };
    if (egg) on(egg, 'click', () => { p.sim.reset(); kick(); });
    return p;
  });
  const scenesSec = h('section', { class: 'ht-wrap ht-scenes', 'aria-labelledby': 'ht-sh' },
    h('h2', { id: 'ht-sh', text: U.scenesTitle }), h('p', { class: 'ht-note', text: U.scenesLede }), noglNote,
    h('div', { class: 'ht-grid' }, panels.map((p) => p.fig)));

  // landmarks
  const lmList = h('ul', { class: 'ht-lm' }, D.marks.map((m) => h('li', {},
    h('button', { type: 'button', class: 'ht-lmbtn', onclick: () => { setT(Math.round(((m.lo + m.hi) / 2) * 2) / 2, true); slider.focus(); }, text: m.text }), ' ', cite(m.s))));
  const lmSec = h('section', { class: 'ht-card ht-wrap', 'aria-labelledby': 'ht-lh' }, h('h2', { id: 'ht-lh', text: U.landmarksTitle }), h('p', { class: 'ht-note', text: U.landmarksLede }), lmList);

  // learning layer
  const L = J.learn;
  const learn = h('section', { class: 'ht-card ht-wrap ht-learn', 'aria-labelledby': 'ht-kh' },
    h('h2', { id: 'ht-kh', text: U.learnTitle }),
    h('ol', { class: 'ht-ideas' }, L.keyIdeas.map((k) => h('li', {}, k.t, ' ', cite(k.s)))),
    h('h3', { text: U.mythTitle }),
    h('ul', { class: 'ht-myths' }, L.misconceptions.map((m) => h('li', {},
      h('p', {}, h('strong', { text: U.myth + ': ' }), m.myth), h('p', {}, h('strong', { text: U.truth + ': ' }), m.truth, ' ', cite(m.s))))),
    h('h3', { text: U.vocabTitle }),
    h('dl', { class: 'ht-vocab' }, L.vocab.map((v) => [h('dt', { text: v.term }), h('dd', {}, v.definition, ' ', cite(v.s))])));
  const links = h('section', { class: 'ht-wrap ht-links', 'aria-labelledby': 'ht-xh' }, h('h2', { id: 'ht-xh', text: U.linksTitle }),
    h('ul', {}, J.links.map((l) => h('li', {}, h('a', { href: l.href }, h('strong', { text: l.label }), h('span', { text: l.detail }))))));
  const sources = h('section', { class: 'ht-wrap ht-sources', 'aria-labelledby': 'ht-srh' }, h('h2', { id: 'ht-srh', text: U.sourcesTitle }), h('p', { class: 'ht-note', text: U.sourcesLede }),
    h('ol', {}, srcKeys.map((k) => h('li', { id: 'src-' + k }, S[k].cite, ' ', h('a', { href: S[k].url, rel: 'noopener', text: S[k].doi ? 'doi:' + S[k].doi : S[k].url.replace(/^https?:\/\//, '') }),
      h('small', { text: ' ' + S[k].checked })))));

  root.replaceChildren(head, controls, energy, scenesSec, lmSec, learn, links, sources, live);

  // renderers
  const makeRen = (p) => {
    if (gl) { try { return new Renderer3D(p.stage, p.sim.view, p.sim.max); } catch (e) { gl = false; } }
    return new Renderer2D(p.stage, p.sim.view);
  };
  panels.forEach((p) => { p.ren = makeRen(p); });
  if (!gl) { noglNote.hidden = false; panels.forEach((p) => { if (p.ren instanceof Renderer3D) { p.ren.destroy(); p.ren = new Renderer2D(p.stage, p.sim.view); } }); }

  const isLight = () => {
    const t = document.documentElement.dataset.theme;
    return t === 'light' || (t !== 'dark' && !matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const applyTheme = () => { panels.forEach((p) => p.ren.setLight(isLight())); kick(); };
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  disposers.push(() => themeObs.disconnect());
  on(matchMedia('(prefers-color-scheme: dark)'), 'change', applyTheme);

  // drag to turn a model (vertical swipes still scroll the page on phones)
  panels.forEach((p) => {
    let drag = null;
    on(p.stage, 'pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: p.yaw, pitch: p.pitch }; });
    on(p.stage, 'pointermove', (e) => {
      if (!drag) return;
      p.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      p.pitch = Math.max(-0.7, Math.min(0.7, drag.pitch + (e.clientY - drag.y) * 0.006));
      kick();
    });
    const end = () => { drag = null; };
    on(p.stage, 'pointerup', end); on(p.stage, 'pointercancel', end); on(p.stage, 'pointerleave', end);
  });

  // ---------- state ----------
  let T = sl.start, paused = false, raf = 0, settle = 0, last = 0, clock = 0, statusAt = 0, liveTimer = 0;
  const near = (t) => {
    let best = null, bd = 1e9;
    D.marks.forEach((m) => { const d = t < m.lo ? m.lo - t : t > m.hi ? t - m.hi : 0; if (d < bd) { bd = d; best = m; } });
    return bd <= 0.6 ? best : null;
  };
  function setT(t, announce) {
    T = Math.max(sl.min, Math.min(sl.max, t));
    slider.value = T;
    const m = near(T);
    bigT.textContent = num(T, 1) + ' °C';
    subT.textContent = fill(U.kelvin, { k: (T + 273.15).toFixed(2) }) + ' · ' + fill(U.fahrenheit, { f: num(T * 9 / 5 + 32, 1) });
    here.textContent = m ? fill(U.here, { name: m.name }) : U.nowhere;
    slider.setAttribute('aria-valuetext', num(T, 1) + ' °C' + (m ? ', ' + m.name : ''));
    presetBtns.forEach(([p, b]) => b.setAttribute('aria-pressed', String(p.t === T)));
    const rt = RT(T), x = pos(rt);
    rtLine.textContent = fill(U.rtLabel, { rt: rt.toFixed(2) });
    rows.forEach((r) => {
      r.rt.style.left = x + '%';
      r.times.textContent = r.b.lo === r.b.hi ? fill(U.times, { x: sig(r.b.lo / rt) }) : fill(U.timesRange, { a: sig(r.b.lo / rt), b: sig(r.b.hi / rt) });
      r.od.replaceChildren(sup(fill(U.odds, { o: r.b.lo === r.b.hi ? odds(r.b.lo, T) : odds(r.b.lo, T) + ' to ' + odds(r.b.hi, T) })));
    });
    mathRT.textContent = fill(U.mathRT, { k: (T + 273.15).toFixed(2), rt: rt.toFixed(3) });
    mathKT.replaceChildren(sup(fill(U.mathKT, { k: (T + 273.15).toFixed(2), kt: (kT(T) * 1e21).toFixed(3) })));
    mathKE.textContent = fill(U.mathKE, { ke: (1.5 * rt).toFixed(2) });
    kick();
    if (announce) {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => {
        live.textContent = fill(U.live, { t: num(T, 1), rt: rt.toFixed(2), dna: statusOf(panels[0]), protein: statusOf(panels[1]), water: statusOf(panels[2]) });
      }, 1600);
    }
  }
  function statusOf(p) {
    const i = p.sim.info();
    if (p.id === 'dna') return fill(U[i.state === 'closed' ? 'dnaClosed' : i.state === 'all' ? 'dnaAll' : 'dnaSome'], i);
    if (p.id === 'protein') return fill(U[{ folded: 'proteinFolded', melting: 'proteinMelting', cooked: 'proteinCooked', cookedCool: 'proteinCookedCool' }[i.state]], i);
    return fill(U[{ ice: 'waterIce', liquid: 'waterLiquid', steam: 'waterSteam' }[i.state]], i);
  }
  function paintStatus() {
    panels.forEach((p) => {
      const s = statusOf(p);
      if (s !== p.last) { p.status.textContent = s; p.last = s; }
      if (p.egg) p.egg.hidden = !p.sim.info().cooked;
    });
  }

  const motionOn = () => !paused && !reduceMotion();
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    const moving = motionOn();
    if (moving) clock += dt;
    panels.forEach((p) => {
      if (!p.visible) return;
      p.sim.step(dt, T, !moving);
      p.sim.build(p.frame);
      const sway = moving && p.id !== 'dna' ? Math.sin(clock * 0.25) * 0.4 : 0;
      p.ren.draw(p.frame, p.yaw + sway, p.pitch);
    });
    if (now - statusAt > 250) { statusAt = now; paintStatus(); }
    settle -= dt;
    if (!document.hidden && (moving || settle > 0)) raf = requestAnimationFrame(tick);
  }
  function kick() {
    settle = 0.6;
    if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { const p = panels.find((q) => q.stage === e.target); if (p) p.visible = e.isIntersecting; });
    kick();
  });
  panels.forEach((p) => io.observe(p.stage));
  disposers.push(() => io.disconnect());
  const ro = new ResizeObserver(() => { panels.forEach((p) => p.ren.resize()); kick(); });
  panels.forEach((p) => ro.observe(p.stage));
  disposers.push(() => ro.disconnect());
  on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
  on(matchMedia('(prefers-reduced-motion: reduce)'), 'change', kick);

  on(slider, 'input', () => setT(parseFloat(slider.value), true));
  on(slider, 'keydown', (e) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); setT(T + (e.key === 'PageUp' ? 5 : -5), true); }
  });
  on(pauseBtn, 'click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? U.play : U.pause;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    kick();
  });

  applyTheme();
  setT(sl.start, false);
  paintStatus();

  const api = { setTemperature: (t) => setT(t, true), get temperature() { return T; } };
  return {
    api,
    destroy() {
      cancelAnimationFrame(raf); clearTimeout(liveTimer);
      disposers.forEach((f) => f());
      panels.forEach((p) => p.ren.destroy());
      root.replaceChildren(); root.classList.remove('ht');
    },
  };
}
