# Refactor plan: fewer places to touch

`docs/model-structure.md` (branch `structure`) found that the model's graph is simple but its
copies are not: a new hidden unknown touches about a dozen places, each hazard is written twice
(truth and belief), and the model page's equations hold 236 hand-typed numbers. `AGENTS.md`
("Adding things to the model") lists every place today: 56 numbered steps across seven kinds of
addition, 17 of them for a hidden unknown. This plan removes the copies, one behaviour-preserving
step at a time.

## Ground rules

- **Behaviour-preserving.** Each step must leave seeded results identical: `summarize` for all 14
  presets (the default unknowns and every unknown scenario), `monteCarlo` paths with their worlds,
  and seeded campaign streams (cards drawn, choices, every shown and true risk, handoff and lock-in
  odds, and the state after each year). A fingerprint script records all of these (about 3
  million numbers) and the step's commit is compared with its parent: exact equality, except where
  a step says otherwise. `node test-model.js` passes at every commit, and `test-k-baseline.json`
  never changes.
- **Rebase-friendly.** Another branch (`struct1`) is moving `step()` to start-of-year updates and
  cutting seven constants. Steps here avoid `step()`'s update block, so the rebase conflicts stay
  in a few lines.
- **One commit per step**, with the `AGENTS.md` checklist updated in the same commit.

## Order

| # | Step | Risk | Rebase conflict with struct1 |
|---|---|---|---|
| R1 | One registry for hidden unknowns: the world builders | Low | None (no `step()` lines) |
| R2 | The registry drives the secret facts and the roll screen | Low | None |
| R3 | State variables and levers carry their own UI names | Low | None |
| R4 | The model page's equations take their numbers from `K` | Low (doc only) | The equations of any constant it cuts |
| R5 | Each hazard written once; belief is a generic expectation | Medium (float order) | `risks()` / `transitionOdds` only |
| R6 | Small copies: `summarizeCRN`, `hiddenShare` defaults, README count | Low | None |

R1–R4 do not touch model arithmetic. R5 changes the order of floating-point sums in the beliefs,
so it is last and has its own tolerance. R6 bundles items that are behaviour-changing on purpose
and must go in their own commits.

---

## R1. One registry for hidden unknowns (report #2), part 1: the world

**Goal.** A new unknown becomes one entry. `sampleWorld`, `meanWorld` and `sampleBaseWorld` stop
naming unknowns.

**Design.** Each `ASSUMPTION_INFO` entry gains three functions next to its slider metadata:

- `sample(A, rng, draw)`: the value for one future, consuming the RNG exactly as today (`draw` is
  the clipped Gaussian draw; ease draws a lognormal difficulty, the kind-AI unknown draws a
  probability and then a coin, capNow draws only when its spread is above 0, bio is unclamped).
- `mean(A)`: the value in the mean world (`clippedMean` by default).
- `world(A, v)`: the fields the world object carries for that value, belief nodes included (today's
  `shareWorld`, `valueWorld`, `evalWorld`, `difficultyWorld`, half of `chinaWorld`, `bioWorld`).

A frozen `DRAW_ORDER` array lists the keys in RNG order (ease, speed, whistle, benevolent,
bioDecade, cnAlign, cnCaution, evalGap, capNow, share, valueAlign). It differs from the slider
order, which the UI shows, so it stays a separate list; it is append-only. `sampleWorld` loops
over `DRAW_ORDER` calling `sample`, then builds the world from `world`, with bio's fields last
(`skipBio` still drops them). `meanWorld` loops over the same entries with `mean`.

**Files.** `model.js` (registry, `sampleWorld`, `meanWorld`); `test-model.js` (a test that
`DRAW_ORDER` starts with the 11 keys above, covers every key exactly once, and that the last key's
draw is the last RNG draw, replacing the per-unknown draw-order checks).

**Proof.** Fingerprint identical to the parent (the worlds in the Monte Carlo paths and campaign
streams are compared field by field, so a changed draw order fails immediately). The test suite's
"last draw" checks still pass unchanged.

**Risks.** Draw order (caught by the fingerprint). The world's field order changes, which nothing
reads. `capNow`'s "only draw when it has a spread" rule must survive.

**Checklist after.** Hidden unknown: the `xxxWorld` helper, `sampleWorld` and `meanWorld` (steps
2–4) become fields of the one entry plus a key appended to `DRAW_ORDER`. 17 → 15.

