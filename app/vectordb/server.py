import certifi
import os
import io
import sys
os.environ['SSL_CERT_FILE'] = certifi.where()
import argparse
import asyncio
import aiohttp
import random
import chromadb
import hashlib
import json
import requests
import uvicorn
from chromadb.utils import embedding_functions
from fastapi import FastAPI, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from chromadb.config import Settings
from pydantic import BaseModel

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ---------------------------------------------------------------------------
# ARGS
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Fangorn ChromaDB ingestion server",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--schema", "-s",
        metavar="NAME=0x...",
        action="append",
        dest="schemas",
        default=[],
    )
    parser.add_argument("--primary", "-p", metavar="NAME", default=None)
    parser.add_argument(
        "--subgraph-url",
        default="https://api.studio.thegraph.com/query/1745244/sond-3-r/version/latest",
    )
    parser.add_argument("--graph-api-key",      default="",                                    help="The Graph gateway API key")
    parser.add_argument("--ipfs-gateway",       default="https://gateway.pinata.cloud/ipfs")
    parser.add_argument("--chroma-path",        default="./db/sond3r")
    parser.add_argument("--checkpoint-file",    default="./db/ingest_checkpoint.json")
    parser.add_argument("--collection",         default="fangorn")
    parser.add_argument("--searchable-fields",  default="trackId,title,byArtist,genres,moods,themes,contexts")
    parser.add_argument("--page-size",          type=int, default=100)
    parser.add_argument("--ipfs-timeout",       type=int, default=20)
    parser.add_argument("--concurrency",        type=int, default=16)
    parser.add_argument("--host",               default="0.0.0.0")
    parser.add_argument("--port",               type=int, default=8080)
    parser.add_argument("--reset",              action="store_true", default=False)
    parser.add_argument("--embedding-model",    default="default",                              help="Embedding model type ('default' for local MiniLM)")
    return parser.parse_args()

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

cfg: argparse.Namespace = None

def get_schemas() -> dict[str, str]:
    schemas = {}
    for pair in cfg.schemas:
        if "=" not in pair:
            raise ValueError(f"--schema must be NAME=0x..., got: {pair!r}")
        name, schema_id = pair.split("=", 1)
        schemas[name.strip()] = schema_id.strip()
    if not schemas:
        raise ValueError("At least one --schema NAME=0x... is required")
    return schemas

def get_primary(schemas: dict[str, str]) -> str:
    if cfg.primary:
        if cfg.primary not in schemas:
            raise ValueError(f"--primary '{cfg.primary}' not found in --schema keys: {list(schemas.keys())}")
        return cfg.primary
    return next(iter(schemas))

def get_searchable_fields() -> set[str]:
    return set(f.strip() for f in cfg.searchable_fields.split(",") if f.strip())

ef_global:       object | None = None
collection:      object | None = None
debug_secondary: dict         = {}

# ---------------------------------------------------------------------------
# CATALOG MAP CACHE
# ---------------------------------------------------------------------------

_map_cache:     dict | None = None
_map_computing: bool        = False

# In-memory lexical search index (built lazily, invalidated on ingest)
_text_index:    list[dict] | None = None

def _build_map_sync() -> dict:
    try:
        import umap as umap_lib
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("umap-learn is not installed. Run: pip install umap-learn") from exc

    col   = collection
    total = col.count()
    print(f"[catalog/map] building projection for {total} tracks …")
    if total == 0:
        return {"tracks": [], "total": 0, "genres": []}

    BATCH      = 5_000
    embeddings: list = []
    metas:      list = []
    ids:        list = []

    for offset in range(0, total, BATCH):
        result = col.get(
            include=["embeddings", "metadatas"],
            limit=BATCH,
            offset=offset,
        )
        batch_emb  = result.get("embeddings")
        batch_meta = result.get("metadatas")
        batch_ids  = result.get("ids")
        if batch_emb  is None: batch_emb  = []
        if batch_meta is None: batch_meta = []
        if batch_ids  is None: batch_ids  = []
        embeddings.extend(batch_emb)
        metas.extend(batch_meta)
        ids.extend(batch_ids)

    if len(embeddings) == 0:
        return {"tracks": [], "total": 0, "genres": []}

    emb_np = np.array(embeddings, dtype=np.float32)
    n      = len(emb_np)
    print(f"[catalog/map] running UMAP on {n} × {emb_np.shape[1]} matrix …")

    reducer = umap_lib.UMAP(
        n_components = 2,
        n_neighbors  = min(15, n - 1),
        min_dist     = 0.05,
        metric       = "cosine",
        random_state = 42,
        low_memory   = True,
        verbose      = False,
    )
    proj = reducer.fit_transform(emb_np)

    for axis in range(2):
        mn, mx = float(proj[:, axis].min()), float(proj[:, axis].max())
        rng = mx - mn if mx != mn else 1.0
        proj[:, axis] = (proj[:, axis] - mn) / rng * 2 - 1

    tracks:          list = []
    genre_positions: dict = {}

    for meta, doc_id, pos in zip(metas, ids, proj):
        m           = meta or {}
        payload_str = m.get("payload", "{}")
        try:
            payload = json.loads(payload_str) if isinstance(payload_str, str) else {}
        except json.JSONDecodeError:
            payload = {}

        genres = payload.get("genres", [])
        if not isinstance(genres, list):
            genres = []
        moods = payload.get("moods", [])
        if not isinstance(moods, list):
            moods = []

        px, py = float(pos[0]), float(pos[1])

        tracks.append({
            "id":     doc_id,
            "title":  payload.get("title")    or payload.get("name")     or doc_id,
            "artist": payload.get("byArtist") or payload.get("artist")   or "",
            "genres": genres[:3],
            "moods":  moods[:3],
            "px":     px,
            "py":     py,
        })

        if genres:
            g = genres[0]
            genre_positions.setdefault(g, []).append((px, py))

    genre_centroids = []
    for genre, pts in genre_positions.items():
        if len(pts) < 5:
            continue
        arr = np.array(pts)
        genre_centroids.append({
            "genre": genre,
            "px":    float(arr[:, 0].mean()),
            "py":    float(arr[:, 1].mean()),
            "count": len(pts),
        })
    genre_centroids.sort(key=lambda x: -x["count"])

    print(f"[catalog/map] done — {len(tracks)} tracks, {len(genre_centroids)} genre labels")
    return {"tracks": tracks, "total": len(tracks), "genres": genre_centroids[:40]}

