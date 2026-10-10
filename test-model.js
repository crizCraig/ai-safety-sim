// Model checks: node test-model.js  (exits 1 if any check fails)
// Prints each preset's outcome mix, then asserts calibration targets with tolerances.
require('./model.js');
require('./presets.js');
const M = globalThis.SimModel, { PRESETS } = globalThis.SimPresets;
const A0 = M.defaultAssumptions();
let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const near = (x, target, tol) => Math.abs(x - target) <= tol;
const bad = (r) => (r.counts.bio + r.counts.misalign + r.counts.war + r.counts.benevolent + r.counts.lockin) / r.n;

// --- Outcome mix for every preset (informational) ---
const summaries = {};
for (const [name, L] of Object.entries(PRESETS)) {
  const r = M.summarize(L, A0, 6000, 7);
  summaries[name] = r;
  const mix = Object.entries(r.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${(100 * v / r.n).toFixed(1)}`).join(' ');
  console.log(name.padEnd(26), `AC~${r.acMedian} ASI~${r.asiMedian || '-'} p(align) ${(100 * r.pAlignment).toFixed(0)}% cat ${(100 * r.catastrophe).toFixed(1)}% |`, mix);
}
console.log('');

// --- AI 2040 calibration (their median p(alignment) per plan) ---
const pa = (n) => 100 * summaries[n].pAlignment;
check('Plan A p(alignment) ≈ 72% (±5)', near(pa('Plan A: Verified slowdown'), 72, 5), pa('Plan A: Verified slowdown').toFixed(1));
check('Plan B p(alignment) ≈ 50% (±5)', near(pa('Plan B: Fight China'), 50, 5), pa('Plan B: Fight China').toFixed(1));
check('Plan C p(alignment) ≈ 40% (±6)', near(pa('Plan C: Burn the lead'), 40, 6), pa('Plan C: Burn the lead').toFixed(1));
// Known gap: the model is more pessimistic than AI 2040 about racing (documented).
check('Plan D p(alignment) in 10–30%', pa('Plan D: Race to ASI') >= 10 && pa('Plan D: Race to ASI') <= 30, pa('Plan D: Race to ASI').toFixed(1));
const sq = summaries['Status quo'];
check('Status quo reaches Automated Coder by 2030 (median)', sq.acMedian === 2030, String(sq.acMedian));
check('Status quo superintelligence 2031–2032 (median)', sq.asiMedian >= 2031 && sq.asiMedian <= 2032, String(sq.asiMedian));

// --- Bio calibration: risk actually faced on the default path, 2027–2036 ---
// Each world's realized decade risk = 1 - exp(-k * exposure until the future ends).
{
  const rng = M.mulberry32(11), L = M.defaultLevers(), n = 20000, risks = [];
  for (let i = 0; i < n; i++) {
    const s = M.initialState(M.sampleWorld(A0, rng));
    let h = 0;
    for (let y = 0; y < 10 && !s.outcome; y++) { h += M.bioShape(s); M.step(s, L, rng, true); }
    risks.push(1 - Math.exp(-s.world.bioScale * h));
  }
  risks.sort((a, b) => a - b);
  const q = (p) => risks[Math.floor(p * (n - 1))];
  const over = (x) => risks.filter((r) => r > x).length / n;
  check('Bio realized decade risk median ≈ 1.2e-4 (within ×1.6)', q(0.5) > 1.2e-4 / 1.6 && q(0.5) < 1.2e-4 * 1.6, q(0.5).toExponential(2));
  check('Bio P(decade risk > 1%) ≈ 0.055 (0.035–0.08)', over(0.01) >= 0.035 && over(0.01) <= 0.08, over(0.01).toFixed(3));
  check('Bio P(decade risk > 10%) ≈ 0.007 (0.003–0.013)', over(0.1) >= 0.003 && over(0.1) <= 0.013, over(0.1).toFixed(4));
}

// --- A pause holds capability still ---
for (const [label, L] of [['race 0', { ...M.defaultLevers(), race: 0 }], ['safety 100%', { ...M.defaultLevers(), safety: 1 }]]) {
  const rng = M.mulberry32(5); let gain = 0; const n = 2000;
  for (let i = 0; i < n; i++) {
    const s = M.initialState(M.sampleWorld(A0, rng)), c0 = s.capUS;
    for (let y = 0; y < 13; y++) M.step(s, L, rng, false);
    gain += s.capUS - c0;
  }
  check(`US capability gain 2027–2040 at ${label} < 2 points`, gain / n < 2, (gain / n).toFixed(2));
}

// --- Effective alignment has no jump when China edges ahead ---
{
  const mk = (cn) => Object.assign(M.initialState(), { capUS: 100, capCN: cn, align: 80, coord: 22 });
  const L = M.defaultLevers();
  const a = M.transitionOdds(mk(100), true, L), b = M.transitionOdds(mk(100.01), true, L);
  check('Handoff odds continuous as China passes the US (Δ < 0.02)', Math.abs(a - b) < 0.02, `${a.toFixed(3)} vs ${b.toFixed(3)}`);
}

// --- Shown belief that alignment is easy matches the sampled share ---
{
  const rng = M.mulberry32(9); let easy = 0; const n = 50000;
  for (let i = 0; i < n; i++) if (M.sampleWorld(A0, rng).safe) easy++;
  const shown = M.meanWorld().pSafe;
  check('pSafe belief matches sampled share (±0.005)', near(shown, easy / n, 0.005), `${shown.toFixed(4)} vs ${(easy / n).toFixed(4)}`);
}

// --- Optimized presets keep their promises ---
{
  const r = M.summarize(PRESETS['Safest mix'], A0, 20000, 99);
  check('Safest mix is the lowest-risk preset', Object.entries(summaries).every(([k, v]) => k === 'Safest mix' || bad(v) >= bad(summaries['Safest mix']) - 0.002), (100 * bad(r)).toFixed(2) + '% bad');
  const u = M.summarize(PRESETS['Under 2% risk'], A0, 20000, 99);
  check('Under 2% risk stays under 2% catastrophe', u.catastrophe < 0.02, (100 * u.catastrophe).toFixed(2) + '%');
}

// --- The model reference uses the live G_ref, not a stale constant ---
{
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  check('Model reference renders G_ref from the code', html.includes('{{GREF}}'));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
