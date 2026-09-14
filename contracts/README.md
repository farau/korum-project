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

The `deploymentBlock` values are intentionally `null` until they are verified
from the deployment transactions. They must be filled before an indexer
backfill is configured.

Database credentials, private keys, RPC credentials, and Goldsky API keys are
secrets. They do not belong in this directory.
