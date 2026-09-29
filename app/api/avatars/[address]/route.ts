import { getDatabase } from "../../../lib/db/client";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const noStore = { "Cache-Control": "no-store" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return new Response(null, { status: 400, headers: noStore });
  try {
    const db = getDatabase();
    const [avatar] = await db<{ image: Buffer; key: string }[]>`
      SELECT a.image, u.avatar_object_key AS key FROM user_avatars a
      JOIN users u ON u.id = a.user_id WHERE u.evm_wallet = ${address.toLowerCase()}
    `;
    if (!avatar) return new Response(null, { status: 404, headers: noStore });
    const headers = {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ETag: `"${avatar.key}"`,
    };
    if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(avatar.image), { headers });
  } catch (error) {
    console.error("Unable to read the avatar.", error);
    return new Response(null, { status: 503, headers: noStore });
  }
}
