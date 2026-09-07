import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { getInstrumentById, updateInstrument } from '@/lib/services/instrument.service';
import { validateInstrumentUpdate } from '@/lib/validation/instrument';
import { requireApiUser } from '@/lib/auth/api-access';

interface InstrumentRouteContext {
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

async function routeId(context: InstrumentRouteContext): Promise<string | null> {
  const { id } = await context.params;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return id.trim();
}

export async function GET(_request: Request, context: InstrumentRouteContext): Promise<Response> {
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid instrument ID' }, { status: 400 });

  try {
    return Response.json(await getInstrumentById(id), { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: InstrumentRouteContext
): Promise<Response> {
  const access = await requireApiUser(['LAB_TECHNICIAN', 'ADMIN']);
  if (!access.authorized) return access.response;
  const id = await routeId(context);
  if (!id) return Response.json({ error: 'Invalid instrument ID' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const validation = validateInstrumentUpdate(body);
  if (!validation.success || !validation.data) {
    return Response.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 400 }
    );
  }

  try {
    return Response.json(await updateInstrument(id, validation.data), { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
