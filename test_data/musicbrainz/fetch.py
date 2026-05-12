import argparse
import hashlib
import json
import os
import re
import time
import requests
from bs4 import BeautifulSoup
import musicbrainzngs

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

KWORB_URL = "https://kworb.net/spotify/listeners.html"
ARTIST_HREF_RE = re.compile(r"artist/([A-Za-z0-9]+)(_songs)?\.html")
USER_AGENT = "MusicIngestor/2.0"
LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/"
SCHEMA_VERSION = 1

musicbrainzngs.set_useragent("MusicIngestor", "2.0", "https://example.com")

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def track_id(artist: str, title: str) -> str:
    return hashlib.sha256(f"{artist}:{title}".encode()).hexdigest()[:24]

# ---------------------------------------------------------------------------
# LAST.FM
# ---------------------------------------------------------------------------

class LastFM:
    def __init__(self, key: str):
        self.key = key
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def call(self, params: dict) -> dict:
        params["api_key"] = self.key
        params["format"] = "json"
        try:
            return self.session.get(LASTFM_BASE, params=params, timeout=20).json()
        except Exception:
            return {}

    def top_tracks(self, artist: str, limit: int = 8) -> list[dict]:
        data = self.call({"method": "artist.getTopTracks", "artist": artist, "limit": limit})
        return data.get("toptracks", {}).get("track", [])

    def track_info(self, artist: str, track: str) -> dict:
        data = self.call({"method": "track.getInfo", "artist": artist, "track": track})
        return data.get("track", {})

# ---------------------------------------------------------------------------
# MUSICBRAINZ ENRICHMENT
# ---------------------------------------------------------------------------

def mb_enrich(artist: str, title: str) -> dict:
    result = {"isrcCode": None, "datePublished": None, "contributors": None}
    try:
        search = musicbrainzngs.search_recordings(
            recording=title, artist=artist, limit=1
        )
        recordings = search.get("recording-list", [])
        if not recordings:
            return result

        rec = recordings[0]
        rec_id = rec["id"]

        full = musicbrainzngs.get_recording_by_id(
            rec_id, includes=["isrcs", "artist-credits", "releases"]
        ).get("recording", {})

        isrcs = full.get("isrc-list", [])
        result["isrcCode"] = isrcs[0] if isrcs else None

        releases = full.get("release-list", [])
        dates = [r.get("date") for r in releases if r.get("date")]
        result["datePublished"] = min(dates) if dates else None

        credits = full.get("artist-credit", [])
        contributors = []
        for credit in credits:
            if isinstance(credit, dict) and "artist" in credit:
                contributors.append({
                    "role": "artist",
                    "name": credit["artist"].get("name"),
                    "id": credit["artist"].get("id")
                })
        result["contributors"] = contributors or None

    except Exception as e:
        print(f"    [MB] failed for {artist} - {title}: {e}")

    return result

# ---------------------------------------------------------------------------
# KWORB SCRAPE
# ---------------------------------------------------------------------------

def scrape_artists(min_rank: int, max_rank: int) -> list[str]:
    html = requests.get(KWORB_URL, timeout=20).text
    soup = BeautifulSoup(html, "html.parser")
    artists = []
    rank = 0
    for row in soup.find_all("tr")[1:]:
        link = row.find("a", href=ARTIST_HREF_RE)
        if not link:
            continue
        rank += 1
        if rank < min_rank:
            continue
        if rank > max_rank:
            break
        artists.append(link.text.strip())
    return artists

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-rank", type=int, default=1)
    parser.add_argument("--max-rank", type=int, default=50)
    parser.add_argument("--tracks-per-artist", type=int, default=8)
    parser.add_argument("--no-mb", action="store_true", help="Skip MusicBrainz enrichment")
    parser.add_argument("--out", default="core.json")
    args = parser.parse_args()

    api_key = os.getenv("LASTFM_API_KEY")
    if not api_key:
        print("Error: LASTFM_API_KEY environment variable not set.")
        return

    lfm = LastFM(api_key)
    results = []
    seen = set()

    artists = scrape_artists(args.min_rank, args.max_rank)
    print(f"Fetched {len(artists)} artists from Kworb")

    for artist in artists:
        print(f"\n{artist}")
        tracks = lfm.top_tracks(artist, limit=args.tracks_per_artist)

        for t in tracks:
            title = t["name"]
            tid = track_id(artist, title)

            if tid in seen:
                continue
            seen.add(tid)

            info = lfm.track_info(artist, title)
            duration_ms = int(info.get("duration") or 0) or None

            entry = {
                "name": tid,
                "fields": {
                    "schemaVersion": SCHEMA_VERSION,
                    "trackId": tid,
                    "isrcCode": None,
                    "title": title,
                    "byArtist": artist,
                    "datePublished": None,
                    "durationMs": duration_ms,
                    "contributors": None,
                },
            }

            if not args.no_mb:
                enriched = mb_enrich(artist, title)
                # Correctly update the nested 'fields' dictionary
                entry["fields"].update(enriched)
                time.sleep(0.5)

            results.append(entry)
            
            # --- WRITE TO FILE AFTER EACH TRACK ---
            with open(args.out, "w") as f:
                json.dump(results, f, indent=2)
            
            print(f"  {title} | saved to {args.out}")
            time.sleep(0.12)

    print(f"\nDone — {len(results)} tracks total.")

if __name__ == "__main__":
    main()