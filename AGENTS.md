# Game of AGI

A static site (no build step): `index.html` (Three.js scene, UI), `model.js` (world model),
`events.js` (campaign cards), `landmask.js` (globe coastlines), `trees.js` (memtree links).
Live at https://thegameofagi.com (agi.memtree.dev redirects there) via GitHub Pages from `main`.

This repo is a public showcase of memtree: the conversations that build it are published as
memtrees, and the page links them under "How it was built".

## Before every push

1. `node test-model.js` must exit 0. It checks AI 2040 calibration (Plans A–C within a few
   points of 72/50/40%; Plan D's known gap stays in 10–30%), timelines, the bio calibration
   against the risk futures actually face, that a pause holds capability still, and that the
   optimized presets keep their promises. If a change moves a preset or a calibration number,
   update the calibration table in index.html and say so in the commit message.
2. Update `trees.js` with the **latest** tree of the current session. Trees are regenerated as
   a session grows, so the link from earlier in the session is stale. Get it with the memtree
   `list` tool (project `ai-safety-sim`) to find the session's latest tree, then use that
   tree's **public share link**, which looks like
   `https://app.polychat.co/usage/memtree/<tree-id>?share=<token>`. The `...-v1-served` URL the
   tool prints needs sign-in, so never put it in `trees.js`. The share token comes from sharing
   the tree in the polychat app; if the tree id changed and you have no token for it, ask the
   user for the new share link. Check it returns HTTP 200 without cookies before committing.
   Update that session's entry if it exists, otherwise append a new entry (newest last), and
   set `updated` to today's date.
3. Scan for sensitive info before pushing: no local paths, emails, keys or tokens.
4. `python3 scripts/stamp_version.py` so browsers fetch the new files instead of cached ones.
5. Commit and push. Pages redeploys on its own.

## Adding things to the model

Everything below was checked against how the newest additions are wired: the unknowns
`share` ("The powerful share the gains") and `valueAlign` ("Aligned AI fights corruption"), the
state variable `deleg` (Λ) and the lever `fund`. `docs/refactor-plan.md` lists the refactors that
shrink these lists; strike items here as they land. Line numbers drift, so search for the names.

### Rules that apply to every change

- **Never disturb existing draws.** `sampleWorld` (model.js) consumes the RNG in the order of
  `DRAW_ORDER`. Append a new unknown's key at the end of it, never in the middle, so every
  existing seed keeps its world (the test's `FIXED` list pins the existing order). The per-year
  dice in `step()` are a fixed array `d` of 17 draws; add a die at the end (`d[17]`) and lengthen
  the array.
- **Belief must equal the average of the truth.** Every hazard has a truth version (the hidden
  draw, used by the dice) and a belief version (shown to players, averaged over the unknown's
  distribution). Test both: belief equals the Monte Carlo average of truth over sampled worlds,
  and belief does not change when only the hidden draw changes.
- **A new mechanism is neutral at its 2027 level.** Write effects relative to the starting value
  (as `oversightBite`, `delegHazard` and the handoff bar do with `deleg - K.deleg0`) so adding it
  does not move 2027 risks.
- **Recalibrate in a separate commit.** Adding a mechanism almost always moves the AI 2040
  calibration (Plans A–C p(alignment)) or the status-quo lock-in share. First commit the mechanism
  (a failing calibration check may be committed only as an explicit WIP that is never pushed, as
  565558e was); then recalibrate one fitted constant in its own revertible commit, update the
  calibration table on the model page (§6) and say so in the commit message.
- **Regenerate the seeded baseline and rerun the sweep** after any deliberate change to results:
  `node scripts/sweep_constants.js --baseline` rewrites `test-k-baseline.json`;
  `node scripts/sweep_constants.js` rewrites `docs/constant-sensitivity.md` and
  `docs/constant-sensitivity-full.md`. Then update the sweep's numbers quoted on the model page
  (§7 "Which numbers matter": the constant count and the "None of the other N" sentence).
- **Every number on the model page is typed by hand** (except `{{GREF}}`, filled by
  `fillModelNumbers()` in index.html). When a constant or formula changes, fix the LaTeX in
  index.html too.

### A hidden unknown

1. `model.js` `ASSUMPTION_INFO`: `{ label, mean, sd, min, max, fmt, help }` and a source comment,
   plus `world(A, v)`: the fields a world carries for value `v`, belief nodes included (e.g.
   `({ x, xNodes: clippedNodes(A.x, 0, 1).nodes })`). Add `sample(A, rng, draw)` and `atMean(A)`
   only if it is not a clipped normal (see `ease`, `speed`, `benevolent`, `bioDecade`). Give it
   `revealOrder`, `roll: [label, (r) => sample text]` (the campaign's roll screen) and
   `secret: [label, (w, c) => html]` (the campaign's "Show secret facts" and the ending reveal;
   `c` has the page's `pct`, the state `s`, levers `L` and `over`). This one
   entry drives the draw (`sampleWorld`), the mean world (`meanWorld`), the roll screen
   (`UNKNOWNS = M.rollRows()`), the secret facts (`secretList` via `M.secretRows`), the Futures Lab sliders,
   unknown-preset matching, share links (`shareURL`/`loadShared` in index.html) and Copy for LLMs
   (`scenarioText`). Append it after the existing keys. If its link units differ from `mean:sd`,
   add a `urlCodec` entry (as `speed`).
2. `model.js` `DRAW_ORDER`: append the key at the end.
3. `model.js` the truth formula reads `s.world.x` (take it as a defaulted parameter, as
   `lockinOdds(s, L, whistle, share, value)` does, so belief callers can pass node values).
4. `model.js` the belief formula averages the truth over `s.world.xNodes` (e.g. the loops in
   `lockinBelief`, `alignBelief`/`cnBelief`, `transitionOdds`'s difficulty loop). Fall back to the
   point value when nodes are missing (`s.world.xNodes || [[1, s.world.x]]`). Keep any cap or
   clamp inside the average, not outside it.
5. `model.js` exports, if tests or the page call new helpers.
6. `index.html` model page §2 Notation: a row in the "Hidden unknowns" table (symbol, meaning
   with sources, distribution).
7. `index.html` the equation(s) in §3/§4 that use it, with constants typed by hand.
8. `index.html` the Lab path tooltip ("Secret facts in this future", `tip-world`) only if it is
    one of the headline unknowns (today: ease, speed, bio).
9. `index.html` §6 calibration table if it moves a calibration target.
10. `README.md` the count of uncertain assumptions ("eleven"), and the test that checks it
    (`Object.keys(M.ASSUMPTION_INFO).length === 11 && readme.includes('eleven uncertain')`).
11. `test-model.js`: calibration of whatever it feeds; belief = average of truth; belief does not
    depend on the hidden draw; the dice use the draw; the draw-order tests (append the key to
    `FIXED`; "... is the last draw of a world", and move the previous last draw to "comes just
    before it").
12. `test-k-baseline.json`: regenerate (a new draw shifts every seeded future), then rerun the
    sweep (see rules).
13. Optional: `presets.js` `UNKNOWN_PRESETS` scenarios; an `events.js` card that gives players a
    handle on it.

### A state variable

1. `model.js` `K_DEFAULTS`: its 2027 level (`x0`) and every constant its update uses (see
   "A model constant").
2. `model.js` `initialState`: `x: K.x0`.
3. `model.js` `STAT_INFO`: `{ label, color }`. Drives the campaign's World state panel
   (`#stats`), the year-change summary's row list, Copy for LLMs' starting state, and the card
   test's valid `st` keys.
4. `model.js` its yearly update in `step()`. Its position in the update order decides which
   inputs are same-year values (see `docs/model-structure.md` §3); read start-of-year values
   unless the same-year read is intended and commented.
5. `model.js` every consumer (hazards in `risks`, `transitionOdds`'s bar, `lockinBase`, other
   updates), each neutral at the 2027 level.
6. `index.html` `SHORT` (chip names, for `chips()`), and `GOOD_UP` or `BAD_UP` (chip colour).
7. `index.html` `yearChanges`: `NAME` (label) and `BAD` (if up is bad).
8. `index.html` model page: §2 Notation state row with its 2027 value, its §5 update equation,
   and each consumer's equation.
9. `events.js`: card effects `st: { x: ±n }` where cards should move it.
10. `index.html` the `why` texts in `renderRisks` if it drives a hazard; globe visuals optional.
11. `test-model.js`: starting value, direction across presets, determinism per seed, the page
    documents it.
12. Recalibration commit and baseline/sweep rerun (see rules).

### A policy lever

1. `model.js` `LEVER_INFO`: `{ label, low, high, def, pct? }`, appended at the end (old
   positional `l=` share links map by index). This alone drives the Lab sliders, the campaign's
   lever panel, share links, `defaultLevers()`, every preset's default (`P()` in presets.js),
   Copy for LLMs and the link round-trip test.
2. `model.js` the formulas it moves (and `hiddenShare`'s no-lever defaults if it enters there).
3. `index.html` `SHORT` and `GOOD_UP`/`BAD_UP` (chips).
4. `index.html` model page §2 "Policy levers" list and its symbol in every equation.
5. `presets.js` presets that should set it; the optimized "Safest mix" and "Under 2% risk" were
   searched over all levers, so check their promises still hold.
6. `events.js` cards `lev: { x: ±v }` / `levMin`.
7. `README.md` "ten policy levers".
8. `test-model.js` behaviour checks; regenerate `test-k-baseline.json` if a default is nonzero
   in a formula; rerun the sweep.

### A model constant

1. `model.js` `K_DEFAULTS`, in its group; formulas read `K.name`, never an inline number. If a
   cache depends on it (`CN_LABOR`, `BIO_REF`, `BIO_NODE_CACHE`), clear or recompute it in
   `setConstants`.
2. `scripts/sweep_constants.js` `META[name] = [type, group, plain name, what it does]` (the sweep
   refuses to run without it); `SHIFT` if it is a level or threshold, `BOUNDED` if it is a
   fraction that must stay in [0, 1].
3. `index.html` the number in the model page equation.
4. If the default reproduces the old inline value, results are unchanged
   (`test-k-baseline.json` still matches). Otherwise regenerate it.
5. Rerun the sweep and update the counts on the model page §7 ("each of the model's N named
   constants", "None of the other N", "M of the N move none by more than 3").

### An outcome or ending

1. `model.js` `OUTCOMES`: `{ title, color, text }` (drives the Lab's outcome list, path colours,
   the campaign ending, Copy for LLMs, `monteCarlo`/`summarize` counts).
2. `model.js` `CATASTROPHES` if it is one.
3. `model.js` `step()`: the dice branch that returns `finish(s, key, r, stage)` **and** the
   expected-value bookkeeping (`s.alive`, `s.safeEnded`, `s.survival`) that mirrors it.
4. `model.js` `summarize`'s p(alignment) rule (and its copy in
   `scripts/sweep_constants.js` `summarizeCRN`).
5. `index.html` `ATMO` (globe colour), the globe's ending visuals (`out === 'lockin'` etc. in the
   ending animation), `endKicker` wording (good / unresolved / catastrophe), and the ending art
   `assets/endings-gpt/<key>.webp` (`scripts/gen_card_art.py endings`).
6. `index.html` model page §4 Endings.
7. `test-model.js` `bad()` and outcome checks; regenerate `test-k-baseline.json` (counts gain a
   key) and rerun the sweep if it moves catastrophe.

### A campaign card

1. `events.js` `CARDS`: `{ id, year | when(s, L), tag, title, text, choices: [3 × { label, note,
   lev, levMin, st, stMin }] }`. `lev` keys must be in `LEVER_INFO`, `st` keys in `STAT_INFO` (or
   `cnMult`). Pinned cards use `year`; pool cards use `when`. Adding a pool card changes which
   card seeded games draw.
2. Art: `assets/cards-gpt/<id>.webp` (painted) and `assets/cards/<id>.svg` (fallback drawing),
   made with `scripts/gen_card_art.py <id>` and `scripts/process_card_art.py`, which writes the
   focal point into `ART_FOCUS` in index.html. Add the id to `PRESIDENT_ART` if it shows the
   president.
3. `test-model.js`: valid keys, three choices, and that it comes up in ordinary play.

### A preset

1. `presets.js` `PRESETS` (levers via `P({...})`), and its text in `PRESET_INFO` or, for an
   AI 2040 plan, `PLAN_INFO` (targets). Buttons are built from these; "Safest mix" and
   "Under 2% risk" are placed by name in `buildLabUI`.
2. `test-k-baseline.json`: regenerate (the baseline test covers every preset).
3. `test-model.js` any promise the description makes; §6 calibration table for a calibrated plan.
4. Unknown scenarios go in `UNKNOWN_PRESETS` (`set` lists only the unknowns it changes).
