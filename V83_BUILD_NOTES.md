# Leverage X V83 — Production Order Pipeline

V83 adds the shared production order pipeline that all future spot and perpetual actions use.

## Added

- Strict order request validation.
- One 1x–20x leverage policy.
- Quote/request binding and expiration protection.
- Oracle freshness, market status, creator restriction, insurance health, liquidity, leverage-cap, slippage, and price-impact checks.
- Typed order lifecycle phases from validation through confirmation or failure.
- Shared event bus for terminal panels, notifications, Broadcast Mode, and future Trade Clips.
- Static smoke test covering accepted orders, creator blocking, and event subscriptions.

## Secrets

No secrets are present in this repository. Private keys, admin tokens, protected RPC URLs, and production credentials remain Vercel environment variables and must never use a `NEXT_PUBLIC_` prefix.

## Test

```bat
npm run test:v83-static
```
