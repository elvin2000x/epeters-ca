// Molecule lab: page controller. Owns the model (chem.js), the 3D bench (bench.js), the challenge list, the atom
// panel with live orbitals (../atom/atom.js), and the list mode that does everything without a mouse.
// Words on screen come from lab.json "ui" by key (placeholders until COPYWRITER writes them); every fact the page
// states points at sources.json. No external requests: all data is fetched from this site.
import * as chem from './chem.js';
import { createBench, webglAvailable } from './bench.js';
import { bindTheme } from '../common.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: progress lasts this visit */ } },
};

bindTheme($('#theme'));
const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });
let cfg, comp, src, elData;
try {
  [cfg, comp, src, elData] = await Promise.all([getJSON('lab.json'), getJSON('compounds.json'), getJSON('sources.json'), getJSON('../data/elements.json')]);
} catch (e) {
  $('#loadError').hidden = false;
  throw e;
}

/* ---------------- words ---------------- */
const ui = cfg.ui;
const t = (k, vars = {}) => String(ui[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (vars[x] != null ? String(vars[x]) : m));
for (const n of document.querySelectorAll('[data-ui]')) if (ui[n.dataset.ui]) n.textContent = ui[n.dataset.ui];
for (const n of document.querySelectorAll('[data-ui-label]')) if (ui[n.dataset.uiLabel]) n.setAttribute('aria-label', ui[n.dataset.uiLabel]);
for (const n of document.querySelectorAll('[data-ui-title]')) if (ui[n.dataset.uiTitle]) n.title = ui[n.dataset.uiTitle];
document.title = t('page.docTitle');
const SRC = src.sources;
const cite = (key) => {
  const s = SRC[key];
  if (!s) return null;
  return h('a', { href: s.url, class: 'cite', target: '_blank', rel: 'noopener', text: t('cite.' + key) !== 'cite.' + key ? t('cite.' + key) : s.cite });
};

/* ---------------- elements ---------------- */
const byElSym = new Map(elData.elements.map((e) => [e.symbol, e]));
const E = {};
const weights = {};
for (const e of cfg.elements) {
  const d = byElSym.get(e.symbol);
  E[e.symbol] = { ...e, name: d ? d.name : e.symbol, z: d ? d.z : e.z };
  if (d) weights[e.symbol] = parseFloat(String(d.weight).replace(/[^\d.].*$/, ''));
}
const ORDER_NAME = ['', t('bond.single'), t('bond.double'), t('bond.triple')];
const compounds = comp.compounds;
const compoundById = new Map(compounds.map((c) => [c.id, c]));
const cname = (c) => t('compound.' + c.id);

/* ---------------- state ---------------- */
let model = chem.blank();
const undo = [];
let selected = null;
let challengeId = store.get('cme-lab-challenge', cfg.challenges[0].id);
if (!cfg.challenges.some((c) => c.id === challengeId)) challengeId = cfg.challenges[0].id;
const done = new Set(store.get('cme-lab-done', []));
const found = new Set(store.get('cme-lab-found', []));
let celebratedFor = null;
let lobes = false;

function commit(fn) {
  undo.push(chem.clone(model));
  if (undo.length > 60) undo.shift();
  fn();
}

/* ---------------- labels for atoms (C1, H2, ...) ---------------- */
function labelOf(id) {
  const a = chem.atomById(model, id);
  if (!a) return '?';
  let n = 0;
  for (const x of model.atoms) { if (x.el === a.el) n++; if (x.id === id) break; }
  return `${a.el}${n}`;
}
const spokenAtom = (id) => { const a = chem.atomById(model, id); return t('atom.spoken', { name: E[a.el].name.toLowerCase(), label: labelOf(id) }); };

/* ---------------- bench ---------------- */
const hasGL = webglAvailable();
const benchWrap = $('#bench');
const strip = $('#strip');
let bench = null;
if (hasGL) {
  try {
    bench = createBench($('#stage'), {
      E,
      onPick: (id) => select(id === selected ? null : id, true),
      onBondRequest: (a, b) => requestBond(a, b),
      onBondTap: (b) => cycleBond(b),
      onTrash: (id) => removeAtom(id),
      isTrash: (x, y) => { const r = strip.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; },
      check: (a, b) => { const cur = chem.bondBetween(model, a, b); return chem.checkBond(E, model, a, b, cur ? cur.order + 1 : 1); },
      needs: () => new Set(model.atoms.filter((a) => !chem.isSatisfied(E, model, a.id)).map((a) => a.id)),
    });
  } catch (e) {
    console.warn('3D bench could not start, list mode only', e);
    bench = null;
  }
}
if (!bench) {
  document.body.classList.add('no-gl');
  $('#noGl').hidden = false;
}

function readTheme() {
  if (!bench) return;
  const cs = getComputedStyle(document.documentElement);
  const v = (k) => cs.getPropertyValue(k).trim();
  bench.setTheme({ dark: v('--lab-dark') === '1', bond: v('--lab-bond'), ion: v('--lab-ion'), halo: v('--accent'), bad: v('--lab-bad'), need: v('--lab-need'), lobe: v('--lab-lobe') });
}
readTheme();
new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

/* ---------------- the element shelf ---------------- */
for (const sym of cfg.shelf) {
  const e = E[sym];
  const b = h('button', { type: 'button', class: 'el-btn', 'data-el': sym, 'aria-label': t('shelf.add', { name: e.name, symbol: sym }), title: t('shelf.tip', { name: e.name }) },
    h('span', { class: 'el-dot', style: `--c:${e.color}` }), h('span', { class: 'el-sym', text: sym }), h('span', { class: 'el-name', text: e.name }));
  strip.append(b);
}
let shelfDrag = null;
strip.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('.el-btn');
  if (!b || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  shelfDrag = { el: b.dataset.el, x: ev.clientX, y: ev.clientY, moved: false, ghost: null, pid: ev.pointerId, btn: b };
  b.setPointerCapture(ev.pointerId);
});
strip.addEventListener('pointermove', (ev) => {
  const d = shelfDrag;
  if (!d || ev.pointerId !== d.pid) return;
  if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8 && bench) {
    d.moved = true;
    d.ghost = h('div', { class: 'ghost', 'aria-hidden': 'true', style: `--c:${E[d.el].color}` }, d.el);
    document.body.append(d.ghost);
  }
  if (d.ghost) d.ghost.style.transform = `translate(${ev.clientX - 22}px, ${ev.clientY - 22}px)`;
});
const endShelf = (ev, cancel) => {
  const d = shelfDrag;
  shelfDrag = null;
  if (!d) return;
  if (d.ghost) d.ghost.remove();
  if (cancel) return;
  if (!d.moved) { addFromShelf(d.el); d.btn.dataset.skipClick = '1'; return; }
  const dp = bench && bench.dropPoint(ev.clientX, ev.clientY);
  if (!dp) return;
  addAtom(d.el, { pos: dp.pos, bondTo: dp.onto, order: 1 });
};
strip.addEventListener('pointerup', (ev) => endShelf(ev, false));
strip.addEventListener('pointercancel', (ev) => endShelf(ev, true));
// keyboard (Enter or Space) on a shelf button arrives as a click with no pointer gesture before it
strip.addEventListener('click', (ev) => {
  const b = ev.target.closest('.el-btn');
  if (!b) return;
  if (b.dataset.skipClick) { delete b.dataset.skipClick; return; }
  addFromShelf(b.dataset.el);
});
function addFromShelf(el) {
  // with an atom selected, a tap on the shelf adds the new atom bonded to it (tap C, then H four times)
  addAtom(el, { bondTo: selected, order: 1, keepSelection: true });
}

