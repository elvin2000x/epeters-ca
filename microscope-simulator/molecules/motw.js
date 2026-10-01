/* Molecule of the week: one pick per ISO week from molecules.json "moleculeOfTheWeek" {start, ids}.
   Week 0 is the week holding "start" (a Monday); the list loops. Ids from library.json count too.
   Used by molecules.js (the card above the gallery) and available for a home card:
     const { moleculeOfTheWeek } = await import('./molecules/motw.js');
     const m = await moleculeOfTheWeek();   // { id, name, short, href, thumb } or null
   href and thumb are absolute URLs built from this file's location, so any page can use them. */

const DAY = 86400000;
const monday = (d) => { const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (new Date(t).getUTCDay() + 6) % 7; return t - wd * DAY; };

export function weekIndex(start, date = new Date()) {
  const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(start || ''));
  const s0 = s ? monday(new Date(+s[1], +s[2] - 1, +s[3])) : monday(new Date(2026, 0, 5));
  return Math.floor((monday(date) - s0) / (7 * DAY));
}

// cfg: {start, ids} (or a plain list of ids); known: a Set or function telling which ids exist
export function pickWeek(cfg, known, date = new Date()) {
  const raw = Array.isArray(cfg) ? cfg : (cfg && (cfg.ids || cfg.pool || cfg.list || cfg.molecules)) || [];
  const has = typeof known === 'function' ? known : known ? (id) => known.has(id) : () => true;
  const ids = raw.map((x) => (typeof x === 'string' ? x : x && x.id)).filter((id) => id && has(id));
  if (!ids.length) return null;
  const n = ids.length, i = weekIndex(cfg && cfg.start, date);
  return ids[((i % n) + n) % n];
}

export async function moleculeOfTheWeek({ date = new Date() } = {}) {
  const base = new URL('./', import.meta.url);
  const get = (f) => fetch(new URL(f, base)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [d, lib] = await Promise.all([get('molecules.json'), get('library.json')]);
  if (!d) return null;
  const all = new Map();
  for (const m of [...(d.molecules || []), ...((lib && lib.molecules) || [])]) if (m && m.id && !all.has(m.id)) all.set(m.id, m);
  const cfg = (lib && lib.moleculeOfTheWeek) || d.moleculeOfTheWeek;
  const id = pickWeek(cfg, (x) => all.has(x), date);
  if (!id) return null;
  const m = all.get(id);
  return { id, name: m.name, short: m.short || m.name, href: new URL('#' + id, base).href, thumb: new URL(`thumbs/${id}.webp`, base).href };
}
