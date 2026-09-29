# Contract artifacts

This directory is the canonical, version-controlled source for Korum contract
integration data shared by the frontend, scripts, and indexer configuration.

```text
contracts/
├── abis/                   JSON ABI arrays, one file per contract
└── deployments/            Public addresses grouped by chain ID
    ├── 4663.json           Robinhood Chain mainnet placeholder
    └── 46630.json          Robinhood Chain Testnet deployment
```

## ABIs

Place each ABI in `contracts/abis/` using the exact contract name. The expected
files and accepted JSON format are documented in `contracts/abis/README.md`.

Prefer ABI output generated from the contract source. If an ABI must be copied
from a block explorer, use only the ABI of a verified contract and save the JSON
array, not the complete compiler artifact.

## Deployment addresses

Contract addresses are public configuration and should be committed. They must
not be stored in `.env` files or repeated inside React components.

Each network has one manifest named after its numeric chain ID. `4663.json`
intentionally contains `null` values until the Korum mainnet deployment exists.
The contract adapter fails immediately when `mainnet` is selected with an
incomplete manifest. Never reuse the testnet Korum addresses as mainnet defaults.

Testnet v2 addresses, ABIs and deployment blocks were retrieved from the
[Robinhood testnet explorer](https://explorer.testnet.chain.robinhood.com) on
2026-09-29. Mainnet blocks remain unset. `KorumSeeder` was discovered through
`KorumCore.SEEDER()` and its constructor arguments; its address is
`0xDdC5e687E7CFB489b1e7b26E19285ABF75775048`.

The manifest also owns `launch.configId`, `launch.quoteAsset`, `version`,
`readModelSchema` and `watchlistTable`. Resolve the economics ID on-chain before
quoting and submitting a launch. Testnet currently admits native ETH only.
`KorumLens` supplies quotes, `KorumPairRegistry` supplies pair economics, and
`KorumSeeder` is invoked internally by Core during graduation.

The explorer provides the LiquidityLocker ABI/source but currently reports
`is_verified: false` for that address; do not describe it as verified.

Database credentials, private keys, RPC credentials, and Goldsky API keys are
secrets. They do not belong in this directory.