/* ---------------- actions ---------------- */
function addAtom(el, { bondTo = null, order = 1, pos = null, keepSelection = false } = {}) {
  let why = null, note = null, id;
  commit(() => {
    id = chem.addAtom(model, el);
    if (bondTo != null && chem.atomById(model, bondTo)) {
      const r = chem.checkBond(E, model, id, bondTo, order);
      if (r.ok) { chem.setBond(model, id, bondTo, order, r.ionic); note = r.note; } else why = r.reason;
    }
  });
  const place = { id, pos, near: bondTo };
  if (!keepSelection) select(null);
  refresh(place);
  let msg = t('live.added', { atom: spokenAtom(id) });
  if (bondTo != null && !why) msg = t('live.addedBonded', { atom: spokenAtom(id), other: spokenAtom(bondTo), type: ORDER_NAME[order] });
  if (why) showWhy(why);
  else if (note) showNote(note);
  announce(msg);
  return id;
}

function requestBond(a, b, order) {
  const cur = chem.bondBetween(model, a, b);
  const want = order || (cur ? cur.order + 1 : 1);
  if (!order && cur && want > 3) { showWhy({ key: cur.ionic ? 'why.ionMax' : 'why.maxTriple', vars: { a: chem.atomById(model, a).el, b: chem.atomById(model, b).el } }); return false; }
  const r = chem.checkBond(E, model, a, b, want);
  if (!r.ok) { showWhy(r.reason); return false; }
  commit(() => chem.setBond(model, a, b, want, r.ionic));
  refresh();
  if (r.note) showNote(r.note);
  else hideToast();
  announce(t(r.ionic ? 'live.ionic' : 'live.bonded', { a: spokenAtom(a), b: spokenAtom(b), type: ORDER_NAME[want], n: want }));
  return true;
}

