// Headless sanity check: node test-model.js
// Prints outcome mix, milestone years, and p(alignment) for policy presets,
// alongside AI 2040's own p(alignment) medians where a plan is comparable.
require('./model.js');
const M = globalThis.SimModel;
const P = (o) => ({ ...M.defaultLevers(), ...o });
const presets = {
  'Status quo': [P({}), null],
  'Race to ASI (D)': [P({ race: 1, safety: 0.025, openness: 0.4, transparency: 0.05, biodef: 0.1, diplomacy: 0.05, oversight: 0 }), 0.25],
  'Fight China (B)': [P({ race: 0.8, safety: 0.2, openness: 0.1, transparency: 0.05, diplomacy: 0, oversight: 0.15 }), 0.50],
  'Burn the lead (C)': [P({ race: 0.8, safety: 0.14, transparency: 0.15, diplomacy: 0.1, oversight: 0.3 }), 0.40],
  'Plan A': [P({ race: 0.35, safety: 0.08, openness: 0.15, transparency: 0.9, biodef: 0.5, diplomacy: 0.85, oversight: 0.7 }), 0.72],
  'Open everything': [P({ race: 0.6, safety: 0.04, openness: 1, biodef: 0.05, diplomacy: 0.3 }), null],
  'Open + biodefense': [P({ race: 0.6, safety: 0.05, openness: 1, biodef: 0.8, diplomacy: 0.3, oversight: 0.2 }), null],
  'Global pause': [P({ race: 0.05, safety: 0.13, openness: 0.2, biodef: 0.5, diplomacy: 1, oversight: 0.7 }), null],
  'Neuralink bet': [P({ race: 0.6, bci: 1 }), null],
  'BCI-first': [P({ race: 0.25, safety: 0.1, bci: 1, transparency: 0.5, diplomacy: 0.5, oversight: 0.4 }), null],
  'Plan A + BCI': [P({ race: 0.35, safety: 0.08, openness: 0.15, transparency: 0.9, biodef: 0.5, diplomacy: 0.85, oversight: 0.7, bci: 1 }), null],
  'Safety 100%': [P({ safety: 1 }), null],
  'Safety 30%': [P({ safety: 0.3 }), null],
};
for (const [name, [L, theirs]] of Object.entries(presets)) {
  const r = M.summarize(L, M.defaultAssumptions(), 4000, 7);
  const mix = Object.entries(r.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${(100 * v / r.n).toFixed(0)}`).join(' ');
  console.log(name.padEnd(18), `AC~${r.acMedian} ASI~${r.asiMedian || '-'}(${(100 * r.asiShare).toFixed(0)}%)`,
    `p(align)=${(100 * r.pAlignment).toFixed(0)}%` + (theirs ? ` [AI 2040: ${theirs * 100}%]` : ''), '|', mix);
}

// Bio calibration: decade risk (2027–2036) across worlds on the default path,
// against the separate factored Monte Carlo decomposition.
{
  const rng = M.mulberry32(11), A = M.defaultAssumptions(), L = M.defaultLevers(), n = 20000, risks = [];
  for (let i = 0; i < n; i++) {
    const s = M.initialState(M.sampleWorld(A, rng));
    let h = 0;
    for (let y = 0; y < 10; y++) { h += s.world.bioScale * M.bioShape(s); M.step(s, L, rng, false); }
    risks.push(1 - Math.exp(-h));
  }
  risks.sort((a, b) => a - b);
  const q = (p) => risks[Math.floor(p * (n - 1))].toExponential(1);
  const over = (x) => (risks.filter((r) => r > x).length / n).toFixed(3);
  console.log(`\nBio decade risk, default path: median ${q(0.5)} [target 1.2e-4], 95% ${q(0.025)}..${q(0.975)} [5e-7..3e-2],`,
    `P(>1%) ${over(0.01)} [0.055], P(>10%) ${over(0.1)} [0.007]`);
}
