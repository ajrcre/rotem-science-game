import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import generate_voice as gv  # noqa: E402

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to read levels.js")


@pytest.mark.parametrize("text, spoken", [
    ("🤔 נכון! 🎉", "נכון!"),
    ("תא סולרי הוא ממיר: אור ← חשמל.", "תא סולרי הוא ממיר: מאור לחשמל."),
    ("כימית ← חשמלית (בסוללה), וחשמלית ← קול (ברמקול).", "מכימית לחשמלית (בסוללה), ומחשמלית לקול (ברמקול)."),
    ("ממיר את החשמל ← לאנרגיית קול.", "ממיר את החשמל לאנרגיית קול."),
    ("השמש היא המקור ← היא שולחת אור ← התא ממיר אותו.", "השמש היא המקור, ואז היא שולחת אור, ואז התא ממיר אותו."),
])
def test_speech_text(text, spoken):
    assert gv.speech_text(text) == spoken


def test_mood_becomes_an_audio_tag():
    assert gv.Line("k", "יש!", "excited").speech == "[excited] יש!"


class FakeVoice(gv.Voice):
    def __init__(self):
        self.calls = []

    def speak(self, text):
        self.calls.append(text)
        return b"mp3:" + text.encode()


def test_recorder_records_only_new_or_changed_lines(tmp_path):
    voice = FakeVoice()
    lines = [gv.Line("a", "אחת"), gv.Line("b", "שתיים")]
    assert gv.Recorder(voice, tmp_path).record(lines) == ["a", "b"]
    assert (tmp_path / "a.mp3").read_bytes() == "mp3:אחת".encode()

    changed = [gv.Line("a", "אחת"), gv.Line("b", "שלוש")]
    assert gv.Recorder(voice, tmp_path).record(changed) == ["b"]          # manifest survives a restart
    assert gv.Recorder(voice, tmp_path).record(changed, force=True) == ["a", "b"]
    assert len(voice.calls) == 5


@needs_node
def test_every_key_the_game_asks_for_is_a_line():
    lines = gv.collect_lines(gv.load_game_data())
    keys = {line.key for line in lines}
    assert len(keys) == len(lines)
    data = gv.load_game_data()
    for level in data["LEVELS"]:
        n = level["id"]
        assert {f"intro_{n}", f"lever_{n}", f"good_{n}_0", f"need_{n}_0", f"prompt_{n}_0", f"explain_{n}_0"} <= keys
    assert {f"fact_{k}" for k in data["CARDS"]} | {"not_now"} <= keys
    game = (ROOT / "mockup" / "game.js").read_text()
    for prefix in ("intro_", "good_", "need_", "fact_", "lever_", "prompt_", "explain_", "not_now"):
        assert prefix in game


@needs_node
def test_not_now_matches_the_bubble_text():
    assert gv.NOT_NOW in (ROOT / "mockup" / "game.js").read_text()
