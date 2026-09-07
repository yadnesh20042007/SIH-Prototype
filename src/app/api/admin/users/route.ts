import { requireApiUser } from '@/lib/auth/api-access';
import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { createUser, listUsers } from '@/lib/services/user.service';
import { validateUserCreate } from '@/lib/validation/user';

function failure(error: unknown): Response {
  if (error instanceof DatabaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof DatabaseConflictError) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(): Promise<Response> {
  const access = await requireApiUser(['ADMIN']);
  if (!access.authorized) return access.response;
  try { return Response.json(await listUsers(), { status: 200 }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request): Promise<Response> {
  const access = await requireApiUser(['ADMIN']);
  if (!access.authorized) return access.response;
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Malformed JSON payload' }, { status: 400 }); }
  const validation = validateUserCreate(body);
  if (!validation.success || !validation.data) return Response.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 });
  try { return Response.json(await createUser(validation.data), { status: 201 }); }
  catch (error) { return failure(error); }
}
