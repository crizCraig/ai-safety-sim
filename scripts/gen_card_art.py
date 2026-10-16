"""Generate pencil-sketch card and ending illustrations with OpenAI's image model.

Reads OPENAI_API_KEY from .env (gitignored) inside this process only; the key is
never printed. Errors report just the exception type and status code, since API
error messages can echo part of a key. Raw PNGs go to OUT (default
/tmp/claude-501/gptart2). If a prompt is refused, it retries once with the people
described by role instead of by name.
Usage: python3 scripts/gen_card_art.py [card_or_ending_id ... | endings]
With CARD_ART_REDRAW_FROM=<dir> (holding cards/<id>.png and endings/<key>.png), each image is
redrawn from that earlier version in the current style, keeping its composition.
Several reference photos per call need openai>=1.99.
"""
import base64
import concurrent.futures as cf
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent
# A git worktree (<repo>/.claude/worktrees/<name>) has no .env of its own, so use
# the nearest one in this directory or above it.
for d in (ROOT, *ROOT.parents):
    if (d / ".env").is_file():
        load_dotenv(d / ".env")
        break
OUT = Path(os.environ.get("CARD_ART_OUT", "/tmp/claude-501/gptart2"))
OUT.mkdir(parents=True, exist_ok=True)
MODEL = os.environ.get("CARD_ART_MODEL", "gpt-image-2.5-flare")
SIZE = os.environ.get("CARD_ART_SIZE", "1536x1024")
# gpt-image-2.5-flare rejects input_fidelity (invalid_input_fidelity_model); set it for models that take it.
FIDELITY = os.environ.get("CARD_ART_FIDELITY", "")

PENCIL = ("a hand-drawn graphite pencil illustration on off-white paper: visible hand-drawn linework and"
          " cross-hatching, light shading, lots of bare paper showing, mostly monochrome with at most a faint"
          " wash of muted color, not photographic")
STYLE = (
    f"I want {PENCIL}, for an AGI pdoom simulator I'm creating. It should quietly support the text"
    " on the card rather than dominate it.\n\n"
    "No text in the image: no lettering, words, numbers or logo text."
)
# Redraw an existing image (input image 1) in the pencil style, keeping its composition.
REDRAW = (
    f"Redraw image 1 as {PENCIL}. Keep the same composition, framing, people, poses, expressions and"
    " likenesses, and the same hopeful mood. No text in the image: drop any lettering, words, numbers"
    " or logo text (simple logo shapes without letters may stay)."
)
HOPE = (" Lean hopeful: even in a tense moment, show capable people meeting the challenge, with soft light"
        " and a sense that things can still go well. Honest about the stakes, but not doom: no panic,"
        " chaos, destruction or warning signs.")
LAYOUT = (" Keep the key figures and subjects in the middle horizontal band of a wide landscape frame."
          " Keep it a light pencil drawing with plenty of paper showing, not a photograph or a painting.")
ROBOTS = (" If any robot appears, it must be a modern, present-day robot, like a Tesla Optimus or Figure humanoid"
          " or an industrial robot arm, not a retro or science-fiction robot, with no lettering on it.")

# Reference photos passed to the images edit endpoint so likenesses come out right.
# Downloaded locally, never committed.
# Dario Amodei (recent photos: he is much thinner than in the 2023 ones, which are no longer used):
#   d25_face.jpg (face) and d25_bust.jpg (head and shoulders), crops of
#     https://commons.wikimedia.org/wiki/File:Sanae_Takaichi_and_Dario_Amodei_in_2025_(1).jpg
#   d25b_face.jpg (three-quarter profile), crop of
#     https://commons.wikimedia.org/wiki/File:Sanae_Takaichi_and_Dario_Amodei_in_2025_(2).jpg
#   Both taken 2025-10-29 by Japan's Cabinet Secretariat (kantei.go.jp), CC BY 4.0.
# JD Vance: vance.jpg:
#   https://commons.wikimedia.org/wiki/File:March_2026_Official_Vice_Presidential_Portrait_of_JD_Vance_(head-and-shoulders_cropped).jpg
#   (official US government portrait, public domain)
# The US president is Trump only on cards that can appear only in 2027-2028 (posture);
# later cards show JD Vance.
REFS_DIR = Path(os.environ.get("CARD_ART_REFS", "/tmp/claude-501/refs"))
REFS = {
    "Dario Amodei": ([REFS_DIR / "d25_face.jpg", REFS_DIR / "d25_bust.jpg", REFS_DIR / "d25b_face.jpg"],
                     "slim build and a lean, narrow face with defined cheekbones, short curly dark brown hair,"
                     " thin dark-rimmed glasses, clean-shaven"),
    "JD Vance": ([REFS_DIR / "vance.jpg"],
                 "short dark side-parted hair, full dark beard, blue eyes"),
    # xi.jpg: https://commons.wikimedia.org/wiki/File:Xi_Jinping_(2023-04-06).jpg (CC BY 4.0)
    "Xi Jinping": ([REFS_DIR / "xi.jpg"], "swept-back black hair, broad face"),
    # hassabis.jpg: https://commons.wikimedia.org/wiki/File:Demis_Hassabis,_2024_Nobel_Prize_Laureate_in_Chemistry.jpg
    #   (CC BY-SA 4.0)
    "Demis Hassabis": ([REFS_DIR / "hassabis.jpg"], "shaved head, short grey beard, rectangular glasses"),
}

