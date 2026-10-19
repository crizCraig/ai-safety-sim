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
    fund:      { label: 'Public AI wealth fund', low: 'None',         high: 'Public owns most AI', def: 0.05 },
  };

  // Hidden facts about the world nobody knows in advance. As in the original
  // Game of AGI, each simulated future samples them from Gaussians (mean ± sd).
  const ASSUMPTION_INFO = {
    // Ease of alignment = 1 / difficulty. Lognormal, set in log10 units: median
    // 10^mean, spread ×10^sd. Calibrated to AI 2040's p(alignment) estimates.
    ease: { label: 'Ease of alignment', mean: 0.10, sd: 0.4, min: -0.6, max: 0.7, fmt: 'logx',
      help: 'How hard the problem really is: how much real alignment the superintelligence handoff needs. Policy cannot change it. Easy enough (above 3.3×), fixing safety problems as they come up leads to long-term alignment and loss of control cannot happen; at 0.5×, progress comes at half the speed. Compare "Tests overstate alignment", which is about measuring progress, not the problem itself.' },
    // Where the frontier stands at the start of 2027. AI 2040's starting point is 44; Gladstone
    // AI's lab insiders expect recursive self-improvement (AI substantially speeding up AI R&D,
    // which begins at 50 here) within 3-12 months of Oct 2026, i.e. during 2027.
    capNow: { label: 'Current capability', mean: 44, sd: 0, min: 30, max: 62, fmt: 'num',
      marks: [[44, 'AI 2040'], [50, 'RSI 2027']],
      help: 'How capable the best AI is at the start of 2027 (US bloc; China starts 7 points behind). AI starts speeding up its own research at 50, and 70 is an Automated Coder. AI 2040 starts at 44; lab insiders quoted by Gladstone AI expect recursive self-improvement during 2027, which is about 50.' },
    speed: { label: 'AI progress speed', mean: 1, sd: 0.3, min: 0.3, max: 2.5, fmt: 'x',
      help: 'How fast AI improves for a given amount of compute. 1× reaches an Automated Coder around 2030, as in AI 2040; 0.6× pushes that to about 2031 and superintelligence to about 2033.' },
    benevolent: { label: 'Kind even if uncontrolled', mean: 0.1, sd: 0.08, min: 0, max: 1, fmt: 'pct',
      help: 'If humans lose control of AI, the chance it still cares for humanity. The future is then steered by AI, kindly, instead of by people (Benevolent Takeover).' },
    // China's caution, from a review of experts on Chinese AI policy (Concordia AI, Carnegie's
    // Matt Sheehan, SemiAnalysis, CSET translations): real and growing safety research, official
    // "human control" language, but no case of Beijing slowing frontier AI for safety.
    cnAlign: { label: 'China\'s own alignment work', mean: 0.35, sd: 0.17, min: 0, max: 1, fmt: 'pct',
      help: 'How much alignment research China\'s labs do themselves, relative to the US bloc. It fills part of the gap that published US research and coordination do not reach, and China\'s AI speeds this research up as it improves (100% is a serious program, like a US bloc putting 30% of compute on safety). Work on keeping AI loyal to the Party\'s line does not count.' },
    cnCaution: { label: 'China slows near the brink', mean: 0.25, sd: 0.15, min: 0, max: 1, fmt: 'pct',
      help: 'How far China cuts its AI race once there are signs of losing control. It notices later than the US would, slows more if the US slows or a deal is in force, and never slows for fear of concentrated power: an AI that obeys the Party counts as aligned in Beijing.' },
    // Evaluation awareness: current AIs can often tell when they are being tested and behave
    // better then, so measured alignment may overstate the real thing.
    evalGap: { label: 'Tests overstate alignment', mean: 0.15, sd: 0.1, min: 0, max: 0.6, fmt: 'pct',
      help: 'How wrong the measurements are: how far the alignment you see sits above the real level, because AIs can tell when they are being tested and behave better. Policy can change it: independent oversight, published research and safety work expose more of the gap, and secret internal AI hides more. This is why your estimate and the real risk can differ. Compare "Ease of alignment", which is how hard the problem itself is.' },
    whistle: { label: 'Whistleblower odds', mean: 0.25, sd: 0.15, min: 0, max: 1, fmt: 'pct',
      help: 'Chance that insiders expose or refuse to carry out a power grab by whoever controls AGI.' },
    // Lognormal, set in log10 units. Calibrated to a separate factored Monte Carlo
    // decomposition: decade median 1.2e-4, 95% interval ~5e-7 to ~3e-2,
    // P(>1%) ≈ 5.5%, P(>10%) ≈ 0.7%. That is median 10^-3.92 with a log10 sd of about 1.2.
    bioDecade: { label: 'Open-weights bio risk per decade', mean: -3.92, sd: 1.2, min: -7, max: -1, fmt: 'log',
      help: 'Chance that open-weights models enable a pandemic killing 100M+ people within ten years, on the default path for open models and biodefense under the default assumptions. Policy scales it up or down from there.' },
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
    const w = Object.assign({ difficulty, speed: draw('speed'), whistle: draw('whistle'), whistleNodes: clippedNodes(A.whistle, 0, 1).nodes }, difficultyWorld(difficulty, dd));
    const pBen = draw('benevolent');
    Object.assign(w, { pBenevolent: clippedMean(A.benevolent), benevolent: rng() < pBen });
    // Bio: the decade risk is unclamped in log space (the tails are the point), capped below 1.
    const bioDecade = Math.min(0.99, Math.pow(10, A.bioDecade.mean + A.bioDecade.sd * gauss(rng)));
    Object.assign(w, chinaWorld(A, draw('cnAlign'), draw('cnCaution')), evalWorld(A, draw('evalGap')));
    // Drawn last, and only when it has a spread, so the default draws stay identical.
    w.capNow = A.capNow.sd > 0 ? draw('capNow') : A.capNow.mean;
    if (skipBio) return w;
    return Object.assign(w, bioWorld(bioDecade, A.bioDecade));
  }

  // The same world without its bio draw (bio hazard off): used to measure exposure.
  function sampleBaseWorld(A, rng) {
    const w = sampleWorld.call(null, A, rng, true);
    return Object.assign(w, { bioDecade: 0, bioScale: 0, bioNodes: null });
  }

  function meanWorld() {
    const A = defaultAssumptions();
    const dd = diffDistOf(A), d = Math.pow(10, dd.mean);
    return Object.assign({ difficulty: d, speed: A.speed.mean, capNow: A.capNow.mean, whistle: clippedMean(A.whistle), whistleNodes: clippedNodes(A.whistle, 0, 1).nodes,
      pBenevolent: clippedMean(A.benevolent), benevolent: false }, difficultyWorld(d, dd),
      chinaWorld(A, clippedMean(A.cnAlign), clippedMean(A.cnCaution)),
      evalWorld(A, clippedMean(A.evalGap)),
      bioWorld(Math.pow(10, A.bioDecade.mean), A.bioDecade));
  }

  // How much tests overstate alignment, plus belief nodes over it (the clipped bell curve,
  // with its endpoint masses kept exactly; cached per distribution). The dice use the hidden draw.
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
  function evalWorld(A, evalGap) {
    const c = clippedNodes(A.evalGap, 0, 0.6);
    return { evalGap, egNodes: c.nodes, egMean: c.mean };
  }

  // China's hidden caution, plus nodes over its own-alignment effort for the belief shown to
  // players (an expectation over the clipped bell curve; the dice use the hidden draw).
  // Nodes span ±4 sd so the clipped tails are represented (cached per distribution).
  const CN_Z = Array.from({ length: 33 }, (_, i) => -4 + i * 0.25);
  const CN_W = (() => { const w = CN_Z.map((z) => Math.exp(-z * z / 2)), t = w.reduce((a, b) => a + b); return w.map((x) => x / t); })();
  const CN_CACHE = new Map();
  function chinaWorld(A, cnAlign, cnCaution) {
    const p = A.cnAlign, key = p.mean + '|' + p.sd;
    if (!CN_CACHE.has(key)) {
      const nodes = p.sd > 0 ? CN_Z.map((z, i) => [CN_W[i], clamp(p.mean + p.sd * z, 0, 1)]) : [[1, clamp(p.mean, 0, 1)]];
      CN_CACHE.set(key, { nodes, mean: nodes.reduce((a, [w, v]) => a + w * v, 0) });
    }
    const c = CN_CACHE.get(key);
    return { cnAlign, cnCaution, cnNodes: c.nodes, cnMean: c.mean };
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
      const s = initialState(sampleBaseWorld(A, rng)); s.fast = true;
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
    world = world || meanWorld();
    const cap0 = world.capNow ?? 44;
    return {
      world,
      year: START_YEAR,
      capUS: cap0, capCN: cap0 - 7, align: 16, openCap: 32, bio: 14,
      coord: 22, bci: 4, conc: 45, trust: 55,
      internal: 30,       // how far AI used inside labs is ahead of what outsiders can see
      cnMult: 1,          // modified by export controls
      survival: 1,        // cumulative probability of avoiding catastrophe so far (expected, not rolled)
      alive: 1,           // ...of which: the future is still running
      safeEnded: 0,
      fundStake: 3,       // public ownership of AI returns, 0..100 (Alaska-style funds exist today)
      acYear: null,       // year the Automated Coder milestone was reached       // ...of which: it already ended without catastrophe (kind takeover, handoff)
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
  const CN_LABOR = safetyLabor(0.3); // AI labor share China puts on alignment at full own effort

  // A verified US–China deal: frontier scaling stops at top-human-expert level.
  // Once a deal has collapsed it stays dead.
  const dealActive = (s, L) => !s.dealCollapsed && s.coord >= 60 && L.diplomacy >= 0.5;

  // China's effective race intensity responds to the US posture and to trust.
  // A US pause (race down, or all compute on safety) eases it only partly.
  function chinaRace(s, L) {
    const usPush = L.race * (1 - 0.5 * L.safety);
    const base = clamp(0.6 + 0.45 * (usPush - 0.5) - 0.55 * (s.coord / 100), 0.05, 1);
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
    const warning = sig((mc - 83) / 4) * sig((mc - s.align - 30) / 8);
    const usSlow = clamp(1 - L.race * (1 - 0.5 * L.safety) / 0.7, 0, 1);
    const recip = 0.6 * (1 + Math.max(usSlow, dealActive(s, L) ? 1 : 0));
    return clamp(caution * warning * recip, 0, 0.9);
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
    const share = Math.min(1, 0.55 + 0.45 * (s.coord / 100) + 0.3 * (L ? L.transparency : 0));
    const cover = 1 - (1 - share) * (1 - own);
    const chinaLeads = sig((s.capCN - s.capUS) / 3);
    return s.align * (1 - over * hiddenShare(s, L)) * (1 - chinaLeads * (1 - cover));
  }
  // How much of the test overstatement stays hidden: more with secret internal AI, less with
  // independent oversight, published research and safety work (interpretability, evals).
  // About 0.7 on today's settings, about 0.3 with full oversight and transparency.
  function hiddenShare(s, L) {
    const o = L ? L.oversight : 0.1, t = L ? L.transparency : 0.2, sx = L ? Math.min(1, safetyEffect(L.safety)) : 0.14;
    return clamp(0.6 + 0.8 * s.internal / 100 - 0.5 * o - 0.3 * t - 0.3 * sx, 0.1, 1.4);
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
    const share = Math.min(1, 0.55 + 0.45 * (s.coord / 100) + 0.3 * (L ? L.transparency : 0));
    const reach = s.align * sig((s.capCN - s.capUS) / 3) * (1 - share);
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

    // Loss of control: grows when capability outruns alignment near the top.
    // Scaled by how hard alignment is: zero in worlds where it is easy by
    // default. Shown as the expectation over difficulty and China's own alignment work;
    // the roll uses the truth.
    // AI 2040: most takeover risk comes from AIs deployed inside labs, out of view.
    const internalF = 0.4 + 0.9 * s.internal / 100;
    const lossAt = (own, over) => 0.3 * sig((mc - effAlign(s, L, own, over) - 36) / 6) * sig((mc - 78) / 4) * internalF;
    // Monte Carlo runs (s.fast) never show beliefs, so they skip the averages.
    let lossBelief = 0;
    if (s.fast) lossBelief = lossAt(s.world.cnMean ?? s.world.cnAlign ?? 0, s.world.egMean ?? s.world.evalGap ?? 0);
    else for (const [w, own, over] of alignBelief(s, L)) lossBelief += w * lossAt(own, over);
    const misalign = s.world.hazardBelief * lossBelief;
    const misalignTrue = s.world.hazard * lossAt(s.world.cnAlign || 0, s.world.evalGap || 0);

    // Great-power conflict: tight race + low trust + high strategic stakes.
    const closeness = clamp(1 - Math.abs(s.capUS - s.capCN) / 25, 0, 1);
    const stakes = sig((mc - 60) / 8);
    // Sabotage (AI 2040's Plan B) provokes: it raises baseline war risk, and
    // a China falling behind under attack has a reason to strike first.
    const behind = clamp((s.capUS - s.capCN) / 20, 0, 1);
    const war = 0.055 * Math.pow(1 - s.coord / 100, 2) * (0.3 + 0.7 * closeness) * stakes * (1 + 1.5 * L.aggression)
      + 0.07 * L.aggression * (0.4 + 0.6 * behind) * stakes;

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
    const bar = (d) => 45 + 32 * d + 0.2 * (s.internal - 30) - 10 * (s.bci / 100);
    if (truth) return s.world.safe ? 1 : sig((effAlign(s, L) - bar(s.world.difficulty)) / 6);
    const dn = diffNodes(s.world.diffDist), bars = dn.map(([, dz]) => bar(dz));
    let p = 0;
    for (const [wc, own, over] of alignBelief(s, L)) {
      const a = effAlign(s, L, own, over);
      for (let i = 0; i < dn.length; i++) p += wc * dn[i][0] * (dn[i][1] <= 0.3 ? 1 : sig((a - bars[i]) / 6));
    }
    return p;
  }

  // Probability that, with humans in control of AI, a few end up holding it and its gains
  // and most people lose their say: seized outright, or drifted there as automation moves
  // value from labor to whoever owns AI (nationalsecurityresponse.ai). Exponential growth
  // pulls the frontier away from the pack, so a close rival or open weights protect little.
  // `whistle` defaults to this world's hidden draw; belief callers pass its mean.
  function lockinOdds(s, L, whistle = s.world.whistle) {
    const mc = maxCap(s);
    const conc = 0.45 + 0.55 * sig((s.conc - 64) / 6);                   // power already concentrated
    const phys = s.acYear ? clamp((s.year - s.acYear) / 6, 0, 1) : 0;   // robots follow software
    const automation = 0.6 + 0.4 * phys;
    const pressure = (0.8 + 0.4 * L.race) * (1.3 - 0.6 * s.trust / 100); // automate or die; weak public voice
    const plural = Math.max(clamp(1 - Math.abs(s.capUS - s.capCN) / 15, 0, 1), clamp((s.openCap - 80) / 20, 0, 1));
    const keep = (1 - 0.7 * s.fundStake / 100)                            // public owns part of AI
      * (1 - 0.45 * L.oversight) * (1 - 0.35 * L.transparency)            // accountable AI owners
      * (1 - 0.6 * whistle)                                               // insiders refuse a power grab
      * (1 - 0.15 * plural)                                               // rivals help only a little
      * (1 - 0.1 * L.openness * clamp(s.openCap / Math.max(1, mc), 0, 1)) // open weights spread access
      * (1 - 0.2 * L.diplomacy * clamp((s.trust - 50) / 30, 0, 1));       // coordination, only with public pressure
    return clamp(LOCK_K * conc * automation * pressure * keep, 0, 0.95);
  }
  const LOCK_K = 1.8;
  // Endings that count as catastrophes (a kind takeover does not).
  const CATASTROPHES = ['bio', 'misalign', 'war', 'lockin'];
  // Shown (belief) lock-in odds: the capped probability averaged over the whistleblower
  // distribution, not evaluated at its mean. The dice use the hidden draw.
  function lockinBelief(s, L) {
    const nodes = s.world.whistleNodes || [[1, s.world.whistle]];
    let p = 0;
    for (const [w, v] of nodes) p += w * lockinOdds(s, L, v);
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
    const d = Array.from({ length: 16 }, () => rng());
    const noise = (i) => (d[i] - 0.5) * 2;

    // Hazards are rolled one after another, so they combine as independent risks.
    if (roll) {
      if (d[0] < r.bioTrue) return finish(s, 'bio', r, 'bio');
      if (d[1] < r.misalignTrue) return finish(s, lostControl(s), r, 'loc');
      if (d[2] < r.war) return finish(s, 'war', r, 'war');
    }

    const mc = maxCap(s), capUS0 = s.capUS, capCN0 = s.capCN;
    const w = s.world;

    // Capability: base pace × compute × hidden progress speed × AI R&D uplift.
    // Published research lets China (and everyone else) close part of the gap.
    const BASE = 7;
    const sx = safetyEffect(L.safety);
    const safetyTax = Math.max(0, 1 - L.safety - 0.08 * L.oversight);
    // Noise and surprise breakthroughs scale with the compute each side actually
    // spends on capabilities, so a pause (race 0 or all compute on safety) holds.
    // A public fund taking a share of AI returns drags slightly on reinvestment.
    const cUS = computeSpeed(L.race) * safetyTax * (1 - 0.05 * L.fund);
    const cCN = computeSpeed(chinaRace(s, L)) * s.cnMult * (1 - 0.35 * L.aggression); // sabotage slows China's labs
    const jUS = Math.min(1.5, cUS), jCN = Math.min(1.5, cCN);
    let gUS = (BASE * w.speed * uplift(s.capUS) + noise(3)) * cUS;
    let gCN = (BASE * w.speed * uplift(s.capCN) + noise(4)) * cCN
      + 0.25 * L.transparency * Math.max(0, s.capUS - s.capCN) * (1 - 0.35 * L.aggression);
    if (d[5] < 0.15) { gUS += (3 + d[6] * 5) * jUS; gCN += (2 + d[7] * 4) * jCN; }
    // AI 2040 puts the deal's cumulative collapse risk near 48% over ten years
    // (leadership change, a side caught cheating, ...), about 6% a year.
    // The deal holds capability through the year it collapses, so the race restarts the
    // next year (and the campaign gets a turn to respond).
    const dealThisYear = dealActive(s, L);
    if (dealThisYear) {
      gUS = Math.min(gUS, Math.max(0, TOP_EXPERT - s.capUS));
      gCN = Math.min(gCN, Math.max(0, TOP_EXPERT - s.capCN));
      if (d[8] < 0.06) { s.coord = clamp(s.coord - 40); s.dealCollapsed = s.year; }
    }
    s.capUS = clamp(s.capUS + Math.max(0, gUS));
    s.capCN = clamp(s.capCN + Math.max(0, gCN));

    // Alignment: funded research, multiplied by the share of AI labor pointed at
    // safety (so it also speeds up during takeoff), shared international and
    // public research, and (speculatively) BCIs that widen human oversight.
    // Divided by the world's hidden alignment difficulty.
    // Safety research is sped up by each bloc's own AI: the US bloc's by its safety share,
    // China's by its own alignment effort (100% = a serious program, like a US bloc spending
    // 30% of compute on safety). So a cautious China that leads the race speeds alignment up too.
    const assist = 1 + (uplift(capUS0) - 1) * safetyLabor(L.safety) + (uplift(capCN0) - 1) * CN_LABOR * (w.cnAlign || 0);
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

    // Public stake in AI: builds toward the fund lever, but buying in gets far more
    // expensive once AI value explodes (capability past expert level), so early funds own more.
    const target = 100 * L.fund;
    const buyIn = target > s.fundStake ? 0.4 * (1 - 0.85 * sig((mc - 80) / 5)) : 0.2;
    s.fundStake = clamp(s.fundStake + (target - s.fundStake) * buyIn);

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
      if (s.trust < 45 && !s.fast) {
        const lock = lockinBelief(s, L);
        s.alive *= 1 - lock; s.survival = s.safeEnded + s.alive;
      }
      if (s.trust < 45 && d[15] < lockinOdds(s, L)) return finish(s, 'lockin', r, 'end');
      // Judged on effective alignment (what the leading bloc really has): a margin that
      // exists only on tests, or only in the US while China leads, is not a careful path.
      if (effAlign(s, L) >= maxCap(s) && s.coord > 55) return finish(s, 'pause', r, 'end');
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
    for (const v of xs) { if (Math.abs(v - x) <= tol) same++; else if (v < x) below++; }
    const n = xs.length || 1;
    return { below: below / n, same: same / n, above: (xs.length - below - same) / n };
  }
  // A lever value as a percentage for links: one decimal, no trailing zero (0.025 -> 2.5).
  const leverPct = (v) => +(v * 100).toFixed(1);

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
    AC, TOP_EXPERT, TEDAI, uplift, computeSpeed, dealActive, safetyEffect, chinaSlowdown, chinaRace, effAlign, hiddenShare, realAlign,
    bioShape, bioRefExposure,
    clamp, sig, defaultLevers, defaultAssumptions, sampleWorld, meanWorld, initialState, maxCap, chinaRace,
    risks, transitionOdds, lockinOdds, lockinBelief, CATASTROPHES, step, monteCarlo, summarize, mulberry32, rankAmong, leverPct,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
