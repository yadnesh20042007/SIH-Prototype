import { requireApiUser } from '@/lib/auth/api-access';
import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { softDeleteUser, updateUser } from '@/lib/services/user.service';
import { validateUserUpdate } from '@/lib/validation/user';

interface Context { params: Promise<{ id: string }> }
async function idFrom(context: Context) { const { id } = await context.params; return typeof id === 'string' && id.trim() ? id.trim() : null; }
function failure(error: unknown): Response {
  if (error instanceof DatabaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof DatabaseConflictError) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const access = await requireApiUser(['ADMIN']);
  if (!access.authorized) return access.response;
  const id = await idFrom(context);
  if (!id) return Response.json({ error: 'Invalid user ID' }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Malformed JSON payload' }, { status: 400 }); }
  const validation = validateUserUpdate(body);
  if (!validation.success || !validation.data) return Response.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 });
  try { return Response.json(await updateUser(id, validation.data, access.user.id), { status: 200 }); }
  catch (error) { return failure(error); }
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const access = await requireApiUser(['ADMIN']);
  if (!access.authorized) return access.response;
  const id = await idFrom(context);
  if (!id) return Response.json({ error: 'Invalid user ID' }, { status: 400 });
  try { return Response.json(await softDeleteUser(id, access.user.id), { status: 200 }); }
  catch (error) { return failure(error); }
}
