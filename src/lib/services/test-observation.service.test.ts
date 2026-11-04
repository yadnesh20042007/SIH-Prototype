import { beforeEach, describe, expect, it, vi } from 'vitest';
import { observationFingerprint } from '@/lib/db/observation-fingerprint';

const { testObservationMock, testSessionMock } = vi.hoisted(() => ({
  testObservationMock: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  testSessionMock: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    testObservation: testObservationMock,
    testSession: testSessionMock,
    $transaction: async (callback: (tx: { testObservation: typeof testObservationMock; testSession: typeof testSessionMock }) => unknown) =>
      callback({ testObservation: testObservationMock, testSession: testSessionMock }),
  },
}));

import {
  DatabaseConflictError,
  DatabaseError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  batchSaveTestObservations,
  createTestObservation,
  deleteTestObservation,
  getTestObservationById,
  listTestObservations,
  updateTestObservation,
} from './test-observation.service';

const observationData = {
  sequenceIndex: 0,
  load: 10,
  indicatedValue: 10.01,
  zeroError: 0,
  loadingDirection: 'increasing',
  technicianEntry: { preserved: true },
};

const persistedObservation = {
  id: 'observation-1',
  sessionId: 'session-1',
  testType: 'WEIGHING_PERFORMANCE',
  sequenceIndex: 0,
  observationData,
  createdAt: new Date('2026-09-06T10:30:00.125Z'),
};

const createInput = {
  sessionId: 'session-1',
  testType: 'WEIGHING_PERFORMANCE' as const,
  sequenceIndex: 0,
  observationData,
};

