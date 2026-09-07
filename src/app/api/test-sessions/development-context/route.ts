import { DatabaseNotFoundError } from '@/lib/db/errors';
import { getDevelopmentTestSessionContext } from '@/lib/services/test-session.service';

export async function GET(): Promise<Response> {
  try {
    return Response.json(await getDevelopmentTestSessionContext(), { status: 200 });
  } catch (error) {
    if (error instanceof DatabaseNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
