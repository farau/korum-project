import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/components/explore/PriceSparkline.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
runInNewContext(code, { exports, require });
const render = series => renderToStaticMarkup(React.createElement(exports.default, { name: 'Test token', series }));
for (const values of [undefined, [], Array(96).fill(null), Array(96).fill(NaN)]) {
  const html = render(values);
  assert.ok(html.includes('no price history'));
  assert.ok(!html.includes('<svg'), 'No fabricated zero-price curve');
}
let values = Array(96).fill(null);
values[95] = 5;
let html = render(values);
assert.match(html, /<circle[^>]+cx="82"[^>]+cy="14"/, 'One known price is a point at the current end of the axis');
assert.ok(!html.includes('<polyline'));
values[94] = 3;
html = render(values);
assert.ok(html.includes('points="81.16666666666667,25 82,3"'), 'Recent activity stays at the right; gaps are not compressed');
assert.ok(html.includes('sampled every 15 minutes'));
html = render(Array(96).fill(5));
assert.ok(html.includes('2.8333333333333335,14') && html.includes('82,14'), 'A known unchanged price is a centered horizontal curve');
values = Array(96).fill(null);
values[92] = 5; values[93] = 4; values[95] = 3;
html = render(values);
assert.equal((html.match(/<polyline/g) ?? []).length, 1);
assert.equal((html.match(/<circle/g) ?? []).length, 1, 'Missing internal history is never bridged');
assert.ok(html.includes('table-spark sell'));
assert.ok(!/NaN|Infinity/.test(html));
console.log('Sparkline rendering passed: fixed time positions, missing history, single point, flat prices, gaps and accessible labels.');
