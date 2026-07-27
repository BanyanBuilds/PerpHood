# V42 Local-Chain Launchpad Quick Start

## Requirements

- Node.js and npm
- Foundry (`forge`, `anvil`)
- MetaMask or another injected EVM wallet

## Start the sandbox

Terminal 1:

```bash
npm install
npm run chain:anvil
```

Terminal 2:

```bash
npm run chain:v42
```

The V42 command:

1. compiles `LaunchpadFactoryV42.sol` with Forge;
2. deploys the factory to Anvil chain `31337`;
3. uses Anvil account 0 as owner and account 1 as the local sequencer identity;
4. launches one `HOOD` demo market from Anvil account 2;
5. writes `public/local-chain/v42-deployment.json`;
6. prints the environment values to add to `.env.local`.

Add the printed factory value:

```text
NEXT_PUBLIC_V42_LAUNCHPAD_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_LOCAL_CHAIN_RPC=http://127.0.0.1:8545
```

Restart the application:

```bash
npm run dev
```

Open:

- Terminal: `http://localhost:3000/`
- Launcher: `http://localhost:3000/terminal?panel=launch`
- Chain sandbox dashboard: `http://localhost:3000/admin/launchpad/sandbox`
- Lifecycle console: `http://localhost:3000/admin/launchpad`

In the Launcher funding step, choose **Anvil contract**. The wallet submits the creator-buy remainder to the deployed V42 factory. The browser mirrors the confirmed market address, token address, creator address, block number, and transaction hash into the Leverage X terminal record.

## Safety boundary

V42 uses native test ETH for the local spot curve. It is not canonical WETH, not Robinhood Chain, not audited, and not public-money ready. Perps remain attached to the V24 verification path rather than being settled by `LaunchpadMarketV42`.