function cycleBond(bond) {
  const next = bond.order < 3 ? bond.order + 1 : 1;
  if (next === 1) return setOrder(bond.a, bond.b, 1);
  const r = chem.checkBond(E, model, bond.a, bond.b, next);
  if (r.ok) return setOrder(bond.a, bond.b, next);
  if (bond.order > 1) return setOrder(bond.a, bond.b, 1);
  showWhy(r.reason);
}
function setOrder(a, b, order) {
  if (order === 0) {
    commit(() => chem.setBond(model, a, b, 0));
    refresh();
    announce(t('live.broken', { a: spokenAtom(a), b: spokenAtom(b) }));
    return;
  }
  const r = chem.checkBond(E, model, a, b, order);
  if (!r.ok) { showWhy(r.reason); refresh(); return; }
  commit(() => chem.setBond(model, a, b, order, r.ionic));
  refresh();
  if (r.note) showNote(r.note);
  announce(t('live.changed', { a: spokenAtom(a), b: spokenAtom(b), type: ORDER_NAME[order], n: order }));
}

function removeAtom(id) {
  const name = spokenAtom(id);
  commit(() => chem.removeAtom(model, id));
  if (selected === id) select(null);
  refresh();
  announce(t('live.removed', { atom: name }));
}

function fillHydrogens() {
  const targets = model.atoms.filter((a) => a.el !== 'H' && !E[a.el].metal).map((a) => [a.id, chem.openSlots(E, model, a.id)]).filter(([, n]) => n > 0);
  if (!targets.length) { showNote({ key: 'note.fillNothing', vars: {} }); return; }
  let added = 0;
  commit(() => {
    for (const [id, n] of targets) for (let k = 0; k < n; k++) {
      const hid = chem.addAtom(model, 'H');
      chem.setBond(model, hid, id, 1, false);
      added++;
    }
  });
  refresh();
  announce(t('live.filled', { n: added }));
}

function clearAll() {
  if (!model.atoms.length) return;
  commit(() => { model = chem.blank(); });
  select(null);
  celebratedFor = null;
  refresh();
  announce(t('live.cleared'));
}

function doUndo() {
  if (!undo.length) return;
  model = undo.pop();
  if (selected != null && !chem.atomById(model, selected)) select(null);
  refresh();
  announce(t('live.undone'));
}

function giveAtoms() {
  const ch = cfg.challenges.find((c) => c.id === challengeId);
  const target = compoundById.get(ch.targets[0]);
  const counts = chem.parseFormula(target.formula);
  commit(() => {
    for (const [el, n] of Object.entries(counts)) for (let k = 0; k < n; k++) chem.addAtom(model, el);
  });
  refresh();
  announce(t('live.gave', { formula: target.formula }));
}

/* ---------------- selection and the atom panel ---------------- */
function select(id, fromBench) {
  selected = id;
  if (bench) bench.select(id);
  renderSelectionBar();
  renderAtomPanel();
  if (id != null && fromBench) {
    if (matchMedia('(min-width: 980px)').matches) showTab('atom');
    announce(t('live.selected', { atom: spokenAtom(id), used: chem.usage(model, id).total, max: chem.maxSlots(E, model, id) }));
  }
}

function renderSelectionBar() {
  const bar = $('#selBar');
  bar.replaceChildren();
  if (selected == null || !chem.atomById(model, selected)) { bar.hidden = true; return; }
  bar.hidden = false;
  const a = chem.atomById(model, selected);
  const u = chem.usage(model, selected);
  bar.append(
    h('span', { class: 'sel-text', text: t('sel.text', { name: E[a.el].name, label: labelOf(selected), used: u.total, max: chem.maxSlots(E, model, selected) }) }),
    h('button', { type: 'button', class: 'mini', text: t('sel.details'), onclick: () => { showTab('atom'); $('#tabpanel-atom').scrollIntoView({ block: 'start', behavior: reduceMQ.matches ? 'auto' : 'smooth' }); } }),
    h('button', { type: 'button', class: 'mini', text: t('sel.remove'), onclick: () => removeAtom(selected) }),
    h('button', { type: 'button', class: 'mini', text: t('sel.done'), 'aria-label': t('sel.doneLabel'), onclick: () => select(null) }),
  );
}

