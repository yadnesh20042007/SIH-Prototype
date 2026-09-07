import 'server-only';

import type { Role } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, type AuthenticatedUser } from '@/lib/auth/session';

export type ApiAccessResult =
  | { authorized: true; user: AuthenticatedUser }
  | { authorized: false; response: Response };

export async function requireApiUser(allowedRoles: readonly Role[]): Promise<ApiAccessResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { authorized: false, response: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  if (!allowedRoles.includes(user.role)) {
    return { authorized: false, response: Response.json({ error: 'Insufficient permissions' }, { status: 403 }) };
  }
  return { authorized: true, user };
}

export async function technicianOwnsSession(user: AuthenticatedUser, sessionId: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const session = await prisma.testSession.findUnique({
    where: { id: sessionId }, select: { technicianId: true },
  });
  return session?.technicianId === user.id;
}

export async function technicianOwnsObservation(user: AuthenticatedUser, observationId: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const observation = await prisma.testObservation.findUnique({
    where: { id: observationId }, select: { session: { select: { technicianId: true } } },
  });
  return observation?.session.technicianId === user.id;
}

export async function technicianOwnsResult(user: AuthenticatedUser, resultId: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const result = await prisma.testResult.findUnique({
    where: { id: resultId }, select: { session: { select: { technicianId: true } } },
  });
  return result?.session.technicianId === user.id;
}

export function forbiddenOwnership(): Response {
  return Response.json({ error: 'This session is not assigned to the authenticated technician' }, { status: 403 });
}
