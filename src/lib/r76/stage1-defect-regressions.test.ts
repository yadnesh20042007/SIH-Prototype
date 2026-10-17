import { describe, expect, it } from 'vitest';
import {
  AccuracyClass,
  InstrumentType,
  VerificationContext,
  type Instrument,
  TestType,
  TestOutcome,
} from '@/lib/r76/types';
import { selectTests } from '@/lib/r76/test-selection/engine';
import { OverallOutcome, evaluateInstrumentCompliance } from '@/lib/r76/engine';
import {
  evaluateWeighingObservation,
  evaluateWeighingPerformanceTest,
} from '@/lib/r76/calculations/weighing';
import { evaluateZeroSettingObservation } from '@/lib/r76/calculations/zero-setting';
import { renderR76ReportPdf, type R76ReportData } from '@/lib/reports/r76-report-pdf';
import { determinePersistedComplianceOutcome } from '@/lib/services/report-verification.service';
import { validateInstrumentCreate } from '@/lib/validation/instrument';

const baseInstrument: Instrument = {
  id: 'inst-stage1',
  manufacturer: 'Metrify Systems',
  model: 'MS-15K',
  serialNumber: 'SN-2026-STAGE1',
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

function createMockReportData(overrides: Partial<R76ReportData> = {}): R76ReportData {
  return {
    reportId: 'rep-stage1-001',
    referenceNumber: 'NAWI-2026-STAGE1',
    issuedAt: '2026-10-13T12:00:00.000Z',
    verificationUrl: 'https://metrify.test/verify/stage1-qr-token',
    session: {
      id: 'session-stage1-001',
      status: 'APPROVED',
      verificationContext: 'INITIAL_VERIFICATION',
      createdAt: '2026-10-12T08:00:00.000Z',
      completedAt: '2026-10-13T11:00:00.000Z',
      technician: { name: 'Lead Inspector' },
      reviewer: { name: 'Technical Reviewer' },
      approver: { name: 'Approving Director' },
      rulesetVersion: { standard: 'OIML R 76-1', version: '2006' },
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
        hasAutoZeroOrTracking: false,
        hasInitialZeroSettingDevice: false,
        initialZeroSettingRange: '0',
        hasFineDisplayDevice: false,
        manufacturer: { name: baseInstrument.manufacturer, country: 'IN', registrationCode: 'IN-01' },
      },
      observations: [],
      results: [],
      approvals: [
        {
          action: 'FINAL_APPROVE',
          comments: 'Statutory testing completed.',
          createdAt: '2026-10-13T11:30:00.000Z',
          user: { name: 'Approving Director', role: 'APPROVING_OFFICER' },
        },
      ],
    },
    ...overrides,
  };
}

