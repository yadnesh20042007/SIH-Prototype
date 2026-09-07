import { beforeEach, describe, expect, it, vi } from 'vitest';
import { observationFingerprint } from '@/lib/db/observation-fingerprint';

const { testObservationMock } = vi.hoisted(() => ({
  testObservationMock: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    testObservation: testObservationMock,
    $transaction: async (callback: (tx: { testObservation: typeof testObservationMock }) => unknown) =>
      callback({ testObservation: testObservationMock }),
  },
}));

import {
  DatabaseConflictError,
  DatabaseError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  createTestObservation,
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
});
