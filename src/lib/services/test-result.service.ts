import type { TestResult } from '@prisma/client';

import { DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import type {
  TestResultCreatePayload,
  TestResultJsonValue,
  TestResultOutcome,
  TestResultType,
  TestResultUpdatePayload,
} from '@/lib/validation/test-result';

export interface TestResultRecord {
  id: string;
  sessionId: string;
  testType: TestResultType;
  outcome: TestResultOutcome;
  maxAbsoluteError: string;
  mpe: string;
  repeatabilityRange: string | null;
  r76Reference: string;
  explanation: string;
  rulesetVersionId: string;
  complianceTrace: TestResultJsonValue;
  createdAt: string;
  evaluatedObservationFingerprint: string | null;
  /** SHA-256 of the evaluation-relevant instrument config + verificationContext; null on legacy/client-created rows. */
  evaluatedConfigFingerprint: string | null;
}

export interface TestResultListFilter {
  testSessionId?: string;
}

export function toTestResultRecord(result: TestResult): TestResultRecord {
  return {
    id: result.id,
    sessionId: result.sessionId,
    testType: result.testType,
    outcome: result.outcome,
    maxAbsoluteError: result.maxAbsoluteError.toString(),
    mpe: result.mpe.toString(),
    repeatabilityRange: result.repeatabilityRange?.toString() ?? null,
    r76Reference: result.r76Reference,
    explanation: result.explanation,
    rulesetVersionId: result.rulesetVersionId,
    complianceTrace: result.complianceTrace as TestResultJsonValue,
    createdAt: result.createdAt.toISOString(),
    evaluatedObservationFingerprint: result.evaluatedObservationFingerprint ?? null,
    evaluatedConfigFingerprint: result.evaluatedConfigFingerprint ?? null,
  };
}

export async function createTestResult(input: TestResultCreatePayload): Promise<TestResultRecord> {
  try {
    // Client-submitted results have no proof of which saved inputs the engine used.
    const result = await prisma.testResult.create({ data: {
      ...input, evaluatedObservationFingerprint: null, evaluatedConfigFingerprint: null,
    } });
    return toTestResultRecord(result);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestResult');
  }
}

export async function listTestResults(
  filter: TestResultListFilter = {}
): Promise<TestResultRecord[]> {
  try {
    const results = await prisma.testResult.findMany({
      ...(filter.testSessionId ? { where: { sessionId: filter.testSessionId } } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return results.map(toTestResultRecord);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestResult');
  }
}

export async function getTestResultById(id: string): Promise<TestResultRecord> {
  try {
    const result = await prisma.testResult.findUnique({ where: { id } });
    if (!result) throw new DatabaseNotFoundError('TestResult not found');
    return toTestResultRecord(result);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestResult');
  }
}

export async function updateTestResult(
  id: string,
  input: TestResultUpdatePayload
): Promise<TestResultRecord> {
  try {
    const result = await prisma.testResult.update({ where: { id }, data: {
      ...input, ...(Object.keys(input).length ? {
        evaluatedObservationFingerprint: null,
        evaluatedConfigFingerprint: null,
      } : {}),
    } });
    return toTestResultRecord(result);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestResult');
  }
}
