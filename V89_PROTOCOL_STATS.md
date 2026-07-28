# V89 — Protocol Stats

V89 adds one compact **Stats** button to the terminal bottom utility bar. It opens a desktop modal and mobile bottom sheet backed exclusively by the durable Robinhood Chain indexer state.

## Indexed metrics

- Tokens minted
- Tokens graduated and graduation rate
- Mints in the last 24 hours and seven days
- Aggregate spot volume
- Aggregate perpetual open interest
- Open positions and active position owners
- Liquidation count
- Long/short open-interest split
- Five most recent graduates

No demo numbers or fabricated fallback values are shown. If the authoritative database is unavailable, the panel explicitly reports that the stats feed is unavailable.

## New files

- `components/ProtocolStatsModal.tsx`
- `app/api/protocol/stats/route.ts`
- `lib/server/v89-protocol-stats.ts`
- `scripts/v89-protocol-stats-smoke.mts`

## Validation

Run `npm run test:v89`. The standalone V89 smoke test can run without installing UI dependencies using Node's type-stripping support.
