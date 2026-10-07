// Exercise the actual creation form with mocked wallet/RPC/upload boundaries.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as viem from "viem";

const require = createRequire(import.meta.url);
const wallet = `0x${"1".repeat(40)}`;
const otherWallet = `0x${"2".repeat(40)}`;
const chain = { id: 46630, name: "Testnet", blockExplorers: { default: { url: "https://explorer.example" } } };
const economics = { quoteAsset: viem.zeroAddress, virtualQuote: 100n, graduationQuote: 1000n };
let states, cursor, effects, events, scenario;
const noop = () => {};
function reset(overrides = {}) {
  states = []; cursor = 0; effects = []; events = [];
  scenario = { address: wallet, authenticated: true, ...overrides };
}
const dependencies = {
  react: {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return states[index] ??= { current: initial }; },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = states[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); states[index] = { deps, cleanup: callback() }; });
      }
    },
    useMemo: callback => callback(), useCallback: callback => callback,
  },
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  "next/navigation": { useRouter: () => ({ replace: noop }) },
  "../hooks/usePendingReferral": { usePendingReferral: () => ({ referral: null, clear: noop }) },
  "../lib/referrals/client": { fetchPendingReferral: async () => null },
  "../components/WalletProvider": { useWallet: () => ({ authenticated: scenario.authenticated, connect: noop }) },
  "../lib/contracts/economics": { launchFee: () => 1n },
  "../lib/contracts/korum": {
    KORUM_CHAIN: chain, KORUM_QUOTE_ASSET: viem.zeroAddress, KORUM_LAUNCH_CONFIG_ID: 1,
    KORUM_FACTORY_ADDRESS: otherWallet,
  },
  "../lib/token-image-policy": {
    TOKEN_IMAGE_MAX_INPUT_BYTES: 5 * 1024 * 1024,
    TOKEN_IMAGE_TYPES: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  },
  "../lib/token-image-client": { uploadTokenImage: async (file, address) => {
    assert.equal(address, wallet);
    events.push(`upload:${file.name}`);
    if (scenario.pauseUpload) await scenario.pauseUpload;
    if (scenario.failImage === file.name) throw new Error("Image service unavailable");
    if (scenario.changeWallet) { scenario.address = otherWallet; render(); }
    return { cid: `cid-${file.name}`, uri: `ipfs://cid-${file.name}`, bytes: 500 };
  } },
  "@tanstack/react-query": { useQuery: () => ({ data: { economicsId: 7, economics, costA: 1n, costB: 1n } }) },
  wagmi: {
    useAccount: () => ({ address: scenario.address, isConnected: true }),
    useChainId: () => chain.id,
    useBalance: () => ({ data: { value: 10n ** 18n } }),
    useSwitchChain: () => ({ switchChainAsync: async () => {} }),
    useReadContract: ({ functionName }) => ({ data: functionName === "getConfig"
      ? { active: true, totalSupply: 10n ** 24n } : functionName === "MIN_CREATOR_BUY_BPS" ? 10 : 200 }),
    useWaitForTransactionReceipt: () => ({}),
    usePublicClient: () => ({
      readContract: async ({ functionName }) => {
        events.push(functionName);
        return functionName === "resolve" ? [8, economics] : 3n;
      },
      simulateContract: async request => {
        events.push("simulate");
        assert.equal(request.args[0].campA.uri, "ipfs://cid-a.png");
        assert.equal(request.args[0].campB.uri, "ipfs://cid-b.png");
        assert.equal(request.args[0].expectedEconomicsId, 8);
      },
    }),
    useWriteContract: () => ({ reset: noop, writeContractAsync: async request => {
      events.push("sign");
      assert.equal(request.account, wallet);
      assert.equal(request.args[0].campA.uri, "ipfs://cid-a.png");
      assert.equal(request.args[0].campB.uri, "ipfs://cid-b.png");
      if (scenario.rejectSignature) throw new Error("Signature rejected");
      return `0x${"a".repeat(64)}`;
    } }),
  },
};
const code = ts.transpileModule(readFileSync(new URL("../app/create/CreateVersusForm.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const exports = {};
new Function("exports", "require", code)(exports, name => dependencies[name] ?? require(name));
function render() {
  cursor = 0; effects = [];
  const tree = exports.default({ initialPendingReferral: null });
  effects.forEach(effect => effect());
  return tree;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
const find = predicate => nodes(render()).find(predicate);
const markup = () => renderToStaticMarkup(render());
const change = (id, value) => find(node => node.props.id === id).props.onChange({ target: { value } });
const file = name => new File(["local file"], name, { type: "image/png" });
function selectImage(side, chosen) {
  find(node => node.type === "input" && node.props["aria-label"] === `Side ${side} image`)
    .props.onChange({ target: { files: [chosen], value: "selected" } });
}
function fill() {
  change("versus-title", "Pizza versus Burger");
  change("camp-a-name", "Pizza"); change("camp-b-name", "Burger");
  selectImage("A", file("a.png")); selectImage("B", file("b.png"));
  find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
}
const submit = () => find(node => node.type === "form").props.onSubmit({ preventDefault: noop });

reset();
assert.equal(nodes(render()).filter(node => node.type === "input" && node.props.type === "file").length, 2);
assert.ok(!markup().includes("Public image URI"));
assert.match(markup(), /256 × 256/);
fill();
await submit();
assert.deepEqual(events, ["upload:a.png", "upload:b.png", "resolve", "previewCost", "simulate", "sign"]);

for (const failImage of ["a.png", "b.png"]) {
  reset({ failImage }); fill(); await submit();
  assert.ok(!events.includes("sign"));
  assert.ok(!events.includes("simulate"));
  assert.match(markup(), /Image service unavailable/);
  scenario.failImage = null; events = [];
  await submit();
  assert.equal(events.at(-1), "sign", "Can retry after partial upload failure");
}
reset({ changeWallet: true }); fill(); await submit();
assert.deepEqual(events, ["upload:a.png"]);
assert.match(markup(), /Your wallet changed/);

reset({ rejectSignature: true }); fill(); await submit();
assert.match(markup(), /Signature rejected/);
scenario.rejectSignature = false; await submit();
assert.equal(events.filter(event => event === "sign").length, 2);

reset(); fill();
let resume;
scenario.pauseUpload = new Promise(resolve => { resume = resolve; });
const pending = submit();
assert.match(markup(), /Uploading token images/);
assert.ok(nodes(render()).filter(node => node.type === "input" && node.props.type === "file").every(node => node.props.disabled));
await submit();
assert.deepEqual(events, ["upload:a.png"], "Double submit is ignored");
resume(); await pending;

reset();
change("versus-title", "Pizza versus Burger"); change("camp-a-name", "Pizza"); change("camp-b-name", "Burger");
selectImage("A", new File(["bad"], "bad.svg", { type: "image/svg+xml" }));
await submit();
assert.equal(events.length, 0);
assert.match(markup(), /Choose an image from your device for each side/);
selectImage("A", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
assert.match(markup(), /no larger than 5 MB/);
console.log("Creation images passed: local files only, upload-before-sign order, partial failure/retry, wallet changes, rejected signatures, pending lock and file limits.");