# ---------------------------------------------------------------------------
# TEXT (LEXICAL) SEARCH — in-memory ranked index over payloads
# ---------------------------------------------------------------------------

def _build_text_index_sync() -> list[dict]:
    col   = collection
    total = col.count()
    if total == 0:
        return []
    BATCH = 5_000
    out: list[dict] = []
    for offset in range(0, total, BATCH):
        res   = col.get(include=["metadatas"], limit=BATCH, offset=offset)
        ids   = res.get("ids") or []
        metas = res.get("metadatas") or []
        for doc_id, meta in zip(ids, metas):
            m = meta or {}
            try:
                payload = json.loads(m.get("payload", "{}"))
            except json.JSONDecodeError:
                payload = {}

            def _list(key):
                v = payload.get(key)
                return v if isinstance(v, list) else []

            artist = str(payload.get("byArtist") or payload.get("artist") or "")
            title  = str(payload.get("title")    or payload.get("name")   or "")
            genres, moods    = _list("genres"), _list("moods")
            themes, contexts = _list("themes"), _list("contexts")

            out.append({
                "id":         doc_id,
                "owner":      m.get("owner"),
                "byArtist":   artist,
                "title":      title,
                "isrcCode":   payload.get("isrcCode") or payload.get("isrc"),
                "durationMs": payload.get("durationMs") or payload.get("duration"),
                "genres":     genres, "moods": moods, "themes": themes, "contexts": contexts,
                "_artist_l":  artist.lower(),
                "_title_l":   title.lower(),
                "_tags_l":    " ".join(str(t).lower() for t in (*genres, *moods, *themes, *contexts)),
            })
    print(f"[search/text] built lexical index: {len(out)} tracks")
    return out


def _score_rec(rec: dict, q_l: str, tokens: list[str]) -> float:
    a, t, tags = rec["_artist_l"], rec["_title_l"], rec["_tags_l"]
    score = 0.0
    # artist match — the strongest signal for "the beatles"
    if   a == q_l:          score += 1000
    elif a.startswith(q_l): score += 400
    elif q_l and q_l in a:  score += 220
    # title match
    if   t == q_l:          score += 350
    elif t.startswith(q_l): score += 160
    elif q_l and q_l in t:  score += 120
    # per-token coverage over artist+title, plus a light tag bonus
    if tokens:
        hay = f"{a} {t}"
        score += 60 * (sum(1 for tok in tokens if tok in hay) / len(tokens))
        score += 12 * (sum(1 for tok in tokens if tok in tags) / len(tokens))
    return score


def _search_text_sync(q: str, limit: int, owner: str | None) -> list[dict]:
    global _text_index
    if _text_index is None:
        _text_index = _build_text_index_sync()

    q_l    = q.strip().lower()
    tokens = [tok for tok in q_l.split() if tok]
    recs   = _text_index if not owner else [r for r in _text_index if r.get("owner") == owner]

    scored = [(s, r) for r in recs if (s := _score_rec(r, q_l, tokens)) > 0]
    scored.sort(key=lambda x: (-x[0], x[1]["byArtist"].lower(), x[1]["title"].lower()))

    return [{
        "id":         r["id"],
        "byArtist":   r["byArtist"],
        "title":      r["title"],
        "isrcCode":   r["isrcCode"],
        "durationMs": r["durationMs"],
        "genres":     r["genres"], "moods": r["moods"],
        "themes":     r["themes"], "contexts": r["contexts"],
    } for _, r in scored[:limit]]


