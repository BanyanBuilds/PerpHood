# leverage X V64 build notes

V64 is the first-real-mainnet-launch release above V63. It deliberately preserves the V63 factory bytecode candidate while adding the exact operational path needed to deploy it closed/paused, launch one paused token, open one capped Spot market, prove a separate-wallet buy/sell, and package the evidence for GMGN.

## Added

- Zero-signing first-token metadata/gas/budget preflight.
- Creator-keystore first-token launch command with explicit confirmation phrase.
- Separate trader-keystore buy/approval/sell roundtrip.
- Real receipt and event evidence manifests.
- Public `/api/v64/gmgn/evidence` endpoint.
- Read-only `/admin/first-launch` operator console.
- V64 metadata and launch registry routes.
- Public Vercel environment exports after each successful phase.
- Ready-to-send GMGN onboarding evidence generator.
- Removal of random emoji fallbacks from newly launched tokens.

## Still external

- Actual factory deployment and wallet signatures.
- ETH funding.
- Blockscout verification acceptance.
- The first real launch and roundtrip.
- GMGN discovery and official launchpad-label approval.
- Public launching and real perps activation.
