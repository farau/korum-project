import { getDebates } from '../../lib/debates';

export function GET() {
  return Response.json(getDebates());
}
