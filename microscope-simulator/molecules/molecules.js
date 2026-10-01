/* Molecules of life: a gallery of molecules shown in Mol* 5.12.0 (loaded from ../vendor/molstar/ on first use).
   Content lives in data, never here:
   - molecules.json: descriptions, colour parts, and every UI word (the "ui" block, keyed).
   - sources.json: every source, with the date it was checked. residues.json: amino acid and nucleotide names and codes.
   - stories/<id>.json (optional, one per molecule): guided tour stops, story sections, highlights. A missing story
     leaves the page as it was. story-index.json (built by tools/build_story_index.py) lists which ids have a story, so the page does not ask
     for the others.
   - library.json (optional): more molecules (same shape as molecules.json entries), collections, molecule of the week.
   Elements and small-molecule formulas are counted here from the structure file's own atom list, never typed.
   Deep links: #<id> or an alias, e.g. #dna, #atp. ?el=<symbol> lights up one element (#hemoglobin?el=Fe).
   ?tour=<n> opens the guided tour at stop n (#hemoglobin?tour=2).
   Links (D1): ../data/links.json (built by tools/build_links.py) gives the cell parts that use each molecule and every
   molecule's atom count for the size line; ../data/copy-links.json holds the keyed placeholder words it uses.
   Optional per-molecule fields in molecules.json: "assembly", "view" {eye, up} and "sizeFactor" (see older notes).

   Story file shape (stories/README.md is the contract): tour [{id, title, focus {chains, residues [[start,end]],
   ligands, atoms, whole}, view, text [{t, s}]}]; sections {does, shape, lives {text, links}, wrong,
   history {year, who, method, resolution_A, text}, size {nm, compare}}; highlights [{chain, residue, label, text}].
   Chains and residue numbers are the author numbering in the PDB file (auth_asym_id, auth_seq_id); ligands are
   three-letter component codes; atoms are {chain, residue, atom} or "B:6:CA". */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };
  // fill a box like el() does: the native replaceChildren turns null into the text "null" (the "PDB 3KINnullnull" bug,
  // from a missing light box or tour start), so every multi-part fill goes through here
  const put = (n, ...kids) => { n.replaceChildren(...kids.flat().filter((c) => c != null && c !== false)); return n; };
  const VENDOR = '../vendor/molstar/';
  const DEFAULT_ID = 'dna';
  let DATA = null, SRC = {}, UI = {}, BY_ID = {}, ALIAS = {}, LINKS = null, CK = {}, RES = { residues: {}, sources: {} }, LIB = null, HETS = null, PARTS = null;
  let MOLS = [], COLLS = [], collFilter = null, STORY_IDS = null;
  const PROC = {};
  let current = null, viewer = null, viewerLoading = null, loadedId = null, spinning = false, lightEl = null;
  // T: words from ../data/copy-links.json (the shared D1 keys, mol.*). U: words from molecules.json "ui".
  // a value passed as null or undefined fills as nothing, never the words "null" or "undefined"
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, n) => (v[n] != null ? v[n] : n in v ? '' : m));
  const T = (k, v = {}) => fill(CK[k] ?? UI[k] ?? k, v);
  const U = (k, v = {}) => fill(UI[k] ?? CK[k] ?? k, v);
  const fmt = (n) => Number(n).toLocaleString('en');
  const proper = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
  const GOLD = '#ffb300';
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fileCache = {}, storyCache = {};

  /* ---------- theme (auto, light, dark), remembered per browser ---------- */
  const THEMES = ['auto', 'light', 'dark'];
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  let theme = THEMES.includes(store.get('cme-theme')) ? store.get('cme-theme') : 'auto';
  const isDark = () => theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const molCss = el('link', { rel: 'stylesheet', id: 'molcss' });
  function applyTheme() {
    if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    const b = $('#themeBtn');
    b.textContent = U('theme.' + theme);
    b.setAttribute('aria-label', U('theme.label', { theme: U('copy.theme'), mode: U('theme.' + theme) }));
    if (viewer) { molCss.href = VENDOR + (isDark() ? 'dark.css' : 'light.css'); lightForTheme(); }
  }
  $('#themeBtn').addEventListener('click', () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set('cme-theme', theme); applyTheme(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  // the app shell's theme button sets data-theme on <html>: follow it so Mol* restyles too
  document.addEventListener('cme:theme', () => { const d = document.documentElement.dataset.theme; theme = THEMES.includes(d) ? d : 'auto'; applyTheme(); });

  let baseLight = null;
  function lightForTheme() {
    try {
      const c = viewer.plugin.canvas3d, r = c.props.renderer;
      if (!baseLight) baseLight = { light: r.light.map((l) => ({ ...l })), ambient: r.ambientIntensity };
      const k = isDark() ? 0.72 : 1;
      c.setProps({ renderer: { light: baseLight.light.map((l) => ({ ...l, intensity: l.intensity * k })), ambientIntensity: baseLight.ambient * k } });
    } catch (e) { console.warn('light', e); }
  }

  /* ---------- mmCIF atom reader (enough for wwPDB and CCD files) ---------- */
  const TOK = /'(?:[^']|'(?=\S))*'|"(?:[^"]|"(?=\S))*"|\S+/g;
  const unq = (t) => ((t[0] === "'" || t[0] === '"') && t.length > 1 && t[t.length - 1] === t[0] ? t.slice(1, -1) : t);
  function readLoop(text, cat) {
    const lines = text.split(/\r?\n/);
    let i = lines.findIndex((l, j) => l.startsWith(cat + '.') && lines[j - 1] && lines[j - 1].trim() === 'loop_');
    if (i < 0) return null;
    const keys = [];
    while (i < lines.length && lines[i].startsWith(cat + '.')) { keys.push(lines[i].trim().slice(cat.length + 1)); i++; }
    const rows = [];
    let buf = [];
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('#') || l.startsWith('loop_') || l.startsWith('_') || l.startsWith('data_')) break;
      buf.push(...(l.match(TOK) || []).map(unq));
      while (buf.length >= keys.length) {
        const r = {};
        keys.forEach((k, j) => { r[k] = buf[j]; });
        rows.push(r);
        buf = buf.slice(keys.length);
      }
    }
    return rows;
  }
  const ION_IDS = new Set(['CA', 'MG', 'ZN', 'NA', 'K', 'CL', 'FE', 'MN', 'CU', 'CO', 'NI', 'CD']);
  function atomsOf(text, kind) {
    if (kind === 'ccd') {
      return (readLoop(text, '_chem_comp_atom') || []).map((a) => ({ el: a.type_symbol.toUpperCase(), comp: a.comp_id, name: a.atom_id }));
    }
    const rows = readLoop(text, '_atom_site') || [];
    const m1 = rows.length ? rows[0].pdbx_PDB_model_num : null;
    return rows.filter((a) => a.pdbx_PDB_model_num === m1 && a.label_comp_id !== 'HOH')
      .map((a) => ({ el: a.type_symbol.toUpperCase(), comp: a.label_comp_id, ent: a.label_entity_id, asym: a.label_asym_id,
        ch: a.auth_asym_id, seq: parseInt(a.auth_seq_id, 10), lseq: a.label_seq_id, name: a.label_atom_id }));
  }
  function countEls(atoms) {
    const c = {};
    for (const a of atoms) c[a.el] = (c[a.el] || 0) + 1;
    return c;
  }
  function hill(c) {
    const ks = Object.keys(c);
    const order = c.C ? ['C', ...(c.H ? ['H'] : []), ...ks.filter((k) => k !== 'C' && k !== 'H').sort()] : ks.sort();
    return order.map((k) => [k[0] + k.slice(1).toLowerCase(), c[k]]);
  }
  const matchSel = (sel, a) => {
    if (sel === 'all' || sel === 'polymer') return true;
    if (sel === 'ion') return ION_IDS.has(a.comp);
    return Object.entries(sel).every(([k, v]) => (k === 'label_comp_id' ? a.comp === v : k === 'label_entity_id' ? a.ent === v : k === 'label_asym_id' ? a.asym === v : k === 'type_symbol' ? a.el === String(v).toUpperCase() : false));
  };
  const elName = (e) => (DATA.elementNames[e.toUpperCase()] || proper(e));
  const elColor = (e) => DATA.elementColors[e] || '#ff1493';
  // polymer chains in file order: [{ch, res: [{seq, comp}]}] (label_seq_id '.' means not part of a chain)
  function chainsOf(file) {
    if (file.chains) return file.chains;
    const out = [], byCh = {};
    for (const a of file.atoms) {
      if (!a.lseq || a.lseq === '.' || !a.ch) continue;
      let c = byCh[a.ch];
      if (!c) { c = byCh[a.ch] = { ch: a.ch, res: [], seen: new Set() }; out.push(c); }
      const key = a.lseq;
      if (!c.seen.has(key)) { c.seen.add(key); c.res.push({ seq: a.seq, comp: a.comp }); }
    }
    file.chains = out;
    return out;
  }

  async function getFile(m) {
    if (fileCache[m.id]) return fileCache[m.id];
    const url = new URL(m.file, location.href).href;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`structure file ${m.file}: ${r.status}`);
    const text = await r.text();
    const atoms = atomsOf(text, m.kind);
    fileCache[m.id] = { atoms, counts: countEls(atoms), url };
    return fileCache[m.id];
  }
  const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  async function getStory(m) {
    if (m.id in storyCache) return storyCache[m.id];
    if (STORY_IDS && !STORY_IDS.has(m.id)) { storyCache[m.id] = null; return null; }
    const s = await getJSON(`stories/${encodeURIComponent(m.id)}.json`);
    storyCache[m.id] = s && typeof s === 'object' ? s : null;
    return storyCache[m.id];
  }

  /* ---------- WebGL and Mol* ---------- */
  const hasWebGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })() && !/[?&]nogl=1/.test(location.search);
  const loadScript = (src) => new Promise((res, rej) => { const s = el('script', { src }); s.onload = res; s.onerror = () => rej(new Error('script ' + src)); document.head.append(s); });
  function showMsg(nodes) { put($('#msgBox'), ...nodes); $('#msg').hidden = false; }
  const hideMsg = () => { $('#msg').hidden = true; };
  async function ensureViewer() {
    if (viewer) return viewer;
    if (viewerLoading) return viewerLoading;
    viewerLoading = (async () => {
      molCss.href = VENDOR + (isDark() ? 'dark.css' : 'light.css');
      document.head.append(molCss);
      await loadScript(VENDOR + 'molstar.js');
      const lowEnd = LOW_END;
      const v = await window.molstar.Viewer.create($('#mol'), {
        layoutIsExpanded: false, layoutShowControls: false, layoutShowRemoteState: false, layoutShowSequence: false, layoutShowLog: false,
        layoutShowLeftPanel: false, viewportShowExpand: false, viewportShowSelectionMode: false, viewportShowAnimation: false,
        viewportShowControls: false, viewportShowSettings: false, viewportShowTrajectoryControls: false, collapseLeftPanel: true,
        extensions: ['mvs'], pixelScale: lowEnd ? 1 : Math.min(window.devicePixelRatio || 1, 2), pickScale: 0.25, illumination: false,
      });
      v.plugin.canvas3d.setProps({ transparentBackground: true });
      try { v.plugin.canvas3d.setProps({ camera: { helper: { axes: { name: 'off', params: {} } } } }); } catch (e) { console.warn('axes helper', e); }
      v.plugin.behaviors.interaction.click.subscribe(onPick);
      try { v.plugin.managers.structure.focus.behaviors.current.subscribe((f) => showLinesKey(!!f)); } catch (e) { console.warn('focus key', e); }
      calmFocus(v);
      viewer = v;
      lightForTheme();
      return v;
    })();
    try { return await viewerLoading; } catch (e) { viewerLoading = null; throw e; }
  }
  /* Calmer close-up. Mol* clips the scene to a slab around whatever the camera focuses on: near plane = camera distance
     minus the focus radius, far plane = distance plus it (vendor molstar.js, camera near/far from state.radius). After a
     tap on a big molecule the radius is a few angstroms, so ribbons in front of and behind the tapped part are cut and pop
     in and out as you zoom or turn. Once each camera move settles, widen the radius back to the whole scene (radiusMax):
     the view and zoom stay where they are, only the cutting stops (near falls back to Mol*'s minNear, 1 angstrom).
     Mol*'s focus representation has no fade-in, so the neighbour sticks stay as Mol* draws them; the click fly-in is made
     a little slower and eased instead of 250 ms linear (none with reduced motion). */
  function calmFocus(v) {
    const c3 = v.plugin.canvas3d, cam = c3 && c3.camera;
    if (!cam || !cam.stateChanged) return;
    let queued = false, mine = false;
    const settle = () => {
      if (cam.transition && cam.transition.inTransition) { requestAnimationFrame(settle); return; }
      queued = false;
      const s = cam.state;
      if (s.radiusMax > 0 && s.radius < s.radiusMax * 0.999) {
        mine = true;
        try { cam.setState({ radius: s.radiusMax }, 0); } catch (e) { console.warn('camera radius', e); } finally { mine = false; }
        try { c3.requestDraw(); } catch (e) { /* next frame draws anyway */ }
      }
    };
    cam.stateChanged.subscribe((s) => { if (mine || queued || !s || s.radius == null) return; queued = true; requestAnimationFrame(settle); });
    try {
      const cell = [...v.plugin.state.behaviors.cells.values()].find((x) => x.transform && x.transform.transformer.definition.name === 'camera-focus-loci');
      if (cell) v.plugin.state.updateBehavior(cell.transform.transformer, (p) => { p.durationMs = reduceMotion() ? 0 : 450; p.easing = 'cubic-in-out'; });
    } catch (e) { console.warn('focus behaviour', e); }
  }
  const lib = () => window.molstar.lib;
  const structureData = () => { try { return viewer.plugin.managers.structure.hierarchy.current.structures[0].cell.obj.data; } catch (e) { return null; } };

  /* ---------- scene: style, colour, focus (tour stop or one residue), lit element ---------- */
  // big molecules: Normal drew exactly what Ribbon draws (chains as ribbons, hets and ions in their own rep), so Ribbon is their first style
  const STYLES = ['cartoon', 'surface', 'ball_and_stick', 'spacefill'];
  const CCD_STYLES = ['default', 'spacefill', 'surface'];
  const COLOURS = ['parts', 'chain', 'rainbow', 'hydro', 'element'];
  const STYLE_ALIAS = { normal: 'default', default: 'default', ribbon: 'cartoon', cartoon: 'cartoon', surface: 'surface', 'molecular-surface': 'surface', ball_and_stick: 'ball_and_stick', 'ball-and-stick': 'ball_and_stick', sticks: 'ball_and_stick', spacefill: 'spacefill', 'space-filling': 'spacefill' };
  let styleMode = 'cartoon', colourMode = 'parts', focus = null, flyNext = false, ionStyleOn = false;
  /* phone-light: molecules listed in molecules.json "phoneLight" open on narrow or low-power devices as the file's own
     chains (no assembly), with Surface off; a button in the card builds the full assembly on request */
  const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2;
  const fullAsm = {};
  const lightEligible = (m) => !!(m && m.assembly && DATA.phoneLight && (DATA.phoneLight.ids || []).includes(m.id) && (LOW_END || matchMedia('(max-width: 600px)').matches));
  const lightMode = (m) => lightEligible(m) && !fullAsm[m.id];
  function lightBox(m) {
    if (!lightEligible(m) || !hasWebGL) return null;
    const on = lightMode(m);
    return el('div', { class: 'lightasm', id: 'lightAsm' },
      on ? el('p', { class: 'small', style: 'margin:0 0 6px', text: U('light.note') }) : null,
      el('button', { type: 'button', class: 'pill', 'aria-pressed': String(!on), onclick: () => {
        fullAsm[m.id] = on;
        if (lightMode(m) && styleMode === 'surface') styleMode = baseStyle(m);
        loadedId = null; // a different structure: reset the camera after the redraw
        renderControls();
        const box = $('#lightAsm'), nb = lightBox(m); if (box && nb) box.replaceWith(nb); else if (box) box.remove();
        draw();
        const b = $('#lightAsm button'); if (b) b.focus();
      } }, on ? U('light.full') : U('light.back')));
  }
  const ELEMENT_COLOR = { custom: { molstar_color_theme_name: 'element-symbol', molstar_color_theme_params: { carbonColor: { name: 'element-symbol', params: {} } } } };
  const THEME_COLOR = {
    chain: { custom: { molstar_color_theme_name: 'chain-id' } },
    rainbow: { custom: { molstar_color_theme_name: 'sequence-id' } },
    // blue = water-loving, white, orange = water-fearing (Mol* hydrophobicity theme, Wimley and White scale)
    hydro: { custom: { molstar_color_theme_name: 'hydrophobicity', molstar_color_theme_params: { list: { kind: 'interpolate', colors: [0x3f7fd6, 0xf2f2f2, 0xe07a3f] } } } },
  };
  /* m.model (Everyday cards, web/molecules/everyday/everyday.json "viewer"): type 'pubchem' (computed PubChem 3D model,
     cid) or 'built' (a crystal piece placed at measured spacing); src = the card's own source id; formula = the formula unit
     to show instead of the counted atoms; style 'spacefill' + radii (angstroms) = ions drawn at their real sizes, one
     component per element with size_factor = ionic radius / the Mol* van der Waals radius it scales; alt 'atom' or
     'lattice' picks the alt text and legend words. */
  const modelOf = (m) => (m && m.model) || {};
  const MOLSTAR_VDW = { NA: 2.27, CL: 1.75 }; // Mol* van der Waals radii (angstroms) for the ions m.model.radii names
  const ionic = (m) => modelOf(m).style === 'spacefill' && !!modelOf(m).radii;
  const ownSrc = (m) => (m.kind === 'pdb' ? `rcsb-${m.code}` : modelOf(m).src || `ccd-${m.code}`);
  function modelLabel(m, badge) {
    const t = modelOf(m).type;
    if (m.kind === 'pdb') return U(badge ? 'detail.badgeReal' : 'detail.realLabel', { code: m.code });
    if (t === 'pubchem') return U(badge ? 'detail.badgePubchem' : 'detail.pubchemLabel', { cid: modelOf(m).cid });
    if (t === 'built') return U(badge ? 'detail.badgeBuilt' : 'detail.builtLabel');
    return U(badge ? 'detail.badgeIdeal' : 'detail.idealLabel', { code: m.code });
  }
  const legendWords = (m) => ({ atom: U('legend.atom'), lattice: U('legend.ions') }[modelOf(m).alt] || U('legend.ccd'));
  const partsOf = (m) => {
    if (ionic(m)) return Object.entries(modelOf(m).radii).map(([e, r]) => ({ sel: { type_symbol: e }, rep: 'spacefill', element: true, size: Math.round((r / (MOLSTAR_VDW[e.toUpperCase()] || r)) * 1000) / 1000, label: legendWords(m) }));
    return m.kind === 'ccd' ? [{ sel: 'all', rep: 'ball_and_stick', element: true, label: legendWords(m) }] : m.parts || [{ sel: 'polymer', rep: 'cartoon', color: '#3f7fd6', label: m.short || m.name }];
  };
  // ions have no shared-electron bonds to draw, so an ionic card offers Spacefill only (no Mol* distance-guessed sticks)
  const stylesFor = (m) => (ionic(m) ? ['spacefill'] : m.kind === 'ccd' ? CCD_STYLES : STYLES);
  // any style asked for (old 'normal' links, tour stops, the last molecule's choice) mapped onto what this molecule offers
  const fitStyle = (m, s) => { const ok = stylesFor(m); return ok.includes(s) ? s : s === 'default' && ok.includes('cartoon') ? 'cartoon' : ok[0]; };
  const baseStyle = (m) => stylesFor(m)[0];
  const activeStyle = () => { const s = (focus && focus.view) || styleMode; return s === 'surface' && current && lightMode(current) ? baseStyle(current) : s; };
  function repFor(m, p, style) {
    let type = p.rep;
    if (style !== 'default') type = (style === 'cartoon' || style === 'surface') && p.element ? p.rep : style;
    const o = { type };
    if (type === 'ball_and_stick') o.size_factor = m.sizeFactor || (m.kind === 'pdb' ? 1.2 : 1);
    if (type === 'spacefill') o.size_factor = p.size || (p.rep === 'spacefill' ? 0.5 : 1);
    return o;
  }
  function colourFor(m, p) {
    if (p.element || m.kind === 'ccd' || colourMode === 'element') return ELEMENT_COLOR;
    if (THEME_COLOR[colourMode]) return THEME_COLOR[colourMode];
    return { color: p.color };
  }
  // turn a story focus (or a residue pick) into selector items both MVS and Mol* understand
  function parseAtom(a) {
    if (typeof a === 'string') {
      if (!a.includes(':')) return a ? { label_atom_id: a } : null; // small molecules: a CCD atom name, e.g. "O1"
      const [c, r, n] = a.split(':'); return c && r && n ? { auth_asym_id: c, auth_seq_id: +r, label_atom_id: n } : null;
    }
    if (a && a.atom) return { ...(a.chain ? { auth_asym_id: String(a.chain) } : {}), ...(a.residue != null ? { auth_seq_id: +a.residue } : {}), label_atom_id: String(a.atom) };
    return null;
  }
  function hasAtoms(file, it) {
    return file.atoms.some((a) => (it.auth_asym_id == null || a.ch === it.auth_asym_id)
      && (it.beg_auth_seq_id == null || (a.seq >= it.beg_auth_seq_id && a.seq <= it.end_auth_seq_id))
      && (it.auth_seq_id == null || a.seq === it.auth_seq_id)
      && (it.label_comp_id == null || a.comp === it.label_comp_id)
      && (it.label_atom_id == null || a.name === it.label_atom_id));
  }
  function focusItems(f, file) {
    const chains = (f.chains || []).map(String);
    const withChains = (o) => (chains.length ? chains.map((c) => ({ ...o, auth_asym_id: c })) : [o]);
    const keep = (items, fallback) => { const ok = items.filter((it) => hasAtoms(file, it)); return ok.length || !fallback ? ok : fallback.filter((it) => hasAtoms(file, it)); };
    const res = (f.residues || []).flatMap((r) => {
      if (r && typeof r === 'object' && !Array.isArray(r)) {
        const s = +(r.start ?? r.residue ?? r.from), e = +(r.end ?? r.to ?? s);
        const o = { beg_auth_seq_id: s, end_auth_seq_id: e };
        return keep(r.chain ? [{ ...o, auth_asym_id: String(r.chain) }] : withChains(o), [o]);
      }
      const [s, e] = Array.isArray(r) ? [+r[0], +(r[1] ?? r[0])] : [+r, +r];
      const o = { beg_auth_seq_id: s, end_auth_seq_id: e };
      // a third item names the chain this range belongs to: [7, 7, "B"]
      if (Array.isArray(r) && r[2] != null) return keep([{ ...o, auth_asym_id: String(r[2]) }], [o]);
      return keep(withChains(o), [o]);
    });
    const lig = (f.ligands || []).flatMap((l) => {
      const comp = typeof l === 'string' ? l : l.comp || l.id || l.code;
      if (!comp) return [];
      const o = { label_comp_id: String(comp).toUpperCase() };
      return keep(l.chain ? [{ ...o, auth_asym_id: String(l.chain) }] : withChains(o), [o]);
    });
    const atoms = keep((f.atoms || []).map(parseAtom).filter(Boolean));
    return { chains: chains.filter((c) => hasAtoms(file, { auth_asym_id: c })), res, lig, atoms };
  }
  function sceneState(m, file) {
    const { MVSData } = lib().extensions.mvs;
    const b = MVSData.createBuilder();
    const parsed = b.download({ url: file.url }).parse({ format: 'mmcif' });
    const st = m.assembly && !lightMode(m) ? parsed.assemblyStructure({ assembly_id: String(m.assembly) }) : parsed.modelStructure();
    const style = activeStyle();
    // "whole" only keeps the camera on the whole molecule; the selection is still lit unless it is everything
    const fi = focus ? focusItems(focus, file) : null;
    const allChains = m.kind === 'pdb' ? chainsOf(file).length : 0;
    const ghost = fi && (fi.res.length || fi.lig.length || fi.atoms.length || (fi.chains.length && fi.chains.length < allChains));
    const dim = ghost ? (m.kind === 'ccd' ? 0.3 : 0.13) : lightEl ? 0.16 : 1;
    for (const p of partsOf(m)) {
      const rep = st.component({ selector: p.sel }).representation(repFor(m, p, style));
      rep.color(colourFor(m, p));
      if (dim < 1) rep.opacity({ opacity: dim });
    }
    if (lightEl && !ghost) {
      // only this element's atoms, water left out (same atoms the count uses): one selector per non-water entity
      const sel = m.kind === 'ccd' ? { type_symbol: lightEl } : [...new Set(file.atoms.map((a) => a.ent))].map((ent) => ({ label_entity_id: ent, type_symbol: lightEl }));
      st.component({ selector: sel }).representation({ type: 'spacefill', size_factor: ionic(m) ? ((partsOf(m).find((p) => String(p.sel.type_symbol).toUpperCase() === lightEl) || {}).size || 0.42) * 1.03 : m.kind === 'ccd' ? 0.42 : (file.counts[lightEl] > 500 ? 0.42 : file.counts[lightEl] > 50 ? 0.6 : 0.85) }).color({ color: GOLD });
    }
    if (ghost) {
      for (const c of fi.chains) {
        for (const p of partsOf(m)) {
          if (p.sel === 'ion' || p.sel === 'all') continue;
          const sel = typeof p.sel === 'object' ? { ...p.sel, auth_asym_id: c } : { auth_asym_id: c };
          if (!hasAtoms(file, { auth_asym_id: c })) continue;
          st.component({ selector: sel }).representation(repFor(m, p, style)).color(colourFor(m, p));
        }
      }
      if (fi.res.length) {
        if (m.kind === 'pdb' && style !== 'spacefill') st.component({ selector: fi.res }).representation({ type: 'cartoon' }).color({ color: GOLD });
        const r = st.component({ selector: fi.res });
        r.representation({ type: style === 'spacefill' ? 'spacefill' : 'ball_and_stick', size_factor: style === 'spacefill' ? 1 : 1.25 }).color(ELEMENT_COLOR);
        if (focus.label) r.label({ text: focus.label });
      }
      if (fi.lig.length) st.component({ selector: fi.lig }).representation({ type: style === 'spacefill' ? 'spacefill' : 'ball_and_stick', size_factor: style === 'spacefill' ? 1 : 1.3 }).color(ELEMENT_COLOR);
      if (fi.atoms.length) {
        const a = st.component({ selector: fi.atoms });
        a.representation({ type: 'spacefill', size_factor: m.kind === 'ccd' ? 0.45 : 0.75 }).color({ color: GOLD });
        if (focus.label) a.label({ text: focus.label });
      }
    }
    return { state: b.getState(), fi: ghost ? fi : null };
  }
  function flyTo(fi, m, ms) {
    const s = structureData();
    if (!s || !fi) { resetCamera(m, ms); return; }
    try {
      const SE = lib().structure.StructureElement;
      const specific = [...fi.res, ...fi.lig, ...fi.atoms];
      const items = specific.length ? specific : fi.chains.map((c) => ({ auth_asym_id: c }));
      let loci = null;
      for (const it of items) { const l = SE.Schema.toLoci(s, it); if (SE.Loci.isEmpty(l)) continue; loci = loci ? SE.Loci.union(loci, l) : l; }
      if (!loci) { resetCamera(m, ms); return; }
      viewer.plugin.managers.camera.focusLoci(loci, { durationMs: ms, minRadius: specific.length ? 9 : 14, extraRadius: 4 });
    } catch (e) { console.warn('focus', e); resetCamera(m, ms); }
  }

  // one draw at a time; a newer request while drawing runs once more with the latest state
  let drawing = null, drawAgain = false;
  function draw() {
    if (drawing) { drawAgain = true; return drawing; }
    drawing = (async () => {
      try { do { drawAgain = false; await drawOnce(); } while (drawAgain); } finally { drawing = null; }
    })();
    return drawing;
  }
  async function drawOnce() {
    const m = current, file = m && fileCache[m.id];
    if (!m || !file || !hasWebGL) return;
    const newMol = loadedId !== m.id;
    if (newMol) { $('#mol').classList.add('swap'); showMsg([el('span', { class: 'spin' }), U('copy.loading')]); }
    else if (activeStyle() === 'surface') showMsg([el('span', { class: 'spin' }), U('copy.drawing')]);
    try {
      const v = await ensureViewer();
      if (current !== m) return;
      const { state, fi } = sceneState(m, file);
      await v.loadMvsData(state, 'mvsj', { replaceExisting: true, keepCamera: !newMol });
      if (!v.plugin.managers.structure.hierarchy.current.structures.length) throw new Error('structure did not load');
      loadedId = m.id;
      v.handleResize();
      const ms = reduceMotion() ? 0 : 900;
      if (newMol) resetCamera(m, 0);
      if (flyNext) { flyNext = false; if (fi && !(focus && focus.whole)) flyTo(fi, m, newMol ? 0 : ms); else if (!newMol) resetCamera(m, ms); }
      setSpin(spinning);
      hideMsg();
      $('#mol').classList.remove('swap');
    } catch (e) {
      $('#mol').classList.remove('swap');
      console.error(e);
      loadedId = null;
      showMsg([el('p', { style: 'margin:0 0 8px', text: U('copy.viewFailed') }),
        el('button', { class: 'chip', type: 'button', style: 'padding:6px 14px;min-height:40px', text: U('copy.retry'), onclick: () => { viewerLoading = null; select(current.id, { force: true }); } })]);
    }
  }
  const still = (m) => el('img', { class: 'still', src: `thumbs/${m.id}.webp`, alt: '', onerror: (ev) => ev.target.remove() });
  // Mol*'s reset keeps the current viewing direction, so turn the camera to the molecule's chosen side first
  function resetCamera(m, ms) {
    if (!viewer) return;
    if (m && m.view) {
      try {
        const cam = viewer.plugin.canvas3d.camera, sn = cam.getSnapshot(), t = sn.target;
        const d = Math.hypot(sn.position[0] - t[0], sn.position[1] - t[1], sn.position[2] - t[2]) || 50;
        const [x, y, z] = m.view.eye, n = Math.hypot(x, y, z) || 1;
        cam.setState({ position: [t[0] + (x / n) * d, t[1] + (y / n) * d, t[2] + (z / n) * d], up: m.view.up || [0, 1, 0] }, 0);
      } catch (e) { console.warn('view', e); }
    }
    viewer.plugin.managers.camera.reset(undefined, ms);
  }
  function setSpin(on) {
    spinning = on;
    const b = $('#spinBtn');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? U('copy.spinOff') : U('copy.spinOn');
    if (viewer) viewer.plugin.canvas3d.setProps({ trackball: { animate: on ? { name: 'spin', params: { speed: 0.6 } } : { name: 'off', params: {} } } });
  }
  $('#spinBtn').addEventListener('click', () => setSpin(!spinning));
  $('#resetBtn').addEventListener('click', () => resetCamera(current, reduceMotion() ? 0 : 300));

  /* ---------- view options: style, colour by, measure ---------- */
  function radio(name, value, label, checked, onchange) {
    return el('label', { class: 'opt' }, el('input', { type: 'radio', name, value, checked, onchange }), el('span', { text: label }));
  }
  function renderControls() {
    const m = current;
    if (!m) return;
    const styles = stylesFor(m);
    styleMode = fitStyle(m, styleMode);
    const light = lightMode(m);
    if (light && styleMode === 'surface') styleMode = baseStyle(m);
    put($('#styleOpts'), ...styles.map((s) => {
      const r = radio('mstyle', s, U('view.' + s), s === styleMode, () => { styleMode = s; if (focus && focus.view && !tour.open) focus.view = null; draw(); });
      if (light && s === 'surface') r.querySelector('input').disabled = true;
      return r;
    }), light ? el('p', { class: 'ckey', style: 'flex-basis:100%;margin:2px 0 0', text: U('light.noSurface') }) : null);
    $('#colourSet').hidden = m.kind === 'ccd';
    $('#colourOpts').replaceChildren(...COLOURS.map((c) => radio('mcolour', c, U('colour.' + c), c === colourMode, () => { colourMode = c; colourKey(); renderLegend(m, fileCache[m.id]); draw(); })));
    colourKey();
  }
  function colourKey() {
    const k = $('#colourKey');
    if (!current || current.kind === 'ccd' || colourMode === 'parts') { k.replaceChildren(); k.hidden = true; return; }
    k.hidden = false;
    const bars = { rainbow: 'linear-gradient(90deg,#30123b,#4686fb,#1ae4b6,#a2fc3c,#fabb2a,#e4460a,#7a0403)', hydro: 'linear-gradient(90deg,#3f7fd6,#f2f2f2,#e07a3f)' };
    const kids = [];
    if (bars[colourMode]) kids.push(el('span', { class: 'bar', style: `background:${bars[colourMode]}`, 'aria-hidden': 'true' }));
    kids.push(U('legend.' + colourMode));
    if (colourMode === 'hydro') kids.push(' ', ...resSourceLinks('hydroSources', U('legend.hydroSource')));
    put(k, ...kids);
  }
  function resSourceLinks(key, label) {
    const ids = RES[key] || [];
    return [label + ': ', ...ids.flatMap((id, i) => { const S = RES.sources[id]; if (!S) return []; const href = S.url || (S.doi ? `https://doi.org/${S.doi}` : null); return [i ? ', ' : '', href ? el('a', { href, rel: 'noopener', target: '_blank', text: S.cite.split('.')[0] }) : S.cite]; })];
  }
  // focusBack: return focus to the View button when the visitor closed the panel themselves
  function openCtrls(open, focusBack = false) {
    const was = !$('#ctrls').hidden;
    $('#ctrls').hidden = !open;
    $('#viewBtn').setAttribute('aria-expanded', String(open));
    if (open) { const c = $('#ctrls input:checked'); if (c) c.focus(); } else if (was && focusBack) $('#viewBtn').focus();
  }
  $('#viewBtn').addEventListener('click', () => openCtrls($('#ctrls').hidden, true));
  $('#ctrlsDone').addEventListener('click', () => openCtrls(false, true));
  $('#ctrls').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); openCtrls(false, true); } });

  /* ---------- measure: two atoms, distance in angstroms ---------- */
  const meas = { on: false, a: null, out: null };
  function setMeasure(on) {
    meas.on = on; meas.a = null; meas.out = null;
    const b = $('#measureBtn');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', U('measure.toggleLabel'));
    if (on) showCard(measureCard());
    else if (pickState.kind === 'measure') closePick();
  }
  $('#measureBtn').addEventListener('click', () => setMeasure(!meas.on));
  const pointName = (p) => (p.res ? `${p.res} ${p.atom}` : `${proper(p.el)} ${p.atom}`);
  function addPoint(p) {
    if (!meas.a || meas.out) { meas.a = p; meas.out = null; showCard(measureCard()); return; }
    const d = Math.hypot(p.pos[0] - meas.a.pos[0], p.pos[1] - meas.a.pos[1], p.pos[2] - meas.a.pos[2]);
    meas.out = U('measure.result', { a: pointName(meas.a), b: pointName(p), d: d.toFixed(1) });
    try { if (meas.a.loci && p.loci) viewer.plugin.managers.structure.measurement.addDistance(meas.a.loci, p.loci); } catch (e) { console.warn('measure', e); }
    showCard(measureCard());
  }
  function measureCard() {
    const msg = meas.out || (meas.a ? U('measure.first', { a: pointName(meas.a) }) : U('measure.hint'));
    return { kind: 'measure', body: [
      el('div', { class: 'pick-top' }, el('div', { class: 't' }, el('b', { text: U('measure.toggle') }), el('p', { text: msg })),
        el('button', { class: 'pill x', type: 'button', text: U('pick.close'), 'aria-label': U('pick.closeLabel'), onclick: () => setMeasure(false) })),
      el('p', { class: 'note', text: `${U('measure.unit')} ${current && current.kind === 'pdb' ? U('measure.keyHint') : ''}` }),
      meas.out ? el('div', { class: 'links' }, el('button', { class: 'pill', type: 'button', text: U('measure.clear'), onclick: () => { meas.a = null; meas.out = null; draw(); showCard(measureCard()); } })) : null,
    ] };
  }

  /* ---------- picked residue or atom card ---------- */
  const pickState = { kind: null };
  function showCard(c) {
    pickState.kind = c.kind;
    put($('#pickBody'), ...c.body);
    $('#pick').hidden = false;
    if (viewer) viewer.handleResize();
  }
  function closePick() {
    pickState.kind = null;
    $('#pick').hidden = true;
    markSeq(null);
    // closing the card also clears Mol*'s close-up (neighbour sticks and dashed lines), so the two never disagree
    if (viewer) { try { viewer.plugin.managers.structure.focus.clear(); } catch (e) { /* no focus manager */ } }
    showLinesKey(false);
    if (viewer) viewer.handleResize();
  }
  // a pick from the 3D view: first atom of what was tapped
  function onPick(e) {
    try {
      const l = e && e.current && e.current.loci;
      const { StructureElement: SE, StructureProperties: SP } = lib().structure;
      if (!l || !SE.Loci.is(l) || SE.Loci.isEmpty(l)) return;
      const loc = SE.Loci.getFirstLocation(l);
      const p = { comp: SP.residue.label_comp_id(loc), seq: SP.residue.auth_seq_id(loc), ch: SP.chain.auth_asym_id(loc), atom: SP.atom.label_atom_id(loc), el: SP.atom.type_symbol(loc), pos: [SP.atom.x(loc), SP.atom.y(loc), SP.atom.z(loc)] };
      try { p.loci = SE.Loci.firstElement(l); } catch (err) { p.loci = null; }
      usePoint(p);
    } catch (err) { console.warn('pick', err); }
  }
  function usePoint(p) {
    const m = current;
    if (m && m.kind === 'pdb') p.res = `${proper(p.comp)} ${p.seq}`;
    if (meas.on) addPoint(p);
    else showCard(residueCard(p));
  }
  // a pick from the sequence strip or a highlight chip: one atom of that residue (CA, C1' or the first)
  function pointFromResidue(ch, seq) {
    const file = fileCache[current.id];
    const atoms = file.atoms.filter((a) => a.ch === ch && a.seq === seq);
    if (!atoms.length) return null;
    const a = atoms.find((x) => x.name === 'CA') || atoms.find((x) => x.name === "C1'") || atoms[0];
    const p = { comp: a.comp, seq, ch, atom: a.name, el: a.el, pos: null, loci: null };
    const s = viewer && structureData();
    if (s) {
      try {
        const { StructureElement: SE, StructureProperties: SP } = lib().structure;
        const l = SE.Schema.toLoci(s, { auth_asym_id: ch, auth_seq_id: seq, label_atom_id: a.name });
        if (!SE.Loci.isEmpty(l)) { const loc = SE.Loci.getFirstLocation(l); p.pos = [SP.atom.x(loc), SP.atom.y(loc), SP.atom.z(loc)]; p.loci = SE.Loci.firstElement(l); }
      } catch (e) { console.warn('residue point', e); }
    }
    return p;
  }
  function residueCard(p, extra) {
    const m = current, file = fileCache[m.id];
    const R = RES.residues[p.comp];
    // not an amino acid or DNA letter: an ion, water, fuel, dye, modified amino acid... (hets.json, keyed by CCD code)
    const H = m.kind === 'pdb' && !R && HETS ? HETS.codes[p.comp] : null;
    const kids = [];
    // friendly words first (the amino acid's name, the chain's protein name, the small molecule's name), the file code after, smaller
    const lig = !R && !(H && H.kind === 'modified');
    const cname = m.kind === 'pdb' ? chainName(m, p.ch) : null;
    let title, sub = null, code = null;
    if (m.kind === 'ccd') title = m.short || m.name;
    else {
      title = R ? U('pick.resTitle', { name: cap(R.name), num: p.seq }) : H ? H.name : U('pick.title', { code: proper(p.comp), num: p.seq });
      sub = !cname ? U('pick.chainOnly', { c: p.ch }) : R ? cname : U(lig ? 'pick.heldBy' : 'pick.inChain', { chain: cname });
      code = U('pick.code', { code: p.comp, num: p.seq, c: p.ch }) + (R ? '' : `. ${U(lig ? 'pick.ligand' : 'pick.modified')}`);
    }
    kids.push(el('div', { class: 'pick-top' },
      el('div', { class: 't' }, el('b', { text: (extra && extra.label) || title }), (extra && extra.label) ? el('p', { class: 'sub', text: title }) : null,
        sub ? el('p', { class: 'sub', text: sub }) : null,
        code ? el('p', { class: 'note code', text: code }) : null),
      el('button', { class: 'pill x', type: 'button', text: U('pick.close'), 'aria-label': U('pick.closeLabel'), onclick: closePick })));
    if (extra && extra.text) kids.push(el('p', {}, ...textWithRefs(extra.text, m)));
    // what this part does in this protein (parts.json); without a line, the general explainer for small molecules (hets.json)
    const lines = m.kind === 'pdb' ? partLines(m, p, lig && !!H) : [];
    if (lines.length) {
      const said = lines.flatMap((ln) => ln.text || []);
      kids.push(el('div', { class: 'here' }, el('h4', { text: U('pick.here') }),
        ...lines.map((ln) => el('p', {}, ln.label ? el('span', { class: 'kind', text: ln.label }) : null, ' ', (ln.text || []).map((d) => fill(d.t, { chain: cname || U('pick.chainOnly', { c: p.ch }) })).join(' '))),
        el('p', { class: 'note' }, ...srcLinks(said, PARTS.sources))));
    }
    if (H && !lines.length) {
      const K = (HETS.kinds || {})[H.kind] || {};
      const rec = ((HETS.recipe || {})[m.id] || {})[p.comp] || [];
      const said = [...(H.text || []), ...rec, ...(K.text || [])];
      kids.push(el('p', { class: 'het' }, K.label ? el('span', { class: 'kind', text: K.label }) : null, ' ', said.map((d) => d.t).join(' ')));
      kids.push(el('p', { class: 'note' }, ...hetSrcLinks(said)));
    }
    if (p.el) kids.push(el('p', {}, el('a', { href: `../elements/#${proper(p.el)}` , text: U('pick.atom', { sym: proper(p.el), name: elName(p.el) }) })));
    if (m.kind === 'pdb' && file) {
      const c = countEls(file.atoms.filter((a) => a.ch === p.ch && a.seq === p.seq && a.comp === p.comp));
      const els = Object.entries(c).sort((a, b) => b[1] - a[1]);
      if (els.length) kids.push(el('p', { class: 'note', text: U('pick.madeOf') }), el('ul', { class: 'els' }, ...els.map(([e, k]) => el('li', {}, el('a', { href: `../elements/#${proper(e)}`, 'aria-label': U('pick.elementLabel', { name: elName(e), n: k }) },
        el('span', { class: 'sw', style: `background:${elColor(e)}`, 'aria-hidden': 'true' }), el('b', { text: proper(e) }), el('span', { class: 'n', text: `x${k}` }))))));
    }
    const links = [];
    if (R && R.molecule && BY_ID[R.molecule] && R.molecule !== m.id) links.push(el('a', { class: 'pill', href: `#${R.molecule}`, text: U('pick.see3d') }));
    if (R && R.lab) links.push(el('a', { class: 'pill', href: R.lab, text: U('pick.lab') }));
    if (links.length) kids.push(el('div', { class: 'links' }, ...links));
    if (R) kids.push(el('p', { class: 'note' }, ...resSourceLinks(R.kind === 'nucleotide' ? 'nucleotideSources' : 'aminoSources', U('pick.names'))));
    markSeq(m.kind === 'pdb' ? { ch: p.ch, seq: p.seq } : null);
    return { kind: 'residue', body: kids };
  }

  /* ---------- parts.json: friendly chain names, part lines, the balls-or-ribbon note ---------- */
  const molParts = (m) => (PARTS && m && PARTS.molecules[m.id]) || null;
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
  // the file's own entity name when parts.json has no friendly one: "PROTEIN (F1-ATPASE BETA CHAIN)" becomes "F1-atpase beta chain"
  const tidyEntity = (s) => { if (!s) return null; const t = String(s).replace(/^PROTEIN \((.*)\)$/i, '$1'); return /[a-z]/.test(t) ? t : t.charAt(0) + t.slice(1).toLowerCase(); };
  // "Hemoglobin subunit beta, chain B", or null when the chain is not a protein or DNA chain (a lone sugar or ion chain)
  function chainName(m, ch) {
    const P = molParts(m), eid = P && P.chains && ch != null ? P.chains[ch] : null;
    if (!eid) return null;
    const nm = (P.names && P.names[eid] && P.names[eid].name) || tidyEntity(P.entities && P.entities[eid]);
    return nm ? U('pick.chainName', { name: nm, c: ch }) : null;
  }
  // the part lines that cover this pick, the most specific first (one residue, then a stretch, then a residue type, then a chain); at most 2
  function partLines(m, p, smallMol) {
    const P = molParts(m);
    if (!P || !Array.isArray(P.lines)) return [];
    const hits = [];
    for (const ln of P.lines) {
      const at = (ln && ln.at) || {}, chs = Array.isArray(at.chains) ? at.chains : null;
      if (chs && !chs.includes(p.ch)) continue;
      if (at.comp && at.comp !== p.comp) continue;
      let rank = null;
      if (at.het) rank = at.het === p.comp ? 0 : null;
      else if (smallMol && !at.comp) rank = null; // a stretch or chain line is about the chain, not a small molecule sitting on it
      else if (Array.isArray(at.seq)) {
        const rs = Array.isArray(at.seq[0]) ? at.seq : [at.seq];
        const r = rs.find((x) => p.seq >= x[0] && p.seq <= x[1]);
        if (r) rank = r[1] === r[0] ? 0 : 1 + (r[1] - r[0]) / 10000;
      } else if (Array.isArray(at.res)) rank = at.res.some((x) => x[0] === p.ch && x[1] === p.seq) ? 0 : null;
      else if (at.comp) rank = 2;
      else if (chs) rank = 3;
      if (rank != null && Array.isArray(ln.text) && ln.text.length) hits.push([rank, ln]);
    }
    return hits.sort((a, b) => a[0] - b[0]).slice(0, 2).map((h) => h[1]);
  }
  // the card's one-line answer to "why balls here and only ribbon there": the small molecules this file holds
  function holdsNote(m) {
    const P = molParts(m), h = P && P.holds;
    if (!h || m.kind !== 'pdb') return null;
    const list = (xs) => {
      const by = new Map();
      for (const x of xs || []) {
        const nm = (HETS && HETS.codes[x.c] && HETS.codes[x.c].name) || x.c;
        const low = /^[A-Z][a-z]/.test(nm) ? nm.charAt(0).toLowerCase() + nm.slice(1) : nm;
        by.set(low, (by.get(low) || 0) + (x.n || 1));
      }
      const items = [...by].map(([name, n]) => U('holds.item', { name, n }));
      return items.length > 1 ? `${items.slice(0, -1).join(', ')} ${U('holds.and')} ${items[items.length - 1]}` : items.join('');
    };
    const poly = U('holds.poly.' + (h.poly || 'protein'));
    const shown = (h.shown || []).length, hidden = (h.hidden || []).length;
    if (!shown) return hidden ? U('holds.noneShown', { poly, list: list(h.hidden) }) : U('holds.none', { poly });
    return [U('holds.some', { poly, list: list(h.shown) }), hidden ? U('holds.hidden', { list: list(h.hidden) }) : null].filter(Boolean).join(' ');
  }
  // "Sources: ..." for hets.json or parts.json sentences, each source once, in order of first use
  const hetSrcLinks = (said) => srcLinks(said, HETS.sources);
  function srcLinks(said, map) {
    const ids = [...new Set(said.flatMap((d) => d.s || []))].filter((id) => map && map[id]);
    return [U('pick.sources') + ': ', ...ids.flatMap((id, i) => {
      const S = map[id], href = S.url || (S.doi ? `https://doi.org/${S.doi}` : null);
      const name = S.name || S.cite.split(/\. |\(/)[0].trim();
      return [i ? ', ' : '', href ? el('a', { href, rel: 'noopener', target: '_blank', text: name }) : name];
    })];
  }
  // the key to Mol*'s close-up after a tap: neighbours as sticks, dashed lines for weak attractions (hets.json "lines").
  // Shown while Mol*'s structure focus is set (it is what draws those sticks and lines), hidden when it clears.
  function renderLinesKey() {
    const L = HETS && HETS.lines, box = $('#linesKey');
    if (!L || !box) return;
    const said = [...(L.intro || []), ...(L.items || [])];
    put(box,
      el('h3', { id: 'linesH', text: U('lines.title') }),
      ...(L.intro || []).map((d) => el('p', { text: d.t })),
      el('ul', {}, ...(L.items || []).map((it) => el('li', {},
        el('span', { class: 'dash', 'aria-hidden': 'true' }, ...(it.colors || [it.color]).map((c) => el('i', { style: `border-top-color:${c}` }))),
        el('span', {}, el('b', { text: it.name }), ' ', it.t)))),
      el('p', { class: 'note' }, ...hetSrcLinks(said)));
  }
  function showLinesKey(on) {
    const box = $('#linesKey');
    if (!box) return;
    if (on && !box.childElementCount) renderLinesKey();
    box.hidden = !on || !box.childElementCount;
  }

  /* ---------- sequence strip ---------- */
  let seqChain = null;
  function renderSeq() {
    const m = current, file = m && fileCache[m.id];
    const box = $('#seq');
    if (!m || m.kind !== 'pdb' || !file) { box.hidden = true; return; }
    const chains = chainsOf(file);
    if (!chains.length) { box.hidden = true; return; }
    box.hidden = false;
    if (!chains.some((c) => c.ch === seqChain)) seqChain = chains[0].ch;
    $('#seqChain').replaceChildren(...chains.map((c) => el('option', { value: c.ch, selected: c.ch === seqChain, text: U('seq.chainOpt', { c: c.ch, n: c.res.length }) })));
    $('#seqHint').textContent = U('seq.hint');
    paintStrip();
    if (viewer) viewer.handleResize();
  }
  $('#seqChain').addEventListener('change', (e) => { seqChain = e.target.value; paintStrip(); });
  function paintStrip() {
    const file = fileCache[current.id];
    const c = chainsOf(file).find((x) => x.ch === seqChain);
    const strip = $('#seqStrip');
    strip.setAttribute('aria-label', U('seq.strip', { chain: seqChain }));
    strip.replaceChildren(...c.res.map((r, i) => {
      const R = RES.residues[r.comp];
      const one = R && R.one ? R.one : proper(r.comp);
      return el('button', { type: 'button', class: one.length > 1 ? 'wide' : null, tabindex: i === 0 ? '0' : '-1', 'data-seq': r.seq, 'data-n': r.seq % 10 === 0 ? r.seq : null, 'aria-pressed': 'false',
        'aria-label': U('seq.letter', { code: R && R.kind === 'nucleotide' ? r.comp : proper(r.comp), num: r.seq, name: R ? R.name : r.comp, chain: seqChain }), text: one });
    }));
    markSeq(null);
  }
  $('#seqStrip').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    rove(b);
    seqPick(seqChain, +b.dataset.seq);
  });
  $('#seqStrip').addEventListener('keydown', (e) => {
    const bs = [...$('#seqStrip').children];
    const i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: bs.length - 1, PageDown: i + 10, PageUp: i - 10 }[e.key];
    if (j == null) return;
    e.preventDefault(); e.stopPropagation();
    const b = bs[Math.max(0, Math.min(bs.length - 1, j))];
    rove(b); b.focus(); b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  function rove(b) { $('#seqStrip').querySelectorAll('[tabindex="0"]').forEach((x) => x.setAttribute('tabindex', '-1')); b.setAttribute('tabindex', '0'); }
  function markSeq(r) {
    $('#seqStrip').querySelectorAll('[aria-pressed="true"]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    if (!r || r.ch !== seqChain) return;
    const b = $('#seqStrip').querySelector(`[data-seq="${r.seq}"]`);
    if (b) { b.setAttribute('aria-pressed', 'true'); rove(b); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function seqPick(ch, seq) {
    const p = pointFromResidue(ch, seq);
    if (!p) return;
    if (meas.on) { addPoint({ ...p, res: `${proper(p.comp)} ${p.seq}` }); return; }
    focusResidue(ch, seq, null);
    showCard(residueCard(p));
  }
  // fly to one residue and show it as atoms (others stay as they are, faded)
  function focusResidue(ch, seq, label) {
    if (tour.open) closeTour(false);
    focus = { chains: [], residues: [{ chain: ch, start: Array.isArray(seq) ? seq[0] : seq, end: Array.isArray(seq) ? seq[1] : seq }], label: label || null };
    flyNext = true;
    draw();
  }

  /* ---------- guided tour ---------- */
  const tour = { open: false, i: 0, playing: false, timer: null, stops: [] };
  const normStyle = (v) => (v ? STYLE_ALIAS[String(v).toLowerCase()] || null : null);
  function stopFocus(s) {
    const f = s.focus || {};
    const whole = f.whole === true || !(f.chains || f.residues || f.ligands || f.atoms);
    let view = normStyle(s.view);
    if (view && !stylesFor(current).includes(view)) view = view === 'default' && current.kind === 'pdb' ? 'cartoon' : null;
    return { chains: f.chains || [], residues: f.residues || [], ligands: f.ligands || [], atoms: f.atoms || [], whole, view };
  }
  function openTour(i = 0, play = true) {
    if (!tour.stops.length) return;
    closeCine(false);
    openCtrls(false);
    setMeasure(false);
    closePick();
    tour.open = true;
    setSpin(false);
    $('#tour').hidden = false;
    $('#tourBtn').setAttribute('aria-expanded', 'true');
    $('#tourDots').replaceChildren(...tour.stops.map((s, k) => el('button', { type: 'button', 'aria-label': U('tour.dot', { i: k + 1, title: s.title || '' }), onclick: () => goStop(k, false) })));
    goStop(i, play);
    $('#tourTitle').focus();
    if (viewer) viewer.handleResize();
  }
  function closeTour(focusBack = true) {
    if (!tour.open) return;
    tour.open = false;
    setPlaying(false);
    $('#tour').hidden = true;
    $('#tourBtn').setAttribute('aria-expanded', 'false');
    focus = null;
    flyNext = true;
    draw();
    if (focusBack) ($('#tourBtn').hidden ? $('#detail') : $('#tourBtn')).focus();
    if (viewer) viewer.handleResize();
  }
  function goStop(i, play) {
    const n = tour.stops.length;
    tour.i = Math.max(0, Math.min(n - 1, i));
    const s = tour.stops[tour.i];
    $('#tourCount').textContent = U('tour.stopOf', { i: tour.i + 1, n });
    $('#tourTitle').textContent = s.title || '';
    put($('#tourText'), ...items(s.text).flatMap((d, k) => [k ? ' ' : '', d.t, ' ', supRefs(d.s, current)]));
    $('#tourDots').querySelectorAll('button').forEach((b, k) => { if (k === tour.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    $('#tourBack').disabled = tour.i === 0;
    $('#tourNext').disabled = tour.i === n - 1;
    focus = stopFocus(s);
    flyNext = true;
    draw();
    setPlaying(play == null ? tour.playing : play);
  }
  function dwell(s) {
    const words = items(s.text).map((d) => d.t).join(' ').split(/\s+/).length;
    return Math.min(16000, Math.max(5000, 2500 + words * 330));
  }
  function setPlaying(on) {
    clearTimeout(tour.timer);
    tour.playing = on && tour.open;
    const b = $('#tourPlay');
    b.textContent = tour.playing ? U('tour.pause') : U('tour.play');
    b.setAttribute('aria-label', tour.playing ? U('tour.pauseLabel') : U('tour.playLabel'));
    b.setAttribute('aria-pressed', String(tour.playing));
    if (!tour.playing) return;
    if (tour.i >= tour.stops.length - 1) {
      // at the end: play starts again from the top
      tour.timer = setTimeout(() => setPlaying(false), dwell(tour.stops[tour.i]));
      return;
    }
    tour.timer = setTimeout(() => goStop(tour.i + 1, true), dwell(tour.stops[tour.i]));
  }
  $('#tourPlay').addEventListener('click', () => {
    if (!tour.playing && tour.i >= tour.stops.length - 1) goStop(0, true);
    else setPlaying(!tour.playing);
  });
  $('#tourNext').addEventListener('click', () => goStop(tour.i + 1, false));
  $('#tourBack').addEventListener('click', () => goStop(tour.i - 1, false));
  $('#tourClose').addEventListener('click', () => closeTour(true));
  $('#tourBtn').addEventListener('click', () => (tour.open ? closeTour(true) : openTour(0, true)));
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
    if (cineOpen) return;
    if (e.key === 'Escape') {
      if (!$('#ctrls').hidden) { openCtrls(false, true); return; }
      if (tour.open) { e.preventDefault(); closeTour(true); return; }
      if (!$('#pick').hidden) { if (meas.on) setMeasure(false); else closePick(); }
      return;
    }
    if (!tour.open) return;
    if (t && t.closest && t.closest('#seqStrip, .grid, .dna-view')) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      if (t && t.closest && t.closest('button, a, summary, label')) return; // the control's own Space
      e.preventDefault(); $('#tourPlay').click();
    } else if (e.key === 'ArrowRight') { e.preventDefault(); goStop(tour.i + 1, false); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goStop(tour.i - 1, false); }
  });

  /* ---------- text helpers: sentences with numbered sources ---------- */
  // a story field can be a string, {t, s} or a list of those; always hand back [{t, s: []}]
  function items(x) {
    if (x == null) return [];
    if (typeof x === 'string') return [{ t: x, s: [] }];
    if (Array.isArray(x)) return x.flatMap(items);
    if (typeof x === 'object' && x.t != null) return [{ t: String(x.t), s: Array.isArray(x.s) ? x.s : x.s ? [x.s] : [] }];
    if (typeof x === 'object' && x.text != null) return items(x.text).map((d) => ({ ...d, s: d.s.length ? d.s : (Array.isArray(x.s) ? x.s : x.s ? [x.s] : []) }));
    return [];
  }
  let srcIds = [];
  const srcOf = (id) => (current && storyCache[current.id] && storyCache[current.id].sources && storyCache[current.id].sources[id]) || SRC[id];
  const addSrc = (s) => { if (s && !srcIds.includes(s)) srcIds.push(s); };
  function ref(s, m) {
    const n = srcIds.indexOf(s) + 1;
    if (!n) return null;
    return el('a', { href: `#src-${m.id}-${n}`, 'aria-label': U('detail.srcLabel', { n }), onclick: (ev) => { ev.preventDefault(); const tg = document.getElementById(`src-${m.id}-${n}`); if (tg) { tg.closest('details').open = true; tg.scrollIntoView({ block: 'nearest' }); tg.focus(); } } }, `[${n}]`);
  }
  const supRefs = (ids, m) => (ids && ids.length ? el('sup', {}, ...ids.map((s) => ref(s, m))) : null);
  const textWithRefs = (x, m) => items(x).flatMap((d, k) => [k ? ' ' : '', d.t, ' ', supRefs(d.s, m)]);
  const paras = (x, m) => items(x).map((d) => el('p', { class: 'desc' }, d.t, ' ', supRefs(d.s, m)));
  function collectSources(m, story) {
    srcIds = [];
    for (const d of m.description || []) (d.s || []).forEach(addSrc);
    if (story) {
      const sec = story.sections || {};
      const walk = (x) => items(x).forEach((d) => d.s.forEach(addSrc));
      walk(sec.does); walk(sec.shape); walk(sec.lives && (sec.lives.text ?? sec.lives)); walk(sec.wrong);
      if (sec.history) { walk(sec.history.text); (Array.isArray(sec.history.s) ? sec.history.s : sec.history.s ? [sec.history.s] : []).forEach(addSrc); }
      if (sec.size) { walk(sec.size.compare); walk(sec.size.text); (Array.isArray(sec.size.s) ? sec.size.s : sec.size.s ? [sec.size.s] : []).forEach(addSrc); }
      for (const s of story.tour || []) walk(s.text);
      for (const h of story.highlights || []) walk(h.text);
    }
    addSrc(ownSrc(m));
    for (const d of ((molParts(m) || {}).holdsExtra || [])) (d.s || []).forEach(addSrc);
  }

  /* ---------- gallery, collections, molecule of the week ---------- */
  function renderGallery() {
    const inColl = (m) => !collFilter || (COLLS.find((c) => c.id === collFilter) || { ids: [] }).ids.includes(m.id);
    for (const [group, list, head] of [['small', '#listSmall', '#gSmall'], ['big', '#listBig', '#gBig']]) {
      const mols = MOLS.filter((m) => (m.group || 'big') === group);
      $(list).replaceChildren(...mols.map((m) => {
        const n = LINKS?.molecules[m.id]?.atoms;
        return el('li', { class: inColl(m) ? null : 'off' },
          el('button', { type: 'button', 'data-id': m.id, 'aria-current': String(current === m), onclick: () => { location.hash = m.id; } },
            el('span', { class: 'th', 'aria-hidden': 'true' }, el('img', { src: `thumbs/${m.id}.webp`, alt: '', width: '112', height: '84', loading: 'lazy', decoding: 'async', onerror: (ev) => ev.target.remove() })),
            el('span', { class: 'nm', text: m.short || m.name }),
            n ? el('span', { class: 'ct', text: T('mol.atoms', { n: fmt(n) }) }) : null));
      }));
      const any = mols.some(inColl);
      $(list).hidden = !any; $(head).hidden = !any;
    }
  }
  function renderCollections() {
    if (!COLLS.length) { $('#colls').hidden = true; return; }
    $('#colls').hidden = false;
    const btn = (id, label) => el('button', { type: 'button', class: 'pill', 'aria-pressed': String(collFilter === id), onclick: () => { collFilter = id; renderCollections(); renderGallery(); } }, label);
    $('#collRow').replaceChildren(btn(null, U('coll.all')), ...COLLS.map((c) => btn(c.id, c.label)));
    renderCollNotes();
  }
  // short sourced explainers that belong to a collection (library.json collections[].notes), shown while its chip is on
  function renderCollNotes() {
    const box = $('#collNotes');
    if (!box) return;
    const c = collFilter && COLLS.find((x) => x.id === collFilter);
    const notes = (c && c.notes) || [];
    box.hidden = !notes.length;
    if (!notes.length) { box.replaceChildren(); return; }
    put(box, el('h3', { id: 'collNotesH', text: U('coll.notesTitle') }), ...notes.map((n) => {
      const sids = [...new Set(n.sentences.flatMap((s) => s.s || []))].filter((id) => SRC[id]);
      const cards = (n.ids || []).filter((id) => BY_ID[id]);
      return el('section', { class: 'coll-note', 'aria-labelledby': `cn-${n.id}` },
        el('h4', { id: `cn-${n.id}`, text: n.title }),
        el('p', {}, n.sentences.map((s) => s.t).join(' ')),
        cards.length ? el('p', { class: 'cards' }, ...cards.flatMap((id, i) => [i ? ' ' : null, el('a', { class: 'pill', href: `#${id}`, text: BY_ID[id].short || BY_ID[id].name })])) : null,
        sids.length ? el('p', { class: 'note' }, U('pick.sources') + ': ', ...sids.flatMap((id, i) => {
          const S = SRC[id], href = S.url || (S.doi ? `https://doi.org/${S.doi}` : null);
          const name = S.name || String(S.cite || id).split(/\. |\(/)[0].trim();
          return [i ? ', ' : null, href ? el('a', { href, rel: 'noopener', target: '_blank', text: name }) : name];
        })) : null);
    }));
  }
  // the pick rule lives in motw.js (shared with any home card), so both always agree
  let weekId = null;
  async function renderWeek() {
    const raw = (LIB && (LIB.moleculeOfTheWeek ?? LIB.molecule_of_the_week)) ?? DATA.moleculeOfTheWeek;
    if (!raw) return;
    let id = null;
    try { id = (await import('./motw.js')).pickWeek(raw, (x) => !!BY_ID[x]); } catch (e) { console.warn('motw', e); }
    if (!id) return;
    weekId = id;
    const m = BY_ID[id];
    $('#motw').replaceChildren(el('img', { src: `thumbs/${m.id}.webp`, alt: '', width: '72', height: '54', onerror: (ev) => ev.target.remove() }),
      el('div', {}, el('span', { class: 'eb', text: U('coll.week') }), el('a', { href: `#${m.id}`, 'aria-label': U('coll.weekGo', { name: m.name }), text: m.short || m.name })));
    $('#motw').setAttribute('aria-label', U('coll.week'));
    $('#motw').hidden = false;
  }
  // library.json: tolerant reader (collections as a list or a map; molecules share the molecules.json shape)
  function readLibrary(lib) {
    if (!lib || typeof lib !== 'object') return;
    const mols = Array.isArray(lib.molecules) ? lib.molecules : Array.isArray(lib.entries) ? lib.entries : [];
    for (const m of mols) {
      if (!m || !m.id || !m.file || !m.kind || BY_ID[m.id]) continue;
      if (!Array.isArray(m.description)) m.description = items(m.description || m.intro);
      MOLS.push(m); BY_ID[m.id] = m;
      for (const a of m.aliases || []) ALIAS[a] = m.id;
    }
    const raw = lib.collections;
    const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.entries(raw).map(([id, c]) => (Array.isArray(c) ? { id, molecules: c } : { id, ...c })) : [];
    for (const c of list) {
      const id = c.id || c.name;
      if (!id) continue;
      const ids = (c.molecules || c.ids || c.members || []).map((x) => (typeof x === 'string' ? x : x && x.id)).filter(Boolean);
      COLLS.push({ id, label: c.label || c.name || c.title || id, ids, notes: Array.isArray(c.notes) ? c.notes.filter((n) => n && n.title && Array.isArray(n.sentences)) : [] });
    }
    for (const m of MOLS) for (const cid of [].concat(m.collection || [], m.collections || [])) {
      let c = COLLS.find((x) => x.id === cid);
      if (!c) { c = { id: cid, label: proper(String(cid).replace(/-/g, ' ')), ids: [] }; COLLS.push(c); }
      if (!c.ids.includes(m.id)) c.ids.push(m.id);
    }
    for (const c of COLLS) c.ids = c.ids.filter((id) => BY_ID[id]);
    COLLS = COLLS.filter((c) => c.ids.length);
  }

  /* ---------- detail panel ---------- */
  function renderDetail(m, file, story) {
    collectSources(m, story);
    const ids = srcIds;
    const label = modelLabel(m, false);
    const kv = el('dl', { class: 'kv' });
    const own = ownSrc(m);
    if (m.madeOf) kv.append(el('dt', { text: U('detail.madeOf') }), el('dd', {}, m.madeOf, ' ', supRefs([own], m)));
    const holds = holdsNote(m);
    if (holds) {
      const extra = (molParts(m) || {}).holdsExtra || [];
      kv.append(el('dt', { text: U('holds.label') }), el('dd', {}, holds, ' ', supRefs([own], m), ...(extra.length ? [' ', ...textWithRefs(extra, m)] : [])));
    }
    if (file) {
      const c = file.counts, n = file.atoms.length;
      const fu = modelOf(m).formula;
      if (fu) {
        const bits = String(fu).match(/[A-Z][a-z]?\d*/g) || [String(fu)];
        kv.append(el('dt', { text: U('detail.formula') }), el('dd', { class: 'formula', 'aria-label': bits.map((b) => { const [, e, k] = b.match(/^([A-Za-z]+)(\d*)$/) || [, b, '']; return `${k || 1} ${elName(e.toUpperCase())}`; }).join(', ') },
          ...bits.flatMap((b) => { const [, e, k] = b.match(/^([A-Za-z]+)(\d*)$/) || [, b, '']; return [e, k ? el('sub', { text: k }) : null]; })));
      } else if (m.kind === 'ccd') {
        kv.append(el('dt', { text: U('detail.formula') }), el('dd', { class: 'formula', 'aria-label': hill(c).map(([e, k]) => `${k} ${elName(e)}`).join(', ') },
          ...hill(c).flatMap(([e, k]) => [e, k > 1 ? el('sub', { text: String(k) }) : null])));
      }
      const els = Object.entries(c).sort((a, b) => b[1] - a[1]);
      kv.append(el('dt', { text: U('detail.elements') }), el('dd', {}, el('ul', { class: 'els' }, ...els.map(([e, k]) =>
        el('li', {}, el('a', { href: `../elements/?mol=${m.id}#${proper(e)}`, 'aria-label': T('mol.elChipLabel', { element: elName(e), count: fmt(k), name: m.name }) },
          el('span', { class: 'sw', style: `background:${elColor(e)}`, 'aria-hidden': 'true' }), el('b', { text: proper(e) }), ` ${elName(e)} `, el('span', { class: 'n', text: `x${k.toLocaleString('en')}` })))))));
      const notes = [m.kind === 'pdb' ? U('detail.countedPdb', { n: fmt(n) }) : fu ? U('detail.formulaUnit', { formula: fu, n: fmt(n) }) : U('detail.countedCcd', { n: fmt(n) })];
      if (m.kind === 'pdb' && !c.H) notes.push(U('detail.noH'));
      if (m.note) notes.push(m.note);
      kv.append(el('dt', { 'aria-hidden': 'true' }), el('dd', { class: 'small', style: 'margin:0', text: notes.join(' ') }));
    } else {
      kv.append(el('dt', { text: U('detail.elements') }), el('dd', { text: U('detail.noFile') }));
    }
    const sec = (story && story.sections) || {};
    const h3 = (k) => el('h3', { class: 'subh', text: T(k) });
    const section = (k, x) => (items(x).length ? el('div', { class: 'sec' }, h3(k), ...paras(x, m)) : null);
    const stops = (story && Array.isArray(story.tour) ? story.tour : []).filter((s) => s && (s.title || s.text));
    const tourStart = stops.length && hasWebGL ? el('div', { class: 'tourstart' },
      el('button', { type: 'button', class: 'pill main', 'aria-label': U('tour.startLabel', { name: m.name, n: stops.length }), onclick: () => openTour(0, true) }, U('tour.start')),
      el('span', { class: 'n', text: U('tour.stops', { n: stops.length }) })) : null;
    $('#detail').classList.remove('fresh');
    put($('#detail'), 
      el('h2', { id: 'molName', text: m.name }),
      el('span', { class: 'label', text: label }),
      lightBox(m),
      tourStart,
      ...paras(m.description, m),
      ...lookCloser(m, story, file),
      section('story.does', sec.does),
      section('story.shape', sec.shape),
      kv,
      ...(file ? lightBar(m, file) : []),
      ...whereItLives(m, sec.lives),
      section('story.wrong', sec.wrong),
      history(m, sec.history),
      ...sizeLine(m, sec.size),
      stops.length ? tourText(m, stops) : null,
      el('details', { style: 'margin-top:12px' }, el('summary', { text: U('detail.sources', { n: ids.length }) }),
        el('ol', { class: 'srcs' }, ...ids.map((s, i) => {
          const S = srcOf(s) || { cite: s };
          const href = S.url || (S.doi ? `https://doi.org/${S.doi}` : S.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${S.pmid}/` : null);
          const dm = /^\d{4}-\d{2}-\d{2}/.exec(String(S.checked || '')) || /^\d{4}-\d{2}-\d{2}/.exec(String(S.accessed || ''));
          return el('li', { id: `src-${m.id}-${i + 1}`, tabindex: '-1' }, S.cite || s, ' ', href ? el('a', { href, rel: 'noopener', target: '_blank', text: U('detail.srcLink') }) : null, dm ? el('span', { text: ' ' + U('detail.checked', { date: dm[0] }) }) : null, S.note ? el('span', { class: 'srcnote', text: ' ' + S.note }) : null);
        }))),
    );
    void $('#detail').offsetWidth;
    $('#detail').classList.add('fresh');
  }
  function lookCloser(m, story, file) {
    const hs = (story && Array.isArray(story.highlights) ? story.highlights : []).filter((h) => h && (h.residue != null || (Array.isArray(h.atoms) && h.atoms.length)));
    if (!hs.length || !file) return [];
    const chips = hs.map((h) => {
      if (h.residue == null) {
        // small molecule: light up named atoms (CCD atom names) and say which element they are
        return el('button', { type: 'button', class: 'pill', onclick: () => {
          if (tour.open) closeTour(false);
          focus = { atoms: h.atoms, label: h.label || null };
          flyNext = true;
          draw();
          const a = file.atoms.find((x) => x.name === parseAtom(h.atoms[0])?.label_atom_id) || {};
          showCard(residueCard({ comp: a.comp || m.code, seq: null, ch: null, atom: a.name, el: a.el }, { label: h.label, text: h.text }));
          if (!hasWebGL) $('#pick').scrollIntoView({ block: 'nearest' });
        } }, h.label || h.atoms.join(', '));
      }
      const ch = String(h.chain || (chainsOf(file)[0] || {}).ch || 'A');
      const seq = Array.isArray(h.residue) ? +h.residue[0] : +h.residue;
      return el('button', { type: 'button', class: 'pill', onclick: () => {
        focusResidue(ch, Array.isArray(h.residue) ? [+h.residue[0], +h.residue[1]] : seq, h.label || null);
        const p = pointFromResidue(ch, seq) || { comp: '', seq, ch, el: null };
        showCard(residueCard(p, { label: h.label, text: h.text }));
        if (!hasWebGL) $('#pick').scrollIntoView({ block: 'nearest' });
      } }, h.label || `${ch} ${seq}`);
    });
    return [el('h3', { class: 'subh', text: U('story.look') }), el('div', { class: 'lookrow', role: 'group', 'aria-label': U('story.look') }, ...chips), el('p', { class: 'small', style: 'margin:0 0 6px', text: U('story.lookHint') })];
  }
  function history(m, h) {
    if (!h) return null;
    const dl = el('dl', { class: 'hist' });
    const row = (k, v) => { if (v != null && v !== '') dl.append(el('dt', { text: T(k) }), el('dd', { text: String(v) })); };
    row('story.year', h.year); row('story.who', h.who); row('story.method', h.method);
    if (h.resolution_A != null) row('story.resolution', U('story.resolutionValue', { a: h.resolution_A }));
    const hs = Array.isArray(h.s) ? h.s : h.s ? [h.s] : [];
    return el('div', { class: 'sec' }, el('h3', { class: 'subh', text: U('story.history') }), dl.childNodes.length ? dl : null, ...paras(h.text, m), hs.length && !items(h.text).length ? el('p', { class: 'small' }, supRefs(hs, m)) : null);
  }
  function tourText(m, stops) {
    return el('details', { class: 'tourlist', open: !hasWebGL },
      el('summary', { text: U('tour.textTitle') }),
      el('ol', {}, ...stops.map((s, i) => el('li', {}, el('b', { text: s.title || '' }), el('p', {}, ...textWithRefs(s.text, m)),
        hasWebGL ? el('button', { type: 'button', class: 'pill', onclick: () => openTour(i, false) }, U('tour.showStop')) : null))));
  }

  /* ---------- D1: light up one element, where it lives, size ---------- */
  function lightBar(m, file) {
    const els = Object.entries(file.counts).sort((a, b) => b[1] - a[1]);
    const go = (sym) => { const h = '#' + m.id + (sym ? '?el=' + proper(sym) : ''); if (location.hash !== h) location.hash = h; };
    const bar = el('div', { class: 'lightbar', role: 'group', 'aria-labelledby': 'lightH' },
      el('button', { type: 'button', 'aria-pressed': String(!lightEl), onclick: () => go(null), text: T('mol.lightAll') }),
      ...els.map(([e, k]) => el('button', { type: 'button', 'aria-pressed': String(lightEl === e), 'aria-label': `${elName(e)}, ${fmt(k)}`, onclick: () => go(lightEl === e ? null : e) },
        el('span', { class: 'sw', style: `background:${elColor(e)}`, 'aria-hidden': 'true' }), proper(e))));
    const out = [el('h3', { id: 'lightH', class: 'subh', text: T('mol.lightOne') }), bar];
    if (lightEl && file.counts[lightEl]) out.push(el('p', { class: 'lightmsg', role: 'status' }, el('span', { class: 'gold', 'aria-hidden': 'true' }), T('mol.lightOn', { count: fmt(file.counts[lightEl]), element: elName(lightEl).toLowerCase() })));
    return out;
  }
  // a story link: a plain href, or {href, label}; known targets get their own name
  // typed links {type: cell|part|molecule|element|process, id} resolve through links.json and processes.json
  function typedLink(x) {
    const id = String(x.id || '');
    const L = LINKS || {};
    if (x.type === 'part' && L.parts && L.parts[id]) return { href: '../' + L.parts[id].href, label: L.parts[id].name };
    if (x.type === 'cell' && L.cells && L.cells[id]) return { href: '../' + L.cells[id].href, label: L.cells[id].name };
    if (x.type === 'molecule' && BY_ID[id]) return { href: '#' + id, label: U('story.linkMolecule', { name: BY_ID[id].short || BY_ID[id].name }) };
    if (x.type === 'element' && /^[A-Za-z]{1,3}$/.test(id)) return { href: `../elements/#${proper(id)}`, label: U('story.linkElement', { name: elName(id) }) };
    if (x.type === 'process' && id) { const p = PROC[id]; return { href: `../processes/#${id}`, label: U('story.linkProcess', { name: p ? p.title : proper(id.replace(/-/g, ' ')) }) }; }
    return null;
  }
  function storyLink(x) {
    if (x && typeof x === 'object' && x.type && !x.href && !x.url) { const r = typedLink(x); x = r || null; }
    const href = typeof x === 'string' ? x : x && (x.href || x.url);
    if (!href) return null;
    let label = typeof x === 'object' ? x.label || x.text || x.name || x.title : null;
    if (!label && LINKS) {
      for (const mm of Object.values(LINKS.molecules)) for (const p of mm.cellParts || []) if (p.href === href) label = `${p.partName} (${p.cellName})`;
    }
    if (!label) {
      const mEl = /elements\/(?:\?[^#]*)?#([A-Za-z]{1,3})$/.exec(href);
      const mMol = /molecules\/#([\w-]+)/.exec(href) || (/^#([\w-]+)$/.exec(href));
      const mPr = /processes\/#([\w-]+)/.exec(href);
      if (mEl) label = U('story.linkElement', { name: elName(mEl[1]) });
      else if (mMol && BY_ID[mMol[1]]) label = U('story.linkMolecule', { name: BY_ID[mMol[1]].short || BY_ID[mMol[1]].name });
      else if (mPr) label = U('story.linkProcess', { name: proper(mPr[1].replace(/-/g, ' ')) });
      else label = U('story.linkPage');
    }
    return el('li', {}, el('a', { href }, label));
  }
  function whereItLives(m, lives) {
    const parts = LINKS?.molecules[m.id]?.cellParts || [];
    const h = el('h3', { class: 'subh', text: T('mol.where') });
    const text = lives ? (lives.text !== undefined || lives.links ? lives.text : lives) : null;
    const extra = lives && Array.isArray(lives.links) ? lives.links : [];
    const partHrefs = new Set(parts.map((p) => p.href));
    const links = extra.map((x) => (x && typeof x === 'object' && x.type && !x.href && !x.url ? typedLink(x) : x)).filter(Boolean)
      .filter((x) => !partHrefs.has(typeof x === 'string' ? x : x.href || x.url)).map(storyLink).filter(Boolean);
    const out = [h, ...paras(text, m)];
    if (parts.length) out.push(el('ul', { class: 'where' }, ...parts.map((p) => el('li', {}, el('a', { href: p.href }, el('b', { text: p.partName }), el('span', { text: p.cellName }))))));
    if (links.length) out.push(el('ul', { class: 'slinks' }, ...links));
    if (!parts.length && !links.length && !items(text).length) out.push(el('p', { class: 'small', style: 'margin:0', text: T('mol.whereNone') }));
    return out;
  }
  function sizeLine(m, size) {
    const out = [];
    const story = [];
    if (size && size.nm != null) story.push(el('p', { class: 'sizeline' }, U('story.sizeNm', { nm: size.nm }), ' ', supRefs(Array.isArray(size.s) ? size.s : size.s ? [size.s] : [], m)));
    if (size) story.push(...paras(size.compare, m), ...paras(size.text, m));
    if (!LINKS || !LINKS.molecules[m.id]) return story.length ? [el('h3', { class: 'subh', text: T('mol.size') }), ...story] : [];
    const all = Object.entries(LINKS.molecules).map(([id, x]) => ({ id, n: x.atoms, name: x.short })).sort((a, b) => a.n - b.n);
    const me = LINKS.molecules[m.id];
    const min = all[0];
    const text = m.id === min.id ? T('mol.sizeWater', { n: fmt(me.atoms) })
      : T('mol.sizeLine', { n: fmt(me.atoms), times: fmt(Math.round(me.atoms / min.n)), smallest: min.name.toLowerCase(), min: fmt(min.n) });
    // log-scale strip: one dot per molecule, this one large and labelled
    const W = 360, H = 58, x0 = 16, x1 = W - 24;
    const lmax = Math.ceil(Math.log10(all[all.length - 1].n));
    const X = (n) => x0 + (Math.log10(n) / lmax) * (x1 - x0);
    const NS = 'http://www.w3.org/2000/svg';
    const s = (tag, a = {}, txt) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); if (txt != null) n.textContent = txt; return n; };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sizestrip', 'aria-hidden': 'true' });
    svg.append(s('line', { x1: x0, x2: x1, y1: 30, y2: 30, class: 'axis' }));
    for (let p = 0; p <= lmax; p++) {
      svg.append(s('line', { x1: X(10 ** p), x2: X(10 ** p), y1: 26, y2: 34, class: 'tick' }), s('text', { x: X(10 ** p), y: 50, class: 'tl' }, fmt(10 ** p)));
    }
    for (const a of all) if (a.id !== m.id) svg.append(s('circle', { cx: X(a.n).toFixed(1), cy: 30, r: 3.4, class: 'dot' }));
    const cx = X(me.atoms);
    svg.append(s('circle', { cx: cx.toFixed(1), cy: 30, r: 7, class: 'me' }), s('text', { x: Math.min(Math.max(cx, 40), W - 40).toFixed(1), y: 14, class: 'ml' }, me.short || me.name || ''));
    out.push(el('h3', { class: 'subh', text: T('mol.size') }), ...story, el('p', { class: 'sizeline', text: text }), svg, el('p', { class: 'small', style: 'margin:2px 0 0', text: T('mol.sizeAxis') + (me.hasHydrogen ? '' : '. ' + T('mol.sizeNoH')) }));
    return out;
  }
  function renderLegend(m, file) {
    const items2 = [];
    const elsShown = new Set();
    if (m.kind === 'pdb' && colourMode !== 'parts') {
      items2.push(el('li', {}, el('span', { text: U('legend.' + colourMode) })));
    } else {
      for (const p of partsOf(m)) {
        if (p.element) {
          if (file) for (const a of file.atoms) if (matchSel(p.sel, a)) elsShown.add(a.el);
        } else items2.push(el('li', {}, el('span', { class: 'sw', style: `background:${p.color}`, 'aria-hidden': 'true' }), el('span', { text: U('legend.ribbon', { label: p.label }) })));
      }
      const elParts = partsOf(m).filter((p) => p.element);
      if (elParts.length && elsShown.size) {
        const what = m.kind === 'ccd' ? legendWords(m) : U('legend.byElement', { labels: elParts.map((p) => p.label).join(', ') });
        items2.push(el('li', {}, el('span', { text: what })));
        for (const e of [...elsShown].sort((a, b) => (file.counts[b] || 0) - (file.counts[a] || 0))) {
          items2.push(el('li', {}, el('span', { class: 'sw', style: `background:${elColor(e)}`, 'aria-hidden': 'true' }), el('span', { text: elName(e) })));
        }
      }
    }
    put($('#legend'), ...items2);
    $('#legendCard').hidden = !items2.length;
  }
  function altText(m, file) {
    const parts = partsOf(m);
    if (m.kind === 'ccd') {
      const alt = modelOf(m).alt;
      if (alt === 'atom') return U('alt.atom', { name: m.name.toLowerCase() });
      if (alt === 'lattice') {
        const ions = { NA: 'sodium', CL: 'chloride' };
        const list = file ? hill(file.counts).reverse().map(([e, k]) => `${k} ${ions[e] || elName(e).toLowerCase()}`).join(' and ') : '';
        return U('alt.lattice', { name: m.name.toLowerCase(), list });
      }
      const c = file ? hill(file.counts).map(([e, k]) => `${k} ${elName(e).toLowerCase()}`).join(', ') : '';
      return U('alt.ccd', { name: m.name.toLowerCase(), counts: c ? U('alt.ccdCounts', { list: c }) : '' });
    }
    const ribbons = parts.filter((p) => !p.element).map((p) => U('alt.ribbon', { label: p.label, colour: U('colour.' + String(p.color).toLowerCase()) }));
    const sticks = parts.filter((p) => p.element).map((p) => p.label);
    return U('alt.pdb', { code: m.code, ribbons: ribbons.join('; '), sticks: sticks.length ? U('alt.sticks', { labels: sticks.join(' and ') }) : '' });
  }

  /* ---------- hero scenes over the real structure: cinematic DNA (web/dna), hemoglobin breathing (web/morph),
     ATP synthase spinning (web/atp-scene). Each module is imported the first time the visitor opens it, and unmounted
     on close or when they pick another molecule. They follow the page theme (they watch data-theme on <html>), so the
     shell's theme button reaches them. Their own "Real structure" button brings the visitor back to Mol*. */
  const CINE = {
    dna: { mod: '../dna/dna.js', on: () => T('mol.cineOn'), label: () => T('mol.cineOnLabel'), opts: {}, real: 'a.dna-primary', view: '.dna-view' },
    hemoglobin: { mod: '../morph/morph.js', on: () => U('cine.breathe'), label: () => U('cine.breatheLabel'), opts: { startView: 'heme' }, real: 'a.hb-primary' },
    'atp-synthase': { mod: '../atp-scene/atp.js', on: () => U('cine.spin'), label: () => U('cine.spinLabel'), opts: {}, real: 'a.at-primary' },
  };
  const cineMods = {};
  let cineOpen = false, cineId = null;
  function syncCine() {
    const b = $('#cineBtn');
    const c = current && CINE[current.id];
    if (cineOpen && cineId !== (current && current.id)) closeCine(false);
    b.hidden = !c;
    if (!c) return;
    b.textContent = c.on();
    b.setAttribute('aria-label', c.label());
  }
  async function openCine() {
    const id = current.id, c = CINE[id];
    if (!c) return;
    const box = $('#cine');
    if (tour.open) closeTour(false);
    openCtrls(false);
    cineOpen = true; cineId = id;
    setSpin(false);
    box.hidden = false;
    $('#stagewrap').classList.add('cine-open');
    $('#cineBtn').setAttribute('aria-expanded', 'true');
    box.replaceChildren(el('p', { class: 'msgbox', role: 'status' }, el('span', { class: 'spin' }), T('mol.cineLoading')));
    try {
      if (!cineMods[id]) cineMods[id] = await import(c.mod);
      if (!cineOpen || cineId !== id) return;
      box.replaceChildren();
      await cineMods[id].mount(box, { embedded: true, realHref: '#' + id, ...c.opts });
      if (!cineOpen || cineId !== id) { cineMods[id].unmount(); return; }
      const v = (c.view && box.querySelector(c.view)) || box.querySelector('[tabindex="0"], button');
      if (v) v.focus();
    } catch (e) {
      console.error(e);
      if (cineOpen) box.replaceChildren(el('p', { class: 'msgbox', role: 'status', text: T('mol.cineFailed') }));
    }
  }
  function closeCine(focusBack) {
    if (!cineOpen && $('#cine').hidden) return;
    cineOpen = false;
    if (cineId && cineMods[cineId]) { try { cineMods[cineId].unmount(); } catch (e) { console.warn('unmount', e); } }
    cineId = null;
    const box = $('#cine');
    box.replaceChildren(); box.hidden = true;
    $('#stagewrap').classList.remove('cine-open');
    $('#cineBtn').setAttribute('aria-expanded', 'false');
    if (focusBack) $('#cineBtn').focus();
  }
  $('#cineBtn').addEventListener('click', () => (cineOpen ? closeCine(true) : openCine()));
  $('#cine').addEventListener('click', (e) => {
    const c = cineId && CINE[cineId];
    const a = c && e.target.closest && e.target.closest(c.real);
    if (a) { e.preventDefault(); closeCine(true); }
  });

  /* ---------- selection and deep links ---------- */
  async function select(id, opts = {}) {
    const m = BY_ID[id] || BY_ID[ALIAS[id]] || BY_ID[DEFAULT_ID];
    const wantEl = opts.el ? opts.el.toUpperCase() : null;
    if (current === m && lightEl === wantEl && !opts.force && opts.tour == null) return;
    const sameMol = current === m;
    current = m;
    lightEl = wantEl;
    syncCine();
    const ln = $('#lineupLink');
    if (ln) { ln.href = '../lineup/?m=' + encodeURIComponent(m.id); ln.setAttribute('aria-label', U('coll.lineupLabel', { name: m.name })); }
    if (sameMol && !opts.force && fileCache[m.id]) {
      // same molecule, different element to light up (or a tour stop link): keep the page, redraw the 3D and the controls
      if (opts.tour != null && tour.stops.length) { openTour(opts.tour, false); return; }
      if (tour.open) closeTour(false);
      focus = null;
      renderDetail(m, fileCache[m.id], storyCache[m.id]);
      await draw();
      return;
    }
    // a new molecule: close everything that belonged to the old one
    if (tour.open) { tour.open = false; setPlaying(false); $('#tour').hidden = true; $('#tourBtn').setAttribute('aria-expanded', 'false'); }
    focus = null; flyNext = false; tour.stops = [];
    if (meas.on) setMeasure(false);
    closePick();
    openCtrls(false);
    if (ionic(m)) { styleMode = 'spacefill'; ionStyleOn = true; } else { if (ionStyleOn) { styleMode = baseStyle(m); ionStyleOn = false; } styleMode = fitStyle(m, styleMode); }
    document.title = U('copy.docTitle', { name: m.name });
    document.querySelectorAll('.grid button').forEach((b) => {
      b.setAttribute('aria-current', String(b.dataset.id === m.id));
      if (b.dataset.id === m.id) b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    });
    $('#badge').textContent = modelLabel(m, true);
    $('#badge').hidden = false;
    $('#tourBtn').hidden = true;
    let file = null, story = null;
    const [fr, sr] = await Promise.allSettled([getFile(m), getStory(m)]);
    if (fr.status === 'fulfilled') file = fr.value; else console.error(fr.reason);
    if (sr.status === 'fulfilled') story = sr.value;
    if (current !== m) return;
    tour.stops = (story && Array.isArray(story.tour) ? story.tour : []).filter((s) => s && (s.title || s.text));
    $('#tourBtn').hidden = !(tour.stops.length && hasWebGL && file);
    $('#tourBtn').textContent = U('tour.startShort');
    $('#tourBtn').setAttribute('aria-label', U('tour.startLabel', { name: m.name, n: tour.stops.length }));
    $('#viewBtn').hidden = !(hasWebGL && file);
    renderDetail(m, file, story);
    renderLegend(m, file);
    renderControls();
    renderSeq();
    const alt = altText(m, file);
    $('#altText').textContent = alt;
    $('#viewport').setAttribute('aria-label', U('alt.viewport', { name: m.name, alt }));
    if (!file) { showMsg([el('p', { style: 'margin:0', text: U('copy.viewFailed') })]); return; }
    if (!hasWebGL) { showMsg([still(m), el('p', { style: 'margin:0', text: U('copy.noWebgl') })]); return; }
    await draw();
    if (opts.tour != null && tour.stops.length && current === m) openTour(opts.tour, false);
  }
  function fromHash() {
    const raw = decodeURIComponent(location.hash.slice(1));
    if (raw.toLowerCase().startsWith('src-')) return;
    const [id, q] = raw.split('?');
    const qs = new URLSearchParams(q || '');
    const elp = qs.get('el');
    const m = BY_ID[id.toLowerCase()] || BY_ID[ALIAS[id.toLowerCase()]];
    // only light an element this molecule actually has
    const ok = elp && m && LINKS?.molecules[m.id]?.elements[proper(elp)] ? elp : null;
    const tn = parseInt(qs.get('tour'), 10);
    select(id.toLowerCase() || DEFAULT_ID, { el: ok, tour: Number.isFinite(tn) && tn > 0 ? tn - 1 : null });
  }

  /* ---------- boot ---------- */
  async function boot() {
    applyTheme();
    try {
      const opt = (u) => getJSON(u);
      const [d, s, lk, ck, rs, sidx, lb, lbs, sts, pr, ht, pt] = await Promise.all([fetch('molecules.json').then((r) => r.json()), fetch('sources.json').then((r) => r.json()), opt('../data/links.json'), opt('../data/copy-links.json'), opt('residues.json'), opt('story-index.json'), opt('library.json'), opt('library-sources.json'), opt('stories/sources.json'), opt('../processes/processes.json'), opt('hets.json'), opt('parts.json')]);
      DATA = d; UI = d.ui; LINKS = lk; CK = ck || {}; RES = rs || RES; LIB = lb; HETS = ht && ht.codes ? ht : null;
      // parts.json: friendly chain names and part lines for the tap card, and the card's balls-or-ribbon note (words in molecules.json ui)
      PARTS = pt && pt.molecules ? pt : null;
      // one source table for the page: molecules.json sources win, then the library's, then the stories'
      const asMap = (x) => { const v = x && (x.sources || x); if (Array.isArray(v)) return Object.fromEntries(v.filter((o) => o && o.id).map((o) => [o.id, o])); return v && typeof v === 'object' ? v : {}; };
      SRC = { ...asMap(sts), ...asMap(lbs), ...s.sources };
      for (const S of Object.values(SRC)) if (S && !S.cite) S.cite = [S.publisher, S.title].filter(Boolean).join('. ') + '.';
      for (const p of (pr && pr.processes) || []) if (p && p.id) PROC[p.id] = p;
      if (sidx) {
        const list = Array.isArray(sidx) ? sidx : sidx.stories || sidx.ids || sidx.molecules || Object.keys(sidx);
        STORY_IDS = new Set(list.map((x) => (typeof x === 'string' ? x : x && x.id)).filter(Boolean));
      }
    } catch (e) {
      console.error(e);
      $('#detail').replaceChildren(el('p', { text: (UI && UI['copy.loadFailed']) || 'The molecule list could not load. Please refresh the page.' }));
      return;
    }
    document.querySelectorAll('[data-copy]').forEach((n) => { if (UI[n.dataset.copy]) n.textContent = UI[n.dataset.copy]; });
    $('#viewBtn').textContent = U('view.open');
    $('#viewBtn').setAttribute('aria-label', U('view.openLabel'));
    $('#tourBack').textContent = U('tour.back'); $('#tourBack').setAttribute('aria-label', U('tour.backLabel'));
    $('#tourNext').textContent = U('tour.next'); $('#tourNext').setAttribute('aria-label', U('tour.nextLabel'));
    $('#tourClose').textContent = U('tour.close'); $('#tourClose').setAttribute('aria-label', U('tour.closeLabel'));
    $('#tourDots').setAttribute('aria-label', U('tour.dots'));
    $('#tourKeys').textContent = U('tour.keys');
    $('#tour').setAttribute('aria-describedby', 'tourKeys');
    $('#measureBtn').setAttribute('aria-label', U('measure.toggleLabel'));
    $('#viewport').setAttribute('aria-label', U('copy.viewport'));
    applyTheme();
    MOLS = DATA.molecules.slice();
    for (const m of MOLS) { BY_ID[m.id] = m; for (const a of m.aliases || []) ALIAS[a] = m.id; }
    readLibrary(LIB);
    renderCollections();
    renderGallery();
    renderWeek();
    setSpin(false);
    if (!hasWebGL) for (const id of ['#spinBtn', '#resetBtn']) $(id).style.display = 'none';
    window.addEventListener('hashchange', fromHash);
    new ResizeObserver(() => { if (viewer) viewer.handleResize(); }).observe($('#stagewrap'));
    fromHash();
  }
  window.__mols = { select, get viewer() { return viewer; }, get current() { return current; }, get shown() { return loadedId; }, get files() { return fileCache; }, get stories() { return storyCache; }, get tour() { return tour; }, get week() { return weekId; }, openTour, closeTour, hill, countEls };
  boot();
})();
