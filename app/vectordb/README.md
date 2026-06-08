
# Fangorn ChromaDB Server

FastAPI + ChromaDB read model for Fangorn manifests. Fetches published manifests from The Graph subgraph, resolves them from IPFS, joins across any number of schemas on a shared primary key (`trackId`), and serves a vector search API to the SOND3R client.

---

## How it works

```
Subgraph (events) → IPFS (manifests) → join on trackId → ChromaDB → API
```

Each schema is fetched independently and deduped (newest manifest wins per entry name). All schemas are then joined on the primary schema's entry name. The merged field set is stored as a JSON payload in ChromaDB metadata; a searchable text document (built from configurable fields) drives the embedding.

Responses return `{ id, fields: {...}, ...meta }` — the client reads `hit.fields.title`, not a parsed pipe-delimited string.

---

## Quickstart

``` sh
python server.py \
  -s tony.test.invariants.track.2=0xdd2ff7c1afae71333aac86f18316093fb017e4a47e7c6ef2b1c37b8ca62d53a6 \
  -s tony.test.tags.track.0=0x43a911728ed43457b145f5c4c0d89145b7c8d352b2c6ba0d86fff1f005166935 \
  --primary tony.test.invariants.track.2 \
  --reset
```

## Configuration

All config is via environment variables.

### Required

| Variable | Description |
|---|---|
| `SCHEMA_<NAME>` | Schema ID (0x…) for each schema. Any number. Name becomes the schema key. Example: `SCHEMA_CORE=0xabc`, `SCHEMA_LABELS=0xdef` |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PRIMARY_SCHEMA` | `fangorn.music.track.test.v0` | Name of the schema whose entry names are the join key |
| `SUBGRAPH_URL` | Fangorn studio URL | The Graph subgraph endpoint |
| `IPFS_GATEWAY` | `https://ipfs.io/ipfs` | IPFS gateway for manifest resolution |
| `CHROMA_PATH` | `./db/sond3r` | ChromaDB persistence directory |
| `COLLECTION` | `fangorn` | ChromaDB collection name |
| `SEARCHABLE_FIELDS` | `title,byArtist,genres,moods,themes,contexts` | Comma-separated field names to concatenate for embedding |
| `PAGE_SIZE` | `100` | Subgraph pagination page size |
| `IPFS_TIMEOUT` | `20` | IPFS request timeout in seconds |
| `CONCURRENCY` | `32` | Max concurrent IPFS fetches |
| `RESET_ON_START` | `true` | Reset ChromaDB on startup. Set to `false` in production |

### Example `.env`

```bash
SCHEMA_CORE=0x1234...
SCHEMA_LABELS=0xabcd...
SCHEMA_IDENTIFIERS=0xef01...
PRIMARY_SCHEMA=core
SEARCHABLE_FIELDS=title,byArtist,genres,moods,themes,contexts
CHROMA_PATH=./db/sond3r
RESET_ON_START=false
```

Adding a fourth schema is one line:

```bash
SCHEMA_AUDIO_FEATURES=0x9999...
```

---

## API

### `GET /browse`

Paginated browse over all documents.

```
GET /browse?limit=20&offset=0
```

```json
{
  "results": [
    {
      "id": "track:abc123",
      "fields": {
        "trackId": "abc123",
        "title": "Do I Wanna Know?",
        "byArtist": "Arctic Monkeys",
        "genres": ["indie rock", "alternative"],
        "moods": ["melancholic", "longing"]
      },
      "owner": "0x...",
      "manifestCid": "Qm...",
      "has_core": "True",
      "has_labels": "True"
    }
  ],
  "total": 842
}
```

### `GET /search`

Semantic search by text query.

```
GET /search?q=late+night+driving&n_results=10
GET /search?q=melancholic+indie&n_results=20&owner=0x...
```

Returns hits with `score` (0–1), `distance`, `embedding`, and `fields`.

### `POST /search/vector`

Query by raw embedding vector — used by the ambient agent / Markov kernel.

```json
{
  "embedding": [0.12, -0.04, ...],
  "n_results": 20,
  "owner": "0x..."
}
```

### `POST /embed`

Embed text via the same model used for ingestion — keeps client and server embedding spaces aligned.

```json
{ "text": "late night melancholic indie" }
→ { "embedding": [...] }

{ "texts": ["track one", "track two"] }
→ { "embeddings": [[...], [...]] }
```

### `GET /health`

```json
{ "status": "ok", "count": 842, "schemas": { "core": "0x...", "labels": "0x..." } }
```

### `POST /reingest`

Triggers a background re-ingestion without restarting the server. Does not reset the collection — existing documents are upserted over.

---

## Running

```bash
pip install fastapi uvicorn chromadb aiohttp requests sentence-transformers

# dev (resets collection on start)
SCHEMA_CORE=0x... SCHEMA_LABELS=0x... python server.py

# prod
RESET_ON_START=false SCHEMA_CORE=0x... SCHEMA_LABELS=0x... python server.py
```

---

## Join semantics

- The `PRIMARY_SCHEMA` schema's entry names are the join key (`trackId`)
- All other schemas are indexed by entry name and merged into a single field dict
- On key conflicts, the primary schema wins
- If a secondary schema has multiple entries per `trackId` (e.g. one identifier entry per platform), they are merged left-to-right in the order they appear — last writer wins within that schema
- Entries in secondary schemas with no matching primary entry are silently dropped
- Presence flags (`has_core`, `has_labels`, etc.) are stored in metadata for filtering