let atomViewer = null, atomViewerZ = null, atomMod = null;
async function showOrbitals(z) {
  const box = $('#orbitals');
  if (z == null) {
    if (atomViewer && atomMod) { atomMod.unmount(box); atomViewer = null; atomViewerZ = null; }
    return;
  }
  if (!atomMod) atomMod = await import('../atom/atom.js');
  if (atomViewer && atomViewerZ === z) return;
  if (atomViewer) atomViewer.setElement(z);
  else atomViewer = atomMod.mount(box, z, { mode: 'orbital', ui: true, info: true, zoom: false });
  atomViewerZ = z;
}

function renderAtomPanel() {
  const body = $('#atomBody');
  body.replaceChildren();
  if (selected == null || !chem.atomById(model, selected)) {
    body.append(h('p', { class: 'muted', text: t('atom.empty') }));
    $('#orbitalsWrap').hidden = true;
    showOrbitals(null);
    return;
  }
  const id = selected, a = chem.atomById(model, id), e = E[a.el];
  const u = chem.usage(model, id);
  const charge = u.ion ? (e.metal ? u.ion : -u.ion) : 0;
  const shape = chem.shapeOf(E, model, id);
  body.append(h('h3', { class: 'atom-title' }, h('span', { class: 'el-dot', style: `--c:${e.color}` }), `${e.name} (${labelOf(id)})`));
  const dl = h('dl', { class: 'facts' });
  const row = (k, v) => dl.append(h('dt', { text: k }), h('dd', {}, v));
  if (e.metal) row(t('atom.ionLinks'), t('atom.ionValue', { used: u.total, options: e.charges.join(t('atom.or')) }));
  else row(t('atom.bonds'), t('atom.bondsValue', { used: u.total, options: e.valences.join(t('atom.or')) }));
  const open = chem.openSlots(E, model, id);
  row(t('atom.status'), chem.isSatisfied(E, model, id) ? t('atom.complete') : t('atom.needs', { n: open }));
  if (charge) row(t('atom.charge'), t(charge > 0 ? 'atom.chargePos' : 'atom.chargeNeg', { n: Math.abs(charge) }));
  if (!e.metal) row(t('atom.lonePairs'), String(chem.lonePairs(E, model, id)));
  if (shape && shape.structure) {
    row(t('atom.shape'), h('span', {}, t('shape.' + shape.structure), ' ', h('span', { class: 'muted', text: t('atom.shapeDetail', { regions: shape.regions, lone: shape.lone, pair: t('shape.' + shape.pair) }) })));
    if (bench && shape.bonds <= 6) row(t('atom.angles'), h('ul', { class: 'angles', id: 'angleList' }));
    const about = ui['shapeAbout.' + shape.structure];
    if (about) body.append(dl, h('p', { class: 'note' }, about, ' ', cite('os-chem-7-6')));
    else body.append(dl);
  } else body.append(dl);
  // bonds of this atom, each with an order picker and a break button
  const bl = chem.bondsOf(model, id);
  if (bl.length) {
    const ul = h('ul', { class: 'bond-list', 'aria-label': t('atom.bondList') });
    for (const b of bl) ul.append(bondRow(b));
    body.append(h('h4', { text: t('atom.bondList') }), ul);
  }
  body.append(h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn', text: t('atom.remove'), onclick: () => removeAtom(id) }),
    h('a', { class: 'btn ghost', href: `../atom/#${a.el}`, text: t('atom.openViewer', { name: e.name }) })));
  $('#orbitalsWrap').hidden = false;
  $('#orbitalsTitle').textContent = t('atom.orbitalsTitle', { name: e.name });
  if ($('#tabpanel-atom').hidden === false) showOrbitals(e.z);
  updateAngles();
}

// bond angles come from the live drawing, which keeps relaxing after a change, so they refresh on a timer
// (only the list items are rewritten, so keyboard focus elsewhere in the panel is never lost)
function updateAngles() {
  const list = $('#angleList');
  if (!list || !bench || selected == null) return;
  const angs = bench.angles(selected);
  const text = angs.map((g) => t('atom.angle', { a: labelOf(g.a), c: labelOf(selected), b: labelOf(g.b), deg: g.deg.toFixed(1) }));
  if (list.children.length !== text.length) list.replaceChildren(...text.map((x) => h('li', { text: x })));
  else text.forEach((x, i) => { if (list.children[i].textContent !== x) list.children[i].textContent = x; });
}
setInterval(() => { if (!$('#tabpanel-atom').hidden) updateAngles(); }, 400);

