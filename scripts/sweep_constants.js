#!/usr/bin/env node
// Sensitivity sweep of the model's named constants (SimModel.K).
//
//   node scripts/sweep_constants.js            run the sweep, write docs/constant-sensitivity.md (readable,
//                                              grouped by topic) and docs/constant-sensitivity-full.md (every number)
//   node scripts/sweep_constants.js --n 1000   fewer futures per run (quick look)
//   node scripts/sweep_constants.js --baseline rewrite test-k-baseline.json (after a deliberate model change)
//   node scripts/sweep_constants.js --marginals [--n 20000] [--only id,id] [--out file.json]
//                                              the simplification screen (docs/simplification-2.md): each candidate
//                                              cut in CUTS against all 14 presets and every lever's marginal effect
//
// Each constant is set low and high while every other constant stays at its default:
// scale constants run at ×0.5 and ×1.5; midpoints, thresholds and starting levels on the
// 0–100 scale run at ±10 points, and lever thresholds and share midpoints at ±0.1 (see SHIFT).
// Every run uses common random numbers: future i always draws from its own seed, so the
// same worlds and dice are compared across runs. That makes comparisons between settings much
// less noisy, but differences are still sample estimates, so small ones near a cutoff are uncertain.
// The bio hazard scale is recalibrated in each run (bioRefExposure is recomputed), as it is
// for the published model. That holds the default path's reference normalization near its target,
// but a bio constant can still change the realized default-path risk distribution and incidence.
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
    pAlign += M.alignmentScore(ev, s, L);
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

// --marginals: one policy's futures under one set of constant overrides, future by future, so the
// main thread can pair them across variants. cat[i] = 1 if future i ends in catastrophe; al[i] is its
// p(alignment) score, NaN for pandemic and war futures (left out, as in summarize).
function futuresCRN(M, L, n) {
  const A = M.defaultAssumptions(), cat = new Uint8Array(n), al = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const rng = M.mulberry32((SEED * 1000003 + i * 7919) | 0);
    const s = M.initialState(M.sampleWorld(A, rng)); s.fast = true;
    let ev = null;
    while (!ev) ev = M.step(s, L, rng, true).event;
    cat[i] = M.CATASTROPHES.includes(ev) ? 1 : 0;
    al[i] = ev === 'bio' || ev === 'war' ? NaN : M.alignmentScore(ev, s, L);
  }
  return { cat, al };
}
// The --marginals policies: all presets, then each lever at 0 and at 1 from each background.
const BACKGROUNDS = [['SQ', 'Status quo'], ['A', 'Plan A: Verified slowdown']];
function margPolicies(M, P) {
  const out = Object.keys(P.PRESETS).map((k) => ({ id: 'preset:' + k, L: P.PRESETS[k] }));
  for (const [tag, bg] of BACKGROUNDS) for (const lv of Object.keys(M.LEVER_INFO)) for (const x of [0, 1]) {
    out.push({ id: `lever:${tag}:${lv}:${x}`, L: Object.assign({}, P.PRESETS[bg], { [lv]: x }) });
  }
  return out;
}

