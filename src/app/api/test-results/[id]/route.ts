import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { getTestResultById, updateTestResult } from '@/lib/services/test-result.service';
import { validateTestResultUpdate } from '@/lib/validation/test-result';

interface TestResultRouteContext {
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

async function routeId(context: TestResultRouteContext): Promise<string | null> {
  const { id } = await context.params;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

export async function GET(_request: Request, context: TestResultRouteContext): Promise<Response> {
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid test result ID' }, { status: 400 });

  try {
    return Response.json(await getTestResultById(id), { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: TestResultRouteContext): Promise<Response> {
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid test result ID' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const validation = validateTestResultUpdate(body);
  if (!validation.success || !validation.data) {
    return Response.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 400 }
    );
  }

  try {
    return Response.json(await updateTestResult(id, validation.data), { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
