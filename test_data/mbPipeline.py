import os
import json
import hashlib
import re
import requests
import tarfile
import lzma
from typing import Iterator, Dict, Any

# ===========================================================================
# 1. CONFIGURATION
# ===========================================================================
REQUIRE_TAXONOMY  = True
MIN_TAG_VOTES     = 1         # minimum cumulative community votes to accept a tag
TARGET_TRACK_COUNT = 1000000
TARGET_VOLUME     = 1
OUTPUT_DIR        = "./stage_volumes"

NETWORK_CHUNK_SIZE  = 1 * 1024 * 1024   # 1 MB write chunks during download
MB_BASE_DUMP_URL    = "https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/"
DOWNLOAD_TIMEOUT    = (10, 60)           # (connect_timeout, read_timeout) seconds

# ===========================================================================
# 2. PATHS
# ===========================================================================
CACHE_DIR         = os.path.join(OUTPUT_DIR, "cache")
LOCAL_XZ_PATH     = os.path.join(CACHE_DIR, "recording.tar.xz")
CORE_FILE_PATH    = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_core.json")
TAXO_FILE_PATH    = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_taxonomy.json")
SOURCES_FILE_PATH = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_sources.json")
LEDGER_PATH       = os.path.join(OUTPUT_DIR, f"volume_{TARGET_VOLUME}_state.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CACHE_DIR,  exist_ok=True)

# ===========================================================================
# 3. URL DISCOVERY
# ===========================================================================
def resolve_latest_dump_url() -> str:
    print("🔍 Scanning MetaBrainz index for recording dump...")
    headers = {"User-Agent": "Fangorn-Pipeline/1.0"}
    try:
        r = requests.get(MB_BASE_DUMP_URL, headers=headers, timeout=DOWNLOAD_TIMEOUT)
        r.raise_for_status()
        dirs = sorted(re.findall(r'href="([0-9]{8}-[0-9]{6})/?"', r.text), reverse=True)
        for d in dirs:
            url = f"{MB_BASE_DUMP_URL}{d}/recording.tar.xz"
            if requests.head(url, headers=headers, timeout=DOWNLOAD_TIMEOUT).status_code == 200:
                print(f"🎯 Found: {url}")
                return url
    except Exception as e:
        print(f"⚠️  Discovery error: {e}")
    fallback = f"{MB_BASE_DUMP_URL}latest/recording.tar.xz"
    print(f"ℹ️  Using fallback: {fallback}")
    return fallback

# ===========================================================================
# 4. RESUMABLE DOWNLOADER
#    Uses HTTP Range requests to resume a partial download.
#    The recording dump is 3-5 GB; a one-shot stream reliably times out
#    mid-transfer. This downloads to disk first, then processes locally —
#    zero timeout risk during extraction, and safe to Ctrl-C and restart.
# ===========================================================================
def download_with_resume(url: str, dest: str) -> None:
    headers = {"User-Agent": "Fangorn-Pipeline/1.0"}
    existing = os.path.getsize(dest) if os.path.exists(dest) else 0

    # Ask server for total size
    head = requests.head(url, headers=headers, timeout=DOWNLOAD_TIMEOUT)
    total = int(head.headers.get("Content-Length", 0))

    if existing and existing == total:
        print(f"✅ Already fully downloaded ({total / 1e9:.2f} GB): {dest}")
        return

    if existing:
        print(f"⏩ Resuming download from byte {existing:,} / {total:,}")
        headers["Range"] = f"bytes={existing}-"
        mode = "ab"
    else:
        print(f"📥 Starting download ({total / 1e9:.2f} GB) → {dest}")
        mode = "wb"

    with requests.get(url, headers=headers, stream=True, timeout=DOWNLOAD_TIMEOUT) as r:
        # 206 = Partial Content (resume OK), 200 = server ignored Range (restart)
        if r.status_code == 200 and existing:
            print("⚠️  Server doesn't support Range — restarting from zero")
            existing = 0
            mode = "wb"
        elif r.status_code not in (200, 206):
            raise RuntimeError(f"HTTP {r.status_code} downloading {url}")

        written = existing
        with open(dest, mode) as f:
            for chunk in r.iter_content(chunk_size=NETWORK_CHUNK_SIZE):
                if chunk:
                    f.write(chunk)
                    written += len(chunk)
                    pct = (written / total * 100) if total else 0
                    print(
                        f"   📡 {written/1e9:.2f} / {total/1e9:.2f} GB  ({pct:.1f}%)",
                        end="\r", flush=True,
                    )

    print(f"\n✅ Download complete: {written/1e9:.2f} GB")

# ===========================================================================
# 5. TAR LINE ITERATOR  (reads from local file — no stream timeouts)
# ===========================================================================
def _iter_recording_lines(xz_path: str) -> Iterator[bytes]:
    print(f"📂 Opening local archive: {xz_path}")
    with lzma.open(xz_path, format=lzma.FORMAT_AUTO) as xz_stream:
        with tarfile.open(fileobj=xz_stream, mode="r|") as tar:
            for member in tar:
                if member.name in ("mbdump/recording", "recording"):
                    print(f"   🎯 Member found: '{member.name}' — streaming lines...")
                    f = tar.extractfile(member)
                    if f is None:
                        raise RuntimeError(f"extractfile returned None for {member.name}")
                    lines_yielded = 0
                    for raw_line in f:
                        raw_line = raw_line.strip()
                        if raw_line:
                            lines_yielded += 1
                            yield raw_line
                    print(f"\n   ✅ Exhausted member: {lines_yielded:,} raw lines read")
                    return
            raise RuntimeError(
                "mbdump/recording not found in tar. "
                "Members present: " + str([m.name for m in tar])
            )

# ===========================================================================
# 6. HELPERS
# ===========================================================================
def _extract_spotify_id(url_res: str) -> str:
    if not url_res:
        return None
    m = re.search(r'(?:spotify\.com/track/|spotify:track:)([a-zA-Z0-9]+)', url_res)
    return m.group(1) if m else None


def _parse_artist_credit(credits: list) -> str:
    parts = []
    for seg in credits:
        if not isinstance(seg, dict):
            continue
        if "artist" in seg:
            name = seg.get("name") or seg["artist"].get("name", "")
            if name:
                parts.append(name)
            jp = seg.get("joinphrase", "")
            if jp and parts:
                parts[-1] += jp
    return "".join(parts).strip()


def _pick_best_release(releases: list) -> dict:
    if not releases:
        return {}
    TYPE_RANK = {"Album": 0, "EP": 1, "Single": 2, "Other": 3, "": 4}
    def sort_key(r):
        rg = r.get("release-group") or {}
        score = TYPE_RANK.get(rg.get("primary-type", ""), 4)
        date  = (r.get("date") or "")[:10].ljust(10, "9")
        return (score, date)
    return sorted(releases, key=sort_key)[0]


def _collect_tags(rec: dict) -> list:
    seen = {}
    for field in ("genres", "tags"):
        for tag_obj in (rec.get(field) or []):
            if not isinstance(tag_obj, dict):
                continue
            name = tag_obj.get("name", "").strip()
            if not name:
                continue
            count = tag_obj.get("count", 1)
            seen[name] = seen.get(name, 0) + count
    filtered = [(n, c) for n, c in seen.items() if c >= MIN_TAG_VOTES]
    filtered.sort(key=lambda x: -x[1])
    return [n.title() for n, _ in filtered]

# ===========================================================================
# 7. MAIN DATA STREAM
# ===========================================================================
def fetch_raw_data_stream() -> Iterator[Dict[str, Any]]:
    raw_total = 0
    skipped_no_title  = 0
    skipped_no_artist = 0
    skipped_no_tags   = 0
    parse_errors      = 0

    for raw_line in _iter_recording_lines(LOCAL_XZ_PATH):
        raw_total += 1

        try:
            rec = json.loads(raw_line)
        except Exception:
            parse_errors += 1
            continue

        title = rec.get("title", "").strip()
        if not title:
            skipped_no_title += 1
            continue

        artist = _parse_artist_credit(rec.get("artist-credit") or [])
        if not artist:
            skipped_no_artist += 1
            continue

        genres = _collect_tags(rec)
        if REQUIRE_TAXONOMY and not genres:
            skipped_no_tags += 1
            continue

        isrcs     = rec.get("isrcs") or []
        isrc      = isrcs[0] if isrcs else None

        spotify_id = None
        for rel in (rec.get("relations") or []):
            if isinstance(rel, dict):
                sid = _extract_spotify_id((rel.get("url") or {}).get("resource", ""))
                if sid:
                    spotify_id = sid
                    break

        best  = _pick_best_release(rec.get("releases") or [])
        album = best.get("title", "") or None
        date  = (best.get("date") or "")
        year  = date[:4] if len(date) >= 4 else None
        length = rec.get("length")

        # Periodic diagnostics so you can see the filter breakdown live
        if raw_total % 100_000 == 0:
            print(
                f"\n   📊 {raw_total:,} inspected | "
                f"no_title={skipped_no_title:,} no_artist={skipped_no_artist:,} "
                f"no_tags={skipped_no_tags:,} parse_err={parse_errors:,}",
                flush=True,
            )

        yield {
            "title":      title,
            "artist":     artist,
            "isrc":       isrc,
            "album":      album,
            "year":       year,
            "duration":   str(length) if length else None,
            "genres":     genres[:5],
            "spotify_id": spotify_id,
            "_mbid":      rec.get("id"),
            "_raw_index_checkpoint": raw_total,
        }

# ===========================================================================
# 8. STATE MANAGEMENT
# ===========================================================================
def load_pipeline_state() -> dict:
    if os.path.exists(LEDGER_PATH):
        try:
            with open(LEDGER_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {"last_processed_index": 0, "total_written_tracks": 0, "complete": False}


def save_pipeline_state(index: int, written: int, complete: bool = False):
    with open(LEDGER_PATH, "w") as f:
        json.dump({"last_processed_index": index, "total_written_tracks": written, "complete": complete}, f)

# ===========================================================================
# 9. PIPELINE ENGINE
# ===========================================================================
def run_bounded_pipeline():
    # Step 1: ensure the file is fully on disk
    url = resolve_latest_dump_url()
    download_with_resume(url, LOCAL_XZ_PATH)

    # Step 2: check state
    state = load_pipeline_state()
    if state["complete"]:
        print(f"🎉 Volume {TARGET_VOLUME} already complete ({state['total_written_tracks']:,} tracks).")
        return

    if os.path.exists(CORE_FILE_PATH) and state["total_written_tracks"] == 0:
        print("🧹 Clearing stale outputs...")
        for p in (CORE_FILE_PATH, TAXO_FILE_PATH, SOURCES_FILE_PATH, LEDGER_PATH):
            if os.path.exists(p):
                os.remove(p)

    written_count = state["total_written_tracks"]
    seen_ids = set()

    f_core = open(CORE_FILE_PATH, "w", encoding="utf-8")
    f_taxo = open(TAXO_FILE_PATH, "w", encoding="utf-8")
    f_src  = open(SOURCES_FILE_PATH, "w", encoding="utf-8")
    for f in (f_core, f_taxo, f_src):
        f.write("[\n")

    is_first_core = True
    is_first_src  = True

    print(f"\n🔥 Processing — target: {TARGET_TRACK_COUNT:,} tracks")

    try:
        for item in fetch_raw_data_stream():
            tid = hashlib.sha256(
                f"{item['artist'].lower()}:{item['title'].lower()}".encode()
            ).hexdigest()[:24]

            if tid in seen_ids:
                continue
            seen_ids.add(tid)

            core = {
                "name": tid,
                "fields": {
                    "schemaVersion": 1,
                    "trackId":       tid,
                    "isrcCode":      item["isrc"],
                    "title":         item["title"],
                    "byArtist":      item["artist"],
                    "albumName":     item["album"],
                    "datePublished": item["year"],
                    "durationMs":    int(item["duration"]) if item.get("duration") and item["duration"].isdigit() else None,
                    "contributors":  [],
                    "_mbid":         item["_mbid"],
                }
            }
            taxo = {
                "name": tid,
                "fields": {
                    "schemaVersion": 1,
                    "trackId":  tid,
                    "genres":   item["genres"],
                    "moods":    [],
                    "themes":   [],
                    "contexts": [],
                }
            }

            sep = "" if is_first_core else ",\n"
            f_core.write(f"{sep}  {json.dumps(core, ensure_ascii=False)}")
            f_taxo.write(f"{sep}  {json.dumps(taxo, ensure_ascii=False)}")
            if is_first_core:
                is_first_core = False

            if item["spotify_id"]:
                src = {"trackId": tid, "platform": "spotify", "platformId": item["spotify_id"]}
                src_sep = "" if is_first_src else ",\n"
                f_src.write(f"{src_sep}  {json.dumps(src, ensure_ascii=False)}")
                if is_first_src:
                    is_first_src = False

            written_count += 1
            print(
                f" 🚀 {written_count:>7,} | {item['artist'][:22]:<22} — {item['title'][:22]:<22} | {item['genres']}",
                flush=True,
            )

            f_core.flush()
            f_taxo.flush()
            f_src.flush()

            if written_count % 500 == 0:
                save_pipeline_state(item["_raw_index_checkpoint"], written_count)

            if written_count >= TARGET_TRACK_COUNT:
                break

    except KeyboardInterrupt:
        print("\n🛑 Interrupted — progress saved.")
    finally:
        for f in (f_core, f_taxo, f_src):
            f.write("\n]")
            f.close()
        save_pipeline_state(0, written_count, complete=(written_count >= TARGET_TRACK_COUNT))
        print(f"\n📊 Done. Tracks written: {written_count:,}")


if __name__ == "__main__":
    run_bounded_pipeline()