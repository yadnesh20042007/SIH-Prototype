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
  revisionNumber: number;
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
}

const PROTOTYPE_RULESET = {
  standard: 'OIML R76-1',
  version: '2006',
} as const;


function toIsoString(value: Date): string {
  return value.toISOString();
}

function toTestSessionRecord(session: TestSession): TestSessionRecord {
  return {
    id: session.id,
    instrumentId: session.instrumentId,
    verificationContext: session.verificationContext,
    status: session.status,
    revisionNumber: session.revisionNumber,
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

/** Resolves only the active prototype ruleset needed to start a session. */
export async function getDevelopmentTestSessionContext(): Promise<DevelopmentTestSessionContext> {
  try {
    const rulesetVersion = await prisma.rulesetVersion.findFirst({
        where: {
          ...PROTOTYPE_RULESET,
          isActive: true,
        },
        select: { id: true, standard: true, version: true },
      });

    if (!rulesetVersion) {
      throw new DatabaseNotFoundError('Active OIML R76-1:2006 prototype ruleset not found');
    }
    return { rulesetVersion };
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

export async function deleteTestSession(id: string, actorId: string): Promise<void> {
  try {
    const session = await prisma.testSession.findUnique({ where: { id } });
    if (!session) throw new DatabaseNotFoundError('TestSession not found');

    if (session.status === 'APPROVED' || session.status === 'PENDING_APPROVAL') {
      throw new DatabaseConflictError(`Cannot delete session with status ${session.status}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.approval.deleteMany({ where: { sessionId: id } });
      await tx.report.deleteMany({ where: { sessionId: id } });
      
      await tx.auditLog.updateMany({ where: { sessionId: id }, data: { sessionId: null } });

      await tx.auditLog.create({
        data: {
          entityType: 'TestSession',
          entityId: id,
          action: 'DELETE',
          userId: actorId,
        },
      });

      await tx.testSession.delete({ where: { id } });
    });
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}

export interface EvaluationWorkspaceData {
  session: TestSessionRecord;
  instrument: any;
  observations: any[];
  results: any[];
  approvals: any[];
}

export async function getEvaluationWorkspace(sessionId: string): Promise<EvaluationWorkspaceData> {
  try {
    const session = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        instrument: {
          include: { manufacturer: true },
        },
        observations: {
          orderBy: [{ sequenceIndex: 'asc' }, { createdAt: 'asc' }],
        },
        results: {
          orderBy: { createdAt: 'desc' },
        },
        approvals: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!session) throw new DatabaseNotFoundError('TestSession not found');

    const instrument = {
      id: session.instrument.id,
      manufacturerId: session.instrument.manufacturerId,
      manufacturer: {
        id: session.instrument.manufacturer.id,
        name: session.instrument.manufacturer.name,
        country: session.instrument.manufacturer.country,
        registrationCode: session.instrument.manufacturer.registrationCode,
      },
      model: session.instrument.model,
      serialNumber: session.instrument.serialNumber,
      accuracyClass: session.instrument.accuracyClass,
      instrumentType: session.instrument.instrumentType,
      indicationType: session.instrument.indicationType ?? null,
      max: session.instrument.max.toString(),
      min: session.instrument.min.toString(),
      e: session.instrument.e.toString(),
      d: session.instrument.d.toString(),
      numberOfSupportPoints: session.instrument.numberOfSupportPoints,
      additiveTareEffect: session.instrument.additiveTareEffect,
      hasAutoZeroOrTracking: session.instrument.hasAutoZeroOrTracking,
      hasInitialZeroSettingDevice: session.instrument.hasInitialZeroSettingDevice,
      initialZeroSettingRange: session.instrument.initialZeroSettingRange.toString(),
      hasFineDisplayDevice: session.instrument.hasFineDisplayDevice,
      zeroSettingMechanisms: session.instrument.zeroSettingMechanisms,
      registeredById: session.instrument.registeredById,
      createdAt: session.instrument.createdAt.toISOString(),
      updatedAt: session.instrument.updatedAt.toISOString(),
    };

    const observations = session.observations.map((obs) => ({
      id: obs.id,
      sessionId: obs.sessionId,
      testType: obs.testType,
      sequenceIndex: obs.sequenceIndex,
      observationData: obs.observationData,
      createdAt: obs.createdAt.toISOString(),
    }));

    const results = session.results.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      testType: r.testType,
      outcome: r.outcome,
      maxAbsoluteError: r.maxAbsoluteError.toString(),
      mpe: r.mpe.toString(),
      repeatabilityRange: r.repeatabilityRange?.toString() ?? null,
      r76Reference: r.r76Reference,
      explanation: r.explanation,
      rulesetVersionId: r.rulesetVersionId,
      complianceTrace: r.complianceTrace,
      createdAt: r.createdAt.toISOString(),
      evaluatedObservationFingerprint: r.evaluatedObservationFingerprint ?? null,
      evaluatedConfigFingerprint: r.evaluatedConfigFingerprint ?? null,
    }));

    const approvals = session.approvals.map((a) => ({
      id: a.id,
      sessionId: a.sessionId,
      userId: a.userId,
      action: a.action,
      comments: a.comments,
      createdAt: a.createdAt.toISOString(),
      ...(a.user ? { user: a.user } : {}),
    }));

    return {
      session: toTestSessionRecord(session),
      instrument,
      observations,
      results,
      approvals,
    };
  } catch (error) {
    throwMappedDatabaseError(error, 'TestSession');
  }
}
