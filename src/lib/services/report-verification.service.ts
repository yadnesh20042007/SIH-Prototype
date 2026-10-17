import type { Prisma } from '@prisma/client';

import { DatabaseNotFoundError, throwMappedDatabaseError } from '@/lib/db/errors';
import { prisma } from '@/lib/prisma';

const publicVerificationInclude = {
  session: {
    include: {
      instrument: { include: { manufacturer: true } },
      rulesetVersion: true,
      results: { select: { testType: true, outcome: true } },
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
export type PublicComplianceResult = 'PASS' | 'FAIL' | 'REQUIRES_RETEST' | 'INCOMPLETE' | 'NOT_AVAILABLE';

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

import { selectTests } from '@/lib/r76/test-selection/engine';
import { normalizeVerificationContext, VerificationContext } from '@/lib/r76/types';

export function determinePersistedComplianceOutcome(report: PublicReport): PublicComplianceResult {
  const results = report.session.results;
  if (!results.length) return 'NOT_AVAILABLE';
  if (results.some(r => r.outcome === 'FAIL')) return 'FAIL';
  if (results.some(r => r.outcome === 'REQUIRES_RETEST')) return 'REQUIRES_RETEST';

  const instrument = report.session.instrument;
  let context: VerificationContext = VerificationContext.InitialVerification;
  try {
    if (report.session.verificationContext) {
      context = normalizeVerificationContext(report.session.verificationContext);
    }
  } catch {
    context = VerificationContext.InitialVerification;
  }

  const toNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val?.toNumber === 'function') return val.toNumber();
    if (typeof val?.toString === 'function') return Number(val.toString());
    return Number(val);
  };

  let selection: any[] = [];
  try {
    selection = selectTests({
      ...instrument,
      instrumentType: instrument.instrumentType ? (instrument.instrumentType.toLowerCase() as any) : 'single_range',
      indicationType: instrument.indicationType ? (instrument.indicationType.toLowerCase() as any) : undefined,
      zeroSettingMechanisms: Array.isArray(instrument.zeroSettingMechanisms)
        ? instrument.zeroSettingMechanisms.map((m: string) => m.toLowerCase() as any)
        : [],
      e: toNum(instrument.e),
      d: toNum(instrument.d),
      min: toNum(instrument.min),
      max: toNum(instrument.max),
      numberOfSupportPoints: toNum(instrument.numberOfSupportPoints) || 4,
      additiveTareEffect: Boolean(instrument.additiveTareEffect),
      hasAutoZeroOrTracking: Boolean(instrument.hasAutoZeroOrTracking),
      hasInitialZeroSettingDevice: Boolean(instrument.hasInitialZeroSettingDevice),
      initialZeroSettingRange: toNum(instrument.initialZeroSettingRange),
      hasFineDisplayDevice: Boolean(instrument.hasFineDisplayDevice),
    } as any, context);
  } catch {
    return 'INCOMPLETE';
  }

  // If any applicable test is flagged for manual review or unsupported, it cannot be certified PASS
  const hasManualReview = selection.some(
    s => !s.isApplicable && (s.reason.toLowerCase().includes('unsupported') || s.reason.toLowerCase().includes('manual review'))
  );
  if (hasManualReview) return 'INCOMPLETE';

  const applicableTypes = new Set(
    selection.filter(s => s.isApplicable).map(s => s.testType.toUpperCase())
  );

  const completedPassTypes = new Set(
    results.filter(r => r.outcome === 'PASS' && r.testType).map(r => r.testType)
  );

  if (completedPassTypes.size > 0) {
    for (const requiredType of applicableTypes) {
      if (!completedPassTypes.has(requiredType)) {
        return 'INCOMPLETE';
      }
    }
    return 'PASS';
  }

  // Fallback for results records without testType populated
  if (results.length >= applicableTypes.size && results.every(r => r.outcome === 'PASS')) {
    return 'PASS';
  }

  return 'INCOMPLETE';
}

function persistedOverall(report: PublicReport): PublicComplianceResult {
  return determinePersistedComplianceOutcome(report);
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
