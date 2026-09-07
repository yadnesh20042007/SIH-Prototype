import QRCode from 'qrcode';
import { describe, expect, it, vi } from 'vitest';
import { renderR76ReportPdf, type R76ReportData } from './r76-report-pdf';

const trace = { references: [], calculationSteps: [], comparison: { formula: 'stored', substituted: 'stored', passed: true } };
const data: R76ReportData = {
  reportId: 'internal-report-id',
  referenceNumber: 'NAWI-2026-001',
  issuedAt: '2026-09-07T10:00:00.000Z',
  verificationUrl: 'https://reports.example.test/verify/public-qr-token',
  session: {
    id: 'internal-session-id', status: 'APPROVED', verificationContext: 'INITIAL_VERIFICATION',
    createdAt: '2026-09-06T10:00:00.000Z', completedAt: '2026-09-07T09:00:00.000Z',
    technician: { name: 'Technician' }, reviewer: { name: 'Reviewer' }, approver: { name: 'Approver' },
    rulesetVersion: { standard: 'OIML R76-1', version: '2006' },
    instrument: { model: 'Model A', serialNumber: null, accuracyClass: 'III', instrumentType: 'SINGLE_RANGE', max: '30', min: '0.2', e: '0.01', d: '0.005', numberOfSupportPoints: 4, additiveTareEffect: false, hasAutoZeroOrTracking: false, hasInitialZeroSettingDevice: false, initialZeroSettingRange: '0', hasFineDisplayDevice: false, manufacturer: { name: 'Maker', country: null, registrationCode: null } },
    observations: [],
    results: ['WEIGHING_PERFORMANCE', 'ECCENTRIC_LOADING', 'REPEATABILITY'].map(testType => ({ testType, outcome: 'PASS', maxAbsoluteError: '0', mpe: '0.01', repeatabilityRange: testType === 'REPEATABILITY' ? '0' : null, r76Reference: 'Persisted reference', explanation: 'Persisted explanation', complianceTrace: trace })),
    approvals: [{ action: 'FINAL_APPROVE', comments: null, createdAt: '2026-09-07T09:00:00.000Z', user: { name: 'Approver', role: 'APPROVING_OFFICER' } }],
  },
};

describe('R76 report PDF QR integration', () => {
  it('generates and embeds a QR from the public verification URL', async () => {
    const qrSpy = vi.spyOn(QRCode, 'toBuffer');
    const pdf = await renderR76ReportPdf(data);
    expect(qrSpy).toHaveBeenCalledWith(
      'https://reports.example.test/verify/public-qr-token',
      expect.objectContaining({ type: 'png', errorCorrectionLevel: 'H' })
    );
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(qrSpy.mock.calls[0][0]).not.toContain('internal-report-id');
    qrSpy.mockRestore();
  });
});