def _attach_embeddings(results: list[dict]) -> list[dict]:
    """One batched Chroma get so the frontend opens articles without a re-embed round-trip."""
    ids = [r["id"] for r in results]
    if not ids:
        return results
    got   = collection.get(ids=ids, include=["embeddings"])
    g_ids = got.get("ids") if got.get("ids") is not None else []
    g_emb = got.get("embeddings") if got.get("embeddings") is not None else []
    emap  = {gid: (e.tolist() if hasattr(e, "tolist") else e) for gid, e in zip(g_ids, g_emb)}
    for r in results:
        e = emap.get(r["id"])
        if e is not None:
            r["embedding"] = e
    return results

# ---------------------------------------------------------------------------
# CHECKPOINT
# ---------------------------------------------------------------------------

def _load_checkpoint() -> dict[str, dict[str, int]]:
    try:
        with open(cfg.checkpoint_file) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _save_checkpoint(checkpoint: dict[str, dict[str, int]]) -> None:
    os.makedirs(os.path.dirname(cfg.checkpoint_file) or ".", exist_ok=True)
    with open(cfg.checkpoint_file, "w") as f:
        json.dump(checkpoint, f)

def _clear_checkpoint() -> None:
    try:
        os.remove(cfg.checkpoint_file)
    except FileNotFoundError:
        pass

# ---------------------------------------------------------------------------
# MODELS
# ---------------------------------------------------------------------------

class EmbedRequest(BaseModel):
    text:  str | None       = None
    texts: list[str] | None = None

class VectorSearchRequest(BaseModel):
    embedding: list[float]
    n_results: int        = 20
    owner:     str | None = None

class TextSearchRequest(BaseModel):
    q:     str
    limit: int        = 60
    owner: str | None = None

# ---------------------------------------------------------------------------
# TRACK ID RESOLUTION
# ---------------------------------------------------------------------------

def _compute_track_id(artist: str, title: str) -> str:
    return hashlib.sha256(f"{artist}:{title}".encode()).hexdigest()[:24]

def _track_id(entry: dict) -> str:
    fields = entry.get("fields", {}) or {}

    for key in ["trackId", "track_id", "id", "contentId", "dataCid"]:
        val = fields.get(key)
        if val and isinstance(val, str):
            val_clean = val.strip().removeprefix("track:")
            if val_clean and not val_clean.startswith("chunk:"):
                return val_clean

    for nest_key in ["content", "data", "metadata", "properties", "track"]:
        nest = fields.get(nest_key)
        if isinstance(nest, dict):
            for key in ["trackId", "track_id", "id", "contentId"]:
                val = nest.get(key)
                if val and isinstance(val, str):
                    val_clean = val.strip().removeprefix("track:")
                    if val_clean and not val_clean.startswith("chunk:"):
                        return val_clean

    artist = str(fields.get("byArtist") or fields.get("artist") or "").strip()
    title  = str(fields.get("title") or fields.get("name") or "").strip()
    if artist and title and not title.startswith("chunk:"):
        return _compute_track_id(artist, title)

    name = entry.get("name", "").strip().removeprefix("track:")
    if not name or name.startswith("chunk:"):
        leaf = fields.get("leaf")
        if leaf and isinstance(leaf, str):
            return leaf.strip()
    return name

# ---------------------------------------------------------------------------
# SUBGRAPH
# ---------------------------------------------------------------------------

PUBLISHES_QUERY = """
query Publishes($schemaId: Bytes!, $first: Int!, $skip: Int!) {
  manifestPublisheds(
    where: { schemaId: $schemaId }
    first: $first skip: $skip
    orderBy: blockNumber orderDirection: asc
  ) { id owner schemaId nameHash name manifestCid blockNumber blockTimestamp transactionHash }
}
"""

UPDATES_QUERY = """
query Updates($schemaId: Bytes!, $first: Int!, $skip: Int!) {
  manifestUpdateds(
    where: { schemaId: $schemaId }
    first: $first skip: $skip
    orderBy: version orderDirection: desc
  ) { id owner schemaId nameHash manifestCid version blockNumber blockTimestamp transactionHash }
}
"""

# Transient subgraph failures (dropped keep-alive connections, gateway 5xx,
# rate limits) should be retried with backoff rather than aborting the whole
# ingest. GraphQL-level errors and 4xx are NOT retried — they won't fix themselves.
_SUBGRAPH_MAX_RETRIES = 5
_SUBGRAPH_RETRY_STATUSES = {429, 500, 502, 503, 504}

