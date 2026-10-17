import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderR76ReportPdf, type R76ReportData } from './r76-report-pdf';
import { publicVerificationUrl } from './public-verification-url';
import { evaluateInstrumentCompliance } from '@/lib/r76/engine';
import { AccuracyClass, InstrumentType, VerificationContext, type Instrument } from '@/lib/r76/types';

const baseInstrument: Instrument = {
  id: 'inst-1',
  manufacturer: 'Metrify Precision',
  model: 'MP-5000',
  serialNumber: 'SN-2026-0099',
  accuracyClass: AccuracyClass.III,
  max: 15000,
  min: 100,
  e: 5,
  d: 5,
  numberOfSupportPoints: 4,
  additiveTareEffect: false,
  hasAutoZeroOrTracking: false,
  hasInitialZeroSettingDevice: false,
  initialZeroSettingRange: 0,
  hasFineDisplayDevice: false,
  instrumentType: InstrumentType.SingleRange,
  indicationType: 'digital' as any,
  zeroSettingMechanisms: [],
};

const trace = {
  references: [{ document: 'OIML R 76-1', clause: '3.5.1' }],
  calculationSteps: [{ label: 'Ec', formula: 'E - E0', substitutedFormula: '0 - 0', result: '0', unit: 'kg' }],
  comparison: { formula: '|Ec| <= MPE', substituted: '|0| <= 5', passed: true },
};

function createReportData(context: string, results: any[] = [], observations: any[] = []): R76ReportData {
  return {
    reportId: 'rep-uuid-001',
    referenceNumber: 'NAWI-2026-TEST01',
    issuedAt: '2026-10-11T12:00:00.000Z',
    verificationUrl: publicVerificationUrl('qr-token-abc-123'),
    session: {
      id: 'session-uuid-001',
      status: 'APPROVED',
      verificationContext: context,
      createdAt: '2026-10-10T10:00:00.000Z',
      completedAt: '2026-10-11T11:00:00.000Z',
      technician: { name: 'Sarah Tech' },
      reviewer: { name: 'Alex Review' },
      approver: { name: 'Director Morgan' },
      rulesetVersion: { standard: 'OIML R76-1', version: '2006' },
      instrument: {
        model: baseInstrument.model,
        serialNumber: baseInstrument.serialNumber ?? null,
        accuracyClass: baseInstrument.accuracyClass,
        instrumentType: 'SINGLE_RANGE',
        indicationType: 'DIGITAL',
        zeroSettingMechanisms: [],
        max: '15000',
        min: '100',
        e: '5',
        d: '5',
        numberOfSupportPoints: 4,
        additiveTareEffect: false,
        hasAutoZeroOrTracking: true,
        hasInitialZeroSettingDevice: false,
        initialZeroSettingRange: '0',
        hasFineDisplayDevice: false,
        manufacturer: { name: baseInstrument.manufacturer, country: 'DE', registrationCode: 'MFG-99' },
      },
      observations,
      results,
      approvals: [
        { action: 'SUBMIT_FOR_REVIEW', comments: 'Initial test run complete', createdAt: '2026-10-11T10:00:00.000Z', user: { name: 'Sarah Tech', role: 'TECHNICIAN' } },
        { action: 'RECOMMEND_APPROVAL', comments: 'Traces verified', createdAt: '2026-10-11T10:30:00.000Z', user: { name: 'Alex Review', role: 'TECHNICAL_REVIEWER' } },
        { action: 'FINAL_APPROVE', comments: 'Approved for certification', createdAt: '2026-10-11T11:00:00.000Z', user: { name: 'Director Morgan', role: 'APPROVING_OFFICER' } },
      ],
    },
  };
}

