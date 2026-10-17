import { describe, it, expect } from 'vitest';
import {
  validateEccentricLoad,
  isEccentricObservationValid,
  evaluateEccentricPosition,
  evaluateEccentricLoadingTest,
  checkEccentricCompleteness,
  calculatePrescribedEccentricLoad,
} from './eccentricity';
import {
  checkWeighingCompleteness,
  evaluateWeighingPerformanceTest,
} from './weighing';
import { evaluateInstrumentCompliance, OverallOutcome } from '../engine';
import { AccuracyClass, Instrument, InstrumentType, IndicationType, ZeroSettingMechanism } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestOutcome } from '../types/results';
import { renderR76ReportPdf, type R76ReportData } from '@/lib/reports/r76-report-pdf';

describe('Audit Defect Regression Suite (Metrify Type Evaluation PDF Defects)', () => {
  // Common 30 kg instrument fixture matching the audit scenario
  const inst30kg: Instrument = {
    id: 'inst-audit-30kg',
    manufacturer: 'AuditMetrology',
    model: 'TypeEval-30',
    accuracyClass: AccuracyClass.III,
    max: 30,
    min: 0.1,
    e: 0.01,
    d: 0.01,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: false,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: InstrumentType.SingleRange,
    indicationType: IndicationType.Digital,
    zeroSettingMechanisms: [ZeroSettingMechanism.SemiAutomatic],
  };

  const context = VerificationContext.TypeEvaluation;

  // ─── 1. ECCENTRIC LOADING: Over-Capacity (35 kg on Max 30 kg) ─────────────
  describe('Defect 1: Max 30 kg, eccentric load 35 kg is INVALID', () => {
    it('rejects eccentric test load exceeding instrument Max capacity', () => {
      const validation = validateEccentricLoad(35, inst30kg);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('exceeds instrument Max capacity (30 kg)');
    });

    it('marks observation with 35 kg as invalid', () => {
      const obs = {
        positionId: '1',
        appliedLoad: 35,
        indicatedValue: 35,
        additionalLoad: 0.005,
        zeroError: 0,
        autoZeroOrTrackingDisabled: false,
      };
      expect(isEccentricObservationValid(obs, inst30kg)).toBe(false);
    });

    it('throws error when evaluating single position with over-capacity load', () => {
      const obs = {
        positionId: '1',
        appliedLoad: 35,
        indicatedValue: 35,
        additionalLoad: 0.005,
        zeroError: 0,
        autoZeroOrTrackingDisabled: false,
      };
      expect(() => evaluateEccentricPosition(obs, inst30kg, context, false))
        .toThrow(/exceeds instrument Max capacity/);
    });

    it('does not allow 4 over-capacity observations to satisfy position completeness or produce PASS', () => {
      const fourOverCapacityObs = [
        { positionId: '1', appliedLoad: 35, indicatedValue: 35, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
        { positionId: '2', appliedLoad: 35, indicatedValue: 35, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
        { positionId: '3', appliedLoad: 35, indicatedValue: 35, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
        { positionId: '4', appliedLoad: 35, indicatedValue: 35, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
      ];

      const completeness = checkEccentricCompleteness(fourOverCapacityObs, inst30kg);
      expect(completeness.isComplete).toBe(false);
      expect(completeness.testedPositionsCount).toBe(0);
      expect(completeness.missingPositionsCount).toBe(4);
      expect(completeness.message).toContain('exceeds instrument Max capacity');

      // evaluateEccentricLoadingTest throws on invalid observations
      expect(() => evaluateEccentricLoadingTest(fourOverCapacityObs, inst30kg, context, false))
        .toThrow(/exceeds instrument Max capacity/);
    });
  });

  // ─── 2. ECCENTRIC LOADING: Prescribed Load Mismatch (10 kg vs 35 kg) ───────
  describe('Defect 2: Prescribed load 10 kg, actual 35 kg is INVALID', () => {
    it('calculates prescribed eccentric test load as exactly 10 kg (1/3 Max)', () => {
      const prescribed = calculatePrescribedEccentricLoad(inst30kg);
      expect(prescribed).toBe(10);
    });

    it('rejects actual load 35 kg when prescribed load is 10 kg', () => {
      const validation = validateEccentricLoad(35, inst30kg);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toMatch(/exceeds instrument Max capacity|does not match prescribed test load/);
    });

    it('rejects load mismatch even on higher capacity instrument (e.g. Max 60 kg, prescribed 20 kg, load 35 kg)', () => {
      const inst60kg: Instrument = { ...inst30kg, max: 60 };
      const prescribed60 = calculatePrescribedEccentricLoad(inst60kg);
      expect(prescribed60).toBe(20);

      const validation = validateEccentricLoad(35, inst60kg);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('does not match prescribed test load 20 kg');
    });

    it('accepts correct prescribed load 10 kg within OIML R76 scale interval tolerance', () => {
      const validation = validateEccentricLoad(10, inst30kg);
      expect(validation.isValid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('does not invent arbitrary percentage tolerance (e.g. rejects 12 kg or 8 kg on a 10 kg prescribed load)', () => {
      expect(validateEccentricLoad(12, inst30kg).isValid).toBe(false);
      expect(validateEccentricLoad(8, inst30kg).isValid).toBe(false);
    });
  });

  // ─── 3. ECCENTRIC LOADING: Missing Positions ───────────────────────────────
  describe('Defect 3: Missing eccentric positions is INCOMPLETE', () => {
    it('marks test INCOMPLETE when fewer than 4 positions tested on 4-point instrument', () => {
      const incompleteObs = [
        { positionId: '1', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
        { positionId: '2', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
      ];

      const completeness = checkEccentricCompleteness(incompleteObs, inst30kg);
      expect(completeness.isComplete).toBe(false);
      expect(completeness.testedPositionsCount).toBe(2);
      expect(completeness.missingPositionsCount).toBe(2);
      expect(completeness.missingPositions).toContain('3');
      expect(completeness.missingPositions).toContain('4');

      // With requireComplete = false, returns Incomplete outcome (never Pass)
      const res = evaluateEccentricLoadingTest(incompleteObs, inst30kg, context, false, false);
      expect(res.outcome).toBe(TestOutcome.Incomplete);

      // With requireComplete = true (default), throws completeness error
      expect(() => evaluateEccentricLoadingTest(incompleteObs, inst30kg, context, false, true))
        .toThrow(/Incomplete eccentric loading test/);
    });
  });

  // ─── 4. WEIGHING PERFORMANCE: Sequence Ordering ────────────────────────────
  describe('Defect 4: Incorrect weighing sequence is INCOMPLETE; preserves repeated points', () => {
    // 10 distinct loads for Type Evaluation:
    // Min=0.1, transition 500e=5, 2000e=20, Max=30
    const validLoadsInc = [0.1, 1, 2, 5, 10, 15, 20, 25, 28, 30];
    const validLoadsDec = [30, 28, 25, 20, 15, 10, 5, 2, 1, 0.1];

    it('passes complete, properly ordered increasing and decreasing sequence', () => {
      const properlyOrderedObs = [
        ...validLoadsInc.map((load, idx) => ({
          sequenceIndex: idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'increasing' as const,
        })),
        ...validLoadsDec.map((load, idx) => ({
          sequenceIndex: validLoadsInc.length + idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'decreasing' as const,
        })),
      ];

      const completeness = checkWeighingCompleteness(properlyOrderedObs, inst30kg, context);
      expect(completeness.isComplete).toBe(true);
      expect(completeness.increasingOrdered).toBe(true);
      expect(completeness.decreasingOrdered).toBe(true);
      expect(completeness.sequencePhasingValid).toBe(true);

      const res = evaluateWeighingPerformanceTest(properlyOrderedObs, inst30kg, context);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });

    it('rejects out-of-order increasing sequence (Annex A.4.4.1 violation)', () => {
      // 10 kg applied, then 5 kg, then 15 kg (out of order!)
      const outOfOrderIncLoads = [0.1, 1, 2, 10, 5, 15, 20, 25, 28, 30];
      const outOfOrderObs = [
        ...outOfOrderIncLoads.map((load, idx) => ({
          sequenceIndex: idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'increasing' as const,
        })),
        ...validLoadsDec.map((load, idx) => ({
          sequenceIndex: outOfOrderIncLoads.length + idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'decreasing' as const,
        })),
      ];

      const completeness = checkWeighingCompleteness(outOfOrderObs, inst30kg, context);
      expect(completeness.isComplete).toBe(false);
      expect(completeness.increasingOrdered).toBe(false);
      expect(completeness.missingRequirements.some(r => r.includes('Increasing loading sequence is incorrectly ordered'))).toBe(true);

      const res = evaluateWeighingPerformanceTest(outOfOrderObs, inst30kg, context);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
    });

    it('rejects out-of-order decreasing sequence (Annex A.4.4.1 violation)', () => {
      // 20 kg removed, then 25 kg (load increases during unloading!)
      const outOfOrderDecLoads = [30, 28, 20, 25, 15, 10, 5, 2, 1, 0.1];
      const outOfOrderObs = [
        ...validLoadsInc.map((load, idx) => ({
          sequenceIndex: idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'increasing' as const,
        })),
        ...outOfOrderDecLoads.map((load, idx) => ({
          sequenceIndex: validLoadsInc.length + idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'decreasing' as const,
        })),
      ];

      const completeness = checkWeighingCompleteness(outOfOrderObs, inst30kg, context);
      expect(completeness.isComplete).toBe(false);
      expect(completeness.decreasingOrdered).toBe(false);
      expect(completeness.missingRequirements.some(r => r.includes('Decreasing unloading sequence is incorrectly ordered'))).toBe(true);

      const res = evaluateWeighingPerformanceTest(outOfOrderObs, inst30kg, context);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
    });

    it('preserves legitimate repeated load points (L_{i+1} == L_i)', () => {
      // 10 distinct load points with repeated points at transition 5 kg and Max 30 kg
      const repeatedLoadsInc = [0.1, 1, 2, 5, 5, 10, 15, 20, 25, 28, 30, 30];
      const repeatedLoadsDec = [30, 30, 28, 25, 20, 15, 10, 5, 5, 2, 1, 0.1];
      const repeatedObs = [
        ...repeatedLoadsInc.map((load, idx) => ({
          sequenceIndex: idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'increasing' as const,
        })),
        ...repeatedLoadsDec.map((load, idx) => ({
          sequenceIndex: repeatedLoadsInc.length + idx,
          load,
          indicatedValue: load,
          additionalLoad: 0.005,
          zeroError: 0,
          loadingDirection: 'decreasing' as const,
        })),
      ];

      const completeness = checkWeighingCompleteness(repeatedObs, inst30kg, context);
      expect(completeness.isComplete).toBe(true);
      expect(completeness.increasingOrdered).toBe(true);
      expect(completeness.decreasingOrdered).toBe(true);
      expect(completeness.sequencePhasingValid).toBe(true);

      const res = evaluateWeighingPerformanceTest(repeatedObs, inst30kg, context);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });

    it('rejects sequence phasing violation (decreasing unloaded before increasing sequence is complete)', () => {
      // Interleaved: inc, dec, inc, dec...
      const interleavedObs = [
        { sequenceIndex: 0, load: 1, indicatedValue: 1, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const },
        { sequenceIndex: 1, load: 1, indicatedValue: 1, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'decreasing' as const },
        { sequenceIndex: 2, load: 5, indicatedValue: 5, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const },
        { sequenceIndex: 3, load: 5, indicatedValue: 5, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'decreasing' as const },
      ];

      const completeness = checkWeighingCompleteness(interleavedObs, inst30kg, context);
      expect(completeness.sequencePhasingValid).toBe(false);
      expect(completeness.isComplete).toBe(false);
      expect(completeness.missingRequirements.some(r => r.includes('sequence order violated'))).toBe(true);
    });
  });

  // ─── 5. MISSING REQUIRED TESTS: Discrimination missing ────────────────────
  describe('Defect 5: Required discrimination test missing is explicitly INCOMPLETE', () => {
    it('evaluates overall compliance as INCOMPLETE when discrimination is omitted for digital NAWI', () => {
      const evaluation = evaluateInstrumentCompliance(
        inst30kg,
        context,
        {
          weighingPerformance: [
            ...[0.1, 1, 2, 5, 10, 15, 20, 25, 28, 30].map((load, idx) => ({
              sequenceIndex: idx,
              load,
              indicatedValue: load,
              additionalLoad: 0.005,
              zeroError: 0,
              loadingDirection: 'increasing' as const,
            })),
            ...[30, 28, 25, 20, 15, 10, 5, 2, 1, 0.1].map((load, idx) => ({
              sequenceIndex: 10 + idx,
              load,
              indicatedValue: load,
              additionalLoad: 0.005,
              zeroError: 0,
              loadingDirection: 'decreasing' as const,
            })),
          ],
          eccentricLoading: [
            { positionId: '1', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
            { positionId: '2', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
            { positionId: '3', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
            { positionId: '4', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
          ],
          repeatability: {
            autoZeroOrTrackingActive: false,
            series: [
              { seriesNumber: 1, testLoad: 15, indications: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15] },
              { seriesNumber: 2, testLoad: 28, indications: [28, 28, 28, 28, 28, 28, 28, 28, 28, 28] },
            ],
          },
          // discrimination is MISSING
          zeroSettingAccuracy: { load: 0, indicatedValue: 0, additionalLoad: 0.005 },
        }
      );

      expect(evaluation.overallOutcome).toBe(OverallOutcome.Incomplete);
      const discrim = evaluation.evaluatedTests.find(t => t.testType === 'discrimination');
      expect(discrim?.status).toBe('incomplete');
    });

    it('renders PDF with explicit INCOMPLETE testing notice when discrimination is not performed', async () => {
      const reportData: R76ReportData = {
        reportId: 'rep-audit-incomplete-01',
        referenceNumber: 'NAWI-2026-INCOMPLETE01',
        issuedAt: '2026-10-12T12:00:00.000Z',
        verificationUrl: 'https://verify.example.org/verify/audit-01',
        session: {
          id: 'session-audit-01',
          status: 'APPROVED',
          verificationContext: 'TYPE_EVALUATION',
          createdAt: '2026-10-10T09:00:00.000Z',
          completedAt: '2026-10-12T11:00:00.000Z',
          technician: { name: 'Audit Technician' },
          reviewer: { name: 'Audit Reviewer' },
          approver: { name: 'Audit Approver' },
          rulesetVersion: { standard: 'OIML R 76-1', version: '2006' },
          instrument: {
            model: 'TypeEval-30',
            serialNumber: 'SN-30-001',
            accuracyClass: 'III',
            instrumentType: 'SINGLE_RANGE',
            indicationType: 'digital',
            zeroSettingMechanisms: [],
            max: '30',
            min: '0.1',
            e: '0.01',
            d: '0.01',
            numberOfSupportPoints: 4,
            additiveTareEffect: false,
            hasAutoZeroOrTracking: false,
            hasInitialZeroSettingDevice: false,
            initialZeroSettingRange: '0',
            hasFineDisplayDevice: false,
            manufacturer: { name: 'Metrology Lab', country: 'IN', registrationCode: 'IN-01' },
          },
          observations: [
            // Repeatability observed and failed
            {
              testType: 'REPEATABILITY',
              sequenceIndex: 0,
              observationData: { seriesNumber: 1, testLoad: 15, indications: [15.0, 15.08, 15.0] },
            },
          ],
          results: [
            // Repeatability failed
            {
              testType: 'REPEATABILITY',
              outcome: 'FAIL',
              maxAbsoluteError: '0.08',
              mpe: '0.01',
              repeatabilityRange: '0.08',
              r76Reference: 'R76-1 clause 3.6.1',
              explanation: 'Repeatability range 0.08 kg exceeds limit 0.01 kg',
              complianceTrace: {},
            },
          ],
          approvals: [
            {
              action: 'FINAL_APPROVE',
              comments: 'Testing session signed off administratively',
              createdAt: '2026-10-12T11:00:00.000Z',
              user: { name: 'Audit Approver', role: 'APPROVING_OFFICER' },
            },
          ],
        },
      };

      const pdfBytes = await renderR76ReportPdf(reportData);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);
    });
  });

  // ─── 6. TECHNICAL FAILURE: Genuine MPE failure produces FAIL ──────────────
  describe('Defect 6: Completed test with genuine MPE failure produces FAIL', () => {
    it('evaluates overall compliance as FAIL when repeatability exceeds permissible limit', () => {
      const evaluation = evaluateInstrumentCompliance(
        inst30kg,
        context,
        {
          weighingPerformance: [
            ...[0.1, 1, 2, 5, 10, 15, 20, 25, 28, 30].map((load, idx) => ({
              sequenceIndex: idx,
              load,
              indicatedValue: load,
              additionalLoad: 0.005,
              zeroError: 0,
              loadingDirection: 'increasing' as const,
            })),
            ...[30, 28, 25, 20, 15, 10, 5, 2, 1, 0.1].map((load, idx) => ({
              sequenceIndex: 10 + idx,
              load,
              indicatedValue: load,
              additionalLoad: 0.005,
              zeroError: 0,
              loadingDirection: 'decreasing' as const,
            })),
          ],
          eccentricLoading: [
            { positionId: '1', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
            { positionId: '2', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
            { positionId: '3', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
            { positionId: '4', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, autoZeroOrTrackingDisabled: false },
          ],
          // Genuine Repeatability MPE failure: difference between max and min indication is 0.05 kg >> MPE (0.01 kg)
          repeatability: {
            autoZeroOrTrackingActive: false,
            series: [
              { seriesNumber: 1, testLoad: 15, indications: [15.0, 15.05, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0] },
              { seriesNumber: 2, testLoad: 28, indications: [28, 28, 28, 28, 28, 28, 28, 28, 28, 28] },
            ],
          },
          discrimination: [
            { testLoad: 15, indicationBefore: 15, indicationAfter: 15.01 },
          ],
          zeroSettingAccuracy: { load: 0, indicatedValue: 0, additionalLoad: 0.005 },
        }
      );

      expect(evaluation.overallOutcome).toBe(OverallOutcome.Fail);
      expect(evaluation.explanation).toContain('Instrument FAILS compliance');
      const rep = evaluation.evaluatedTests.find(t => t.testType === 'repeatability');
      expect(rep?.status).toBe('failed');
    });

    it('renders PDF as NON-COMPLIANCE TEST REPORT for complete session with genuine failure', async () => {
      const completeFailReportData: R76ReportData = {
        reportId: 'rep-complete-fail-01',
        referenceNumber: 'NAWI-2026-FAILCOMPLETE',
        issuedAt: '2026-10-12T12:00:00.000Z',
        verificationUrl: 'https://verify.example.org/verify/fail-complete',
        session: {
          id: 'session-fail-complete',
          status: 'APPROVED',
          verificationContext: 'TYPE_EVALUATION',
          createdAt: '2026-10-10T09:00:00.000Z',
          completedAt: '2026-10-12T11:00:00.000Z',
          technician: { name: 'Audit Technician' },
          reviewer: { name: 'Audit Reviewer' },
          approver: { name: 'Audit Approver' },
          rulesetVersion: { standard: 'OIML R 76-1', version: '2006' },
          instrument: {
            model: 'TypeEval-30',
            serialNumber: 'SN-30-002',
            accuracyClass: 'III',
            instrumentType: 'SINGLE_RANGE',
            indicationType: 'digital',
            zeroSettingMechanisms: [],
            max: '30',
            min: '0.1',
            e: '0.01',
            d: '0.01',
            numberOfSupportPoints: 4,
            additiveTareEffect: false,
            hasAutoZeroOrTracking: false,
            hasInitialZeroSettingDevice: false,
            initialZeroSettingRange: '0',
            hasFineDisplayDevice: false,
            manufacturer: { name: 'Metrology Lab', country: 'IN', registrationCode: 'IN-01' },
          },
          observations: [
            { testType: 'WEIGHING_PERFORMANCE', sequenceIndex: 0, observationData: { load: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' } },
            { testType: 'ECCENTRIC_LOADING', sequenceIndex: 0, observationData: { positionId: '1', appliedLoad: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0 } },
            { testType: 'REPEATABILITY', sequenceIndex: 0, observationData: { seriesNumber: 1, testLoad: 15, indications: [15.0, 15.05, 15.0] } },
            { testType: 'DISCRIMINATION', sequenceIndex: 0, observationData: { testLoad: 15, indicationBefore: 15, indicationAfter: 15.01 } },
            { testType: 'ZERO_SETTING_ACCURACY', sequenceIndex: 0, observationData: { load: 0, indicatedValue: 0, additionalLoad: 0.0025 } },
          ],
          results: [
            { testType: 'WEIGHING_PERFORMANCE', outcome: 'PASS', maxAbsoluteError: '0.001', mpe: '0.01', repeatabilityRange: null, r76Reference: 'R76-1 Table 6', explanation: 'Pass', complianceTrace: {} },
            { testType: 'ECCENTRIC_LOADING', outcome: 'PASS', maxAbsoluteError: '0.001', mpe: '0.01', repeatabilityRange: null, r76Reference: 'R76-1 clause 3.6.2', explanation: 'Pass', complianceTrace: {} },
            { testType: 'REPEATABILITY', outcome: 'FAIL', maxAbsoluteError: '0.05', mpe: '0.01', repeatabilityRange: '0.05', r76Reference: 'R76-1 clause 3.6.1', explanation: 'Exceeded MPE', complianceTrace: {} },
            { testType: 'DISCRIMINATION', outcome: 'PASS', maxAbsoluteError: '0', mpe: '0.01', repeatabilityRange: null, r76Reference: 'R76-1 clause 3.8', explanation: 'Pass', complianceTrace: {} },
            { testType: 'ZERO_SETTING_ACCURACY', outcome: 'PASS', maxAbsoluteError: '0.001', mpe: '0.0025', repeatabilityRange: null, r76Reference: 'R76-1 A.4.2.3', explanation: 'Pass', complianceTrace: {} },
          ],
          approvals: [
            {
              action: 'FINAL_APPROVE',
              comments: 'Testing complete. Final Non-Compliance report approved.',
              createdAt: '2026-10-12T11:00:00.000Z',
              user: { name: 'Audit Approver', role: 'APPROVING_OFFICER' },
            },
          ],
        },
      };

      const pdfBytes = await renderR76ReportPdf(completeFailReportData);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);
    });
  });
});