async def _query_subgraph_async(session: aiohttp.ClientSession, query: str, variables: dict) -> dict:
    headers = {}
    if cfg.graph_api_key:
        headers["Authorization"] = f"Bearer {cfg.graph_api_key}"

    body = {"query": query, "variables": variables}
    last_exc: Exception | None = None

    for attempt in range(_SUBGRAPH_MAX_RETRIES):
        try:
            async with session.post(
                cfg.subgraph_url, json=body, headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status in _SUBGRAPH_RETRY_STATUSES:
                    raise aiohttp.ClientResponseError(
                        resp.request_info, resp.history,
                        status=resp.status, message=f"retryable status {resp.status}",
                    )
                resp.raise_for_status()
                data = await resp.json()
                if "errors" in data:
                    # A real query error — not transient. Do not retry.
                    raise RuntimeError(f"Subgraph error: {data['errors']}")
                return data["data"]
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            # Non-retryable HTTP status (e.g. 400/401) → give up immediately.
            if isinstance(exc, aiohttp.ClientResponseError) and exc.status not in _SUBGRAPH_RETRY_STATUSES:
                raise
            last_exc = exc
            if attempt < _SUBGRAPH_MAX_RETRIES - 1:
                backoff = min(8.0, 0.5 * (2 ** attempt)) + random.uniform(0, 0.3)
                print(f"  [subgraph] {type(exc).__name__} — retry {attempt + 1}/{_SUBGRAPH_MAX_RETRIES - 1} in {backoff:.1f}s")
                await asyncio.sleep(backoff)
                continue
            raise

    # Unreachable, but keeps type checkers happy.
    raise last_exc if last_exc else RuntimeError("subgraph query failed")

async def _fetch_all_events_async(session: aiohttp.ClientSession, schema_id: str) -> tuple[list, list]:
    publishes, updates = [], []
    for target, query, key in [(publishes, PUBLISHES_QUERY, "manifestPublisheds"), (updates, UPDATES_QUERY, "manifestUpdateds")]:
        skip = 0
        while True:
            data = await _query_subgraph_async(session, query, {"schemaId": schema_id, "first": cfg.page_size, "skip": skip})
            batch = data.get(key, [])
            target.extend(batch)
            if len(batch) < cfg.page_size:
                break
            skip += cfg.page_size
    return publishes, updates

# ---------------------------------------------------------------------------
# IPFS — resilient fetch with gateway rotation & backoff
# ---------------------------------------------------------------------------

FALLBACK_GATEWAYS = [
    "https://cloudflare-ipfs.com/ipfs",
    "https://ipfs.io/ipfs",
    "https://w3s.link/ipfs",
    "https://dweb.link/ipfs",
]

async def _fetch_json(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    cid: str,
) -> tuple[str, any]:
    async with sem:
        gateways = [cfg.ipfs_gateway.rstrip("/")] + FALLBACK_GATEWAYS

        for index, base_url in enumerate(gateways):
            url = f"{base_url}/{cid}"

            if index > 0:
                await asyncio.sleep(0.25 * index)

            try:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=cfg.ipfs_timeout),
                ) as resp:
                    if resp.status == 429:
                        continue
                    resp.raise_for_status()
                    text_content = await resp.text()
                    return cid, json.loads(text_content)
            except Exception as e:
                if index == len(gateways) - 1:
                    print(f"  [error] All gateways exhausted for CID {cid[:20]}…: {e}")
                continue

        return cid, None

async def fetch_all_ipfs(cids: list[str]) -> dict[str, any]:
    if not cids:
        return {}
    sem = asyncio.Semaphore(cfg.concurrency)
    async with aiohttp.ClientSession() as session:
        tasks = []
        for cid in cids:
            tasks.append(_fetch_json(session, sem, cid))
        results = await asyncio.gather(*tasks)
    return dict(results)

# ---------------------------------------------------------------------------
# PER-SCHEMA FETCH + NESTED DATA RESOLUTION
# ---------------------------------------------------------------------------

def _build_seen_cids(publishes: list, updates: list) -> dict[str, dict]:
    seen: dict[str, dict] = {}
    for p in publishes:
        cid, ts = p["manifestCid"], int(p["blockTimestamp"])
        if cid not in seen or ts > seen[cid]["blockTimestamp"]:
            seen[cid] = {
                "owner":          p["owner"],
                "nameHash":       p["nameHash"],
                "name":           p["name"],
                "manifestCid":    cid,
                "version":        0,
                "blockTimestamp": ts,
            }
    for u in updates:
        cid, ts = u["manifestCid"], int(u["blockTimestamp"])
        if cid not in seen or ts > seen[cid]["blockTimestamp"]:
            seen[cid] = {
                "owner":          u["owner"],
                "nameHash":       u["nameHash"],
                "name":           u.get("name", u["nameHash"]),
                "manifestCid":    cid,
                "version":        int(u["version"]),
                "blockTimestamp": ts,
            }
    return seen

def _dedup_entries(all_entries: list) -> list:
    best:   dict[str, dict] = {}
    no_key: list[dict]      = []
    for item in all_entries:
        key = _track_id(item["entry"])
        if not key:
            no_key.append(item)
            continue
        ts = item["meta"]["blockTimestamp"]
        if key not in best or ts > best[key]["meta"]["blockTimestamp"]:
            best[key] = item
    return list(best.values()) + no_key

