# Leverage X V60 — Mainnet Canary Control

V60 is the controlled bridge between the V59 closed/paused factory deployment and the first real Leverage X Spot market. It does not deploy a factory, create a token, open trading, or move funds by itself.

## Release sequence

1. `npm run chain:v59:preflight`
2. `npm run chain:v59:deploy`
3. `npm run chain:v59:verify`
4. `npm run chain:v60:canary:preflight`
5. Deliberately configure one allowlisted creator with `npm run chain:v60:canary:configure`
6. Import `deployments/v60-vercel-canary.env` into Vercel and redeploy
7. Use the normal **Launch Token** workspace with the allowlisted creator wallet
8. Confirm the on-chain launch and Supabase registry record while the market remains paused
9. Set `V60_CANARY_MARKET_ADDRESS` locally and deliberately run `npm run chain:v60:canary:open`
10. Have the first trader perform one capped Spot Buy and Sell

## Added

- Read-only canary preflight with no signer requirement and no broadcast path.
- Exact owner-signed allowlist configuration:
  - launch mode = Allowlist
  - only the confirmed creator wallet is allowed
  - global trading remains paused
  - every new market starts paused
  - maximum canary buy = 0.01 ETH
  - maximum canary sell = 5,000,000 tokens
- Browser launch enforcement for `NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS`.
- Exact one-market Spot opening gate requiring:
  - one registered market only
  - expected creator
  - constructor genesis trade only
  - market and global pauses still active before opening
- Emergency global and market pause command.
- `/api/v60/canary-readiness` and upgraded `/admin/mainnet` live canary console.
- Vercel import blocks generated only after successful owner-signed state changes.

## Remains disabled

- Public token launching
- Any second unpaused market
- Uncapped Spot trading
- Long/Short
- BattlePool activation
- Browser/server owner signing

## Signing boundary

Owner actions run only on the controlled local deployment machine through the encrypted Foundry keystore configured in `.env.mainnet.local`. No owner key belongs in GitHub, Vercel, Supabase, browser code, screenshots, or chat.
