# PERPHOOD V44 Build Notes

## Milestone

V44 switches the normal terminal path from browser-only settlement to wallet-confirmed V43 contract settlement whenever a configured Anvil V43 market is selected.

## Added

- `lib/chain/v44-market-client.ts`
  - V43 calldata for spot buy/sell, long/short open, and full close.
  - ERC-20 allowance and approval flow for spot sells.
  - receipt waiting and status verification.
  - Trade, PositionOpened, and PositionClosed event decoding.
  - signed PNL decoding.
  - V43 runtime-state, position, exact position-equity, token-balance, wallet-balance, and active-ID readers.
  - leverage-specific capacity mapping into terminal token state.
- Contract-aware execution inside `MarketProvider`.
- One-second authoritative contract state and exact-PNL reconciliation.
- Wallet balance and execution phase exposed through market context.
- Chain transaction/block metadata on positions, holdings, and market events.
- V44 execution status in both terminal trade tickets.
- Contract-aware Quick Buy in Markets and Movers.
- Contract-aware full closing and spot selling across terminal position surfaces.
- Explicit removal of unsupported contract automation controls.
- V44 health/config capability reporting.
- `chain:v44`, `chain:v44:status`, `test:v44-client`, `test:v44-ui`, and `test:v44` commands.

## Preserved

- One-billion-token conservation model.
- 0.30% V43 contract fee baseline.
- Creator/deployer perp restriction.
- Public Buy/Sell-only tape semantics.
- V21–V43 regression coverage.
- Browser BattlePool fallback for markets without a V43 deployment.
- No multiwallet execution.

## Important constraints

V44 uses one wallet confirmation per market action. Limit/trigger orders, TP/SL, margin additions, fractional perp closes, and unattended execution remain disabled for contract markets until session authorization and custody are implemented.
