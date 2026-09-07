import bcrypt from 'bcryptjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

import { authenticateCredentials, normalizeEmail } from './credentials';

let passwordHash: string;
const user = {
  id: 'user-1', name: 'Lab User', email: 'lab@example.test', role: 'LAB_TECHNICIAN',
  active: true, deletedAt: null,
};

describe('authentication credentials', () => {
  beforeAll(async () => { passwordHash = await bcrypt.hash('correct-password', 4); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('normalizes email and authenticates a valid password', async () => {
    findUnique.mockResolvedValue({ ...user, passwordHash });
    await expect(authenticateCredentials('  LAB@Example.Test ', 'correct-password')).resolves.toEqual({
      id: user.id, name: user.name, email: user.email, role: user.role,
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'lab@example.test' } }));
  });

  it('rejects a wrong password', async () => {
    findUnique.mockResolvedValue({ ...user, passwordHash });
    await expect(authenticateCredentials(user.email, 'wrong-password')).resolves.toBeNull();
  });

  it('rejects an unknown email through the same credential result', async () => {
    findUnique.mockResolvedValue(null);
    await expect(authenticateCredentials('unknown@example.test', 'wrong-password')).resolves.toBeNull();
  });

  it.each([
    { active: false, deletedAt: null },
    { active: true, deletedAt: new Date('2026-01-01T00:00:00.000Z') },
  ])('rejects inactive or deleted users', async (state) => {
    findUnique.mockResolvedValue({ ...user, ...state, passwordHash });
    await expect(authenticateCredentials(user.email, 'correct-password')).resolves.toBeNull();
  });

  it('normalizes email without altering its internal content', () => {
    expect(normalizeEmail(' User.Name+Lab@Example.COM ')).toBe('user.name+lab@example.com');
  });
});
