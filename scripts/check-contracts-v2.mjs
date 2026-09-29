import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicClient, http, zeroAddress, encodeFunctionData, formatEther } from 'viem';
import { launchFee, sellFeeBps } from '../app/lib/contracts/economics.ts';
// Non-divisible ratios exercise Solidity's opposite rounding rules for fees
// (ceil) and tier boundaries (floor), including equality at each threshold.
const roundingConfig = { launchFeeNum: 1, launchFeeDen: 3, tier1Num: 1, tier1Den: 3, tier2Num: 2, tier2Den: 3, fee1Bps: 125, fee2Bps: 100, fee3Bps: 75 };
assert.equal(launchFee(roundingConfig, 10n), 4n);
assert.equal(launchFee(roundingConfig, 9n), 3n);
assert.equal(sellFeeBps(roundingConfig, 10n, 2n), 125);
assert.equal(sellFeeBps(roundingConfig, 10n, 3n), 100);
assert.equal(sellFeeBps(roundingConfig, 10n, 5n), 100);
assert.equal(sellFeeBps(roundingConfig, 10n, 6n), 75);
assert.equal(sellFeeBps(roundingConfig, 100n, 6n), 125);
const chainId = Number(process.env.KORUM_TEST_CHAIN_ID || 46630);
const deployment = JSON.parse(await readFile(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url)));
assert.equal(deployment.chainId, chainId);
assert.ok(deployment.launch.configId, 'Missing chain-specific launch config');
const abi = async name => JSON.parse(await readFile(new URL(`../contracts/abis/${name}.json`, import.meta.url)));
const client = createPublicClient({ transport: http(process.env.KORUM_TEST_RPC_URL || ({46630: 'https://rpc.testnet.chain.robinhood.com'})[chainId], { timeout: 15000 }) });
assert.equal(await client.getChainId(), chainId);
const contracts = deployment.contracts;
const read = async (name, functionName, args = []) => client.readContract({ address: contracts[name].address, abi: await abi(name), functionName, args });
for (const [name, contract] of Object.entries(contracts)) {
  assert.ok(contract.address && contract.deploymentBlock, name);
  assert.notEqual(await client.getCode({ address: contract.address }), undefined, `${name} has no deployed code`);
}
assert.equal((await read('KorumCore', 'SEEDER')).toLowerCase(), contracts.KorumSeeder.address.toLowerCase());
assert.equal((await read('KorumFactory', 'REGISTRY')).toLowerCase(), contracts.KorumPairRegistry.address.toLowerCase());
assert.equal((await read('KorumLens', 'CORE')).toLowerCase(), contracts.KorumCore.address.toLowerCase());
const [economicsId, economics] = await read('KorumPairRegistry', 'resolve', [deployment.launch.quoteAsset]);
assert.equal(economicsId, 1);
assert.equal(economics.quoteAsset, zeroAddress);
assert.equal(economics.quoteDecimals, 18);
const config = await read('KorumCore', 'getConfig', [deployment.launch.configId]);
assert.equal(config.active, true);
const params = {
  title: 'Integration test', description: 'Read-only preview', category: 'Crypto', socialsJson: '{}',
  campA: { name: 'Alpha', symbol: 'ALPHA', uri: 'https://example.com/a.png' },
  campB: { name: 'Beta', symbol: 'BETA', uri: 'https://example.com/b.png' },
  creatorBuyBpsA: 100, creatorBuyBpsB: 100, creatorFeeRecipient: '0x0000000000000000000000000000000000000001',
  configId: deployment.launch.configId, quoteAsset: deployment.launch.quoteAsset, expectedEconomicsId: economicsId,
  salt: `0x${'11'.repeat(32)}`,
};
const quantity = config.totalSupply / 100n;
const buy = await read('KorumLens', 'quoteCreatorInitialBuy', [params.configId, economics.virtualQuote, economics.graduationQuote, quantity]);
const cost = await read('KorumLens', 'previewCost', [params, economics.virtualQuote, economics.graduationQuote]);
assert.equal(cost, launchFee(config, economics.graduationQuote) + buy * 2n);
assert.ok(encodeFunctionData({ abi: await abi('KorumFactory'), functionName: 'createVersus', args: [params, zeroAddress] }));
assert.ok(encodeFunctionData({ abi: await abi('KorumCore'), functionName: 'buy', args: [contracts.KorumFactory.address, params.creatorFeeRecipient, 1n, 0n, zeroAddress] }));
await assert.rejects(read('KorumPairRegistry', 'resolve', [contracts.KorumCore.address]), /AssetNotAdmitted/);
console.log(JSON.stringify({ chainId, configId: params.configId, economicsId, virtualEth: formatEther(economics.virtualQuote), graduationEthPerCamp: formatEther(economics.graduationQuote), launchFeeEth: formatEther(launchFee(config, economics.graduationQuote)), previewCostEth: formatEther(cost), seeder: contracts.KorumSeeder.address }));
console.log('v2 contract checks passed: code, wiring, native registry, Lens quotes, preview and new calldata. No transaction sent.');
