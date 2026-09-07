import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireApiUser, resetUserPassword } = vi.hoisted(() => ({ requireApiUser: vi.fn(), resetUserPassword: vi.fn() }));
vi.mock('@/lib/auth/api-access', () => ({ requireApiUser }));
vi.mock('@/lib/services/user.service', () => ({ resetUserPassword }));
import { PATCH } from './route';

describe('Admin password reset route', () => {
  beforeEach(() => { vi.clearAllMocks(); requireApiUser.mockResolvedValue({ authorized: true, user: { id: 'admin-1', role: 'ADMIN' } }); });
  it('resets a password without returning the hash', async () => { resetUserPassword.mockResolvedValue({ id: 'user-1', name: 'Officer' }); const response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ password: 'replacement-pass-123' }) }), { params: Promise.resolve({ id: 'user-1' }) }); expect(response.status).toBe(200); expect(resetUserPassword).toHaveBeenCalledWith('user-1', 'replacement-pass-123'); expect(await response.json()).not.toHaveProperty('passwordHash'); });
  it('rejects a weak password before persistence', async () => { const response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ password: 'weak' }) }), { params: Promise.resolve({ id: 'user-1' }) }); expect(response.status).toBe(400); expect(resetUserPassword).not.toHaveBeenCalled(); });
});
