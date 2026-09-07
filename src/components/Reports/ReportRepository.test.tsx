import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ReportRepositoryRecord } from '@/lib/services/report.service';
import { ReportRepository, reportActionUrls } from './ReportRepository';

const report: ReportRepositoryRecord = {
  id: 'report/internal id', sessionId: 'session-1', referenceNumber: 'NAWI-2026-001', version: 2,
  issuedAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z', revokedAt: null,
  pdfUrl: '/api/reports/report%2Finternal%20id/pdf', verificationUrl: 'https://example.test/verify/public-qr-id',
  manufacturer: 'Acme Metrology', instrumentModel: 'Model X', instrumentType: 'SINGLE_RANGE',
  accuracyClass: 'III', complianceOutcome: 'PASS',
};

describe('Report repository presentation', () => {
  it('constructs existing view, download, and public verification action URLs', () => {
    expect(reportActionUrls(report)).toEqual({
      viewPdf: '/api/reports/report%2Finternal%20id/pdf',
      downloadPdf: '/api/reports/report%2Finternal%20id/pdf?download=1',
      verifyReport: 'https://example.test/verify/public-qr-id',
    });
  });
  it('shows report and instrument metadata with all active actions', () => {
    const html = renderToStaticMarkup(<ReportRepository reports={[report]} />);
    expect(html).toContain('NAWI-2026-001'); expect(html).toContain('Version 2');
    expect(html).toContain('Acme Metrology'); expect(html).toContain('Model X'); expect(html).toContain('Active');
    expect(html).toContain('View PDF'); expect(html).toContain('Download PDF'); expect(html).toContain('Verify Report');
  });
  it('marks revoked reports and disables their protected PDF actions', () => {
    const html = renderToStaticMarkup(<ReportRepository reports={[{ ...report, revokedAt: '2026-09-08T00:00:00.000Z', pdfUrl: null }]} />);
    expect(html).toContain('Revoked'); expect(html).not.toContain('href="/api/reports/');
    expect(html).toContain('href="https://example.test/verify/public-qr-id"');
  });
});
