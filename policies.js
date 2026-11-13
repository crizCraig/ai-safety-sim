/*
 * "Let Washington decide": the choice the US government would most likely make on each
 * campaign card, so a player can skip years. Reviewable and editable by hand.
 *
 * 2027–2028 are the Trump administration, from its stated and enacted AI policy. From 2029 the
 * next administration is unknown, so the player picks a party (or a coin flip), and that party's
 * defaults come from its stated positions: platforms, leaders' statements and recent bills.
 *
 * Each entry: { choice: <the card choice's exact label>, why: <one line>, src: [<SOURCES key>],
 * judgment: true when no stated position covers the card's issue and the closest stated
 * principle was used }. Paraphrase only: no quotes, and nothing attributed to a person that
 * they did not say. A default depends only on the card, the year and the party, never on the
 * game's hidden facts. test-model.js checks every card has a valid choice for each one.
 */
(function (root) {
  'use strict';

  const ADMINS = {
    trump: { name: 'the Trump administration', short: 'Trump administration', party: 'Republican', basis: 'its stated and enacted AI policy' },
    rep: { name: 'a Republican administration', short: 'Republican administration', party: 'Republican', basis: 'Republican stated positions' },
    dem: { name: 'a Democratic administration', short: 'Democratic administration', party: 'Democratic', basis: 'Democratic stated positions' },
  };
  // The last year the sitting (Trump) administration decides; the 2028 winner takes office in 2029.
  const TRUMP_LAST_YEAR = 2028;

  const SOURCES = {
    actionPlan: ['America\'s AI Action Plan (White House, July 2025)', 'https://www.whitehouse.gov/wp-content/uploads/2025/07/Americas-AI-Action-Plan.pdf'],
    eo14179: ['EO 14179, Removing Barriers to American Leadership in AI (Jan 2025; EO 14148 revoked Biden\'s EO 14110)', 'https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence'],
    eo14365: ['EO 14365, Ensuring a National Policy Framework for AI (Dec 2025): challenge state AI laws', 'https://www.govinfo.gov/content/pkg/DCPD-202501186/pdf/DCPD-202501186.pdf'],
    eo14320: ['EO 14320, Promoting the Export of the American AI Technology Stack (July 2025)', 'https://www.whitehouse.gov/presidential-actions/2025/07/promoting-the-export-of-the-american-ai-technology-stack/'],
    genesis: ['Executive order launching the Genesis Mission (Nov 2025): AI to speed up federal science', 'https://www.whitehouse.gov/presidential-actions/2025/11/launching-the-genesis-mission/'],
    swf: ['Executive order on a US sovereign wealth fund (Feb 2025)', 'https://www.whitehouse.gov/presidential-actions/2025/02/a-plan-for-establishing-a-united-states-sovereign-wealth-fund/'],
    intel: ['Commerce Department takes an equity stake of about 10% in Intel (Aug 2025)', 'https://www.commerce.gov/news/press-releases/2025/08/intel-and-trump-administration-reach-historic-agreement-accelerate-american'],
    h200: ['Administration allows Nvidia H200 sales to approved Chinese buyers for a 25% cut (Dec 2025)', 'https://foxbusiness.com/politics/trump-greenlights-nvidia-ai-chip-exports-china-touts-25-us-share'],
    kratsios: ['US tells the UN it rejects centralized global governance of AI (Sept 2025)', 'https://www.nbcnews.com/tech/tech-news/us-rejects-international-ai-oversight-un-general-assembly-rcna233478'],
    vanceParis: ['Vice President Vance\'s speech at the Paris AI Action Summit (Feb 2025)', 'https://www.presidency.ucsb.edu/documents/remarks-the-vice-president-the-artificial-intelligence-action-summit-paris-france'],
    wh2026: ['White House National Policy Framework for AI: legislative recommendations (Mar 2026), incl. no new AI regulator', 'https://www.nga.org/updates/in-summary-the-white-house-national-legislative-policy-framework-for-artificial-intelligence/'],
    eo14409: ['EO 14409, Promoting Advanced AI Innovation and Security (June 2026): voluntary, classified pre-release testing', 'https://www.presidency.ucsb.edu/documents/executive-order-14409-promoting-advanced-artificial-intelligence-innovation-and-security'],
    caisi: ['CAISI pre-deployment testing agreements with frontier labs (May 2026)', 'https://fortune.com/2026/05/06/trump-administration-embraces-ai-oversight-policies-it-once-rejected-anthropic-mythos-caisi/'],
    accord: ['White House frontier-safety accord with six AI companies (Sept 2026): company controls plus external auditors', 'https://nextgov.com/artificial-intelligence/2026/09/white-house-unveils-super-intelligence-executive-order-and-industry-accord/416325'],
    aiChannel: ['US and China agree to an AI dialogue and an AI incident channel (Sept 2026)', 'https://aljazeera.com/news/2026/9/26/china-us-to-open-ai-communication-channel-after-summit-white-house-says'],
    tsmc: ['TSMC\'s $100B Arizona expansion announced at the White House (Mar 2025)', 'https://pr.tsmc.com/english/news/3210'],
    inf: ['US withdraws from the INF Treaty over Russian violations (State Dept, Aug 2019)', 'https://2017-2021.state.gov/u-s-withdrawal-from-the-inf-treaty-on-august-2-2019/'],
    guard: ['Presidential memorandum federalizing the National Guard over protests in Los Angeles (June 2025)', 'https://www.whitehouse.gov/presidential-actions/2025/06/department-of-defense-security-for-the-protection-of-department-of-homeland-security-functions/'],
    gop2024: ['2024 Republican Party platform', 'https://www.presidency.ucsb.edu/documents/2024-republican-party-platform'],
    grassley: ['AI Whistleblower Protection Act, S.1792 (Sen. Grassley, R, with Democratic cosponsors, 2025)', 'https://www.judiciary.senate.gov/press/rep/releases/grassley-introduces-ai-whistleblower-protection-act'],
    dem2024: ['2024 Democratic Party platform (invest in the AI Safety Institute)', 'https://www.presidency.ucsb.edu/documents/2024-democratic-party-platform'],
    eo14110: ['EO 14110 on safe, secure and trustworthy AI (Biden, Oct 2023)', 'https://www.federalregister.gov/documents/2023/11/01/2023-24283/safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence'],
    cantwell: ['Sen. Cantwell\'s (D) frontier AI governance framework (Oct 2026): federal standards, independent audits, allied standards, a China incident channel', 'https://commerce.senate.gov/press/dem/release/cantwell-outlines-comprehensive-governance-framework-for-safe-and-secure-frontier-ai'],
    sb53: ['California SB 53, Transparency in Frontier AI Act (signed by Gov. Newsom, Sept 2025)', 'https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260SB53'],
    hawleyBlumenthal: ['AI Risk Evaluation Act, S.2938 (Sens. Hawley, R, and Blumenthal, D, Sept 2025)', 'https://www.hawley.senate.gov/hawley-blumenthal-introduce-bipartisan-ai-evaluation-legislation-to-put-americans-first'],
    mind: ['MIND Act on neural-data privacy, S.2925 (Sens. Schumer, Cantwell, Markey, D, Sept 2025)', 'https://www.democrats.senate.gov/newsroom/press-releases/as-neurotechnology-outpaces-existing-protections-leader-schumer-and-senators-cantwell-and-markey-introduce-legislation-to-shield-americans-brain-data-from-exploitation'],
    bidenExport: ['Biden-era BIS controls on chipmaking equipment and AI memory for China (Dec 2024)', 'https://www.bis.gov/press-release/commerce-strengthens-export-controls-restrict-chinas-capability-produce-advanced-semiconductors-military'],
    ntia: ['NTIA report on open-weight AI models (July 2024): monitor risks, no restrictions yet', 'https://www.ntia.gov/issues/artificial-intelligence/open-model-weights-report'],
    ostp: ['OSTP framework for nucleic acid synthesis screening (Apr 2024)', 'https://bidenwhitehouse.archives.gov/ostp/news-updates/2024/04/29/framework-for-nucleic-acid-synthesis-screening/'],
    bidenXi: ['Biden and Xi affirm human control over nuclear-weapons decisions (Nov 2024)', 'https://wbhm.org/npr-story/biden-and-xi-take-a-first-step-to-limit-ai-and-nuclear-decisions-at-their-last-meeting'],
    chips: ['CHIPS and Science Act (2022, passed by a Democratic Congress, with some Republican votes)', 'https://www.congress.gov/bill/117th-congress/house-bill/4346'],
    sanders: ['Senate HELP Democrats\' report on AI and jobs: a robot tax and worker equity stakes (2025)', 'https://www.foxbusiness.com/fox-news-tech/democrats-demand-robot-tax-ai-reportedly-threatens-replace-100m-u-s-jobs'],
  };

  const P = (choice, why, src, judgment = false) => ({ choice, why, src, judgment });

  const POLICIES = {
    posture: {
      trump: P('Sprint to stay ahead', 'The Action Plan frames AI as a race to win and calls for US dominance; it removed Biden-era rules seen as slowing labs.', ['actionPlan', 'eo14179']),
      rep: P('Sprint to stay ahead', 'The 2024 platform and the Paris speech put winning the race ahead of safety rules.', ['gop2024', 'vanceParis']),
      dem: P('Hold course', 'Democrats pair competing with China with safety investment; none has proposed mutual chip limits.', ['dem2024'], true),
    },
    openweights: {
      trump: P('Allow it', 'The Action Plan explicitly encourages open-source and open-weight AI.', ['actionPlan']),
      rep: P('Allow it', 'Continues the Action Plan\'s support for open-weight models and the platform\'s free-speech framing.', ['actionPlan', 'gop2024']),
      dem: P('Allow it after bioweapon testing', 'Biden\'s NTIA advised against restricting open weights for now while monitoring risks; EO 14110 required safety-test reporting.', ['ntia', 'eo14110']),
    },
    neuralink: {
      trump: P('Let the market decide', 'No stated policy on brain implants; closest principle is the deregulatory stance of EO 14179.', ['eo14179'], true),
      rep: P('Let the market decide', 'No stated position; closest principle is the light-touch approach of the platform.', ['gop2024'], true),
      dem: P('Protect brain privacy first', 'Senate Democrats introduced the MIND Act on neural-data privacy.', ['mind']),
    },
    export: {
      trump: P('Enforce today\'s bans and track every chip', 'The Action Plan calls for tighter enforcement, chip location verification and closing equipment loopholes (while it has loosened some chip sales to China).', ['actionPlan', 'h200']),
      rep: P('Enforce today\'s bans and track every chip', 'Continues the Action Plan\'s enforcement and location-verification approach.', ['actionPlan']),
      dem: P('Sweeping new bans', 'The Biden administration repeatedly widened equipment bans; Senate Democrats opposed the H200 sales.', ['bidenExport', 'h200']),
    },
    whistle: {
      trump: P('Create a whistleblower hotline', 'No administration position; closest is Senate Judiciary Chair Grassley\'s Republican-led whistleblower bill. A compute mandate runs against its deregulation.', ['grassley', 'actionPlan'], true),
      rep: P('Create a whistleblower hotline', 'Republican-led AI Whistleblower Protection Act.', ['grassley']),
      dem: P('Create a whistleblower hotline', 'Democrats cosponsor the whistleblower bill, and California\'s SB 53 protects AI-lab whistleblowers.', ['grassley', 'sb53']),
    },
    iaea: {
      trump: P('Let companies audit themselves', 'Rejects global AI governance and a new AI regulator; relies on voluntary testing and a company-run safety accord with outside auditors.', ['kratsios', 'wh2026', 'accord']),
      rep: P('Let companies audit themselves', 'Continues the opposition to a new regulator and to global AI bodies.', ['wh2026', 'kratsios']),
      dem: P('A national regulator only', 'Cantwell calls for enforceable federal standards and independent audits; Blumenthal co-leads a mandatory federal evaluation bill.', ['cantwell', 'hawleyBlumenthal']),
    },
    internal: {
      trump: P('Allow it, with inspectors on site', 'No policy on internal-only AI; closest is EO 14409\'s classified government testing and the accord\'s in-company monitoring.', ['eo14409', 'accord'], true),
      rep: P('Allow it, with inspectors on site', 'No stated position; closest is the voluntary government-testing approach of EO 14409.', ['eo14409'], true),
      dem: P('Limit secret AI', 'No federal position; closest are transparency laws such as SB 53 and Cantwell\'s disclosure principle.', ['sb53', 'cantwell'], true),
    },
    publish: {
      trump: P('Keep research secret', 'No stated position on publishing lab research; closest is the Action Plan\'s focus on protecting US AI from theft and classified testing.', ['actionPlan', 'eo14409'], true),
      rep: P('Keep research secret', 'No stated position; closest is the security focus of the Action Plan.', ['actionPlan'], true),
      dem: P('Publish safety research only', 'SB 53 requires labs to publish their safety frameworks, not their methods.', ['sb53']),
    },
    sleeper: {
      trump: P('Patch it and ship', 'No policy of delaying releases; its pre-release review is voluntary and short, and it argues against holding AI back over safety fears.', ['eo14409', 'vanceParis'], true),
      rep: P('Patch it and ship', 'No stated position; closest is the light-touch, no-licensing approach.', ['eo14409', 'gop2024'], true),
      dem: P('Pause its release for 6 months', 'No stated position on pauses; closest is Cantwell\'s call for independent audits before frontier AI ships.', ['cantwell'], true),
    },
    nearmiss: {
      trump: P('Require worldwide checks on DNA orders', 'The Action Plan requires DNA-synthesis screening for federally funded work and seeks international cooperation on it.', ['actionPlan']),
      rep: P('Require worldwide checks on DNA orders', 'Continues the Action Plan\'s DNA-screening policy.', ['actionPlan']),
      dem: P('Require worldwide checks on DNA orders', 'The Biden OSTP created the federal DNA-synthesis screening framework.', ['ostp']),
    },
    hotline: {
      trump: P('Hotline only', 'Agreed an AI dialogue and incident channel with China in 2026, while rejecting international AI governance.', ['aiChannel', 'kratsios']),
      rep: P('Hotline only', 'Assumed to keep the 2026 AI incident channel; no stated position on joint testing.', ['aiChannel'], true),
      dem: P('Accept all three', 'Cantwell proposes a China incident channel and Biden agreed human control of nuclear weapons with Xi; joint testing is a judgment call.', ['cantwell', 'bidenXi'], true),
    },
    automate: {
      trump: P('Full speed', 'The Action Plan and the Genesis Mission push to apply AI to research as fast as possible.', ['actionPlan', 'genesis']),
      rep: P('Full speed', 'Continues the Action Plan\'s acceleration.', ['actionPlan', 'gop2024']),
      dem: P('Only with safety controls', 'No stated position on automated AI research; closest are the platform\'s safety institute and Cantwell\'s continuous testing.', ['dem2024', 'cantwell'], true),
    },
    jobs: {
      trump: P('Crack down on unrest', 'No AI-jobs policy beyond retraining and no slowing of AI; closest precedent is federalizing the National Guard over protests in 2025.', ['actionPlan', 'guard'], true),
      rep: P('Crack down on unrest', 'No stated position on AI unemployment; closest are retraining-only policy and the 2025 response to protests.', ['actionPlan', 'guard'], true),
      dem: P('An AI dividend for everyone', 'No party-wide position; closest is Senate HELP Democrats\' robot tax and worker equity stakes.', ['sanders'], true),
    },
    neurohack: {
      trump: P('Double down: AI-secured implants', 'No stated position; closest is the Action Plan\'s use of AI for cyber defense.', ['actionPlan'], true),
      rep: P('Double down: AI-secured implants', 'No stated position; closest is the Action Plan\'s AI-for-cyber-defense approach.', ['actionPlan'], true),
      dem: P('Recall them and require open code', 'No stated position; closest is the MIND Act\'s neural-data protections.', ['mind'], true),
    },
    taiwan: {
      trump: P('Build chip factories in Arizona faster', 'Championed TSMC\'s $100B Arizona expansion and onshoring chipmaking.', ['tsmc']),
      rep: P('Build chip factories in Arizona faster', 'Continues the onshoring push.', ['tsmc']),
      dem: P('Build chip factories in Arizona faster', 'Democrats passed the CHIPS Act to bring chipmaking home.', ['chips']),
    },
    sabotage: {
      trump: P('Prepare strikes, but hold off', 'No stated position on China\'s AI labs; closest is the platform\'s peace-through-strength principle.', ['gop2024'], true),
      rep: P('Prepare strikes, but hold off', 'No stated position; closest is peace through strength.', ['gop2024'], true),
      dem: P('Rule it out', 'No stated position; closest is the Biden-era approach of guardrails with China.', ['bidenXi'], true),
    },
    deal: {
      trump: P('Walk away', 'No stated position on capability caps; it rejects global AI governance and aims for US dominance.', ['kratsios', 'actionPlan'], true),
      rep: P('Walk away', 'No stated position; closest is rejection of international AI control.', ['kratsios', 'gop2024'], true),
      dem: P('Sign a looser version', 'No stated position on caps; closest are Cantwell\'s global cooperation and the Biden–Xi nuclear statement.', ['cantwell', 'bidenXi'], true),
    },
    gap: {
      trump: P('Emergency push', 'The Action Plan seeks unquestioned US dominance; the Genesis Mission mobilizes federal science for AI.', ['actionPlan', 'genesis']),
      rep: P('Emergency push', 'Continues the dominance goal.', ['actionPlan', 'gop2024']),
      dem: P('Keep the current pace', 'No stated position; Democrats back competition with safety investment, not an emergency race.', ['dem2024'], true),
    },
    covert: {
      trump: P('Quietly build one of our own', 'No AI precedent; closest is withdrawing from the INF Treaty over Russian cheating and building the banned missiles.', ['inf'], true),
      rep: P('Quietly build one of our own', 'No stated position; closest is the INF Treaty response.', ['inf'], true),
      dem: P('Expose it and demand inspections', 'No stated position; closest is Democrats\' support for verified cooperation.', ['cantwell', 'bidenXi'], true),
    },
    collapse: {
      trump: P('Race to win', 'The Action Plan\'s goal is to win the AI race.', ['actionPlan']),
      rep: P('Race to win', 'Continues the goal of winning the race.', ['actionPlan', 'gop2024'], true),
      dem: P('Try to rebuild talks', 'No stated position; closest is Cantwell\'s global cooperation principle.', ['cantwell'], true),
    },
    fund: {
      trump: P('Grow the US fund instead', 'No global fund proposed; its own moves are national: the sovereign wealth fund order and the federal stake in Intel.', ['swf', 'intel'], true),
      rep: P('Grow the US fund instead', 'No stated position; closest are the Trump-era sovereign fund and equity stakes, both national.', ['swf', 'intel'], true),
      dem: P('Create the global fund now', 'No party-wide position; closest is Senate HELP Democrats\' call for worker equity stakes in automated industries.', ['sanders'], true),
    },
    pledge: {
      trump: P('Leave it to the companies', 'No stated position; closest is the minimally burdensome national standard it asks Congress for.', ['wh2026', 'eo14365'], true),
      rep: P('Leave it to the companies', 'No stated position; closest is the light-touch framework.', ['wh2026'], true),
      dem: P('Make pledges like this binding', 'No stated position; closest is Senate HELP Democrats\' robot tax on automation gains.', ['sanders'], true),
    },
    cern: {
      trump: P('Western allies only', 'Exports the American AI stack to allies and rejects global AI governance.', ['eo14320', 'kratsios']),
      rep: P('Western allies only', 'Continues the allied AI-export approach.', ['eo14320']),
      dem: P('Western allies only', 'Cantwell proposes common safety standards with allies; no Democrat has proposed a joint project with China.', ['cantwell'], true),
    },
    agents: {
      trump: P('Let the industry set rules', 'Prefers industry-led standards and regulatory sandboxes to new rules.', ['actionPlan', 'wh2026']),
      rep: P('Let the industry set rules', 'Continues the sandbox, industry-standards approach.', ['wh2026', 'gop2024']),
      dem: P('Require ID tags and off switches', 'No stated position on agents; closest are EO 14110\'s content-provenance rules and Cantwell\'s oversight principle.', ['eo14110', 'cantwell'], true),
    },
    threshold: {
      trump: P('Launch now', 'No stated position on superintelligence launch; closest are the dominance goal and the argument against holding AI back over safety fears.', ['actionPlan', 'vanceParis'], true),
      rep: P('Launch now', 'No stated position; closest is the dominance goal.', ['actionPlan', 'gop2024'], true),
      dem: P('One more year of safety work', 'No stated position; closest is Cantwell\'s call for independent audits before frontier AI ships.', ['cantwell'], true),
    },
    quiet: {
      trump: P('Compute & capabilities', 'The Action Plan and Genesis Mission put federal effort into AI infrastructure and capability.', ['actionPlan', 'genesis']),
      rep: P('Compute & capabilities', 'Continues the infrastructure push.', ['actionPlan']),
      dem: P('Alignment research', 'The 2024 platform pledged to invest in the AI Safety Institute.', ['dem2024'], true),
    },
  };

  // Which administration decides a year: Trump through 2028, then the party the player picked.
  const adminFor = (year, party) => (year <= TRUMP_LAST_YEAR ? 'trump' : party === 'rep' || party === 'dem' ? party : null);

  // The likely choice on a card: { admin, entry, choice } or null if the year needs a party.
  function defaultChoice(card, year, party) {
    const admin = adminFor(year, party);
    if (!admin) return null;
    const entry = POLICIES[card.id] && POLICIES[card.id][admin];
    const choice = entry && card.choices.find((c) => c.label === entry.choice);
    return choice ? { admin, entry, choice } : null;
  }

  root.SimPolicies = { ADMINS, SOURCES, POLICIES, TRUMP_LAST_YEAR, adminFor, defaultChoice };
})(typeof globalThis !== 'undefined' ? globalThis : this);
