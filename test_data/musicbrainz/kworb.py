#!/usr/bin/env python3
"""
Scrape the top ~10,000 Spotify artists by monthly listeners from kworb.net.

Outputs a CSV with: rank, artist, spotify_id, monthly_listeners, peak_rank, peak_listeners

Usage:
    python scrape_kworb.py [--max-rank 5000] [--out spotify_top.csv]

Requires: pip install requests beautifulsoup4

Notes:
- Kworb publishes daily snapshots since March 2023; data is updated daily.
- Page 1 (listeners.html)   covers ranks 1–2500.
- Page 2 (listeners2.html)  covers ranks 2501–5000.
- Page 3 (listeners3.html)  covers ranks 5001–7500.
- Page 4 (listeners4.html)  covers ranks 7501–10000.
- Spotify artist IDs are extracted from the song-page links.
"""
import argparse
import csv
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

PAGES = [
    "https://kworb.net/spotify/listeners.html",
    "https://kworb.net/spotify/listeners2.html",
    "https://kworb.net/spotify/listeners3.html",
    "https://kworb.net/spotify/listeners4.html",
]

ARTIST_HREF_RE = re.compile(r"/spotify/artist/([A-Za-z0-9]+)_songs\.html")

USER_AGENT = (
    "Mozilla/5.0 (compatible; spotify-top-scraper/1.0; "
    "research/test-data only)"
)


def parse_page(html: str):
    """Yield (rank, name, spotify_id, listeners, peak_rank, peak_listeners) tuples.

    The peak_rank column is absent on listeners2+ (Kworb only tracks peak on page 1
    where ranks 1–2500 live). For pages without a peak rank column, peak_rank is None.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None:
        return
    headers = [th.get_text(strip=True) for th in table.find_all("th")]
    has_peak_rank = "Peak" in headers

    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        try:
            rank = int(tds[0].get_text(strip=True))
        except ValueError:
            continue
        a = tds[1].find("a")
        if a is None:
            continue
        name = a.get_text(strip=True)
        href = a.get("href", "")
        m = ARTIST_HREF_RE.search(href)
        spotify_id = m.group(1) if m else ""

        listeners = int(tds[2].get_text(strip=True).replace(",", ""))
        # tds[3] is daily +/-, skip
        if has_peak_rank:
            peak_rank = int(tds[4].get_text(strip=True))
            peak_listeners = int(tds[5].get_text(strip=True).replace(",", ""))
        else:
            peak_rank = None
            peak_listeners = int(tds[4].get_text(strip=True).replace(",", ""))

        yield rank, name, spotify_id, listeners, peak_rank, peak_listeners


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--max-rank", type=int, default=5000,
                    help="Stop after this rank (default 5000; max ~10000)")
    ap.add_argument("--out", default="spotify_top.csv",
                    help="Output CSV path")
    ap.add_argument("--sleep", type=float, default=1.0,
                    help="Seconds to sleep between page fetches (be polite)")
    args = ap.parse_args()

    rows = []
    seen = set()
    sess = requests.Session()
    sess.headers["User-Agent"] = USER_AGENT

    for url in PAGES:
        if rows and rows[-1][0] >= args.max_rank:
            break
        print(f"Fetching {url} ...", file=sys.stderr)
        r = sess.get(url, timeout=30)
        r.raise_for_status()
        for row in parse_page(r.text):
            rank = row[0]
            if rank > args.max_rank:
                break
            if rank in seen:
                continue
            seen.add(rank)
            rows.append(row)
        time.sleep(args.sleep)

    rows.sort(key=lambda r: r[0])
    
    artists = []

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["artist"])
        for rank, name, sid, listeners, peak, peak_listeners in rows:
            artists.append(name)
            w.writerow([name])

    print(f"Wrote {len(rows)} artists to {args.out}", file=sys.stderr)
    
    # print("ARTISTS = [ "  + artists + "]")
    
    if rows:
        print(f"Range: rank {rows[0][0]} ({rows[0][1]}) "
              f"to rank {rows[-1][0]} ({rows[-1][1]})", file=sys.stderr)


if __name__ == "__main__":
    main()
    