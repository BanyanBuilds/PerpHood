# Leverage X V78 — Uniswap V3 TWAP Mark-Price Oracle

V78 replaces manually supplied perps prices with an on-chain time-weighted average derived from the canonical V76 token/WETH pool.

## Enforced protections

- Market and pool must come from the V76 registry.
- Pair must be exactly the launched token and wrapped ETH.
- Per-market TWAP window is bounded from 30 seconds to 24 hours.
- Pool liquidity must meet a configured minimum.
- Pool must be unlocked and contain enough observation history.
- Current spot may not deviate from TWAP beyond the configured basis-point limit.
- Token decimals are read on-chain and normalized into wei of wrapped native asset per whole token.
- Negative-tick rounding follows Uniswap's arithmetic-mean convention.

## Mainnet sequence

1. Run `START_V78_CONTRACT_TESTS.cmd`.
2. Deploy with `START_V78_DEPLOY_TWAP_ORACLE.cmd`.
3. Save the deployed address as `LEVERAGEX_MARK_ORACLE_ADDRESS`.
4. Configure the first market with `START_V78_CONFIGURE_FIRST_MARKET.cmd` after the pool has accumulated TWAP history.
5. Call `setOracle` on the V77 engine to point it at V78 before public deposits are enabled.

V78 does not make V77 safe for public funds by itself. Independent auditing, insurance/solvency design, keeper redundancy, funding, open-interest caps, and adversarial mainnet-fork testing remain required.
