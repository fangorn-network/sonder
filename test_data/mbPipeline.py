import os
import json
import hashlib
import sys
import time
import queue
import threading
import multiprocessing
import tarfile
import lzma
import urllib.request
from typing import Iterator, Dict, Any

# ===========================================================================
# 1. MUSICBRAINZ DATA DUMP STREAM
# ===========================================================================
# MusicBrainz publishes full JSON dumps here (updated monthly, no auth needed):
#   https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/
#
# The 'recording' dump contains all tracks globally with ISRCs, artists,
# releases, genres (tags), and duration. Each line is a self-contained JSON object.
#
# HOW TO USE:
#   Option A) Stream directly from the URL (slow, network-bound, but no disk needed):
#             Set DUMP_SOURCE = "url" and set MB_DUMP_URL to the latest recording dump.
#
#   Option B) Download the .tar.xz first, then point DUMP_SOURCE = "local"
#             and set LOCAL_DUMP_PATH to the file on disk.
#             Download page: https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/
#             File to grab:  recording.tar.xz  (typically ~10-20GB compressed)
#
#   Option B is strongly recommended for production — avoids timeout risk on
#   a multi-hour stream and lets you re-run without re-downloading.
# ===========================================================================

DUMP_SOURCE = "local"  # "local" or "url"

# --- For DUMP_SOURCE = "url" ---
MB_DUMP_URL = "https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/recording.tar.xz"

# --- For DUMP_SOURCE = "local" ---
LOCAL_DUMP_PATH = "./recording.tar.xz"


def _iter_recording_lines(fileobj) -> Iterator[bytes]:
    """
    Opens the .tar.xz stream and yields raw JSON lines from the
    'mbdump/recording' member file inside the archive.
    The archive is read sequentially — memory stays flat regardless of size.

    NOTE: tarfile's streaming mode ("r|") does not support XZ/LZMA directly,
    so we decompress with lzma.open() first and feed the raw tar stream in.
    """
    with lzma.open(fileobj, format=lzma.FORMAT_AUTO) as xz_stream:
        with tarfile.open(fileobj=xz_stream, mode="r|") as tar:
            for member in tar:
                # The recording dump contains a single file: mbdump/recording
                if member.name in ("mbdump/recording", "recording"):
                    f = tar.extractfile(member)
                    if f is None:
                        continue
                    for line in f:
                        line = line.strip()
                        if line:
                            yield line
                    return  # Only one target file; stop after finding it


def fetch_raw_data_stream() -> Iterator[Dict[str, Any]]:
    """
    Streams MusicBrainz recording JSON lines and normalises each record
    into the flat dict shape the processing_worker expects.

    MusicBrainz recording JSON shape (relevant fields):
    {
      "id": "mbid-string",
      "title": "Track Title",
      "length": 213000,          # duration in ms (may be null)
      "isrcs": ["USRC12345678"], # list, may be empty
      "artist-credit": [
        {"artist": {"name": "Artist Name", "id": "mbid"}, "name": "credited-as"},
        {"joinphrase": " & "},
        ...
      ],
      "releases": [
        {"title": "Album Name", "date": "2024-01-15", ...}
      ],
      "tags": [
        {"name": "electronic", "count": 5},
        {"name": "ambient", "count": 3}
      ],
      "genres": [
        {"name": "electronic", "count": 5}
      ]
    }
    """
    print(f"🎸 Opening MusicBrainz recording dump ({DUMP_SOURCE} mode)...")

    if DUMP_SOURCE == "url":
        print(f"   Streaming from: {MB_DUMP_URL}")
        print("   ⚠️  This will be slow (~hours). Consider downloading locally first.")
        req = urllib.request.Request(MB_DUMP_URL, headers={"User-Agent": "Fangorn-Pipeline/1.0"})
        response = urllib.request.urlopen(req)
        line_iter = _iter_recording_lines(response)
    else:
        if not os.path.exists(LOCAL_DUMP_PATH):
            raise FileNotFoundError(
                f"Dump file not found: {LOCAL_DUMP_PATH}\n"
                f"Download it from:\n"
                f"  https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/\n"
                f"  File: recording.tar.xz\n"
                f"Then set LOCAL_DUMP_PATH to its location."
            )
        print(f"   Reading from: {LOCAL_DUMP_PATH}")
        f = open(LOCAL_DUMP_PATH, "rb")
        line_iter = _iter_recording_lines(f)

    count = 0
    for raw_line in line_iter:
        try:
            rec = json.loads(raw_line)
        except json.JSONDecodeError:
            continue

        # --- Artist credit: join all non-joinphrase segments ---
        artist_parts = []
        for segment in rec.get("artist-credit", []):
            if isinstance(segment, dict) and "artist" in segment:
                # Prefer the credited name; fall back to canonical artist name
                credited = segment.get("name") or segment["artist"].get("name", "")
                if credited:
                    artist_parts.append(credited)
            elif isinstance(segment, dict) and "joinphrase" in segment:
                if artist_parts:
                    artist_parts[-1] += segment["joinphrase"]
        artist = "".join(artist_parts).strip()

        # --- ISRC: take the first one if present ---
        isrcs = rec.get("isrcs", [])
        isrc = isrcs[0] if isrcs else None

        # --- Release info: grab the earliest/first release ---
        releases = rec.get("releases", [])
        album = None
        year = None
        if releases:
            first = releases[0]
            album = first.get("title")
            date_str = first.get("date", "")
            year = date_str[:4] if date_str and len(date_str) >= 4 else None

        # --- Genres: prefer explicit genres list, fall back to tags ---
        genre_entries = rec.get("genres") or rec.get("tags") or []
        # Sort by count descending, take top 5
        genre_entries_sorted = sorted(
            [g for g in genre_entries if isinstance(g, dict) and g.get("name")],
            key=lambda g: g.get("count", 0),
            reverse=True
        )
        genres = [g["name"].title() for g in genre_entries_sorted[:5]]

        # --- Duration ---
        length = rec.get("length")  # already in ms or None

        yield {
            "title": rec.get("title", "").strip(),
            "artist": artist,
            "isrc": isrc,
            "album": album,
            "year": year,
            "duration": str(length) if length else None,
            "genres": genres,
            "moods": [],      # MusicBrainz doesn't have mood data natively
            "contexts": [],   # Same — enrich downstream with AcousticBrainz or your own model
            "themes": [],
            "contributors": [],  # Could be extended with rec["artist-credit"] full detail
            "_mbid": rec.get("id"),  # Pass-through for cross-referencing
        }

        count += 1
        if count % 100_000 == 0:
            print(f"   ↳ {count:,} recordings streamed...")


