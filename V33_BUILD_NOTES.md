# V33 Build Notes — Native X Launch Feed

## Replaced

- Removed the generic placeholder `X Tracker` feed.
- Removed synthetic social posts generated from token data.

## Added

- Native `X Launch Feed` detachable sidecar.
- Official X recent-search server route.
- Optional official X filtered-stream worker.
- Protected stream ingest endpoint and bounded post cache.
- User-owned account lists with add, remove, import, export, and clear controls.
- Keyword/cashtag/phrase search rules.
- X post media, engagement metrics, source links, and EVM contract detection.
- Five deterministic ticker suggestions per post.
- One-click Launcher population while the X feed remains open in another dock.
- Source-post provenance attached to launch drafts.
- X API configuration and stream documentation.

## Product rule

Leverage X does not attempt to scrape or embed Axiom or Terminal/Padre. A competitor integration may be added only through an official supported API or user-exported account list.
