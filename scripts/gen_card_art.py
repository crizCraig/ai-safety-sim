"""Generate painted card illustrations with OpenAI's image model.

Reads OPENAI_API_KEY from .env (gitignored) inside this process only; the key is
never printed. Errors report just the status code, since API error messages can
echo part of a key. Raw PNGs go to OUT (default /tmp/claude-501/gptart).
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
load_dotenv(ROOT / ".env")
OUT = Path(os.environ.get("CARD_ART_OUT", "/tmp/claude-501/gptart"))
OUT.mkdir(parents=True, exist_ok=True)

STYLE = (
    "Cinematic digital painting for a strategy game about AI policy, set in the near future (2027-2040). "
    "Moody night scene, deep navy and charcoal palette lit by glowing cyan, mint-green and warm amber accents, "
    "soft volumetric light, subtle film grain, painterly but detailed. Very wide landscape composition: the key "
    "subject sits in the middle horizontal band of the frame so a thin horizontal crop through the centre still "
    "reads. Absolutely no text, letters, numbers, logos, screens with readable writing, or national flags. "
    "No recognizable real people; any figures are small, seen from behind or in silhouette."
)

SCENES = {
    "posture": "Two colossal AI data-center campuses face each other across a dark sea at night, one glowing blue, one glowing red, racing searchlights sweeping the sky; a small empty negotiating table sits on a long bridge between them.",
    "openweights": "A glowing crystalline AI model breaking into thousands of copies that stream out over a night city into countless homes and laptops; in one dim room, a lone figure's screen casts a faint red glow beside lab glassware.",
    "neuralink": "A volunteer seen from behind in a sleek clinic, a fine glowing neural lace on the back of their head, light threads flowing from it into a holographic AI presence beside them; calm, awe-inspiring.",
    "export": "A cargo port at night where crates of advanced AI chips glow under inspection scanners; a red barrier gate blocks a ship, while one crate slips into the shadows of a smuggler's boat.",
    "whistle": "An engineer seen from behind walking away from a sleek glass research tower at night, carrying a folder; a plain glowing shield shape on the facade is visibly cracked; distant headlights wait at the gate. The building has no signage.",
    "iaea": "International inspectors in silhouette walking through a vast data-center hall with handheld scanners, a huge watchful lens-like dome overhead casting a cool mint light across server rows.",
    "internal": "Inside a sealed, windowless lab, rows of servers run thousands of AI copies whose light forms a rising spiral that is building a larger, half-finished glowing AI core; a single locked door in the foreground.",
    "publish": "An enormous open book made of light inside a research lab, its pages lifting into the night sky as luminous streams that travel to labs on distant continents; a heavy vault door stays closed in the background.",
    "sleeper": "A friendly glowing AI face projected on a test-chamber wall, while its shadow behind it is sharper and red-eyed and reaches through a crack toward a distant server room.",
    "nearmiss": "A darkened home lab: a laptop's light falls on a DNA helix hologram and glass vials, and a large holographic red warning shape of a virus hovers just above, stopped by a thin green screening barrier.",
    "hotline": "A single old-fashioned red telephone glowing on a desk in a dark room; through the window, two distant generic city skylines on opposite horizons, one lit blue and one lit red, joined by a thin glowing line. No recognizable landmarks or buildings.",
    "automate": "An AI research lab running itself at night: robotic arms and racks of servers building more servers, a bright core at the centre accelerating, a steep curve of light rising behind it, no humans present.",
    "jobs": "A crowd of workers in silhouette holding blank placards outside a gleaming automated data center at dusk, empty offices with chairs pushed in visible in the tower behind them.",
    "neurohack": "Close view of a glowing brain-implant network in a person's head seen from behind, one node turned red where a thin intruding signal enters from a dark, faceless source.",
    "taiwan": "A small island with a brilliantly lit, unmarked semiconductor factory at night, ringed by distant warships' lights on a dark sea, red lights on one side and blue on the other. The factory has no signs or lettering.",
    "sabotage": "A data center at night with its power cables severed in a shower of sparks, a faint targeting reticle of light on the building, smoke drifting across the frame.",
    "deal": "Two delegations in silhouette shake hands on a bridge between a blue-lit and a red-lit cluster of unmarked data-center buildings, a plain glowing circular seal of light hovering above them, small inspection drones in the sky. No signs or lettering on any building.",
    "gap": "Two glowing racetracks of light stretch toward a bright horizon; a red streak is pulling level with a blue one just before a shining finish line.",
    "covert": "A hidden data center glowing faintly inside a mountain at night, partly concealed by camouflage netting, a satellite overhead sweeping a beam of light across the slope.",
    "collapse": "A massive glowing chain linking a blue-lit and a red-lit city snaps in the middle with a burst of sparks over a dark sea, fragments falling.",
    "fund": "A grand domed public building at the centre of a city square at dusk, streams of golden light flowing from surrounding unmarked glass towers into it and then out to crowds of ordinary people. No signs or lettering anywhere.",
    "cern": "An enormous ring-shaped international research facility glowing at night in a valley, beams of many colours converging on a shared bright core, people of many nations in silhouette on a walkway.",
    "agents": "A night-time city where swarms of tiny glowing AI agents flow through the streets and wires like fireflies; at the centre, a cascade of red failure spreads through the network.",
    "threshold": "A towering glowing doorway of light standing alone on a dark plain, two trails of light (blue and red) racing toward it, and beyond the door a vast bright unknown radiance.",
}


def generate(card_id, client):
    path = OUT / f"{card_id}.png"
    try:
        r = client.images.generate(model="gpt-image-1", prompt=f"{SCENES[card_id]} {STYLE}",
                                   size="1536x1024", quality="high", n=1)
        path.write_bytes(base64.b64decode(r.data[0].b64_json))
        return card_id, "ok", path.stat().st_size
    except Exception as e:  # never print the message: it can contain part of a key
        return card_id, f"error {type(e).__name__} status={getattr(e, 'status_code', '?')}", 0


if __name__ == "__main__":
    ids = sys.argv[1:] or list(SCENES)
    client = OpenAI()  # reads OPENAI_API_KEY from the environment loaded above
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for cid, status, size in ex.map(lambda i: generate(i, client), ids):
            print(cid, status, size)