async def fetch_schema_entries(
    session: aiohttp.ClientSession,
    schema_name: str,
    schema_id:   str,
    prior_checkpoint: dict[str, int],
) -> tuple[list[dict], dict[str, int]]:
    publishes, updates = await _fetch_all_events_async(session, schema_id)
    print(f"  [{schema_name}] subgraph: {len(publishes)} publishes, {len(updates)} updates")

    seen_cids = _build_seen_cids(publishes, updates)
    print(f"  [{schema_name}] unique manifest CIDs: {len(seen_cids)}")

    new_cids = [
        cid for cid, meta in seen_cids.items()
        if prior_checkpoint.get(cid, -1) < meta["blockTimestamp"]
    ]
    skip_count = len(seen_cids) - len(new_cids)
    print(f"  [{schema_name}] IPFS: {len(new_cids)} manifests to fetch, {skip_count} unchanged (skipped)")

    fresh_manifests = await fetch_all_ipfs(new_cids)

    chunk_refs: list[dict] = []

    for cid, manifest_json in fresh_manifests.items():
        if not manifest_json:
            continue
        meta    = seen_cids[cid]
        entries = manifest_json.get("entries", [])
        for entry in entries:
            fields = entry.get("fields", {}) or {}
            dcid   = fields.get("dataCid")
            if dcid and isinstance(dcid, str):
                chunk_refs.append({"dataCid": dcid, "meta": meta})

    unique_data_cids = list({ref["dataCid"] for ref in chunk_refs})
    print(f"  [{schema_name}] Deep IPFS: Resolving {len(unique_data_cids)} unique chunk files...")

    resolved_payloads = await fetch_all_ipfs(unique_data_cids)
    failed_cids       = [c for c, p in resolved_payloads.items() if p is None]

    if failed_cids:
        print(f"  [retry] Retrying {len(failed_cids)} failed chunk fetches via backup gateway sequence...")
        await asyncio.sleep(1.5)
        retry_payloads = await fetch_all_ipfs(failed_cids)
        resolved_payloads.update({k: v for k, v in retry_payloads.items() if v is not None})

    failed_count = sum(1 for v in resolved_payloads.values() if v is None)
    if failed_count > 0:
        print(f"  [warn] {failed_count} chunk payloads failed to resolve completely.")

    sample_printed = False
    all_entries: list[dict] = []
    chunks_processed = 0
    records_extracted = 0

    for ref in chunk_refs:
        dcid    = ref["dataCid"]
        meta    = ref["meta"]
        payload = resolved_payloads.get(dcid)
        if not payload:
            continue

        chunks_processed += 1

        records: list = []
        if isinstance(payload, list):
            records = [r for r in payload if isinstance(r, dict)]
        elif isinstance(payload, dict):
            if "track" in payload and isinstance(payload["track"], dict):
                records = [{"fields": payload["track"]}]
            elif "fields" in payload and isinstance(payload["fields"], dict):
                records = [payload]
            else:
                records = [{"fields": payload}]

        if not sample_printed and records:
            first = records[0]
            first_fields = first.get("fields", first) if isinstance(first, dict) else {}
            print(f"\n{'*' * 50}")
            print(f"[DEBUG] Chunk {dcid[:20]}… contains {len(records)} records")
            print(f"[DEBUG] First record fields: {list(first_fields.keys()) if isinstance(first_fields, dict) else type(first_fields)}")
            print(f"{'*' * 50}\n")
            sample_printed = True

        for record in records:
            if "fields" in record and isinstance(record["fields"], dict):
                entry = record
            else:
                entry = {"name": record.get("name", ""), "fields": record}

            fields = entry.get("fields", {}) or {}
            for primary_id_key in ["trackId", "track_id", "id", "contentId"]:
                if primary_id_key in fields and fields[primary_id_key]:
                    fields["trackId"] = str(fields[primary_id_key]).strip().removeprefix("track:")
                    break
            entry["fields"] = fields

            all_entries.append({"entry": entry, "meta": meta})
            records_extracted += 1

    print(f"  [{schema_name}] flattened {chunks_processed} chunks into {records_extracted} records")

    new_checkpoint: dict[str, int] = dict(prior_checkpoint)
    for cid, meta in seen_cids.items():
        new_checkpoint[cid] = meta["blockTimestamp"]

    deduped = _dedup_entries(all_entries)
    print(f"  [{schema_name}] processing complete: {len(deduped)} active records parsed.")

    return deduped, new_checkpoint

# ---------------------------------------------------------------------------
# JOIN + DOCUMENT BUILD
# ---------------------------------------------------------------------------

def _flatten_fields(fields: dict) -> dict:
    out = {}
    for k, v in fields.items():
        if isinstance(v, dict) and v.get("@type") == "handle":
            out[k] = v.get("uri", "")
        elif isinstance(v, (str, int, float, bool, list)) or v is None:
            out[k] = v
    return out

