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
    race:      { label: 'Race intensity',        low: 'Pause',        high: 'All-out sprint',  def: 0.7 },
    safety:    { label: 'Safety share of AI compute', low: '0%', high: '100% (a pause)', def: 0.05, pct: true },
    openness:  { label: 'Open-weights releases', low: 'Closed weights', high: 'Release frontier', def: 0.45 },
    transparency: { label: 'Research transparency', low: 'Secret labs', high: 'All research public', def: 0.2 },
    biodef:    { label: 'Biodefense investment', low: 'Minimal',      high: 'Manhattan-scale', def: 0.2 },
    diplomacy: { label: 'US–China diplomacy',    low: 'Cold war',     high: 'Joint project',   def: 0.25 },
    bci:       { label: 'Neural-interface push', low: 'Market pace',  high: 'AI-driven moonshot', def: 0.1 },
    oversight: { label: 'Independent oversight', low: 'Self-audits',  high: 'IAEA for AI',     def: 0.1 },
    aggression: { label: 'Sabotage of China\'s AI', low: 'None',     high: 'Cyber + kinetic strikes', def: 0 },
  };

  // Hidden facts about the world nobody knows in advance. As in the original
  // Game of AGI, each simulated future samples them from Gaussians (mean ± sd).
  const ASSUMPTION_INFO = {
    // Ease of alignment = 1 / difficulty. Lognormal, set in log10 units: median
    // 10^mean, spread ×10^sd. Calibrated to AI 2040's p(alignment) estimates.
    ease: { label: 'Ease of alignment', mean: 0.1, sd: 0.4, min: -0.6, max: 0.7, fmt: 'logx',
      help: 'How easy alignment turns out to be. Easy enough (above 3.3×), fixing safety problems as they come up leads to long-term alignment without a general solution, and loss of control cannot happen. At 1× alignment needs this model\'s baseline research; at 0.5× progress comes at half the speed.' },
    speed: { label: 'AI progress speed', mean: 1, sd: 0.3, min: 0.3, max: 2.5, fmt: 'x',
      help: 'How fast AI improves for a given amount of compute. 1× reaches an Automated Coder around 2030, as in AI 2040; 0.6× pushes that to about 2031 and superintelligence to about 2033.' },
    benevolent: { label: 'Kind even if uncontrolled', mean: 0.1, sd: 0.08, min: 0, max: 1, fmt: 'pct',
      help: 'If humans lose control anyway, the chance the AI still cares for humanity. The future is then steered by AI, kindly, instead of by people (Benevolent Takeover).' },
    whistle: { label: 'Whistleblower odds', mean: 0.25, sd: 0.15, min: 0, max: 1, fmt: 'pct',
      help: 'Chance that insiders expose or refuse to carry out a power grab by whoever controls AGI.' },
    // Lognormal, set in log10 units. Calibrated to a separate factored Monte Carlo
    // decomposition: decade median 1.2e-4, 95% interval ~5e-7 to ~3e-2,
    // P(>1%) ≈ 5.5%, P(>10%) ≈ 0.7%. That is median 10^-3.92 with a log10 sd of about 1.2.
    bioDecade: { label: 'Open-weights bio risk per decade', mean: -3.92, sd: 1.2, min: -7, max: -1, fmt: 'log',
      help: 'Chance that open-weights models enable a pandemic killing 100M+ people within ten years, on the default path for open models and biodefense. Policy scales it up or down from there.' },
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
  function sampleWorld(A, rng, skipBio = false) {
    const draw = (k) => {
      const info = ASSUMPTION_INFO[k];
      return Math.max(info.min, Math.min(info.max, A[k].mean + A[k].sd * gauss(rng)));
    };
    const dd = diffDistOf(A);
    const difficulty = Math.min(5, Math.max(0.1, Math.pow(10, dd.mean + dd.sd * gauss(rng))));
    const w = Object.assign({ difficulty, speed: draw('speed'), whistle: draw('whistle') }, difficultyWorld(difficulty, dd));
    const pBen = draw('benevolent');
    Object.assign(w, { pBenevolent: A.benevolent.mean, benevolent: rng() < pBen });
    // Bio: the decade risk is unclamped in log space (the tails are the point), capped below 1.
    const bioDecade = Math.min(0.99, Math.pow(10, A.bioDecade.mean + A.bioDecade.sd * gauss(rng)));
    if (skipBio) return w;
    return Object.assign(w, bioWorld(bioDecade, A.bioDecade));
  }

  // The same world without its bio draw (bio hazard off): used to measure exposure.
  function sampleBaseWorld(A, rng) {
    const w = sampleWorld.call(null, A, rng, true);
    return Object.assign(w, { bioDecade: 0, bioScale: 0, bioBelief: 0 });
  }

  function meanWorld() {
    const A = defaultAssumptions();
    const dd = diffDistOf(A), d = Math.pow(10, dd.mean);
    return Object.assign({ difficulty: d, speed: A.speed.mean, whistle: A.whistle.mean,
      pBenevolent: A.benevolent.mean, benevolent: false }, difficultyWorld(d, dd),
      bioWorld(Math.pow(10, A.bioDecade.mean), A.bioDecade));
  }

  // Loss-of-control exposure from alignment difficulty: none below 0.3× (aligned
  // by default), full above 0.8×. `hazardBelief` and `pSafe` are expectations
  // over the difficulty distribution, used for what players are shown.
  // Internally the model works with difficulty δ = 1 / ease (log10 δ = -log10 ease).
  const diffDistOf = (A) => ({ mean: -A.ease.mean, sd: A.ease.sd });
  const lossHazard = (d) => clamp((d - 0.3) / 0.5, 0, 1);
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
    const pSafe = dist.sd > 0 ? normCdf((Math.log10(0.3) - dist.mean) / dist.sd) : (Math.pow(10, dist.mean) <= 0.3 ? 1 : 0);
    return { hazard: lossHazard(d), safe: d <= 0.3, hazardBelief: hb, pSafe, diffDist: { mean: dist.mean, sd: dist.sd } };
  }

  // Turn a decade bio risk into a hazard scale k = -ln(1 - R) / G_ref, where G_ref is
  // the bio exposure default-path futures actually go through in 2027–2036 (summed
  // until each future ends: most end at the superintelligence handoff). So on the
  // default path a world's realized decade risk is about its drawn R; other policies
  // scale with bioShape. `bioBelief` is the expected scale over the unknown, used for
  // the risk shown to players (the dice use the hidden draw).
  function bioWorld(decade, dist) {
    const ref = bioRefExposure();
    let belief = 0;
    for (let i = 0; i < 81; i++) {
      const z = -4 + i * 0.1, wgt = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * 0.1;
      belief += wgt * -Math.log(1 - Math.min(0.99, Math.pow(10, dist.mean + dist.sd * z)));
    }
    return { bioDecade: decade, bioScale: -Math.log(1 - decade) / ref, bioBelief: belief / ref };
  }

  // Relative bio hazard of a state: open-weights uplift (dominant once open models
  // pass expert level) times how much biodefense (synthesis screening, surveillance,
  // stockpiles) is missing. Closed-model and state-program pandemics are treated as
  // negligible: states are deterred, and closed models keep capabilities away from
  // rogue actors (see Superintelligence Strategy, nationalsecurity.ai).
  function bioShape(s) {
    return sig((s.openCap - 62) / 6) * Math.pow(1 - s.bio / 100, 2);
  }

  // Mean bio exposure over 2027–2036 that default-path futures actually go through,
  // from a fixed-seed sample of worlds with the bio hazard switched off.
  let BIO_REF = null;
  function bioRefExposure() {
    if (BIO_REF !== null) return BIO_REF;
    const rng = mulberry32(2027), A = defaultAssumptions(), L = defaultLevers(), n = 3000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const s = initialState(sampleBaseWorld(A, rng));
      for (let y = 0; y < 10 && !s.outcome; y++) { sum += bioShape(s); step(s, L, rng, true); }
    }
    BIO_REF = sum / n;
    return BIO_REF;
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
  // intelligence explosion ~5.5× slower, i.e. speed ∝ compute^0.74. Race 0.55 = 1× (the default
  // race 0.7 is about 1.2×); race ≈ 0 is a halt.
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
  // The discount phases in smoothly as China moves from even to clearly ahead.
  function effAlign(s, L) {
    const share = Math.min(1, 0.55 + 0.45 * (s.coord / 100) + 0.3 * (L ? L.transparency : 0));
    const chinaLeads = sig((s.capCN - s.capUS) / 3);
    return s.align * (1 - chinaLeads * (1 - share));
  }

  // Annual catastrophe hazards given the current state and policy.
  function risks(s, L) {
    const mc = maxCap(s);
    // Engineered pandemic (100M+ deaths): shown as the expectation over the
    // unknown decade risk; the dice use this world's hidden draw (bioTrue).
    const shape = bioShape(s);
    const bio = 1 - Math.exp(-s.world.bioBelief * shape);
    const bioTrue = 1 - Math.exp(-s.world.bioScale * shape);

    // Loss of control: grows when capability outruns alignment near the top.
    const gap = mc - effAlign(s, L);
    // Scaled by how hard alignment is: zero in worlds where it is easy by
    // default. Shown as the expectation over difficulty; the roll uses the truth.
    // AI 2040: most takeover risk comes from AIs deployed inside labs, out of view.
    const internalF = 0.4 + 0.9 * s.internal / 100;
    const lossBase = 0.3 * sig((gap - 36) / 6) * sig((mc - 78) / 4) * internalF;
    const misalign = s.world.hazardBelief * lossBase;
    const misalignTrue = s.world.hazard * lossBase;

    // Great-power conflict: tight race + low trust + high strategic stakes.
    const closeness = clamp(1 - Math.abs(s.capUS - s.capCN) / 25, 0, 1);
    const stakes = sig((mc - 60) / 8);
    // Sabotage (AI 2040's Plan B) provokes: it raises baseline war risk, and
    // a China falling behind under attack has a reason to strike first.
    const behind = clamp((s.capUS - s.capCN) / 20, 0, 1);
    const war = 0.055 * Math.pow(1 - s.coord / 100, 2) * (0.3 + 0.7 * closeness) * stakes * (1 + 1.5 * L.aggression)
      + 0.07 * L.aggression * (0.4 + 0.6 * behind) * stakes;

    // Hazards are rolled one after another, so they combine as independent risks.
    // `total` counts only catastrophes: losing control to a kind AI is not one.
    const misalignCat = misalign * (1 - s.world.pBenevolent);
    const total = 1 - (1 - bio) * (1 - misalignCat) * (1 - war);
    return { bio, bioTrue, misalign, misalignTrue, war, total };
  }

  // Probability that crossing the superintelligence threshold goes well.
  // `truth` uses the hidden world; otherwise the up-front belief.
  function transitionOdds(s, truth = false, L = null) {
    // Opaque internal deployment makes the handoff harder to get right.
    // The bar alignment must clear rises with the hidden difficulty; outsiders
    // only know its average (1×), so the shown odds use that.
    // High-bandwidth BCIs let humans check AI reasoning directly, lowering the bar.
    const bar = (d) => 45 + 32 * d + 0.2 * (s.internal - 30) - 10 * (s.bci / 100);
    const a = effAlign(s, L);
    if (truth) return s.world.safe ? 1 : sig((a - bar(s.world.difficulty)) / 6);
    let p = 0;
    for (const z of DIFF_Z) {
      const dz = Math.pow(10, s.world.diffDist.mean + s.world.diffDist.sd * z);
      p += zWeight(z) * (dz <= 0.3 ? 1 : sig((a - bar(dz)) / 6));
    }
    return p;
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

    // Every year draws the same fixed set of dice, each with one job, whether or
    // not it is used. Rewinding a campaign and choosing differently then keeps
    // every die of that year (and the next years' draws) the same.
    const d = Array.from({ length: 16 }, () => rng());
    const noise = (i) => (d[i] - 0.5) * 2;

    // Hazards are rolled one after another, so they combine as independent risks.
    if (roll) {
      if (d[0] < r.bioTrue) return finish(s, 'bio', r);
      if (d[1] < r.misalignTrue) return finish(s, lostControl(s), r);
      if (d[2] < r.war) return finish(s, 'war', r);
    }

    const mc = maxCap(s), capUS0 = s.capUS;
    const w = s.world;

    // Capability: base pace × compute × hidden progress speed × AI R&D uplift.
    // Published research lets China (and everyone else) close part of the gap.
    const BASE = 7;
    const sx = safetyEffect(L.safety);
    const safetyTax = Math.max(0, 1 - L.safety - 0.08 * L.oversight);
    // Noise and surprise breakthroughs scale with the compute each side actually
    // spends on capabilities, so a pause (race 0 or all compute on safety) holds.
    const cUS = computeSpeed(L.race) * safetyTax;
    const cCN = computeSpeed(chinaRace(s, L)) * s.cnMult * (1 - 0.35 * L.aggression); // sabotage slows China's labs
    const jUS = Math.min(1.5, cUS), jCN = Math.min(1.5, cCN);
    let gUS = (BASE * w.speed * uplift(s.capUS) + noise(3)) * cUS;
    let gCN = (BASE * w.speed * uplift(s.capCN) + noise(4)) * cCN
      + 0.25 * L.transparency * Math.max(0, s.capUS - s.capCN) * (1 - 0.35 * L.aggression);
    if (d[5] < 0.15) { gUS += (3 + d[6] * 5) * jUS; gCN += (2 + d[7] * 4) * jCN; }
    // AI 2040 puts the deal's cumulative collapse risk near 48% over ten years
    // (leadership change, a side caught cheating, ...), about 6% a year.
    if (dealActive(s, L) && d[8] < 0.06) { s.coord = clamp(s.coord - 40); s.dealCollapsed = s.year; }
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
    // Safety research is sped up by the US bloc's own AI.
    const assist = 1 + (uplift(capUS0) - 1) * safetyLabor(L.safety);
    const shared = 1 + 0.35 * (s.coord / 100) + 0.4 * L.transparency;
    const bciBoost = 1 + 0.5 * (s.bci / 100);
    s.align = clamp(s.align + 0.55 * (1.9 + 10 * sx + 1.5 * L.oversight) * assist * shared * bciBoost / w.difficulty + noise(9) * 0.5);
    if (d[10] < 0.12) s.align = clamp(s.align + 3 + d[11] * 6 * (0.5 + Math.min(1, sx)));

    // Hidden internal AI: automated R&D runs inside labs; transparency and
    // inspections pull it into view.
    // Augmented overseers (BCI) can follow what thousands of AI copies are doing.
    s.internal = clamp(s.internal + 4 * L.race * Math.sqrt(uplift(mc)) - 9 * L.transparency - 5 * L.oversight - 6 * (s.bci / 100) - 0.5);

    s.coord = clamp(s.coord + 13 * L.diplomacy + 2 * L.oversight + 3 * L.transparency - 6 * L.race - 10 * L.aggression - 0.5 + noise(12) * 1.5);

    // Open-weights frontier tracks the closed frontier with a policy-set lag.
    const openTarget = maxCap(s) * (0.62 + 0.36 * L.openness + 0.06 * L.transparency);
    s.openCap = clamp(s.openCap + (openTarget - s.openCap) * 0.45);

    // Biodefense decays without investment; open tools give modest d/acc help.
    s.bio = clamp(s.bio + 9 * L.biodef + 1.2 * L.openness - 1.6);

    // Pointing AI labor at neurotech speeds BCIs up, but surgery, approval and
    // rollout cap adoption at about 20 points a year.
    s.bci = clamp(s.bci + Math.min(20, (11 * L.bci + 0.6) * (1 + (uplift(mc) - 1) * 0.4 * L.bci)));

    s.conc = clamp(s.conc + 10 * L.race * (1 - 0.5 * L.openness - 0.5 * L.transparency) + 0.06 * Math.max(0, mc - 60)
      - 2.5 * L.openness - 4 * L.transparency + 2.2 * L.bci * (1 - L.diplomacy) - 4 * L.oversight + 3 * L.aggression - 0.8);

    s.trust = clamp(s.trust - 0.04 * Math.max(0, mc - 55) + 2.5 * Math.min(1, sx) + 1.5 * L.oversight + 1.5 * L.transparency
      - 1.5 * L.race * (s.conc / 100) + 0.3);

    s.year += 1;

    // Superintelligence threshold.
    if (maxCap(s) >= 100) {
      s.survival *= transitionOdds(s, false, L);
      if (roll) {
        if (d[13] < transitionOdds(s, true, L)) return finish(s, d[14] < lockinOdds(s, L) ? 'lockin' : 'flourish', r);
        return finish(s, lostControl(s), r);
      }
    }

    if (s.year >= END_YEAR) {
      if (s.trust < 45 && d[15] < lockinOdds(s, L)) return finish(s, 'lockin', r);
      if (s.align >= maxCap(s) && s.coord > 55) return finish(s, 'pause', r);
      return finish(s, 'muddle', r);
    }
    return { risk: r, event: null };
  }

  // Humans lose control; whether that is a catastrophe depends on the hidden
  // draw of whether the uncontrolled AI turns out to care for humanity.
  const lostControl = (s) => (s.world.benevolent ? 'benevolent' : 'misalign');

  function finish(s, key, r) {
    s.outcome = key;
    return { risk: r, event: key };
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
      const s = initialState(sampleWorld(A, rng));
      let ev = null, ac = null;
      while (!ev) { ev = step(s, L, rng, true).event; if (!ac && maxCap(s) >= AC) ac = s.year; }
      counts[ev]++;
      if (ac) acYears.push(ac);
      if (maxCap(s) >= 100) asiYears.push(s.year);
      if (ev === 'bio' || ev === 'war') continue;
      nAlign++;
      pAlign += ev === 'misalign' || ev === 'benevolent' ? 0 : maxCap(s) >= 100 ? 1 : transitionOdds(s, true);
    }
    const median = (a) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[a.length >> 1]; };
    return {
      n, counts,
      catastrophe: (counts.bio + counts.misalign + counts.war) / n,
      acShare: acYears.length / n, acMedian: median(acYears),
      asiShare: asiYears.length / n, asiMedian: median(asiYears),
      pAlignment: nAlign ? pAlign / nAlign : null,
    };
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
    bioShape, bioRefExposure,
    clamp, sig, defaultLevers, defaultAssumptions, sampleWorld, meanWorld, initialState, maxCap, chinaRace,
    risks, transitionOdds, lockinOdds, step, monteCarlo, summarize, mulberry32,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
