import { getCurrentUser } from '@/lib/auth/session';

export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ authenticated: false }, { status: 200 });

    return Response.json({
      authenticated: true,
      user: { name: user.name, email: user.email, role: user.role },
    }, { status: 200 });
  } catch {
    return Response.json({ error: 'Unable to read session' }, { status: 500 });
  }
}
