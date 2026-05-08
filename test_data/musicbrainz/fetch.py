"""Fetch a music corpus using Kworb (Spotify top artists) + Spotify API + Last.fm.

Pipeline:
    1. Scrape Kworb for top artists + their Spotify artist IDs
    2. Fetch each artist's top tracks from Spotify
    3. Fetch audio features for those tracks (energy, valence, danceability, etc.)
    4. Fetch Last.fm tags for artist + track level
    5. Map everything to standardized genres, moods, themes, contexts
    6. Output enriched JSON

Usage:
    export SPOTIFY_CLIENT_ID=...
    export SPOTIFY_CLIENT_SECRET=...
    export LASTFM_API_KEY=...

    python fetch.py --max-rank 100 --out corpus.json
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
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
USER_AGENT = "Mozilla/5.0 (compatible; sond3r-corpus/1.0)"

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_BASE = "https://api.spotify.com/v1"
LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/"

# Tags that are either troll votes or non-musical metadata — never map these
LASTFM_BLOCKLIST = {
    "black metal", "death metal", "brutal death metal", "thrash metal",
    "heavy metal", "black", "metal", "seen live", "favorites", "favourite",
    "american", "canadian", "british", "australian", "female vocalists",
    "male vocalists", "singer-songwriter", "under 2000 listeners",
    "all", "good", "great", "love", "awesome", "cool", "best",
}

# ---------------------------------------------------------------------------
# 2. TAXONOMIES
# ---------------------------------------------------------------------------

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
    191: "Psybient",
}

MOODS_TAXONOMY = {
    "Aggressive": ["angry", "aggressive", "fierce", "harsh", "violent"],
    "Relaxed":    ["chill", "mellow", "relaxed", "calm", "laid-back", "smooth"],
    "Happy":      ["happy", "cheerful", "joyful", "upbeat", "feel good", "fun"],
    "Sad":        ["sad", "depressing", "melancholy", "somber", "mournful", "gloomy"],
    "Energetic":  ["energetic", "high energy", "powerful", "hype"],
    "Dark":       ["dark", "creepy", "sinister", "eerie", "ominous"],
    "Romantic":   ["romantic", "sensual", "passionate"],
    "Dreamy":     ["dreamy", "ethereal", "trippy", "surreal", "hypnotic"],
}

THEMES_TAXONOMY = {
    "Love":      ["heartbreak", "relationship", "crush", "romance"],
    "Politics":  ["politics", "protest", "war", "social commentary", "activism", "revolution"],
    "Nature":    ["nature", "environment", "ocean", "earth"],
    "Party":     ["party", "clubbing", "celebration", "nightlife", "drinking"],
    "Nostalgia": ["nostalgic", "childhood", "memories", "old school", "throwback"],
    "Struggle":  ["struggle", "survival", "hardship", "mental health", "depression", "trauma"],
    "Identity":  ["identity", "pride", "empowerment", "culture"],
    "Spirituality": ["spiritual", "faith", "meditation", "transcendence"],
}

CONTEXTS_TAXONOMY = {
    "Workout":   ["gym", "workout", "running", "training", "fitness", "exercise"],
    "Study":     ["study", "focus", "concentration", "background music", "coding"],
    "Sleep":     ["sleep", "lullaby", "insomnia", "bedtime", "dreaming"],
    "Driving":   ["driving", "road trip", "highway", "cruise"],
    "Rainy Day": ["rainy day", "rainy", "cozy", "autumn"],
    "Summer":    ["beach", "summer", "vacation", "pool party", "festival"],
    "Party":     ["party", "dance floor", "rave", "pregame"],
}

# Fallback: derive moods/contexts/themes from mapped genres when tags are sparse
GENRE_THEME_MAP = {
    "Dance":       ["Party"],
    "Hip-Hop":     ["Identity", "Struggle"],
    "Rap":         ["Identity", "Struggle"],
    "Pop":         ["Love"],
    "R&B":         ["Love"],
    "Funk":        ["Party"],
    "Soul":        ["Love", "Struggle"],
    "Electronic":  ["Party"],
    "Dubstep":     ["Party"],
    "Synthpop":    ["Love"],
    "Ballad":      ["Love"],
    "Country":     ["Nature", "Nostalgia"],
    "Folk":        ["Nature", "Nostalgia"],
    "Blues":       ["Struggle"],
    "Jazz":        ["Nostalgia"],
    "Gospel":      ["Spirituality"],
    "Reggae":      ["Nature", "Spirituality"],
    "Latin":       ["Love", "Party"],
    "Metal":       ["Struggle"],
    "Punk":        ["Politics", "Identity"],
    "Alternative": ["Identity"],
    "Indie":       ["Nostalgia", "Love"],
    "Classical":   ["Nature"],
    "Ambient":     ["Nature"],
}

GENRE_MOOD_MAP = {
    "Dance":       ["Energetic", "Happy"],
    "Hip-Hop":     ["Energetic"],
    "Rap":         ["Energetic"],
    "Pop":         ["Happy"],
    "R&B":         ["Romantic", "Relaxed"],
    "Funk":        ["Happy", "Energetic"],
    "Soul":        ["Romantic", "Relaxed"],
    "Electronic":  ["Energetic", "Dreamy"],
    "Dubstep":     ["Energetic", "Dark"],
    "Synthpop":    ["Dreamy", "Energetic"],
    "Ballad":      ["Sad", "Romantic"],
    "Country":     ["Relaxed", "Sad"],
    "Ambient":     ["Dreamy", "Relaxed"],
    "Jazz":        ["Relaxed", "Dreamy"],
    "Blues":       ["Sad", "Relaxed"],
    "Metal":       ["Aggressive", "Energetic"],
    "Hard Rock":   ["Aggressive", "Energetic"],
    "Rock":        ["Energetic"],
    "Punk":        ["Aggressive", "Energetic"],
    "Classical":   ["Dreamy", "Relaxed"],
    "Reggae":      ["Relaxed", "Happy"],
    "Latin":       ["Happy", "Energetic"],
    "Alternative": ["Dreamy"],
    "Indie":       ["Dreamy", "Relaxed"],
    "Trance":      ["Dreamy", "Energetic"],
    "House":       ["Energetic", "Happy"],
    "Techno":      ["Energetic"],
    "Gospel":      ["Happy"],
}

GENRE_CONTEXT_MAP = {
    "Dance":       ["Party", "Workout"],
    "Hip-Hop":     ["Driving", "Party"],
    "Rap":         ["Driving", "Party"],
    "Pop":         ["Driving", "Summer"],
    "R&B":         ["Driving", "Rainy Day"],
    "Funk":        ["Party", "Driving"],
    "Soul":        ["Rainy Day"],
    "Electronic":  ["Party", "Workout"],
    "Dubstep":     ["Party", "Workout"],
    "Synthpop":    ["Driving", "Summer"],
    "Country":     ["Driving", "Rainy Day"],
    "Ambient":     ["Study", "Sleep"],
    "Jazz":        ["Study", "Rainy Day"],
    "Classical":   ["Study", "Sleep"],
    "Ballad":      ["Rainy Day"],
    "Reggae":      ["Summer", "Rainy Day"],
    "Latin":       ["Party", "Summer"],
    "Alternative": ["Rainy Day", "Driving"],
    "Indie":       ["Rainy Day", "Study"],
    "Trance":      ["Workout", "Party"],
    "House":       ["Party", "Workout"],
    "Techno":      ["Workout", "Party"],
    "Rock":        ["Driving", "Workout"],
    "Hard Rock":   ["Workout", "Driving"],
    "Metal":       ["Workout"],
    "Gospel":      ["Summer"],
}

# ---------------------------------------------------------------------------
# 3. MAPPERS
# ---------------------------------------------------------------------------

class GenreMapper:
    def __init__(self):
        self.lower_map = {v.lower(): v for v in ID3_GENRES.values()}

    def map_tags(self, tags: list[str]) -> list[str]:
        out = set()
        for tag in tags:
            t = tag.lower().strip()
            # 1. Exact match
            if t in self.lower_map:
                out.add(self.lower_map[t])
                continue
            # 2. Tag contains genre as whole phrase (e.g. "indie rock music" -> "Indie Rock")
            for k, v in self.lower_map.items():
                if len(k) > 5 and re.search(r'\b' + re.escape(k) + r'\b', t):
                    out.add(v)
            # 3. Tight fuzzy match only for longer strings to avoid false positives
            if len(t) > 5:
                m = get_close_matches(t, list(self.lower_map.keys()), n=1, cutoff=0.85)
                if m:
                    out.add(self.lower_map[m[0]])
        return sorted(out)


class TaxonomyMapper:
    def __init__(self, taxonomy: dict[str, list[str]]):
        self.taxonomy = taxonomy

    def map_tags(self, tags: list[str]) -> list[str]:
        out = set()
        for tag in tags:
            t = tag.lower().strip()
            for label, keywords in self.taxonomy.items():
                # Require whole-word match to avoid e.g. "lover" matching "love"
                if any(re.search(r'\b' + re.escape(kw) + r'\b', t) for kw in keywords):
                    out.add(label)
        return sorted(out)


genre_mapper   = GenreMapper()
mood_mapper    = TaxonomyMapper(MOODS_TAXONOMY)
theme_mapper   = TaxonomyMapper(THEMES_TAXONOMY)
context_mapper = TaxonomyMapper(CONTEXTS_TAXONOMY)

# ---------------------------------------------------------------------------
# 4. AUDIO FEATURES → MOODS / CONTEXTS
# ---------------------------------------------------------------------------

def features_to_moods(f: dict) -> list[str]:
    if not f:
        return []
    moods = set()
    e, v, ac = f.get("energy", 0), f.get("valence", 0), f.get("acousticness", 0)
    if e > 0.8 and v < 0.4:
        moods.add("Aggressive")
    if e < 0.45 and v > 0.45:
        moods.add("Relaxed")
    if v > 0.7 and e > 0.55:
        moods.add("Happy")
    if v < 0.3 and e < 0.5:
        moods.add("Sad")
    if e > 0.8:
        moods.add("Energetic")
    if v < 0.35 and e > 0.4:
        moods.add("Dark")
    if ac > 0.6 and e < 0.45:
        moods.add("Dreamy")
    return sorted(moods)


def features_to_contexts(f: dict) -> list[str]:
    if not f:
        return []
    contexts = set()
    e   = f.get("energy", 0)
    d   = f.get("danceability", 0)
    ins = f.get("instrumentalness", 0)
    ac  = f.get("acousticness", 0)
    tmp = f.get("tempo", 0)
    v   = f.get("valence", 0)

    if e > 0.7 and tmp > 118:
        contexts.add("Workout")
    if ins > 0.4 and e < 0.5:
        contexts.add("Study")
    if e < 0.35 and ac > 0.55:
        contexts.add("Sleep")
    if e > 0.55 and d > 0.55:
        contexts.add("Driving")
    if d > 0.72 and v > 0.55:
        contexts.add("Summer")
    if d > 0.72 and e > 0.65:
        contexts.add("Party")
    if e < 0.4 and v < 0.4:
        contexts.add("Rainy Day")
    return sorted(contexts)

# ---------------------------------------------------------------------------
# 5. KWORB SCRAPER
# ---------------------------------------------------------------------------

def scrape_kworb(max_rank: int, session: requests.Session) -> list[tuple[int, str, str]]:
    """Returns list of (rank, artist_name, spotify_artist_id)."""
    rows = []
    for url in KWORB_PAGES:
        if rows and rows[-1][0] >= max_rank:
            break
        print(f"[kworb] Fetching {url}", file=sys.stderr)
        r = session.get(url, timeout=30)
        soup = BeautifulSoup(r.text, "html.parser")
        table = soup.find("table")
        if not table:
            continue
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if not tds:
                continue
            try:
                rank = int(tds[0].get_text(strip=True))
                if rank > max_rank:
                    break
                a_tag = tds[1].find("a")
                name = a_tag.get_text(strip=True)
                href = a_tag.get("href", "")
                m = ARTIST_HREF_RE.search(href)
                spotify_id = m.group(1) if m else None
                if rank <= 3:
                    print(f"[debug] rank={rank} name={name!r} href={href!r} id={spotify_id!r}", file=sys.stderr)
                rows.append((rank, name, spotify_id))
            except (ValueError, AttributeError):
                continue
        time.sleep(1.0)
    return rows

# ---------------------------------------------------------------------------
# 6. SPOTIFY CLIENT
# ---------------------------------------------------------------------------

class SpotifyClient:
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: str | None = None
        self._token_expiry: float = 0.0

    def _ensure_token(self):
        if self._token and time.time() < self._token_expiry - 60:
            return
        creds = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        r = requests.post(
            SPOTIFY_TOKEN_URL,
            headers={"Authorization": f"Basic {creds}"},
            data={"grant_type": "client_credentials"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        self._token = data["access_token"]
        self._token_expiry = time.time() + data["expires_in"]
        print("[spotify] Token refreshed.", file=sys.stderr)

    def get(self, path: str, params: dict | None = None) -> dict:
        self._ensure_token()
        r = requests.get(
            f"{SPOTIFY_BASE}/{path}",
            headers={"Authorization": f"Bearer {self._token}"},
            params=params or {},
            timeout=15,
        )
        if r.status_code == 429:
            retry = int(r.headers.get("Retry-After", 5))
            print(f"[spotify] Rate limited, sleeping {retry}s", file=sys.stderr)
            time.sleep(retry)
            return self.get(path, params)
        if r.status_code >= 400:
            print(f"[spotify] HTTP {r.status_code} url={r.url} body={r.text[:300]}", file=sys.stderr)
        r.raise_for_status()
        return r.json()

    def artist_top_tracks(self, artist_id: str, artist_name: str, limit: int = 10) -> list[dict]:
        """Search for top tracks by artist, sorted by popularity.
        Uses search endpoint which works with Client Credentials flow."""
        data = self.get("search", {
            "q": artist_name,
            "type": "track",
            "limit": 10,
        })
        all_tracks = data.get("tracks", {}).get("items", [])
        artist_tracks = [
            t for t in all_tracks
            if any(a["id"] == artist_id for a in t.get("artists", []))
        ]
        artist_tracks.sort(key=lambda t: t.get("popularity", 0), reverse=True)

        # Deduplicate by normalized title (removes album vs single duplicates)
        seen_titles: set[str] = set()
        deduped = []
        for t in artist_tracks:
            key = t.get("name", "").lower().strip()
            if key not in seen_titles:
                seen_titles.add(key)
                deduped.append(t)
        artist_tracks = deduped

        if not artist_tracks:
            print(f"[spotify] No tracks found for {artist_name} ({artist_id}), raw count={len(all_tracks)}", file=sys.stderr)
        return artist_tracks[:limit]

    def audio_features_batch(self, track_ids: list[str]) -> list[dict | None]:
        """Fetch audio features for up to 100 track IDs at once.
        NOTE: Spotify restricted this endpoint to OAuth in late 2024.
        Returns empty list gracefully if unavailable."""
        if not track_ids:
            return []
        try:
            data = self.get("audio-features", {"ids": ",".join(track_ids[:100])})
            return data.get("audio_features", [])
        except Exception:
            print("[spotify] audio-features unavailable (requires OAuth), skipping.", file=sys.stderr)
            return []

    def artist_genres(self, artist_id: str) -> list[str]:
        data = self.get(f"artists/{artist_id}")
        return data.get("genres", [])

# ---------------------------------------------------------------------------
# 7. LAST.FM CLIENT
# ---------------------------------------------------------------------------

class LastFMClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT

    def _get(self, method: str, extra: dict) -> dict:
        params = {
            "method": method,
            "api_key": self.api_key,
            "format": "json",
            "autocorrect": 1,
            **extra,
        }
        try:
            r = self.session.get(LASTFM_BASE, params=params, timeout=10)
            return r.json()
        except Exception:
            return {}

    def artist_tags(self, artist: str, min_count: int = 20) -> list[str]:
        data = self._get("artist.getTopTags", {"artist": artist})
        tags = data.get("toptags", {}).get("tag", [])
        return [
            t["name"] for t in tags
            if int(t.get("count", 0)) >= min_count
            and t["name"].lower().strip() not in LASTFM_BLOCKLIST
        ]

    def track_tags(self, artist: str, track: str, min_count: int = 10) -> list[str]:
        data = self._get("track.getTopTags", {"artist": artist, "track": track})
        tags = data.get("toptags", {}).get("tag", [])
        return [
            t["name"] for t in tags
            if int(t.get("count", 0)) >= min_count
            and t["name"].lower().strip() not in LASTFM_BLOCKLIST
        ]

# ---------------------------------------------------------------------------
# 8. MAIN ENRICHMENT LOGIC
# ---------------------------------------------------------------------------

def enrich_artist(
    rank: int,
    artist_name: str,
    spotify_id: str | None,
    spotify: SpotifyClient,
    lastfm: LastFMClient,
    tracks_per_artist: int = 10,
) -> list[dict]:
    records = []

    # --- Spotify: genres + top tracks ---
    sp_genres: list[str] = []
    tracks: list[dict] = []

    if spotify_id:
        try:
            print(f"[spotify] Fetching {artist_name} id={spotify_id}", file=sys.stderr)
            sp_genres = spotify.artist_genres(spotify_id)
            tracks = spotify.artist_top_tracks(spotify_id, artist_name, tracks_per_artist)
        except Exception as e:
            print(f"[spotify] Error for {artist_name} ({spotify_id}): {e}", file=sys.stderr)
    else:
        print(f"[spotify] No ID extracted for {artist_name}", file=sys.stderr)

    if not tracks:
        print(f"[skip] No Spotify tracks for {artist_name}", file=sys.stderr)
        return records

    # --- Last.fm: artist-level tags (fetched once) ---
    lfm_artist_tags = lastfm.artist_tags(artist_name)
    time.sleep(0.25)

    # --- Merge artist-level tag pool ---
    artist_tag_pool = sp_genres + lfm_artist_tags
    artist_genres  = genre_mapper.map_tags(artist_tag_pool)
    artist_themes  = theme_mapper.map_tags(artist_tag_pool)

    for track in tracks:
        tid   = track.get("id", "")
        title = track.get("name", "")
        year_str = (track.get("album", {}).get("release_date") or "")[:4]
        year  = int(year_str) if year_str.isdigit() else 0
        duration_ms = track.get("duration_ms")

        # --- Last.fm: track-level tags ---
        lfm_track_tags = lastfm.track_tags(artist_name, title)
        time.sleep(0.25)

        # --- Full tag pool for this track ---
        track_tag_pool = artist_tag_pool + lfm_track_tags
        tag_moods    = mood_mapper.map_tags(track_tag_pool)
        tag_contexts = context_mapper.map_tags(track_tag_pool)
        themes   = theme_mapper.map_tags(track_tag_pool)
        genres   = genre_mapper.map_tags(track_tag_pool) or artist_genres

        # Fallback: derive moods/contexts/themes from genres when tags are sparse
        genre_moods    = [m for g in genres for m in GENRE_MOOD_MAP.get(g, [])]
        genre_contexts = [c for g in genres for c in GENRE_CONTEXT_MAP.get(g, [])]
        genre_themes   = [t for g in genres for t in GENRE_THEME_MAP.get(g, [])]

        moods    = sorted(set(tag_moods) | set(genre_moods))
        contexts = sorted(set(tag_contexts) | set(genre_contexts))
        themes   = sorted(set(themes) | set(genre_themes))

        record = {
            "name": tid,
            "fields": {
                "spotify_track_id":  tid,
                "spotify_artist_id": spotify_id,
                "title":       title,
                "artist":      artist_name,
                "year":        year,
                "rank":        rank,
                "duration_ms": duration_ms,
                "genres":      genres,
                "moods":       moods,
                "themes":      themes,
                "contexts":    contexts,
            }
        }
        records.append(record)

    print(
        f"[done] #{rank} {artist_name}: {len(records)} tracks | "
        f"genres={genres[:2]} moods={moods[:2]} contexts={contexts[:2]}",
        file=sys.stderr,
    )
    return records

# ---------------------------------------------------------------------------
# 9. ENTRY POINT
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--min-rank",        type=int,   default=1,            help="Start from this Kworb rank")
    ap.add_argument("--max-rank",        type=int,   default=100,          help="Stop after this Kworb rank")
    ap.add_argument("--tracks-per-artist", type=int, default=10,           help="Spotify top tracks per artist")
    ap.add_argument("--out",                         default="corpus.json", help="Output JSON path")
    ap.add_argument("--sleep",           type=float, default=0.5,          help="Extra sleep between artists (s)")
    args = ap.parse_args()

    # --- Credentials from env ---
    client_id     = os.environ.get("SPOTIFY_CLIENT_ID", "")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
    lfm_key       = os.environ.get("LASTFM_API_KEY", "")

    if not client_id or not client_secret:
        sys.exit("ERROR: Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars.")
    if not lfm_key:
        sys.exit("ERROR: Set LASTFM_API_KEY env var.")

    spotify = SpotifyClient(client_id, client_secret)
    lastfm  = LastFMClient(lfm_key)

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    # Step 1: Kworb
    artists = scrape_kworb(args.max_rank, session)
    artists = [(r, n, sid) for r, n, sid in artists if r >= args.min_rank]
    print(f"[kworb] {len(artists)} artists scraped.", file=sys.stderr)

    # Step 2: Enrich + stream to file
    total = 0
    with open(args.out, "w", encoding="utf-8") as out_f:
        out_f.write("[\n")
        first = True
        for rank, name, spotify_id in artists:
            try:
                records = enrich_artist(
                    rank, name, spotify_id, spotify, lastfm,
                    tracks_per_artist=args.tracks_per_artist,
                )
                for rec in records:
                    if not first:
                        out_f.write(",\n")
                    out_f.write(json.dumps(rec, ensure_ascii=False))
                    first = False
                    total += 1
                out_f.flush()
                time.sleep(args.sleep)
            except Exception as e:
                print(f"[error] {name}: {e}", file=sys.stderr)
                continue
        out_f.write("\n]\n")

    print(f"[finished] {total} track records written to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()