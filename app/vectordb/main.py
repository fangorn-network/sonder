import asyncio
import aiohttp
import chromadb
import requests
import uvicorn
from chromadb.utils import embedding_functions
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from chromadb.config import Settings
import os

from pydantic import BaseModel

class EmbedRequest(BaseModel):
    text: str | None = None
    texts: list[str] | None = None  # batch path — preferred for seeding

class VectorSearchRequest(BaseModel):
    embedding:  list[float]
    n_results:  int = 20
    owner:      str | None = None
    schema_id:  str | None = None

# ── config ────────────────────────────────────────────────────────────────────

ef_global = None
SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1745244/fangorn-data-discovery/version/latest"
IPFS_GATEWAY = "https://ipfs.io/ipfs"
SCHEMA_ID    = "0x19ad28398d8c9b43a4ef112b8e8dd72358154e52738789b546d43df0475c0216"
CHROMA_PATH  = os.environ.get("CHROMA_PATH", "./db/0x19ad28398d8c9b43a4ef112b8e8dd72358154e52738789b546d43df0475c0216")
COLLECTION   = "fangorn"
PAGE_SIZE    = 100
IPFS_TIMEOUT = 20
CONCURRENCY  = 32

collection = None

# ── subgraph (sync, runs in thread) ──────────────────────────────────────────

PUBLISHES_QUERY = """
query Publishes($schemaId: Bytes!, $first: Int!, $skip: Int!) {
manifestPublisheds(
    where: { schemaId: $schemaId }
    first: $first
    skip: $skip
    orderBy: blockNumber
    orderDirection: asc
) {
    id owner schemaId nameHash name manifestCid blockNumber blockTimestamp transactionHash
}
}
"""

UPDATES_QUERY = """
query Updates($schemaId: Bytes!, $first: Int!, $skip: Int!) {
manifestUpdateds(
    where: { schemaId: $schemaId }
    first: $first
    skip: $skip
    orderBy: version
    orderDirection: desc
) {
    id owner schemaId nameHash manifestCid version blockNumber blockTimestamp transactionHash
}
}
"""

def _query_subgraph(query: str, variables: dict) -> dict:
    resp = requests.post(SUBGRAPH_URL, json={"query": query, "variables": variables}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"Subgraph error: {data['errors']}")
    return data["data"]

def _dedup(events: list, key: str = "id") -> list:
    seen = set()
    out = []
    for e in events:
        if e[key] not in seen:
            seen.add(e[key])
            out.append(e)
    return out

def _fetch_all_events(schema_id: str) -> tuple[list, list]:
    # Page publishes independently
    publishes = []
    skip = 0
    while True:
        data = _query_subgraph(PUBLISHES_QUERY, {"schemaId": schema_id, "first": PAGE_SIZE, "skip": skip})
        bp = data.get("manifestPublisheds", [])
        publishes.extend(bp)
        if len(bp) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    # Page updates independently
    updates = []
    skip = 0
    while True:
        data = _query_subgraph(UPDATES_QUERY, {"schemaId": schema_id, "first": PAGE_SIZE, "skip": skip})
        bu = data.get("manifestUpdateds", [])
        updates.extend(bu)
        if len(bu) < PAGE_SIZE:
            break
        skip += PAGE_SIZE

    publishes = _dedup(publishes)
    updates   = _dedup(updates)

    return publishes, updates

# ── ipfs (async) ──────────────────────────────────────────────────────────────

async def fetch_json(session: aiohttp.ClientSession, sem: asyncio.Semaphore, cid: str) -> tuple[str, dict | None]:
    async with sem:
        try:
            async with session.get(
                f"{IPFS_GATEWAY}/{cid}",
                timeout=aiohttp.ClientTimeout(total=IPFS_TIMEOUT)
            ) as resp:
                resp.raise_for_status()
                return cid, await resp.json(content_type=None)
        except Exception as e:
            print(f"  [warn] IPFS failed {cid[:20]}...: {e}")
            return cid, None

async def fetch_all_ipfs(cids: list[str]) -> dict[str, dict | None]:
    sem = asyncio.Semaphore(CONCURRENCY)
    async with aiohttp.ClientSession() as session:
        results = await asyncio.gather(*[fetch_json(session, sem, cid) for cid in cids])
    return dict(results)

# ── document builder ──────────────────────────────────────────────────────────

def extract_handle_cids_from_entry(entry: dict) -> list[str]:
    cids = []
    for val in entry.get("fields", {}).values():
        if isinstance(val, dict) and "uri" in val:
            uri = val["uri"]
            if not uri.startswith("http"):
                cids.append(uri)
    return cids

