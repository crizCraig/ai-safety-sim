// News-clip checks (news.js). Run by test-model.js, or alone: node test-news.js [--report]
// Plays random campaigns the way the page does and checks the headlines each year produces.
require('./model.js');
require('./events.js');
require('./news.js');
const M = globalThis.SimModel, E = globalThis.SimEvents, N = globalThis.SimNews;

// The page's quiet-year card has no effects in the stand-in.
const QUIET = { id: 'quiet', title: 'Budget Season', choices: [{ label: 'Hold', lev: {}, st: {} }] };

// One campaign as the page plays it: each year a card, a choice, the shown risks, a step.
// Returns every year's headline input and output.
function playCampaign(seed) {
  const rng = M.mulberry32(seed);
  const s = M.initialState(M.sampleWorld(M.defaultAssumptions(), M.mulberry32(seed ^ 0x5bd1e995)));
  const L = M.defaultLevers(), used = new Set(), years = [];
  for (let guard = 0; guard < 20; guard++) {
    const card = E.pickCard(s, L, used, rng) || QUIET;
    used.add(card.id);
    // Players differ: uniform, hawkish (most racing, least diplomacy), dovish (the reverse), or a
    // mix that switches between the two card by card. Some randomness in each.
    const style = seed % 4, n = card.choices.length;
    const dove = (ch) => -((ch.lev || {}).race || 0) + ((ch.lev || {}).diplomacy || 0) + ((ch.levMin || {}).safety || 0) + ((ch.lev || {}).safety || 0) - ((ch.lev || {}).aggression || 0);
    const ranked = card.choices.map((ch, i) => [dove(ch), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
    const mode = style === 3 ? (rng() < 0.5 ? 1 : 2) : style;
    const idx = mode === 0 || rng() < 0.2 ? Math.floor(rng() * n) : mode === 1 ? ranked[0] : ranked[n - 1];
    const choice = card.choices[idx];
    const before = structuredClone({ ...s, log: [] }), L0 = { ...L };
    E.applyChoice(s, L, choice);
    const year = s.year, risk = M.risks(s, L), mid = structuredClone({ ...s, log: [] });
    const res = M.step(s, L, rng, true);
    const input = { prev: years.flatMap((y) => y.news), year, before, mid, after: structuredClone({ ...s, log: [] }), L0, L: { ...L }, choice,
      risk, riskNext: res.event ? null : M.risks(s, L), event: res.event, econ0: years.length ? years[years.length - 1].econ : null };
    years.push({ input, news: N.headlines(input), econ: N.economy(input) });
    if (res.event) break;
  }
  return years;
}

// What is wrong with a story's deck, caption or picture, or '' if nothing.
function storyProblem(h) {
  const okImg = N.IMAGES.includes(h.img) || (/^ending:(\w+)$/.test(h.img || '') && h.img.slice(7) in M.OUTCOMES);
  for (const [k, lo, hi] of [['deck', 8, 20], ['caption', 3, 12]]) {
    const v = h[k];
    if (typeof v !== 'string' || /undefined|NaN|null|\[object/.test(v) || N.words(v) < lo || N.words(v) > hi) return `${k} ${N.words(String(v))} words: ${v}`;
  }
  if (!okImg) return `img ${h.img}`;
  // The body: 2–4 sentences, 15–110 words in all, each a clean sentence.
  const b = h.body;
  if (!Array.isArray(b) || b.length < 2 || b.length > 4) return `body has ${Array.isArray(b) ? b.length : typeof b} sentences: ${JSON.stringify(b)}`;
  const bw = b.reduce((n, x) => n + N.words(String(x)), 0);
  if (bw < 15 || bw > 110) return `body ${bw} words: ${b.join(' ')}`;
  const badS = b.find((x) => typeof x !== 'string' || /undefined|NaN|null|\[object|Infinity/.test(x) || !/[.!?"]$/.test(x) || !/^["A-Z0-9$]/.test(x));
  return badS ? `body sentence: ${badS}` : '';
}

function run(check, report = false) {
  const RUNS = 500, fired = {}, perCat = {}, counts = { 1: 0, 2: 0, 3: 0, other: 0 };
  for (const t of N.TEMPLATES) { fired[t.id] = 0; perCat[t.cat] = (perCat[t.cat] || 0) + 1; }
  let bad = [], badWords = [], badStory = [], imgsUsed = new Set(), calmDoom = 0, years = 0, endingYears = 0, sample = null;
  for (let i = 0; i < RUNS; i++) {
    const game = playCampaign(1000 + i);
    if (i === 3) sample = game;
    for (const { input, news } of game) {
      years++;
      if (input.event) endingYears++;
      const n = news.length;
      if (input.event ? n >= 1 && n <= 2 : n >= 2 && n <= 3) counts[n]++; else counts.other++;
      for (const h of news) {
        fired[h.id]++;
        if (/undefined|NaN|null|\[object/.test(h.text + h.desk)) bad.push(h.text);
        const w = N.words(h.text);
        if (w < 6 || w > 14) badWords.push(`${w}: ${h.text}`);
        const story = storyProblem(h);
        if (story) badStory.push(story);
        imgsUsed.add(h.img);
      }
      const alarms = news.filter((h) => h.tone === 'alarm').length;
      const major = news.some((h) => N.TEMPLATES.find((t) => t.id === h.id).prio >= 80);
      if (!input.event && !major && alarms > 1) calmDoom++;
    }
  }
  check('News: every year gets 2–3 headlines (1–2 in the final year)', counts.other === 0, JSON.stringify(counts));
  check('News: no undefined, NaN or null in any headline', !bad.length, bad.slice(0, 3).join(' | '));
  check('News: every headline is 6–14 words', !badWords.length, badWords.slice(0, 3).join(' | '));
  check('News: every story has an 8–20 word deck, a 2–4 sentence body, a 3–12 word caption and a known picture, with no undefined or NaN', !badStory.length, badStory.slice(0, 3).join(' | '));
  {
    const fs = require('fs'), path = require('path');
    const missing = N.IMAGES.filter((k) => !fs.existsSync(path.join(__dirname, 'assets', 'news', k + '.webp')));
    const endMissing = Object.keys(M.OUTCOMES).filter((k) => !fs.existsSync(path.join(__dirname, 'assets', 'endings-gpt', k + '.webp')) && !fs.existsSync(path.join(__dirname, 'assets', 'endings-gpt', k + '-vance-newsom.webp')));
    check('News: every story picture exists (assets/news, and the ending pictures)', !missing.length && !endMissing.length, [...missing, ...endMissing].join(', '));
    const unused = N.IMAGES.filter((k) => !imgsUsed.has(k));
    check(`News: every one of the ${N.IMAGES.length} story pictures appears in ${RUNS} random campaigns`, !unused.length, unused.join(', '));
  }
  check('News: a calm year has at most one alarming headline', calmDoom === 0, `${calmDoom} calm years with more`);
  const never = Object.keys(fired).filter((k) => !fired[k]);
  check(`News: every one of the ${N.TEMPLATES.length} templates fires in ${RUNS} random campaigns`, !never.length, never.join(', '));

  // Every phrasing of every template is clean and brief, in every context it fires in.
  {
    let fails = [];
    for (let i = 0; i < 60; i++) for (const { input } of playCampaign(5000 + i)) {
      for (const t of N.TEMPLATES) for (const v of N.allStories(t, input)) {
        if (typeof v.text !== 'string' || /undefined|NaN/.test(v.text) || N.words(v.text) < 6 || N.words(v.text) > 14) fails.push(`${t.id}: ${v.text}`);
        const story = storyProblem(v);
        if (story) fails.push(`${t.id}: ${story}`);
      }
    }
    check('News: every variant of every template is a 6–14 word string, with a clean deck, caption and picture', !fails.length, [...new Set(fails)].slice(0, 3).join(' | '));
  }

  // The economy: illustrative figures, bounded and smooth, with monotone targets.
  {
    let bad = [], bright = 0, notFinal = 0;
    for (let i = 0; i < 200; i++) {
      const g = playCampaign(6000 + i);
      g.forEach(({ input, news, econ }, k) => {
        const e0 = k ? g[k - 1].econ : N.ECON_BASE;
        const nums = ['unemp', 'gdp', 'gap', 'capex', 'power', 'orbit', 'drugs', 'displaced', 'capexGrowth'].map((key) => econ[key]);
        if (nums.some((x) => !Number.isFinite(x))) bad.push(`NaN ${JSON.stringify(econ)}`);
        if (econ.unemp < 0 || econ.unemp > 60) bad.push(`unemp ${econ.unemp}`);
        if (econ.gdp < -3 || econ.gdp > 15) bad.push(`gdp ${econ.gdp}`);
        if (Math.abs(econ.unemp - e0.unemp) > 3.5 + 1e-9 || Math.abs(econ.gdp - e0.gdp) > 2.5 + 1e-9) bad.push(`jump ${e0.unemp}->${econ.unemp}, ${e0.gdp}->${econ.gdp}`);
        if (econ.power < e0.power || econ.drugs < e0.drugs || econ.orbit < 0) bad.push('a running total fell');
        if (!input.event) { notFinal++; if (news.some((n) => N.BRIGHT.includes(n.cat) || n.id === 'quietScience')) bright++; }
      });
    }
    check('News: the economy figures are finite, bounded (unemployment 0–60%, growth −3–15%) and smooth year to year', !bad.length, bad.slice(0, 3).join(' | '));
    check('News: most front pages carry an economy, science or medicine story', bright / notFinal > 0.5, `${bright} of ${notFinal}`);
    // Monotone targets: unemployment rises with capability and delegation and falls with the fund's stake;
    // growth rises with capability; the gap between nations shrinks with open models and coordination.
    const base = { capUS: 60, capCN: 55, deleg: 30, fundStake: 10, coord: 30 }, L = { openness: 0.45, race: 0.7 };
    const T = (o, l = L, dcap = 4) => N.econTargets({ ...base, ...o }, l, dcap);
    let mono = true;
    for (let x = 40; x < 100; x += 2) {
      if (T({ capUS: x + 2 }).unemp < T({ capUS: x }).unemp || T({ capUS: x + 2 }).gdp < T({ capUS: x }).gdp) mono = false;
      if (T({ capUS: x, deleg: 60 }).unemp < T({ capUS: x, deleg: 20 }).unemp) mono = false;
      if (T({ capUS: x, fundStake: 50 }).unemp > T({ capUS: x, fundStake: 0 }).unemp) mono = false;
      if (T({ capUS: x }, { ...L, openness: 0.9 }).gap > T({ capUS: x }, { ...L, openness: 0.1 }).gap) mono = false;
      if (T({ capUS: x, coord: 80 }).gap > T({ capUS: x, coord: 10 }).gap) mono = false;
    }
    check('News: the economy targets are monotone (jobs with capability, delegation and the fund; growth with capability; the gap with openness and coordination)', mono);
  }

  // Fictional mastheads only.
  const REAL = /times|post|journal|reuters|bloomberg|guardian|economist|associated press|\bap\b|bbc|cnn|fox|nbc|abc|cbs|wired|verge|axios|politico|atlantic|telegraph|tribune|herald|xinhua/i;
  check('News: mastheads are fictional', Object.values(N.DESKS).every((d) => !REAL.test(d)), Object.values(N.DESKS).join(', '));

  // Determinism: the same game gives the same headlines; replaying a year gives the same ones.
  check('News: the same campaign gives the same headlines', JSON.stringify(playCampaign(42).map((y) => y.news)) === JSON.stringify(playCampaign(42).map((y) => y.news)));
  {
    const g = playCampaign(77);
    check('News: rewinding and replaying a year gives the same headlines', g.every(({ input, news }) => JSON.stringify(N.headlines(structuredClone(input))) === JSON.stringify(news)));
  }

  // No hidden facts: the same visible history in a different hidden world gives the same
  // headlines, with the shown risks recomputed in that world (they are beliefs, so they match too).
  {
    let same = true, diffWorlds = 0, checked = 0;
    for (let i = 0; i < 40; i++) {
      const other = M.sampleWorld(M.defaultAssumptions(), M.mulberry32(900000 + i));
      for (const { input, news } of playCampaign(3000 + i)) {
        const swap = (s) => ({ ...structuredClone(s), world: other });
        const after = swap(input.after);
        const alt = { ...input, before: swap(input.before), mid: swap(input.mid), after,
          risk: M.risks(swap(input.mid), input.L), riskNext: input.riskNext && M.risks(after, input.L) };
        if (input.before.world.difficulty !== other.difficulty) diffWorlds++;
        checked++;
        if (JSON.stringify(N.headlines(alt)) !== JSON.stringify(news) || JSON.stringify(N.economy(alt)) !== JSON.stringify(N.economy(input))) { same = false; break; }
      }
    }
    check('News: headlines are identical for two worlds with the same visible history and different hidden draws', same && diffWorlds > 0, `${checked} years`);
    // The shown risk is the same in both worlds (belief), while the real risk differs.
    const g = playCampaign(31)[2].input, other = M.sampleWorld(M.defaultAssumptions(), M.mulberry32(4242));
    const rA = M.risks(g.after, g.L), rB = M.risks({ ...g.after, world: other }, g.L);
    check('News: the shown risks headlines read do not depend on the hidden world',
      N.RISK_KEYS.every((k) => Math.abs(rA[k] - rB[k]) < 1e-12), N.RISK_KEYS.map((k) => `${k} ${rA[k]} vs ${rB[k]}`).join('; '));
    // Garbage in the hidden fields changes nothing, and neither do the real risks.
    const poisoned = { ...g, before: { ...g.before, world: { difficulty: NaN } }, after: { ...g.after, world: null },
      risk: { ...g.risk, misalignTrue: 0.99, bioTrue: 0.99 }, riskNext: { ...g.riskNext, misalignTrue: 0.99, bioTrue: 0.99 } };
    check('News: the hidden world and the real risks never reach a headline, its body or the economy figures',
      JSON.stringify(N.headlines(poisoned)) === JSON.stringify(N.headlines(g)) && JSON.stringify(N.economy(poisoned)) === JSON.stringify(N.economy(g)));
  }

  if (report) {
    console.log(`\nTemplates by category: ${Object.entries(perCat).map(([k, v]) => `${k} ${v}`).join(', ')} (total ${N.TEMPLATES.length})`);
    console.log(`Firing over ${RUNS} campaigns (${years} years, ${endingYears} final):`);
    for (const t of N.TEMPLATES) console.log(`  ${t.cat.padEnd(9)} ${t.id.padEnd(14)} ${String(fired[t.id]).padStart(5)}  ${(100 * fired[t.id] / years).toFixed(1)}%`);
    console.log('\nSample campaign:');
    for (const { input, news } of sample) console.log(`  ${input.year} (${input.choice.label})\n${news.map((h) => `      ${h.desk}: ${h.text}\n        ${h.deck} [${h.img}: ${h.caption}]\n        ${h.body.join(' ')}`).join('\n')}`);
  }
}

module.exports = { run, playCampaign };
if (require.main === module) {
  let failed = 0;
  run((name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; }, process.argv.includes('--report'));
  process.exit(failed ? 1 : 0);
}
