import "server-only";

export async function pinTokenImage(image: Buffer, sha256: string) {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) throw new Error("PINATA_JWT is required for token image uploads.");
  const form = new FormData();
  form.set("network", "public");
  form.set("cid_version", "v1");
  form.set("file", new Blob([new Uint8Array(image)], { type: "image/webp" }), `token-${sha256}.webp`);
  form.set("name", `korum-token-${sha256}`);

  const response = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  // Never include the provider body or credentials in logs/client errors.
  if (!response.ok) throw new Error(`Pinata upload failed (${response.status}).`);
  const result = await response.json().catch(() => {
    throw new Error("Pinata returned an invalid upload response.");
  });
  const cid: unknown = result?.data?.cid;
  const id: unknown = result?.data?.id;
  if (typeof cid !== "string" || !/^b[a-z2-7]{20,120}$/.test(cid)
    || typeof id !== "string" || !id || id.length > 128) {
    throw new Error("Pinata returned an invalid upload response.");
  }
  return { cid, pinataFileId: id };
}
