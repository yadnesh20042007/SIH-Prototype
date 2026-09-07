import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logicalObservationFingerprint } from './result-freshness.service';
import { instrumentConfigFingerprint } from '@/lib/db/observation-fingerprint';

const mocks = vi.hoisted(() => ({
  approval: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  instrument: { findUnique: vi.fn() },
  testObservation: { findMany: vi.fn() },
  testResult: { findMany: vi.fn() },
  testSession: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    approval: mocks.approval,
    instrument: mocks.instrument,
    testObservation: mocks.testObservation,
    testResult: mocks.testResult,
    testSession: mocks.testSession,
    user: mocks.user,
    $transaction: mocks.transaction,
  },
}));

import {
  DatabaseConflictError,
  DatabaseError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  ApprovalWorkflowValidationError,
  createApproval,
  getApprovalById,
  listApprovals,
} from './approval.service';

const now = new Date('2026-09-06T12:00:00.000Z');
const resultTime = new Date('2026-09-06T11:30:00.000Z');
const observationTime = new Date('2026-09-06T11:00:00.000Z');

const session = {
  id: 'session-1', instrumentId: 'instrument-1',
  verificationContext: 'INITIAL_VERIFICATION', status: 'IN_PROGRESS',
  rulesetVersionId: 'ruleset-1', technicianId: 'technician-1',
  reviewerId: null, approverId: null, notes: null,
  createdAt: now, updatedAt: now, completedAt: null,
};

// Minimal instrument fixture with evaluation-relevant fields only.
const instrument = {
  id: 'instrument-1',
  accuracyClass: 'III',
  instrumentType: 'SINGLE_RANGE',
  max: { toString: () => '30' },
  min: { toString: () => '0.02' },
  e: { toString: () => '0.01' },
  d: { toString: () => '0.01' },
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: false,
  hasInitialZeroSettingDevice: false,
  initialZeroSettingRange: { toString: () => '0' },
  hasFineDisplayDevice: false,
};

const users = {
  technician: {
    id: 'technician-1', name: 'Development Lab Technician', email: 'tech@example.test',
    passwordHash: 'dev', role: 'LAB_TECHNICIAN', active: true,
    createdAt: now, updatedAt: now, deletedAt: null,
  },
  reviewer: {
    id: 'reviewer-1', name: 'Development Reviewing Officer', email: 'review@example.test',
    passwordHash: 'dev', role: 'REVIEWING_OFFICER', active: true,
    createdAt: now, updatedAt: now, deletedAt: null,
  },
  approver: {
    id: 'approver-1', name: 'Development Approving Officer', email: 'approve@example.test',
    passwordHash: 'dev', role: 'APPROVING_OFFICER', active: true,
    createdAt: now, updatedAt: now, deletedAt: null,
  },
  admin: {
    id: 'admin-1', name: 'Development Administrator', email: 'admin@example.test',
    passwordHash: 'dev', role: 'ADMIN', active: true,
    createdAt: now, updatedAt: now, deletedAt: null,
  },
};

const testTypes = [
  'WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRIC_LOADING',
] as const;
const observations = testTypes.map((testType) => ({
  testType, createdAt: observationTime, sequenceIndex: 0, observationData: { positionId: 'centre', load: 10 },
}));
const currentConfigFp = instrumentConfigFingerprint(
  instrument as unknown as Parameters<typeof instrumentConfigFingerprint>[0],
  session.verificationContext
);
const results = testTypes.map((testType) => ({
  testType, rulesetVersionId: 'ruleset-1', createdAt: resultTime,
  evaluatedObservationFingerprint: logicalObservationFingerprint(observations.filter(row => row.testType === testType)),
  evaluatedConfigFingerprint: currentConfigFp,
}));

const approval = {
  id: 'approval-1', sessionId: 'session-1', userId: 'technician-1',
  action: 'SUBMIT_FOR_REVIEW', comments: null, createdAt: now,
  user: { id: 'technician-1', name: 'Development Lab Technician', role: 'LAB_TECHNICIAN' },
};

