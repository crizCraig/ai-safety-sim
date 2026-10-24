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

// --- AI 2040 calibration (Eli Lifland's p(alignment) per plan, typical implementation) ---
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
    const q = M.transitionOdds(u, false, L2), k = 0.5, lock = M.lockinBelief(u, L2);
    const expect = (1 - r.bio) * r.misalign * k + (1 - r.bio) * (1 - r.misalign) * (1 - r.war) * (q * (1 - lock) + (1 - q) * k);
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

// --- The equity-pledge card: valid keys, and it comes up in ordinary play ---
{
  const c = E.CARDS.find((x) => x.id === 'pledge');
  const okKeys = c && c.choices.length === 3 && c.choices.every((ch) => Object.keys(ch.lev || {}).every((k) => k in M.LEVER_INFO)
    && Object.keys(ch.st || {}).every((k) => k in M.STAT_INFO || k === 'cnMult'));
  check('Pledge card exists with valid lever and state keys', !!okKeys);
  let games = 0, seen = 0;
  for (let g = 0; g < 2000; g++) {
    const rng = M.mulberry32(9000 + g), st = M.initialState(M.sampleWorld(A0, rng)), Lg = M.defaultLevers(), used = new Set();
    let ev = null;
    while (!ev) {
      const k = E.pickCard(st, Lg, used, rng);
      if (k) { used.add(k.id); E.applyChoice(st, Lg, k.choices[Math.floor(rng() * k.choices.length)]); }
      ev = M.step(st, Lg, rng, true).event;
    }
    games++; if (used.has('pledge')) seen++;
  }
  check('Pledge card comes up in random-play campaigns as often as other mid-game cards (> 5% of games)', seen / games > 0.05, `${(100 * seen / games).toFixed(1)}% of ${games}`);
}

