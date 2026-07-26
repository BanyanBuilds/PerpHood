# V49 Validation

## Result

`npm run test:v49` passes the inherited PERPHOOD regression chain and the new settlement-math verification suite.

## Independent curve verification

- 3,001 exact rational vectors.
- Maximum observed cumulative-cost under-round: 802 wei.
- Maximum observed marginal-price difference: 0 wei in the tested vectors.
- Spot round trips did not create value.

## Leveraged settlement verification

- 20 short scenarios across sold states and leverage levels.
- Short payout was monotonic as the curve fell.
- Every floor payout equaled the independently calculated maximum payout.
- No tested short profit exceeded original notional exposure.
- Same-state long and short reversals restored the pre-open curve state and lost only deterministic fees.

## Liability verification

- 24 close-order permutations.
- Maximum observed aggregate payout: 2,037,926,464,517,932,999 wei.
- Guaranteed liability: 2,105,225,039,082,663,937 wei.
- The guaranteed reserve covered every tested order.
- An explicit heterogeneous-position fixture demonstrated the previous cross-netting under-reserve.
- V49's gross-liability reserve covered the profitable position independently of another position's bad debt.

## Inherited engine results

- 18,750 randomized actions attempted.
- 18,382 actions executed successfully.
- 368 unsafe actions rejected before state mutation.
- 40 simultaneous 20× short liquidations in the controlled cascade.
- 40 simultaneous 20× long liquidations in the controlled cascade.
- Zero bad debt in both controlled cascades.
- Final conservation of exactly 1,000,000,000 tokens.

The lower accepted-action count versus V48 is caused by V49's stricter prospective solvency and maximum-liability reservation.

## Integration

- V49 settlement client decoding passed.
- Signed negative PNL ABI decoding passed.
- Terminal executable/quoted PNL distinction passed.
- Exact short-floor maximum display passed.
- Unpayable-close disablement passed.
- 11/11 V49 static integration checks passed.
- TypeScript/TSX syntax passed across 262 files.

## Unexecuted validation

This assembly environment did not provide Foundry or installed Next.js dependencies. The following remain required before deployment:

- `forge test` and contract compilation;
- Foundry stateful invariants;
- production Next.js build;
- Anvil/browser transaction E2E;
- formal verification and independent audit.

V49 is unaudited reference software. Public funds are prohibited.
