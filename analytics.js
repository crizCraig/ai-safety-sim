// Anonymous gameplay analytics: how far games get, which settings people use, on which version.
// Sent straight to PostHog Cloud's HTTP capture API (no SDK, no third-party script). With an
// empty key nothing is sent. The key is a public project key (phc_...), safe to publish.
const ANALYTICS = { endpoint: 'https://us.i.posthog.com/i/v0/e/', key: 'phc_z3AMdRSVYzXBFjPnkczR9QPzGuGkgX2EpRPk4DLmMafd' };

// Privacy: no cookies and no browser storage. The id is random and lives in memory for this
// page load only (one "visit"), so visits can't be linked. Do Not Track and Global Privacy
// Control turn it off. Callers never pass free text, full URLs or hidden facts before the
// game reveals them. Every event and its properties are listed in AGENTS.md ("Analytics").
(function (root) {
  const GA = { ANALYTICS };
  // What the page provides (index.html sets these once its module has loaded).
  GA.ctx = { v: '', mode: () => '', webgl: () => false };
  // Swappable in tests.
  GA.env = {
    nav: () => root.navigator || {},
    host: () => { try { return root.location.hostname; } catch (e) { return ''; } },
    now: () => (root.performance && root.performance.now ? root.performance.now() : Date.now()),
    date: () => new Date().toISOString(),
    width: () => root.innerWidth || 0,
    setTimeout: (f, ms) => root.setTimeout(f, ms),
    clearTimeout: (t) => root.clearTimeout(t),
  };
  GA.t0 = GA.env.now(); // page load, for each event's t
  const rid = () => {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    return 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  };
  GA.id = rid();

  // Off without a key, or when the browser asks not to be tracked.
  GA.blocked = () => {
    const n = GA.env.nav();
    return n.doNotTrack === '1' || n.doNotTrack === 'yes' || n.globalPrivacyControl === true;
  };
  // Only the real site sends: local copies, previews and test runs stay out of the numbers.
  GA.liveHost = () => /^(www\.)?thegameofagi\.com$/.test(GA.env.host() || '');
  GA.enabled = () => !!ANALYTICS.key && !GA.blocked() && GA.liveHost();

  GA.device = (w = GA.env.width()) => (w <= 640 ? 'phone' : w <= 1024 ? 'tablet' : 'desktop');
  // The properties every event carries.
  GA.common = () => {
    const c = GA.ctx;
    let mode = '', webgl = false;
    try { mode = c.mode(); } catch (e) {}
    try { webgl = !!c.webgl(); } catch (e) {}
    return { v: c.v, mode, device: GA.device(), webgl, t: Math.round((GA.env.now() - GA.t0) / 100) / 10 };
  };
  // The provider's wire format. Swapping providers means changing this and ANALYTICS.
  GA.payload = (event, props) => ({
    api_key: ANALYTICS.key,
    event,
    distinct_id: GA.id,
    timestamp: GA.env.date(),
    properties: Object.assign({}, props, GA.common(), {
      $process_person_profile: false, // no person profiles: events stay anonymous
      $geoip_disable: true, // no location looked up from the IP
      $ip: null,
      $lib: 'goagi',
    }),
  });
  // A JSON body sent as text/plain, so the browser makes no preflight request.
  GA.transport = (url, body) => {
    const n = GA.env.nav();
    if (n.sendBeacon && n.sendBeacon(url, body)) return;
    if (root.fetch) root.fetch(url, { method: 'POST', body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  };
  GA.sent = 0;
  // Never throws and never blocks: one small beacon per event.
  GA.track = (event, props) => {
    try {
      if (!GA.enabled()) return false;
      GA.transport(ANALYTICS.endpoint, JSON.stringify(GA.payload(event, props || {})));
      GA.sent++;
      return true;
    } catch (e) { return false; }
  };

  // Calls fn(value) once value has stopped changing for `quiet` ms, and at most once every `gap`
  // ms (a later change waits for the gap). An unchanged value (same JSON as last sent) is skipped.
  GA.settler = (fn, quiet = 3000, gap = 10000) => {
    let timer = null, last = -Infinity, lastKey = null, pending;
    const fire = () => {
      timer = null;
      let key; try { key = JSON.stringify(pending); } catch (e) { return; }
      if (key === lastKey) return;
      lastKey = key; last = GA.env.now();
      try { fn(pending); } catch (e) {}
    };
    return (value) => {
      try {
        pending = value;
        if (timer) GA.env.clearTimeout(timer);
        const wait = Math.max(quiet, last + gap - GA.env.now());
        timer = GA.env.setTimeout(fire, wait);
      } catch (e) {}
    };
  };

  // Where a visit came from: the referrer's domain only (not the page) and any utm tags.
  GA.origin = (referrer, search, host) => {
    const out = {};
    try {
      if (referrer) {
        const h = new URL(referrer).hostname;
        out.ref = h === host ? 'self' : h.replace(/^www\./, '');
      }
    } catch (e) {}
    try {
      const q = new URLSearchParams(search || '');
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
        const v = q.get(k);
        if (v) out[k] = v.slice(0, 64).replace(/[^\w.\-+ ]/g, '');
      }
    } catch (e) {}
    return out;
  };

  root.GameAnalytics = GA;
  root.GA_track = GA.track;
  if (typeof module !== 'undefined' && module.exports) module.exports = GA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
