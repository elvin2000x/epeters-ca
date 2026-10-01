// Live pond: an agent-based drop of pond water under the microscope.
// Sizes come from specimens.json (cited). Behaviours shown are only the ones listed under each organism's "pond"
// entries, each with a source: avoiding reaction, oral-groove feeding and fission every 6 h (brette2021),
// engulfing into food vacuoles (garden-amoebae, mbn-aproteus), phototaxis and lengthwise division (hader2022),
// run and tumble (kaiser-flagella), budding at 0.5 to 0.7 of the mother's volume (bionumbers-bud),
// gliding (exeter-diatom), binary fission (mbn-binary-fission). Speeds and timings not in a source are marked
// illustrative in specimens.json ("pond.note").

export const ARENA = 850; // radius of the drop, µm
const KIND = { paramecium: 0, amoeba: 1, euglena: 2, bacteria: 3, yeast: 4, diatom: 5, algae: 6 };
export const SPECIES = ['paramecium', 'amoeba', 'euglena', 'diatom', 'bacteria', 'yeast', 'algae'];
const FOOD = new Set(['bacteria', 'yeast', 'algae']);
export const NAMES = {
  paramecium: ['paramecium', 'paramecia'], amoeba: ['amoeba', 'amoebae'], euglena: ['euglena', 'euglenas'],
  bacteria: ['bacterium', 'bacteria'], yeast: ['yeast cell', 'yeast cells'], diatom: ['diatom', 'diatoms'], algae: ['green alga', 'green algae'],
};
export const COLORS = {
  paramecium: '#c27c0e', amoeba: '#8a5cc2', euglena: '#2e9a4a', diatom: '#3a7bd5', bacteria: '#7a8794', yeast: '#b0703a', algae: '#6fb83a',
};
const AMOEBA_EATS = new Set(['bacteria', 'algae']); // garden-amoebae: "mostly microorganisms like bacteria and algae"
const CELL = 60; // spatial grid cell, µm

const VSQ = `
attribute vec2 aQ; attribute vec4 aA, aB, aC, aK;
uniform vec2 uC, uRes, uCam; uniform float uPx, uFocus, uTan, uDof;
varying vec2 vP; varying vec4 vA, vB, vC; varying vec2 vK;
void main(){
  float b=max(abs(uFocus-aK.y)-uDof*0.5,0.)*uTan;
  float rad=aK.z+3.*b+3./uPx;
  vec2 w=aA.xy+aQ*rad;
  vec2 px=uC+(w-uCam)*uPx;
  gl_Position=vec4(px/uRes*2.-1.,0.,1.);
  vP=w; vA=aA; vB=aB; vC=aC; vK=aK.xy;
}`;
const FSQ_MAIN = `
varying vec2 vP; varying vec4 vA, vB, vC; varying vec2 vK;
void main(){
  OD=vec3(0.); SC=vec3(0.); HALO=0.; ZOFF=vK.y; LIGHT=0.;
  float k=vK.x;
  if(k<0.5) para(vP,vA,vB);
  else if(k<1.5) amoeba(vP,vA,vB,vC);
  else if(k<2.5) euglena(vP,vA,vB);
  else if(k<3.5) microbe(vP,vA,vB);
  else if(k<4.5) yeastOne(vP,vA,vB);
  else if(k<5.5) diatom(vP,vA,vB);
  else algaOne(vP,vA,vB);
  // food smaller than about 2 screen pixels still shows as a speck, as it does in a real eyepiece
  if((k>2.5&&k<4.5)||k>5.5){
    float sz=k<3.5?vB.y*0.5:vB.x;
    float dpx=length(vP-vA.xy)*uPx;
    float sp=exp(-dpx*dpx/1.8)*(1.-smoothstep(1.,2.5,sz*uPx));
    vec3 tint=k>5.5?vec3(0.55,0.15,0.50):vec3(0.36,0.34,0.30);
    OD+=sp*tint; SC+=sp*0.8;
  }
  float rn=length(gl_FragCoord.xy-uC)/uR;
  float inside=1.-smoothstep(1.-1.5*uDpr/uR,1.,rn);
  float vig=1.-0.38*smoothstep(0.55,1.,rn);
  if(uMode==0){
    vec3 f=exp(-max(OD,vec3(0.)))+HALO*0.2;
    gl_FragColor=vec4(0.5*mix(vec3(1.),f,inside),1.);
  } else {
    vec3 s=1.-exp(-SC*vec3(0.80,0.88,1.0)*(1.-0.22*rn*rn)*1.25);
    gl_FragColor=vec4(s*vig*inside,1.);
  }
}`;

