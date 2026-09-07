import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { generateApprovedSessionReport, listReports } from '@/lib/services/report.service';
import { logServerError } from '@/lib/server-error-log';
import { validateReportCreate } from '@/lib/validation/report';
import { requireApiUser } from '@/lib/auth/api-access';

function errorResponse(error: unknown, operation: 'generate' | 'list'): Response {
  if (error instanceof DatabaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof DatabaseConflictError) return Response.json({ error: error.message }, { status: 409 });
  logServerError(`[api/reports] Unexpected ${operation} failure`, error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(request: Request): Promise<Response> {
  const access = await requireApiUser(['APPROVING_OFFICER', 'ADMIN']);
  if (!access.authorized) return access.response;
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }
  const validation = validateReportCreate(body);
  if (!validation.success || !validation.data) {
    return Response.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 });
  }
  try {
    return Response.json(
      await generateApprovedSessionReport(validation.data.testSessionId),
      { status: 201 }
    );
  } catch (error) { return errorResponse(error, 'generate'); }
}

export async function GET(request: Request): Promise<Response> {
  const access = await requireApiUser(['LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN']);
  if (!access.authorized) return access.response;
  const searchParams = new URL(request.url).searchParams;
  const raw = searchParams.get('testSessionId');
  const testSessionId = raw?.trim();
  if (raw !== null && !testSessionId) return Response.json({ error: 'Invalid test session ID' }, { status: 400 });
  const query = searchParams.get('q')?.trim() || undefined;
  if (query && query.length > 200) return Response.json({ error: 'Search query is too long' }, { status: 400 });
  const rawState = searchParams.get('state');
  const state = rawState ?? 'ACTIVE';
  if (!['ALL', 'ACTIVE', 'REVOKED'].includes(state)) return Response.json({ error: 'Invalid report state' }, { status: 400 });
  try { return Response.json(await listReports({ testSessionId, query, state: state as 'ALL' | 'ACTIVE' | 'REVOKED' }), { status: 200 }); }
  catch (error) { return errorResponse(error, 'list'); }
}