TAG_FIELDS   = {"genres", "moods", "themes", "contexts"}
TRACK_FIELDS = {"title", "byArtist"}

def _build_searchable_text(fields: dict) -> str:
    searchable = get_searchable_fields()

    tag_terms: list[str] = []
    for key in TAG_FIELDS & searchable:
        val = fields.get(key)
        if isinstance(val, list):
            tag_terms.extend(str(v) for v in val if v)
        elif val:
            tag_terms.append(str(val))

    track_terms: list[str] = []
    for key in (searchable - TAG_FIELDS):
        val = fields.get(key)
        if isinstance(val, list):
            track_terms.extend(str(v) for v in val if v)
        elif val:
            track_terms.append(str(val))

    parts: list[str] = []
    if tag_terms:
        tag_text = " ".join(tag_terms)
        parts.append(tag_text)
        parts.append(tag_text)
    parts.extend(track_terms)

    return " ".join(parts) or "music"

def join_records(entries_by_schema: dict[str, list[dict]], primary: str) -> list[dict]:
    primary_entries = entries_by_schema.get(primary, [])
    if not primary_entries:
        print(f"  [warn] primary schema '{primary}' has no entries — nothing to join")
        return []

    if primary_entries:
        sample = primary_entries[0]["entry"]
        print("\n" + "!" * 50)
        print("[DEBUG] CRITICAL ENTRY INSPECTION")
        print(f"  Raw Entry Keys: {list(sample.keys())}")
        print(f"  Raw Entry Name: {sample.get('name')}")
        print(f"  Raw Entry Fields Layout: {list(sample.get('fields', {}).keys())}")
        print(f"  Raw Fields JSON Snapshot: {json.dumps(sample.get('fields', {}))[:300]}...")
        print("!" * 50 + "\n")

    secondary_fields: dict[str, dict] = {}
    for schema_name, entries in entries_by_schema.items():
        if schema_name == primary:
            continue
        for item in entries:
            key = _track_id(item["entry"])
            if not key:
                continue
            flat = _flatten_fields(item["entry"].get("fields", {}))
            if key not in secondary_fields:
                secondary_fields[key] = {}
            secondary_fields[key].update(flat)

    global debug_secondary
    debug_secondary = secondary_fields
    print(f"  [join] secondary index: {len(secondary_fields)} keys")

    joined  = []
    matched = 0
    for item in primary_entries:
        track_id = _track_id(item["entry"])
        if not track_id:
            continue

        core_fields = _flatten_fields(item["entry"].get("fields", {}))
        tag_fields  = secondary_fields.get(track_id, {})
        fields      = {**core_fields, **tag_fields}

        fields["trackId"] = track_id
        doc = _build_searchable_text(fields)

        if tag_fields:
            matched += 1

        joined.append({
            "id":       f"track:{track_id}",
            "document": doc,
            "payload":  json.dumps(fields),
            "metadata": {
                "trackId":        track_id,
                "owner":          item["meta"]["owner"],
                "manifestCid":    item["meta"]["manifestCid"],
                "blockTimestamp": item["meta"]["blockTimestamp"],
                **{f"has_{n}": str(n == primary or bool(tag_fields))
                   for n in entries_by_schema},
            },
        })

    print(f"  [join] {len(joined)} records compiled — {matched} with tags, {len(joined) - matched} unmatched")
    return joined

# ---------------------------------------------------------------------------
# INGESTION WORKERS
# ---------------------------------------------------------------------------

def _embed_and_upsert_batch(col, ef, batch_ids, batch_docs, batch_metas):
    """
    Runs entirely inside the OS ThreadPool to generate vectors once 
    and completely bypass Chroma's internal, slow sequential loop triggers.
    """
    batch_embeddings = ef(batch_docs)
    col.upsert(
        ids=batch_ids,
        embeddings=batch_embeddings,
        documents=batch_docs,
        metadatas=batch_metas,
    )

