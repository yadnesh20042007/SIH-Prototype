import { authenticateCredentials } from '@/lib/auth/credentials';
import { roleRedirect } from '@/lib/auth/roles';
import { createAuthSession } from '@/lib/auth/session';

const INVALID_CREDENTIALS = 'Invalid email or password';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const credentials = body && typeof body === 'object'
    ? body as Record<string, unknown>
    : {};

  try {
    const user = await authenticateCredentials(credentials.email, credentials.password);
    if (!user) return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });

    await createAuthSession(user.id);
    return Response.json({
      user: { name: user.name, email: user.email, role: user.role },
      redirectTo: roleRedirect(user.role),
    }, { status: 200 });
  } catch {
    return Response.json({ error: 'Unable to sign in' }, { status: 500 });
  }
}
