# Leverage X V80 — Secure launch-contract deployment

V80 completes checklist item 1: the production deployment path for the liquidity locker and launch factory.

## Security model

- The public GitHub repository contains variable names only.
- The deployer private key and admin token live only in Vercel server environment variables.
- Secret variables never use `NEXT_PUBLIC_`.
- `.env*`, `.vercel`, keys, Foundry broadcasts, caches, and local deployment output are ignored by Git.
- The server deployment route requires a 32+ character bearer token plus an explicit mainnet confirmation header.
- The route refuses a duplicate deployment when configured contract addresses already have bytecode.
- The launch factory remains closed after deployment.

## Production action

1. Double-click `START_V80_VERCEL_SECRET_SETUP.cmd` and answer Vercel's hidden prompts.
2. Double-click `PUSH_TO_GITHUB.cmd`.
3. Wait for the production deployment.
4. Open `/admin/deploy-launch-contracts`, enter the admin token, check status, then deploy.
5. Copy the returned locker and factory addresses into Vercel as:
   - `LEVERAGEX_LIQUIDITY_LOCKER_ADDRESS`
   - `LEVERAGEX_LAUNCH_FACTORY_ADDRESS`
6. Redeploy once so the application permanently recognizes the contracts.

Use a minimally funded throwaway deployer wallet. `LEVERAGEX_OWNER` should be the secure long-term owner wallet, not necessarily the deployer.
