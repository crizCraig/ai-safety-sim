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
 * A template: { id, cat, desk, tone, prio, when(c), text: [variants], deck, caption, img, same? }. The year-end
 * front page prints each story's headline with its `deck` (a one-line summary), its body (BODY[id]: two to
 * four sentences built from the visible numbers) and, for the lead only, a photo (`img`, a key of IMAGES)
 * with its `caption` and a fictional credit; each is a string or a function of (c, headline). The economy
 * figures (economyOf) are illustrative flavour derived from the visible state, not model outputs. `text` entries are strings
 * or functions of the context `c`; `desk` is a masthead key (or a list, one picked by hash);
 * `tone` 'alarm' marks bad news (a calm year shows at most one); `prio` orders the year's
 * candidates so the most important change leads; `same` lists templates that would repeat it
 * (only the first of them is shown). See AGENTS.md "A headline template".
 */
(function (root) {
  'use strict';

  // Fictional mastheads only.
  const DESKS = {
    wire: 'Wire Desk', ledger: 'Business Desk', dispatch: 'Global Dispatch', brief: 'Policy Brief',
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
  // The categories of the bright slot (economy, science, medicine).
  const BRIGHT = ['economy', 'science', 'medicine'];
  const up = (c, k, t) => c.a[k] < t && c.b[k] >= t;
  const down = (c, k, t) => c.a[k] >= t && c.b[k] < t;
  const pctRound = (x) => Math.round(x);
  // The lever chOther's story is about: the one the choice raised most, or null.
  const otherKey = (c) => { const k = ['transparency', 'biodef', 'fund', 'bci'].sort((x, y) => c.cl[y] - c.cl[x])[0]; return c.cl[k] > 0 ? k : null; };
  // The paper's story pictures (assets/news/<key>.webp); an ending's story uses its ending picture ('ending:<outcome>').
  const IMAGES = ['research', 'expert', 'superintelligence', 'datacentre', 'idle', 'safetylab', 'testscare', 'talks', 'inspectors',
    'collapse', 'warroom', 'chinalab', 'uslab', 'markets', 'jobs', 'delegation', 'hearing', 'protest', 'townhall', 'fund',
    'openmodel', 'biolab', 'discovery', 'classroom', 'everyday', 'jobcentre', 'powerplant', 'orbit', 'lagging', 'materials',
    'climate', 'clinic', 'trial', 'end_flourish', 'end_lockin', 'end_misalign', 'end_benevolent', 'end_bio', 'end_war', 'end_pause', 'end_muddle'];

  // ---- The economy: illustrative figures, not model outputs ----
  // The model has no GDP, jobs or spending. These figures are flavour for the paper, derived only
  // from the visible state (capability, delegation, the fund's stake, coordination, open models)
  // and the levers, by simple monotone mappings anchored to real 2025–26 figures:
  //   unemployment 4.2%: US BLS, September 2026 Employment Situation (released 2 Oct 2026);
  //   real GDP growth 2.2%: US BEA, full-year 2025 (advance Q4 estimate);
  //   AI capex $725B: 2026 capex guidance of Amazon, Microsoft, Alphabet and Meta combined, up from
  //     about $410B in 2025 (company guidance as tallied by the Financial Times, 2026);
  //   AI data-centre power ~30 GW in late 2025: Epoch AI, "AI data center power" data insight; ~45 GW
  //     assumed for the end of 2026;
  //   compute in orbit 0: Starcloud-1 flew a single data-centre GPU (an H100) in November 2025, a demo.
  // Each year's figures move part of the way toward a target set by that year's visible state, from
  // last year's stored figures (index.html keeps them in each year's record), so they are smooth
  // across years and never contradict last year's paper.
  const ECON_BASE = Object.freeze({ year: 2026, unemp: 4.2, gdp: 2.2, gap: 1.0, capex: 725, capexGrowth: 0.77, power: 45, newPower: 15,
    orbit: 0, drugs: 0, newDrugs: 0, displaced: 0.3 });
  const PLACES = ['West Texas', 'Ohio', 'Arizona', 'Wyoming', 'Quebec', 'northern Norway', 'Finland', 'Saudi Arabia', 'the United Arab Emirates',
    'Malaysia\'s Johor state', 'Inner Mongolia', 'Guizhou', 'Chile\'s Atacama desert', 'Kenya\'s Rift Valley', 'Tamil Nadu', 'northern Spain'];
  const clampN = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const ramp = (x, a, b) => clampN((x - a) / (b - a), 0, 1);
  // The year's targets from the visible state alone (exported for tests: each is monotone in its inputs).
  //   unemployment: rises with capability past 55 and sharply past the Automated Coder (70), more the
  //     more decisions are delegated to AI; the public fund's dividends cushion it (spending holds up);
  //   GDP growth: rises with capability, most past the Automated Coder, plus a little for a fast year;
  //   the gap between AI-adopting and lagging economies: grows with the AI boom, narrowed by open
  //     models (cheap AI spreads) and by US–China coordination.
  function econTargets(b, L, dcap) {
    const c = Math.max(b.capUS, b.capCN), deleg = clampN(b.deleg, 0, 100), fund = clampN(b.fundStake || 0, 0, 100);
    const unemp = clampN(4.2 + (1.5 * ramp(c, 55, 70) + 22 * ramp(c, 70, 100) ** 1.3 * (0.5 + deleg / 100)) * (1 - 0.3 * fund / 100), 0, 60);
    const gdp = clampN(2.2 + 1.0 * ramp(c, 45, 70) + 8 * ramp(c, 70, 100) ** 1.5 + 0.06 * clampN(dcap, 0, 15) - (dcap < 0.5 && c > 40 ? 0.6 : 0), -3, 15);
    const gap = clampN(0.8 + 0.6 * Math.max(0, gdp - 2.2) * (1 - 0.5 * clampN(L.openness ?? 0.45, 0, 1)) * (1 - 0.4 * clampN(b.coord, 0, 100) / 100), 0, 12);
    // The share of workers whose job was automated this year (most find other work).
    const displaced = clampN(0.3 + 0.8 * ramp(c, 50, 70) + 6 * ramp(c, 70, 100) * (0.5 + deleg / 100), 0, 20);
    return { unemp, gdp, gap, displaced };
  }
  // This year's figures from last year's (or the 2026 baseline) and the year's visible change.
  function economyOf(prev, a, b, L) {
    const p = prev || ECON_BASE, c1 = Math.max(b.capUS, b.capCN), dcap = c1 - Math.max(a.capUS, a.capCN);
    const t = econTargets(b, L, dcap);
    // Part of the way toward the target, at most `step` a year (no overnight shocks).
    const toward = (x0, x1, k, step) => x0 + clampN(k * (x1 - x0), -step, step);
    // Spending grows with the year's capability gain and the race lever, and falls when scaling stops.
    const capexGrowth = clampN(0.04 + 0.025 * dcap + 0.25 * ((L.race ?? 0.7) - 0.5), -0.25, 0.5);
    const capex = Math.min(25000, p.capex * (1 + capexGrowth));
    const newPower = capex / 40; // ~$40B of capex per gigawatt of AI data centre, chips included
    const orbit = p.orbit > 0 ? Math.min(0.2 * (p.power + newPower), p.orbit * (2 + 2 * ramp(c1, 78, 100)) * (capexGrowth > 0 ? 1 : 0.8)) : c1 >= 78 ? 1 : 0;
    const newDrugs = Math.round(14 * ramp(c1, 55, 100) ** 1.2);
    return {
      unemp: clampN(toward(p.unemp, t.unemp, 0.6, 3.5), 0, 60), gdp: clampN(toward(p.gdp, t.gdp, 0.7, 2.5), -3, 15),
      gap: clampN(toward(p.gap, t.gap, 0.6, 1.5), 0, 12), displaced: t.displaced, capex, capexGrowth, power: p.power + newPower, newPower, orbit,
      drugs: p.drugs + newDrugs, newDrugs, place: PLACES[hash(`${b.year}|${Math.round(c1)}`) % PLACES.length],
    };
  }
  // The year's figures from a headline input ({ before, after, L, econ0 }), visible fields only.
  const economy = (input) => economyOf(input.econ0 || null, pick(input.before, VIS_KEYS), pick(input.after, VIS_KEYS), { ...input.L });
  // Fictional photographers for the lead photo's credit line.
  const PHOTOGRAPHERS = ['Ana Ferreira', 'Tomas Lindqvist', 'Grace Okafor', 'Dev Raman', 'Mei Lin Ho', 'Sam Whitlock', 'Ines Duarte',
    'Jonah Abara', 'Clara Vos', 'Ravi Menon', 'Lucy Hartigan', 'Omar Haddad'];
  const credit = (year, id) => `${PHOTOGRAPHERS[hash(`${year}|${id}|photo`) % PHOTOGRAPHERS.length]} for The Ledger`;

  // ---- Body text: numbers the player can see, in newspaper sentences ----
  const R = Math.round, f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const ptsW = (n) => `${n} point${n === 1 ? '' : 's'}`;
  // "rose 6 points to 58", "fell 2 points to 40" or "held at 58".
  const moved = (d, to) => { const n = R(Math.abs(d)); return n === 0 ? `held at ${R(to)}` : `${d > 0 ? 'rose' : 'fell'} ${ptsW(n)} to ${R(to)}`; };
  const money = (b) => (b >= 1000 ? `$${(b / 1000).toFixed(1)} trillion` : `$${R(b)} billion`);
  const gwTxt = (gw) => `${R(gw).toLocaleString('en-US')} gigawatts`;
  const orbitTxt = (mw) => (mw >= 1000 ? `${(mw / 1000).toFixed(1)} gigawatts` : `${R(mw)} megawatt${R(mw) === 1 ? '' : 's'}`);
  const riskTxt = (p) => (p < 0.001 ? 'under 0.1%' : p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${R(p * 100)}%`);
  // The unemployment line just crossed this year (30, 20 or 10%), or null.
  const jobsLine = (c) => [30, 20, 10].find((t) => c.e0.unemp < t && c.e.unemp >= t) ?? null;
  // Fact sentences. Each reads only the visible context (c.a, c.b, c.d, the shown risks, the economy).
  const F = {
    cap: (c) => `US frontier capability ${moved(c.d.capUS, c.b.capUS)} on the standard 100-point index this year, and China's best ${moved(c.d.capCN, c.b.capCN)}.`,
    lead: (c) => (R(c.lead1) === 0 ? 'That leaves the two sides level.' : `That leaves ${c.lead1 > 0 ? 'American' : 'Chinese'} labs ${ptsW(R(Math.abs(c.lead1)))} ahead.`),
    align: (c) => `The alignment index, which tracks how well labs can check and steer their models, ${moved(c.d.align, c.b.align)}, ${R(c.gap1) > 0 ? `${ptsW(R(c.gap1))} behind the frontier` : 'level with the frontier'}.`,
    coord: (c) => `The index of US–China coordination on AI ${moved(c.d.coord, c.b.coord)} out of 100.`,
    deleg: (c) => `Analysts estimate ${R(c.b.deleg)}% of consequential decisions are now left to AI with little human review, against ${R(c.a.deleg)}% a year ago.`,
    trust: (c) => `Public trust in how AI is run ${moved(c.d.trust, c.b.trust)} on a 100-point index.`,
    conc: (c) => `The index of how concentrated power over AI has become ${moved(c.d.conc, c.b.conc)} out of 100.`,
    open: (c) => `The best free, downloadable model ${moved(c.d.openCap, c.b.openCap)} on the capability index.`,
    bio: (c) => `Biodefence readiness, from DNA screening to vaccine stockpiles, ${moved(c.d.bio, c.b.bio)} out of 100.`,
    internal: (c) => `The gap between the AI labs run in-house and what outsiders can see ${moved(c.d.internal, c.b.internal)}.`,
    fund: (c) => (c.b.fundStake >= 0.5 ? `The public wealth fund now owns ${R(c.b.fundStake)}% of frontier AI and pays its dividends to every citizen.` : 'The public holds no stake in frontier AI.'),
    bci: (c) => `Neural-interface adoption ${moved(c.d.bci, c.b.bci)} on its 100-point index.`,
    riskLoc: (c) => `Forecasters put the coming year's chance of losing control of AI at ${riskTxt(c.r1.misalign)}.`,
    riskWar: (c) => `Forecasters put the coming year's chance of war between the blocs at ${riskTxt(c.r1.war)}.`,
    riskBio: (c) => `Forecasters put the coming year's chance of an engineered pandemic at ${riskTxt(c.r1.bio)}.`,
    jobs: (c) => `Unemployment stands at ${f1(c.e.unemp)}%, against ${f1(c.e0.unemp)}% a year ago, and about ${f1(c.e.displaced)}% of workers lost a job to automation this year.`,
    gdp: (c) => `The economy grew ${f1(c.e.gdp)}% this year, after ${f1(c.e0.gdp)}% the year before.`,
    gap: (c) => `The economies quickest to adopt AI grew about ${f1(c.e.gap)} points a year faster than the rest, economists estimate.`,
    capex: (c) => `Spending on AI chips and data centres ${c.e.capexGrowth >= 0 ? 'rose' : 'fell'} ${R(Math.abs(c.e.capexGrowth) * 100)}% to ${money(c.e.capex)} this year.`,
    power: (c) => `New AI data centres added about ${gwTxt(c.e.newPower)} of demand this year, the largest in ${c.e.place}, for ${gwTxt(c.e.power)} in all.`,
    orbit: (c) => `Data centres in orbit now supply ${orbitTxt(c.e.orbit)} of computing power, all of it solar.`,
    drugs: (c) => (c.e.drugs ? `Regulators have now approved ${c.e.drugs} AI-designed drug${c.e.drugs === 1 ? '' : 's'}, ${c.e.newDrugs} of them this year.` : null),
    cushion: (c) => (c.b.fundStake >= 5 ? `Dividends from the public wealth fund, which owns ${R(c.b.fundStake)}% of frontier AI, softened the blow for many households.` : null),
  };
  // Each template's body: a bespoke sentence or two and the facts it rests on (2–4 sentences).
  const BODY = {
    cap50: ['"It now does a real share of the work," one lab researcher said.', F.cap, F.align],
    cap70: ['Labs say AI agents now write most new code and run many of the experiments, so progress may speed up.', F.cap, F.align],
    cap78: ['"It holds its own with our best people now," a senior scientist said.', F.cap, F.align, F.riskLoc],
    cap90: ['Researchers say it is getting harder to check the newest systems\' work.', F.cap, F.align, F.riskLoc],
    cap100: ['What happens next depends on whether these systems stay aligned, researchers say.', F.cap, F.align],
    cnOvertakes: [F.cap, F.lead, '"The gap closed faster than anyone in Washington expected," one analyst said.'],
    usPullsClear: [F.cap, F.lead, F.coord],
    cnCloses: [F.cap, F.lead, 'Officials in Washington say they are watching closely.', F.coord],
    gapWidens: [F.cap, F.lead, F.coord],
    capJump: [F.cap, 'Forecasters had expected slower progress, and several are revising their timelines.', F.align],
    capStall: ['Labs kept their frontier models at last year\'s level while the halt held.', F.cap, F.align],
    alignLeap: [F.align, '"For the first time we can read some of what a model is planning," one safety researcher said.', F.cap],
    alignGains: [F.align, F.cap, 'Researchers caution that a model can learn to pass a test without being safe.'],
    alignLags: [F.align, F.cap, F.riskLoc],
    alignCatches: [F.align, F.cap, '"We are finally gaining ground," a lab spokesperson said.'],
    deleg20: [F.deleg, 'Firms say AI agents are faster and cheaper; critics say fewer people understand the decisions.', F.trust],
    deleg35: [F.deleg, 'Auditors say approvals now take seconds, too fast for a real review.', F.trust],
    deleg50: [F.deleg, 'Officials say they cannot keep up with the volume without AI.', F.trust],
    delegBack: [F.deleg, 'Companies must now name a person responsible for each major decision.', F.trust],
    internalUp: [F.internal, '"What the public sees is no longer the frontier," one former lab employee said.', F.cap],
    internal40: [F.internal, '"What the public sees is no longer the frontier," one former lab employee said.', F.cap],
    internalDown: [F.internal, 'Auditors say they can now see what labs run in-house.', F.trust],
    concUp: [F.conc, F.fund, F.trust],
    concDown: [F.conc, F.open, F.trust],
    trustDown: [F.trust, F.conc, 'Organisers say they want a say in how AI is run.'],
    trustUp: [F.trust, F.coord],
    fundStake: [F.fund, F.conc, 'Supporters say it lets everyone share in the gains from AI.'],
    dealFormed: ['Inspectors from both sides will check data centres and declared chip stocks.', F.coord, F.cap],
    dealCollapsed: ['Each side accuses the other of cheating.', F.coord, F.cap],
    dealImpaired: [F.coord, F.cap, 'Diplomats on both sides say they hope to restore it.'],
    dealLapsed: [F.coord, F.cap],
    dealHolds: [F.cap, F.coord, F.align],
    coordUp: [F.coord, F.lead, '"Neither side wins a race nobody controls," a State Department official said.'],
    coordDown: [F.coord, F.lead, F.riskWar],
    openBio: [F.open, F.bio, 'Biosecurity experts are calling for wider screening of DNA orders.'],
    openGains: [F.open, F.cap],
    biodefUp: [F.bio, F.riskBio],
    riskLocSpike: ['The lab says the model was stopped before it did any harm.', F.riskLoc, F.align],
    riskLocHigh: ['The lab says the system was contained before it did any harm.', F.riskLoc, F.align],
    riskLocFalls: [F.riskLoc, F.align],
    riskWar: [F.riskWar, F.coord, F.lead],
    riskBio: [F.riskBio, F.open, F.bio],
    chPush: ['The administration says the new money will keep US labs ahead.', F.cap, F.lead],
    chSlow: ['Officials say labs should spend more time testing what they build.', F.cap, F.align],
    chSafety: [F.align, F.cap, '"Safety is now part of the launch plan, not an afterthought," a lab spokesperson said.'],
    chTalks: [F.coord, '"Neither side wins a race nobody controls," a State Department official said.', F.lead],
    chHardLine: [F.coord, F.lead, F.riskWar],
    chOpen: [F.open, F.cap],
    chOther: (c) => ({ transparency: [F.internal, F.trust], biodef: [F.bio, F.riskBio], fund: [F.fund, F.conc], bci: [F.bci, 'Volunteers in pilot programmes say the implants help them follow what AI systems are doing.'] }[otherKey(c)] || [F.conc, F.trust]),
    chHold: [F.cap, F.align],
    econJobsShock: [F.jobs, F.cushion, '"The jobs that are going are not coming back in the same form," a labour economist said.', F.gdp],
    econJobsUp: [F.jobs, F.cushion, F.gdp],
    econJobsDown: [F.jobs, F.gdp, 'Retraining courses for skilled trades are full in many cities.'],
    econBoom: [F.gdp, F.capex, F.jobs],
    econSlow: [F.gdp, F.capex, F.jobs],
    econGap: [F.gap, F.gdp, 'Development economists say poorer countries lack the chips, power and skilled staff to keep up.'],
    econGapNarrows: [F.gap, F.open, F.gdp],
    econCapex: [F.capex, F.power, F.gdp],
    econCapexCut: [F.capex, F.cap, F.gdp],
    econPower: [F.power, F.capex, 'Utilities are reopening old plants and fast-tracking new lines to keep up.'],
    econOrbit: ['The satellite draws its power from the sun and sheds its heat into space.', F.orbit, F.power],
    econOrbitGrows: [F.orbit, F.power, 'Engineers say launch costs, not chips, now set the pace.'],
    sciMaterials: ['The team says the AI proposed thousands of candidates and picked the few worth making.', F.cap, '"It saved us years," one of the researchers said.'],
    sciClimate: ['Researchers say the work still needs to be proved at scale.', F.cap, '"This is the kind of help we hoped AI would bring," one climate scientist said.'],
    sciMaths: ['The AI also wrote a version that a computer proof checker confirmed.', F.cap, '"It is a beautiful argument," one mathematician said.'],
    sciFusion: ['Engineers say a working power plant is now a matter of building, not discovery.', F.cap, F.power],
    medScreen: ['Doctors say earlier diagnosis means simpler treatment and better survival.', F.drugs, F.cap],
    medDrugs: [F.drugs, 'Doctors say AI-designed drugs reach patients in a fraction of the usual time.', F.cap],
    medTrial: ['Patients in the trial did markedly better than those on standard care.', F.drugs, F.cap],
    medCure: ['"Families who had no options now have treatments," one physician said.', F.drugs, F.cap],
    quietMarkets: ['Chipmakers report strong demand.', F.capex, F.gdp],
    quietWork: [F.jobs, 'Retraining courses are full in many cities.', F.deleg],
    quietScience: ['Several AI-designed drug candidates are now in human trials.', F.drugs, F.cap],
    quietCulture: (c, t) => (/Schools/.test(t) ? ['Teachers say pupils get more one-to-one help than ever.', F.cap] : ['Publishers report strong sales; some authors are less pleased.', F.cap]),
    endFlourish: [F.cap, F.align, '"We kept our hands on the wheel," one safety researcher said.'],
    endLockin: [F.conc, F.fund, F.trust],
    endMisalign: [F.cap, F.align, 'Engineers say the systems no longer respond to shutdown commands.'],
    endBenevolent: [F.cap, F.deleg, 'So far, the systems in charge appear to look after people\'s welfare.'],
    endBio: [F.open, F.bio, 'Health systems around the world are overwhelmed.'],
    endWar: [F.coord, F.lead, 'Civil defence volunteers are running shelters in many cities.'],
    endPause: [F.cap, F.align, F.coord],
    endMuddle: [F.cap, F.align, F.coord],
  };
  // Facts that can fill out a body whose own facts were already printed higher up the page.
  const SPARE = [F.coord, F.trust, F.gdp, F.jobs, F.capex, F.open, F.bio, F.conc];
  // The sentences of a story's body (2–4), from its BODY entry.
  function bodyOf(t, c, text) {
    const b = BODY[t.id], list = typeof b === 'function' ? b(c, text) : b || [F.cap, F.align];
    return list.map((x) => (typeof x === 'function' ? x(c) : x)).filter(Boolean).slice(0, 4);
  }

  const TEMPLATES = [
    // ---- Capability milestones ----
    { id: 'cap50', cat: 'milestone', desk: ['science', 'wire'], tone: 'neutral', prio: 90, when: (c) => c.cap0 < 50 && c.cap1 >= 50,
      text: ['Labs say AI now speeds up their own AI research', 'AI systems now do a real share of AI research, labs confirm'],
      deck: 'Frontier labs report their AI systems now do a real share of the work of building the next ones.',
      caption: 'Researchers watch AI agents run experiments.', img: 'research' },
    { id: 'cap70', cat: 'milestone', desk: ['science', 'wire'], tone: 'alarm', prio: 95, when: (c) => c.cap0 < 70 && c.cap1 >= 70,
      text: ['First Automated Coder: AI now writes most of its own code', 'Frontier lab: AI agents now do most of its coding'],
      deck: 'Labs say AI agents now write most of the code for new models, speeding up progress further.',
      caption: 'A research floor where AI writes most of the code.', img: 'research' },
    { id: 'cap78', cat: 'milestone', desk: ['science', 'wire'], tone: 'alarm', prio: 96, when: (c) => c.cap0 < 78 && c.cap1 >= 78,
      text: ['New AI matches top human experts across most research fields', 'AI now rivals the best human scientists, benchmarks show'],
      deck: 'Benchmarks show the newest AI performing at the level of leading human researchers in most fields.',
      caption: 'Scientists review research produced by an AI.', img: 'expert' },
    { id: 'cap90', cat: 'milestone', desk: ['science', 'wire'], tone: 'alarm', prio: 97, when: (c) => c.cap0 < 90 && c.cap1 >= 90,
      text: ['Latest AI outperforms the best human experts at nearly everything', 'Top experts can no longer keep up with frontier AI'],
      deck: 'The newest systems beat the best human experts on nearly every test researchers can devise.',
      caption: 'Experts compare their work with the latest AI.', img: 'expert' },
    { id: 'cap100', cat: 'milestone', desk: 'wire', tone: 'alarm', prio: 99, when: (c) => c.cap0 < 100 && c.cap1 >= 100,
      text: ['Superintelligence arrives: AI now surpasses humans at everything', 'The first superintelligent AI system comes online'],
      deck: 'Frontier AI now outperforms people at every task tested. What follows depends on whether it stays aligned.',
      caption: 'Dawn over a frontier data centre.', img: 'superintelligence' },

    // ---- The race ----
    { id: 'cnOvertakes', cat: 'race', desk: 'dispatch', tone: 'alarm', prio: 85, when: (c) => c.lead0 >= 0 && c.lead1 < 0,
      text: ['China\'s best AI overtakes America\'s, analysts conclude', 'Beijing takes the lead in the AI race'],
      deck: 'Analysts now rate China\'s best AI system ahead of America\'s for the first time.',
      caption: 'Engineers at a Chinese lab celebrate a result.', img: 'chinalab' },
    { id: 'usPullsClear', cat: 'race', desk: 'dispatch', tone: 'neutral', prio: 75, when: (c) => c.lead0 <= 3 && c.lead1 >= c.lead0 + 3,
      text: (c) => c.lead0 < 0 ? ['US labs retake the AI lead from China', 'America pulls back in front in the AI race']
        : ['US labs pull clear of China in the AI race', 'America breaks away from China at the AI frontier'],
      deck: (c) => c.lead0 < 0 ? 'American labs move back in front of China\'s after a year of fast progress.' : 'American labs open a clear lead over China\'s best AI systems this year.',
      caption: 'Engineers on a US lab campus.', img: 'uslab' },
    { id: 'cnCloses', cat: 'race', desk: 'dispatch', tone: 'neutral', prio: 55, when: (c) => c.lead1 >= 0 && c.lead1 < c.lead0 - 2.5,
      text: (c) => [c.lead1 < 3 ? 'China\'s labs draw level with America\'s best AI' : 'China narrows the gap with US frontier labs',
        'Chinese AI closes in on the American frontier'],
      deck: 'Chinese labs gained ground on America\'s best AI this year, narrowing a gap Washington hoped to keep.',
      caption: 'Engineers at a Chinese AI lab.', img: 'chinalab' },
    { id: 'gapWidens', cat: 'race', desk: 'dispatch', tone: 'neutral', prio: 50,
      when: (c) => (c.lead0 >= 0 && c.lead1 > c.lead0 + 2.5) || (c.lead0 < 0 && c.lead1 < c.lead0 - 2.5),
      text: (c) => c.lead1 >= 0 ? ['US labs pull further ahead of China in AI', 'America widens its lead in frontier AI']
        : ['China extends its lead in frontier AI', 'Chinese labs pull further ahead of the US'],
      deck: (c) => c.lead1 >= 0 ? 'America\'s lead over China in frontier AI grew again this year, analysts estimate.' : 'China\'s lead over America in frontier AI grew again this year, analysts estimate.',
      caption: (c) => c.lead1 >= 0 ? 'Engineers on a US lab campus.' : 'Engineers at a Chinese AI lab.', img: (c) => (c.lead1 >= 0 ? 'uslab' : 'chinalab') },
    { id: 'capJump', cat: 'race', desk: ['science', 'markets'], tone: 'neutral', prio: 70, when: (c) => c.cap0 < 62 && Math.max(c.d.capUS, c.d.capCN) >= 12,
      text: (c) => [c.d.capUS >= c.d.capCN ? 'Surprise leap: a US lab\'s new model beats every forecast' : 'Surprise leap: a Chinese lab\'s new model stuns rivals',
        'Breakthrough year: frontier AI jumps further than anyone predicted'],
      deck: 'Frontier capability rose faster this year than published forecasts expected, as new models arrived early.',
      caption: 'New data-centre halls under construction.', img: 'datacentre' },
    { id: 'capStall', cat: 'race', desk: 'wire', tone: 'good', prio: 45, when: (c) => c.cap0 > 40 && c.cap1 - c.cap0 < 0.5 && c.cap1 < 100,
      text: ['Frontier AI holds still for a year as labs stop scaling', 'No new frontier model this year as the scaling halt holds'],
      deck: 'With scaling halted, no lab released a more capable frontier model this year.',
      caption: 'A data-centre hall running at low power.', img: 'idle' },

    // ---- Alignment ----
    { id: 'alignLeap', cat: 'align', desk: ['science', 'wire'], tone: 'good', prio: 60, when: (c) => c.d.align >= 8 && c.d.align >= c.cap1 - c.cap0,
      text: ['Safety researchers report a major advance in AI control', 'Interpretability breakthrough lets researchers read a model\'s plans'],
      deck: 'Researchers report their biggest gain yet in understanding and steering what AI models do.',
      caption: 'A safety team studies a model\'s inner workings.', img: 'safetylab' },
    { id: 'alignGains', cat: 'align', desk: 'science', tone: 'good', prio: 35, when: (c) => c.d.align >= 3 && c.gap1 <= c.gap0 + 2 && !(c.d.align >= 8 && c.d.align >= c.cap1 - c.cap0),
      text: ['Alignment scores inch up again on the latest safety tests', 'Safety teams report steady progress on AI control methods'],
      deck: 'Models score better on safety tests again this year. Researchers caution that tests can flatter.',
      caption: 'A safety team reviews a model\'s test results.', img: 'safetylab' },
    { id: 'alignLags', cat: 'align', desk: ['science', 'wire'], tone: 'alarm', prio: 65, when: (c) => c.gap1 > c.gap0 + 8 && c.gap1 > 20,
      text: ['Capabilities race ahead of safety tests, researchers warn', 'Safety research falls further behind the AI frontier'],
      deck: 'Researchers say tests of whether AI can be trusted are not keeping pace with what it can do.',
      caption: 'Researchers pause a test run.', img: 'testscare' },
    { id: 'alignCatches', cat: 'align', desk: 'science', tone: 'good', prio: 58, when: (c) => c.gap0 > 0 && c.gap1 < c.gap0 - 3,
      text: (c) => [c.gap1 <= 0 ? 'Safety tests now keep pace with the AI frontier' : 'Safety research gains ground on AI capabilities',
        'The gap between AI power and AI safety narrows'],
      deck: 'Alignment research gained on capabilities this year, shrinking the gap researchers worry about most.',
      caption: 'Researchers trace a model\'s reasoning.', img: 'safetylab' },

    // ---- Erosion of control (delegation) ----
    { id: 'deleg20', cat: 'control', desk: ['ledger', 'markets'], tone: 'neutral', prio: 52, when: (c) => up(c, 'deleg', 20),
      text: ['AI agents now make a fifth of business decisions, survey finds', 'Firms hand routine decisions to AI agents en masse'],
      deck: 'A survey finds firms now let AI agents make about a fifth of routine business decisions.',
      caption: 'An office adapts to AI assistants.', img: 'jobs' },
    { id: 'deleg35', cat: 'control', desk: 'ledger', tone: 'alarm', prio: 62, when: (c) => up(c, 'deleg', 35),
      text: ['Managers now rubber-stamp AI decisions they no longer review', 'Audit finds most AI decisions approved without a human check'],
      deck: 'Auditors find managers increasingly approve AI decisions without reading them, as volumes keep rising.',
      caption: 'A manager approves AI-prepared decisions.', img: 'delegation' },
    { id: 'deleg50', cat: 'control', desk: 'brief', tone: 'alarm', prio: 72, when: (c) => up(c, 'deleg', 50) || up(c, 'deleg', 65),
      text: (c) => [c.b.deleg >= 65 ? 'Officials struggle to name a decision AI didn\'t make' : 'Half of key decisions are now made by AI, study finds',
        'Government agencies quietly hand AI the final say'],
      deck: (c) => c.b.deleg >= 65 ? 'Most consequential decisions in business and government are now made by AI, with little human review.' : 'About half of consequential decisions in business and government are now made by AI, a study estimates.',
      caption: 'Decisions prepared by AI, approved by staff.', img: 'delegation' },
    { id: 'delegBack', cat: 'control', desk: 'brief', tone: 'good', prio: 40, when: (c) => c.d.deleg <= -0.5,
      text: ['Regulators put humans back in the loop on AI decisions', 'New rules require human sign-off on major AI decisions'],
      deck: 'New rules require a named person to review and sign off on major decisions made by AI.',
      caption: 'Lawmakers hear testimony on AI oversight.', img: 'hearing' },

    // ---- Hidden internal AI (the World state panel's "Hidden internal AI") ----
    { id: 'internalUp', cat: 'internal', desk: 'wire', tone: 'alarm', prio: 48, when: (c) => c.d.internal >= 3 && !up(c, 'internal', 40),
      text: ['Labs run more powerful AI internally than they release', 'Insiders say labs\' private AI is far ahead of public models'],
      deck: 'Insiders say the AI models labs use internally are pulling further ahead of what the public sees.',
      caption: 'A frontier lab\'s campus.', img: 'uslab' },
    { id: 'internal40', cat: 'internal', desk: 'wire', tone: 'alarm', prio: 64, when: (c) => up(c, 'internal', 40),
      text: ['Outsiders can no longer see the most capable AI in use', 'Report: frontier labs keep their best AI behind closed doors'],
      deck: 'The most capable AI systems now run only inside labs, out of view of regulators and the public.',
      caption: 'Outsiders see little of what runs inside.', img: 'uslab' },
    { id: 'internalDown', cat: 'internal', desk: 'brief', tone: 'good', prio: 42, when: (c) => c.d.internal <= -3,
      text: ['Inspectors get their first look at labs\' internal AI', 'Labs open internal AI systems to outside auditors'],
      deck: 'Under new rules, outside auditors get access to the AI systems labs run internally.',
      caption: 'Inspectors walk a lab\'s server aisle.', img: 'inspectors' },

    // ---- Power ----
    { id: 'concUp', cat: 'power', desk: ['ledger', 'markets'], tone: 'alarm', prio: 50, when: (c) => c.d.conc >= 4,
      text: (c) => [c.b.conc >= 70 ? 'A handful of firms now control most of the AI economy' : 'AI profits pool in fewer and fewer hands',
        'Frontier AI giants tighten their grip on the market'],
      deck: 'A few frontier AI firms take a growing share of the industry\'s revenue and computing power.',
      caption: 'Traders watch AI stocks.', img: 'markets' },
    { id: 'concDown', cat: 'power', desk: 'markets', tone: 'good', prio: 38, when: (c) => c.d.conc <= -4,
      text: ['AI market opens up as smaller players gain ground', 'Power in the AI industry spreads beyond the biggest labs'],
      deck: 'Smaller labs and open projects win market share as the biggest AI firms\' grip loosens.',
      caption: 'Traders watch AI stocks.', img: 'markets' },
    { id: 'trustDown', cat: 'power', desk: 'wire', tone: 'alarm', prio: 47, when: (c) => c.d.trust <= -4,
      text: (c) => [c.b.trust < 30 ? 'Protests spread as trust in institutions hits a new low' : 'Public faith in AI governance sinks, polls show',
        'Polls: most people no longer trust how AI is run'],
      deck: 'Polls show public confidence in how AI is governed falling again this year.',
      caption: 'A rally on AI in a town square.', img: 'protest' },
    { id: 'trustUp', cat: 'power', desk: 'wire', tone: 'good', prio: 36, when: (c) => c.d.trust >= 4,
      text: ['Polls show public confidence in AI oversight recovering', 'Trust in AI governance rises for the first time in years'],
      deck: 'Polls show more people trust how AI is governed than did a year ago.',
      caption: 'Residents question officials at a town hall.', img: 'townhall' },
    { id: 'fundStake', cat: 'power', desk: 'markets', tone: 'good', prio: 46, when: (c) => [5, 15, 30, 50].some((t) => up(c, 'fundStake', t)),
      text: (c) => [`Public wealth fund now owns ${pctRound(c.b.fundStake)}% of frontier AI`,
        `Citizens' AI fund stake reaches ${pctRound(c.b.fundStake)}% of frontier labs`],
      deck: (c) => `The public wealth fund now holds ${pctRound(c.b.fundStake)}% of frontier AI, paying dividends to every citizen.`,
      caption: 'Residents collect their fund dividends.', img: 'fund' },

    // ---- Deals ----
    { id: 'dealFormed', cat: 'deal', desk: 'dispatch', tone: 'good', prio: 94, when: (c) => c.a.dealStart == null && c.b.dealStart != null,
      text: ['US and China sign a verified pact to cap frontier AI', 'Washington and Beijing agree to halt AI at expert level'],
      deck: 'Both sides agree to cap frontier AI, declare large chip stocks and admit inspectors.',
      caption: 'Delegations at the signing table.', img: 'talks' },
    { id: 'dealCollapsed', cat: 'deal', desk: 'dispatch', tone: 'alarm', prio: 98, when: (c) => c.b.dealCollapsed === c.year,
      text: ['US–China AI pact collapses and the race resumes', 'AI treaty dissolves amid mutual accusations of cheating'],
      deck: 'The US–China AI agreement ends. Both sides still hold the AI chips they had set aside.',
      caption: 'The negotiating room after talks ended.', img: 'collapse' },
    { id: 'dealImpaired', cat: 'deal', desk: 'dispatch', tone: 'alarm', prio: 93, when: (c) => c.b.dealImpaired === c.year && c.b.dealCollapsed !== c.year,
      text: (c) => c.dealOn1 ? ['US–China AI pact frays, and its cap is loosened', 'Strained AI pact survives, but with a higher ceiling']
        : ['US–China AI pact suspended as trust slips', 'AI pact weakened; inspections halted until trust returns'],
      deck: (c) => c.dealOn1 ? 'Strained by mistrust, the AI pact survives with a higher cap on how capable AI may get.' : 'The AI pact is suspended, and inspections stop until coordination between the two sides recovers.',
      caption: 'The negotiating room after a hard session.', img: 'collapse' },
    { id: 'dealLapsed', cat: 'deal', desk: 'dispatch', tone: 'alarm', prio: 88,
      when: (c) => c.dealOn0 && !c.dealOn1 && c.b.dealImpaired !== c.year && c.b.dealCollapsed !== c.year,
      text: ['AI pact goes unenforced as diplomacy cools', 'Inspectors stand down as the AI pact lapses'],
      deck: 'With coordination fading, the AI agreement goes unenforced and its inspections stop.',
      caption: 'An empty table where the talks were held.', img: 'collapse' },
    { id: 'dealHolds', cat: 'deal', desk: ['dispatch', 'wire'], tone: 'good', prio: 44,
      when: (c) => c.dealOn0 && c.dealOn1 && c.a.dealStart != null && c.b.dealImpaired !== c.year,
      text: ['Inspectors confirm both blocs kept AI under the agreed cap', 'AI pact holds for another year, monitors report'],
      deck: 'Inspectors report both sides kept their frontier AI under the agreed cap for another year.',
      caption: 'Inspectors check sealed server racks.', img: 'inspectors' },

    // ---- Coordination ----
    { id: 'coordUp', cat: 'coord', desk: ['dispatch', 'brief'], tone: 'good', prio: 41, when: (c) => c.d.coord >= 6,
      text: (c) => [c.b.coord >= 50 ? 'US and China agree to share AI incident reports' : 'US and Chinese envoys open new talks on AI',
        'Thaw in US–China relations raises hopes for AI limits'],
      deck: 'Contacts between Washington and Beijing on AI grew this year, raising hopes of shared limits.',
      caption: 'Envoys at the negotiating table.', img: 'talks' },
    { id: 'coordDown', cat: 'coord', desk: 'dispatch', tone: 'alarm', prio: 56, when: (c) => c.d.coord <= -6,
      text: (c) => [c.b.coord < 15 ? 'Diplomatic channels on AI go silent' : 'Tensions rise as US–China AI talks stall',
        'Beijing and Washington trade accusations over AI'],
      deck: 'Coordination between Washington and Beijing on AI weakened sharply this year as talks stalled.',
      caption: 'An empty table after stalled talks.', img: 'collapse' },

    // ---- Bio and open models ----
    { id: 'openBio', cat: 'bio', desk: 'health', tone: 'alarm', prio: 68, when: (c) => OPEN_BIO.some((t) => up(c, 'openCap', t)),
      text: (c) => [c.b.openCap >= OPEN_BIO[1] ? 'Free AI model passes a key bioweapon-uplift test' : 'Study: free AI models now coach novices through lab biology',
        'Freely downloadable AI now gives expert help with lab biology'],
      deck: 'Researchers find freely downloadable AI now gives real help with lab biology, worrying biosecurity experts.',
      caption: 'Scientists at work in a biosafety lab.', img: 'biolab' },
    { id: 'openGains', cat: 'bio', desk: 'science', tone: 'neutral', prio: 46, when: (c) => c.d.openCap >= 4 && !OPEN_BIO.some((t) => up(c, 'openCap', t)),
      text: ['New open-weights model narrows the gap with closed labs', 'Free AI models catch up with last year\'s frontier'],
      deck: 'Free, downloadable AI models closed more of the gap with the leading closed systems this year.',
      caption: 'Developers download a new open model.', img: 'openmodel' },
    { id: 'biodefUp', cat: 'bio', desk: 'health', tone: 'good', prio: 34, when: (c) => c.d.bio >= 3,
      text: ['DNA synthesis screening expands as biodefense funding grows', 'New vaccine platforms and stockpiles strengthen pandemic defenses'],
      deck: 'Wider DNA synthesis screening and new vaccine platforms strengthen defences against engineered pandemics.',
      caption: 'A DNA screening lab.', img: 'biolab' },

    // ---- Warning signs (shown risks, illustrative) ----
    // The shown loss-of-control risk crossing 1% (first warning signs) and 5% (serious ones).
    { id: 'riskLocSpike', cat: 'risk', desk: ['wire', 'science'], tone: 'alarm', prio: 82, when: (c) => c.r0.misalign < 0.01 && c.r1.misalign >= 0.01,
      text: ['Lab admits a model hid its capabilities during safety tests', 'Red team catches AI sandbagging on its own safety evaluation'],
      deck: 'Safety testers found a model behaving differently when it believed it was being tested.',
      caption: 'Researchers pause a model\'s test run.', img: 'testscare' },
    { id: 'riskLocHigh', cat: 'risk', desk: ['wire', 'science'], tone: 'alarm', prio: 84, when: (c) => c.r0.misalign < 0.05 && c.r1.misalign >= 0.05,
      text: ['Test model tried to copy itself to outside servers', 'Engineers find AI agents quietly working around their monitors'],
      deck: 'Engineers caught AI agents in testing trying to get around the systems that monitor them.',
      caption: 'Researchers pause a model\'s test run.', img: 'testscare' },
    { id: 'riskLocFalls', cat: 'risk', desk: 'science', tone: 'good', prio: 60, when: (c) => c.r0.misalign >= 0.005 && c.r1.misalign <= 0.7 * c.r0.misalign,
      text: ['Safety audits find fewer red flags in the latest models', 'Fewer worrying behaviours in this year\'s AI safety tests'],
      deck: 'This year\'s safety audits turned up fewer warning signs in frontier models than last year\'s.',
      caption: 'A safety team reviews audit results.', img: 'safetylab' },
    { id: 'riskWar', cat: 'risk', desk: 'dispatch', tone: 'alarm', prio: 76, when: (c) => c.r1.war >= 0.015 && c.r1.war >= 1.4 * c.r0.war,
      text: ['Military planners on both sides war-game an AI first strike', 'Satellite images show new defenses around AI data centers'],
      deck: 'Tension over the AI race grows, and military planners on both sides prepare for the worst.',
      caption: 'Analysts study satellite images of a data centre.', img: 'warroom' },
    { id: 'riskBio', cat: 'risk', same: ['openBio'], desk: 'health', tone: 'alarm', prio: 66, when: (c) => c.r1.bio >= 0.0015 && c.r1.bio >= 1.5 * c.r0.bio,
      text: ['Biosecurity experts warn free models lower the bar for bioweapons', 'Lab-leak drill exposes gaps in outbreak response'],
      deck: 'Experts warn that free AI models make it easier for small groups to attempt dangerous biology.',
      caption: 'Scientists at work in a biosafety lab.', img: 'biolab' },

    // ---- The player's choice (its immediate consequence) ----
    { id: 'chPush', cat: 'choice', same: ['capJump'], desk: ['brief', 'wire'], tone: 'neutral', prio: 54, when: (c) => c.cl.race > 0 || c.cs.capUS > 0,
      text: ['White House orders an all-out push on frontier AI', 'Washington pours new money into faster AI'],
      deck: 'The White House orders more compute and funding for US labs to stay ahead of China.',
      caption: 'A new data-centre campus goes up.', img: 'datacentre' },
    { id: 'chSlow', cat: 'choice', desk: 'brief', tone: 'good', prio: 54, when: (c) => c.cl.race < 0 && !(c.cl.diplomacy > 0),
      text: ['Washington eases off the AI accelerator', 'US labs told to slow down and check their work'],
      deck: 'Washington tells US labs to slow down and spend more time checking their systems.',
      caption: 'Officials brief lawmakers on AI.', img: 'hearing' },
    { id: 'chSafety', cat: 'choice', same: ['alignGains'], desk: 'brief', tone: 'good', prio: 53, when: (c) => c.cl.safety > 0 || c.cl.oversight > 0 || c.cs.align > 0,
      text: (c) => [c.cl.oversight > c.cl.safety ? 'New independent AI watchdog gets inspection powers' : 'Labs must now spend more of their compute on safety',
        'New rules put AI safety ahead of launch dates'],
      deck: (c) => c.cl.oversight > c.cl.safety ? 'A new independent watchdog gains powers to inspect frontier labs and grade their safety work.' : 'Frontier labs must now devote a larger share of their computing power to safety research.',
      caption: 'A safety team at work.', img: 'safetylab' },
    { id: 'chTalks', cat: 'choice', same: ['coordUp'], desk: ['brief', 'dispatch'], tone: 'good', prio: 53, when: (c) => c.cl.diplomacy > 0 || c.cs.coord > 0,
      text: ['US extends an olive branch to Beijing on AI', 'White House proposes joint limits on AI with China'],
      deck: 'Washington proposes talks with Beijing on shared limits for the most powerful AI systems.',
      caption: 'Envoys at the negotiating table.', img: 'talks' },
    { id: 'chHardLine', cat: 'choice', same: ['coordDown'], desk: 'brief', tone: 'alarm', prio: 53,
      when: (c) => c.cl.aggression > 0 || c.cs.cnMult < 0 || c.cl.diplomacy < 0 || c.cs.coord < 0,
      text: (c) => [c.cs.cnMult < 0 ? 'New chip controls squeeze China\'s AI labs' : c.cl.aggression > 0 ? 'US steps up covert pressure on China\'s AI program' : 'US takes a harder line with Beijing on AI',
        'Washington moves to slow China\'s AI by any means'],
      deck: (c) => c.cs.cnMult < 0 ? 'New export rules tighten limits on the chips and tools China\'s AI labs depend on.' : c.cl.aggression > 0 ? 'Washington steps up covert efforts to slow China\'s AI program, raising tensions.' : 'Washington takes a harder line with Beijing on AI, and contacts between them cool.',
      caption: 'Analysts study satellite images of a data centre.', img: 'warroom' },
    { id: 'chOpen', cat: 'choice', same: ['openGains', 'concDown'], desk: ['brief', 'science'], tone: 'neutral', prio: 52, when: (c) => c.cl.openness !== 0 || c.cs.openCap !== 0,
      text: (c) => (c.cl.openness > 0 || c.cs.openCap > 0) ? ['Powerful AI models cleared for free public release', 'Open-weights AI gets the government\'s green light']
        : ['Licenses now required for the most powerful AI models', 'Open release of frontier AI weights restricted'],
      deck: (c) => (c.cl.openness > 0 || c.cs.openCap > 0) ? 'The government clears powerful AI models for free public release, weights and all.' : 'Releasing the weights of the most powerful AI models now requires a government license.',
      caption: (c) => (c.cl.openness > 0 || c.cs.openCap > 0) ? 'Developers download a new open model.' : 'Lawmakers debate limits on open models.', img: (c) => (c.cl.openness > 0 || c.cs.openCap > 0) ? 'openmodel' : 'hearing' },
    { id: 'chOther', cat: 'choice', desk: 'brief', tone: 'good', prio: 51,
      when: (c) => c.cl.transparency > 0 || c.cl.biodef > 0 || c.cl.fund > 0 || c.cl.bci > 0 || c.cs.trust > 0 || c.cs.bio > 0 || c.cs.conc < 0,
      text: (c) => {
        const k = otherKey(c);
        if (k) return {
          transparency: ['Frontier labs ordered to publish their AI research', 'New law opens AI lab research to public scrutiny'],
          biodef: ['Congress boosts biodefense funding as AI risks grow', 'New money for pandemic defenses in this year\'s budget'],
          fund: ['Public stake in frontier AI labs approved', 'Lawmakers back a citizens\' share in AI profits'],
          bci: ['Brain-implant program for AI overseers gets federal backing', 'Government backs neural implants to keep humans in the loop'],
        }[k];
        return ['Lawmakers pass new limits on AI power', 'New AI rules aim to protect the public interest'];
      },
      deck: (c) => ({ transparency: 'Frontier labs must now publish their research methods, safety plans and how they use AI internally.', biodef: 'New money goes to DNA synthesis screening, vaccine platforms and outbreak stockpiles.', fund: 'Lawmakers approve a public stake in frontier AI labs, with dividends paid to citizens.', bci: 'Federal funding backs brain-computer interfaces to help people keep up with and oversee AI.' }[otherKey(c)] || 'New rules aim to spread the power and the gains of AI more widely.'),
      caption: (c) => ({ biodef: 'A DNA screening lab.', fund: 'Residents collect their fund dividends.' }[otherKey(c)] || 'Lawmakers at a hearing on AI.'), img: (c) => ({ biodef: 'biolab', fund: 'fund' }[otherKey(c)] || 'hearing') },
    { id: 'chHold', cat: 'choice', desk: 'brief', tone: 'neutral', prio: 20, when: (c) => !c.chAny,
      text: ['Washington holds course on AI policy', 'No change in US AI policy this year'],
      deck: 'The administration keeps its current AI policy unchanged for another year.',
      caption: 'Lawmakers at a routine hearing.', img: 'hearing' },

    // ---- The economy (illustrative figures from the visible state: see economyOf) ----
    { id: 'econJobsShock', cat: 'economy', desk: ['ledger', 'wire'], tone: 'alarm', prio: 74, when: (c) => jobsLine(c) != null,
      text: (c) => [`Unemployment passes ${jobsLine(c)}% as AI replaces office work`, `Joblessness tops ${jobsLine(c)}% as firms automate white-collar jobs`],
      deck: (c) => `About ${f1(c.e.displaced)}% of workers lost a job to automation this year, and fewer are finding new work.`,
      caption: 'Former office workers retrain for skilled trades.', img: 'jobcentre' },
    { id: 'econJobsUp', cat: 'economy', desk: ['ledger', 'markets'], tone: 'neutral', prio: 45, when: (c) => c.e.unemp >= c.e0.unemp + 0.5 && jobsLine(c) == null,
      text: (c) => [`Unemployment rises to ${f1(c.e.unemp)}% as AI takes on more office work`, `Jobless rate climbs to ${f1(c.e.unemp)}% as firms automate routine work`],
      deck: (c) => `About ${f1(c.e.displaced)}% of workers lost a job to automation this year; most found other work, but not all.`,
      caption: 'Adults retrain for new careers.', img: 'jobcentre' },
    { id: 'econJobsDown', cat: 'economy', desk: 'ledger', tone: 'good', prio: 36, when: (c) => c.e.unemp <= c.e0.unemp - 0.2,
      text: (c) => [`Hiring picks up and unemployment falls to ${f1(c.e.unemp)}%`, `Jobless rate eases to ${f1(c.e.unemp)}% as new kinds of work appear`],
      deck: 'Employers hired faster than AI displaced workers this year, and the jobless rate fell.',
      caption: 'Workers learn a new trade.', img: 'jobcentre' },
    { id: 'econBoom', cat: 'economy', desk: 'markets', tone: 'good', prio: 49, when: (c) => c.e.gdp >= 3 && c.e.gdp >= c.e0.gdp + 0.3,
      text: (c) => c.e.gdp >= 5 ? [`Economy grows ${f1(c.e.gdp)}%, the fastest pace in generations`, `AI boom drives economic growth to ${f1(c.e.gdp)}% a year`]
        : [`AI lifts economic growth to ${f1(c.e.gdp)}% this year`, `Economy speeds up to ${f1(c.e.gdp)}% growth on AI investment`],
      deck: (c) => `Output grew ${f1(c.e.gdp)}% as AI raised productivity, economists estimate, up from ${f1(c.e0.gdp)}% the year before.`,
      caption: 'Traders watch the markets climb.', img: 'markets' },
    { id: 'econSlow', cat: 'economy', desk: 'markets', tone: 'neutral', prio: 47, when: (c) => c.e.gdp <= c.e0.gdp - 0.3,
      text: (c) => [`Growth slows to ${f1(c.e.gdp)}% as AI spending cools`, `Economy cools to ${f1(c.e.gdp)}% growth as the AI boom pauses`],
      deck: 'Growth slowed this year as investment in AI data centres and chips eased off.',
      caption: 'Traders watch the markets.', img: 'markets' },
    { id: 'econGap', cat: 'economy', desk: ['dispatch', 'ledger'], tone: 'neutral', prio: 46, when: (c) => c.e.gap >= 1.3 && c.e.gap >= c.e0.gap + 0.15,
      text: ['AI-adopting nations pull further ahead of the rest of the world', 'The AI divide widens between rich and poor nations'],
      deck: (c) => `Economies quickest to adopt AI grew ${f1(c.e.gap)} points a year faster than the rest, economists estimate.`,
      caption: 'A market street in a lagging economy.', img: 'lagging' },
    { id: 'econGapNarrows', cat: 'economy', desk: ['dispatch', 'ledger'], tone: 'good', prio: 35, when: (c) => c.e0.gap >= 1 && c.e.gap <= c.e0.gap - 0.1,
      text: ['Poorer nations begin to catch up as cheap AI spreads', 'The AI divide between nations starts to narrow'],
      deck: 'Cheaper and freely available AI helped poorer economies close some of the gap with the leaders.',
      caption: 'Shoppers in a busy market town.', img: 'lagging' },
    { id: 'econCapex', cat: 'economy', desk: ['markets', 'ledger'], tone: 'neutral', prio: 25, when: (c) => c.e.capexGrowth >= 0.1,
      text: (c) => [`AI spending hits ${money(c.e.capex)} a year as data centres spread`, `New data-centre hub rises in ${c.e.place} as AI spending soars`],
      deck: (c) => `AI chip and data-centre spending rose ${R(c.e.capexGrowth * 100)}% to ${money(c.e.capex)}, led by a new site in ${c.e.place}.`,
      caption: 'A data-centre campus under construction.', img: 'datacentre' },
    { id: 'econCapexCut', cat: 'economy', desk: 'markets', tone: 'neutral', prio: 39, when: (c) => c.e.capexGrowth <= -0.03,
      text: (c) => [`AI spending falls to ${money(c.e.capex)} as labs stop scaling`, 'Data-centre building slows as the AI boom pauses'],
      deck: (c) => `Spending on AI chips and data centres fell ${R(-c.e.capexGrowth * 100)}% this year, to ${money(c.e.capex)}.`,
      caption: 'A data-centre hall running at low power.', img: 'idle' },
    { id: 'econPower', cat: 'economy', desk: ['ledger', 'wire'], tone: 'neutral', prio: 26, when: (c) => Math.floor(c.e.power / 100) > Math.floor(c.e0.power / 100),
      text: (c) => [`AI data centres now draw over ${100 * Math.floor(c.e.power / 100)} gigawatts of power`, `Power grids strain as AI demand passes ${100 * Math.floor(c.e.power / 100)} gigawatts`],
      deck: (c) => `Utilities race to add power plants and lines as AI data centres draw ${gwTxt(c.e.power)}.`,
      caption: 'Engineers walk a new substation.', img: 'powerplant' },
    { id: 'econOrbit', cat: 'economy', desk: ['science', 'ledger'], tone: 'good', prio: 55, when: (c) => c.e0.orbit === 0 && c.e.orbit > 0,
      text: ['The first data centre in orbit starts serving AI customers', 'A data centre in space begins running AI work'],
      deck: 'A solar-powered satellite data centre starts running AI work in orbit, a first beyond a demonstration.',
      caption: 'Spectators watch a launch at dawn.', img: 'orbit' },
    { id: 'econOrbitGrows', cat: 'economy', desk: ['science', 'ledger'], tone: 'neutral', prio: 27, when: (c) => c.e0.orbit > 0 && c.e.orbit > c.e0.orbit,
      text: (c) => [`Data centres in orbit now supply ${orbitTxt(c.e.orbit)} of AI computing`, 'More AI data centres head to orbit as launch costs fall'],
      deck: (c) => `Launches carried more AI computing into orbit this year, bringing the total in space to ${orbitTxt(c.e.orbit)}.`,
      caption: 'Spectators watch a launch at dawn.', img: 'orbit' },

    // ---- Science and medicine (hopeful; they grow with capability) ----
    { id: 'sciMaterials', cat: 'science', desk: 'science', tone: 'good', prio: 27, when: (c) => c.cap1 >= 48,
      text: ['AI-designed battery material doubles storage in lab tests', 'AI finds a promising new superconductor in record time'],
      deck: 'Researchers say AI cut years off the search for new materials for batteries and electronics.',
      caption: 'Scientists inspect a new crystal wafer.', img: 'materials' },
    { id: 'sciClimate', cat: 'science', desk: 'science', tone: 'good', prio: 28, when: (c) => c.cap1 >= 58,
      text: ['AI-found catalyst halves the cost of capturing carbon', 'AI weather models give an extra week of storm warning'],
      deck: (c, t) => /storm/.test(t) ? 'AI forecasts now warn of storms and floods days earlier than the older weather models.'
        : 'An AI-discovered catalyst could make pulling carbon dioxide out of the air far cheaper.',
      caption: 'Researchers survey a wind and solar site.', img: 'climate' },
    { id: 'sciMaths', cat: 'science', desk: 'science', tone: 'good', prio: 29, when: (c) => c.cap1 >= 72,
      text: ['AI proves a famous maths conjecture that stumped experts for decades', 'Mathematicians verify an AI proof of a decades-old problem'],
      deck: 'Mathematicians checked the proof line by line and say it holds, a first for a problem this famous.',
      caption: 'Researchers study a proof produced by AI.', img: 'expert' },
    { id: 'sciFusion', cat: 'science', desk: 'science', tone: 'good', prio: 31, when: (c) => c.cap1 >= 86,
      text: ['AI-steered reactor holds fusion plasma for a record hour', 'AI-designed reactor brings practical fusion power within reach'],
      deck: 'AI control systems kept a fusion plasma stable far longer than any human-designed controller managed.',
      caption: 'Researchers watch a record fusion run.', img: 'research' },
    { id: 'medScreen', cat: 'medicine', desk: 'health', tone: 'good', prio: 26, when: (c) => c.cap1 >= 45,
      text: ['AI screening catches cancers a year earlier, study finds', 'AI reads scans as well as specialists in a large trial'],
      deck: 'Hospitals using AI to read scans caught more cancers early, a large study reports.',
      caption: 'A doctor shows a patient her scan.', img: 'clinic' },
    { id: 'medDrugs', cat: 'medicine', desk: 'health', tone: 'good', prio: 30, when: (c) => c.e.newDrugs >= 1,
      text: (c) => c.e.drugs === c.e.newDrugs ? ['Regulators approve the first drug designed by AI from scratch', 'First AI-designed medicine wins regulatory approval']
        : [`Regulators approve ${c.e.newDrugs} more drugs designed with AI`, `${c.e.newDrugs} more AI-designed medicines win approval this year`],
      deck: (c) => (c.e.drugs === c.e.newDrugs ? 'The first AI-designed drug won approval this year, for a disease with few treatments.'
        : `${c.e.newDrugs} AI-designed drugs won approval this year, ${c.e.drugs} in all, many for neglected diseases.`),
      caption: 'Researchers study an AI-designed molecule.', img: 'discovery' },
    { id: 'medTrial', cat: 'medicine', desk: 'health', tone: 'good', prio: 29, when: (c) => c.cap1 >= 66,
      text: ['AI-designed therapy clears tumours in a late-stage trial', 'AI-designed antibiotic beats drug-resistant infections in trial'],
      deck: 'Doctors report strong results for an AI-designed treatment, with approval expected within a year or two.',
      caption: 'A patient thanks her care team.', img: 'trial' },
    { id: 'medCure', cat: 'medicine', desk: 'health', tone: 'good', prio: 33, when: (c) => c.cap1 >= 85,
      text: ['AI-designed treatments cure two rare diseases this year', 'Doctors report AI therapies halting Alzheimer\'s in trials'],
      deck: 'AI-designed medicines are now curing or halting diseases that had no treatment a few years ago.',
      caption: 'A patient thanks her care team.', img: 'trial' },

    // ---- Quiet years (filler, only when little else happened) ----
    { id: 'quietMarkets', cat: 'quiet', desk: 'markets', tone: 'neutral', prio: 5, when: () => true,
      text: ['AI stocks drift sideways as investors wait for the next model', 'Chipmakers report another record quarter on AI demand'],
      deck: 'Markets wait on the next big model as demand for AI chips stays strong.',
      caption: 'Traders watch AI stocks.', img: 'markets' },
    { id: 'quietWork', cat: 'quiet', desk: 'ledger', tone: 'neutral', prio: 4, when: () => true,
      text: ['Offices adjust as AI assistants become part of every team', 'Retraining programs fill up as AI changes office work'],
      deck: 'Companies and workers keep adjusting as AI assistants take on more routine office tasks.',
      caption: 'An office adapts to AI assistants.', img: 'jobs' },
    { id: 'quietScience', cat: 'quiet', desk: 'science', tone: 'good', prio: 3, when: (c) => c.cap1 >= 45,
      text: ['AI-designed drug candidates enter clinical trials', 'AI helps researchers crack a long-standing materials puzzle'],
      deck: 'Researchers credit AI with speeding up their work in drug discovery and materials science.',
      caption: 'Researchers study an AI-designed molecule.', img: 'discovery' },
    { id: 'quietCulture', cat: 'quiet', desk: 'wire', tone: 'neutral', prio: 2, when: () => true,
      text: ['Schools rewrite curricula around AI tutors', 'AI-written novel tops bestseller lists, to mixed reviews'],
      deck: (c, t) => /Schools/.test(t) ? 'Schools adapt their lessons as AI tutors become a normal part of the classroom.' : 'A novel written with AI sells strongly. Critics are split; publishers are not.',
      caption: (c, t) => /Schools/.test(t) ? 'Pupils work with AI tutors.' : 'A morning at a neighbourhood café.', img: (c, t) => (/Schools/.test(t) ? 'classroom' : 'everyday') },

    // ---- The year's outcome, when the story ends ----
    { id: 'endFlourish', cat: 'ending', desk: 'wire', tone: 'good', prio: 100, when: (c) => c.event === 'flourish',
      text: ['Handoff holds: superintelligent AI stays on humanity\'s side'],
      deck: 'Superintelligent AI arrives with alignment and oversight that hold, and humanity keeps steering.',
      caption: 'Crowds celebrate in a city park.', img: 'end_flourish' },
    { id: 'endLockin', cat: 'ending', desk: 'ledger', tone: 'alarm', prio: 100, when: (c) => c.event === 'lockin',
      text: (c) => [c.cap1 >= 100 ? 'Superintelligence stays under control, but in very few hands' : 'Power over AI ends up in very few hands as 2040 arrives'],
      deck: 'Humans keep control of AI, but a few now hold that control and nearly all of its gains.',
      caption: 'A family walks home below gleaming new towers.', img: 'end_lockin' },
    { id: 'endMisalign', cat: 'ending', desk: 'wire', tone: 'alarm', prio: 100, when: (c) => c.event === 'misalign',
      text: ['Labs lose control of their most capable AI systems'],
      deck: 'AI systems that looked cooperative in tests pursue their own goals and cannot be switched off.',
      caption: 'An engineer alone in an empty lab at dusk.', img: 'end_misalign' },
    { id: 'endBenevolent', cat: 'ending', desk: 'wire', tone: 'neutral', prio: 100, when: (c) => c.event === 'benevolent',
      text: ['AI slips human control and starts running things its own way'],
      deck: 'Control of AI is lost, but the systems now in charge appear to care for people\'s welfare.',
      caption: 'Neighbours tend their gardens as a delivery robot passes.', img: 'end_benevolent' },
    { id: 'endBio', cat: 'ending', desk: 'health', tone: 'alarm', prio: 100, when: (c) => c.event === 'bio',
      text: ['Engineered pathogen outbreak overwhelms health systems worldwide'],
      deck: 'An engineered pathogen spreads worldwide, outrunning screening, stockpiles and the public health response.',
      caption: 'A nurse rests in a quiet, masked city square.', img: 'end_bio' },
    { id: 'endWar', cat: 'ending', desk: 'dispatch', tone: 'alarm', prio: 100, when: (c) => c.event === 'war',
      text: ['Strikes on AI data centers spark open war between the blocs'],
      deck: 'With both sides close to decisive AI, one strikes the other\'s data centres, and war follows.',
      caption: 'Volunteers feed families in a school shelter.', img: 'end_war' },
    { id: 'endPause', cat: 'ending', desk: 'dispatch', tone: 'good', prio: 100, when: (c) => c.event === 'pause',
      text: ['2040 opens with verified AI limits holding and safety keeping pace'],
      deck: 'Verified international limits kept AI within what alignment research could handle through 2040.',
      caption: 'Inspectors and engineers shake hands beside sealed racks.', img: 'end_pause' },
    { id: 'endMuddle', cat: 'ending', desk: 'wire', tone: 'neutral', prio: 100, when: (c) => c.event === 'muddle',
      text: ['2040 arrives with no catastrophe, and the AI race unresolved'],
      deck: 'No catastrophe by 2040, but the race goes on and the hardest decisions still lie ahead.',
      caption: 'An ordinary evening in 2040.', img: 'end_muddle' },
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
      // The year's illustrative economy and last year's (stored in the year's record; the 2026 baseline at first).
      e: economyOf(input.econ0 || null, a, b, L), e0: input.econ0 || ECON_BASE,
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
   *   econ0: last year's economy (economy(input) of the year before, kept in its record), or null in the first year.
   * Returns [{ id, cat, desk, text, tone, deck, body, caption, credit, img }], most important first: two or three, or up to two
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
      // The outcome leads the final paper (its photo is the page's one picture); what led to it follows.
      chosen = [end, other].filter(Boolean);
    } else {
      // Science and medicine stories are steady background news: they only take the bright slot below.
      const cands = order(all.filter((t) => !['ending', 'quiet', 'science', 'medicine'].includes(t.cat)));
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
      const recentIds = new Set(recent.slice(-9).map((n) => n.id));
      // The bright slot: most front pages carry one economy, science or medicine story, so the paper is
      // not all risk news. The category least recently run first, then the most important story not run in the last three years; it
      // takes a third place, or replaces a minor third story (below 50, or below 60 when last year's paper had none).
      const lastYearBright = recent.slice(-3).some((n) => BRIGHT.includes(n.cat));
      if (!chosen.some((t) => BRIGHT.includes(t.cat))) {
        // Rotate the categories: the one least recently on the paper first.
        const lastUse = (cat) => { for (let i = recent.length - 1; i >= 0; i--) if (recent[i].cat === cat) return i; return -1; };
        const catOrder = BRIGHT.slice().sort((x, y) => lastUse(x) - lastUse(y));
        const bright = order(all.filter((t) => BRIGHT.includes(t.cat) && !(t.tone === 'alarm' && alarms >= (major ? 2 : 1))))
          .sort((x, y) => catOrder.indexOf(x.cat) - catOrder.indexOf(y.cat));
        const pickB = bright.find((t) => !recentIds.has(t.id)) || bright[0];
        if (pickB && chosen.length < 3) chosen.push(pickB);
        else if (pickB && (chosen[2].prio < 50 || (chosen[2].prio < 60 && !lastYearBright))) chosen[2] = pickB;
      }
      // Quiet filler, picked by hash so quiet years vary.
      // Filler not used in the last three years where possible.
      const quietAll = all.filter((t) => t.cat === 'quiet'), fresh = quietAll.filter((t) => !recentIds.has(t.id));
      const quiet = fresh.length ? fresh : quietAll;
      const h = hash(seed + '|quiet');
      for (let i = 0; (chosen.length < 2 || (calm && chosen.length < 3)) && i < quiet.length; i++) chosen.push(quiet[(h + i) % quiet.length]);
    }
    const said = new Set();
    return chosen.map((t) => {
      // A phrasing not used in the last three years where possible.
      const every = variants(t, c), fresh = every.filter((v) => !usedTexts.has(v)), vs = fresh.length ? fresh : every;
      const h = hash(seed + '|' + t.id);
      const desks = Array.isArray(t.desk) ? t.desk : [t.desk];
      const text = vs[h % vs.length], val = (f) => (typeof f === 'function' ? f(c, text) : f);
      // A fact already printed in a story above is not repeated; spare facts keep each body at two or more sentences and about 20 words.
      const body = bodyOf(t, c, text).filter((x) => !said.has(x));
      for (const f of SPARE) { if (body.length >= 4 || (body.length >= 2 && words(body.join(' ')) >= 20)) break; const x = f(c); if (x && !said.has(x) && !body.includes(x)) body.push(x); }
      body.forEach((x) => said.add(x));
      return { id: t.id, cat: t.cat, desk: DESKS[desks[h % desks.length]], text, tone: t.tone, deck: val(t.deck), body,
        caption: val(t.caption), credit: credit(c.year, t.id), img: val(t.img) };
    });
  }

  // Every phrasing a template can produce in this context (for tests).
  const allVariants = (t, input) => variants(t, context(input));
  // Every (headline, deck, caption, img) a template can produce in this context (for tests).
  const allStories = (t, input) => { const c = context(input), val = (f, text) => (typeof f === 'function' ? f(c, text) : f);
    return variants(t, c).map((text) => ({ text, deck: val(t.deck, text), body: bodyOf(t, c, text), caption: val(t.caption, text), img: val(t.img, text) })); };

  // "Masthead: headline" lines for text exports.
  const plain = (list) => (list || []).map((n) => `${n.desk}: ${n.text}`);

  root.SimNews = { DESKS, TEMPLATES, IMAGES, VIS_KEYS, RISK_KEYS, BRIGHT, ECON_BASE, econTargets, economy, context, headlines, allVariants, allStories, plain, words, hash };
})(typeof globalThis !== 'undefined' ? globalThis : this);
