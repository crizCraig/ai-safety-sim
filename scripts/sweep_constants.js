#!/usr/bin/env node
// Sensitivity sweep of the model's named constants (SimModel.K).
//
//   node scripts/sweep_constants.js            run the sweep, write docs/constant-sensitivity.md
//   node scripts/sweep_constants.js --n 1000   fewer futures per run (quick look)
//   node scripts/sweep_constants.js --baseline rewrite test-k-baseline.json (after a deliberate model change)
//
// Each constant is set low and high while every other constant stays at its default:
// scale constants run at ×0.5 and ×1.5; midpoints, thresholds and starting levels on the
// 0–100 scale run at ±10 points, and lever thresholds and share midpoints at ±0.1 (see SHIFT).
// Every run uses common random numbers: future i always draws from its own seed, so the
// same worlds and dice are compared across runs and differences are not sampling noise.
// The bio hazard scale is recalibrated in each run (bioRefExposure is recomputed), as it is
// for the published model, so a bio constant moves pandemic risk only away from the default path.
// Work is split across worker threads; results are gathered by index, so the output is deterministic.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const ROOT = path.resolve(__dirname, '..');
const SEED = 7;
const PRESET_KEYS = ['Status quo', 'Plan A: Verified slowdown', 'Plan B: Fight China', 'Plan C: Burn the lead', 'Plan D: Race to ASI', 'Safest mix'];

function load() {
  require(path.join(ROOT, 'model.js'));
  require(path.join(ROOT, 'presets.js'));
  return { M: globalThis.SimModel, P: globalThis.SimPresets };
}

// Like SimModel.summarize, but future i runs on its own seeded stream (common random numbers).
function summarizeCRN(M, L, n) {
  const A = M.defaultAssumptions();
  let cat = 0, pAlign = 0, nAlign = 0;
  for (let i = 0; i < n; i++) {
    const rng = M.mulberry32((SEED * 1000003 + i * 7919) | 0);
    const s = M.initialState(M.sampleWorld(A, rng)); s.fast = true;
    let ev = null;
    while (!ev) ev = M.step(s, L, rng, true).event;
    if (M.CATASTROPHES.includes(ev)) cat++;
    if (ev === 'bio' || ev === 'war') continue;
    nAlign++;
    pAlign += ev === 'misalign' || ev === 'benevolent' ? 0 : M.maxCap(s) >= 100 ? 1 : M.transitionOdds(s, true, L);
  }
  return { cat: 100 * cat / n, pAlign: nAlign ? 100 * pAlign / nAlign : NaN };
}

function runJob(M, P, over, n) {
  M.setConstants(over);
  const r = {};
  for (const k of PRESET_KEYS) r[k] = summarizeCRN(M, P.PRESETS[k], n);
  M.setConstants();
  return {
    catSQ: r['Status quo'].cat, catA: r['Plan A: Verified slowdown'].cat, catSafe: r['Safest mix'].cat,
    paA: r['Plan A: Verified slowdown'].pAlign, paB: r['Plan B: Fight China'].pAlign,
    paC: r['Plan C: Burn the lead'].pAlign, paD: r['Plan D: Race to ASI'].pAlign,
  };
}

if (!isMainThread) {
  const { M, P } = load();
  parentPort.on('message', (job) => {
    if (job === null) return process.exit(0);
    parentPort.postMessage({ i: job.i, r: runJob(M, P, job.over, job.n) });
  });
  return;
}

// --- Main thread -------------------------------------------------------------------------------

// Constants swept by a shift instead of a scale: [amount, why].
const PTS = [10, '±10 points on the 0–100 scale'];
const SHIFT = {
  align0: PTS, openCap0: PTS, bio0: PTS, coord0: PTS, conc0: PTS, trust0: PTS, internal0: PTS,
  upliftStart: PTS, dealCoord: PTS, dealCap: PTS, cnWarnCap: PTS, cnWarnGap: PTS, locOffset: PTS,
  warStakesMid: PTS, bioOpenMid: PTS, barBase: PTS, lockConcMid: PTS, endTrust: PTS, pauseCoord: PTS,
  rdShareMid: [0.1, '±0.1 on the 0–1 share of AI research done by AI'],
  dealDip: [0.1, '±0.1 on the diplomacy lever'],
};

