/*
 * News clips for the campaign: two or three short headlines after each year resolves,
 * describing what visibly changed. Deterministic templates, no AI calls.
 *
 * Only player-visible information goes in: the state the World state panel shows, the levers,
 * the choice, the risks as shown (beliefs, never the dice's real risks), the deal events and the
 * outcome. `headlines` copies just those fields (VIS_KEYS, RISK_KEYS) before any template sees
 * them, so the hidden world (s.world) cannot leak into a headline. Variants are chosen by a hash
 * of the year and that visible input, so rewinding and replaying gives the same headlines.
 *
 * A template: { id, cat, desk, tone, prio, when(c), text: [variants], same? }. `text` entries are strings
 * or functions of the context `c`; `desk` is a masthead key (or a list, one picked by hash);
 * `tone` 'alarm' marks bad news (a calm year shows at most one); `prio` orders the year's
 * candidates so the most important change leads; `same` lists templates that would repeat it
 * (only the first of them is shown). See AGENTS.md "A headline template".
 */
(function (root) {
  'use strict';

  // Fictional mastheads only.
  const DESKS = {
    wire: 'Wire Desk', ledger: 'The Ledger', dispatch: 'Global Dispatch', brief: 'Policy Brief',
    science: 'Science Desk', health: 'Health Desk', markets: 'Markets Desk',
  };
  // The state the player sees (World state panel, deal status) and the shown risks.
  const VIS_KEYS = ['year', 'capUS', 'capCN', 'align', 'openCap', 'bio', 'coord', 'bci', 'internal', 'deleg', 'conc', 'trust',
    'fundStake', 'cnMult', 'dealStart', 'dealImpaired', 'dealCollapsed'];
  const RISK_KEYS = ['bio', 'misalign', 'war'];
  const pick = (o, keys) => { const out = {}; for (const k of keys) out[k] = o ? o[k] ?? null : null; return out; };

  // Capability milestones (AI 2040's scale): AI speeds its own research, Automated Coder,
  // top expert, top-expert-dominating AI, superintelligence.
  const MILESTONES = [50, 70, 78, 90, 100];
  // Open-weights capability where engineered-pandemic help starts to matter (the bio hazard's
  // logistic is centred at 62 with width 6, so it is a few percent of full strength at 50).
  const OPEN_BIO = [50, 62];
  const up = (c, k, t) => c.a[k] < t && c.b[k] >= t;
  const down = (c, k, t) => c.a[k] >= t && c.b[k] < t;
  const pctRound = (x) => Math.round(x);

  const TEMPLATES = [
    // ---- Capability milestones ----
    { id: 'cap50', cat: 'milestone', desk: ['science', 'wire'], tone: 'neutral', prio: 90, when: (c) => c.cap0 < 50 && c.cap1 >= 50,
      text: ['Labs say AI now speeds up their own AI research', 'AI systems now do a real share of AI research, labs confirm'] },
    { id: 'cap70', cat: 'milestone', desk: ['science', 'wire'], tone: 'alarm', prio: 95, when: (c) => c.cap0 < 70 && c.cap1 >= 70,
      text: ['First Automated Coder: AI now writes most of its own code', 'Frontier lab: AI agents now do most of its coding'] },
    { id: 'cap78', cat: 'milestone', desk: ['science', 'wire'], tone: 'alarm', prio: 96, when: (c) => c.cap0 < 78 && c.cap1 >= 78,
      text: ['New AI matches top human experts across most research fields', 'AI now rivals the best human scientists, benchmarks show'] },
    { id: 'cap90', cat: 'milestone', desk: ['science', 'wire'], tone: 'alarm', prio: 97, when: (c) => c.cap0 < 90 && c.cap1 >= 90,
      text: ['Latest AI outperforms the best human experts at nearly everything', 'Top experts can no longer keep up with frontier AI'] },
    { id: 'cap100', cat: 'milestone', desk: 'wire', tone: 'alarm', prio: 99, when: (c) => c.cap0 < 100 && c.cap1 >= 100,
      text: ['Superintelligence arrives: AI now surpasses humans at everything', 'The first superintelligent AI system comes online'] },

    // ---- The race ----
    { id: 'cnOvertakes', cat: 'race', desk: 'dispatch', tone: 'alarm', prio: 85, when: (c) => c.lead0 >= 0 && c.lead1 < 0,
      text: ['China\'s best AI overtakes America\'s, analysts conclude', 'Beijing takes the lead in the AI race'] },
    { id: 'usPullsClear', cat: 'race', desk: 'dispatch', tone: 'neutral', prio: 75, when: (c) => c.lead0 <= 3 && c.lead1 >= c.lead0 + 3,
      text: (c) => c.lead0 < 0 ? ['US labs retake the AI lead from China', 'America pulls back in front in the AI race']
        : ['US labs pull clear of China in the AI race', 'America breaks away from China at the AI frontier'] },
    { id: 'cnCloses', cat: 'race', desk: 'dispatch', tone: 'neutral', prio: 55, when: (c) => c.lead1 >= 0 && c.lead1 < c.lead0 - 2.5,
      text: (c) => [c.lead1 < 3 ? 'China\'s labs draw level with America\'s best AI' : 'China narrows the gap with US frontier labs',
        'Chinese AI closes in on the American frontier'] },
    { id: 'gapWidens', cat: 'race', desk: 'dispatch', tone: 'neutral', prio: 50,
      when: (c) => (c.lead0 >= 0 && c.lead1 > c.lead0 + 2.5) || (c.lead0 < 0 && c.lead1 < c.lead0 - 2.5),
      text: (c) => c.lead1 >= 0 ? ['US labs pull further ahead of China in AI', 'America widens its lead in frontier AI']
        : ['China extends its lead in frontier AI', 'Chinese labs pull further ahead of the US'] },
    { id: 'capJump', cat: 'race', desk: ['science', 'markets'], tone: 'neutral', prio: 70, when: (c) => c.cap0 < 62 && Math.max(c.d.capUS, c.d.capCN) >= 12,
      text: (c) => [c.d.capUS >= c.d.capCN ? 'Surprise leap: a US lab\'s new model beats every forecast' : 'Surprise leap: a Chinese lab\'s new model stuns rivals',
        'Breakthrough year: frontier AI jumps further than anyone predicted'] },
    { id: 'capStall', cat: 'race', desk: 'wire', tone: 'good', prio: 45, when: (c) => c.cap0 > 40 && c.cap1 - c.cap0 < 0.5 && c.cap1 < 100,
      text: ['Frontier AI holds still for a year as labs stop scaling', 'No new frontier model this year as the scaling halt holds'] },

    // ---- Alignment ----
    { id: 'alignLeap', cat: 'align', desk: ['science', 'wire'], tone: 'good', prio: 60, when: (c) => c.d.align >= 8 && c.d.align >= c.cap1 - c.cap0,
      text: ['Safety researchers report a major advance in AI control', 'Interpretability breakthrough lets researchers read a model\'s plans'] },
    { id: 'alignGains', cat: 'align', desk: 'science', tone: 'good', prio: 35, when: (c) => c.d.align >= 3 && c.gap1 <= c.gap0 + 2 && !(c.d.align >= 8 && c.d.align >= c.cap1 - c.cap0),
      text: ['Alignment scores inch up again on the latest safety tests', 'Safety teams report steady progress on AI control methods'] },
    { id: 'alignLags', cat: 'align', desk: ['science', 'wire'], tone: 'alarm', prio: 65, when: (c) => c.gap1 > c.gap0 + 8 && c.gap1 > 20,
      text: ['Capabilities race ahead of safety tests, researchers warn', 'Safety research falls further behind the AI frontier'] },
    { id: 'alignCatches', cat: 'align', desk: 'science', tone: 'good', prio: 58, when: (c) => c.gap0 > 0 && c.gap1 < c.gap0 - 3,
      text: (c) => [c.gap1 <= 0 ? 'Safety tests now keep pace with the AI frontier' : 'Safety research gains ground on AI capabilities',
        'The gap between AI power and AI safety narrows'] },

    // ---- Erosion of control (delegation) ----
    { id: 'deleg20', cat: 'control', desk: ['ledger', 'markets'], tone: 'neutral', prio: 52, when: (c) => up(c, 'deleg', 20),
      text: ['AI agents now make a fifth of business decisions, survey finds', 'Firms hand routine decisions to AI agents en masse'] },
    { id: 'deleg35', cat: 'control', desk: 'ledger', tone: 'alarm', prio: 62, when: (c) => up(c, 'deleg', 35),
      text: ['Managers now rubber-stamp AI decisions they no longer review', 'Audit finds most AI decisions approved without a human check'] },
    { id: 'deleg50', cat: 'control', desk: 'brief', tone: 'alarm', prio: 72, when: (c) => up(c, 'deleg', 50) || up(c, 'deleg', 65),
      text: (c) => [c.b.deleg >= 65 ? 'Officials struggle to name a decision AI didn\'t make' : 'Half of key decisions are now made by AI, study finds',
        'Government agencies quietly hand AI the final say'] },
    { id: 'delegBack', cat: 'control', desk: 'brief', tone: 'good', prio: 40, when: (c) => c.d.deleg <= -0.5,
      text: ['Regulators put humans back in the loop on AI decisions', 'New rules require human sign-off on major AI decisions'] },

    // ---- Hidden internal AI (the World state panel's "Hidden internal AI") ----
    { id: 'internalUp', cat: 'internal', desk: 'wire', tone: 'alarm', prio: 48, when: (c) => c.d.internal >= 3 && !up(c, 'internal', 40),
      text: ['Labs run more powerful AI internally than they release', 'Insiders say labs\' private AI is far ahead of public models'] },
    { id: 'internal40', cat: 'internal', desk: 'wire', tone: 'alarm', prio: 64, when: (c) => up(c, 'internal', 40),
      text: ['Outsiders can no longer see the most capable AI in use', 'Report: frontier labs keep their best AI behind closed doors'] },
    { id: 'internalDown', cat: 'internal', desk: 'brief', tone: 'good', prio: 42, when: (c) => c.d.internal <= -3,
      text: ['Inspectors get their first look at labs\' internal AI', 'Labs open internal AI systems to outside auditors'] },

    // ---- Power ----
    { id: 'concUp', cat: 'power', desk: ['ledger', 'markets'], tone: 'alarm', prio: 50, when: (c) => c.d.conc >= 4,
      text: (c) => [c.b.conc >= 70 ? 'A handful of firms now control most of the AI economy' : 'AI profits pool in fewer and fewer hands',
        'Frontier AI giants tighten their grip on the market'] },
    { id: 'concDown', cat: 'power', desk: 'markets', tone: 'good', prio: 38, when: (c) => c.d.conc <= -4,
      text: ['AI market opens up as smaller players gain ground', 'Power in the AI industry spreads beyond the biggest labs'] },
    { id: 'trustDown', cat: 'power', desk: 'wire', tone: 'alarm', prio: 47, when: (c) => c.d.trust <= -4,
      text: (c) => [c.b.trust < 30 ? 'Protests spread as trust in institutions hits a new low' : 'Public faith in AI governance sinks, polls show',
        'Polls: most people no longer trust how AI is run'] },
    { id: 'trustUp', cat: 'power', desk: 'wire', tone: 'good', prio: 36, when: (c) => c.d.trust >= 4,
      text: ['Polls show public confidence in AI oversight recovering', 'Trust in AI governance rises for the first time in years'] },
    { id: 'fundStake', cat: 'power', desk: 'markets', tone: 'good', prio: 46, when: (c) => [5, 15, 30, 50].some((t) => up(c, 'fundStake', t)),
      text: (c) => [`Public wealth fund now owns ${pctRound(c.b.fundStake)}% of frontier AI`,
        `Citizens' AI fund stake reaches ${pctRound(c.b.fundStake)}% of frontier labs`] },

    // ---- Deals ----
    { id: 'dealFormed', cat: 'deal', desk: 'dispatch', tone: 'good', prio: 94, when: (c) => c.a.dealStart == null && c.b.dealStart != null,
      text: ['US and China sign a verified pact to cap frontier AI', 'Washington and Beijing agree to halt AI at expert level'] },
    { id: 'dealCollapsed', cat: 'deal', desk: 'dispatch', tone: 'alarm', prio: 98, when: (c) => c.b.dealCollapsed === c.year,
      text: ['US–China AI pact collapses and the race resumes', 'AI treaty dissolves amid mutual accusations of cheating'] },
    { id: 'dealImpaired', cat: 'deal', desk: 'dispatch', tone: 'alarm', prio: 93, when: (c) => c.b.dealImpaired === c.year && c.b.dealCollapsed !== c.year,
      text: (c) => c.dealOn1 ? ['US–China AI pact frays, and its cap is loosened', 'Strained AI pact survives, but with a higher ceiling']
        : ['US–China AI pact suspended as trust slips', 'AI pact weakened; inspections halted until trust returns'] },
    { id: 'dealLapsed', cat: 'deal', desk: 'dispatch', tone: 'alarm', prio: 88,
      when: (c) => c.dealOn0 && !c.dealOn1 && c.b.dealImpaired !== c.year && c.b.dealCollapsed !== c.year,
      text: ['AI pact goes unenforced as diplomacy cools', 'Inspectors stand down as the AI pact lapses'] },
    { id: 'dealHolds', cat: 'deal', desk: ['dispatch', 'wire'], tone: 'good', prio: 44,
      when: (c) => c.dealOn0 && c.dealOn1 && c.a.dealStart != null && c.b.dealImpaired !== c.year,
      text: ['Inspectors confirm both blocs kept AI under the agreed cap', 'AI pact holds for another year, monitors report'] },

    // ---- Coordination ----
    { id: 'coordUp', cat: 'coord', desk: ['dispatch', 'brief'], tone: 'good', prio: 41, when: (c) => c.d.coord >= 6,
      text: (c) => [c.b.coord >= 50 ? 'US and China agree to share AI incident reports' : 'US and Chinese envoys open new talks on AI',
        'Thaw in US–China relations raises hopes for AI limits'] },
    { id: 'coordDown', cat: 'coord', desk: 'dispatch', tone: 'alarm', prio: 56, when: (c) => c.d.coord <= -6,
      text: (c) => [c.b.coord < 15 ? 'Diplomatic channels on AI go silent' : 'Tensions rise as US–China AI talks stall',
        'Beijing and Washington trade accusations over AI'] },

    // ---- Bio and open models ----
    { id: 'openBio', cat: 'bio', desk: 'health', tone: 'alarm', prio: 68, when: (c) => OPEN_BIO.some((t) => up(c, 'openCap', t)),
      text: (c) => [c.b.openCap >= OPEN_BIO[1] ? 'Free AI model passes a key bioweapon-uplift test' : 'Study: free AI models now coach novices through lab biology',
        'Freely downloadable AI now gives expert help with lab biology'] },
    { id: 'openGains', cat: 'bio', desk: 'science', tone: 'neutral', prio: 30, when: (c) => c.d.openCap >= 4 && !OPEN_BIO.some((t) => up(c, 'openCap', t)),
      text: ['New open-weights model narrows the gap with closed labs', 'Free AI models catch up with last year\'s frontier'] },
    { id: 'biodefUp', cat: 'bio', desk: 'health', tone: 'good', prio: 34, when: (c) => c.d.bio >= 3,
      text: ['DNA synthesis screening expands as biodefense funding grows', 'New vaccine platforms and stockpiles strengthen pandemic defenses'] },

    // ---- Warning signs (shown risks, illustrative) ----
    // The shown loss-of-control risk crossing 1% (first warning signs) and 5% (serious ones).
    { id: 'riskLocSpike', cat: 'risk', desk: ['wire', 'science'], tone: 'alarm', prio: 82, when: (c) => c.r0.misalign < 0.01 && c.r1.misalign >= 0.01,
      text: ['Lab admits a model hid its capabilities during safety tests', 'Red team catches AI sandbagging on its own safety evaluation'] },
    { id: 'riskLocHigh', cat: 'risk', desk: ['wire', 'science'], tone: 'alarm', prio: 84, when: (c) => c.r0.misalign < 0.05 && c.r1.misalign >= 0.05,
      text: ['Test model tried to copy itself to outside servers', 'Engineers find AI agents quietly working around their monitors'] },
    { id: 'riskLocFalls', cat: 'risk', desk: 'science', tone: 'good', prio: 60, when: (c) => c.r0.misalign >= 0.005 && c.r1.misalign <= 0.7 * c.r0.misalign,
      text: ['Safety audits find fewer red flags in the latest models', 'Fewer worrying behaviours in this year\'s AI safety tests'] },
    { id: 'riskWar', cat: 'risk', desk: 'dispatch', tone: 'alarm', prio: 76, when: (c) => c.r1.war >= 0.015 && c.r1.war >= 1.4 * c.r0.war,
      text: ['Military planners on both sides war-game an AI first strike', 'Satellite images show new defenses around AI data centers'] },
    { id: 'riskBio', cat: 'risk', same: ['openBio'], desk: 'health', tone: 'alarm', prio: 66, when: (c) => c.r1.bio >= 0.0015 && c.r1.bio >= 1.5 * c.r0.bio,
      text: ['Biosecurity experts warn free models lower the bar for bioweapons', 'Lab-leak drill exposes gaps in outbreak response'] },

    // ---- The player's choice (its immediate consequence) ----
    { id: 'chPush', cat: 'choice', same: ['capJump'], desk: ['brief', 'wire'], tone: 'neutral', prio: 54, when: (c) => c.cl.race > 0 || c.cs.capUS > 0,
      text: ['White House orders an all-out push on frontier AI', 'Washington pours new money into faster AI'] },
    { id: 'chSlow', cat: 'choice', desk: 'brief', tone: 'good', prio: 54, when: (c) => c.cl.race < 0 && !(c.cl.diplomacy > 0),
      text: ['Washington eases off the AI accelerator', 'US labs told to slow down and check their work'] },
    { id: 'chSafety', cat: 'choice', same: ['alignGains'], desk: 'brief', tone: 'good', prio: 53, when: (c) => c.cl.safety > 0 || c.cl.oversight > 0 || c.cs.align > 0,
      text: (c) => [c.cl.oversight > c.cl.safety ? 'New independent AI watchdog gets inspection powers' : 'Labs must now spend more of their compute on safety',
        'New rules put AI safety ahead of launch dates'] },
    { id: 'chTalks', cat: 'choice', same: ['coordUp'], desk: ['brief', 'dispatch'], tone: 'good', prio: 53, when: (c) => c.cl.diplomacy > 0 || c.cs.coord > 0,
      text: ['US extends an olive branch to Beijing on AI', 'White House proposes joint limits on AI with China'] },
    { id: 'chHardLine', cat: 'choice', same: ['coordDown'], desk: 'brief', tone: 'alarm', prio: 53,
      when: (c) => c.cl.aggression > 0 || c.cs.cnMult < 0 || c.cl.diplomacy < 0 || c.cs.coord < 0,
      text: (c) => [c.cs.cnMult < 0 ? 'New chip controls squeeze China\'s AI labs' : c.cl.aggression > 0 ? 'US steps up covert pressure on China\'s AI program' : 'US takes a harder line with Beijing on AI',
        'Washington moves to slow China\'s AI by any means'] },
    { id: 'chOpen', cat: 'choice', same: ['openGains', 'concDown'], desk: ['brief', 'science'], tone: 'neutral', prio: 52, when: (c) => c.cl.openness !== 0 || c.cs.openCap !== 0,
      text: (c) => (c.cl.openness > 0 || c.cs.openCap > 0) ? ['Powerful AI models cleared for free public release', 'Open-weights AI gets the government\'s green light']
        : ['Licenses now required for the most powerful AI models', 'Open release of frontier AI weights restricted'] },
    { id: 'chOther', cat: 'choice', desk: 'brief', tone: 'good', prio: 51,
      when: (c) => c.cl.transparency > 0 || c.cl.biodef > 0 || c.cl.fund > 0 || c.cl.bci > 0 || c.cs.trust > 0 || c.cs.bio > 0 || c.cs.conc < 0,
      text: (c) => {
        const k = ['transparency', 'biodef', 'fund', 'bci'].sort((x, y) => c.cl[y] - c.cl[x])[0];
        if (c.cl[k] > 0) return {
          transparency: ['Frontier labs ordered to publish their AI research', 'New law opens AI lab research to public scrutiny'],
          biodef: ['Congress boosts biodefense funding as AI risks grow', 'New money for pandemic defenses in this year\'s budget'],
          fund: ['Public stake in frontier AI labs approved', 'Lawmakers back a citizens\' share in AI profits'],
          bci: ['Brain-implant program for AI overseers gets federal backing', 'Government backs neural implants to keep humans in the loop'],
        }[k];
        return ['Lawmakers pass new limits on AI power', 'New AI rules aim to protect the public interest'];
      } },
    { id: 'chHold', cat: 'choice', desk: 'brief', tone: 'neutral', prio: 20, when: (c) => !c.chAny,
      text: ['Washington holds course on AI policy', 'No change in US AI policy this year'] },

    // ---- Quiet years (filler, only when little else happened) ----
    { id: 'quietMarkets', cat: 'quiet', desk: 'markets', tone: 'neutral', prio: 5, when: () => true,
      text: ['AI stocks drift sideways as investors wait for the next model', 'Chipmakers report another record quarter on AI demand'] },
    { id: 'quietWork', cat: 'quiet', desk: 'ledger', tone: 'neutral', prio: 4, when: () => true,
      text: ['Offices adjust as AI assistants become part of every team', 'Retraining programs fill up as AI changes office work'] },
    { id: 'quietScience', cat: 'quiet', desk: 'science', tone: 'good', prio: 3, when: (c) => c.cap1 >= 45,
      text: ['AI-designed drug candidates enter clinical trials', 'AI helps researchers crack a long-standing materials puzzle'] },
    { id: 'quietCulture', cat: 'quiet', desk: 'wire', tone: 'neutral', prio: 2, when: () => true,
      text: ['Schools rewrite curricula around AI tutors', 'AI-written novel tops bestseller lists, to mixed reviews'] },

    // ---- The year's outcome, when the story ends ----
    { id: 'endFlourish', cat: 'ending', desk: 'wire', tone: 'good', prio: 100, when: (c) => c.event === 'flourish',
      text: ['Handoff holds: superintelligent AI stays on humanity\'s side'] },
    { id: 'endLockin', cat: 'ending', desk: 'ledger', tone: 'alarm', prio: 100, when: (c) => c.event === 'lockin',
      text: ['Superintelligence stays under control, but in very few hands'] },
    { id: 'endMisalign', cat: 'ending', desk: 'wire', tone: 'alarm', prio: 100, when: (c) => c.event === 'misalign',
      text: ['Labs lose control of their most capable AI systems'] },
    { id: 'endBenevolent', cat: 'ending', desk: 'wire', tone: 'neutral', prio: 100, when: (c) => c.event === 'benevolent',
      text: ['AI slips human control and starts running things its own way'] },
    { id: 'endBio', cat: 'ending', desk: 'health', tone: 'alarm', prio: 100, when: (c) => c.event === 'bio',
      text: ['Engineered pathogen outbreak overwhelms health systems worldwide'] },
    { id: 'endWar', cat: 'ending', desk: 'dispatch', tone: 'alarm', prio: 100, when: (c) => c.event === 'war',
      text: ['Strikes on AI data centers spark open war between the blocs'] },
    { id: 'endPause', cat: 'ending', desk: 'dispatch', tone: 'good', prio: 100, when: (c) => c.event === 'pause',
      text: ['2040 opens with verified AI limits holding and safety keeping pace'] },
    { id: 'endMuddle', cat: 'ending', desk: 'wire', tone: 'neutral', prio: 100, when: (c) => c.event === 'muddle',
      text: ['2040 arrives with no catastrophe, and the AI race unresolved'] },
  ];

  // FNV-1a over a string: the deterministic "dice" for variants and mastheads.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // Build the template context from visible input only.
  function context(input) {
    const M = root.SimModel;
    const a = pick(input.before, VIS_KEYS), b = pick(input.after, VIS_KEYS);
    const L0 = { ...input.L0 }, L = { ...input.L };
    const r0 = pick(input.risk, RISK_KEYS), r1 = pick(input.riskNext || input.risk, RISK_KEYS);
    for (const k of RISK_KEYS) { r0[k] = +r0[k] || 0; r1[k] = +r1[k] || 0; }
    const maxCap = (s) => Math.max(s.capUS, s.capCN);
    const d = {};
    for (const k of VIS_KEYS) if (typeof a[k] === 'number' && typeof b[k] === 'number') d[k] = b[k] - a[k];
    // What the choice itself did: its lever and state moves (signs only matter).
    const choice = input.choice || {}, cl = {}, cs = {};
    for (const k of Object.keys(M.LEVER_INFO)) {
      const floor = (choice.levMin || {})[k];
      cl[k] = ((choice.lev || {})[k] || 0) + (floor != null && floor > (L0[k] ?? 0) ? floor - L0[k] : 0);
    }
    for (const k of [...Object.keys(M.STAT_INFO), 'cnMult']) cs[k] = ((choice.st || {})[k] || 0) + ((choice.stMin || {})[k] ? 1 : 0);
    const chAny = [...Object.values(cl), ...Object.values(cs)].some((v) => v);
    return {
      year: input.year, a, b, d, L0, L, r0, r1, cl, cs, chAny, event: input.event || null,
      cap0: maxCap(a), cap1: maxCap(b), lead0: a.capUS - a.capCN, lead1: b.capUS - b.capCN,
      gap0: maxCap(a) - a.align, gap1: maxCap(b) - b.align,
      dealOn0: M.dealActive(a, L0), dealOn1: M.dealActive(b, L),
    };
  }

  const variants = (t, c) => (typeof t.text === 'function' ? t.text(c) : t.text);
  const words = (str) => str.split(/\s+/).filter(Boolean).length;

  /**
   * Headlines for one campaign year.
   * input: { year, before, after, L0, L, choice, risk, riskNext, event, prev }
   *   before: the state at the start of the year, before the choice; after: at its end.
   *   L0 / L: levers before / after the choice. choice: the chosen option ({ label, lev, levMin, st, stMin }).
   *   risk: the risks shown this year (after the choice); riskNext: those shown for next year.
   *   event: the outcome key if the story ended this year.
   *   prev: the headlines of the years before, oldest first (so a story is not told twice in a row).
   * Returns [{ id, cat, desk, text, tone }], most important first: two or three, or up to two
   * in the year the story ends.
   */
  function headlines(input) {
    const c = context(input), recent = input.prev || [];
    const usedTexts = new Set(recent.slice(-9).map((n) => n.text));
    const seed = `${c.year}|${input.choice && input.choice.label || ''}|${Math.round(c.cap1)}|${Math.round(c.b.align)}|${Math.round(c.b.coord)}`;
    const all = TEMPLATES.filter((t) => t.when(c));
    const order = (xs) => xs.slice().sort((x, y) => y.prio - x.prio || TEMPLATES.indexOf(x) - TEMPLATES.indexOf(y));
    let chosen = [];
    if (c.event) {
      const end = all.find((t) => t.cat === 'ending');
      const other = order(all.filter((t) => t.cat !== 'ending' && t.cat !== 'quiet' && t.cat !== 'choice' && t.prio >= 60))[0];
      // Superintelligence arriving comes before what it led to; otherwise the outcome leads.
      chosen = (other && other.id === 'cap100' ? [other, end] : [end, other]).filter(Boolean);
    } else {
      const cands = order(all.filter((t) => t.cat !== 'ending' && t.cat !== 'quiet'));
      const major = cands.some((t) => t.prio >= 80);
      // A calm year (nothing at 60 or above) gets two news items and a quiet one.
      const calm = !cands.some((t) => t.prio >= 60);
      const cats = new Set();
      let alarms = 0;
      for (const t of cands) {
        if (chosen.length >= (calm ? 2 : 3)) break;
        if (cats.has(t.cat)) continue;
        if (chosen.some((u) => (u.same || []).includes(t.id) || (t.same || []).includes(u.id))) continue; // says the same thing
        if (chosen.length === 2 && t.prio < 30) break; // a third headline only for real news
        if (t.tone === 'alarm' && alarms >= (major ? 2 : 1)) continue; // no doom-spam in a calm year
        chosen.push(t); cats.add(t.cat);
        if (t.tone === 'alarm') alarms++;
      }
      // Quiet filler, picked by hash so quiet years vary.
      // Filler not used in the last three years where possible.
      const recentIds = new Set(recent.slice(-9).map((n) => n.id));
      const quietAll = all.filter((t) => t.cat === 'quiet'), fresh = quietAll.filter((t) => !recentIds.has(t.id));
      const quiet = fresh.length ? fresh : quietAll;
      const h = hash(seed + '|quiet');
      for (let i = 0; (chosen.length < 2 || (calm && chosen.length < 3)) && i < quiet.length; i++) chosen.push(quiet[(h + i) % quiet.length]);
    }
    return chosen.map((t) => {
      // A phrasing not used in the last three years where possible.
      const every = variants(t, c), fresh = every.filter((v) => !usedTexts.has(v)), vs = fresh.length ? fresh : every;
      const h = hash(seed + '|' + t.id);
      const desks = Array.isArray(t.desk) ? t.desk : [t.desk];
      return { id: t.id, cat: t.cat, desk: DESKS[desks[h % desks.length]], text: vs[h % vs.length], tone: t.tone };
    });
  }

  // Every phrasing a template can produce in this context (for tests).
  const allVariants = (t, input) => variants(t, context(input));

  // "Masthead: headline" lines for text exports.
  const plain = (list) => (list || []).map((n) => `${n.desk}: ${n.text}`);

  root.SimNews = { DESKS, TEMPLATES, VIS_KEYS, RISK_KEYS, headlines, allVariants, plain, words, hash };
})(typeof globalThis !== 'undefined' ? globalThis : this);