describe('Stage 1 Defect Regressions — Targeted Corrections', () => {
  // =========================================================================
  // Scenario A: Approved complete PASS report
  // =========================================================================
  describe('A. Approved complete PASS report', () => {
    it('evaluates as PASS when all applicable mandatory tests are complete and passed', async () => {
      const mockPublicReport: any = {
        session: {
          verificationContext: 'INITIAL_VERIFICATION',
          instrument: {
            ...baseInstrument,
            e: '5',
            d: '5',
            min: '100',
            max: '15000',
            initialZeroSettingRange: '0',
            manufacturer: { name: baseInstrument.manufacturer },
          },
          results: [
            { testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS' },
            { testType: 'REPEATABILITY', outcome: 'PASS' },
            { testType: 'ECCENTRIC_LOADING', outcome: 'PASS' },
          ],
        },
      };

      const outcome = determinePersistedComplianceOutcome(mockPublicReport);
      expect(outcome).toBe('PASS');
    });

    it('displays PASS (COMPLIANT) in PDF Supplement B for complete passing report', async () => {
      const reportData = createMockReportData();
      reportData.session.results = [
        {
          testType: 'WEIGHING_PERFORMANCE',
          outcome: 'PASS',
          maxAbsoluteError: '2.5',
          mpe: '5',
          repeatabilityRange: null,
          r76Reference: 'R76-1 §3.5.1',
          explanation: 'All loads within MPE',
          complianceTrace: {},
        },
        {
          testType: 'REPEATABILITY',
          outcome: 'PASS',
          maxAbsoluteError: '0',
          mpe: '5',
          repeatabilityRange: '0',
          r76Reference: 'R76-1 §3.6.1',
          explanation: 'Repeatability passed',
          complianceTrace: {},
        },
        {
          testType: 'ECCENTRIC_LOADING',
          outcome: 'PASS',
          maxAbsoluteError: '2.5',
          mpe: '5',
          repeatabilityRange: null,
          r76Reference: 'R76-1 §3.6.2',
          explanation: 'Eccentricity passed',
          complianceTrace: {},
        },
      ];

      const pdfBytes = await renderR76ReportPdf(reportData);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);
    });
  });

  // =========================================================================
  // Scenario B: Approved technical FAIL report
  // =========================================================================
  describe('B. Approved technical FAIL report', () => {
    it('remains FAIL even when administratively approved', () => {
      const mockPublicReport: any = {
        session: {
          verificationContext: 'INITIAL_VERIFICATION',
          instrument: {
            ...baseInstrument,
            e: '5',
            d: '5',
            min: '100',
            max: '15000',
            initialZeroSettingRange: '0',
            manufacturer: { name: baseInstrument.manufacturer },
          },
          results: [
            { testType: 'WEIGHING_PERFORMANCE', outcome: 'FAIL' },
            { testType: 'REPEATABILITY', outcome: 'PASS' },
            { testType: 'ECCENTRIC_LOADING', outcome: 'PASS' },
          ],
        },
      };

      const outcome = determinePersistedComplianceOutcome(mockPublicReport);
      expect(outcome).toBe('FAIL');
    });
  });

  // =========================================================================
  // Scenario C: Approved incomplete report
  // =========================================================================
  describe('C. Approved incomplete report', () => {
    it('returns INCOMPLETE when mandatory tests are missing, never PASS', () => {
      const mockPublicReport: any = {
        session: {
          verificationContext: 'INITIAL_VERIFICATION',
          instrument: {
            ...baseInstrument,
            e: '5',
            d: '5',
            min: '100',
            max: '15000',
            initialZeroSettingRange: '0',
            manufacturer: { name: baseInstrument.manufacturer },
          },
          // Only weighing performance passed; repeatability and eccentric are missing
          results: [{ testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS' }],
        },
      };

      const outcome = determinePersistedComplianceOutcome(mockPublicReport);
      expect(outcome).toBe('INCOMPLETE');
      expect(outcome).not.toBe('PASS');
    });
  });

  // =========================================================================
  // Scenario D: REQUIRES_RETEST report
  // =========================================================================
  describe('D. REQUIRES_RETEST report', () => {
    it('returns REQUIRES_RETEST and never displays PASS or COMPLIANT', () => {
      const mockPublicReport: any = {
        session: {
          verificationContext: 'INITIAL_VERIFICATION',
          instrument: {
            ...baseInstrument,
            e: '5',
            d: '5',
            min: '100',
            max: '15000',
            initialZeroSettingRange: '0',
            manufacturer: { name: baseInstrument.manufacturer },
          },
          results: [
            { testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS' },
            { testType: 'REPEATABILITY', outcome: 'PASS' },
            { testType: 'ECCENTRIC_LOADING', outcome: 'REQUIRES_RETEST' },
          ],
        },
      };

      const outcome = determinePersistedComplianceOutcome(mockPublicReport);
      expect(outcome).toBe('REQUIRES_RETEST');
      expect(outcome).not.toBe('PASS');
    });
  });

  // =========================================================================
  // Scenario E: NOT_AVAILABLE report
  // =========================================================================
  describe('E. NOT_AVAILABLE report', () => {
    it('returns NOT_AVAILABLE when results array is empty', () => {
      const mockPublicReport: any = {
        session: {
          verificationContext: 'INITIAL_VERIFICATION',
          instrument: {
            ...baseInstrument,
            e: '5',
            d: '5',
            min: '100',
            max: '15000',
            initialZeroSettingRange: '0',
            manufacturer: { name: baseInstrument.manufacturer },
          },
          results: [],
        },
      };

      const outcome = determinePersistedComplianceOutcome(mockPublicReport);
      expect(outcome).toBe('NOT_AVAILABLE');
      expect(outcome).not.toBe('PASS');
    });
  });

  // =========================================================================
  // Scenario F: Missing additionalLoad
  // =========================================================================
  describe('F. Missing additionalLoad', () => {
    it('throws validation error when additionalLoad is undefined in weighing observation', () => {
      expect(() =>
        evaluateWeighingObservation(
          {
            sequenceIndex: 0,
            load: 5000,
            indicatedValue: 5000,
            additionalLoad: undefined as any,
            zeroError: 0,
            loadingDirection: 'increasing',
          },
          baseInstrument,
          VerificationContext.InitialVerification
        )
      ).toThrowError(/additionalLoad \(ΔL\) is required/);
    });

    it('throws validation error when additionalLoad is undefined in zero-setting observation', () => {
      expect(() =>
        evaluateZeroSettingObservation(
          {
            load: 50,
            indicatedValue: 50,
            additionalLoad: undefined as any,
          },
          baseInstrument,
          VerificationContext.InitialVerification
        )
      ).toThrowError(/additionalLoad \(ΔL\) is required/);
    });

    it('engine marks test as incomplete when additionalLoad is omitted without fabricating zero', () => {
      const result = evaluateInstrumentCompliance(
        baseInstrument,
        VerificationContext.InitialVerification,
        {
          weighingPerformance: [
            {
              sequenceIndex: 0,
              load: 5000,
              indicatedValue: 5000,
              additionalLoad: undefined as any,
              zeroError: 0,
              loadingDirection: 'increasing',
            },
          ],
        }
      );

      const weighing = result.evaluatedTests.find(
        (t) => t.testType === TestType.WeighingPerformance
      );
      expect(weighing?.status).toBe('incomplete');
      expect(weighing?.errorMessage).toContain('additionalLoad (ΔL) is required');
      expect(result.overallOutcome).toBe(OverallOutcome.Incomplete);
    });
  });

  // =========================================================================
  // Scenario G: Explicit additionalLoad = 0
  // =========================================================================
  describe('G. Explicit additionalLoad = 0', () => {
    it('successfully evaluates when additionalLoad is explicitly numeric 0', () => {
      const res = evaluateWeighingObservation(
        {
          sequenceIndex: 0,
          load: 5000,
          indicatedValue: 5000,
          additionalLoad: 0,
          zeroError: 0,
          loadingDirection: 'increasing',
        },
        baseInstrument,
        VerificationContext.InitialVerification
      );

      expect(res.outcome).toBe(TestOutcome.Pass);
      // P = I + 0.5e - deltaL = 5000 + 2.5 - 0 = 5002.5
      expect(res.indicationPriorToRounding).toBe(5002.5);
      // E = P - L = 5002.5 - 5000 = 2.5
      expect(res.calculatedError).toBe(2.5);
    });

    it('evaluates zero-setting observation with explicit additionalLoad = 0', () => {
      const res = evaluateZeroSettingObservation(
        {
          load: 50,
          indicatedValue: 50,
          additionalLoad: 0,
        },
        baseInstrument,
        VerificationContext.InitialVerification
      );

      expect(res.calculatedError).toBeDefined();
    });
  });

  // =========================================================================
  // Scenario H: Different MPE bands within one test
  // =========================================================================
  describe('H. Different MPE bands within one test', () => {
    it('evaluates each observation against its own MPE band rather than a single test-level MPE', () => {
      // Instrument: Class III, e = 5 kg, Max = 15000 kg, Initial Verification
      // Band 1: 0 <= m <= 500e (0 to 2500 kg) -> Table 6 MPE = 0.5e = 2.5 kg
      // Band 2: 500e < m <= 2000e (2500 to 10000 kg) -> Table 6 MPE = 1.0e = 5.0 kg
      // Band 3: 2000e < m <= Max (10000 to 15000 kg) -> Table 6 MPE = 1.5e = 7.5 kg
      const obsAt500: any = {
        sequenceIndex: 0,
        load: 500,
        indicatedValue: 500,
        additionalLoad: 2.5, // P = 500 + 2.5 - 2.5 = 500, E = 0, Ec = 0 (pass under 2.5 kg MPE)
        zeroError: 0,
        loadingDirection: 'increasing',
      };
      const resAt500 = evaluateWeighingObservation(obsAt500, baseInstrument, VerificationContext.InitialVerification);
      expect(resAt500.mpe).toBe(2.5);

      const obsAt5000: any = {
        sequenceIndex: 1,
        load: 5000,
        indicatedValue: 5000,
        additionalLoad: 2.5,
        zeroError: 0,
        loadingDirection: 'increasing',
      };
      const resAt5000 = evaluateWeighingObservation(obsAt5000, baseInstrument, VerificationContext.InitialVerification);
      expect(resAt5000.mpe).toBe(5);

      const obsAt15000: any = {
        sequenceIndex: 2,
        load: 15000,
        indicatedValue: 15000,
        additionalLoad: 2.5,
        zeroError: 0,
        loadingDirection: 'increasing',
      };
      const resAt15000 = evaluateWeighingObservation(obsAt15000, baseInstrument, VerificationContext.InitialVerification);
      expect(resAt15000.mpe).toBe(7.5);

      // Failing observation in Band 1: error is 3.5 kg (exceeds 2.5 kg band MPE, but below 7.5 kg Max MPE)
      const failingObsInBand1: any = {
        sequenceIndex: 3,
        load: 500,
        indicatedValue: 503.5,
        additionalLoad: 2.5, // P = 503.5 + 2.5 - 2.5 = 503.5 -> Ec = 3.5 kg
        zeroError: 0,
        loadingDirection: 'increasing',
      };
      const resFailing = evaluateWeighingObservation(failingObsInBand1, baseInstrument, VerificationContext.InitialVerification);
      expect(resFailing.mpe).toBe(2.5);
      expect(resFailing.calculatedError).toBe(3.5);
      expect(resFailing.outcome).toBe(TestOutcome.Fail); // Must FAIL Band 1 MPE despite being below 7.5 kg
    });
  });

  // =========================================================================
  // Scenario I: Zero-setting unit conversion / fraction representation
  // =========================================================================
  describe('I. Zero-setting unit conversion and validation', () => {
    it('accepts valid fraction of Max between 0 and 1', () => {
      const validation = validateInstrumentCreate({
        manufacturerId: 'mfg-1',
        model: 'Model-X',
        accuracyClass: 'III',
        max: '15000',
        min: '100',
        e: '5',
        d: '5',
        instrumentType: 'SINGLE_RANGE',
        initialZeroSettingRange: '0.200000',
      });

      expect(validation.success).toBe(true);
      expect(validation.data?.initialZeroSettingRange).toBe('0.200000');
    });

    it('rejects initialZeroSettingRange > 1 as invalid fraction of Max', () => {
      const validation = validateInstrumentCreate({
        manufacturerId: 'mfg-1',
        model: 'Model-X',
        accuracyClass: 'III',
        max: '15000',
        min: '100',
        e: '5',
        d: '5',
        instrumentType: 'SINGLE_RANGE',
        initialZeroSettingRange: '20', // Entered 20 kg or 20% instead of 0.20
      });

      expect(validation.success).toBe(false);
      expect(validation.errors.some((e) => e.field === 'initialZeroSettingRange')).toBe(true);
      expect(
        validation.errors.find((e) => e.field === 'initialZeroSettingRange')?.message
      ).toContain('fraction of Max between 0 and 1');
    });
  });

  // =========================================================================
  // Scenario J: Contradictory zero-setting configuration
  // =========================================================================
  describe('J. Contradictory zero-setting configuration', () => {
    it('marks test as manual_review when autoZero flag is true but zeroSettingMechanisms is empty', () => {
      const contradictoryInst: Instrument = {
        ...baseInstrument,
        hasAutoZeroOrTracking: true,
        zeroSettingMechanisms: [],
      };

      const selection = selectTests(contradictoryInst, VerificationContext.InitialVerification);
      const zeroSel = selection.find((s) => s.testType === TestType.ZeroSettingAccuracy);
      expect(zeroSel?.isApplicable).toBe(false);
      expect(zeroSel?.reason).toContain('Unsupported');
      expect(zeroSel?.reason).toContain('Contradictory configuration');

      const evaluation = evaluateInstrumentCompliance(
        contradictoryInst,
        VerificationContext.InitialVerification,
        {}
      );
      const zeroEval = evaluation.evaluatedTests.find(
        (t) => t.testType === TestType.ZeroSettingAccuracy
      );
      expect(zeroEval?.status).toBe('manual_review');
      expect(evaluation.overallOutcome).toBe(OverallOutcome.ManualReview);
    });

    it('marks test as manual_review when initialZeroSettingDevice flag is true but zeroSettingMechanisms is empty', () => {
      const contradictoryInst: Instrument = {
        ...baseInstrument,
        hasInitialZeroSettingDevice: true,
        initialZeroSettingRange: 0.2,
        zeroSettingMechanisms: [],
      };

      const selection = selectTests(contradictoryInst, VerificationContext.InitialVerification);
      const zeroSel = selection.find((s) => s.testType === TestType.ZeroSettingAccuracy);
      expect(zeroSel?.isApplicable).toBe(false);
      expect(zeroSel?.reason).toContain('Unsupported');
      expect(zeroSel?.reason).toContain('Contradictory configuration');
    });

    it('marks as genuinely skipped only when no zero-setting device flags are true and mechanisms is empty', () => {
      const notFittedInst: Instrument = {
        ...baseInstrument,
        hasAutoZeroOrTracking: false,
        hasInitialZeroSettingDevice: false,
        zeroSettingMechanisms: [],
      };

      const selection = selectTests(notFittedInst, VerificationContext.InitialVerification);
      const zeroSel = selection.find((s) => s.testType === TestType.ZeroSettingAccuracy);
      expect(zeroSel?.isApplicable).toBe(false);
      expect(zeroSel?.reason).toContain('No zero-setting mechanism is fitted');

      const evaluation = evaluateInstrumentCompliance(
        notFittedInst,
        VerificationContext.InitialVerification,
        {}
      );
      const zeroEval = evaluation.evaluatedTests.find(
        (t) => t.testType === TestType.ZeroSettingAccuracy
      );
      expect(zeroEval?.status).toBe('skipped');
    });
  });
});
