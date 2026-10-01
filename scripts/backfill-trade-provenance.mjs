import process from "node:process";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL is required.");

const chainId = process.env.NEXT_PUBLIC_KORUM_NETWORK === "mainnet" ? 4663 : 46630;
const deployment = JSON.parse(await readFile(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url)));
const schema = deployment.readModelSchema;
const coreAddress = deployment.contracts.KorumCore.address?.toLowerCase();
const hookAddress = deployment.contracts.KorumHook.address?.toLowerCase();
if (!coreAddress || !hookAddress) throw new Error("KorumCore and KorumHook deployments are required.");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
});

try {
  const emitters = await sql`
    UPDATE ${sql(schema)}.camp_trades
    SET emitter_address = CASE venue
      WHEN 0 THEN ${coreAddress}
      WHEN 1 THEN ${hookAddress}
    END
    WHERE chain_id = ${chainId}
      AND emitter_address IS NULL
  `;
  const pools = await sql`
    UPDATE ${sql(schema)}.camp_trades trade
    SET pool_id = graduation.pool_id
    FROM ${sql(schema)}.camp_graduations graduation
    WHERE trade.chain_id = ${chainId}
      AND trade.chain_id = graduation.chain_id
      AND trade.token_address = graduation.token_address
      AND trade.venue = 1
      AND trade.pool_id IS DISTINCT FROM graduation.pool_id
  `;
  const [remaining] = await sql`
    SELECT COUNT(*)::INTEGER AS count
    FROM ${sql(schema)}.camp_trades
    WHERE chain_id = ${chainId} AND emitter_address IS NULL
  `;
  if (remaining.count !== 0) throw new Error(`${remaining.count} trades still lack emitter provenance.`);
  process.stdout.write(`Trade provenance backfill complete: ${emitters.count} emitters and ${pools.count} pool IDs updated.\n`);
} finally {
  await sql.end({ timeout: 5 });
}
