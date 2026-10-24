// Explicit allowlist: never include live-account, deployed-contract or remote DB checks.
import { spawnSync } from 'node:child_process';
const mode = process.argv[2] || 'unit';
const unit = [
  'annual-analytics', 'audit-followup', 'avatar-images', 'create-images', 'creator-fee-claim',
  'graduated-markets', 'graduation-button', 'local-sharing', 'market-hub', 'market-live-chart',
  'market-live-protocol', 'market-price-changes', 'notification-isolation', 'price-sparkline',
  'profile-live', 'profile-pnl', 'profile-sse', 'public-wallet', 'referral-eligibility', 'token-images',
  'wallet-session-isolation', 'watchlist-client',
].map(name => [name]);
const integration = [
  ['auth-replay'], ['cache-resilience'], ['debate-cache'], ['explore-pagination'],
  ['market-chart-cache'], ['market-delivery'], ['market-snapshot-aggregates'], ['profile-pnl', '--redis'],
];
if (!['unit', 'integration', 'all'].includes(mode)) throw Error('Use unit, integration or all');
const database = process.env.KORUM_TEST_DATABASE_URL || 'postgres://korum_test@127.0.0.1:16482/postgres';
const redis = process.env.KORUM_TEST_REDIS_URL || 'redis://127.0.0.1:16481';
for (const address of [database, redis]) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(address).hostname)) throw Error('Test services must be local');
}
const env = { ...process.env, DATABASE_URL: database, REDIS_URL: redis,
  KORUM_TEST_DATABASE_URL: database, KORUM_TEST_REDIS_URL: redis,
  KORUM_KEEP_TEST_DATABASE: '0', KORUM_TEST_KEEP_DATABASE: '0',
};
delete env.KORUM_TEST_PROOF;
const checks = mode === 'unit' ? unit : mode === 'integration' ? integration : [...unit, ...integration];
for (const [name, ...args] of checks) {
  console.log(`\nChecking ${name}${args.length ? ' ' + args.join(' ') : ''}`);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', `scripts/check-${name}.mjs`, ...args], {
    stdio: 'inherit', env, timeout: 10 * 60_000,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\n${checks.length} checks passed (${mode}).`);
