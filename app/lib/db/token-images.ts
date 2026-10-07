import "server-only";

import { createHash } from "node:crypto";
import { getDatabase } from "./client";
import { pinTokenImage } from "../pinata";
import type { UploadedTokenImage } from "../token-image-policy";

export async function storeTokenImage(image: Buffer, wallet: string): Promise<UploadedTokenImage> {
  const sha256 = createHash("sha256").update(image).digest("hex");
  return getDatabase().begin(async (sql) => {
    // Serialize identical uploads across replicas so retries and identical
    // logos reuse the existing pin. The transaction releases the lock on failure.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`token-image:${sha256}`}, 0))`;
    const [existing] = await sql<{ cid: string; bytes: number }[]>`
      SELECT cid, byte_size AS bytes FROM public.token_images WHERE sha256 = ${sha256}
    `;
    if (existing) return { ...existing, uri: `ipfs://${existing.cid}` };

    const { cid, pinataFileId } = await pinTokenImage(image, sha256);
    await sql`
      INSERT INTO public.token_images (sha256, cid, pinata_file_id, byte_size, uploaded_by_wallet)
      VALUES (${sha256}, ${cid}, ${pinataFileId}, ${image.length}, ${wallet.toLowerCase()})
    `;
    return { cid, uri: `ipfs://${cid}`, bytes: image.length };
  });
}