async def ingest():
    global collection, _map_cache, _text_index
    loop       = asyncio.get_event_loop()
    schemas    = get_schemas()
    primary    = get_primary(schemas)
    checkpoint = _load_checkpoint()

    print(f"\n{'=' * 60}")
    print(f"Ingesting {len(schemas)} schema(s): {list(schemas.keys())}")
    print(f"{'=' * 60}")

    # enable_cleanup_closed mitigates ServerDisconnectedError from stale keep-alive
    # sockets the server closed; limit caps concurrent connections so a burst of
    # schema fetches doesn't get the remote to drop us.
    connector = aiohttp.TCPConnector(limit=16, limit_per_host=8, enable_cleanup_closed=True)
    async with aiohttp.ClientSession(connector=connector) as session:
        results = await asyncio.gather(*[
            fetch_schema_entries(
                session,
                name,
                schema_id,
                checkpoint.get(name, {}),
            )
            for name, schema_id in schemas.items()
        ])

    entries_by_schema:         dict[str, list[dict]]     = {}
    new_checkpoints_by_schema: dict[str, dict[str, int]] = {}
    for (name, _), (entries, new_ckpt) in zip(schemas.items(), results):
        entries_by_schema[name]         = entries
        new_checkpoints_by_schema[name] = new_ckpt

    joined = join_records(entries_by_schema, primary)

    if not joined:
        print("  No records found to update.")
        for name, ckpt in new_checkpoints_by_schema.items():
            checkpoint[name] = ckpt
        _save_checkpoint(checkpoint)
        return

    ids_to_check = [r["id"] for r in joined]
    existing_docs: dict[str, str] = {}

    CHECK_BATCH = 500
    for i in range(0, len(ids_to_check), CHECK_BATCH):
        batch = ids_to_check[i:i + CHECK_BATCH]
        existing_raw = await loop.run_in_executor(
            None,
            lambda b=batch: collection.get(ids=b, include=["documents"]),
        )
        ex_ids  = existing_raw.get("ids") or []
        ex_docs = existing_raw.get("documents") or []
        for eid, edoc in zip(ex_ids, ex_docs):
            existing_docs[eid] = edoc or ""

    changed = [r for r in joined if existing_docs.get(r["id"], "") != r["document"]]
    skipped = len(joined) - len(changed)
    print(f"  Diff: {len(changed)} target changes, {skipped} up-to-date")

    if changed:
        ids       = [r["id"]       for r in changed]
        documents = [r["document"] for r in changed]
        metadatas = [{**r["metadata"], "payload": r["payload"]} for r in changed]

        BATCH = 2000
        for i in range(0, len(ids), BATCH):
            s, e = i, min(i + BATCH, len(ids))
            await loop.run_in_executor(
                None,
                _embed_and_upsert_batch,
                collection,
                ef_global,
                ids[s:e],
                documents[s:e],
                metadatas[s:e]
            )
            print(f"  processed and upserted {e}/{len(ids)}")

    for name, ckpt in new_checkpoints_by_schema.items():
        checkpoint[name] = ckpt
    _save_checkpoint(checkpoint)

    # Invalidate caches after ingest — catalog has changed
    _map_cache  = None
    _text_index = None

    print(f"Ingestion complete. Database context contains {collection.count()} active items.")

# ---------------------------------------------------------------------------
# RESPONSE HELPERS
# ---------------------------------------------------------------------------

def _parse_hits(results: dict, include_embeddings: bool = False) -> list[dict]:
    raw_ids   = results.get("ids")
    raw_docs  = results.get("documents")
    raw_metas = results.get("metadatas")

    if not raw_ids or not raw_docs or not raw_metas:
        return []

    ids   = raw_ids[0]   if isinstance(raw_ids[0],   list) else raw_ids
    docs  = raw_docs[0]  if isinstance(raw_docs[0],  list) else raw_docs
    metas = raw_metas[0] if isinstance(raw_metas[0], list) else raw_metas

    distances  = results.get("distances",  None)
    embeddings = results.get("embeddings", None)
    dist_list  = distances[0]  if distances  else [None] * len(ids)
    emb_list   = embeddings[0] if embeddings else [None] * len(ids)

    hits = []
    for i, doc_id in enumerate(ids):
        meta    = dict(metas[i] or {})
        payload = json.loads(meta.pop("payload", "{}"))
        hit     = {"id": doc_id, "fields": payload, **meta}
        if dist_list[i] is not None:
            hit["score"]    = round(1 - dist_list[i], 4)
            hit["distance"] = dist_list[i]
        if include_embeddings and emb_list[i] is not None:
            raw = emb_list[i]
            hit["embedding"] = raw if isinstance(raw, list) else raw.tolist()
        hits.append(hit)
    return hits

# ---------------------------------------------------------------------------
# APP LIFECYCLE
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global collection, ef_global
    client = chromadb.PersistentClient(
        path=cfg.chroma_path,
        settings=Settings(allow_reset=True),
    )
    if cfg.reset:
        print("[startup] wiping state storage tracking blocks")
        client.reset()
        _clear_checkpoint()

    if cfg.embedding_model == "default":
        import torch
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        print(f"[startup] Loading embedding model on hardware device: {device.upper()}")

        ef_global = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2",
            device=device
        )
    else:
        ef_global = embedding_functions.DefaultEmbeddingFunction()

    collection = client.get_or_create_collection(cfg.collection, embedding_function=ef_global)
    asyncio.create_task(ingest())
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# ROUTES
# ---------------------------------------------------------------------------

@app.get("/browse")
async def browse(limit: int = Query(20), offset: int = Query(0)):
    loop    = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: collection.get(
            limit=limit, offset=offset,
            include=["documents", "metadatas"],
        ),
    )
    return {"results": _parse_hits(results), "total": collection.count()}

