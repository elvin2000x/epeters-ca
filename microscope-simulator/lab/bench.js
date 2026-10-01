// Molecule lab bench: the three.js workbench. Draws the model from chem.js, relaxes it toward VSEPR-like shapes,
// and turns pointer gestures into requests (pick an atom, bond two atoms, tap a bond, drop an atom in the bin).
// It never changes the model itself; lab.js owns the model and calls sync() after every change.
//
// The shape model (simplified, labelled on screen): every bond is a spring, and the regions of electron density
// around each atom (bonded neighbours plus lone pairs, a double or triple bond counting once) push each other apart
// like charges on a sphere, lone pairs a little harder than bonds. That is the VSEPR idea from OpenStax Chemistry 2e
// 7.6; the push strengths and spring lengths are drawing choices, not measured values.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bondsOf, other, regions, atomById } from './chem.js';

const ORDER_SHRINK = [1, 1, 0.87, 0.78]; // drawn shorter for double and triple bonds (os-chem-7-5); factors are a drawing choice
const BOND_SCALE = 1.55;                // bench units per 100 pm of summed covalent radii (cordero-2008), stretched for ball-and-stick
const W_BB = 1.0, W_LB = 1.3, W_LL = 1.6; // region pushes: lone pairs push harder (os-chem-7-6, qualitative)

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

