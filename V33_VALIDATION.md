# V33 Validation

The V33 validation suite checks:

- cashtag extraction;
- EVM contract detection;
- five unique ticker suggestions;
- X rule construction and account deduplication;
- launch-draft source provenance;
- removal of the old synthetic X Tracker branch;
- native X API route presence;
- no fabricated posts in the empty state;
- X Feed → Launcher wiring;
- V21–V32 BattlePool and terminal regressions.

Run:

```bash
npm run test:v33
```

Network-dependent X API and filtered-stream execution require valid X credentials and are not exercised by the offline smoke suite.
