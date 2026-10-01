// Heat vs the bonds of life: two renderers for the same Frame data (sims.js).
// Renderer3D uses three.js 0.170 (vendored): instanced spheres and sticks, hydrogen bonds as faint dashes.
// Renderer2D draws the same models flat on a 2D canvas, for browsers without WebGL.
// Both: resize(), draw(frame, yaw, pitch), setLight(isLight), destroy(). Pixel ratio is capped.

import * as THREE from '../vendor/three/0.170.0/build/three.module.js';

const mobile = () => matchMedia('(max-width: 700px)').matches;
const dprCap = () => Math.min(window.devicePixelRatio || 1, mobile() ? 1.5 : 2);
const HB_DARK = [0.55, 0.9, 1], HB_LIGHT = [0.05, 0.4, 0.62];

export function webglOK() {
  if (/[?&]nogl=1/.test(location.search)) return false;
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

export class Renderer3D {
  constructor(host, view, max) {
    this.host = host; this.view = view;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(dprCap());
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a4a, 1.5));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(4, 6, 9); this.scene.add(d);
    const rim = new THREE.DirectionalLight(0x88ccff, 0.8); rim.position.set(-6, -2, -4); this.scene.add(rim);
    this.g = new THREE.Group(); this.scene.add(this.g);
    const [maxS, maxK, maxH] = max;
    this.sph = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.05 }), maxS);
    this.stk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }), maxK);
    const c0 = new THREE.Color(1, 1, 1);
    for (let i = 0; i < maxS; i++) this.sph.setColorAt(i, c0);
    for (let i = 0; i < maxK; i++) this.stk.setColorAt(i, c0);
    this.g.add(this.sph, this.stk);
    this.DASH = 3;
    const nv = maxH * this.DASH * 2;
    this.hPos = new Float32Array(nv * 3); this.hCol = new Float32Array(nv * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.hPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.hCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.hGeo = geo;
    this.hb = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.hb.frustumCulled = false; this.sph.frustumCulled = false; this.stk.frustumCulled = false;
    this.g.add(this.hb);
    this.hbCol = HB_DARK;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.dir = new THREE.Vector3(); this.col = new THREE.Color();
    this.resize();
  }
  setLight(isLight) { this.hbCol = isLight ? HB_LIGHT : HB_DARK; }
  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.r.setPixelRatio(dprCap());
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    const t = Math.tan((this.cam.fov * Math.PI / 180) / 2);
    const dist = Math.max(this.view.h / 2 / t, this.view.w / 2 / (t * this.cam.aspect)) * 1.04;
    this.cam.position.set(0, 0, dist); this.cam.lookAt(0, 0, 0);
    this.cam.far = dist * 4; this.cam.updateProjectionMatrix();
  }
  draw(f, yaw, pitch) {
    this.g.rotation.set(pitch, yaw, 0);
    for (let i = 0; i < f.ns; i++) {
      const o = i * 4;
      this.v.set(f.sp[o], f.sp[o + 1], f.sp[o + 2]); this.s.setScalar(f.sp[o + 3]); this.q.identity();
      this.m.compose(this.v, this.q, this.s); this.sph.setMatrixAt(i, this.m);
      this.col.setRGB(f.sc[i * 3], f.sc[i * 3 + 1], f.sc[i * 3 + 2]); this.sph.setColorAt(i, this.col);
    }
    this.sph.count = f.ns; this.sph.instanceMatrix.needsUpdate = true; this.sph.instanceColor.needsUpdate = true;
    for (let i = 0; i < f.nk; i++) {
      const o = i * 7, ax = f.k[o], ay = f.k[o + 1], az = f.k[o + 2], bx = f.k[o + 3], by = f.k[o + 4], bz = f.k[o + 5], w = f.k[o + 6];
      this.dir.set(bx - ax, by - ay, bz - az); const len = this.dir.length() || 1e-6; this.dir.multiplyScalar(1 / len);
      this.q.setFromUnitVectors(this.up, this.dir);
      this.v.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); this.s.set(w, len, w);
      this.m.compose(this.v, this.q, this.s); this.stk.setMatrixAt(i, this.m);
      this.col.setRGB(f.kc[i * 3], f.kc[i * 3 + 1], f.kc[i * 3 + 2]); this.stk.setColorAt(i, this.col);
    }
    this.stk.count = f.nk; this.stk.instanceMatrix.needsUpdate = true; this.stk.instanceColor.needsUpdate = true;
    let vi = 0; const D = this.DASH, [cr, cg, cb] = this.hbCol;
    for (let i = 0; i < f.nh; i++) {
      const o = i * 7, a = f.h[o + 6];
      for (let d = 0; d < D; d++) {
        const t0 = (d + 0.2) / D, t1 = (d + 0.75) / D;
        for (const t of [t0, t1]) {
          this.hPos[vi * 3] = f.h[o] + (f.h[o + 3] - f.h[o]) * t;
          this.hPos[vi * 3 + 1] = f.h[o + 1] + (f.h[o + 4] - f.h[o + 1]) * t;
          this.hPos[vi * 3 + 2] = f.h[o + 2] + (f.h[o + 5] - f.h[o + 2]) * t;
          this.hCol[vi * 4] = cr; this.hCol[vi * 4 + 1] = cg; this.hCol[vi * 4 + 2] = cb; this.hCol[vi * 4 + 3] = a;
          vi++;
        }
      }
    }
    this.hGeo.setDrawRange(0, vi);
    this.hGeo.attributes.position.needsUpdate = true; this.hGeo.attributes.color.needsUpdate = true;
    this.r.render(this.scene, this.cam);
  }
  destroy() {
    this.sph.geometry.dispose(); this.sph.material.dispose(); this.stk.geometry.dispose(); this.stk.material.dispose();
    this.hGeo.dispose(); this.hb.material.dispose(); this.r.dispose(); this.canvas.remove();
  }
}

