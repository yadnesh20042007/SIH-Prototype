import 'server-only';

import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/prisma';
import type { AuthenticatedUser } from '@/lib/auth/session';

const DUMMY_PASSWORD_HASH = '$2b$12$RdtkSktjfJI7o/lT9byp6.vcK4hqpHkn3.ArcM677DPhRjLRi0cCC';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function authenticateCredentials(
  emailInput: unknown,
  passwordInput: unknown,
): Promise<AuthenticatedUser | null> {
  if (typeof emailInput !== 'string' || typeof passwordInput !== 'string') return null;

  const email = normalizeEmail(emailInput);
  if (!email || email.length > 320 || !passwordInput || passwordInput.length > 1024) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      role: true,
      active: true,
      deletedAt: true,
    },
  });

  const passwordMatches = await bcrypt.compare(
    passwordInput,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches || !user.active || user.deletedAt !== null) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