// --- Deal decline (AI 2040 Deal Decline): age-based dissolution plus a one-time impairment ---
{
  // Analytic: each hazard runs 6% / 3.5% / 2% a year by deal age.
  let keep = 1;
  for (let age = 0; age < 10; age++) keep *= 1 - M.dealHazard(age);
  check('Deal dissolution over ten years ≈ 28% (analytic, ±1 pt)', near(1 - keep, 0.28, 0.01), (100 * (1 - keep)).toFixed(1) + '%');
  check('Deal decline (dissolved or weakened) over ten years ≈ 48% (analytic, ±1 pt)', near(1 - keep * keep, 0.48, 0.01), (100 * (1 - keep * keep)).toFixed(1) + '%');
  // Sampled: a deal held in force by full diplomacy, ten years from signing.
  const L = { ...M.defaultLevers(), race: 0.3, diplomacy: 1, oversight: 0.5 }, n = 20000;
  let dissolved = 0, declined = 0, twice = 0;
  const play = (seed) => {
    const rng = M.mulberry32(seed), s = Object.assign(M.initialState(M.sampleWorld(A0, rng)), { coord: 100 });
    let impairs = 0;
    for (let y = 0; y < 10; y++) {
      const before = s.dealImpaired;
      M.step(s, L, rng, false);
      if (!before && s.dealImpaired) impairs++;
    }
    return { s, impairs };
  };
  for (let i = 0; i < n; i++) {
    const { s, impairs } = play(9000 + i);
    if (s.dealCollapsed) dissolved++;
    if (s.dealCollapsed || s.dealImpaired) declined++;
    if (impairs > 1) twice++;
  }
  check('Deal dissolution over ten years ≈ 28% (sampled, ±2 pts)', near(dissolved / n, 0.28, 0.02), (100 * dissolved / n).toFixed(1) + '%');
  check('Deal decline over ten years ≈ 48% (sampled, ±2 pts)', near(declined / n, 0.48, 0.02), (100 * declined / n).toFixed(1) + '%');
  check('A deal is impaired at most once', twice === 0, String(twice));
  const a = play(4242).s, b = play(4242).s;
  check('Same seed gives the same deal history', a.dealImpaired === b.dealImpaired && a.dealCollapsed === b.dealCollapsed && a.capUS === b.capUS && a.coord === b.coord);
  check('Same seed gives the same Plan A results', JSON.stringify(M.summarize(PRESETS['Plan A: Verified slowdown'], A0, 1500, 3).counts) === JSON.stringify(M.summarize(PRESETS['Plan A: Verified slowdown'], A0, 1500, 3).counts));
  const w = Object.assign(M.initialState(), { dealImpaired: 2030 });
  check('An impaired deal raises the ceiling a few points', M.dealCeiling(w) > M.TOP_EXPERT && M.dealCeiling(w) <= M.TOP_EXPERT + 8, String(M.dealCeiling(w)));
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

// --- Shown handoff odds average over China's alignment work, tails included (Codex C6-1) ---
{
  const L = { ...M.defaultLevers(), transparency: 0 };
  for (const mean of [0, 1]) {
    const A = { ...A0, ease: { mean: 0, sd: 0 }, cnAlign: { mean, sd: 0.33 } };
    const st = (world) => Object.assign(M.initialState(world), { capUS: 60, capCN: 99, align: 100, coord: 0, internal: 100 });
    const shown = M.transitionOdds(st(M.sampleWorld(A, M.mulberry32(1))), false, L);
    const rng = M.mulberry32(8); let sum = 0; const n = 200000;
    for (let i = 0; i < n; i++) sum += M.transitionOdds(st(M.sampleWorld(A, rng)), true, L);
    check(`Shown handoff odds = average over China's work at the slider edge (mean ${mean}, ±0.2 pts)`, Math.abs(shown - sum / n) < 0.002, `${(100 * shown).toFixed(2)}% vs ${(100 * sum / n).toFixed(2)}%`);
  }
}

// --- Tests overstate alignment (evaluation awareness) ---
{
  const L = M.defaultLevers();
  const base = M.initialState().world;
  const w = (o) => Object.assign({}, base, o);
  const st = (o) => Object.assign(M.initialState(), { capUS: 92, capCN: 80, align: 60, internal: 60, world: w(o) });
  {
    const a0 = M.effAlign(st({ evalGap: 0 }), L), s2 = st({ evalGap: 0.2 }), a2 = M.effAlign(s2, L);
    check('Overstatement removes exactly its hidden share of alignment', Math.abs(a2 - a0 * (1 - 0.2 * M.hiddenShare(s2, L))) < 1e-9 && a2 < a0, `${a0.toFixed(2)} -> ${a2.toFixed(2)}`);
  }
  const hidden = (Lx, internal) => M.hiddenShare(Object.assign(M.initialState(), { internal }), Lx);
  check('Oversight and transparency expose the gap; secret AI hides it', hidden({ ...L, oversight: 1, transparency: 1 }, 30) < hidden(L, 30) && hidden(L, 90) > hidden(L, 30),
    `${hidden({ ...L, oversight: 1, transparency: 1 }, 30).toFixed(2)} / ${hidden(L, 30).toFixed(2)} / ${hidden(L, 90).toFixed(2)}`);
  const q = (g) => M.transitionOdds(Object.assign(st({ evalGap: g, safe: false, difficulty: 1 }), { capUS: 100, align: 90 }), true, L);
  check('A bigger overstatement lowers real handoff odds', q(0.3) < q(0) - 0.05, `${(100 * q(0)).toFixed(1)}% -> ${(100 * q(0.3)).toFixed(1)}%`);
  // Shown loss-of-control risk averages over the unknown overstatement.
  const s0 = Object.assign(M.initialState(), { capUS: 95, capCN: 85, align: 55, coord: 20, internal: 70 });
  const shown = M.risks(s0, L).misalign;
  const rng = M.mulberry32(31); let sum = 0; const n = 20000;
  for (let i = 0; i < n; i++) {
    const g = M.sampleWorld(A0, rng).evalGap;
    sum += M.risks(Object.assign({}, s0, { world: w({ evalGap: g, egNodes: [[1, g]] }) }), L).misalign;
  }
  check('Shown loss-of-control risk = average over the test overstatement (±5%)', Math.abs(shown / (sum / n) - 1) < 0.05, `${(100 * shown).toFixed(3)}% vs ${(100 * sum / n).toFixed(3)}%`);
}

// --- Overstatement belief at the slider edge, and the careful path uses real alignment (Codex C8) ---
{
  const L = { ...M.defaultLevers(), oversight: 0, transparency: 0, safety: 0 };
  const A = { ...A0, ease: { mean: 0, sd: 0 }, cnAlign: { mean: 0.35, sd: 0 }, evalGap: { mean: 0, sd: 0.2 } };
  const st = (world) => Object.assign(M.initialState(world), { capUS: 99, capCN: 60, align: 80, internal: 50 });
  const shown = M.transitionOdds(st(M.sampleWorld(A, M.mulberry32(1))), false, L);
  const rng = M.mulberry32(9); let sum = 0; const n = 200000;
  for (let i = 0; i < n; i++) sum += M.transitionOdds(st(M.sampleWorld(A, rng)), true, L);
  check('Shown handoff odds = average over the overstatement at the slider edge (±0.2 pts)', Math.abs(shown - sum / n) < 0.002, `${(100 * shown).toFixed(2)}% vs ${(100 * sum / n).toFixed(2)}%`);
  // 2039, deal holding, measured alignment above capability but real alignment far below.
  const Ld = { ...M.defaultLevers(), race: 0, safety: 0, oversight: 0, transparency: 0, diplomacy: 1 };
  const w = Object.assign({}, M.initialState().world, { evalGap: 0.6, safe: false, difficulty: 1, hazard: 0, hazardBelief: 0 });
  const s2 = Object.assign(M.initialState(w), { year: 2039, capUS: 78, capCN: 78, align: 80, coord: 60, internal: 100, trust: 60 });
  const ev = M.step(s2, Ld, () => 0.99, true).event;
  check('A margin that exists only on tests is not the Careful Path', ev !== 'pause', String(ev));
  // China leads; US real alignment covers capability but what reaches China's lab does not.
  const w2 = Object.assign({}, M.initialState().world, { evalGap: 0, cnAlign: 0, safe: false, difficulty: 1, hazard: 0, hazardBelief: 0 });
  const s3 = Object.assign(M.initialState(w2), { year: 2039, capUS: 70, capCN: 78, align: 80, coord: 60, internal: 30, trust: 60 });
  const Lc = { ...Ld, transparency: 0 };
  check('A US-only margin while China leads is not the Careful Path', M.effAlign(s3, Lc) < 78 && M.step(s3, Lc, () => 0.99, true).event !== 'pause', `effective ${M.effAlign(s3, Lc).toFixed(1)}`);
}

// --- Locked-In Power: a few hold AI and its gains even with humans in control; a catastrophe ---
{
  const ctl = (r) => r.counts.flourish + r.counts.lockin;
  const sq = M.summarize(M.defaultLevers(), A0, 20000, 11);
  const share = sq.counts.lockin / ctl(sq);
  check('Status quo: Locked-In Power in about 70% of futures where humans keep control (65-75%)', share > 0.65 && share < 0.75, (100 * share).toFixed(1) + '%');
  const sq7 = M.summarize(M.defaultLevers(), A0, 20000, 7), share7 = sq7.counts.lockin / ctl(sq7);
  check('…and about 70% (±5) at 20,000 futures, seed 7', near(share7, 0.7, 0.05), (100 * share7).toFixed(1) + '%');
  // Strong countermeasures (full fund, oversight and transparency, sure whistleblowers) still
  // bring it to a few percent, even though the powerful rarely share unforced.
  const Lcm = { race: 0.7, safety: 0.25, openness: 0.45, transparency: 1, biodef: 0.2, diplomacy: 0.25, bci: 0.1, oversight: 1, aggression: 0, fund: 1 };
  const cm = M.summarize(Lcm, { ...A0, ease: { mean: 0.7, sd: 0 }, whistle: { mean: 1, sd: 0 } }, 20000, 7);
  check('Strong countermeasures keep lock-in at or under 5% of controlled futures', cm.counts.lockin / ctl(cm) <= 0.05, (100 * cm.counts.lockin / ctl(cm)).toFixed(2) + '%');
  // Sharing scales the pressure: a world where the powerful always share never locks in.
  const atS = Object.assign(M.initialState(), { capUS: 100, trust: 70, acYear: 2033, year: 2034, conc: 50 });
  check('Lock-in odds fall with sharing, to zero when the powerful always share', M.lockinOdds(atS, M.defaultLevers(), 0.25, 0) > M.lockinOdds(atS, M.defaultLevers(), 0.25, 0.5) && M.lockinOdds(atS, M.defaultLevers(), 0.25, 1) === 0);
  check('Locked-In Power counts as a catastrophe', Math.abs(sq.catastrophe - (sq.counts.bio + sq.counts.misalign + sq.counts.war + sq.counts.lockin) / sq.n) < 1e-12);
  const fund = M.summarize({ ...M.defaultLevers(), fund: 1 }, A0, 20000, 11);
  check('A full public wealth fund roughly halves it', fund.counts.lockin / ctl(fund) < 0.6 * share, `${(100 * share).toFixed(0)}% -> ${(100 * fund.counts.lockin / ctl(fund)).toFixed(0)}%`);
  const late = Object.assign(M.initialState(), { capUS: 90 }), early = Object.assign(M.initialState(), { capUS: 50 });
  const Lf = { ...M.defaultLevers(), fund: 1 };
  M.step(late, Lf, () => 0.99, false); M.step(early, Lf, () => 0.99, false);
  check('Buying in is cheaper before AI value explodes', early.fundStake > 2 * late.fundStake, `${early.fundStake.toFixed(0)} vs ${late.fundStake.toFixed(0)}`);
  const at = (trust) => Object.assign(M.initialState(), { capUS: 100, trust, acYear: 2030, year: 2034 });
  const pk = (st, o) => M.lockinOdds(st, { ...M.defaultLevers(), ...o });
  check('Diplomacy helps only with public pressure (trust above 50)', pk(at(70), { diplomacy: 1 }) < pk(at(70), { diplomacy: 0 }) && pk(at(40), { diplomacy: 1 }) === pk(at(40), { diplomacy: 0 }));
  // Survival: a successful handoff that locks in power is not survival.
  const w = Object.assign({}, M.initialState().world, { safe: true, difficulty: 0.1, pBenevolent: 0, hazard: 0, hazardBelief: 0, whistle: 0.25, whistleNodes: [[1, 0.25]], share: 0.5, shareNodes: [[1, 0.5]] });
  const sh = Object.assign(M.initialState(w), { capUS: 99.9, capCN: 70, align: 100, conc: 55, trust: 60, coord: 100, acYear: 2029, year: 2034 });
  const Ls = { ...M.defaultLevers(), openness: 0 }, r0 = M.risks(sh, Ls);
  M.step(sh, Ls, () => 0.99, false);
  const lk = M.lockinOdds(sh, Ls, 0.25), q = M.transitionOdds(sh, false, Ls), want = (1 - r0.bio) * (1 - r0.war) * q * (1 - lk);
  check('A sure handoff that may lock in power counts lock-in against survival', Math.abs(sh.survival - want) < 1e-9 && lk > 0.1, `survival ${sh.survival.toFixed(3)}, lock ${lk.toFixed(3)}`);
}

// --- Shown lock-in odds average the capped probability over whistleblowers and sharing (Codex C11-1) ---
{
  const A = M.defaultAssumptions(), L = M.defaultLevers();
  const st = Object.assign(M.initialState(M.sampleWorld(A, M.mulberry32(2))), { capUS: 100, capCN: 60, conc: 65, trust: 60, acYear: 2028, year: 2036 });
  const shown = M.lockinBelief(st, L);
  const rng = M.mulberry32(17); let sum = 0; const n = 200000;
  for (let i = 0; i < n; i++) { const w = M.sampleWorld(A, rng); sum += M.lockinOdds(st, L, w.whistle, w.share); }
  const mean = (nodes) => nodes.reduce((a, [w, v]) => a + w * v, 0);
  check('Shown lock-in odds = average over whistleblower and sharing odds with the cap binding (±0.2 pts)', Math.abs(shown - sum / n) < 0.002 && M.lockinOdds(st, L, mean(st.world.whistleNodes), mean(st.world.shareNodes)) > shown + 0.005,
    `${(100 * shown).toFixed(2)}% vs ${(100 * sum / n).toFixed(2)}%`);
  // Belief vs truth: the shown odds ignore this world's hidden draws; the dice use them.
  const twin = (share, whistle) => Object.assign({}, st, { world: Object.assign({}, st.world, { share, whistle }) });
  check('Shown lock-in odds do not depend on the hidden draws', M.lockinBelief(twin(0, 0), L) === M.lockinBelief(twin(1, 1), L) && M.lockinOdds(twin(0, 0), L) > M.lockinOdds(twin(0.9, 0), L));
  // Determinism: the sharing draw is appended last, so a seed gives the same world and the
  // earlier draws are unchanged from a world drawn without it.
  const a = M.sampleWorld(A, M.mulberry32(42)), b = M.sampleWorld(A, M.mulberry32(42));
  check('Worlds are deterministic per seed, sharing included', JSON.stringify(a) === JSON.stringify(b) && a.share >= 0 && a.share <= 1);
  const c = M.summarize(L, A, 3000, 7), d = M.summarize(L, A, 3000, 7);
  check('Futures are deterministic per seed', JSON.stringify(c) === JSON.stringify(d));
  let pos = 0; const counting = M.mulberry32(42), probe = () => { pos++; return counting(); };
  M.sampleWorld(A, probe); const used = pos;
  const last = M.mulberry32(42); for (let i = 0; i < used - 2; i++) last();
  const z = Math.sqrt(-2 * Math.log(1 - last())) * Math.cos(2 * Math.PI * last());
  check('The sharing draw is the last draw of a world', Math.abs(a.share - Math.max(0, Math.min(1, A.share.mean + A.share.sd * z))) < 1e-12);
}

// --- China's own AI speeds up alignment in proportion to its own effort ---
{
  const gain = (own) => {
    const w = Object.assign({}, M.initialState().world, { cnAlign: own, difficulty: 1, hazard: 0, hazardBelief: 0 });
    const st = Object.assign(M.initialState(w), { capUS: 44, capCN: 85, align: 40 });
    M.step(st, { ...M.defaultLevers(), safety: 1 }, () => 0.5, false);
    return st.align - 40;
  };
  check('A China far ahead with full own effort speeds alignment up a lot more than one with none', gain(1) > 2 * gain(0), `${gain(0).toFixed(1)} -> ${gain(1).toFixed(1)} points/yr`);
}

// --- The model reference uses the live G_ref, not a stale constant ---
{
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  const g = M.bioRefExposure();
  check('G_ref is computed and plausible (0.15–0.25)', g > 0.15 && g < 0.25, g.toFixed(3));
  check('Model reference fills G_ref from the code', html.includes('{{GREF}}') && /replace\('\{\{GREF\}\}', M\.bioRefExposure\(\)/.test(html));
}

// --- RSI 2027 (lab insiders): Automated Coder in 2028 and ASI in 2029 (reached during the
// year; the Lab labels milestones with the following year), and the default stays at 44 ---
{
  const PR = require('./presets.js') && globalThis.SimPresets;
  const A = M.defaultAssumptions();
  for (const k in PR.UNKNOWN_PRESETS['RSI 2027 (lab insiders)'].set) A[k] = { ...PR.UNKNOWN_PRESETS['RSI 2027 (lab insiders)'].set[k] };
  const r = M.summarize(PR.PRESETS['Status quo'], A, 4000, 7);
  check('RSI 2027: Automated Coder labelled 2029 (reached 2028)', r.acMedian === 2029, r.acMedian);
  check('RSI 2027: superintelligence labelled 2030 (reached 2029)', r.asiMedian === 2030, r.asiMedian);
  check('Current capability defaults to AI 2040\'s 44 / 37', M.initialState().capUS === 44 && M.initialState().capCN === 37);
}

// --- Codex cycle 14 fixes ---
{
  const PR = globalThis.SimPresets;
  // C14-2: share links keep every preset's levers, and half-point campaign values, exactly.
  const back = (v) => +String(M.leverPct(v)) / 100;
  const bad = [];
  for (const [n, L] of Object.entries(PR.PRESETS)) for (const k in M.LEVER_INFO) if (Math.abs(back(L[k]) - L[k]) > 1e-9) bad.push(`${n}.${k}`);
  for (let v = 0; v <= 1.0001; v += 0.005) if (Math.abs(back(v) - v) > 1e-9) bad.push(v.toFixed(3));
  check('Share links round-trip every preset lever and half-point value', !bad.length, bad.slice(0, 4).join(', ') || 'ok');
  const D = PR.PRESETS['Plan D: Race to ASI'];
  const a = M.summarize(D, M.defaultAssumptions(), 2000, 42), b = M.summarize(Object.fromEntries(Object.entries(D).map(([k, v]) => [k, back(v)])), M.defaultAssumptions(), 2000, 42);
  check('Plan D gives identical results after a share round-trip', JSON.stringify(a.counts) === JSON.stringify(b.counts));
  // C14-3: tied reference scores count as about the same, not as harder.
  const xs = [...Array(44).fill(0.05), ...Array(26).fill(0.075), ...Array(130).fill(0.2)];
  const r = M.rankAmong(xs, 0.075, 0.0125);
  check('Ending difficulty: ties counted separately (22% / 13% / 65%)', Math.round(r.below * 100) === 22 && Math.round(r.same * 100) === 13 && Math.round(r.above * 100) === 65, JSON.stringify(r));
  // C14-1: the searched promises name their assumption, and the page flags differing unknowns.
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  check('Safest mix / Under 2% promises say they assume the defaults', /under 2% under the default \(AI 2040\) assumptions/.test(PR.PRESET_INFO['Under 2% risk']) && /Under the default \(AI 2040\) assumptions, about 1%/.test(PR.PRESET_INFO['Safest mix']) && html.includes('Your hidden assumptions differ from the defaults'));
  // C14-4: the reference and README document Current capability.
  const readme = require('fs').readFileSync(__dirname + '/README.md', 'utf8');
  check('Reference documents Current capability and README counts ten assumptions', html.includes('Current capability: the US bloc') && Object.keys(M.ASSUMPTION_INFO).length === 10 && readme.includes('ten uncertain'));
}

// --- Codex cycles 16 and 17 ---
{
  const PR = globalThis.SimPresets;
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  // C17-1: an impairment that drops coordination below 60 suspends the cap, and the campaign
  // says so; one that leaves coordination at 60 or more keeps the cap at 84.
  const L = { ...M.defaultLevers(), race: 0.3, diplomacy: 0.5, oversight: 0.5 };
  const start = (coord) => Object.assign(M.initialState(M.meanWorld()), { capUS: 78, capCN: 78, align: 78, coord });
  let seed = null;
  for (let k = 1; k < 2000 && seed == null; k++) {
    const s = start(60), r = M.step(s, L, M.mulberry32(k), false);
    if (!r.event && s.dealImpaired && !s.dealCollapsed) seed = k;
  }
  const after = (coord) => {
    const rng = M.mulberry32(seed), s = start(coord);
    M.step(s, L, rng, false);
    const text = M.dealImpairedText(s, L), active = M.dealActive(s, L);
    M.step(s, L, rng, false);
    return { text, active, cap: M.maxCap(s), impaired: s.dealImpaired };
  };
  const lo = after(60), hi = after(80);
  check('Impairment below the coordination threshold: deal not enforced, message says the cap is suspended', seed != null && !lo.active && /suspended/.test(lo.text) && !/still holds/.test(lo.text), `seed ${seed}: ${lo.text}`);
  check('…and the next year capability grows past the old cap', lo.cap > 78, String(lo.cap));
  check('Impairment above the threshold: deal still enforced at 84, and the message says so', hi.impaired && hi.active && /still holds, but its cap rises to 84/.test(hi.text), hi.text);
  check('…and the next year capability stays within 84', hi.cap <= 84, String(hi.cap));
  check('The campaign verdict uses the impairment message', html.includes('M.dealImpairedText(s, L)') && !html.includes('It still holds, but its cap rises to 84'));
  // C16-1: exact half-step ties count as about the same (scores are k/400 and j/40).
  const t = M.rankAmong([3 / 40, 4 / 40], 35 / 400, 0.0125);
  check('Half-step ties count as about the same (0.0875 vs 0.075 and 0.1)', t.same === 1 && t.below === 0 && t.above === 0, JSON.stringify(t));
  const u = M.rankAmong([3 / 40, 4 / 40], 34 / 400, 0.0125);
  check('Just past half a step is not about the same', u.same === 0.5 && u.above === 0.5, JSON.stringify(u));
  // C16-2: difficulty percentages always total 100.
  const r1 = M.roundShares([199 / 200, 0, 1 / 200]);
  let sumOK = r1[0] + r1[1] + r1[2] === 100 && Math.min(...r1) >= 0;
  const rng = M.mulberry32(5);
  for (let i = 0; i < 2000; i++) {
    const a = Math.floor(rng() * 201), b = Math.floor(rng() * (201 - a)), r = M.roundShares([a / 200, b / 200, (200 - a - b) / 200]);
    if (r[0] + r[1] + r[2] !== 100 || Math.min(...r) < 0) sumOK = false;
  }
  check('Ending difficulty shares total 100 (199/0/1 and 2,000 random splits)', sumOK, JSON.stringify(r1));
  // C16-3: Plan D's 2.5% safety shows as 2.5%, on the slider and in the export.
  const leverText = new Function('M', html.match(/const leverText = [^\n]*/)[0] + ' return leverText;')(M);
  check('Plan D safety displays as 2.5% (labels, slider, export)', leverText('safety', PR.PRESETS['Plan D: Race to ASI'].safety) === '2.5%' && leverText('safety', 0.35) === '35%'
    && /\$\('sl-' \+ k\)\.value = M\.leverPct\(labL\[k\]\)/.test(html) && /step="0\.5" id="sl-/.test(html) && /\$\{leverText\(k, labL\[k\]\)\}/.test(html));
  // AI Futures (Aug 2026): Automated Coder labelled 2028 (reached 2027) and superintelligence 2029.
  const A = M.defaultAssumptions();
  for (const k in PR.UNKNOWN_PRESETS['AI Futures (Aug 2026)'].set) A[k] = { ...A[k], ...PR.UNKNOWN_PRESETS['AI Futures (Aug 2026)'].set[k] };
  const af = M.summarize(PR.PRESETS['Status quo'], A, 4000, 7);
  check('AI Futures (Aug 2026): Automated Coder labelled 2028', af.acMedian === 2028, af.acMedian);
  check('AI Futures (Aug 2026): superintelligence labelled 2029', af.asiMedian === 2029, af.asiMedian);
  const words = PR.UNKNOWN_PRESETS['AI Futures (Aug 2026)'].html.replace(/<[^>]+>/g, '').split(/\s+/).length;
  check('AI Futures note is at most 60 words', words <= 60, String(words));
  // Eli Lifland's adjusted p(alignment) sits beside the plain one; calibration uses the plain one.
  const adj = ['Plan A: Verified slowdown', 'Plan B: Fight China', 'Plan C: Burn the lead', 'Plan D: Race to ASI'].map((n) => PR.PLAN_INFO[n].align + '/' + PR.PLAN_INFO[n].alignAdj).join(' ');
  check('Plan notes give Eli\'s plain and adjusted p(alignment)', adj === '72%/70% 50%/55% 40%/45% 25%/32%' && html.includes('info.alignAdj'), adj);
}

// --- Progress speed is lognormal: median 1×, central 90% about 0.56–1.78× (ln-sd 0.35) ---
{
  const PR = globalThis.SimPresets, html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  const rng = M.mulberry32(23), n = 40000, v = [];
  for (let i = 0; i < n; i++) v.push(M.sampleWorld(A0, rng, true).speed);
  v.sort((a, b) => a - b);
  const q = (p) => v[Math.floor(p * (n - 1))];
  check('Speed median ≈ 1× (±0.02)', near(q(0.5), 1, 0.02), q(0.5).toFixed(3));
  check('Speed central 90% ≈ 0.56–1.78× (±0.03)', near(q(0.05), 0.562, 0.03) && near(q(0.95), 1.778, 0.03), `${q(0.05).toFixed(2)}–${q(0.95).toFixed(2)}`);
  check('Speed stays within [0.3, 2.5]', v[0] >= 0.3 - 1e-12 && v[n - 1] <= 2.5 + 1e-12, `${v[0].toFixed(2)}–${v[n - 1].toFixed(2)}`);
  check('Mean world runs at 1×', Math.abs(M.meanWorld().speed - 1) < 1e-12);
  const w1 = M.sampleWorld(A0, M.mulberry32(31)), w2 = M.sampleWorld(A0, M.mulberry32(31));
  check('Speed draws are deterministic per seed', JSON.stringify(w1) === JSON.stringify(w2));
  // Share links: speed is written in multiplier units (median:ln-sd), so links from before it was
  // lognormal (N(mean, sd) in ×) keep their center.
  const [m, sd] = M.assumptionFromURL('speed', 1.3, 0.3);
  check('Old link speed=1.3:0.3 loads with median 1.3×', Math.abs(Math.pow(10, m) - 1.3) < 1e-9 && Math.abs(sd * Math.LN10 - 0.3) < 0.005, `${Math.pow(10, m).toFixed(3)}× ln-sd ${(sd * Math.LN10).toFixed(3)}`);
  const rsi = PR.UNKNOWN_PRESETS['RSI 2027 (lab insiders)'];
  check('RSI 2027 keeps a 1.3× median with the default spread', Math.abs(Math.pow(10, rsi.set.speed.mean) - 1.3) < 1e-9 && rsi.set.speed.sd === A0.speed.sd);
  check('RSI 2027 maps its old speed=1.3:0.3 link back to itself', rsi.legacy.speed === '1.3:0.3' && html.includes('u.legacy?.[k] === raw.join(\':\')'));
  const back = M.assumptionFromURL('speed', ...M.assumptionToURL('speed', rsi.set.speed));
  check('RSI 2027 speed round-trips through a share link exactly', back[0] === rsi.set.speed.mean && back[1] === rsi.set.speed.sd, M.assumptionToURL('speed', rsi.set.speed).join(':'));
  const dflt = M.assumptionFromURL('speed', ...M.assumptionToURL('speed', A0.speed));
  check('Default speed round-trips through a share link exactly', dflt[0] === A0.speed.mean && dflt[1] === A0.speed.sd, M.assumptionToURL('speed', A0.speed).join(':'));
  check('Other unknowns keep their own URL units', JSON.stringify(M.assumptionToURL('ease', A0.ease)) === '[0.13,0.4]');
  check('Model reference gives the lognormal speed spread', html.includes('\\log_{10} \\varphi \\sim \\mathcal{N}(0,\\ 0.152)') && html.includes('0.56–1.78×'));
}

// --- C20-1: share links are short (3 decimals) but every slider position round-trips exactly ---
{
  const PR = globalThis.SimPresets, bad = [];
  for (const k of Object.keys(M.ASSUMPTION_INFO)) {
    const info = M.ASSUMPTION_INFO[k], step = info.fmt === 'num' ? 1 : 0.01, maxSd = (info.max - info.min) / 3;
    const means = [], sds = [];
    for (let i = 0; info.min + i * step <= info.max + 1e-9; i++) means.push(info.min + i * step);
    for (let i = 0; i * 0.01 <= maxSd + 1e-9; i++) sds.push(i * 0.01);
    for (const mean of means) for (const sd of [sds[0], sds[7], sds[17], sds[sds.length - 1]].filter((x) => x !== undefined)) {
      const [m, s2] = M.assumptionToURL(k, { mean, sd }), [bm, bs] = M.assumptionFromURL(k, +String(m), +String(s2));
      if (bm !== mean || bs !== sd) { bad.push(`${k} ${mean}:${sd} -> ${bm}:${bs}`); break; }
    }
    const presets = [M.defaultAssumptions()[k], ...Object.values(PR.UNKNOWN_PRESETS).map((u) => u.set[k]).filter(Boolean)];
    for (const c of presets) { const [m, s2] = M.assumptionToURL(k, c), [bm, bs] = M.assumptionFromURL(k, +String(m), +String(s2)); if (bm !== c.mean || bs !== c.sd) bad.push(`${k} preset ${c.mean}:${c.sd}`); }
  }
  check('Every unknown slider position and preset round-trips exactly through a share link', !bad.length, bad.slice(0, 3).join('; ') || 'ok');
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  check('New share links carry v=2, and only links without it are migrated', html.includes("['v=2', ...parts]") && html.includes("if (!q.has('v')) for (const [k, raw]"));
}

// --- Loss-of-control onset follows how much of AI research AI does ---
{
  const g = M.locGate, old = (c) => M.sig((c - 78) / 4);
  const cs = Array.from({ length: 141 }, (_, i) => 30 + i * 0.5);
  check('Onset gate is closed while AI does none of its own research (≤ 50)', g(44) < 0.002 && g(50) < 0.002, `${g(44).toFixed(4)}, ${g(50).toFixed(4)}`);
  check('Onset gate never falls as capability rises', cs.every((c, i) => !i || g(c) >= g(cs[i - 1]) - 1e-12));
  check('Onset gate tracks the R&D speed-up: share 1 - 1/U, half open at 70%', Math.abs(M.rdShare(70) - 2 / 3) < 1e-12 && cs.every((c) => Math.abs(g(c) - M.sig((1 - 1 / M.uplift(c) - 0.7) / 0.1)) < 1e-12));
  check('Onset gate opens earlier than the old top-expert gate at 2–3× speed-up', g(62.6) > 4 * old(62.6) && g(70) > 3 * old(70), `U=2: ${g(62.6).toFixed(3)} vs ${old(62.6).toFixed(3)}; AC: ${g(70).toFixed(3)} vs ${old(70).toFixed(3)}`);
  check('Onset gate is near 1 by top-expert-dominating AI (≥ 0.93 at 90)', g(90) >= 0.93 && g(100) >= 0.93, g(90).toFixed(3));
  // Shown and rolled risk use the same gate: with no hidden uncertainty they agree exactly.
  const L = M.defaultLevers(), st = Object.assign(M.initialState(), { capUS: 72, capCN: 66, align: 30 });
  const w = Object.assign({}, st.world, { hazard: st.world.hazardBelief, cnNodes: null, egNodes: null, cnAlign: 0, evalGap: 0 });
  const r1 = M.risks(Object.assign({}, st, { world: w }), L), r2 = M.risks(Object.assign({}, st, { world: w }), L);
  check('Shown and true loss-of-control risk agree when nothing is hidden, and repeat exactly', r1.misalign > 0 && Math.abs(r1.misalign - r1.misalignTrue) < 1e-12 && r1.misalign === r2.misalign && r1.misalignTrue === r2.misalignTrue, r1.misalign.toExponential(3));
  const A = M.defaultAssumptions();
  for (const k in globalThis.SimPresets.UNKNOWN_PRESETS['RSI 2027 (lab insiders)'].set) A[k] = { ...globalThis.SimPresets.UNKNOWN_PRESETS['RSI 2027 (lab insiders)'].set[k] };
  check('Same seed gives the same RSI 2027 results', JSON.stringify(M.summarize(PRESETS['Status quo'], A, 1500, 3).counts) === JSON.stringify(M.summarize(PRESETS['Status quo'], A, 1500, 3).counts));
}

// --- Delegation Λ: decisions handed to AI with little human checking ---
{
  const fs = require('fs'), html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const L = M.defaultLevers(), SQ = PRESETS['Status quo'], SAFE = PRESETS['Safest mix'];
  const s0 = M.initialState();
  check('Delegation starts at 12 in 2027 and is a campaign state variable', s0.deleg === 12 && M.DELEG0 === 12 && !!M.STAT_INFO.deleg);
  // One expected-value step from a given state and levers (no noise: rng 0.5).
  const after = (st, Lx) => { const s = Object.assign(M.initialState(), st); M.step(s, Lx, () => 0.5, false); return s.deleg; };
  const base = { capUS: 60, capCN: 55, deleg: 20 };
  const want = (() => { const mc = 60, sx = Math.min(1, M.safetyEffect(L.safety));
    return 20 + (2.5 + 0.06 * (mc - 40) + 10 * M.rdShare(mc)) * (0.5 + L.race) * 0.8 - (0.15 * L.oversight + 0.1 * L.transparency + 0.1 * sx) * 20; })();
  check('Delegation update matches its equation', Math.abs(after(base, L) - want) < 1e-9, `${after(base, L).toFixed(3)} vs ${want.toFixed(3)}`);
  check('Delegation grows with capability (automation)', after({ ...base, capUS: 75 }, L) > after(base, L) + 1 && after(base, L) > after({ ...base, capUS: 45, capCN: 40 }, L));
  check('Racing raises delegation; a pause slows it', after(base, { ...L, race: 1 }) > after(base, L) && after(base, L) > after(base, { ...L, race: 0 }));
  check('Oversight, transparency and safety share each lower it', ['oversight', 'transparency', 'safety'].every((k) => after(base, { ...L, [k]: Math.min(1, L[k] + 0.5) }) < after(base, L)));
  check('Delegation stays within 0–100', after({ ...base, deleg: 100, capUS: 99 }, { ...L, race: 1 }) <= 100 && after({ ...base, deleg: 0 }, SAFE) >= 0);
  // Effects, each neutral at the 2027 level.
  const at = (d, extra) => Object.assign(M.initialState(), { capUS: 80, capCN: 74, align: 40, deleg: d }, extra);
  const Lov = { ...L, oversight: 1, transparency: 1 };
  check('Rubber-stamp oversight: delegation weakens oversight\'s grip on the evaluation gap', M.hiddenShare(at(80), Lov) > M.hiddenShare(at(12), Lov) + 0.15, // measured from the 2027 level
    `${M.hiddenShare(at(12), Lov).toFixed(3)} -> ${M.hiddenShare(at(80), Lov).toFixed(3)}`);
  const hNext = (d) => { const s = at(d); M.step(s, Lov, () => 0.5, false); return s.internal; };
  check('…and its pull on hidden internal AI', hNext(80) > hNext(12) + 2, `${hNext(12).toFixed(1)} -> ${hNext(80).toFixed(1)}`);
  const q = (d) => M.transitionOdds(at(d, { capUS: 100, align: 75 }), false, L);
  check('Delegation raises the handoff bar (lower odds)', q(60) < q(12) - 0.02, `${(100 * q(12)).toFixed(1)}% -> ${(100 * q(60)).toFixed(1)}%`);
  const loc = (d) => M.risks(at(d), L).misalign;
  check('Delegation raises the yearly loss-of-control hazard modestly (×1.1–1.5 at 100)', loc(100) / loc(12) > 1.1 && loc(100) / loc(12) < 1.6, (loc(100) / loc(12)).toFixed(3));
  check('Delegation effects are neutral at the 2027 level', M.delegHazard(s0) === 1 && M.oversightBite(s0) === 1);
  // Trajectories: higher on the status quo than on Plan A or the Safest mix.
  const traj = (Lx, seed) => { const rng = M.mulberry32(seed), out = [];
    for (let i = 0; i < 400; i++) { const s = M.initialState(M.sampleWorld(A0, rng)); s.fast = true;
      for (let y = 0; y < 3 && !s.outcome; y++) M.step(s, Lx, rng, true); if (!s.outcome) out.push(s.deleg); }
    out.sort((a, b) => a - b); return out[out.length >> 1]; };
  const dSQ = traj(SQ, 4), dA = traj(PRESETS['Plan A: Verified slowdown'], 4), dS = traj(SAFE, 4);
  check('Delegation by 2030: status quo > Plan A > Safest mix, and status quo above its start', dSQ > dA && dA > dS && dSQ > 18, `${dSQ.toFixed(1)} / ${dA.toFixed(1)} / ${dS.toFixed(1)}`);
  // Determinism: same seed, same delegation path.
  const run = () => { const rng = M.mulberry32(21), s = M.initialState(M.sampleWorld(A0, rng)), d = [];
    for (let y = 0; y < 13 && !s.outcome; y++) { M.step(s, SQ, rng, true); d.push(s.deleg); } return d; };
  check('Delegation paths are deterministic per seed', JSON.stringify(run()) === JSON.stringify(run()));
  // Shown in the campaign and documented.
  const cards = E.CARDS.filter((c) => c.choices.some((ch) => ch.st && 'deleg' in ch.st)).map((c) => c.id);
  check('Campaign shows delegation (World state panel, year changes, chips) and two cards move it',
    /deleg: 'decisions left to AI'/.test(html) && /deleg: 'Delegated to AI'/.test(html) && /'internal', 'deleg'/.test(html)
      && cards.includes('automate') && cards.includes('agents'), cards.join(', '));
  check('Model reference documents Λ: state row, update equation, rubber-stamp oversight, gradual disempowerment',
    html.includes('<span class="mi">\\Lambda</span></td><td>Decisions delegated to AI') && html.includes('\\Delta\\Lambda =') && /rubber-stamp oversight/i.test(html) && /Gradual Disempowerment/.test(html)
      && html.includes('0.15\\,(\\Lambda-12)'));
}

// --- Named constants (K): the defaults reproduce the stored seeded baseline ---
// After a deliberate model change, regenerate it with: node scripts/sweep_constants.js --baseline
{
  const stored = require('./test-k-baseline.json');
  const same = () => Object.entries(PRESETS).every(([k, L]) => {
    const r = M.summarize(L, M.defaultAssumptions(), 1500, 7), b = stored[k];
    return b && JSON.stringify(r.counts) === JSON.stringify(b.counts) && r.pAlignment === b.pAlignment && r.acMedian === b.acMedian && r.asiMedian === b.asiMedian;
  });
  check('K defaults reproduce the stored seeded baseline for every preset', JSON.stringify(M.K) === JSON.stringify(M.K_DEFAULTS) && same());
  M.setConstants({ locScale: 0.5, capBase: 9 });
  const moved = M.summarize(PRESETS['Status quo'], M.defaultAssumptions(), 1500, 7).counts.misalign !== stored['Status quo'].counts.misalign;
  M.setConstants();
  check('Overriding constants changes results, and setConstants() restores the baseline', moved && same());
  let threw = false; try { M.setConstants({ noSuchConstant: 1 }); } catch (e) { threw = true; }
  check('setConstants rejects unknown names', threw);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
