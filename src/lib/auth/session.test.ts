import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieGet, cookieSet, findUnique } = vi.hoisted(() => ({
  cookieGet: vi.fn(), cookieSet: vi.fn(), findUnique: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: cookieGet, set: cookieSet })) }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

import {
  AUTH_COOKIE_NAME, AUTH_SESSION_MAX_AGE_SECONDS, clearAuthSession,
  createAuthSession, createSessionToken, getAuthenticatedUserFromToken,
  getCurrentUser, verifySessionToken,
} from './session';

const SECRET = 'test-session-secret-with-at-least-32-bytes-value';

describe('signed authentication session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTH_SESSION_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'test');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('creates and verifies a signed token containing the user ID', async () => {
    const token = await createSessionToken('user-1');
    expect(token).not.toContain('user-1');
    await expect(verifySessionToken(token)).resolves.toBe('user-1');
  });

  it('rejects expired and invalid tokens', async () => {
    const expired = await createSessionToken('user-1', Math.floor(Date.now() / 1000) - 1);
    await expect(verifySessionToken(expired)).resolves.toBeNull();
    await expect(verifySessionToken(`${expired}invalid`)).resolves.toBeNull();
  });

  it('sets a protected short-lived authentication cookie', async () => {
    await createAuthSession('user-1');
    expect(cookieSet).toHaveBeenCalledWith(AUTH_COOKIE_NAME, expect.any(String), expect.objectContaining({
      httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    }));
  });

  it('marks the authentication cookie secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await createAuthSession('user-1');
    expect(cookieSet).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  });

  it('clears the authentication cookie on logout', async () => {
    await clearAuthSession();
    expect(cookieSet).toHaveBeenCalledWith(AUTH_COOKIE_NAME, '', expect.objectContaining({
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0,
    }));
  });

  it('re-reads an active user from Prisma and omits password data', async () => {
    const token = await createSessionToken('user-1');
    cookieGet.mockReturnValue({ value: token });
    findUnique.mockResolvedValue({
      id: 'user-1', name: 'Lab User', email: 'lab@example.test', role: 'LAB_TECHNICIAN',
      active: true, deletedAt: null,
    });
    const current = await getCurrentUser();
    expect(current).toEqual({ id: 'user-1', name: 'Lab User', email: 'lab@example.test', role: 'LAB_TECHNICIAN' });
    expect(current).not.toHaveProperty('passwordHash');
  });

  it('revalidates the database user on each request using the retained token', async () => {
    const databaseUser = {
      id: 'user-1', name: 'Lab User', email: 'lab@example.test', role: 'LAB_TECHNICIAN',
      active: true, deletedAt: null,
    };
    const token = await createSessionToken('user-1');
    findUnique.mockResolvedValue(databaseUser);
    await expect(getAuthenticatedUserFromToken(token)).resolves.toMatchObject({ id: 'user-1' });
    await expect(getAuthenticatedUserFromToken(token)).resolves.toMatchObject({ id: 'user-1' });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    { id: 'user-1', name: 'User', email: 'user@test', role: 'ADMIN', active: false, deletedAt: null },
    { id: 'user-1', name: 'User', email: 'user@test', role: 'ADMIN', active: true, deletedAt: new Date() },
  ])('rejects missing, inactive, or deleted database users', async (databaseUser) => {
    cookieGet.mockReturnValue({ value: await createSessionToken('user-1') });
    findUnique.mockResolvedValue(databaseUser);
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
