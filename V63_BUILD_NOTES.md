# leverage X V63 — GMGN Compatibility Build Notes

## Primary objective

Make leverage X launches straightforward for GMGN and other Robinhood Chain indexers to identify and replay, while preserving the closed/paused mainnet rollout.

## Contract additions

`LeverageXLaunchFactoryV63` preserves the V60 canary controls and adds:

- `TokenLaunched` — stable launchpad attribution with token, creator, market, pair token, initial buy, supply, and metadata hash.
- `TokenGraduated` — stable transition from the leverage X bonding market to an externally created canonical DEX pool.
- `getLaunchedToken(address)` — canonical launch and market mapping.
- `getTokenInfo(address)` — name, symbol, metadata URI, creator, active pool, pair token, initial buy, launch time, and graduation status.
- `isLeverageXToken(address)` — factory attribution.
- `tokenCount()` and `allTokens(index)` — deterministic enumeration and backfill.
- `graduationStatus(address)` — current sold supply, fixed threshold, and graduation state.
- `recordGraduation(...)` — owner-only binding to an already deployed external pool.

The factory does not pretend to create a DEX pool through `recordGraduation`. Pool creation and liquidity migration remain a separate audited adapter milestone.

## Public integration surface

- Machine-readable manifest and well-known route.
- Paginated/enriched launch feed from the canonical Supabase launch registry.
- Per-token lookup route.
- Versioned ABI package for the factory, token, and bonding market.
- Generated event topics and function selectors.
- Read-only `/admin/gmgn` launchpad-integration console.
- Public versioned factory, token, and market ABI downloads.
- Event topic fingerprints and common pool aliases in the machine-readable manifest.
- Ready-to-complete GMGN onboarding request template with canary evidence checklist.

## Indexing and backfill

The V63 backfill worker:

- starts at the verified factory deployment block;
- reads finalized logs in bounded chunks;
- decodes `TokenLaunched`, `MarketCreated`, and `TokenGraduated`;
- sorts by block, transaction index, and log index;
- stores block hashes and canonical state;
- invalidates and replays the selected range for reorg recovery;
- writes a local JSON report even when Supabase credentials are absent.

## GMGN outcome boundary

V63 makes attribution and custom-market integration deterministic. It cannot force GMGN to display an official leverage X launchpad label. The first deployed canary will determine whether GMGN automatically resolves the ERC-20 and bonding market or requires the supplied custom launchpad adapter information.
