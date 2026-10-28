"""Generate and process the pencil story pictures for the campaign's year-end front page.

Uses the card art's style, model and pipeline (scripts/gen_card_art.py: STYLE, LAYOUT, HOPE,
ROBOTS, MODEL, SIZE; the key is loaded there from .env inside this process and never printed)
and the card art's processing (scripts/process_card_art.py's band trimming, a focus-centred
crop, LANCZOS resize and WebP quality 72), but crops to 2:1 (1200x600), the shape the paper's
photos use. One picture per story kind; news.js maps each headline template to one (`img`).
No real people, no text, no logos.

Usage:
  python3 scripts/gen_news_art.py gen [key ...]   # raw PNGs into NEWS_ART_OUT (default /tmp/claude-501/newsart)
  python3 scripts/gen_news_art.py process         # PNGs -> assets/news/<key>.webp
Each call's cost estimate is logged from the response's token usage (gpt-image-1 high rates),
or a flat per-image estimate when the response has no usage.
"""
import base64
import concurrent.futures as cf
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_card_art import HOPE, LAYOUT, MODEL, ROBOTS, SIZE, STYLE  # noqa: E402  (loads .env in-process)

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("NEWS_ART_OUT", "/tmp/claude-501/newsart"))
NEWS_STYLE = STYLE.replace("the text on the card", "a short newspaper story")
PEOPLE = " Ordinary people in everyday roles; no real, recognizable people. No logos, signs, labels or writing anywhere."

