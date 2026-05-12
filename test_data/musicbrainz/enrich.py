"""Enrich a MusicBrainz corpus with semantic tags via Claude, emit PublishRecords.

  pip install anthropic
  export ANTHROPIC_API_KEY=sk-ant-...
  python enrich_corpus.py corpus.json > publish_records.json

Reads tracks (mbid, title, artist, year), tags them, emits PublishRecord[]:
  { "name": <mbid>, "fields": { mbid, title, artist, year, energy, genres, moods, themes, contexts } }

Batches in groups of 10. ~1 API call per 10 tracks.
"""
from __future__ import annotations

import json
import sys

from anthropic import Anthropic

MODEL = "claude-sonnet-4-6"  # opus-4-7 if you want richer tags
BATCH = 10

SYSTEM = """You are a music tagger. For each input track, output one JSON object with:

  mbid:     copy from input verbatim
  genres:   1-3 genre strings, lowercase (e.g. "reggae", "dub", "indie rock")
  moods:    2-4 mood adjectives, lowercase (e.g. "uplifting", "melancholic", "tense")
  energy:   integer 1-5 (1=ambient/lullaby, 3=mid, 5=mosh/dance)
  themes:   1-3 lyrical/conceptual themes, lowercase (e.g. "heartbreak", "sun", "city")
  contexts: 2-4 use-case tags, kebab-case (e.g. "beach", "late-night-coding", "sunday-morning")

Use your knowledge of the artist and track. If unfamiliar, infer from artist's style and degrade gracefully.

Output ONLY a JSON array. No preamble, no markdown fences. One object per input track, same order."""

def enrich_batch(client: Anthropic, batch: list[dict]) -> list[dict]:
    payload = [
        {"mbid": t["mbid"], "title": t["title"], "artist": t["artist"], "year": t.get("year")}
        for t in batch
    ]
    resp = client.messages.create(
        model=MODEL,
        max_tokens=2500,
        system=SYSTEM,
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    )
    text = resp.content[0].text.strip()
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    return json.loads(text)


def to_publish_record(track: dict) -> dict:
    """Wrap an enriched track as a PublishRecord (name + fields)."""
    return {
        "name": track["mbid"],
        "fields": {
            "mbid": track["mbid"],
            "title": track["title"],
            "artist": track["artist"],
            "year": track["year"],
            "energy": track["energy"],
            "genres": track["genres"],
            "moods": track["moods"],
            "themes": track["themes"],
            "contexts": track["contexts"],
        },
    }


# def main() -> None:
#     if len(sys.argv) != 2:
#         sys.exit("usage: enrich_corpus.py corpus.json")

#     corpus = json.load(open(sys.argv[1]))
#     by_mbid = {t["mbid"]: t for t in corpus}
#     client = Anthropic()
#     records: list[dict] = []

#     for i in range(0, len(corpus), BATCH):
#         batch = corpus[i : i + BATCH]
#         print(f"[{i + 1}-{i + len(batch)} / {len(corpus)}]", file=sys.stderr)
#         try:
#             tags = enrich_batch(client, batch)
#         except Exception as e:
#             print(f"  ! batch failed: {e}", file=sys.stderr)
#             continue
#         for tag in tags:
#             base = by_mbid.get(tag.get("mbid"))
#             if not base:
#                 continue
#             try:
#                 records.append(to_publish_record({**base, **tag}))
#             except KeyError as e:
#                 print(f"  ! skipping {tag.get('mbid')}: missing {e}", file=sys.stderr)

#     json.dump(records, sys.stdout, indent=2, ensure_ascii=False)

def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: enrich_corpus.py corpus.json")

    corpus = json.load(open(sys.argv[1]))
    by_mbid = {t["mbid"]: t for t in corpus}
    client = Anthropic()

    out_path = "output.json"

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("[\n")
        first = True

        for i in range(0, len(corpus), BATCH):
            batch = corpus[i : i + BATCH]
            print(f"[{i + 1}-{i + len(batch)} / {len(corpus)}]", file=sys.stderr)

            try:
                tags = enrich_batch(client, batch)
            except Exception as e:
                print(f"  ! batch failed: {e}", file=sys.stderr)
                continue

            for tag in tags:
                base = by_mbid.get(tag.get("mbid"))
                if not base:
                    continue
                try:
                    record = to_publish_record({**base, **tag})

                    if not first:
                        f.write(",\n")
                    f.write(json.dumps(record, ensure_ascii=False))
                    f.flush()
                    first = False

                except KeyError as e:
                    print(f"  ! skipping {tag.get('mbid')}: missing {e}", file=sys.stderr)

        f.write("\n]\n")


if __name__ == "__main__":
    main()