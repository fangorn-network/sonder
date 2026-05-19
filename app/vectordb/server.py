import argparse
import asyncio
import aiohttp
import chromadb
import hashlib
import json
import os
import requests
import uvicorn
from chromadb.utils import embedding_functions
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from chromadb.config import Settings
from pydantic import BaseModel

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
        default="https://api.studio.thegraph.com/query/1745244/fangorn-data-discovery/version/latest",
    )
    parser.add_argument("--ipfs-gateway",      default="https://ipfs.io/ipfs")
    parser.add_argument("--chroma-path",        default="./db/sond3r")
    parser.add_argument("--checkpoint-file",    default="./db/ingest_checkpoint.json")
    parser.add_argument("--collection",         default="fangorn")
    parser.add_argument("--searchable-fields",  default="trackId,title,byArtist,genres,moods,themes,contexts")
    parser.add_argument("--page-size",          type=int, default=100)
    parser.add_argument("--ipfs-timeout",       type=int, default=20)
    parser.add_argument("--concurrency",        type=int, default=32)
    parser.add_argument("--host",               default="0.0.0.0")
    parser.add_argument("--port",               type=int, default=8080)
    parser.add_argument("--reset",              action="store_true", default=False)
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
# CHECKPOINT
# Persists {schema_name: {cid: blockTimestamp}} so reingest only fetches
# IPFS for CIDs that are new or have an updated blockTimestamp.
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

# ---------------------------------------------------------------------------
# TRACK ID
# ---------------------------------------------------------------------------

def _compute_track_id(artist: str, title: str) -> str:
    return hashlib.sha256(f"{artist}:{title}".encode()).hexdigest()[:24]

def _track_id(entry: dict) -> str:
    fields = entry.get("fields", {})
    tid    = fields.get("trackId", "")
    stored = tid.strip() if isinstance(tid, str) else ""
    stored = stored.removeprefix("track:")

    if stored:
        return stored

    artist = str(fields.get("byArtist", "")).strip()
    title  = str(fields.get("title",    "")).strip()
    if artist and title:
        derived = _compute_track_id(artist, title)
        print(f"  [warn] trackId missing, derived {derived!r} from '{artist}:{title}'")
        return derived

    name = entry.get("name", "").strip().removeprefix("track:")
    if name:
        print(f"  [warn] no trackId or content fields — falling back to entry name {name!r}")
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

def _query_subgraph(query: str, variables: dict) -> dict:
    resp = requests.post(
        cfg.subgraph_url,
        json={"query": query, "variables": variables},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"Subgraph error: {data['errors']}")
    return data["data"]

def _fetch_all_events(schema_id: str) -> tuple[list, list]:
    publishes, updates = [], []
    for target, query, key in [
        (publishes, PUBLISHES_QUERY, "manifestPublisheds"),
        (updates,   UPDATES_QUERY,   "manifestUpdateds"),
    ]:
        skip = 0
        while True:
            data  = _query_subgraph(query, {"schemaId": schema_id, "first": cfg.page_size, "skip": skip})
            batch = data.get(key, [])
            target.extend(batch)
            if len(batch) < cfg.page_size:
                break
            skip += cfg.page_size
    return publishes, updates

# ---------------------------------------------------------------------------
# IPFS
# ---------------------------------------------------------------------------

async def _fetch_json(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    cid: str,
) -> tuple[str, dict | None]:
    async with sem:
        try:
            async with session.get(
                f"{cfg.ipfs_gateway}/{cid}",
                timeout=aiohttp.ClientTimeout(total=cfg.ipfs_timeout),
            ) as resp:
                resp.raise_for_status()
                return cid, await resp.json(content_type=None)
        except Exception as e:
            print(f"  [warn] IPFS failed {cid[:20]}…: {e}")
            return cid, None

async def fetch_all_ipfs(cids: list[str]) -> dict[str, dict | None]:
    if not cids:
        return {}
    sem = asyncio.Semaphore(cfg.concurrency)
    async with aiohttp.ClientSession() as session:
        results = await asyncio.gather(*[_fetch_json(session, sem, cid) for cid in cids])
    return dict(results)

