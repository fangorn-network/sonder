import os
import json
import hashlib
import sys
import time
import re
import requests
import tarfile
import lzma
from typing import Iterator, Dict, Any

# ===========================================================================
# 1. GLOBAL PIPELINE CONFIGURATION
# ===========================================================================
REQUIRE_TAXONOMY = True       # 🏷️ True: Drops any track that has no genre tags
TARGET_TRACK_COUNT = 1000000  # 🎯 Pipeline stops immediately when this count is written
MAX_FILE_SIZE_GB = 1          # Hard disk safety cap
TARGET_VOLUME = 1             # 📂 Current volume naming suffix
OUTPUT_DIR = "./stage_volumes"
DUMP_SOURCE = "url"           # "url" to stream live over the network

# --- Stream Tweaks ---
NETWORK_CHUNK_SIZE = 128 * 1024  # 📡 128KB chunks for seamless, live networking

# --- Base Directory for Web Resolution ---
MB_BASE_DUMP_URL = "https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/"


# ===========================================================================
# 2. DERIVED PATHS & DIRECTORY SETUP
# ===========================================================================
CORE_FILE_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_core.json")
TAXO_FILE_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_taxonomy.json")
SOURCES_FILE_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_sources.json")
LEDGER_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_state.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ===========================================================================
# 3. DYNAMIC URL DISCOVERY ENGINE
# ===========================================================================
def resolve_latest_dump_url() -> str:
    print("🔍 Scanning MetaBrainz index for the latest valid data snapshot...")
    try:
        headers = {"User-Agent": "Fangorn-Pipeline/1.0"}
        response = requests.get(MB_BASE_DUMP_URL, headers=headers)
        response.raise_for_status()
        html = response.text

        directories = re.findall(r'href="([0-9]{8}-[0-9]{6})/?"', html)
        if not directories:
            directories = re.findall(r'href=["\']?([0-9]{8}-[0-9]{6})/.*?["\']?', html)

        if not directories:
            raise RuntimeError("Could not parse any active datestamp directories.")

        sorted_dirs = sorted(directories, reverse=True)

        for directory in sorted_dirs:
            target_url = f"{MB_BASE_DUMP_URL}{directory}/release.tar.xz"
            print(f"   🔎 Validating availability of: {directory}/release.tar.xz ...")

            check_resp = requests.head(target_url, headers=headers)
            if check_resp.status_code == 200:
                print(f"🎯 Resolved target location:\n   👉 {target_url}")
                return target_url
            else:
                print(f"   ⚠️ File returned {check_resp.status_code}. Skipping...")

        raise RuntimeError("No directories contained a compiled release.tar.xz archive.")
    except Exception as e:
        print(f"❌ Dynamic discovery failed: {e}")
        fallback_url = f"{MB_BASE_DUMP_URL}latest/release.tar.xz"
        print(f"ℹ️ Reverting to default alias path: {fallback_url}")
        return fallback_url


# ===========================================================================
# 4. MEMORY-EFFICIENT SEQUENTIAL STREAM PAYLOAD PARSER
# ===========================================================================
class RequestsStreamWrapper:
    def __init__(self, response, chunk_size: int):
        self.chunks = response.iter_content(chunk_size=chunk_size)
        self.bytes_read = 0
        self.last_report = 0

    def read(self, size=-1):
        try:
            data = next(self.chunks)
            self.bytes_read += len(data)

            if self.bytes_read - self.last_report >= 5 * 1024 * 1024:
                mb_downloaded = self.bytes_read / (1024 * 1024)
                print(f"   📡 Stream Progress: {mb_downloaded:.1f} MB processed over the wire...", end="\r", flush=True)
                self.last_report = self.bytes_read
            return data
        except StopIteration:
            return b""


def _iter_recording_lines(stream_source) -> Iterator[bytes]:
    print("   ⏳ Hooking decompression pipes to network stream...")
    with lzma.open(stream_source, format=lzma.FORMAT_AUTO) as xz_stream:
        with tarfile.open(fileobj=xz_stream, mode="r|") as tar:
            for member in tar:
                print(f"   📂 Archive Parser: Passing entity '{member.name}'...", end="\r", flush=True)
                if member.name in ("mbdump/release", "release", "mbdump/recording", "recording"):
                    print(f"\n   🎯 Core payload target hit: '{member.name}'! Extracting real-time text lines...")
                    f = tar.extractfile(member)
                    if f is None:
                        continue
                    for line in f:
                        line = line.strip()
                        if line:
                            yield line
                    return


