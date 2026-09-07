import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  getTestSessionById,
  startTestSessionProgress,
  updateTestSession,
} from '@/lib/services/test-session.service';
import { validateTestSessionUpdate } from '@/lib/validation/test-session';

interface TestSessionRouteContext {
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

async function routeId(context: TestSessionRouteContext): Promise<string | null> {
  const { id } = await context.params;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

export async function GET(
  _request: Request,
  context: TestSessionRouteContext
): Promise<Response> {
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid test session ID' }, { status: 400 });

  try {
    return Response.json(await getTestSessionById(id), { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: TestSessionRouteContext
): Promise<Response> {
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid test session ID' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const validation = validateTestSessionUpdate(body);
  if (!validation.success || !validation.data) {
    return Response.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 400 }
    );
  }


  const suppliedFields = Object.keys(validation.data);
  const protectedFields = [
    'instrumentId',
    'verificationContext',
    'rulesetVersionId',
    'technicianId',
    'reviewerId',
    'approverId',
    'completedAt',
  ];
  if (suppliedFields.some((field) => protectedFields.includes(field))) {
    return Response.json(
      { error: 'Workflow-managed TestSession fields cannot be changed through PATCH' },
      { status: 400 }
    );
  }

  if ('status' in validation.data) {
    if (validation.data.status !== 'IN_PROGRESS' || suppliedFields.length !== 1) {
      return Response.json(
        { error: 'Use the controlled approval workflow for session status changes' },
        { status: 400 }
      );
    }
    try {
      return Response.json(await startTestSessionProgress(id), { status: 200 });
    } catch (error) {
      return serviceErrorResponse(error);
    }
  }

  try {
    return Response.json(await updateTestSession(id, validation.data), { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
