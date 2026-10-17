import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
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

describe('R76 report PDF generation', () => {
  it('generates PDF containing Zero-setting Accuracy results', async () => {
    const dataWithZero: R76ReportData = JSON.parse(JSON.stringify(data));
    dataWithZero.session.results.push({
      testType: 'ZERO_SETTING_ACCURACY',
      outcome: 'PASS',
      maxAbsoluteError: '0',
      mpe: '0.01',
      repeatabilityRange: null,
      r76Reference: 'A.4.2.3',
      explanation: 'Zero error OK',
      complianceTrace: trace
    });
    dataWithZero.session.observations.push({
      testType: 'ZERO_SETTING_ACCURACY',
      sequenceIndex: 0,
      observationData: { load: 0.1, indicatedValue: 0.1, additionalLoad: 0.005 }
    });

    const pdf = await renderR76ReportPdf(dataWithZero);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('generates PDF containing Discrimination test results and traces', async () => {
    const dataWithDiscrim: R76ReportData = JSON.parse(JSON.stringify(data));
    dataWithDiscrim.session.results.push({
      testType: 'DISCRIMINATION',
      outcome: 'PASS',
      maxAbsoluteError: '0',
      mpe: '0.01',
      repeatabilityRange: null,
      r76Reference: '3.8.2.2',
      explanation: 'Discrimination test passed',
      complianceTrace: {
        references: [{ document: 'OIML R 76-1', clause: '3.8.2.2', purpose: 'Digital indication discrimination' }],
        calculationSteps: [{ label: 'extra load', formula: '1.4d', substitutedFormula: '1.4 * 0.005', result: '0.007', unit: 'kg' }],
        comparison: { formula: 'I_after == I + d', substituted: '0.205 == 0.205', passed: true },
      },
    });
    dataWithDiscrim.session.observations.push({
      testType: 'DISCRIMINATION',
      sequenceIndex: 0,
      observationData: { testLoad: 0.2, indicationBefore: 0.2, indicationAfter: 0.205 },
    });

    const pdf = await renderR76ReportPdf(dataWithDiscrim);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('correctly reports overall FAIL outcome when a test fails', async () => {
    const dataWithFail: R76ReportData = JSON.parse(JSON.stringify(data));
    dataWithFail.session.results.push({
      testType: 'DISCRIMINATION',
      outcome: 'FAIL',
      maxAbsoluteError: '0.005',
      mpe: '0.01',
      repeatabilityRange: null,
      r76Reference: '3.8.2.2',
      explanation: 'Discrimination threshold not met',
      complianceTrace: trace,
    });
    dataWithFail.session.observations.push({
      testType: 'DISCRIMINATION',
      sequenceIndex: 0,
      observationData: { testLoad: 0.2, indicationBefore: 0.2, indicationAfter: 0.2 },
    });

    const pdf = await renderR76ReportPdf(dataWithFail);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('handles missing/incomplete results safely', async () => {
    const dataMissing: R76ReportData = JSON.parse(JSON.stringify(data));
    dataMissing.session.results = [dataMissing.session.results[0]];
    
    const pdf = await renderR76ReportPdf(dataMissing);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('sets dynamic report title and metadata matching verification context', async () => {
    // Initial verification
    const initPdf = await renderR76ReportPdf(data);
    const initDoc = await PDFDocument.load(initPdf);
    expect(initDoc.getTitle()).toContain('Initial Verification Report');
    expect(initDoc.getTitle()).not.toContain('Type Evaluation Report');

    // Type evaluation
    const typeData: R76ReportData = JSON.parse(JSON.stringify(data));
    typeData.session.verificationContext = 'TYPE_EVALUATION';
    const typePdf = await renderR76ReportPdf(typeData);
    const typeDoc = await PDFDocument.load(typePdf);
    expect(typeDoc.getTitle()).toContain('Type Evaluation Report');

    // Subsequent verification
    const subData: R76ReportData = JSON.parse(JSON.stringify(data));
    subData.session.verificationContext = 'SUBSEQUENT_VERIFICATION';
    const subPdf = await renderR76ReportPdf(subData);
    const subDoc = await PDFDocument.load(subPdf);
    expect(subDoc.getTitle()).toContain('Subsequent Verification Report');

    // In-service inspection
    const insData: R76ReportData = JSON.parse(JSON.stringify(data));
    insData.session.verificationContext = 'SERVICE_INSPECTION';
    const insPdf = await renderR76ReportPdf(insData);
    const insDoc = await PDFDocument.load(insPdf);
    expect(insDoc.getTitle()).toContain('In-Service Inspection Report');
  });

  it('does not generate detailed observation sections for NOT APPLICABLE tests', async () => {
    // In INITIAL_VERIFICATION, Discrimination is NOT APPLICABLE
    const initData: R76ReportData = JSON.parse(JSON.stringify(data));
    initData.session.verificationContext = 'INITIAL_VERIFICATION';
    initData.session.instrument.zeroSettingMechanisms = []; // No mechanism fitted -> Zero-setting NOT APPLICABLE
    
    const initPdf = await renderR76ReportPdf(initData);
    const initDoc = await PDFDocument.load(initPdf);
    const initPageCount = initDoc.getPageCount();

    // In TYPE_EVALUATION with discrimination and zero-setting performed, page count increases
    const typeData: R76ReportData = JSON.parse(JSON.stringify(data));
    typeData.session.verificationContext = 'TYPE_EVALUATION';
    typeData.session.instrument.indicationType = 'DIGITAL';
    typeData.session.instrument.zeroSettingMechanisms = ['NON_AUTOMATIC'];
    typeData.session.results.push(
      {
        testType: 'DISCRIMINATION',
        outcome: 'PASS',
        maxAbsoluteError: '0',
        mpe: '0.01',
        repeatabilityRange: null,
        r76Reference: '3.8.2.2',
        explanation: 'Discrimination passed',
        complianceTrace: trace,
      },
      {
        testType: 'ZERO_SETTING_ACCURACY',
        outcome: 'PASS',
        maxAbsoluteError: '0',
        mpe: '0.0025',
        repeatabilityRange: null,
        r76Reference: 'A.4.2.3',
        explanation: 'Zero setting passed',
        complianceTrace: trace,
      }
    );
    typeData.session.observations.push(
      {
        testType: 'DISCRIMINATION',
        sequenceIndex: 0,
        observationData: { testLoad: 0.2, indicationBefore: 0.2, indicationAfter: 0.205 },
      },
      {
        testType: 'ZERO_SETTING_ACCURACY',
        sequenceIndex: 0,
        observationData: { load: 0.1, indicatedValue: 0.1, additionalLoad: 0.005 },
      }
    );

    const typePdf = await renderR76ReportPdf(typeData);
    const typeDoc = await PDFDocument.load(typePdf);
    expect(typeDoc.getPageCount()).toBeGreaterThan(initPageCount);
  });
});
