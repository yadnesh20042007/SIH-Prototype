import type { Prisma } from '@prisma/client';

import { DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';

const publicVerificationInclude = {
  session: {
    include: {
      instrument: { include: { manufacturer: true } },
      rulesetVersion: true,
      results: { select: { outcome: true } },
      approvals: {
        where: { action: 'FINAL_APPROVE' as const },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { createdAt: true },
      },
    },
  },
} satisfies Prisma.ReportInclude;

type PublicReport = Prisma.ReportGetPayload<{ include: typeof publicVerificationInclude }>;
export type PublicComplianceResult = 'PASS' | 'FAIL' | 'REQUIRES_RETEST' | 'NOT_AVAILABLE';

export interface PublicReportVerification {
  status: 'VERIFIED' | 'REVOKED' | 'NOT_VALID';
  valid: boolean;
  revoked: boolean;
  reportReference: string;
  reportVersion: number;
  manufacturer: string;
  model: string;
  instrumentType: string;
  accuracyClass: string;
  max: string;
  min: string;
  e: string;
  d: string;
  ruleset: string;
  complianceResult: PublicComplianceResult;
  approvalStatus: string;
  issuedAt: string;
  finalApprovalAt: string | null;
}

function persistedOverall(report: PublicReport): PublicComplianceResult {
  const outcomes = report.session.results.map(result => result.outcome);
  if (!outcomes.length) return 'NOT_AVAILABLE';
  if (outcomes.includes('FAIL')) return 'FAIL';
  if (outcomes.includes('REQUIRES_RETEST')) return 'REQUIRES_RETEST';
  return 'PASS';
}

export async function getPublicReportVerification(qrVerificationId: string): Promise<PublicReportVerification> {
  try {
    const report = await prisma.report.findUnique({
      where: { qrVerificationId },
      include: publicVerificationInclude,
    });
    if (!report) throw new DatabaseNotFoundError('Report not found');
    const revoked = report.revokedAt !== null;
    const valid = !revoked && report.session.status === 'APPROVED';
    const instrument = report.session.instrument;
    return {
      status: revoked ? 'REVOKED' : valid ? 'VERIFIED' : 'NOT_VALID',
      valid,
      revoked,
      reportReference: report.referenceNumber,
      reportVersion: report.version,
      manufacturer: instrument.manufacturer.name,
      model: instrument.model,
      instrumentType: instrument.instrumentType,
      accuracyClass: instrument.accuracyClass,
      max: instrument.max.toString(),
      min: instrument.min.toString(),
      e: instrument.e.toString(),
      d: instrument.d.toString(),
      ruleset: `${report.session.rulesetVersion.standard}:${report.session.rulesetVersion.version}`,
      complianceResult: persistedOverall(report),
      approvalStatus: report.session.status,
      issuedAt: report.issuedAt.toISOString(),
      finalApprovalAt: report.session.approvals[0]?.createdAt.toISOString() ?? report.session.completedAt?.toISOString() ?? null,
    };
  } catch (error) { throwMappedDatabaseError(error, 'Report'); }
}
