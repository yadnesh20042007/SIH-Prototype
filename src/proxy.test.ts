import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAuthenticatedUserFromToken } = vi.hoisted(() => ({
  getAuthenticatedUserFromToken: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  AUTH_COOKIE_NAME: 'nawi_auth_session',
  getAuthenticatedUserFromToken,
}));

import { proxy } from './proxy';

function request(path: string, withCookie = true): NextRequest {
  return new NextRequest(`https://example.test${path}`, {
    headers: withCookie ? { cookie: 'nawi_auth_session=signed-token' } : undefined,
  });
}

const technician = { id: 'tech-1', name: 'Yadnesh', email: 'tech@example.test', role: 'LAB_TECHNICIAN' };

describe('authentication proxy', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('retains an authenticated session across subsequent protected requests', async () => {
    getAuthenticatedUserFromToken.mockResolvedValue(technician);
    const first = await proxy(request('/'));
    const second = await proxy(request('/evaluate/instrument-1'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(getAuthenticatedUserFromToken).toHaveBeenNthCalledWith(1, 'signed-token');
    expect(getAuthenticatedUserFromToken).toHaveBeenNthCalledWith(2, 'signed-token');
  });

  it('redirects an authenticated login visit to the database role portal', async () => {
    getAuthenticatedUserFromToken.mockResolvedValue({ ...technician, role: 'REVIEWING_OFFICER' });
    const response = await proxy(request('/login'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.test/review');
  });

  it('redirects unauthenticated protected pages to login', async () => {
    const response = await proxy(request('/', false));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.test/login');
  });

  it('returns 401 for a protected API after logout removes the cookie', async () => {
    const response = await proxy(request('/api/instruments', false));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  it('treats an invalid or expired token as logged out', async () => {
    getAuthenticatedUserFromToken.mockResolvedValue(null);
    const response = await proxy(request('/review'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.test/login');
  });

  it('preserves role separation for protected portals', async () => {
    getAuthenticatedUserFromToken.mockResolvedValue(technician);
    const response = await proxy(request('/approval'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.test/');
  });

  it('leaves authentication and public verification APIs publicly reachable', async () => {
    expect((await proxy(request('/api/auth/login', false))).status).toBe(200);
    expect((await proxy(request('/api/reports/verify/public-id', false))).status).toBe(200);
    expect(getAuthenticatedUserFromToken).not.toHaveBeenCalled();
  });
});