function installReadyState(
  status = 'IN_PROGRESS',
  user = users.technician
): void {
  mocks.testSession.findUnique
    .mockResolvedValueOnce({ ...session, status })
    .mockResolvedValueOnce({
      ...session,
      status: status === 'IN_PROGRESS' ? 'PENDING_REVIEW' : status,
      updatedAt: now,
    });
  mocks.user.findUnique.mockResolvedValue(user);
  mocks.instrument.findUnique.mockResolvedValue(instrument);
  mocks.testObservation.findMany.mockResolvedValue(observations);
  mocks.testResult.findMany.mockResolvedValue(results);
  mocks.testSession.updateMany.mockResolvedValue({ count: 1 });
  mocks.approval.create.mockResolvedValue({
    ...approval,
    user: { id: user.id, name: user.name, role: user.role },
  });
}

describe('Approval service unit tests (mocked Prisma)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      approval: mocks.approval,
      instrument: mocks.instrument,
      testObservation: mocks.testObservation,
      testResult: mocks.testResult,
      testSession: mocks.testSession,
      user: mocks.user,
    }));
  });

  it('atomically submits an in-progress session and creates immutable history', async () => {
    installReadyState();
    const result = await createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1');
    expect(result.session.status).toBe('PENDING_REVIEW');
    expect(result.approval.createdAt).toBe('2026-09-06T12:00:00.000Z');
    expect(mocks.testSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', status: 'IN_PROGRESS' },
      data: { status: 'PENDING_REVIEW' },
    });
    expect(mocks.approval.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SUBMIT_FOR_REVIEW', userId: 'technician-1' }),
    }));
  });

  it('allows ADMIN to act without impersonating the assigned technician', async () => {
    installReadyState('IN_PROGRESS', users.admin);
    await createApproval({ sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW' }, 'admin-1');
    expect(mocks.approval.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'admin-1', action: 'SUBMIT_FOR_REVIEW' }),
    }));
  });

  it('lists approval history in chronological order with actor identity', async () => {
    mocks.approval.findMany.mockResolvedValue([approval]);
    await expect(listApprovals()).resolves.toMatchObject([{ id: 'approval-1', user: approval.user }]);
    expect(mocks.approval.findMany).toHaveBeenCalledWith({
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('filters approval history by TestSession ID', async () => {
    mocks.approval.findMany.mockResolvedValue([approval]);
    await listApprovals({ testSessionId: 'session-1' });
    expect(mocks.approval.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId: 'session-1' },
    }));
  });

  it('gets an approval by ID and serializes its date', async () => {
    mocks.approval.findUnique.mockResolvedValue(approval);
    await expect(getApprovalById('approval-1')).resolves.toMatchObject({
      id: 'approval-1', createdAt: '2026-09-06T12:00:00.000Z',
    });
  });

  it('maps a missing approval to not found', async () => {
    mocks.approval.findUnique.mockResolvedValue(null);
    await expect(getApprovalById('missing')).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('advances a reviewed session to pending final approval and records the reviewer', async () => {
    installReadyState('PENDING_REVIEW', users.reviewer);
    mocks.testSession.findUnique.mockReset()
      .mockResolvedValueOnce({ ...session, status: 'PENDING_REVIEW' })
      .mockResolvedValueOnce({
        ...session, status: 'PENDING_APPROVAL', reviewerId: 'reviewer-1', updatedAt: now,
      });
    await createApproval({
      sessionId: 'session-1', action: 'REVIEW_APPROVE',
    }, 'reviewer-1');
    expect(mocks.testSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', status: 'PENDING_REVIEW' },
      data: { status: 'PENDING_APPROVAL', reviewerId: 'reviewer-1' },
    });
  });

  it('records reviewer rejection as a terminal rejected state', async () => {
    installReadyState('PENDING_REVIEW', users.reviewer);
    mocks.testSession.findUnique.mockReset()
      .mockResolvedValueOnce({ ...session, status: 'PENDING_REVIEW' })
      .mockResolvedValueOnce({
        ...session, status: 'REJECTED', reviewerId: 'reviewer-1',
        completedAt: now, updatedAt: now,
      });
    await createApproval({
      sessionId: 'session-1', action: 'REVIEW_REJECT',
    }, 'reviewer-1');
    expect(mocks.testSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'REJECTED', reviewerId: 'reviewer-1' }),
    }));
  });

  it('allows final approval only from pending approval and records the approver', async () => {
    installReadyState('PENDING_APPROVAL', users.approver);
    mocks.testSession.findUnique.mockReset()
      .mockResolvedValueOnce({ ...session, status: 'PENDING_APPROVAL', reviewerId: 'reviewer-1' })
      .mockResolvedValueOnce({
        ...session, status: 'APPROVED', reviewerId: 'reviewer-1',
        approverId: 'approver-1', completedAt: now, updatedAt: now,
      });
    await createApproval({
      sessionId: 'session-1', action: 'FINAL_APPROVE',
    }, 'approver-1');
    expect(mocks.testSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', approverId: 'approver-1' }),
    }));
  });

  it.each([
    ['REVIEW_APPROVE', 'PENDING_REVIEW', users.technician],
    ['FINAL_APPROVE', 'PENDING_APPROVAL', users.reviewer],
  ] as const)('rejects role misuse for %s', async (action, status, user) => {
    mocks.testSession.findUnique.mockResolvedValue({ ...session, status });
    mocks.user.findUnique.mockResolvedValue(user);
    await expect(createApproval({ sessionId: 'session-1', action }, user.id))
      .rejects.toBeInstanceOf(ApprovalWorkflowValidationError);
    expect(mocks.testSession.updateMany).not.toHaveBeenCalled();
  });

  it('prevents final approval before the review stage', async () => {
    mocks.testSession.findUnique.mockResolvedValue({ ...session, status: 'IN_PROGRESS' });
    mocks.user.findUnique.mockResolvedValue(users.approver);
    await expect(createApproval({
      sessionId: 'session-1', action: 'FINAL_APPROVE',
    }, 'approver-1')).rejects.toMatchObject({ name: 'ApprovalWorkflowValidationError' });
  });

  it('prevents a different technician from submitting the session', async () => {
    mocks.testSession.findUnique.mockResolvedValue(session);
    mocks.user.findUnique.mockResolvedValue({ ...users.technician, id: 'technician-2' });
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-2')).rejects.toBeInstanceOf(ApprovalWorkflowValidationError);
  });

  it('rejects a nonexistent session before creating history', async () => {
    mocks.testSession.findUnique.mockResolvedValue(null);
    mocks.user.findUnique.mockResolvedValue(users.technician);
    await expect(createApproval({
      sessionId: 'missing', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('rejects inactive or deleted actors', async () => {
    mocks.testSession.findUnique.mockResolvedValue(session);
    mocks.user.findUnique.mockResolvedValue({ ...users.technician, active: false });
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('blocks submission when a required result is missing', async () => {
    installReadyState();
    mocks.testResult.findMany.mockResolvedValue(results.slice(0, 2));
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toBeInstanceOf(DatabaseConflictError);
  });

  it('blocks submission when duplicate logical results need integrity review', async () => {
    installReadyState();
    mocks.testResult.findMany.mockResolvedValue([...results, results[0]]);
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('CONFLICT') });
  });

  it('blocks changed observations even when timestamps have not changed', async () => {
    installReadyState();
    mocks.testObservation.findMany.mockResolvedValue([
      ...observations.slice(0, 2),
      { ...observations[2], observationData: { positionId: 'centre', load: 11 } },
    ]);
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('STALE') });
  });

  it('blocks results produced with a different ruleset version', async () => {
    installReadyState();
    mocks.testResult.findMany.mockResolvedValue([
      { ...results[0], rulesetVersionId: 'other-ruleset' }, ...results.slice(1),
    ]);
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('ruleset') });
  });

  it('detects a concurrent session-state change without creating history', async () => {
    installReadyState();
    mocks.testSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toBeInstanceOf(DatabaseConflictError);
    expect(mocks.approval.create).not.toHaveBeenCalled();
  });

  it('maps unexpected Prisma failures to a safe database error', async () => {
    mocks.approval.findMany.mockRejectedValue(new Error('Connection secrets'));
    await expect(listApprovals()).rejects.toBeInstanceOf(DatabaseError);
  });

  it('blocks submission when evaluated instrument config fingerprint does not match current config', async () => {
    installReadyState();
    // Override results with a stale config fingerprint (e.g. instrument was edited after evaluation)
    mocks.testResult.findMany.mockResolvedValue(
      results.map(r => ({ ...r, evaluatedConfigFingerprint: 'stale'.padEnd(64, '0') }))
    );
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('STALE') });
  });

  it('blocks submission when evaluatedConfigFingerprint is null (legacy result not yet re-evaluated)', async () => {
    installReadyState();
    mocks.testResult.findMany.mockResolvedValue(
      results.map(r => ({ ...r, evaluatedConfigFingerprint: null }))
    );
    await expect(createApproval({
      sessionId: 'session-1', action: 'SUBMIT_FOR_REVIEW',
    }, 'technician-1')).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('STALE') });
  });
});
