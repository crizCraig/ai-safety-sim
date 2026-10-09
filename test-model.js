// Headless sanity check: node test-model.js
// Prints outcome mix, milestone years, and p(alignment) for policy presets,
// alongside AI 2040's own p(alignment) medians where a plan is comparable.
require('./model.js');
const M = globalThis.SimModel;
const P = (o) => ({ ...M.defaultLevers(), ...o });
const presets = {
  'Status quo': [P({}), null],
  'Race to ASI (D)': [P({ race: 1, safety: 0.025, openness: 0.4, transparency: 0.05, biodef: 0.1, diplomacy: 0.05, oversight: 0 }), 0.25],
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
