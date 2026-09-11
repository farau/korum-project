import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const tunnelHost = process.env.KORUM_DB_TUNNEL_HOST;

if (!databaseUrl && !tunnelHost) {
  throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL is required to check the indexer schema.");
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
const chainId = 46630;
const versusId = "1";
const registryAddress = "0x1111111111111111111111111111111111111111";
const factoryAddress = "0x2222222222222222222222222222222222222222";
const userWallet = "0x3333333333333333333333333333333333333333";
const referrerWallet = "0x4444444444444444444444444444444444444444";
const creatorWallet = "0x5555555555555555555555555555555555555555";
const feeRecipient = "0x6666666666666666666666666666666666666666";
const tokenA = "0x7777777777777777777777777777777777777777";
const tokenB = "0x8888888888888888888888888888888888888888";
const transactionHash = `0x${"a".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;
const eventTime = new Date("2026-09-09T12:00:00.000Z");

try {
  await connection.unsafe("BEGIN");

  await connection`
    INSERT INTO indexer.referral_bindings (
      chain_id, registry_address, user_wallet, referrer_wallet, bound_at,
      transaction_hash, block_hash, block_number, log_index
    ) VALUES (
      ${chainId}, ${registryAddress}, ${userWallet}, ${referrerWallet}, ${eventTime},
      ${transactionHash}, ${blockHash}, ${100}, ${0}
    )
    ON CONFLICT (chain_id, user_wallet) DO UPDATE SET
      referrer_wallet = EXCLUDED.referrer_wallet,
      bound_at = EXCLUDED.bound_at,
      transaction_hash = EXCLUDED.transaction_hash,
      block_hash = EXCLUDED.block_hash,
      block_number = EXCLUDED.block_number,
      log_index = EXCLUDED.log_index,
      ingested_at = NOW()
  `;

  for (const camp of [
    { side: 0, token: tokenA, name: "Camp A", symbol: "CMPA", uri: "ipfs://camp-a", logIndex: 1 },
    { side: 1, token: tokenB, name: "Camp B", symbol: "CMPB", uri: "ipfs://camp-b", logIndex: 2 },
  ]) {
    await connection`
      INSERT INTO indexer.versus_camps (
        chain_id, versus_id, side, token_address, name, symbol, uri,
        virtual_eth, graduation_eth, total_supply, block_timestamp,
        transaction_hash, block_hash, block_number, log_index
      ) VALUES (
        ${chainId}, ${versusId}, ${camp.side}, ${camp.token}, ${camp.name}, ${camp.symbol}, ${camp.uri},
        ${"1000000000000000000"}, ${"5000000000000000000"}, ${"1000000000000000000000000000"}, ${eventTime},
        ${transactionHash}, ${blockHash}, ${101}, ${camp.logIndex}
      )
      ON CONFLICT (chain_id, versus_id, side) DO UPDATE SET
        token_address = EXCLUDED.token_address,
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        uri = EXCLUDED.uri,
        virtual_eth = EXCLUDED.virtual_eth,
        graduation_eth = EXCLUDED.graduation_eth,
        total_supply = EXCLUDED.total_supply,
        block_timestamp = EXCLUDED.block_timestamp,
        transaction_hash = EXCLUDED.transaction_hash,
        block_hash = EXCLUDED.block_hash,
        block_number = EXCLUDED.block_number,
        log_index = EXCLUDED.log_index,
        ingested_at = NOW()
    `;
  }

  await connection`
    INSERT INTO indexer.versuses (
      chain_id, versus_id, factory_address, creator_wallet, config_id,
      creator_fee_recipient, token_a_address, token_b_address, created_at,
      title, description, category, socials_json,
      transaction_hash, block_hash, block_number, log_index
    ) VALUES (
      ${chainId}, ${versusId}, ${factoryAddress}, ${creatorWallet}, ${7},
      ${feeRecipient}, ${tokenA}, ${tokenB}, ${eventTime},
      ${"Camp A vs Camp B"}, ${"Indexer smoke-test versus"}, ${"test"}, ${"{}"},
      ${transactionHash}, ${blockHash}, ${101}, ${3}
    )
    ON CONFLICT (chain_id, versus_id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      socials_json = EXCLUDED.socials_json,
      ingested_at = NOW()
  `;

  const [projection] = await connection`
    SELECT
      v.title,
      COUNT(c.side)::INTEGER AS camp_count,
      ARRAY_AGG(c.side ORDER BY c.side) AS sides
    FROM indexer.versuses v
    JOIN indexer.versus_camps c
      ON c.chain_id = v.chain_id AND c.versus_id = v.versus_id
    WHERE v.chain_id = ${chainId} AND v.versus_id = ${versusId}
    GROUP BY v.title
  `;

  const [binding] = await connection`
    SELECT referrer_wallet
    FROM indexer.referral_bindings
    WHERE chain_id = ${chainId} AND user_wallet = ${userWallet}
  `;

  if (projection?.title !== "Camp A vs Camp B" || projection.camp_count !== 2) {
    throw new Error("Versus projection did not join its two camps.");
  }
  if (projection.sides.join(",") !== "0,1" || binding?.referrer_wallet !== referrerWallet) {
    throw new Error("Indexer projection values do not match their source events.");
  }

  process.stdout.write("Indexer schema check passed: referral and versus projections are valid.\n");
} finally {
  await connection.unsafe("ROLLBACK").catch(() => undefined);
  connection.release();
  await sql.end({ timeout: 5 });
}
