import { getTokenVenue } from "../../../../lib/db/token-venue";
import { getDexscreenerChart } from "../../../../lib/markets/dexscreener";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^0x[\da-f]{40}$/i.test(token)) return Response.json({ error: "Invalid token address." }, { status: 400 });
  try {
    const venue = await getTokenVenue(token);
    if (!venue) return Response.json({ error: "Token not indexed yet." }, { status: 404 });
    const chart = venue.curveStatus === 3 ? await getDexscreenerChart(venue) : null;
    return Response.json({ ...venue, chart }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read token trading venue.", error);
    return Response.json({ error: "Market data is temporarily unavailable." }, { status: 503 });
  }
}
