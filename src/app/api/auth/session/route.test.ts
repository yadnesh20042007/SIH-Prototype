import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser }));

import { GET } from './route';

describe('current session route', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns authenticated false without a current user', async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await GET();
    expect(await response.json()).toEqual({ authenticated: false });
  });

  it('returns only safe current-user fields', async () => {
    getCurrentUser.mockResolvedValue({
      id: 'internal-user-id', name: 'Approver', email: 'approver@example.test',
      role: 'APPROVING_OFFICER', passwordHash: 'must-not-leak',
    });
    const response = await GET();
    const payload = await response.json();
    expect(payload).toEqual({
      authenticated: true,
      user: { name: 'Approver', email: 'approver@example.test', role: 'APPROVING_OFFICER' },
    });
    expect(JSON.stringify(payload)).not.toContain('passwordHash');
    expect(JSON.stringify(payload)).not.toContain('internal-user-id');
  });
});
