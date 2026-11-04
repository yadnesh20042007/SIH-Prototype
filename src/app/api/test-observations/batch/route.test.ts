import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/api-access', () => ({
  requireApiUser: vi.fn(async () => ({ authorized: true, user: { id: 'authenticated-user', name: 'Authenticated User', email: 'user@example.test', role: 'ADMIN' } })),
  technicianOwnsSession: vi.fn(async () => true),
  forbiddenOwnership: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
}));

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    batchSaveTestObservations: vi.fn(),
  },
}));

vi.mock('@/lib/services/test-observation.service', () => serviceMock);

import { POST } from './route';

const observationData = {
  sequenceIndex: 0,
  load: 10,
  indicatedValue: 10.01,
  zeroError: 0,
  loadingDirection: 'increasing',
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-observations/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('TestObservation batch route unit tests (mocked service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists a batch of observations with HTTP 200', async () => {
    const batchResponse = {
      savedObservations: [
        {
          id: 'obs-1',
          clientRowId: 'row-1',
          sessionId: 'session-1',
          testType: 'WEIGHING_PERFORMANCE',
          sequenceIndex: 0,
          observationData,
          createdAt: '2026-09-06T10:30:00.000Z',
        },
      ],
      deletedCount: 0,
    };
    serviceMock.batchSaveTestObservations.mockResolvedValue(batchResponse);

    const response = await POST(postRequest({
      sessionId: 'session-1',
      observations: [
        {
          clientRowId: 'row-1',
          testType: 'WEIGHING_PERFORMANCE',
          sequenceIndex: 0,
          observationData,
        },
      ],
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(batchResponse);
    expect(serviceMock.batchSaveTestObservations).toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new Request('http://localhost/api/test-observations/batch', {
      method: 'POST',
      body: '{invalid',
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });

  it('returns 400 for validation failure', async () => {
    const response = await POST(postRequest({
      sessionId: '',
      observations: [],
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Validation failed' });
    expect(serviceMock.batchSaveTestObservations).not.toHaveBeenCalled();
  });
});