# ---------------------------------------------------------------------------
# PER-SCHEMA FETCH + DEDUP
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
    schema_name: str,
    schema_id:   str,
    loop,
    prior_checkpoint: dict[str, int],   # cid -> blockTimestamp from last run
) -> tuple[list[dict], dict[str, int]]:
    """
    Returns (entries, new_checkpoint) where new_checkpoint covers all seen CIDs
    for this schema (both cached and freshly fetched).
    """
    publishes, updates = await loop.run_in_executor(None, _fetch_all_events, schema_id)
    print(f"  [{schema_name}] subgraph: {len(publishes)} publishes, {len(updates)} updates")

    seen_cids = _build_seen_cids(publishes, updates)
    print(f"  [{schema_name}] unique manifest CIDs: {len(seen_cids)}")

    # Diff: only fetch CIDs that are new or have a later blockTimestamp
    new_cids  = [
        cid for cid, meta in seen_cids.items()
        if prior_checkpoint.get(cid, -1) < meta["blockTimestamp"]
    ]
    skip_count = len(seen_cids) - len(new_cids)
    print(f"  [{schema_name}] IPFS: {len(new_cids)} to fetch, {skip_count} unchanged (skipped)")

    fresh_manifests = await fetch_all_ipfs(new_cids)
    ok  = sum(1 for v in fresh_manifests.values() if v is not None)
    bad = sum(1 for v in fresh_manifests.values() if v is None)
    if new_cids:
        print(f"  [{schema_name}] IPFS: {ok} fetched, {bad} failed")

    # Build new checkpoint: carry forward cached CIDs, update with fresh ones
    new_checkpoint: dict[str, int] = dict(prior_checkpoint)
    for cid, meta in seen_cids.items():
        if cid in fresh_manifests and fresh_manifests[cid] is not None:
            new_checkpoint[cid] = meta["blockTimestamp"]
        elif cid not in fresh_manifests:
            # Unchanged — keep prior timestamp
            new_checkpoint[cid] = meta["blockTimestamp"]
        # Failed fetches: don't update checkpoint so they retry next time

    all_entries = []
    for cid, manifest_json in fresh_manifests.items():
        if not manifest_json:
            continue
        meta    = seen_cids[cid]
        entries = manifest_json.get("entries", [])
        for i, entry in enumerate(entries):
            all_entries.append({"entry": entry, "entryIndex": i, "meta": meta})

    deduped = _dedup_entries(all_entries)
    print(f"  [{schema_name}] entries from new CIDs: {len(all_entries)} raw → {len(deduped)} after dedup")

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

    secondary_fields: dict[str, dict] = {}
    for schema_name, entries in entries_by_schema.items():
        if schema_name == primary:
            continue
        for item in entries:
            key = _track_id(item["entry"])
            if not key:
                print(f"  [warn] secondary entry has no resolvable track ID — skipping")
                continue
            flat = _flatten_fields(item["entry"].get("fields", {}))
            if key not in secondary_fields:
                secondary_fields[key] = {}
            secondary_fields[key].update(flat)

    global debug_secondary
    debug_secondary = secondary_fields
    print(f"  [join] secondary index: {len(secondary_fields)} keys")

    joined = []
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

    print(f"  [join] {len(joined)} records from new CIDs — {matched} with tags, {len(joined) - matched} without")
    return joined

# ---------------------------------------------------------------------------
# INGESTION
# ---------------------------------------------------------------------------

