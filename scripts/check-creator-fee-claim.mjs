// Exercise the actual component with mocked wallet/RPC hooks. No transactions sent.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as viem from 'viem';

const require = createRequire(import.meta.url);
const abi = JSON.parse(await readFile(new URL('../contracts/abis/FeeEscrow.json', import.meta.url)));
const wallet = `0x${'1'.repeat(40)}`;
const other = `0x${'2'.repeat(40)}`;
const escrow = `0x${'3'.repeat(40)}`;
const chain = { id: 46630, name: 'Korum testnet' };
let scenario, states, cursor, calls;
function reset(overrides = {}) {
  scenario = { address: wallet, chainId: chain.id, amount: 123456789012345678n,
    freshAmount: 123456789012345678n, ...overrides };
  states = []; calls = []; cursor = 0;
}
const dependencies = {
  react: { useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], value => { states[index] = value; }];
  } },
  '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => { calls.push('balance refresh'); } }) },
  wagmi: {
    useAccount: () => ({ address: scenario.address }),
    useChainId: () => scenario.chainId,
    useSwitchChain: () => ({ switchChainAsync: async () => { calls.push('switch'); if (scenario.switchFails) throw new Error('Rejected'); } }),
    usePublicClient: () => ({
      readContract: async request => {
        assert.equal(request.address, escrow);
        assert.equal(request.functionName, 'claimable');
        assert.equal(request.args[0], wallet);
        calls.push('fresh read'); return scenario.freshAmount;
      },
      simulateContract: async request => {
        assert.equal(request.account, wallet);
        assert.equal(request.address, escrow);
        assert.equal(viem.encodeFunctionData(request), viem.toFunctionSelector('claim()'));
        calls.push('simulate');
        if (scenario.simulationFails) throw new Error('Simulation failed');
      },
      waitForTransactionReceipt: async () => { calls.push('receipt'); return { status: scenario.reverted ? 'reverted' : 'success' }; },
    }),
    useWriteContract: () => ({ writeContractAsync: async request => {
      assert.equal(request.functionName, 'claim');
      assert.equal(request.address, escrow);
      assert.equal(request.account, wallet);
      assert.equal(request.chainId, chain.id);
      calls.push('sign');
      if (scenario.rejected) throw new viem.BaseError('User rejected the request.');
      return `0x${'a'.repeat(64)}`;
    } }),
    useReadContract: options => {
      const isBalance = options.functionName === 'claimable';
      if (isBalance) {
        assert.equal(options.args[0], scenario.address ?? viem.zeroAddress);
        assert.equal(options.query.enabled, Boolean(scenario.address));
      }
      return { data: isBalance ? scenario.amount : options.functionName === 'getCurve' ? { creator: other } : undefined,
        isError: isBalance && scenario.readFailed, isPending: false,
        refetch: async () => { if (isBalance) { calls.push('claimable refresh'); scenario.amount = scenario.reverted || scenario.rejected || scenario.simulationFails ? scenario.freshAmount : 0n; } },
      };
    },
  },
  '../config/korum-network': { KORUM_CHAIN: chain },
  '../hooks/useIndexedMarkets': { INDEXED_DEBATE_QUERY_KEY: 'versus' },
  '../lib/contracts/korum': { FEE_ESCROW_ABI: abi, FEE_ESCROW_ADDRESS: escrow },
  './ProfileFeeClaim.module.css': { default: {} },
  './CreatorSocialsEditor': { default: () => null },
};
const source = await readFile(new URL('../app/components/ProfileFeeClaim.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const exports = {};
runInNewContext(code, { exports, require: name => dependencies[name] ?? require(name), console });
function render() {
  cursor = 0;
  return exports.default();
}
function buttons(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!React.isValidElement(node)) return [];
  return [...(node.type === 'button' ? [node] : []), ...buttons(node.props.children)];
}
const claimButton = () => buttons(render()).find(button => button.props.children === 'Claim fees');
const markup = () => renderToStaticMarkup(render());
async function clickClaim() {
  claimButton().props.onClick();
  await new Promise(resolve => setImmediate(resolve));
}

reset();
assert.match(markup(), /0.123456789012345678 ETH/);
assert.match(markup(), /across all Versus/);
assert.equal(claimButton().props.disabled, false, 'A former recipient can withdraw retained fees');
await clickClaim();
assert.deepEqual(calls, ['fresh read', 'simulate', 'sign', 'receipt', 'claimable refresh', 'balance refresh']);
assert.match(markup(), /Fees claimed successfully/);
assert.match(markup(), /0 ETH/);

for (const overrides of [{ address: undefined }, { amount: 0n }, { amount: undefined }, { readFailed: true }]) {
  reset(overrides);
  assert.ok(claimButton().props.disabled, 'No claim with disconnected, empty, loading or unavailable balance');
}
reset({ freshAmount: 0n });
await clickClaim();
assert.ok(!calls.includes('sign'));
assert.match(markup(), /no fees to claim/);

for (const overrides of [{ simulationFails: true }, { rejected: true }, { reverted: true }]) {
  reset(overrides);
  await clickClaim();
  assert.doesNotMatch(markup(), /Fees claimed successfully/);
  assert.equal(claimButton().props.disabled, false, 'Retry is available after failure');
  if (overrides.simulationFails) assert.ok(!calls.includes('sign'));
  if (overrides.rejected) assert.ok(!calls.includes('receipt'));
}
for (const switchFails of [false, true]) {
  reset({ chainId: 1, switchFails });
  await clickClaim();
  assert.deepEqual(calls, ['switch'], 'Wrong-network requests must not submit a transaction');
}
// Check the actual Profile panel trees use the same claim component, including
// the empty Managed Versus state where a previous recipient still has accrued fees.
const profileSource = await readFile(new URL('../app/components/ProfileClient.tsx', import.meta.url), 'utf8');
const profileCode = ts.transpileModule(profileSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const profileExports = {};
runInNewContext(profileCode + '\nexports.testPanels = [ManagedVersusPanel, ReferralsPanel];', {
  exports: profileExports,
  require: name => {
    if (name === 'react') return { ...React, default: React, ...dependencies.react, useEffect: () => {} };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === '../lib/markets/format') return { formatMarketValue: value => String(value ?? 0) };
    if (name === './ProfileFeeClaim') return { default: exports.default };
    return {};
  },
});
function hasClaim(node) {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasClaim);
  return React.isValidElement(node) && (node.type === exports.default || hasClaim(node.props.children));
}
for (const panel of profileExports.testPanels) {
  reset();
  assert.ok(hasClaim(panel({ code: 'TEST', stats: { referredVolumeUsd: 0, referredVolumeEth: 0, referralCount: 0, activeReferralCount: 0 } })), 'Managed Versus and Referrals must both expose the shared withdrawal');
}
console.log('Profile fee claim checks passed: both Profile tabs, wallet-wide balance, retained rights, successful payout, fresh zero balance, failures and network switching. No transaction sent.');