function bondRow(b) {
  const sel = h('select', { 'aria-label': t('list.orderFor', { a: labelOf(b.a), b: labelOf(b.b) }) });
  for (let o = 1; o <= 3; o++) sel.append(new Option(b.ionic ? t('bond.ionicN', { n: o }) : ORDER_NAME[o], String(o), false, o === b.order));
  sel.addEventListener('change', () => setOrder(b.a, b.b, +sel.value));
  return h('li', {},
    h('span', { text: t(b.ionic ? 'list.ionRow' : 'list.bondRow', { a: labelOf(b.a), b: labelOf(b.b), type: ORDER_NAME[b.order], n: b.order }) }),
    sel,
    h('button', { type: 'button', class: 'mini', text: t('list.break'), 'aria-label': t('list.breakLabel', { a: labelOf(b.a), b: labelOf(b.b) }), onclick: () => setOrder(b.a, b.b, 0) }));
}

/* ---------------- list mode (keyboard and screen reader route) ---------------- */
const addEl = $('#addEl'), addTo = $('#addTo'), addOrder = $('#addOrder');
const bondA = $('#bondA'), bondB = $('#bondB'), bondOrder = $('#bondOrder');
for (const sym of cfg.shelf) addEl.append(new Option(`${E[sym].name} (${sym})`, sym));
for (const sel of [addOrder, bondOrder]) for (let o = 1; o <= 3; o++) sel.append(new Option(ORDER_NAME[o], String(o)));
$('#addForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const to = addTo.value ? +addTo.value : null;
  addAtom(addEl.value, { bondTo: to, order: +addOrder.value, keepSelection: true });
});
$('#bondForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = +bondA.value, b = +bondB.value;
  if (!a || !b) return;
  if (a === b) { showWhy({ key: 'why.self', vars: {} }); return; }
  requestBond(a, b, +bondOrder.value);
});

