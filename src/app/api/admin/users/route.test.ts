import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireApiUser, service } = vi.hoisted(() => ({ requireApiUser: vi.fn(), service: { listUsers: vi.fn(), createUser: vi.fn() } }));
vi.mock('@/lib/auth/api-access', () => ({ requireApiUser }));
vi.mock('@/lib/services/user.service', () => service);

import { DatabaseConflictError } from '@/lib/db/errors';
import { GET, POST } from './route';

const admin = { id: 'admin-1', name: 'Admin', email: 'admin@example.test', role: 'ADMIN' };
const record = { id: 'user-1', name: 'Officer', email: 'officer@example.test', role: 'REVIEWING_OFFICER', active: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date() };
const request = (body: unknown) => new Request('http://localhost/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('Admin users collection route', () => {
  beforeEach(() => { vi.clearAllMocks(); requireApiUser.mockResolvedValue({ authorized: true, user: admin }); });
  it('blocks a non-admin before listing', async () => { requireApiUser.mockResolvedValue({ authorized: false, response: Response.json({ error: 'Insufficient permissions' }, { status: 403 }) }); const response = await GET(); expect(response.status).toBe(403); expect(service.listUsers).not.toHaveBeenCalled(); });
  it('allows an admin to list safe users', async () => { service.listUsers.mockResolvedValue([record]); const response = await GET(); expect(response.status).toBe(200); expect(await response.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ passwordHash: expect.anything() })])); });
  it('allows an admin to create a valid user', async () => { service.createUser.mockResolvedValue(record); const response = await POST(request({ name: 'Officer', email: 'OFFICER@example.test', password: 'temporary-pass-123', role: 'REVIEWING_OFFICER' })); expect(response.status).toBe(201); expect(service.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'officer@example.test', active: true })); });
  it('rejects weak passwords', async () => { expect((await POST(request({ name: 'Officer', email: 'officer@example.test', password: 'weak', role: 'REVIEWING_OFFICER' }))).status).toBe(400); expect(service.createUser).not.toHaveBeenCalled(); });
  it('maps duplicate email to 409', async () => { service.createUser.mockRejectedValue(new DatabaseConflictError('User already exists')); expect((await POST(request({ name: 'Officer', email: 'officer@example.test', password: 'temporary-pass-123', role: 'REVIEWING_OFFICER' }))).status).toBe(409); });
});
