# Fangorn.Music

`Fangorn.Music` is a new paradigm for artist owned-and-operated sales of music. It allows an artist to sell their creations directly with a consumer, eliminating any need for a middleman or trusted intermediary who takes a cut of profits. Built with Fangorn and x402f, it enables artist to upload content, determine prices, and sell to fans in a non-interactive and asynchronous way.

## Build

| Item     | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Schema   | `fangorn.music.test.v0`                                            |
| SchemaId | 0x7a69b1c49f16834707fe1d8bcc69ec485ea1b3c7bc68dd3ab81b05ec539952cd |
| CID      | bafkreigwlsaxxbzoadhdfevy24hwtfjwrmcou23plg2lqz3rsb5uc3m3m4        |

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
# export env vars
export $(cat .env | xargs)

# build and tag the docker image
docker build -f ./Dockerfile \
  --build-arg VITE_PINATA_JWT=$VITE_PINATA_JWT \
  --build-arg VITE_PINATA_GATEWAY=$VITE_PINATA_GATEWAY \
  --build-arg VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
  --build-arg VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
  --build-arg VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
  --build-arg VITE_MEASUREMENT_ID=$VITE_MEASUREMENT_ID \
  --build-arg VITE_PUBLIC_AGENT_URL=$VITE_PUBLIC_AGENT_URL \
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