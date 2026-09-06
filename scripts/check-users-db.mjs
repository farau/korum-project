import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const tunnelHost = process.env.KORUM_DB_TUNNEL_HOST;

if (!databaseUrl && !tunnelHost) {
  throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL is required to check the users schema.");
}

const options = {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
};

const sql = tunnelHost
  ? postgres({
      ...options,
      host: tunnelHost,
      port: Number(process.env.KORUM_DB_TUNNEL_PORT || 15432),
      database: process.env.PGDATABASE,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: "require",
    })
  : postgres(databaseUrl, options);

const connection = await sql.reserve();
const testWallet = "0x1111111111111111111111111111111111111111";

try {
  await connection.unsafe("BEGIN");

  const [first] = await connection`
    INSERT INTO users (evm_wallet, last_login_chain_id)
    VALUES (${testWallet}, ${46630})
    ON CONFLICT (evm_wallet) DO UPDATE SET
      last_login_chain_id = EXCLUDED.last_login_chain_id,
      last_login_at = NOW(),
      updated_at = NOW()
    RETURNING id, evm_wallet, referral_code
  `;

  const [second] = await connection`
    INSERT INTO users (evm_wallet, last_login_chain_id)
    VALUES (${testWallet}, ${4663})
    ON CONFLICT (evm_wallet) DO UPDATE SET
      last_login_chain_id = EXCLUDED.last_login_chain_id,
      last_login_at = NOW(),
      updated_at = NOW()
    RETURNING id, evm_wallet, referral_code
  `;

  const [{ count }] = await connection`
    SELECT COUNT(*)::INTEGER AS count
    FROM users
    WHERE evm_wallet = ${testWallet}
  `;

  if (first.id !== second.id || count !== 1) {
    throw new Error("Wallet upsert did not preserve a single user identity.");
  }
  if (first.referral_code !== testWallet || second.referral_code !== testWallet) {
    throw new Error("Referral code is not derived from the EVM wallet.");
  }

  process.stdout.write("Users schema check passed: atomic upsert and referral invariants are valid.\n");
} finally {
  await connection.unsafe("ROLLBACK").catch(() => undefined);
  connection.release();
  await sql.end({ timeout: 5 });
}
