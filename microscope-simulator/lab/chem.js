// Molecule lab chemistry: the bonding rules, formulas, compound matching and VSEPR shape names.
// Pure functions, no DOM and no three.js, so the bench, the list mode and tools can all share one set of rules.
//
// The model is plain data: { atoms: [{ id, el }], bonds: [{ a, b, order, ionic }], nextId }.
// A bond joins two atom ids. order is 1, 2 or 3. ionic=true marks a metal-to-nonmetal ionic link, where order
// counts the electrons handed over (Ca to O carries 2).
// Rules (sources in sources.json):
//   covalent atoms make bonds until they reach a usual bond count (H 1, C 4, N 3, O 2, Cl 1; P 3 or 5; S 2, 4 or 6)
//     os-chem-7-3 (octet rule, H needs two electrons, group 15 three bonds, group 16 two bonds, PCl5 and SF6)
//   metals (Na, Ca, Fe) give electrons to O, S or Cl: Na 1, Ca 2, Fe 2 or 3; O and S take 2, Cl takes 1
//     os-chem-2-6 and os-chem-7-1
//   a single, double or triple bond is one region of electron density; lone pairs push harder than bonds
//     os-chem-7-6 (VSEPR)

export const blank = () => ({ atoms: [], bonds: [], nextId: 1 });
export const clone = (m) => ({ atoms: m.atoms.map((a) => ({ ...a })), bonds: m.bonds.map((b) => ({ ...b })), nextId: m.nextId });

export function addAtom(m, el) {
  const id = m.nextId++;
  m.atoms.push({ id, el });
  return id;
}
export function removeAtom(m, id) {
  m.atoms = m.atoms.filter((a) => a.id !== id);
  m.bonds = m.bonds.filter((b) => b.a !== id && b.b !== id);
}
export const atomById = (m, id) => m.atoms.find((a) => a.id === id);
export const bondBetween = (m, a, b) => m.bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
export const bondsOf = (m, id) => m.bonds.filter((x) => x.a === id || x.b === id);
export const other = (bond, id) => (bond.a === id ? bond.b : bond.a);

export function usage(m, id) {
  let cov = 0, ion = 0, n = 0;
  for (const b of bondsOf(m, id)) { if (b.ionic) ion += b.order; else cov += b.order; n++; }
  return { cov, ion, total: cov + ion, neighbours: n };
}

/** Highest bond count this atom may reach right now. With an ionic link, an S stays at its basic 2. */
export function maxSlots(E, m, id) {
  const e = E[atomById(m, id).el];
  if (e.metal) return Math.max(...e.charges);
  const u = usage(m, id);
  return u.ion > 0 ? e.valences[0] : Math.max(...e.valences);
}

export function isSatisfied(E, m, id) {
  const e = E[atomById(m, id).el];
  const u = usage(m, id);
  return (e.metal ? e.charges : e.valences).includes(u.total);
}

/** Bonds still needed to reach the next usual count (0 when satisfied). */
export function openSlots(E, m, id) {
  const e = E[atomById(m, id).el];
  const u = usage(m, id);
  const list = e.metal ? e.charges : e.valences;
  if (list.includes(u.total)) return 0;
  const next = list.find((v) => v > u.total);
  return next == null ? 0 : next - u.total;
}

/**
 * Can the bond between atoms a and b become `order` (1..3)? Covers making a new bond (current 0) and changing one.
 * Returns { ok, ionic, reason: { key, vars }, note } where reason/note are keys into lab.json "ui" with fill-ins.
 */
