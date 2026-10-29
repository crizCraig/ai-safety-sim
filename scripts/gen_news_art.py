"""Generate and process the lead photos for the campaign's year-end front page (The Ledger).

Realistic black-and-white news photographs, one per story kind; news.js maps each headline
template to one (`img`), and only the year's lead story shows its photo. Ordinary people in
everyday roles, never real public figures; no legible text or logos; hopeful or neutral.

Model: gpt-image-2.5-sunburst at quality "high", 1536x1024 (3:2, the paper's lead-photo shape).
OpenAI's model page calls Sunburst "our most capable model for image generation and editing";
Flare is "our fastest model for high-quality, everyday image generation". Override with
NEWS_ART_MODEL. The key is loaded from .env inside this process by gen_card_art and never printed.

Usage:
  python3 scripts/gen_news_art.py gen [key ...]   # raw PNGs into NEWS_ART_OUT (default /tmp/claude-501/newsphoto)
  python3 scripts/gen_news_art.py process         # PNGs -> assets/news/<key>.webp (1200x800, greyscale)
Each call logs its model (the one the response names, or the one requested: images responses
have not named one) and its cost from the response's token usage, at GPT Image 2.5 rates ($5/M
text in, $8/M image in, $30/M image out), appending to cost.log in NEWS_ART_OUT. The 41 photos
(Oct 2026) cost $1.73 at about 1,370 output tokens each.
"""
import base64
import concurrent.futures as cf
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_card_art  # noqa: E402,F401  (loads .env in-process; the key is never printed)

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("NEWS_ART_OUT", "/tmp/claude-501/newsphoto"))
MODEL = os.environ.get("NEWS_ART_MODEL", "gpt-image-2.5-sunburst")
SIZE, QUALITY = "1536x1024", "high"

STYLE = (
    "A realistic black-and-white documentary news photograph for the front page of a daily newspaper:"
    " candid photojournalism shot on 35mm film with a 35mm or 50mm lens, natural available light, real"
    " film grain, true black-and-white tonality with deep blacks and soft highlights. It must look like a"
    " real press photo of a real moment, not an illustration, painting, render or staged stock photo."
)
RULES = (
    " Ordinary people in everyday roles; no real, recognizable public figures. Natural, anatomically correct"
    " hands and faces. Absolutely no legible text anywhere: no words, letters, numbers, signs, logos, labels,"
    " name plates or flags; any screens show only soft, blurred abstract shapes. The mood is hopeful or"
    " calmly neutral: capable people at work or ordinary life going on, never panic, injury or destruction."
    " Landscape 3:2 frame with the main subject near the centre."
)

