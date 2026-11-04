import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { getEvaluationWorkspace } from '@/lib/services/test-session.service';
import { forbiddenOwnership, requireApiUser, technicianOwnsSession } from '@/lib/auth/api-access';

interface TestSessionWorkspaceRouteContext {
  params: Promise<{ id: string }>;
}

function serviceErrorResponse(error: unknown): Response {
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

async function routeId(context: TestSessionWorkspaceRouteContext): Promise<string | null> {
  const { id } = await context.params;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

export async function GET(
  _request: Request,
  context: TestSessionWorkspaceRouteContext
): Promise<Response> {
  const access = await requireApiUser(['LAB_TECHNICIAN', 'ADMIN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER']);
  if (!access.authorized) return access.response;
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid test session ID' }, { status: 400 });

  if (access.user.role === 'LAB_TECHNICIAN') {
    if (!await technicianOwnsSession(access.user, id)) return forbiddenOwnership();
  }

  try {
    const data = await getEvaluationWorkspace(id);
    return Response.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
