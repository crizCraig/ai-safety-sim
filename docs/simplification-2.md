# Simplifying the model, second pass

The [sensitivity sweep](constant-sensitivity.md) found that about 110 of the 162 constants move none of its seven headline numbers by even 1 point. That does not make them removable. The sweep's numbers come from presets that barely use some levers: the wealth fund sits at 0.05 in all of them, and oversight and transparency are low in most. So "under 1 point" there often means "that lever is off in the swept presets". The first pass (Codex review 047, in the review mailbox) rejected 9 of 16 proposed cuts for this reason.

This pass checked lever effects before cutting anything. **Result: 3 constants removed (162 → 159), each with a negligible effect on every check. A fourth, `laborPause`, passed the first version of the check but was kept (below). No exact algebraic merges were left to make.** Almost all the constants the sweep calls negligible change some lever's effect by more than a point.

## The check

`node scripts/sweep_constants.js --marginals` runs each candidate cut against:

- **Every lever's effect.** Each of the 10 levers is set to 0 and to 1, from Status quo and from Plan A, and the difference is recorded for catastrophe and for p(alignment). That gives 40 effects.
- **All 14 presets' catastrophe**, and Plans A–D p(alignment).
- **Interior safety settings under the AI Futures unknowns.** Status quo with the safety share at 35%, 45%, 60% and 80%, with the *AI Futures (Aug 2026)* unknowns (capability starts at 59), for catastrophe and p(alignment). Lever endpoints alone missed `laborPause` (see below), so this was added after Codex review 055.

Each cut is written as the constant overrides that reproduce it: a removed term is its constant set to 0, and a merge sets one constant to another's value. A cut that changes code is checked as an edited copy of the model with `--save` / `--against`. Every variant runs on the same seeded futures (common random numbers), and the report gives paired standard errors. p(alignment) leaves out pandemic and war futures, so it is a ratio and which futures count can change between runs; its standard error comes from each future's influence on the difference of ratios, so those changes count too. Differences are still sample estimates.

**Criterion.** A cut is a candidate only if:

- no preset's catastrophe moves more than 0.3 points; and
- no lever effect, and no Plan A–D p(alignment), moves more than about 1 point; and
- at the interior safety settings, catastrophe moves no more than 0.3 points and p(alignment) no more than 1.

The screen uses 20,000 futures. The cuts that were made were confirmed at 200,000. A numerical screen does not replace reading the mechanism: a term can be idle at every setting checked and still matter in a scenario that was not.

The screen covered 82 candidates:

- 75 single terms set to 0;
- removing capability breakthroughs, and separately alignment breakthroughs;
- removing the war closeness ramp;
- merging the fund's sell rate into its buy rate;
- instant open-weights catch-up;
- no neural-interface speed limit;
- linear biodefense.

Nine passed the lever and preset checks; with the interior check, eight pass (`laborPause` fails it). The full table is at the end.

## What changed

| Commit | Constants | Evidence: largest change (200,000 paired futures, against the unedited model) | Mechanism kept |
|---|---|---|---|
| Alignment | `alNoise` (the ±0.5 yearly wobble in alignment) removed | Preset catastrophe +0.02 (Open everything). Plan A–D p(alignment) −0.01. Lever effects: +0.03 on catastrophe, +0.02 on p(alignment). At the interior safety settings under the AI Futures unknowns: catastrophe −0.01, p(alignment) +0.06 (20,000 futures). | Alignment stays uncertain within a world through breakthroughs (12% a year). Die `d[9]` is still drawn. |
| Wealth fund | `fund0` removed (the stake starts at 0, not 3). `fundSell` (0.2) merged into the buy rate, renamed `fundRate` (0.4). | Cumulative: preset catastrophe +0.07 (Plan C). Plan A–D p(alignment) −0.01. Lever effects: +0.05 on catastrophe, +0.02 on p(alignment). The fund lever's own effect changes by −0.05 (it is −6.4 points from Status quo). At fund 0.02, 0.3, 0.5 and 1, under all three unknown scenarios, catastrophe moves at most 0.07. | Ownership, the lock-in relief and the cost of buying in late (`fundExpensive`) all stay. |