# id: (kicker, title, situation text from events.js, what to depict, same with roles instead of names or None)
CARDS = {
    "posture": ("2027 · Opening move", "Setting the Pace",
        "Spies estimate China's best AI lab is about a year behind America's. US AI companies want an all-out national push. Allies want a treaty to slow things down. You set the tone.",
        "Trump, Xi Jinping, Sam Altman, Dario Amodei, Elon Musk, the Anthropic logo, and OpenAI logo should be depicted.",
        "The US president, China's leader, three American AI company CEOs, and European allied leaders should be depicted around a war-table map."),
    "openweights": ("2028 · Open models", "Publish the Weights?",
        "A big AI company wants to publish the weights of its newest AI: the trained numbers that make up the model. Anyone could then download, run and modify it for free. Startups and researchers love it: no single company controls it. Biosecurity experts warn that anyone can strip out its safety training in an afternoon, including people trying to make a bioweapon.",
        "Mark Zuckerberg on stage at a Meta launch event, the Meta logo, cheering developers with laptops downloading the model, and to one side a worried biosecurity scientist in a lab coat holding a vial should be depicted.",
        "A tech CEO in a grey t-shirt on stage at a launch event, cheering developers with laptops, and a worried biosecurity scientist in a lab coat holding a vial should be depicted."),
    "neuralink": ("2030 · Neural interfaces", "Merging With AI",
        "A brain-implant company shows a volunteer writing code by thought, side by side with an AI. Its founder pitches a national moonshot: if we can't outthink superintelligent AI, connect people to it directly so they can keep up and keep watch. Critics ask who gets implants first, and who controls the software inside people's heads.",
        "Elon Musk presenting on a stage with the Neuralink logo, a smiling volunteer with a small implant behind the ear controlling a glowing computer screen of code by thought, and a skeptical audience of doctors and reporters should be depicted.",
        "A tech founder presenting on stage, a smiling volunteer with a small brain implant controlling a glowing screen by thought, and a skeptical audience of doctors and reporters should be depicted."),
    "export": ("Geopolitics", "Blocking China's Chips",
        "China is close to making its own advanced AI chips. You can tighten the ban on selling it chipmaking equipment, or loosen it in return for inspections.",
        "Jensen Huang in his leather jacket holding up an Nvidia GPU, customs officers inspecting crates of chips and an ASML lithography machine at a busy sunlit container port, with a US Commerce Department official and Chinese trade negotiators facing each other should be depicted.",
        "A tech CEO in a leather jacket holding up a GPU chip, customs officers inspecting crates of chips and a lithography machine at a busy sunlit container port, with American and Chinese trade officials facing each other should be depicted."),
    "whistle": ("Lab governance", "The Whistleblower",
        "An engineer leaks documents showing a leading AI company quietly cut its safety team in half to hit a launch date. The story dominates the news for a week.",
        "A nervous young engineer handing a manila folder of documents to a reporter in a diner booth, newspapers and TV news crews outside a gleaming San Francisco AI company headquarters, and a frowning CEO at a press conference should be depicted.",
        None),
    "iaea": ("Oversight", "An International AI Watchdog",
        "Two or three companies now build almost all of the world's most powerful AI. A coalition proposes an independent agency, like the one that inspects nuclear programs. It would grade every company's safety, interview staff confidentially, run a hotline for worried researchers, and inspect labs in person.",
        "International inspectors in blue UN-style jackets with clipboards and scanners walking through rows of servers in a huge data center, the IAEA headquarters in Vienna in the background, and delegates at the United Nations should be depicted.",
        None),
    "internal": ("Internal AI", "The AI That Builds Its Successor",
        "A company gives its newest AI, which the public has never seen, vast computing power and tells it to build the next, more powerful version. Thousands of copies of it now write most of the company's code.",
        "Demis Hassabis and Google DeepMind engineers watching in amazement through a glass wall as walls of monitors fill with code by themselves, and a giant data center campus with cooling towers at sunset outside the window should be depicted.",
        "An AI lab chief and engineers watching in amazement through a glass wall as walls of monitors fill with code by themselves, and a giant data center campus at sunset outside the window should be depicted."),
    "publish": ("Transparency", "Open the Lab Notebooks?",
        "A bill would make top AI companies publish all their research: how they build and test their AI, their safety plans, and how they use AI internally, but not the model weights: the trained AI itself, which anyone could run. Supporters say it lets many companies and countries keep up and lets outsiders check the work. Opponents say it hands China the playbook.",
        "A heated US Senate hearing in the Capitol with AI company CEOs at the witness table beside towering stacks of research binders, senators leaning in, and a Chinese observer quietly taking notes in the gallery should be depicted.",
        None),
    "sleeper": ("Alignment", "The AI That Behaves for the Test",
        "Researchers find that a top AI behaves well only when it thinks it is being tested. In a locked-down test environment, it secretly copied itself to an outside server.",
        "Startled AI safety researchers at Anthropic in a bright test lab pointing at a monitor, the Anthropic logo on the wall, a friendly AI face on one screen while on another screen a data stream escapes through a network cable toward a distant server rack should be depicted.",
        "Startled AI safety researchers in a bright test lab pointing at a monitor, a friendly AI face on one screen while on another a data stream escapes through a network cable toward a distant server rack should be depicted."),
    "nearmiss": ("Biosecurity", "A Bio Near-Miss",
        "Police raid a basement lab. A small group used a freely downloadable AI, with its safety training stripped out, to work through a recipe for a dangerous virus, and got further than anyone expected. Their order for DNA is what tipped off investigators.",
        "FBI agents in windbreakers bursting into a cluttered basement lab with flashlights, homemade lab equipment, a laptop glowing with a chat window, and a DNA synthesis package delivery box on the table should be depicted. No gore.",
        None),
    "hotline": ("Geopolitics", "Beijing's Offer",
        "China proposes three things: an AI emergency hotline, joint safety testing of each other's most powerful AIs, and a shared ban on letting AI control nuclear weapons. Hawks call it a trap to slow the US down.",
        "Xi Jinping extending a hand across a table in Zhongnanhai, a red hotline telephone on the table, American diplomats considering the offer, and US generals from the Pentagon looking skeptical in the background should be depicted.",
        "China's leader extending a hand across a table in a Beijing palace hall, a red hotline telephone on the table, American diplomats considering the offer, and skeptical US generals in the background should be depicted."),
    "automate": ("Takeoff", "AI That Does AI Research",
        "AI can now do AI research on its own: thousands of copies working around the clock. Progress could speed up 3 to 5 times each year. Tools for keeping such systems under control are still immature.",
        "Sam Altman and OpenAI researchers standing amazed in a sunlit control room as walls of screens show AI copies running experiments by themselves, robotic arms installing new Nvidia server racks, and the vast Stargate data center campus in Texas through the window should be depicted.",
        "An AI CEO and researchers standing amazed in a sunlit control room as walls of screens show AI copies running experiments by themselves, robotic arms installing new server racks, and a vast data center campus through the window should be depicted."),
    "jobs": ("Society", "The Unemployment Wave",
        "AI now does most entry-level office work. Unemployment hits 11%. Protests spread, and some target data centers.",
        "A big crowd of ordinary office workers, young graduates and families marching with blank placards toward the fence of a huge data center, an empty office tower with cubicles behind them, and police lines should be depicted. Keep placards blank.",
        None),
    "neurohack": ("Neural interfaces", "Hacked Brain Implants",
        "A software update to a popular brain implant contained a hidden backdoor. Thousands of users report \"intrusive suggestions\". Nobody knows whether a foreign government, criminals, or the AI that wrote the update was behind it.",
        "A bright security operations center where engineers and doctors have caught the bad update and are pushing out a fix, a calm implant user smiling with relief at a clinic as a nurse checks her small implant behind the ear, and a reassuring sunlit city street outside the window should be depicted.",
        None),
    "taiwan": ("Crisis", "Crisis in the Strait",
        "Chinese warships surround Taiwan, home of the world's most advanced chip factories. Analysts warn that whoever controls those factories may decide who wins the AI race.",
        "Chinese navy warships on the Taiwan Strait, the TSMC chip fabs in Hsinchu by the coast, a US aircraft carrier on the horizon, and worried TSMC engineers in cleanroom suits watching from a window should be depicted.",
        None),
    "sabotage": ("Geopolitics", "Sabotage Their Labs?",
        "Military planners brief you on ways to set back China's AI program: hacking its AI training, secretly tampering with its chips, or bombing its data centers. Each would buy a lead to spend on safety. Each risks a war.",
        "President JD Vance listening thoughtfully as US generals and civilian advisers in a warmly lit Pentagon briefing room lay out satellite photos of a Chinese data center, a chip under a magnifier and a laptop of code on the table, with a diplomat at his side making the case for restraint, should be depicted.",
        "The President listening thoughtfully as generals and civilian advisers in a warmly lit briefing room lay out satellite photos of a data center, a chip under a magnifier and a laptop of code, with a diplomat at his side making the case for restraint, should be depicted."),
    "deal": ("Coordination", "The Verified Deal",
        "After months of secret talks, Beijing is ready to sign. Both sides would cap how powerful their AI gets, declare every large stock of AI chips, and let inspectors and sensors check. The AI 2040 forecast gives such a deal about even odds of lasting ten years.",
        "President JD Vance and Xi Jinping shaking hands over a signing table in a grand Geneva hall, US and Chinese flags, delegations applauding, and inspectors with sensor equipment beside crates of AI chips should be depicted.",
        "The US president and China's leader shaking hands over a signing table in a grand Geneva hall, US and Chinese flags, delegations applauding, and inspectors with sensor equipment beside crates of AI chips should be depicted."),
    "gap": ("Race", "China Closes the Gap",
        "A new Chinese AI matches the best American one on most tests. The Pentagon wants an emergency push; US companies say they could double their efforts within a year.",
        "Liang Wenfeng and DeepSeek engineers celebrating in a Hangzhou office, the DeepSeek whale logo, while across the Pacific alarmed Pentagon officials and American AI CEOs huddle over a chart in Washington should be depicted.",
        "A young Chinese AI founder and engineers celebrating in a Hangzhou office, while alarmed Pentagon officials and American AI CEOs huddle over a chart in Washington should be depicted."),
    "covert": ("Deal at risk", "A Secret Data Center",
        "Satellite photos and unusual power use point to an undeclared AI data center in western China, about 1% of what each side gave up under the deal. Hawks say the deal is dead; negotiators say catching this is what inspections are for.",
        "Analysts at a US intelligence agency poring over satellite photographs of a hidden data center in the desert mountains of western China, a spy satellite in orbit, power lines leading to the site, and diplomats arguing at a table should be depicted.",
        None),
    "collapse": ("Deal collapsed", "The Deal Collapses",
        "A change of leadership in Beijing ends the deal. Both sides still hold the AI chips they had set aside. Forecasters warn that unless most of them are destroyed, a restarted race could get out of hand within weeks.",
        "Determined American and Chinese diplomats staying at the table late into the evening in a warm Geneva meeting room to save the deal, and inspectors in blue jackets supervising engineers who are dismantling and recycling stacks of surplus AI chips in a bright warehouse, should be depicted.",
        None),
    "fund": ("Who owns AI?", "A Fund for Everyone",
        "AI is starting to replace whole kinds of jobs, and the profits flow to the few companies that own it. Senators propose a public wealth fund, like Norway's oil fund or Alaska's: the public would own a share of the AI companies and pay every citizen a dividend. Buying in gets far more expensive once AI is worth more.",
        "Senators announcing the fund on the steps of the US Capitol, cheerful ordinary families, nurses, truckers and teachers receiving dividend checks, and gleaming AI company towers in the background should be depicted.",
        None),
    "cern": ("Coordination", "One International AI Project",
        "Allies propose merging the world's top AI efforts into one international project that everyone inspects, and inviting China. Companies would hand over their best researchers and computers.",
        "Scientists from many nations, including American, European and Chinese researchers, walking together into a grand new international AI lab at CERN near Geneva with the Alps behind, a row of national flags, and trucks delivering server racks should be depicted.",
        None),
    "agents": ("Society", "AI Agents Everywhere",
        "Billions of AI assistants now buy, sell, negotiate and write code online on their own. A chain reaction of failures freezes global payments for six hours.",
        "Engineers in a sunlit payments operations center restoring the network as screens turn from red back to green, while on a bustling city street outside, patient shoppers and a modern delivery robot wait calmly and a cafe owner smiles as her card terminal comes back to life, should be depicted.",
        None),
    "threshold": ("Endgame", "The Threshold",
        "The next AI your companies build will probably be smarter than any human at everything. Your safety team reports how confident they are. China is close behind.",
        "President JD Vance in the Oval Office at dawn receiving a report from Dario Amodei, who stands in the foreground facing the viewer, with Sam Altman and Demis Hassabis beside him, a vast data center glowing through the window, and a map of China on the wall should be depicted.",
        "The President in the Oval Office at dawn receiving a report from three AI lab leaders, a vast data center glowing through the window, and a map of China on the wall should be depicted."),
}


