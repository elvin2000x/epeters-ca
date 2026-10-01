// Ball-and-stick viewer for the vitamins and minerals page. Draws one structure from data/structures.json
// (RCSB CCD ideal coordinates, built by tools/build_nutrient_structures.py). Uses the vendored three.js when WebGL
// works; otherwise draws a flat SVG of the same atoms, so nothing on the page depends on 3D.
const COLORS = {
  C: '#8f8f8f', H: '#e8e8e8', O: '#e0251b', N: '#3050f8', S: '#e6c22e', P: '#ff8000',
  Fe: '#e06633', Co: '#f090a0', Mg: '#5cc400', I: '#940094', Se: '#ffa100', Mo: '#54b5b5',
};
const RADIUS = { H: 0.22, C: 0.34, N: 0.33, O: 0.32, S: 0.42, P: 0.42, Fe: 0.5, Co: 0.5, Mg: 0.48, I: 0.55, Se: 0.45, Mo: 0.52 };
const colorOf = (e) => COLORS[e] || '#b07cd8';
const radiusOf = (e) => RADIUS[e] || 0.42;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

let threeP = null;
function loadThree() {
  if (!threeP) threeP = import('../vendor/three/0.170.0/build/three.module.js');
  return threeP;
}
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Element legend and a plain-text count, used by both the 3D and the flat drawing.
export function describe(s, ui) {
  const counts = {};
  for (const a of s.atoms) counts[a[0]] = (counts[a[0]] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// Mounts a viewer into host for structure s. Returns { destroy }.
export function mountViewer(host, s, ui) {
  host.textContent = '';
  const stage = document.createElement('div');
  stage.className = 'vstage';
  stage.tabIndex = 0;
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', fill(ui['v.label'], { name: s.name ? s.name.toLowerCase() : s.code, formula: s.formula || '' }));
  const bar = document.createElement('div');
  bar.className = 'vbar';
  const mk = (txt) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = txt; return b; };
  const spinBtn = mk(ui['v.spin']);
  const resetBtn = mk(ui['v.reset']);
  const hBtn = mk(ui['v.hideH']);
  spinBtn.setAttribute('aria-pressed', 'false');
  bar.append(spinBtn, resetBtn, hBtn);
  const leg = document.createElement('ul');
  leg.className = 'vleg';
  const counts = describe(s, ui);
  for (const [e, n] of counts) {
    const li = document.createElement('li');
    const dot = document.createElement('i');
    dot.style.background = colorOf(e);
    dot.setAttribute('aria-hidden', 'true');
    li.append(dot, `${ui['el.' + e] || e} ${n}`);
    leg.append(li);
  }
  const note = document.createElement('p');
  note.className = 'small';
  note.textContent = fill(ui['v.note'], { code: s.code }) + ' ' + fill(ui['v.atoms'], { n: s.atoms.length });
  host.append(stage, bar, leg, note);

  let showH = true;
  let rotX = -0.3, rotY = 0.5;
  let spinning = !reduced();
  let api = null;
  let dead = false;

  const syncButtons = () => {
    spinBtn.textContent = spinning ? ui['v.stop'] : ui['v.spin'];
    spinBtn.setAttribute('aria-pressed', String(spinning));
    hBtn.textContent = showH ? ui['v.hideH'] : ui['v.showH'];
  };
  syncButtons();
  spinBtn.addEventListener('click', () => { spinning = !spinning; syncButtons(); api && api.kick(); });
  resetBtn.addEventListener('click', () => { rotX = -0.3; rotY = 0.5; api && api.draw(); });
  hBtn.addEventListener('click', () => { showH = !showH; syncButtons(); api && api.rebuild(); });

  // Drag and arrow keys turn the model.
  let drag = null;
  stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    rotY += (e.clientX - drag.x) * 0.01;
    rotX += (e.clientY - drag.y) * 0.01;
    drag = { x: e.clientX, y: e.clientY };
    api && api.draw();
  });
  const end = () => { drag = null; };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [0, -0.2], ArrowRight: [0, 0.2], ArrowUp: [-0.2, 0], ArrowDown: [0.2, 0] }[e.key];
    if (!k) return;
    e.preventDefault();
    rotX += k[0]; rotY += k[1];
    api && api.draw();
  });

  const visible = () => {
    const keep = s.atoms.map((a) => showH || a[0] !== 'H');
    return keep;
  };
  const size = () => s.atoms.reduce((m, a) => Math.max(m, Math.hypot(a[1], a[2], a[3])), 1);

  function flat() {
    const msg = document.createElement('p');
    msg.className = 'vmsg';
    msg.textContent = ui['v.flat'];
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-100 -75 200 150');
    svg.setAttribute('aria-hidden', 'true');
    stage.append(svg, msg);
    const R = size();
    const draw = () => {
      const keep = visible();
      const cx = Math.cos(rotX), sx = Math.sin(rotX), cy = Math.cos(rotY), sy = Math.sin(rotY);
      const p = s.atoms.map((a) => {
        const x1 = a[1] * cy + a[3] * sy, z1 = -a[1] * sy + a[3] * cy;
        const y2 = a[2] * cx - z1 * sx, z2 = a[2] * sx + z1 * cx;
        return [x1, -y2, z2];
      });
      const k = 62 / R;
      const parts = [];
      for (const [i, j] of s.bonds) {
        if (!keep[i] || !keep[j]) continue;
        parts.push([(p[i][2] + p[j][2]) / 2 - 0.01, `<line x1="${(p[i][0] * k).toFixed(1)}" y1="${(p[i][1] * k).toFixed(1)}" x2="${(p[j][0] * k).toFixed(1)}" y2="${(p[j][1] * k).toFixed(1)}" stroke="#777" stroke-width="1.6"/>`]);
      }
      s.atoms.forEach((a, i) => {
        if (!keep[i]) return;
        parts.push([p[i][2], `<circle cx="${(p[i][0] * k).toFixed(1)}" cy="${(p[i][1] * k).toFixed(1)}" r="${(radiusOf(a[0]) * k * 0.9).toFixed(1)}" fill="${colorOf(a[0])}" stroke="#333" stroke-width="0.4"/>`]);
      });
      parts.sort((a, b) => a[0] - b[0]);
      svg.innerHTML = parts.map((x) => x[1]).join('');
    };
    draw();
    return { draw, rebuild: draw, kick() {}, destroy() {} };
  }

  async function three() {
    const THREE = await loadThree();
    if (dead) return null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    stage.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    const R = size();
    const cam = new THREE.PerspectiveCamera(35, 4 / 3, 0.1, 500);
    cam.position.set(0, 0, R * 3.4 + 2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(3, 5, 8);
    scene.add(dl);
    const group = new THREE.Group();
    scene.add(group);
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const cyl = new THREE.CylinderGeometry(0.09, 0.09, 1, 10, 1);
    const mats = {};
    const mat = (c) => (mats[c] = mats[c] || new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.05 }));
    const bondMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.5 });
    const up = new THREE.Vector3(0, 1, 0);

    const build = () => {
      while (group.children.length) group.remove(group.children[0]);
      const keep = visible();
      s.atoms.forEach((a, i) => {
        if (!keep[i]) return;
        const m = new THREE.Mesh(sphere, mat(colorOf(a[0])));
        m.position.set(a[1], a[2], a[3]);
        m.scale.setScalar(radiusOf(a[0]));
        group.add(m);
      });
      for (const [i, j, o] of s.bonds) {
        if (!keep[i] || !keep[j]) continue;
        const A = new THREE.Vector3(...s.atoms[i].slice(1)), B = new THREE.Vector3(...s.atoms[j].slice(1));
        const d = B.clone().sub(A), len = d.length();
        const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
        const n = o >= 2 ? 2 : 1;
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(0.11);
        for (let k = 0; k < n; k++) {
          const m = new THREE.Mesh(cyl, bondMat);
          m.quaternion.copy(q);
          m.scale.set(n > 1 ? 0.7 : 1, len, n > 1 ? 0.7 : 1);
          m.position.copy(A).addScaledVector(d, 0.5);
          if (n > 1) m.position.addScaledVector(side, k ? 1 : -1);
          group.add(m);
        }
      }
    };
    build();

    const resize = () => {
      const w = stage.clientWidth || 400, h = stage.clientHeight || 300;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      render();
    };
    const render = () => {
      group.rotation.set(rotX, rotY, 0);
      renderer.render(scene, cam);
    };
    let raf = 0, last = 0;
    const tick = (t) => {
      raf = 0;
      if (dead || !spinning) return;
      if (last) rotY += Math.min(0.05, (t - last) / 1000 * 0.5);
      last = t;
      render();
      raf = requestAnimationFrame(tick);
    };
    const kick = () => { last = 0; if (spinning && !raf) raf = requestAnimationFrame(tick); render(); };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();
    kick();
    return {
      draw: render, rebuild() { build(); render(); }, kick,
      destroy() {
        cancelAnimationFrame(raf); ro.disconnect();
        sphere.dispose(); cyl.dispose(); bondMat.dispose();
        for (const m of Object.values(mats)) m.dispose();
        renderer.dispose();
      },
    };
  }

  if (hasWebGL()) {
    three().then((a) => { if (a) api = a; }).catch((e) => {
      console.warn('3D did not start, drawing flat', e);
      if (!dead) api = flat();
    });
  } else {
    spinning = false;
    syncButtons();
    spinBtn.hidden = true;
    api = flat();
  }

  return { destroy() { dead = true; api && api.destroy(); host.textContent = ''; } };
}
