import { DatabaseNotFoundError } from '@/lib/db/errors';
import { readReportPdf } from '@/lib/services/report.service';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const id = (await context.params).id.trim();
  if (!id) return Response.json({ error: 'Invalid report ID' }, { status: 400 });
  try {
    const { bytes, filename } = await readReportPdf(id);
    const download = new URL(request.url).searchParams.get('download') === '1';
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof DatabaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
