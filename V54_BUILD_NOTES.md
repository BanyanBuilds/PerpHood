# V54 Build Notes

## Added

- Real fixed-supply ERC-20 launch factory for Robinhood Chain.
- Real native-ETH exponent-five spot bonding curve.
- Connected-wallet launch transaction with a 0.001 ETH total budget inclusive of the configured gas ceiling.
- Supabase artwork/metadata storage and confirmed launch registry.
- Canonical receipt, event, token identity, metadata hash, and supply verification.
- Testnet/mainnet network adapter and explorer receipts.
- Real spot Buy/Sell execution from the terminal.
- Current contract-state hydration for registered V54 markets.
- Public `/api/v54/discovery` indexer feed.
- Registry retry after an on-chain launch succeeds but the server record temporarily fails.
- Production launch registry console.

## Removed from hosted product

- Bundled demo token.
- Fake token rows and fake order-book depth.
- Demo launch lifecycle console.
- Public local-chain sandbox state.
- Demo wallet address on profile.
- Demo alert/liquidation/intelligence records.
- Demo environment-address placeholders.
- Demo-market source and public local-chain artifact.

## Locked behavior retained

- Markets/Movers have no trading sidecar.
- Quick Buy executes in place.
- Quick Long/Short remain preset-only.
- V54 real tokens are spot-only until real perps are attached.
- Up to three non-trading left sidecars remain visible.
- V49/V50 settlement math and V51 stale-order protections remain in the repository.
- V53 cross-device settings sync remains separate from trading authority.
