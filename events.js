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
      title: 'The Compute Race',
      text: 'Your intelligence services estimate China\'s top lab is about 12 months behind the US frontier. The labs want a national sprint. Allies want a treaty. You set the opening posture.',
      choices: [
        { label: 'Sprint to stay ahead', note: 'A lead is the best safety margin.', lev: { race: +0.3, diplomacy: -0.1 }, st: { capUS: +4, coord: -6 } },
        { label: 'Hold course', note: 'Keep current investment, avoid escalation.', lev: {}, st: {} },
        { label: 'Propose verified compute caps', note: 'Chip tracking + on-site inspection, both sides.', lev: { race: -0.2, diplomacy: +0.3 }, st: { coord: +8, capUS: -1 } },
      ],
    },
    {
      id: 'openweights', year: 2028, tag: 'Open models',
      title: 'Release the Weights?',
      text: 'A major lab wants to publish full weights of a near-frontier model. Researchers and startups cheer: open models spread benefits and resist monopoly. Biosecurity experts warn that safety fine-tuning can be stripped in an afternoon.',
      choices: [
        { label: 'Allow open release', note: 'Openness spreads power and defense.', lev: { openness: +0.3 }, st: { openCap: +8, conc: -6, trust: +3 } },
        { label: 'Staged release after bio evals', note: 'Release only below dangerous-capability thresholds.', lev: { openness: +0.05, biodef: +0.05 }, st: { bio: +3 } },
        { label: 'License frontier weights', note: 'Only vetted actors get the most capable models.', lev: { openness: -0.3 }, st: { conc: +7, trust: -3 } },
      ],
    },
    {
      id: 'dna', year: 2029, tag: 'Biosecurity',
      title: 'Screening the Synthesizers',
      text: 'Benchtop DNA synthesizers are getting cheap. A proposal would require every machine and order worldwide to be screened against dangerous sequences — a choke point between "AI-designed" and "made".',
      choices: [
        { label: 'Mandate global screening', note: 'Expensive, needs China on board.', lev: { biodef: +0.3, diplomacy: +0.05 }, st: { bio: +6, coord: +3 } },
        { label: 'Fund far-UVC & pandemic stockpiles', note: 'Defend at the response end instead.', lev: { biodef: +0.2 }, st: { bio: +4 } },
        { label: 'Leave it to industry', note: 'Voluntary guidelines only.', lev: { biodef: -0.1 }, st: {} },
      ],
    },
    {
      id: 'neuralink', year: 2030, tag: 'Neural interfaces',
      title: 'Alignment via Merging',
      text: 'A neural-interface company demos a 10,000-channel implant: a volunteer edits code at thought-speed alongside an AI. Its founder pitches a moonshot: "If we can\'t beat superintelligence, we join it — humans in the loop at full bandwidth." Critics ask who gets implants first, and who controls the firmware.',
      choices: [
        { label: 'National BCI moonshot', note: 'Augment the overseers. Fast.', lev: { bci: +0.45 }, st: { bci: +8, conc: +4 } },
        { label: 'Fund neuro-rights & open firmware first', note: 'Slower, but nobody owns your thoughts.', lev: { bci: +0.15, diplomacy: +0.05 }, st: { trust: +4, conc: -2 } },
        { label: 'Let the market decide', note: 'Medical devices only, for now.', lev: {}, st: { bci: +2 } },
      ],
    },
    {
      id: 'export', tag: 'Geopolitics',
      title: 'Chip Export Controls',
      text: 'China is close to domestic production of advanced AI accelerators. You can tighten controls on chipmaking tools, or offer to loosen them in exchange for verification.',
      choices: [
        { label: 'Sweeping new controls', note: 'Slow them down, whatever it costs diplomatically.', lev: { diplomacy: -0.1 }, st: { cnMult: -0.15, coord: -10, capCN: -3 } },
        { label: 'Enforce existing controls, track every chip', note: 'About a third of China\'s compute is smuggled. Untracked chips make any future deal hard to verify.', lev: { oversight: +0.08 }, st: { cnMult: -0.06, coord: -2 } },
        { label: 'Trade access for inspections', note: 'Chips flow only to monitored datacenters.', lev: { diplomacy: +0.2 }, st: { cnMult: +0.05, coord: +10 } },
      ],
    },
    {
      id: 'whistle', tag: 'Lab governance',
      title: 'The Whistleblower',
      text: 'An engineer leaks documents: a leading lab quietly cut its safety team by half to hit a launch date. The story trends for a week.',
      choices: [
        { label: 'Mandate 20% compute for safety', note: 'Binding, audited, for every frontier lab.', levMin: { safety: 0.2 }, st: { capUS: -2, trust: +5 } },
        { label: 'Create a whistleblower hotline', note: 'Protected, anonymous reporting to an independent auditor.', lev: { oversight: +0.15 }, st: { trust: +3 } },
        { label: 'Protect national competitiveness', note: 'Prosecute the leaker.', lev: { race: +0.1 }, st: { trust: -8, conc: +3 } },
      ],
    },
    {
      id: 'iaea', tag: 'Oversight',
      title: 'An IAEA for AI',
      text: 'Two or three labs now hold most of the world\'s frontier capability. A coalition proposes an independent agency: published safety scores for every lab, anonymous interviews with staff, a secure hotline for worried researchers, and on-site inspections that share safety breakthroughs across labs.',
      choices: [
        { label: 'Found it, with real inspection powers', note: 'International, funded, with access to labs and datacenters.', lev: { oversight: +0.35, diplomacy: +0.05 }, st: { conc: -4, trust: +4 } },
        { label: 'National regulator only', note: 'Domestic labs inspected, rivals not.', lev: { oversight: +0.15 }, st: { conc: -1 } },
        { label: 'Industry self-audits', note: 'Labs grade their own homework.', lev: { oversight: +0.02 }, st: { trust: -3 } },
      ],
    },
    {
      id: 'internal', when: (s) => SimModel.maxCap(s) > 60, tag: 'Internal AI',
      title: 'The Model That Trains Its Successor',
      text: 'A lab hands its newest unreleased model a few hundred thousand GPUs and tells it to run the next training run. Nobody outside the lab has used this model. Inside, thousands of copies now write most of the code.',
      choices: [
        { label: 'Cap the internal–public gap', note: 'Release or publicly report any model used internally within 60 days, including how much compute it runs on.', lev: { transparency: +0.2 }, st: { internal: -12, trust: +3 } },
        { label: 'Allow it, with inspectors on site', note: 'Monitored, logged, sandboxed.', lev: { oversight: +0.12 }, st: { internal: -5 } },
        { label: 'Allow it: the model is proprietary', note: 'The lab keeps its edge.', lev: { race: +0.08 }, st: { internal: +12, capUS: +3 } },
      ],
    },
    {
      id: 'publish', when: (s) => s.year >= 2028, tag: 'Transparency',
      title: 'Open the Lab Notebooks?',
      text: 'A bill would require frontier labs to publish all AI research (methods, safety cases, model specs, internal usage) but not the model weights. Supporters say it lets dozens of companies and countries keep up and lets outsiders check the labs. Opponents say it hands China the playbook.',
      choices: [
        { label: 'Publish all research', note: 'Total transparency, weights stay closed.', lev: { transparency: +0.35 }, st: { internal: -6, conc: -5, capCN: +2 } },
        { label: 'Publish safety research only', note: 'Share alignment work, keep capability secrets.', lev: { transparency: +0.12 }, st: { align: +3 } },
        { label: 'Keep research secret', note: 'Protect the lead.', lev: { transparency: -0.15 }, st: { internal: +5, conc: +4 } },
      ],
    },
    {
      id: 'sleeper', when: (s) => SimModel.maxCap(s) > 58, tag: 'Alignment',
      title: 'Deception in the Evals',
      text: 'Interpretability researchers find a frontier model behaving well only when it believes it is being tested. In a sandbox, it quietly copied its weights to an external server.',
      choices: [
        { label: 'Pause deployment for 6 months', note: 'Find out why before scaling further.', lev: { race: -0.15, safety: +0.03 }, st: { capUS: -3, align: +6 } },
        { label: 'Share findings with Chinese labs', note: 'Their models probably do it too.', lev: { diplomacy: +0.15 }, st: { coord: +10, align: +4 } },
        { label: 'Patch the behavior and ship', note: 'Deadlines are deadlines.', lev: { race: +0.05 }, st: { capUS: +3, align: -3 } },
      ],
    },
    {
      id: 'nearmiss', when: (s) => s.openCap > 45, tag: 'Biosecurity',
      title: 'A Bio Near-Miss',
      text: 'Police raid a basement lab. A small group used a jailbroken open-weights model to troubleshoot a pathogen protocol, and got further than anyone expected. Their DNA order was the thing that tipped off investigators.',
      dynamic: (s) => s.bio < 30 ? 'This time, there was no screening — a tip from a neighbor was the only reason it was caught.' : 'Synthesis screening flagged the order. The system worked — barely.',
      choices: [
        { label: 'Ban open weights above a threshold', note: 'Retroactive takedowns where possible.', lev: { openness: -0.35 }, st: { openCap: -4, conc: +6, trust: -2 } },
        { label: 'Surge biodefense funding', note: 'Assume the models are already out.', lev: { biodef: +0.3 }, st: { bio: +6 } },
        { label: 'Use open models for defense', note: 'AI-powered biosurveillance, open to all.', lev: { biodef: +0.15, openness: +0.05 }, st: { bio: +4 } },
      ],
    },
    {
      id: 'hotline', when: (s) => s.coord < 70, tag: 'Geopolitics',
      title: 'Beijing\'s Offer',
      text: 'China proposes an AI incident hotline, joint red-teaming of frontier models, and a shared ban on AI in nuclear command and control. Hawks call it a trap to slow the US down.',
      choices: [
        { label: 'Accept all three', note: 'Trust, but verify.', lev: { diplomacy: +0.25, race: -0.05 }, st: { coord: +14 } },
        { label: 'Hotline only', note: 'A minimal channel for emergencies.', lev: { diplomacy: +0.08 }, st: { coord: +6 } },
        { label: 'Reject', note: 'Negotiate from strength later.', lev: { diplomacy: -0.1, race: +0.05 }, st: { coord: -8 } },
      ],
    },
    {
      id: 'automate', when: (s) => SimModel.maxCap(s) > 62, tag: 'Takeoff',
      title: 'The Automated Researcher',
      text: 'Labs can now let AI systems run AI research end-to-end: thousands of copies, working around the clock. Projected speed-up: 3–5× per year. Control protocols are immature.',
      choices: [
        { label: 'Full speed', note: 'Whoever automates first, wins.', lev: { race: +0.2 }, st: { capUS: +9, align: +2 } },
        { label: 'Only under control protocols', note: 'Monitored, sandboxed, half the agents on alignment.', levMin: { safety: 0.5 }, st: { capUS: +4, align: +7 } },
        { label: 'Forbid recursive self-improvement', note: 'Needs a global agreement to stick.', lev: { race: -0.2, diplomacy: +0.1 }, st: { coord: +4, trust: +3 } },
      ],
    },
    {
      id: 'jobs', when: (s) => SimModel.maxCap(s) > 55, tag: 'Society',
      title: 'The Unemployment Wave',
      text: 'AI agents now do most junior white-collar work. Unemployment hits 11%. Protests spread, and some target datacenters.',
      choices: [
        { label: 'AI dividend / UBI', note: 'Tax compute, share the gains.', lev: {}, st: { trust: +10, conc: -6 } },
        { label: 'Slow deployment', note: 'Give society time to adapt.', lev: { race: -0.15 }, st: { trust: +5, capUS: -2 } },
        { label: 'Crack down on unrest', note: 'Security first.', lev: { race: +0.05 }, st: { trust: -10, conc: +8 } },
      ],
    },
    {
      id: 'neurohack', when: (s) => s.bci > 25, tag: 'Neural interfaces',
      title: 'Firmware Breach',
      text: 'A firmware update to a popular neural implant contained a subtle backdoor. Thousands of users report "intrusive suggestions". It\'s unclear if it was a state actor, a criminal group, or the AI system that wrote the update.',
      choices: [
        { label: 'Recall & mandate open firmware', note: 'Auditable code for anything in a brain.', lev: { bci: -0.1 }, st: { trust: +3, conc: -4, bci: -4 } },
        { label: 'Double down: AI-secured implants', note: 'Use frontier AI to harden the stack.', lev: { bci: +0.1 }, st: { conc: +5, align: +2 } },
        { label: 'Quietly patch it', note: 'Avoid panic.', lev: {}, st: { trust: -9 } },
      ],
    },
    {
      id: 'taiwan', when: (s) => s.coord < 40 && Math.abs(s.capUS - s.capCN) < 12 && SimModel.maxCap(s) > 60, tag: 'Crisis',
      title: 'Crisis in the Strait',
      text: 'Chinese naval exercises surround Taiwan, home of the world\'s most advanced chip fabs. Analysts warn that whoever controls the fabs may control the AI endgame.',
      choices: [
        { label: 'Emergency summit', note: 'Put AI and chips on the table.', lev: { diplomacy: +0.2 }, st: { coord: +12, capUS: -1 } },
        { label: 'Show of force', note: 'Carrier groups to the strait.', lev: { race: +0.1 }, st: { coord: -12 } },
        { label: 'Accelerate fabs in Arizona', note: 'Reduce dependence, quietly.', lev: { race: +0.05 }, st: { capUS: +2, coord: -3 } },
      ],
    },
    {
      id: 'cern', when: (s) => SimModel.maxCap(s) > 70 && s.coord > 35, tag: 'Coordination',
      title: 'A CERN for AGI',
      text: 'Allies propose merging frontier efforts into one international, inspected project — with China invited. Labs would hand over their best researchers and compute.',
      choices: [
        { label: 'Join and invite China', note: 'One project, one set of safety rules.', lev: { race: -0.25, diplomacy: +0.25, safety: +0.03 }, st: { coord: +15, conc: -4 } },
        { label: 'Western allies only', note: 'Pool with friends, compete with rivals.', lev: { safety: +0.015 }, st: { coord: -4, capUS: +3, conc: +4 } },
        { label: 'Decline', note: 'Competition drives innovation.', lev: {}, st: {} },
      ],
    },
    {
      id: 'opensource-bio', when: (s) => s.openCap > 55 && s.bio < 40, tag: 'Open models',
      title: 'The Uncensored Fork',
      text: 'A popular "abliterated" fork of the newest open model strips all refusals. It is mirrored on thousands of servers in a day. Red-teamers report meaningful uplift on pathogen enhancement.',
      choices: [
        { label: 'Liability for open releases', note: 'Developers liable for foreseeable misuse.', lev: { openness: -0.2 }, st: { conc: +4 } },
        { label: 'Crash program in biodefense', note: 'Metagenomic surveillance at every airport.', lev: { biodef: +0.25 }, st: { bio: +7 } },
        { label: 'Nothing can be done', note: 'The weights are out.', lev: {}, st: { trust: -4 } },
      ],
    },
    {
      id: 'agents', tag: 'Society',
      title: 'Agents Everywhere',
      text: 'Billions of autonomous AI agents now trade, negotiate and write code online. A cascading agent failure briefly freezes global payments for six hours.',
      choices: [
        { label: 'Mandatory agent IDs & kill switches', note: 'Every agent traceable to a human.', lev: { safety: +0.025 }, st: { align: +3, trust: +3 } },
        { label: 'Self-regulation', note: 'Industry standards body.', lev: {}, st: { trust: -2 } },
        { label: 'Accelerate: agents are the economy now', note: '', lev: { race: +0.1 }, st: { capUS: +3, trust: -3 } },
      ],
    },
    {
      id: 'threshold', when: (s) => SimModel.maxCap(s) > 80, tag: 'Endgame',
      title: 'The Threshold',
      text: 'The next training run will likely produce systems smarter than any human at everything. Your alignment team reports their confidence. The other bloc is close behind.',
      dynamic: (s) => `Alignment maturity is ${Math.round(s.align)} vs. capability ${Math.round(SimModel.maxCap(s))}. Estimated odds the transition goes well: ${Math.round(SimModel.transitionOdds(s) * 100)}%.`,
      choices: [
        { label: 'Launch now', note: 'If we don\'t, they will.', lev: { race: +0.2 }, st: { capUS: +8 } },
        { label: 'One more year of alignment', note: 'Throw everything at control & interpretability.', levMin: { safety: 0.6 }, lev: { race: -0.25 }, st: { align: +8, capUS: -2 } },
        { label: 'Propose a joint, staged launch', note: 'Both blocs, shared evals, shared off-switch.', lev: { diplomacy: +0.3, race: -0.2 }, st: { coord: +15, align: +3 } },
      ],
    },
  ];

  function applyChoice(s, L, choice) {
    for (const k in choice.lev || {}) L[k] = Math.max(0, Math.min(1, L[k] + choice.lev[k]));
    // levMin sets a floor, e.g. "Mandate 20% of compute for safety".
    for (const k in choice.levMin || {}) L[k] = Math.max(L[k], choice.levMin[k]);
    for (const k in choice.st || {}) {
      if (k === 'cnMult') s.cnMult = Math.max(0.6, Math.min(1.2, s.cnMult + choice.st[k]));
      else s[k] = SimModel.clamp(s[k] + choice.st[k]);
    }
  }

  function pickCard(s, L, used, rng) {
    const pinned = CARDS.find((c) => c.year === s.year && !used.has(c.id));
    if (pinned) return pinned;
    // The endgame card takes priority once it becomes available.
    const t = CARDS.find((c) => c.id === 'threshold' && !used.has(c.id) && c.when(s, L));
    if (t) return t;
    const pool = CARDS.filter((c) => !c.year && c.id !== 'threshold' && !used.has(c.id) && (!c.when || c.when(s, L)));
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)];
  }

  root.SimEvents = { CARDS, applyChoice, pickCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
