import { DatabaseNotFoundError } from '@/lib/db/errors';
import { getPublicReportVerification } from '@/lib/services/report-verification.service';

interface RouteContext { params: Promise<{ qrVerificationId: string }> }

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const qrVerificationId = (await context.params).qrVerificationId.trim();
  if (!qrVerificationId) return Response.json({ error: 'Report not found' }, { status: 404 });
  try {
    return Response.json(await getPublicReportVerification(qrVerificationId), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof DatabaseNotFoundError) return Response.json({ error: 'Report not found' }, { status: 404 });
    return Response.json({ error: 'Unable to verify report' }, { status: 500 });
  }
}
