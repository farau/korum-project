import sharp from "sharp";
import { TOKEN_IMAGE_DIMENSION, TOKEN_IMAGE_MAX_INPUT_BYTES, TOKEN_IMAGE_MAX_OUTPUT_BYTES } from "./token-image-policy";

export class TokenImageValidationError extends Error {}

export async function compressTokenImage(input: Buffer) {
  if (!input.length || input.length > TOKEN_IMAGE_MAX_INPUT_BYTES) {
    throw new TokenImageValidationError("Choose an image no larger than 5 MB.");
  }
  try {
    // Decode only the first frame, including animated GIF/WebP input.
    const image = sharp(input, { limitInputPixels: 25_000_000, failOn: "warning", pages: 1 });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
      throw new TokenImageValidationError("Choose a PNG, JPEG, WebP or GIF image.");
    }
    const output = await image.rotate()
      .resize(TOKEN_IMAGE_DIMENSION, TOKEN_IMAGE_DIMENSION, { fit: "cover", position: "centre" })
      .webp({ quality: 80, effort: 4 }).timeout({ seconds: 10 }).toBuffer();
    if (output.length > TOKEN_IMAGE_MAX_OUTPUT_BYTES) {
      throw new TokenImageValidationError("This image cannot be compressed enough. Choose a simpler image.");
    }
    return output;
  } catch (error) {
    if (error instanceof TokenImageValidationError) throw error;
    throw new TokenImageValidationError("Invalid image. Use a PNG, JPEG, WebP or GIF of at most 25 megapixels.");
  }
}

/** Enforce the limit on actual bytes, even without an honest Content-Length. */
export async function readTokenImageBody(request: Request) {
  if (Number(request.headers.get("content-length")) > TOKEN_IMAGE_MAX_INPUT_BYTES) {
    throw new TokenImageValidationError("Choose an image no larger than 5 MB.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new TokenImageValidationError("Choose an image to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > TOKEN_IMAGE_MAX_INPUT_BYTES) {
        await reader.cancel();
        throw new TokenImageValidationError("Choose an image no larger than 5 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
