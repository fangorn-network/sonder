import argparse
import base64
import json
import os
import re
import sys
import time
import random
from difflib import get_close_matches
import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# 1. CONFIG
# ---------------------------------------------------------------------------
KWORB_PAGES = [
    "https://kworb.net/spotify/listeners.html",
    "https://kworb.net/spotify/listeners2.html",
    "https://kworb.net/spotify/listeners3.html",
    "https://kworb.net/spotify/listeners4.html",
]

ARTIST_HREF_RE = re.compile(r"artist/([A-Za-z0-9]+)_songs\.html")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_BASE = "https://api.spotify.com/v1"
LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/"

LASTFM_BLOCKLIST = {"pop", "britpop", "kpop", "hip-hop", "hiphop", "reggae", "country", "folk", "funk", "r&b", "soul", "dance", "indie", "gospel"}
GENRE_PARENTS = {"Death Metal": "Metal", "Heavy Metal": "Metal", "Black Metal": "Metal", "Hard Rock": "Rock", "Alternative Rock": "Rock", "Techno": "Electronic", "House": "Electronic"}

# ---------------------------------------------------------------------------
# 2. LOGIC
# ---------------------------------------------------------------------------
class GenreMapper:
    def __init__(self, blocklist, parents):
        self.blocklist = {b.lower() for b in blocklist}
        self.parents = parents
        self.valid_genres = sorted(list(set(parents.keys()) | set(parents.values())))

    def clean_and_map(self, tags):
        cleaned = []
        for tag in tags:
            t = tag.lower().strip()
            if any(blocked in t for blocked in self.blocklist): continue
            match = next((g for g in self.valid_genres if g.lower() == t), None)
            if match:
                cleaned.append(match)
                continue
            fuz = get_close_matches(t, [g.lower() for g in self.valid_genres], n=1, cutoff=0.9)
            if fuz:
                match = next(g for g in self.valid_genres if g.lower() == fuz[0])
                cleaned.append(match)
        return sorted(list(set(cleaned)))

    def get_inheritance(self, genres):
        inherited = set(genres)
        for g in genres:
            if parent := self.parents.get(g): inherited.add(parent)
        return sorted(list(inherited))

class MusicAPI:
    def __init__(self, client_id, client_secret, lfm_key):
        self.lfm_key = lfm_key
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        try:
            resp = self.session.post(SPOTIFY_TOKEN_URL, data={"grant_type": "client_credentials"},
                                     headers={"Authorization": f"Basic {auth}"}, timeout=15)
            self.token = resp.json().get("access_token")
        except: sys.exit("Failed to Auth.")

    def get_sp(self, endpoint):
        for _ in range(3):
            try:
                r = self.session.get(f"{SPOTIFY_BASE}/{endpoint}", headers={"Authorization": f"Bearer {self.token}"}, timeout=25)
                if r.status_code == 200: return r.json()
                if r.status_code == 429:
                    wait = int(r.headers.get("Retry-After", 30))
                    print(f"Rate Limited! Sleeping {wait}s...")
                    time.sleep(wait)
                    continue
            except: pass
            time.sleep(2)
        return {}

    def get_lfm_tags(self, artist, track=None):
        params = {"api_key": self.lfm_key, "format": "json", "artist": artist, "method": "track.getTopTags" if track else "artist.getTopTags"}
        if track: params["track"] = track
        try:
            r = self.session.get(LASTFM_BASE, params=params, timeout=15)
            tags = r.json().get("toptags", {}).get("tag", [])
            return [t["name"] for t in (tags if isinstance(tags, list) else [tags])]
        except: return []

# ---------------------------------------------------------------------------
# 3. MAIN
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-rank", type=int, default=100)
    parser.add_argument("--min-rank", type=int, default=1)
    parser.add_argument("--out", default="corpus.json")
    args = parser.parse_args()

    api = MusicAPI(os.getenv("SPOTIFY_CLIENT_ID"), os.getenv("SPOTIFY_CLIENT_SECRET"), os.getenv("LASTFM_API_KEY"))
    mapper = GenreMapper(LASTFM_BLOCKLIST, GENRE_PARENTS)
    
    global_rank = 0
    first_entry = True

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("[\n")
        try:
            for page_url in KWORB_PAGES:
                print(f"Checking page: {page_url}")
                soup = BeautifulSoup(api.session.get(page_url, timeout=20).text, "html.parser")
                
                for row in soup.find_all("tr")[1:]:
                    link = row.find("a", href=ARTIST_HREF_RE)
                    if not link: continue
                    global_rank += 1
                    if global_rank < args.min_rank: continue
                    if global_rank > args.max_rank: break

                    artist_id = ARTIST_HREF_RE.search(link["href"]).group(1)
                    artist_name = link.text.strip()

                    sp_artist = api.get_sp(f"artists/{artist_id}")
                    if not sp_artist: continue

                    base_genres = mapper.clean_and_map(sp_artist.get("genres", []) + api.get_lfm_tags(artist_name))
                    if not base_genres: continue

                    print(f"#{global_rank}: Processing {artist_name}")
                    tracks = api.get_sp(f"artists/{artist_id}/top-tracks?market=US").get("tracks", [])[:5]
                    
                    for t in tracks:
                        entry = {"name": t["id"], "fields": {
                            "title": t["name"], "artist": artist_name, "rank": global_rank,
                            "genres": mapper.get_inheritance(base_genres),
                            "duration_ms": t["duration_ms"], "spotify_track_id": t["id"]
                        }}
                        if not first_entry: f.write(",\n")
                        json.dump(entry, f, indent=4); f.flush()
                        first_entry = False
                    
                    time.sleep(random.uniform(1.5, 3.0)) # The "Don't Ban Me" Sleep
                if global_rank >= args.max_rank: break
        finally:
            f.write("\n]")

if __name__ == "__main__":
    main()