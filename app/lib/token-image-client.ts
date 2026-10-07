import type { UploadedTokenImage } from "./token-image-policy";

export async function uploadTokenImage(file: File, wallet: string): Promise<UploadedTokenImage> {
  const response = await fetch("/api/token-images", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": file.type, "X-Wallet-Address": wallet },
    body: file,
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "Unable to upload this token image. Please try again.");
  if (typeof result?.cid !== "string" || !/^b[a-z2-7]{20,120}$/.test(result.cid)
    || result.uri !== `ipfs://${result.cid}`) {
    throw new Error("The image service returned an invalid image. Please try again.");
  }
  return result;
}
