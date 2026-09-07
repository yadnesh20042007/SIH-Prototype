import type { TestSession } from '@prisma/client';

import {
  DatabaseConflictError,
  DatabaseNotFoundError,
  throwMappedDatabaseError,
} from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import type {
  TestSessionCreatePayload,
  TestSessionStatus,
  TestSessionUpdatePayload,
  TestSessionVerificationContext,
} from '@/lib/validation/test-session';

export interface TestSessionRecord {
  id: string;
  instrumentId: string;
  verificationContext: TestSessionVerificationContext;
  status: TestSessionStatus;
  rulesetVersionId: string;
  technicianId: string;
  reviewerId: string | null;
  approverId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TestSessionListFilter {
  instrumentId?: string;
  status?: TestSessionStatus;
}

export interface DevelopmentTestSessionContext {
  rulesetVersion: {
    id: string;
    standard: string;
    version: string;
  };
  technician: {
    id: string;
    name: string;
    role: 'LAB_TECHNICIAN';
  };
  reviewer: {
    id: string;
    name: string;
    role: 'REVIEWING_OFFICER';
  };
  approver: {
    id: string;
    name: string;
    role: 'APPROVING_OFFICER';
  };
}

const PROTOTYPE_RULESET = {
  standard: 'OIML R76-1',
  version: '2006',
} as const;

const DEVELOPMENT_TECHNICIAN_EMAIL = 'dev.lab.technician@nawi-r76.local';
const DEVELOPMENT_REVIEWER_EMAIL = 'dev.reviewing.officer@nawi-r76.local';
const DEVELOPMENT_APPROVER_EMAIL = 'dev.approving.officer@nawi-r76.local';

function toIsoString(value: Date): string {
  return value.toISOString();
}

function toTestSessionRecord(session: TestSession): TestSessionRecord {
  return {
    id: session.id,
    instrumentId: session.instrumentId,
    verificationContext: session.verificationContext,
    status: session.status,
    rulesetVersionId: session.rulesetVersionId,
    technicianId: session.technicianId,
    reviewerId: session.reviewerId,
    approverId: session.approverId,
    notes: session.notes,
    createdAt: toIsoString(session.createdAt),
    updatedAt: toIsoString(session.updatedAt),
    completedAt: session.completedAt ? toIsoString(session.completedAt) : null,
  };
}

export async function createTestSession(
  input: TestSessionCreatePayload
): Promise<TestSessionRecord> {
  try {
    const session = await prisma.testSession.create({ data: input });
    return toTestSessionRecord(session);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}

/** Resolves the seeded pre-authentication identities used to start a development session. */
export async function getDevelopmentTestSessionContext(): Promise<DevelopmentTestSessionContext> {
  try {
    const [rulesetVersion, technician, reviewer, approver] = await Promise.all([
      prisma.rulesetVersion.findFirst({
        where: {
          ...PROTOTYPE_RULESET,
          isActive: true,
        },
        select: { id: true, standard: true, version: true },
      }),
      prisma.user.findFirst({
        where: {
          email: DEVELOPMENT_TECHNICIAN_EMAIL,
          role: 'LAB_TECHNICIAN',
          active: true,
          deletedAt: null,
        },
        select: { id: true, name: true, role: true },
      }),
      prisma.user.findFirst({
        where: {
          email: DEVELOPMENT_REVIEWER_EMAIL,
          role: 'REVIEWING_OFFICER',
          active: true,
          deletedAt: null,
        },
        select: { id: true, name: true, role: true },
      }),
      prisma.user.findFirst({
        where: {
          email: DEVELOPMENT_APPROVER_EMAIL,
          role: 'APPROVING_OFFICER',
          active: true,
          deletedAt: null,
        },
        select: { id: true, name: true, role: true },
      }),
    ]);

    if (!rulesetVersion) {
      throw new DatabaseNotFoundError('Active OIML R76-1:2006 prototype ruleset not found');
    }
    if (!technician) {
      throw new DatabaseNotFoundError('Active development lab technician not found');
    }
    if (!reviewer) {
      throw new DatabaseNotFoundError('Active development reviewing officer not found');
    }
    if (!approver) {
      throw new DatabaseNotFoundError('Active development approving officer not found');
    }

    return {
      rulesetVersion,
      technician: {
        id: technician.id,
        name: technician.name,
        role: 'LAB_TECHNICIAN',
      },
      reviewer: {
        id: reviewer.id,
        name: reviewer.name,
        role: 'REVIEWING_OFFICER',
      },
      approver: {
        id: approver.id,
        name: approver.name,
        role: 'APPROVING_OFFICER',
      },
    };
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}

export async function listTestSessions(
  filter: TestSessionListFilter = {}
): Promise<TestSessionRecord[]> {
  try {
    const sessions = await prisma.testSession.findMany({
      ...(filter.instrumentId || filter.status
        ? {
            where: {
              ...(filter.instrumentId ? { instrumentId: filter.instrumentId } : {}),
              ...(filter.status ? { status: filter.status } : {}),
            },
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(toTestSessionRecord);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}

export async function getTestSessionById(id: string): Promise<TestSessionRecord> {
  try {
    const session = await prisma.testSession.findUnique({ where: { id } });
    if (!session) throw new DatabaseNotFoundError('TestSession not found');
    return toTestSessionRecord(session);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}

export async function updateTestSession(
  id: string,
  input: TestSessionUpdatePayload
): Promise<TestSessionRecord> {
  try {
    const session = await prisma.testSession.update({
      where: { id },
      data: input,
    });
    return toTestSessionRecord(session);
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}

/** Controlled, idempotent transition used when the first observations are saved. */
export async function startTestSessionProgress(id: string): Promise<TestSessionRecord> {
  try {
    const update = await prisma.testSession.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'IN_PROGRESS' },
    });
    const session = await prisma.testSession.findUnique({ where: { id } });
    if (!session) throw new DatabaseNotFoundError('TestSession not found');
    if (update.count === 1 || session.status === 'IN_PROGRESS') {
      return toTestSessionRecord(session);
    }
    throw new DatabaseConflictError(
      `TestSession cannot enter IN_PROGRESS while it is ${session.status}`
    );
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}
