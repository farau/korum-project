import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { isSameOriginRequest } from "../../lib/auth/session";
import { consumeRateLimit, redisCacheKey } from "../../lib/cache/redis";
import { getAlchemyRpcUrl } from "../../lib/contracts/server-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 128 * 1024;
const MAX_BATCH_SIZE = 32;
const RPC_RATE_LIMIT = boundedInteger(process.env.KORUM_RPC_RATE_LIMIT, 300, 1, 10_000);
const RPC_RATE_WINDOW_SECONDS = boundedInteger(process.env.KORUM_RPC_RATE_WINDOW_SECONDS, 60, 1, 3_600);
const READ_ONLY_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
]);

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function requestIdentity(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || forwarded
    || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}

function validRpcCall(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object") return false;
  const call = value as Partial<JsonRpcRequest>;
  return call.jsonrpc === "2.0"
    && typeof call.method === "string"
    && READ_ONLY_METHODS.has(call.method)
    && (call.params === undefined || Array.isArray(call.params) || typeof call.params === "object");
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "RPC request is too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "RPC request is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON-RPC payload." }, { status: 400 });
  }

  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.length === 0 || calls.length > MAX_BATCH_SIZE || !calls.every(validRpcCall)) {
    return NextResponse.json({ error: "Unsupported JSON-RPC request." }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit(
    redisCacheKey("rate-limit", "rpc", requestIdentity(request)),
    calls.length,
    RPC_RATE_LIMIT,
    RPC_RATE_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "RPC rate limit exceeded." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Limit": String(RPC_RATE_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const upstreamUrl = getAlchemyRpcUrl();
  if (!upstreamUrl) {
    return NextResponse.json({ error: "Private RPC fallback is not configured for the active network." }, { status: 503 });
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
        "x-ratelimit-limit": String(RPC_RATE_LIMIT),
        "x-ratelimit-remaining": String(rateLimit.remaining),
      },
    });
  } catch {
    return NextResponse.json({ error: "Private RPC fallback is temporarily unavailable." }, { status: 502 });
  }
}
