/** Resolve indexed IPFS URIs through the configured public Pinata gateway. */
export function publicAssetUrl(uri: string) {
  if (uri.startsWith("ipfs://")) {
    const configured = process.env.PINATA_GATEWAY?.trim() || "https://gateway.pinata.cloud";
    const gateway = new URL(configured.includes("://") ? configured : `https://${configured}`);
    if (gateway.protocol !== "https:" || gateway.username || gateway.password || gateway.search || gateway.hash) {
      throw new Error("PINATA_GATEWAY must be a public HTTPS gateway URL.");
    }
    return `${gateway.origin}/ipfs/${uri.slice(7).replace(/^ipfs\//, "")}`;
  }
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  if (/^https?:\/\//i.test(uri)) return uri;
  return undefined;
}
import "server-only";