export function createBench(container, opts) {
  const { E, onPick, onBondRequest, onBondTap, onTrash, isTrash, check } = opts;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = reduceMQ.matches;
  reduceMQ.addEventListener('change', () => { reduce = reduceMQ.matches; controls.enableDamping = !reduce; });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.className = 'bench-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.position.set(0, 0, 16);
  scene.add(camera);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445555, 1.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 8);
  camera.add(key);

  // our pointer handler is registered BEFORE OrbitControls so it can switch the controls off when an atom is grabbed
  canvas.addEventListener('pointerdown', onDown);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduce;
  controls.dampingFactor = 0.12;
  controls.minDistance = 4;
  controls.maxDistance = 60;
  controls.enablePan = true;

  const geoSphere = new THREE.SphereGeometry(1, 32, 20);
  const geoDot = new THREE.SphereGeometry(1, 10, 8);
  const geoCyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
  const geoLobe = new THREE.SphereGeometry(1, 16, 12);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const theme = { bond: new THREE.Color('#8a9794'), ion: new THREE.Color('#0b7469'), halo: new THREE.Color('#0b7469'), bad: new THREE.Color('#c0392b'), need: new THREE.Color('#d08a00'), lobe: new THREE.Color('#7b5fd0'), dark: false };
  const bondMat = new THREE.MeshStandardMaterial({ color: theme.bond, roughness: 0.55, metalness: 0.05 });
  const ionMat = new THREE.MeshStandardMaterial({ color: theme.ion, roughness: 0.6 });
  const lobeMat = new THREE.MeshStandardMaterial({ color: theme.lobe, transparent: true, opacity: 0.28, depthWrite: false });
  const haloMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.BackSide });

  const atoms = new Map(); // id -> { el, p, v, mesh, label, halo, need, lobes:[{dir, mesh}], r }
  const bonds = new Map(); // key -> { bond, group, hit }
  let model = { atoms: [], bonds: [] };
  let selected = null, showLobes = false, celebrateUntil = 0;
  const labelCache = new Map();

  const radiusOf = (el) => 0.3 + (E[el].radius / 100) * 0.3;
  const restLength = (b) => {
    const ra = E[atomById(model, b.a).el].radius, rb = E[atomById(model, b.b).el].radius;
    return BOND_SCALE * ((ra + rb) / 100) * (b.ionic ? 1.15 : ORDER_SHRINK[b.order]);
  };

  function labelTexture(el, charge) {
    const k = `${el}|${charge}|${theme.dark}`;
    if (labelCache.has(k)) return labelCache.get(k);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const col = new THREE.Color(E[el].color);
    const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    g.fillStyle = lum > 0.5 ? '#111a19' : '#ffffff';
    g.font = '700 58px "IBM Plex Sans", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(el, 64, 68);
    if (charge) {
      g.font = '700 34px "IBM Plex Sans", system-ui, sans-serif';
      const s = Math.abs(charge) === 1 ? (charge > 0 ? '+' : '−') : `${Math.abs(charge)}${charge > 0 ? '+' : '−'}`;
      g.fillText(s, 100, 28);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    labelCache.set(k, t);
    return t;
  }

  /* ---------------- model sync ---------------- */
  function sync(m, place) {
    model = m;
    const ids = new Set(m.atoms.map((a) => a.id));
    for (const [id, a] of atoms) if (!ids.has(id)) { scene.remove(a.mesh, a.label, a.halo, a.need, ...a.lobes.map((l) => l.mesh)); atoms.delete(id); }
    for (const a of m.atoms) {
      if (atoms.has(a.id)) continue;
      const r = radiusOf(a.el);
      const mesh = new THREE.Mesh(geoSphere, new THREE.MeshStandardMaterial({ color: new THREE.Color(E[a.el].color), roughness: 0.42, metalness: 0.04 }));
      mesh.scale.setScalar(r);
      mesh.userData.atomId = a.id;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(a.el, 0), depthWrite: false, transparent: true }));
      label.scale.setScalar(r * 1.25);
      label.renderOrder = 2;
      const halo = new THREE.Mesh(geoSphere, haloMat(theme.halo, 0.35));
      halo.scale.setScalar(r * 1.35); halo.visible = false;
      const need = new THREE.Mesh(geoSphere, haloMat(theme.need, 0.22));
      need.scale.setScalar(r * 1.22); need.visible = false;
      const p = place && place.id === a.id && place.pos ? place.pos.clone() : spawnPoint(a.id, place);
      const rec = { el: a.el, p, v: new THREE.Vector3(), mesh, label, halo, need, lobes: [], r, charge: 0 };
      atoms.set(a.id, rec);
      scene.add(mesh, label, halo, need);
    }
    const keys = new Set();
    for (const b of m.bonds) {
      const k = b.a < b.b ? `${b.a}-${b.b}` : `${b.b}-${b.a}`;
      keys.add(k);
      let rec = bonds.get(k);
      if (!rec) {
        const hit = new THREE.Mesh(geoCyl, hitMat);
        const group = new THREE.Group();
        scene.add(group, hit);
        rec = { group, hit, sig: '' };
        bonds.set(k, rec);
      }
      rec.bond = b;
      rec.hit.userData.bond = b;
      const sig = `${b.order}|${b.ionic}`;
      if (rec.sig !== sig) { buildBondGroup(rec, b); rec.sig = sig; }
    }
    for (const [k, rec] of bonds) if (!keys.has(k)) { scene.remove(rec.group, rec.hit); bonds.delete(k); }
    // charges, need halos, lone pair lobes
    for (const a of m.atoms) {
      const rec = atoms.get(a.id);
      let ion = 0;
      for (const b of bondsOf(m, a.id)) if (b.ionic) ion += b.order;
      const charge = ion ? (E[a.el].metal ? ion : -ion) : 0;
      if (charge !== rec.charge) { rec.charge = charge; rec.label.material.map = labelTexture(a.el, charge); rec.label.material.needsUpdate = true; }
      const lp = regions(E, m, a.id).lone;
      const lpWanted = bondsOf(m, a.id).some((b) => !b.ionic) ? lp : 0;
      while (rec.lobes.length > lpWanted) scene.remove(rec.lobes.pop().mesh);
      while (rec.lobes.length < lpWanted) {
        const mesh = new THREE.Mesh(geoLobe, lobeMat);
        mesh.visible = showLobes;
        scene.add(mesh);
        rec.lobes.push({ dir: randomUnit(), mesh });
      }
    }
    setNeeds(opts.needs ? opts.needs() : null);
    kick();
  }

  function setNeeds(set) {
    for (const [id, a] of atoms) a.need.visible = !!(set && set.has(id));
  }

  function buildBondGroup(rec, b) {
    rec.group.clear();
    const n = b.order;
    for (let k = 0; k < n; k++) {
      if (b.ionic) {
        const line = new THREE.Group();
        for (let d = 0; d < 7; d++) line.add(new THREE.Mesh(geoDot, ionMat));
        line.userData.dots = true;
        rec.group.add(line);
      } else rec.group.add(new THREE.Mesh(geoCyl, bondMat));
    }
  }

  function spawnPoint(id, place) {
    if (place && place.near != null && atoms.has(place.near)) {
      const base = atoms.get(place.near).p;
      return base.clone().add(randomUnit().multiplyScalar(2));
    }
    // empty bench: near the orbit target, nudged so new atoms do not stack
    const t = controls.target.clone();
    return t.add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1));
  }

  function randomUnit() {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    return v.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : v.normalize();
  }

  /* ---------------- physics ---------------- */
  let energy = 1, settleFrames = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), f = new THREE.Vector3();
  function step(dt) {
    const F = new Map();
    for (const [id] of atoms) F.set(id, new THREE.Vector3());
    // bond springs
    for (const { bond: b } of bonds.values()) {
      const A = atoms.get(b.a), B = atoms.get(b.b);
      if (!A || !B) continue;
      tmp.subVectors(B.p, A.p);
      const d = Math.max(tmp.length(), 1e-4);
      const k = b.ionic ? 6 : 14;
      tmp.multiplyScalar((k * (d - restLength(b))) / d);
      F.get(b.a).add(tmp); F.get(b.b).sub(tmp);
    }
    // region repulsion around each atom (VSEPR-like)
    for (const a of model.atoms) {
      const C = atoms.get(a.id);
      const nbs = bondsOf(model, a.id).filter((b) => !b.ionic).map((b) => other(b, a.id));
      const doms = nbs.map((id) => ({ id, u: tmp2.subVectors(atoms.get(id).p, C.p).clone().normalize(), w: 1 }));
      for (const l of C.lobes) doms.push({ lobe: l, u: l.dir.clone(), w: 2 });
      if (doms.length < 2) continue;
      for (let i = 0; i < doms.length; i++) {
        for (let j = i + 1; j < doms.length; j++) {
          const di = doms[i], dj = doms[j];
          const w = di.lobe && dj.lobe ? W_LL : (di.lobe || dj.lobe ? W_LB : W_BB);
          f.subVectors(di.u, dj.u);
          const len = Math.max(f.length(), 0.05);
          f.multiplyScalar((w * 3.2) / (len * len * len));
          push(di, f, C, a.id, F, 1);
          push(dj, f, C, a.id, F, -1);
        }
      }
    }
    // keep atoms apart, and molecules from piling up
    const list = [...atoms.entries()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [ia, A] = list[i], [ib, B] = list[j];
        tmp.subVectors(B.p, A.p);
        const d = Math.max(tmp.length(), 1e-3);
        const min = (A.r + B.r) * 1.6;
        let s = 0;
        if (d < min) s = 10 * (min - d);
        else if (d < 6) s = 0.6 / (d * d);
        if (s) { tmp.multiplyScalar(s / d); F.get(ia).sub(tmp); F.get(ib).add(tmp); }
      }
    }
    // gentle pull toward the middle of the bench
    let e = 0;
    for (const [id, A] of atoms) {
      const fa = F.get(id);
      fa.addScaledVector(A.p, -0.02);
      if (drag && drag.id === id) { A.v.set(0, 0, 0); continue; }
      A.v.addScaledVector(fa, dt).multiplyScalar(0.86);
      if (A.v.lengthSq() > 400) A.v.setLength(20);
      A.p.addScaledVector(A.v, dt);
      e = Math.max(e, A.v.lengthSq());
    }
    energy = e;
  }
  // a region push moves the neighbour (or turns the lobe) along the sphere, and the centre the other way
  function push(dom, force, C, cid, F, sign) {
    const ft = tmp.copy(force).multiplyScalar(sign);
    ft.addScaledVector(dom.u, -ft.dot(dom.u));
    if (dom.lobe) { dom.lobe.dir.addScaledVector(ft, 0.02).normalize(); return; }
    F.get(dom.id).add(ft);
    F.get(cid).sub(ft);
  }

  function relax(frames) { for (let i = 0; i < frames; i++) step(1 / 30); }

  /* ---------------- drawing ---------------- */
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), camDir = new THREE.Vector3(), perp = new THREE.Vector3(), mid = new THREE.Vector3();
  function draw(now) {
    camera.getWorldDirection(camDir);
    for (const [id, a] of atoms) {
      a.mesh.position.copy(a.p);
      a.halo.position.copy(a.p); a.need.position.copy(a.p);
      a.label.position.copy(a.p).addScaledVector(camDir, -a.r * 1.02);
      a.halo.visible = id === selected || (drag && drag.target === id);
      a.halo.material.color.copy(drag && drag.target === id && !drag.ok ? theme.bad : theme.halo);
      if (a.need.visible && !reduce) a.need.material.opacity = 0.14 + 0.12 * Math.sin(now / 300);
      for (const l of a.lobes) {
        l.mesh.visible = showLobes;
        if (!showLobes) continue;
        l.mesh.position.copy(a.p).addScaledVector(l.dir, a.r * 1.25);
        q.setFromUnitVectors(up, l.dir);
        l.mesh.quaternion.copy(q);
        l.mesh.scale.set(a.r * 0.42, a.r * 0.8, a.r * 0.42);
      }
      if (celebrateUntil > now && !reduce) a.mesh.scale.setScalar(a.r * (1 + 0.08 * Math.sin((celebrateUntil - now) / 60)));
      else a.mesh.scale.setScalar(a.r);
    }
    for (const rec of bonds.values()) {
      const b = rec.bond, A = atoms.get(b.a), B = atoms.get(b.b);
      if (!A || !B) continue;
      tmp.subVectors(B.p, A.p);
      const len = tmp.length();
      const dir = tmp.clone().normalize();
      mid.addVectors(A.p, B.p).multiplyScalar(0.5);
      q.setFromUnitVectors(up, dir);
      rec.hit.position.copy(mid); rec.hit.quaternion.copy(q); rec.hit.scale.set(0.3, len, 0.3);
      perp.crossVectors(dir, camDir);
      if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
      perp.normalize();
      const n = rec.group.children.length;
      const gap = b.ionic ? 0.22 : 0.2;
      const rad = n === 1 ? 0.1 : 0.065;
      rec.group.children.forEach((c, k) => {
        const off = (k - (n - 1) / 2) * gap;
        if (c.userData.dots) {
          c.children.forEach((dot, i) => {
            const t = (i + 1) / (c.children.length + 1);
            dot.position.copy(A.p).addScaledVector(tmp, t).addScaledVector(perp, off);
            dot.scale.setScalar(0.07);
          });
        } else {
          c.position.copy(mid).addScaledVector(perp, off);
          c.quaternion.copy(q);
          c.scale.set(rad, len, rad);
        }
      });
    }
    renderer.render(scene, camera);
  }

  let last = performance.now(), wantFit = false;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (reduce) { if (energy > 1e-4 || drag) { relax(drag ? 2 : 60); } }
    else if (energy > 1e-5 || drag || settleFrames > 0) { step(1 / 30); step(1 / 30); settleFrames = Math.max(0, settleFrames - 1); }
    if (wantFit) fitStep();
    controls.update(dt);
    draw(now);
  }
  function kick() { energy = 1; settleFrames = 90; wantFit = true; }

  function bounds() {
    const c = new THREE.Vector3();
    if (!atoms.size) return { c, r: 3 };
    for (const a of atoms.values()) c.add(a.p);
    c.divideScalar(atoms.size);
    let r = 2;
    for (const a of atoms.values()) r = Math.max(r, a.p.distanceTo(c) + a.r);
    return { c, r };
  }
  function fitStep() {
    if (drag || pointerDownAt) return;
    const { c, r } = bounds();
    const fov = (camera.fov * Math.PI) / 180;
    const aspect = Math.min(1, camera.aspect);
    const want = Math.max(10, (r * 1.25) / Math.sin(Math.min(fov, fov * aspect) / 2));
    const dirv = tmp.subVectors(camera.position, controls.target);
    const dist = dirv.length();
    const k = reduce ? 1 : 0.08;
    controls.target.lerp(c, k);
    if (dist < want || dist > want * 1.6) dirv.setLength(dist + (want - dist) * k);
    camera.position.copy(controls.target).add(dirv);
    if (Math.abs(dist - want) < 0.05 && controls.target.distanceTo(c) < 0.05) wantFit = false;
    if (energy < 1e-4 && settleFrames === 0) wantFit = false;
  }

  /* ---------------- pointer ---------------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null, pointerDownAt = null;
  function toNdc(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    return ndc;
  }
  function pickAt(x, y) {
    ray.setFromCamera(toNdc(x, y), camera);
    const hits = ray.intersectObjects([...[...atoms.values()].map((a) => a.mesh), ...[...bonds.values()].map((b) => b.hit)], false);
    return hits[0] ? hits[0].object : null;
  }
  function onDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointerDownAt = { x: e.clientX, y: e.clientY };
    const obj = pickAt(e.clientX, e.clientY);
    if (obj && obj.userData.atomId != null) {
      controls.enabled = false;
      const id = obj.userData.atomId;
      const a = atoms.get(id);
      camera.getWorldDirection(camDir);
      drag = { id, start: { x: e.clientX, y: e.clientY }, moved: false, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, a.p), target: null, ok: true, pointerId: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (obj && obj.userData.bond) {
      drag = { bond: obj.userData.bond, start: { x: e.clientX, y: e.clientY }, moved: false };
    }
  }
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > 6) drag.moved = true;
    if (drag.id == null || !drag.moved) return;
    ray.setFromCamera(toNdc(e.clientX, e.clientY), camera);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(drag.plane, hit)) atoms.get(drag.id).p.copy(hit);
    drag.target = nearestOther(drag.id, e.clientX, e.clientY);
    drag.ok = drag.target != null ? check(drag.id, drag.target).ok : true;
    drag.trash = isTrash ? isTrash(e.clientX, e.clientY) : false;
    container.classList.toggle('is-trash', !!drag.trash);
    energy = 1;
  });
  const finish = (e) => {
    const d = drag;
    drag = null;
    pointerDownAt = null;
    controls.enabled = true;
    container.classList.remove('is-trash');
    if (!d) return;
    if (d.bond && !d.moved) { onBondTap(d.bond); return; }
    if (d.id == null) return;
    if (!d.moved) { onPick(d.id); return; }
    if (d.trash || (isTrash && e && isTrash(e.clientX, e.clientY))) { onTrash(d.id); return; }
    if (d.target != null) onBondRequest(d.id, d.target);
    kick();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => { drag = null; pointerDownAt = null; controls.enabled = true; container.classList.remove('is-trash'); });
  canvas.addEventListener('lostpointercapture', () => { if (drag && drag.id != null) { drag = null; controls.enabled = true; } });

  const proj = new THREE.Vector3();
  function screenOf(p) {
    const r = canvas.getBoundingClientRect();
    proj.copy(p).project(camera);
    return { x: r.left + ((proj.x + 1) / 2) * r.width, y: r.top + ((1 - proj.y) / 2) * r.height };
  }
  function pxRadius(a) {
    const s1 = screenOf(a.p);
    camera.getWorldDirection(camDir);
    perp.crossVectors(camDir, camera.up).normalize();
    const s2 = screenOf(a.p.clone().addScaledVector(perp, a.r));
    return Math.hypot(s2.x - s1.x, s2.y - s1.y);
  }
  function nearestOther(id, x, y) {
    let best = null, bestD = Infinity;
    for (const [oid, a] of atoms) {
      if (oid === id) continue;
      const s = screenOf(a.p);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < pxRadius(a) + 22 && d < bestD) { best = oid; bestD = d; }
    }
    return best;
  }

  /** Where an atom dropped at screen point (x, y) lands, and which atom (if any) it was dropped on. */
  function dropPoint(x, y) {
    const r = canvas.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    let onto = null, bestD = Infinity;
    for (const [oid, a] of atoms) {
      const s = screenOf(a.p);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < pxRadius(a) + 22 && d < bestD) { onto = oid; bestD = d; }
    }
    camera.getWorldDirection(camDir);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, controls.target);
    ray.setFromCamera(toNdc(x, y), camera);
    const pos = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, pos)) pos.copy(controls.target);
    return { pos, onto };
  }

  /* ---------------- size, theme ---------------- */
  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function setTheme(t) {
    theme.dark = t.dark;
    for (const k of ['bond', 'ion', 'halo', 'bad', 'need', 'lobe']) if (t[k]) theme[k].set(t[k]);
    bondMat.color.copy(theme.bond); ionMat.color.copy(theme.ion); lobeMat.color.copy(theme.lobe);
    for (const a of atoms.values()) a.need.material.color.copy(theme.need);
    hemi.groundColor.set(t.dark ? 0x223333 : 0x667777);
  }

  renderer.setAnimationLoop(loop);

  return {
    sync,
    setNeeds,
    dropPoint,
    select(id) { selected = id; },
    setLonePairs(on) { showLobes = !!on; },
    setTheme,
    fit() { wantFit = true; energy = Math.max(energy, 1e-3); },
    celebrate() { celebrateUntil = performance.now() + 1400; },
    /** bond angles at an atom, in degrees, from the current drawing */
    angles(id) {
      const C = atoms.get(id);
      if (!C) return [];
      const nbs = bondsOf(model, id).filter((b) => !b.ionic).map((b) => other(b, id));
      const out = [];
      for (let i = 0; i < nbs.length; i++) for (let j = i + 1; j < nbs.length; j++) {
        const u = tmp.subVectors(atoms.get(nbs[i]).p, C.p).normalize().clone();
        const v = tmp2.subVectors(atoms.get(nbs[j]).p, C.p).normalize();
        out.push({ a: nbs[i], b: nbs[j], deg: (Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180) / Math.PI });
      }
      return out;
    },
    /** settle the shape now (used before reading angles in reduced motion or list mode) */
    settle() { relax(240); },
    destroy() { renderer.setAnimationLoop(null); ro.disconnect(); controls.dispose(); renderer.dispose(); canvas.remove(); },
  };
}
