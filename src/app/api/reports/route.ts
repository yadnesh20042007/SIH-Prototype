import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { generateApprovedSessionReport, listReports } from '@/lib/services/report.service';
import { logServerError } from '@/lib/server-error-log';
import { validateReportCreate } from '@/lib/validation/report';

function errorResponse(error: unknown, operation: 'generate' | 'list'): Response {
  if (error instanceof DatabaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof DatabaseConflictError) return Response.json({ error: error.message }, { status: 409 });
  logServerError(`[api/reports] Unexpected ${operation} failure`, error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(request: Request): Promise<Response> {
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
  const raw = new URL(request.url).searchParams.get('testSessionId');
  const testSessionId = raw?.trim();
  if (raw !== null && !testSessionId) return Response.json({ error: 'Invalid test session ID' }, { status: 400 });
  try { return Response.json(await listReports(testSessionId), { status: 200 }); }
  catch (error) { return errorResponse(error, 'list'); }
}