def _extract_spotify_id(url_res: str) -> str:
    """Safely extracts a 22-character Spotify ID from a URL or URI resource."""
    if not url_res:
        return None
    match = re.search(r'(?:spotify\.com/track/|spotify:track:)([a-zA-Z0-9]+)', url_res)
    return match.group(1) if match else None


def fetch_raw_data_stream() -> Iterator[Dict[str, Any]]:
    if DUMP_SOURCE == "url":
        target_url = resolve_latest_dump_url()
        headers = {"User-Agent": "Fangorn-Pipeline/1.0"}
        response = requests.get(target_url, headers=headers, stream=True)
        response.raise_for_status()
        stream_wrapper = RequestsStreamWrapper(response, chunk_size=NETWORK_CHUNK_SIZE)
        line_iter = _iter_recording_lines(stream_wrapper)
    else:
        LOCAL_DUMP_PATH = "./recording.tar.xz"
        if not os.path.exists(LOCAL_DUMP_PATH):
            raise FileNotFoundError(f"Local dump file not found at: {LOCAL_DUMP_PATH}")
        f = open(LOCAL_DUMP_PATH, "rb")
        line_iter = _iter_recording_lines(f)

    raw_inspected = 0
    for raw_line in line_iter:
        raw_inspected += 1
        try:
            rec = json.loads(raw_line)
        except json.JSONDecodeError:
            continue

        # --- Artist Credit Assembly ---
        artist_parts = []
        for segment in rec.get("artist-credit", []):
            if isinstance(segment, dict) and "artist" in segment:
                credited = segment.get("name") or segment["artist"].get("name", "")
                if credited:
                    artist_parts.append(credited)
            elif isinstance(segment, dict) and "joinphrase" in segment:
                if artist_parts:
                    artist_parts[-1] += segment["joinphrase"]
        artist = "".join(artist_parts).strip()

        isrcs = rec.get("isrcs", [])
        isrc = isrcs[0] if isrcs else None

        # --- Release Info and Spotify Links ---
        releases = rec.get("releases", []) if "releases" in rec else [rec]
        album = None
        year = None
        spotify_id = None

        if releases and isinstance(releases, list) and len(releases) > 0:
            first = releases[0]
            if isinstance(first, dict):
                album = first.get("title")
                date_str = first.get("date", "")
                year = date_str[:4] if date_str and len(date_str) >= 4 else None

                for rel in first.get("relations", []):
                    url_res = rel.get("url", {}).get("resource", "")
                    sid = _extract_spotify_id(url_res)
                    if sid:
                        spotify_id = sid
                        break

        # Check recording-level relations if release-level misses
        if not spotify_id:
            for rel in rec.get("relations", []):
                url_res = rel.get("url", {}).get("resource", "")
                sid = _extract_spotify_id(url_res)
                if sid:
                    spotify_id = sid
                    break

        # --- Smart Genre Extraction (Recording -> Release Fallback) ---
        genre_entries = rec.get("genres") or rec.get("tags") or []
        
        # FALLBACK: If the track itself has no genres, check its parent release/album
        if not genre_entries and releases and isinstance(releases, list) and len(releases) > 0:
            first = releases[0]
            if isinstance(first, dict):
                genre_entries = first.get("genres") or first.get("tags") or []

        cleaned_genres = []
        for g in genre_entries:
            if isinstance(g, dict) and g.get("name"):
                weight = g.get("count", 0)
                try:
                    weight = int(weight)
                except (ValueError, TypeError):
                    weight = 1
                cleaned_genres.append((g["name"].title(), weight))

        cleaned_genres.sort(key=lambda x: x[1], reverse=True)
        genres = [item[0] for item in cleaned_genres[:5]]

        # Reject the track if taxonomy is strictly required but missing
        if REQUIRE_TAXONOMY and not genres:
            continue

        length = rec.get("length")

        yield {
            "title": rec.get("title", "").strip(),
            "artist": artist,
            "isrc": isrc,
            "album": album,
            "year": year,
            "duration": str(length) if length else None,
            "genres": genres,
            "spotify_id": spotify_id,
            "_mbid": rec.get("id"),
            "_raw_index_checkpoint": raw_inspected
        }


# ===========================================================================
# 5. STATE MANAGEMENT
# ===========================================================================
def load_pipeline_state() -> dict:
    if os.path.exists(LEDGER_PATH):
        try:
            with open(LEDGER_PATH, "r") as f:
                return json.load(f)
        except:
            pass
    return {"last_processed_index": 0, "total_written_tracks": 0, "complete": False}

