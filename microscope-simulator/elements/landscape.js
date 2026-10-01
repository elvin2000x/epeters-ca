// 3D "property landscape" of the periodic table (three.js, served from ../vendor/three/). Each element is a column
// standing where it sits in the table; its height shows one property from PubChem (element-extras.json). Missing
// values are flat, faded tiles (never guessed). Switching property morphs the columns in a wave across the table.
// Loaded only when the visitor picks "3D landscape"; the HTML table stays the accessible default.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MAXH = 4.2, MINH = 0.12, GAPH = 0.03, TILE = 0.94, STEP = 1.08;

export function createLandscape({ stage, tip, legend, X, ELS, grid, pos, T, fmt, onPick, keyMove }) {
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  camera.position.set(0, 20, 13);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0.9);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.38;
  controls.minDistance = 7;
  controls.maxDistance = 48;
  controls.update();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445555, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 60 });
  sun.shadow.radius = 4;
  scene.add(hemi, sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const geo = new THREE.BoxGeometry(TILE, 1, TILE);
  geo.translate(0, 0.5, 0);
  const cols = new Map(); // z -> column record
  const nRows = grid.length;
  for (const e of ELS) {
    const [r, c] = pos.get(e.z);
    const extra = r >= 7 ? 0.45 : 0;
    const x = (c - 8.5) * STEP, zz = (r - (nRows - 1) / 2) * STEP + extra;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const side = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, transparent: true });
    const top = new THREE.MeshStandardMaterial({ roughness: 0.6, map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
    mesh.position.set(x, 0, zz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.y = GAPH;
    mesh.userData.z = e.z;
    scene.add(mesh);
    cols.set(e.z, { e, mesh, side, top, canvas, tex, r, c, h: GAPH, from: GAPH, to: GAPH, t0: 0, delay: 0, value: null, lit: true, op: 1, opTo: 1 });
  }

  /* ---------- colours (theme and colour mode aware) ---------- */
  let colourMode = 'category';
  function drawTop(col) {
    const { e, canvas } = col;
    const g = canvas.getContext('2d');
    g.fillStyle = col.bg;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = css('--tile-ink');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 22px "IBM Plex Mono", monospace';
    g.fillText(String(e.z), 64, 26);
    g.font = '700 56px "IBM Plex Sans", system-ui, sans-serif';
    g.fillText(e.symbol, 64, 76);
    col.tex.needsUpdate = true;
  }
  // dark mode: the same category colours under softer light, so the tiles do not glare against the dark page
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  function recolour() {
    const dark = isDark();
    hemi.intensity = dark ? 1.05 : 1.6;
    sun.intensity = dark ? 1.45 : 2.2;
    const table = document.querySelector('table.pt');
    colourMode = table?.classList.contains('by-block') ? 'block' : 'category';
    for (const col of cols.values()) {
      const v = colourMode === 'block' ? `--blk-${col.e.block}` : `--c${Math.max(0, X.categories.indexOf(X.elements[col.e.symbol]?.category))}`;
      col.bg = css(v);
      col.side.color.set(col.bg).multiplyScalar(dark ? 0.8 : 1);
      col.top.color.setScalar(dark ? 0.82 : 1);
      drawTop(col);
    }
    accent.set(css('--accent'));
    want();
  }
  const accent = new THREE.Color();
  const mo = new MutationObserver(recolour);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolour);

  /* ---------- heights ---------- */
  let prop = null;
  function setProp(key, opts = {}) {
    prop = key;
    const P = X.properties[key];
    const vals = ELS.map((e) => X.elements[e.symbol]?.props?.[key]).filter((v) => v != null && v > 0);
    const f = P.scale === 'log' ? Math.log10 : (v) => v;
    const lo = Math.min(...vals.map(f)), hi = Math.max(...vals.map(f));
    const now = performance.now();
    for (const col of cols.values()) {
      const v = X.elements[col.e.symbol]?.props?.[key];
      col.value = v ?? null;
      const target = v == null || !(v > 0) ? GAPH : MINH + ((f(v) - lo) / (hi - lo || 1)) * (MAXH - MINH);
      col.from = col.h; col.to = target; col.t0 = now; col.delay = opts.instant || reduce() ? 0 : (col.c + col.r) * 22;
      if (opts.instant || reduce()) { col.h = col.from = target; }
    }
    renderLegend(key, vals.length);
    applyOpacity();
    want(1600);
  }
  function renderLegend(key, n) {
    const P = X.properties[key];
    const have = ELS.map((e) => [e, X.elements[e.symbol]?.props?.[key]]).filter(([, v]) => v != null);
    have.sort((a, b) => a[1] - b[1]);
    const [lo, hi] = [have[0], have[have.length - 1]];
    const show = ([e, v]) => `${e.symbol} ${fmt(v)}`;
    const mk = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
    const kids = [
      mk('span', '', null), mk('span', 'bar'), mk('span', '', null), mk('span', 'unit', P.unit),
      mk('span', 'note', T('land.gaps', { n: ELS.length - have.length }) + (P.scale === 'log' ? ' ' + T('land.log') : '') + ' ' + T('land.source')),
    ];
    kids[0].append(T('land.min') + ': ', mk('b', '', show(lo)));
    kids[2].append(T('land.max') + ': ', mk('b', '', show(hi)));
    legend.replaceChildren(mk('b', '', P.label), ...kids);
    stage.setAttribute('aria-label', T('land.alt', { prop: `${P.label.toLowerCase()} in ${P.unit}`, top: `${hi[0].name}, ${fmt(hi[1])}`, bottom: `${lo[0].name}, ${fmt(lo[1])}` }));
    void n;
  }

  /* ---------- light-up (Elements of life, molecule) and selection ---------- */
  let litSet = null, selected = null, hovered = null;
  function light(map) { litSet = map ? new Set(map.keys()) : null; applyOpacity(); want(900); }
  function applyOpacity() {
    for (const col of cols.values()) {
      const gap = col.value == null || !(col.value > 0);
      col.lit = !litSet || litSet.has(col.e.symbol);
      col.opTo = !col.lit ? 0.12 : gap ? 0.4 : 1;
      col.mesh.castShadow = col.lit && !gap;
    }
  }
  function select(z) { selected = z; want(); }

  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...cols.values()].map((c) => c.mesh), false)[0];
    return hit ? hit.object.userData.z : null;
  }
  function showTip(z, x, y) {
    if (!z) { tip.hidden = true; return; }
    const col = cols.get(z), P = X.properties[prop];
    tip.replaceChildren();
    const b = document.createElement('b'); b.textContent = col.e.symbol;
    tip.append(b, ` ${col.e.name}: ${col.value == null ? T('land.noValue') : `${fmt(col.value)} ${P.unit}`}`);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    tip.hidden = false;
  }
  function tipAt(z) {
    const col = cols.get(z);
    const v = new THREE.Vector3(col.mesh.position.x, col.h + 0.2, col.mesh.position.z).project(camera);
    const r = stage.getBoundingClientRect();
    showTip(z, ((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height);
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointermove', (ev) => {
    const z = pick(ev);
    if (z !== hovered) { hovered = z; want(); }
    renderer.domElement.style.cursor = z ? 'pointer' : 'grab';
    const r = stage.getBoundingClientRect();
    showTip(z, ev.clientX - r.left, ev.clientY - r.top);
  });
  renderer.domElement.addEventListener('pointerleave', () => { hovered = null; tip.hidden = true; want(); });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return;
    const z = pick(ev);
    if (z) onPick(z);
  });
  stage.addEventListener('keydown', (ev) => {
    if (ev.target !== stage) return;
    const z = selected || 1;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(z, { scroll: false }); return; }
    const next = keyMove(z, ev);
    if (next == null) return;
    ev.preventDefault();
    onPick(next, { scroll: false });
    stage.focus({ preventScroll: true });
    tipAt(next);
  });
  stage.addEventListener('blur', () => { tip.hidden = true; });
  controls.addEventListener('change', () => want());
  // once the visitor has turned or zoomed the view, resizing (rotating a phone, a side panel opening) keeps their camera
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });

  /* ---------- render loop: runs only while something moves ---------- */
  let until = 0, running = false;
  function want(ms = 120) { until = Math.max(until, performance.now() + ms); if (!running) { running = true; requestAnimationFrame(tick); } }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tmp = new THREE.Color();
  function tick(now) {
    let moving = false;
    for (const col of cols.values()) {
      if (col.h !== col.to) {
        const t = Math.min(1, Math.max(0, (now - col.t0 - col.delay) / 800));
        col.h = t >= 1 ? col.to : col.from + (col.to - col.from) * ease(t);
        moving = true;
      }
      col.mesh.scale.y = col.h;
      if (Math.abs(col.op - col.opTo) > 0.01) { col.op += (col.opTo - col.op) * 0.14; moving = true; } else col.op = col.opTo;
      col.side.opacity = col.top.opacity = col.op;
      col.side.depthWrite = col.top.depthWrite = col.op > 0.9;
      const glow = col.e.z === selected ? 0.55 : col.e.z === hovered ? 0.3 : litSet && col.lit ? 0.14 : 0;
      tmp.copy(accent).multiplyScalar(glow);
      col.side.emissive.copy(tmp);
      col.top.emissive.copy(tmp);
    }
    controls.update();
    renderer.render(scene, camera);
    if (moving || now < until) requestAnimationFrame(tick); else running = false;
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // fit the whole table: narrow screens pull the camera back
    const back = w < 600 ? 1.55 : w < 900 ? 1.2 : 1;
    if (!userMoved) camera.position.set(0, 20 * back, 13 * back);
    camera.updateProjectionMatrix();
    controls.update();
    want();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  return { setProp, recolour, light, select, resize, get renderer() { return renderer; } };
}
