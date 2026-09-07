import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: { getTestResultById: vi.fn(), updateTestResult: vi.fn() },
}));

vi.mock('@/lib/services/test-result.service', () => serviceMock);

import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { GET, PATCH } from './route';

const resultRecord = {
  id: 'result-1', sessionId: 'session-1', testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS',
  maxAbsoluteError: '0.001', mpe: '0.01', repeatabilityRange: null,
  r76Reference: 'R76-2 §4.2', explanation: 'Engine explanation',
  rulesetVersionId: 'ruleset-1', complianceTrace: { preserved: true },
  createdAt: '2026-09-06T12:00:00.000Z',
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-results/result-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('TestResult item route unit tests (mocked service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gets a result by ID with HTTP 200', async () => {
    serviceMock.getTestResultById.mockResolvedValue(resultRecord);
    const response = await GET(new Request('http://localhost'), context(' result-1 '));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(resultRecord);
    expect(serviceMock.getTestResultById).toHaveBeenCalledWith('result-1');
  });

  it('returns 400 for an invalid route ID', async () => {
    const response = await GET(new Request('http://localhost'), context(' '));
    expect(response.status).toBe(400);
    expect(serviceMock.getTestResultById).not.toHaveBeenCalled();
  });

  it('maps a missing result to 404', async () => {
    serviceMock.getTestResultById.mockRejectedValue(
      new DatabaseNotFoundError('TestResult not found')
    );
    expect((await GET(new Request('http://localhost'), context('missing'))).status).toBe(404);
  });

  it('patches a result with validated partial data', async () => {
    serviceMock.updateTestResult.mockResolvedValue({ ...resultRecord, outcome: 'FAIL' });
    const response = await PATCH(patchRequest({ outcome: 'FAIL' }), context('result-1'));
    expect(response.status).toBe(200);
    expect(serviceMock.updateTestResult).toHaveBeenCalledWith('result-1', { outcome: 'FAIL' });
  });

  it('returns 400 for malformed patch JSON', async () => {
    const response = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: '{invalid' }),
      context('result-1')
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });

  it('returns 400 for invalid patch data', async () => {
    const response = await PATCH(patchRequest({ outcome: 'pass' }), context('result-1'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Validation failed' });
  });

  it('maps foreign-key errors to 400', async () => {
    serviceMock.updateTestResult.mockRejectedValue(
      new DatabaseForeignKeyError('TestResult references a related record that does not exist')
    );
    const response = await PATCH(
      patchRequest({ rulesetVersionId: 'missing' }), context('result-1')
    );
    expect(response.status).toBe(400);
  });

  it('maps applicable conflicts to 409', async () => {
    serviceMock.updateTestResult.mockRejectedValue(
      new DatabaseConflictError('TestResult already exists with the supplied unique value')
    );
    expect((await PATCH(patchRequest({ outcome: 'FAIL' }), context('result-1'))).status).toBe(409);
  });

  it('maps unexpected failures to a safe 500', async () => {
    serviceMock.getTestResultById.mockRejectedValue(new Error('Private Prisma details'));
    const response = await GET(new Request('http://localhost'), context('result-1'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
