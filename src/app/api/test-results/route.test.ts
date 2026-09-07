import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: { createTestResult: vi.fn(), listTestResults: vi.fn() },
}));

vi.mock('@/lib/services/test-result.service', () => serviceMock);

import { DatabaseConflictError, DatabaseForeignKeyError } from '@/lib/db/errors';
import { GET, POST } from './route';

const reference = { document: 'OIML R 76-1:2006 (E)', purpose: 'MPE' };
const complianceTrace = {
  instrumentContext: { accuracyClass: 'III' },
  references: [reference],
  inputs: { load: 10 },
  calculationSteps: [{
    label: 'Error', formula: 'E = I - L', substitutedFormula: 'E = 10.001 - 10',
    result: 0.001, unit: 'kg',
  }],
  mpeTrace: {
    accuracyClass: 'III', load: 10, e: 0.01, loadOverE: 1000, tableBand: 'band',
    mpeFactor: '1e', baseMPE: 0.01, verificationContext: 'Initial',
    contextMultiplier: 1, effectiveMPE: 0.01, reference,
  },
  comparison: { formula: '|E| <= MPE', substituted: '0.001 <= 0.01', passed: true },
  outcome: 'pass',
};
const validCreate = {
  sessionId: 'session-1', testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS',
  maxAbsoluteError: '0.001', mpe: '0.01', r76Reference: 'R76-2 §4.2',
  explanation: 'Engine explanation', rulesetVersionId: 'ruleset-1', complianceTrace,
};
const resultRecord = {
  id: 'result-1', ...validCreate, repeatabilityRange: null,
  createdAt: '2026-09-06T12:00:00.000Z',
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-results', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('TestResult collection route unit tests (mocked service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a test result with HTTP 201', async () => {
    serviceMock.createTestResult.mockResolvedValue(resultRecord);
    const response = await POST(postRequest({ ...validCreate, sessionId: ' session-1 ' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(resultRecord);
    expect(serviceMock.createTestResult).toHaveBeenCalledWith(validCreate);
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new Request('http://localhost/api/test-results', {
      method: 'POST', body: '{invalid', headers: { 'Content-Type': 'application/json' },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });

  it('returns 400 for validation failure', async () => {
    const response = await POST(postRequest({ ...validCreate, outcome: 'INCOMPLETE' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Validation failed' });
    expect(serviceMock.createTestResult).not.toHaveBeenCalled();
  });

  it('lists results with HTTP 200', async () => {
    serviceMock.listTestResults.mockResolvedValue([resultRecord]);
    const response = await GET(new Request('http://localhost/api/test-results'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([resultRecord]);
    expect(serviceMock.listTestResults).toHaveBeenCalledWith();
  });

  it('lists results filtered by a trimmed TestSession ID', async () => {
    serviceMock.listTestResults.mockResolvedValue([resultRecord]);
    const response = await GET(new Request(
      'http://localhost/api/test-results?testSessionId=%20session-1%20'
    ));
    expect(response.status).toBe(200);
    expect(serviceMock.listTestResults).toHaveBeenCalledWith({ testSessionId: 'session-1' });
  });

  it('returns 400 for an empty TestSession filter', async () => {
    const response = await GET(new Request(
      'http://localhost/api/test-results?testSessionId=%20%20'
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid test session ID' });
  });

  it('maps foreign-key errors to 400', async () => {
    serviceMock.createTestResult.mockRejectedValue(
      new DatabaseForeignKeyError('TestResult references a related record that does not exist')
    );
    expect((await POST(postRequest(validCreate))).status).toBe(400);
  });

  it('maps applicable conflicts to 409', async () => {
    serviceMock.createTestResult.mockRejectedValue(
      new DatabaseConflictError('TestResult already exists with the supplied unique value')
    );
    expect((await POST(postRequest(validCreate))).status).toBe(409);
  });

  it('maps unexpected failures to a safe 500', async () => {
    serviceMock.listTestResults.mockRejectedValue(new Error('Private database details'));
    const response = await GET(new Request('http://localhost/api/test-results'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