All three together, against the unedited model (20,000 paired futures): preset catastrophe +0.09 (Neuralink bet), Plan A–D p(alignment) −0.06, lever effects −0.08 on catastrophe and +0.11 on p(alignment), interior settings +0.14 on catastrophe (35% safety) and +0.06 on p(alignment).

### `laborPause` was kept

`laborPause` (0.5) adds AI research labor on safety past the 30% knee. It moved nothing in the lever and preset checks, and the first version of this pass removed it. Codex review 055 showed why that zero was blind: under the default unknowns, US capability starts below the point where AI speeds up research (about 50), and every preset and lever setting past the knee pauses capability below it, so the term never acts. Under the AI Futures unknowns capability starts at 59, above that onset, and the term is a working extra-labor channel. Removing it there, at Status quo levers with safety at 45% or 60%, raises catastrophe by about 0.5 points and lowers p(alignment) by about 1.3–1.4 (Codex: 200,000 paired futures, 60% safety: 55.23 → 53.90%, −1.33 ± 0.03). It stays, and the screen now includes those interior settings so a cut like this fails it.

Calibration, before → after (test-model.js; these presets use the default unknowns, where `laborPause` is idle, so the numbers are the same with it kept):

- Plans A–D p(alignment): 74.6 / 45.3 / 39.6 / 16.4 → 74.5 / 45.2 / 39.7 / 16.4.
- Status-quo lock-in share: 54.5 → 54.7%.
- The calibration table's lock-in share with ν = 0 is now 71% (70.5 → 70.9 at 40,000 futures, seed 101).

Safety promises hold:

- **Under 2% risk** at 40,000 futures for seeds 101–104: 1.782 / 1.735 / 1.820 / 1.670%. Before, these were 1.782 / 1.735 / 1.805 / 1.670%.
- **Safest mix**: 1.307 / 1.263 / 1.208 / 1.263% (before: 1.307 / 1.265 / 1.210 / 1.263%).

## Passed the check but kept