if (!isMainThread) {
  const { M, P } = load();
  let pol = null, last = null;
  parentPort.on('message', (job) => {
    if (job === null) return process.exit(0);
    if (job.mode === 'marg') {
      pol = pol || margPolicies(M, P);
      const key = JSON.stringify(job.over);
      if (key !== last) { M.setConstants(job.over); last = key; }
      parentPort.postMessage({ i: job.i, r: futuresCRN(M, pol[job.p].L, job.n) });
      return;
    }
    last = null;
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

// Types: S = from a source (a cited forecast or measurement), F = fitted to a calibration target
// (per model.js comments, the model page and commit history: timeline, lock-in share, the
// loss-of-control recalibration, and the original Plans A–C p(alignment) fit), B = 2027 baseline
// (a starting level, or a drift that sets the status-quo trend), J = judgment call.
const CLS = { S: 'source', F: 'fitted', B: 'baseline', J: 'judgment' };
const CLS_PLAIN = { S: 'From a source', F: 'Fitted to a target', B: '2027 baseline', J: 'Judgment call' };

// Topic groups for the readable doc, in reading order: [key, heading, what the group does].
const GROUPS = [
  ['speed', 'How fast AI improves',
    'Each year frontier capability grows by a base pace, scaled by compute (set by the race lever), the world\'s hidden progress speed, and the speed-up AI gives its own research once it is good enough. Most of these come from AI 2040 or are fitted to its timeline (an Automated Coder around 2030). Moving them mostly moves *when* superintelligence arrives: a slower pace leaves more years for alignment research, so the plans that rely on it gain.'],
  ['align', 'Alignment research and the handoff',
    'Alignment grows each year with safety spending, oversight, shared research and help from AI, divided by how hard the problem really is. When capability reaches superintelligence, the handoff succeeds if real alignment clears a bar that rises with that difficulty. These constants set the plans\' odds of getting alignment right (Plans A–C are fitted to AI 2040\'s 72%, 50% and 40%), so they move those odds far more than they move today\'s path, which spends little on safety.'],
  ['loc', 'Loss of control and hidden AI',
    'Before the handoff, a yearly loss-of-control hazard grows once AI does most of its own research and capability outruns real alignment. AI used inside labs, out of view, raises that hazard, raises the handoff bar and hides more of the gap between tested and real alignment. Oversight and transparency pull it back into view.'],
  ['war', 'War',
    'Great-power war is likelier when the race is close, coordination is low and the stakes are high; sabotaging China\'s program adds to it. War is a small share of catastrophe in the swept results, so these constants move them little. Note that Plan B, the plan that sabotages China, is measured here only by its alignment odds, not by its war risk.'],
  ['bio', 'Pandemic and open weights',
    'Pandemic risk depends on how capable open-weights models are and how much biodefense is missing. The hazard scale is recalibrated in every run so the average exposure on the default path maps to its target decade risk. That keeps the default calibration close, but not exact: these constants can still shift the pandemic risk that default-path futures actually face. Pandemics are rare in the model, so none of them moves a headline number much.'],
  ['deal', 'Deals and diplomacy',
    'Diplomacy builds international coordination. Once coordination and diplomacy both pass thresholds, a verified US–China deal stops frontier AI at top-expert level, until it weakens or dissolves at AI 2040\'s yearly rates. Plan A depends on this deal, so the constants that decide whether it forms move Plan A\'s risk a lot.'],
  ['china', 'China',
    'China\'s race intensity responds to how hard the US pushes and to coordination. It may slow near the brink (its hidden caution), and when it leads it can use US alignment work only partly. A hotter Chinese race makes the deal harder and raises risk under Plan A and the Safest mix.'],
  ['power', 'Power and lock-in',
    'If humans keep control at the handoff, power can still lock in with a few. The lock-in odds multiply how concentrated power already is, how much has been delegated to AI, and pressure from racing and low public trust, then subtract what the wealth fund, oversight, transparency, rivals, open weights, diplomacy, whistleblowers and value-aligned AI (the hidden chance that an aligned AI refuses to help a few seize power) take away. On today\'s path about 54% of the futures that keep control lock in (about 70% before value alignment), so these are the constants that move today\'s path the most.'],
  ['deleg', 'Delegation',
    'Decisions handed to AI with little human checking grow with automation and racing; oversight, transparency and safety work take some back. More delegation blunts oversight, raises the loss-of-control hazard, raises the handoff bar and raises the lock-in odds. All four effects are neutral at the 2027 level, so they move the headline numbers only a little.'],
];

// Per constant: [type, group, plain name, what it does].
const META = {
  // How fast AI improves
  capBase: ['F', 'speed', 'Base pace of AI progress', 'Capability points gained per year before compute, speed and uplift; fitted so an Automated Coder arrives around 2030'],
  computeExp: ['S', 'speed', 'Returns to compute', 'Progress speed grows as compute to this power (AI 2040: 10× compute ≈ 5.5× speed)'],
  upliftStart: ['S', 'speed', 'Where AI starts speeding up AI research', 'Capability at which AI begins to speed up its own R&D (AI 2040)'],
  upliftAC: ['S', 'speed', 'Speed-up at an Automated Coder', 'How much faster AI research goes at capability 70 (AI 2040: 3×)'],
  upliftTED: ['S', 'speed', 'Speed-up at top-expert-dominating AI', 'How much faster AI research goes at capability 90 (AI 2040: about 40×)'],
  ovsTax: ['J', 'speed', 'Compute taken by oversight', 'Share of capability compute that full oversight uses up'],
  jumpP: ['J', 'speed', 'Chance of a capability breakthrough', 'Yearly chance of a surprise jump in capability'],
  jumpUS: ['J', 'speed', 'US breakthrough size', 'Smallest US capability jump in a breakthrough year'],
  jumpUSRand: ['J', 'speed', 'US breakthrough spread', 'Random extra size of a US breakthrough'],
  jumpCN: ['J', 'speed', 'China breakthrough size', 'Smallest Chinese capability jump in a breakthrough year'],
  jumpCNRand: ['J', 'speed', 'China breakthrough spread', 'Random extra size of a Chinese breakthrough'],
  // Alignment research and the handoff
  align0: ['B', 'align', 'Alignment in 2027', 'Where alignment maturity starts'],
  alRate: ['F', 'align', 'Overall alignment progress rate', 'Yearly alignment progress with no safety spending or oversight, before AI help, sharing and difficulty; scales all of it; fitted to Plans A–C'],
  alSafety: ['J', 'align', 'Alignment progress from safety spending', 'Extra yearly progress at the safety knee, relative to progress with none (10/1.9)'],
  alOversight: ['J', 'align', 'Alignment progress from oversight', 'Extra yearly progress with full independent oversight, relative to progress with none (1.5/1.9)'],
  alShCoord: ['J', 'align', 'Alignment boost from coordination', 'Multiplier on progress from shared international research'],
  alShTransp: ['J', 'align', 'Alignment boost from published research', 'Multiplier on progress from research transparency'],
  alJumpP: ['J', 'align', 'Chance of an alignment breakthrough', 'Yearly chance of a surprise jump in alignment'],
  alJumpBase: ['J', 'align', 'Alignment breakthrough size', 'Smallest alignment jump in a breakthrough year'],
  alJumpRand: ['J', 'align', 'Alignment breakthrough spread', 'Random extra size of an alignment breakthrough'],
  safetyKnee: ['J', 'align', 'Where safety spending stops paying fully', 'Safety share of compute up to which each extra point buys full progress; past it, returns shrink'],
  safetyTail: ['J', 'align', 'Safety effect past the knee', 'Extra effect from the knee up to 100% safety'],
  laborBase: ['J', 'align', 'AI labor on safety, baseline', 'Share of AI research help that goes to safety with no safety spending'],
  laborSafety: ['J', 'align', 'AI labor on safety from spending', 'Extra share of AI help on safety, up to the knee (no more past it)'],
  diffSafe: ['J', 'align', 'Easy-by-default difficulty', 'Below this difficulty (above 3.3× ease) alignment works out without a general solution'],
  barBase: ['F', 'align', 'Handoff bar at zero difficulty', 'Alignment the handoff needs before difficulty is added; fitted to Plans A–C'],
  barDiff: ['F', 'align', 'Handoff bar per unit difficulty', 'How much more alignment a harder world needs at the handoff; fitted to Plans A–C'],
  barW: ['J', 'align', 'Handoff sharpness', 'Width of the handoff\'s success curve'],
  bci0: ['B', 'align', 'Neural-interface adoption in 2027', 'Where neural-interface adoption starts'],
  bciLever: ['J', 'align', 'Neural-interface push', 'Yearly adoption gained from the neural-interface lever'],
  bciBase: ['B', 'align', 'Neural-interface market pace', 'Yearly adoption gained without the lever'],
  bciCap: ['J', 'align', 'Neural-interface speed limit', 'Most adoption possible in one year (surgery and approval)'],
  bciUplift: ['J', 'align', 'AI help for neurotech', 'How much AI research speed-up carries over to neural interfaces'],
  alBci: ['J', 'align', 'Alignment boost from neural interfaces', 'Multiplier on alignment progress at full adoption'],
  barBci: ['J', 'align', 'Handoff bar lowered by neural interfaces', 'How much full adoption lowers the handoff bar'],
  // Loss of control and hidden AI
  locScale: ['F', 'loc', 'Loss-of-control scale', 'Yearly loss-of-control scale before the onset, hidden-AI (up to ×3.25) and delegation (up to ×1.44) factors (0.25 × 0.4, unchanged); fitted with Plans A–C'],
  locOffset: ['J', 'loc', 'Gap where loss-of-control risk is half', 'How far capability must outrun alignment for half the peak hazard'],
  locWidth: ['J', 'loc', 'Loss-of-control sharpness', 'Width of the hazard curve around that gap'],
  diffRamp: ['J', 'loc', 'Difficulty ramp', 'Difficulty range over which loss-of-control exposure goes from none to full'],
  rdShareMid: ['J', 'loc', 'Onset of loss-of-control risk', 'Share of AI research done by AI where the hazard is half switched on'],
  rdShareW: ['J', 'loc', 'Onset sharpness', 'Width of that switch'],
  internal0: ['B', 'loc', 'Hidden internal AI in 2027', 'Where hidden internal AI starts (also the handoff bar\'s reference)'],
  intSlope: ['J', 'loc', 'Hazard from hidden AI', 'Relative rise in the loss-of-control hazard when hidden AI is at its maximum (1 with none)'],
  barInternal: ['J', 'loc', 'Handoff bar raised by hidden AI', 'Extra alignment the handoff needs per point of hidden AI'],
  intRace: ['J', 'loc', 'Hidden AI from racing', 'Yearly growth of hidden internal AI under an all-out race'],
  intTransp: ['J', 'loc', 'Hidden AI exposed by transparency', 'Yearly reduction with all research public'],
  intOversight: ['J', 'loc', 'Hidden AI exposed by oversight', 'Yearly reduction with full oversight'],
  intBci: ['J', 'loc', 'Hidden AI exposed by neural interfaces', 'Yearly reduction at full adoption'],
  intDecay: ['B', 'loc', 'Hidden AI drift', 'Yearly drift of hidden internal AI'],
  hidBase: ['J', 'loc', 'Hidden share of the test gap', 'Base share of the tested-vs-real alignment gap that stays hidden'],
  hidInternal: ['J', 'loc', 'Test gap hidden by internal AI', 'Extra hidden share from hidden internal AI'],
  hidOversight: ['J', 'loc', 'Test gap exposed by oversight', 'Hidden share removed by full oversight'],
  hidTransp: ['J', 'loc', 'Test gap exposed by transparency', 'Hidden share removed by full transparency'],
  hidSafety: ['J', 'loc', 'Test gap exposed by safety work', 'Hidden share removed by safety spending at the knee'],
  // War
  warBase: ['J', 'war', 'Peak war hazard', 'Largest yearly war risk with no coordination'],
  warCloseW: ['J', 'war', 'What counts as a close race', 'Capability gap at which the race stops counting as close'],
  warCloseFloor: ['J', 'war', 'War risk when not close', 'Share of war risk that remains when one side is far ahead'],
  warStakesMid: ['J', 'war', 'Where the stakes are half', 'Capability at which strategic stakes are half their peak'],
  warStakesW: ['J', 'war', 'Stakes sharpness', 'Width of the stakes curve'],
  warAggr: ['J', 'war', 'War risk from sabotage', 'Multiplier on war risk from full sabotage of China'],
  warSabot: ['J', 'war', 'Strike risk from a China falling behind', 'Extra war risk when sabotage leaves China behind'],
  warBehindW: ['J', 'war', 'What counts as behind', 'US lead at which China counts as fully behind'],
  warBehindFloor: ['J', 'war', 'Strike risk when not behind', 'Share of that risk even when China keeps up'],
  // Pandemic and open weights
  bio0: ['B', 'bio', 'Biodefense in 2027', 'Where biodefense starts'],
  openCap0: ['B', 'bio', 'Best open model in 2027', 'Where open-weights capability starts'],
  bioOpenMid: ['J', 'bio', 'Open model level where bio uplift is half', 'Open-weights capability at about expert level'],
  bioOpenW: ['J', 'bio', 'Bio uplift sharpness', 'Width of the bio uplift curve'],
  bioDefExp: ['J', 'bio', 'Weight on missing biodefense', 'Power on the share of biodefense that is missing'],
  bioDef: ['J', 'bio', 'Biodefense from investment', 'Yearly biodefense gained at full investment'],
  bioOpen: ['J', 'bio', 'Biodefense from open tools', 'Yearly biodefense gained from open weights'],
  bioDecay: ['B', 'bio', 'Biodefense decay', 'Yearly biodefense lost without investment'],
  openBase: ['J', 'bio', 'Open frontier, closed policy', 'Open models\' share of the closed frontier with weights kept closed'],
  openLever: ['J', 'bio', 'Open frontier from the openness lever', 'Extra share when frontier weights are released'],
  openTransp: ['J', 'bio', 'Open frontier from transparency', 'Extra share when all research is public'],
  openRate: ['J', 'bio', 'Open catch-up speed', 'Share of the gap to their target open models close each year'],
  // Deals and diplomacy
  coord0: ['B', 'deal', 'Coordination in 2027', 'Where international coordination starts'],
  coDip: ['J', 'deal', 'Coordination from diplomacy', 'Yearly coordination gained at full diplomacy'],
  coOversight: ['J', 'deal', 'Coordination from oversight', 'Yearly coordination gained at full oversight'],
  coTransp: ['J', 'deal', 'Coordination from transparency', 'Yearly coordination gained with all research public'],
  coRace: ['J', 'deal', 'Coordination lost to racing', 'Yearly coordination lost under an all-out race'],
  coAggr: ['J', 'deal', 'Coordination lost to sabotage', 'Yearly coordination lost under full sabotage'],
  coDecay: ['B', 'deal', 'Coordination drift', 'Yearly coordination lost anyway'],
  coNoise: ['J', 'deal', 'Coordination noise', 'Random yearly wobble in coordination'],
  dealCoord: ['J', 'deal', 'Coordination a deal needs', 'Coordination level needed for a verified US–China deal'],
  dealDip: ['J', 'deal', 'Diplomacy a deal needs', 'Diplomacy lever setting needed for a deal'],
  dealCap: ['S', 'deal', 'Deal ceiling', 'Capability a deal stops at: top-human-expert level (AI 2040)'],
  dealSlack: ['J', 'deal', 'Ceiling rise when a deal weakens', 'Extra capability allowed once a deal is impaired'],
  dealHaz0: ['S', 'deal', 'Deal failure rate, years 0–2', 'Yearly chance a deal dissolves, and separately that it is impaired (AI 2040)'],
  dealHaz1: ['S', 'deal', 'Deal failure rate, years 2–5', 'The same yearly chances in years 2–5 (AI 2040)'],
  dealHaz2: ['S', 'deal', 'Deal failure rate after year 5', 'The same yearly chances after year 5 (AI 2040)'],
  dealCollapseCut: ['J', 'deal', 'Coordination lost when a deal dissolves', 'One-off cut to coordination'],
  dealImpairCut: ['J', 'deal', 'Coordination lost when a deal weakens', 'One-off cut to coordination'],
  pauseCoord: ['J', 'deal', 'Coordination for the careful-path ending', 'Coordination needed in 2040 to count as the careful path'],
  // China
  cnGap0: ['B', 'china', 'China\'s starting gap', 'Capability points China starts behind the US'],
  usPushSafety: ['J', 'china', 'Safety spending read as slowing', 'How much US safety spending China reads as the US easing off'],
  cnRaceBase: ['J', 'china', 'China\'s race intensity', 'How hard China races against a middling US push'],
  cnRaceResp: ['J', 'china', 'China\'s response to the US push', 'How strongly China\'s race tracks the US push'],
  cnRaceCoord: ['J', 'china', 'China calmed by coordination', 'How much coordination cools China\'s race'],
  cnWarnCap: ['J', 'china', 'Where China sees warning signs', 'Capability at which China notices loss-of-control risk'],
  cnWarnW: ['J', 'china', 'Warning sharpness', 'Width of both warnings: capability near the top, and alignment lagging'],
  cnWarnGap: ['J', 'china', 'Alignment gap that alarms China', 'Capability-over-alignment gap China reacts to'],
  cnSlowRace: ['J', 'china', 'What reads as the US slowing', 'US race level below which China sees the US slowing'],
  cnRecip: ['J', 'china', 'China\'s reciprocity', 'How much China\'s slowdown grows if the US slows or a deal holds'],
  cnSlowMax: ['J', 'china', 'Most China slows', 'Cap on how far China ever cuts its race'],
  shareBase: ['J', 'china', 'US alignment work China can use', 'Default share of US alignment work a leading Chinese lab can use'],
  shareCoord: ['J', 'china', 'Extra sharing from coordination', 'Extra share at full coordination'],
  shareTransp: ['J', 'china', 'Extra sharing from published research', 'Extra share with all research public'],
  leadW: ['J', 'china', 'What counts as China leading', 'Width of the "China leads" switch, in capability points'],
  leak: ['J', 'china', 'Catch-up from published research', 'Share of the US lead China closes each year when all research is public'],
  sabotSlow: ['J', 'china', 'China slowed by sabotage', 'Share of China\'s progress lost to full sabotage'],
  // Power and lock-in
  conc0: ['B', 'power', 'Power concentration in 2027', 'Where power concentration starts'],
  trust0: ['B', 'power', 'Public trust in 2027', 'Where public trust starts'],
  lockK: ['F', 'power', 'Lock-in scale', 'Overall scale of the lock-in odds; fitted so about 70% of today\'s controlled futures lock in before value alignment (about 54% with it)'],
  lockWhistle: ['J', 'power', 'Lock-in stopped by whistleblowers', 'Share of lock-in removed when insiders surely speak up'],
  lockValue: ['J', 'power', 'Lock-in stopped by value-aligned AI', 'Share of lock-in pressure removed when an aligned AI surely refuses to help a few seize power (1: a value-aligned AI always counters lock-in)'],
  lockConcFloor: ['J', 'power', 'Lock-in with power spread out', 'Lock-in factor when power is not concentrated'],
  lockConcMid: ['J', 'power', 'Concentration that tips lock-in', 'Concentration where its lock-in factor is halfway up'],
  lockConcW: ['J', 'power', 'Concentration sharpness', 'Width of that curve'],
  lockRaceSlope: ['J', 'power', 'Lock-in pressure from racing', 'Relative rise in pressure under an all-out race (1 at race 0)'],
  lockTrustSlope: ['J', 'power', 'Lock-in pressure removed by trust', 'Share of the pressure removed when public trust is full (0.6/1.3; 1 with no trust)'],
  lockPluralW: ['J', 'power', 'What counts as a close rival', 'Capability gap at which a rival stops counting'],
  lockFund: ['J', 'power', 'Lock-in removed by the wealth fund', 'Share removed when the public owns all AI returns'],
  lockOversight: ['J', 'power', 'Lock-in removed by oversight', 'Share removed by full oversight'],
  lockTransp: ['J', 'power', 'Lock-in removed by transparency', 'Share removed by full transparency'],
  lockPlural: ['J', 'power', 'Lock-in removed by rivals', 'Share removed by a close rival or an open frontier'],
  lockOpen: ['J', 'power', 'Lock-in removed by open weights', 'Share removed when frontier weights are released'],
  lockDip: ['J', 'power', 'Lock-in removed by diplomacy', 'Share removed by full diplomacy, when public trust is high'],
  concRace: ['J', 'power', 'Concentration from racing', 'Yearly concentration added by an all-out race'],
  concRaceOpen: ['J', 'power', 'Racing concentration offset by openness', 'Share of that offset by releasing weights'],
  concRaceTransp: ['J', 'power', 'Racing concentration offset by transparency', 'Share of that offset by public research'],
  concCap: ['J', 'power', 'Concentration from capability', 'Yearly concentration per capability point above 60'],
  concOpen: ['J', 'power', 'Concentration removed by openness', 'Yearly reduction when weights are released'],
  concTransp: ['J', 'power', 'Concentration removed by transparency', 'Yearly reduction with all research public'],
  concOversight: ['J', 'power', 'Concentration removed by oversight', 'Yearly reduction with full oversight'],
  concBci: ['J', 'power', 'Concentration from neural interfaces', 'Yearly concentration added by a neural-interface push without diplomacy'],
  concAggr: ['J', 'power', 'Concentration from sabotage', 'Yearly concentration added by full sabotage'],
  concDecay: ['B', 'power', 'Concentration drift', 'Yearly concentration lost anyway'],
  trCap: ['J', 'power', 'Trust lost to capability', 'Yearly trust lost per capability point above 55'],
  trSafety: ['J', 'power', 'Trust from safety work', 'Yearly trust gained from safety spending at the knee'],
  trOversight: ['J', 'power', 'Trust from oversight', 'Yearly trust gained at full oversight'],
  trTransp: ['J', 'power', 'Trust from transparency', 'Yearly trust gained with all research public'],
  trRaceConc: ['J', 'power', 'Trust lost to racing with concentrated power', 'Yearly trust lost under an all-out race with power concentrated'],
  trDrift: ['B', 'power', 'Trust drift', 'Yearly trust gained anyway'],
  fundRate: ['J', 'power', 'Wealth fund speed', 'Share of the gap to the fund target bought (or sold) each year'],
  fundExpensive: ['J', 'power', 'Buying in gets expensive', 'How much slower buy-in gets once AI passes expert level'],
  endTrust: ['J', 'power', 'Trust below which power locks in by 2040', 'Without superintelligence, power can lock in by 2040 only below this trust'],
  // Delegation
  deleg0: ['B', 'deleg', 'Delegation in 2027', 'Where delegation starts; its effects are neutral here'],
  delegBite: ['J', 'deleg', 'Oversight lost to rubber-stamping', 'Share of oversight\'s bite lost when everything is delegated'],
  delegHaz: ['J', 'deleg', 'Hazard from delegation', 'Extra loss-of-control hazard when everything is delegated'],
  lockDeleg: ['J', 'deleg', 'Lock-in from delegation', 'Relative rise in lock-in pressure when everything is delegated (0 at the 2027 level)'],
  barDeleg: ['J', 'deleg', 'Handoff bar raised by delegation', 'Extra alignment the handoff needs per point of delegation'],
  delBase: ['J', 'deleg', 'Delegation growth, base', 'Yearly growth before automation'],
  delCap: ['J', 'deleg', 'Delegation from capability', 'Yearly growth per capability point above 40'],
  delRd: ['J', 'deleg', 'Delegation from AI doing AI research', 'Yearly growth as AI does more of its own research'],
  delRaceBase: ['J', 'deleg', 'Delegation growth without racing', 'Growth multiplier at race 0 (racing adds to it)'],
  delOversight: ['J', 'deleg', 'Delegation taken back by oversight', 'Yearly share taken back at full oversight'],
  delTransp: ['J', 'deleg', 'Delegation taken back by transparency', 'Yearly share taken back with all research public'],
  delSafety: ['J', 'deleg', 'Delegation taken back by safety work', 'Yearly share taken back by safety spending at the knee'],
};

// Headline numbers: [key, label in the full table, plain label, short label for "which result it moves"].
const METRICS = [
  ['catSQ', 'Status quo catastrophe', 'today\'s-path catastrophe', 'today\'s-path risk'],
  ['catA', 'Plan A catastrophe', 'Plan A catastrophe', 'Plan A risk'],
  ['catSafe', 'Safest mix catastrophe', 'Safest mix catastrophe', 'Safest mix risk'],
  ['paA', 'Plan A p(alignment)', 'Plan A alignment odds', 'A'],
  ['paB', 'Plan B p(alignment)', 'Plan B alignment odds', 'B'],
  ['paC', 'Plan C p(alignment)', 'Plan C alignment odds', 'C'],
  ['paD', 'Plan D p(alignment)', 'Plan D alignment odds', 'D'],
];

const BOUNDED = new Set(['fundExpensive', 'lockValue', 'lockWhistle']); // fractions that must stay within [0, 1]
function variants(K0, k) {
  const v = K0[k];
  if (SHIFT[k]) return [[v - SHIFT[k][0], `−${SHIFT[k][0]}`], [v + SHIFT[k][0], `+${SHIFT[k][0]}`]];
  // Bounded fractions stay within [0, 1], so a perturbation can't reverse the mechanism (e.g. buying into selling).
  if (BOUNDED.has(k)) return [[v * 0.5, '×0.5'], [Math.min(1, v * 1.5), v * 1.5 > 1 ? '→1' : '×1.5']];
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
// A constant's value as written in prose: at most 3 significant figures, no trailing zeros.
const num = (v) => String(+(+v).toPrecision(3)).replace('-', '−');
const pts = (x) => `${fmt(x)} point${Math.abs(+x.toFixed(1)) === 1 ? '' : 's'}`;
// A plain name inside a sentence: lower-case its first letter unless it starts a proper noun or acronym.
const lc = (t) => /^(China|US|AI)\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
const MINOR = 1; // constants whose largest move is under this many points are listed in one line per group

// The headline numbers a row moves by at least MINOR points, in plain words.
function movesWhat(r) {
  const hit = METRICS.filter(([m]) => Math.max(Math.abs(r.dlo[m]), Math.abs(r.dhi[m])) >= MINOR);
  const out = hit.filter(([m]) => m.startsWith('cat')).map((x) => x[3]);
  const plans = hit.filter(([m]) => m.startsWith('pa')).map((x) => x[3]);
  const run = plans.map((x) => x).join('');
  if (plans.length) out.push(plans.length > 2 && 'ABCD'.includes(run) ? `Plans ${plans[0]}–${plans[plans.length - 1]} alignment odds` : `Plan${plans.length > 1 ? 's' : ''} ${plans.join(', ')} alignment odds`);
  return out.join('; ') || '—';
}

// Every row in one ranked table, as in earlier versions of this doc.
function renderFull(rows, base, n, nK) {
  const L = [];
  L.push('# Constant sensitivity: full table');
  L.push('');
  L.push(`Generated by \`node scripts/sweep_constants.js\` (${n.toLocaleString('en-US')} futures per run, default assumptions, common random numbers). Do not edit by hand. The readable version, grouped by topic, is [constant-sensitivity.md](constant-sensitivity.md).`);
  L.push('');
  L.push(`Each of the ${nK} named constants in \`model.js\` (the \`K\` object) was moved low and high while all others stayed at their defaults. Scale constants (rates, weights, widths) run at ×0.5 and ×1.5 (bounded shares stop at 1). Midpoints, thresholds and starting levels on the 0–100 scale run at ±10 points; the deal's diplomacy threshold and the onset gate's midpoint (a 0–1 share) run at ±0.1. The bio hazard scale is recalibrated in every run, as in the model itself.`);
  L.push('');
  L.push('Baseline (default constants, this sampling): ' + METRICS.map(([m, label]) => `${label} ${base[m].toFixed(1)}%`).join(', ') + '.');
  L.push('');
  L.push('Δ columns: change in percentage points at the low / high setting. SQ, A, Safe = catastrophe under Status quo, Plan A and the Safest mix; pA–pD = p(alignment) under Plans A–D. Type: source, fitted (to a calibration target), baseline (a 2027 level or drift) or judgment.');
  L.push('');
  L.push('| # | Constant | Default | Low / high | Max \\|Δ\\| | Where | SQ | A | Safe | pA | pB | pC | pD | Type | Role |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    const pair = (m) => `${fmt(r.dlo[m])} / ${fmt(r.dhi[m])}`;
    L.push(`| ${i + 1} | \`${r.k}\` | ${r.v} | ${r.vs[0][1]} / ${r.vs[1][1]} | ${r.max.toFixed(1)} | ${r.maxWhere} | ${pair('catSQ')} | ${pair('catA')} | ${pair('catSafe')} | ${pair('paA')} | ${pair('paB')} | ${pair('paC')} | ${pair('paD')} | ${CLS[META[r.k][0]]} | ${META[r.k][2]}: ${META[r.k][3]} |`);
  });
  L.push('');
  return L.join('\n');
}

// The readable doc: summary, the biggest ten, then one section per topic.
function renderReadable(rows, base, n, nK) {
  const L = [];
  const count = (f, t) => rows.filter((r) => f(r) > t).length;
  const effect = (r) => `at ${num(r.atValue)}: ${r.maxPlain} ${pts(r.maxDelta)}`;
  const sqTop = rows.slice().sort((a, b) => b.sq - a.sq)[0];
  const planMax = (r) => Math.max(...METRICS.filter(([m]) => m !== 'catSQ').map(([m]) => Math.max(Math.abs(r.dlo[m]), Math.abs(r.dhi[m]))));
  const planTop = rows.slice().sort((a, b) => planMax(b) - planMax(a))[0];

  L.push('# Which numbers matter');
  L.push('');
  L.push(`*Generated by \`node scripts/sweep_constants.js\`; do not edit by hand. Every number is in the [full table](constant-sensitivity-full.md).*`);
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push(`Most of the model's ${nK} constants are judgment calls, so we tested how much each one matters. We moved each constant on its own, with every other constant left alone: rates and weights to half and to one and a half times their value, and midpoints, thresholds and 2027 starting levels down and up by 10 points. For each setting we ran ${n.toLocaleString('en-US')} simulated futures (the same futures every time, which makes comparisons between settings much less noisy, though small differences are still sample estimates) and watched seven headline numbers: the chance of catastrophe on today's path, under Plan A and under the Safest mix, and the odds of getting alignment right under AI 2040's Plans A–D.`);
  L.push('');
  L.push(`**Today's path is robust.** No constant moves today's-path catastrophe (${base.catSQ.toFixed(0)}%) by more than ${Math.ceil(sqTop.sq)} points; the biggest is ${lc(sqTop.name)}. Only ${count((r) => r.sq, 3)} constants move it by more than 3 points${rows.filter((r) => r.sq > 3).every((r) => r.group === 'power') ? ', all of them about how power locks in' : ''}.`);
  L.push('');
  L.push(`**The plan comparisons are more sensitive.** ${count((r) => r.max, 10)} constants move a plan's risk or alignment odds by more than 10 points, up to ${planMax(planTop).toFixed(1)} points (${lc(planTop.name)}). Most are about how fast AI improves, how alignment research pays off, and whether a US–China deal forms. Several of them are fitted to AI 2040's timeline or plan odds, so their swings say how much hitting that target matters rather than adding uncertainty of their own.`);
  L.push('');
  const nBig = rows.filter((r) => r.max >= MINOR).length;
  L.push(`**Most constants barely matter.** ${nBig} of ${nK} move some headline number by ${MINOR} point or more and ${count((r) => r.max, 3)} by more than 3; the other ${nK - nBig} move none by even ${MINOR} point.`);
  L.push('');
  L.push('Baseline, with every constant at its default: ' + METRICS.map(([m, , plain]) => `${plain} ${base[m].toFixed(0)}%`).join(', ') + '.');
  L.push('');
  L.push('Two limits: each constant moves alone, so interactions are not explored, and only these seven numbers are watched (for example Plan B\'s war risk and the lesser presets are not).');
  L.push('');
  L.push('## The ten that matter most');
  L.push('');
  L.push('| Constant | Value | Biggest effect | Topic | Type |');
  L.push('|---|---|---|---|---|');
  const gname = Object.fromEntries(GROUPS.map(([g, h]) => [g, h]));
  for (const r of rows.slice(0, 10)) L.push(`| ${r.name} | ${num(r.v)} | ${effect(r)} | ${gname[r.group]} | ${CLS_PLAIN[r.cls]} |`);
  L.push('');
  L.push('Types: **from a source** = taken from a cited forecast, mostly AI 2040; **fitted to a target** = tuned so the model hits AI 2040\'s timeline, its Plans A–C alignment odds or the lock-in share; **2027 baseline** = a starting level in 2027, or a yearly drift that sets today\'s trend; **judgment call** = a modelling choice.');
  L.push('');
  L.push('## By topic');
  L.push('');
  L.push(`In each table, *biggest effect* is the largest change in any headline number, at the setting that caused it, and *moves* lists every headline number that changes by ${MINOR} point or more. Constants that move nothing by ${MINOR} point are listed in one line under each table.`);
  for (const [g, head, intro] of GROUPS) {
    const gr = rows.filter((r) => r.group === g);
    const big = gr.filter((r) => r.max >= MINOR), small = gr.filter((r) => r.max < MINOR);
    L.push('');
    L.push(`### ${head}`);
    L.push('');
    L.push(intro);
    L.push('');
    if (big.length) {
      L.push('| Constant | What it does | Value | Biggest effect | Moves | Type |');
      L.push('|---|---|---|---|---|---|');
      for (const r of big) L.push(`| ${r.name} | ${r.does} | ${num(r.v)} | ${effect(r)} | ${movesWhat(r)} | ${CLS_PLAIN[r.cls]} |`);
      L.push('');
    }
    if (small.length) {
      const names = small.map((r) => lc(r.name)).join('; ');
      L.push(`${big.length ? `${small.length} other${small.length > 1 ? 's' : ''}` : `All ${small.length}`}, each under ${MINOR} point: ${names}.`);
    }
  }
  L.push('');
  L.push('## How to reproduce');
  L.push('');
  L.push('`node scripts/sweep_constants.js` reruns the sweep and rewrites this file and [the full table](constant-sensitivity-full.md), which lists every constant\'s code name, both settings and all seven changes. `--n 1000` gives a quicker, noisier look.');
  L.push('');
  return L.join('\n');
}

// --- Simplification screen (--marginals) ---------------------------------------------------------
// The sweep above watches seven headline numbers from presets that barely use some levers (the fund,
// oversight and transparency sit low in them), so "moves nothing" there can mean "that lever is off".
// This screen checks each candidate cut against every lever's effect instead: each lever 0 vs 1 from
// Status quo and from Plan A (catastrophe and p(alignment)), all 14 presets' catastrophe, and Plans A–D
// p(alignment). A cut is written as constant overrides that reproduce it exactly (a removed term is
// its constant at 0, a merge sets one constant to another's value), so the code change that follows
// must give the same numbers. Same seeded futures for every variant (common random numbers); the
// paired standard errors say how far a difference is from sampling noise.
// [id, overrides, constants it would remove]
const ZERO = ['laborBase', 'laborSafety', 'usPushSafety', 'cnRaceResp', 'cnRaceCoord', 'shareCoord',
  'shareTransp', 'hidOversight', 'hidTransp', 'hidSafety', 'hidInternal', 'intSlope', 'ovsTax', 'leak', 'sabotSlow',
  'jumpUSRand', 'jumpCNRand', 'alShCoord', 'alShTransp', 'alJumpRand', 'coNoise', 'intDecay', 'intTransp',
  'intOversight', 'intBci', 'delBase', 'delCap', 'delRd', 'delOversight', 'delTransp', 'delSafety', 'coOversight',
  'coTransp', 'coRace', 'coAggr', 'coDecay', 'openTransp', 'bioOpen', 'concCap', 'concOpen', 'concTransp',
  'concOversight', 'concAggr', 'concDecay', 'concRaceOpen', 'concRaceTransp', 'concBci', 'trCap', 'trSafety',
  'trOversight', 'trTransp', 'trRaceConc', 'trDrift', 'fundExpensive', 'lockDip', 'lockOpen', 'lockPlural',
  'lockRaceSlope', 'lockTrustSlope', 'delegBite', 'delegHaz', 'lockDeleg', 'barDeleg', 'barInternal', 'barBci', 'alBci',
  'bciUplift', 'dealSlack', 'dealImpairCut', 'bci0', 'warAggr', 'warSabot'];
const CUTS = [
  ...ZERO.map((k) => [k + '=0', { [k]: 0 }, [k]]),
  ['jumpP=0', { jumpP: 0 }, ['jumpP', 'jumpUS', 'jumpUSRand', 'jumpCN', 'jumpCNRand']],
  ['alJumpP=0', { alJumpP: 0 }, ['alJumpP', 'alJumpBase', 'alJumpRand']],
  ['warCloseFloor=1', { warCloseFloor: 1 }, ['warCloseFloor', 'warCloseW']],
  ['openRate=1', { openRate: 1 }, ['openRate']],
  ['bciCap=inf', { bciCap: 1e9 }, ['bciCap']],
  ['bioDefExp=1', { bioDefExp: 1 }, ['bioDefExp']],
];
// Thresholds: a cut is a candidate only if no preset's catastrophe moves more than PRESET_TOL points and
// no lever marginal or Plan A–D p(alignment) more than MARG_TOL.
const PRESET_TOL = 0.3, MARG_TOL = 1;

// Mean and paired standard error of per-future differences (NaN entries skipped).
function pairStats(f, n) {
  let s = 0, ss = 0, m = 0;
  for (let i = 0; i < n; i++) { const d = f(i); if (Number.isNaN(d)) continue; s += d; ss += d * d; m++; }
  const mean = s / m;
  return { mean, se: Math.sqrt(Math.max(0, ss / m - mean * mean) / m) };
}
const rate = (a) => { let s = 0, m = 0; for (const x of a) if (!Number.isNaN(x)) { s += x; m++; } return m ? s / m : NaN; };

// Compare one variant's futures with the baseline's: every metric's change in points, with paired SEs.
// p(alignment) is a ratio (pandemic and war futures are left out), so its change is the change in the
// ratio and its SE is taken over futures that count in both.
function compareVariant(pols, base, vr, n) {
  const out = { presetCat: {}, presetAl: {}, leverCat: {}, leverAl: {} };
  pols.forEach((p, j) => {
    if (!p.id.startsWith('preset:')) return;
    const k = p.id.slice(7), b = base[j], v = vr[j];
    out.presetCat[k] = pairStats((i) => 100 * (v.cat[i] - b.cat[i]), n);
    out.presetAl[k] = { mean: 100 * (rate(v.al) - rate(b.al)), se: pairStats((i) => 100 * (v.al[i] - b.al[i]), n).se };
  });
  const idx = Object.fromEntries(pols.map((p, j) => [p.id, j]));
  for (const p of pols) {
    const m = p.id.match(/^lever:(\w+):(\w+):1$/);
    if (!m) continue;
    const j0 = idx[`lever:${m[1]}:${m[2]}:0`], j1 = idx[p.id], key = `${m[1]}:${m[2]}`;
    const [b0, b1, v0, v1] = [base[j0], base[j1], vr[j0], vr[j1]];
    out.leverCat[key] = pairStats((i) => 100 * ((v1.cat[i] - v0.cat[i]) - (b1.cat[i] - b0.cat[i])), n);
    out.leverCat[key].base = 100 * (rate(b1.cat) - rate(b0.cat));
    out.leverAl[key] = { mean: 100 * ((rate(v1.al) - rate(v0.al)) - (rate(b1.al) - rate(b0.al))),
      se: pairStats((i) => 100 * ((v1.al[i] - v0.al[i]) - (b1.al[i] - b0.al[i])), n).se,
      base: 100 * (rate(b1.al) - rate(b0.al)) };
  }
  const worst = (o, keys) => keys.reduce((a, k) => (Math.abs(o[k].mean) > Math.abs(a[1]) ? [k, o[k].mean, o[k].se] : a), ['', 0, 0]);
  const plans = Object.keys(out.presetAl).filter((k) => /^Plan [ABCD]:/.test(k));
  out.worst = {
    presetCat: worst(out.presetCat, Object.keys(out.presetCat)), presetAl: worst(out.presetAl, Object.keys(out.presetAl)),
    planAl: worst(out.presetAl, plans), leverCat: worst(out.leverCat, Object.keys(out.leverCat)),
    leverAl: worst(out.leverAl, Object.keys(out.leverAl)),
  };
  const W = out.worst;
  out.pass = Math.abs(W.presetCat[1]) <= PRESET_TOL && Math.abs(W.planAl[1]) <= MARG_TOL
    && Math.abs(W.leverCat[1]) <= MARG_TOL && Math.abs(W.leverAl[1]) <= MARG_TOL;
  return out;
}

async function runMarginals(M, P, args) {
  const ni = args.indexOf('--n'), n = ni >= 0 ? +args[ni + 1] : 20000;
  const oi = args.indexOf('--only'), only = oi >= 0 ? args[oi + 1].split(',') : null;
  const ui = args.indexOf('--out'), outFile = ui >= 0 ? args[ui + 1] : null;
  // --over '{"k":v}' screens an ad-hoc set of overrides (for example a bundle of cuts) as one variant.
  // A cut that changes code rather than constants is checked across two copies of the model:
  // --save FILE stores this model's default futures, and --against FILE (run from the edited copy)
  // compares the edited model, as variant 'edited', with those stored futures.
  const vi = args.indexOf('--over');
  const si = args.indexOf('--save'), saveFile = si >= 0 ? args[si + 1] : null;
  const ai = args.indexOf('--against'), againstFile = ai >= 0 ? args[ai + 1] : null;
  let cuts = CUTS;
  if (vi >= 0) cuts = [['custom', JSON.parse(args[vi + 1]), []]];
  else if (only) cuts = only.map((id) => { const c = CUTS.find((x) => x[0] === id); if (!c) throw new Error('No such cut: ' + id); return c; });
  for (const [, over] of cuts) for (const k in over) if (!(k in M.K_DEFAULTS)) throw new Error('Unknown constant ' + k);
  if (againstFile) cuts = [['edited', {}, []]];
  if (saveFile) cuts = [];
  const pols = margPolicies(M, P), variants = [['baseline', {}, []], ...cuts];
  const v8 = require('v8');
  const stored = againstFile ? v8.deserialize(fs.readFileSync(againstFile)) : null;
  if (stored && (stored.n !== n || stored.ids.join() !== pols.map((p) => p.id).join())) throw new Error('--against: different n or policies');
  const jobs = [];
  variants.forEach(([, over], vIdx) => { if (!(stored && vIdx === 0)) pols.forEach((_, p) => jobs.push({ mode: 'marg', over, n, p, v: vIdx })); });
  // Results stream in; a variant is compared and freed as soon as it and the baseline are complete.
  const got = variants.map(() => new Array(pols.length)), left = variants.map(() => pols.length), report = [];
  if (stored) { got[0] = stored.futures; left[0] = 0; }
  const finish = (vIdx) => {
    const [id, over, removes] = variants[vIdx];
    const c = compareVariant(pols, got[0], got[vIdx], n);
    report.push({ id, over, removes, ...c });
    const W = c.worst, f = (w) => `${w[1] >= 0 ? '+' : ''}${w[1].toFixed(2)}±${w[2].toFixed(2)} ${w[0]}`;
    console.log(`${c.pass ? 'PASS' : 'fail'} ${id.padEnd(22)} preset ${f(W.presetCat)} | planAl ${f(W.planAl)} | leverCat ${f(W.leverCat)} | leverAl ${f(W.leverAl)}`);
    got[vIdx] = null;
  };
  const nw = Math.max(1, Math.min(jobs.length, os.cpus().length - 1));
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    for (let w = 0; w < nw; w++) {
      const worker = new Worker(__filename);
      const feed = () => { if (next < jobs.length) worker.postMessage({ i: next, ...jobs[next++] }); else worker.postMessage(null); };
      worker.on('message', ({ i, r }) => {
        const { v, p } = jobs[i];
        got[v][p] = r; left[v]--; done++;
        if (left[0] === 0) {
          if (v === 0) {
            if (saveFile) fs.writeFileSync(saveFile, v8.serialize({ n, ids: pols.map((q) => q.id), futures: got[0] }));
            for (let u = 1; u < variants.length; u++) if (left[u] === 0) finish(u);
          } else if (left[v] === 0) finish(v);
        }
        if (done === jobs.length) resolve();
        feed();
      });
      worker.on('error', reject);
      feed();
    }
  });
  const base = { presets: {}, levers: {} };
  // Baseline numbers for reference are recomputed from the first comparison's stored bases.
  if (report[0]) for (const k in report[0].leverCat) base.levers[k] = { cat: report[0].leverCat[k].base, al: report[0].leverAl[k].base };
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ n, tolerances: { preset: PRESET_TOL, marginal: MARG_TOL }, base, report }, null, 1) + '\n');
  if (saveFile) return console.log(`wrote ${saveFile}`);
  console.log(`${report.filter((r) => r.pass).length} of ${report.length} pass` + (outFile ? `; wrote ${outFile}` : ''));
}

