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
      risk, riskNext: res.event ? null : M.risks(s, L), event: res.event };
    years.push({ input, news: N.headlines(input) });
    if (res.event) break;
  }
  return years;
}

function run(check, report = false) {
  const RUNS = 500, fired = {}, perCat = {}, counts = { 1: 0, 2: 0, 3: 0, other: 0 };
  for (const t of N.TEMPLATES) { fired[t.id] = 0; perCat[t.cat] = (perCat[t.cat] || 0) + 1; }
  let bad = [], badWords = [], calmDoom = 0, years = 0, endingYears = 0, sample = null;
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
      }
      const alarms = news.filter((h) => h.tone === 'alarm').length;
      const major = news.some((h) => N.TEMPLATES.find((t) => t.id === h.id).prio >= 80);
      if (!input.event && !major && alarms > 1) calmDoom++;
    }
  }
  check('News: every year gets 2–3 headlines (1–2 in the final year)', counts.other === 0, JSON.stringify(counts));
  check('News: no undefined, NaN or null in any headline', !bad.length, bad.slice(0, 3).join(' | '));
  check('News: every headline is 6–14 words', !badWords.length, badWords.slice(0, 3).join(' | '));
  check('News: a calm year has at most one alarming headline', calmDoom === 0, `${calmDoom} calm years with more`);
  const never = Object.keys(fired).filter((k) => !fired[k]);
  check(`News: every one of the ${N.TEMPLATES.length} templates fires in ${RUNS} random campaigns`, !never.length, never.join(', '));

  // Every phrasing of every template is clean and brief, in every context it fires in.
  {
    let fails = [];
    for (let i = 0; i < 60; i++) for (const { input } of playCampaign(5000 + i)) {
      for (const t of N.TEMPLATES) for (const v of N.allVariants(t, input)) {
        if (typeof v !== 'string' || /undefined|NaN/.test(v) || N.words(v) < 6 || N.words(v) > 14) fails.push(`${t.id}: ${v}`);
      }
    }
    check('News: every variant of every template is a 6–14 word string', !fails.length, [...new Set(fails)].slice(0, 3).join(' | '));
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
        if (JSON.stringify(N.headlines(alt)) !== JSON.stringify(news)) { same = false; break; }
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
    check('News: the hidden world and the real risks never reach a headline', JSON.stringify(N.headlines(poisoned)) === JSON.stringify(N.headlines(g)));
  }

  if (report) {
    console.log(`\nTemplates by category: ${Object.entries(perCat).map(([k, v]) => `${k} ${v}`).join(', ')} (total ${N.TEMPLATES.length})`);
    console.log(`Firing over ${RUNS} campaigns (${years} years, ${endingYears} final):`);
    for (const t of N.TEMPLATES) console.log(`  ${t.cat.padEnd(9)} ${t.id.padEnd(14)} ${String(fired[t.id]).padStart(5)}  ${(100 * fired[t.id] / years).toFixed(1)}%`);
    console.log('\nSample campaign:');
    for (const { input, news } of sample) console.log(`  ${input.year} (${input.choice.label})\n${news.map((h) => `      ${h.desk}: ${h.text}`).join('\n')}`);
  }
}

module.exports = { run, playCampaign };
if (require.main === module) {
  let failed = 0;
  run((name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; }, process.argv.includes('--report'));
  process.exit(failed ? 1 : 0);
}