export function checkBond(E, m, a, b, order) {
  const A = atomById(m, a), B = atomById(m, b);
  if (!A || !B) return { ok: false, reason: { key: 'why.gone', vars: {} } };
  if (a === b) return { ok: false, reason: { key: 'why.self', vars: {} } };
  const ea = E[A.el], eb = E[B.el];
  const cur = bondBetween(m, a, b);
  const was = cur ? cur.order : 0;
  const delta = order - was;
  const names = { a: ea.symbol, b: eb.symbol };
  if (ea.metal && eb.metal) return { ok: false, reason: { key: 'why.metalMetal', vars: names } };
  const ionic = ea.metal || eb.metal;
  if (order < 1) return { ok: true, ionic };
  if (order > 3) return { ok: false, reason: { key: 'why.maxTriple', vars: names } };
  if (ionic) {
    const metal = ea.metal ? A : B, non = ea.metal ? B : A;
    const em = E[metal.el], en = E[non.el];
    if (!en.anion) return { ok: false, reason: { key: 'why.metalPartner', vars: { metal: em.symbol, el: en.symbol } } };
    const um = usage(m, metal.id), un = usage(m, non.id);
    const maxM = Math.max(...em.charges);
    if (um.total + delta > maxM) return { ok: false, reason: { key: 'why.metalFull', vars: { metal: em.symbol, charge: maxM, used: um.total } } };
    if (un.cov > en.valences[0]) return { ok: false, reason: { key: 'why.expandedNoIon', vars: { el: en.symbol } } };
    if (un.total + delta > en.valences[0]) return { ok: false, reason: { key: 'why.anionFull', vars: { el: en.symbol, max: en.valences[0], used: un.total } } };
    return { ok: true, ionic: true };
  }
  for (const [X, ex] of [[A, ea], [B, eb]]) {
    const u = usage(m, X.id);
    const max = maxSlots(E, m, X.id);
    if (u.total + delta > max) {
      if (ex.symbol === 'H') return { ok: false, reason: { key: 'why.hydrogen', vars: names } };
      const key = u.ion > 0 && ex.valences.length > 1 ? 'why.fullIon' : (was > 0 ? 'why.fullOrder' : 'why.full');
      return { ok: false, reason: { key, vars: { el: ex.symbol, max, used: u.total, order } } };
    }
  }
  // a note (not a refusal) when P or S goes past its basic count into an expanded octet
  let note = null;
  for (const [X, ex] of [[A, ea], [B, eb]]) {
    const after = usage(m, X.id).total + delta;
    if (ex.valences.length > 1 && after > ex.valences[0] && usage(m, X.id).total <= ex.valences[0]) note = { key: 'note.expanded', vars: { el: ex.symbol, n: after } };
  }
  return { ok: true, ionic: false, note };
}

export function setBond(m, a, b, order, ionic) {
  const cur = bondBetween(m, a, b);
  if (order < 1) { if (cur) m.bonds = m.bonds.filter((x) => x !== cur); return; }
  if (cur) { cur.order = order; cur.ionic = !!ionic; } else m.bonds.push({ a, b, order, ionic: !!ionic });
}

/** Connected groups of atom ids (each group is one molecule or formula unit on the bench). */
export function components(m) {
  const seen = new Set(), out = [];
  for (const a of m.atoms) {
    if (seen.has(a.id)) continue;
    const group = [], stack = [a.id];
    seen.add(a.id);
    while (stack.length) {
      const id = stack.pop();
      group.push(id);
      for (const b of bondsOf(m, id)) { const o = other(b, id); if (!seen.has(o)) { seen.add(o); stack.push(o); } }
    }
    out.push(group);
  }
  return out;
}

/* ---------------- formulas ---------------- */
export function countsOf(m, ids) {
  const c = {};
  for (const id of ids) { const el = atomById(m, id).el; c[el] = (c[el] || 0) + 1; }
  return c;
}
/** Hill order (hill-system): C, then H, then alphabetical; with no carbon, all alphabetical. Metals first when present (cation first). */
export function hillFormula(counts, E) {
  const els = Object.keys(counts);
  const metals = els.filter((e) => E[e] && E[e].metal).sort();
  const rest = els.filter((e) => !metals.includes(e));
  let order;
  if (rest.includes('C')) order = ['C', ...(rest.includes('H') ? ['H'] : []), ...rest.filter((e) => e !== 'C' && e !== 'H').sort()];
  else order = rest.sort();
  return [...metals, ...order].map((e) => e + (counts[e] > 1 ? counts[e] : '')).join('');
}
export function parseFormula(s) {
  let i = 0;
  const walk = () => {
    const out = {};
    while (i < s.length) {
      if (s[i] === '(') { i++; const inner = walk(); const m = /^\d+/.exec(s.slice(i)); const k = m ? +m[0] : 1; i += m ? m[0].length : 0; for (const e in inner) out[e] = (out[e] || 0) + inner[e] * k; }
      else if (s[i] === ')') { i++; return out; }
      else { const m = /^([A-Z][a-z]?)(\d*)/.exec(s.slice(i)); if (!m) throw new Error('bad formula ' + s); out[m[1]] = (out[m[1]] || 0) + (m[2] ? +m[2] : 1); i += m[0].length; }
    }
    return out;
  };
  return walk();
}
const sameCounts = (x, y) => { const k = Object.keys(x); return k.length === Object.keys(y).length && k.every((e) => x[e] === y[e]); };
/** Formula as HTML-free parts: [['H',2],['O',1]] so the page can render subscripts. */
export const formulaParts = (f) => [...f.matchAll(/([A-Z][a-z]?|\(|\))(\d*)/g)].map((x) => [x[1], x[2] ? +x[2] : 1]);

