"""Record the professor's lines with ElevenLabs ("Crazy Scientist" voice).

Usage:
    python3 tools/generate_voice.py             # record new and changed lines
    python3 tools/generate_voice.py intro_1     # (re)record specific lines
    python3 tools/generate_voice.py --force     # re-record everything
    python3 tools/generate_voice.py --list      # print every line, record nothing

Reads the API key from the ELEVENLABS_API_KEY environment variable. The lines come
straight from game/levels.js and game/lab.js (evaluated with node), so editing a line there and
re-running this script re-records exactly that line: assets/voice/manifest.json keeps
the text each clip was recorded from.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
LEVELS_JS = ROOT / "game" / "levels.js"
LAB_JS = ROOT / "game" / "lab.js"
VOICE_DIR = ROOT / "assets" / "voice"
MANIFEST = VOICE_DIR / "manifest.json"

VOICE_ID = "X3RFC1XMToVuxnYV8wG8"   # "Crazy Scientist"
MODEL = "eleven_v3"                  # the ElevenLabs model that speaks Hebrew
OUTPUT_FORMAT = "mp3_44100_64"

NOT_NOW = "אבל זה לא מה שצריך עכשיו."   # joins a card fact to the hint, as in Workbench.wrong()


class StructuredLogger:
    """Static message text, dynamic data as keyword parameters."""

    def __init__(self, name: str) -> None:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        self._log = logging.getLogger(name)

    def _emit(self, level: int, message: str, **params) -> None:
        suffix = " ".join(f"{k}={v}" for k, v in params.items())
        self._log.log(level, "%s %s", message, suffix)

    def info(self, message: str, **params) -> None:
        self._emit(logging.INFO, message, **params)

    def error(self, message: str, **params) -> None:
        self._emit(logging.ERROR, message, **params)


logger = StructuredLogger("voice")


# ---------- Lines ----------

@dataclass(frozen=True)
class Line:
    key: str        # file name; the game asks for clips by this key
    text: str       # what appears in the speech bubble
    mood: str = ""  # an eleven_v3 audio tag, e.g. "excited"

    @property
    def speech(self) -> str:
        return speech_text(self.text, self.mood)


def speech_text(text: str, mood: str = "") -> str:
    """Bubble text → something a voice can read aloud."""
    text = re.sub(r"[\U0001F300-\U0001FAFF✓✔]\s*", "", text)          # emoji, check marks
    text = re.sub(r" ← (?=[לו])", " ", text)                           # "את החשמל ← לקול" → "את החשמל לקול"
    text = re.sub(r"(^|[\s:=])(ו?)(\w+) ← (\w+)(?=\s*[(,.]|$)",          # "אור ← חשמל" → "מאור לחשמל"
                  r"\1\2מ\3 ל\4", text)
    text = text.replace(" ← ", ", ואז ")                                 # longer chains: one step after another
    text = re.sub(r"\s+", " ", text).strip()
    return f"[{mood}] {text}" if mood else text


def load_game_data(levels_js: Path = LEVELS_JS, lab_js: Path = LAB_JS) -> dict:
    """Evaluate levels.js and lab.js in node and return {"LEVELS": [...], "CARDS": {...}, "LAB_LINES": {...}}."""
    script = (
        "const vm = require('vm'); const fs = require('fs'); const ctx = {};"
        "const src = process.argv.slice(1).map((f) => fs.readFileSync(f, 'utf8')).join(';\\n');"
        "vm.runInNewContext(src + ';this.out = {LEVELS, CARDS, LAB_LINES};', ctx);"
        "process.stdout.write(JSON.stringify(ctx.out));"
    )
    out = subprocess.run(["node", "-e", script, str(levels_js), str(lab_js)], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def collect_lines(data: dict) -> list[Line]:
    """Every line the professor says, keyed the way game/game.js and game/lab.js ask for them."""
    lines = [Line("not_now", NOT_NOW)]
    lines += [Line(key, text, "excited") for key, text in data.get("LAB_LINES", {}).items()]
    lines += [Line(f"fact_{key}", card["fact"]) for key, card in data["CARDS"].items()]
    for level in data["LEVELS"]:
        n = level["id"]
        lines.append(Line(f"intro_{n}", level["intro"], "excited"))
        for i, step in enumerate(level["steps"]):
            lines.append(Line(f"good_{n}_{i}", step["good"], "excited"))
            lines.append(Line(f"need_{n}_{i}", step["need"], "curious"))
        lines.append(Line(f"lever_{n}", level["leverLine"], "excited"))
        for i, q in enumerate(level["quiz"]):
            lines.append(Line(f"prompt_{n}_{i}", q["prompt"], "curious"))
            lines.append(Line(f"explain_{n}_{i}", q["explain"]))
    return lines


# ---------- Text-to-speech backends (Strategy) ----------

class Voice(ABC):
    @abstractmethod
    def speak(self, text: str) -> bytes: ...


class ElevenLabsVoice(Voice):
    def __init__(self, api_key: str, voice_id: str = VOICE_ID, model: str = MODEL, retries: int = 3) -> None:
        self.url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format={OUTPUT_FORMAT}"
        self.headers = {"xi-api-key": api_key, "Content-Type": "application/json"}
        self.model = model
        self.retries = retries

    def speak(self, text: str) -> bytes:
        body = {"text": text, "model_id": self.model, "language_code": "he"}
        for attempt in range(1, self.retries + 1):
            resp = requests.post(self.url, headers=self.headers, json=body, timeout=120)
            if resp.ok:
                return resp.content
            if resp.status_code not in (429, 500, 502, 503) or attempt == self.retries:
                raise RuntimeError(f"ElevenLabs {resp.status_code}: {resp.text[:300]}")
            logger.info("retrying after error", status=resp.status_code, attempt=attempt)
            time.sleep(2 ** attempt)
        raise AssertionError("unreachable")


# ---------- Recording ----------

class Recorder:
    """Records lines whose speech text changed since the last run (or all, with force)."""

    def __init__(self, voice: Voice, out_dir: Path = VOICE_DIR) -> None:
        self.voice = voice
        self.out_dir = out_dir
        self.manifest_path = out_dir / "manifest.json"
        try:
            self.manifest: dict[str, str] = json.loads(self.manifest_path.read_text("utf-8"))
        except FileNotFoundError:
            self.manifest = {}

    def stale(self, line: Line) -> bool:
        return self.manifest.get(line.key) != line.speech or not (self.out_dir / f"{line.key}.mp3").exists()

    def record(self, lines: list[Line], force: bool = False) -> list[str]:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        done = []
        for line in lines:
            if not force and not self.stale(line):
                continue
            try:
                audio = self.voice.speak(line.speech)
            except Exception as exc:  # keep going: one bad line shouldn't lose the rest
                logger.error("recording failed", key=line.key, error=exc)
                continue
            (self.out_dir / f"{line.key}.mp3").write_bytes(audio)
            self.manifest[line.key] = line.speech
            self.save()
            logger.info("recorded line", key=line.key, kb=len(audio) // 1024)
            done.append(line.key)
        return done

    def save(self) -> None:
        self.manifest_path.write_text(json.dumps(self.manifest, ensure_ascii=False, indent=1, sort_keys=True) + "\n", "utf-8")


def main(argv: list[str]) -> int:
    lines = collect_lines(load_game_data())
    names = [a for a in argv if not a.startswith("--")]
    if "--list" in argv:
        for line in lines:
            print(f"{line.key}\t{line.speech}")
        return 0
    if names:
        unknown = set(names) - {l.key for l in lines}
        if unknown:
            logger.error("unknown line keys", keys=",".join(sorted(unknown)))
            return 1
        lines = [l for l in lines if l.key in names]
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        logger.error("missing environment variable", name="ELEVENLABS_API_KEY")
        return 1
    done = Recorder(ElevenLabsVoice(api_key)).record(lines, force="--force" in argv or bool(names))
    logger.info("finished", recorded=len(done), total=len(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
