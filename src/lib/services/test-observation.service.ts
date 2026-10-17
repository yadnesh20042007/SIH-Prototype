import type { TestObservation } from '@prisma/client';
import { observationFingerprint } from '@/lib/db/observation-fingerprint';

import { DatabaseConflictError, DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import type {
  JsonValue,
  TestObservationCreatePayload,
  TestObservationType,
  TestObservationUpdatePayload,
} from '@/lib/validation/test-observation';

export interface TestObservationRecord {
  id: string;
  sessionId: string;
  testType: TestObservationType;
  sequenceIndex: number;
  observationData: JsonValue;
  createdAt: string;
}

export interface TestObservationListFilter {
  testSessionId?: string;
}

function toTestObservationRecord(observation: TestObservation): TestObservationRecord {
  return {
    id: observation.id,
    sessionId: observation.sessionId,
    testType: observation.testType,
    sequenceIndex: observation.sequenceIndex,
    observationData: observation.observationData as JsonValue,
    createdAt: observation.createdAt.toISOString(),
  };
}

export async function createTestObservation(
  input: TestObservationCreatePayload
): Promise<TestObservationRecord> {
  try {
    return await prisma.$transaction(async tx => {
      const observation = await tx.testObservation.create({ data: input });
      // Hash persisted JSON: Prisma/PostgreSQL may normalize a JSON numeric value.
      await tx.testObservation.update({ where: { id: observation.id }, data: {
        observationFingerprint: observationFingerprint(observation.observationData),
      } });
      return toTestObservationRecord(observation);
    });
  } catch (error) {
    throwMappedDatabaseError(error, 'TestObservation');
  }
}

export async function listTestObservations(
  filter: TestObservationListFilter = {}
): Promise<TestObservationRecord[]> {
  try {
    const observations = await prisma.testObservation.findMany({
      ...(filter.testSessionId ? { where: { sessionId: filter.testSessionId } } : {}),
      orderBy: [{ sequenceIndex: 'asc' }, { createdAt: 'asc' }],
    });
    return observations.map(toTestObservationRecord);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestObservation');
  }
}

export async function getTestObservationById(id: string): Promise<TestObservationRecord> {
  try {
    const observation = await prisma.testObservation.findUnique({ where: { id } });
    if (!observation) throw new DatabaseNotFoundError('TestObservation not found');
    return toTestObservationRecord(observation);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestObservation');
  }
}

export async function updateTestObservation(
  id: string,
  input: TestObservationUpdatePayload
): Promise<TestObservationRecord> {
  try {
    return await prisma.$transaction(async tx => {
      const observation = await tx.testObservation.update({ where: { id }, data: input });
      if (input.observationData !== undefined) {
        await tx.testObservation.update({ where: { id }, data: {
          observationFingerprint: observationFingerprint(observation.observationData),
        } });
      }
      return toTestObservationRecord(observation);
    });
  } catch (error) {
    throwMappedDatabaseError(error, 'TestObservation');
  }
}

export async function deleteTestObservation(id: string): Promise<void> {
  try {
    const existing = await prisma.testObservation.findUnique({
      where: { id },
      include: { session: true },
    });
    if (!existing) {
      throw new DatabaseNotFoundError('TestObservation not found');
    }
    if (['PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(existing.session.status)) {
      throw new DatabaseConflictError('Cannot delete observation from a finalized or locked session');
    }
    await prisma.testObservation.delete({ where: { id } });
  } catch (error) {
    throwMappedDatabaseError(error, 'TestObservation');
  }
}