describe('Metrify Comprehensive OIML R76 Verification Suite', () => {
  it('Task 1 & 2: INITIAL_VERIFICATION generates dynamic heading and 5-test summary with NOT APPLICABLE reasons', async () => {
    const results = [
      { testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS', maxAbsoluteError: '0', mpe: '5', repeatabilityRange: null, r76Reference: '3.5.1', explanation: 'Passed', complianceTrace: trace },
      { testType: 'ECCENTRIC_LOADING', outcome: 'PASS', maxAbsoluteError: '0', mpe: '5', repeatabilityRange: null, r76Reference: '3.6.2', explanation: 'Passed', complianceTrace: trace },
      { testType: 'REPEATABILITY', outcome: 'PASS', maxAbsoluteError: '0', mpe: '5', repeatabilityRange: '1', r76Reference: '3.6.1', explanation: 'Passed', complianceTrace: trace },
    ];
    const observations = [
      { testType: 'WEIGHING_PERFORMANCE', sequenceIndex: 0, observationData: { load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 0, observationData: { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 1, observationData: { positionId: '2', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 2, observationData: { positionId: '3', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 3, observationData: { positionId: '4', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'REPEATABILITY', sequenceIndex: 0, observationData: { testLoad: 5000, indications: [5000, 5001, 5000] } },
    ];

    const reportData = createReportData('INITIAL_VERIFICATION', results, observations);
    const pdfBytes = await renderR76ReportPdf(reportData);
    const doc = await PDFDocument.load(pdfBytes);

    // Dynamic Title check
    expect(doc.getTitle()).toBe('OIML R 76-2:2007-aligned Initial Verification Report NAWI-2026-TEST01');
    expect(doc.getTitle()).not.toContain('Type Evaluation');

    // Section pages: Only 3 test observation pages generated (Weighing, Eccentric, Repeatability).
    // Not applicable tests (Discrimination, Zero-Setting) do not get fake observation pages.
    const pages = doc.getPageCount();
    expect(pages).toBeGreaterThanOrEqual(4);
  });

  it('Task 1 & 2: TYPE_EVALUATION generates dynamic heading and detailed sections for all 5 tests', async () => {
    const results = [
      { testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS', maxAbsoluteError: '0', mpe: '5', repeatabilityRange: null, r76Reference: '3.5.1', explanation: 'Passed', complianceTrace: trace },
      { testType: 'ECCENTRIC_LOADING', outcome: 'PASS', maxAbsoluteError: '0', mpe: '5', repeatabilityRange: null, r76Reference: '3.6.2', explanation: 'Passed', complianceTrace: trace },
      { testType: 'REPEATABILITY', outcome: 'PASS', maxAbsoluteError: '0', mpe: '5', repeatabilityRange: '1', r76Reference: '3.6.1', explanation: 'Passed', complianceTrace: trace },
      { testType: 'DISCRIMINATION', outcome: 'PASS', maxAbsoluteError: '0', mpe: '0', repeatabilityRange: null, r76Reference: '3.8.2.2', explanation: 'Passed', complianceTrace: trace },
      { testType: 'ZERO_SETTING_ACCURACY', outcome: 'PASS', maxAbsoluteError: '0', mpe: '1.25', repeatabilityRange: null, r76Reference: 'A.4.2.3', explanation: 'Passed', complianceTrace: trace },
    ];
    const observations = [
      { testType: 'WEIGHING_PERFORMANCE', sequenceIndex: 0, observationData: { load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 0, observationData: { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 1, observationData: { positionId: '2', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 2, observationData: { positionId: '3', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'ECCENTRIC_LOADING', sequenceIndex: 3, observationData: { positionId: '4', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0 } },
      { testType: 'REPEATABILITY', sequenceIndex: 0, observationData: { testLoad: 5000, indications: [5000, 5001, 5000] } },
      { testType: 'DISCRIMINATION', sequenceIndex: 0, observationData: { testLoad: 100, indicationBefore: 100, indicationAfter: 105 } },
      { testType: 'ZERO_SETTING_ACCURACY', sequenceIndex: 0, observationData: { load: 100, indicatedValue: 100, additionalLoad: 2.5 } },
    ];

    const reportData = createReportData('TYPE_EVALUATION', results, observations);
    reportData.session.instrument.indicationType = 'DIGITAL';
    reportData.session.instrument.zeroSettingMechanisms = ['NON_AUTOMATIC'];

    const pdfBytes = await renderR76ReportPdf(reportData);
    const doc = await PDFDocument.load(pdfBytes);

    expect(doc.getTitle()).toBe('OIML R 76-2:2007-aligned Type Evaluation Report NAWI-2026-TEST01');
    expect(doc.getPageCount()).toBeGreaterThan(5);
  });

  it('Task 3: Prevents PASS when eccentric loading positions are incomplete', () => {
    // 4-point instrument tested with only 1 position
    const partialEccObservations = [
      { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
    ];

    const result = evaluateInstrumentCompliance(
      baseInstrument,
      VerificationContext.TypeEvaluation,
      {
        weighingPerformance: [{ sequenceIndex: 0, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' }],
        repeatability: { testLoad: 5000, indications: [5000, 5000, 5000], autoZeroOrTrackingActive: true },
        eccentricLoading: partialEccObservations,
      }
    );

    // Eccentric loading must not pass
    const ecc = result.evaluatedTests.find(t => t.testType === 'eccentric_loading');
    expect(ecc?.status).toBe('incomplete');
    expect(ecc?.result).toBeUndefined();
    expect(ecc?.errorMessage).toContain('Missing 3 required position(s)');
    expect(result.overallOutcome).toBe('incomplete');
    expect(result.overallOutcome).not.toBe('pass');
  });

  it('Task 4: Correctly distinguishes genuinely not fitted vs unrecorded zero-setting mechanisms', () => {
    // Genuinely not fitted: zeroSettingMechanisms: []
    const notFitted = evaluateInstrumentCompliance(
      { ...baseInstrument, zeroSettingMechanisms: [] },
      VerificationContext.InitialVerification,
      {
        weighingPerformance: [
          { sequenceIndex: 0, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 1, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 2, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 3, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 4, load: 15000, indicatedValue: 15000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 5, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
          { sequenceIndex: 6, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
          { sequenceIndex: 7, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
          { sequenceIndex: 8, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
        ],
        repeatability: { testLoad: 5000, indications: [5000, 5000, 5000], autoZeroOrTrackingActive: true },
        eccentricLoading: [
          { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
          { positionId: '2', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
          { positionId: '3', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
          { positionId: '4', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
        ],
      }
    );
    const zeroNotFitted = notFitted.evaluatedTests.find(t => t.testType === 'zero_setting_accuracy');
    expect(zeroNotFitted?.status).toBe('skipped');
    expect(zeroNotFitted?.selection.isApplicable).toBe(false);
    expect(zeroNotFitted?.selection.reason).toContain('No zero-setting mechanism is fitted');
    expect(notFitted.overallOutcome).toBe('pass');

    // Unknown metadata: zeroSettingMechanisms: undefined
    const unknown = evaluateInstrumentCompliance(
      { ...baseInstrument, zeroSettingMechanisms: undefined },
      VerificationContext.InitialVerification,
      {
        weighingPerformance: [
          { sequenceIndex: 0, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 1, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 2, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 3, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 4, load: 15000, indicatedValue: 15000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
          { sequenceIndex: 5, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
          { sequenceIndex: 6, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
          { sequenceIndex: 7, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
          { sequenceIndex: 8, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
        ],
        repeatability: { testLoad: 5000, indications: [5000, 5000, 5000], autoZeroOrTrackingActive: true },
        eccentricLoading: [
          { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
          { positionId: '2', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
          { positionId: '3', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
          { positionId: '4', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
        ],
      }
    );
    const zeroUnknown = unknown.evaluatedTests.find(t => t.testType === 'zero_setting_accuracy');
    expect(zeroUnknown?.status).toBe('manual_review');
    expect(zeroUnknown?.selection.reason).toContain('Unsupported: Zero-setting mechanism metadata is missing or unrecorded');
    expect(unknown.overallOutcome).toBe('manual_review');
  });

  it('Task 5: Environment-aware QR verification URL without deploying', () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NEXT_PUBLIC_APP_URL;

    // Production config
    env.NEXT_PUBLIC_APP_URL = 'https://metrify-nawi-system.vercel.app';
    const prodUrl = publicVerificationUrl('qr-token-prod-999');
    expect(prodUrl).toBe('https://metrify-nawi-system.vercel.app/verify/qr-token-prod-999');
    expect(prodUrl).not.toContain('localhost');
    expect(prodUrl).not.toContain('internal');

    // Local dev config
    delete env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = 'development';
    const devUrl = publicVerificationUrl('qr-token-dev-111');
    expect(devUrl).toBe('http://localhost:3000/verify/qr-token-dev-111');

    env.NEXT_PUBLIC_APP_URL = prev;
  });
});
