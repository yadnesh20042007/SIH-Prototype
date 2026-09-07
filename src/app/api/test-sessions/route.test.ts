import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    createTestSession: vi.fn(),
    listTestSessions: vi.fn(),
  },
}));

vi.mock('@/lib/services/test-session.service', () => serviceMock);

import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
} from '@/lib/db/errors';
import { GET, POST } from './route';

const validCreate = {
  instrumentId: 'instrument-1',
  verificationContext: 'INITIAL_VERIFICATION',
  rulesetVersionId: 'ruleset-1',
  technicianId: 'technician-1',
};

const session = {
  id: 'session-1',
  ...validCreate,
  status: 'DRAFT',
  reviewerId: null,
  approverId: null,
  notes: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  completedAt: null,
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('TestSession collection route unit tests (mocked service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a test session and returns 201', async () => {
    serviceMock.createTestSession.mockResolvedValue(session);

    const response = await POST(
      postRequest({
        ...validCreate,
        instrumentId: '  instrument-1  ',
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(session);
    expect(serviceMock.createTestSession).toHaveBeenCalledWith(validCreate);
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/test-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid-json',
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
    expect(serviceMock.createTestSession).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid create payload', async () => {
    const response = await POST(postRequest({ ...validCreate, instrumentId: '   ' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Validation failed',
      errors: [{ field: 'instrumentId', message: 'must not be empty' }],
    });
    expect(serviceMock.createTestSession).not.toHaveBeenCalled();
  });

  it('prevents clients from choosing workflow state during creation', async () => {
    const response = await POST(postRequest({ ...validCreate, status: 'PENDING_APPROVAL' }));
    expect(response.status).toBe(400);
    expect(serviceMock.createTestSession).not.toHaveBeenCalled();
  });

  it('lists test sessions with HTTP 200', async () => {
    serviceMock.listTestSessions.mockResolvedValue([session]);

    const response = await GET(new Request('http://localhost/api/test-sessions'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([session]);
    expect(serviceMock.listTestSessions).toHaveBeenCalledWith();
  });

  it('lists sessions filtered by a trimmed instrument ID', async () => {
    serviceMock.listTestSessions.mockResolvedValue([session]);

    const response = await GET(
      new Request('http://localhost/api/test-sessions?instrumentId=%20instrument-1%20')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([session]);
    expect(serviceMock.listTestSessions).toHaveBeenCalledWith({
      instrumentId: 'instrument-1',
    });
  });

  it('returns 400 for an empty instrument filter', async () => {
    const response = await GET(
      new Request('http://localhost/api/test-sessions?instrumentId=%20%20')
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid instrument ID' });
    expect(serviceMock.listTestSessions).not.toHaveBeenCalled();
  });

  it('lists sessions filtered by a valid workflow status', async () => {
    serviceMock.listTestSessions.mockResolvedValue([session]);

    const response = await GET(
      new Request('http://localhost/api/test-sessions?status=PENDING_REVIEW')
    );

    expect(response.status).toBe(200);
    expect(serviceMock.listTestSessions).toHaveBeenCalledWith({ status: 'PENDING_REVIEW' });
  });

  it('returns 400 for an invalid workflow status filter', async () => {
    const response = await GET(
      new Request('http://localhost/api/test-sessions?status=NOT_A_STATUS')
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid session status' });
    expect(serviceMock.listTestSessions).not.toHaveBeenCalled();
  });

  it('maps a foreign-key failure to 400', async () => {
    serviceMock.createTestSession.mockRejectedValue(
      new DatabaseForeignKeyError('TestSession references a related record that does not exist')
    );

    const response = await POST(postRequest(validCreate));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'TestSession references a related record that does not exist',
    });
  });

  it('maps a conflict to 409', async () => {
    serviceMock.createTestSession.mockRejectedValue(
      new DatabaseConflictError('TestSession already exists with the supplied unique value')
    );

    const response = await POST(postRequest(validCreate));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'TestSession already exists with the supplied unique value',
    });
  });

  it('maps an unexpected service error to a safe 500 response', async () => {
    serviceMock.listTestSessions.mockRejectedValue(
      new Error('Private database credentials and stack details')
    );

    const response = await GET(new Request('http://localhost/api/test-sessions'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