export function createPond(api) {
  const { DATA, COPY } = api;
  const LIFE = DATA.pond.lifeFactor; // life clock: 1 s of play = LIFE s of biology
  const CAP = DATA.pond.cap;
  const P = { agents: [], byId: new Map(), nextId: 1, life: 0, mt: 0, light: { x: -380, y: 380, r: 210 }, hist: [], histT: 0, ev: [], evT: 0, seeded: false };
  let rs = 4242;
  const R = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
  const PERIOD = { paramecium: 21600, amoeba: 43200, euglena: 43200, bacteria: 14400, yeast: 14400 }; // life seconds; only paramecium is cited (brette2021)

  /* ---------- agents ---------- */
  function make(sp, x, y, o = {}) {
    const a = { id: P.nextId++, sp, k: KIND[sp], x, y, h: o.h ?? R() * 6.2832, z: 0, seed: R() * 10, g: o.g ?? 1, food: 0, lastDiv: P.life - R() * 0.4 * (PERIOD[sp] || 1), roll: R() * 6.2832, st: 'fwd', t: R(), cap: null, ha: 0, cr: 1 };
    if (sp === 'paramecium') { a.L = 240 * (0.92 + 0.16 * R()); a.W = a.L / 4; a.z = (R() - 0.5) * 10; a.fv = 3; a.lastDig = P.life; }
    else if (sp === 'amoeba') { a.R0 = 120 * (0.9 + 0.2 * R()); a.z = -2; a.vac = [0, 0, 0, 0]; a.sq = 0; a.sqA = 0; a.prey = 0; a.busy = 0; }
    else if (sp === 'euglena') { a.L = 90 * (0.9 + 0.15 * R()); a.W = 16; a.z = (R() - 0.5) * 10; a.lit = R() * 0.3 * PERIOD.euglena; }
    else if (sp === 'bacteria') { a.L = 2; a.W = 0.7; a.z = (R() - 0.5) * 12; }
    else if (sp === 'yeast') { a.r = 2.5 * (0.92 + 0.16 * R()); a.rT = a.r; a.bud = R() * 0.5; a.z = (R() - 0.5) * 12; }
    else if (sp === 'diatom') { a.L = 100 * (0.85 + 0.2 * R()); a.W = 16; a.z = -3; a.dir = R() < 0.5 ? 1 : -1; }
    else if (sp === 'algae') { a.r = 1.5 * (0.8 + 0.3 * R()); a.z = (R() - 0.5) * 12; }
    shape(a);
    return a;
  }
  function shape(a) {
    const g = a.g;
    switch (a.sp) {
      case 'paramecium': { const w = a.W * (0.8 + 0.2 * g); a.ha = Math.max(0, a.L * g / 2 - w / 2); a.cr = w / 2; break; }
      case 'euglena': a.ha = a.L * g / 2 - 8; a.cr = 8; break;
      case 'diatom': a.ha = a.L / 2 - 8; a.cr = 8; break;
      case 'amoeba': a.ha = 0; a.cr = a.R0 * g * 1.45; break;
      case 'bacteria': a.ha = 0.65 * g; a.cr = 0.35; break;
      case 'yeast': a.ha = 0; a.cr = a.r * (1 + 0.6 * a.bud); break;
      default: a.ha = 0; a.cr = a.r;
    }
  }
  const live = () => P.agents.filter((a) => !a.cap && !a.dead);
  function counts() {
    const c = {}; for (const s of SPECIES) c[s] = 0;
    for (const a of P.agents) if (!a.cap && !a.dead) c[a.sp]++;
    return c;
  }
  function add(a) {
    const r = Math.hypot(a.x, a.y), lim = ARENA - a.cr - a.ha - 2;
    if (r > lim) { a.x *= lim / r; a.y *= lim / r; }
    P.agents.push(a); P.byId.set(a.id, a);
    return a;
  }
  function drop(sp, x, y, n = 1, spread = 0) {
    let room = CAP - live().length;
    if (room <= 0) { api.showNote(COPY.full, 4000); api.announce(COPY.full); return 0; }
    n = Math.min(n, room);
    for (let i = 0; i < n; i++) {
      const ang = R() * 6.2832, rad = spread * Math.sqrt(R());
      add(make(sp, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad));
    }
    if (live().length >= CAP) api.showNote(COPY.full, 4000);
    api.requestRender();
    return n;
  }
  function clear() { P.agents = []; P.byId.clear(); P.hist = []; P.ev = []; api.requestRender(); }
  function seed() {
    if (P.seeded) return; P.seeded = true;
    add(make('amoeba', -260, -170, { h: 0.6 }));
    add(make('paramecium', 320, 220, { h: 2.6 }));
    add(make('euglena', -60, 330, { h: 2.2 })); add(make('euglena', -160, 250, { h: 1.0 }));
    add(make('diatom', 260, -330, { h: 0.3 }));
    drop('bacteria', -90, -60, 22, 70);
    drop('algae', -200, -20, 10, 60);
    drop('yeast', 280, 40, 6, 50);
    drop('bacteria', 380, 150, 12, 60);
  }

  /* ---------- spatial grid ---------- */
  const grid = new Map(); let qstamp = 1;
  const gkey = (ix, iy) => (ix + 512) * 1024 + (iy + 512);
  function insert(a) {
    const e = a.ha + a.cr;
    const x0 = Math.floor((a.x - e) / CELL), x1 = Math.floor((a.x + e) / CELL), y0 = Math.floor((a.y - e) / CELL), y1 = Math.floor((a.y + e) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
      const k = gkey(ix, iy); let c = grid.get(k); if (!c) { c = []; grid.set(k, c); } c.push(a);
    }
  }
  function query(x, y, e, out) {
    out.length = 0; qstamp++;
    const x0 = Math.floor((x - e) / CELL), x1 = Math.floor((x + e) / CELL), y0 = Math.floor((y - e) / CELL), y1 = Math.floor((y + e) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
      const c = grid.get(gkey(ix, iy)); if (!c) continue;
      for (const b of c) if (b.qs !== qstamp) { b.qs = qstamp; out.push(b); }
    }
    return out;
  }
  // closest points between two capsules' core segments
  function segs(a, b) {
    const ax = Math.cos(a.h) * a.ha, ay = Math.sin(a.h) * a.ha, bx = Math.cos(b.h) * b.ha, by = Math.sin(b.h) * b.ha;
    const p1x = a.x - ax, p1y = a.y - ay, d1x = 2 * ax, d1y = 2 * ay;
    const p2x = b.x - bx, p2y = b.y - by, d2x = 2 * bx, d2y = 2 * by;
    const rx = p1x - p2x, ry = p1y - p2y;
    const A = d1x * d1x + d1y * d1y, E = d2x * d2x + d2y * d2y, F = d2x * rx + d2y * ry;
    let s = 0, t = 0;
    if (A < 1e-9 && E < 1e-9) { s = t = 0; }
    else if (A < 1e-9) { t = Math.min(1, Math.max(0, F / E)); }
    else {
      const C = d1x * rx + d1y * ry;
      if (E < 1e-9) { s = Math.min(1, Math.max(0, -C / A)); }
      else {
        const B = d1x * d2x + d1y * d2y, den = A * E - B * B;
        s = den > 1e-9 ? Math.min(1, Math.max(0, (B * F - C * E) / den)) : 0;
        t = (B * s + F) / E;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -C / A)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (B - C) / A)); }
      }
    }
    const cx = p1x + d1x * s, cy = p1y + d1y * s, ex = p2x + d2x * t, ey = p2y + d2y * t;
    let nx = cx - ex, ny = cy - ey; const d = Math.hypot(nx, ny);
    if (d > 1e-6) { nx /= d; ny /= d; } else { nx = Math.cos(a.h + 1.5708); ny = Math.sin(a.h + 1.5708); }
    return { d, nx, ny };
  }
  const mass = (a) => (a.sp === 'amoeba' ? (a.R0 * a.g) ** 2 * 3 : (a.ha * 2 + a.cr * 2) * a.cr * 2);

  /* ---------- events for the live region ---------- */
  function ev(type, a, b) { P.ev.push({ type, a, b }); }
  function flushEvents(wall) {
    if (wall - P.evT < 5 || !P.ev.length) return;
    P.evT = wall;
    const groups = new Map();
    for (const e of P.ev) { const k = `${e.type}|${e.a}|${e.b || ''}`; groups.set(k, (groups.get(k) || 0) + 1); }
    P.ev = [];
    const order = ['divide', 'bud', 'eat', 'avoid'];
    const lines = [...groups.entries()].sort((x, y) => order.indexOf(x[0].split('|')[0]) - order.indexOf(y[0].split('|')[0])).slice(0, 2).map(([k, n]) => {
      const [type, a, b] = k.split('|');
      const A = NAMES[a], B = NAMES[b] || [b, b];
      const an = (w) => (/^[aeiou]/.test(w) ? 'An' : 'A');
      if (type === 'eat') { const verb = a === 'amoeba' ? 'engulfed' : 'swept up'; return n === 1 ? `${an(A[0])} ${A[0]} ${verb} a ${B[0]}.` : `${cap(A[1])} ${verb} ${n} ${B[1]}.`; }
      if (type === 'divide') return n === 1 ? `${an(A[0])} ${A[0]} split in two.` : `${n} ${A[1]} split in two.`;
      if (type === 'bud') return n === 1 ? 'A yeast cell budded off a daughter cell.' : `${n} yeast cells budded off daughter cells.`;
      if (type === 'avoid') return `A paramecium backed away from ${b === 'edge' ? 'the edge of the drop' : `${an(B[0]).toLowerCase()} ${B[0]}`}.`;
      return '';
    });
    api.announce(lines.join(' '));
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  /* ---------- behaviour ---------- */
  function turnToward(a, ang, rate, dt) {
    const d = Math.atan2(Math.sin(ang - a.h), Math.cos(ang - a.h));
    a.h += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }
  function avoid(a, what) {
    if (a.st !== 'fwd' || P.mt - (a.lastAvoid || -9) < 0.25) return;
    a.st = 'back'; a.t = 0.25; a.lastAvoid = P.mt; // avoiding reaction (brette2021); timings illustrative
    ev('avoid', 'paramecium', what);
  }
  function captureFood(f, by, dur) {
    const c = Math.cos(by.h), s = Math.sin(by.h), dx = f.x - by.x, dy = f.y - by.y;
    f.cap = { by: by.id, t: 0, dur, u0: dx * c + dy * s, v0: -dx * s + dy * c, x0: dx, y0: dy };
    if (by.sp === 'amoeba') { const an = R() * 6.2832, rr = by.R0 * by.g * 0.35 * Math.sqrt(R()); f.cap.tx = Math.cos(an) * rr; f.cap.ty = Math.sin(an) * rr; by.busy++; }
  }
  function eaten(f, by) {
    f.dead = true;
    by.food++;
    if (by.sp === 'paramecium') by.fv = Math.min(6, by.fv + 1);
    else if (by.sp === 'amoeba') { const i = by.vac.findIndex((v) => v < 0.02); by.vac[i >= 0 ? i : by.vac.indexOf(Math.min(...by.vac))] = 1; by.busy = Math.max(0, by.busy - 1); }
    ev('eat', by.sp, f.sp);
  }
  const near = [];
  function behave(a, dt, dl) {
    const lim = ARENA - a.cr - a.ha;
    const r = Math.hypot(a.x, a.y);
    let v = 0;
    switch (a.sp) {
      case 'paramecium': {
        if (a.st === 'fwd') { a.h += dt * 0.9 * (0.6 * Math.sin(P.mt * 0.5 + a.seed) + 0.4 * Math.sin(P.mt * 0.23 + a.seed * 2)); v = 1000; } // 1 mm/s (jana2012, brette2021)
        else if (a.st === 'back') { v = -350; a.t -= dt; if (a.t <= 0) { a.st = 'turn'; a.t = 0.3; a.turn = (R() < 0.5 ? -1 : 1) * (2.5 + 2 * R()); } }
        else { v = 80; a.h += a.turn * dt; a.t -= dt; if (a.t <= 0) a.st = 'fwd'; }
        a.roll += dt * 6.2832; // about one turn per second (brette2021)
        if (r > lim - 5 && a.st === 'fwd' && Math.cos(a.h) * a.x + Math.sin(a.h) * a.y > 0) avoid(a, 'edge');
        break;
      }
      case 'amoeba': {
        let prey = a.prey ? P.byId.get(a.prey) : null;
        if (!prey || prey.cap || prey.dead) { a.prey = 0; prey = null; }
        const room = a.vac.filter((x) => x < 0.02).length - a.busy;
        if (!prey && room > 0) {
          let best = null, bd = 1e9;
          for (const b of query(a.x, a.y, a.R0 * a.g * 2.1, near)) {
            if (!AMOEBA_EATS.has(b.sp) || b.cap || b.dead) continue;
            const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < a.R0 * a.g * 2.1 && d < bd) { bd = d; best = b; }
          }
          if (best) { a.prey = best.id; prey = best; }
        }
        if (prey) {
          turnToward(a, Math.atan2(prey.y - a.y, prey.x - a.x), 0.5, dt);
          if (Math.hypot(prey.x - a.x, prey.y - a.y) < a.R0 * a.g * 1.75) { captureFood(prey, a, 1.6); a.prey = 0; }
        } else a.h += dt * 0.06 * Math.sin(P.mt * 0.05 + a.seed);
        v = 3; // illustrative crawl
        a.sq *= Math.exp(-dt * 1.5);
        for (let i = 0; i < 4; i++) a.vac[i] = Math.max(0, a.vac[i] - dl / 7200); // digestion in the vacuole (mbn-aproteus); 2 h illustrative
        break;
      }
      case 'euglena': {
        const L = P.light, d = Math.hypot(L.x - a.x, L.y - a.y), lit = d < L.r;
        if (!lit) turnToward(a, Math.atan2(L.y - a.y, L.x - a.x), 0.7, dt); // positive phototaxis (hader2022)
        else a.h += dt * 0.8 * Math.sin(P.mt * 0.7 + a.seed * 3);
        if (lit) a.lit += dl;
        a.roll += dt * 6.2832 * 0.9;
        v = 45; // illustrative
        break;
      }
      case 'bacteria': { // run about 1 s, 10 to 20 lengths; tumble 0.1 s; new random direction (kaiser-flagella)
        a.t -= dt;
        if (a.st === 'fwd') { v = 30 * (0.7 + 0.3 * a.g); if (a.t <= 0) { a.st = 'tumble'; a.t = 0.1; } }
        else { a.h += dt * 30 * (R() - 0.5); if (a.t <= 0) { a.h = R() * 6.2832; a.st = 'fwd'; a.t = -Math.log(1 - R() * 0.999); } }
        if (r > lim) a.h = Math.atan2(-a.y, -a.x) + (R() - 0.5);
        break;
      }
      case 'diatom': {
        if (R() < dt / 25) a.dir *= -1;
        a.h += dt * 0.02 * Math.sin(P.mt * 0.07 + a.seed);
        v = 4 * a.dir; // illustrative glide (exeter-diatom)
        break;
      }
      default: { // yeast and algae do not swim: small random jiggle
        const j = 0.8 * Math.sqrt(dt);
        a.x += (R() - 0.5) * j; a.y += (R() - 0.5) * j;
      }
    }
    a.x += Math.cos(a.h) * v * dt; a.y += Math.sin(a.h) * v * dt;
    const r2 = Math.hypot(a.x, a.y);
    if (r2 > lim) { a.x *= lim / r2; a.y *= lim / r2; if (a.sp === 'diatom' || a.sp === 'euglena' || a.sp === 'amoeba') turnToward(a, Math.atan2(-a.y, -a.x), 1.5, dt); }
  }

  function fission(a, lengthwise) {
    const c = Math.cos(a.h), s = Math.sin(a.h);
    const b = make(a.sp, a.x, a.y, { h: a.h + (R() - 0.5) * 0.3 });
    for (const k of ['L', 'W', 'R0', 'z']) if (k in a) b[k] = a[k];
    let off;
    if (a.sp === 'amoeba') { a.g = b.g = 0.72; off = a.R0 * 0.5; b.vac = a.vac.map((x, i) => (i % 2 ? x : 0)); a.vac = a.vac.map((x, i) => (i % 2 ? 0 : x)); }
    else if (lengthwise) { a.g = b.g = 0.85; off = a.W * 0.55; }
    else { a.g = b.g = 0.55; off = (a.L || 2) * 0.27; }
    const ox = lengthwise ? -s * off : c * off, oy = lengthwise ? c * off : s * off;
    b.x = a.x - ox; b.y = a.y - oy; a.x += ox; a.y += oy;
    a.food = b.food = 0; a.lastDiv = b.lastDiv = P.life;
    if ('fv' in a) { b.fv = Math.floor(a.fv / 2); a.fv -= b.fv; }
    if ('lit' in a) a.lit = b.lit = 0;
    shape(a); shape(b); add(b);
    ev('divide', a.sp);
  }

  function step(dt, dl, wall) {
    if (!P.agents.length) return;
    P.mt += dt; P.life += dl;
    grid.clear();
    for (const a of P.agents) { if (a.dead) continue; shape(a); if (!a.cap) insert(a); }
    for (const a of P.agents) if (!a.cap && !a.dead) behave(a, dt, dl);
    grid.clear();
    for (const a of P.agents) if (!a.cap && !a.dead) insert(a);
    // contacts: organisms against everything nearby
    for (const a of P.agents) {
      if (a.cap || a.dead || FOOD.has(a.sp)) continue;
      const reach = a.ha + a.cr + 14;
      for (const b of query(a.x, a.y, reach, near)) {
        if (b === a || b.cap || b.dead) continue;
        const bFood = FOOD.has(b.sp);
        if (!bFood && b.id < a.id) continue; // each organism pair once
        const c = segs(a, b), pen = a.cr + b.cr - c.d;
        if (bFood) {
          if (a.sp === 'paramecium' && a.st === 'fwd') { // oral groove sweep (brette2021)
            const ca = Math.cos(a.h), sa = Math.sin(a.h), dx = b.x - a.x, dy = b.y - a.y;
            const u = dx * ca + dy * sa, w = -dx * sa + dy * ca, hl = a.L * a.g / 2;
            if (u > -0.1 * hl && u < 0.9 * hl && Math.abs(w) < a.cr + 12) { captureFood(b, a, 0.35); continue; }
          }
          if (a.sp === 'amoeba' && AMOEBA_EATS.has(b.sp) && pen > 0 && a.vac.some((x) => x < 0.02) && a.busy < 2) { captureFood(b, a, 1.6); continue; }
          if (pen > 0) { b.x += c.nx * -pen; b.y += c.ny * -pen; }
          continue;
        }
        if (pen <= 0) continue;
        const soft = a.sp === 'amoeba' || b.sp === 'amoeba' ? 0.35 : 1;
        const ma = mass(a), mb = mass(b), push = pen * soft;
        a.x += c.nx * push * mb / (ma + mb); a.y += c.ny * push * mb / (ma + mb);
        b.x -= c.nx * push * ma / (ma + mb); b.y -= c.ny * push * ma / (ma + mb);
        for (const [p, q, sg] of [[a, b, -1], [b, a, 1]]) {
          if (p.sp === 'paramecium' && Math.cos(p.h) * c.nx * sg + Math.sin(p.h) * c.ny * sg > -0.2) avoid(p, q.sp);
          if (p.sp === 'amoeba') { p.sq = Math.min(0.3, p.sq + pen / p.R0 * 0.5); p.sqA = Math.atan2(c.ny * sg, c.nx * sg); }
          if (p.sp === 'bacteria' || p.sp === 'euglena' || p.sp === 'diatom') p.h += 0.5 * (R() - 0.5);
        }
      }
    }
    // food being swallowed follows its eater
    for (const f of P.agents) {
      if (!f.cap || f.dead) continue;
      const by = P.byId.get(f.cap.by);
      if (!by || by.dead) { f.cap = null; continue; }
      f.cap.t += dt;
      const k = Math.min(1, f.cap.t / f.cap.dur), e = k * k * (3 - 2 * k);
      if (by.sp === 'paramecium') {
        const hl = by.L * by.g / 2, u = f.cap.u0 + (0.05 * hl - f.cap.u0) * e, w = f.cap.v0 * (1 - e);
        const c = Math.cos(by.h), s = Math.sin(by.h);
        f.x = by.x + u * c - w * s; f.y = by.y + u * s + w * c;
      } else { f.x = by.x + f.cap.x0 + (f.cap.tx - f.cap.x0) * e; f.y = by.y + f.cap.y0 + (f.cap.ty - f.cap.y0) * e; }
      if (k >= 1) eaten(f, by);
    }
    // life clock: digestion, growth, division, budding
    const n = counts(); let total = Object.values(n).reduce((x, y) => x + y, 0);
    const list = P.agents.slice();
    for (const a of list) {
      if (a.cap || a.dead) continue;
      if (a.g < 1) a.g = Math.min(1, a.g + dl / 10800);
      const room = total < CAP;
      if (a.sp === 'paramecium') {
        if (a.fv > 0 && P.life - a.lastDig > 3600) { a.fv--; a.lastDig = P.life; }
        if (room && a.food >= 4 && P.life - a.lastDiv >= PERIOD.paramecium) { fission(a, false); total++; }
      } else if (a.sp === 'amoeba') {
        if (room && a.food >= 5 && P.life - a.lastDiv >= PERIOD.amoeba) { fission(a, false); total++; }
      } else if (a.sp === 'euglena') {
        if (room && a.lit >= PERIOD.euglena) { fission(a, true); total++; }
      } else if (a.sp === 'bacteria') {
        if (room && n.bacteria < 50 && P.life - a.lastDiv >= PERIOD.bacteria) { fission(a, false); n.bacteria++; total++; }
      } else if (a.sp === 'yeast') {
        if (a.r < a.rT) a.r = Math.min(a.rT, a.r + dl / 7200);
        if (n.yeast < 24) a.bud += dl / PERIOD.yeast;
        if (a.bud >= 0.84 && room) { // bud separates at 0.84 of the radius: about 0.6 of the volume (bionumbers-bud)
          const b = make('yeast', 0, 0, { h: a.h + 1.2 + R() });
          b.rT = b.r; b.r = a.r * 0.84; b.bud = 0;
          b.x = a.x + Math.cos(a.h) * (a.r * 1.02 + b.r * 0.8); b.y = a.y + Math.sin(a.h) * (a.r * 1.02 + b.r * 0.8);
          a.bud = 0; a.h += 2.1; add(b); n.yeast++; total++; ev('bud', 'yeast');
        } else a.bud = Math.min(a.bud, 0.84);
      }
    }
    if (P.agents.some((a) => a.dead)) { P.agents = P.agents.filter((a) => !a.dead); P.byId = new Map(P.agents.map((a) => [a.id, a])); }
    // population history for the chart: one sample every half second of play
    P.histT += dt / Math.max(api.S.speed, 0.01) / 1;
    if (P.histT >= 0.5) { P.histT = 0; P.hist.push(counts()); if (P.hist.length > 120) P.hist.shift(); }
    flushEvents(wall);
  }

  /* ---------- drawing ---------- */
  const STRIDE = 16;
  let buf = new Float32Array(256 * STRIDE);
  function pose(a) {
    if (a.sp === 'paramecium' || a.sp === 'euglena') {
      const amp = a.sp === 'paramecium' ? 10 : 3, w = a.st === 'fwd' ? 1 : 0.4;
      return [a.x - Math.sin(a.h) * amp * w * Math.sin(a.roll), a.y + Math.cos(a.h) * amp * w * Math.sin(a.roll), a.h + 0.08 * w * Math.cos(a.roll)];
    }
    return [a.x, a.y, a.h];
  }
  function pack() {
    const n = P.agents.length;
    if (buf.length < n * STRIDE) buf = new Float32Array(n * 2 * STRIDE);
    let i = 0;
    for (const a of P.agents) {
      const [x, y, h] = pose(a), o = i * STRIDE;
      let B0 = 0, B1 = 0, B2 = 0, B3 = 0, C0 = 0, C1 = 0, C2 = 0, C3 = 0, Aw = a.roll || 0, rad = 4;
      switch (a.sp) {
        case 'paramecium': B0 = a.L * a.g; B1 = a.W * (0.8 + 0.2 * a.g); B2 = a.seed; B3 = a.fv; rad = Math.hypot(B0 / 2 + 16, B1 / 2 + 16); break;
        case 'amoeba': B0 = a.R0 * a.g; B1 = a.seed; B2 = a.sq; Aw = a.sqA; [C0, C1, C2, C3] = a.vac; rad = B0 * 2.4 + 30; break;
        case 'euglena': B0 = a.L * a.g; B1 = a.W; B2 = Math.pow(Math.max(0, Math.sin(P.mt * 0.25 + a.seed)), 6); B3 = a.seed; rad = Math.hypot(B0 * 1.4 + 12, B1 * 1.6 + 14); break;
        case 'bacteria': B0 = 1; B1 = a.L * (0.6 + 0.4 * a.g); Aw = 0; rad = Math.hypot(B1 / 2 + 4, 6); break;
        case 'yeast': B0 = a.r; B1 = a.bud; B2 = a.seed; Aw = 0; rad = a.r * 2.9 + 2; break;
        case 'diatom': B0 = a.L; B1 = a.W; B2 = a.seed; Aw = 0; rad = Math.hypot(a.L / 2 + 8, a.W / 2 + 8); break;
        default: B0 = a.r; B1 = a.seed / 10; Aw = 0; rad = a.r + 2;
      }
      buf.set([x, y, h, Aw, B0, B1, B2, B3, C0, C1, C2, C3, a.k, a.z, rad, 0], o);
      i++;
    }
    return i;
  }
  let prog = null, U = {}, ext = null, qbuf = null, ibuf = null, glRef = null;
  function initGL(gl) {
    glRef = gl; ext = gl.getExtension('ANGLE_instanced_arrays');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, VSQ), fs = sh(gl.FRAGMENT_SHADER, api.LIB + FSQ_MAIN);
    if (!vs || !fs) return false;
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    ['aQ', 'aA', 'aB', 'aC', 'aK'].forEach((n, i) => gl.bindAttribLocation(prog, i, n));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); prog = null; return false; }
    for (const n of ['uC', 'uR', 'uDpr', 'uPx', 'uCam', 'uFocus', 'uTan', 'uDof', 'uT', 'uBeat', 'uMode', 'uRes']) U[n] = gl.getUniformLocation(prog, n);
    qbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    ibuf = gl.createBuffer();
    return true;
  }
  function drawGL(gl, u) {
    if (!prog) return;
    const n = pack(); if (!n) return;
    gl.useProgram(prog);
    gl.uniform2f(U.uC, u.cx, u.cy); gl.uniform1f(U.uR, u.R); gl.uniform1f(U.uDpr, u.dpr); gl.uniform1f(U.uPx, u.px);
    gl.uniform2f(U.uCam, u.camx, u.camy); gl.uniform1f(U.uFocus, u.focus); gl.uniform1f(U.uTan, u.tan); gl.uniform1f(U.uDof, u.dof);
    gl.uniform1f(U.uT, u.t); gl.uniform1f(U.uBeat, u.beat); gl.uniform1i(U.uMode, u.mode); gl.uniform2f(U.uRes, u.w, u.h);
    gl.enable(gl.BLEND);
    if (u.mode === 0) gl.blendFuncSeparate(gl.DST_COLOR, gl.SRC_COLOR, gl.ZERO, gl.ONE); // product of transmissions: exp(-sum OD)
    else gl.blendFuncSeparate(gl.ONE_MINUS_DST_COLOR, gl.ONE, gl.ZERO, gl.ONE); // screen: 1 - exp(-sum scatter)
    gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (ext) {
      gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n * STRIDE), gl.DYNAMIC_DRAW);
      for (let i = 1; i <= 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, (i - 1) * 16); ext.vertexAttribDivisorANGLE(i, 1); }
      ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, n);
      for (let i = 1; i <= 4; i++) { ext.vertexAttribDivisorANGLE(i, 0); gl.disableVertexAttribArray(i); }
    } else {
      for (let i = 1; i <= 4; i++) gl.disableVertexAttribArray(i);
      for (let j = 0; j < n; j++) {
        for (let i = 1; i <= 4; i++) gl.vertexAttrib4fv(i, buf.subarray(j * STRIDE + (i - 1) * 4, j * STRIDE + i * 4));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.disable(gl.BLEND);
  }
  // 2D fallback when WebGL is off: plain outlines at the same scale
  function draw2D(ctx, sx, sy, s, bf) {
    ctx.save();
    ctx.lineWidth = 1.2;
    for (const a of P.agents) {
      const [x, y, h] = pose(a);
      ctx.save(); ctx.translate(sx(x), sy(y)); ctx.rotate(-h); ctx.beginPath();
      if (a.sp === 'amoeba') { for (let t = 0; t <= 6.3; t += 0.15) { const R0 = a.R0 * a.g * (1 + 0.6 * Math.exp(-Math.pow(Math.atan2(Math.sin(t), Math.cos(t)), 2) / 0.2)); const px = Math.cos(t) * R0 * s, py = Math.sin(t) * R0 * s; t ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
      else if (a.L) ctx.ellipse(0, 0, Math.max(1, (a.L * a.g) / 2 * s), Math.max(0.7, (a.W || 1) / 2 * s), 0, 0, 7);
      else ctx.arc(0, 0, Math.max(0.8, (a.r || 1) * s), 0, 7);
      const col = COLORS[a.sp];
      ctx.fillStyle = bf ? `${col}55` : `${col}66`; ctx.strokeStyle = bf ? 'rgba(50,48,40,0.9)' : 'rgba(225,235,255,0.9)';
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(sx(0), sy(0), ARENA * s, 0, 7); ctx.strokeStyle = bf ? 'rgba(60,58,50,0.6)' : 'rgba(225,235,255,0.5)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  /* ---------- hit test and summary ---------- */
  function hit(w, tol) {
    let best = null, bd = 1e9;
    for (const a of P.agents) {
      if (a.cap) continue;
      const fake = { x: w.x, y: w.y, h: 0, ha: 0, cr: 0 };
      const d = segs(a, fake).d - a.cr;
      const sizeBias = FOOD.has(a.sp) ? 0.5 : 0; // prefer organisms when both are under the finger
      if (d < tol && d + sizeBias < bd) { bd = d + sizeBias; best = a; }
    }
    return best;
  }
  function summary() {
    const c = counts();
    const parts = SPECIES.filter((s) => c[s]).map((s) => `${c[s]} ${c[s] === 1 ? NAMES[s][0] : NAMES[s][1]}`);
    if (!parts.length) return COPY.empty;
    const eating = P.agents.filter((a) => a.cap).length;
    return `On the slide: ${parts.join(', ')}.${eating ? ` ${eating} ${eating === 1 ? 'piece of food is' : 'pieces of food are'} being swallowed right now.` : ''}`;
  }

  return {
    P, drop, clear, seed, step, counts, initGL, drawGL, draw2D, hit, summary, pose,
    get size() { return live().length; },
    get gl() { return !!prog; },
    LIFE, CAP,
  };
}
