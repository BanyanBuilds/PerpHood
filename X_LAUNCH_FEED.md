# Native X Launch Feed

PerpHood V33 removes the generic synthetic X tracker and replaces it with a launch-specific workflow:

```text
Official X post
  → PerpHood launch rule matches
  → contract/cashtag/social context is detected
  → five editable ticker suggestions appear
  → one click opens the Launcher beside the feed
  → name, ticker, description, X handle, website, and source post are prefilled
  → creator reviews every field before launch
```

## Why PerpHood does not import Axiom or Terminal/Padre

Their documented X tools are product features, not published feed-export or embed APIs. PerpHood can import a user's account list as JSON, CSV, or text, but does not scrape a competitor's private UI, credentials, or data stream.

## Data modes

### Recent Search

`app/api/x-launch-feed/route.ts` calls the official X recent-search endpoint from the server. The bearer token never reaches the browser. Responses are cached for 15 seconds to control rate usage.

Required:

```env
X_BEARER_TOKEN=
```

### Filtered Stream

For lower latency, run the optional persistent worker:

```bash
npm run x:stream
```

It manages official filtered-stream rules, receives posts as X publishes them, and sends normalized posts into the protected PerpHood ingest endpoint.

Required:

```env
X_BEARER_TOKEN=
PERPHOOD_X_INGEST_URL=http://localhost:3000/api/x-launch-feed/ingest
X_STREAM_INGEST_SECRET=
X_STREAM_RULES=[{"value":"(launch OR launching OR memecoin OR \"contract address\") -is:retweet","tag":"perphood-launch-radar"}]
```

The included ingest cache is suitable for local validation and a single long-running Node process. Production deployment should replace the in-memory ring buffer with Redis, Supabase, or another durable shared stream store.

## Security and integrity

- X credentials are server-only.
- The ingest endpoint requires a separate secret.
- Source posts remain linked in the Launcher.
- Suggestions never launch automatically.
- Users must review token identity, artwork, links, and genesis buy.
- PerpHood never invents social posts when the API is unavailable.
- Account lists are user-owned and can be imported/exported.
