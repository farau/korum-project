import sharp from "sharp";

export class AvatarValidationError extends Error {}

/** Decode untrusted bytes, orient and crop, and strip all original metadata. */
export async function compressAvatar(input: Buffer) {
  if (!input.length || input.length > 5 * 1024 * 1024) {
    throw new AvatarValidationError("Choose an image no larger than 5 MB.");
  }
  try {
    const image = sharp(input, { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
      throw new AvatarValidationError("Choose a JPEG, PNG or WebP image.");
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new AvatarValidationError("Animated images are not supported.");
    }
    const output = await image.rotate().resize(256, 256, { fit: "cover" })
      .webp({ quality: 80, effort: 4 }).timeout({ seconds: 10 }).toBuffer();
    if (output.length > 100 * 1024) {
      throw new AvatarValidationError("This image cannot be compressed enough. Choose a simpler image.");
    }
    return output;
  } catch (error) {
    if (error instanceof AvatarValidationError) throw error;
    throw new AvatarValidationError("Invalid image. Use a JPEG, PNG or WebP of at most 25 megapixels.");
  }
}

/** Bound the actual stream, including requests without Content-Length. */
export async function readAvatarBody(request: Request) {
  const limit = 5 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) {
    throw new AvatarValidationError("Choose an image no larger than 5 MB.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AvatarValidationError("Choose an image to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AvatarValidationError("Choose an image no larger than 5 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
