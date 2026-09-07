import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({ serviceMock: { getPublicReportVerification: vi.fn() } }));
vi.mock('@/lib/services/report-verification.service', () => serviceMock);

import { DatabaseNotFoundError } from '@/lib/db/errors';
import { GET } from './route';

const publicRecord = { status: 'VERIFIED', valid: true, revoked: false, reportReference: 'NAWI-2026-001', reportVersion: 1, manufacturer: 'Maker', model: 'M1', instrumentType: 'SINGLE_RANGE', accuracyClass: 'III', max: '30', min: '0.2', e: '0.01', d: '0.005', ruleset: 'OIML R76-1:2006', complianceResult: 'PASS', approvalStatus: 'APPROVED', issuedAt: '2026-09-07T10:00:00.000Z', finalApprovalAt: '2026-09-07T09:00:00.000Z' };

describe('Public report verification route unit tests', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns only the safe public verification representation', async () => {
    serviceMock.getPublicReportVerification.mockResolvedValue(publicRecord);
    const response = await GET(new Request('http://localhost/api/reports/verify/public-id'), { params: Promise.resolve({ qrVerificationId: 'public-id' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(publicRecord);
    expect(serviceMock.getPublicReportVerification).toHaveBeenCalledWith('public-id');
  });
  it('returns the same clean 404 for empty and unknown identifiers', async () => {
    expect((await GET(new Request('http://localhost'), { params: Promise.resolve({ qrVerificationId: ' ' }) })).status).toBe(404);
    serviceMock.getPublicReportVerification.mockRejectedValue(new DatabaseNotFoundError('Report not found'));
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ qrVerificationId: 'unknown' }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Report not found' });
  });
});
