import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { reportMock, testSessionMock, transactionMock, renderMock, fsMock } = vi.hoisted(() => ({
  reportMock: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  testSessionMock: { findUnique: vi.fn() },
  transactionMock: vi.fn(),
  renderMock: vi.fn(),
  fsMock: { mkdir: vi.fn(), readFile: vi.fn(), stat: vi.fn(), unlink: vi.fn(), writeFile: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock, report: reportMock } }));
vi.mock('@/lib/reports/r76-report-pdf', () => ({ renderR76ReportPdf: renderMock }));
vi.mock('node:fs/promises', () => fsMock);

import { instrumentConfigFingerprint } from '@/lib/db/observation-fingerprint';
import { DatabaseNotFoundError } from '@/lib/db/errors';
import { verificationUrlArtifactKey } from '@/lib/reports/public-verification-url';
import { logicalObservationFingerprint } from './result-freshness.service';
import { generateApprovedSessionReport, ReportEligibilityError } from './report.service';

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

const date = new Date('2026-09-07T10:00:00.000Z');
const decimal = (value: string) => ({ toString: () => value });
const observations = [
  { id: 'o-w', sessionId: 'session-1', testType: 'WEIGHING_PERFORMANCE', sequenceIndex: 0, observationData: { sequenceIndex: 0, load: 10, indicatedValue: 10, additionalLoad: 0, zeroError: 0, loadingDirection: 'increasing' }, observationFingerprint: null, createdAt: date },
  { id: 'o-r', sessionId: 'session-1', testType: 'REPEATABILITY', sequenceIndex: 0, observationData: { testLoad: 10, indications: [10, 10, 10], autoZeroOrTrackingActive: false }, observationFingerprint: null, createdAt: date },
  { id: 'o-e', sessionId: 'session-1', testType: 'ECCENTRIC_LOADING', sequenceIndex: 0, observationData: { positionId: '1', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0, zeroError: 0, autoZeroOrTrackingDisabled: true }, observationFingerprint: null, createdAt: date },
];

const instrument = {
  id: 'instrument-1', manufacturerId: 'manufacturer-1', model: 'Model A', serialNumber: 'SN-1',
  accuracyClass: 'III', instrumentType: 'SINGLE_RANGE', max: decimal('100'), min: decimal('0.2'),
  e: decimal('0.01'), d: decimal('0.01'), numberOfSupportPoints: 4, additiveTareEffect: false,
  hasAutoZeroOrTracking: false, hasInitialZeroSettingDevice: false, initialZeroSettingRange: decimal('0'),
  hasFineDisplayDevice: false, registeredById: null, createdAt: date, updatedAt: date,
  manufacturer: { id: 'manufacturer-1', name: 'Metrology Works', country: 'IN', registrationCode: 'MW-1', createdAt: date, updatedAt: date },
};

function currentResults() {
  const config = instrumentConfigFingerprint(instrument as never, 'INITIAL_VERIFICATION');
  return ['WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRIC_LOADING'].map((testType, index) => {
    const rows = observations.filter(item => item.testType === testType);
    return {
      id: `result-${index}`, sessionId: 'session-1', testType, outcome: 'PASS',
      maxAbsoluteError: decimal('0'), mpe: decimal('0.01'), repeatabilityRange: testType === 'REPEATABILITY' ? decimal('0') : null,
      r76Reference: `Persisted reference ${testType}`, explanation: `Persisted explanation ${testType}`,
      rulesetVersionId: 'ruleset-1', complianceTrace: { references: [], calculationSteps: [], comparison: { formula: 'stored', substituted: 'stored', passed: true } },
      evaluatedObservationFingerprint: logicalObservationFingerprint(rows), evaluatedConfigFingerprint: config, createdAt: date,
    };
  });
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1', instrumentId: 'instrument-1', verificationContext: 'INITIAL_VERIFICATION', status: 'APPROVED',
    rulesetVersionId: 'ruleset-1', technicianId: 'tech-1', reviewerId: 'reviewer-1', approverId: 'approver-1',
    notes: null, createdAt: date, updatedAt: date, completedAt: date, instrument,
    rulesetVersion: { id: 'ruleset-1', standard: 'OIML R76-1', version: '2006', effectiveDate: date, notes: null, isActive: true, createdAt: date },
    technician: { id: 'tech-1', name: 'Technician', role: 'LAB_TECHNICIAN' },
    reviewer: { id: 'reviewer-1', name: 'Reviewer', role: 'REVIEWING_OFFICER' },
    approver: { id: 'approver-1', name: 'Approver', role: 'APPROVING_OFFICER' },
    observations, results: currentResults(),
    approvals: [{ id: 'approval-1', sessionId: 'session-1', userId: 'approver-1', action: 'FINAL_APPROVE', comments: 'Approved', createdAt: date, user: { id: 'approver-1', name: 'Approver', role: 'APPROVING_OFFICER' } }],
    ...overrides,
  };
}

