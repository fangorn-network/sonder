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
| Schema   | `fangorn.music.tags.test.v2`                                            |
| SchemaId | 0x8d4f6bf05a8afde7ed7df74637712e32d0d8b1e24f741c1db416e6229cac8f6b |
| CID      | bafkreibsep3oybc7hih5nidjycuunsj2xviool3cqhlnvuasubztaimv5m        |


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
