/*
 * Game of AGI — Futures Lab presets, shared by index.html and test-model.js.
 * Loaded as a classic script after model.js.
 */
(function (root) {
  'use strict';
  const M = root.SimModel;
  const P = (o) => ({ ...M.defaultLevers(), ...o });
  const AI2040_PLANS = 'https://ai-2040.com/supplements/comparing-possible-plans';
  // Short descriptions for the non-AI-2040 presets.
  const PRESET_INFO = {
    'Under 2% risk': 'A small change from the status quo that keeps catastrophe under 2% under the default (AI 2040) assumptions, with a buffer. Only five levers move: stop the race, put half of AI compute on safety, triple biodefense, cooperate fully with China, and set up strong oversight. Everything else stays at today\'s settings.',
    'Safest mix': 'The safest settings a search over every lever could find: stop racing, put a third of AI compute on safety, publish all research, and max out biodefense, diplomacy and oversight. With racing stopped, open weights and neural interfaces can stay at today\'s settings at only a small added risk. Under the default (AI 2040) assumptions, about 1% of futures still end badly, mostly in war, because China only partly slows down. Most futures reach 2040 on the careful path, with superintelligence still ahead.',
    'Status quo': 'Today\'s trajectory: an intense race, an illustrative 5% of AI compute on safety (no lab publishes this figure; OpenAI\'s 2023 pledge of 20% was reportedly never met), partly open weights and little diplomacy.',
    'Open everything': 'Release frontier weights and most research. Power spreads out, but capable models reach anyone, including would-be bioterrorists. Pandemic risk only bites on paths that last long enough for open models to reach expert level.',
    'Open + biodefense': 'Open everything, plus heavy investment in DNA synthesis screening, surveillance and stockpiles to offset the bio risk.',
    'IAEA for AI': 'An independent international agency inspects every frontier lab, publishes safety scores and protects whistleblowers.',
    'Neuralink bet': 'Keep racing, and push brain-computer interfaces hard so humans can keep up with AI and oversee it. The oversight benefit is a hypothetical mechanism in this model.',
    'BCI-first': 'Slow the AI race and point AI at neurotech, so augmented humans are ready to oversee AI before it gets much stronger. The oversight benefit is a hypothetical mechanism in this model.',
    'All compute on safety': 'The US bloc spends 100% of AI compute on safety, a unilateral pause. China only partly slows down and often takes the lead with less alignment work, so this does worse than a 35% safety share, though a cautious China narrows the gap.',
  };
  // align/great: Eli Lifland's plain figures (the calibration targets); alignAdj: his p(alignment)
  // after adjusting for his own views (slower takeoff, later start, expected rather than median
  // implementation), from the same supplement.
  const PLAN_INFO = {
    'Plan A: Verified slowdown': { align: '72%', alignAdj: '70%', great: '42%', others: 'Other AI 2040 authors give Plan A 80–81%.', text: 'A verified US–China deal slows frontier AI, makes all research public and lets many labs keep up, pausing at top-expert level until 2040.' },
    'Plan B: Fight China': { align: '50%', alignAdj: '55%', great: '25%', text: 'Sabotage China\'s AI program (cyber or kinetic) to win a lead, then burn that lead on safety. Nationalization concentrates power.' },
    'Plan C: Burn the lead': { align: '40%', alignAdj: '45%', great: '20%', text: 'The leading AI project spends some of its lead on safety, perhaps coordinating with other frontier projects.' },
    'Plan D: Race to ASI': { align: '25%', alignAdj: '32%', great: '10%', others: 'Other AI 2040 authors give Plan D 10–55%.', text: 'Frontier projects race through the intelligence explosion at nearly maximum speed.' },
    'Plan S: Shut it down': { text: 'An indefinite global halt to frontier AI development: a longer expected slowdown and more margin for error.' },
  };
  const PRESETS = {
    // Found by searching all levers to minimize catastrophe, benevolent takeover and lock-in,
    // then moving each lever back to the status quo where that costs little (about 1.0% bad
    // outcomes across 40,000 held-out futures). A 35% safety share adds no risk and leaves
    // alignment ahead in 2040 (98% careful path instead of 84%).
    'Safest mix': P({ race: 0, safety: 0.35, transparency: 1, biodef: 1, diplomacy: 1, oversight: 1, aggression: 0 }),
    // A small weighted change from the status quo that keeps catastrophe under 2% with a buffer
    // (about 1.8% at 40,000 futures, seeds 101–104; biodefense 0.5 also passes, at about 1.9%). Harder-to-move levers weigh more.
    // Biodefense 0.6 was added when yearly updates began reading the start-of-year state: open
    // models then lag a year, the bio reference exposure falls and long paths face more
    // pandemic risk (2.1–2.3% catastrophe without it).
    'Under 2% risk': P({ race: 0, safety: 0.5, biodef: 0.6, diplomacy: 1, oversight: 0.6, aggression: 0 }),
    'Status quo': P({}),
    // AI 2040's five plans as fixed levers (their plans change over time; these are approximations).
    'Plan A: Verified slowdown': P({ race: 0.35, safety: 0.08, openness: 0.15, transparency: 0.9, biodef: 0.5, diplomacy: 0.85, oversight: 0.7 }),
    'Plan B: Fight China': P({ race: 0.8, safety: 0.2, openness: 0.1, transparency: 0.05, diplomacy: 0, oversight: 0.15, aggression: 0.7 }),
    'Plan C: Burn the lead': P({ race: 0.8, safety: 0.14, transparency: 0.15, diplomacy: 0.1, oversight: 0.3 }),
    'Plan D: Race to ASI': P({ race: 1, safety: 0.025, openness: 0.4, transparency: 0.05, biodef: 0.1, diplomacy: 0.05, oversight: 0 }),
    'Plan S: Shut it down': P({ race: 0, safety: 0.15, openness: 0.05, transparency: 0.4, biodef: 0.5, diplomacy: 1, oversight: 1 }),
    'Open everything': P({ race: 0.6, safety: 0.04, openness: 1, transparency: 0.6, biodef: 0.05, diplomacy: 0.3 }),
    'Open + biodefense': P({ race: 0.6, safety: 0.05, openness: 1, transparency: 0.6, biodef: 0.8, diplomacy: 0.3, oversight: 0.2 }),
    'IAEA for AI': P({ race: 0.5, safety: 0.07, biodef: 0.3, diplomacy: 0.4, oversight: 0.9 }),
    'Neuralink bet': P({ race: 0.6, bci: 1 }),
    'BCI-first': P({ race: 0.25, safety: 0.1, bci: 1, transparency: 0.5, diplomacy: 0.5, oversight: 0.4 }),
    'All compute on safety': P({ safety: 1 }),
  };

  // Scenarios for the unknowns (not the levers), so they combine with any plan. Each lists
  // only the unknowns it changes; the rest stay at their defaults.
  const TIME_RSI = 'https://time.com/article/2026/10/14/recursive-self-improvement-AI-report/';
  const GLADSTONE_RSI = 'https://aiendgame.com/p/what-rsi-looks-like';
  const AIFP_UPDATE = 'https://blog.aifutures.org/p/q25-2026-timelines-update-uplift';
  const S1 = 'https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/anthropicpbc-sx1.htm';
  const METR_UPLIFT = 'https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/';
  const UNKNOWN_PRESETS = {
    'AI 2040 (default)': { set: {},
      text: 'The default unknowns, with timelines calibrated to AI 2040: an Automated Coder around 2030 and superintelligence around 2031 on today\'s path.' },
    // Speed is lognormal in log10 units: median 1.3× with the default spread (ln-sd 0.35). Links
    // made before that wrote speed=1.3:0.3, which `legacy` maps back to this scenario.
    'RSI 2027 (lab insiders)': { set: { capNow: { mean: 50, sd: 0 }, speed: { mean: Math.log10(1.3), sd: 0.35 / Math.LN10 } },
      legacy: { speed: '1.3:0.3' },
      html: `Most frontier-lab researchers interviewed for Gladstone AI's <a href="${GLADSTONE_RSI}" target="_blank" rel="noopener">report</a> (via <a href="${TIME_RSI}" target="_blank" rel="noopener">TIME</a>, Oct 2026) expect recursive self-improvement within 3 to 12 months, absent U.S. government intervention. This starts 2027 at capability 50, where AI speeds up its own research, at 1.3× AI 2040's pace. <a href="${S1}" target="_blank" rel="noopener">Anthropic's S-1</a> (Oct 2026) says Claude wrote "over 90%" of its September 2026 code as it approaches "recursive self-improvement." Milestones come about a year earlier (Automated Coder ~2029, superintelligence ~2030), and Plan A's catastrophe share roughly doubles.` },
    // Daniel Kokotajlo's all-things-considered Automated Coder median is Nov 2027; the Lab labels a
    // milestone with the year after it is reached, so that is the Lab's 2028 (as RSI's 2028 shows
    // as 2029). Only the starting point moves: 59 at AI 2040's pace puts about three quarters of
    // Automated Coders in 2027 and superintelligence a year later (labels 2028 and 2029).
    'AI Futures (Aug 2026)': { set: { capNow: { mean: 59, sd: 0 } },
      html: `The AI Futures Project's <a href="${AIFP_UPDATE}" target="_blank" rel="noopener">August 2026 update</a>, following Daniel Kokotajlo's median: an Automated Coder by late 2027 if AI is developed as fast as technically feasible (Eli Lifland's median is 2030). Its main method relies on lab staff's self-reported speed-ups; <a href="${METR_UPLIFT}" target="_blank" rel="noopener">METR's controlled study</a> measured far less. Starts 2027 at capability 59.` },
  };

  root.SimPresets = { AI2040_PLANS, PRESET_INFO, PLAN_INFO, PRESETS, UNKNOWN_PRESETS, TIME_RSI, GLADSTONE_RSI };
})(typeof globalThis !== 'undefined' ? globalThis : this);