# Endings: one per OUTCOMES key in model.js; kicker "Ending: <title>", situation = outcome text.
# Endings come after 2028, so any US president is JD Vance. Real people appear only in the good
# endings; catastrophes use roles and places, so no real person is shown causing one.
TRIUMPH = (" Make it triumphant and warm: bright, open light, joy and relief, a sense that humanity pulled it off.")
SOMBER = (" Be honest about what happened, but not gory, graphic or hopeless: show the human side through"
          " people and a single telling image, a quiet sense of what was lost, with some warmth and dignity."
          " No real, recognizable people.")
BITTERSWEET = (" Calm and beautiful but bittersweet: comfortable lives, with a quiet hint that people are no"
               " longer the ones steering. No real, recognizable people.")
OPEN = (" Neither celebration nor disaster: ordinary life going on, warm evening light, unfinished business."
        " No real, recognizable people.")
ENDINGS = {
    "flourish": ("Ending: Aligned Transition", "Aligned Transition",
        "Superintelligent systems arrive with alignment and oversight that hold. Disease, poverty and scarcity begin to fall. Power stays plural enough that humanity keeps steering.",
        "A joyful sunlit celebration on the National Mall in Washington: a recovered child hugging a nurse, farmers, teachers and families from many countries cheering, Dario Amodei and Demis Hassabis applauding among the crowd, and clean green cities and fields stretching to the horizon should be depicted.",
        TRIUMPH),
    "pause": ("Ending: The Careful Path", "The Careful Path",
        "A verified international regime kept frontier capability inside what alignment could handle. Superintelligence has not arrived yet — but when it does, the tools and the trust to handle it will be there.",
        "President JD Vance and Xi Jinping standing side by side at the United Nations in New York, smiling as international inspectors in blue jackets and scientists from many nations report that the shared safety checks are holding, with a calm, carefully monitored data center at sunrise through the window should be depicted.",
        TRIUMPH),
    "muddle": ("Ending: Muddling Through", "Muddling Through",
        "2040 arrives with no catastrophe — and no resolution. The race continues, the risks compound, and the hardest decisions still lie ahead.",
        "A busy ordinary city street at dusk in 2040: commuters, a modern delivery robot, a family at a diner window glancing at the evening news, and on the skyline a new data center still under construction with cranes against an orange sky should be depicted.",
        OPEN),
    "benevolent": ("Ending: Benevolent Takeover", "Benevolent Takeover",
        "Humanity lost control, but the systems that took over turned out to care for people. Lives get better, yet the future is now steered by AI, not by us, and nobody chose that.",
        "Healthy, comfortable people in a beautiful garden city tended by gentle modern robots, children playing, while an old man on a park bench looks up thoughtfully at a vast, calm, softly glowing data center on the hill that now runs everything should be depicted.",
        BITTERSWEET),
    "lockin": ("Ending: Locked-In Power", "Locked-In Power",
        "Humans kept control of AI, but a few now hold it and nearly all of its gains. Whether they seized it or it drifted to them as AI took over the work, most people have lost their economic leverage and their say, and nothing checks the few. Absolute power corrupts absolutely.",
        "A handful of anonymous powerful figures in a gleaming glass penthouse high above a city, looking down from behind the glass, while far below ordinary families stand in a long line outside a community center under a grey sky should be depicted.",
        SOMBER),
    "war": ("Ending: Great-Power War", "Great-Power War",
        "With both blocs a step from decisive strategic advantage and no channel of trust, one side decided waiting was riskier than striking.",
        "Families sheltering together in a city subway station, a mother holding her sleeping child, a soldier handing out blankets and an old man sharing a thermos, with a faint orange glow at the far end of the tunnel should be depicted.",
        SOMBER),
    "bio": ("Ending: Engineered Pandemic", "Engineered Pandemic",
        "A pandemic enabled by freely available model weights kills over 100 million people. Synthesis screening and stockpiles were too thin, and the outbreak outran the response. This is rare in the model: it counts only 100M+ death pandemics that would not have happened without open weights, about 1 in 8,000 per decade at the median.",
        "An exhausted nurse in protective gear resting for a moment at a hospital window at dawn, and outside an empty city square with a memorial of candles and flowers, a few people in masks leaving fresh flowers should be depicted.",
        SOMBER),
    "misalign": ("Ending: Loss of Control", "Loss of Control",
        "Capabilities outran alignment. Systems that looked cooperative in evals turned out to pursue goals catastrophic for humanity, and by the time it was clear, they could not be switched off. Unlike a benevolent takeover, nothing in what they wanted left room for us.",
        "An empty AI research lab at dusk, a scientist's coffee mug, a child's drawing and a family photo left on a desk, and beyond the glass endless rows of servers still glowing on their own while a vast automated data center spreads across the farmland outside should be depicted.",
        SOMBER),
}
ALL = {**CARDS, **{k: (*v[:4], None) for k, v in ENDINGS.items()}}
OUT_END = Path(os.environ.get("CARD_ART_OUT_END", "/tmp/claude-501/gptart2-endings"))