# key: what the photo shows
NEWS = {
    "research": "A small team of researchers in a bright lab office at morning, watching rows of monitors with quiet"
        " amazement as AI agents run experiments on their own; coffee cups and notebooks on the desks, tall windows.",
    "expert": "A senior scientist and a younger colleague in a university library, leaning in with curiosity toward a"
        " large screen showing an AI's research results, stacks of books and papers around them, window light.",
    "superintelligence": "Seen from a grassy hill at dawn, a vast low data-centre campus with soft lights, and on the hill"
        " a few engineers and a family with a child watching the sunrise over it together, quiet and hopeful.",
    "datacentre": "A huge new data-centre campus under construction on open plains at sunrise: long low halls, cranes,"
        " power lines, and construction workers in hard hats and safety vests walking beside a pickup truck.",
    "idle": "A quiet, half-lit data-centre hall with long rows of server racks, most lights dimmed, and a single"
        " technician walking down the aisle carrying a tablet; calm and orderly, a shaft of light from a high window.",
    "safetylab": "An AI safety research team gathered around a large monitor, one researcher pointing at it while the"
        " others lean in and nod, plants and daylight in a bright modern lab.",
    "testscare": "Two safety researchers in a test lab in the evening, leaning toward a monitor, one raising a hand to"
        " pause the run; behind a glass wall a single isolated server rack. Focused and calm, they caught it in time.",
    "talks": "Two delegations of diplomats seated across a long negotiating table in a tall, light-filled hall,"
        " interpreters with headsets, water glasses and folders, two delegates at the centre shaking hands.",
    "inspectors": "International inspectors in plain jackets with tablets and handheld scanners walking down a"
        " data-centre aisle with a lab engineer, checking sealed tags on the server racks; orderly and cooperative.",
    "collapse": "An empty negotiating table late in the evening after talks ended: scattered folders, pushed-back"
        " chairs, cooling cups of tea, and one diplomat standing at a tall window looking out at the city lights.",
    "warroom": "Military analysts and a civilian diplomat in a calm operations room studying large aerial photographs"
        " of a data-centre complex on wall screens, an officer and the diplomat conferring quietly over a table.",
    "chinalab": "Young Chinese engineers in a modern open-plan office celebrating a result around a monitor, high-fives"
        " and smiles, tall city towers through the windows, bright daytime.",
    "uslab": "A modern AI lab campus on a sunny day: engineers walking and talking along a courtyard path with laptops"
        " and coffee, a glass building and a large server building with cooling units behind, palm trees.",
    "markets": "A busy trading floor in the morning, traders watching banks of screens, some on phones, one leaning"
        " back thoughtfully with hands behind his head, light from tall windows.",
    "jobs": "An open-plan office where ordinary office workers use AI assistants on their computers, one worker"
        " showing a colleague how it works over her shoulder; ordinary and warm.",
    "delegation": "A modern office where a manager at a standing desk taps approve on a stream of decisions an AI has"
        " prepared on a large screen, colleagues working nearby, ordinary daylight, a slightly too-smooth calm.",
    "hearing": "A legislative hearing room: lawmakers on a raised wooden dais listening closely to a panel of expert"
        " witnesses at a table with microphones, staff seated behind, press photographers crouched at the side.",
    "protest": "A peaceful crowd of ordinary citizens of all ages at a town-square rally holding blank placards, a"
        " speaker on a small stage with a microphone, police standing calmly by, autumn trees; earnest, not violent.",
    "townhall": "A community town-hall meeting in a wooden hall: residents raising hands and asking questions, local"
        " officials at a table listening and answering, a mix of ages, attentive and good-humoured.",
    "fund": "A bright neighbourhood community office where ordinary people, a nurse, a trucker, an older couple and a"
        " young parent with a stroller, chat with a friendly clerk at the counter, smiling, sunlight through the window.",
    "openmodel": "Developers and students at a hackathon in a university hall, laptops open on long tables, excited"
        " faces, pizza boxes and cables, one student pumping a fist.",
    "biolab": "Scientists in lab coats and gloves in a clean, bright biosafety lab: one at a DNA synthesis instrument,"
        " another holding a sample vial up to the light, racks of sample tubes; calm, careful and professional.",
    "discovery": "A researcher and a doctor in a hospital research lab looking with delight at a 3D molecule model on a"
        " screen, pipettes and a petri dish on the bench.",
    "classroom": "A sunny primary-school classroom where children work in small groups with tablets, a teacher kneeling"
        " beside a pupil to help, paper crafts on the walls.",
    "everyday": "A cosy neighbourhood cafe in the morning: people chatting over coffee, a student reading a novel, an"
        " older man talking to an AI assistant on his phone, a barista smiling, a sunny street outside the window.",
    # Economy, science and medicine.
    "jobcentre": "A community college retraining class for adults changing careers: middle-aged former office workers"
        " at workbenches learning a skilled trade from an instructor, focused and hopeful, light from big windows.",
    "powerplant": "Engineers in hard hats walking along a row of new high-voltage transformers and transmission towers"
        " at a power substation that feeds a data centre, wide open sky, morning light.",
    "orbit": "A rocket standing on a coastal launch pad at dawn, venting vapour, and in the foreground a small crowd of"
        " ordinary spectators and engineers on a beach watching, some with binoculars, quiet anticipation.",
    "lagging": "A busy open-air market street in a developing country town, a young shopkeeper showing an older"
        " customer something on a cheap smartphone, motorbikes and fruit stalls, bright midday sun.",
    "materials": "Two materials scientists in a lab holding up a thin new crystal wafer to the light with tweezers,"
        " a furnace and microscope behind them, expressions of quiet delight.",
    "climate": "Climate researchers in field jackets on a wind-swept ridge beside a field of solar panels and wind"
        " turbines, one holding a tablet and another pointing out across the landscape, clouds breaking.",
    "clinic": "In a hospital radiology room, a doctor sits with an older patient and her daughter, showing them a scan"
        " on a monitor, and the patient smiles with relief; warm window light.",
    "trial": "A smiling patient in a hospital day room shaking hands with a nurse and a doctor at the end of a"
        " clinical trial, a family member beside them, flowers on the windowsill.",
    # The final year's lead, one per ending (news.js: end_<outcome>).
    "end_flourish": "Crowds of ordinary people of all ages celebrating in a sunny city park, a father lifting his"
        " daughter onto his shoulders, strangers embracing, picnic blankets and trees; joyful relief.",
    "end_lockin": "A quiet ordinary residential street of small row houses in the late afternoon, a mother walking"
        " home with groceries, and far off on the skyline a cluster of gleaming glass towers catching the sun.",
    "end_misalign": "An empty AI lab at dusk: rows of quiet desks with chairs pushed in, monitors glowing softly with"
        " blurred abstract shapes, one engineer standing alone at the window looking out, contemplative.",
    "end_benevolent": "A tidy garden city in the morning: neighbours tending allotment beds, a child on a bicycle, and"
        " a small modern delivery robot rolling along a clean path between flower beds; calm and orderly.",
    "end_bio": "A quiet city square in the early morning with a few people in surgical masks walking at a distance,"
        " a nurse in scrubs sitting on a bench with a coffee, pigeons; sombre but calm.",
    "end_war": "A school gym hall at night set up with rows of camp beds, volunteers serving soup from a long table"
        " to a queue of families, an older man helping a child with a blanket; tired but caring.",
    "end_pause": "International inspectors and lab engineers shaking hands in a data-centre aisle beside sealed"
        " server racks, smiling, an orderly and cooperative moment.",
    "end_muddle": "An ordinary evening on a city street: commuters walking home under streetlights, a couple talking"
        " outside a corner shop, lights in apartment windows, life going on.",
}


