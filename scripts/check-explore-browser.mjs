// Run against the local build and the 300-market fixture from check-explore-pagination.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.KORUM_PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.env.KORUM_TEST_BASE_URL || 'http://127.0.0.1:3217');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.KORUM_CHROME_PATH });
const results = [];
try {
 for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [], requests = [];
  let reverse = false, reversed = false, fail = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.origin !== base.origin) return route.abort();
   if (url.pathname === '/api/versus' && url.searchParams.get('view') === 'explore') {
    requests.push(Object.fromEntries(url.searchParams));
    if (fail) return route.fulfill({ status: 503, json: { error: 'Synthetic outage' } });
    if (reverse && url.searchParams.get('page') === '3') {
     const response = await route.fetch(); const data = await response.json();
     reversed = true; return route.fulfill({ response, json: { ...data, items: data.items.reverse() } });
    }
   }
   return route.continue();
  });
  await page.goto(new URL('/explore', base).href, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.locator('.explore-pagination-status').filter({ hasText: 'of 300 Versus' }).waitFor();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.locator('.explore-pagination-status').filter({ hasText: 'Showing 13–24' }).waitFor();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.locator('.explore-pagination-status').filter({ hasText: 'Showing 25–36' }).waitFor();
  reverse = true;
  // Let the real background refresh run, with an intentionally reordered API page.
  const deadline = Date.now() + 25000;
  while (!reversed && Date.now() < deadline) await page.waitForTimeout(250);
  assert.ok(reversed, 'The page was refreshed');
  assert.equal(await page.locator('[aria-current="page"]').getAttribute('aria-label'), 'Page 3');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  assert.equal(await page.locator('.table-matchup-group').count(), 12);
  assert.equal(await page.locator('[aria-current="page"]').getAttribute('aria-label'), 'Page 3');
  await page.getByRole('button', { name: 'Memes', exact: true }).click();
  await page.locator('.table-matchup-group').filter({ hasText: 'Token 1-0' }).waitFor();
  assert.equal(await page.locator('.table-matchup-group').count(), 1, 'An old market outside the latest 100 is visible');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Minimum traders').fill('2');
  await page.getByRole('heading', { name: 'No matching versus', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
  await page.locator('.table-matchup-group').filter({ hasText: 'Token 1-0' }).waitFor();
  await page.getByRole('button', { name: /^Filters/ }).click();
  fail = true;
  await page.getByRole('button', { name: 'Politics', exact: true }).click();
  await page.getByRole('heading', { name: 'Live versus are temporarily unavailable', exact: true }).waitFor();
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('heading', { name: 'No matching versus', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  results.push({ width, pagePreservedOnRefresh: true, tableRows: 12, oldMarketFound: true, filtersAndRetry: true, apiCalls: requests.length, errors });
  await page.close();
 }
 if (process.env.KORUM_TEST_PROOF) await writeFile(process.env.KORUM_TEST_PROOF, JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2) + '\n');
 console.log(JSON.stringify(results));
} finally { await browser.close(); }
