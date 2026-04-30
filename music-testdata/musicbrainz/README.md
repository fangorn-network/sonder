``` sh
python3 -m venv ./venv
source venv/bin/activate
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-api...

python fetch.py > raw.json && \
export ANTHROPIC_API_KEY=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 && \
python enrich.py raw.json > data.json
```

| Item     | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Schema   | `fangorn.music.tags.test.v2`                                            |
| SchemaId | 0x8d4f6bf05a8afde7ed7df74637712e32d0d8b1e24f741c1db416e6229cac8f6b |
| CID      | bafkreibsep3oybc7hih5nidjycuunsj2xviool3cqhlnvuasubztaimv5m        |





