# Contract ABIs

Store one JSON ABI array per contract in this directory:

```text
KorumCore.json
KorumFactory.json
KorumRouter.json
KorumHook.json
FeeEscrow.json
ReferralRegistry.json
VersusToken.json
```

Each file must contain the ABI array directly:

```json
[
  {
    "type": "function",
    "name": "example",
    "inputs": [],
    "outputs": [],
    "stateMutability": "view"
  }
]
```

Do not save a block explorer page, Solidity source, or a complete Foundry
artifact shaped like `{ "abi": [...] }` here.

When the Solidity repository is available, regenerate the files instead of
editing them manually:

```bash
forge inspect KorumCore abi > contracts/abis/KorumCore.json
```

These committed ABI files will be consumed by the Viem frontend integration and
the Goldsky event-decoding pipeline.
