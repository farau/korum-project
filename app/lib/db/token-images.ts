import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "./client";
import { pinTokenImage } from "../pinata";
import type { UploadedTokenImage } from "../token-image-policy";

type StoredImage = { cid: string; bytes: number };
const uploaded = (row: StoredImage): UploadedTokenImage => ({ ...row, uri: `ipfs://${row.cid}` });
export class TokenImageBusyError extends Error {}
const inflight = new Map<string, Promise<UploadedTokenImage>>();

async function upload(image: Buffer, wallet: string, sha256: string): Promise<UploadedTokenImage> {
  const database = getDatabase();
  const owner = randomUUID();
  const reserved = await database.begin(async sql => {
    const [existing] = await sql<StoredImage[]>`
      SELECT cid, byte_size AS bytes FROM public.token_images WHERE sha256 = ${sha256}
    `;
    if (existing) return existing;
    // Reclaim crashed workers opportunistically, with bounded cleanup.
    await sql`DELETE FROM public.token_image_upload_leases WHERE sha256 IN (
      SELECT sha256 FROM public.token_image_upload_leases WHERE expires_at <= NOW()
      ORDER BY expires_at LIMIT 100
    )`;
    const leases = await sql`
      INSERT INTO public.token_image_upload_leases (sha256, owner, expires_at)
      VALUES (${sha256}, ${owner}, NOW() + INTERVAL '90 seconds')
      ON CONFLICT (sha256) DO NOTHING RETURNING owner
    `;
    if (!leases.length) throw new TokenImageBusyError("This image is already uploading. Please try again shortly.");
    // A concurrent worker may have committed between the first read and our claim.
    const [completed] = await sql<StoredImage[]>`
      SELECT cid, byte_size AS bytes FROM public.token_images WHERE sha256 = ${sha256}
    `;
    if (completed) {
      await sql`DELETE FROM public.token_image_upload_leases WHERE sha256 = ${sha256} AND owner = ${owner}`;
      return completed;
    }
    return null;
  });
  if (reserved) return uploaded(reserved);

  try {
    // No SQL transaction or reserved connection survives across this await.
    const { cid, pinataFileId } = await pinTokenImage(image, sha256);
    return await database.begin(async sql => {
      const leases = await sql`
        SELECT owner FROM public.token_image_upload_leases
        WHERE sha256 = ${sha256} AND owner = ${owner} FOR UPDATE
      `;
      if (!leases.length) throw new TokenImageBusyError("The image upload reservation expired. Please retry.");
      await sql`
        INSERT INTO public.token_images (sha256, cid, pinata_file_id, byte_size, uploaded_by_wallet)
        VALUES (${sha256}, ${cid}, ${pinataFileId}, ${image.length}, ${wallet.toLowerCase()})
      `;
      await sql`DELETE FROM public.token_image_upload_leases WHERE sha256 = ${sha256} AND owner = ${owner}`;
      return uploaded({ cid, bytes: image.length });
    });
  } catch (error) {
    // Ownership guards prevent an old worker from clearing a replacement's lease.
    await database`DELETE FROM public.token_image_upload_leases WHERE sha256 = ${sha256} AND owner = ${owner}`.catch(() => undefined);
    throw error;
  }
}

export function storeTokenImage(image: Buffer, wallet: string): Promise<UploadedTokenImage> {
  const sha256 = createHash("sha256").update(image).digest("hex");
  const existing = inflight.get(sha256);
  if (existing) return existing;
  const pending = upload(image, wallet, sha256).finally(() => inflight.delete(sha256));
  inflight.set(sha256, pending);
  return pending;
}
