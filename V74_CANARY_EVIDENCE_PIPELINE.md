# Leverage X V74 — Canary Evidence Pipeline

V74 completes the package needed before the first signature:

1. Validates and packages the required PNG, JPG, WEBP, or animated GIF.
2. Produces standard token metadata with image hash, chain ID, platform, and optional socials.
3. Automatically uploads the image and JSON to public IPFS when `PINATA_JWT` is available.
4. After the V73 launch, derives the token and canonical pool directly from the factory.
5. Verifies token/pool bytecode, canonical Uniswap V3 registration, metadata, creator, ticker, locker record, and transaction success.
6. Writes a machine-readable proof to `deployments/v74-canary-onchain-proof.json`.

GMGN visibility is not claimed or guaranteed. V74 proves the canonical on-chain facts needed for an external indexer to discover the launch.