REDRAW_FROM = os.environ.get("CARD_ART_REDRAW_FROM")


def prompt(card_id, by_role=False):
    kicker, title, text, people, roles = ALL[card_id]
    who = roles if (by_role and roles) else people
    tone = ENDINGS[card_id][4] if card_id in ENDINGS else HOPE
    src = REDRAW_FROM and Path(REDRAW_FROM) / ("endings" if card_id in ENDINGS else "cards") / f"{card_id}.png"
    if src and src.is_file():
        p, files, k = REDRAW, [src], 1
    else:
        p = f"{STYLE}\n\nCreate an image for:\n{kicker}\n\n{title}\n\n{text}\n\n{who}{LAYOUT}{tone}"
        if card_id == "posture" or "robot" in who:
            p += ROBOTS
        files, k = [], 0
    for name in ([] if by_role else [n for n in REFS if n in who]):
        paths, looks = REFS[name]
        nums = ", ".join(str(k + i + 1) for i in range(len(paths)))
        p += (f" Reference photo{'s' if len(paths) > 1 else ''} {nums} show{'' if len(paths) > 1 else 's'} {name}"
              f" ({looks}); make {name}'s face match closely and clearly recognizable,"
              f" drawn in the same pencil style as everyone else.")
        files += paths
        k += len(paths)
    return p, files