def save_pipeline_state(index: int, written: int, complete: bool = False):
    with open(LEDGER_PATH, "w") as f:
        json.dump({
            "last_processed_index": index,
            "total_written_tracks": written,
            "complete": complete,
            "last_updated": time.time()
        }, f, indent=2)


# ===========================================================================
# 5b. CROSS-VOLUME DEDUP LOADER
# ===========================================================================
def load_previous_volume_ids() -> set:
    """
    Load trackIds from ALL prior volumes (1 through TARGET_VOLUME-1) into a set
    for content-based dedup. Stream-position offsets are unreliable across MB
    dump snapshots because release ordering isn't stable between dumps.
    """
    seen = set()
    if TARGET_VOLUME <= 1:
        pass
    else:
        for vol in range(1, TARGET_VOLUME):
            prior_core = os.path.join(OUTPUT_DIR, f"volume_{vol}_core.json")
            if not os.path.exists(prior_core):
                print(f"   ⚠️  No volume_{vol}_core.json found — skipping for dedup.")
                continue

            print(f"🔍 Loading trackIds from volume_{vol}_core.json for dedup...")
            try:
                with open(prior_core, "r", encoding="utf-8") as f:
                    prior_data = json.load(f)
                for entry in prior_data:
                    tid = entry.get("fields", {}).get("trackId")
                    if tid:
                        seen.add(tid)
                print(f"   ✅ Volume {vol}: loaded {len(prior_data):,} IDs (running total: {len(seen):,})")
            except Exception as e:
                print(f"   ❌ Failed to load volume_{vol}_core.json: {e}")

    # Also include anything already written to this volume's file (resume case)
    if os.path.exists(CORE_FILE_PATH):
        try:
            with open(CORE_FILE_PATH, "r", encoding="utf-8") as f:
                content = f.read().strip()
            # File may be unclosed JSON if a prior run was interrupted — try to recover
            if not content.endswith("]"):
                content = content.rstrip(", \n") + "\n]"
            current_data = json.loads(content)
            for entry in current_data:
                tid = entry.get("fields", {}).get("trackId")
                if tid:
                    seen.add(tid)
            print(f"   ✅ Current vol {TARGET_VOLUME} partial: +{len(current_data):,} (total: {len(seen):,})")
        except Exception as e:
            print(f"   ⚠️  Could not parse current volume file for dedup: {e}")

    return seen


