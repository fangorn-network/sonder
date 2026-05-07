"""Fetch a minimal music corpus with standardized ID3v2 genre labels.

Usage:
    python fetch.py --max-rank 100 > raw.json
"""
from __future__ import annotations
import argparse
import csv
import re
import json
import sys
import time
import urllib.parse
import urllib.request
from difflib import get_close_matches

import requests
from bs4 import BeautifulSoup

# --- 1. CONFIG & TAXONOMY ---

PAGES = [
    "https://kworb.net/spotify/listeners.html",
    "https://kworb.net/spotify/listeners2.html",
    "https://kworb.net/spotify/listeners3.html",
    "https://kworb.net/spotify/listeners4.html",
]

ARTIST_HREF_RE = re.compile(r"/spotify/artist/([A-Za-z0-9]+)_songs\.html")
USER_AGENT = "Mozilla/5.0 (compatible; spotify-top-scraper/1.0; research/test-data)"
UA_MB = "Fangorn-Curator-Experiment/0.1 ( driemworks@fangorn.network )"
BASE_MB = "https://musicbrainz.org/ws/2"

ID3_GENRES = {
    0: "Blues", 1: "Classic Rock", 2: "Country", 3: "Dance", 4: "Disco", 5: "Funk", 
    6: "Grunge", 7: "Hip-Hop", 8: "Jazz", 9: "Metal", 10: "New Age", 11: "Oldies", 
    12: "Other", 13: "Pop", 14: "R&B", 15: "Rap", 16: "Reggae", 17: "Rock", 
    18: "Techno", 19: "Industrial", 20: "Alternative", 21: "Ska", 22: "Death Metal", 
    23: "Pranks", 24: "Soundtrack", 25: "Euro-Techno", 26: "Ambient", 27: "Trip-Hop", 
    28: "Vocal", 29: "Jazz+Funk", 30: "Fusion", 31: "Trance", 32: "Classical", 
    33: "Instrumental", 34: "Acid", 35: "House", 36: "Game", 37: "Sound Clip", 
    38: "Gospel", 39: "Noise", 40: "AlternRock", 41: "Bass", 42: "Soul", 43: "Punk", 
    44: "Space", 45: "Meditative", 46: "Instrumental Pop", 47: "Instrumental Rock", 
    48: "Ethnic", 49: "Gothic", 50: "Darkwave", 51: "Techno-Industrial", 52: "Electronic", 
    53: "Pop-Folk", 54: "Eurodance", 55: "Dream", 56: "Southern Rock", 57: "Comedy", 
    58: "Cult", 59: "Gangsta Rap", 60: "Top 40", 61: "Christian Rap", 62: "Pop / Funk", 
    63: "Jungle", 64: "Native American", 65: "Cabaret", 66: "New Wave", 67: "Psychedelic", 
    68: "Rave", 69: "Showtunes", 70: "Trailer", 71: "Lo-Fi", 72: "Tribal", 73: "Acid Punk", 
    74: "Acid Jazz", 75: "Polka", 76: "Retro", 77: "Musical", 78: "Rock & Roll", 
    79: "Hard Rock", 80: "Folk", 81: "Folk-Rock", 82: "National Folk", 83: "Swing", 
    84: "Fast Fusion", 85: "Bebob", 86: "Latin", 87: "Revival", 88: "Celtic", 
    89: "Bluegrass", 90: "Avantgarde", 91: "Gothic Rock", 92: "Progressive Rock", 
    93: "Psychedelic Rock", 94: "Symphonic Rock", 95: "Slow Rock", 96: "Big Band", 
    97: "Chorus", 98: "Easy Listening", 99: "Acoustic", 100: "Humour", 101: "Speech", 
    102: "Chanson", 103: "Opera", 104: "Chamber Music", 105: "Sonata", 106: "Symphony", 
    107: "Booty Bass", 108: "Primus", 109: "Porn Groove", 110: "Satire", 111: "Slow Jam", 
    112: "Club", 113: "Tango", 114: "Samba", 115: "Folklore", 116: "Ballad", 
    117: "Power Ballad", 118: "Rhythmic Soul", 119: "Freestyle", 120: "Duet", 
    121: "Punk Rock", 122: "Drum Solo", 123: "A Cappella", 124: "Euro-House", 
    125: "Dance Hall", 126: "Goa", 127: "Drum & Bass", 128: "Club-House", 
    129: "Hardcore", 130: "Terror", 131: "Indie", 132: "BritPop", 133: "Negerpunk", 
    134: "Polsk Punk", 135: "Beat", 136: "Christian Gangsta Rap", 137: "Heavy Metal", 
    138: "Black Metal", 139: "Crossover", 140: "Contemporary Christian", 
    141: "Christian Rock", 142: "Merengue", 143: "Salsa", 144: "Thrash Metal", 
    145: "Anime", 146: "JPop", 147: "Synthpop", 148: "Abstract", 149: "Art Rock", 
    150: "Baroque", 151: "Bhangra", 152: "Big Beat", 153: "Breakbeat", 154: "Chillout", 
    155: "Downtempo", 156: "Dub", 157: "EBM", 158: "Eclectic", 159: "Electro", 
    160: "Electroclash", 161: "Emo", 162: "Experimental", 163: "Garage", 164: "Global", 
    165: "IDM", 166: "Illbient", 167: "Industro-Goth", 168: "Jam Band", 169: "Krautrock", 
    170: "Leftfield", 171: "Lounge", 172: "Math Rock", 173: "New Romantic", 
    174: "Nu-Breakz", 175: "Post-Punk", 176: "Post-Rock", 177: "Psytrance", 
    178: "Shoegaze", 179: "Space Rock", 180: "Trop Rock", 181: "World Music", 
    182: "Neoclassical", 183: "Audiobook", 184: "Audio theatre", 185: "Neue Deutsche Welle", 
    186: "Podcast", 187: "Indie Rock", 188: "G-Funk", 189: "Dubstep", 190: "Garage Rock", 
    191: "Psybient"
}