// Classes: S = source (taken from a cited forecast or measurement), F = fitted to a calibration
// target (per model.js comments, the model page and commit history: timeline, lock-in share, the
// loss-of-control recalibration, and the original Plans A–C p(alignment) fit), B = baseline offset (2027 starting level or drift that sets the status-quo trend),
// J = judgment call.
const CLS = { S: 'source', F: 'fitted', B: 'baseline offset', J: 'judgment' };
const META = {
  align0: ['B', 'Alignment maturity in 2027'],
  cnGap0: ['B', 'China starts this many capability points behind'],
  openCap0: ['B', 'Best open-weights model in 2027'],
  bio0: ['B', 'Biodefense level in 2027'],
  coord0: ['B', 'International coordination in 2027'],
  bci0: ['B', 'Neural-interface adoption in 2027'],
  conc0: ['B', 'Power concentration in 2027'],
  trust0: ['B', 'Public trust in 2027'],
  internal0: ['B', 'Hidden internal AI in 2027 (also the handoff bar\'s reference)'],
  fund0: ['B', 'Public stake in AI returns in 2027'],
  deleg0: ['B', 'Delegation Λ in 2027, where its effects are neutral'],
  diffSafe: ['J', 'Difficulty below which alignment is easy by default (ease 3.3×)'],
  diffRamp: ['J', 'Difficulty range over which loss-of-control exposure ramps to full'],
  delegBite: ['J', 'Share of oversight lost when everything is delegated'],
  delegHaz: ['J', 'Extra loss-of-control hazard when everything is delegated'],
  upliftStart: ['S', 'Capability where AI starts speeding up AI R&D (AI 2040)'],
  upliftAC: ['S', 'R&D speed-up at an Automated Coder (AI 2040: 3×)'],
  upliftTED: ['S', 'R&D speed-up at TED-AI (AI 2040: ~40×)'],
  rdShareMid: ['J', 'Share of AI research done by AI where the loss-of-control gate is half open'],
  rdShareW: ['J', 'Width of the loss-of-control onset gate'],
  computeNorm: ['F', 'Race level giving 1× compute (sets the AI 2040 pace)'],
  computeExp: ['S', 'Speed ∝ compute^0.74 (AI 2040: 10× compute ≈ 5.5× speed)'],
  safetyKnee: ['J', 'Safety share where returns start to diminish'],
  safetyTail: ['J', 'Extra safety effect from the knee to 100%'],
  laborBase: ['J', 'Share of AI labor on safety at 0% safety compute'],
  laborSafety: ['J', 'Extra AI labor share on safety up to the knee'],
  laborPause: ['J', 'Extra AI labor share on safety past the knee'],
  dealCoord: ['J', 'Coordination needed for a verified deal'],
  dealDip: ['J', 'Diplomacy lever needed for a verified deal'],
  dealCap: ['S', 'Deal ceiling: top-human-expert capability (AI 2040)'],
  dealSlack: ['J', 'Extra ceiling once a deal is impaired'],
  dealHaz0: ['S', 'Deal dissolution/impairment rate, years 0–2 (AI 2040)'],
  dealHaz1: ['S', 'Deal dissolution/impairment rate, years 2–5 (AI 2040)'],
  dealHaz2: ['S', 'Deal dissolution/impairment rate after year 5 (AI 2040)'],
  dealCollapseCut: ['J', 'Coordination lost when a deal dissolves'],
  dealImpairCut: ['J', 'Coordination lost when a deal is impaired'],
  usPushSafety: ['J', 'How much US safety spending reads as slowing to China'],
  cnRaceBase: ['J', 'China\'s race intensity against a middling US push'],
  cnRaceResp: ['J', 'How strongly China\'s race tracks the US push'],
  cnRaceCoord: ['J', 'How much coordination calms China\'s race'],
  cnWarnCap: ['J', 'Capability where China sees warning signs'],
  cnWarnW: ['J', 'Width of China\'s capability warning'],
  cnWarnGap: ['J', 'Capability–alignment gap that alarms China'],
  cnWarnGapW: ['J', 'Width of China\'s gap warning'],
  cnSlowRace: ['J', 'US race level below which China reads the US as slowing'],
  cnRecip: ['J', 'China\'s reciprocity factor (doubles if the US slows or a deal holds)'],
  cnSlowMax: ['J', 'Most China ever cuts its race'],
  shareBase: ['J', 'Share of US alignment work China\'s lab can use by default'],
  shareCoord: ['J', 'Extra share from coordination'],
  shareTransp: ['J', 'Extra share from published research'],
  leadW: ['J', 'Width of the "China leads" switch (capability points)'],
  hidBase: ['J', 'Hidden share of the test overstatement, base'],
  hidInternal: ['J', 'Hidden share added by internal AI'],
  hidOversight: ['J', 'Hidden share removed by oversight'],
  hidTransp: ['J', 'Hidden share removed by transparency'],
  hidSafety: ['J', 'Hidden share removed by safety work'],
  locScale: ['F', 'Peak yearly loss-of-control hazard (with Plans A–C)'],
  locOffset: ['J', 'Capability-over-alignment gap where the hazard is half its peak'],
  locWidth: ['J', 'Width of the loss-of-control sigmoid'],
  intBase: ['J', 'Loss-of-control factor with no hidden internal AI'],
  intSlope: ['J', 'Extra loss-of-control factor per hidden internal AI'],
  warBase: ['J', 'Peak yearly war hazard with no coordination'],
  warCloseW: ['J', 'Capability gap at which the race stops counting as close'],
  warCloseFloor: ['J', 'War hazard share that remains when the race is not close'],
  warStakesMid: ['J', 'Capability where strategic stakes are half'],
  warStakesW: ['J', 'Width of the stakes sigmoid'],
  warAggr: ['J', 'Extra war hazard from sabotage'],
  warSabot: ['J', 'War hazard from a China falling behind under attack'],
  warBehindW: ['J', 'US lead at which China is fully behind'],
  warBehindFloor: ['J', 'Share of sabotage war risk even when China is not behind'],
  bioOpenMid: ['J', 'Open-weights capability where bio uplift is half (expert level)'],
  bioOpenW: ['J', 'Width of the bio uplift sigmoid'],
  bioDefExp: ['J', 'Exponent on missing biodefense'],
  barBase: ['F', 'Alignment the handoff needs at difficulty 0'],
  barDiff: ['F', 'Extra alignment the handoff needs per unit difficulty'],
  barInternal: ['J', 'Bar raised per point of hidden internal AI'],
  barDeleg: ['J', 'Bar raised per point of delegation'],
  barBci: ['J', 'Bar lowered by full neural-interface adoption'],
  barW: ['J', 'Width of the handoff sigmoid'],
  lockK: ['F', 'Lock-in scale (about 70% of status-quo controlled futures lock in)'],
  lockWhistle: ['J', 'Lock-in removed by certain whistleblowers'],
  lockConcFloor: ['J', 'Lock-in factor with power not concentrated'],
  lockConcMid: ['J', 'Concentration where its lock-in factor is halfway'],
  lockConcW: ['J', 'Width of the concentration sigmoid'],
  lockPhysYears: ['J', 'Years after an Automated Coder for robots to follow'],
  lockAutoFloor: ['J', 'Lock-in factor before physical automation'],
  lockRaceBase: ['J', 'Lock-in pressure at race 0'],
  lockRaceSlope: ['J', 'Extra lock-in pressure from racing'],
  lockTrustBase: ['J', 'Lock-in pressure with no public trust'],
  lockTrustSlope: ['J', 'Lock-in pressure removed by full trust'],
  lockPluralW: ['J', 'Capability gap at which rivals stop counting'],
  lockFund: ['J', 'Lock-in removed by full public ownership'],
  lockOversight: ['J', 'Lock-in removed by full oversight'],
  lockTransp: ['J', 'Lock-in removed by full transparency'],
  lockPlural: ['J', 'Lock-in removed by a close rival or open frontier'],
  lockOpen: ['J', 'Lock-in removed by open weights'],
  lockDip: ['J', 'Lock-in removed by diplomacy with public pressure'],
  capBase: ['F', 'Base yearly capability gain (AC around 2030)'],
  ovsTax: ['J', 'Capability compute taken by oversight'],
  fundDrag: ['J', 'Reinvestment drag from a full wealth fund'],
  sabotSlow: ['J', 'Share of China\'s progress lost to full sabotage'],
  leak: ['J', 'Share of the US lead China closes yearly through published research'],
  jumpP: ['J', 'Yearly chance of a capability breakthrough'],
  jumpUS: ['J', 'Minimum US breakthrough size'],
  jumpUSRand: ['J', 'Random extra US breakthrough size'],
  jumpCN: ['J', 'Minimum China breakthrough size'],
  jumpCNRand: ['J', 'Random extra China breakthrough size'],
  alRate: ['F', 'Overall alignment progress rate (Plans A–C p(alignment))'],
  alBase: ['J', 'Alignment progress with no safety compute'],
  alSafety: ['J', 'Alignment progress from safety compute up to the knee'],
  alOversight: ['J', 'Alignment progress from oversight'],
  alShCoord: ['J', 'Alignment boost from coordination'],
  alShTransp: ['J', 'Alignment boost from published research'],
  alBci: ['J', 'Alignment boost from neural interfaces'],
  alNoise: ['J', 'Yearly alignment noise'],
  alJumpP: ['J', 'Yearly chance of an alignment breakthrough'],
  alJumpBase: ['J', 'Minimum alignment breakthrough size'],
  alJumpRand: ['J', 'Random extra alignment breakthrough size'],
  intRace: ['J', 'Hidden internal AI added by racing'],
  intTransp: ['J', 'Hidden internal AI removed by transparency'],
  intOversight: ['J', 'Hidden internal AI removed by oversight'],
  intBci: ['J', 'Hidden internal AI removed by neural interfaces'],
  intDecay: ['B', 'Yearly drift of hidden internal AI'],
  delBase: ['J', 'Yearly delegation growth, base'],
  delCap: ['J', 'Delegation growth per capability point above 40'],
  delRd: ['J', 'Delegation growth from AI doing AI research'],
  delRaceBase: ['J', 'Delegation growth at race 0'],
  delOversight: ['J', 'Delegation taken back by oversight'],
  delTransp: ['J', 'Delegation taken back by transparency'],
  delSafety: ['J', 'Delegation taken back by safety work'],
  coDip: ['J', 'Coordination gained from diplomacy'],
  coOversight: ['J', 'Coordination gained from oversight'],
  coTransp: ['J', 'Coordination gained from transparency'],
  coRace: ['J', 'Coordination lost to racing'],
  coAggr: ['J', 'Coordination lost to sabotage'],
  coDecay: ['B', 'Yearly coordination drift'],
  coNoise: ['J', 'Yearly coordination noise'],
  openBase: ['J', 'Open frontier as a share of the closed frontier with closed weights'],
  openLever: ['J', 'Extra open share from the openness lever'],
  openTransp: ['J', 'Extra open share from transparency'],
  openRate: ['J', 'Yearly catch-up rate of open weights'],
  bioDef: ['J', 'Biodefense gained from full investment'],
  bioOpen: ['J', 'Biodefense gained from open tools'],
  bioDecay: ['B', 'Yearly biodefense decay'],
  bciCap: ['J', 'Most neural-interface adoption per year'],
  bciLever: ['J', 'Adoption gained from the neural-interface push'],
  bciBase: ['B', 'Adoption gained at market pace'],
  bciUplift: ['J', 'AI R&D speed-up applied to neurotech'],
  concRace: ['J', 'Concentration added by racing'],
  concRaceOpen: ['J', 'Racing concentration offset by openness'],
  concRaceTransp: ['J', 'Racing concentration offset by transparency'],
  concCap: ['J', 'Concentration per capability point above 60'],
  concOpen: ['J', 'Concentration removed by openness'],
  concTransp: ['J', 'Concentration removed by transparency'],
  concBci: ['J', 'Concentration added by a neural-interface push without diplomacy'],
  concOversight: ['J', 'Concentration removed by oversight'],
  concAggr: ['J', 'Concentration added by sabotage'],
  concDecay: ['B', 'Yearly concentration drift'],
  trCap: ['J', 'Trust lost per capability point above 55'],
  trSafety: ['J', 'Trust gained from safety work'],
  trOversight: ['J', 'Trust gained from oversight'],
  trTransp: ['J', 'Trust gained from transparency'],
  trRaceConc: ['J', 'Trust lost to racing with concentrated power'],
  trDrift: ['B', 'Yearly trust drift'],
  fundBuy: ['J', 'Yearly buy-in rate toward the fund target'],
  fundExpensive: ['J', 'How much harder buying in gets past expert level'],
  fundSell: ['J', 'Yearly rate of selling down to the fund target'],
  endTrust: ['J', 'Trust below which power can lock in by 2040 without ASI'],
  pauseCoord: ['J', 'Coordination needed for the careful-path ending'],
};