# key: (section, story, what to depict, focal height 0..1 for the crop)
NEWS = {
    "research": ("Science", "AI now speeds up its own research",
        "A small team of researchers in a bright, airy lab office watching with quiet amazement as rows of monitors"
        " show AI agents running experiments on their own: plots and abstract charts on the screens, notebooks and"
        " coffee cups on the desks, morning light through tall windows.", 0.45),
    "expert": ("Science", "AI now rivals the best human experts",
        "A senior scientist and a younger colleague in a university research library, leaning in with curiosity"
        " toward a large screen showing abstract graphs and a molecular diagram that an AI produced, books and"
        " papers stacked around them, warm daylight.", 0.42),
    "superintelligence": ("Frontier", "The most capable AI yet comes online",
        "A vast, calm data centre at dawn seen from a grassy hill, long low halls with soft lights, and on the hill"
        " a few engineers and a family watching the sunrise over it together, a sense of a new era beginning,"
        " quiet and hopeful.", 0.50),
    "datacentre": ("Compute", "New data centres come online",
        "A huge new data-centre campus under construction on open plains at sunrise: long low server halls,"
        " cooling units, power lines, tall cranes, and workers in hard hats and safety vests walking between the"
        " halls beside a pickup truck.", 0.50),
    "idle": ("Compute", "Labs hold their frontier models still",
        "A quiet, half-lit data-centre hall with long rows of server racks, most of their lights dimmed, and a"
        " single technician walking down the aisle with a tablet, calm and orderly, soft light from a high window.",
        0.50),
    "safetylab": ("Safety", "Safety teams report progress",
        "A diverse AI safety research team gathered around a large monitor that shows a glowing diagram of a neural"
        " network with a few highlighted pathways, one researcher pointing, the others nodding, plants and daylight"
        " in a bright modern lab.", 0.45),
    "testscare": ("Safety", "A model misbehaves in a safety test",
        "Two safety researchers in a test lab in the evening, leaning toward a monitor, one raising a hand to pause"
        " the test; behind a glass wall, a single isolated server rack with one small warning light. They have"
        " caught the problem in time: focused and calm, not panicked.", 0.45),
    "talks": ("Diplomacy", "Envoys open new talks on AI",
        "American and Chinese diplomats seated across a long negotiating table in a tall, light-filled hall,"
        " interpreters with headsets, water glasses and folders, two delegates at the centre reaching to shake"
        " hands, small plain table flags.", 0.45),
    "inspectors": ("Verification", "Inspectors check the agreed limits",
        "International inspectors in plain jackets with tablets and handheld scanners walking down a data-centre"
        " aisle with a lab engineer, checking sealed tags on server racks, orderly, cooperative and calm.", 0.48),
    "collapse": ("Diplomacy", "Talks break down",
        "An empty negotiating table late in the evening after talks ended: scattered papers, pushed-back chairs,"
        " cooling cups of tea, and one diplomat standing at a tall window looking out at the city lights,"
        " thoughtful rather than despairing.", 0.45),
    "warroom": ("Security", "Military planners watch the AI race",
        "Military analysts and a civilian diplomat in a calm operations room studying satellite photographs of a"
        " large data-centre complex on wall screens, a general and the diplomat conferring quietly over a table"
        " map.", 0.45),
    "chinalab": ("China", "China's labs close in",
        "Young Chinese engineers in a modern open-plan office celebrating a result around a large monitor, high-fives"
        " and smiles, a skyline of tall towers through the windows, bright daytime.", 0.45),
    "uslab": ("Industry", "US labs push ahead",
        "A modern American AI lab campus on a sunny day: a glass building, engineers walking and talking along a"
        " courtyard path with laptops and coffee, a large server building with cooling units behind, palm trees.",
        0.48),
    "markets": ("Markets", "AI stocks and the money behind them",
        "A busy trading floor in the morning, traders watching rows of screens with rising line charts and candles,"
        " some on phones, one leaning back thoughtfully, light from tall windows.", 0.45),
    "jobs": ("Work", "Offices adjust to AI",
        "An open-plan office where ordinary office workers collaborate with AI assistants on their screens, one"
        " worker showing a colleague how it works, and through a glass wall a small retraining class with an"
        " instructor at a blank whiteboard; ordinary and warm.", 0.47),
    "delegation": ("Business", "AI now makes more of the decisions",
        "A modern office where large screens show streams of decisions an AI has prepared as abstract cards and"
        " graphs; a manager at a standing desk approves them one after another with a tap, colleagues working"
        " nearby, ordinary daylight, a slightly too-smooth calm.", 0.45),
    "hearing": ("Policy", "Lawmakers act on AI",
        "A legislative hearing room: lawmakers on a raised wooden dais listening closely, a witness table of expert"
        " witnesses with microphones, staff seated behind, press photographers at the side; no name plates.", 0.42),
    "protest": ("Society", "Public trust in AI governance slips",
        "A peaceful crowd of ordinary citizens of all ages at a town-square rally holding blank placards, a speaker"
        " on a small stage with a microphone, police calmly standing by, autumn trees; earnest, not violent.", 0.48),
    "townhall": ("Society", "Confidence in AI oversight recovers",
        "A community town-hall meeting in a warm wooden hall: residents raising hands and asking questions, officials"
        " at a table listening and answering, a mix of ages, attentive and good-humoured.", 0.45),
    "fund": ("Markets", "A public stake in AI",
        "A bright neighbourhood community office where ordinary people (a nurse, a trucker, an older couple, a young"
        " parent with a stroller) collect their dividend letters from a friendly clerk, smiling and chatting,"
        " sunlight through the front window.", 0.47),
    "openmodel": ("Open models", "A free AI model anyone can download",
        "Developers and students at a hackathon in a university hall, laptops open, a big projected progress bar"
        " filling up as a model downloads, excited faces, pizza boxes and cables on long tables.", 0.48),
    "biolab": ("Health", "Biosecurity and pandemic defences",
        "Scientists in lab coats and gloves in a clean, bright biosafety lab: one at a DNA synthesis machine, another"
        " holding a sample vial up to the light, racks of sample tubes and a screening workstation; calm,"
        " careful and professional.", 0.45),
    "discovery": ("Science", "AI helps a scientific discovery",
        "A researcher and a doctor in a hospital research lab looking with delight at a large 3D molecule model on a"
        " screen, a petri dish and pipettes on the bench, and in the background a nurse talking with a smiling"
        " clinical-trial patient.", 0.45),
    "classroom": ("Education", "Schools turn to AI tutors",
        "A sunny primary-school classroom where children work in small groups with tablets showing friendly"
        " cartoon-like AI tutor faces, a teacher kneeling beside a pupil to help, paper crafts on the walls.", 0.5),
    "everyday": ("Life", "Everyday life with AI",
        "A cosy neighbourhood cafe in the morning: people chatting over coffee, a student reading a novel, an older"
        " man talking to an AI assistant on his phone, a barista smiling, and a small modern delivery robot rolling"
        " past outside the window on a sunny street.", 0.48),
}

