import type { Approval, Role, SessionStatus, TestSession } from '@prisma/client';

import {
  DatabaseConflictError,
  DatabaseNotFoundError,
  throwMappedDatabaseError,
} from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import type {
  ApprovalActionValue,
  ApprovalCreatePayload,
} from '@/lib/validation/approval';

export interface ApprovalRecord {
  id: string;
  sessionId: string;
  userId: string;
  action: ApprovalActionValue;
  comments: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    role: Role;
  };
}

export interface ApprovalListFilter {
  testSessionId?: string;
}

export interface ApprovalWorkflowResult {
  approval: ApprovalRecord;
  session: {
    id: string;
    status: SessionStatus;
    reviewerId: string | null;
    approverId: string | null;
    completedAt: string | null;
    updatedAt: string;
  };
}

export class ApprovalWorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalWorkflowValidationError';
  }
}

import { assessResultFreshness } from './result-freshness.service';

type ApprovalWithOptionalUser = Approval & {
  user?: { id: string; name: string; role: Role };
};

function toApprovalRecord(approval: ApprovalWithOptionalUser): ApprovalRecord {
  return {
    id: approval.id,
    sessionId: approval.sessionId,
    userId: approval.userId,
    action: approval.action,
    comments: approval.comments,
    createdAt: approval.createdAt.toISOString(),
    ...(approval.user ? { user: approval.user } : {}),
  };
}

function toWorkflowSession(session: TestSession): ApprovalWorkflowResult['session'] {
  return {
    id: session.id,
    status: session.status,
    reviewerId: session.reviewerId,
    approverId: session.approverId,
    completedAt: session.completedAt?.toISOString() ?? null,
    updatedAt: session.updatedAt.toISOString(),
  };
}

function requireRole(actual: Role, expected: Role, action: ApprovalActionValue): void {
  if (actual !== expected) {
    throw new ApprovalWorkflowValidationError(`${action} requires the ${expected} role`);
  }
}

function requireStatus(
  actual: SessionStatus,
  expected: SessionStatus,
  action: ApprovalActionValue
): void {
  if (actual !== expected) {
    throw new ApprovalWorkflowValidationError(
      `${action} is not valid while the session is ${actual}`
    );
  }
}

function transitionFor(
  session: TestSession,
  user: { id: string; role: Role },
  action: ApprovalActionValue
): { status: SessionStatus; reviewerId?: string; approverId?: string; completedAt?: Date } {
  switch (action) {
    case 'SUBMIT_FOR_REVIEW':
      requireStatus(session.status, 'IN_PROGRESS', action);
      requireRole(user.role, 'LAB_TECHNICIAN', action);
      if (user.id !== session.technicianId) {
        throw new ApprovalWorkflowValidationError(
          'Only the technician assigned to this session may submit it for review'
        );
      }
      return { status: 'PENDING_REVIEW' };
    case 'REVIEW_APPROVE':
      requireStatus(session.status, 'PENDING_REVIEW', action);
      requireRole(user.role, 'REVIEWING_OFFICER', action);
      return { status: 'PENDING_APPROVAL', reviewerId: user.id };
    case 'REVIEW_REJECT':
      requireStatus(session.status, 'PENDING_REVIEW', action);
      requireRole(user.role, 'REVIEWING_OFFICER', action);
      return { status: 'REJECTED', reviewerId: user.id, completedAt: new Date() };
    case 'FINAL_APPROVE':
      requireStatus(session.status, 'PENDING_APPROVAL', action);
      requireRole(user.role, 'APPROVING_OFFICER', action);
      return { status: 'APPROVED', approverId: user.id, completedAt: new Date() };
    case 'FINAL_REJECT':
      requireStatus(session.status, 'PENDING_APPROVAL', action);
      requireRole(user.role, 'APPROVING_OFFICER', action);
      return { status: 'REJECTED', approverId: user.id, completedAt: new Date() };
    case 'CANCEL':
      if (!['DRAFT', 'IN_PROGRESS', 'PENDING_REVIEW'].includes(session.status)) {
        throw new ApprovalWorkflowValidationError(
          `CANCEL is not valid while the session is ${session.status}`
        );
      }
      if (user.role !== 'ADMIN' && (user.role !== 'LAB_TECHNICIAN' || user.id !== session.technicianId)) {
        throw new ApprovalWorkflowValidationError(
          'Only the assigned technician or an administrator may cancel this session'
        );
      }
      return { status: 'CANCELLED', completedAt: new Date() };
  }
}