def build_document_from_entry(entry: dict, handle_results: dict, meta: dict) -> tuple[str, dict] | None:
    name   = entry.get("name", "")
    fields = entry.get("fields", {})
    parts  = [f"name: {name}"] if name else []

    if name:
        parts.append(f"spotify_track_id: {name}")

    for field_key, field_val in fields.items():
        if isinstance(field_val, dict):
            if "uri" in field_val:
                uri = field_val["uri"]
                parts.append(f"{field_key}_uri: {uri}")
                if "price" in field_val:
                    parts.append(f"{field_key}_price: {field_val['price']}")
                resolved = handle_results.get(uri)
                if resolved:
                    for rk, rv in resolved.items():
                        if isinstance(rv, (str, int, float)):
                            parts.append(f"{field_key}.{rk}: {rv}")
            elif "gadgetDescriptor" in field_val:
                acc = field_val["gadgetDescriptor"].get("type", "unknown")
                parts.append(f"{field_key}: encrypted ({acc})")
        elif isinstance(field_val, list):
            parts.append(f"{field_key}: {', '.join(str(v) for v in field_val)}")
        elif isinstance(field_val, (str, int, float)) and str(field_val) not in ("enc", ""):
            parts.append(f"{field_key}: {field_val}")

    if not parts:
        return None

    metadata = {
        "schemaId":       SCHEMA_ID,
        "owner":          meta["owner"],
        "nameHash":       meta["nameHash"],
        "manifestName":   meta["name"],
        "manifestCid":    meta["manifestCid"],
        "version":        meta["version"],
        "blockTimestamp": meta["blockTimestamp"],
    }

    return " | ".join(parts), metadata

# ── ingestion ─────────────────────────────────────────────────────────────────

async def ingest():
    global collection
    global ef_global

    loop = asyncio.get_event_loop()

    print(f"Fetching events for schemaId {SCHEMA_ID}...")
    publishes, updates = await loop.run_in_executor(None, _fetch_all_events, SCHEMA_ID)
    print(f"  {len(publishes)} publishes, {len(updates)} updates (after event-level dedup)")

    # Build seen_cids: one meta entry per unique manifest CID.
    # Track the highest blockTimestamp seen per CID so that downstream
    # "newest manifest wins" logic operates on accurate timestamps.
    seen_cids: dict[str, dict] = {}
    for p in publishes:
        cid = p["manifestCid"]
        ts  = int(p["blockTimestamp"])
        if cid not in seen_cids or ts > seen_cids[cid]["blockTimestamp"]:
            seen_cids[cid] = {
                "owner":          p["owner"],
                "nameHash":       p["nameHash"],
                "name":           p["name"],
                "manifestCid":    cid,
                "version":        0,
                "blockTimestamp": ts,
            }
    for u in updates:
        cid = u["manifestCid"]
        ts  = int(u["blockTimestamp"])
        if cid not in seen_cids or ts > seen_cids[cid]["blockTimestamp"]:
            seen_cids[cid] = {
                "owner":          u["owner"],
                "nameHash":       u["nameHash"],
                "name":           u["nameHash"],
                "manifestCid":    cid,
                "version":        int(u["version"]),
                "blockTimestamp": ts,
            }

    unique_cids = list(seen_cids.keys())
    print(f"  {len(unique_cids)} unique manifest CIDs — fetching from IPFS...")
    outer_results = await fetch_all_ipfs(unique_cids)

    all_entries = []
    for cid, manifest_json in outer_results.items():
        if not manifest_json:
            continue
        meta = seen_cids[cid]
        for i, entry in enumerate(manifest_json.get("entries", [])):
            all_entries.append({"entry": entry, "entryIndex": i, "meta": meta})

    print(f"  {len(all_entries)} raw entries across all manifests")

    # ── Option B: newest manifest wins per entry name ─────────────────────────
    # Root cause: each successive manifest publish carries forward all entries
    # from prior manifests plus new ones, so the same track appears in multiple
    # manifest CIDs. We keep only the copy from whichever manifest has the
    # highest blockTimestamp.
    #
    # TODO (Option A): fix the publisher to emit only *new* entries per publish
    # so manifests are incremental and this dedup becomes unnecessary.
    best_entry: dict[str, dict] = {}
    unnamed_entries: list[dict] = []

    for item in all_entries:
        name = item["entry"].get("name", "")
        if not name:
            # Can't deduplicate unnamed entries by name; collect separately.
            unnamed_entries.append(item)
            continue
        ts = item["meta"]["blockTimestamp"]
        if name not in best_entry or ts > best_entry[name]["meta"]["blockTimestamp"]:
            best_entry[name] = item

    deduped_entries = list(best_entry.values()) + unnamed_entries
    print(f"  {len(deduped_entries)} entries after name-dedup "
        f"({len(all_entries) - len(deduped_entries)} duplicates dropped, "
        f"{len(unnamed_entries)} unnamed kept as-is)")

    # ── resolve handle CIDs ───────────────────────────────────────────────────
    handle_cids = list(set(
        uri for item in deduped_entries
        for uri in extract_handle_cids_from_entry(item["entry"])
    ))
    print(f"  {len(handle_cids)} handle CIDs — fetching from IPFS...")
    handle_results = await fetch_all_ipfs(handle_cids)

    # ── build Chroma documents ────────────────────────────────────────────────
    ids, documents, metadatas = [], [], []
    skipped = 0
    seen_doc_ids: set[str] = set()
    unnamed_counter = 0

    for item in deduped_entries:
        result = build_document_from_entry(item["entry"], handle_results, item["meta"])
        if result is None:
            skipped += 1
            continue
        doc, meta = result

        name = item["entry"].get("name", "")
        if name:
            # Entry name is a Spotify track ID (or equivalent unique handle),
            # so it's safe to use as a stable, content-addressed Chroma ID.
            doc_id = f"entry:{name}"
        else:
            doc_id = f"{item['meta']['manifestCid']}-{item['entryIndex']}-u{unnamed_counter}"
            unnamed_counter += 1

        if doc_id in seen_doc_ids:
            # Shouldn't happen after dedup, but guard anyway.
            print(f"  [warn] duplicate doc id skipped: {doc_id}")
            skipped += 1
            continue

        seen_doc_ids.add(doc_id)
        ids.append(doc_id)
        documents.append(doc)
        metadatas.append(meta)

    print(f"  {len(ids)} documents to upsert into Chroma, {skipped} skipped")

    BATCH = 100
    for i in range(0, len(ids), BATCH):
        await loop.run_in_executor(
            None,
            lambda i=i: collection.upsert(
                ids=ids[i:i+BATCH],
                documents=documents[i:i+BATCH],
                metadatas=metadatas[i:i+BATCH],
            )
        )
        print(f"  upserted {min(i+BATCH, len(ids))}/{len(ids)}")

    print(f"Ingestion complete. {len(ids)} ingested, {skipped} skipped.")
    print(f"Collection size: {collection.count()} documents")

