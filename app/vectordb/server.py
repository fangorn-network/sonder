import certifi, os, io, sys, argparse
os.environ['SSL_CERT_FILE'] = certifi.where()
import numpy as np
import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
from qdrant_client import QdrantClient, models
from fastembed import TextEmbedding

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def parse_args():
    p = argparse.ArgumentParser(description="SOND3R query server (Qdrant + nomic)")
    p.add_argument("--collection", default="fangorn")
    p.add_argument("--qdrant-host", default="127.0.0.1")
    p.add_argument("--qdrant-port", type=int, default=6333)
    p.add_argument("--qdrant-grpc-port", type=int, default=6334)
    p.add_argument("--embedding-model", default="nomic-ai/nomic-embed-text-v1.5")
    p.add_argument("--dim", type=int, default=256)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8080)
    return p.parse_args()

cfg = None
qdrant = None
embedder = None
_map_cache = None   # in-memory cache of the (cheap) payload scroll

# IDENTICAL to embeddings.py. Build and query must share this byte for byte.
def matryoshka(vec, dim):
    x = np.asarray(vec, dtype=np.float32)
    x = (x - x.mean()) / np.sqrt(x.var() + 1e-5)
    x = x[:dim]
    n = np.linalg.norm(x)
    return (x / n).astype(np.float32).tolist() if n else x.tolist()

def embed_query(text: str) -> list:
    # query prefix, NOT search_document — the build used search_document
    raw = next(embedder.embed([f"search_query: {text}"]))
    return matryoshka(raw, cfg.dim)

class EmbedRequest(BaseModel):
    text: str | None = None
    texts: list[str] | None = None

class VectorSearchRequest(BaseModel):
    embedding: list[float]          # kernel mu, already 256-dim in catalog space
    n_results: int = 20
    owner: str | None = None

class TextSearchRequest(BaseModel):
    q: str
    limit: int = 20

def _hit(p) -> dict:
    pl = p.payload or {}
    return {
        "id": pl.get("id"),
        "fields": pl.get("fields", {}),
        "owner": pl.get("owner"),
        "manifestCid": (pl.get("meta") or {}).get("manifestCid"),
        "score": round(p.score, 4),
    }

def _owner_filter(owner):
    if not owner:
        return None
    return models.Filter(must=[models.FieldCondition(
        key="owner", match=models.MatchValue(value=owner))])

@asynccontextmanager
async def lifespan(app: FastAPI):
    global qdrant, embedder
    qdrant = QdrantClient(host=cfg.qdrant_host, port=cfg.qdrant_port,
                          grpc_port=cfg.qdrant_grpc_port, prefer_grpc=True)
    embedder = TextEmbedding(cfg.embedding_model, max_length=256)
    _ = next(embedder.embed(["search_query: warmup"]))  # warm the model
    print(f"[startup] collection={cfg.collection} dim={cfg.dim} "
          f"count={qdrant.count(cfg.collection).count}")
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok", "count": qdrant.count(cfg.collection).count,
            "dim": cfg.dim, "map_cached": _map_cache is not None}

# Kernel path: mu in, neighbours out. No model touched.
@app.post("/search/vector")
async def search_vector(body: VectorSearchRequest):
    res = qdrant.query_points(cfg.collection, query=body.embedding,
                              limit=body.n_results,
                              query_filter=_owner_filter(body.owner),
                              with_payload=True)
    return {"results": [_hit(p) for p in res.points]}

# Text path: embed one short string through the parity recipe, then search.
@app.get("/search")
async def search(q: str = Query(...), n_results: int = Query(10), owner: str | None = Query(None)):
    vec = embed_query(q)
    res = qdrant.query_points(cfg.collection, query=vec, limit=n_results,
                              query_filter=_owner_filter(owner), with_payload=True)
    return {"results": [_hit(p) for p in res.points]}

@app.post("/embed")
async def embed(body: EmbedRequest):
    if body.texts:
        return {"embeddings": [matryoshka(v, cfg.dim)
                               for v in embedder.embed([f"search_query: {t}" for t in body.texts])]}
    if body.text:
        return {"embedding": embed_query(body.text)}
    return {"error": "provide 'text' or 'texts'"}

