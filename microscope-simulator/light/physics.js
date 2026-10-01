// Light scene physics. Pure functions, no drawing. Every constant and table here is sourced in sources.json:
//   h, c, e        CODATA 2022 via NIST (codata-h, codata-c, codata-e), all exact.
//   E = hc / lambda OpenStax University Physics 3, 6.2 (os-up3-6-2).
//   flint glass n  OpenStax University Physics 3, 1.5, Table 1.2 (os-up3-1-5); Cauchy fit n = A + B / lambda^2.
//   colour         CIE 1931 2 degree colour matching functions (cie1931) -> linear sRGB with the W3C CSS Color 4
//                  matrix and transfer function (w3c-color4).
//   spectra        data/spectra.json: ASTM G173-03 sunlight (astm-g173), PhotochemCAD chlorophyll a and b (pcad).
//   pigment mix    24 chlorophyll a to 18 chlorophyll b, counted in PDB 2BHW (pdb-2bhw, standfuss-2005).

export const H = 6.62607015e-34;   // J s (J/Hz), exact
export const C = 299792458;        // m/s, exact
export const QE = 1.602176634e-19; // C, exact; 1 eV = QE joules
export const HC_EV_NM = (H * C / QE) * 1e9;  // about 1239.84 eV nm, computed, not typed in

export const NM_MIN = 380, NM_MAX = 750;      // slider range
export const SEE_MIN = 400, SEE_MAX = 750;    // "about 400 to about 750 nm" (os-up2-16-5)
export const MIX_A = 24, MIX_B = 18;          // chlorophylls a and b in the 2BHW trimer
export const PEAK_CATCH = 0.95;               // illustrative thickness: 95% caught at the strongest peak

export function photon(nm) {
  const m = nm * 1e-9;
  const J = H * C / m;
  return { nm, J, eV: J / QE, THz: C / m / 1e12 };
}

// ---- prism: flint glass from OpenStax Table 1.2 ----
const FLINT = [[660, 1.662], [610, 1.665], [580, 1.667], [550, 1.674], [470, 1.684], [410, 1.698]];
const cauchy = (() => {
  // least squares n = A + B x with x = 1 / lambda^2
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [l, n] of FLINT) { const x = 1 / (l * l); sx += x; sy += n; sxx += x * x; sxy += x * n; }
  const k = FLINT.length, B = (k * sxy - sx * sy) / (k * sxx - sx * sx), A = (sy - B * sx) / k;
  return { A, B };
})();
export const flintN = (nm) => cauchy.A + cauchy.B / (nm * nm);
export const PRISM_APEX = 60, PRISM_IN = 55;  // degrees
const RAD = Math.PI / 180;
// Deviation of a ray through the prism by Snell's law at both faces (degrees).
export function prismDeviation(nm) {
  const n = flintN(nm), A = PRISM_APEX * RAD, t1 = PRISM_IN * RAD;
  const t2 = Math.asin(Math.sin(t1) / n);
  const t3 = A - t2;
  const s4 = n * Math.sin(t3);
  if (s4 >= 1) return NaN;
  return (t1 + Math.asin(s4) - A) / RAD;
}