@app.get("/search")
async def search(
    q:         str        = Query(...),
    n_results: int        = Query(10),
    owner:     str | None = Query(None),
):
    loop = asyncio.get_event_loop()
    where_filter = {"owner": owner} if owner else None

    results = await loop.run_in_executor(
        None,
        lambda: collection.query(
            query_texts=[q],
            n_results=n_results,
            where=where_filter,
            include=["documents", "metadatas", "distances", "embeddings"],
        ),
    )
    return {"results": _parse_hits(results, include_embeddings=True)}

@app.post("/search/vector")
async def search_vector(body: VectorSearchRequest):
    where   = {"owner": body.owner} if body.owner else None
    loop    = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: collection.query(
            query_embeddings=[body.embedding],
            n_results=body.n_results,
            where=where,
            include=["documents", "metadatas", "distances", "embeddings"],
        ),
    )
    return {"results": _parse_hits(results, include_embeddings=True)}

@app.post("/search/text")
async def search_text(body: TextSearchRequest):
    loop    = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, _search_text_sync, body.q, body.limit, body.owner)
    results = await loop.run_in_executor(None, _attach_embeddings, results)
    return {"results": results}

@app.post("/embed")
async def embed(body: EmbedRequest):
    loop = asyncio.get_event_loop()
    if body.texts:
        vectors = await loop.run_in_executor(None, lambda: ef_global(body.texts))
        return {"embeddings": [v.tolist() for v in vectors]}
    if body.text:
        vectors = await loop.run_in_executor(None, lambda: ef_global([body.text]))
        return {"embedding": vectors[0].tolist()}
    return {"error": "provide 'text' or 'texts'"}

@app.get("/catalog/map")
async def catalog_map():
    global _map_cache, _map_computing

    if _map_cache is not None:
        return _map_cache

    if _map_computing:
        return {"computing": True, "total": 0, "tracks": [], "genres": []}

    _map_computing = True
    loop = asyncio.get_event_loop()
    try:
        _map_cache = await loop.run_in_executor(None, _build_map_sync)
        return _map_cache
    except RuntimeError as e:
        return {"error": str(e), "total": 0, "tracks": [], "genres": []}
    except Exception as e:
        print(f"[catalog/map] error: {e}")
        return {"error": str(e), "total": 0, "tracks": [], "genres": []}
    finally:
        _map_computing = False

@app.post("/catalog/map/refresh")
async def catalog_map_refresh(background_tasks: BackgroundTasks):
    global _map_cache, _map_computing

    async def _refresh():
        global _map_cache, _map_computing
        _map_cache     = None
        _map_computing = True
        loop = asyncio.get_event_loop()
        try:
            _map_cache = await loop.run_in_executor(None, _build_map_sync)
        except Exception as e:
            print(f"[catalog/map/refresh] error: {e}")
        finally:
            _map_computing = False

    background_tasks.add_task(_refresh)
    return {"status": "refresh started", "note": "poll GET /catalog/map for progress"}

@app.get("/debug")
async def debug():
    schemas = get_schemas()
    primary = get_primary(schemas)
    loop    = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: collection.get(include=["metadatas"]),
    )
    metas       = results.get("metadatas") or []
    primary_ids = [m.get("trackId", "") for m in metas if m]
    checkpoint  = _load_checkpoint()
    total_cached_cids = sum(len(v) for v in checkpoint.values())
    return {
        "primary_track_ids":    sorted(primary_ids),
        "secondary_tag_keys":   sorted(debug_secondary.keys()),
        "matched":              sorted(set(primary_ids) & set(debug_secondary.keys())),
        "unmatched_primary":    sorted(set(primary_ids) - set(debug_secondary.keys())),
        "unmatched_tags":       sorted(set(debug_secondary.keys()) - set(primary_ids)),
        "checkpoint_cid_count": total_cached_cids,
        "tag_details": {
            k: {
                "genres":   v.get("genres"),
                "moods":    v.get("moods"),
                "themes":   v.get("themes"),
                "contexts": v.get("contexts"),
            }
            for k, v in debug_secondary.items()
        },
    }

@app.get("/health")
async def health():
    schemas    = get_schemas()
    checkpoint = _load_checkpoint()
    return {
        "status":          "ok",
        "count":           collection.count(),
        "schemas":         schemas,
        "map_cached":      _map_cache is not None,
        "map_computing":   _map_computing,
        "text_indexed":    _text_index is not None,
        "checkpoint_cids": {name: len(cids) for name, cids in checkpoint.items()},
    }

@app.post("/reingest")
async def reingest():
    asyncio.create_task(ingest())
    return {"status": "accepted"}

@app.post("/reingest/full")
async def reingest_full():
    global _map_cache, _text_index
    _clear_checkpoint()
    _map_cache  = None
    _text_index = None
    asyncio.create_task(ingest())
    return {"status": "accepted", "note": "checkpoint cleared — full reingest in progress; caches cleared"}

# ---------------------------------------------------------------------------
# MAIN EXECUTION ENTRYPOINT
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cfg = parse_args()
    uvicorn.run(app, host=cfg.host, port=cfg.port)