async function assertResultsReady(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  session: TestSession
): Promise<void> {
  const [observations, results, instrument] = await Promise.all([
    tx.testObservation.findMany({
      where: { sessionId: session.id },
    }),
    tx.testResult.findMany({
      where: { sessionId: session.id },
    }),
    tx.instrument.findUnique({
      where: { id: session.instrumentId },
    }),
  ]);

  if (!instrument) throw new DatabaseNotFoundError('Instrument not found for session');

  // Compute the current configuration fingerprint server-side.
  const { instrumentConfigFingerprint } = await import('@/lib/db/observation-fingerprint');
  const currentConfigFp = instrumentConfigFingerprint(instrument, session.verificationContext);

  for (const item of assessResultFreshness(observations, results, session.rulesetVersionId, currentConfigFp)) {
    if (item.state !== 'CURRENT') {
      throw new DatabaseConflictError(
        `${item.testType}: ${item.state}; all results must match saved observations, instrument configuration, and ruleset before approval`
      );
    }
  }
}

/**
 * Creates an immutable approval history row and its permitted session transition
 * in one transaction. This is intentionally the only approval-write operation.
 */
export async function createApproval(
  input: ApprovalCreatePayload
): Promise<ApprovalWorkflowResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const [session, user] = await Promise.all([
        tx.testSession.findUnique({ where: { id: input.sessionId } }),
        tx.user.findUnique({ where: { id: input.userId } }),
      ]);

      if (!session) throw new DatabaseNotFoundError('TestSession not found');
      if (!user || !user.active || user.deletedAt) {
        throw new DatabaseNotFoundError('Active approval user not found');
      }

      const transition = transitionFor(session, user, input.action);
      if (['PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED'].includes(transition.status)) {
        await assertResultsReady(tx, session);
      }

      const update = await tx.testSession.updateMany({
        where: { id: session.id, status: session.status },
        data: transition,
      });
      if (update.count !== 1) {
        throw new DatabaseConflictError('TestSession workflow state changed concurrently');
      }

      const approval = await tx.approval.create({
        data: {
          sessionId: input.sessionId,
          userId: input.userId,
          action: input.action,
          ...(input.comments !== undefined ? { comments: input.comments } : {}),
          ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
        },
        include: { user: { select: { id: true, name: true, role: true } } },
      });
      const updatedSession = await tx.testSession.findUnique({ where: { id: session.id } });
      if (!updatedSession) throw new DatabaseNotFoundError('TestSession not found');

      return {
        approval: toApprovalRecord(approval),
        session: toWorkflowSession(updatedSession),
      };
    }, { isolationLevel: 'Serializable', timeout: 20000 });
  } catch (error) {
    if (error instanceof ApprovalWorkflowValidationError) throw error;
    throwMappedDatabaseError(error, 'Approval');
  }
}

export async function listApprovals(
  filter: ApprovalListFilter = {}
): Promise<ApprovalRecord[]> {
  try {
    const approvals = await prisma.approval.findMany({
      ...(filter.testSessionId ? { where: { sessionId: filter.testSessionId } } : {}),
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return approvals.map(toApprovalRecord);
  } catch (error) {
    throwMappedDatabaseError(error, 'Approval');
  }
}

export async function getApprovalById(id: string): Promise<ApprovalRecord> {
  try {
    const approval = await prisma.approval.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    if (!approval) throw new DatabaseNotFoundError('Approval not found');
    return toApprovalRecord(approval);
  } catch (error) {
    throwMappedDatabaseError(error, 'Approval');
  }
}
