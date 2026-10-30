# Game of AGI

A static site (no build step): `index.html` (Three.js scene, UI), `model.js` (world model),
`events.js` (campaign cards), `news.js` (campaign news clips), `landmask.js` (globe coastlines),
`trees.js` (memtree links).
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
  the array. A die whose job is removed (as `d[9]`, the old alignment noise) is still drawn.
- **Belief must equal the average of the truth.** Every hazard has a truth version (the hidden
  draw, used by the dice) and a belief version (shown to players, averaged over the unknown's
  distribution). Test both: belief equals the Monte Carlo average of truth over sampled worlds,
  and belief does not change when only the hidden draw changes.
- **A new mechanism is neutral at its 2027 level.** Write effects relative to the starting value
  (as `oversightBite`, `delegHazard`, the handoff bar and `lockinBase`'s delegation factor do with `deleg - K.deleg0`) so adding it
  does not move 2027 risks.
- **Recalibrate in a separate commit.** Adding a mechanism almost always moves the AI 2040
  calibration (Plans A–C p(alignment)) or the status-quo lock-in share. First commit the mechanism
  (a failing calibration check may be committed only as an explicit WIP that is never pushed, as
  565558e was); then recalibrate one fitted constant in its own revertible commit, update the
  calibration table on the model page (§6) and say so in the commit message.
- **Bio is calibrated to the default path's exposure.** `G_ref` (`bioRefExposure()`, cached in
  `BIO_REF`) is recomputed from 3,000 fixed-seed default-path futures, so any change to `step()`
  or to what the default path goes through moves it and rescales the bio hazard
  `k = -ln(1 - R_bio) / G_ref` (the start-of-year update moved it 0.19 -> 0.06). Never hard-code
  it; check the bio calibration test and the model page's quoted bio numbers (§3).
- **Regenerate the seeded baseline and rerun the sweep** after any deliberate change to results:
  `node scripts/sweep_constants.js --baseline` rewrites `test-k-baseline.json`;
  `node scripts/sweep_constants.js` rewrites `docs/constant-sensitivity.md` and
  `docs/constant-sensitivity-full.md`. Then update the sweep's numbers quoted on the model page
  (§7 "Which numbers matter": the constant count and the "None of the other N" sentence).
- **The model page fills its constants from `K`.** In the equations (`.math`), inline math
  (`.mi`) and the notation table's 2027 values (`.kv`), write a constant as `⟦name⟧`, `⟦name:1⟧`
  (one decimal), `⟦name:f⟧` (an exact fraction listed in `K_FRACTIONS`, such as 6/13; it falls
  back to decimals once the constant is overridden) or `⟦1-name⟧` (one `+ - * /` between two
  constants or numbers); `fillModelNumbers()` fills them through `M.fillConstants` before Temml
  renders and before Copy for AI reads the page. A test fails if any `.math`, `.mi` or `.kv`
  element, or a cell of the state table's 2027 column, types a number by hand, unless the number
  is a unit (1 or 0 that is not a coefficient, a /100 scale, log base 10), an unknown's
  distribution `\mathcal{N}(…)` or `\mathcal{B}(mean,\ sd)` (a Beta by its mean and sd), or part of one of the expressions in the test's `LITERAL_OK`,
  each tagged structural, example or historical. Allow a new literal there by its whole
  expression, never by its value alone, and the test also fails on an allowance no longer used.
  Numbers in the prose are still typed by hand.

### A hidden unknown

