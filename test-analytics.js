// Analytics checks (analytics.js and its calls in index.html). Run by test-model.js, or alone:
// node test-analytics.js
const fs = require('fs');

function run(check) {
  const GA = require('./analytics.js');
  const A = GA.ANALYTICS;
  const sent = [];
  let nav = {};
  let clock = 0;
  const timers = [];
  GA.env = {
    nav: () => nav,
    now: () => clock,
    date: () => '2026-01-01T00:00:00.000Z',
    width: () => 390,
    setTimeout: (f, ms) => { const t = { at: clock + ms, f }; timers.push(t); return t; },
    clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  };
  // Advance the fake clock, running timers that come due.
  const advance = (ms) => {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > end) break;
      const t = timers.shift(); clock = t.at; t.f();
    }
    clock = end;
  };
  GA.t0 = 0;
  GA.transport = (url, body) => sent.push({ url, body: JSON.parse(body) });
  GA.ctx = { v: '20260101000000', mode: () => 'campaign', webgl: () => true };

  const key0 = A.key;
  check('Analytics: the key is a public PostHog project key (phc_…) or empty', key0 === '' || /^phc_[A-Za-z0-9]+$/.test(key0));
  A.key = '';
  check('Analytics: with an empty key, tracking sends nothing', GA.track('visit', {}) === false && sent.length === 0);

  A.key = 'phc_test';
  nav = { doNotTrack: '1' };
  const dnt = GA.track('visit', {});
  nav = { globalPrivacyControl: true };
  const gpc = GA.track('visit', {});
  check('Analytics: Do Not Track and Global Privacy Control block sending', dnt === false && gpc === false && sent.length === 0);

  nav = {};
  clock = 12345;
  GA.track('camp_choice', { year: 2027, card: 'export', choice: 1 });
  const p = sent[0] && sent[0].body, pr = (p && p.properties) || {};
  check('Analytics: a payload has the capture fields and goes to the endpoint',
    sent.length === 1 && sent[0].url === A.endpoint && p.api_key === 'phc_test' && p.event === 'camp_choice'
    && typeof p.distinct_id === 'string' && p.distinct_id.length >= 8 && p.timestamp === '2026-01-01T00:00:00.000Z', JSON.stringify(p));
  check('Analytics: every event carries the version, mode, device, WebGL and seconds since load',
    pr.v === '20260101000000' && pr.mode === 'campaign' && pr.device === 'phone' && pr.webgl === true && typeof pr.t === 'number' && pr.t > 0, JSON.stringify(pr));
  check('Analytics: events stay anonymous (no person profile, no GeoIP)', pr.$process_person_profile === false && pr.$geoip_disable === true);
  check('Analytics: the id is per page load, not stored', !/localStorage|sessionStorage|document\.cookie/.test(fs.readFileSync(__dirname + '/analytics.js', 'utf8')));
  check('Analytics: device classes by width', GA.device(390) === 'phone' && GA.device(800) === 'tablet' && GA.device(1440) === 'desktop');
  GA.ctx = { v: 'x', mode: () => { throw new Error('boom'); }, webgl: () => false };
  GA.transport = () => { throw new Error('offline'); };
  let threw = false;
  try { GA.track('visit', {}); } catch (e) { threw = true; }
  check('Analytics: a failing page context or transport never throws', !threw);
  GA.transport = (url, body) => sent.push({ url, body: JSON.parse(body) });

  // Referrer: its domain only; utm tags kept, other query parameters dropped.
  const o = GA.origin('https://news.ycombinator.com/item?id=123', '?utm_source=hn&utm_campaign=launch&race=70&email=a@b.c', 'thegameofagi.com');
  check('Analytics: the referrer is reduced to its domain and only utm tags are kept',
    o.ref === 'news.ycombinator.com' && o.utm_source === 'hn' && o.utm_campaign === 'launch' && Object.keys(o).length === 3, JSON.stringify(o));
  check('Analytics: a same-site referrer reads as self', GA.origin('https://thegameofagi.com/?x=1', '', 'thegameofagi.com').ref === 'self');

  // Debounce: fires 3 s after the last change, at most once per 10 s, and skips repeats.
  const got = [];
  const settle = GA.settler((v) => got.push([clock, v]), 3000, 10000);
  clock = 0;
  settle(1); advance(1000); settle(2); advance(1000); settle(3);
  advance(2999);
  const early = got.length;
  advance(1);
  check('Analytics: settings are sent only once they settle for 3 s', early === 0 && got.length === 1 && got[0][1] === 3 && got[0][0] === 5000, JSON.stringify(got));
  settle(4); advance(3000);
  const gapHeld = got.length === 1;
  advance(7000);
  check('Analytics: settled settings are sent at most once per 10 s', gapHeld && got.length === 2 && got[1][0] === 15000 && got[1][1] === 4, JSON.stringify(got));
  settle(4); advance(20000);
  check('Analytics: unchanged settings are not sent again', got.length === 2);
  A.key = key0;

  // The page's calls: every event documented, none reads the hidden world or free text.
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const agents = fs.readFileSync(__dirname + '/AGENTS.md', 'utf8');
  const readme = fs.readFileSync(__dirname + '/README.md', 'utf8');
  const calls = [...html.matchAll(/track\('([a-z_]+)'(.*)$/gm)].map((m) => [m[1], m[2]]);
  const names = [...new Set(calls.map(([n]) => n))];
  const undocumented = names.filter((n) => !agents.includes('`' + n + '`') || !readme.includes('`' + n + '`'));
  check('Analytics: the page sends the expected events', ['visit', 'mode_open', 'camp_start', 'camp_choice', 'camp_paper', 'camp_end', 'camp_quit',
    'lab_settings', 'preset', 'unk_preset', 'jump', 'dist_open', 'share', 'copy_ai', 'tour', 'model_open', 'link', 'secrets_toggle'].every((n) => names.includes(n)), names.join(', '));
  check('Analytics: every event is documented in AGENTS.md and README.md', !undocumented.length, undocumented.join(', '));
  const leaky = calls.filter(([, rest]) => /world|secretList|transitionOdds|Real|True|\.value|textContent|innerText|location\.href|location\.search(?!,)|document\.referrer(?!,)/.test(rest));
  check('Analytics: no event reads the hidden world, typed text or the full URL', !leaky.length, leaky.map(([n]) => n).join(', '));
  const endFn = html.slice(html.indexOf('function showEnding()'), html.indexOf('function showEnding()') + 4000);
  check('Analytics: the outcome is sent only from the ending (once it is revealed)',
    calls.filter(([, rest]) => /outcome/.test(rest)).every(([n]) => n === 'camp_end' || n === 'again') && endFn.includes("track('camp_end'"));
  check('Analytics: the About page has the privacy note', /id="privacyNote"[^>]*>Privacy:[^<]*no cookies[^<]*Do Not Track or Global Privacy Control/.test(html));
  check('Analytics: index.html loads analytics.js and the artifact build copies it',
    /<script src="analytics\.js\?v=/.test(html) && fs.readFileSync(__dirname + '/scripts/build_artifact.py', 'utf8').includes('"analytics.js"'));
}

module.exports = { run };
if (require.main === module) {
  let failed = 0;
  run((name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`); if (!ok) failed++; });
  process.exit(failed ? 1 : 0);
}
