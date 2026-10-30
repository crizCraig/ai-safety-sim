**TL;DR.**  [Game of AGI](https://thegameofagi.com/?race=70&safety=5&openness=45&transparency=20&biodef=20&diplomacy=25&bci=10&oversight=10&aggression=0&fund=5) simulates the global effects of AI policy decisions. You choose your priors (how hard alignment is, how fast AI progresses, and many more), then roll out thousands of futures in a couple seconds. Its default worldview is **AI 2040**'s, under which today's path ends in catastrophe in about **79%** of futures, but everything is configurable. It's a tool for asking questions and refining your own internal model of how the next 13 years of AI progress will play out.

+++ Where it came from

I started the [original Game of AGI](https://gist.github.com/crizCraig/f4c583f0ca535ce5565f3aa66353cf99) in 2019. It was a small Monte Carlo that estimated x-risk, corruption risk, and value alignment from about a dozen uncertain inputs, each entered as a mean and a spread: the chance AGI is safe by default, safety and oversight spending against what they ideally should be, how many organizations originate AGI, the chance a whistleblower stops misuse, and takeoff time versus the time to replicate a model.

I presented it at the online [AI Safety Unconference](https://www.aisu.io) in April 2021, organized by Linda Linsefors and team, and asked attendees for their own inputs. Seven people answered (my own answers included), and their guesses were all over the place: the chance AGI is safe by default ranged from 0.1% to 80% (median 30%), and the median takeoff from AGI to the singularity was 120 days.

The session's feedback shaped today's version. People suggested modeling race dynamics, asking whether the first developer is a military, not just how many there are, separating permanent misuse of power from extinction, and letting people set uncertainty more intuitively than a raw standard deviation. The new version has a race-intensity lever and a US-China structure, models concentration of power (Locked-In Power) as its own catastrophic outcome, separates what you control (policy) from what you can only guess (hidden assumptions), and shows how the risk spreads across possible worlds.

It also rebuilds that idea around current work: AI 2040 for timelines and plan outcomes, recursive self-improvement scenarios, the US-China race, open-weights bio risk, and power concentration.

+++

What you can do with it
-----------------------

*   **Futures Lab.** (for experts) Set ten policy levers along with eleven hidden unknowns. The page runs 2,000 futures and shows how they end. Each future is a line in a 3D plot showing how capability and alignment change until a catastrophe, superintelligence, or 2040 is reached.
*   **Campaign.** (for the general public) Play it one year at a time: a decision card each year, and at the end you see how hard a world you were in.
*   **Read and copy the model.** "How the model works" has every formula with its sources. "Copy for AI" copies your settings, the formulas, the model code, and the results as one prompt, so you can ask Claude or another model to critique it. Settings are encoded in the URL, so you can share it easily.

How the model works, briefly
----------------------------

Each future steps year by year from 2027. Capability for the US bloc and China grows with compute, race intensity, and AI-accelerated R&D. Alignment grows with safety effort, AI labor pointed at safety, published research, and coordination. Each year three hazards are rolled: an engineered pandemic, AI escaping control before superintelligence, and great-power war. If a future reaches superintelligence, a handoff is rolled: whether alignment is enough to keep it on humanity's side, and if it is, whether power ends up locked in with a few.

Every future ends in one of eight ways. Four are counted as catastrophes:

*   **Loss of Control** (catastrophe): capabilities outran alignment. Systems that looked cooperative in testing pursue goals catastrophic for humanity, and by the time that's clear they can't be switched off. It can happen in any year before superintelligence, or at the handoff.
*   **Locked-In Power** (catastrophe): humans keep control of AI, but a few people hold it and nearly all of its gains. Whether they seized it or it drifted to them as AI took over the work, most people have lost their economic leverage and their say, and nothing checks the few.
*   **Great-Power War** (catastrophe): with both blocs close to a decisive advantage and no channel of trust, one side decides that waiting is riskier than striking.
*   **Engineered Pandemic** (catastrophe): a pandemic enabled by freely available model weights kills over 100 million people.
*   **Benevolent Takeover**: humanity loses control, but the AI that takes over turns out to care for people. Lives get better, yet the future is steered by AI, and nobody chose that. Not counted as a catastrophe, though you could argue either way.
*   **Aligned Transition**: superintelligence arrives with alignment and oversight that hold, and power stays spread out enough that humanity keeps steering.
*   **The Careful Path**: 2040 arrives with a verified international regime keeping frontier capability within what alignment can handle. Superintelligence hasn't arrived yet.
*   **Muddling Through**: 2040 arrives with no catastrophe and no resolution. The race continues and the hardest decisions are still ahead.

The hidden unknowns are drawn once per future, so the same policy produces a spread of outcomes. Players see estimates averaged over the worlds they might be in; the dice use the world they're actually in using the unknowns drawn. Measured alignment can sit above the real level because AIs can tell when they're being tested. Oversight, transparency, and safety work shrink that evaluation gap, but hidden internal deployments widen it. Gradual erosion of control is modeled by a visible state variable, **Delegation**: how much real decision-making society and the labs hand to AI with little human checking. It rises with capability, AI doing its own research, and racing, and falls with oversight, transparency, and safety work. As it rises, oversight turns into rubber-stamping, the handoff bar goes up, and both loss of control and Locked-In Power get more likely, since people lose their say in decisions as well as their economic leverage.

The eleven hidden unknowns. Each has an adjustable center and spread (a standard deviation):

*   **Current capability:** how capable the best AI is at the start of 2027, with China a little behind.
*   **AI progress speed:** how fast AI improves for a given amount of compute. The default follows AI 2040's pace.
*   **Ease of alignment:** how hard the problem really is. Policy can't change this. In easy worlds, fixing safety problems as they come up is enough and loss of control can't happen. In hard worlds, that isn't enough: alignment requires solving problems before they show up, for systems smarter than the ones we can test today.
*   **Tests overstate alignment:** how much better AIs behave when they know they're being tested. Increasing this causes measured alignment to rise against actual alignment.
*   **Kind even if uncontrolled:** if humans lose control, the chance AI still cares for humanity (a Benevolent Takeover instead of Loss of Control).
*   **Aligned AI fights corruption:** the chance an aligned superintelligence cares about humanity broadly, not just about whoever controls it, and so declines to help a few seize power. Unlike kindness, this is about an AI still under control: alignment can succeed technically yet serve only a powerful few if governance fails.
*   **The powerful share the gains:** the chance that the few who control AI share its gains broadly when nothing forces them to.
*   **Whistleblower odds:** the chance insiders expose or refuse to carry out a power grab by whoever controls AI.
*   **China's own alignment work:** the alignment research China's labs do themselves, relative to the US bloc's. Work on keeping AI loyal to the Party and not humanity in general doesn't count.
*   **China slows near the brink:** how far China cuts its race once there are signs of losing control. It notices later than the US would, and slows more if the US also slows or a China-US deal is enforced.
*   **Open-weights bio risk per decade:** the chance open-weights models enable a pandemic that kills 100 million or more within ten years.

The pandemic hazard counts only pandemics enabled by open-weights AI. Natural outbreaks and state programs (cf. MAIM in Hendrycks et al.'s [Superintelligence Strategy](https://www.nationalsecurity.ai/)) are not included; the model is about what AI adds. Open-weights bio risk comes from a separate factored estimate (decade median about 1 in 8,000, with a long tail). This turns out to be lower than most bio-risk estimates I hear, and it's hard to get AI models to discuss it, so I welcome any feedback (public or private) on this.

Every equation and constant, with its source, is on the site's [How the model works](https://thegameofagi.com/#model) page.

Results under the default worldview
-----------------------------------

The figures below are from 6,000 simulated futures based on the default assumptions.

*   **Today's trajectory looks bad.** The status quo (intense race, an illustrative 5% of compute on safety, partly open weights, little diplomacy) ends in catastrophe in about **79%** of futures by **Dec 2030** on average, mostly loss of control (63%).
*   **But it's lopsided across worlds.** That 79% is an average. In about half of the possible worlds catastrophe is near-certain (hard alignment, and an AI that escapes control is not kind). In worlds where alignment turns out easy, the risk is still high, almost all of it Locked-In Power. In a few it's near 0%. The spread across worlds runs from a few percent to 100%. Much of the default uncertainty lies in how hard alignment is and whether an AI that escapes control is kind to humans, but there are many other unknowns that together can have meaningful effects.
*   **A verified slowdown does most of the work.** AI 2040's Plan A brings catastrophe to about 20%.
*   **More safety compute helps, up to a point.** From the status quo, raising the safety share from 5% to 35% cuts catastrophe from 79% to 65%. Going to 100%, a unilateral US pause, gives 71%: China takes the lead and reaches superintelligence with less alignment work. This depends on how willing China is to slow down near the brink, which you can set.
*   **Low-risk paths exist, but they need everything at once.** The lowest-risk mix I found (no race, 35% safety compute, full transparency, oversight, biodefense, and diplomacy) ends in catastrophe in about 1.3% of futures, about half of it from war, with superintelligence still yet to emerge in 2040.
*   **Faster takeoff hurts careful plans most.** Under a recursive-self-improvement-in-2027 [prior](https://time.com/article/2026/10/14/recursive-self-improvement-AI-report/) (from Gladstone AI's interviews with frontier-lab researchers), takeoff is expedited and Plan A's catastrophe share roughly doubles, from about 20% to 35%.
*   **Keeping control isn't the same as a good outcome.** In status-quo futures where humans keep control of AI, about 55% end with power locked in with a few, as AI replaces the work that gave most people leverage. The model counts that as a catastrophe. How likely the powerful are to share the gains when nothing forces them is a hidden assumption you can set (default 30%), with voluntary efforts like Anthropic's [Public Benefit Fund](https://www.anthropic.com/news/public-benefit-fund) (5% of its shares, in a wholly owned subsidiary; the founders' pledges that bring Anthropic's total near 20% are, per [Anthropic's S-1](https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/anthropicpbc-sx1.htm), "voluntary, revocable" and "do not constitute legally binding obligations") on one side and the lost-leverage arguments of *The Intelligence Curse* and *Gradual Disempowerment* on the other. A public AI wealth fund cuts lock-in to about 23%; adding strong oversight and full transparency cuts it to about 6%. This part draws on my essay [National Security Response](https://nationalsecurityresponse.ai/).

How much the conclusions hinge on the assumptions
-------------------------------------------------

I had the timeline grounded in measurements rather than forecasts: chip and HBM supply, packaging capacity, data-centre power and spending, measured algorithmic progress, and METR's task horizons. But the headline catastrophe percentage rests much more on three unmeasured assumptions:

1.  **How fast loss-of-control risk rises.** The model uses AI 2040's capability milestones on a 0–100 scale: 70 is an Automated Coder, 78 is top human expert level, 90 is AI that beats the best humans at essentially every cognitive task, and 100 is superintelligence, far beyond the best humans at everything. Each year's loss-of-control risk depends on how much of AI research AI itself is doing: it starts rising as AI takes over most of its own research (around the Automated Coder, 70), is close to full strength by top-expert level (78), and climbs to as much as about 25% a year, faster the further capability outruns real alignment. On today's path, capability crosses that zone in a year or two, and once control is lost outright, there's no getting it back. At superintelligence (100), a final handoff decides whether alignment is enough to keep it on humanity's side.
2.  **How strong the pull toward Locked-In Power is.** Even when humans keep control of AI, the few who hold it may keep nearly all its gains. On today's path, about 55% of futures where humans keep control end in Locked-In Power. The other 45% are futures where institutions hold; if you think that's more likely, raise "The powerful share the gains". Gains and control can come apart: the same S-1 gives the founders' LLC "50.1% of the total voting power" (a "controlled company") and lets the Long-Term Benefit Trust elect a majority of the board. Racing, secrecy, and erosion of control raise the risk. A public wealth fund, oversight, transparency, and open weights lower it, and so do higher settings for the "share the gains", whistleblower, and "fights corruption" unknowns. Maxing the wealth fund, oversight, and transparency together cuts it to about 6%. Political economy supports the direction of these effects (the resource curse, *The Intelligence Curse*), but their sizes are judgment calls by me and Opus 5.5: for example, an all-out race makes lock-in 1.5× as likely as a pause, and full oversight cuts it by 45% ([all of them](https://thegameofagi.com/#model)).
3.  **Whether an uncontrolled AI would be kind.** There's a chance the AI still cares for people, even when control is lost: a Benevolent Takeover instead of a catastrophe. The default is 16% ± 18 points, on a distribution that stays between 0% and 100%, so about 16% of loss-of-control futures turn out kind. The view behind it is that values that emerge without successful alignment are unlikely to land on caring about humans, a narrow target, but there's no evidence either way. It's the biggest single lever: set it to 50% and today's risk drops by about 25 points (from about 79% to 54%).

Where I'd most like pushback
----------------------------

*   **The three big assumptions above,** especially the kindness default.
*   **Counting Locked-In Power as a catastrophe,** and how likely it is once AI can do most jobs. The model doesn't assume it's certain: even after full automation, institutions hold in about 45% of futures where humans keep control on today's path. Opus 5.5's main pushback was that Locked-In Power lumps together a deliberate seizure, which is plausibly permanent, with gradual disempowerment, where elections, courts, and rival powers still exist and the outcome might still be contested and recoverable. I treat both as permanent catastrophes, because once people have lost their economic leverage, I doubt the remaining institutions can force a reversal, and absolute power corrupts absolutely. I'd like to hear the case against.
*   **Whether we want AI that answers to everyone, not just its owners.** The model now includes the hope that an aligned superintelligence is aligned to humanity broadly, not just to whoever controls it, and so always counters a few seizing power. In the long run that may be the only real check, once AI does all the work that once needed willing people. The danger is the transition: an AI trusted to act for humanity but slightly wrong about what that means is a loss of control. Until alignment is real, institutions that spread control beyond the AI companies are what keep either failure from being final. Set "Aligned AI fights corruption" to zero to see what this hope is worth in the model, and tell me how much of it you'd bet on.
*   **The single handoff at superintelligence.** We treat superintelligence without alignment as a complete takeover with no way to recover control.
*   **The China model.** China's own alignment effort and willingness to slow are hidden unknowns informed by published work (Concordia AI's State of AI Safety in China reports, SemiAnalysis's counts) and official statements, not measured effort. These settings lean slightly towards China racing. People who know this better could improve them a lot, for example if they think Xi will be more cautious about ceding control to AI.
*   **How much the evaluation gap matters.** Today's models can often tell when they're being tested ([Anthropic's S-1](https://www.sec.gov/Archives/edgar/data/2130357/000162828026067168/anthropicpbc-sx1.htm) (Oct 2026) lists this as a risk factor and warns its evaluations could "overstate the safety or alignment" of its models), so our simulation assumes measured alignment sits about 15% above the real level by default. Oversight, transparency, and safety work expose part of that gap; secret internal deployment and erosion of control widen it. If you think the gap is larger, grows with capability, or can't be closed by oversight, I'd like to hear it.
*   **Missing levers or outcomes.** What would you add?

The fastest way to critique assumptions is to set it up in the Futures Lab, press "Copy for AI", and paste it into a model along with your objection. The code is on [GitHub](https://github.com/crizCraig/ai-safety-sim); issues and pull requests are welcome.

How it was developed
--------------------

**Tools:** I wrote it with Opus 5.5, claude-code-infinite (my own memory tool), and Astra. Here's a [public transcript](https://app.polychat.co/m/cbC4ehMmiClR), with summaries.

**Reviews.** The model went through about twenty rounds of review, almost all by OpenAI's Codex Astra. Model changes went live only after a round came back with no major bugs.

**Model changes that mattered most:**

*   **Bio risk was recalibrated down.** My first equation put open-weights pandemic risk about 1,000 times higher than a separate factored estimate, and a review later found the calibration was being measured over years that real futures never reach.
*   **Benevolent Takeover was split off from Loss of Control,** with its own assumption for how likely an uncontrolled AI is to stay kind.
*   **Deals can weaken, not just collapse,** following AI 2040's estimate that about half of deals decline within ten years, half of that by outright dissolution.
*   **Timeline scenarios** were updated for [RSI in 2027](https://aiendgame.com/p/what-rsi-looks-like) and the [AI Futures Project's August 2026](https://blog.aifutures.org/p/q25-2026-timelines-update-uplift).
*   **Loss-of-control risk now starts when AI takes over its own research,** not at top-expert level, which shifted more loss of control into the years before superintelligence, especially under deals that pause capability near expert level.
*   **Gradual erosion of control became its own variable.** A new variable, *Delegation*, measures erosion of control: how many decisions are handed to AI with little human checking. As it rises, oversight turns into rubber-stamping.
*   **Aligned can now mean more than obedient.** A new unknown separates value alignment (the AI declines to help a few seize power) from intent alignment (it does what its controllers want), and lowers Locked-In Power accordingly.
*   **Erosion of control now drives lock-in too.** Delegation replaced a time-based automation ramp in the Locked-In Power odds, so the same drift raises both loss of control and lock-in.
*   **Each year's update reads the start-of-year state,** so the order of the updates no longer matters. Open models now chase last year's frontier, which raised pandemic risk on paths that last longer than the default.
*   **AI progress speed became data-driven.** Its spread became lopsided (lognormal) and centered on AI 2040's pace, set from measured compute and algorithmic trends, with a slow tail for physical limits like chip memory, packaging, and US power.
*   **Every constant was stress-tested.** A sensitivity sweep cut seven constants, leaving 162, and no single one moves today's 79% by more than 6 points ([report](https://github.com/crizCraig/ai-safety-sim/blob/main/docs/constant-sensitivity.md)).

**Simplifying assumptions.** These are deliberate, and each is a place the model could be wrong:

*   Two blocs: the US and its allies, and China. No other countries.
*   **Capability** is one number and **alignment** (including control) is a separate scalar value. The difference between these two determines whether loss of control occurs.
*   Policies are held fixed from 2027 to 2040 in the Futures Lab. Only the campaign changes them year by year.
*   The hidden assumptions are independent of each other and fixed for each world. Each future draws its own values from the spreads you set; the centers and spreads stay the same across all 2,000 futures.
*   One-year time steps, and nothing after 2040.

Feedback
--------

I'd love feedback with two audiences in mind:

1.  For readers here and other experts: is the Futures Lab useful for testing and communicating your own assumptions, and what would make it more so?
2.  For the general public: does the Campaign work well as an engaging way to inform people about AI risk? My daughters, nieces, and nephews seem to enjoy it. If you try it on a friend or family member, I'd especially like to hear how it went.

[**Play Game of AGI →**](https://thegameofagi.com)