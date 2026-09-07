import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userMock, transaction } = vi.hoisted(() => ({
  userMock: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: userMock, $transaction: transaction } }));

import { DatabaseConflictError } from '@/lib/db/errors';
import { createUser, listUsers, resetUserPassword, softDeleteUser, updateUser } from './user.service';

const dates = { createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z') };
const user = { id: 'user-1', name: 'Officer', email: 'officer@example.test', passwordHash: 'secret-hash', role: 'REVIEWING_OFFICER', active: true, deletedAt: null, ...dates } as const;

describe('User service unit tests (mocked Prisma)', () => {
  beforeEach(() => { vi.clearAllMocks(); transaction.mockImplementation(async (fn) => fn({ user: userMock })); });

  it('lists safe user records without passwordHash', async () => {
    userMock.findMany.mockResolvedValue([user]);
    const result = await listUsers();
    expect(result[0]).not.toHaveProperty('passwordHash');
    expect(userMock.findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  });

  it('creates a user with a bcrypt hash instead of plaintext', async () => {
    userMock.create.mockImplementation(async ({ data }) => ({ ...user, ...data }));
    const result = await createUser({ name: 'Officer', email: user.email, password: 'temporary-pass-123', role: 'REVIEWING_OFFICER', active: true });
    const data = userMock.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('password');
    expect(data.passwordHash).not.toBe('temporary-pass-123');
    await expect(bcrypt.compare('temporary-pass-123', data.passwordHash)).resolves.toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('maps duplicate email to conflict', async () => {
    userMock.create.mockRejectedValue({ code: 'P2002', message: 'raw' });
    await expect(createUser({ name: 'X', email: user.email, password: 'temporary-pass-123', role: 'ADMIN', active: true })).rejects.toBeInstanceOf(DatabaseConflictError);
  });

  it('updates only supported profile and access fields', async () => {
    userMock.findUnique.mockResolvedValue(user); userMock.update.mockResolvedValue({ ...user, name: 'Updated', active: false });
    const result = await updateUser(user.id, { name: 'Updated', active: false }, 'admin-2');
    expect(result).toMatchObject({ name: 'Updated', active: false });
    expect(userMock.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { name: 'Updated', active: false } });
  });

  it('prevents removing the last active administrator', async () => {
    userMock.findUnique.mockResolvedValue({ ...user, role: 'ADMIN' }); userMock.count.mockResolvedValue(0);
    await expect(updateUser(user.id, { active: false }, user.id)).rejects.toBeInstanceOf(DatabaseConflictError);
    expect(userMock.update).not.toHaveBeenCalled();
  });

  it('resets a password with bcrypt and returns no hash', async () => {
    userMock.update.mockImplementation(async ({ data }) => ({ ...user, ...data }));
    const result = await resetUserPassword(user.id, 'replacement-pass-123');
    const hash = userMock.update.mock.calls[0][0].data.passwordHash;
    await expect(bcrypt.compare('replacement-pass-123', hash)).resolves.toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('soft deletes without deleting the record or historical relations', async () => {
    userMock.findUnique.mockResolvedValue(user); userMock.update.mockImplementation(async ({ data }) => ({ ...user, ...data }));
    const result = await softDeleteUser(user.id, 'admin-1');
    expect(result.active).toBe(false); expect(result.deletedAt).toBeInstanceOf(Date);
    expect(userMock.delete).not.toHaveBeenCalled();
    expect(userMock.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: user.id } }));
  });
});
