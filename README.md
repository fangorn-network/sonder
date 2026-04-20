# Fangorn.Music

`Fangorn.Music` is a new paradigm for artist owned-and-operated sales of music. It allows an artist to sell their creations directly with a consumer, eliminating any need for a middleman or trusted intermediary who takes a cut of profits. Built with Fangorn and x402f, it enables artist to upload content, determine prices, and sell to fans in a non-interactive and asynchronous way.

## Build

| Item     | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Schema   | `fangorn.music.demo.v1`                                            |
| SchemaId | 0xf18e92dce6496a423a48614fac9fe93c549aa51c1a663f5cbe2233b0ea18081d |
| CID      | bafkreiccuwr3jxoux7uzay742tgh3qzjekqp2gpk7fo4egou42zo6majvy        |

### Graph Codegen

This project is built on top of the graph. On first setup, run codegen: 

``` sh
pnpm graphclient:build
```

``` sh
pnpm run build
```

### Docker

Run the Docker image with Docker compose
``` sh
docker compose up --build
```

## Deploy

``` sh
# build and tag the docker image
docker build -f ./Dockerfile \
  -t us-central1-docker.pkg.dev/lucky-lead-489114-d7/fangorn-network/music:latest .
# upload to repo
docker push us-central1-docker.pkg.dev/lucky-lead-489114-d7/fangorn-network/music:latest
# deploy cloudrun service
gcloud run deploy music \
  --image us-central1-docker.pkg.dev/lucky-lead-489114-d7/fangorn-network/music:latest \
  --platform managed \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated
```

## Contibuting