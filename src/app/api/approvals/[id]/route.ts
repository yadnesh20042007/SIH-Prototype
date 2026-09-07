import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { getApprovalById } from '@/lib/services/approval.service';

interface ApprovalRouteContext {
  params: Promise<{ id: string }>;
}

async function routeId(context: ApprovalRouteContext): Promise<string | null> {
  const { id } = await context.params;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export async function GET(
  _request: Request,
  context: ApprovalRouteContext
): Promise<Response> {
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid approval ID' }, { status: 400 });

  try {
    return Response.json(await getApprovalById(id), { status: 200 });
  } catch (error) {
    if (error instanceof DatabaseNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DatabaseForeignKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DatabaseConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
