# Leverage X V60 Vercel Type-Check Hotfix

## Failure repaired

Vercel compiled the Next.js application successfully, then TypeScript stopped on `components/V59MainnetConsole.tsx` because the asynchronous readiness payload can be `null` during the first render.

The previous JSX used optional chaining for the null comparison, then directly dereferenced `data.factory` in the alternate branch. TypeScript correctly refused to assume `data` remained non-null across that expression.

## Repair

The two nullable on-chain pause values are normalized before rendering:

- `globalTradingPaused`
- `newMarketsPaused`

The JSX now reads only those narrowed local values and never directly dereferences nullable `data`.

## Regression protection

Run:

```bash
npm run test:v60-vercel
```

The check is also included in:

```bash
npm run test:v60-fast
```

No contract, deployment, RPC, database, wallet, or launch behavior changed in this hotfix.
