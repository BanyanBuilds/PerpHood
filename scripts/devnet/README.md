# PERPHOOD V23 local devnet

## Windows flow

1. Install Foundry so `anvil`, `forge`, and `cast` are available.
2. Run `start-local-chain.bat`.
3. In a second terminal, run `deploy-local.bat`.
4. The deployment script creates `LocalBattlePoolV23`, seeds 0.26825 test ETH, and updates `.env.local`.
5. Run `npm install` and `npm run dev`.
6. Import an Anvil test account into MetaMask.
7. Open `/admin/local-chain` to deposit internal test ETH.
8. Open `/admin/execution`, create a key, authorize once, and execute the sponsored buy.

The local relay uses Anvil's unlocked sequencer account from `V23_SEQUENCER_ACCOUNT`. This is development-only behavior.

## Contract tests

```bash
npm run chain:test:v22
```

## Direct frame demo

`demo-battle.bat 0xDEPLOYED_ADDRESS` still exercises the lower-level sequencer settlement path without session authorization.

## V23 sequencer state

The deployment script removes any prior `.perphood-v23-sequencer-state.json` journal. The relay stages each deterministic engine transition before chain submission and promotes it only after the authoritative receipt and frame reread.

## V24 fixed-point verifier

After the V23 local flow is working, run:

```bat
scripts\devnet\deploy-v24.bat
```

This deploys `LocalBattlePoolV24`, seeds separate test ETH, and writes `NEXT_PUBLIC_V24_BATTLE_POOL_ADDRESS` without replacing the V23 relay contract. Open `/admin/v24-verification` to inspect the V24 contract frame, RPC latency, custody status, and liquidation continuation cursor.

```bash
npm run chain:test:v24
```
