import "server-only";

import { createHash } from "node:crypto";
import { formatEther, formatUnits, getAddress } from "viem";
import { KORUM_CHAIN_ID } from "../../config/korum-network";
import { redisCacheKey, rememberJson, type CacheDiagnostic } from "../cache/redis";
import type { UserProfileActivityPage, UserProfileTrade } from "../profile";
import { getDatabase } from "./client";

type ProfileTradeRow = {
  chainId: number | string;
  versusId: string;
  tokenName: string;
  tokenSymbol: string;
  venue: number;
  isBuy: boolean;
  tokenAmount: string;
  ethGross: string;
  feeTotal: string;
  timestamp: number | string;
  transactionHash: string;
  blockNumber: number | string;
  logIndex: number;
};

const PROFILE_ACTIVITY_CACHE_SECONDS = 20;
export const PROFILE_ACTIVITY_PAGE_SIZE = 10;

function toProfileTrade(trade: ProfileTradeRow): UserProfileTrade {
  const gross = BigInt(trade.ethGross);
  const fee = BigInt(trade.feeTotal);
  const net = trade.isBuy ? gross : gross - fee;

  return {
    id: `${trade.chainId}:${trade.blockNumber}:${trade.transactionHash}:${trade.logIndex}`,
    versusId: trade.versusId,
    tokenName: trade.tokenName,
    tokenSymbol: trade.tokenSymbol,
    side: trade.isBuy ? "buy" : "sell",
    venue: trade.venue === 0 ? "curve" : "pool",
    tokenAmount: formatUnits(BigInt(trade.tokenAmount), 18),
    grossAmountEth: formatEther(gross),
    netAmountEth: formatEther(net),
    feeAmountEth: formatEther(fee),
    timestamp: Number(trade.timestamp),
    transactionHash: trade.transactionHash,
  };
}

async function loadProfileActivity(wallet: string, page: number, pageSize: number): Promise<UserProfileActivityPage> {
  const database = getDatabase();
  const offset = (page - 1) * pageSize;
  const rows = await database.unsafe<ProfileTradeRow[]>(`
    SELECT
      trade.chain_id AS "chainId",
      camp.versus_id::TEXT AS "versusId",
      camp.name AS "tokenName",
      camp.symbol AS "tokenSymbol",
      trade.venue,
      trade.is_buy AS "isBuy",
      trade.token_amount::TEXT AS "tokenAmount",
      trade.eth_gross::TEXT AS "ethGross",
      trade.fee_total::TEXT AS "feeTotal",
      EXTRACT(EPOCH FROM trade.traded_at)::BIGINT AS "timestamp",
      trade.transaction_hash AS "transactionHash",
      trade.block_number AS "blockNumber",
      trade.log_index AS "logIndex"
    FROM indexer.camp_trades trade
    JOIN indexer.versus_camps camp
      ON camp.chain_id = trade.chain_id
      AND camp.token_address = trade.token_address
    WHERE trade.chain_id = $1
      AND trade.trader_address = $2
    ORDER BY trade.block_number DESC, trade.log_index DESC
    LIMIT $3 OFFSET $4
  `, [KORUM_CHAIN_ID, wallet, pageSize + 1, offset]);

  return {
    items: rows.slice(0, pageSize).map(toProfileTrade),
    page,
    pageSize,
    hasNext: rows.length > pageSize,
  };
}

export function getUserProfileActivity(
  address: `0x${string}`,
  page: number,
  diagnostic?: CacheDiagnostic,
) {
  const wallet = getAddress(address).toLowerCase();
  const safePage = Math.max(1, Math.trunc(page));
  const walletKey = createHash("sha256").update(wallet).digest("hex");

  return rememberJson(
    redisCacheKey("private", "profile-activity-v1", walletKey, safePage, PROFILE_ACTIVITY_PAGE_SIZE),
    PROFILE_ACTIVITY_CACHE_SECONDS,
    () => loadProfileActivity(wallet, safePage, PROFILE_ACTIVITY_PAGE_SIZE),
    diagnostic,
  );
}
