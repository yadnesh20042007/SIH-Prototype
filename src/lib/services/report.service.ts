import type { Prisma, Report } from '@prisma/client';

import { instrumentConfigFingerprint } from '@/lib/db/observation-fingerprint';
import {
  DatabaseConflictError,
  DatabaseNotFoundError,
  throwMappedDatabaseError,
} from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';
import { publicVerificationUrl } from '@/lib/reports/public-verification-url';
import {
  renderR76ReportPdf,
  type R76ReportData,
} from '@/lib/reports/r76-report-pdf';
import { assessResultFreshness } from '@/lib/services/result-freshness.service';
import { logServerError } from '@/lib/server-error-log';

const reportSessionInclude = {
  instrument: { include: { manufacturer: true } },
  rulesetVersion: true,
  technician: { select: { id: true, name: true, role: true } },
  reviewer: { select: { id: true, name: true, role: true } },
  approver: { select: { id: true, name: true, role: true } },
  observations: { orderBy: [{ testType: 'asc' as const }, { sequenceIndex: 'asc' as const }] },
  results: { orderBy: { testType: 'asc' as const } },
  approvals: {
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.TestSessionInclude;

const reportPdfInclude = {
  session: { include: reportSessionInclude },
} satisfies Prisma.ReportInclude;

type ReportSession = Prisma.TestSessionGetPayload<{ include: typeof reportSessionInclude }>;

export interface ReportRecord {
  id: string;
  sessionId: string;
  referenceNumber: string;
  version: number;
  issuedAt: string;
  updatedAt: string;
  revokedAt: string | null;
  pdfUrl: string | null;
  verificationUrl: string;
}

export class ReportEligibilityError extends DatabaseConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'ReportEligibilityError';
  }
}

function toReportRecord(report: Report): ReportRecord {
  return {
    id: report.id,
    sessionId: report.sessionId,
    referenceNumber: report.referenceNumber,
    version: report.version,
    issuedAt: report.issuedAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    revokedAt: report.revokedAt?.toISOString() ?? null,
    pdfUrl: report.revokedAt ? null : `/api/reports/${encodeURIComponent(report.id)}/pdf`,
    verificationUrl: publicVerificationUrl(report.qrVerificationId),
  };
}

function referenceNumber(session: ReportSession): string {
  const year = (session.completedAt ?? new Date()).getUTCFullYear();
  return `NAWI-${year}-${session.id.slice(-12).toUpperCase()}`;
}

function assertEligible(session: ReportSession): void {
  if (session.status !== 'APPROVED') {
    throw new ReportEligibilityError('Only an APPROVED TestSession may generate an official report');
  }
  const configFingerprint = instrumentConfigFingerprint(session.instrument, session.verificationContext);
  const freshness = assessResultFreshness(
    session.observations,
    session.results,
    session.rulesetVersionId,
    configFingerprint
  );
  const unavailable = freshness.filter(item => item.state !== 'CURRENT');
  if (unavailable.length) {
    throw new ReportEligibilityError(
      `Report generation requires CURRENT results: ${unavailable.map(item => `${item.testType}=${item.state}`).join(', ')}`
    );
  }
}

function reportData(report: Report, session: ReportSession, verificationUrl: string): R76ReportData {
  return {
    reportId: report.id,
    referenceNumber: report.referenceNumber,
    issuedAt: report.issuedAt.toISOString(),
    verificationUrl,
    session: {
      id: session.id,
      status: session.status,
      verificationContext: session.verificationContext,
      createdAt: session.createdAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      technician: session.technician,
      reviewer: session.reviewer,
      approver: session.approver,
      rulesetVersion: session.rulesetVersion,
      instrument: {
        model: session.instrument.model,
        serialNumber: session.instrument.serialNumber,
        accuracyClass: session.instrument.accuracyClass,
        instrumentType: session.instrument.instrumentType,
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
        manufacturer: session.instrument.manufacturer,
      },
      observations: session.observations.map(observation => ({
        testType: observation.testType,
        sequenceIndex: observation.sequenceIndex,
        observationData: observation.observationData as Record<string, unknown>,
      })),
      results: session.results.map(result => ({
        testType: result.testType,
        outcome: result.outcome,
        maxAbsoluteError: result.maxAbsoluteError.toString(),
        mpe: result.mpe.toString(),
        repeatabilityRange: result.repeatabilityRange?.toString() ?? null,
        r76Reference: result.r76Reference,
        explanation: result.explanation,
        complianceTrace: result.complianceTrace as Record<string, unknown>,
      })),
      approvals: session.approvals.map(approval => ({
        action: approval.action,
        comments: approval.comments,
        createdAt: approval.createdAt.toISOString(),
        user: approval.user,
      })),
    },
  };
}

export async function generateApprovedSessionReport(testSessionId: string): Promise<ReportRecord> {
  try {
    const prepared = await prisma.$transaction(async tx => {
      const session = await tx.testSession.findUnique({
        where: { id: testSessionId },
        include: reportSessionInclude,
      });
      if (!session) throw new DatabaseNotFoundError('TestSession not found');
      assertEligible(session);
      const existing = await tx.report.findFirst({
        where: { sessionId: testSessionId, revokedAt: null },
        orderBy: { version: 'desc' },
      });
      const report = existing ?? await tx.report.create({
        data: {
          sessionId: testSessionId,
          referenceNumber: referenceNumber(session),
          version: 1,
        },
      });
      return { report, session };
    }, { isolationLevel: 'Serializable', timeout: 20000 });

    return toReportRecord(prepared.report);
  } catch (error) {
    if (error instanceof ReportEligibilityError) throw error;
    logServerError('[report.service] Approved report generation failed', error);
    throwMappedDatabaseError(error, 'Report');
  }
}

export async function listReports(testSessionId?: string): Promise<ReportRecord[]> {
  try {
    const args: Prisma.ReportFindManyArgs = {
      where: { ...(testSessionId ? { sessionId: testSessionId } : {}), revokedAt: null },
      orderBy: [{ issuedAt: 'desc' }, { version: 'desc' }],
    };
    const reports = await prisma.report.findMany(args);
    return reports.map(toReportRecord);
  } catch (error) { throwMappedDatabaseError(error, 'Report'); }
}

export async function readReportPdf(id: string): Promise<{ bytes: Uint8Array; filename: string }> {
  try {
    const report = await prisma.report.findUnique({
      where: { id },
      include: reportPdfInclude,
    });
    if (!report || report.revokedAt) {
      throw new DatabaseNotFoundError('Report PDF not found');
    }
    assertEligible(report.session);
    const verificationUrl = publicVerificationUrl(report.qrVerificationId);
    const bytes = await renderR76ReportPdf(reportData(report, report.session, verificationUrl));
    return { bytes, filename: `${report.referenceNumber}-v${report.version}-qr.pdf` };
  } catch (error) {
    if (error instanceof ReportEligibilityError) throw error;
    logServerError('[report.service] In-memory report rendering failed', error);
    throwMappedDatabaseError(error, 'Report');
  }
}