1. `model.js` `ASSUMPTION_INFO`: `{ label, mean, sd, min, max, fmt, help }` and a source comment,
   plus `world(A, v)`: the fields a world carries for value `v`, belief nodes included (e.g.
   `({ x, xNodes: probNodes(A.x).nodes })`). A probability or share gets `fmt: 'pct'`, which
   makes it a Beta on [min, max] (usually [0, 1]) whose mean and sd are the sliders' center and
   spread: `draw` samples it from one standard normal (`betaAtZ(betaOf(...), z)`, two RNG calls
   like every draw), `probNodes(A.x, min, max)` gives its belief nodes (exact mean, values inside
   each bin) and `probMean` its mean, the default `atMean`. Never clip a normal to [0, 1] for a
   probability: the clipped mass piles up at the ends and the label stops being the mean. Set the
   default from your best guess of the mean and sd; a spread above 0.95·√(m(1−m)) is capped
   (`BETA_SD_CAP`). Add `sample(A, rng, draw)` and `atMean(A)` only if it is neither a Beta nor
   a clipped normal (see `ease`, `speed`, `benevolent`, `bioDecade`). Give it
   `revealOrder`, `roll: [label, (r) => sample text]` (the campaign's roll screen) and
   `secret: [label, (w, c) => html]` (the campaign's "Show secret facts" and the ending reveal;
   `c` has the page's `pct`, the state `s`, levers `L` and `over`). This one
   entry drives the draw (`sampleWorld`), the mean world (`meanWorld`), the roll screen
   (`UNKNOWNS = M.rollRows()`), the secret facts (`secretList` via `M.secretRows`), the Futures Lab sliders,
   unknown-preset matching, share links (`shareURL`/`loadShared` in index.html) and Copy for AI
   (`scenarioText`). Append it after the existing keys. If its link units differ from `mean:sd`,
   add a `urlCodec` entry (as `speed`).
2. `model.js` `DRAW_ORDER`: append the key at the end.
3. `model.js` the truth formula reads `s.world.x` (take it as a defaulted parameter, as
   `lockinOdds(s, L, whistle, share, value)` does, so belief callers can pass node values).
4. `model.js` the belief formula averages the truth over `s.world.xNodes` (e.g. the loops in
   `lockinBelief`, `alignBelief`/`cnBelief`, `transitionOdds`'s difficulty loop). An unknown can feed
   more than one hazard: `whistle` enters `lockinOdds` and `hiddenShare`, so one set of
   value-spaced nodes (`whistleNodes`) feeds both, and where one outcome multiplies two
   beliefs that share a draw, average the product per node, not the product of averages
   (`handoffBelief`). Use value-spaced nodes (a `dx` in `probNodes`), not a few equal-mass
   groups: a skewed prior hides a wide tail inside one group. Fall back to the
   point value when nodes are missing (`s.world.xNodes || [[1, s.world.x]]`). Keep any cap or
   clamp inside the average, not outside it.
5. `model.js` exports, if tests or the page call new helpers.
6. `index.html` model page §2 Notation: a row in the "Hidden unknowns" table (symbol, meaning
   with sources, distribution; a probability as `\mathcal{B}(mean,\ sd)`, plus "on [min, max]" if its range is not [0, 1]).
7. `index.html` the equation(s) in §3/§4 that use it (constants as `⟦name⟧`).
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
3. `model.js` `STAT_INFO`: `{ label, color, short, name, up }`. `short` names it on card chips,
   `name` in the year-change summary, `up: 'good' | 'bad'` (or absent) colours both. Drives the
   campaign's World state panel (`#stats`), the chips, the year-change summary, Copy for AI'
   starting state, and the card test's valid `st` keys.
4. `model.js` its yearly update in `step()`. Every update reads the start-of-year state from
   `s0` (a frozen copy made at the top of `step()`) and writes `s`, so line order does not
   matter. Read `s0.x`, never `s.x`, in an update; a deliberate same-year read must be named and
   commented, as `coordShocked` (the deal shock cuts coordination this year) is. Only the
   milestone, handoff and 2040 checks after the updates read the end-of-year `s`.
5. `model.js` every consumer (hazards in `risks`, `transitionOdds`'s bar, `lockinBase`, other
   updates), each neutral at the 2027 level.
6. `index.html` model page: §2 Notation state row with its 2027 value as `<td class="kv">⟦x0⟧</td>`,
   its §5 update equation, and each consumer's equation (constants as `⟦name⟧`).
7. `events.js`: card effects `st: { x: ±n }` where cards should move it.
8. `index.html` the `why` texts in `renderRisks` if it drives a hazard; globe visuals optional.
9. `test-model.js`: starting value, direction across presets, determinism per seed, the page
   documents it.
10. Recalibration commit and baseline/sweep rerun (see rules).

### A policy lever

1. `model.js` `LEVER_INFO`: `{ label, low, high, def, pct?, short, up? }`, appended at the end
   (old positional `l=` share links map by index), plus its place in `LEVER_GROUPS`, which sets
   the order and headings it is shown under. This alone drives the Lab sliders, the
   campaign's lever panel, card chips (`short`, `up` as in `STAT_INFO`), share links,
   `defaultLevers()`, every preset's default (`P()` in presets.js), Copy for AI and the link
   round-trip test.
2. `model.js` the formulas it moves (and `hiddenShare`'s no-lever defaults if it enters there).
3. `index.html` model page §2 "Policy levers" list and its symbol in every equation.
4. `presets.js` presets that should set it; the optimized "Safest mix" and "Under 2% risk" were
   searched over all levers, so check their promises still hold.
5. `events.js` cards `lev: { x: ±v }` / `levMin`.
6. `README.md` "ten policy levers".
7. `test-model.js` behaviour checks; regenerate `test-k-baseline.json` if a default is nonzero
   in a formula; rerun the sweep.

### A model constant

1. `model.js` `K_DEFAULTS`, in its group; formulas read `K.name`, never an inline number. If a
   cache depends on it (`CN_LABOR`, `BIO_REF`, `BIO_NODE_CACHE`), clear or recompute it in
   `setConstants`.
   A pure normalization that fixes a unit (e.g. `COMPUTE_NORM`, race 0.55 = 1× compute) is a
   named code constant, not in `K`, and is not swept; if an equation shows it, add its number to
   the test's `LITERAL_OK` expressions (the whole expression, tagged structural). Prefer folding a base term into a scale constant (as the cuts
   of `intBase`, `alBase`, `lockRaceBase` and `lockTrustBase` did) over adding a new constant.
2. `scripts/sweep_constants.js` `META[name] = [type, group, plain name, what it does]` (the sweep
   refuses to run without it); `SHIFT` if it is a level or threshold, `BOUNDED` if it is a
   fraction that must stay in [0, 1].
3. `index.html` `⟦name⟧` where the model page's equations use it (a test rejects a hand-typed
   constant in an equation); fix any prose that quotes its value.
4. If the default reproduces the old inline value, results are unchanged
   (`test-k-baseline.json` still matches). Otherwise regenerate it.
5. Rerun the sweep and update the counts on the model page §7 ("each of the model's N named
   constants", "None of the other N", "M of the N move none by more than 3").
6. `README.md` the count of named constants in the `model.js` row ("its N named constants");
   a test checks it against `Object.keys(K)`.

To **remove or merge** a constant, first screen it with `node scripts/sweep_constants.js
--marginals` (add it to `CUTS` as the overrides that reproduce the cut, or check an edited copy of
the model with `--save`/`--against`). The headline sweep's presets barely use the fund, oversight
and transparency, so "moves nothing there" is not enough: a cut must move no preset's catastrophe by
more than 0.3 points and no lever's effect or Plan A–D p(alignment) by more than about 1, and must
pass the screen's interior safety settings under the AI Futures unknowns (20,000 futures, 200,000
near the line). Passing is necessary, not sufficient: also read the mechanism and ask where it acts.
Lever endpoints under the default unknowns hid `laborPause` (AI labor on safety past the knee), which
works when capability starts above the AI-research onset. Then do steps 1–6 in reverse and record it
in `docs/simplification-2.md`.

### An outcome or ending

1. `model.js` `OUTCOMES`: `{ title, color, text }` (drives the Lab's outcome list, path colours,
   the campaign ending, Copy for AI, `monteCarlo`/`summarize` counts).
2. `model.js` `CATASTROPHES` if it is one.
3. `model.js` `step()`: the dice branch that returns `finish(s, key, r, stage)` **and** the
   expected-value bookkeeping (`s.alive`, `s.safeEnded`, `s.survival`) that mirrors it.
4. `model.js` `alignmentScore` (the p(alignment) rule `summarize` and the sweep's
   `summarizeCRN` share).
5. `index.html` `ATMO` (globe colour), the globe's ending visuals (`out === 'lockin'` etc. in the
   ending animation), `endKicker` wording (good / unresolved / catastrophe), and the ending art
   `assets/endings-gpt/<key>.webp`: add its prompt to `ENDINGS` in `scripts/gen_card_art.py`
   (`generate()` looks every id up in `CARDS`/`ENDINGS` and fails on a missing one), generate
   with `scripts/gen_card_art.py endings` (raw PNGs), then crop with
   `scripts/process_card_art.py` after adding its focal height to that script's `FOCUS`.
6. `index.html` model page §4 Endings.
7. `test-model.js` `bad()` and outcome checks; regenerate `test-k-baseline.json` (counts gain a
   key) and rerun the sweep if it moves catastrophe.

### A campaign card

1. `events.js` `CARDS`: `{ id, year | when(s, L), tag, title, text, choices: [3 × { label, note,
   lev, levMin, st, stMin }] }`. `lev` keys must be in `LEVER_INFO`, `st` keys in `STAT_INFO` (or
   `cnMult`). Pinned cards use `year`; pool cards use `when`. Adding a pool card changes which
   card seeded games draw.
2. Art, in three separate steps:
   - Raw generation: add the card's prompt to `CARDS` in `scripts/gen_card_art.py` (`generate()`
     looks the id up there and fails on a missing one), then run `scripts/gen_card_art.py <id>`.
   - Processing: add its focal height to `FOCUS` in `scripts/process_card_art.py`, then run that
     script. It crops to `assets/cards-gpt/<id>.webp` and writes the focal point into
     `ART_FOCUS` in index.html.
   - SVG fallback: `assets/cards/<id>.svg` is drawn by hand. Neither script makes it, and
     `showCardArt` falls back to it when the painted image fails to load.
   If the card shows the US president, add the id in four places: `PRESIDENT_SPOT` in
   `gen_card_art.py` (where he stands, for the split Vance | Democrat redraw,
   `CARD_ART_SPLIT=newsom|aoc`), `SPLIT_IDS` in `process_card_art.py` (only the split versions
   are processed), its `FOCUS` there, and `PRESIDENT_ART` in index.html.
