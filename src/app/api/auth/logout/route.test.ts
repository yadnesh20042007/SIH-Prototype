import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearAuthSession } = vi.hoisted(() => ({ clearAuthSession: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ clearAuthSession }));

import { POST } from './route';

describe('logout route', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('clears the session cookie', async () => {
    const response = await POST();
    expect(clearAuthSession).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});
