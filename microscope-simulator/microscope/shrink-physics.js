// Physics for "Shrink yourself". Pure functions, no DOM, so tools/shrink_physics_check.mjs can run them in node.
// SI units throughout. Constants come from shrink.json (each one sourced there).
// Model (shown on the page): the swimmer is a ball of diameter L with the density of water.
//   Reynolds number    Re = ρ v L / μ                              (OpenStax College Physics 12.6)
//   drag               F = a v + b v²,  a = 6πμr (Stokes), b = ½ C ρ π r²   (OpenStax 12.6 and 5.2)
//   coasting           m dv/dt = -(a v + b v²)  =>  x(v0 -> v1) = (m/b) ln((a + b v0) / (a + b v1))
//                                                  t(v0 -> v1) = (m/a) ln( v0 (a + b v1) / (v1 (a + b v0)) )
//   Brownian           D = kT / (6πμr) (Stokes Einstein), x_rms = √(2 D t) along one direction (OpenStax 12.7)

export function makePhysics(C, anchors) {
  const k = C.kB.value, T = C.T.value, rho = C.rho.value, mu = C.mu.value, Cd = C.Cd.value;
  const atom = 2 * C.bohr.value;
  const A = [...anchors].sort((p, q) => p.L - q.L);

  // speed at size L: measured at the anchors, a straight line on log-log axes in between
  function speed(L) {
    if (L <= A[0].L) return { v: A[0].v * (L / A[0].L), anchor: Math.abs(Math.log(L / A[0].L)) < 0.02 ? A[0] : null };
    for (let i = 0; i < A.length - 1; i++) {
      const p = A[i], q = A[i + 1];
      if (L <= q.L) {
        const f = Math.log(L / p.L) / Math.log(q.L / p.L);
        const v = Math.exp(Math.log(p.v) + f * (Math.log(q.v) - Math.log(p.v)));
        const near = Math.abs(Math.log(L / p.L)) < 0.02 ? p : Math.abs(Math.log(L / q.L)) < 0.02 ? q : null;
        return { v, anchor: near };
      }
    }
    const z = A[A.length - 1];
    return { v: z.v, anchor: Math.abs(Math.log(L / z.L)) < 0.02 ? z : null };
  }

  function at(L) {
    const { v, anchor } = speed(L);
    const r = L / 2;
    const m = rho * (4 / 3) * Math.PI * r * r * r;
    const a = 6 * Math.PI * mu * r;
    const b = 0.5 * Cd * rho * Math.PI * r * r;
    const Re = (rho * v * L) / mu;
    const v1 = v / 10;
    const coast = (m / b) * Math.log((a + b * v) / (a + b * v1));
    const tStop = (m / a) * Math.log((v * (a + b * v1)) / (v1 * (a + b * v)));
    const D = (k * T) / (6 * Math.PI * mu * r);
    const jiggle1s = Math.sqrt(2 * D * 1);
    return { L, r, v, anchor, m, a, b, Re, coast, tStop, D, jiggle1s, atom, coastAtoms: coast / atom, coastBodies: coast / L, jiggleBodies: jiggle1s / L, speedBodies: v / L };
  }

  // speed after time t of coasting from v0 (closed form of m dv/dt = -(a v + b v²))
  function vAfter(p, t) {
    const e = Math.exp((-p.a * t) / p.m);
    return (p.a * p.v * e) / (p.a + p.b * p.v * (1 - e));
  }
  // distance covered after time t of coasting
  function xAfter(p, t) {
    return (p.m / p.b) * Math.log((p.a + p.b * p.v) / (p.a + p.b * vAfter(p, t)));
  }
  return { at, vAfter, xAfter, speed, constants: { k, T, rho, mu, Cd, atom } };
}
