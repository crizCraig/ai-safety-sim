# Game of AGI

An AI safety simulator.

A 3D strategy game about the decisions that could shape the arrival of
superintelligence: racing China or coordinating, releasing open weights,
funding biodefense, betting on neural interfaces ("alignment via merging"),
and how much compute goes to safety.

**Run it:** open `index.html` in a browser, or serve the folder
(`python3 -m http.server`) and visit http://localhost:8000.

It extends the original [Game of AGI](https://gist.github.com/crizCraig/f4c583f0ca535ce5565f3aa66353cf99),
a Monte Carlo of AGI risk. That version's ideas carry over: safe-by-default odds,
oversight, whistleblowers, and takeoff speed vs. how fast rivals replicate AGI. This
version adds time, geopolitics, open weights, bio risk, and a 3D world, and
calibrates its timelines and plan outcomes to [AI 2040: Plan A](https://ai-2040.com/).

## Two modes

- **Campaign (2027–2040).** Each year you get a decision card. Hover a choice to
  see how it shifts next year's projected risk, then the dice roll against
  three catastrophes: an engineered pandemic, loss of control, and great-power war.
  The globe reacts in 3D:
  - lab towers grow with capability
  - the US–China arc turns from red to cyan as trust builds
  - open-weights copies swarm in orbit
  - the alignment shield thickens, or cracks red when capability outruns it
  - a neural-interface lattice spreads as BCIs are adopted
- **Futures Lab.** Set eight policy levers and four uncertain assumptions
  (mean ± spread, as in the original), run 2,000 Monte Carlo futures, and see
  every trajectory as a 3D fan, colored by how it ends.

## Files

| File | What it is |
| --- | --- |
| `model.js` | The world model: state, levers, yearly dynamics, hazard equations, Monte Carlo |
| `events.js` | The decision cards and how each choice moves levers and state |
| `landmask.js` | Land/sea bitmap for the globe, rasterized from Natural Earth 1:50m coastlines (public domain) |
| `index.html` | Three.js scene, HUD, campaign loop, Futures Lab |
| `test-model.js` | `node test-model.js` prints outcome distributions for policy presets |

## Caveat

This is a toy model meant to make trade-offs tangible, not a forecast. Every
parameter is an illustrative assumption you can read and change in `model.js`.
The council, labs and companies in the game are fictional composites.