async def ingest():
    global collection
    loop      = asyncio.get_event_loop()
    schemas   = get_schemas()
    primary   = get_primary(schemas)
    checkpoint = _load_checkpoint()

    print(f"\n{'='*60}")
    print(f"Ingesting {len(schemas)} schema(s): {list(schemas.keys())}")
    print(f"{'='*60}")

    # Fetch all schemas in parallel, each with its own prior checkpoint slice
    results = await asyncio.gather(*[
        fetch_schema_entries(
            name,
            schema_id,
            loop,
            checkpoint.get(name, {}),
        )
        for name, schema_id in schemas.items()
    ])

    entries_by_schema:     dict[str, list[dict]]      = {}
    new_checkpoints_by_schema: dict[str, dict[str, int]] = {}
    for (name, _), (entries, new_ckpt) in zip(schemas.items(), results):
        entries_by_schema[name]         = entries
        new_checkpoints_by_schema[name] = new_ckpt

    joined = join_records(entries_by_schema, primary)

    if not joined:
        print("  No new records to upsert.")
        # Still save checkpoint so we don't refetch unchanged CIDs next time
        for name, ckpt in new_checkpoints_by_schema.items():
            checkpoint[name] = ckpt
        _save_checkpoint(checkpoint)
        return

    # Diff against ChromaDB: skip records whose document hasn't changed
    ids_to_check = [r["id"] for r in joined]
    loop = asyncio.get_event_loop()

    existing_raw = await loop.run_in_executor(
        None,
        lambda: collection.get(ids=ids_to_check, include=["documents"]),
    )
    existing_docs: dict[str, str] = {}
    ex_ids  = existing_raw.get("ids") or []
    ex_docs = existing_raw.get("documents") or []
    for eid, edoc in zip(ex_ids, ex_docs):
        existing_docs[eid] = edoc or ""

    changed = [r for r in joined if existing_docs.get(r["id"], "") != r["document"]]
    skipped = len(joined) - len(changed)
    print(f"  Diff: {len(changed)} changed, {skipped} unchanged (skipped upsert)")

    if changed:
        ids       = [r["id"]       for r in changed]
        documents = [r["document"] for r in changed]
        metadatas = [{**r["metadata"], "payload": r["payload"]} for r in changed]

        BATCH = 100
        for i in range(0, len(ids), BATCH):
            s, e = i, min(i + BATCH, len(ids))
            await loop.run_in_executor(
                None,
                lambda s=s, e=e: collection.upsert(
                    ids=ids[s:e],
                    documents=documents[s:e],
                    metadatas=metadatas[s:e],
                ),
            )
            print(f"  upserted {e}/{len(ids)}")

    # Persist updated checkpoint
    for name, ckpt in new_checkpoints_by_schema.items():
        checkpoint[name] = ckpt
    _save_checkpoint(checkpoint)

    print(f"Ingestion complete. Collection size: {collection.count()}")

# ---------------------------------------------------------------------------
# RESPONSE HELPERS
# ---------------------------------------------------------------------------

def _parse_hits(results: dict, include_embeddings: bool = False) -> list[dict]:
    raw_ids   = results["ids"]
    raw_docs  = results["documents"]
    raw_metas = results["metadatas"]

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
# APP
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global collection, ef_global
    client = chromadb.PersistentClient(
        path=cfg.chroma_path,
        settings=Settings(allow_reset=True),
    )
    if cfg.reset:
        print("[startup] resetting Chroma collection and checkpoint")
        client.reset()
        _clear_checkpoint()
    ef_global  = embedding_functions.DefaultEmbeddingFunction()
    collection = client.get_or_create_collection(cfg.collection, embedding_function=ef_global)
    asyncio.create_task(ingest())
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    where   = {"owner": owner} if owner else None
    results = collection.query(
        query_texts=[q],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances", "embeddings"],
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

@app.get("/debug")
async def debug():
    schemas = get_schemas()
    primary = get_primary(schemas)
    loop    = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: collection.get(include=["metadatas"]),
    )
    metas = results.get("metadatas") or []
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
        "status":  "ok",
        "count":   collection.count(),
        "schemas": schemas,
        "checkpoint_cids": {name: len(cids) for name, cids in checkpoint.items()},
    }

@app.post("/reingest")
async def reingest():
    asyncio.create_task(ingest())
    return {"status": "accepted"}

@app.post("/reingest/full")
async def reingest_full():
    """Clear checkpoint and re-fetch everything from scratch."""
    _clear_checkpoint()
    asyncio.create_task(ingest())
    return {"status": "accepted", "note": "checkpoint cleared — full reingest in progress"}

# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cfg = parse_args()
    uvicorn.run(app, host=cfg.host, port=cfg.port)