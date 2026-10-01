import process from "node:process";
import { readFile } from "node:fs/promises";
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
const chainId = process.env.NEXT_PUBLIC_KORUM_NETWORK === "mainnet" ? 4663 : 46630;
const deployment = JSON.parse(await readFile(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url)));
const schema = deployment.readModelSchema;
const coreAddress = deployment.contracts.KorumCore.address?.toLowerCase();
const hookAddress = deployment.contracts.KorumHook.address?.toLowerCase();
if (!coreAddress || !hookAddress) throw new Error("KorumCore and KorumHook deployments are required.");
const versusId = "999999999999";
const registryAddress = "0x1111111111111111111111111111111111111111";
const factoryAddress = "0x2222222222222222222222222222222222222222";
const userWallet = "0x3333333333333333333333333333333333333333";
const referrerWallet = "0x4444444444444444444444444444444444444444";
const creatorWallet = "0x5555555555555555555555555555555555555555";
const feeRecipient = "0x6666666666666666666666666666666666666666";
const tokenA = "0x7777777777777777777777777777777777777777";
const tokenB = "0x8888888888888888888888888888888888888888";
const transactionHash = `0x${"a".repeat(64)}`;
const poolTransactionHash = `0x${"f".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;
const graduationTransactionHash = `0x${"c".repeat(64)}`;
const graduationBlockHash = `0x${"d".repeat(64)}`;
const poolId = `0x${"e".repeat(64)}`;
const sqrtPriceX96 = "79228162514264337593543950336";
const totalSupply = "1000000000000000000000000000";
const tokenResidual = "81632653000000000000000000";
const expectedCirculatingSupply = "918367347000000000000000000";
const eventTime = new Date("2026-09-09T12:00:00.000Z");

try {
  await connection.unsafe("BEGIN");

  await connection`
    INSERT INTO ${connection(schema)}.referral_bindings (
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
      INSERT INTO ${connection(schema)}.versus_camps (
        chain_id, versus_id, side, token_address, name, symbol, uri,
        virtual_eth, graduation_eth, total_supply, economics_id, quote_asset, block_timestamp,
        transaction_hash, block_hash, block_number, log_index
      ) VALUES (
        ${chainId}, ${versusId}, ${camp.side}, ${camp.token}, ${camp.name}, ${camp.symbol}, ${camp.uri},
        ${"1000000000000000000"}, ${"5000000000000000000"}, ${totalSupply}, ${1}, ${"0x0000000000000000000000000000000000000000"}, ${eventTime},
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
    INSERT INTO ${connection(schema)}.versuses (
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

  const recipientAfterFirstTransfer = "0x9999999999999999999999999999999999999999";
  const recipientAfterSecondTransfer = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const firstTransferHash = `0x${"1".repeat(64)}`;
  const secondTransferHash = `0x${"2".repeat(64)}`;
  const initialRecipients = await connection`
    SELECT side, current_recipient, original_creator_wallet
    FROM ${connection(schema)}.camp_fee_recipients
    WHERE chain_id = ${chainId} AND versus_id = ${versusId}
    ORDER BY side
  `;
  if (initialRecipients.length !== 2 || initialRecipients.some((row) => row.current_recipient !== feeRecipient || row.original_creator_wallet !== creatorWallet)) {
    throw new Error("Both camps must start with the launch fee recipient while preserving the launch creator.");
  }

  // Arrival order can differ from chain order. The view must select the
  // highest block/log update for the transferred camp, without changing B.
  for (const event of [
    { id: "smoke-fee-transfer-latest", recipient: recipientAfterSecondTransfer, hash: secondTransferHash, block: 105 },
    { id: "smoke-fee-transfer-earlier", recipient: recipientAfterFirstTransfer, hash: firstTransferHash, block: 104 },
  ]) {
    await connection`
      INSERT INTO ${connection(schema)}.creator_fee_recipient_events (
        event_id, chain_id, token_address, event_type, previous_recipient,
        new_recipient, occurred_at, transaction_hash, block_hash, block_number, log_index
      ) VALUES (
        ${event.id}, ${chainId}, ${tokenA}, ${"updated"}, ${feeRecipient},
        ${event.recipient}, ${eventTime}, ${event.hash}, ${blockHash}, ${event.block}, ${0}
      )
    `;
  }
  const rotatedRecipients = await connection`
    SELECT side, current_recipient, original_creator_wallet
    FROM ${connection(schema)}.camp_fee_recipients
    WHERE chain_id = ${chainId} AND versus_id = ${versusId}
    ORDER BY side
  `;
  if (rotatedRecipients[0]?.current_recipient !== recipientAfterSecondTransfer || rotatedRecipients[1]?.current_recipient !== feeRecipient || rotatedRecipients.some((row) => row.original_creator_wallet !== creatorWallet)) {
    throw new Error("Recipient rotation must affect only its camp and retain the original creator.");
  }
  await connection`
    DELETE FROM ${connection(schema)}.creator_fee_recipient_events
    WHERE chain_id = ${chainId} AND transaction_hash = ${secondTransferHash}
  `;
  const [afterReorg] = await connection`
    SELECT current_recipient FROM ${connection(schema)}.camp_fee_recipients
    WHERE chain_id = ${chainId} AND versus_id = ${versusId} AND side = ${0}
  `;
  if (afterReorg?.current_recipient !== recipientAfterFirstTransfer) {
    throw new Error("Removing a reverted transfer must restore the preceding recipient.");
  }

  await connection`
    INSERT INTO ${connection(schema)}.camp_trades (
      event_id, chain_id, emitter_address, token_address, trader_address, referrer_address,
      venue, kind, is_buy, eth_gross, token_amount, fee_total,
      fee_creator, fee_referrer, fee_platform, tier_fee_bps,
      tier_creator_share_bps, snipe_tax_bps, sqrt_price_x96_after,
      real_eth_after, token_reserve_after, cumulative_volume_after,
      traded_at, transaction_hash, block_hash, block_number, log_index
    ) VALUES (
      ${"smoke-trade-a"}, ${chainId}, ${coreAddress}, ${tokenA}, ${userWallet}, ${referrerWallet},
      ${0}, ${0}, ${true}, ${"100000000000000000"}, ${"1000000000000000000000"}, ${"30"},
      ${"10"}, ${"10"}, ${"10"}, ${100},
      ${5000}, ${0}, ${sqrtPriceX96},
      ${"5000000000000000000"}, ${"285714286000000000000000000"}, ${"100000000000000000"},
      ${eventTime}, ${transactionHash}, ${blockHash}, ${101}, ${4}
    )
  `;

  // Insert the pool trade before its graduation to verify that the graduation
  // projection backfills pool_id regardless of sink arrival order.
  await connection`
    INSERT INTO ${connection(schema)}.camp_trades (
      event_id, chain_id, emitter_address, token_address, trader_address, referrer_address,
      venue, kind, is_buy, eth_gross, token_amount, fee_total,
      fee_creator, fee_referrer, fee_platform, tier_fee_bps,
      tier_creator_share_bps, snipe_tax_bps, sqrt_price_x96_after,
      real_eth_after, token_reserve_after, cumulative_volume_after,
      traded_at, transaction_hash, block_hash, block_number, log_index
    ) VALUES (
      ${"smoke-pool-trade-a"}, ${chainId}, ${hookAddress}, ${tokenA}, ${userWallet}, ${referrerWallet},
      ${1}, ${0}, ${true}, ${"200000000000000000"}, ${"2000000000000000000000"}, ${"30"},
      ${"10"}, ${"10"}, ${"10"}, ${100},
      ${5000}, ${0}, ${sqrtPriceX96},
      ${"5000000000000000000"}, ${"285714286000000000000000000"}, ${"300000000000000000"},
      ${eventTime}, ${poolTransactionHash}, ${blockHash}, ${103}, ${0}
    )
  `;

  await connection`
    INSERT INTO ${connection(schema)}.camp_curve_lifecycle (
      event_id, chain_id, token_address, event_type, curve_status,
      graduation_disabled, happened_at, transaction_hash, block_hash,
      block_number, log_index
    ) VALUES (
      ${"smoke-graduated-a"}, ${chainId}, ${tokenA}, ${"graduated"}, ${3},
      ${false}, ${eventTime}, ${graduationTransactionHash}, ${graduationBlockHash},
      ${102}, ${0}
    )
  `;

  await connection`
    INSERT INTO ${connection(schema)}.camp_graduations (
      chain_id, token_address, pool_id, sqrt_price_x96, eth_deposited,
      tokens_deposited, position_token_id, eth_residual, token_residual,
      graduated_at, transaction_hash, block_hash, block_number, log_index
    ) VALUES (
      ${chainId}, ${tokenA}, ${poolId}, ${sqrtPriceX96}, ${"5000000000000000000"},
      ${"204081633000000000000000000"}, ${1}, ${0}, ${tokenResidual},
      ${eventTime}, ${graduationTransactionHash}, ${graduationBlockHash}, ${102}, ${1}
    )
  `;

  const [projection] = await connection`
    SELECT
      v.title,
      COUNT(c.side)::INTEGER AS camp_count,
      ARRAY_AGG(c.side ORDER BY c.side) AS sides
    FROM ${connection(schema)}.versuses v
    JOIN ${connection(schema)}.versus_camps c
      ON c.chain_id = v.chain_id AND c.versus_id = v.versus_id
    WHERE v.chain_id = ${chainId} AND v.versus_id = ${versusId}
    GROUP BY v.title
  `;

  const [binding] = await connection`
    SELECT referrer_wallet
    FROM ${connection(schema)}.referral_bindings
    WHERE chain_id = ${chainId} AND user_wallet = ${userWallet}
  `;

  const [market] = await connection`
    SELECT
      curve_status,
      token_residual::TEXT AS token_residual,
      circulating_supply::TEXT AS circulating_supply,
      adjusted_fdv_supply::TEXT AS adjusted_fdv_supply,
      real_eth_after::TEXT AS real_eth_after
    FROM ${connection(schema)}.camp_market_state
    WHERE chain_id = ${chainId} AND token_address = ${tokenA}
  `;

  const [poolTrade] = await connection`
    SELECT emitter_address, pool_id
    FROM ${connection(schema)}.camp_trades
    WHERE chain_id = ${chainId} AND event_id = ${"smoke-pool-trade-a"}
  `;

  if (projection?.title !== "Camp A vs Camp B" || projection.camp_count !== 2) {
    throw new Error("Versus projection did not join its two camps.");
  }
  if (projection.sides.join(",") !== "0,1" || binding?.referrer_wallet !== referrerWallet) {
    throw new Error("Indexer projection values do not match their source events.");
  }
  if (
    market?.curve_status !== 3
    || market.token_residual !== tokenResidual
    || market.circulating_supply !== expectedCirculatingSupply
    || market.adjusted_fdv_supply !== expectedCirculatingSupply
    || market.real_eth_after !== "5000000000000000000"
  ) {
    throw new Error("Graduated market state does not exclude the exact locked token residual.");
  }
  if (poolTrade?.emitter_address !== hookAddress || poolTrade.pool_id !== poolId) {
    throw new Error("Pool trade provenance was not synchronized from its graduation.");
  }

  process.stdout.write("Indexer schema check passed: referral, versus, trade provenance, and graduated supply projections are valid.\n");
} finally {
  await connection.unsafe("ROLLBACK").catch(() => undefined);
  connection.release();
  await sql.end({ timeout: 5 });
}
