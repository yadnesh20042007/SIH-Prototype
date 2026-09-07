import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rulesetVersionMock, testSessionMock, userMock } = vi.hoisted(() => ({
  rulesetVersionMock: {
    findFirst: vi.fn(),
  },
  testSessionMock: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  userMock: {
    findFirst: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rulesetVersion: rulesetVersionMock,
    testSession: testSessionMock,
    user: userMock,
  },
}));

import {
  DatabaseConflictError,
  DatabaseError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  createTestSession,
  getDevelopmentTestSessionContext,
  getTestSessionById,
  listTestSessions,
  startTestSessionProgress,
  updateTestSession,
} from './test-session.service';

const createdAt = new Date('2026-09-01T08:00:00.000Z');
const updatedAt = new Date('2026-09-02T09:30:00.000Z');
const completedAt = new Date('2026-09-03T10:45:30.125Z');

const persistedSession = {
  id: 'session-1',
  instrumentId: 'instrument-1',
  verificationContext: 'INITIAL_VERIFICATION',
  status: 'DRAFT',
  rulesetVersionId: 'ruleset-1',
  technicianId: 'technician-1',
  reviewerId: null,
  approverId: null,
  notes: null,
  createdAt,
  updatedAt,
  completedAt: null,
};

const createInput = {
  instrumentId: 'instrument-1',
  verificationContext: 'INITIAL_VERIFICATION' as const,
  rulesetVersionId: 'ruleset-1',
  technicianId: 'technician-1',
};

describe('TestSession service unit tests (mocked Prisma)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session from already validated input', async () => {
    testSessionMock.create.mockResolvedValue(persistedSession);

    await expect(createTestSession(createInput)).resolves.toMatchObject({
      id: 'session-1',
      instrumentId: 'instrument-1',
      status: 'DRAFT',
    });
    expect(testSessionMock.create).toHaveBeenCalledWith({ data: createInput });
  });

  it('resolves only the active prototype ruleset', async () => {
    rulesetVersionMock.findFirst.mockResolvedValue({
      id: 'ruleset-real-id',
      standard: 'OIML R76-1',
      version: '2006',
    });
    await expect(getDevelopmentTestSessionContext()).resolves.toEqual({
      rulesetVersion: {
        id: 'ruleset-real-id',
        standard: 'OIML R76-1',
        version: '2006',
      },
    });
    expect(rulesetVersionMock.findFirst).toHaveBeenCalledWith({
      where: {
        standard: 'OIML R76-1',
        version: '2006',
        isActive: true,
      },
      select: { id: true, standard: true, version: true },
    });
    expect(userMock.findFirst).not.toHaveBeenCalled();
  });

  it('reports missing development bootstrap data safely', async () => {
    rulesetVersionMock.findFirst.mockResolvedValue(null);
    userMock.findFirst.mockResolvedValue(null);

    await expect(getDevelopmentTestSessionContext()).rejects.toMatchObject({
      name: 'DatabaseNotFoundError',
      code: 'NOT_FOUND',
      message: 'Active OIML R76-1:2006 prototype ruleset not found',
    });
  });

  it('lists sessions newest first', async () => {
    testSessionMock.findMany.mockResolvedValue([persistedSession]);

    const result = await listTestSessions();

    expect(result).toHaveLength(1);
    expect(testSessionMock.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('filters listed sessions by instrument ID', async () => {
    testSessionMock.findMany.mockResolvedValue([persistedSession]);

    await listTestSessions({ instrumentId: 'instrument-1' });

    expect(testSessionMock.findMany).toHaveBeenCalledWith({
      where: { instrumentId: 'instrument-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('filters listed sessions by workflow status', async () => {
    testSessionMock.findMany.mockResolvedValue([persistedSession]);

    await listTestSessions({ status: 'PENDING_REVIEW' });

    expect(testSessionMock.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('gets a session by ID', async () => {
    testSessionMock.findUnique.mockResolvedValue(persistedSession);

    await expect(getTestSessionById('session-1')).resolves.toMatchObject({
      id: 'session-1',
      verificationContext: 'INITIAL_VERIFICATION',
    });
    expect(testSessionMock.findUnique).toHaveBeenCalledWith({
      where: { id: 'session-1' },
    });
  });

  it('maps a missing session to a safe not-found error', async () => {
    testSessionMock.findUnique.mockResolvedValue(null);

    await expect(getTestSessionById('missing')).rejects.toBeInstanceOf(
      DatabaseNotFoundError
    );
    await expect(getTestSessionById('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'TestSession not found',
    });
  });

  it('updates a session with an already validated partial input', async () => {
    const input = {
      status: 'IN_PROGRESS' as const,
      reviewerId: 'reviewer-1',
      notes: null,
    };
    testSessionMock.update.mockResolvedValue({
      ...persistedSession,
      ...input,
    });

    const result = await updateTestSession('session-1', input);

    expect(result).toMatchObject(input);
    expect(testSessionMock.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: input,
    });
  });

  it('maps Prisma update not-found failures safely', async () => {
    testSessionMock.update.mockRejectedValue({
      code: 'P2025',
      message: 'Raw Prisma details',
    });

    await expect(
      updateTestSession('missing', { status: 'CANCELLED' })
    ).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('moves a draft session to in progress through the controlled transition', async () => {
    testSessionMock.updateMany.mockResolvedValue({ count: 1 });
    testSessionMock.findUnique.mockResolvedValue({
      ...persistedSession,
      status: 'IN_PROGRESS',
    });
    await expect(startTestSessionProgress('session-1')).resolves.toMatchObject({
      status: 'IN_PROGRESS',
    });
    expect(testSessionMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', status: 'DRAFT' },
      data: { status: 'IN_PROGRESS' },
    });
  });

  it('blocks the progress transition from a later workflow stage', async () => {
    testSessionMock.updateMany.mockResolvedValue({ count: 0 });
    testSessionMock.findUnique.mockResolvedValue({
      ...persistedSession,
      status: 'PENDING_REVIEW',
    });
    await expect(startTestSessionProgress('session-1')).rejects.toBeInstanceOf(
      DatabaseConflictError
    );
  });

  it('maps an instrument foreign-key failure without exposing Prisma details', async () => {
    testSessionMock.create.mockRejectedValue({
      code: 'P2003',
      message: 'Raw instrument foreign-key details',
    });

    const operation = createTestSession(createInput);

    await expect(operation).rejects.toBeInstanceOf(DatabaseForeignKeyError);
    await expect(operation).rejects.toMatchObject({
      code: 'FOREIGN_KEY',
      message: 'TestSession references a related record that does not exist',
    });
  });

  it('maps unexpected database failures to a generic safe error', async () => {
    testSessionMock.findMany.mockRejectedValue(new Error('Connection details'));

    const operation = listTestSessions();

    await expect(operation).rejects.toBeInstanceOf(DatabaseError);
    await expect(operation).rejects.toMatchObject({
      code: 'DATABASE_ERROR',
      message: 'Unable to complete the testsession database operation',
    });
  });

  it('serializes all date/time fields consistently as ISO strings', async () => {
    testSessionMock.findUnique.mockResolvedValue({
      ...persistedSession,
      completedAt,
    });

    const result = await getTestSessionById('session-1');

    expect(result).toMatchObject({
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-02T09:30:00.000Z',
      completedAt: '2026-09-03T10:45:30.125Z',
    });
  });
});
