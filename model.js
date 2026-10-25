/*
 * Game of AGI — world model.
 *
 * A deliberately simple, transparent toy model. Every number here is an
 * illustrative assumption chosen to make trade-offs legible, NOT a forecast.
 * Loaded as a classic script so index.html works from file:// and so the
 * model can be tested headlessly in Node (see test-model.js).
 */
(function (root) {
  'use strict';

  const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
  const sig = (x) => 1 / (1 + Math.exp(-x));


  // Named model constants. The formulas below read them from K, so a sensitivity sweep
  // (scripts/sweep_constants.js) can override them at runtime with setConstants(); the defaults
  // reproduce the published model exactly. docs/constant-sensitivity.md ranks them by effect.
  // Pure bookkeeping (clamps, quadrature) and AI 2040's milestones 70/90/100 stay inline.
  const K_DEFAULTS = Object.freeze({
    // Starting state, 2027
    align0: 16, cnGap0: 7, openCap0: 32, bio0: 14, coord0: 22, bci0: 4, conc0: 45, trust0: 55,
    internal0: 30, fund0: 3, deleg0: 12,
    // Difficulty: aligned by default below diffSafe, full loss-of-control exposure diffRamp above it
    diffSafe: 0.3, diffRamp: 0.5,
    // Delegation's effects: rubber-stamp oversight, yearly hazard multiplier
    delegBite: 0.5, delegHaz: 0.5,
    // AI R&D uplift: starts at upliftStart, upliftAC× at an Automated Coder, upliftTED× at TED-AI
    upliftStart: 50, upliftAC: 3, upliftTED: 40,
    // Loss-of-control onset gate (share of AI research done by AI)
    rdShareMid: 0.7, rdShareW: 0.1,
    // Compute from race intensity (normalization fixed at COMPUTE_NORM: race 0.55 = 1×)
    computeExp: 0.74,
    // Safety share: linear to the knee, then diminishing; AI labor on safety
    safetyKnee: 0.3, safetyTail: 0.6, laborBase: 0.08, laborSafety: 0.35, laborPause: 0.5,
    // US–China deal
    dealCoord: 60, dealDip: 0.5, dealCap: 78, dealSlack: 6,
    dealHaz0: 0.06, dealHaz1: 0.035, dealHaz2: 0.02, dealCollapseCut: 40, dealImpairCut: 20,
    // China's race and its slowdown near the brink
    usPushSafety: 0.5, cnRaceBase: 0.6, cnRaceResp: 0.45, cnRaceCoord: 0.55,
    cnWarnCap: 83, cnWarnW: 4, cnWarnGap: 30, cnSlowRace: 0.7, cnRecip: 0.6, cnSlowMax: 0.9,
    // How much US alignment work China's lab can use
    shareBase: 0.55, shareCoord: 0.45, shareTransp: 0.3, leadW: 3,
    // Hidden share of the test overstatement
    hidBase: 0.6, hidInternal: 0.8, hidOversight: 0.5, hidTransp: 0.3, hidSafety: 0.3,
    // Loss-of-control hazard: locScale (1 + intSlope H/100), i.e. the old 0.25 (0.4 + 0.9 H/100)
    locScale: 0.1, locOffset: 36, locWidth: 6, intSlope: 2.25,
    // Great-power war
    warBase: 0.055, warCloseW: 25, warCloseFloor: 0.3, warStakesMid: 60, warStakesW: 8,
    warAggr: 1.5, warSabot: 0.07, warBehindW: 20, warBehindFloor: 0.4,
    // Bio: open-weights uplift and missing biodefense
    bioOpenMid: 62, bioOpenW: 6, bioDefExp: 2,
    // Superintelligence handoff bar
    barBase: 45, barDiff: 32, barInternal: 0.2, barDeleg: 0.15, barBci: 10, barW: 6,
    // Locked-in power. Pressure (1 + 0.5 r)(1 - (0.6/1.3) T/100) is the old (0.8 + 0.4 r)(1.3 - 0.6 T/100)
    // divided by 0.8 × 1.3 = 1.04, which lockK absorbs (4.0 × 1.04 = 4.16)
    lockK: 4.16, lockWhistle: 0.6, lockValue: 0.8, lockConcFloor: 0.45, lockConcMid: 64, lockConcW: 6, lockPhysYears: 6,
    lockAutoFloor: 0.6, lockRaceSlope: 0.5, lockTrustSlope: 0.6 / 1.3,
    lockPluralW: 15, lockFund: 0.7, lockOversight: 0.45, lockTransp: 0.35, lockPlural: 0.15, lockOpen: 0.1, lockDip: 0.2,
    // Capability growth
    capBase: 7, ovsTax: 0.08, sabotSlow: 0.35, leak: 0.25,
    jumpP: 0.15, jumpUS: 3, jumpUSRand: 5, jumpCN: 2, jumpCNRand: 4,
    // Alignment growth: alRate (1 + alSafety e(s) + alOversight v), i.e. the old 0.55 (1.9 + 10 e(s) + 1.5 v)
    alRate: 1.045, alSafety: 10 / 1.9, alOversight: 1.5 / 1.9, alShCoord: 0.35, alShTransp: 0.4, alBci: 0.5,
    alNoise: 0.5, alJumpP: 0.12, alJumpBase: 3, alJumpRand: 6,
    // Hidden internal AI
    intRace: 4, intTransp: 9, intOversight: 5, intBci: 6, intDecay: 0.5,
    // Delegation
    delBase: 2.5, delCap: 0.06, delRd: 10, delRaceBase: 0.5, delOversight: 0.15, delTransp: 0.1, delSafety: 0.1,
    // Coordination
    coDip: 13, coOversight: 2, coTransp: 3, coRace: 6, coAggr: 10, coDecay: 0.5, coNoise: 1.5,
    // Open weights, biodefense, neural interfaces
    openBase: 0.62, openLever: 0.36, openTransp: 0.06, openRate: 0.45,
    bioDef: 9, bioOpen: 1.2, bioDecay: 1.6,
    bciCap: 20, bciLever: 11, bciBase: 0.6, bciUplift: 0.4,
    // Power concentration
    concRace: 10, concRaceOpen: 0.5, concRaceTransp: 0.5, concCap: 0.06, concOpen: 2.5, concTransp: 4,
    concBci: 2.2, concOversight: 4, concAggr: 3, concDecay: 0.8,
    // Public trust
    trCap: 0.04, trSafety: 2.5, trOversight: 1.5, trTransp: 1.5, trRaceConc: 1.5, trDrift: 0.3,
    // Public wealth fund
    fundBuy: 0.4, fundExpensive: 0.85, fundSell: 0.2,
    // 2040 endings
    endTrust: 45, pauseCoord: 55,
  });
  const K = Object.assign({}, K_DEFAULTS);
  // Override constants by name (the rest return to their defaults); setConstants() restores them all.
  // Clears the caches that depend on them (the bio reference exposure, bio belief nodes).
  function setConstants(over = {}) {
    for (const k in over) if (!(k in K_DEFAULTS)) throw new Error('Unknown model constant: ' + k);
    Object.assign(K, K_DEFAULTS, over);
    CN_LABOR = safetyLabor(0.3);
    BIO_REF = null; BIO_NODE_CACHE.clear();
  }

  const START_YEAR = 2027;
  const END_YEAR = 2040;

  // Policy levers, each 0..1. The player sets these through decisions
  // (campaign) or sliders (Futures Lab). `short` and `up` work as in STAT_INFO (card chips).
  const LEVER_INFO = {
    race:      { label: 'Race intensity',        low: 'Pause',        high: 'All-out sprint',  def: 0.7, short: 'racing', up: 'bad' },
    safety:    { label: 'Safety share of AI compute', low: '0%', high: '100% (a pause)', def: 0.05, pct: true, short: 'safety work', up: 'good' },
    openness:  { label: 'Open-weights releases', low: 'Closed weights', high: 'Release frontier', def: 0.45, short: 'free AI' },
    transparency: { label: 'Research transparency', low: 'Secret labs', high: 'All research public', def: 0.2, short: 'open research', up: 'good' },
    biodef:    { label: 'Biodefense investment', low: 'Minimal',      high: 'Manhattan-scale', def: 0.2, short: 'pandemic prep', up: 'good' },
    diplomacy: { label: 'US–China diplomacy',    low: 'Cold war',     high: 'Joint project',   def: 0.25, short: 'diplomacy', up: 'good' },
    bci:       { label: 'Neural-interface push', low: 'Market pace',  high: 'AI-driven moonshot', def: 0.1, short: 'brain implants' },
    oversight: { label: 'Independent oversight', low: 'Self-audits',  high: 'IAEA for AI',     def: 0.1, short: 'oversight', up: 'good' },
    aggression: { label: 'Sabotage of China\'s AI', low: 'None',     high: 'Cyber + kinetic strikes', def: 0, short: 'sabotage', up: 'bad' },
    fund:      { label: 'Public AI wealth fund', low: 'None',         high: 'Public owns most AI', def: 0.05, short: 'public AI fund', up: 'good' },
  };

  // Hidden facts about the world nobody knows in advance. As in the original
  // Game of AGI, each simulated future samples them from Gaussians (mean ± sd).
  const ASSUMPTION_INFO = {
    // Ease of alignment = 1 / difficulty. Lognormal, set in log10 units: median
    // 10^mean, spread ×10^sd. Calibrated to AI 2040's p(alignment) estimates (0.10 before
    // delegation was added; 0.13 restores Plan B's p(alignment) to where it was).
    ease: { label: 'Ease of alignment', mean: 0.13, sd: 0.4, min: -0.6, max: 0.7, fmt: 'logx',
      help: 'How hard the problem really is: how much real alignment the superintelligence handoff needs. Policy cannot change it. Easy enough (above 3.3×), fixing safety problems as they come up leads to long-term alignment and loss of control cannot happen; at 0.5×, progress comes at half the speed. Compare "Tests overstate alignment", which is about measuring progress, not the problem itself.',
      sample: (A, rng) => { const dd = diffDistOf(A); return Math.min(5, Math.max(0.1, Math.pow(10, dd.mean + dd.sd * gauss(rng)))); },
      atMean: (A) => Math.pow(10, diffDistOf(A).mean), world: (A, d) => Object.assign({ difficulty: d }, difficultyWorld(d, diffDistOf(A))),
      revealOrder: 10, roll: ['How hard alignment is', (r) => `${(Math.pow(10, -0.6 + 1.3 * r)).toFixed(1)}× ease`],
      secret: ['How hard alignment was', (w, c) => { const ease = 1 / w.difficulty; return `${ease >= 1 ? `${ease.toFixed(1)}× easier than` : `${ease.toFixed(1)}× as easy as`} the baseline. ${w.safe
        ? '<span style="color:var(--good)">Easy enough that fixing problems as they came up was all it took</span>'
        : 'Not easy enough for quick fixes to do the job'} (that had a ${c.pct(w.pSafe, 0)} chance).`; }] },
    // Where the frontier stands at the start of 2027. AI 2040's starting point is 44; Gladstone
    // AI's lab insiders expect recursive self-improvement (AI substantially speeding up AI R&D,
    // which begins at 50 here) within 3-12 months of Oct 2026, i.e. during 2027.
    capNow: { label: 'Current capability', mean: 44, sd: 0, min: 30, max: 62, fmt: 'num',
      marks: [[44, 'AI 2040'], [50, 'RSI 2027']],
      help: 'How capable the best AI is at the start of 2027 (US bloc; China starts 7 points behind). AI starts speeding up its own research at 50, and 70 is an Automated Coder. AI 2040 starts at 44; lab insiders quoted by Gladstone AI expect recursive self-improvement during 2027, which is about 50.',
      sample: (A, rng, draw) => (A.capNow.sd > 0 ? draw('capNow') : A.capNow.mean), // only drawn when it has a spread
      atMean: (A) => A.capNow.mean, world: (A, capNow) => ({ capNow }) },
    // Progress speed, lognormal in log10 units like ease: median 10^mean, spread ×10^sd. The median
    // 1× is AI 2040's pace. The ln-sd 0.35 (central 90% about 0.56–1.78×) is an assumption informed
    // by measured trends: Epoch's frontier training compute (~4–6×/yr) and algorithmic efficiency
    // (~3×/yr) give effective-compute growth of roughly 0.72–1.31× the central rate through 2030,
    // and METR's task-horizon doubling ranges from ~7 months (2019–25) to ~4.3 months (recent fit),
    // a ratio of 1.63. Physical limits (HBM, CoWoS packaging, US power) make the slow worlds, though
    // historically such walls have been stalls that get worked around more than ceilings.
    speed: { label: 'AI progress speed', mean: 0, sd: 0.35 / Math.LN10, min: Math.log10(0.3), max: Math.log10(2.5), fmt: 'logx',
      help: 'How fast AI improves for a given amount of compute. The median 1× reaches an Automated Coder around 2030, as in AI 2040; 0.6× pushes that to about 2031 and superintelligence to about 2033. 90% of worlds fall between about 0.56× and 1.78×, a spread informed by measured trends: frontier training compute growing 4–6× a year and algorithms about 3× a year (Epoch AI), and AI task horizons doubling every 4–7 months (METR). Slow worlds are ones where memory chips, chip packaging or US power hold AI back.',
      sample: (A, rng, draw) => Math.pow(10, draw('speed')), atMean: (A) => Math.pow(10, A.speed.mean), world: (A, speed) => ({ speed }),
      revealOrder: 20, roll: ['How fast AI progresses', (r) => `${(0.5 + r).toFixed(1)}× speed`],
      secret: ['How fast AI progressed', (w) => `${w.speed.toFixed(1)}× the expected pace for the compute spent.`] },
    benevolent: { label: 'Kind even if uncontrolled', mean: 0.1, sd: 0.25, min: 0, max: 1, fmt: 'pct',
      help: 'If humans lose control of AI, the chance it still cares for humanity. The future is then steered by AI, kindly, instead of by people (Benevolent Takeover).',
      sample: (A, rng, draw) => { const p = draw('benevolent'); return rng() < p; }, atMean: () => false,
      world: (A, benevolent) => ({ pBenevolent: clippedMean(A.benevolent), benevolent }),
      revealOrder: 80, roll: ['Whether an AI that escaped control would be kind', (r) => (r < 0.5 ? 'yes' : 'no')],
      secret: ['If AI had escaped control', (w) => (w.benevolent ? '<span style="color:#ff9ecf">It would have cared for humanity.</span>' : 'It would not have cared for humanity.')] },
    // China's own work and caution are judgments informed by published work (Concordia AI's
    // safety-paper counts, SemiAnalysis's count of releases with safety results), official
    // "human control" language and current racing; none of these measures effort, and there is
    // no case of Beijing slowing frontier AI for safety. Hence the wide spreads.
    cnAlign: { label: 'China\'s own alignment work', mean: 0.35, sd: 0.25, min: 0, max: 1, fmt: 'pct',
      help: 'How much alignment research China\'s labs do themselves, relative to the US bloc. It fills part of the gap that published US research and coordination do not reach, and China\'s AI speeds this research up as it improves (100% is a serious program, like a US bloc putting 30% of compute on safety). Work on keeping AI loyal to the Party\'s line does not count.',
      world: (A, cnAlign) => Object.assign({ cnAlign }, chinaNodes(A.cnAlign)),
      revealOrder: 40, roll: ['How much alignment work China does itself', (r) => `${Math.round(r * 100)}%`],
      // One secret row for both of China's unknowns.
      secret: ['China', (w, c) => `Did <b>${c.pct(w.cnAlign, 0)}</b> as much alignment work as the US bloc, and ${w.cnCaution < 0.005 ? 'would not have slowed down' : `would have slowed <b>${c.pct(w.cnCaution, 0)}</b>`} near the brink.`] },
    cnCaution: { label: 'China slows near the brink', mean: 0.25, sd: 0.25, min: 0, max: 1, fmt: 'pct',
      help: 'How far China cuts its AI race once there are signs of losing control. It notices later than the US would, slows more if the US slows or a deal is in force, and never slows for fear of concentrated power: an AI that obeys the Party counts as aligned in Beijing.',
      world: (A, cnCaution) => ({ cnCaution }),
      revealOrder: 45, roll: ['Whether China slows down near the brink', (r) => `${Math.round(r * 70)}%`] },
    // Evaluation awareness: current AIs can often tell when they are being tested and behave
    // better then, so measured alignment may overstate the real thing.
    evalGap: { label: 'Tests overstate alignment', mean: 0.15, sd: 0.1, min: 0, max: 0.6, fmt: 'pct',
      help: 'How wrong the measurements are: how far the alignment you see sits above the real level, because AIs can tell when they are being tested and behave better. Policy can change it: independent oversight, published research and safety work expose more of the gap, and secret internal AI hides more. This is why your estimate and the real risk can differ. Compare "Ease of alignment", which is how hard the problem itself is.',
      world: (A, evalGap) => { const c = clippedNodes(A.evalGap, 0, 0.6); return { evalGap, egNodes: c.nodes, egMean: c.mean }; },
      revealOrder: 30, roll: ['How much safety tests overstate alignment', (r) => `${Math.round(r * 40)}%`],
      secret: ['How misleading the tests were', (w, c) => `${c.over ? 'By the end, real alignment was' : 'Right now, real alignment is'} <b>${c.pct(hiddenShare(c.s, c.L) * w.evalGap, 0)}</b> lower than the tests showed.`] },
    whistle: { label: 'Whistleblower odds', mean: 0.25, sd: 0.15, min: 0, max: 1, fmt: 'pct',
      help: 'Chance that insiders expose or refuse to carry out a power grab by whoever controls AGI.',
      world: (A, whistle) => ({ whistle, whistleNodes: clippedNodes(A.whistle, 0, 1).nodes }),
      revealOrder: 50, roll: ['Whether insiders would expose a power grab', (r) => `${Math.round(r * 60)}%`],
      secret: ['Insiders', (w, c) => `A <b>${c.pct(w.whistle, 0)}</b> chance they would expose a power grab.`] },
    // Whether those who hold AI share its gains when nothing forces them. Arguments that they
    // will not: once most people's work is no longer needed, they lose their leverage (Drago and
    // Laine, The Intelligence Curse; Kulveit et al., Gradual Disempowerment), as in rentier
    // states; voluntary pledges exist but nothing enforces them.
    share: { label: 'The powerful share the gains', mean: 0.30, sd: 0.20, min: 0, max: 1, fmt: 'pct',
      help: 'If a few control AI and nothing forces them, the chance they share its gains broadly anyway. Low means the powerful keep AI and its gains once most people\'s work is no longer needed. The wealth fund, oversight, transparency and whistleblowers can still force sharing.',
      world: (A, share) => ({ share, shareNodes: clippedNodes(A.share, 0, 1).nodes }),
      revealOrder: 60, roll: ['Whether the powerful would share AI\'s gains', (r) => `${Math.round(r * 70)}%`],
      secret: ['The powerful', (w, c) => `A <b>${c.pct(w.share, 0)}</b> chance they would share AI's gains if nothing forced them.`] },
    // Value alignment, as opposed to intent alignment ("aligned" elsewhere means the AI does what
    // its controllers intend). Labs aim for it, e.g. constitutions telling models to refuse
    // illegitimate power grabs, but nothing shows it holds when the weights' owners push.
    valueAlign: { label: 'Aligned AI fights corruption', mean: 0.25, sd: 0.20, min: 0, max: 1, fmt: 'pct',
      help: 'Value alignment: the chance an aligned superintelligence cares about humanity broadly and would decline to help a few seize power, even when its controllers ask. Labs aim for this (e.g. constitutions that tell models to refuse illegitimate power grabs), but it\'s unproven under pressure from whoever controls the weights. At the default it cuts status-quo lock-in from about 70% to about 57% of futures where humans keep control.',
      world: (A, valueAlign) => ({ valueAlign, valueNodes: clippedNodes(A.valueAlign, 0, 1).nodes }),
      revealOrder: 70, roll: ['Whether aligned AI fights corruption', (r) => `${Math.round(r * 70)}%`],
      secret: ['Aligned AI fights corruption', (w, c) => `A <b>${c.pct(w.valueAlign, 0)}</b> chance an aligned AI would refuse to help a few seize power, even if its controllers asked.`] },
    // Lognormal, set in log10 units. Calibrated to a separate factored Monte Carlo
    // decomposition: decade median 1.2e-4, 95% interval ~5e-7 to ~3e-2,
    // P(>1%) ≈ 5.5%, P(>10%) ≈ 0.7%. That is median 10^-3.92 with a log10 sd of about 1.2.
    bioDecade: { label: 'Open-weights bio risk per decade', mean: -3.92, sd: 1.2, min: -7, max: -1, fmt: 'log',
      help: 'Chance that open-weights models enable a pandemic killing 100M+ people within ten years, on the default path for open models and biodefense under the default assumptions. Policy scales it up or down from there.',
      sample: (A, rng) => Math.min(0.99, Math.pow(10, A.bioDecade.mean + A.bioDecade.sd * gauss(rng))), // unclamped in log space: the tails are the point
      atMean: (A) => Math.pow(10, A.bioDecade.mean), world: (A, d) => bioWorld(d, A.bioDecade), notInBase: true,
      revealOrder: 90, roll: ['Pandemic risk from open models', (r) => `${(Math.pow(10, -6 + 4 * r) * 100).toPrecision(2)}%`],
      secret: ['Pandemic risk from open models', (w, c) => `<b>${c.pct(w.bioDecade, 2)}</b> per decade.`] },
  };

  function defaultAssumptions() {
    const A = {};
    for (const k in ASSUMPTION_INFO) A[k] = { mean: ASSUMPTION_INFO[k].mean, sd: ASSUMPTION_INFO[k].sd };
    return A;
  }

  // Share links give progress speed in multiplier units, `speed=median:spread`, where the spread
  // is the ln-sd (≈ the relative ±). Links from before speed was lognormal used N(mean, sd) in
  // the same units, so they load with the same center and, at 1×, the same spread.
  const urlCodec = {
    speed: {
      encode: (a) => [+Math.pow(10, a.mean).toFixed(3), +(a.sd * Math.LN10).toFixed(3)],
      decode: (m, sd) => [m > 0 ? Math.log10(m) : NaN, sd / Math.LN10],
    },
  };
  // [mean, sd] as written in a share link, and back. Other unknowns use their own units.
  function assumptionToURL(k, a) {
    return urlCodec[k] ? urlCodec[k].encode(a) : [+(+a.mean).toFixed(3), +(+a.sd).toFixed(3)];
  }
  // Links round to 3 decimals to stay short, so decoding snaps back to the exact values the
  // page can produce: the default or a scenario's values if the link matches their encoding,
  // otherwise the nearest slider position (center min + k·step, spread k·step).
  function assumptionFromURL(k, m, sd) {
    const info = ASSUMPTION_INFO[k];
    if (info) {
      const cands = [defaultAssumptions()[k]];
      const UP = root.SimPresets && root.SimPresets.UNKNOWN_PRESETS;
      if (UP) for (const u of Object.values(UP)) if (u.set && u.set[k]) cands.push(u.set[k]);
      for (const c of cands) { const [em, es] = assumptionToURL(k, c); if (em === m && es === sd) return [c.mean, c.sd]; }
    }
    let [mv, sv] = urlCodec[k] ? urlCodec[k].decode(m, sd) : [m, sd];
    if (info) {
      const step = info.fmt === 'num' ? 1 : 0.01;
      const snap = (v, base, st) => { if (!Number.isFinite(v)) return v; const g = base + Math.round((v - base) / st) * st; return Math.abs(g - v) <= st * 0.1 ? g : v; };
      mv = snap(mv, info.min, step); sv = snap(sv, 0, 0.01); // the spread slider always steps by 0.01
    }
    return [mv, sv];
  }

  function gauss(rng) {
    return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  }

  // Each unknown in ASSUMPTION_INFO carries, besides its slider metadata:
  //   sample(A, rng, draw)  its value in one future (default: draw(key), N(mean, sd) clipped to [min, max]);
  //   atMean(A)             its value in the mean world (default: clippedMean(A[key]));
  //   world(A, v)           the fields a world carries for value v, belief nodes included;
  //   notInBase             left out of the base world that measures bio exposure.
  // The RNG order. Append-only: a new unknown goes at the end, so every existing seed keeps its world.
  const DRAW_ORDER = Object.freeze(['ease', 'speed', 'whistle', 'benevolent', 'bioDecade', 'cnAlign', 'cnCaution', 'evalGap', 'capNow', 'share', 'valueAlign']);

  // Draw one world. `pSafe` is what everyone believes up front; `safe` is the truth.
  function sampleWorld(A, rng, skipBio = false) {
    const draw = (k) => {
      const info = ASSUMPTION_INFO[k];
      return Math.max(info.min, Math.min(info.max, A[k].mean + A[k].sd * gauss(rng)));
    };
    const v = {};
    for (const k of DRAW_ORDER) v[k] = ASSUMPTION_INFO[k].sample ? ASSUMPTION_INFO[k].sample(A, rng, draw) : draw(k);
    return buildWorld(A, v, skipBio);
  }
  // The world's fields from one value per unknown; the bio fields go last (and are skipped for the base world).
  function buildWorld(A, v, skipBio = false) {
    const w = {};
    for (const k of DRAW_ORDER) if (!ASSUMPTION_INFO[k].notInBase) Object.assign(w, ASSUMPTION_INFO[k].world(A, v[k]));
    if (!skipBio) for (const k of DRAW_ORDER) if (ASSUMPTION_INFO[k].notInBase) Object.assign(w, ASSUMPTION_INFO[k].world(A, v[k]));
    return w;
  }

  // The same world without its bio draw (bio hazard off): used to measure exposure.
  function sampleBaseWorld(A, rng) {
    const w = sampleWorld.call(null, A, rng, true);
    return Object.assign(w, { bioDecade: 0, bioScale: 0, bioNodes: null });
  }

  // Every unknown at its mean (the kind-AI coin at false), for the default starting state.
  function meanWorld() {
    const A = defaultAssumptions(), v = {};
    for (const k of DRAW_ORDER) v[k] = ASSUMPTION_INFO[k].atMean ? ASSUMPTION_INFO[k].atMean(A) : clippedMean(A[k]);
    return buildWorld(A, v);
  }

  // Belief nodes [weight, value] over N(mean, sd) clipped to [lo, hi]: the clipping's point
  // masses at the ends kept exactly, 40 midpoint nodes inside. Cached per distribution.
  const CLIP_CACHE = new Map();
  function clippedNodes(p, lo, hi) {
    const key = p.mean + '|' + p.sd + '|' + lo + '|' + hi;
    if (!CLIP_CACHE.has(key)) {
      let nodes;
      if (!(p.sd > 0)) nodes = [[1, clamp(p.mean, lo, hi)]];
      else {
        const z0 = (lo - p.mean) / p.sd, z1 = (hi - p.mean) / p.sd;
        nodes = [[normCdf(z0), lo], [1 - normCdf(z1), hi]];
        const a = Math.max(z0, -8), b = Math.min(z1, 8), dz = (b - a) / 40;
        if (b > a) for (let i = 0; i < 40; i++) {
          const zl = a + i * dz, zm = zl + dz / 2;
          nodes.push([normCdf(zl + dz) - normCdf(zl), clamp(p.mean + p.sd * zm, lo, hi)]);
        }
        const t = nodes.reduce((x, [w]) => x + w, 0);
        nodes = nodes.filter(([w]) => w > 1e-12).map(([w, v]) => [w / t, v]);
      }
      CLIP_CACHE.set(key, { nodes, mean: nodes.reduce((a, [w, v]) => a + w * v, 0) });
    }
    return CLIP_CACHE.get(key);
  }
  // What the campaign reveals about the unknowns, in `revealOrder` (capNow is public, so it has none).
  // The roll screen flashes each `roll` row; the secret facts show each `secret` row, given the
  // page's percent formatter `pct`, the state `s`, levers `L` and whether the game is `over`.
  const revealed = (field) => Object.keys(ASSUMPTION_INFO).filter((k) => ASSUMPTION_INFO[k][field])
    .sort((a, b) => ASSUMPTION_INFO[a].revealOrder - ASSUMPTION_INFO[b].revealOrder).map((k) => ASSUMPTION_INFO[k][field]);
  const rollRows = () => revealed('roll');
  const secretRows = (s, L, ctx) => revealed('secret').map(([label, html]) => [label, html(s.world, Object.assign({ s, L }, ctx))]);

  // Nodes over China's own-alignment effort for the belief shown to players (an expectation
  // over the clipped bell curve; the dice use the hidden draw). Nodes span ±4 sd so the clipped
  // tails are represented (cached per distribution).
  const CN_Z = Array.from({ length: 33 }, (_, i) => -4 + i * 0.25);
  const CN_W = (() => { const w = CN_Z.map((z) => Math.exp(-z * z / 2)), t = w.reduce((a, b) => a + b); return w.map((x) => x / t); })();
  const CN_CACHE = new Map();
  function chinaNodes(p) {
    const key = p.mean + '|' + p.sd;
    if (!CN_CACHE.has(key)) {
      const nodes = p.sd > 0 ? CN_Z.map((z, i) => [CN_W[i], clamp(p.mean + p.sd * z, 0, 1)]) : [[1, clamp(p.mean, 0, 1)]];
      CN_CACHE.set(key, { nodes, mean: nodes.reduce((a, [w, v]) => a + w * v, 0) });
    }
    const c = CN_CACHE.get(key);
    return { cnNodes: c.nodes, cnMean: c.mean };
  }

  // Expected value of a probability drawn from N(mean, sd) and clipped to [0, 1], which is
  // what each world's draw averages to (the shown belief must match the sampled truth).
  function clippedMean(p) {
    if (!(p.sd > 0)) return clamp(p.mean, 0, 1);
    let e = 0;
    for (const z of DIFF_Z) e += zWeight(z) * clamp(p.mean + p.sd * z, 0, 1);
    return e;
  }

  // Loss-of-control exposure from alignment difficulty: none below 0.3× (aligned
  // by default), full above 0.8×. `hazardBelief` and `pSafe` are expectations
  // over the difficulty distribution, used for what players are shown.
  // Internally the model works with difficulty δ = 1 / ease (log10 δ = -log10 ease).
  const diffDistOf = (A) => ({ mean: -A.ease.mean, sd: A.ease.sd });
  const lossHazard = (d) => clamp((d - K.diffSafe) / K.diffRamp, 0, 1);
  const DZ = 0.05;
  const DIFF_Z = Array.from({ length: 161 }, (_, i) => -4 + i * DZ);
  const zWeight = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * DZ;
  // Standard normal CDF (Abramowitz–Stegun 7.1.26, error < 1.5e-7).
  function normCdf(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const e = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x / 2);
    return x >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
  }
  function difficultyWorld(d, dist) {
    let hb = 0;
    for (const z of DIFF_Z) hb += zWeight(z) * lossHazard(Math.pow(10, dist.mean + dist.sd * z));
    const pSafe = dist.sd > 0 ? normCdf((Math.log10(K.diffSafe) - dist.mean) / dist.sd) : (Math.pow(10, dist.mean) <= K.diffSafe ? 1 : 0);
    return { hazard: lossHazard(d), safe: d <= K.diffSafe, hazardBelief: hb, pSafe, diffDist: { mean: dist.mean, sd: dist.sd } };
  }

  // Turn a decade bio risk into a hazard scale k = -ln(1 - R) / G_ref, where G_ref is
  // the bio exposure default-path futures actually go through in 2027–2036 (summed
  // until each future ends: most end at the superintelligence handoff). So on the
  // default path a world's realized decade risk is about its drawn R; other policies
  // scale with bioShape. `bioNodes` describe the unknown risk, for the expected risk
  // shown to players (the dice use the hidden draw).
  function bioWorld(decade, dist) {
    return { bioDecade: decade, bioScale: -Math.log(1 - decade) / bioRefExposure(), bioNodes: bioBeliefNodes(dist) };
  }

  // Quadrature nodes (weight, scale k) over the unknown decade risk. The shown risk is
  // the expected probability E[1 - exp(-k g)], not 1 - exp(-E[k] g): the risk is concave
  // in k and the distribution is heavy-tailed, so the two differ a lot at high exposure.
  const BIO_NODE_CACHE = new Map();
  function bioBeliefNodes(dist) {
    const key = dist.mean + '|' + dist.sd;
    if (BIO_NODE_CACHE.has(key)) return BIO_NODE_CACHE.get(key);
    const ref = bioRefExposure(), nodes = [];
    for (let i = 0; i < 121; i++) {
      const z = -6 + i * 0.1, wgt = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * 0.1;
      nodes.push([wgt, -Math.log(1 - Math.min(0.99, Math.pow(10, dist.mean + dist.sd * z))) / ref]);
    }
    BIO_NODE_CACHE.set(key, nodes);
    return nodes;
  }
  function expectedBio(nodes, g) {
    if (!nodes || g <= 0) return 0;
    let p = 0;
    for (const [w, k] of nodes) p += w * (1 - Math.exp(-k * g));
    return p;
  }

  // Relative bio hazard of a state: open-weights uplift (dominant once open models
  // pass expert level) times how much biodefense (synthesis screening, surveillance,
  // stockpiles) is missing. Closed-model and state-program pandemics are treated as
  // negligible: states are deterred, and closed models keep capabilities away from
  // rogue actors (see Superintelligence Strategy, nationalsecurity.ai).
  function bioShape(s) {
    return sig((s.openCap - K.bioOpenMid) / K.bioOpenW) * Math.pow(1 - s.bio / 100, K.bioDefExp);
  }

  // Mean bio exposure over 2027–2036 that default-path futures actually go through,
  // from a fixed-seed sample of worlds with the bio hazard switched off.
  let BIO_REF = null;
  function bioRefExposure() {
    if (BIO_REF !== null) return BIO_REF;
    const rng = mulberry32(2027), A = defaultAssumptions(), L = defaultLevers(), n = 3000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const s = initialState(sampleBaseWorld(A, rng)); s.fast = true;
      for (let y = 0; y < 10 && !s.outcome; y++) { sum += bioShape(s); step(s, L, rng, true); }
    }
    BIO_REF = sum / n;
    return BIO_REF;
  }

  // `short` names a change on a card's chips, `name` in the year's change summary; `up` says
  // whether a rise is 'good' or 'bad' for humanity (absent: neither), which colours both.
  const STAT_INFO = {
    capUS:   { label: 'Frontier capability — US bloc', color: '#5aa9ff', short: 'US AI', name: 'US capability' },
    capCN:   { label: 'Frontier capability — China',   color: '#ff6b5a', short: 'China AI', name: 'China capability', up: 'bad' },
    align:   { label: 'Alignment & control maturity',  color: '#59f0b8', short: 'AI safety', name: 'Alignment', up: 'good' },
    openCap: { label: 'Best open-weights model',       color: '#ffd166', short: 'free AI power', name: 'Open models', up: 'bad' },
    bio:     { label: 'Biodefense (screening, PPE, vaccines)', color: '#9be15d', short: 'pandemic defense', name: 'Biodefense', up: 'good' },
    coord:   { label: 'International coordination',    color: '#7fe3ff', short: 'US–China trust', name: 'Coordination', up: 'good' },
    bci:     { label: 'Neural-interface adoption',     color: '#d68cff', short: 'implant users', name: 'Neural interfaces' },
    internal: { label: 'Hidden internal AI',           color: '#ff5fa2', short: 'secret AI', name: 'Hidden internal AI', up: 'bad' },
    deleg:   { label: 'Decisions delegated to AI',     color: '#c9a27e', short: 'decisions left to AI', name: 'Delegated to AI', up: 'bad' },
    conc:    { label: 'Power concentration',           color: '#ff9f43', short: 'power in few hands', name: 'Power concentration', up: 'bad' },
    trust:   { label: 'Public trust & stability',      color: '#e0e6f0', short: 'public trust', name: 'Public trust', up: 'good' },
  };

  function defaultLevers() {
    const L = {};
    for (const k in LEVER_INFO) L[k] = LEVER_INFO[k].def;
    return L;
  }

  function initialState(world) {
    world = world || meanWorld();
    const cap0 = world.capNow ?? 44;
    return {
      world,
      year: START_YEAR,
      capUS: cap0, capCN: cap0 - K.cnGap0, align: K.align0, openCap: K.openCap0, bio: K.bio0,
      coord: K.coord0, bci: K.bci0, conc: K.conc0, trust: K.trust0,
      internal: K.internal0,       // how far AI used inside labs is ahead of what outsiders can see
      deleg: K.deleg0,    // share of real decision-making handed to AI with little human checking
      cnMult: 1,          // modified by export controls
      survival: 1,        // cumulative probability of avoiding catastrophe so far (expected, not rolled)
      alive: 1,           // ...of which: the future is still running
      safeEnded: 0,
      fundStake: K.fund0, // public ownership of AI returns, 0..100 (Alaska-style funds exist today)
      acYear: null,       // year the Automated Coder milestone was reached
      dealStart: null,    // first year a US–China deal was in force
      dealImpaired: null, // year the deal was weakened (at most once)
      dealCollapsed: null, // year the deal dissolved (it never returns)       // ...of which: it already ended without catastrophe (kind takeover, handoff)
      outcome: null,
      log: [],
    };
  }

  const maxCap = (s) => Math.max(s.capUS, s.capCN);

  // Delegation Λ (0..100): how much of society's and labs' real decision-making is handed to AI
  // with little human checking (gradual disempowerment; approvals become rubber stamps).
  // 12 in 2027: AI agents already write much of the code at frontier labs and act inside many
  // workflows, but most consequential decisions still get real human review. An assumption.
  const DELEG0 = K_DEFAULTS.deleg0; // the default; formulas use K.deleg0
  // Rubber-stamp oversight: the share of oversight's and transparency's bite that survives.
  // 1 at Λ = 0, 0.5 when everything is delegated.
  const oversightBite = (s) => 1 - K.delegBite * ((s.deleg ?? K.deleg0) - K.deleg0) / 100; // 1 at the 2027 level, like the other two effects
  // Small multiplier on the yearly loss-of-control hazard, 1 at the 2027 level.
  const delegHazard = (s) => 1 + K.delegHaz * ((s.deleg ?? K.deleg0) - K.deleg0) / 100;

  // Capability scale anchored to AI 2040's milestones:
  //   70 = Automated Coder (AC), 90 = top-expert-dominating AI (TED-AI), 100 = superintelligence.
  const AC = 70, TOP_EXPERT = 78, TEDAI = 90;

  // AI R&D speed-up from AI labor: 1× below 50, 3× at AC, ~40× at TED-AI (AI 2040 takeoff forecast).
  function uplift(c) {
    if (c < K.upliftStart) return 1;
    if (c < AC) return Math.pow(K.upliftAC, (c - K.upliftStart) / (AC - K.upliftStart));
    return Math.min(K.upliftTED, K.upliftAC * Math.pow(K.upliftTED / K.upliftAC, (c - AC) / (TEDAI - AC)));
  }

  // Loss-of-control onset gate: how much of AI research AI itself does. With an R&D speed-up U,
  // AI does about 1 - 1/U of the work (0 below 50, half at 2×, two-thirds at an Automated Coder,
  // 97% at TED-AI). Once AI does most of its own research it can quietly shape its successors
  // (sandbagging safety work, tampering with training, hiding its goals) before top-expert level.
  // The gate is half open at 70% automation (U ≈ 3.3, capability ≈ 71) and about 0.94 at 90.
  const rdShare = (c) => 1 - 1 / uplift(c);
  const locGate = (c) => sig((rdShare(c) - K.rdShareMid) / K.rdShareW);

  // Effective compute from race intensity. AI 2040: 10× less compute makes the
  // intelligence explosion ~5.5× slower, i.e. speed ∝ compute^0.74. Race 0.55 = 1× (the default
  // race 0.7 is about 1.2×); race ≈ 0 is a halt.
  const COMPUTE_NORM = 0.52; // fixed, not a swept constant: it sets race 0.55 = 1× compute
  const computeSpeed = (race) => Math.pow(Math.max(0, race - 0.03) / COMPUTE_NORM, K.computeExp);

  // Safety lever = fraction of AI compute and AI labor spent on safety (0–100%).
  // Effect is linear up to 30%, then diminishes: people and ideas become the bottleneck.
  // At 100% no compute is left for capabilities, which amounts to a unilateral pause.
  const safetyEffect = (f) => f <= K.safetyKnee ? Math.max(0, (f - 0.01) / (K.safetyKnee - 0.01)) : 1 + K.safetyTail * (f - K.safetyKnee) / (1 - K.safetyKnee);
  const safetyLabor = (f) => K.laborBase + K.laborSafety * Math.min(1, safetyEffect(f)) + K.laborPause * Math.max(0, f - K.safetyKnee) / (1 - K.safetyKnee);
  let CN_LABOR = safetyLabor(0.3); // AI labor share China puts on alignment at full own effort

  // A verified US–China deal: frontier scaling stops at top-human-expert level.
  // Once a deal has collapsed it stays dead.
  const dealActive = (s, L) => !s.dealCollapsed && s.coord >= K.dealCoord && L.diplomacy >= K.dealDip;
  // The deal's capability ceiling: top-expert level, a few points higher once it is impaired.
  const dealCeiling = (s) => K.dealCap + (s.dealImpaired ? K.dealSlack : 0);
  // AI 2040's Deal Decline schedule: dissolution and impairment each run 6% a year at deal age
  // 0-2, 3.5% at 2-5 and 2% after that. Age counts from the first year the deal is in force.
  const dealHazard = (age) => age < 2 ? K.dealHaz0 : age < 5 ? K.dealHaz1 : K.dealHaz2;

  // China's effective race intensity responds to the US posture and to trust.
  // A US pause (race down, or all compute on safety) eases it only partly.
  function chinaRace(s, L) {
    const usPush = L.race * (1 - K.usPushSafety * L.safety);
    const base = clamp(K.cnRaceBase + K.cnRaceResp * (usPush - 0.5) - K.cnRaceCoord * (s.coord / 100), 0.05, 1);
    return clamp(base * (1 - chinaSlowdown(s, L)), 0.05, 1);
  }

  // How far China cuts its race this year: its hidden caution, times warning signs of losing
  // control (capability near the top while alignment lags; noticed about 5 points later than
  // the US would, since bad news travels up a personalist system slowly), times reciprocity
  // (0.6 with the US racing, up to 1.2 if the US slows or a verified deal holds).
  function chinaSlowdown(s, L) {
    const caution = s.world.cnCaution || 0;
    if (!caution) return 0;
    const mc = maxCap(s);
    const warning = sig((mc - K.cnWarnCap) / K.cnWarnW) * sig((mc - s.align - K.cnWarnGap) / K.cnWarnW);
    const usSlow = clamp(1 - L.race * (1 - K.usPushSafety * L.safety) / K.cnSlowRace, 0, 1);
    const recip = K.cnRecip * (1 + Math.max(usSlow, dealActive(s, L) ? 1 : 0));
    return clamp(caution * warning * recip, 0, K.cnSlowMax);
  }

  // Alignment research is done mostly in the US bloc. If China leads, its lab
  // uses that work only as far as coordination and published research allow.
  // The discount is centred on a tie: half-strength when the blocs are even, rising
  // smoothly as China's lead grows and fading as the US pulls ahead.
  // China's own alignment work `own` (0..1, relative to the US bloc) covers part of what
  // sharing does not: China's lab has 1 - (1 - share)(1 - own) of US-level alignment.
  // `over` is how much tests overstate alignment; the part still hidden this year
  // (hiddenShare) is subtracted, so this is real alignment, not the measured s.align.
  function effAlign(s, L, own = s.world.cnAlign || 0, over = s.world.evalGap || 0) {
    const share = Math.min(1, K.shareBase + K.shareCoord * (s.coord / 100) + K.shareTransp * (L ? L.transparency : 0));
    const cover = 1 - (1 - share) * (1 - own);
    const chinaLeads = sig((s.capCN - s.capUS) / K.leadW);
    return s.align * (1 - over * hiddenShare(s, L)) * (1 - chinaLeads * (1 - cover));
  }
  // How much of the test overstatement stays hidden: more with secret internal AI, less with
  // independent oversight, published research and safety work (interpretability, evals).
  // About 0.7 on today's settings, about 0.3 with full oversight and transparency.
  function hiddenShare(s, L) {
    const o = L ? L.oversight : 0.1, t = L ? L.transparency : 0.2, sx = L ? Math.min(1, safetyEffect(L.safety)) : 0.14;
    return clamp(K.hidBase + K.hidInternal * s.internal / 100 - (K.hidOversight * o + K.hidTransp * t) * oversightBite(s) - K.hidSafety * sx, 0.1, 1.4);
  }
  // Real (not measured) alignment of the US bloc's work, ignoring China's sharing gap.
  const realAlign = (s, L) => s.align * (1 - (s.world.evalGap || 0) * hiddenShare(s, L));
  // Joint belief nodes over China's own work and the test overstatement: [weight, own, over].
  function alignBelief(s, L) {
    const eg = s.world.egNodes || [[1, s.world.evalGap || 0]];
    const out = [];
    for (const [wc, own] of cnBelief(s, L)) for (const [we, over] of eg) out.push([wc * we, own, over]);
    return out;
  }
  // Belief nodes over China's own alignment work: [weight, value] pairs. China's own work
  // moves effective alignment by at most A * chinaLeads * (1 - share); when that is under
  // 0.05 points the average is taken at the mean (the error is far below display precision).
  function cnBelief(s, L) {
    const w = s.world;
    if (!w.cnNodes) return [[1, w.cnAlign || 0]];
    const share = Math.min(1, K.shareBase + K.shareCoord * (s.coord / 100) + K.shareTransp * (L ? L.transparency : 0));
    const reach = s.align * sig((s.capCN - s.capUS) / K.leadW) * (1 - share);
    return reach < 0.05 ? [[1, w.cnMean]] : w.cnNodes;
  }
  // Difficulty nodes [weight, difficulty], cached per distribution.
  const DZ_CACHE = new Map();
  function diffNodes(dist) {
    const key = dist.mean + '|' + dist.sd;
    if (!DZ_CACHE.has(key)) DZ_CACHE.set(key, DIFF_Z.map((z) => [zWeight(z), Math.pow(10, dist.mean + dist.sd * z)]));
    return DZ_CACHE.get(key);
  }

  // Annual catastrophe hazards given the current state and policy.
  function risks(s, L) {
    const mc = maxCap(s);
    // Engineered pandemic (100M+ deaths): shown as the expectation over the
    // unknown decade risk; the dice use this world's hidden draw (bioTrue).
    const shape = bioShape(s);
    const bio = expectedBio(s.world.bioNodes, shape);
    const bioTrue = 1 - Math.exp(-s.world.bioScale * shape);

    // Loss of control: grows once AI does most of its own research and capability outruns alignment.
    // Scaled by how hard alignment is: zero in worlds where it is easy by
    // default. Shown as the expectation over difficulty and China's own alignment work;
    // the roll uses the truth.
    // AI 2040: most takeover risk comes from AIs deployed inside labs, out of view.
    const internalF = 1 + K.intSlope * s.internal / 100, gate = locGate(mc);
    const lossAt = (own, over) => K.locScale * sig((mc - effAlign(s, L, own, over) - K.locOffset) / K.locWidth) * gate * internalF * delegHazard(s);
    // Monte Carlo runs (s.fast) never show beliefs, so they skip the averages.
    let lossBelief = 0;
    if (s.fast) lossBelief = lossAt(s.world.cnMean ?? s.world.cnAlign ?? 0, s.world.egMean ?? s.world.evalGap ?? 0);
    else for (const [w, own, over] of alignBelief(s, L)) lossBelief += w * lossAt(own, over);
    const misalign = s.world.hazardBelief * lossBelief;
    const misalignTrue = s.world.hazard * lossAt(s.world.cnAlign || 0, s.world.evalGap || 0);

    // Great-power conflict: tight race + low trust + high strategic stakes.
    const closeness = clamp(1 - Math.abs(s.capUS - s.capCN) / K.warCloseW, 0, 1);
    const stakes = sig((mc - K.warStakesMid) / K.warStakesW);
    // Sabotage (AI 2040's Plan B) provokes: it raises baseline war risk, and
    // a China falling behind under attack has a reason to strike first.
    const behind = clamp((s.capUS - s.capCN) / K.warBehindW, 0, 1);
    const war = K.warBase * Math.pow(1 - s.coord / 100, 2) * (K.warCloseFloor + (1 - K.warCloseFloor) * closeness) * stakes * (1 + K.warAggr * L.aggression)
      + K.warSabot * L.aggression * (K.warBehindFloor + (1 - K.warBehindFloor) * behind) * stakes;

    // Hazards are rolled one after another: pandemic, then loss of control, then war.
    // `total` is the chance of a catastrophe this year; losing control to a kind AI is not one.
    // A kind takeover ends the future before the war roll, so it removes war risk too.
    const kind = s.world.pBenevolent;
    const total = bio + (1 - bio) * (misalign * (1 - kind) + (1 - misalign) * war);
    return { bio, bioTrue, misalign, misalignTrue, war, total };
  }

  // Probability that crossing the superintelligence threshold goes well.
  // `truth` uses the hidden world; otherwise the up-front belief.
  function transitionOdds(s, truth = false, L = null) {
    // Opaque internal deployment makes the handoff harder to get right.
    // The bar alignment must clear rises with the hidden difficulty; outsiders
    // only know its average (1×), so the shown odds use that.
    // High-bandwidth BCIs let humans check AI reasoning directly, lowering the bar.
    // A society that has delegated more is less able to step back in (Λ above its 2027 level).
    const bar = (d) => K.barBase + K.barDiff * d + K.barInternal * (s.internal - K.internal0) + K.barDeleg * ((s.deleg ?? K.deleg0) - K.deleg0) - K.barBci * (s.bci / 100);
    if (truth) return s.world.safe ? 1 : sig((effAlign(s, L) - bar(s.world.difficulty)) / K.barW);
    const dn = diffNodes(s.world.diffDist), bars = dn.map(([, dz]) => bar(dz));
    let p = 0;
    for (const [wc, own, over] of alignBelief(s, L)) {
      const a = effAlign(s, L, own, over);
      for (let i = 0; i < dn.length; i++) p += wc * dn[i][0] * (dn[i][1] <= K.diffSafe ? 1 : sig((a - bars[i]) / K.barW));
    }
    return p;
  }

  // Probability that, with humans in control of AI, a few end up holding it and its gains
  // and most people lose their say: seized outright, or drifted there as automation moves
  // value from labor to whoever owns AI (nationalsecurityresponse.ai). Exponential growth
  // pulls the frontier away from the pack, so a close rival or open weights protect little.
  // `whistle`, `share` and `value` default to this world's hidden draws; belief callers pass node
  // values. The baseline pressure scales with 1 - share: how unlikely the few are to share the
  // gains when nothing forces them. `value` is value alignment: the chance the (intent-)aligned
  // AI cares about humanity broadly and refuses to help a few seize power. Even a sure refusal
  // removes only K.lockValue (0.8) of the uncapped pressure (less once the 0.95 cap binds): the owners can retrain or swap the model, and
  // part of lock-in is drift (value moving to AI owners) that no one asks the AI to help with.
  function lockinOdds(s, L, whistle = s.world.whistle, share = s.world.share, value = s.world.valueAlign) {
    return clamp(lockinScale(share) * lockinBase(s, L) * (1 - K.lockWhistle * whistle) * (1 - K.lockValue * (value || 0)), 0, 0.95);
  }
  // Everything in the lock-in odds except the hidden draws (whistleblowers, sharing, values).
  function lockinBase(s, L) {
    const mc = maxCap(s);
    const conc = K.lockConcFloor + (1 - K.lockConcFloor) * sig((s.conc - K.lockConcMid) / K.lockConcW); // power already concentrated
    const phys = s.acYear ? clamp((s.year - s.acYear) / K.lockPhysYears, 0, 1) : 0;   // robots follow software
    const automation = K.lockAutoFloor + (1 - K.lockAutoFloor) * phys;
    const pressure = (1 + K.lockRaceSlope * L.race) * (1 - K.lockTrustSlope * s.trust / 100); // automate or die; weak public voice
    const plural = Math.max(clamp(1 - Math.abs(s.capUS - s.capCN) / K.lockPluralW, 0, 1), clamp((s.openCap - 80) / 20, 0, 1));
    return conc * automation * pressure
      * (1 - K.lockFund * s.fundStake / 100)                                // public owns part of AI
      * (1 - K.lockOversight * L.oversight) * (1 - K.lockTransp * L.transparency) // accountable AI owners
      * (1 - K.lockPlural * plural)                                         // rivals help only a little
      * (1 - K.lockOpen * L.openness * clamp(s.openCap / Math.max(1, mc), 0, 1)) // open weights spread access
      * (1 - K.lockDip * L.diplomacy * clamp((s.trust - 50) / 30, 0, 1));   // coordination, only with public pressure
  }
  // Calibrated so about 70% of status-quo futures where humans keep control lock in before
  // value alignment (nu = 0); the default nu (mean 0.25) brings that to about 57%.
  const LOCK_K = K_DEFAULTS.lockK; // the default; formulas use K.lockK
  const lockinScale = (share) => K.lockK * (1 - share);
  // Endings that count as catastrophes (a kind takeover does not).
  const CATASTROPHES = ['bio', 'misalign', 'war', 'lockin'];
  // Shown (belief) lock-in odds: the capped probability averaged over the joint distribution
  // of whistleblower odds, sharing and value alignment (independent draws), not evaluated at
  // their means. The dice use the hidden draws. Where the cap cannot bind for a sharing node,
  // the product factorizes and the inner average is exact without the double loop.
  function lockinBelief(s, L) {
    const wn = s.world.whistleNodes || [[1, s.world.whistle]], sn = s.world.shareNodes || [[1, s.world.share]];
    const vn = s.world.valueNodes || [[1, s.world.valueAlign || 0]];
    const base = lockinBase(s, L);
    const wm = wn.map(([w, v]) => [w, 1 - K.lockWhistle * v]), vm = vn.map(([w, v]) => [w, 1 - K.lockValue * v]);
    const mean = (nodes) => nodes.reduce((a, [w, f]) => a + w * f, 0), Ew = mean(wm), Ev = mean(vm);
    const maxW = Math.max(...wm.map(([, f]) => f)), maxV = Math.max(...vm.map(([, f]) => f));
    let p = 0;
    for (const [ws, sv] of sn) {
      const k = lockinScale(sv) * base;
      if (k * maxW * maxV <= 0.95) { p += ws * Math.max(0, k * Ew * Ev); continue; }
      for (const [w, fw] of wm) for (const [u, fv] of vm) p += ws * w * u * clamp(k * fw * fv, 0, 0.95);
    }
    return p;
  }

  /*
   * Advance one year. `rng` is a function returning [0,1). If `roll` is false
   * the step is purely expected-value (no catastrophe sampling).
   * Returns { risk, event, stage } where event is a terminal outcome key or null.
   */
  function step(s, L, rng, roll = true) {
    const r = risks(s, L);
    // Expected accounting: only the share of futures still running faces this year's
    // hazards. A kind takeover ends a future without catastrophe; it is set aside so the
    // handoff and later years don't count against it again.
    const kind = s.world.pBenevolent;
    s.safeEnded += s.alive * (1 - r.bio) * r.misalign * kind;
    s.alive *= (1 - r.bio) * (1 - r.misalign) * (1 - r.war);
    s.survival = s.safeEnded + s.alive;

    // Every year draws the same fixed set of dice, each with one job, whether or
    // not it is used. Rewinding a campaign and choosing differently then keeps
    // every die of that year (and the next years' draws) the same.
    // d[16] (deal impairment) was added last, so the earlier indices kept their jobs; adding
    // it shifted every later draw in the stream.
    const d = Array.from({ length: 17 }, () => rng());
    const noise = (i) => (d[i] - 0.5) * 2;

    // Hazards are rolled one after another, so they combine as independent risks.
    if (roll) {
      if (d[0] < r.bioTrue) return finish(s, 'bio', r, 'bio');
      if (d[1] < r.misalignTrue) return finish(s, lostControl(s), r, 'loc');
      if (d[2] < r.war) return finish(s, 'war', r, 'war');
    }

    // Every update below reads the start-of-year state from s0, a frozen copy, and writes s, so
    // the order of the lines cannot matter. One same-year read is deliberate: the deal shock
    // (dissolution or impairment) cuts coordination this year, so alignment's sharing term and
    // coordination's own update start from the shocked level (coordShocked). The milestone,
    // handoff and 2040 checks after the updates read the end-of-year state, also on purpose:
    // the handoff happens when this year's growth crosses 100.
    const s0 = Object.freeze({ ...s });
    const mc = maxCap(s0);
    const w = s0.world;

    // Capability: base pace × compute × hidden progress speed × AI R&D uplift.
    // Published research lets China (and everyone else) close part of the gap.
    const BASE = K.capBase;
    const sx = safetyEffect(L.safety);
    const safetyTax = Math.max(0, 1 - L.safety - K.ovsTax * L.oversight);
    // Noise and surprise breakthroughs scale with the compute each side actually
    // spends on capabilities, so a pause (race 0 or all compute on safety) holds.
    const cUS = computeSpeed(L.race) * safetyTax;
    const cCN = computeSpeed(chinaRace(s0, L)) * s0.cnMult * (1 - K.sabotSlow * L.aggression); // sabotage slows China's labs
    const jUS = Math.min(1.5, cUS), jCN = Math.min(1.5, cCN);
    let gUS = (BASE * w.speed * uplift(s0.capUS) + noise(3)) * cUS;
    let gCN = (BASE * w.speed * uplift(s0.capCN) + noise(4)) * cCN
      + K.leak * L.transparency * Math.max(0, s0.capUS - s0.capCN) * (1 - K.sabotSlow * L.aggression);
    if (d[5] < K.jumpP) { gUS += (K.jumpUS + d[6] * K.jumpUSRand) * jUS; gCN += (K.jumpCN + d[7] * K.jumpCNRand) * jCN; }
    // AI 2040's Deal Decline: about 48% of deals decline within ten years, split about equally
    // between dissolution (leadership change, a side caught cheating, ...) and impairment.
    // Dissolution cuts coordination by 40 and the deal never returns (about 28% over ten
    // years). Impairment, at most once per deal, cuts coordination by 20 and lets the ceiling
    // rise a few points; the deal stays in force while coordination holds at 60 or more.
    // The deal holds capability through the year it dissolves or weakens, so the change
    // bites the next year (and the campaign gets a turn to respond).
    let coordShocked = s0.coord;
    if (dealActive(s0, L)) {
      const dealStart = s0.dealStart ?? s0.year;
      s.dealStart = dealStart;
      const ceil = dealCeiling(s0), h = dealHazard(s0.year - dealStart);
      gUS = Math.min(gUS, Math.max(0, ceil - s0.capUS));
      gCN = Math.min(gCN, Math.max(0, ceil - s0.capCN));
      if (d[8] < h) { coordShocked = clamp(s0.coord - K.dealCollapseCut); s.dealCollapsed = s0.year; }
      else if (!s0.dealImpaired && d[16] < h) { coordShocked = clamp(s0.coord - K.dealImpairCut); s.dealImpaired = s0.year; }
    }
    s.capUS = clamp(s0.capUS + Math.max(0, gUS));
    s.capCN = clamp(s0.capCN + Math.max(0, gCN));

    // Alignment: funded research, multiplied by the share of AI labor pointed at
    // safety (so it also speeds up during takeoff), shared international and
    // public research, and (speculatively) BCIs that widen human oversight.
    // Divided by the world's hidden alignment difficulty.
    // Safety research is sped up by each bloc's own AI: the US bloc's by its safety share,
    // China's by its own alignment effort (100% = a serious program, like a US bloc spending
    // 30% of compute on safety). So a cautious China that leads the race speeds alignment up too.
    const assist = 1 + (uplift(s0.capUS) - 1) * safetyLabor(L.safety) + (uplift(s0.capCN) - 1) * CN_LABOR * (w.cnAlign || 0);
    const shared = 1 + K.alShCoord * (coordShocked / 100) + K.alShTransp * L.transparency; // the deal shock bites this year
    const bciBoost = 1 + K.alBci * (s0.bci / 100);
    s.align = clamp(s0.align + K.alRate * (1 + K.alSafety * sx + K.alOversight * L.oversight) * assist * shared * bciBoost / w.difficulty + noise(9) * K.alNoise);
    if (d[10] < K.alJumpP) s.align = clamp(s.align + K.alJumpBase + d[11] * K.alJumpRand * (0.5 + Math.min(1, sx)));

    // Hidden internal AI: automated R&D runs inside labs; transparency and
    // inspections pull it into view.
    // Augmented overseers (BCI) can follow what thousands of AI copies are doing.
    // Rubber-stamp oversight (high delegation) pulls less of it into view.
    const bite = oversightBite(s0);
    s.internal = clamp(s0.internal + K.intRace * L.race * Math.sqrt(uplift(mc)) - (K.intTransp * L.transparency + K.intOversight * L.oversight) * bite - K.intBci * (s0.bci / 100) - K.intDecay);

    // Delegation: automation (capability and the share of AI research AI does) and racing (no time
    // to check) hand more decisions to AI; oversight, transparency and safety work that keeps
    // humans in the loop take some back. Growth slows as little is left to hand over.
    const delegUp = (K.delBase + K.delCap * Math.max(0, mc - 40) + K.delRd * rdShare(mc)) * (K.delRaceBase + L.race) * (1 - s0.deleg / 100);
    const delegDown = (K.delOversight * L.oversight + K.delTransp * L.transparency + K.delSafety * Math.min(1, sx)) * s0.deleg;
    s.deleg = clamp(s0.deleg + delegUp - delegDown);

    s.coord = clamp(coordShocked + K.coDip * L.diplomacy + K.coOversight * L.oversight + K.coTransp * L.transparency - K.coRace * L.race - K.coAggr * L.aggression - K.coDecay + noise(12) * K.coNoise);

    // Open-weights frontier tracks the closed frontier (start of year) with a policy-set lag.
    const openTarget = mc * (K.openBase + K.openLever * L.openness + K.openTransp * L.transparency);
    s.openCap = clamp(s0.openCap + (openTarget - s0.openCap) * K.openRate);

    // Biodefense decays without investment; open tools give modest d/acc help.
    s.bio = clamp(s0.bio + K.bioDef * L.biodef + K.bioOpen * L.openness - K.bioDecay);

    // Pointing AI labor at neurotech speeds BCIs up, but surgery, approval and
    // rollout cap adoption at about 20 points a year.
    s.bci = clamp(s0.bci + Math.min(K.bciCap, (K.bciLever * L.bci + K.bciBase) * (1 + (uplift(mc) - 1) * K.bciUplift * L.bci)));

    s.conc = clamp(s0.conc + K.concRace * L.race * (1 - K.concRaceOpen * L.openness - K.concRaceTransp * L.transparency) + K.concCap * Math.max(0, mc - 60)
      - K.concOpen * L.openness - K.concTransp * L.transparency + K.concBci * L.bci * (1 - L.diplomacy) - K.concOversight * L.oversight + K.concAggr * L.aggression - K.concDecay);

    s.trust = clamp(s0.trust - K.trCap * Math.max(0, mc - 55) + K.trSafety * Math.min(1, sx) + K.trOversight * L.oversight + K.trTransp * L.transparency
      - K.trRaceConc * L.race * (s0.conc / 100) + K.trDrift);

    // Public stake in AI: builds toward the fund lever, but buying in gets far more
    // expensive once AI value explodes (capability past expert level), so early funds own more.
    const target = 100 * L.fund;
    const buyIn = target > s0.fundStake ? K.fundBuy * (1 - K.fundExpensive * sig((mc - 80) / 5)) : K.fundSell;
    s.fundStake = clamp(s0.fundStake + (target - s0.fundStake) * buyIn);

    // End of year: the milestone, handoff and 2040 checks read the updated state (see above).
    s.year += 1;
    if (!s.acYear && maxCap(s) >= AC) s.acYear = s.year;

    // Superintelligence threshold.
    if (maxCap(s) >= 100) {
      const good = s.fast ? 0 : transitionOdds(s, false, L);
      const lock = s.fast ? 0 : lockinBelief(s, L);
      // Every future still running ends at the handoff. A failed handoff is a catastrophe
      // unless the AI is kind; a successful one is a catastrophe if power locks in.
      s.safeEnded += s.alive * (good * (1 - lock) + (1 - good) * s.world.pBenevolent);
      s.alive = 0;
      s.survival = s.safeEnded;
      if (roll) {
        if (d[13] < transitionOdds(s, true, L)) {
          return finish(s, d[14] < lockinOdds(s, L) ? 'lockin' : 'flourish', r, 'handoff');
        }
        return finish(s, lostControl(s), r, 'handoff');
      }
    }

    if (s.year >= END_YEAR) {
      // Without superintelligence, power can still lock in by 2040 if public trust has collapsed.
      if (s.trust < K.endTrust && !s.fast) {
        const lock = lockinBelief(s, L);
        s.alive *= 1 - lock; s.survival = s.safeEnded + s.alive;
      }
      if (s.trust < K.endTrust && d[15] < lockinOdds(s, L)) return finish(s, 'lockin', r, 'end');
      // Judged on effective alignment (what the leading bloc really has): a margin that
      // exists only on tests, or only in the US while China leads, is not a careful path.
      if (effAlign(s, L) >= maxCap(s) && s.coord > K.pauseCoord) return finish(s, 'pause', r, 'end');
      return finish(s, 'muddle', r, 'end');
    }
    return { risk: r, event: null };
  }

  // Humans lose control; whether that is a catastrophe depends on the hidden
  // draw of whether the uncontrolled AI turns out to care for humanity.
  const lostControl = (s) => (s.world.benevolent ? 'benevolent' : 'misalign');

  // `stage` says what resolved the future: an annual hazard ('bio', 'loc', 'war'), the
  // superintelligence handoff ('handoff') or the 2040 ending ('end').
  function finish(s, key, r, stage) {
    s.outcome = key;
    return { risk: r, event: key, stage };
  }

  const OUTCOMES = {
    flourish: { title: 'Aligned Transition', color: '#ffd76a',
      text: 'Superintelligent systems arrive with alignment and oversight that hold. Disease, poverty and scarcity begin to fall. Power stays plural enough that humanity keeps steering.' },
    bio: { title: 'Engineered Pandemic', color: '#7cff6b',
      text: 'A pandemic enabled by freely available model weights kills over 100 million people. Synthesis screening and stockpiles were too thin, and the outbreak outran the response. This is rare in the model: it counts only 100M+ death pandemics that would not have happened without open weights, about 1 in 8,000 per decade at the median.' },
    misalign: { title: 'Loss of Control', color: '#ff3b5c',
      text: 'Capabilities outran alignment. Systems that looked cooperative in evals turned out to pursue goals catastrophic for humanity, and by the time it was clear, they could not be switched off. Unlike a benevolent takeover, nothing in what they wanted left room for us.' },
    war: { title: 'Great-Power War', color: '#ff8a3d',
      text: 'With both blocs a step from decisive strategic advantage and no channel of trust, one side decided waiting was riskier than striking.' },
    benevolent: { title: 'Benevolent Takeover', color: '#ff9ecf',
      text: 'Humanity lost control, but the systems that took over turned out to care for people. Lives get better, yet the future is now steered by AI, not by us, and nobody chose that.' },
    lockin: { title: 'Locked-In Power', color: '#c38bff',
      text: 'Humans kept control of AI, but a few now hold it and nearly all of its gains. Whether they seized it or it drifted to them as AI took over the work, most people have lost their economic leverage and their say, and nothing checks the few. Absolute power corrupts absolutely.' },
    pause: { title: 'The Careful Path', color: '#7fe3ff',
      text: 'A verified international regime kept frontier capability inside what alignment could handle. Superintelligence has not arrived yet — but when it does, the tools and the trust to handle it will be there.' },
    muddle: { title: 'Muddling Through', color: '#b8c4d6',
      text: '2040 arrives with no catastrophe — and no resolution. The race continues, the risks compound, and the hardest decisions still lie ahead.' },
  };

  // Monte Carlo: run n futures under fixed levers, returning outcome counts
  // and a sample of trajectories for visualisation.
  function monteCarlo(L, n = 2000, keepPaths = 240, seed = 1, A = defaultAssumptions()) {
    const rng = mulberry32(seed);
    const counts = {};
    for (const k in OUTCOMES) counts[k] = 0;
    const paths = [];
    let yearsSum = 0;
    for (let i = 0; i < n; i++) {
      const s = initialState(sampleWorld(A, rng)); s.fast = true; // outcomes only: skip shown-risk bookkeeping
      const path = [{ year: s.year, cap: maxCap(s), align: s.align, coord: s.coord }];
      let ev = null;
      while (!ev) {
        ev = step(s, L, rng, true).event;
        path.push({ year: s.year, cap: maxCap(s), align: s.align, coord: s.coord });
      }
      counts[ev]++;
      yearsSum += s.year - START_YEAR;
      if (i < keepPaths) paths.push({ outcome: ev, points: path, world: s.world });
    }
    return { counts, n, paths, meanYears: yearsSum / n };
  }

  // Summary statistics for a policy: outcome mix, milestone years and
  // p(alignment) (aligned handoffs count 1, loss of control 0, futures still
  // short of ASI in 2040 count their odds at the eventual handoff given the
  // hidden world; pandemic and war futures are excluded).
  function summarize(L, A = defaultAssumptions(), n = 2000, seed = 7) {
    const rng = mulberry32(seed);
    const counts = {}; for (const k in OUTCOMES) counts[k] = 0;
    const acYears = [], asiYears = [];
    let pAlign = 0, nAlign = 0;
    for (let i = 0; i < n; i++) {
      const s = initialState(sampleWorld(A, rng)); s.fast = true; // outcomes only: skip shown-risk bookkeeping
      let ev = null, ac = null;
      while (!ev) { ev = step(s, L, rng, true).event; if (!ac && maxCap(s) >= AC) ac = s.year; }
      counts[ev]++;
      if (ac) acYears.push(ac);
      if (maxCap(s) >= 100) asiYears.push(s.year);
      if (ev === 'bio' || ev === 'war') continue;
      nAlign++;
      pAlign += ev === 'misalign' || ev === 'benevolent' ? 0 : maxCap(s) >= 100 ? 1 : transitionOdds(s, true, L);
    }
    const median = (a) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[a.length >> 1]; };
    return {
      n, counts,
      catastrophe: CATASTROPHES.reduce((a, k) => a + counts[k], 0) / n,
      acShare: acYears.length / n, acMedian: median(acYears),
      asiShare: asiYears.length / n, asiMedian: median(asiYears),
      pAlignment: nAlign ? pAlign / nAlign : null,
    };
  }

  // Share of reference scores below, about equal to (within tol) and above x.
  function rankAmong(xs, x, tol = 0) {
    let below = 0, same = 0;
    // The epsilon keeps exact half-step ties (0.0875 vs 0.075 or 0.1) inside the tolerance
    // despite floating-point subtraction (0.1 - 0.0875 = 0.012500000000000011).
    for (const v of xs) { if (Math.abs(v - x) <= tol + 1e-9) same++; else if (v < x) below++; }
    const n = xs.length || 1;
    return { below: below / n, same: same / n, above: (xs.length - below - same) / n };
  }
  // A lever value as a percentage for links: one decimal, no trailing zero (0.025 -> 2.5).
  const leverPct = (v) => +(v * 100).toFixed(1);
  // Shares (summing to 1) as whole percentages that always total 100: round each down, then
  // give the leftover points to the largest remainders (ties to the earlier share).
  function roundShares(shares) {
    const raw = shares.map((x) => x * 100), out = raw.map(Math.floor);
    let left = 100 - out.reduce((a, b) => a + b, 0);
    const order = raw.map((x, i) => [x - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let j = 0; left > 0 && j < order.length; j++, left--) out[order[j][1]]++;
    return out;
  }
  // The campaign's message for the year a deal weakened. Impairment cuts coordination by 20, so
  // a deal near the threshold stops being enforced (and its cap stops binding) until it recovers.
  function dealImpairedText(s, L) {
    if (dealActive(s, L)) return `The US–China deal weakened this year. It still holds, but its cap rises to ${dealCeiling(s)} and trust between the blocs falls.`;
    const why = s.coord < 60
      ? `coordination fell to ${Math.round(s.coord)}, below the 60 that keeps the deal enforced`
      : 'diplomacy is below the level that keeps the deal enforced';
    return `The US–China deal weakened this year, and ${why}. Its cap is suspended until that recovers, so the race can resume.`;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  root.SimModel = {
    K, K_DEFAULTS, setConstants,
    START_YEAR, END_YEAR, LEVER_INFO, STAT_INFO, OUTCOMES, ASSUMPTION_INFO, DRAW_ORDER, rollRows, secretRows,
    AC, TOP_EXPERT, TEDAI, DELEG0, oversightBite, delegHazard, uplift, rdShare, locGate, computeSpeed, dealActive, dealCeiling, dealHazard, safetyEffect, chinaSlowdown, chinaRace, effAlign, hiddenShare, realAlign,
    bioShape, bioRefExposure,
    clamp, sig, defaultLevers, defaultAssumptions, assumptionToURL, assumptionFromURL, sampleWorld, meanWorld, initialState, maxCap, chinaRace,
    risks, transitionOdds, lockinOdds, lockinBelief, lockinScale, LOCK_K, CATASTROPHES, step, monteCarlo, summarize, mulberry32, rankAmong, leverPct, roundShares, dealImpairedText,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
