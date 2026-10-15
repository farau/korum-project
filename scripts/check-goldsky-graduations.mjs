// Pure fixture checks; optional PostgreSQL validation uses SELECT only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const pipeline = await readFile(new URL('../goldsky/pipelines/korum-robinhood-testnet.yaml', import.meta.url), 'utf8');
const graduation = pipeline.split('\n  camp_graduations:\n')[1]?.split('\n  market_notifications:')[0];
assert.ok(graduation, 'Graduation transform exists');
const expression = graduation.match(/^\s+(concat\(.+\)) AS pool_id,/m)?.[1];
assert.ok(expression, 'Pool IDs are canonicalized before reaching PostgreSQL');
assert.doesNotMatch(pipeline, /to_u256\(/, 'Removed Goldsky functions cannot be redeployed');
assert.equal((pipeline.match(/AS DECIMAL\(78, 0\)/g) ?? []).length, 21, 'All 256-bit values retain exact integer precision');
assert.match(graduation, /WHERE decoded\.event_signature = 'Graduated'/);
assert.match(graduation, /CAST\(log_index AS INT\) AS log_index, _gs_op/);

// The exact bytes32 representation captured from the failing live transform.
const raw = '9d4a201ec1fa043a06003ef6e3338a6a1eba18cad4673b90c31aa428e01bd172';
const expected = `0x${raw}`;
const fixtures = [raw, expected, raw.toUpperCase(), `0X${raw.toUpperCase()}`, '0'.repeat(64), `${'0'.repeat(62)}ab`];
const normalize = value => `0x${value.toLowerCase().replace(/^0x/, '')}`;
assert.equal(normalize(raw), expected);
assert.equal(normalize(expected), expected, 'Already prefixed values never acquire a duplicate prefix');
for (const value of fixtures) assert.match(normalize(value), /^0x[0-9a-f]{64}$/);
assert.equal(normalize(`${'0'.repeat(62)}ab`), `0x${'0'.repeat(62)}ab`, 'Leading zero bytes must survive');

const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (databaseUrl) {
  const db = postgres(databaseUrl, { max: 1, connect_timeout: 10, prepare: false });
  try {
    // Execute the pool expression copied from the YAML, not a reimplementation.
    const sql = expression.replaceAll('decoded.event_params[2]', '$1::text');
    for (const value of fixtures) {
      const [row] = await db.unsafe(`SELECT ${sql} AS pool_id`, [value]);
      assert.equal(row.pool_id, normalize(value));
      assert.match(row.pool_id, /^0x[0-9a-f]{64}$/);
    }
    const values = ['5522769255517772246179202322510240', '204081632653062010797259894', '0', ((2n ** 256n) - 1n).toString()];
    for (const value of values) {
      const [row] = await db`SELECT CAST(${value} AS DECIMAL(78, 0))::TEXT AS value`;
      assert.equal(row.value, value, 'No precision loss for actual event values or maximum uint256');
    }
    console.log('PostgreSQL read-only checks passed: actual pool-ID SQL and exact 256-bit numeric conversions.');
  } finally { await db.end({ timeout: 2 }); }
}
console.log('Goldsky graduation checks passed: failing pool fixture, optional prefix, uppercase, leading zeros and numeric compatibility.');
