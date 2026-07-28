# Leverage X V81 — Mainnet Deployment Control

V81 completes the software side of Step 1: deploying the launch factory and permanent liquidity locker on Robinhood Chain mainnet.

## Security boundary

- The deployer private key and admin token are server-only Vercel environment variables.
- Neither secret is exposed through `NEXT_PUBLIC_*` variables.
- Deployment evidence contains only public addresses, transaction hashes, and verification results.
- Git ignores local environment files, Vercel state, Foundry broadcasts, keys, and certificates.

## Admin workflow

Open `/admin/deploy-launch-contracts` after Vercel deploys the project.

1. Check readiness.
2. Deploy the two contracts and bind them.
3. Download the deployment evidence JSON.
4. Add the returned public contract addresses to Vercel:
   - `LEVERAGEX_LIQUIDITY_LOCKER_ADDRESS`
   - `LEVERAGEX_LAUNCH_FACTORY_ADDRESS`
5. Redeploy Vercel and run on-chain verification.

Launches remain closed after deployment. The next step is the controlled canary token launch.
