import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireApiUser, service } = vi.hoisted(() => ({ requireApiUser: vi.fn(), service: { updateUser: vi.fn(), softDeleteUser: vi.fn() } }));
vi.mock('@/lib/auth/api-access', () => ({ requireApiUser }));
vi.mock('@/lib/services/user.service', () => service);
import { DELETE, PATCH } from './route';

const admin = { id: 'admin-1', name: 'Admin', email: 'admin@example.test', role: 'ADMIN' };
const context = { params: Promise.resolve({ id: 'user-1' }) };

describe('Admin user member route', () => {
  beforeEach(() => { vi.clearAllMocks(); requireApiUser.mockResolvedValue({ authorized: true, user: admin }); });
  it('persists role/status changes using the authenticated admin actor', async () => { service.updateUser.mockResolvedValue({ id: 'user-1' }); const response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ role: 'APPROVING_OFFICER', active: false }) }), context); expect(response.status).toBe(200); expect(service.updateUser).toHaveBeenCalledWith('user-1', { role: 'APPROVING_OFFICER', active: false }, 'admin-1'); });
  it('soft deletes while retaining the record', async () => { service.softDeleteUser.mockResolvedValue({ id: 'user-1', active: false }); const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), context); expect(response.status).toBe(200); expect(service.softDeleteUser).toHaveBeenCalledWith('user-1', 'admin-1'); });
  it('blocks unauthenticated mutation', async () => { requireApiUser.mockResolvedValue({ authorized: false, response: Response.json({ error: 'Authentication required' }, { status: 401 }) }); expect((await DELETE(new Request('http://localhost'), context)).status).toBe(401); expect(service.softDeleteUser).not.toHaveBeenCalled(); });
});
