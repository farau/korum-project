import { randomBytes, randomInt } from "node:crypto";
import process from "node:process";
import postgres from "postgres";

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
    SELECT TO_REGCLASS('public.user_watchlist')::TEXT AS name
  `;
  if (table?.name !== "user_watchlist") throw new Error("The user_watchlist table is missing.");

  const [versus] = await connection`
    SELECT chain_id, versus_id::TEXT AS versus_id, title
    FROM indexer.versuses
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!versus) throw new Error("No indexed Versus is available for the watchlist schema check.");

  const [user] = await connection`
    INSERT INTO users (evm_wallet, referral_code, last_login_chain_id)
    VALUES (${wallet}, ${referralCode}, ${versus.chain_id})
    RETURNING id
  `;

  await connection`
    INSERT INTO user_watchlist (user_id, chain_id, versus_id)
    VALUES (${user.id}, ${versus.chain_id}, ${versus.versus_id})
  `;

  const [stored] = await connection`
    SELECT w.user_id, w.versus_id::TEXT AS versus_id, v.title
    FROM user_watchlist w
    JOIN indexer.versuses v
      ON v.chain_id = w.chain_id AND v.versus_id = w.versus_id
    WHERE w.user_id = ${user.id}
  `;
  if (stored?.versus_id !== versus.versus_id || stored?.title !== versus.title) {
    throw new Error("The watchlist row did not resolve to its indexed Versus.");
  }

  await connection`DELETE FROM users WHERE id = ${user.id}`;
  const [{ count }] = await connection`
    SELECT COUNT(*)::INTEGER AS count
    FROM user_watchlist
    WHERE user_id = ${user.id}
  `;
  if (count !== 0) throw new Error("Deleting a user did not cascade to the watchlist.");

  process.stdout.write("Watchlist schema check passed: storage, indexed lookup, and user cascade are valid.\n");
} finally {
  await connection.unsafe("ROLLBACK").catch(() => undefined);
  connection.release();
  await sql.end({ timeout: 5 });
}
