# Leverage X V72 — First Live Deployment Capability

V72 adds the production deployment path for the mint-only stack.

## Active capability

1. Deploy permanent Uniswap V3 liquidity locker.
2. Deploy Leverage X launch factory.
3. Bind the factory to the locker permanently.
4. Keep launches closed by default.
5. Configure one canary creator only after deployment.
6. Launch one real token into the canonical Robinhood Chain Uniswap V3 pool.

## Robinhood Chain configuration

- Chain ID: `4663`
- Native gas token: `ETH`
- WETH: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`
- Uniswap V3 Factory: `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA`
- Position Manager: `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3`
- Swap Router 02: `0xCaf681a66D020601342297493863E78C959E5cb2`

## User action boundary

No user action is required merely to receive V72. The first unavoidable user action will be setting the owner/deployer values locally and authorizing the mainnet deployment transaction.
