import assert from "node:assert/strict";
import sharp from "sharp";
import { compressAvatar, readAvatarBody, AvatarValidationError } from "../app/lib/avatar-image.ts";

for (const format of ["jpeg", "png", "webp"]) {
  const original = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#3377ee" } })
    .withMetadata().toFormat(format).toBuffer();
  const compressed = await compressAvatar(original);
  const metadata = await sharp(compressed).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
  assert.equal(metadata.exif, undefined);
  assert.ok(compressed.length <= 102400);
}
await assert.rejects(compressAvatar(Buffer.from("not an image")), AvatarValidationError);
await assert.rejects(compressAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), AvatarValidationError);
await assert.rejects(compressAvatar(Buffer.alloc(5 * 1024 * 1024 + 1)), AvatarValidationError);
const huge = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
await assert.rejects(compressAvatar(huge), AvatarValidationError);
const animated = await sharp(Buffer.from([...Array(12).fill(255), ...Array(12).fill(0)]), {
  raw: { width: 2, height: 4, pageHeight: 2, channels: 3 },
}).webp({ loop: 0, delay: [100, 100] }).toBuffer();
await assert.rejects(compressAvatar(animated), AvatarValidationError);
const request = new Request("http://localhost/upload", { method: "PUT", body: "hello" });
assert.equal((await readAvatarBody(request)).toString(), "hello");
let cancelled = false;
const oversized = new ReadableStream({
  pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
  cancel() { cancelled = true; },
});
await assert.rejects(readAvatarBody(new Request("http://localhost/upload", {
  method: "PUT", body: oversized, duplex: "half",
})), AvatarValidationError);
assert.equal(cancelled, true);
console.log("Avatar image checks passed: formats, crop, metadata removal, invalid/animated/oversized inputs and bounded streams.");
