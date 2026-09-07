import { beforeEach, describe, expect, it, vi } from 'vitest';


vi.mock('@/lib/auth/api-access', () => ({
  requireApiUser: vi.fn(async () => ({ authorized: true, user: { id: 'authenticated-user', name: 'Authenticated User', email: 'user@example.test', role: 'ADMIN' } })),
  technicianOwnsSession: vi.fn(async () => true),
  technicianOwnsObservation: vi.fn(async () => true),
  technicianOwnsResult: vi.fn(async () => true),
  forbiddenOwnership: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
}));
const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    createTestObservation: vi.fn(),
    listTestObservations: vi.fn(),
  },
}));

vi.mock('@/lib/services/test-observation.service', () => serviceMock);

import { DatabaseConflictError, DatabaseForeignKeyError } from '@/lib/db/errors';
import { GET, POST } from './route';

const observationData = {
  sequenceIndex: 0,
  load: 10,
  indicatedValue: 10.01,
  zeroError: 0,
  loadingDirection: 'increasing',
};
const validCreate = {
  sessionId: 'session-1',
  testType: 'WEIGHING_PERFORMANCE',
  sequenceIndex: 0,
  observationData,
};
const observation = {
  id: 'observation-1',
  ...validCreate,
  createdAt: '2026-09-06T10:30:00.000Z',
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-observations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('TestObservation collection route unit tests (mocked service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a test observation with HTTP 201', async () => {
    serviceMock.createTestObservation.mockResolvedValue(observation);
    const response = await POST(postRequest({ ...validCreate, sessionId: ' session-1 ' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(observation);
    expect(serviceMock.createTestObservation).toHaveBeenCalledWith(validCreate);
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new Request('http://localhost/api/test-observations', {
      method: 'POST', body: '{invalid', headers: { 'Content-Type': 'application/json' },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });

  it('returns 400 for validation failure', async () => {
    const response = await POST(postRequest({ ...validCreate, testType: 'UNKNOWN' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Validation failed' });
    expect(serviceMock.createTestObservation).not.toHaveBeenCalled();
  });

  it('lists observations with HTTP 200', async () => {
    serviceMock.listTestObservations.mockResolvedValue([observation]);
    const response = await GET(new Request('http://localhost/api/test-observations'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([observation]);
    expect(serviceMock.listTestObservations).toHaveBeenCalledWith();
  });

  it('lists observations filtered by a trimmed TestSession ID', async () => {
    serviceMock.listTestObservations.mockResolvedValue([observation]);
    const response = await GET(new Request(
      'http://localhost/api/test-observations?testSessionId=%20session-1%20'
    ));
    expect(response.status).toBe(200);
    expect(serviceMock.listTestObservations).toHaveBeenCalledWith({ testSessionId: 'session-1' });
  });

  it('returns 400 for an empty TestSession filter', async () => {
    const response = await GET(new Request(
      'http://localhost/api/test-observations?testSessionId=%20%20'
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid test session ID' });
  });

  it('maps foreign-key errors to 400', async () => {
    serviceMock.createTestObservation.mockRejectedValue(
      new DatabaseForeignKeyError('TestObservation references a related record that does not exist')
    );
    const response = await POST(postRequest(validCreate));
    expect(response.status).toBe(400);
  });

  it('maps conflicts to 409', async () => {
    serviceMock.createTestObservation.mockRejectedValue(
      new DatabaseConflictError('TestObservation already exists with the supplied unique value')
    );
    const response = await POST(postRequest(validCreate));
    expect(response.status).toBe(409);
  });

  it('maps unexpected failures to a safe 500', async () => {
    serviceMock.listTestObservations.mockRejectedValue(new Error('Private database details'));
    const response = await GET(new Request('http://localhost/api/test-observations'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
