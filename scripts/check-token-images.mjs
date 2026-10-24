// Real image decoding + mocked external boundaries; no Pinata key or live DB required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const cache = new Map();
const overrides = new Map();
let fetchImpl;
function load(relative) {
  const filename = path.resolve(relative);
  if (overrides.has(filename)) return overrides.get(filename);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const context = { exports, Buffer, Blob, FormData, AbortSignal, URL, Response, process,
    console: { error() {} }, fetch: (...args) => fetchImpl(...args),
    require: name => name === "server-only" ? {} : name.startsWith(".")
      ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name),
  };
  new Function(...Object.keys(context), code)(...Object.values(context));
  cache.set(filename, exports);
  return exports;
}
const { compressTokenImage, readTokenImageBody, TokenImageValidationError } = load("app/lib/token-image.ts");
const source = await sharp({ create: { width: 800, height: 400, channels: 4, background: "#3377ee88" } }).png().toBuffer();
for (const format of ["png", "jpeg", "webp", "gif"]) {
  const original = await sharp(source).withMetadata().toFormat(format).toBuffer();
  const output = await compressTokenImage(original);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.ok(output.length <= 102400);
  if (format === "png") assert.equal(metadata.hasAlpha, true);
}
for (const input of [Buffer.alloc(0), Buffer.from("https://example.com/image.png"), Buffer.alloc(5 * 1024 * 1024 + 1),
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')]) {
  await assert.rejects(compressTokenImage(input), TokenImageValidationError);
}
const huge = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
await assert.rejects(compressTokenImage(huge), TokenImageValidationError);
for (const format of ["gif", "webp"]) {
  const animated = await sharp(Buffer.from([...Array(12).fill(255), ...Array(12).fill(0)]), {
    raw: { width: 2, height: 4, pageHeight: 2, channels: 3 },
  }).toFormat(format, { loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  const still = await compressTokenImage(animated);
  assert.equal((await sharp(still).metadata()).pages ?? 1, 1);
  assert.ok((await sharp(still).raw().toBuffer())[0] > 240, "First frame is preserved");
}
let cancelled = false;
await assert.rejects(readTokenImageBody(new Request("http://localhost", {
  method: "POST", headers: { "Content-Length": "1" }, duplex: "half",
  body: new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } }),
})), TokenImageValidationError);
assert.ok(cancelled);
await assert.rejects(readTokenImageBody(new Request("http://localhost", {
  method: "POST", headers: { "Content-Length": String(5 * 1024 * 1024 + 1) }, body: "x",
})), TokenImageValidationError);
assert.deepEqual(await readTokenImageBody(new Request("http://localhost", { method: "POST", body: source })), source);

