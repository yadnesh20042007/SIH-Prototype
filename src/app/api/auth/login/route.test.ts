import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateCredentials, createAuthSession } = vi.hoisted(() => ({
  authenticateCredentials: vi.fn(), createAuthSession: vi.fn(),
}));
vi.mock('@/lib/auth/credentials', () => ({ authenticateCredentials }));
vi.mock('@/lib/auth/session', () => ({ createAuthSession }));

import { POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('login route', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a session and returns safe user data with the fixed role redirect', async () => {
    authenticateCredentials.mockResolvedValue({
      id: 'reviewer-1', name: 'Reviewer', email: 'reviewer@example.test',
      role: 'REVIEWING_OFFICER', passwordHash: 'must-not-leak',
    });
    const response = await POST(request({ email: 'reviewer@example.test', password: 'secret' }));
    expect(response.status).toBe(200);
    expect(createAuthSession).toHaveBeenCalledWith('reviewer-1');
    const payload = await response.json();
    expect(payload).toEqual({
      user: { name: 'Reviewer', email: 'reviewer@example.test', role: 'REVIEWING_OFFICER' },
      redirectTo: '/review',
    });
    expect(payload).not.toHaveProperty('passwordHash');
  });

  it.each(['wrong password', 'unknown email'])('uses the same generic failure for %s', async () => {
    authenticateCredentials.mockResolvedValue(null);
    const response = await POST(request({ email: 'user@example.test', password: 'wrong' }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid email or password' });
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new Request('http://localhost/api/auth/login', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });

  it('returns a safe server error', async () => {
    authenticateCredentials.mockRejectedValue(new Error('private database error'));
    const response = await POST(request({ email: 'user@example.test', password: 'secret' }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to sign in' });
  });
});
