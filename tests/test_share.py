"""The page's link-preview and search tags point at real files of the right size."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://rotem-science-game.vercel.app"
PAGE = ROOT / "game" / "index.html"


class HeadTags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self.links, self.title, self._in_title = {}, [], "", False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and ("property" in a or "name" in a):
            self.meta[a.get("property") or a.get("name")] = a.get("content", "")
        elif tag == "link":
            self.links.append(a)
        self._in_title = tag == "title"

    def handle_data(self, data):
        if self._in_title:
            self.title += data

    def handle_endtag(self, tag):
        self._in_title = False


@pytest.fixture(scope="module")
def head():
    parser = HeadTags()
    parser.feed(PAGE.read_text())
    return parser


def site_file(url: str) -> Path:
    assert url.startswith(SITE + "/"), url
    return ROOT / url[len(SITE) + 1:]


def test_page_has_title_and_description(head):
    assert "פרופסור מדעני" in head.title
    assert 70 <= len(head.meta["description"]) <= 170          # what search results show in full


@pytest.mark.parametrize("key", ["og:title", "og:description", "og:image", "og:url", "og:type", "og:locale",
                                 "og:image:alt", "twitter:card", "twitter:image"])
def test_open_graph_tags_are_filled(head, key):
    assert head.meta.get(key, "").strip()


def test_og_image_exists_at_the_size_it_claims(head):
    img = Image.open(site_file(head.meta["og:image"]))
    assert img.size == (int(head.meta["og:image:width"]), int(head.meta["og:image:height"])) == (1200, 630)
    assert img.format == "JPEG"
    assert site_file(head.meta["og:image"]).stat().st_size < 600 * 1024     # WhatsApp skips big images
    assert head.meta["twitter:image"] == head.meta["og:image"]


def test_canonical_and_og_url_agree(head):
    canonical = next(link["href"] for link in head.links if link.get("rel") == "canonical")
    assert canonical == head.meta["og:url"] == f"{SITE}/game/"


def test_icons_exist():
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        assert Image.open(ROOT / "assets" / "share" / name).size == (size, size)
    assert (ROOT / "favicon.ico").exists()


def test_manifest_icons_exist():
    manifest = json.loads((ROOT / "game" / "manifest.webmanifest").read_text())
    assert manifest["start_url"] == "/game/"
    for icon in manifest["icons"]:
        assert (ROOT / icon["src"].lstrip("/")).exists(), icon["src"]


def test_structured_data_parses():
    block = re.search(r'<script type="application/ld\+json">(.*?)</script>', PAGE.read_text(), re.S).group(1)
    data = json.loads(block)
    assert data["@type"] == "VideoGame" and data["inLanguage"] == "he"
    assert site_file(data["image"]).exists()


def test_robots_points_at_sitemap():
    assert f"Sitemap: {SITE}/sitemap.xml" in (ROOT / "robots.txt").read_text()
    assert f"<loc>{SITE}/game/</loc>" in (ROOT / "sitemap.xml").read_text()
