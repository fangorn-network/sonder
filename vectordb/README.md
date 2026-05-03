# Local Vector DB

``` sh
# create venv
python3 -m venv ./venv
source ./venv/bin/activate

# install deps
pip install aiohttp asyncio chromadb fastapi subgrounds

# execute
python main.py
```

```
curl "http://localhost:8080/search?q=tracks+for+a+car+chase+schene+in+action+movie&n_results=1"
curl "http://localhost:8080/health"
# re-pull from subgraph+IPFS on demand
curl -X POST "http://localhost:8080/reingest"
```