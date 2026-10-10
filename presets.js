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
    'Under 2% risk': 'The smallest change from the status quo that keeps catastrophe under 2%, found by searching all levers. Only four levers move: slow the race almost to a stop, put half of AI compute on safety, cooperate fully with China, and set up strong oversight. Everything else stays at today\'s settings.',
    'Safest mix': 'The safest settings a search over every lever could find: stop racing, put a third of AI compute on safety, publish all research, and max out biodefense, diplomacy and oversight. With racing stopped, open weights and neural interfaces can stay at today\'s settings without adding risk. About 1% of futures still end badly, mostly in war, because China only partly slows down. Most futures reach 2040 on the careful path, with superintelligence still ahead.',
    'Status quo': 'Today\'s trajectory: an intense race, 5% of AI compute on safety, partly open weights and little diplomacy.',
    'Open everything': 'Release frontier weights and most research. Power spreads out, but capable models reach anyone, including would-be bioterrorists. Pandemic risk only bites on paths that last long enough for open models to reach expert level.',
    'Open + biodefense': 'Open everything, plus heavy investment in DNA synthesis screening, surveillance and stockpiles to offset the bio risk.',
    'IAEA for AI': 'An independent international agency inspects every frontier lab, publishes safety scores and protects whistleblowers.',
    'Neuralink bet': 'Keep racing, and push brain-computer interfaces hard so humans can keep up with AI and oversee it.',
    'BCI-first': 'Slow the AI race and point AI at neurotech, so augmented humans are ready to oversee AI before it gets much stronger.',
    'All compute on safety': 'The US bloc spends 100% of AI compute on safety, a unilateral pause. China only partly slows down, takes the lead, and reaches superintelligence with less alignment work, so this does worse than a 35% safety share.',
  };
  const PLAN_INFO = {
    'Plan A: Verified slowdown': { align: '72%', great: '42%', text: 'A verified US–China deal slows frontier AI, makes all research public and lets many labs keep up, pausing at top-expert level until 2040.' },
    'Plan B: Fight China': { align: '50%', great: '25%', text: 'Sabotage China\'s AI program (cyber or kinetic) to win a lead, then burn that lead on safety. Nationalization concentrates power.' },
    'Plan C: Burn the lead': { align: '40%', great: '20%', text: 'The leading AI project spends some of its lead on safety, perhaps coordinating with other frontier projects.' },
    'Plan D: Race to ASI': { align: '25%', great: '10%', text: 'Frontier projects race through the intelligence explosion at nearly maximum speed.' },
    'Plan S: Shut it down': { text: 'An indefinite global halt to frontier AI development: a longer expected slowdown and more margin for error.' },
  };
  const PRESETS = {
    // Found by searching all levers to minimize catastrophe, benevolent takeover and lock-in,
    // then moving each lever back to the status quo where that costs nothing (about 1.0% bad
    // outcomes across 40,000 held-out futures). A 35% safety share adds no risk and leaves
    // alignment ahead in 2040 (98% careful path instead of 84%).
    'Safest mix': P({ race: 0, safety: 0.35, transparency: 1, biodef: 1, diplomacy: 1, oversight: 1, aggression: 0 }),
    // Smallest weighted change from the status quo that keeps catastrophe under 2%
    // (1.35–1.55% across 62,000 held-out futures). Harder-to-move levers weigh more.
    'Under 2% risk': P({ race: 0.05, safety: 0.5, diplomacy: 1, oversight: 0.6, aggression: 0 }),
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

  root.SimPresets = { AI2040_PLANS, PRESET_INFO, PLAN_INFO, PRESETS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