# ===========================================================================
# 2. PIPELINE CONFIGURATION & STORAGE LIMITS
# ===========================================================================
OUTPUT_DIR = "./stage_volumes"
MAX_FILE_SIZE_GB = 1  # Hard disk cap: Script pauses immediately when hit
TARGET_VOLUME = 2       # Current volume naming suffix

CORE_FILE_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_core.json")
TAXO_FILE_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_taxonomy.json")
LEDGER_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_state.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ===========================================================================
# 3. STATE LEDGER MANAGEMENT
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
# 4. MULTI-CORE PROCESSING WORKER
# ===========================================================================
def processing_worker(chunk_data: list) -> list:
    """
    Runs on parallel CPU cores. Transforms a batch of raw records
    into pre-formatted JSON blocks wrapped with 'name' and 'fields' keys.
    """
    processed_batch = []
    for item in chunk_data:
        try:
            if not isinstance(item, dict):
                continue
            artist = str(item.get("artist", "")).strip()
            title = str(item.get("title", "")).strip()
            if not artist or not title:
                continue

            # Compute collision-resistant 24-character track ID
            cleaned = f"{artist.lower()}:{title.lower()}"
            tid = hashlib.sha256(cleaned.encode()).hexdigest()[:24]

            # Map directly to wrapped Core Track Schema
            core_record = {
                "name": tid,
                "fields": {
                    "schemaVersion": 1,
                    "trackId": tid,
                    "isrcCode": item.get("isrc") if item.get("isrc") else None,
                    "title": title,
                    "byArtist": artist,
                    "albumName": item.get("album") if item.get("album") else None,
                    "datePublished": item.get("year") if item.get("year") else None,
                    "durationMs": int(item["duration"]) if item.get("duration") and str(item.get("duration", "")).isdigit() else None,
                    "contributors": item.get("contributors") if isinstance(item.get("contributors"), list) else [],
                    "_mbid": item.get("_mbid"),  # Preserve for cross-referencing
                }
            }

            # Map directly to wrapped Taxonomy Schema
            taxo_record = {
                "name": tid,
                "fields": {
                    "schemaVersion": 1,
                    "trackId": tid,
                    "genres": [str(g) for g in item.get("genres", [])] if isinstance(item.get("genres"), list) else [],
                    "moods": [str(m) for m in item.get("moods", [])] if isinstance(item.get("moods"), list) else [],
                    "themes": [str(t) for t in item.get("themes", [])] if isinstance(item.get("themes"), list) else [],
                    "contexts": [str(c) for c in item.get("contexts", [])] if isinstance(item.get("contexts"), list) else []
                }
            }

            processed_batch.append((
                json.dumps(core_record, ensure_ascii=False),
                json.dumps(taxo_record, ensure_ascii=False)
            ))
        except:
            continue
    return processed_batch