/* ---------------- graph matching ---------------- */
// Graph = { labels: ['O','H','H'], edges: [[0,1,order,ionic], ...] }. Two graphs match when some one-to-one mapping
// of atoms keeps every element and every bond with its order. Colour refinement first (fast reject), then backtracking.
export function graphOf(m, ids) {
  const idx = new Map(ids.map((id, i) => [id, i]));
  return {
    labels: ids.map((id) => atomById(m, id).el),
    edges: m.bonds.filter((b) => idx.has(b.a) && idx.has(b.b)).map((b) => [idx.get(b.a), idx.get(b.b), b.order, b.ionic ? 1 : 0]),
  };
}
function adjacency(g) {
  const adj = g.labels.map(() => new Map());
  for (const [a, b, o, ion] of g.edges) { const w = o + (ion ? 10 : 0); adj[a].set(b, w); adj[b].set(a, w); }
  return adj;
}
export function isomorphic(g1, g2) {
  const n = g1.labels.length;
  if (n !== g2.labels.length || g1.edges.length !== g2.edges.length) return false;
  const A1 = adjacency(g1), A2 = adjacency(g2);
  const dict = new Map();
  const code = (s) => { if (!dict.has(s)) dict.set(s, dict.size); return dict.get(s); };
  let c1 = g1.labels.map((l) => code(l)), c2 = g2.labels.map((l) => code(l));
  for (let round = 0; round < n; round++) {
    const sig = (c, A, i) => c[i] + '|' + [...A[i]].map(([j, w]) => c[j] + ':' + w).sort().join(',');
    const n1 = c1.map((_, i) => code(sig(c1, A1, i))), n2 = c2.map((_, i) => code(sig(c2, A2, i)));
    const stable = new Set(n1).size === new Set(c1).size;
    c1 = n1; c2 = n2;
    if (stable) break;
  }
  const hist = (c) => c.slice().sort((x, y) => x - y).join(',');
  if (hist(c1) !== hist(c2)) return false;
  // backtracking in breadth-first order so each new atom has a mapped neighbour to check against
  const order = [], seen = new Set();
  for (let s = 0; s < n; s++) {
    if (seen.has(s)) continue;
    const q = [s]; seen.add(s);
    while (q.length) { const v = q.shift(); order.push(v); for (const j of A1[v].keys()) if (!seen.has(j)) { seen.add(j); q.push(j); } }
  }
  const map = new Array(n).fill(-1), used = new Array(n).fill(false);
  const tryAt = (k) => {
    if (k === n) return true;
    const v = order[k];
    for (let w = 0; w < n; w++) {
      if (used[w] || c2[w] !== c1[v]) continue;
      let ok = true, mappedNb = 0;
      for (const [u, wt] of A1[v]) {
        if (map[u] < 0) continue;
        mappedNb++;
        if (A2[w].get(map[u]) !== wt) { ok = false; break; }
      }
      if (!ok) continue;
      let mappedNb2 = 0;
      for (const x of A2[w].keys()) if (used[x]) mappedNb2++;
      if (mappedNb2 !== mappedNb) continue;
      map[v] = w; used[w] = true;
      if (tryAt(k + 1)) return true;
      map[v] = -1; used[w] = false;
    }
    return false;
  };
  return tryAt(0);
}

