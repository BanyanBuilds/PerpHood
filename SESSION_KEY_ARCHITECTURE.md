# PERPHOOD V22 session-key and sponsored execution architecture

## Objective

A trader should deposit once, authorize a bounded session once, and then submit Buy × Long × Sell × Short intents without a wallet popup for every action. Chart movement and live executable PNL remain driven by the same ordered BattlePool state.

## V22 authority path

```text
Main wallet
  └─ one on-chain authorizeSession transaction
       ├─ session ID
       ├─ P-256 public-key hash
       ├─ expiration
       ├─ maximum notional per intent
       └─ action bitmap

Browser session key
  └─ signs canonical trading intent locally
       ├─ market
       ├─ action
       ├─ amount/notional
       ├─ nonce
       ├─ limit price
       ├─ slippage cap
       ├─ deadline
       └─ client order ID

Sponsored relay / sequencer
  ├─ verifies P-256 signature
  ├─ verifies key hash and derived session ID
  ├─ reads authoritative contract frame
  ├─ reads session nonce and limits
  ├─ computes exact reserve mutation
  └─ submits transaction from sequencer gas account

LocalBattlePoolV22
  ├─ verifies session owner
  ├─ verifies active + unexpired
  ├─ verifies exact next nonce
  ├─ verifies action bitmap
  ├─ verifies maximum notional
  ├─ rejects consumed intent hash
  ├─ enforces state sequence + previous hash
  ├─ enforces WETH/token conservation
  └─ enforces physical custody coverage
```

## Why P-256 in V22

P-256 is available through browser Web Crypto without adding a wallet popup or a large signing dependency. In V22, the sequencer verifies the P-256 signature off-chain. The contract stores the public-key hash and independently limits what the sequencer is permitted to settle.

This is an optimistic local prototype, not final trust minimization. Production options include a supported P-256 precompile, smart-account validation, secure hardware-backed keys, TEE-backed relays, or a proof/challenge layer.

## Replay safety

- Every session has one monotonically increasing nonce.
- The contract requires the exact next nonce.
- Every intent hash can be consumed only once.
- Reauthorizing the same session preserves its consumed nonce.
- Rotating the key creates a different session ID.

## Scope safety

The wallet authorizes:

- which BattlePool actions are permitted;
- the maximum notional per intent;
- the absolute expiration time;
- one account owner;
- one public-key hash.

A stolen session key cannot withdraw custody balances through the trading action bitmap. The user can revoke the session on-chain at any time.

## Current local sponsored path

The `/api/v22/relay` route fully reconstructs and settles a signed **spot buy** through the same exponent-5 adaptive BattleCurve and exact liquidation-boundary sequencer used by charting and executable PNL. It never trusts client-provided output amounts and does not use a simplified constant-product shortcut.

The relay stages the resulting engine state before submission, waits for the authoritative receipt, rereads the committed frame, and only then promotes the durable sequencer ledger. A process restart can reconcile a staged frame from the contract's sequence and engine roots without inventing or skipping state.

The canonical intent and generic authorized settlement envelope already cover all trading action IDs. Remaining actions require the production sequencer adapter to translate the deterministic long, short, close, and liquidation engine output into the same contract delta format.

## Prototype storage warning

The V22 browser demo exports the P-256 key and stores it in `sessionStorage`, which is intentionally easy to inspect and test. Production must use non-exportable keys in secure device/browser storage and stronger origin/XSS isolation.
