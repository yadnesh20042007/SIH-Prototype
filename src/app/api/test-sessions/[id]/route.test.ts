import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    getTestSessionById: vi.fn(),
    startTestSessionProgress: vi.fn(),
    updateTestSession: vi.fn(),
  },
}));

vi.mock('@/lib/services/test-session.service', () => serviceMock);

import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { GET, PATCH } from './route';

const session = {
  id: 'session-1',
  instrumentId: 'instrument-1',
  verificationContext: 'INITIAL_VERIFICATION',
  status: 'DRAFT',
  rulesetVersionId: 'ruleset-1',
  technicianId: 'technician-1',
  reviewerId: null,
  approverId: null,
  notes: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  completedAt: null,
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-sessions/session-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('TestSession item route unit tests (mocked service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets a test session by ID', async () => {
    serviceMock.getTestSessionById.mockResolvedValue(session);

    const response = await GET(
      new Request('http://localhost/api/test-sessions/session-1'),
      context('  session-1  ')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(session);
    expect(serviceMock.getTestSessionById).toHaveBeenCalledWith('session-1');
  });

  it('returns 400 for an invalid route ID', async () => {
    const response = await GET(
      new Request('http://localhost/api/test-sessions/invalid'),
      context('   ')
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid test session ID' });
    expect(serviceMock.getTestSessionById).not.toHaveBeenCalled();
  });

  it('maps a missing test session to 404', async () => {
    serviceMock.getTestSessionById.mockRejectedValue(
      new DatabaseNotFoundError('TestSession not found')
    );

    const response = await GET(
      new Request('http://localhost/api/test-sessions/missing'),
      context('missing')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'TestSession not found' });
  });

  it('uses the controlled transition to move a session into progress', async () => {
    const updated = {
      ...session,
      status: 'IN_PROGRESS',
    };
    serviceMock.startTestSessionProgress.mockResolvedValue(updated);

    const response = await PATCH(
      patchRequest({ status: 'IN_PROGRESS' }),
      context('session-1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'IN_PROGRESS',
    });
    expect(serviceMock.startTestSessionProgress).toHaveBeenCalledWith('session-1');
    expect(serviceMock.updateTestSession).not.toHaveBeenCalled();
  });

  it('prevents direct mutation of workflow-managed fields', async () => {
    const response = await PATCH(
      patchRequest({ status: 'PENDING_APPROVAL', reviewerId: 'reviewer-1' }),
      context('session-1')
    );
    expect(response.status).toBe(400);
    expect(serviceMock.startTestSessionProgress).not.toHaveBeenCalled();
    expect(serviceMock.updateTestSession).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed patch JSON', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/test-sessions/session-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid-json',
      }),
      context('session-1')
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
    expect(serviceMock.updateTestSession).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid patch payload', async () => {
    const response = await PATCH(
      patchRequest({ status: 'COMPLETE' }),
      context('session-1')
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Validation failed',
      errors: [{ field: 'status' }],
    });
    expect(serviceMock.updateTestSession).not.toHaveBeenCalled();
  });

  it('prevents changing the instrument through the generic session PATCH', async () => {
    const response = await PATCH(
      patchRequest({ instrumentId: 'missing-instrument' }),
      context('session-1')
    );
    expect(response.status).toBe(400);
    expect(serviceMock.updateTestSession).not.toHaveBeenCalled();
  });

  it('maps a conflict to 409', async () => {
    serviceMock.updateTestSession.mockRejectedValue(
      new DatabaseConflictError('TestSession already exists with the supplied unique value')
    );

    const response = await PATCH(
      patchRequest({ notes: 'Updated' }),
      context('session-1')
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'TestSession already exists with the supplied unique value',
    });
  });

  it('maps an unexpected service error to a safe 500 response', async () => {
    serviceMock.getTestSessionById.mockRejectedValue(
      new Error('Private Prisma stack and database details')
    );

    const response = await GET(
      new Request('http://localhost/api/test-sessions/session-1'),
      context('session-1')
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