@app.get("/browse")
async def browse(limit: int = Query(20), offset: int = Query(0)):
    points, _ = qdrant.scroll(cfg.collection, limit=limit, offset=offset, with_payload=True)
    return {"results": [{"id": (p.payload or {}).get("id"),
                         "fields": (p.payload or {}).get("fields", {}),
                         "owner": (p.payload or {}).get("owner")} for p in points],
            "total": qdrant.count(cfg.collection).count}

# ---------------------------------------------------------------------------
# LEXICAL TEXT SEARCH — exact artist/title lookup, no embedding, no vectors.
# Matches against the text payload indexes created by the builder. Use this for
# "find this specific band"; use /search for "find this vibe". Requires the
# fields.title / fields.byArtist text indexes (ensure_indexes in the builder).
# ---------------------------------------------------------------------------
@app.post("/search/text")
async def search_text(body: TextSearchRequest):
    flt = models.Filter(should=[
        models.FieldCondition(key="fields.title",    match=models.MatchText(text=body.q)),
        models.FieldCondition(key="fields.byArtist", match=models.MatchText(text=body.q)),
    ])
    points, _ = qdrant.scroll(cfg.collection, scroll_filter=flt,
                              limit=body.limit, with_payload=True)
    return {"results": [{"id": (p.payload or {}).get("id"),
                         "fields": (p.payload or {}).get("fields", {}),
                         "owner": (p.payload or {}).get("owner")} for p in points]}

# ---------------------------------------------------------------------------
# CATALOG MAP — reads PRECOMPUTED px/py from payload. No UMAP at runtime.
# The projection was computed once at build time (embeddings.py --umap) and is
# baked into the snapshot, so this is a payload scroll, not minutes of compute.
# ---------------------------------------------------------------------------
def _build_map() -> dict:
    tracks = []
    genre_pos: dict = {}
    offset = None
    while True:
        batch, offset = qdrant.scroll(cfg.collection, limit=10000, offset=offset,
                                      with_payload=True, with_vectors=False)
        if not batch:
            break
        for p in batch:
            pl = p.payload or {}
            if "px" not in pl or "py" not in pl:
                continue   # coords not precomputed for this point
            f = pl.get("fields", {}) or {}
            genres = f.get("genres") or []
            if not isinstance(genres, list):
                genres = []
            genres = genres[:3]
            px, py = float(pl["px"]), float(pl["py"])
            tracks.append({
                "id": pl.get("id"),
                "title": f.get("title") or pl.get("id"),
                "artist": f.get("byArtist") or f.get("artist") or "",
                "genres": genres,
                "moods": (f.get("moods") or [])[:3] if isinstance(f.get("moods"), list) else [],
                "px": px, "py": py,
            })
            if genres:
                genre_pos.setdefault(genres[0], []).append((px, py))
        if offset is None:
            break

    centroids = []
    for g, ps in genre_pos.items():
        if len(ps) < 5:
            continue
        xs = [a for a, _ in ps]
        ys = [b for _, b in ps]
        centroids.append({"genre": g, "px": sum(xs) / len(xs),
                          "py": sum(ys) / len(ys), "count": len(ps)})
    centroids.sort(key=lambda c: -c["count"])
    return {"tracks": tracks, "total": len(tracks), "genres": centroids[:40]}

@app.get("/catalog/map")
async def catalog_map():
    global _map_cache
    if _map_cache is None:
        _map_cache = _build_map()
        if _map_cache["total"] == 0:
            # nothing had px/py — likely the snapshot predates the --umap step
            return {"error": "no precomputed coords (rebuild snapshot with --umap)",
                    "total": 0, "tracks": [], "genres": []}
    return _map_cache

@app.post("/catalog/map/refresh")
async def catalog_map_refresh():
    global _map_cache
    _map_cache = None
    return {"status": "cache cleared; next GET /catalog/map rebuilds from payload"}

if __name__ == "__main__":
    cfg = parse_args()
    uvicorn.run(app, host=cfg.host, port=cfg.port)