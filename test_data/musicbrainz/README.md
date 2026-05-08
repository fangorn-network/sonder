``` sh
python3 -m venv ./venv
source venv/bin/activate

pip install anthropic bs4

export SPOTIFY_CLIENT_ID=d27c634421754faa8f91e314db3d6132
export SPOTIFY_CLIENT_SECRET=eb68d1f2706b45fda808ae3694cb7b67
export LASTFM_API_KEY=81690959acb539a96ce569389c1b583a

# Ranks 101-200
python fetch.py --min-rank 101 --max-rank 200 --out corpus_101_200.json

# Ranks 501-1000
python fetch.py --min-rank 501 --max-rank 1000 --out corpus_501_1000.json

```

| Item     | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Schema   | `fangorn.sptfy.music.test.v0`                                      |
| SchemaId | 0xf4016713d644f9f7b622826269a53a05092f04b73db9dfe95bd6d2d246e38380 |
| CID      | bafkreif6fxkfp47y4gp4wtdslvjr4y3ylq4kkrqfruaqd5rhrrz73mbofa        |


test.tags.v5
│  Schema ID: 0x969f34ddaffa9a35c0092dd77cf2fab555fe88a551a435722fd0feca677c9a2b  │
│  CID:       bafkreifaboagyjkprtcd2hskon5cfzgzlkijzfv44mwxseuvagxx3sshgq         │


fangorn.music.tags.test.0

◇  Schema registered ─────────────────────────────────────────────────────────────╮
│                                                                                 │
│  Schema ID: 0x7ff75e67e1374fa653b3f0101bb8472caca236857d934ba767235cd3f3fad90f  │
│  CID:       bafkreigjwy5cfqv4pceiw3s54swfb22x6zz3cy3fjp5zq65otjw32yemeq         │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────╯


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