/**
 * Describe each connected group on the bench: formula, whether every atom is satisfied, and which compound it is.
 * compounds: rows from compounds.json (covalent rows carry atoms+bonds, ionic rows only a formula).
 */
export function describe(E, m, compounds) {
  return components(m).map((ids) => {
    const counts = countsOf(m, ids);
    const complete = ids.every((id) => isSatisfied(E, m, id));
    const needs = ids.reduce((s, id) => s + openSlots(E, m, id), 0);
    const hasMetal = ids.some((id) => E[atomById(m, id).el].metal);
    const g = graphOf(m, ids);
    let match = null, sameFormula = [];
    for (const c of compounds) {
      const cc = c._counts || (c._counts = parseFormula(c.formula));
      if (!sameCounts(cc, counts)) continue;
      if (c.kind === 'ionic') { if (hasMetal && complete) match = match || c; else sameFormula.push(c); continue; }
      if (hasMetal) continue;
      const cg = c._graph || (c._graph = { labels: c.atoms, edges: c.bonds.map(([a, b, o]) => [a, b, o, 0]) });
      if (complete && !match && isomorphic(g, cg)) match = c; else sameFormula.push(c);
    }
    // glucose and glucose-open are two drawings of one compound, never isomer partners of each other
    const base = (c) => c.id.replace(/-open$/, '');
    sameFormula = sameFormula.filter((c) => c !== match && (!match || base(c) !== base(match)));
    sameFormula = sameFormula.filter((c, i, a) => a.findIndex((x) => base(x) === base(c)) === i);
    const formula = match ? match.formula : hillFormula(counts, E);
    return { ids, counts, formula, complete, needs, match, sameFormula, ionic: hasMetal };
  });
}

export function molarMass(counts, weights) {
  let s = 0;
  for (const e in counts) { if (weights[e] == null) return null; s += weights[e] * counts[e]; }
  return s;
}

/* ---------------- VSEPR ---------------- */
/**
 * Lone pairs on an atom in this simplified model: the valence electrons it owns (plus any gained from a metal) that are
 * not in covalent bonds, in pairs. Open slots on an unfinished atom count as future bonds, so a half-built carbon
 * does not sprout lone pairs. O with 2 bonds: (6-2)/2 = 2. N with 3: 1. S with 4: 1. P with 5: 0.
 */
export function lonePairs(E, m, id) {
  const e = E[atomById(m, id).el];
  if (e.metal) return 0;
  const u = usage(m, id);
  const bonding = Math.max(u.cov, e.valences[0] - u.ion);
  return Math.max(0, Math.floor((e.ve + u.ion - bonding) / 2));
}
/** Regions of electron density: each bonded neighbour (any bond order) plus each lone pair (os-chem-7-6). */
export function regions(E, m, id) {
  const cov = bondsOf(m, id).filter((b) => !b.ionic).length;
  return { bonds: cov, lone: cov ? lonePairs(E, m, id) : 0 };
}
// electron-pair geometry by number of regions, molecular structure by regions and lone pairs (os-chem-7-6, Figure 7.19)
export const PAIR_GEOMETRY = { 2: 'linear', 3: 'trigonalPlanar', 4: 'tetrahedral', 5: 'trigonalBipyramidal', 6: 'octahedral' };
export const STRUCTURE = {
  '2-0': 'linear', '3-0': 'trigonalPlanar', '3-1': 'bent', '4-0': 'tetrahedral', '4-1': 'trigonalPyramidal', '4-2': 'bent',
  '5-0': 'trigonalBipyramidal', '5-1': 'seesaw', '5-2': 'tShaped', '5-3': 'linear', '6-0': 'octahedral', '6-1': 'squarePyramidal', '6-2': 'squarePlanar',
};
export function shapeOf(E, m, id) {
  const r = regions(E, m, id);
  const total = r.bonds + r.lone;
  if (r.bonds < 2) return null;
  return { regions: total, bonds: r.bonds, lone: r.lone, pair: PAIR_GEOMETRY[total] || null, structure: STRUCTURE[`${total}-${r.lone}`] || null };
}
