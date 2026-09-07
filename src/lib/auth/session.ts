import 'server-only';

import type { Role } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';

export const AUTH_COOKIE_NAME = 'nawi_auth_session';
export const AUTH_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const TOKEN_ISSUER = 'nawi-r76';
const TOKEN_AUDIENCE = 'nawi-r76-web';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

function sessionKey(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error('AUTH_SESSION_SECRET must contain at least 32 bytes');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  userId: string,
  expiresAt = Math.floor(Date.now() / 1000) + AUTH_SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(sessionKey());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, sessionKey(), {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    return typeof payload.userId === 'string' && payload.userId.trim()
      ? payload.userId
      : null;
  } catch {
    return null;
  }
}

export async function createAuthSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, await createSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAuthSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getAuthenticatedUserFromToken(token: string): Promise<AuthenticatedUser | null> {
  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      deletedAt: true,
    },
  });

  if (!user || !user.active || user.deletedAt !== null) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return token ? getAuthenticatedUserFromToken(token) : null;
}