// ---- spectra ----
export function makeSpectra(data) {
  const V = data.vis, W = data.wide;
  const at = (arr, start, step, x) => {
    const f = (x - start) / step, i = Math.floor(f);
    if (i < 0) return arr[0];
    if (i >= arr.length - 1) return arr[arr.length - 1];
    const t = f - i; return arr[i] * (1 - t) + arr[i + 1] * t;
  };
  const v = (name, nm) => at(V[name], V.start, V.step, nm);
  const cmf = (nm) => [v('x', nm), v('y', nm), v('z', nm)];

  // XYZ -> linear sRGB (W3C CSS Color 4 sample code)
  const M = [[12831 / 3959, -329 / 214, -1974 / 3959], [-851781 / 878810, 1648619 / 878810, 36519 / 878810], [705 / 12673, -2585 / 12673, 705 / 667]];
  const toLin = (X) => M.map((r) => r[0] * X[0] + r[1] * X[1] + r[2] * X[2]);
  const gam = (x) => { const s = x < 0 ? -1 : 1, a = Math.abs(x); return a > 0.0031308 ? s * (1.055 * Math.pow(a, 1 / 2.4) - 0.055) : 12.92 * x; };

  // Nearest screen colour for a mix: clip negatives (out of gamut), keep the hue, scale so the brightest channel is 1.
  const hue = (X) => {
    const l = toLin(X).map((x) => Math.max(0, x));
    const m = Math.max(l[0], l[1], l[2]) || 1;
    return l.map((x) => x / m);
  };
  const linColour = (nm) => hue(cmf(nm));
  const colour = (nm) => linColour(nm).map(gam);
  // how bright the wavelength looks to the eye (CIE y), 0 to 1
  const seen = (nm) => v('y', nm);
  const css = (rgb) => `rgb(${rgb.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)).join(',')})`;
  const cssOf = (nm, dim = true) => {
    const c = colour(nm);
    const b = dim ? Math.min(1, Math.max(0.6, Math.sqrt(seen(nm) / 0.18))) : 1;
    return css(c.map((x) => x * b));
  };

  // ---- chlorophyll absorption ----
  let mixMax = 0;
  for (let nm = V.start; nm < V.start + V.chla.length; nm++) mixMax = Math.max(mixMax, MIX_A * v('chla', nm) + MIX_B * v('chlb', nm));
  const OD = -Math.log10(1 - PEAK_CATCH);
  const mix = (nm) => (MIX_A * v('chla', nm) + MIX_B * v('chlb', nm)) / mixMax;
  const pCatch = (nm) => 1 - Math.pow(10, -OD * mix(nm));
  // chance that a caught photon was caught by a chlorophyll b rather than an a
  const pB = (nm) => { const a = MIX_A * v('chla', nm), b = MIX_B * v('chlb', nm); return a + b > 0 ? b / (a + b) : 0.5; };
  const epsMax = Math.max(...V.chla, ...V.chlb);

  // ---- sunlight as photons: photon count per nm is irradiance / photon energy, so weight = irradiance x lambda ----
  const cdfNm = [], cdf = [];
  let acc = 0;
  for (let nm = NM_MIN; nm <= NM_MAX; nm++) { acc += v('solar', nm) * nm; cdfNm.push(nm); cdf.push(acc); }
  const sampleNm = (r) => {
    const target = r * acc; let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < target) lo = mid + 1; else hi = mid; }
    return cdfNm[lo] + (Math.random() - 0.5);
  };

  // Colour of light coming in (sunlight photons) and of light bouncing back (photons not caught), from the curves.
  const mixColours = () => {
    const inn = [0, 0, 0], out = [0, 0, 0];
    for (let nm = 380; nm <= 780; nm++) {
      const s = v('solar', Math.min(nm, 800)), c = cmf(nm), keep = 1 - pCatch(Math.min(nm, 800));
      for (let k = 0; k < 3; k++) { inn[k] += s * c[k]; out[k] += s * keep * c[k]; }
    }
    return { inn: hue(inn).map(gam), out: hue(out).map(gam), keptShare: out[1] / inn[1] };
  };

  // wide chart helpers
  const wide = (name, nm) => at(W[name], W.start, W.step, nm);
  const wideRange = [W.start, W.start + W.step * (W.global.length - 1)];

  const peaks = data.facts;

  return { v, cmf, colour, linColour, cssOf, css, seen, mix, pCatch, pB, epsMax, sampleNm, mixColours, wide, wideRange, peaks, hue, gam };
}

export function colourName(nm, names) {
  let out = names[0][1];
  for (const [from, name] of names) if (nm >= from) out = name;
  return out;
}

// number formatting without dashes: 6.626 x 10^-34 style for the formula line
export function sci(x, digits = 3) {
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  const sup = String(e).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  return `${m.toFixed(digits)} × 10${sup}`;
}