const cid = `bafkrei${"a".repeat(52)}`;
const { pinTokenImage } = load("app/lib/pinata.ts");
const originalJwt = process.env.PINATA_JWT;
const originalGateway = process.env.PINATA_GATEWAY;
try {
  delete process.env.PINATA_JWT;
  await assert.rejects(pinTokenImage(source, "hash"), /PINATA_JWT/);
  process.env.PINATA_JWT = "test-only-jwt";
  const compressed = await compressTokenImage(source);
  const pinSuccess = async (url, options) => {
    assert.equal(url, "https://uploads.pinata.cloud/v3/files");
    assert.equal(options.headers.Authorization, "Bearer test-only-jwt");
    assert.equal(options.body.get("network"), "public");
    assert.equal(options.body.get("cid_version"), "v1");
    const file = options.body.get("file");
    assert.equal(file.type, "image/webp");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), compressed);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ data: { cid, id: "pinata-file-id" } });
  };
  fetchImpl = pinSuccess;
  assert.equal((await pinTokenImage(compressed, "hash")).cid, cid);
  fetchImpl = async () => new Response("upstream sensitive details", { status: 401 });
  await assert.rejects(pinTokenImage(compressed, "hash"), /^Error: Pinata upload failed \(401\)\.$/);
  fetchImpl = async () => new Response("sensitive upstream non-JSON response");
  await assert.rejects(pinTokenImage(compressed, "hash"), /^Error: Pinata returned an invalid upload response\.$/);
  for (const data of [{}, { cid: "https://bad.example", id: "id" }, { cid }]) {
    fetchImpl = async () => Response.json({ data });
    await assert.rejects(pinTokenImage(compressed, "hash"), /invalid upload response/);
  }

  // Transaction/lease concurrency is verified against real PostgreSQL by
  // check-market-delivery.mjs. Keep route/provider failures isolated here.
  let failCommit = false;
  const wallet = `0x${"Ab".repeat(20)}`;
  overrides.set(path.resolve("app/lib/db/token-images.ts"), {
    TokenImageBusyError: class extends Error {},
    storeTokenImage: async () => {
      if (failCommit) throw new Error("Commit failed");
      return { cid, uri: `ipfs://${cid}`, bytes: compressed.length };
    },
  });

  let session = { userId: "user", address: wallet }, sameOrigin = true, allowed = true;
  overrides.set(path.resolve("app/lib/auth/session.ts"), {
    getWalletSession: async () => session, isSameOriginRequest: () => sameOrigin,
  });
  overrides.set(path.resolve("app/lib/cache/redis.ts"), {
    redisCacheKey: (...args) => args.join(":"), consumeRateLimit: async () => ({ allowed, retryAfterSeconds: 600 }),
  });
  const { POST } = load("app/api/token-images/route.ts");
  const request = (body = source, type = "image/png", address = wallet) => new Request("http://localhost/api/token-images", {
    method: "POST", headers: { "Content-Type": type, "X-Wallet-Address": address }, body,
  });
  const goodSession = session;
  session = null;
  assert.equal((await POST(request())).status, 401);
  session = goodSession;
  sameOrigin = false;
  assert.equal((await POST(request())).status, 403);
  sameOrigin = true;
  assert.equal((await POST(request(source, "image/png", "0xother"))).status, 403);
  assert.equal((await POST(request(source, "image/svg+xml"))).status, 415);
  assert.equal((await POST(request("https://example.com/image.png"))).status, 400);
  allowed = false;
  const throttled = await POST(request());
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers.get("retry-after"), "600");
  allowed = true;
  failCommit = true;
  assert.equal((await POST(request())).status, 503, "Never return a CID before DB commit");
  failCommit = false;
  const saved = await POST(request());
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("cache-control"), "no-store");
  assert.equal((await saved.json()).cid, cid);

  const { uploadTokenImage } = load("app/lib/token-image-client.ts");
  const file = new File([source], "local.png", { type: "image/png" });
  fetchImpl = async (url, options) => {
    assert.equal(url, "/api/token-images");
    assert.equal(options.body, file);
    assert.equal(options.headers["X-Wallet-Address"], wallet);
    return Response.json({ cid, uri: `ipfs://${cid}`, bytes: compressed.length });
  };
  assert.equal((await uploadTokenImage(file, wallet)).cid, cid);
  fetchImpl = async () => Response.json({ error: "Please retry" }, { status: 503 });
  await assert.rejects(uploadTokenImage(file, wallet), /Please retry/);
  fetchImpl = async () => Response.json({ cid, uri: "https://bad.example" });
  await assert.rejects(uploadTokenImage(file, wallet), /invalid image/);

  const { publicAssetUrl } = load("app/lib/public-asset-url.ts");
  delete process.env.PINATA_GATEWAY;
  assert.equal(publicAssetUrl(`ipfs://${cid}`), `https://gateway.pinata.cloud/ipfs/${cid}`);
  process.env.PINATA_GATEWAY = "example.mypinata.cloud";
  assert.equal(publicAssetUrl(`ipfs://${cid}`), `https://example.mypinata.cloud/ipfs/${cid}`);
  assert.equal(publicAssetUrl("https://legacy.example/logo.png"), "https://legacy.example/logo.png");
  assert.equal(publicAssetUrl("javascript:alert(1)"), undefined);
  process.env.PINATA_GATEWAY = "https://gateway.example?secret=token";
  assert.throws(() => publicAssetUrl(`ipfs://${cid}`), /public HTTPS/);
} finally {
  if (originalJwt === undefined) delete process.env.PINATA_JWT; else process.env.PINATA_JWT = originalJwt;
  if (originalGateway === undefined) delete process.env.PINATA_GATEWAY; else process.env.PINATA_GATEWAY = originalGateway;
}
console.log("Token images passed: real compression, limits, animation flattening, Pinata contract, route commit failures, auth, failures and gateway URLs.");