def prompt(key):
    return f"{STYLE}\n\n{NEWS[key]}{RULES}"


def usage_cost(r):
    """USD from the response's token usage at GPT Image 2.5 rates, or None if no usage came back."""
    u = getattr(r, "usage", None)
    if u is None:
        return None, "no usage"
    u = u.model_dump() if hasattr(u, "model_dump") else dict(u)
    det = u.get("input_tokens_details") or {}
    text_in, img_in = det.get("text_tokens", u.get("input_tokens", 0)) or 0, det.get("image_tokens", 0) or 0
    out = u.get("output_tokens", 0) or 0
    return text_in * 5e-6 + img_in * 8e-6 + out * 30e-6, f"in {text_in}+{img_in}, out {out} tokens"


def generate(key, client):
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    try:
        r = client.images.generate(model=MODEL, prompt=prompt(key), size=SIZE, quality=QUALITY, n=1)
        (OUT / f"{key}.png").write_bytes(base64.b64decode(r.data[0].b64_json))
        usd, how = usage_cost(r)
        model = getattr(r, "model", None) or (getattr(r, "model_extra", None) or {}).get("model") or MODEL + " (requested)"
        line = {"key": key, "model": model, "quality": QUALITY, "size": SIZE, "usd": usd, "usage": how, "s": round(time.time() - t0)}
        with open(OUT / "cost.log", "a") as f:
            f.write(json.dumps(line) + "\n")
        return key, f"ok {model} ${usd if usd is None else round(usd, 3)} ({how})", usd or 0.0
    except Exception as e:  # never print the message: it can contain part of a key
        err = (getattr(e, "body", None) or {}) if isinstance(getattr(e, "body", None), dict) else {}
        return key, (f"{type(e).__name__} status={getattr(e, 'status_code', '?')}"
                     f" param={err.get('param')} code={err.get('code')}"), 0.0


def process():
    from PIL import Image, ImageOps
    out = ROOT / "assets" / "news"
    out.mkdir(parents=True, exist_ok=True)
    for key in NEWS:
        png = OUT / f"{key}.png"
        if not png.is_file():
            print(key, "missing")
            continue
        im = ImageOps.grayscale(Image.open(png))
        im = ImageOps.fit(im, (1200, 800), Image.LANCZOS, centering=(0.5, 0.5))
        im.save(out / f"{key}.webp", "WEBP", quality=74, method=6)
        print(key, (out / f"{key}.webp").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    cmd, keys = (sys.argv[1] if len(sys.argv) > 1 else "gen"), sys.argv[2:]
    if cmd == "process":
        process()
        sys.exit()
    from openai import OpenAI
    keys = keys or list(NEWS)
    client = OpenAI(timeout=600)  # reads OPENAI_API_KEY from the environment loaded by gen_card_art
    total = 0.0
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for key, status, usd in ex.map(lambda k: generate(k, client), keys):
            total += usd
            print(key, status, flush=True)
    print(f"{len(keys)} calls, total ${total:.2f}", flush=True)