const METRICS = [
  ['catSQ', 'Status quo catastrophe'], ['catA', 'Plan A catastrophe'], ['catSafe', 'Safest mix catastrophe'],
  ['paA', 'Plan A p(alignment)'], ['paB', 'Plan B p(alignment)'], ['paC', 'Plan C p(alignment)'], ['paD', 'Plan D p(alignment)'],
];

function variants(K0, k) {
  const v = K0[k];
  if (SHIFT[k]) return [[v - SHIFT[k][0], `−${SHIFT[k][0]}`], [v + SHIFT[k][0], `+${SHIFT[k][0]}`]];
  return [[v * 0.5, '×0.5'], [v * 1.5, '×1.5']];
}

async function runAll(jobs) {
  const nw = Math.max(1, Math.min(jobs.length, os.cpus().length - 1));
  const results = new Array(jobs.length);
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    for (let w = 0; w < nw; w++) {
      const worker = new Worker(__filename);
      const feed = () => { if (next < jobs.length) worker.postMessage({ i: next, ...jobs[next++] }); else worker.postMessage(null); };
      worker.on('message', ({ i, r }) => {
        results[i] = r; done++;
        if (done % 20 === 0 || done === jobs.length) process.stderr.write(`\r${done}/${jobs.length} runs`);
        if (done === jobs.length) { process.stderr.write('\n'); resolve(); }
        feed();
      });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

const fmt = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1);

async function main() {
  const args = process.argv.slice(2);
  const { M, P } = load();
  if (args.includes('--baseline')) {
    // Seeded summaries of every preset with the default constants, checked by test-model.js.
    const out = {};
    for (const [k, L] of Object.entries(P.PRESETS)) {
      const r = M.summarize(L, M.defaultAssumptions(), 1500, 7);
      out[k] = { counts: r.counts, pAlignment: r.pAlignment, acMedian: r.acMedian, asiMedian: r.asiMedian };
    }
    fs.writeFileSync(path.join(ROOT, 'test-k-baseline.json'), JSON.stringify(out, null, 1) + '\n');
    console.log('wrote test-k-baseline.json');
    return;
  }
  const ni = args.indexOf('--n'), n = ni >= 0 ? +args[ni + 1] : 4000;
  const K0 = M.K_DEFAULTS, keys = Object.keys(K0);
  const missing = keys.filter((k) => !META[k]), extra = Object.keys(META).filter((k) => !(k in K0));
  if (missing.length || extra.length) throw new Error(`META out of sync: missing ${missing} extra ${extra}`);

  const jobs = [{ over: {}, n }];
  for (const k of keys) for (const [v] of variants(K0, k)) jobs.push({ over: { [k]: v }, n });
  const res = await runAll(jobs);
  const base = res[0];

  const rows = keys.map((k, j) => {
    const vs = variants(K0, k), lo = res[1 + 2 * j], hi = res[2 + 2 * j];
    const d = (r) => Object.fromEntries(METRICS.map(([m]) => [m, r[m] - base[m]]));
    const dlo = d(lo), dhi = d(hi);
    let max = 0, maxWhere = '';
    for (const [m, label] of METRICS) for (const [dd, tag] of [[dlo, vs[0][1]], [dhi, vs[1][1]]]) {
      if (Math.abs(dd[m]) > max) { max = Math.abs(dd[m]); maxWhere = `${label} at ${tag}`; }
    }
    return { k, v: K0[k], vs, dlo, dhi, max, maxWhere, sq: Math.max(Math.abs(dlo.catSQ), Math.abs(dhi.catSQ)) };
  });
  rows.sort((a, b) => b.max - a.max || (a.k < b.k ? -1 : 1));
  const count = (f, t) => rows.filter((r) => f(r) > t).length;

  const L = [];
  L.push('# Which constants matter: a sensitivity sweep');
  L.push('');
  L.push(`Generated by \`node scripts/sweep_constants.js\` (${n.toLocaleString('en-US')} futures per run, default assumptions, common random numbers). Do not edit by hand.`);
  L.push('');
  L.push(`Every named constant in \`model.js\` (the \`K\` object, ${keys.length} constants) was moved low and high while all others stayed at their defaults. Scale constants (rates, weights, widths) run at ×0.5 and ×1.5. Midpoints, thresholds and starting levels on the 0–100 scale run at ±10 points; the deal's diplomacy threshold and the onset gate's midpoint (a 0–1 share) run at ±0.1. Each run reports the change, in percentage points, of seven headline numbers: catastrophe under Status quo, Plan A and the Safest mix, and p(alignment) under AI 2040's Plans A–D. The bio hazard scale is recalibrated in every run, as in the model itself, so bio constants change pandemic risk only off the default path.`);
  L.push('');
  L.push('Baseline (default constants, this sampling): ' + METRICS.map(([m, label]) => `${label} ${base[m].toFixed(1)}%`).join(', ') + '.');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Largest move of any headline number | Constants | Status quo catastrophe alone |');
  L.push('|---|---|---|');
  for (const t of [1, 3, 10]) L.push(`| more than ${t} point${t > 1 ? 's' : ''} | ${count((r) => r.max, t)} of ${keys.length} | ${count((r) => r.sq, t)} |`);
  L.push('');
  const byCls = {};
  for (const r of rows) { const c = CLS[META[r.k][0]]; (byCls[c] = byCls[c] || []).push(r); }
  L.push('By class: ' + Object.entries(CLS).map(([, c]) => `${c} ${(byCls[c] || []).length}`).join(', ') + '. Classes: **source** = taken from a cited forecast (mostly AI 2040); **fitted** = tuned so the model hits a calibration target (Plans A–C p(alignment), the AI 2040 timeline, the lock-in share); **baseline offset** = a 2027 starting level or a drift term that sets the status-quo trend; **judgment** = an illustrative modelling choice.');
  L.push('');
  L.push('Fitted constants are not free: moving one moves the calibration target it was fitted to (for example the AI 2040 timeline or Plans A–C p(alignment)), so their swings show how much that target matters rather than an independent uncertainty. Each row moves one constant at a time; interactions between constants are not explored.');
  L.push('');
  L.push('## All constants, ranked by largest |Δ|');
  L.push('');
  L.push('Δ columns: change in percentage points at the low / high setting. SQ, A, Safe = catastrophe; pA–pD = p(alignment).');
  L.push('');
  L.push('| # | Constant | Default | Low / high | Max \\|Δ\\| | Where | SQ | A | Safe | pA | pB | pC | pD | Class | Role |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    const pair = (m) => `${fmt(r.dlo[m])} / ${fmt(r.dhi[m])}`;
    L.push(`| ${i + 1} | \`${r.k}\` | ${r.v} | ${r.vs[0][1]} / ${r.vs[1][1]} | ${r.max.toFixed(1)} | ${r.maxWhere} | ${pair('catSQ')} | ${pair('catA')} | ${pair('catSafe')} | ${pair('paA')} | ${pair('paB')} | ${pair('paC')} | ${pair('paD')} | ${CLS[META[r.k][0]]} | ${META[r.k][1]} |`);
  });
  L.push('');
  const outPath = path.join(ROOT, 'docs', 'constant-sensitivity.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, L.join('\n'));
  console.log(`wrote ${path.relative(ROOT, outPath)}`);
  console.log(`>1: ${count((r) => r.max, 1)}  >3: ${count((r) => r.max, 3)}  >10: ${count((r) => r.max, 10)} of ${keys.length}`);
  for (const r of rows.slice(0, 15)) console.log(r.k.padEnd(16), r.max.toFixed(1).padStart(5), CLS[META[r.k][0]].padEnd(16), r.maxWhere);
}

main().catch((e) => { console.error(e); process.exit(1); });
