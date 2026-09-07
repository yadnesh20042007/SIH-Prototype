import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  createTestSession,
  listTestSessions,
} from '@/lib/services/test-session.service';
import { validateTestSessionCreate } from '@/lib/validation/test-session';
import {
  TEST_SESSION_STATUSES,
  type TestSessionStatus,
} from '@/lib/validation/test-session';
import { requireApiUser } from '@/lib/auth/api-access';

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

export async function POST(request: Request): Promise<Response> {
  const access = await requireApiUser(['LAB_TECHNICIAN', 'ADMIN']);
  if (!access.authorized) return access.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  if (typeof body === 'object' && body !== null &&
    ['technicianId', 'reviewerId', 'approverId'].some((field) => field in body)) {
    return Response.json({ error: 'Actor identity cannot be supplied by the client' }, { status: 400 });
  }
  const validation = validateTestSessionCreate({
    ...(body as Record<string, unknown>), technicianId: access.user.id,
  });
  if (!validation.success || !validation.data) {
    return Response.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 400 }
    );
  }

  if (
    typeof body === 'object' && body !== null &&
    ['status', 'reviewerId', 'approverId', 'completedAt'].some((field) => field in body)
  ) {
    return Response.json(
      { error: 'Workflow-managed TestSession fields cannot be set during creation' },
      { status: 400 }
    );
  }

  try {
    return Response.json(await createTestSession(validation.data), { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  const rawInstrumentId = new URL(request.url).searchParams.get('instrumentId');
  const rawStatus = new URL(request.url).searchParams.get('status');
  let instrumentId: string | undefined;
  let status: TestSessionStatus | undefined;

  if (rawInstrumentId !== null) {
    instrumentId = rawInstrumentId.trim();
    if (instrumentId === '') {
      return Response.json({ error: 'Invalid instrument ID' }, { status: 400 });
    }
  }

  if (rawStatus !== null) {
    const candidate = rawStatus.trim();
    if (!TEST_SESSION_STATUSES.includes(candidate as TestSessionStatus)) {
      return Response.json({ error: 'Invalid session status' }, { status: 400 });
    }
    status = candidate as TestSessionStatus;
  }

  try {
    const sessions = instrumentId || status
      ? await listTestSessions({ ...(instrumentId ? { instrumentId } : {}), ...(status ? { status } : {}) })
      : await listTestSessions();
    return Response.json(sessions, { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
