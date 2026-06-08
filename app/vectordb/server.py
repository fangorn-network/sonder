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

# IDENTICAL to fangorn_ingest.py. Build and query must share this byte for byte.
def matryoshka(vec, dim):
    x = np.asarray(vec, dtype=np.float32)
    x = (x - x.mean()) / np.sqrt(x.var() + 1e-5)
    x = x[:dim]
    n = np.linalg.norm(x)
    return (x / n).astype(np.float32).tolist() if n else x.tolist()

def embed_query(text: str) -> list:
    # query prefix, NOT search_document — the build used search_document for the catalog
    raw = next(embedder.embed([f"search_query: {text}"]))
    return matryoshka(raw, cfg.dim)

class EmbedRequest(BaseModel):
    text: str | None = None
    texts: list[str] | None = None

class VectorSearchRequest(BaseModel):
    embedding: list[float]          # kernel mu, already 256-dim in catalog space
    n_results: int = 20
    owner: str | None = None

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
    # warm the model so the first user query isn't slow
    _ = next(embedder.embed(["search_query: warmup"]))
    print(f"[startup] collection={cfg.collection} dim={cfg.dim} "
          f"count={qdrant.count(cfg.collection).count}")
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok", "count": qdrant.count(cfg.collection).count, "dim": cfg.dim}

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

if __name__ == "__main__":
    cfg = parse_args()
    uvicorn.run(app, host=cfg.host, port=cfg.port)