function atomOptionText(id) {
  const a = chem.atomById(model, id);
  const open = chem.openSlots(E, model, id);
  return t(open ? 'list.optNeeds' : 'list.optFull', { label: labelOf(id), name: E[a.el].name, n: open });
}
function fillAtomSelect(sel, withNone) {
  const keep = sel.value;
  sel.replaceChildren();
  if (withNone) sel.append(new Option(t('list.none'), ''));
  for (const a of model.atoms) sel.append(new Option(atomOptionText(a.id), String(a.id)));
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
function renderList() {
  fillAtomSelect(addTo, true);
  fillAtomSelect(bondA, false);
  fillAtomSelect(bondB, false);
  if (bondB.options.length > 1 && bondB.value === bondA.value) bondB.selectedIndex = Math.min(1, bondB.options.length - 1);
  $('#bondForm button').disabled = model.atoms.length < 2;
  const ul = $('#atomList');
  ul.replaceChildren();
  if (!model.atoms.length) ul.append(h('li', { class: 'muted', text: t('list.emptyAtoms') }));
  for (const a of model.atoms) {
    const u = chem.usage(model, a.id);
    const nbs = chem.bondsOf(model, a.id).map((b) => labelOf(chem.other(b, a.id)));
    const ok = chem.isSatisfied(E, model, a.id);
    ul.append(h('li', {},
      h('span', { text: t('list.atomRow', { label: labelOf(a.id), name: E[a.el].name, used: u.total, max: chem.maxSlots(E, model, a.id), partners: nbs.length ? nbs.join(', ') : t('list.nobody'), status: ok ? t('atom.complete') : t('atom.needs', { n: chem.openSlots(E, model, a.id) }) }) }),
      h('button', { type: 'button', class: 'mini', text: t('list.details'), 'aria-label': t('list.detailsLabel', { label: labelOf(a.id) }), onclick: () => { select(a.id); showTab('atom'); $('#atomBody h3')?.setAttribute('tabindex', '-1'); $('#atomBody h3')?.focus(); } }),
      h('button', { type: 'button', class: 'mini', text: t('list.remove'), 'aria-label': t('list.removeLabel', { label: labelOf(a.id) }), onclick: () => removeAtom(a.id) })));
  }
  const bl = $('#bondList');
  bl.replaceChildren();
  if (!model.bonds.length) bl.append(h('li', { class: 'muted', text: t('list.emptyBonds') }));
  for (const b of model.bonds) bl.append(bondRow(b));
}

/* ---------------- formula, names, challenges ---------------- */
function formulaNode(f) {
  const span = h('span', { class: 'formula' });
  for (const [sym, n] of chem.formulaParts(f)) { span.append(sym); if (n > 1) span.append(h('sub', { text: String(n) })); }
  return span;
}
let lastSpoken = '';
function renderReadout(desc) {
  const box = $('#readout');
  box.replaceChildren();
  if (!desc.length) {
    box.append(h('span', { class: 'muted', text: t('formula.empty') }));
    return '';
  }
  const spoken = [];
  desc.forEach((d, i) => {
    if (i) box.append(h('span', { class: 'plus', text: ' + ' }));
    const name = d.match ? cname(d.match) : null;
    const chip = h('span', { class: 'mol' + (d.complete ? ' is-complete' : '') }, formulaNode(d.formula));
    if (name) chip.append(h('span', { class: 'mol-name', text: name }));
    else if (!d.complete) chip.append(h('span', { class: 'mol-need', text: t('formula.needs', { n: d.needs }) }));
    else chip.append(h('span', { class: 'mol-need', text: t(d.ionic ? 'formula.unknownIonic' : 'formula.unknown') }));
    box.append(chip);
    spoken.push(name ? t('live.formulaNamed', { formula: d.formula, name }) : t(d.complete ? 'live.formulaDone' : 'live.formulaNeeds', { formula: d.formula, n: d.needs }));
  });
  if (desc.length === 1) {
    const mass = chem.molarMass(desc[0].counts, weights);
    if (mass) box.append(h('span', { class: 'mass', title: t('formula.massTip'), text: t('formula.mass', { mass: mass.toFixed(2) }) }));
  }
  // isomer notes: same atoms, different arrangement (os-chem-2-4)
  const notes = $('#isoNote');
  notes.replaceChildren();
  for (const d of desc) {
    if (!d.complete || d.ionic || !d.sameFormula.length) continue;
    const names = d.sameFormula.map(cname).filter((n, i, a) => a.indexOf(n) === i).join(t('atom.or'));
    notes.append(h('p', {}, t(d.match ? 'note.isomerOf' : 'note.isomer', { name: d.match ? cname(d.match) : '', others: names, formula: d.formula }), ' ', cite('os-chem-2-4')));
  }
  notes.hidden = !notes.childNodes.length;
  return spoken.join('. ');
}

function renderChallenges(desc) {
  const ch = cfg.challenges.find((c) => c.id === challengeId);
  const target = compoundById.get(ch.targets[0]);
  const goal = $('#goal');
  goal.replaceChildren(...[
    h('span', { class: 'goal-label', text: t('goal.label') }),
    h('strong', { text: t('challenge.' + ch.id + '.title') }), ' ', formulaNode(target.formula),
    done.has(ch.id) ? h('span', { class: 'tick', text: t('goal.done') }) : null].filter(Boolean));
  const list = $('#challengeList');
  list.replaceChildren();
  for (const c of cfg.challenges) {
    const tg = compoundById.get(c.targets[0]);
    list.append(h('li', {}, h('button', { type: 'button', class: 'ch-btn' + (c.id === challengeId ? ' is-current' : ''), 'aria-pressed': String(c.id === challengeId), onclick: () => pickChallenge(c.id) },
      h('span', { class: 'ch-title', text: t('challenge.' + c.id + '.title') }),
      formulaNode(tg.formula),
      h('span', { class: 'ch-level', text: t('level.' + c.level) }),
      done.has(c.id) ? h('span', { class: 'tick', text: t('goal.done') }) : h('span', { class: 'sr-only', text: t('goal.notDone') }))));
  }
  const card = $('#challengeCard');
  const counts = chem.parseFormula(target.formula);
  const need = Object.entries(counts).map(([el, n]) => t('hint.count', { n, name: n > 1 ? E[el].name.toLowerCase() : E[el].name.toLowerCase(), symbol: el })).join(', ');
  card.replaceChildren(
    h('h3', { text: t('challenge.' + ch.id + '.title') }),
    h('p', {}, t('challenge.' + ch.id + '.goal')),
    h('details', { class: 'hint' }, h('summary', { text: t('hint.show') }), h('p', { text: t('hint.atoms', { list: need }) }), h('p', { text: t('challenge.' + ch.id + '.hint') })),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', text: t('hint.giveAtoms'), onclick: giveAtoms })),
  );
  if (ch.targets.length > 1) card.append(h('p', { class: 'muted small', text: t('challenge.' + ch.id + '.forms') }));
  $('#foundCount').textContent = t('found.count', { n: [...found].filter((id) => compoundById.has(id)).length, total: new Set(compounds.map((c) => c.id.replace(/-open$/, ''))).size });
  const fl = $('#foundList');
  fl.replaceChildren();
  for (const c of compounds) if (found.has(c.id)) fl.append(h('li', {}, formulaNode(c.formula), ' ', cname(c)));
}

function pickChallenge(id) {
  challengeId = id;
  store.set('cme-lab-challenge', id);
  celebratedFor = null;
  refresh();
  announce(t('live.challenge', { title: t('challenge.' + id + '.title') }));
}

function checkWins(desc) {
  const matched = new Set(desc.filter((d) => d.match).map((d) => d.match.id));
  for (const raw of matched) { const id = raw.replace(/-open$/, ''); if (!found.has(id)) { found.add(id); store.set('cme-lab-found', [...found]); } }
  let win = null;
  for (const c of cfg.challenges) {
    if (!c.targets.some((x) => matched.has(x))) continue;
    if (!done.has(c.id)) { done.add(c.id); store.set('cme-lab-done', [...done]); }
    if (c.id === challengeId) win = c;
  }
  const key = win ? win.id + '|' + model.atoms.length : null;
  if (win && celebratedFor !== key) { celebratedFor = key; celebrate(win, desc); }
}

function celebrate(ch, desc) {
  const hit = desc.find((d) => d.match && ch.targets.includes(d.match.id));
  const c = hit.match;
  const box = $('#win');
  const next = cfg.challenges.find((x) => !done.has(x.id));
  const real = c.gallery ? h('a', { class: 'btn primary', href: `../molecules/#${c.gallery}`, text: t('win.real') }) : null;
  box.replaceChildren(
    h('h2', { id: 'winTitle', tabindex: '-1', text: t('win.title', { name: cname(c) }) }),
    h('p', {}, formulaNode(c.formula), ' ', t('challenge.' + ch.id + '.win'), ' ', ...(cfg.challenges.find((x) => x.id === ch.id).sources || []).map((k) => cite(k)), ' ', cite(c.source)),
    h('div', { class: 'row' },
      real,
      next ? h('button', { type: 'button', class: 'btn' + (real ? '' : ' primary'), text: t('win.next', { title: t('challenge.' + next.id + '.title') }), onclick: () => { closeWin(); clearAll(); pickChallenge(next.id); } }) : h('span', { class: 'muted', text: t('win.allDone') }),
      h('button', { type: 'button', class: 'btn ghost', text: t('win.keep'), onclick: closeWin })));
  box.hidden = false;
  $('#winTitle').focus({ preventScroll: true });
  announce(t('live.win', { name: cname(c) }));
  if (bench) bench.celebrate();
  if (!reduceMQ.matches) confetti();
}
function closeWin() { $('#win').hidden = true; }
function confetti() {
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  const cols = cfg.shelf.map((s) => E[s].color);
  for (let i = 0; i < 36; i++) {
    layer.append(h('i', { style: `--x:${Math.random() * 100}%;--d:${0.9 + Math.random() * 0.9}s;--r:${Math.random() * 720 - 360}deg;--c:${cols[i % cols.length]};--delay:${Math.random() * 0.25}s` }));
  }
  benchWrap.append(layer);
  setTimeout(() => layer.remove(), 2200);
}

/* ---------------- toast and live region ---------------- */
const toast = $('#toast');
let toastTimer = 0;
function showWhy(reason) { showToast(t(reason.key, reason.vars), cfg.whySources[reason.key], 'why'); }
function showNote(note) { showToast(t(note.key, note.vars), cfg.whySources[note.key], 'note'); }
function showToast(text, sourceKey, kind) {
  clearTimeout(toastTimer);
  toast.replaceChildren(...[h('span', { class: 'toast-icon', 'aria-hidden': 'true', text: kind === 'why' ? '!' : 'i' }), h('span', { text }), sourceKey ? cite(sourceKey) : null,
    h('button', { type: 'button', class: 'toast-x', 'aria-label': t('toast.close'), text: '×', onclick: hideToast })].filter(Boolean));
  toast.className = 'toast is-' + kind;
  toast.hidden = false;
  toastTimer = setTimeout(hideToast, kind === 'why' ? 9000 : 6000);
}
function hideToast() { toast.hidden = true; }
const live = $('#live');
let liveTimer = 0;
function announce(msg) {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    const extra = lastSpoken ? ' ' + t('live.bench', { status: lastSpoken }) : '';
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = msg + extra; });
  }, 120);
}

