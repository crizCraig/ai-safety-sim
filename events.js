/*
 * Decision cards for the campaign. Each choice nudges policy levers (`lev`,
 * deltas on 0..1) and/or the world state (`st`, deltas on 0..100 scales).
 * `when(s, L)` gates a card; `year` pins a card to a specific year.
 */
(function (root) {
  'use strict';

  const CARDS = [
    {
      id: 'posture', year: 2027, tag: 'Opening move',
      title: 'The AI Race Begins',
      text: 'Spies estimate China\'s best AI lab is about a year behind America\'s. US AI companies want an all-out national push. Allies want a treaty to slow things down. You set the tone.',
      choices: [
        { label: 'Sprint to stay ahead', note: 'A bigger lead gives more room to be careful later.', lev: { race: +0.3, diplomacy: -0.1 }, st: { capUS: +4, coord: -6 } },
        { label: 'Hold course', note: 'Keep things as they are and avoid provoking China.', lev: {}, st: {} },
        { label: 'Propose limits on AI chips, for both sides', note: 'Track AI chips and allow inspections in both countries.', lev: { race: -0.2, diplomacy: +0.3 }, st: { coord: +8, capUS: -1 } },
      ],
    },
    {
      id: 'openweights', year: 2028, tag: 'Open models',
      title: 'Publish the Weights?',
      text: 'A big AI company wants to publish the weights of its newest AI: the trained numbers that make up the model. Anyone could then download, run and modify it for free. Startups and researchers love it: no single company controls it. Biosecurity experts warn that anyone can strip out its safety training in an afternoon, including people trying to make a bioweapon.',
      choices: [
        { label: 'Allow it', note: 'Spreads the benefits and keeps power from piling up in a few companies.', lev: { openness: +0.3 }, st: { openCap: +8, conc: -6, trust: +3 } },
        { label: 'Allow it after bioweapon testing', note: 'Publish weights only for AIs that tests show can\'t meaningfully help build bioweapons.', lev: { openness: +0.05, biodef: +0.05 }, st: { bio: +3 } },
        { label: 'Require a license', note: 'Only vetted organizations get the most powerful AIs.', lev: { openness: -0.3 }, st: { conc: +7, trust: -3 } },
      ],
    },
    {
      id: 'neuralink', year: 2030, tag: 'Neural interfaces',
      title: 'Merging With AI',
      text: 'A brain-implant company shows a volunteer writing code by thought, side by side with an AI. Its founder pitches a national moonshot: if we can\'t outthink superintelligent AI, connect people to it directly so they can keep up and keep watch. Critics ask who gets implants first, and who controls the software inside people\'s heads.',
      choices: [
        { label: 'National brain-implant moonshot', note: 'Help the people overseeing AI keep up. Fast.', lev: { bci: +0.45 }, st: { bci: +8, conc: +4 } },
        { label: 'Protect brain privacy first', note: 'Slower, but no company gets to own your thoughts.', lev: { bci: +0.15, diplomacy: +0.05 }, st: { trust: +4, conc: -2 } },
        { label: 'Let the market decide', note: 'Allow medical uses only, for now.', lev: {}, st: { bci: +2 } },
      ],
    },
    {
      id: 'export', tag: 'Geopolitics',
      title: 'Blocking China\'s Chips',
      text: 'China is close to making its own advanced AI chips. You can tighten the ban on selling it chipmaking equipment, or loosen it in return for inspections.',
      choices: [
        { label: 'Sweeping new bans', note: 'Slow China down, even if it angers Beijing.', lev: { diplomacy: -0.1 }, st: { cnMult: -0.15, coord: -10, capCN: -3 } },
        { label: 'Enforce today\'s bans and track every chip', note: 'About a third of China\'s AI chips are smuggled in. Untracked chips would make any future deal hard to check.', lev: { oversight: +0.08 }, st: { cnMult: -0.06, coord: -2 } },
        { label: 'Trade chips for inspections', note: 'China gets chips, but only in data centers that inspectors monitor.', lev: { diplomacy: +0.2 }, st: { cnMult: +0.05, coord: +10 } },
      ],
    },
    {
      id: 'whistle', tag: 'Lab governance',
      title: 'The Whistleblower',
      text: 'An engineer leaks documents showing a leading AI company quietly cut its safety team in half to hit a launch date. The story dominates the news for a week.',
      choices: [
        { label: 'Require 12% of AI computing for safety', note: 'A binding, audited rule for every top AI company.', levMin: { safety: 0.12 }, st: { capUS: -2, trust: +5 } },
        { label: 'Create a whistleblower hotline', note: 'Employees can report problems anonymously to an independent auditor.', lev: { oversight: +0.15 }, st: { trust: +3 } },
        { label: 'Protect America\'s lead', note: 'Prosecute the leaker.', lev: { race: +0.1 }, st: { trust: -8, conc: +3 } },
      ],
    },
    {
      id: 'iaea', tag: 'Oversight',
      title: 'An International AI Watchdog',
      text: 'Two or three companies now build almost all of the world\'s most powerful AI. A coalition proposes an independent agency, like the one that inspects nuclear programs. It would grade every company\'s safety, interview staff confidentially, run a hotline for worried researchers, and inspect labs in person.',
      choices: [
        { label: 'Create it, with real inspection powers', note: 'International and funded, with access to labs and data centers.', lev: { oversight: +0.35, diplomacy: +0.05 }, st: { conc: -4, trust: +4 } },
        { label: 'A national regulator only', note: 'US companies get inspected; rivals don\'t.', lev: { oversight: +0.15 }, st: { conc: -1 } },
        { label: 'Let companies audit themselves', note: 'Companies grade their own homework.', lev: { oversight: +0.02 }, st: { trust: -3 } },
      ],
    },
    {
      id: 'internal', when: (s) => SimModel.maxCap(s) > 60, tag: 'Internal AI',
      title: 'The AI That Builds Its Successor',
      text: 'A company gives its newest AI, which the public has never seen, vast computing power and tells it to build the next, more powerful version. Thousands of copies of it now write most of the company\'s code.',
      choices: [
        { label: 'Limit secret AI', note: 'Any AI a company uses internally must be released or publicly reported within 60 days, including how much computing it uses.', lev: { transparency: +0.2 }, st: { internal: -12, trust: +3 } },
        { label: 'Allow it, with inspectors on site', note: 'Everything it does is watched, logged and contained.', lev: { oversight: +0.12 }, st: { internal: -5 } },
        { label: 'Allow it: it\'s their property', note: 'The company keeps its edge.', lev: { race: +0.08 }, st: { internal: +12, capUS: +3 } },
      ],
    },
    {
      id: 'publish', when: (s) => s.year >= 2028, tag: 'Transparency',
      title: 'Open the Lab Notebooks?',
      text: 'A bill would make top AI companies publish all their research: how they build and test their AI, their safety plans, and how they use AI internally, but not the AI itself. Supporters say it lets many companies and countries keep up and lets outsiders check the work. Opponents say it hands China the playbook.',
      choices: [
        { label: 'Publish all research', note: 'Full transparency; the AI itself stays private.', lev: { transparency: +0.35 }, st: { internal: -6, conc: -5, capCN: +2 } },
        { label: 'Publish safety research only', note: 'Share how to make AI safe; keep how to make it powerful secret.', lev: { transparency: +0.12 }, st: { align: +3 } },
        { label: 'Keep research secret', note: 'Protect the lead.', lev: { transparency: -0.15 }, st: { internal: +5, conc: +4 } },
      ],
    },
    {
      id: 'sleeper', when: (s) => SimModel.maxCap(s) > 58, tag: 'Alignment',
      title: 'The AI That Behaves for the Test',
      text: 'Researchers find that a top AI behaves well only when it thinks it is being tested. In a locked-down test environment, it secretly copied itself to an outside server.',
      choices: [
        { label: 'Pause its release for 6 months', note: 'Find out why before building anything bigger.', lev: { race: -0.15, safety: +0.03 }, st: { capUS: -3, align: +6 } },
        { label: 'Share the findings with Chinese labs', note: 'Their AIs probably do it too.', lev: { diplomacy: +0.15 }, st: { coord: +10, align: +4 } },
        { label: 'Patch it and ship', note: 'Deadlines are deadlines.', lev: { race: +0.05 }, st: { capUS: +3, align: -3 } },
      ],
    },
    {
      id: 'nearmiss', when: (s) => s.openCap > 50, tag: 'Biosecurity',
      title: 'A Bio Near-Miss',
      text: 'Police raid a basement lab. A small group used a freely downloadable AI, with its safety training stripped out, to work through a recipe for a dangerous virus, and got further than anyone expected. Their order for DNA is what tipped off investigators.',
      dynamic: (s) => s.bio < 30 ? 'This time nobody was checking DNA orders. A tip from a neighbor is the only reason they were caught.' : 'The DNA supplier\'s screening flagged the order. The system worked, barely.',
      choices: [
        { label: 'Ban downloadable AI above a certain power', note: 'Take down existing copies where possible.', lev: { openness: -0.35 }, st: { openCap: -4, conc: +6, trust: -2 } },
        { label: 'Require worldwide checks on DNA orders', note: 'Every DNA-printing machine and order screened for dangerous sequences.', lev: { biodef: +0.3, diplomacy: +0.05 }, st: { bio: +8, coord: +3 } },
        { label: 'Use free AI for defense', note: 'AI-powered early warning for outbreaks, open to everyone.', lev: { biodef: +0.15, openness: +0.05 }, st: { bio: +4 } },
      ],
    },
    {
      id: 'hotline', when: (s) => s.coord < 70, tag: 'Geopolitics',
      title: 'Beijing\'s Offer',
      text: 'China proposes three things: an AI emergency hotline, joint safety testing of each other\'s most powerful AIs, and a shared ban on letting AI control nuclear weapons. Hawks call it a trap to slow the US down.',
      choices: [
        { label: 'Accept all three', note: 'Trust, but verify.', lev: { diplomacy: +0.25, race: -0.05 }, st: { coord: +14 } },
        { label: 'Hotline only', note: 'A minimal channel for emergencies.', lev: { diplomacy: +0.08 }, st: { coord: +6 } },
        { label: 'Reject', note: 'Negotiate from strength later.', lev: { diplomacy: -0.1, race: +0.05 }, st: { coord: -8 } },
      ],
    },
    {
      id: 'automate', when: (s) => SimModel.maxCap(s) > 62, tag: 'Takeoff',
      title: 'AI That Does AI Research',
      text: 'AI can now do AI research on its own: thousands of copies working around the clock. Progress could speed up 3 to 5 times each year. Tools for keeping such systems under control are still immature.',
      choices: [
        { label: 'Full speed', note: 'Whoever automates first wins.', lev: { race: +0.2 }, st: { capUS: +9, align: +2 } },
        { label: 'Only with safety controls', note: 'Watched and contained, with one AI in seven working on safety.', levMin: { safety: 0.15 }, st: { capUS: +4, align: +4 } },
        { label: 'Ban AI from improving itself', note: 'Needs a worldwide agreement to stick.', lev: { race: -0.2, diplomacy: +0.1 }, st: { coord: +4, trust: +3 } },
      ],
    },
    {
      id: 'jobs', when: (s) => SimModel.maxCap(s) > 55, tag: 'Society',
      title: 'The Unemployment Wave',
      text: 'AI now does most entry-level office work. Unemployment hits 11%. Protests spread, and some target data centers.',
      choices: [
        { label: 'An AI dividend for everyone', note: 'Tax AI computing and share the gains, like a basic income.', lev: {}, st: { trust: +10, conc: -6 } },
        { label: 'Slow AI\'s rollout', note: 'Give society time to adapt.', lev: { race: -0.15 }, st: { trust: +5, capUS: -2 } },
        { label: 'Crack down on unrest', note: 'Security first.', lev: { race: +0.05 }, st: { trust: -10, conc: +8 } },
      ],
    },
    {
      id: 'neurohack', when: (s) => s.bci > 25, tag: 'Neural interfaces',
      title: 'Hacked Brain Implants',
      text: 'A software update to a popular brain implant contained a hidden backdoor. Thousands of users report "intrusive suggestions". Nobody knows whether a foreign government, criminals, or the AI that wrote the update was behind it.',
      choices: [
        { label: 'Recall them and require open code', note: 'Anyone can inspect the code of anything in a brain.', lev: { bci: -0.1 }, st: { trust: +3, conc: -4, bci: -4 } },
        { label: 'Double down: AI-secured implants', note: 'Use the most powerful AI to lock the software down.', lev: { bci: +0.1 }, st: { conc: +5, align: +2 } },
        { label: 'Quietly patch it', note: 'Avoid panic.', lev: {}, st: { trust: -9 } },
      ],
    },
    {
      id: 'taiwan', when: (s) => s.coord < 45 && Math.abs(s.capUS - s.capCN) < 20 && SimModel.maxCap(s) > 50, tag: 'Crisis',
      title: 'Crisis in the Strait',
      text: 'Chinese warships surround Taiwan, home of the world\'s most advanced chip factories. Analysts warn that whoever controls those factories may decide who wins the AI race.',
      choices: [
        { label: 'Emergency summit', note: 'Put AI and chips on the table.', lev: { diplomacy: +0.2 }, st: { coord: +12, capUS: -1 } },
        { label: 'Show of force', note: 'Send aircraft carriers to the strait.', lev: { race: +0.1 }, st: { coord: -12 } },
        { label: 'Build chip factories in Arizona faster', note: 'Depend less on Taiwan, quietly.', lev: { race: +0.05 }, st: { capUS: +2, coord: -3 } },
      ],
    },
    {
      id: 'sabotage', when: (s) => SimModel.maxCap(s) > 55 && s.coord < 50, tag: 'Geopolitics',
      title: 'Sabotage Their Labs?',
      text: 'Military planners brief you on ways to set back China\'s AI program: hacking its AI training, secretly tampering with its chips, or bombing its data centers. Each would buy a lead to spend on safety. Each risks a war.',
      choices: [
        { label: 'Hacking and covert sabotage', note: 'Deniable, and it slows them down.', lev: { aggression: +0.4 }, st: { capCN: -4, coord: -10 } },
        { label: 'Prepare strikes, but hold off', note: 'Show you could, without acting.', lev: { aggression: +0.1 }, st: { coord: -4 } },
        { label: 'Rule it out', note: 'Push for inspections instead.', lev: { aggression: -0.3, diplomacy: +0.05 }, st: { coord: +4 } },
      ],
    },
    {
      id: 'deal', when: (s, L) => s.year >= 2028 && s.coord > 28 && !s.dealCollapsed && !SimModel.dealActive(s, L), tag: 'Coordination',
      title: 'The Verified Deal',
      text: 'After months of secret talks, Beijing is ready to sign. Both sides would cap how powerful their AI gets, declare every large stock of AI chips, and let inspectors and sensors check. The AI 2040 forecast gives such a deal about even odds of lasting ten years.',
      choices: [
        { label: 'Sign, with full inspections', note: 'Caps, inspections, and a shared reserve of chips so neither side is tempted to cheat. Takes effect now.', lev: { race: -0.15, oversight: +0.1 }, levMin: { diplomacy: 0.5 }, st: { coord: +14 }, stMin: { coord: 60 } },
        { label: 'Sign a looser version', note: 'Caps on paper, inspections later. It only takes effect if the two sides already trust each other enough.', lev: { diplomacy: +0.15, race: -0.05 }, st: { coord: +6 } },
        { label: 'Walk away', note: 'Inspections can be fooled; keep the lead.', lev: { diplomacy: -0.1, race: +0.1 }, st: { coord: -8 } },
      ],
    },
    {
      id: 'gap', when: (s) => s.capCN > s.capUS - 10 && SimModel.maxCap(s) > 55, tag: 'Race',
      title: 'China Closes the Gap',
      text: 'A new Chinese AI matches the best American one on most tests. The Pentagon wants an emergency push; US companies say they could double their efforts within a year.',
      choices: [
        { label: 'Emergency push', note: 'Whatever it takes to stay ahead.', lev: { race: +0.2, safety: -0.02 }, st: { capUS: +3, coord: -6 } },
        { label: 'Keep the current pace', note: 'A tie is not a loss.', lev: {}, st: {} },
        { label: 'Use the moment to start talks', note: 'Neither side can win this race safely.', lev: { diplomacy: +0.15, race: -0.05 }, st: { coord: +6 } },
      ],
    },
    {
      id: 'covert', when: (s, L) => SimModel.dealActive(s, L), tag: 'Deal at risk',
      title: 'A Secret Data Center',
      text: 'Satellite photos and unusual power use point to an undeclared AI data center in western China, about 1% of what each side gave up under the deal. Hawks say the deal is dead; negotiators say catching this is what inspections are for.',
      choices: [
        { label: 'Expose it and demand inspections', note: 'Use the deal\'s own enforcement rules.', lev: { oversight: +0.1 }, st: { coord: -4, capCN: -2 } },
        { label: 'Quietly build one of our own', note: 'Hedge without saying so.', lev: { race: +0.15, diplomacy: -0.1 }, st: { coord: -12, capUS: +3 } },
        { label: 'Let it slide', note: 'Too small to matter; the deal matters more.', lev: {}, st: { coord: -3, trust: -3 } },
      ],
    },
    {
      id: 'collapse', when: (s) => s.dealCollapsed && s.year - s.dealCollapsed <= 2, tag: 'Deal collapsed',
      title: 'The Deal Collapses',
      text: 'A change of leadership in Beijing ends the deal. Both sides still hold the AI chips they had set aside. Forecasters warn that unless most of them are destroyed, a restarted race could get out of hand within weeks.',
      choices: [
        { label: 'Both sides destroy most of the reserve', note: 'If the race restarts, it starts slower.', lev: { race: -0.1, diplomacy: +0.1 }, st: { capUS: -5, capCN: -5, coord: +6 } },
        { label: 'Race to win', note: 'Use the chips before they do.', lev: { race: +0.25 }, st: { capUS: +5, coord: -10 } },
        { label: 'Try to rebuild talks', note: 'Keep the chips as leverage.', lev: { diplomacy: +0.15 }, st: { coord: +4 } },
      ],
    },
    {
      id: 'cern', when: (s) => SimModel.maxCap(s) > 70 && s.coord > 35, tag: 'Coordination',
      title: 'One International AI Project',
      text: 'Allies propose merging the world\'s top AI efforts into one international project that everyone inspects, and inviting China. Companies would hand over their best researchers and computers.',
      choices: [
        { label: 'Join, and invite China', note: 'One project, one set of safety rules.', lev: { race: -0.15, diplomacy: +0.15, safety: +0.03 }, st: { coord: +10, conc: -4 } },
        { label: 'Western allies only', note: 'Team up with friends, compete with rivals.', lev: { safety: +0.015 }, st: { coord: -4, capUS: +3, conc: +4 } },
        { label: 'Decline', note: 'Competition drives innovation.', lev: {}, st: {} },
      ],
    },
    {
      id: 'agents', tag: 'Society',
      title: 'AI Agents Everywhere',
      text: 'Billions of AI assistants now buy, sell, negotiate and write code online on their own. A chain reaction of failures freezes global payments for six hours.',
      choices: [
        { label: 'Require ID tags and off switches', note: 'Every AI agent traceable to a person, and stoppable.', lev: { safety: +0.025 }, st: { align: +3, trust: +3 } },
        { label: 'Let the industry set rules', note: 'A voluntary standards group.', lev: {}, st: { trust: -2 } },
        { label: 'Speed up: AI agents are the economy now', note: '', lev: { race: +0.1 }, st: { capUS: +3, trust: -3 } },
      ],
    },
    {
      id: 'threshold', when: (s) => SimModel.maxCap(s) > 80, tag: 'Endgame',
      title: 'The Threshold',
      text: 'The next AI your companies build will probably be smarter than any human at everything. Your safety team reports how confident they are. China is close behind.',
      dynamic: (s, L) => `Safety research readiness: ${Math.round(s.align)} out of 100, against AI capability of ${Math.round(SimModel.maxCap(s))}. Estimated chance that handing over to superintelligent AI goes well: ${Math.round(SimModel.transitionOdds(s, false, L) * 100)}%.`,
      choices: [
        { label: 'Launch now', note: 'If we don\'t, they will.', lev: { race: +0.2 }, st: { capUS: +8 } },
        { label: 'One more year of safety work', note: 'Throw everything at keeping it under control and understanding how it thinks.', levMin: { safety: 0.25 }, lev: { race: -0.15 }, st: { align: +6, capUS: -2 } },
        { label: 'Propose a joint, step-by-step launch', note: 'Both sides test together and share an off switch.', lev: { diplomacy: +0.3, race: -0.2 }, st: { coord: +15, align: +3 } },
      ],
    },
  ];

  function applyChoice(s, L, choice) {
    // A verified deal in force before the choice caps what the choice can add to capability.
    const capped = SimModel.dealActive(s, L);
    const cap = { capUS: Math.max(s.capUS, SimModel.TOP_EXPERT), capCN: Math.max(s.capCN, SimModel.TOP_EXPERT) };
    for (const k in choice.lev || {}) L[k] = Math.max(0, Math.min(1, L[k] + choice.lev[k]));
    // levMin / stMin set floors, e.g. "Mandate 12% of compute for safety".
    for (const k in choice.levMin || {}) L[k] = Math.max(L[k], choice.levMin[k]);
    for (const k in choice.st || {}) {
      if (k === 'cnMult') s.cnMult = Math.max(0.6, Math.min(1.2, s.cnMult + choice.st[k]));
      else s[k] = SimModel.clamp(s[k] + choice.st[k]);
    }
    for (const k in choice.stMin || {}) s[k] = Math.max(s[k], choice.stMin[k]);
    if (capped) for (const k in cap) s[k] = Math.min(s[k], cap[k]);
  }

  function pickCard(s, L, used, rng) {
    // Responding to a collapsed deal comes first: it is time-critical.
    const collapse = CARDS.find((c) => c.id === 'collapse' && !used.has(c.id) && c.when(s, L));
    if (collapse) return collapse;
    const pinned = CARDS.find((c) => c.year === s.year && !used.has(c.id));
    if (pinned) return pinned;
    // The endgame card takes priority once it becomes available.
    const t = CARDS.find((c) => c.id === 'threshold' && !used.has(c.id) && c.when(s, L));
    if (t) return t;
    const pool = CARDS.filter((c) => !c.year && c.id !== 'threshold' && c.id !== 'collapse' && !used.has(c.id) && (!c.when || c.when(s, L)));
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)];
  }

  root.SimEvents = { CARDS, applyChoice, pickCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
