import argparse
import asyncio
import aiohttp
import chromadb
import json
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
        help="Schema name=id pair. Repeatable. e.g. -s core=0xabc -s labels=0xdef",
    )
    parser.add_argument(
        "--primary", "-p",
        metavar="NAME",
        default=None,
        help="Name of the primary schema (join key). Defaults to the first --schema provided.",
    )
    parser.add_argument(
        "--subgraph-url",
        default="https://api.studio.thegraph.com/query/1745244/fangorn-data-discovery/version/latest",
    )
    parser.add_argument("--ipfs-gateway",      default="https://ipfs.io/ipfs")
    parser.add_argument("--chroma-path",        default="./db/sond3r")
    parser.add_argument("--collection",         default="fangorn")
    parser.add_argument("--searchable-fields",  default="title,byArtist,genres,moods,themes,contexts")
    parser.add_argument("--page-size",          type=int, default=100)
    parser.add_argument("--ipfs-timeout",       type=int, default=20)
    parser.add_argument("--concurrency",        type=int, default=32)
    parser.add_argument("--host",               default="0.0.0.0")
    parser.add_argument("--port",               type=int, default=8080)
    parser.add_argument("--reset",              action="store_true", default=False,
                        help="Reset ChromaDB collection on startup")
    return parser.parse_args()

# ---------------------------------------------------------------------------
# CONFIG — set once at startup, read everywhere
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
    # Default to first schema
    return next(iter(schemas))

def get_searchable_fields() -> set[str]:
    return set(f.strip() for f in cfg.searchable_fields.split(",") if f.strip())

ef_global:  object | None = None
collection: object | None = None

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
                "name":           u["nameHash"],
                "manifestCid":    cid,
                "version":        int(u["version"]),
                "blockTimestamp": ts,
            }
    return seen

def _dedup_entries(all_entries: list) -> list:
    best:    dict[str, dict] = {}
    unnamed: list[dict]      = []
    for item in all_entries:
        name = item["entry"].get("name", "")
        if not name:
            unnamed.append(item)
            continue
        ts = item["meta"]["blockTimestamp"]
        if name not in best or ts > best[name]["meta"]["blockTimestamp"]:
            best[name] = item
    return list(best.values()) + unnamed

async def fetch_schema_entries(schema_id: str, loop) -> list[dict]:
    publishes, updates = await loop.run_in_executor(None, _fetch_all_events, schema_id)
    seen_cids = _build_seen_cids(publishes, updates)
    manifests = await fetch_all_ipfs(list(seen_cids.keys()))

    all_entries = []
    for cid, manifest_json in manifests.items():
        if not manifest_json:
            continue
        meta = seen_cids[cid]
        for i, entry in enumerate(manifest_json.get("entries", [])):
            all_entries.append({"entry": entry, "entryIndex": i, "meta": meta})

    return _dedup_entries(all_entries)

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

def _build_searchable_text(fields: dict) -> str:
    parts = []
    for key in get_searchable_fields():
        val = fields.get(key)
        if val is None:
            continue
        if isinstance(val, list):
            parts.append(" ".join(str(v) for v in val if v))
        elif val:
            parts.append(str(val))
    return " ".join(parts) or "music"

def join_records(entries_by_schema: dict[str, list[dict]], primary: str) -> list[dict]:
    primary_entries = entries_by_schema.get(primary, [])
    if not primary_entries:
        print(f"  [warn] primary schema '{primary}' has no entries — nothing to join")
        return []

    secondary_fields: dict[str, dict] = {}
    for name, entries in entries_by_schema.items():
        if name == primary:
            continue
        for item in entries:
            track_id = item["entry"].get("name", "")
            if not track_id:
                continue
            flat = _flatten_fields(item["entry"].get("fields", {}))
            if track_id not in secondary_fields:
                secondary_fields[track_id] = {}
            secondary_fields[track_id].update(flat)

    joined = []
    for item in primary_entries:
        track_id = item["entry"].get("name", "")
        if not track_id:
            continue

        core_fields = _flatten_fields(item["entry"].get("fields", {}))
        fields      = {**secondary_fields.get(track_id, {}), **core_fields}
        fields["trackId"] = track_id

        joined.append({
            "id":       f"track:{track_id}",
            "document": _build_searchable_text(fields),
            "payload":  json.dumps(fields),
            "metadata": {
                "trackId":        track_id,
                "owner":          item["meta"]["owner"],
                "manifestCid":    item["meta"]["manifestCid"],
                "blockTimestamp": item["meta"]["blockTimestamp"],
                **{f"has_{name}": str(name == primary or track_id in secondary_fields)
                   for name in entries_by_schema},
            },
        })

    return joined

# ---------------------------------------------------------------------------
# INGESTION
# ---------------------------------------------------------------------------

async def ingest():
    global collection
    loop    = asyncio.get_event_loop()
    schemas = get_schemas()
    primary = get_primary(schemas)

    print(f"Ingesting {len(schemas)} schema(s): {list(schemas.keys())}")
    print(f"Primary: '{primary}'")

    results = await asyncio.gather(*[
        fetch_schema_entries(schema_id, loop)
        for schema_id in schemas.values()
    ])
    entries_by_schema = dict(zip(schemas.keys(), results))

    for name, entries in entries_by_schema.items():
        print(f"  {name}: {len(entries)} entries")

    joined = join_records(entries_by_schema, primary)
    print(f"  {len(joined)} joined records to upsert")

    if not joined:
        print("  Nothing to ingest.")
        return

    ids       = [r["id"]       for r in joined]
    documents = [r["document"] for r in joined]
    metadatas = [{**r["metadata"], "payload": r["payload"]} for r in joined]

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
        print("[startup] resetting Chroma collection")
        client.reset()
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

@app.get("/health")
async def health():
    schemas = get_schemas()
    return {"status": "ok", "count": collection.count(), "schemas": schemas}

@app.post("/reingest")
async def reingest():
    asyncio.create_task(ingest())
    return {"status": "accepted"}

# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cfg = parse_args()
    uvicorn.run(app, host=cfg.host, port=cfg.port)