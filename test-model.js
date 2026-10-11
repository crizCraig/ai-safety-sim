// Model checks: node test-model.js  (exits 1 if any check fails)
// Prints each preset's outcome mix, then asserts calibration targets with tolerances.
require('./model.js');
require('./presets.js');
require('./events.js');
const M = globalThis.SimModel, E = globalThis.SimEvents, { PRESETS } = globalThis.SimPresets;
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

// --- Optimized presets keep their promises (20,000 futures each, same seed) ---
{
  const big = {};
  for (const [k, L] of Object.entries(PRESETS)) big[k] = M.summarize(L, A0, 20000, 99);
  const safest = bad(big['Safest mix']);
  // Ties within sampling noise (0.15 points) are fine: Plan S is also a near-total pause.
  const worse = Object.entries(big).filter(([k, v]) => k !== 'Safest mix' && bad(v) < safest - 0.0015);
  check('Safest mix is the lowest-risk preset (within noise)', !worse.length, `${(100 * safest).toFixed(2)}% bad${worse.length ? '; beaten by ' + worse.map(([k]) => k).join(', ') : ''}`);
  const careful = big['Safest mix'].counts.pause / big['Safest mix'].n;
  check('Safest mix reaches 2040 on the careful path ≥ 95%', careful >= 0.95, (100 * careful).toFixed(1) + '%');
  check('Under 2% risk stays under 2% catastrophe', big['Under 2% risk'].catastrophe < 0.02, (100 * big['Under 2% risk'].catastrophe).toFixed(2) + '%');
}

// --- Biodefense and open weights move pandemic risk on a long path (Plan A) ---
{
  const A = PRESETS['Plan A: Verified slowdown'];
  const bioShare = (o) => { const r = M.summarize({ ...A, ...o }, A0, 20000, 5); return r.counts.bio / r.n; };
  const closed = bioShare({ openness: 0 }), open = bioShare({ openness: 1, biodef: 0.5 }), openDef = bioShare({ openness: 1, biodef: 1 });
  check('Open weights raise pandemic risk on Plan A (×1.5+)', open > 1.5 * closed, `${(100 * closed).toFixed(2)}% → ${(100 * open).toFixed(2)}%`);
  check('Full biodefense cuts it (to < 60%)', openDef < 0.6 * open, `${(100 * open).toFixed(2)}% → ${(100 * openDef).toFixed(2)}%`);
}

// --- Shown (belief) numbers equal the averages over the hidden draws ---
{
  // Pandemic risk: E[1 - exp(-k g)] over the unknown bio risk, checked by sampling.
  const s = M.initialState(); s.openCap = 78;
  const shown = M.risks(s, M.defaultLevers()).bio, g = M.bioShape(s), rng = M.mulberry32(13), n = 200000;
  let sum = 0; for (let i = 0; i < n; i++) sum += 1 - Math.exp(-M.sampleWorld(A0, rng).bioScale * g);
  check('Shown pandemic risk = expected risk over the unknown (±10%)', Math.abs(shown / (sum / n) - 1) < 0.1, `${(100 * shown).toFixed(3)}% vs ${(100 * sum / n).toFixed(3)}%`);
  // Kindness belief accounts for clipping.
  const A = { ...A0, benevolent: { mean: 0, sd: 1 / 3 } };
  let kind = 0; const r2 = M.mulberry32(3); for (let i = 0; i < 50000; i++) if (M.sampleWorld(A, r2).benevolent) kind++;
  const belief = M.sampleWorld(A, M.mulberry32(1)).pBenevolent;
  check('Kindness belief matches sampled share with clipping (±0.01)', near(belief, kind / 50000, 0.01), `${belief.toFixed(3)} vs ${(kind / 50000).toFixed(3)}`);
}

// --- Survival accounting: kind takeovers are not catastrophes ---
{
  const base = M.initialState();
  const mk = (k) => Object.assign(M.initialState(), { capUS: 95, capCN: 90, align: 20, coord: 0,
    world: Object.assign({}, base.world, { pBenevolent: k }) });
  const L = M.defaultLevers();
  for (const k of [0, 1]) {
    const s = mk(k), r = M.risks(s, L);
    const expect = r.bio + (1 - r.bio) * (r.misalign * (1 - k) + (1 - r.misalign) * r.war);
    check(`Annual catastrophe total is sequential (kindness ${k})`, Math.abs(r.total - expect) < 1e-12, r.total.toFixed(4));
  }
  const s = mk(1); s.capUS = 99.9; const L2 = { ...L, race: 1 };
  M.step(s, L2, () => 0.99, false);
  check('A kind failed handoff does not count against survival', s.survival > 0.5, s.survival.toFixed(3));
  // Intermediate kindness: a kind takeover this year must not also face the handoff.
  {
    const u = mk(0.5); u.capUS = 99; const r = M.risks(u, L2);
    M.step(u, L2, () => 0.99, false);
    const q = M.transitionOdds(u, false, L2), k = 0.5;
    const expect = (1 - r.bio) * r.misalign * k + (1 - r.bio) * (1 - r.misalign) * (1 - r.war) * (q + (1 - q) * k);
    check('Survival through a takeover year and handoff is sequential (kindness 0.5)', Math.abs(u.survival - expect) < 1e-9, `${u.survival.toFixed(4)} vs ${expect.toFixed(4)}`);
    const before = u.survival; M.step(u, L2, () => 0.99, false);
    check('Survival stays put after the handoff', Math.abs(u.survival - before) < 1e-12, `${before.toFixed(4)} -> ${u.survival.toFixed(4)}`);
  }
  const t = mk(0); t.capUS = 99.9; const res = M.step(t, L2, () => 0.99, true);
  check('Handoff endings report stage "handoff"', res.stage === 'handoff', String(res.stage));
}

