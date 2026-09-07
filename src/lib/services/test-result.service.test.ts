import { beforeEach, describe, expect, it, vi } from 'vitest';

const { testResultMock } = vi.hoisted(() => ({
  testResultMock: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: { testResult: testResultMock } }));

import {
  DatabaseConflictError,
  DatabaseError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  createTestResult,
  getTestResultById,
  listTestResults,
  updateTestResult,
} from './test-result.service';

const complianceTrace = {
  instrumentContext: { accuracyClass: 'III' },
  references: [],
  inputs: { load: 10 },
  calculationSteps: [],
  mpeTrace: {
    accuracyClass: 'III', load: 10, e: 0.01, loadOverE: 1000, tableBand: 'band',
    mpeFactor: '1e', baseMPE: 0.01, verificationContext: 'Initial',
    contextMultiplier: 1, effectiveMPE: 0.01,
    reference: { document: 'OIML R 76-1:2006 (E)', purpose: 'MPE' },
  },
  comparison: { formula: '|E| <= MPE', substituted: '0.001 <= 0.01', passed: true },
  outcome: 'pass',
};

const createInput = {
  sessionId: 'session-1',
  testType: 'WEIGHING_PERFORMANCE' as const,
  outcome: 'PASS' as const,
  maxAbsoluteError: '0.00000001',
  mpe: '0.01000000',
  r76Reference: 'R76-2 §4.2',
  explanation: 'Engine explanation',
  rulesetVersionId: 'ruleset-1',
  complianceTrace,
};

function decimal(value: string) {
  return { toString: () => value };
}

const persistedResult = {
  id: 'result-1',
  ...createInput,
  maxAbsoluteError: decimal('0.00000001'),
  mpe: decimal('0.01000000'),
  repeatabilityRange: null,
  createdAt: new Date('2026-09-06T12:00:00.125Z'),
};

describe('TestResult service unit tests (mocked Prisma)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a result from already validated input', async () => {
    testResultMock.create.mockResolvedValue(persistedResult);
    await expect(createTestResult(createInput)).resolves.toMatchObject({ id: 'result-1' });
    expect(testResultMock.create).toHaveBeenCalledWith({ data: {
      ...createInput, evaluatedObservationFingerprint: null, evaluatedConfigFingerprint: null,
    } });
  });

  it('lists results newest first', async () => {
    testResultMock.findMany.mockResolvedValue([persistedResult]);
    await expect(listTestResults()).resolves.toHaveLength(1);
    expect(testResultMock.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });

  it('filters results by TestSession ID', async () => {
    testResultMock.findMany.mockResolvedValue([persistedResult]);
    await listTestResults({ testSessionId: 'session-1' });
    expect(testResultMock.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('gets a result by ID', async () => {
    testResultMock.findUnique.mockResolvedValue(persistedResult);
    await expect(getTestResultById('result-1')).resolves.toMatchObject({
      testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS',
    });
  });

  it('maps a missing result to not found', async () => {
    testResultMock.findUnique.mockResolvedValue(null);
    await expect(getTestResultById('missing')).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('updates a result using partial validated data', async () => {
    testResultMock.update.mockResolvedValue({ ...persistedResult, outcome: 'FAIL' });
    await expect(updateTestResult('result-1', { outcome: 'FAIL' })).resolves.toMatchObject({
      outcome: 'FAIL',
    });
    expect(testResultMock.update).toHaveBeenCalledWith({
      where: { id: 'result-1' }, data: { outcome: 'FAIL', evaluatedObservationFingerprint: null, evaluatedConfigFingerprint: null },
    });
  });

  it('maps update not-found failures safely', async () => {
    testResultMock.update.mockRejectedValue({ code: 'P2025', message: 'Raw Prisma details' });
    await expect(updateTestResult('missing', { outcome: 'FAIL' }))
      .rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('maps session or ruleset foreign-key failures safely', async () => {
    testResultMock.create.mockRejectedValue({ code: 'P2003', message: 'Raw FK details' });
    await expect(createTestResult(createInput)).rejects.toBeInstanceOf(DatabaseForeignKeyError);
  });

  it('maps applicable database conflicts safely', async () => {
    testResultMock.create.mockRejectedValue({ code: 'P2002', message: 'Raw conflict details' });
    await expect(createTestResult(createInput)).rejects.toBeInstanceOf(DatabaseConflictError);
  });

  it('maps unexpected database failures safely', async () => {
    testResultMock.findMany.mockRejectedValue(new Error('Private connection details'));
    await expect(listTestResults()).rejects.toBeInstanceOf(DatabaseError);
  });

  it('serializes decimals and dates without precision loss and preserves the trace', async () => {
    testResultMock.findUnique.mockResolvedValue({
      ...persistedResult,
      repeatabilityRange: decimal('0.00000002'),
    });
    const result = await getTestResultById('result-1');
    expect(result.maxAbsoluteError).toBe('0.00000001');
    expect(result.mpe).toBe('0.01000000');
    expect(result.repeatabilityRange).toBe('0.00000002');
    expect(result.createdAt).toBe('2026-09-06T12:00:00.125Z');
    expect(result.complianceTrace).toBe(complianceTrace);
  });
});
