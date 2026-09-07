import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: { getApprovalById: vi.fn() },
}));

vi.mock('@/lib/services/approval.service', () => serviceMock);

import { DatabaseNotFoundError } from '@/lib/db/errors';
import { GET } from './route';

const approval = {
  id: 'approval-1', sessionId: 'session-1', userId: 'reviewer-1',
  action: 'REVIEW_APPROVE', comments: 'Evidence reviewed',
  createdAt: '2026-09-06T12:00:00.000Z',
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('Approval item route unit tests (mocked service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gets an approval by ID with HTTP 200', async () => {
    serviceMock.getApprovalById.mockResolvedValue(approval);
    const response = await GET(new Request('http://localhost'), context(' approval-1 '));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(approval);
    expect(serviceMock.getApprovalById).toHaveBeenCalledWith('approval-1');
  });

  it('returns 400 for an invalid route ID', async () => {
    const response = await GET(new Request('http://localhost'), context(' '));
    expect(response.status).toBe(400);
    expect(serviceMock.getApprovalById).not.toHaveBeenCalled();
  });

  it('maps a missing approval to 404', async () => {
    serviceMock.getApprovalById.mockRejectedValue(new DatabaseNotFoundError('Approval not found'));
    expect((await GET(new Request('http://localhost'), context('missing'))).status).toBe(404);
  });

  it('maps unexpected errors to a safe 500', async () => {
    serviceMock.getApprovalById.mockRejectedValue(new Error('Raw Prisma details'));
    const response = await GET(new Request('http://localhost'), context('approval-1'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