3. `test-model.js`: valid keys, three choices, and that it comes up in ordinary play.

### A headline template

The campaign shows two or three news clips after each year (`news.js`, tested by `test-news.js`,
which `test-model.js` runs).

1. `news.js` `TEMPLATES`: `{ id, cat, desk, tone, prio, when(c), text, deck, caption, img, same? }`, placed with its
   category. `when` and `text` read only the context `c` that `context()` builds from visible
   input: `c.a` / `c.b` (state before the choice / at the end of the year, `VIS_KEYS` only),
   `c.d` (their difference), `c.cl` / `c.cs` (the choice's lever and state moves), `c.r0` / `c.r1`
   (the risks shown this year and next, `RISK_KEYS` only), `c.cap0` / `c.cap1`, `c.lead0` /
   `c.lead1`, `c.gap0` / `c.gap1`, `c.dealOn0` / `c.dealOn1`, `c.event`, and `c.e` / `c.e0` (this
   year's and last year's economy, below). Never read `s.world`, the
   real risks (`bioTrue`, `misalignTrue`) or the handoff's real odds, and do not word a headline so
   it hints at a hidden fact. If a template needs a new visible field, add it to `VIS_KEYS`.
2. `text`: two phrasings (a list, or a function of `c` returning one), each 6–14 words, newsy
   and factual. Roles, not people ("the White House", "Beijing", "a frontier lab"); no quotes put
   in real people's mouths. `desk` is a key of `DESKS` (or a list of them); mastheads are
   fictional, never real outlets. `deck`: the front page's one-line summary, 8–20 words, factual,
   only player-visible facts; `caption`: 3–12 words; `img`: a key of `IMAGES` (a black-and-white
   news photo in `assets/news/`, made by `scripts/gen_news_art.py` with gpt-image-2.5-sunburst; the
   endings use `end_<outcome>`). Only the lead story's photo is printed: `headlines` gives the lead a `photo`, one of
   `PHOTOS[img]` (the kind's own photo and its variants `<kind>_<n>`, counts in `VARIANTS`) that no earlier front
   page of the playthrough printed, picked by hash, else one of a `RELATED` kind; it is stored with the headlines. Each is a string or
   a function of `(c, headline)` when the phrasings need different ones. Add the body to `BODY`:
   2–4 sentences, a bespoke one or two plus fact sentences from `F` (each prints a visible number);
   quotes only from roles ("a lab spokesperson said"), never from real people. A fact already printed
   higher on the same page is dropped and `SPARE` facts fill the body back to two sentences.
3. `prio` orders a year's candidates (the most important leads): about 90+ for milestones,
   deal shocks and ending-level news, 60–85 for warning signs and big shifts, 30–60 for ordinary
   change and the player's choice, under 10 for quiet filler. A year shows at most one per
   category, and a calm year (nothing at 60 or above) shows two items plus a quiet one, with at
   most one `tone: 'alarm'`. `same` lists templates that would say the same thing. Categories
   `economy`, `science` and `medicine` (`BRIGHT`) share a slot so most pages carry one; science and
   medicine only enter through that slot, rotating with the least recently run category.
   **The economy figures are illustrative flavour, not model outputs.** The model has no GDP, jobs
   or spending; `economyOf` derives unemployment, GDP growth, the gap between AI-adopting and
   lagging economies, AI capex, data-centre power, compute in orbit and AI-designed drug approvals
   from the visible state and levers only, by monotone mappings anchored to real 2025–26 figures
   (sources in the code), moving part way from last year's figures each year (kept in each year's
   record as `result.econ`, passed back as `econ0`). The paper's box and footer say so.
4. Run `node test-news.js --report`: every template must fire in the 500 random campaigns
   (loosen `when` if it never does), and every phrasing must pass the length and no-`undefined`
   checks. Stories appear on the year-end front page (Continue on a year's result opens it), the
   ending's year list (the lead headline) and Copy for AI.

### A preset

1. `presets.js` `PRESETS` (levers via `P({...})`), and its text in `PRESET_INFO` or, for an
   AI 2040 plan, `PLAN_INFO` (targets). Buttons are built from these; "Safest mix" and
   "Under 2% risk" are placed by name in `buildLabUI`.
2. `test-k-baseline.json`: regenerate (the baseline test covers every preset).
3. `test-model.js` any promise the description makes; §6 calibration table for a calibrated plan.
4. Unknown scenarios go in `UNKNOWN_PRESETS` (`set` lists only the unknowns it changes).