export class Renderer2D {
  constructor(host, view) {
    this.host = host; this.view = view;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.hbCol = HB_DARK; this.resize();
  }
  setLight(isLight) { this.hbCol = isLight ? HB_LIGHT : HB_DARK; }
  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight), d = dprCap();
    this.canvas.width = Math.round(w * d); this.canvas.height = Math.round(h * d);
    this.w = w; this.h = h; this.d = d;
    this.scale = Math.min(w / this.view.w, h / this.view.h) * 0.96;
  }
  draw(f, yaw, pitch) {
    const { ctx, w, h, d, scale } = this, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), D = 30;
    const proj = (x, y, z) => {
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const k = D / (D - z2);
      return [w / 2 + x1 * k * scale, h / 2 - y2 * k * scale, z2, k];
    };
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    const rgb = (c, o, a = 1) => `rgba(${Math.round(c[o] * 255)},${Math.round(c[o + 1] * 255)},${Math.round(c[o + 2] * 255)},${a})`;
    const items = [];
    for (let i = 0; i < f.nk; i++) {
      const o = i * 7, a = proj(f.k[o], f.k[o + 1], f.k[o + 2]), b = proj(f.k[o + 3], f.k[o + 4], f.k[o + 5]);
      items.push({ z: (a[2] + b[2]) / 2 - 0.05, draw: () => { ctx.strokeStyle = rgb(f.kc, i * 3, 0.95); ctx.lineWidth = Math.max(1, f.k[o + 6] * 2 * scale * a[3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } });
    }
    for (let i = 0; i < f.ns; i++) {
      const o = i * 4, p = proj(f.sp[o], f.sp[o + 1], f.sp[o + 2]), rr = Math.max(1, f.sp[o + 3] * scale * p[3]);
      items.push({ z: p[2], draw: () => {
        const g = ctx.createRadialGradient(p[0] - rr * 0.35, p[1] - rr * 0.35, rr * 0.1, p[0], p[1], rr);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, rgb(f.sc, i * 3)); g.addColorStop(1, `rgb(${Math.round(f.sc[i * 3] * 115)},${Math.round(f.sc[i * 3 + 1] * 115)},${Math.round(f.sc[i * 3 + 2] * 115)})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill();
      } });
    }
    items.sort((a, b) => a.z - b.z).forEach((it) => it.draw());
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5;
    for (let i = 0; i < f.nh; i++) {
      const o = i * 7, a = proj(f.h[o], f.h[o + 1], f.h[o + 2]), b = proj(f.h[o + 3], f.h[o + 4], f.h[o + 5]);
      ctx.strokeStyle = `rgba(${this.hbCol.map((v) => Math.round(v * 255)).join(',')},${f.h[o + 6]})`;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  destroy() { this.canvas.remove(); }
}