| Candidate | Largest change (20,000 futures) | Why kept |
|---|---|---|
| Breakthrough sizes at their means (`jumpUSRand`, `jumpCNRand`, `alJumpRand`; 3 constants) | Capability sizes: preset +0.10, lever effects +0.20 / −0.23 (diplomacy, from Plan A). At 200,000 futures, Plan B p(alignment) changes by +0.04 ± 0.04. The alignment size is within 0.1 everywhere. | Held back, not rejected. It changes which random draws each future uses. Plan B's p(alignment) is about 45.4% in large samples, only 0.4 above the bottom of its 45–55 band, so the 6,000-future calibration check falls to 44.6–44.7% on sampling noise alone (at 40,000 futures with seed 7, the unedited model gives 44.8%). Making this cut needs a decision on Plan B's calibration, not a quiet retune. |
| `delegBite`, `delegHaz` = 0 | Lever effects up to 0.72 (transparency, from Plan A) | Delegation was requested. Its effects are small by design, because they are neutral at the 2027 level. |
| `dealSlack` = 0 | Lever effects up to 0.56 | Deal weakening was requested. The ceiling rise is how an impaired deal is enforced. |
| `bioOpen` = 0 | Openness effect from Plan A +0.78 (catastrophe) | Codex deferred it as a mechanism choice in 047 (openness's small d/acc benefit). This check does not answer that objection. |
| `fundExpensive` = 0 | Fund effect −0.32 | It carries the campaign's "buy while it is still affordable" choice. |

## Considered and not done

- **Exact algebraic merges.** None are left. The first pass already folded the base terms into scales: lock-in pressure, the internal-AI hazard and alignment's base. Every remaining product has a lever or state variable between its constants, and every remaining level or width is bounded by a clamp. Two constants that happen to share a value, such as trust from oversight and from transparency (1.5 each), could be tied into one. That would change nothing today, but it would make two independent judgment calls move together without making any equation simpler, so it was not done.
- **Codex's 047 rejections are not repeated**: safety saturation, the sabotage merge, one breakthrough size for both blocs, removing the low-trust 2040 ending, freezing trust, the concentration interactions, and folding neural interfaces or hidden AI into one channel. The screen agrees with them, for example:
  - `warSabot` changes Plan A's sabotage effect by 7.6 points.
  - `concRaceOpen` changes All compute on safety by 6.4 points.
  - `alBci` changes BCI-first by 2.2 points.
  - `barInternal` changes the race effect on p(alignment) by 4.4 points.
- **Coordination noise (`coNoise`)** fails the check: Plan A catastrophe +0.70, safety effect −1.32. Coordination crosses the deal's hard threshold.
- **Trust drift (`trDrift`)** narrowly fails at 200,000 futures: All compute on safety +0.37 points, diplomacy's effect +1.03.

## Full screen (unedited model, 20,000 futures)

Each value is the change in percentage points, with the worst case shown. Columns:

- **Preset Δ**: catastrophe in any of the 14 presets.
- **Plan A–D Δ**: p(alignment) in any of Plans A–D.
- **Lever Δ cat**: a lever's effect on catastrophe (0 vs 1), from Status quo (SQ) or Plan A (A).
- **Lever Δ p(align)**: the same for p(alignment).
- **Interior Δ cat / p(align)**: the largest change at Status quo with safety at 35%, 45%, 60% or 80%, under the AI Futures unknowns (the safety share in brackets).

Sorted from smallest to largest relative to the lever and preset criteria (`laborPause` is placed by its interior result, its only nonzero one). A blank lever means no change at all.

| Candidate | Preset Δ | Plan A–D Δ | Lever Δ cat | Lever Δ p(align) | Interior Δ cat / p(align) |
|---|---|---|---|---|---|
| `fundSell=fundBuy` | +0.00 | +0.00 | −0.04 (SQ:fund) | +0.00 | +0.00 / +0.00 |
| `alNoise=0` | +0.04 | −0.06 | −0.07 (A:bci) | +0.11 (SQ:bci) | −0.01 (35%) / +0.06 (35%) |
| `fund0=0` | +0.07 | +0.00 | +0.05 (SQ:race) | +0.00 | +0.15 (35%) / +0.00 |
| `fundExpensive=0` | −0.01 | +0.00 | −0.29 (SQ:fund) | +0.00 | −0.03 (60%) / +0.00 |
| `delegHaz=0` | −0.14 | +0.12 | +0.50 (A:safety) | −0.20 (A:safety) | −0.04 (35%) / +0.12 (35%) |
| `dealSlack=0` | −0.10 | −0.07 | +0.11 (A:biodef) | +0.57 (A:safety) | +0.00 / +0.00 |
| `delegBite=0` | −0.15 | +0.24 | −0.25 (SQ:oversight) | −0.71 (A:transparency) | −0.21 (60%) / +0.45 (60%) |
| `bioOpen=0` | +0.14 | +0.00 | +0.77 (A:openness) | −0.02 (A:openness) | −0.01 (80%) / −0.01 (80%) |
| `trDrift=0` | +0.30 | +0.00 | +1.03 (SQ:diplomacy) | +0.00 | +0.24 (80%) / +0.00 |
| `trCap=0` | −0.33 | +0.00 | −0.24 (SQ:safety) | +0.00 | −0.39 (60%) / +0.00 |
| `bciCap=inf` | −0.28 | +0.00 | −0.26 (SQ:bci) | +1.14 (SQ:bci) | +0.00 / +0.00 |
| `delTransp=0` | +0.36 | −0.61 | +0.56 (SQ:transparency) | +0.85 (A:oversight) | +0.27 (80%) / −0.26 (80%) |
| `bciUplift=0` | +0.36 | −0.22 | +0.23 (A:bci) | −0.91 (SQ:bci) | +0.10 (80%) / −0.24 (80%) |
| `trTransp=0` | +0.41 | +0.00 | +1.03 (SQ:diplomacy) | +0.00 | +0.24 (80%) / +0.00 |
| `alJumpRand=0` | +0.43 | −0.72 | −0.65 (A:safety) | +1.26 (SQ:race) | +0.10 (35%) / −0.29 (45%) |
| `intSlope=0` | −0.16 | +0.90 | +1.50 (A:transparency) | −0.89 (A:transparency) | −0.28 (35%) / +1.02 (35%) |
| `intDecay=0` | +0.35 | −0.52 | −0.43 (A:transparency) | −1.54 (SQ:safety) | +0.28 (80%) / −0.80 (80%) |
| `openTransp=0` | −0.48 | +0.04 | +0.81 (A:biodef) | −0.11 (A:safety) | +0.02 (60%) / −0.01 (80%) |
| `laborPause=0` | +0.00 | +0.00 | +0.00 | +0.00 | +0.52 (45%) / −1.42 (60%) |
| `intBci=0` | +0.38 | −0.41 | −0.55 (A:transparency) | −1.73 (SQ:safety) | +0.22 (80%) / −0.64 (80%) |
| `bioDefExp=1` | +0.55 | −0.07 | +0.91 (A:openness) | +0.09 (A:safety) | +0.01 (45%) / −0.00 (80%) |
| `hidTransp=0` | +0.34 | −0.77 | +0.77 (SQ:transparency) | +1.88 (A:oversight) | +0.34 (60%) / −0.92 (60%) |
| `bci0=0` | +0.57 | −1.10 | +0.46 (A:race) | −1.45 (SQ:safety) | +0.38 (45%) / −1.04 (80%) |
| `jumpCNRand=0` | −0.14 | +0.25 | +2.15 (SQ:race) | −0.79 (A:diplomacy) | +0.18 (80%) / +0.47 (60%) |
| `trRaceConc=0` | −0.68 | +0.00 | −0.56 (SQ:safety) | +0.00 | −0.34 (80%) / +0.00 |
| `jumpUSRand=0` | −0.69 | +0.50 | +0.97 (A:safety) | +0.92 (SQ:transparency) | +0.37 (60%) / −0.69 (60%) |
| `coNoise=0` | +0.70 | −0.53 | −1.32 (A:safety) | +0.92 (A:safety) | −0.07 (60%) / +0.05 (35%) |
| `delCap=0` | −0.72 | +0.46 | −0.56 (SQ:safety) | +0.95 (SQ:safety) | −0.83 (60%) / +0.95 (60%) |
| `lockOpen=0` | +0.72 | +0.00 | +0.63 (SQ:openness) | +0.00 | +0.55 (60%) / +0.00 |
| `trOversight=0` | +0.73 | +0.00 | +0.52 (SQ:oversight) | +0.00 | +0.14 (80%) / +0.00 |
| `lockDip=0` | +0.76 | +0.00 | +0.79 (A:race) | +0.00 | +0.47 (80%) / +0.00 |
| `openRate=1` | −0.82 | +0.04 | +1.01 (A:biodef) | −0.15 (A:safety) | −0.09 (80%) / −0.02 (60%) |
| `leak=0` | +0.59 | −0.91 | −1.70 (A:safety) | +3.07 (A:safety) | −0.31 (60%) / +0.64 (60%) |
| `lockPlural=0` | +0.94 | +0.00 | −1.24 (A:diplomacy) | +0.00 | +3.29 (60%) / +0.00 |
| `delOversight=0` | +1.04 | −0.74 | +0.84 (SQ:oversight) | +1.19 (A:transparency) | +0.19 (80%) / −0.22 (80%) |
| `warAggr=0` | −0.72 | +0.32 | −3.58 (A:aggression) | +0.17 (A:aggression) | +0.00 / +0.00 |
| `dealImpairCut=0` | −1.07 | +0.17 | +0.80 (A:transparency) | −0.52 (A:transparency) | +0.00 / +0.00 |
| `barBci=0` | +1.16 | −1.15 | +0.67 (A:bci) | −3.33 (A:bci) | +0.49 (60%) / −1.62 (80%) |
| `alJumpP=0` | +1.17 | −1.41 | −1.89 (A:safety) | +3.22 (SQ:race) | +0.17 (35%) / −0.48 (35%) |
| `sabotSlow=0` | −0.69 | −4.08 | −2.92 (A:aggression) | +2.27 (A:aggression) | +0.00 / +0.00 |
| `concCap=0` | −1.23 | +0.00 | −0.94 (SQ:safety) | +0.00 | −0.92 (45%) / +0.00 |
| `delSafety=0` | +1.24 | −0.48 | +1.24 (SQ:safety) | −2.14 (SQ:safety) | +1.04 (60%) / −1.44 (80%) |
| `concAggr=0` | −1.26 | +0.00 | −2.56 (SQ:aggression) | +0.00 | +0.00 / +0.00 |
| `barInternal=0` | +1.30 | −2.81 | +1.37 (SQ:transparency) | +4.35 (SQ:race) | −1.06 (60%) / +2.91 (80%) |
| `warCloseFloor=1` | +1.32 | −0.64 | +2.41 (A:aggression) | −0.26 (A:aggression) | +0.77 (35%) / −0.17 (35%) |
| `usPushSafety=0` | −1.33 | −0.31 | +3.25 (A:safety) | −0.63 (SQ:safety) | +1.52 (60%) / −3.79 (60%) |
| `ovsTax=0` | +1.34 | −1.19 | −1.60 (A:safety) | −1.37 (A:diplomacy) | −0.35 (60%) / +0.58 (60%) |
| `hidOversight=0` | +1.52 | −1.28 | +1.35 (SQ:oversight) | −2.35 (SQ:oversight) | +0.28 (60%) / −0.76 (60%) |
| `hidInternal=0` | −1.47 | +3.69 | −1.41 (SQ:safety) | +5.10 (SQ:safety) | −2.02 (60%) / +5.56 (60%) |
| `barDeleg=0` | −1.55 | +2.61 | −1.46 (SQ:safety) | +4.84 (SQ:safety) | −1.72 (60%) / +4.99 (80%) |
| `hidSafety=0` | +1.41 | −2.20 | +1.41 (SQ:safety) | −5.18 (SQ:safety) | +2.08 (60%) / −5.78 (60%) |
| `delBase=0` | −1.55 | +0.95 | −1.23 (SQ:safety) | +2.09 (SQ:safety) | −1.10 (60%) / +1.27 (80%) |
| `shareTransp=0` | +1.41 | −0.26 | −2.57 (A:diplomacy) | −5.19 (SQ:safety) | +1.36 (80%) / −4.57 (80%) |
| `coDecay=0` | −1.40 | +0.43 | +5.59 (SQ:race) | −1.76 (SQ:race) | −0.34 (60%) / +0.65 (80%) |
| `alShCoord=0` | +1.71 | −2.28 | −1.79 (A:safety) | +3.66 (A:safety) | +0.36 (35%) / −1.01 (35%) |
| `alBci=0` | +2.15 | −1.03 | +1.56 (A:bci) | −2.32 (A:bci) | +0.15 (35%) / −0.42 (35%) |
| `warSabot=0` | −1.03 | +0.51 | −7.58 (A:aggression) | +0.42 (A:aggression) | +0.00 / +0.00 |
| `intOversight=0` | +2.40 | −1.27 | −3.44 (A:transparency) | +7.90 (A:transparency) | +0.27 (80%) / −0.77 (80%) |
| `lockDeleg=0` | −2.49 | +0.00 | −1.57 (SQ:safety) | +0.00 | −2.49 (45%) / +0.00 |
| `shareCoord=0` | +1.90 | −1.94 | −2.13 (SQ:race) | +8.52 (SQ:race) | +2.02 (80%) / −6.68 (80%) |
| `concBci=0` | −2.71 | +0.00 | −2.60 (SQ:bci) | +0.00 | −0.28 (80%) / +0.00 |
| `alShTransp=0` | +2.75 | −4.02 | +3.81 (A:race) | −6.33 (SQ:transparency) | +0.39 (35%) / −1.07 (35%) |
| `delRd=0` | −2.79 | +1.70 | −2.19 (SQ:safety) | +3.38 (SQ:safety) | −3.06 (60%) / +3.57 (80%) |
| `concOversight=0` | +2.85 | +0.00 | −2.65 (A:transparency) | +0.00 | +0.86 (60%) / +0.00 |
| `jumpP=0` | −2.86 | +1.29 | +4.64 (SQ:race) | +2.19 (A:race) | +0.21 (60%) / +0.60 (35%) |
| `trSafety=0` | +3.06 | +0.00 | +3.06 (SQ:safety) | +0.00 | +1.69 (60%) / +0.00 |
| `laborBase=0` | +3.12 | −3.73 | −3.04 (A:safety) | +6.56 (A:safety) | +0.52 (35%) / −1.61 (35%) |
| `concRaceTransp=0` | +3.17 | +0.00 | +2.55 (SQ:safety) | +0.00 | +1.46 (60%) / +0.00 |
| `intTransp=0` | +1.78 | −2.10 | −4.84 (A:oversight) | +11.85 (A:oversight) | +0.92 (60%) / −2.55 (80%) |
| `laborSafety=0` | +3.57 | −11.16 | +3.63 (A:race) | −5.62 (A:race) | +4.87 (35%) / −12.67 (35%) |
| `concTransp=0` | +3.59 | +0.00 | +2.82 (SQ:safety) | +0.00 | +1.69 (60%) / +0.00 |
| `concDecay=0` | +3.59 | +0.00 | +2.82 (SQ:safety) | +0.00 | +1.69 (60%) / +0.00 |
| `coOversight=0` | +3.88 | −0.95 | −4.07 (A:transparency) | +2.72 (A:transparency) | +0.15 (80%) / −0.29 (80%) |
| `coAggr=0` | −0.25 | +0.58 | −11.26 (A:aggression) | +13.90 (A:aggression) | +0.00 / +0.00 |
| `coRace=0` | −4.75 | +1.61 | −15.54 (A:race) | +10.42 (SQ:safety) | −1.93 (60%) / +6.02 (80%) |
| `concOpen=0` | +4.86 | +0.00 | +3.78 (SQ:safety) | +0.00 | +2.58 (60%) / +0.00 |
| `lockRaceSlope=0` | −6.36 | +0.00 | −4.14 (SQ:safety) | +0.00 | −5.93 (45%) / +0.00 |
| `concRaceOpen=0` | +6.43 | +0.00 | +4.93 (SQ:safety) | +0.00 | +3.82 (60%) / +0.00 |
| `coTransp=0` | +7.46 | −1.95 | −7.97 (SQ:race) | +4.06 (A:oversight) | +0.32 (80%) / −0.88 (80%) |
| `lockTrustSlope=0` | +8.89 | +0.00 | +6.52 (SQ:safety) | +0.00 | +8.62 (35%) / +0.00 |
| `cnRaceResp=0` | +12.10 | +0.91 | −33.68 (SQ:race) | +16.17 (SQ:race) | −0.28 (80%) / +0.67 (35%) |
| `cnRaceCoord=0` | +18.27 | −5.66 | −32.94 (SQ:race) | +14.15 (SQ:race) | +1.91 (60%) / −4.71 (60%) |

To rerun it, use `node scripts/sweep_constants.js --marginals --out screen.json`; `--n 200000 --only id,id` repeats borderline candidates. On the current model, 5 of the 79 remaining candidates pass: the five kept above.
