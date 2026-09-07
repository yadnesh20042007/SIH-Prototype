import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentUser, sessionFindUnique } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), sessionFindUnique: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    testSession: { findUnique: sessionFindUnique },
    testObservation: { findUnique: vi.fn() },
    testResult: { findUnique: vi.fn() },
  },
}));

import { requireApiUser, technicianOwnsSession } from './api-access';

const technician = {
  id: 'technician-1', name: 'Technician', email: 'tech@example.test', role: 'LAB_TECHNICIAN',
} as const;

describe('business API authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 without an authenticated user', async () => {
    getCurrentUser.mockResolvedValue(null);
    const result = await requireApiUser(['LAB_TECHNICIAN']);
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(401);
  });

  it('returns 403 for the wrong role', async () => {
    getCurrentUser.mockResolvedValue({ ...technician, role: 'REVIEWING_OFFICER' });
    const result = await requireApiUser(['LAB_TECHNICIAN', 'ADMIN']);
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(403);
  });

  it('allows ADMIN where technician access is permitted', async () => {
    getCurrentUser.mockResolvedValue({ ...technician, role: 'ADMIN' });
    await expect(requireApiUser(['LAB_TECHNICIAN', 'ADMIN'])).resolves.toMatchObject({
      authorized: true, user: { role: 'ADMIN' },
    });
  });

  it('allows only the assigned technician to mutate a modeled session', async () => {
    sessionFindUnique.mockResolvedValue({ technicianId: 'technician-1' });
    await expect(technicianOwnsSession(technician, 'session-1')).resolves.toBe(true);
    await expect(technicianOwnsSession({ ...technician, id: 'technician-2' }, 'session-1')).resolves.toBe(false);
  });
});