const report = {
  id: 'report-1', sessionId: 'session-1', referenceNumber: 'NAWI-2026-ABC', humanReadablePath: null,
  machineReadablePath: null, digitalSignatureMetadata: null, qrVerificationId: 'qr-public-1', version: 1,
  issuedAt: date, updatedAt: date, revokedAt: null,
};

describe('Report service unit tests (mocked Prisma and filesystem)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://sih-prototype-xi-eight.vercel.app';
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ testSession: testSessionMock, report: reportMock }));
    testSessionMock.findUnique.mockResolvedValue(session());
    reportMock.findFirst.mockResolvedValue(null);
    reportMock.create.mockResolvedValue(report);
    const artifactKey = verificationUrlArtifactKey(report.qrVerificationId);
    reportMock.update.mockResolvedValue({ ...report, humanReadablePath: `output/pdf/NAWI-2026-ABC-v1-qr-${artifactKey}.pdf` });
    renderMock.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]));
    fsMock.stat.mockRejectedValue(new Error('missing'));
    fsMock.unlink.mockResolvedValue(undefined);
  });

  it('loads all report content authoritatively and generates an approved report', async () => {
    const result = await generateApprovedSessionReport('session-1');
    expect(result).toMatchObject({ id: 'report-1', pdfUrl: '/api/reports/report-1/pdf' });
    expect(testSessionMock.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session-1' },
      include: expect.objectContaining({ instrument: expect.anything(), observations: expect.anything(), results: expect.anything(), approvals: expect.anything() }),
    }));
    expect(renderMock).toHaveBeenCalledWith(expect.objectContaining({
      verificationUrl: 'https://sih-prototype-xi-eight.vercel.app/verify/qr-public-1',
      session: expect.objectContaining({ instrument: expect.objectContaining({ model: 'Model A' }), results: expect.any(Array), approvals: expect.any(Array) }),
    }));
    expect(fsMock.writeFile).toHaveBeenCalledOnce();
  });

  it('rejects a non-approved session', async () => {
    testSessionMock.findUnique.mockResolvedValue(session({ status: 'PENDING_APPROVAL' }));
    await expect(generateApprovedSessionReport('session-1')).rejects.toBeInstanceOf(ReportEligibilityError);
    expect(reportMock.create).not.toHaveBeenCalled();
  });

  it('rejects missing, stale, and conflicting persisted results', async () => {
    testSessionMock.findUnique.mockResolvedValueOnce(session({ results: currentResults().slice(0, 2) }));
    await expect(generateApprovedSessionReport('session-1')).rejects.toThrow(/MISSING/);
    const stale = currentResults(); stale[0].evaluatedObservationFingerprint = 'stale';
    testSessionMock.findUnique.mockResolvedValueOnce(session({ results: stale }));
    await expect(generateApprovedSessionReport('session-1')).rejects.toThrow(/STALE/);
    const conflict = [...currentResults(), { ...currentResults()[0], id: 'duplicate' }];
    testSessionMock.findUnique.mockResolvedValueOnce(session({ results: conflict }));
    await expect(generateApprovedSessionReport('session-1')).rejects.toThrow(/CONFLICT/);
  });

  it('maps a nonexistent session to not found', async () => {
    testSessionMock.findUnique.mockResolvedValue(null);
    await expect(generateApprovedSessionReport('missing')).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('reuses an existing report and file without creating a duplicate', async () => {
    const artifactKey = verificationUrlArtifactKey(report.qrVerificationId);
    const existing = { ...report, humanReadablePath: `output/pdf/NAWI-2026-ABC-v1-qr-${artifactKey}.pdf` };
    reportMock.findFirst.mockResolvedValue(existing);
    fsMock.stat.mockResolvedValue({ isFile: () => true });
    await expect(generateApprovedSessionReport('session-1')).resolves.toMatchObject({ id: 'report-1' });
    expect(reportMock.create).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it('replaces an old-origin PDF without creating a new report or version', async () => {
    const existing = { ...report, humanReadablePath: 'output/pdf/NAWI-2026-ABC-v1-qr.pdf' };
    reportMock.findFirst.mockResolvedValue(existing);
    await expect(generateApprovedSessionReport('session-1')).resolves.toMatchObject({
      id: 'report-1',
      version: 1,
    });
    expect(reportMock.create).not.toHaveBeenCalled();
    expect(reportMock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'report-1' },
    }));
    expect(fsMock.unlink).toHaveBeenCalledWith(expect.stringContaining('NAWI-2026-ABC-v1-qr.pdf'));
  });
});

afterAll(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});
