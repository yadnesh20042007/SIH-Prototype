import { getSessionResultFreshness } from '@/lib/services/result-freshness.service';
import { DatabaseNotFoundError } from '@/lib/db/errors';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('testSessionId')?.trim();
  if (!id) return Response.json({ error: 'Invalid test session ID' }, { status: 400 });
  try {
    return Response.json(await getSessionResultFreshness(id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof DatabaseNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
