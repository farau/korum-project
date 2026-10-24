import "server-only";

// Count streamed bytes as well as Content-Length; clients can omit or lie about it.
export async function readAuthBody(request: Request): Promise<{ message?: unknown; signature?: unknown }> {
  const maxBytes = 48 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RangeError("Authentication payload too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing authentication payload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RangeError("Authentication payload too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError("Invalid authentication payload.");
  return value;
}
