import { randomBytes, randomInt } from "node:crypto";
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
const referralAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const testWallet = `0x${randomBytes(20).toString("hex")}`;
const secondWallet = `0x${randomBytes(20).toString("hex")}`;

function generateReferralCode() {
  return Array.from({ length: 6 }, () => referralAlphabet[randomInt(referralAlphabet.length)]).join("");
}

const firstReferralCode = generateReferralCode();
const unusedReferralCode = generateReferralCode();

try {
  await connection.unsafe("BEGIN");

  const [first] = await connection`
    INSERT INTO users (evm_wallet, referral_code, last_login_chain_id)
    VALUES (${testWallet}, ${firstReferralCode}, ${46630})
    ON CONFLICT (evm_wallet) DO UPDATE SET
      last_login_chain_id = EXCLUDED.last_login_chain_id,
      last_login_at = NOW(),
      updated_at = NOW()
    RETURNING id, evm_wallet, referral_code
  `;

  const [second] = await connection`
    INSERT INTO users (evm_wallet, referral_code, last_login_chain_id)
    VALUES (${testWallet}, ${unusedReferralCode}, ${4663})
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
  if (first.referral_code !== firstReferralCode || second.referral_code !== firstReferralCode) {
    throw new Error("Wallet upsert did not preserve its original referral code.");
  }
  if (!/^[A-Za-z0-9]{6}$/.test(first.referral_code) || first.referral_code === first.evm_wallet) {
    throw new Error("Referral code is not a six-character Base62 identifier.");
  }

  const [namedUser] = await connection`
    UPDATE users
    SET display_name = ${"Korum Tester"}, updated_at = NOW()
    WHERE id = ${first.id}
    RETURNING display_name
  `;
  if (namedUser.display_name !== "Korum Tester") {
    throw new Error("The editable username was not persisted.");
  }

  await connection.unsafe("SAVEPOINT referral_collision_check");
  try {
    await connection`
      INSERT INTO users (evm_wallet, referral_code)
      VALUES (${secondWallet}, ${firstReferralCode})
    `;
    throw new Error("Duplicate referral code was accepted.");
  } catch (error) {
    if (error?.code !== "23505" || error?.constraint_name !== "users_referral_code_unique") throw error;
  } finally {
    await connection.unsafe("ROLLBACK TO SAVEPOINT referral_collision_check");
  }

  process.stdout.write("Users schema check passed: atomic upsert, editable username, stable codes, and referral uniqueness are valid.\n");
} finally {
  await connection.unsafe("ROLLBACK").catch(() => undefined);
  connection.release();
  await sql.end({ timeout: 5 });
}