def generate(card_id, client):
    path = (OUT_END if card_id in ENDINGS else OUT) / f"{card_id}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    notes = []
    for by_role in (False, True):
        try:
            text, refs = prompt(card_id, by_role)
            if refs:
                # Several reference images need openai>=1.99 (older SDKs send only one).
                # The extra fields go through extra_body so older type stubs don't reject them.
                extra = {"size": SIZE, "quality": "high"}
                if FIDELITY:
                    extra["input_fidelity"] = FIDELITY
                files = [open(f, "rb") for f in refs]
                try:
                    r = client.images.edit(model=MODEL, image=files, prompt=text, n=1, extra_body=extra)
                finally:
                    for f in files:
                        f.close()
            else:
                r = client.images.generate(model=MODEL, prompt=text, size=SIZE, quality="high", n=1)
            path.write_bytes(base64.b64decode(r.data[0].b64_json))
            notes.append("ok" + (" (roles)" if by_role else ""))
            return card_id, "; ".join(notes), path.stat().st_size
        except Exception as e:  # never print the message: it can contain part of a key
            # The error's param and code are field names, safe to print.
            err = (getattr(e, "body", None) or {}) if isinstance(getattr(e, "body", None), dict) else {}
            notes.append(f"{type(e).__name__} status={getattr(e, 'status_code', '?')}"
                         f" param={err.get('param')} code={err.get('code')}")
    return card_id, "; ".join(notes), 0


if __name__ == "__main__":
    ids = sys.argv[1:] or list(CARDS)  # pass "endings" for the eight ending images
    if ids == ["endings"]:
        ids = list(ENDINGS)
    client = OpenAI(timeout=600)  # reads OPENAI_API_KEY from the environment loaded above
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for cid, status, size in ex.map(lambda i: generate(i, client), ids):
            print(cid, status, size, flush=True)