# ===========================================================================
# 5. HIGH-SPEED DISK WRITER CONSUMER
# ===========================================================================
def disk_writer_consumer(write_queue: queue.Queue, stop_event: threading.Event, start_from_scratch: bool):
    max_bytes = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024

    if start_from_scratch:
        f_core = open(CORE_FILE_PATH, "w", encoding="utf-8")
        f_taxo = open(TAXO_FILE_PATH, "w", encoding="utf-8")
        f_core.write("[\n")
        f_taxo.write("[\n")
        is_first = True
    else:
        # Resume mode: roll back trailing characters to keep array notation valid
        for path in (CORE_FILE_PATH, TAXO_FILE_PATH):
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
        f_core = open(CORE_FILE_PATH, "a", encoding="utf-8")
        f_taxo = open(TAXO_FILE_PATH, "a", encoding="utf-8")
        is_first = False

    try:
        while True:
            try:
                batch = write_queue.get(timeout=0.5)
            except queue.Empty:
                if stop_event.is_set():
                    break
                continue

            if batch is None:
                break

            for core_str, taxo_str in batch:
                if f_core.tell() >= max_bytes or f_taxo.tell() >= max_bytes:
                    print(f"\n⚠️ Size Boundary Reached ({MAX_FILE_SIZE_GB} GB). Pausing pipeline gracefully...")
                    stop_event.set()
                    break

                if not is_first:
                    f_core.write(",\n")
                    f_taxo.write(",\n")
                else:
                    is_first = False

                f_core.write("  " + core_str)
                f_taxo.write("  " + taxo_str)

            write_queue.task_done()
            if stop_event.is_set():
                break
    finally:
        f_core.write("\n]")
        f_taxo.write("\n]")
        f_core.close()
        f_taxo.close()

# ===========================================================================
# 6. MAIN COORDINATION RUNNER
# ===========================================================================
def run_bounded_pipeline():
    state = load_pipeline_state()
    if state["complete"]:
        print(f"🎉 Volume {TARGET_VOLUME} is already complete! Update TARGET_VOLUME to continue.")
        return

    start_index = state["last_processed_index"]
    written_count = state["total_written_tracks"]
    start_fresh = (start_index == 0)

    print(f"🔥 Resuming Pipeline. Offset: {start_index} processed. Total written: {written_count}")

    write_queue = queue.Queue(maxsize=64)
    stop_event = threading.Event()

    writer_thread = threading.Thread(
        target=disk_writer_consumer,
        args=(write_queue, stop_event, start_fresh)
    )
    writer_thread.start()

    num_cores = multiprocessing.cpu_count()
    pool = multiprocessing.Pool(processes=num_cores)

    CHUNK_SIZE = 2500
    current_chunk = []
    global_index = 0
    async_results = []

    try:
        raw_data_generator = fetch_raw_data_stream()

        for item in raw_data_generator:
            if global_index < start_index:
                global_index += 1
                continue

            if stop_event.is_set():
                break

            current_chunk.append(item)
            global_index += 1

            if len(current_chunk) == CHUNK_SIZE:
                res = pool.apply_async(processing_worker, args=(current_chunk,))
                async_results.append((global_index, res))
                current_chunk = []

                while len(async_results) > num_cores * 2:
                    idx_anchor, r = async_results[0]
                    if r.ready() or stop_event.is_set():
                        if not stop_event.is_set():
                            data = r.get()
                            write_queue.put(data)
                            written_count += len(data)
                            save_pipeline_state(idx_anchor, written_count)
                        async_results.pop(0)
                    else:
                        time.sleep(0.01)

        if current_chunk and not stop_event.is_set():
            res = pool.apply_async(processing_worker, args=(current_chunk,))
            async_results.append((global_index, res))

        for idx_anchor, r in async_results:
            if not stop_event.is_set():
                data = r.get()
                write_queue.put(data)
                written_count += len(data)
                save_pipeline_state(idx_anchor, written_count)

    except KeyboardInterrupt:
        print("\n🛑 Manual pause received. Flushing queue and locking state...")
        stop_event.set()

    finally:
        pool.close()
        pool.join()

        write_queue.put(None)
        writer_thread.join()

        is_done = not stop_event.is_set() and (global_index > start_index)
        save_pipeline_state(
            global_index if is_done else load_pipeline_state()["last_processed_index"],
            written_count,
            complete=is_done
        )

        print("\n" + "="*60)
        print("📊 STATE LOCK REPORT")
        print(f"  Core File Size: {os.path.getsize(CORE_FILE_PATH) / (1024**2):.2f} MB")
        print(f"  Taxo File Size: {os.path.getsize(TAXO_FILE_PATH) / (1024**2):.2f} MB")
        print(f"  Next Resume Index: {load_pipeline_state()['last_processed_index']}")
        print(f"  Status: {'FINISHED VOLUME' if is_done else 'PAUSED - SIZE BOUNDARY HIT / INTERRUPTED'}")
        print("="*60)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    run_bounded_pipeline()