# gpt-image-1 rates (USD per token), used as the estimate; a flat fallback when no usage is returned.
RATE_TEXT_IN, RATE_IMAGE_IN, RATE_IMAGE_OUT, FLAT = 5e-6, 10e-6, 40e-6, 0.25


def prompt(key):
    section, story, depict, _ = NEWS[key]
    p = f"{NEWS_STYLE}\n\nCreate an image for a newspaper story:\n{section}\n\n{story}\n\n{depict}{PEOPLE}{LAYOUT}{HOPE}"
    if "robot" in depict:
        p += ROBOTS
    return p


def cost(r):
    u = getattr(r, "usage", None) or (getattr(r, "model_extra", None) or {}).get("usage")
    if not u:
        return FLAT, "flat"
    get = (lambda k: u.get(k)) if isinstance(u, dict) else (lambda k: getattr(u, k, None))
    det = get("input_tokens_details") or {}
    det_get = (lambda k: det.get(k)) if isinstance(det, dict) else (lambda k: getattr(det, k, None))
    text_in, img_in = det_get("text_tokens") or get("input_tokens") or 0, det_get("image_tokens") or 0
    out = get("output_tokens") or 0
    return text_in * RATE_TEXT_IN + img_in * RATE_IMAGE_IN + out * RATE_IMAGE_OUT, f"in {text_in}+{img_in}, out {out} tokens"


def generate(key, client):
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        r = client.images.generate(model=MODEL, prompt=prompt(key), size=SIZE, quality="high", n=1)
        (OUT / f"{key}.png").write_bytes(base64.b64decode(r.data[0].b64_json))
        usd, how = cost(r)
        return key, f"ok, est. ${usd:.3f} ({how})", usd
    except Exception as e:  # never print the message: it can contain part of a key
        err = (getattr(e, "body", None) or {}) if isinstance(getattr(e, "body", None), dict) else {}
        return key, (f"{type(e).__name__} status={getattr(e, 'status_code', '?')}"
                     f" param={err.get('param')} code={err.get('code')}"), 0.0


def process():
    from PIL import Image
    # trim_bands from process_card_art.py, without running that script's own pass.
    src = (ROOT / "scripts" / "process_card_art.py").read_text()
    ns = {}
    exec(src[src.index("def trim_bands"):src.index("\nSPLIT_IDS =")], {"Image": Image}, ns)
    trim_bands = ns["trim_bands"]
    out = ROOT / "assets" / "news"
    out.mkdir(parents=True, exist_ok=True)
    for key, (*_, focus) in NEWS.items():
        png = OUT / f"{key}.png"
        if not png.is_file():
            print(key, "missing")
            continue
        im, t0, frac = trim_bands(Image.open(png).convert("RGB"))
        w, h = im.size
        fy = min(max((focus - t0) / frac, 0), 1)
        cw, ch = w, round(w / 2)
        if ch > h:
            cw, ch = round(h * 2), h
        left, top = (w - cw) // 2, min(max(round(fy * h - ch / 2), 0), h - ch)
        im.crop((left, top, left + cw, top + ch)).resize((1200, 600), Image.LANCZOS).save(
            out / f"{key}.webp", "WEBP", quality=72, method=6)
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
    print(f"{len(keys)} calls, est. total ${total:.2f}", flush=True)
