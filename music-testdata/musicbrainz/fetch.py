"""Fetch a minimal music corpus from the MusicBrainz Web Service.

  python fetch.py > raw.json

MB rate limit is 1 req/sec; one artist = one request. Default list takes ~10s.
Each track: mbid, title, artist, year.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request

ARTISTS = [
    "Bob Marley & The Wailers",
    "Khruangbin",
    "Aphex Twin",
    "Burial",
    "Frank Ocean",
    "Radiohead",
    "Madlib",
    "Mac DeMarco",
    "System of a Down",
    "Korn",
    "Justin Bieber",
    "Paramore",
    "Demi Lovato"
]

UA = "Fangorn-Curator-Experiment/0.1 ( driemworks@fangorn.network )"
BASE = "https://musicbrainz.org/ws/2"


def fetch(path: str, params: dict) -> dict:
    qs = urllib.parse.urlencode({**params, "fmt": "json"})
    req = urllib.request.Request(f"{BASE}/{path}?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def recordings_for(artist: str, limit: int = 10) -> list[dict]:
    data = fetch("recording", {"query": f'artist:"{artist}"', "limit": limit})
    out = []
    for r in data.get("recordings", []):
        ac = r.get("artist-credit") or [{}]
        artist_name = ac[0].get("name") or artist
        year_str = (r.get("first-release-date") or "")[:4]
        year = int(year_str) if year_str.isdigit() else 0
        out.append({
            "mbid": r["id"],
            "title": r["title"],
            "artist": artist_name,
            "year": year,
        })
    print(f"  {artist}: {len(out)} recordings", file=sys.stderr)
    return out

def main() -> None:
    corpus: list[dict] = []
    for a in ARTISTS:
        try:
            corpus.extend(recordings_for(a))
        except Exception as e:
            print(f"# {a}: {e}", file=sys.stderr)
        time.sleep(1.1)  # respect rate limit
    json.dump(corpus, sys.stdout, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()