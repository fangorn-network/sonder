``` sh
python3 -m venv ./venv
source venv/bin/activate
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-api...

python fetch.py > raw.json && \
export ANTHROPIC_API_KEY=sk-ant-... && \
python enrich.py raw.json > data.json
```

| Item     | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Schema   | `fangorn.music.tags.v2`                                            |
| SchemaId | 0xd5033de283848b81aec6be7d9dde6ec878ec0b8ee7ad78321072e4b06877fa6d |
| CID      | bafkreigeyoskza3rk54fdbh65runelcosxxno6gkcqjqigsxrypax6juya        |


test.tags.v5
│  Schema ID: 0x969f34ddaffa9a35c0092dd77cf2fab555fe88a551a435722fd0feca677c9a2b  │
│  CID:       bafkreifaboagyjkprtcd2hskon5cfzgzlkijzfv44mwxseuvagxx3sshgq         │





We can scrape kworb to get the top 5000 artists, this updates daily

kworb.py

```
pip install requests beautifulsoup4
python kworb.py --max-rank 5000 --out spotify_top.csv
```

https://kworb.net/


---

Spotify tracks much more data than I thought, which is actaully extended beyond what my agent did:

Track URI,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Explicit,Added By,Added At,Genres,Record Label,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature

- Q: how can we get that data? do we need it? should we let people re-label the tracks how they see fit? e.g.  "Tony says this track is 'creamy'" and others can vote to agree, thus further weighting its importance? 
  - e.g. everyone can come and be a curator/reviewe
    - if your tags are used canonnically/adopted as the norm, then you get rewarded for having curated well?
    - people could also import tracks (upload functionality) and supply tags, effectively paying to hopefully get paid when people use their songs/data that was published

- e.g. to start, 

