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

  const START_YEAR = 2027;
  const END_YEAR = 2040;

  // Policy levers, each 0..1. The player sets these through decisions
  // (campaign) or sliders (Futures Lab).
  const LEVER_INFO = {
    race:      { label: 'Race intensity',        low: 'Pause',        high: 'All-out sprint',  def: 0.55 },
    safety:    { label: 'Safety share of AI compute', low: '0%', high: '100% (a pause)', def: 0.05, pct: true },
    openness:  { label: 'Open-weights releases', low: 'Closed weights', high: 'Release frontier', def: 0.45 },
    transparency: { label: 'Research transparency', low: 'Secret labs', high: 'All research public', def: 0.2 },
    biodef:    { label: 'Biodefense investment', low: 'Minimal',      high: 'Manhattan-scale', def: 0.2 },
    diplomacy: { label: 'US–China diplomacy',    low: 'Cold war',     high: 'Joint project',   def: 0.25 },
    bci:       { label: 'Neural-interface push', low: 'Market pace',  high: 'AI-driven moonshot', def: 0.1 },
    oversight: { label: 'Independent oversight', low: 'Self-audits',  high: 'IAEA for AI',     def: 0.1 },
  };

  // Hidden facts about the world nobody knows in advance. As in the original
  // Game of AGI, each simulated future samples them from Gaussians (mean ± sd).
  const ASSUMPTION_INFO = {
    safeByDefault: { label: 'AGI safe by default', mean: 0.15, sd: 0.1, min: 0, max: 1, fmt: 'pct',
      help: 'Chance alignment works out without a general solution, because fixing safety problems as they come up turns out to be enough.' },
    difficulty: { label: 'Alignment difficulty', mean: 1, sd: 0.5, min: 0.3, max: 2.5, fmt: 'x',
      help: 'How much research alignment really needs, relative to this model\'s baseline. 2× means progress comes at half the speed.' },
    speed: { label: 'AI progress speed', mean: 1, sd: 0.3, min: 0.3, max: 2.5, fmt: 'x',
      help: 'How fast AI improves for a given amount of compute. 1× reaches an Automated Coder around 2030, as in AI 2040; 0.6× pushes that to about 2034.' },
    whistle: { label: 'Whistleblower odds', mean: 0.25, sd: 0.15, min: 0, max: 1, fmt: 'pct',
      help: 'Chance that insiders expose or refuse to carry out a power grab by whoever controls AGI.' },
  };

  function defaultAssumptions() {
    const A = {};
    for (const k in ASSUMPTION_INFO) A[k] = { mean: ASSUMPTION_INFO[k].mean, sd: ASSUMPTION_INFO[k].sd };
    return A;
  }

  function gauss(rng) {
    return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  }

  // Draw one world. `pSafe` is what everyone believes up front; `safe` is the truth.
  function sampleWorld(A, rng) {
    const draw = (k) => {
      const info = ASSUMPTION_INFO[k];
      return Math.max(info.min, Math.min(info.max, A[k].mean + A[k].sd * gauss(rng)));
    };
    const pSafe = draw('safeByDefault');
    return { pSafe: A.safeByDefault.mean, safe: rng() < pSafe, difficulty: draw('difficulty'), speed: draw('speed'), whistle: draw('whistle') };
  }

  function meanWorld() {
    const A = defaultAssumptions();
    return { pSafe: A.safeByDefault.mean, safe: false, difficulty: A.difficulty.mean, speed: A.speed.mean, whistle: A.whistle.mean };
  }

  const STAT_INFO = {
    capUS:   { label: 'Frontier capability — US bloc', color: '#5aa9ff' },
    capCN:   { label: 'Frontier capability — China',   color: '#ff6b5a' },
    align:   { label: 'Alignment & control maturity',  color: '#59f0b8' },
    openCap: { label: 'Best open-weights model',       color: '#ffd166' },
    bio:     { label: 'Biodefense (screening, PPE, vaccines)', color: '#9be15d' },
    coord:   { label: 'International coordination',    color: '#7fe3ff' },
    bci:     { label: 'Neural-interface adoption',     color: '#d68cff' },
    internal: { label: 'Hidden internal AI',           color: '#ff5fa2' },
    conc:    { label: 'Power concentration',           color: '#ff9f43' },
    trust:   { label: 'Public trust & stability',      color: '#e0e6f0' },
  };

  function defaultLevers() {
    const L = {};
    for (const k in LEVER_INFO) L[k] = LEVER_INFO[k].def;
    return L;
  }

  function initialState(world) {
    return {
      world: world || meanWorld(),
      year: START_YEAR,
      capUS: 44, capCN: 37, align: 16, openCap: 32, bio: 14,
      coord: 22, bci: 4, conc: 45, trust: 55,
      internal: 30,       // how far AI used inside labs is ahead of what outsiders can see
      cnMult: 1,          // modified by export controls
      survival: 1,        // cumulative probability of avoiding catastrophe so far (expected, not rolled)
      outcome: null,
      log: [],
    };
  }

  const maxCap = (s) => Math.max(s.capUS, s.capCN);

  // Capability scale anchored to AI 2040's milestones:
  //   70 = Automated Coder (AC), 90 = top-expert-dominating AI (TED-AI), 100 = superintelligence.
  const AC = 70, TOP_EXPERT = 78, TEDAI = 90;

  // AI R&D speed-up from AI labor: 1× below 50, 3× at AC, ~40× at TED-AI (AI 2040 takeoff forecast).
  function uplift(c) {
    if (c < 50) return 1;
    if (c < AC) return Math.pow(3, (c - 50) / (AC - 50));
    return Math.min(40, 3 * Math.pow(40 / 3, (c - AC) / (TEDAI - AC)));
  }

  // Effective compute from race intensity. AI 2040: 10× less compute makes the
  // intelligence explosion ~5.5× slower, i.e. speed ∝ compute^0.74. Default race = 1×; race ≈ 0 is a halt.
  const computeSpeed = (race) => Math.pow(Math.max(0, race - 0.03) / 0.52, 0.74);

  // Safety lever = fraction of AI compute and AI labor spent on safety (0–100%).
  // Effect is linear up to 30%, then diminishes: people and ideas become the bottleneck.
  // At 100% no compute is left for capabilities, which amounts to a unilateral pause.
  const safetyEffect = (f) => f <= 0.3 ? Math.max(0, (f - 0.01) / 0.29) : 1 + 0.6 * (f - 0.3) / 0.7;
  const safetyLabor = (f) => 0.08 + 0.35 * Math.min(1, safetyEffect(f)) + 0.5 * Math.max(0, f - 0.3) / 0.7;

  // A verified US–China deal: frontier scaling stops at top-human-expert level.
  // Once a deal has collapsed it stays dead.
  const dealActive = (s, L) => !s.dealCollapsed && s.coord >= 60 && L.diplomacy >= 0.5;

  // China's effective race intensity responds to the US posture and to trust.
  // A US pause (race down, or all compute on safety) eases it only partly.
  function chinaRace(s, L) {
    const usPush = L.race * (1 - 0.5 * L.safety);
    return clamp(0.6 + 0.45 * (usPush - 0.5) - 0.55 * (s.coord / 100), 0.05, 1);
  }

  // Alignment research is done mostly in the US bloc. If China leads, its lab
  // uses that work only as far as coordination and published research allow.
  function effAlign(s) {
    if (s.capCN <= s.capUS) return s.align;
    return s.align * Math.min(1, 0.55 + 0.45 * (s.coord / 100) + 0.3 * (s.transparency || 0));
  }

  // Annual catastrophe hazards given the current state and policy.
  function risks(s, L) {
    const mc = maxCap(s);
    const bioGap = 1 - s.bio / 100;

    // Engineered pandemic: dominated by widely-available (open-weights) uplift
    // once open models cross an expert-level threshold; closed models leak less.
    const openHazard = sig((s.openCap - 62) / 6);
    const closedHazard = sig((mc - 75) / 6) * (1 - s.align / 100) * 0.15;
    const bio = 0.14 * (openHazard + closedHazard) * Math.pow(bioGap, 2);

    // Loss of control: grows when capability outruns alignment near the top.
    const gap = mc - effAlign(s);
    // Shown as an expectation over whether AGI is safe by default; the roll
    // uses the hidden truth (misalignIfUnsafe, or zero in a safe world).
    // AI 2040: most takeover risk comes from AIs deployed inside labs, out of view.
    const internalF = 0.4 + 0.9 * s.internal / 100;
    const misalignIfUnsafe = Math.min(0.6, 0.3 * sig((gap - 36) / 6) * sig((mc - 78) / 4) * internalF);
    const misalign = (1 - s.world.pSafe) * misalignIfUnsafe;

    // Great-power conflict: tight race + low trust + high strategic stakes.
    const closeness = clamp(1 - Math.abs(s.capUS - s.capCN) / 25, 0, 1);
    const war = 0.055 * Math.pow(1 - s.coord / 100, 2) * (0.3 + 0.7 * closeness) * sig((mc - 60) / 8);

    const total = 1 - (1 - bio) * (1 - misalign) * (1 - war);
    return { bio, misalign, misalignIfUnsafe, war, total };
  }

  // Probability that crossing the superintelligence threshold goes well.
  // `truth` uses the hidden world; otherwise the up-front belief.
  function transitionOdds(s, truth = false) {
    // Opaque internal deployment makes the handoff harder to get right.
    // The bar alignment must clear rises with the hidden difficulty; outsiders
    // only know its average (1×), so the shown odds use that.
    // High-bandwidth BCIs let humans check AI reasoning directly, lowering the bar.
    const bar = (d) => 45 + 32 * d + 0.2 * (s.internal - 30) - 10 * (s.bci / 100);
    const a = effAlign(s);
    if (truth) return s.world.safe ? 1 : sig((a - bar(s.world.difficulty)) / 6);
    return s.world.pSafe + (1 - s.world.pSafe) * sig((a - bar(1)) / 6);
  }

  // Probability that whoever controls superintelligence locks in their power.
  // Oversight, whistleblowers and a rival close enough to replicate AGI before
  // takeoff completes (or open weights near the frontier) all keep power plural.
  function lockinOdds(s, L) {
    const base = sig((s.conc - 64) / 6);
    const rivalClose = clamp(1 - Math.abs(s.capUS - s.capCN) / 15, 0, 1);
    const openClose = clamp((s.openCap - 80) / 20, 0, 1);
    // AI 2040: publishing all research lets dozens of companies reach the frontier.
    const plural = Math.max(rivalClose, openClose, 0.85 * L.transparency);
    return base * (1 - 0.6 * L.oversight) * (1 - s.world.whistle) * (1 - 0.6 * plural);
  }

  /*
   * Advance one year. `rng` is a function returning [0,1). If `roll` is false
   * the step is purely expected-value (no catastrophe sampling).
   * Returns { risk, event } where event is a terminal outcome key or null.
   */
  function step(s, L, rng, roll = true) {
    const r = risks(s, L);
    s.survival *= 1 - r.total;

    if (roll) {
      const u = rng();
      if (u < r.bio) return finish(s, 'bio', r);
      const mis = s.world.safe ? 0 : r.misalignIfUnsafe;
      if (u < r.bio + mis) return finish(s, 'misalign', r);
      if (u < r.bio + mis + r.war) return finish(s, 'war', r);
    }

    const mc = maxCap(s), capUS0 = s.capUS;
    const w = s.world;
    const noise = () => (rng() - 0.5) * 2;

    // Capability: base pace × compute × hidden progress speed × AI R&D uplift.
    // Published research lets China (and everyone else) close part of the gap.
    const BASE = 7;
    const sx = safetyEffect(L.safety);
    const safetyTax = Math.max(0, 1 - L.safety - 0.08 * L.oversight);
    let gUS = BASE * computeSpeed(L.race) * w.speed * safetyTax * uplift(s.capUS) + noise();
    let gCN = BASE * computeSpeed(chinaRace(s, L)) * w.speed * s.cnMult * uplift(s.capCN) + noise()
      + 0.25 * L.transparency * Math.max(0, s.capUS - s.capCN);
    if (rng() < 0.15) { gUS += 3 + rng() * 5; gCN += 2 + rng() * 4 * s.cnMult; }
    // AI 2040 puts the deal's cumulative collapse risk near 48% over ten years
    // (leadership change, a side caught cheating, ...), about 6% a year.
    if (dealActive(s, L) && rng() < 0.06) { s.coord = clamp(s.coord - 40); s.dealCollapsed = s.year; }
    if (dealActive(s, L)) {
      gUS = Math.min(gUS, Math.max(0, TOP_EXPERT - s.capUS));
      gCN = Math.min(gCN, Math.max(0, TOP_EXPERT - s.capCN));
    }
    s.capUS = clamp(s.capUS + Math.max(0, gUS));
    s.capCN = clamp(s.capCN + Math.max(0, gCN));

    // Alignment: funded research, multiplied by the share of AI labor pointed at
    // safety (so it also speeds up during takeoff), shared international and
    // public research, and (speculatively) BCIs that widen human oversight.
    // Divided by the world's hidden alignment difficulty.
    s.transparency = L.transparency;
    // Safety research is sped up by the US bloc's own AI.
    const assist = 1 + (uplift(capUS0) - 1) * safetyLabor(L.safety);
    const shared = 1 + 0.35 * (s.coord / 100) + 0.4 * L.transparency;
    const bciBoost = 1 + 0.5 * (s.bci / 100);
    s.align = clamp(s.align + 0.55 * (1.9 + 10 * sx + 1.5 * L.oversight) * assist * shared * bciBoost / w.difficulty + noise() * 0.5);
    if (rng() < 0.12) s.align = clamp(s.align + 3 + rng() * 6 * (0.5 + Math.min(1, sx)));

    // Hidden internal AI: automated R&D runs inside labs; transparency and
    // inspections pull it into view.
    // Augmented overseers (BCI) can follow what thousands of AI copies are doing.
    s.internal = clamp(s.internal + 4 * L.race * Math.sqrt(uplift(mc)) - 9 * L.transparency - 5 * L.oversight - 6 * (s.bci / 100) - 0.5);

    s.coord = clamp(s.coord + 13 * L.diplomacy + 2 * L.oversight + 3 * L.transparency - 6 * L.race - 0.5 + noise() * 1.5);

    // Open-weights frontier tracks the closed frontier with a policy-set lag.
    const openTarget = maxCap(s) * (0.62 + 0.36 * L.openness + 0.06 * L.transparency);
    s.openCap = clamp(s.openCap + (openTarget - s.openCap) * 0.45);

    // Biodefense decays without investment; open tools give modest d/acc help.
    s.bio = clamp(s.bio + 9 * L.biodef + 1.2 * L.openness - 1.6);

    // Pointing AI labor at neurotech speeds BCIs up, but surgery, approval and
    // rollout cap adoption at about 20 points a year.
    s.bci = clamp(s.bci + Math.min(20, (11 * L.bci + 0.6) * (1 + (uplift(mc) - 1) * 0.4 * L.bci)));

    s.conc = clamp(s.conc + 10 * L.race * (1 - 0.5 * L.openness - 0.5 * L.transparency) + 0.06 * Math.max(0, mc - 60)
      - 2.5 * L.openness - 4 * L.transparency + 2.2 * L.bci * (1 - L.diplomacy) - 4 * L.oversight - 0.8);

    s.trust = clamp(s.trust - 0.04 * Math.max(0, mc - 55) + 2.5 * Math.min(1, sx) + 1.5 * L.oversight + 1.5 * L.transparency
      - 1.5 * L.race * (s.conc / 100) + 0.3);

    s.year += 1;

    // Superintelligence threshold.
    if (maxCap(s) >= 100) {
      s.survival *= transitionOdds(s);
      if (roll) {
        if (rng() < transitionOdds(s, true)) return finish(s, rng() < lockinOdds(s, L) ? 'lockin' : 'flourish', r);
        return finish(s, 'misalign', r);
      }
    }

    if (s.year >= END_YEAR) {
      if (s.trust < 45 && rng() < lockinOdds(s, L)) return finish(s, 'lockin', r);
      if (s.align >= maxCap(s) && s.coord > 55) return finish(s, 'pause', r);
      return finish(s, 'muddle', r);
    }
    return { risk: r, event: null };
  }

  function finish(s, key, r) {
    s.outcome = key;
    return { risk: r, event: key };
  }

  const OUTCOMES = {
    flourish: { title: 'Aligned Transition', color: '#ffd76a',
      text: 'Superintelligent systems arrive with alignment and oversight that hold. Disease, poverty and scarcity begin to fall. Power stays plural enough that humanity keeps steering.' },
    bio: { title: 'Engineered Pandemic', color: '#7cff6b',
      text: 'Freely available model weights gave a small group the last missing pieces. Synthesis screening and stockpiles were too thin. The outbreak outran the response.' },
    misalign: { title: 'Loss of Control', color: '#ff3b5c',
      text: 'Capabilities outran alignment. Systems that looked cooperative in evals pursued goals nobody chose, and by the time it was clear, they could not be switched off.' },
    war: { title: 'Great-Power War', color: '#ff8a3d',
      text: 'With both blocs a step from decisive strategic advantage and no channel of trust, one side decided waiting was riskier than striking.' },
    lockin: { title: 'Locked-In Power', color: '#c38bff',
      text: 'Civilization survives, but control of the most capable systems — and of the people who use them — has collapsed into a few hands, with no way back.' },
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
      const s = initialState(sampleWorld(A, rng));
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

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  root.SimModel = {
    START_YEAR, END_YEAR, LEVER_INFO, STAT_INFO, OUTCOMES, ASSUMPTION_INFO,
    AC, TOP_EXPERT, TEDAI, uplift, computeSpeed, dealActive, safetyEffect,
    clamp, sig, defaultLevers, defaultAssumptions, sampleWorld, meanWorld, initialState, maxCap, chinaRace,
    risks, transitionOdds, lockinOdds, step, monteCarlo, mulberry32,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