## R2. The registry drives the secret facts and the roll screen (report #2), part 2

**Goal.** `secretList` and `UNKNOWNS` in index.html stop listing unknowns.

**Design.** Each entry gains `secret: { order, label, html(w, ctx) }` and
`roll: { label, sample(r) }`. `ctx` carries what the page supplies (`pct`, the hidden test gap,
whether the game is over). China's two unknowns share one secret row today, so `cnCaution` has no
`secret` and `cnAlign`'s row shows both; `capNow` has neither (it is not secret). `secretList`
sorts entries by `secret.order` and appends nothing by hand; the roll screen lists `roll` entries
in the same order. The HTML strings live in model.js next to the existing `help` text.

**Files.** `model.js` (registry), `index.html` (`secretList`, `UNKNOWNS`), `test-model.js`
(every unknown except capNow has a secret and a roll row; `secretList` order is fixed).

**Proof.** Model fingerprint identical. In addition, the generated `secretList` HTML for 200
seeded worlds and the roll labels are compared with the hand-written version from the parent
commit, string for string (a script loads the old functions from the parent's index.html). A
browser check toggles "Show secret facts" in the campaign and runs the roll screen.

**Risks.** HTML in model.js (accepted: model.js already holds the help text). `game.phase`
moves into `ctx`.

**Checklist after.** Hidden unknown steps 10–11 fold into the entry. 15 → 13.

## R3. State variables and levers carry their own UI names (new)

**Goal.** A new state variable or lever needs one entry, not four lists.

**Design.** `STAT_INFO` entries gain `short` (chip name), `name` (year-change name) and `good`
(`'up'`, `'down'` or absent, for chip and change colours); `LEVER_INFO` entries gain `short` and
`good`. index.html builds `SHORT`, `GOOD_UP`, `BAD_UP` and the `NAME`/`BAD` pair in `yearChanges`
from them. Two quirks stay explicit: `bci` reads "implant users" as a state and capability US/BCI
are neutral in the year-change list; `cnMult` is not a state variable shown in the panel, so it
keeps a one-line entry in index.html.

**Files.** `model.js`, `index.html`, `test-model.js` (every key has the fields).

**Proof.** Model fingerprint identical; the derived `SHORT`, `GOOD_UP`, `BAD_UP`, `BAD`, `NAME`
compared with the parent's literals (same keys, same values, same set membership); browser check
of the chips on a card and the year-change summary.

**Checklist after.** State variable steps 6–7 fold into `STAT_INFO` (12 → 10); lever step 3 folds
into `LEVER_INFO` (8 → 7).

## R4. The model page's equations take their numbers from `K` (report #4)

**Goal.** No number on the "How the model works" page can drift from the code.

**Design.** In the LaTeX of the 24 `.math` blocks (and inline `.mi` spans that quote a
constant), each number that is a model constant becomes a placeholder `⟦name⟧`, or `⟦name:d⟧` to
print `d` decimals (`4.0` is `⟦lockK:1⟧`), or a small expression `⟦1-lockConcFloor⟧` where the page
shows a derived number. `fillModelNumbers()` (which already fills `{{GREF}}`) replaces every
placeholder from `M.K` before Temml renders and before Copy for LLMs reads the page. The
expression filler accepts only constant names, numbers and `+ - * / ( )`, and fails loudly on an
unknown name. Numbers that are not constants (100, 2027, 2040, milestones 70/90/100, clamp
bounds and quadrature) stay literal.

**Files.** `index.html` (equations, `fillModelNumbers`), `test-model.js`: (a) every placeholder
names a constant; (b) after filling with the defaults, the page's equations equal a stored
snapshot; (c) the numbers left literal in the equations are all in a small allow-list, so a new
hand-typed constant fails the test; (d) changing a constant through `setConstants` changes the
filled page.

**Proof.** A script fills the new page with `K_DEFAULTS` and compares every `.math` and `.mi`
text with the parent's: identical strings. Browser check of `#model` at both sizes with Temml
loaded, and Copy for LLMs output identical to the parent's.

**Risks.** Picking the wrong constant where two share a value (several are 0.5); each placeholder
is reviewed against the formula in model.js, and (d) is spot-checked by changing distinctive
constants. Rebase: struct1's constant cuts need the same placeholders removed.

**Checklist after.** The rule "every number on the page is typed by hand" goes; a constant's
step 3 becomes "write `⟦name⟧` in the equation", enforced by test (c). The notation table's 2027
values can follow (`⟦align0⟧`), which removes the state variable's "2027 value" from step 8.

## R5. Each hazard written once (report #3)

**Goal.** No hand-written belief formula. Belief is the expectation of the truth function over
the unknowns' belief nodes, so "belief equals the average of the truth" holds by construction.

**Design.**

- Each truth function takes the hidden values it reads as one object `h` (defaulting to the
  world's draws): `lossAt(s, L, h)`, `handoffAt(s, L, h)`, `lockinOdds(s, L, h)`. These are the
  only formulas.
- A generic `expect(s, keys, f)` sums `w1·…·wn·f(h)` over the product of the named unknowns'
  belief nodes (`h` filled from one node per key; other keys at their draws). The registry from
  R1 says where each unknown's nodes live.
- Today's shortcuts become declared, tested optimisations rather than separate formulas:
  (1) `lockinBelief`'s factorisation when the 0.95 cap cannot bind (exact up to rounding);
  (2) `cnBelief`'s "use the mean when China's own work moves alignment by under 0.05 points"
  (an approximation, kept with its bound); (3) the Monte Carlo path's (`s.fast`) beliefs at the
  means. Each is a `prune` rule on the expectation, with a test that it is within its bound of
  the full sum.
- Copies 1–4 in the report disappear: `cnBelief`'s copy of the share formula (one
  `chinaShare(s, L)`), `lockinBelief`'s repeat of the cap, `dn <= K.diffSafe` versus
  `world.safe` (one `alignedByDefault(d)`), and `chinaRace`/`chinaSlowdown`'s US pressure (one
  `usPush(L)`).

