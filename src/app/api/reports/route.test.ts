import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({ serviceMock: { generateApprovedSessionReport: vi.fn(), listReports: vi.fn() } }));
vi.mock('@/lib/services/report.service', () => serviceMock);

import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { GET, POST } from './route';

const report = { id: 'report-1', sessionId: 'session-1', referenceNumber: 'NAWI-2026-001', version: 1, issuedAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z', revokedAt: null, pdfUrl: '/api/reports/report-1/pdf', verificationUrl: 'https://sih-prototype-xi-eight.vercel.app/verify/qr-public-1' };
const post = (body: unknown) => new Request('http://localhost/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('Report collection route unit tests', () => {
  beforeEach(() => vi.clearAllMocks());
  it('generates a report from only a trimmed session ID', async () => {
    serviceMock.generateApprovedSessionReport.mockResolvedValue(report);
    const response = await POST(post({ testSessionId: ' session-1 ' }));
    expect(response.status).toBe(201);
    expect(serviceMock.generateApprovedSessionReport).toHaveBeenCalledWith('session-1');
  });
  it('rejects malformed and invalid payloads', async () => {
    expect((await POST(new Request('http://localhost/api/reports', { method: 'POST', body: '{bad' }))).status).toBe(400);
    expect((await POST(post({ testSessionId: ' ' }))).status).toBe(400);
  });
  it('maps eligibility/freshness conflicts to 409', async () => {
    serviceMock.generateApprovedSessionReport.mockRejectedValue(new DatabaseConflictError('Results stale'));
    expect((await POST(post({ testSessionId: 'session-1' }))).status).toBe(409);
  });
  it('maps missing sessions to 404 and unexpected errors safely', async () => {
    serviceMock.generateApprovedSessionReport.mockRejectedValueOnce(new DatabaseNotFoundError('TestSession not found'));
    expect((await POST(post({ testSessionId: 'missing' }))).status).toBe(404);
    serviceMock.generateApprovedSessionReport.mockRejectedValueOnce(new Error('private'));
    expect(await (await POST(post({ testSessionId: 'session-1' }))).json()).toEqual({ error: 'Internal server error' });
  });
  it('lists reports by trimmed session ID', async () => {
    serviceMock.listReports.mockResolvedValue([report]);
    const response = await GET(new Request('http://localhost/api/reports?testSessionId=%20session-1%20'));
    expect(response.status).toBe(200);
    expect(serviceMock.listReports).toHaveBeenCalledWith('session-1');
  });
});
