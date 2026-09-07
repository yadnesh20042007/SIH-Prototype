import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reportMock } = vi.hoisted(() => ({ reportMock: { findUnique: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: { report: reportMock } }));

import { DatabaseNotFoundError } from '@/lib/db/errors';
import { getPublicReportVerification } from './report-verification.service';

const date = new Date('2026-09-07T10:00:00.000Z');
const persisted = {
  id: 'internal-report-id', sessionId: 'internal-session-id', referenceNumber: 'NAWI-2026-001',
  humanReadablePath: 'private/path.pdf', machineReadablePath: null, digitalSignatureMetadata: { private: true },
  qrVerificationId: 'public-verification-id', version: 1, issuedAt: date, updatedAt: date, revokedAt: null,
  session: {
    id: 'internal-session-id', status: 'APPROVED', completedAt: date,
    instrument: {
      id: 'internal-instrument-id', model: 'Model A', instrumentType: 'SINGLE_RANGE', accuracyClass: 'III',
      max: { toString: () => '30' }, min: { toString: () => '0.2' }, e: { toString: () => '0.01' }, d: { toString: () => '0.005' },
      manufacturer: { id: 'internal-manufacturer-id', name: 'Yadnesh' },
    },
    rulesetVersion: { standard: 'OIML R76-1', version: '2006' },
    results: [{ outcome: 'PASS' }, { outcome: 'PASS' }, { outcome: 'PASS' }],
    approvals: [{ createdAt: date }],
  },
};

describe('Public report verification service unit tests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns safe persisted verification details for a valid public ID', async () => {
    reportMock.findUnique.mockResolvedValue(persisted);
    const result = await getPublicReportVerification('public-verification-id');
    expect(result).toMatchObject({ status: 'VERIFIED', valid: true, reportReference: 'NAWI-2026-001', manufacturer: 'Yadnesh', model: 'Model A', complianceResult: 'PASS', approvalStatus: 'APPROVED' });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('sessionId');
    expect(result).not.toHaveProperty('qrVerificationId');
    expect(result).not.toHaveProperty('fingerprint');
    expect(reportMock.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { qrVerificationId: 'public-verification-id' } }));
  });

  it('marks a revoked report as revoked and not valid', async () => {
    reportMock.findUnique.mockResolvedValue({ ...persisted, revokedAt: date });
    await expect(getPublicReportVerification('public-verification-id')).resolves.toMatchObject({ status: 'REVOKED', valid: false, revoked: true });
  });

  it('returns a safe not-found error for an unknown identifier', async () => {
    reportMock.findUnique.mockResolvedValue(null);
    await expect(getPublicReportVerification('unknown')).rejects.toBeInstanceOf(DatabaseNotFoundError);
  });

  it('derives presentation only from persisted result outcomes', async () => {
    reportMock.findUnique.mockResolvedValue({ ...persisted, session: { ...persisted.session, results: [{ outcome: 'PASS' }, { outcome: 'REQUIRES_RETEST' }] } });
    await expect(getPublicReportVerification('public-verification-id')).resolves.toMatchObject({ complianceResult: 'REQUIRES_RETEST' });
  });
});
