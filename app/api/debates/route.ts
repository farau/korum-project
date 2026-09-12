import { getIndexedDebates } from '../../lib/db/debates';

export async function GET() {
  try {
    return Response.json(await getIndexedDebates());
  } catch (error) {
    console.error("Unable to load indexed versus.", error);
    return Response.json({ error: "The Railway indexer is temporarily unavailable." }, { status: 503 });
  }
}