**Files.** `model.js` (`risks`, `transitionOdds`, `lockinOdds`/`lockinBelief`, `effAlign`,
`cnBelief`/`alignBelief`), `test-model.js` (the "belief = average of truth" checks become a
generic check over every hazard).

**Proof.** Dice, paths, summaries and campaign states identical (the truth functions keep their
arithmetic). Shown beliefs (risks shown, handoff and lock-in belief, expected survival) equal the
parent's to a relative 1e-12, since only the summation order changes. If a shortcut is dropped
instead of kept, the fingerprint reports the largest belief change and the commit message states
it.

**Risks.** Speed: the handoff belief already sums 33 × 42 × 161 nodes; the generic version must
not add allocation per node (precompute the node product once per call). Rebase: struct1 edits
`step()` around the handoff; R5 touches `risks()` and the belief helpers, so conflicts are small.

**Checklist after.** Hidden unknown steps 5–6 become one: "the truth function reads `h.x`";
the belief tests in step 15 are generic. 13 → 11.

## R6. Small copies (from the report's §6 and §7)

Each is its own commit, after R1–R5:

- **`summarizeCRN` copies `summarize`'s p(alignment) rule** (scripts/sweep_constants.js). Export
  `alignmentScore(ev, s, L)` from model.js and use it in both. Behaviour-preserving.
- **The world's expected-value bookkeeping mirrors the dice** (`step()`, copy 5). Express the
  handoff and 2040 endings as `[outcome, probability]` lists used by both the dice and the
  survival bookkeeping. Wait for struct1, which rewrites this block.
- **`hiddenShare` without levers hard-codes 0.1, 0.2 and 0.14** (copy 7). Reading
  `defaultLevers()` gives `min(1, safetyEffect(0.05)) = 0.138`, not 0.14, so this changes shown
  numbers slightly: a separate, labelled commit.
- **README's count of unknowns** is checked by a test; keep it (it is one line) or reword the
  README to "a dozen" and drop the test.
- **Five quadrature schemes** (copy 8): after R5, the nodes for every clipped-normal unknown come
  from `clippedNodes`; the China nodes (33-point) and difficulty nodes (161-point) can follow,
  but that changes shown beliefs and needs its own commit.

## Status

Updated as steps land.

| Step | Status |
|---|---|
| R1 | done: hidden-unknown checklist 17 → 15 |
| R2 | planned |
| R3 | planned |
| R4 | planned |
| R5 | planned |
| R6 | planned |