# ===========================================================================
# 6. IN-FLIGHT TRANSFORM & WRITE ENGINE
# ===========================================================================
def run_bounded_pipeline():
    state = load_pipeline_state()
    if state["complete"]:
        print(f"🎉 Volume {TARGET_VOLUME} is already completely built.")
        return

    # Load IDs from previous volumes for content-based dedup
    seen_ids = load_previous_volume_ids()
    print(f"🛡️  Dedup set primed with {len(seen_ids):,} known trackIds.\n")

    written_count = state["total_written_tracks"]
    start_fresh = (written_count == 0) or not os.path.exists(CORE_FILE_PATH)

    print(f"🔥 Starting Pipeline for Volume {TARGET_VOLUME}.")
    print(f"   Already written this volume: {written_count:,} / {TARGET_TRACK_COUNT:,}")

    max_bytes = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024

    # Setup files and append or initialize array brackets
    if start_fresh:
        f_core = open(CORE_FILE_PATH, "w", encoding="utf-8")
        f_taxo = open(TAXO_FILE_PATH, "w", encoding="utf-8")
        f_src  = open(SOURCES_FILE_PATH, "w", encoding="utf-8")
        f_core.write("[\n")
        f_taxo.write("[\n")
        f_src.write("[\n")
        is_first_core = True
        is_first_src = True
    else:
        # Seek and truncate existing trailing closing brackets to resume appending valid JSON
        for path in (CORE_FILE_PATH, TAXO_FILE_PATH, SOURCES_FILE_PATH):
            if os.path.exists(path):
                with open(path, "r+", encoding="utf-8") as f:
                    f.seek(0, os.SEEK_END)
                    pos = f.tell() - 1
                    while pos > 0:
                        f.seek(pos)
                        if f.read(1) in ("]", "\n", " ", ","):
                            pos -= 1
                        else:
                            f.seek(pos + 1)
                            f.truncate()
                            break
            else:
                # In case sources file is missing on a resume
                with open(path, "w", encoding="utf-8") as f:
                    f.write("[\n")

        f_core = open(CORE_FILE_PATH, "a", encoding="utf-8")
        f_taxo = open(TAXO_FILE_PATH, "a", encoding="utf-8")
        f_src  = open(SOURCES_FILE_PATH, "a", encoding="utf-8")
        
        is_first_core = False
        
        # Determine if sources is empty so we don't prepend a comma on the first item
        with open(SOURCES_FILE_PATH, "r", encoding="utf-8") as tmp:
            content = tmp.read().strip()
            is_first_src = (content == "[" or content == "")

    current_raw_index = 0

    try:
        raw_generator = fetch_raw_data_stream()

        for item in raw_generator:
            current_raw_index = item["_raw_index_checkpoint"]

            # Compute trackId early to check dedup BEFORE any work
            artist = item["artist"]
            title = item["title"]
            if not artist or not title:
                continue

            cleaned = f"{artist.lower()}:{title.lower()}"
            tid = hashlib.sha256(cleaned.encode()).hexdigest()[:24]

            # Skip anything we've already captured in this or a prior volume
            if tid in seen_ids:
                continue
            seen_ids.add(tid)

            if f_core.tell() >= max_bytes or f_taxo.tell() >= max_bytes:
                print(f"\n⚠️ File size target ceiling hit ({MAX_FILE_SIZE_GB} GB). Pausing...")
                break

            core_record = {
                "name": tid,
                "fields": {
                    "schemaVersion": 1,
                    "trackId": tid,
                    "isrcCode": item.get("isrc"),
                    "title": title,
                    "byArtist": artist,
                    "albumName": item.get("album"),
                    "datePublished": item.get("year"),
                    "durationMs": int(item["duration"]) if item.get("duration") and item["duration"].isdigit() else None,
                    "contributors": [],
                    "_mbid": item.get("_mbid"),
                }
            }

            taxo_record = {
                "name": tid,
                "fields": {
                    "schemaVersion": 1,
                    "trackId": tid,
                    "genres": item.get("genres", []),
                    "moods": [],
                    "themes": [],
                    "contexts": []
                }
            }

            core_str = json.dumps(core_record, ensure_ascii=False)
            taxo_str = json.dumps(taxo_record, ensure_ascii=False)

            if not is_first_core:
                f_core.write(",\n  " + core_str)
                f_taxo.write(",\n  " + taxo_str)
            else:
                f_core.write("  " + core_str)
                f_taxo.write("  " + taxo_str)
                is_first_core = False

            f_core.flush()
            f_taxo.flush()

            # Optional Sources Extract
            if item.get("spotify_id"):
                src_record = {
                    "trackId": tid,
                    "platform": "spotify",
                    "platformId": item["spotify_id"]
                }
                src_str = json.dumps(src_record, ensure_ascii=False)
                
                if not is_first_src:
                    f_src.write(",\n  " + src_str)
                else:
                    f_src.write("  " + src_str)
                    is_first_src = False
                
                f_src.flush()

            written_count += 1
            print(f"   ✨ Match saved! Vol {TARGET_VOLUME} Total: {written_count:,} / {TARGET_TRACK_COUNT:,} tracks.", end="\r", flush=True)

            if written_count % 5 == 0:
                save_pipeline_state(current_raw_index, written_count)

            if written_count >= TARGET_TRACK_COUNT:
                print(f"\n🎯 Target count of {TARGET_TRACK_COUNT:,} tracks satisfied!")
                break

    except KeyboardInterrupt:
        print("\n🛑 Manual execution break. Closing stream hooks safely...")
    finally:
        f_core.write("\n]")
        f_taxo.write("\n]")
        f_src.write("\n]")
        
        f_core.close()
        f_taxo.close()
        f_src.close()

        is_completed = (written_count >= TARGET_TRACK_COUNT)
        final_index = current_raw_index if current_raw_index else 0
        save_pipeline_state(final_index, written_count, complete=is_completed)

        print("\n" + "="*60)
        print("📊 STATE LOCK REPORT")
        print(f"  Volume:           {TARGET_VOLUME}")
        print(f"  Core File Size:   {os.path.getsize(CORE_FILE_PATH) / (1024**2):.2f} MB")
        print(f"  Taxo File Size:   {os.path.getsize(TAXO_FILE_PATH) / (1024**2):.2f} MB")
        print(f"  Src File Size:    {os.path.getsize(SOURCES_FILE_PATH) / (1024**2):.2f} MB")
        print(f"  Tracks Saved:     {written_count:,} / {TARGET_TRACK_COUNT:,}")
        print(f"  Dedup Set Size:   {len(seen_ids):,} unique IDs in memory")
        print(f"  Pipeline Status:  {'FINISHED' if is_completed else 'PAUSED/INTERRUPTED'}")
        print("="*60)

if __name__ == "__main__":
    run_bounded_pipeline()