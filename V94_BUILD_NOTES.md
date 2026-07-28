# Leverage X V94 — Strict Live Event Types

V94 removes the next strict TypeScript production-build blocker in the live-event validator.

## Change

`validateV85Event` now narrows and stores `chainId` as a concrete number before it is passed to `createV85EventId`. This prevents `number | undefined` from reaching a function that requires `number` under Next.js 16 strict type checking.

## Safety

No BattlePool math, launch contracts, fee logic, trading behavior, or Protocol Stats behavior changed.

## Regression gate

Run `npm run test:v94`.
