import { requireApiUser } from '@/lib/auth/api-access';
import { DatabaseNotFoundError } from '@/lib/db/errors';
import { resetUserPassword } from '@/lib/services/user.service';
import { validateUserPasswordReset } from '@/lib/validation/user';

interface Context { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const access = await requireApiUser(['ADMIN']);
  if (!access.authorized) return access.response;
  const { id: rawId } = await context.params;
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!id) return Response.json({ error: 'Invalid user ID' }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Malformed JSON payload' }, { status: 400 }); }
  const validation = validateUserPasswordReset(body);
  if (!validation.success || !validation.data) return Response.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 });
  try { return Response.json(await resetUserPassword(id, validation.data.password), { status: 200 }); }
  catch (error) {
    if (error instanceof DatabaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
