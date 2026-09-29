import { readFile } from "node:fs/promises";
import { randomBytes, randomInt } from "node:crypto";
import process from "node:process";
import postgres from "postgres";

const chainId = process.env.NEXT_PUBLIC_KORUM_NETWORK === "mainnet" ? 4663 : 46630;
const deployment = JSON.parse(await readFile(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url)));
const schema = deployment.readModelSchema;
const watchlistTable = deployment.watchlistTable;
const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL is required to check the watchlist schema.");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
});
const connection = await sql.reserve();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const referralCode = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
const wallet = `0x${randomBytes(20).toString("hex")}`;

try {
  await connection.unsafe("BEGIN");

  const [table] = await connection`
    SELECT TO_REGCLASS(${`public.${watchlistTable}`})::TEXT AS name
  `;
  if (table?.name !== watchlistTable) throw new Error("The user_watchlist table is missing.");

  // Keep the check usable on a freshly deployed network with no real Versus.
  // This fixture and all watchlist changes are rolled back in finally.
  const versusId = BigInt(`0x${randomBytes(16).toString("hex")}`).toString();
  const eventHash = `0x${randomBytes(32).toString("hex")}`;
  const tokenA = `0x${randomBytes(20).toString("hex")}`;
  const tokenB = `0x${randomBytes(20).toString("hex")}`;
  const [versus] = await connection`
    INSERT INTO ${connection(schema)}.versuses (
      chain_id, versus_id, factory_address, creator_wallet, config_id,
      creator_fee_recipient, token_a_address, token_b_address, created_at,
      title, description, category, socials_json,
      transaction_hash, block_hash, block_number, log_index
    ) VALUES (
      ${chainId}, ${versusId}, ${deployment.contracts.KorumFactory.address.toLowerCase()}, ${wallet}, ${deployment.launch.configId},
      ${wallet}, ${tokenA}, ${tokenB}, NOW(),
      'Watchlist fixture', '', 'test', '{}', ${eventHash}, ${eventHash}, 0, 0
    ) RETURNING chain_id, versus_id::TEXT AS versus_id, title
  `;

  const [user] = await connection`
    INSERT INTO users (evm_wallet, referral_code, last_login_chain_id)
    VALUES (${wallet}, ${referralCode}, ${versus.chain_id})
    RETURNING id
  `;

  await connection`
    INSERT INTO ${connection(watchlistTable)} (user_id, chain_id, versus_id)
    VALUES (${user.id}, ${versus.chain_id}, ${versus.versus_id})
  `;

  const [stored] = await connection`
    SELECT w.user_id, w.versus_id::TEXT AS versus_id, v.title
    FROM ${connection(watchlistTable)} w
    JOIN ${connection(schema)}.versuses v
      ON v.chain_id = w.chain_id AND v.versus_id = w.versus_id
    WHERE w.user_id = ${user.id}
  `;
  if (stored?.versus_id !== versus.versus_id || stored?.title !== versus.title) {
    throw new Error("The watchlist row did not resolve to its indexed Versus.");
  }

  await connection`DELETE FROM users WHERE id = ${user.id}`;
  const [{ count }] = await connection`
    SELECT COUNT(*)::INTEGER AS count
    FROM ${connection(watchlistTable)}
    WHERE user_id = ${user.id}
  `;
  if (count !== 0) throw new Error("Deleting a user did not cascade to the watchlist.");

  process.stdout.write("Watchlist schema check passed: storage, indexed lookup, and user cascade are valid.\n");
} finally {
  await connection.unsafe("ROLLBACK").catch(() => undefined);
  connection.release();
  await sql.end({ timeout: 5 });
}
