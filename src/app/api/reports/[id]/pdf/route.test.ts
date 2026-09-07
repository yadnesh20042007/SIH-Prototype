import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({ serviceMock: { readReportPdf: vi.fn() } }));
vi.mock('@/lib/services/report.service', () => serviceMock);

import { DatabaseNotFoundError } from '@/lib/db/errors';
import { GET } from './route';

describe('Report PDF route unit tests', () => {
  beforeEach(() => vi.clearAllMocks());
  it('serves a real PDF inline or as a download', async () => {
    serviceMock.readReportPdf.mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70, 45]), filename: 'report.pdf' });
    const inline = await GET(new Request('http://localhost/api/reports/report-1/pdf'), { params: Promise.resolve({ id: 'report-1' }) });
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await inline.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
    const download = await GET(new Request('http://localhost/api/reports/report-1/pdf?download=1'), { params: Promise.resolve({ id: 'report-1' }) });
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(serviceMock.readReportPdf).toHaveBeenNthCalledWith(1, 'report-1');
    expect(serviceMock.readReportPdf).toHaveBeenNthCalledWith(2, 'report-1');
  });
  it('returns 404 without leaking storage details', async () => {
    serviceMock.readReportPdf.mockRejectedValue(new DatabaseNotFoundError('Report PDF not found'));
    expect((await GET(new Request('http://localhost/api/reports/missing/pdf'), { params: Promise.resolve({ id: 'missing' }) })).status).toBe(404);
  });
});
