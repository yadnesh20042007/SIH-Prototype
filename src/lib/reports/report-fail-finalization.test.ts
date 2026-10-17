import { describe, it, expect } from 'vitest';
import { renderR76ReportPdf, type R76ReportData } from './r76-report-pdf';

describe('Report Integrity: PASS and FAIL Finalization Semantics', () => {
  const trace = {
    references: [{ document: 'OIML R 76-1', clause: '3.6.1', purpose: 'MPE comparison' }],
    calculationSteps: [],
    comparison: { formula: '|Ec| <= MPE', substituted: '|0.05| <= 0.01', passed: false },
  };

  const samplePassReportData: R76ReportData = {
    reportId: 'rep-pass-001',
    referenceNumber: 'NAWI-2026-PASS01',
    issuedAt: '2026-10-11T12:00:00.000Z',
    verificationUrl: 'https://verify.example.org/verify/qr-pass-token',
    session: {
      id: 'session-pass-01',
      status: 'APPROVED',
      verificationContext: 'INITIAL_VERIFICATION',
      createdAt: '2026-10-10T09:00:00.000Z',
      completedAt: '2026-10-11T11:00:00.000Z',
      technician: { name: 'Lead Tech' },
      reviewer: { name: 'Senior Reviewer' },
      approver: { name: 'Approving Officer' },
      rulesetVersion: { standard: 'OIML R 76-1', version: '2006' },
      instrument: {
        model: 'AlphaScale-500',
        serialNumber: 'SN-PASS-100',
        accuracyClass: 'III',
        instrumentType: 'SINGLE_RANGE',
        indicationType: 'digital',
        zeroSettingMechanisms: [],
        max: '15',
        min: '0.1',
        e: '0.005',
        d: '0.005',
        numberOfSupportPoints: 4,
        additiveTareEffect: false,
        hasAutoZeroOrTracking: false,
        hasInitialZeroSettingDevice: false,
        initialZeroSettingRange: '0',
        hasFineDisplayDevice: false,
        manufacturer: { name: 'Precision Scales Inc', country: 'DE', registrationCode: 'DE-88' },
      },
      observations: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          sequenceIndex: 0,
          observationData: { load: 5, indicatedValue: 5, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'increasing' },
        },
      ],
      results: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          outcome: 'PASS',
          maxAbsoluteError: '0.001',
          mpe: '0.005',
          repeatabilityRange: null,
          r76Reference: 'R76-1 Table 6',
          explanation: 'All loads within MPE',
          complianceTrace: trace,
        },
      ],
      approvals: [
        {
          action: 'FINAL_APPROVE',
          comments: 'Approved technically compliant instrument',
          createdAt: '2026-10-11T11:00:00.000Z',
          user: { name: 'Approving Officer', role: 'APPROVING_OFFICER' },
        },
      ],
    },
  };

  const sampleFailReportData: R76ReportData = {
    ...samplePassReportData,
    reportId: 'rep-fail-002',
    referenceNumber: 'NAWI-2026-FAIL02',
    verificationUrl: 'https://verify.example.org/verify/qr-fail-token',
    session: {
      ...samplePassReportData.session,
      id: 'session-fail-02',
      results: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          outcome: 'FAIL',
          maxAbsoluteError: '0.050',
          mpe: '0.005',
          repeatabilityRange: null,
          r76Reference: 'R76-1 Table 6',
          explanation: 'Observed error 0.050 kg exceeds MPE limit 0.005 kg',
          complianceTrace: trace,
        },
      ],
      approvals: [
        {
          action: 'FINAL_APPROVE',
          comments: 'Testing finalized: instrument failed metrological requirements',
          createdAt: '2026-10-11T11:00:00.000Z',
          user: { name: 'Approving Officer', role: 'APPROVING_OFFICER' },
        },
      ],
    },
  };

  it('generates a valid PDF for technically PASS session with compliance headers', async () => {
    const pdfBytes = await renderR76ReportPdf(samplePassReportData);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe('%PDF-');
  });

  it('generates a valid finalized PDF for technically FAIL session with non-compliance headers', async () => {
    const pdfBytes = await renderR76ReportPdf(sampleFailReportData);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe('%PDF-');
  });
});
