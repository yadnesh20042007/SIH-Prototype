import 'server-only';

import type { Role } from '@prisma/client';
import { redirect } from 'next/navigation';

import { roleRedirect } from '@/lib/auth/roles';
import { getCurrentUser, type AuthenticatedUser } from '@/lib/auth/session';

export async function requirePageUser(allowedRoles: readonly Role[]): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!allowedRoles.includes(user.role)) redirect(roleRedirect(user.role));
  return user;
}
