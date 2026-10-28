# Game of AGI

An AI safety simulator.

A 3D strategy game about the decisions that could shape the arrival of
superintelligence: racing China or coordinating, releasing open weights,
funding biodefense, betting on neural interfaces ("alignment via merging"),
and how much compute goes to safety.

**Play it:** https://thegameofagi.com

**Run it locally:** open `index.html` in a browser, or serve the folder
(`python3 -m http.server`) and visit http://localhost:8000.

**How it was built:** this game was built in conversation with Claude Code, and each
session is published as a browsable memtree. `trees.js` lists
them, newest last, and the page links the latest under "How it was built".

It extends the original [Game of AGI](https://gist.github.com/crizCraig/f4c583f0ca535ce5565f3aa66353cf99),
a Monte Carlo of AGI risk. That version's ideas carry over: safe-by-default odds,
oversight, whistleblowers, and takeoff speed vs. how fast rivals replicate AGI. This
version adds time, geopolitics, open weights, bio risk, and a 3D world, and
calibrates its timelines and plan outcomes to [AI 2040: Plan A](https://ai-2040.com/). The Futures Lab
has presets for all five plans in AI 2040's [plan comparison](https://ai-2040.com/supplements/comparing-possible-plans).
Locked-In Power (a catastrophe) and the public wealth fund follow
[National Security Response](https://nationalsecurityresponse.ai/): automation can leave most
people without economic leverage or a say even when humans keep control of AI.

## Two modes

- **Futures Lab**. Set ten policy levers and eleven uncertain
  assumptions (mean ± spread, as in the original), run 2,000 Monte Carlo futures,
  and see every trajectory as a 3D fan, colored by how it ends. Hover a line to
  read its values; click an outcome to read it and isolate its futures.
- **Campaign (2027–2040; opens on a one-line title screen; Play starts right away, with a tutorial on the first visit; the page remembers the mode you used last; "Show secret facts" reveals the hidden world and real risks while you play).** Each year you get a decision card. Hover a choice to
  see how it shifts next year's projected risk, then the dice roll against
  three catastrophes: an engineered pandemic, loss of control, and great-power war.
  The globe reacts in 3D:
  - lab towers grow with capability
  - the US–China arc turns from red to cyan as trust builds
  - open-weights copies swarm in orbit
  - the alignment shield thickens, or cracks red when capability outruns it
  - a neural-interface lattice spreads as BCIs are adopted

## Files

| File | What it is |
| --- | --- |
| `model.js` | The world model: state, levers, yearly dynamics (every update reads the start-of-year state, so their order does not matter), hazard equations, Monte Carlo, and its 159 named constants |
| `events.js` | The decision cards and how each choice moves levers and state |
| `landmask.js` | Land/sea bitmap for the globe, rasterized from Natural Earth 1:50m coastlines (public domain) |
| `trees.js` | Memtree links for the sessions that built the game |
| `scripts/build_artifact.py` | Builds a copy for a claude.ai Artifact |
| `index.html` | Three.js scene, HUD, campaign loop, Futures Lab |
| `test-model.js` | `node test-model.js` prints outcome distributions for policy presets |
| `scripts/sweep_constants.js` | Moves each named constant on its own and writes `docs/constant-sensitivity.md` (by topic) and `docs/constant-sensitivity-full.md` (every number); `--marginals` screens candidate cuts against every preset and every lever's effect (`docs/simplification-2.md`) |

## Caveat

This is a toy model meant to make trade-offs tangible, not a forecast. Every
parameter is an illustrative assumption you can read and change in `model.js`.
The council, labs and companies in the game are fictional composites.

## License

MIT. The coastline data in `landmask.js` is derived from Natural Earth (public domain).
