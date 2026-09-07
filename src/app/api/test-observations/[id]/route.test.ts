import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    getTestObservationById: vi.fn(),
    updateTestObservation: vi.fn(),
  },
}));

vi.mock('@/lib/services/test-observation.service', () => serviceMock);

import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { GET, PATCH } from './route';

const observationData = {
  sequenceIndex: 0, load: 10, indicatedValue: 10, zeroError: 0, loadingDirection: 'increasing',
};
const observation = {
  id: 'observation-1', sessionId: 'session-1', testType: 'WEIGHING_PERFORMANCE',
  sequenceIndex: 0, observationData, createdAt: '2026-09-06T10:30:00.000Z',
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-observations/observation-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('TestObservation item route unit tests (mocked service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gets an observation by ID', async () => {
    serviceMock.getTestObservationById.mockResolvedValue(observation);
    const response = await GET(new Request('http://localhost'), context(' observation-1 '));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(observation);
    expect(serviceMock.getTestObservationById).toHaveBeenCalledWith('observation-1');
  });

  it('returns 400 for an invalid route ID', async () => {
    const response = await GET(new Request('http://localhost'), context(' '));
    expect(response.status).toBe(400);
    expect(serviceMock.getTestObservationById).not.toHaveBeenCalled();
  });

  it('maps a missing observation to 404', async () => {
    serviceMock.getTestObservationById.mockRejectedValue(
      new DatabaseNotFoundError('TestObservation not found')
    );
    const response = await GET(new Request('http://localhost'), context('missing'));
    expect(response.status).toBe(404);
  });

  it('patches an observation with validated partial data', async () => {
    serviceMock.updateTestObservation.mockResolvedValue({ ...observation, sequenceIndex: 2 });
    const response = await PATCH(patchRequest({ sequenceIndex: 2 }), context('observation-1'));
    expect(response.status).toBe(200);
    expect(serviceMock.updateTestObservation).toHaveBeenCalledWith('observation-1', {
      sequenceIndex: 2,
    });
  });

  it('returns 400 for malformed patch JSON', async () => {
    const request = new Request('http://localhost', { method: 'PATCH', body: '{invalid' });
    const response = await PATCH(request, context('observation-1'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });

  it('returns 400 for invalid patch data', async () => {
    const response = await PATCH(patchRequest({ sequenceIndex: 1.5 }), context('observation-1'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Validation failed' });
  });

  it('maps foreign-key errors to 400', async () => {
    serviceMock.updateTestObservation.mockRejectedValue(
      new DatabaseForeignKeyError('TestObservation references a related record that does not exist')
    );
    const response = await PATCH(patchRequest({ sessionId: 'missing' }), context('observation-1'));
    expect(response.status).toBe(400);
  });

  it('maps conflicts to 409', async () => {
    serviceMock.updateTestObservation.mockRejectedValue(
      new DatabaseConflictError('TestObservation already exists with the supplied unique value')
    );
    const response = await PATCH(patchRequest({ sequenceIndex: 1 }), context('observation-1'));
    expect(response.status).toBe(409);
  });

  it('maps unexpected failures to a safe 500', async () => {
    serviceMock.getTestObservationById.mockRejectedValue(new Error('Private Prisma details'));
    const response = await GET(new Request('http://localhost'), context('observation-1'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