/* ---------------- refresh: one place that redraws everything from the model ---------------- */
function refresh(place) {
  const desc = chem.describe(E, model, compounds);
  if (bench) bench.sync(model, place);
  lastSpoken = renderReadout(desc);
  renderList();
  checkWins(desc);
  renderChallenges(desc);
  renderSelectionBar();
  renderAtomPanel();
  $('#undoBtn').disabled = !undo.length;
  writeHash();
}

/* ---------------- tabs ---------------- */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function showTab(name) {
  for (const tb of tabs) {
    const on = tb.dataset.tab === name;
    tb.setAttribute('aria-selected', String(on));
    tb.tabIndex = on ? 0 : -1;
    $('#tabpanel-' + tb.dataset.tab).hidden = !on;
  }
  store.set('cme-lab-tab', name);
  if (name === 'atom' && selected != null && chem.atomById(model, selected)) {
    if (bench) bench.settle();
    renderAtomPanel();
    showOrbitals(E[chem.atomById(model, selected).el].z);
  } else if (name !== 'atom') showOrbitals(null);
}
for (const tb of tabs) {
  tb.addEventListener('click', () => showTab(tb.dataset.tab));
  tb.addEventListener('keydown', (ev) => {
    const i = tabs.indexOf(tb);
    let j = null;
    if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'Home') j = 0;
    else if (ev.key === 'End') j = tabs.length - 1;
    if (j == null) return;
    ev.preventDefault();
    showTab(tabs[j].dataset.tab);
    tabs[j].focus();
  });
}