async function main() {
  const args = process.argv.slice(2);
  const { M, P } = load();
  if (args.includes('--marginals')) return runMarginals(M, P, args);
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
  const badGroup = keys.filter((k) => !GROUPS.some(([g]) => g === META[k][1]));
  if (badGroup.length) throw new Error(`META has unknown groups for ${badGroup}`);

  const jobs = [{ over: {}, n }];
  for (const k of keys) for (const [v] of variants(K0, k)) jobs.push({ over: { [k]: v }, n });
  const res = await runAll(jobs);
  const base = res[0];

  const rows = keys.map((k, j) => {
    const vs = variants(K0, k), lo = res[1 + 2 * j], hi = res[2 + 2 * j];
    const d = (r) => Object.fromEntries(METRICS.map(([m]) => [m, r[m] - base[m]]));
    const dlo = d(lo), dhi = d(hi);
    let max = 0, maxWhere = '', maxPlain = '', maxDelta = 0, atValue = vs[0][0];
    for (const [m, label, plain] of METRICS) for (const [dd, [val, tag]] of [[dlo, vs[0]], [dhi, vs[1]]]) {
      if (Math.abs(dd[m]) > max) { max = Math.abs(dd[m]); maxWhere = `${label} at ${tag}`; maxPlain = plain; maxDelta = dd[m]; atValue = val; }
    }
    const [cls, group, name, does] = META[k];
    return { k, v: K0[k], vs, dlo, dhi, max, maxWhere, maxPlain, maxDelta, atValue, cls, group, name, does,
      sq: Math.max(Math.abs(dlo.catSQ), Math.abs(dhi.catSQ)) };
  });
  rows.sort((a, b) => b.max - a.max || (a.k < b.k ? -1 : 1));

  const dir = path.join(ROOT, 'docs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'constant-sensitivity.md'), renderReadable(rows, base, n, keys.length));
  fs.writeFileSync(path.join(dir, 'constant-sensitivity-full.md'), renderFull(rows, base, n, keys.length));
  console.log('wrote docs/constant-sensitivity.md and docs/constant-sensitivity-full.md');
  const count = (f, t) => rows.filter((r) => f(r) > t).length;
  console.log(`>1: ${count((r) => r.max, 1)}  >3: ${count((r) => r.max, 3)}  >10: ${count((r) => r.max, 10)} of ${keys.length}`);
  for (const r of rows.slice(0, 15)) console.log(r.k.padEnd(16), r.max.toFixed(1).padStart(5), CLS[r.cls].padEnd(10), r.maxWhere);
}

main().catch((e) => { console.error(e); process.exit(1); });
