# Leverage X V60 — Mainnet Canary Runbook

This runbook takes the project from a verified, closed V60 factory to one real capped Spot market. It intentionally does not enable public launching or perps.

## 0. Required local tools

- Node.js and npm
- Foundry: `forge` and `cast`
- A private Robinhood Chain mainnet HTTPS RPC in `.env.mainnet.local`
- An encrypted Foundry keystore whose address is the expected deployer/owner

Never put the signer private key or keystore password in Vercel, Supabase, GitHub, browser storage, screenshots, or chat.

## 1. Validate the complete project

```powershell
npm install
npm run test:v60-fast
npm run build
```

## 2. Run the no-broadcast factory preflight

```powershell
npm run chain:v59:preflight
```

Read `deployments/v59-mainnet-preflight.json`. Confirm:

- chain ID is 4663
- deployer equals `0x728fa84C70f7b88Ab59C86379745FdDBbDd7AD07`
- compile and Foundry tests pass
- estimated funding is understood
- no transaction was broadcast

## 3. Deploy the factory CLOSED and PAUSED

Only after reviewing the preflight report, set the exact confirmation in `.env.mainnet.local`:

```env
V59_MAINNET_DEPLOY_CONFIRM=DEPLOY_LEVERAGE_X_V60_CLOSED_PAUSED_TO_ROBINHOOD_MAINNET
```

Then run:

```powershell
npm run chain:v59:deploy
npm run chain:v59:status
npm run chain:v59:verify
```

Do not proceed unless the deployed runtime bytecode matches and the live state is:

- launch mode: Closed
- global trading: Paused
- new markets: Paused
- market count: 0

## 4. Run the read-only canary preflight

```powershell
npm run chain:v60:canary:preflight
```

This cannot sign or broadcast. Confirm the factory is pristine and the configured creator is:

```text
0x728fa84C70f7b88Ab59C86379745FdDBbDd7AD07
```

## 5. Configure exactly one canary creator

Temporarily set:

```env
V60_CANARY_CONFIGURE_CONFIRM=CONFIGURE_LEVERAGE_X_MAINNET_CANARY_ALLOWLIST
```

Then run:

```powershell
npm run chain:v60:canary:configure
```

Immediately clear the confirmation value afterward. Import the generated public values from:

```text
deployments/v60-vercel-canary.env
```

into Vercel and redeploy.

Expected state:

- launch mode: Allowlist
- only the canary creator is allowed
- global trading remains paused
- all new markets remain paused
- buy cap: 0.01 ETH
- sell cap: 5,000,000 tokens
- market count: 0

## 6. Launch the first real token

Use the normal **Launch Token** workspace while connected as the allowlisted creator. The creator's total launch spend remains 0.001 ETH inclusive of gas; the contract receives only the token-buy remainder after gas is reserved.

Do not open trading yet. First verify all of the following:

- explorer transaction is successful
- factory `marketCount()` is exactly 1
- market creator matches the allowlisted address
- market is paused
- global trading is paused
- only the constructor genesis buy exists
- token and market addresses are recorded in Supabase
- terminal discovery shows the real indexed market

Put the real market address into `.env.mainnet.local`:

```env
V60_CANARY_MARKET_ADDRESS=0x...
```

## 7. Open only the first capped Spot market

Temporarily set:

```env
V60_CANARY_OPEN_CONFIRM=OPEN_FIRST_LEVERAGE_X_MAINNET_SPOT_CANARY
```

Then run:

```powershell
npm run chain:v60:canary:open
```

Immediately clear the confirmation value afterward. Import the generated public values from:

```text
deployments/v60-vercel-spot-canary.env
```

into Vercel and redeploy.

Expected state:

- exactly one market registered
- that market is unpaused
- global trading is unpaused
- future markets remain paused
- public launching remains disabled
- capped Spot Buy/Sell only
- Long/Short remains disabled

## 8. Execute the first trader proof

Use the configured trader wallet:

```text
0x1728DC75f70070DC74Ae2172EF94970e04D9830C
```

Perform one small capped Spot Buy and one small Spot Sell. Reconcile:

1. explorer receipts
2. factory/market state
3. trader balances
4. Supabase/indexer records
5. terminal chart, tape, holders, and market figures

## Emergency lockdown

At any sign of unexpected state, set:

```env
V60_EMERGENCY_PAUSE_CONFIRM=EMERGENCY_LOCKDOWN_LEVERAGE_X_MAINNET
```

Then run:

```powershell
npm run chain:v60:emergency-lockdown
```

The command closes launching, globally pauses trading, revokes the canary creator, and pauses the configured canary market.
