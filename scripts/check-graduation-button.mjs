// Actual action/component checks with mocked RPC and wallet methods; never broadcasts a transaction.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
async function load(path, dependencies) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, BigInt, Promise, Error, require: name => {
    if (name in dependencies) return dependencies[name];
    if (['react', 'react/jsx-runtime', 'viem'].includes(name)) return require(name);
    throw new Error(`Unmocked dependency ${name}`);
  } });
  return exports;
}
const core = `0x${'a'.repeat(40)}`;
const token = `0x${'b'.repeat(40)}`;
const account = `0x${'c'.repeat(40)}`;
const hash = `0x${'d'.repeat(64)}`;
const replacement = `0x${'e'.repeat(64)}`;
const abi = JSON.parse(await readFile(new URL('../contracts/abis/KorumCore.json', import.meta.url), 'utf8'));
const action = await load('app/lib/markets/graduation.ts', {
  '../contracts/korum': { KORUM_CORE_ABI: abi, KORUM_CORE_ADDRESS: core },
});
let status;
let estimatedGas;
let simulationFailure;
let walletFailure;
let waitFailure;
let receiptStatus;
let replacementReason;
let holdSimulation;
let releaseSimulation;
let calls;
let connected;
let hydrated;
let chainId;
let updates;
let notifications;
let observed;
function reset() {
  status = 2; estimatedGas = 300_000n; simulationFailure = walletFailure = waitFailure = null;
  receiptStatus = 'success'; replacementReason = undefined; holdSimulation = false;
  calls = []; connected = true; hydrated = true; chainId = 46630; updates = []; notifications = []; observed = [];
}
const client = {
  readContract: async request => {
    calls.push(`read:${request.functionName}`);
    assert.equal(request.address, core);
    if (request.functionName === 'getCurve') { assert.equal(request.args[0], token); return { status }; }
    assert.equal(request.functionName, 'MIN_GRADUATION_GAS');
    return 500_000n;
  },
  estimateContractGas: async request => { calls.push('estimate'); assert.equal(request.functionName, 'graduate'); return estimatedGas; },
  simulateContract: async request => {
    calls.push('simulate'); assert.equal(request.gas >= 1_000_000n, true);
    assert.equal(request.value, undefined, 'Graduation never attaches ETH or a trade amount');
    if (holdSimulation) await new Promise(resolve => { releaseSimulation = resolve; });
    if (simulationFailure) throw simulationFailure;
  },
  waitForTransactionReceipt: async request => {
    calls.push(`wait:${request.hash}`);
    if (waitFailure) throw waitFailure;
    if (replacementReason) request.onReplaced({ reason: replacementReason, transaction: { hash: replacement } });
    if (receiptStatus === 'success' && (!replacementReason || replacementReason === 'repriced')) status = 3;
    return { status: receiptStatus };
  },
};
reset();
let request = await action.prepareGraduation(client, token, account);
assert.equal(request.gas, 1_000_000n, 'Gas floor protects the contract graduation minimum');
assert.equal(request.account, account);
assert.equal(request.functionName, 'graduate');
assert.equal(request.args[0], token);
assert.equal(request.value, undefined);
assert.equal(calls.join(','), 'read:getCurve,read:MIN_GRADUATION_GAS,estimate,simulate');
reset(); estimatedGas = 2_000_001n;
request = await action.prepareGraduation(client, token, account);
assert.equal(request.gas, 2_400_002n, 'Larger rollup gas estimates retain a rounded-up margin');
reset(); status = 3;
assert.equal(await action.prepareGraduation(client, token, account), null);
assert.deepEqual(calls, ['read:getCurve']);
reset(); status = 1;
await assert.rejects(action.prepareGraduation(client, token, account), /not awaiting migration/);
assert.deepEqual(calls, ['read:getCurve']);

