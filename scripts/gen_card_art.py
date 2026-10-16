"""Generate painted card illustrations with OpenAI's image model.

Reads OPENAI_API_KEY from .env (gitignored) inside this process only; the key is
never printed. Errors report just the exception type and status code, since API
error messages can echo part of a key. Raw PNGs go to OUT (default
/tmp/claude-501/gptart2). If a prompt is refused, it retries once with the people
described by role instead of by name.
Usage: python3 scripts/gen_card_art.py [card_id ...]
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

STYLE = (
    "I want a hardy boys type aesthetic for an AGI pdoom simulator I'm creating.\n\n"
    "No text in the image. No explicit Hardy Boys stuff. Do not put Hardy Boys in the image. "
    "Just that style, but more realistic even."
)
LAYOUT = (" Keep the key figures and subjects in the middle horizontal band of a wide landscape frame."
          " Make it a warm, vivid painted illustration, not a photograph.")
ROBOTS = (" If any robot appears, it must be a modern, present-day robot, like a Tesla Optimus or Figure humanoid"
          " or an industrial robot arm, not a retro or science-fiction robot, with no lettering on it.")

# Reference photos passed to the images edit endpoint so likenesses come out right.
# Downloaded locally, never committed.
# Dario Amodei: https://commons.wikimedia.org/wiki/File:Dario_Amodei_in_2023_(cropped).jpg
#   (UK Prime Minister's Office, CC BY 2.0)
REFS_DIR = Path(os.environ.get("CARD_ART_REFS", "/tmp/claude-501/refs"))
REFS = {"Dario Amodei": REFS_DIR / "dario.jpg"}
REF_NOTE = ("The attached reference photo shows {name}; make {name}'s face and hair match it closely"
            " (curly dark hair, dark-rimmed glasses), rendered in the same painted style as everyone else.")

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
        "Confused ordinary people on a busy city street touching small brain implants behind their ears as their phones show an update progress bar, a Neuralink-style clinic in the background, and security investigators at a lab tracing the update on computer screens should be depicted.",
        None),
    "taiwan": ("Crisis", "Crisis in the Strait",
        "Chinese warships surround Taiwan, home of the world's most advanced chip factories. Analysts warn that whoever controls those factories may decide who wins the AI race.",
        "Chinese navy warships on the Taiwan Strait, the TSMC chip fabs in Hsinchu by the coast, a US aircraft carrier on the horizon, and worried TSMC engineers in cleanroom suits watching from a window should be depicted.",
        None),
    "sabotage": ("Geopolitics", "Sabotage Their Labs?",
        "Military planners brief you on ways to set back China's AI program: hacking its AI training, secretly tampering with its chips, or bombing its data centers. Each would buy a lead to spend on safety. Each risks a war.",
        "US generals in the Pentagon war room briefing the President around a table with satellite photos of a Chinese data center, a hacker at a keyboard, a tampered chip under a magnifier, and a model bomber on the table should be depicted.",
        "US generals in a war room briefing the President around a table with satellite photos of a data center, a hacker at a keyboard, a chip under a magnifier, and a model bomber on the table should be depicted."),
    "deal": ("Coordination", "The Verified Deal",
        "After months of secret talks, Beijing is ready to sign. Both sides would cap how powerful their AI gets, declare every large stock of AI chips, and let inspectors and sensors check. The AI 2040 forecast gives such a deal about even odds of lasting ten years.",
        "Trump and Xi Jinping shaking hands over a signing table in a grand Geneva hall, US and Chinese flags, delegations applauding, and inspectors with sensor equipment beside crates of AI chips should be depicted.",
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
        "A new Chinese leader tearing up the treaty in the Great Hall of the People, shocked diplomats, and workers rushing to reopen sealed warehouses of Nvidia AI chip crates in both countries should be depicted.",
        "A new Chinese leader tearing up the treaty in a grand Beijing hall, shocked diplomats, and workers rushing to reopen sealed warehouses of AI chip crates should be depicted."),
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
        "A bustling Times Square-like city street where shoppers stare at frozen phones and card terminals, stalled delivery robots and drones, traders at the New York Stock Exchange in dismay, and a cascade of glowing network failures across the sky should be depicted.",
        None),
    "threshold": ("Endgame", "The Threshold",
        "The next AI your companies build will probably be smarter than any human at everything. Your safety team reports how confident they are. China is close behind.",
        "The President in the Oval Office at dawn receiving a report from Sam Altman, Dario Amodei and Demis Hassabis, the OpenAI, Anthropic and Google DeepMind logos on a screen, a vast data center glowing through the window, and a map of China on the wall should be depicted.",
        "The President in the Oval Office at dawn receiving a report from three AI lab leaders, a vast data center glowing through the window, and a map of China on the wall should be depicted."),
}


def prompt(card_id, by_role=False):
    kicker, title, text, people, roles = CARDS[card_id]
    who = roles if (by_role and roles) else people
    p = f"{STYLE}\n\nCreate an image for:\n{kicker}\n\n{title}\n\n{text}\n\n{who}{LAYOUT}"
    if card_id == "posture" or "robot" in who:
        p += ROBOTS
    refs = [] if by_role else [n for n in REFS if n in who]
    for name in refs:
        p += " " + REF_NOTE.format(name=name)
    return p, [REFS[n] for n in refs]


def generate(card_id, client):
    path = OUT / f"{card_id}.png"
    notes = []
    for by_role in (False, True):
        try:
            text, refs = prompt(card_id, by_role)
            if refs:
                # SDK 1.68 types edit() for DALL-E 2, so size/quality go through extra_body.
                with open(refs[0], "rb") as f:
                    r = client.images.edit(model=MODEL, image=f, prompt=text, n=1,
                                           extra_body={"size": SIZE, "quality": "high"})
            else:
                r = client.images.generate(model=MODEL, prompt=text, size=SIZE, quality="high", n=1)
            path.write_bytes(base64.b64decode(r.data[0].b64_json))
            notes.append("ok" + (" (roles)" if by_role else ""))
            return card_id, "; ".join(notes), path.stat().st_size
        except Exception as e:  # never print the message: it can contain part of a key
            notes.append(f"{type(e).__name__} status={getattr(e, 'status_code', '?')}")
    return card_id, "; ".join(notes), 0


if __name__ == "__main__":
    ids = sys.argv[1:] or list(CARDS)
    client = OpenAI(timeout=600)  # reads OPENAI_API_KEY from the environment loaded above
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for cid, status, size in ex.map(lambda i: generate(i, client), ids):
            print(cid, status, size, flush=True)
