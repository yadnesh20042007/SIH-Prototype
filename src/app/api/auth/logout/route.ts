import { clearAuthSession } from '@/lib/auth/session';

export async function POST(): Promise<Response> {
  try {
    await clearAuthSession();
    return Response.json({ success: true }, { status: 200 });
  } catch {
    return Response.json({ error: 'Unable to sign out' }, { status: 500 });
  }
}
