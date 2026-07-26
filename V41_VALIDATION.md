# V41 Validation

## Passed

- V41 launchpad engine smoke.
- Minimum total spend: `0.001 ETH`.
- Default gas reserve: `0.00018 ETH`.
- Minimum-spend creator buy remainder: `0.00082 ETH`.
- Migration estimates monotonic across `$33K`, `$40K`, `$45K`, and `$50K`.
- `$45K` deterministic estimate: `1.209856 ETH` gross WETH and `44.267%` total supply circulating at the bundled `$3,200/ETH` test reference.
- Seven migration gates pass for a healthy target market.
- Bad debt blocks migration.
- Insufficient independent participation blocks migration.
- V41 UI smoke: 13/13.
- V41 Solidity static smoke: 10/10.
- TypeScript/TSX syntax smoke: 173 files.
- V40 equal Movers geometry: 6/6.
- Full prior V21–V39 regression reached V40 before the execution timeout; the remaining V40 and all V41 suites were then run separately and passed.
- BattlePool baseline remains: 18,750 attempted randomized actions, 18,662 successful actions, 88 safely rejected actions, one billion tokens conserved.
- Forty simultaneous 20× short liquidations and forty simultaneous 20× long liquidations retain zero bad debt in the established cascade suite.

## Not executed

- `next build`: dependencies could not be installed in the isolated environment.
- Foundry contract tests: Foundry is not available here.
- Browser automation: no browser runtime was attached.
- Robinhood Chain deployment and RPC/indexer integration.

The Solidity files are reference/unaudited and must not be described as production-ready.