# --- 2. UTILITIES ---

class GenreMapper:
    def __init__(self):
        self.genre_list = list(ID3_GENRES.values())
        self.lower_map = {v.lower(): v for v in self.genre_list}

    def map_tags(self, tags: list[str]) -> list[str]:
        standardized = set()
        for tag in tags:
            tag_clean = tag.lower().strip()
            
            # 1. Exact Match
            if tag_clean in self.lower_map:
                standardized.add(self.lower_map[tag_clean])
                continue
            
            # 2. Sub-string Match (e.g. "Alternative Indie Rock" contains "Rock" and "Indie")
            # We iterate our standard list to see if a broad genre is inside the specific tag
            for standard_lower, standard_name in self.lower_map.items():
                # We check for word boundaries to avoid matching "Pop" in "K-Pop" if we want exacts, 
                # but usually broad matching is better for data labeling.
                if len(standard_lower) > 3 and standard_lower in tag_clean:
                    standardized.add(standard_name)

            # 3. Fuzzy Match (cutoff 0.7 for messy user input)
            matches = get_close_matches(tag_clean, list(self.lower_map.keys()), n=1, cutoff=0.7)
            if matches:
                standardized.add(self.lower_map[matches[0]])
                
        return sorted(list(standardized))

mapper = GenreMapper()

def fetch_mb(path: str, params: dict) -> dict:
    qs = urllib.parse.urlencode({**params, "fmt": "json"})
    req = urllib.request.Request(f"{BASE_MB}/{path}?{qs}", headers={"User-Agent": UA_MB})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except Exception:
        return {}

def parse_page(html: str):
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table: return
    
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if not tds: continue
        try:
            rank = int(tds[0].get_text(strip=True))
            name = tds[1].find("a").get_text(strip=True)
            listeners = int(tds[2].get_text(strip=True).replace(",", ""))
            yield rank, name, listeners
        except (ValueError, AttributeError):
            continue

# --- 3. THE PIPELINE ---

def get_recordings_with_genres(artist_query: str, limit: int = 10) -> list[dict]:
    # Search for artist including tag/genre data
    search = fetch_mb("artist", {"query": f'artist:"{artist_query}"', "limit": 1})
    if not search.get("artists"):
        return []
    
    artist_data = search["artists"][0]
    artist_id = artist_data["id"]
    
    # --- SANITY FILTER ---
    # Vetted genres (MusicBrainz-approved)
    vetted = [g['name'] for g in artist_data.get('genres', [])]
    
    # User tags: Sort by vote count to push "Black Metal" trolls to the bottom
    user_tags_raw = artist_data.get('tags', [])
    user_tags_sorted = sorted(user_tags_raw, key=lambda x: x.get('count', 0), reverse=True)
    
    # Take tags with at least 1 vote, but limit to top 8 to avoid the "noise" floor
    top_user_tags = [t['name'] for t in user_tags_sorted if t.get('count', 0) >= 1][:8]
    
    combined_raw = vetted + top_user_tags
    standard_genres = mapper.map_tags(combined_raw)

    # Fetch recordings
    rec_data = fetch_mb("recording", {"artist": artist_id, "limit": limit})
    
    out = []
    for r in rec_data.get("recordings", []):
        year_str = (r.get("first-release-date") or "")[:4]
        out.append({
            "mbid": r["id"],
            "title": r["title"],
            "artist": artist_query,
            "year": int(year_str) if year_str.isdigit() else 0,
            "genres": standard_genres
        })
    
    status = f"  {artist_query}: {len(out)} recordings | Labels: {', '.join(standard_genres[:3])}"
    print(status, file=sys.stderr)
    return out

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--max-rank", type=int, default=500, help="Stop after this rank")
    ap.add_argument("--out", default="spotify_top.csv", help="Output CSV path")
    ap.add_argument("--raw", default="raw.json", help="Output JSON path")
    ap.add_argument("--sleep", type=float, default=1.2, help="Sleep for MB rate limit")
    args = ap.parse_args()

    rows = []
    sess = requests.Session()
    sess.headers["User-Agent"] = USER_AGENT

    # Phase 1: Scrape Kworb
    for url in PAGES:
        if rows and rows[-1][0] >= args.max_rank: break
        print(f"Fetching {url} ...", file=sys.stderr)
        r = sess.get(url, timeout=30)
        for row in parse_page(r.text):
            if row[0] > args.max_rank: break
            rows.append(row)
        time.sleep(1.0)

    # Phase 2: Write Artist CSV
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rank", "artist", "listeners"])
        w.writerows(rows)

    # Phase 3: Fetch MB Data & Label
    total = 0
    with open(args.raw, "w", encoding="utf-8") as raw_f:
        raw_f.write("[\n")
        first_record = True
        
        for rank, artist_name, _ in rows:
            try:
                recordings = get_recordings_with_genres(artist_name)
                for rec in recordings:
                    if not first_record:
                        raw_f.write(",\n")
                    raw_f.write(json.dumps(rec, ensure_ascii=False))
                    first_record = False
                    total += 1
                raw_f.flush()
                time.sleep(args.sleep)
            except Exception as e:
                print(f"Error processing {artist_name}: {e}", file=sys.stderr)
                continue
                
        raw_f.write("\n]\n")

    print(f"Finished. Total labeled recordings: {total}", file=sys.stderr)

if __name__ == "__main__":
    main()