# ── fastapi ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global collection, ef_global
    client = chromadb.PersistentClient(path=CHROMA_PATH, settings=Settings(allow_reset=True))
    # TODO: testing
    print('resetting the client')
    client.reset()
    ef_global = embedding_functions.DefaultEmbeddingFunction()
    collection = client.get_or_create_collection(COLLECTION, embedding_function=ef_global)
    asyncio.create_task(ingest())  # run ingestion in background, don't block startup
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/browse")
async def browse(
    limit:  int = Query(20),
    offset: int = Query(0),
):
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: collection.get(
            limit=limit,
            offset=offset,
            include=["documents", "metadatas"],
        )
    )
    hits = [
        {"id": results["ids"][i], "document": results["documents"][i], **results["metadatas"][i]}
        for i in range(len(results["ids"]))
    ]
    return {"results": hits, "total": collection.count()}

@app.post("/embed")
async def embed(body: EmbedRequest):
    loop = asyncio.get_event_loop()

    if body.texts:
        vectors = await loop.run_in_executor(None, lambda: ef_global(body.texts))
        return {"embeddings": [v.tolist() for v in vectors]}
    elif body.text:
        vectors = await loop.run_in_executor(None, lambda: ef_global([body.text]))
        return {"embedding": vectors[0].tolist()}
    else:
        return {"error": "provide text or texts"}


@app.post("/search/vector")
async def search_vector(body: VectorSearchRequest):
    """
    Query Chroma by raw embedding vector.
    Returns hits including their embeddings so the kernel can update (μ, v, σ).
    """
    where: dict = {}
    if body.owner:     where["owner"]    = body.owner
    if body.schema_id: where["schemaId"] = body.schema_id

    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(
        None,
        lambda: collection.query(
            query_embeddings=[body.embedding],
            n_results=body.n_results,
            where=where if where else None,
            include=["documents", "metadatas", "distances", "embeddings"],
        )
    )

    hits = [
        {
            "id":        results["ids"][0][i],
            "distance":  results["distances"][0][i],
            "score":     round(1 - results["distances"][0][i], 4),
            "embedding": results["embeddings"][0][i].tolist(),
            "document":  results["documents"][0][i],
            **results["metadatas"][0][i],
        }
        for i in range(len(results["ids"][0]))
    ]
    return {"results": hits}


@app.get("/search")
async def search(
    q:         str        = Query(...),
    n_results: int        = Query(10),
    owner:     str | None = Query(None),
    schema_id: str | None = Query(None),
):
    where: dict = {}
    if owner:     where["owner"]    = owner
    if schema_id: where["schemaId"] = schema_id

    results = collection.query(
        query_texts=[q],
        n_results=n_results,
        where=where if where else None,
        include=["documents", "metadatas", "distances", "embeddings"],
    )

    hits = [
        {
            "id":        results["ids"][0][i],
            "score":     round(1 - results["distances"][0][i], 4),
            "distance":  results["distances"][0][i],
            "embedding": results["embeddings"][0][i].tolist(),
            "document":  results["documents"][0][i],
            **results["metadatas"][0][i],
        }
        for i in range(len(results["ids"][0]))
    ]
    return {"results": hits}


@app.get("/health")
async def health():
    return {"status": "ok", "count": collection.count()}

@app.post("/reingest")
async def reingest():
    asyncio.create_task(ingest())
    return {"status": "accepted"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)