import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/api-access', () => ({
  requireApiUser: vi.fn(async () => ({
    authorized: true,
    user: { id: 'authenticated-user', name: 'Authenticated User', email: 'user@example.test', role: 'ADMIN' },
  })),
  technicianOwnsSession: vi.fn(async () => true),
  forbiddenOwnership: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
}));

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    getEvaluationWorkspace: vi.fn(),
  },
}));

vi.mock('@/lib/services/test-session.service', () => serviceMock);

import { DatabaseNotFoundError } from '@/lib/db/errors';
import { GET } from './route';

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('TestSession workspace route unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with workspace data for valid session', async () => {
    const mockWorkspace = {
      session: { id: 's-1', status: 'DRAFT' },
      instrument: { id: 'inst-1', model: 'Model A' },
      observations: [],
      results: [],
      approvals: [],
    };
    serviceMock.getEvaluationWorkspace.mockResolvedValue(mockWorkspace);

    const res = await GET(new Request('http://localhost/api/test-sessions/s-1/workspace'), context('s-1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(mockWorkspace);
    expect(serviceMock.getEvaluationWorkspace).toHaveBeenCalledWith('s-1');
  });

  it('returns 404 when session is not found', async () => {
    serviceMock.getEvaluationWorkspace.mockRejectedValue(new DatabaseNotFoundError('TestSession not found'));

    const res = await GET(new Request('http://localhost/api/test-sessions/s-missing/workspace'), context('s-missing'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for empty or invalid session id', async () => {
    const res = await GET(new Request('http://localhost/api/test-sessions/ /workspace'), context('   '));
    expect(res.status).toBe(400);
  });
});

