import { beforeEach, describe, expect, it, vi } from 'vitest';


const { requireApiUser } = vi.hoisted(() => ({ requireApiUser: vi.fn() }));
vi.mock('@/lib/auth/api-access', () => ({
  requireApiUser,
  technicianOwnsSession: vi.fn(async () => true),
  technicianOwnsObservation: vi.fn(async () => true),
  technicianOwnsResult: vi.fn(async () => true),
  forbiddenOwnership: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
}));
const { serviceMock } = vi.hoisted(() => ({ serviceMock: { generateApprovedSessionReport: vi.fn(), listReports: vi.fn() } }));
vi.mock('@/lib/services/report.service', () => serviceMock);

import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { GET, POST } from './route';

const report = { id: 'report-1', sessionId: 'session-1', referenceNumber: 'NAWI-2026-001', version: 1, issuedAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z', revokedAt: null, pdfUrl: '/api/reports/report-1/pdf', verificationUrl: 'https://sih-prototype-xi-eight.vercel.app/verify/qr-public-1' };
const post = (body: unknown) => new Request('http://localhost/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('Report collection route unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiUser.mockResolvedValue({ authorized: true, user: { id: 'authenticated-user', name: 'Authenticated User', email: 'user@example.test', role: 'ADMIN' } });
  });
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
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serviceMock.generateApprovedSessionReport.mockRejectedValueOnce(new DatabaseNotFoundError('TestSession not found'));
    expect((await POST(post({ testSessionId: 'missing' }))).status).toBe(404);
    serviceMock.generateApprovedSessionReport.mockRejectedValueOnce(new Error('private'));
    const response = await POST(post({ testSessionId: 'session-1' }));
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(errorLog).toHaveBeenCalledWith(
      '[api/reports] Unexpected generate failure',
      expect.objectContaining({ name: 'Error', message: 'private', stack: expect.any(String) })
    );
    errorLog.mockRestore();
  });
  it('lists reports by trimmed session ID', async () => {
    serviceMock.listReports.mockResolvedValue([report]);
    const response = await GET(new Request('http://localhost/api/reports?testSessionId=%20session-1%20'));
    expect(response.status).toBe(200);
    expect(serviceMock.listReports).toHaveBeenCalledWith({ testSessionId: 'session-1', query: undefined, state: 'ACTIVE' });
  });
  it.each(['LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN'])('allows authenticated %s repository access', async (role) => {
    requireApiUser.mockResolvedValue({ authorized: true, user: { id: 'user-1', name: 'User', email: 'user@example.test', role } });
    serviceMock.listReports.mockResolvedValue([]);
    expect((await GET(new Request('http://localhost/api/reports?state=ALL'))).status).toBe(200);
    expect(requireApiUser).toHaveBeenCalledWith(['LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN']);
  });
  it('passes server-side search and revoked filters to the service', async () => {
    serviceMock.listReports.mockResolvedValue([]);
    await GET(new Request('http://localhost/api/reports?q=%20Acme%20&state=REVOKED'));
    expect(serviceMock.listReports).toHaveBeenCalledWith({ testSessionId: undefined, query: 'Acme', state: 'REVOKED' });
  });
  it('rejects invalid state filters', async () => {
    expect((await GET(new Request('http://localhost/api/reports?state=DELETED'))).status).toBe(400);
    expect(serviceMock.listReports).not.toHaveBeenCalled();
  });
  it('blocks unauthenticated repository access', async () => {
    requireApiUser.mockResolvedValue({ authorized: false, response: Response.json({ error: 'Authentication required' }, { status: 401 }) });
    expect((await GET(new Request('http://localhost/api/reports'))).status).toBe(401);
    expect(serviceMock.listReports).not.toHaveBeenCalled();
  });
});