let click;
let stateIndex;
let overrides;
const jsx = require('react/jsx-runtime');
const capture = method => (type, props, ...rest) => {
  if (type === 'button') click = props.onClick;
  return jsx[method](type, props, ...rest);
};
const component = await load('app/components/GraduateTokenButton.tsx', {
  react: { ...React, useState: initial => {
    const index = stateIndex++;
    const [value] = React.useState(index in overrides ? overrides[index] : initial);
    return [value, next => updates.push({ index, value: next })];
  } },
  'react/jsx-runtime': { ...jsx, jsx: capture('jsx'), jsxs: capture('jsxs') },
  '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
  wagmi: {
    useAccount: () => ({ address: connected ? account : undefined, isConnected: connected }),
    useChainId: () => chainId, usePublicClient: () => client,
    useSwitchChain: () => ({ switchChainAsync: async () => { calls.push('switch'); chainId = 46630; } }),
    useWriteContract: () => ({ writeContractAsync: async request => {
      calls.push('write'); assert.equal(request.address, core); assert.equal(request.account, account);
      assert.equal(request.functionName, 'graduate'); assert.equal(request.args[0], token);
      assert.equal(request.chainId, 46630); assert.equal(request.value, undefined);
      assert.equal(calls.includes('simulate'), true, 'Simulation precedes the wallet prompt');
      if (walletFailure) throw walletFailure;
      return hash;
    } }),
  },
  '../config/korum-network': { KORUM_CHAIN: { id: 46630, blockExplorers: { default: { url: 'https://explorer.testnet.chain.robinhood.com' } } } },
  '../config/deployment': { DEPLOYMENT_CACHE_SCOPE: 'test' },
  '../hooks/useIndexedMarkets': { INDEXED_DEBATES_QUERY_KEY: ['debates'], INDEXED_DEBATE_QUERY_KEY: 'debate' },
  '../lib/markets/graduation': action,
  './WalletProvider': { useWallet: () => ({ hydrated, connect: () => calls.push('connect') }) },
  './VsDetailClient.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
});
function render(props = {}, state = {}) {
  click = undefined; stateIndex = 0; overrides = state;
  return renderToStaticMarkup(React.createElement(component.default, {
    tokenAddress: token, migrating: true, onStatus: message => notifications.push(message),
    onCurveStatus: (address, value) => observed.push({ address, status: value }), ...props,
  }));
}
reset();
assert.equal(render({ migrating: false }), '');
assert.ok(render().includes('Finalize migration'));
assert.ok(!render().includes('type="submit"'), 'Graduation never submits the enclosing buy/sell form');
reset(); hydrated = false; connected = false;
assert.ok(render().includes('Finalize migration'));
assert.ok(render().includes('disabled=""'));
render(); await click(); assert.deepEqual(calls, [], 'Hydration never opens the wallet');
reset(); connected = false;
assert.ok(render().includes('Connect wallet to finalize'));
await click(); assert.deepEqual(calls, ['connect']);
reset(); chainId = 1;
render(); await click(); assert.deepEqual(calls, ['switch'], 'Network switching requires a new click before sending');
reset(); render(); await click();
assert.equal(calls.filter(call => call === 'write').length, 1);
assert.equal(observed.at(-1).status, 3);
assert.equal(notifications.length, 1);
assert.ok(updates.some(update => update.value === 'confirming'));
reset(); status = 3; render(); await click();
assert.equal(calls.includes('write'), false, 'Already graduated tokens never request another transaction');
assert.equal(observed.at(-1).status, 3);
reset(); simulationFailure = new Error('InvalidGraduationLiquidity'); render(); await click();
assert.equal(calls.includes('write'), false);
assert.ok(updates.some(update => update.value === 'InvalidGraduationLiquidity'));
assert.deepEqual(observed, [], 'Failed simulations never unblock trading');
reset(); walletFailure = new Error('User rejected request'); render(); await click();
assert.equal(calls.some(call => call.startsWith('wait:')), false);
assert.deepEqual(observed, []);
assert.ok(updates.some(update => typeof update.value === 'string' && update.value.includes('cancelled')));
reset(); receiptStatus = 'reverted'; render(); await click();
assert.deepEqual(observed, []);
assert.ok(updates.some(update => typeof update.value === 'string' && update.value.includes('reverted')));
reset(); waitFailure = new Error('RPC timeout'); render(); await click();
waitFailure = null;
await click();
assert.equal(calls.filter(call => call === 'write').length, 1, 'Retrying confirmation monitors the existing hash');
assert.equal(observed.at(-1).status, 3);
reset(); holdSimulation = true; render(); const first = click();
while (!releaseSimulation) await new Promise(resolve => setImmediate(resolve));
await click(); releaseSimulation(); await first;
assert.equal(calls.filter(call => call === 'write').length, 1, 'Rapid clicks never open duplicate wallet prompts');
reset(); replacementReason = 'repriced'; render(); await click();
assert.ok(updates.some(update => update.value === replacement));
assert.equal(observed.at(-1).status, 3);
reset(); replacementReason = 'cancelled'; render(); await click();
assert.deepEqual(observed, [], 'A successful cancellation receipt is not a successful graduation');
assert.ok(updates.some(update => typeof update.value === 'string' && update.value.includes('replaced')));
reset(); render({}, { 0: 'confirming', 1: hash, 3: true });
assert.ok(render({}, { 0: 'confirming', 1: hash, 3: true }).includes('disabled=""'));
assert.ok(render({}, { 1: hash, 3: true }).includes('Check confirmation'));
assert.ok(render({ migrating: false }, { 1: hash, 2: true }).includes('Migration confirmed'));
console.log('Graduation button checks passed: permissionless wallet flow, status guard, gas reserve, simulation before write, correct Core/token/network, rejected/reverted/replaced transactions, pending-hash retries and double-click prevention.');
