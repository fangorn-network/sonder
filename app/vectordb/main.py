import asyncio
import aiohttp
import chromadb
import requests
import uvicorn
from chromadb.utils import embedding_functions
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
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
SCHEMA_ID    = "0xf4016713d644f9f7b622826269a53a05092f04b73db9dfe95bd6d2d246e38380"
CHROMA_PATH = os.environ.get("CHROMA_PATH", "./vectordb/chroma_db_test")
COLLECTION   = "fangorn"
PAGE_SIZE    = 100
IPFS_TIMEOUT = 20
CONCURRENCY  = 32

collection = None

# ── subgraph (sync, runs in thread) ──────────────────────────────────────────

MANIFESTS_QUERY = """
query Manifests($schemaId: Bytes!, $first: Int!, $skip: Int!) {
  manifestPublisheds(
    where: { schemaId: $schemaId }
    first: $first
    skip: $skip
    orderBy: blockNumber
    orderDirection: asc
  ) {
    id owner schemaId nameHash name manifestCid blockNumber blockTimestamp transactionHash
  }
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

def _query_subgraph(variables: dict) -> dict:
    resp = requests.post(SUBGRAPH_URL, json={"query": MANIFESTS_QUERY, "variables": variables}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"Subgraph error: {data['errors']}")
    return data["data"]

def _fetch_all_events(schema_id: str) -> tuple[list, list]:
    publishes, updates = [], []
    skip = 0
    while True:
        data = _query_subgraph({"schemaId": schema_id, "first": PAGE_SIZE, "skip": skip})
        bp = data.get("manifestPublisheds", [])
        bu = data.get("manifestUpdateds", [])
        publishes.extend(bp)
        updates.extend(bu)
        if len(bp) < PAGE_SIZE and len(bu) < PAGE_SIZE:
            break
        skip += PAGE_SIZE
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
    # run blocking subgraph calls in a thread so they don't block the event loop
    publishes, updates = await loop.run_in_executor(None, _fetch_all_events, SCHEMA_ID)
    print(f"  {len(publishes)} publishes, {len(updates)} updates")

    seen_cids: dict[str, dict] = {}
    for p in publishes:
        cid = p["manifestCid"]
        if cid not in seen_cids:
            seen_cids[cid] = {
                "owner": p["owner"], "nameHash": p["nameHash"],
                "name": p["name"], "manifestCid": cid,
                "version": 0, "blockTimestamp": int(p["blockTimestamp"]),
            }
    for u in updates:
        cid = u["manifestCid"]
        if cid not in seen_cids:
            seen_cids[cid] = {
                "owner": u["owner"], "nameHash": u["nameHash"],
                "name": u["nameHash"], "manifestCid": cid,
                "version": int(u["version"]), "blockTimestamp": int(u["blockTimestamp"]),
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

    print(f"  {len(all_entries)} entries to ingest")

    handle_cids = list(set(
        uri for item in all_entries
        for uri in extract_handle_cids_from_entry(item["entry"])
    ))
    print(f"  {len(handle_cids)} handle CIDs — fetching from IPFS...")
    handle_results = await fetch_all_ipfs(handle_cids)

    ids, documents, metadatas = [], [], []
    skipped = 0
    for item in all_entries:
        result = build_document_from_entry(item["entry"], handle_results, item["meta"])
        if result is None:
            skipped += 1
            continue
        doc, meta = result
        ids.append(f"{item['meta']['manifestCid']}-{item['entryIndex']}")
        documents.append(doc)
        metadatas.append(meta)

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
    client = chromadb.PersistentClient(path=CHROMA_PATH)
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
 
 
# ── modified /search — add embeddings to text search responses ────────────────
# Replace your existing /search with this. Only change: embeddings in include + response.
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
            "embedding": results["embeddings"][0][i].tolist(),  # ← fix
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