// --- Campaign: deals cap direct bonuses, signing signs, collapse gets a turn ---
{
  const card = (id) => E.CARDS.find((c) => c.id === id);
  const L = { ...M.defaultLevers(), diplomacy: 0.6 };
  const s = Object.assign(M.initialState(), { capUS: 78, capCN: 76, coord: 70 });
  E.applyChoice(s, L, card('automate').choices[0]);
  check('Choices cannot push capability past an active deal cap', s.capUS <= 78, String(s.capUS));
  const s2 = Object.assign(M.initialState(), { coord: 29 }), L3 = M.defaultLevers();
  E.applyChoice(s2, L3, card('deal').choices[0]);
  check('"Sign, with full verification" puts the deal in force', M.dealActive(s2, L3), `coord ${s2.coord}, diplomacy ${L3.diplomacy}`);
  // Play deal-seeking campaigns; when a deal collapses, does the response card come up?
  let collapses = 0, shown = 0;
  for (let g = 0; g < 3000; g++) {
    const rng = M.mulberry32(5000 + g);
    const st = M.initialState(M.sampleWorld(A0, rng)), Lg = { ...M.defaultLevers(), diplomacy: 0.6, race: 0.4 }, used = new Set();
    st.coord = 65; let ev = null, saw = null;
    while (!ev) {
      const c = E.pickCard(st, Lg, used, rng);
      if (c) { used.add(c.id); if (c.id === 'collapse') shown++; E.applyChoice(st, Lg, c.choices[c.id === 'collapse' ? 0 : 2 % c.choices.length]); }
      const before = st.dealCollapsed;
      ev = M.step(st, Lg, rng, true).event;
      if (!before && st.dealCollapsed) { collapses++; saw = true; }
    }
  }
  check('Most collapsed deals get the response card (> 50%)', collapses > 0 && shown / collapses > 0.5, `${shown} of ${collapses}`);
}

// --- China's caution ---
{
  const L = M.defaultLevers();
  const base = M.initialState();
  const w = (o) => Object.assign({}, base.world, o);
  const far = Object.assign(M.initialState(), { world: w({ cnCaution: 1 }) });
  check('China does not slow far from the brink', M.chinaSlowdown(far, L) < 0.01, M.chinaSlowdown(far, L).toFixed(4));
  const brink = (o) => Object.assign(M.initialState(), { capUS: 96, capCN: 95, align: 30, coord: 20, world: w(o) });
  const racing = M.chinaSlowdown(brink({ cnCaution: 0.25 }), L);
  const dealL = { ...L, diplomacy: 0.6 }, dealS = Object.assign(brink({ cnCaution: 0.25 }), { coord: 70 });
  const withDeal = M.chinaSlowdown(dealS, dealL);
  check('A cautious China slows near the brink, about twice as much under a deal', racing > 0.1 && withDeal > 1.8 * racing, `${racing.toFixed(3)} vs ${withDeal.toFixed(3)}`);
  check('China never slows with zero caution', M.chinaSlowdown(brink({ cnCaution: 0 }), L) === 0);
  // China's own alignment work raises its lab's effective alignment when it leads.
  const lead = (own) => M.effAlign(Object.assign(M.initialState(), { capUS: 80, capCN: 95, align: 60, coord: 20, world: w({ cnAlign: own }) }), L);
  check('China\'s own alignment work counts when China leads', lead(0.6) > lead(0) + 5, `${lead(0).toFixed(1)} -> ${lead(0.6).toFixed(1)}`);
  // Shown loss-of-control risk averages over China's own work (belief), not one value.
  const st = Object.assign(M.initialState(), { capUS: 85, capCN: 97, align: 40, coord: 10, internal: 60 });
  const shown = M.risks(st, L).misalign;
  const rng = M.mulberry32(21); let sum = 0; const n = 20000;
  for (let i = 0; i < n; i++) {
    const own = M.sampleWorld(A0, rng).cnAlign;
    sum += M.risks(Object.assign({}, st, { world: w({ cnAlign: own, cnNodes: [[1, own]] }) }), L).misalign;
  }
  check('Shown loss-of-control risk = average over China\'s alignment work (±5%)', Math.abs(shown / (sum / n) - 1) < 0.05, `${(100 * shown).toFixed(3)}% vs ${(100 * sum / n).toFixed(3)}%`);
}

// --- The model reference uses the live G_ref, not a stale constant ---
{
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  const g = M.bioRefExposure();
  check('G_ref is computed and plausible (0.15–0.25)', g > 0.15 && g < 0.25, g.toFixed(3));
  check('Model reference fills G_ref from the code', html.includes('{{GREF}}') && /replace\('\{\{GREF\}\}', M\.bioRefExposure\(\)/.test(html));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