/* ---------------- toolbar, keys ---------------- */
$('#fillBtn').addEventListener('click', fillHydrogens);
$('#undoBtn').addEventListener('click', doUndo);
$('#clearBtn').addEventListener('click', clearAll);
$('#fitBtn').addEventListener('click', () => bench && bench.fit());
const lobeBtn = $('#lobeBtn');
lobeBtn.addEventListener('click', () => {
  lobes = !lobes;
  lobeBtn.setAttribute('aria-pressed', String(lobes));
  if (bench) bench.setLonePairs(lobes);
  announce(t(lobes ? 'live.lobesOn' : 'live.lobesOff'));
});
$('#shareBtn').addEventListener('click', async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); showNote({ key: 'note.copied', vars: {} }); }
  catch (e) { showNote({ key: 'note.copyFailed', vars: {} }); }
});
addEventListener('keydown', (ev) => {
  const tg = ev.target;
  if (tg.closest && tg.closest('input, select, textarea, [contenteditable]')) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); doUndo(); return; }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'Escape') { if (!$('#win').hidden) closeWin(); else if (!toast.hidden) hideToast(); else select(null); return; }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected != null && !tg.closest('button, a')) { ev.preventDefault(); removeAtom(selected); return; }
  if (tg.closest && tg.closest('button, a, summary')) return;
  const map = cfg.keys || {};
  if (map[ev.key.toLowerCase()]) { ev.preventDefault(); addFromShelf(map[ev.key.toLowerCase()]); }
});

/* ---------------- share links: #b=C.H.H.H.H_0-1-1.0-2-1 ---------------- */
function writeHash() {
  let s = '';
  if (model.atoms.length) {
    const idx = new Map(model.atoms.map((a, i) => [a.id, i]));
    s = '#b=' + model.atoms.map((a) => a.el).join('.') + '_' + model.bonds.map((b) => `${idx.get(b.a)}-${idx.get(b.b)}-${b.order}${b.ionic ? 'i' : ''}`).join('.');
  }
  if (location.hash !== s) history.replaceState(null, '', location.pathname + location.search + s);
}
function readHash() {
  const m = /^#b=([A-Za-z.]*)_([\d.i-]*)$/.exec(location.hash);
  if (!m) return false;
  const els = m[1] ? m[1].split('.') : [];
  if (!els.length || els.length > 80 || els.some((e) => !E[e])) return false;
  const next = chem.blank();
  const ids = els.map((e) => chem.addAtom(next, e));
  for (const part of m[2] ? m[2].split('.') : []) {
    const bm = /^(\d+)-(\d+)-([123])i?$/.exec(part);
    if (!bm) continue;
    const a = ids[+bm[1]], b = ids[+bm[2]];
    if (a == null || b == null) continue;
    const r = chem.checkBond(E, next, a, b, +bm[3]);
    if (r.ok) chem.setBond(next, a, b, +bm[3], r.ionic);
  }
  model = next;
  return true;
}

/* ---------------- start ---------------- */
$('#modelNote').append(' ', cite('os-chem-7-6'), ' ', cite('os-chem-7-3'));
const srcList = $('#sourceList');
for (const [k, s] of Object.entries(SRC)) {
  if (k.startsWith('pubchem-')) continue;
  srcList.append(h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.cite }), h('span', { class: 'muted', text: ' ' + (s.used_for || '') })));
}
const pc = Object.entries(SRC).filter(([k]) => k.startsWith('pubchem-'));
srcList.append(h('li', {}, t('sources.pubchem', { n: pc.length }), ' ', ...pc.map(([, s], i) => [i ? ', ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.cite.replace(/^PubChem Compound /, '').replace(/\. National Library of Medicine\.$/, '') })]).flat()));

readHash();
showTab(bench ? store.get('cme-lab-tab', 'challenges') : 'list');
refresh();
if (bench) bench.setLonePairs(lobes);
window.__lab = { get model() { return model; }, E, chem };