describe('TestObservation service unit tests (mocked Prisma)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an observation from already validated input', async () => {
    testObservationMock.create.mockResolvedValue(persistedObservation);

    await expect(createTestObservation(createInput)).resolves.toMatchObject({
      id: 'observation-1',
      sessionId: 'session-1',
    });
    expect(testObservationMock.create).toHaveBeenCalledWith({ data: createInput });
    expect(testObservationMock.update).toHaveBeenCalledWith({
      where: { id: persistedObservation.id },
      data: { observationFingerprint: observationFingerprint(observationData) },
    });
  });

  it('lists observations in deterministic sequence order', async () => {
    testObservationMock.findMany.mockResolvedValue([persistedObservation]);

    await expect(listTestObservations()).resolves.toHaveLength(1);
    expect(testObservationMock.findMany).toHaveBeenCalledWith({
      orderBy: [{ sequenceIndex: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('filters observations by TestSession ID', async () => {
    testObservationMock.findMany.mockResolvedValue([persistedObservation]);

    await listTestObservations({ testSessionId: 'session-1' });

    expect(testObservationMock.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      orderBy: [{ sequenceIndex: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('gets an observation by ID', async () => {
    testObservationMock.findUnique.mockResolvedValue(persistedObservation);

    await expect(getTestObservationById('observation-1')).resolves.toMatchObject({
      id: 'observation-1',
      testType: 'WEIGHING_PERFORMANCE',
    });
  });

  it('maps a missing observation to not found', async () => {
    testObservationMock.findUnique.mockResolvedValue(null);
    await expect(getTestObservationById('missing')).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('updates an observation with partial validated data', async () => {
    const input = { sequenceIndex: 2, observationData: { ...observationData, sequenceIndex: 2 } };
    testObservationMock.update.mockResolvedValue({ ...persistedObservation, ...input });

    await expect(updateTestObservation('observation-1', input)).resolves.toMatchObject(input);
    expect(testObservationMock.update).toHaveBeenCalledWith({
      where: { id: 'observation-1' },
      data: input,
    });
    expect(testObservationMock.update).toHaveBeenCalledWith({
      where: { id: 'observation-1' },
      data: { observationFingerprint: observationFingerprint(input.observationData) },
    });
  });

  it('fingerprints the persisted representation when the database normalizes JSON numbers', async () => {
    const persistedData = { ...observationData, indicatedValue: 12.34673 };
    testObservationMock.update.mockResolvedValue({ ...persistedObservation, observationData: persistedData });
    await updateTestObservation('observation-1', {
      observationData: { ...observationData, indicatedValue: 12.346729999999999 },
    });
    expect(testObservationMock.update).toHaveBeenLastCalledWith({
      where: { id: 'observation-1' },
      data: { observationFingerprint: observationFingerprint(persistedData) },
    });
  });

  it('maps update not-found failures safely', async () => {
    testObservationMock.update.mockRejectedValue({ code: 'P2025', message: 'Raw Prisma error' });
    await expect(updateTestObservation('missing', { sequenceIndex: 1 })).rejects.toBeInstanceOf(
      DatabaseNotFoundError
    );
  });

  it('maps a TestSession foreign-key failure safely', async () => {
    testObservationMock.create.mockRejectedValue({ code: 'P2003', message: 'Raw FK details' });
    await expect(createTestObservation(createInput)).rejects.toBeInstanceOf(DatabaseForeignKeyError);
  });

  it('maps conflicts through the shared database boundary', async () => {
    testObservationMock.create.mockRejectedValue({ code: 'P2002', message: 'Raw conflict' });
    await expect(createTestObservation(createInput)).rejects.toBeInstanceOf(DatabaseConflictError);
  });

  it('maps unexpected failures without exposing raw details', async () => {
    testObservationMock.findMany.mockRejectedValue(new Error('Private connection details'));
    await expect(listTestObservations()).rejects.toBeInstanceOf(DatabaseError);
  });

  it('preserves JSON application data and serializes createdAt exactly', async () => {
    testObservationMock.findUnique.mockResolvedValue(persistedObservation);

    const result = await getTestObservationById('observation-1');

    expect(result.observationData).toEqual(observationData);
    expect(result.createdAt).toBe('2026-09-06T10:30:00.125Z');
  });

  it('deletes an observation from draft session', async () => {
    testObservationMock.findUnique.mockResolvedValue({
      ...persistedObservation,
      session: { status: 'DRAFT' },
    });
    testObservationMock.delete.mockResolvedValue(persistedObservation);

    await expect(deleteTestObservation('observation-1')).resolves.toBeUndefined();
    expect(testObservationMock.delete).toHaveBeenCalledWith({ where: { id: 'observation-1' } });
  });

  it('rejects deleting observation from approved or locked session', async () => {
    testObservationMock.findUnique.mockResolvedValue({
      ...persistedObservation,
      session: { status: 'APPROVED' },
    });

    await expect(deleteTestObservation('observation-1')).rejects.toBeInstanceOf(DatabaseConflictError);
    expect(testObservationMock.delete).not.toHaveBeenCalled();
  });

  describe('batchSaveTestObservations', () => {
    it('creates new observations, updates existing observations, and deletes removed rows atomically', async () => {
      testSessionMock.findUnique.mockResolvedValue({ id: 'session-1', status: 'IN_PROGRESS' });
      testObservationMock.deleteMany.mockResolvedValue({ count: 1 });
      testObservationMock.findMany.mockResolvedValue([{ id: 'observation-existing-1' }]);
      testObservationMock.findFirst.mockResolvedValue(persistedObservation);
      testObservationMock.update.mockResolvedValue({
        ...persistedObservation,
        id: 'observation-existing-1',
        sequenceIndex: 1,
      });
      testObservationMock.create.mockResolvedValue({
        ...persistedObservation,
        id: 'observation-new-2',
        sequenceIndex: 2,
      });

      const batchPayload = {
        sessionId: 'session-1',
        deletedIds: ['obs-to-delete-1'],
        observations: [
          {
            id: 'observation-existing-1',
            clientRowId: 'client-row-1',
            testType: 'WEIGHING_PERFORMANCE' as const,
            sequenceIndex: 1,
            observationData,
          },
          {
            clientRowId: 'client-row-2',
            testType: 'WEIGHING_PERFORMANCE' as const,
            sequenceIndex: 2,
            observationData,
          },
        ],
      };

      const result = await batchSaveTestObservations(batchPayload);

      expect(testSessionMock.findUnique).toHaveBeenCalledWith({ where: { id: 'session-1' } });
      expect(testObservationMock.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['obs-to-delete-1'] }, sessionId: 'session-1' },
      });
      expect(testObservationMock.update).toHaveBeenCalledWith({
        where: { id: 'observation-existing-1' },
        data: {
          sequenceIndex: 1,
          testType: 'WEIGHING_PERFORMANCE',
          observationData,
          observationFingerprint: observationFingerprint(observationData),
        },
      });
      expect(testObservationMock.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          testType: 'WEIGHING_PERFORMANCE',
          sequenceIndex: 2,
          observationData,
          observationFingerprint: observationFingerprint(observationData),
        },
      });

      expect(result.deletedCount).toBe(1);
      expect(result.savedObservations).toHaveLength(2);
      expect(result.savedObservations[0].clientRowId).toBe('client-row-1');
      expect(result.savedObservations[1].clientRowId).toBe('client-row-2');
    });

    it('rejects batch save when session is not found', async () => {
      testSessionMock.findUnique.mockResolvedValue(null);

      await expect(batchSaveTestObservations({
        sessionId: 'nonexistent-session',
        observations: [],
      })).rejects.toBeInstanceOf(DatabaseNotFoundError);
    });

    it('rejects batch save when session is locked/approved', async () => {
      testSessionMock.findUnique.mockResolvedValue({ id: 'session-1', status: 'APPROVED' });

      await expect(batchSaveTestObservations({
        sessionId: 'session-1',
        observations: [],
      })).rejects.toBeInstanceOf(DatabaseConflictError);
    });
  });
});
