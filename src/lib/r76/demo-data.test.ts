import { describe, expect, it } from 'vitest';
import { AccuracyClass, InstrumentType, VerificationContext } from './types';
import {
  generateWeighingPerformanceDemo,
  generateRepeatabilityDemo,
  generateEccentricLoadingDemo,
  generateDiscriminationDemo,
  generateZeroSettingDemo,
  generateAllDemoData,
  hasWeighingReadings,
  hasRepeatabilityReadings,
  hasEccentricReadings,
  hasDiscriminationReadings,
  hasZeroSettingReadings,
  type DemoInstrumentConfig,
} from './demo-data';
import {
  evaluateWeighingPerformanceTest,
  validateWeighingLoadInput,
} from './calculations/weighing';
import { evaluateRepeatabilityTest } from './calculations/repeatability';
import {
  evaluateEccentricLoadingTest,
  validateEccentricLoad,
} from './calculations/eccentricity';
import { evaluateDiscriminationTest } from './calculations/discrimination';
import { evaluateZeroSettingTest } from './calculations/zero-setting';
import { evaluateInstrumentCompliance } from './engine';
import { TestOutcome } from './types/results';
import { TestType } from './types/test';
import { validateTestObservationCreate } from '../validation/test-observation';

describe('Demo Data Generation Suite for OIML R 76-1 Test Modules', () => {
  // Base configuration: Class III retail/industrial scale (Max: 30 kg, Min: 0.2 kg, e: 0.01 kg, d: 0.005 kg)
  const baseScale: DemoInstrumentConfig = {
    accuracyClass: AccuracyClass.III,
    max: 30,
    min: 0.2,
    e: 0.01,
    d: 0.005,
    numberOfSupportPoints: 4,
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: true,
    initialZeroSettingRange: 0.04,
    hasFineDisplayDevice: false,
    instrumentType: 'SINGLE_RANGE',
    indicationType: 'DIGITAL',
    zeroSettingMechanisms: ['SEMI_AUTOMATIC'],
  };

  // Heavy laboratory balance: Class II (Max: 15 kg, Min: 0.05 kg, e: 0.001 kg, d: 0.001 kg)
  const classIIScale: DemoInstrumentConfig = {
    accuracyClass: AccuracyClass.II,
    max: 15,
    min: 0.05,
    e: 0.001,
    d: 0.001,
    numberOfSupportPoints: 4,
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: 'SINGLE_RANGE',
    indicationType: 'DIGITAL',
    zeroSettingMechanisms: ['AUTOMATIC'],
  };

  // High capacity industrial platform: Class III (Max: 15000 kg, Min: 100 kg, e: 5 kg, d: 5 kg)
  const industrialPlatform: DemoInstrumentConfig = {
    accuracyClass: AccuracyClass.III,
    max: 15000,
    min: 100,
    e: 5,
    d: 5,
    numberOfSupportPoints: 4,
    hasAutoZeroOrTracking: false,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: 'SINGLE_RANGE',
    indicationType: 'DIGITAL',
    zeroSettingMechanisms: ['NON_AUTOMATIC'],
  };

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 1: WEIGHING PERFORMANCE
  // ──────────────────────────────────────────────────────────────────────────
  describe('Module 1: Weighing Performance Demo Generation', () => {
    it('populates at least 10 distinct test loads for Type Evaluation with increasing & decreasing sequences', () => {
      const res = generateWeighingPerformanceDemo(baseScale, VerificationContext.TypeEvaluation);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      const rows = res.data!;
      // Verify no field is left empty
      for (const row of rows) {
        expect(row.load.trim()).not.toBe('');
        expect(row.indicatedValue.trim()).not.toBe('');
        expect(row.additionalLoad.trim()).not.toBe('');
        expect(row.zeroError.trim()).not.toBe('');
        expect(['increasing', 'decreasing']).toContain(row.loadingDirection);
      }

      // Check minimum reading counts: 10 increasing + 10 decreasing = 20 observations
      const inc = rows.filter((r) => r.loadingDirection === 'increasing');
      const dec = rows.filter((r) => r.loadingDirection === 'decreasing');
      expect(inc.length).toBeGreaterThanOrEqual(10);
      expect(dec.length).toBeGreaterThanOrEqual(10);

      // Verify distinct loads >= 10
      const distinct = new Set(inc.map((r) => Number(r.load)));
      expect(distinct.size).toBeGreaterThanOrEqual(10);

      // Verify Min and Max coverage
      const minLoad = Math.min(...Array.from(distinct));
      const maxLoad = Math.max(...Array.from(distinct));
      expect(minLoad).toBe(Number(baseScale.min));
      expect(maxLoad).toBe(Number(baseScale.max));

      // Validate all load inputs against application validation rules
      for (const r of rows) {
        const val = validateWeighingLoadInput(r.load, {
          min: Number(baseScale.min),
          max: Number(baseScale.max),
        });
        expect(val.isValid).toBe(true);
      }

      // Evaluate through the real calculation engine
      const instObj: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
      };
      const obsPayload = rows.map((r, idx) => ({
        sequenceIndex: idx,
        load: Number(r.load),
        indicatedValue: Number(r.indicatedValue),
        additionalLoad: Number(r.additionalLoad),
        zeroError: Number(r.zeroError),
        loadingDirection: r.loadingDirection,
      }));

      const evalResult = evaluateWeighingPerformanceTest(
        obsPayload,
        instObj,
        VerificationContext.TypeEvaluation
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
      expect(evalResult.completeness?.isComplete).toBe(true);
      expect(evalResult.completeness?.missingRequirements).toHaveLength(0);
      expect(evalResult.observationResults.every((o) => o.outcome === TestOutcome.Pass)).toBe(true);
    });

    it('populates at least 5 distinct test loads for Initial Verification', () => {
      const res = generateWeighingPerformanceDemo(industrialPlatform, VerificationContext.InitialVerification);
      expect(res.success).toBe(true);
      const rows = res.data!;

      const inc = rows.filter((r) => r.loadingDirection === 'increasing');
      const distinct = new Set(inc.map((r) => Number(r.load)));
      expect(distinct.size).toBeGreaterThanOrEqual(5);

      const instObj: any = {
        ...industrialPlatform,
        max: Number(industrialPlatform.max),
        min: Number(industrialPlatform.min),
        e: Number(industrialPlatform.e),
        d: Number(industrialPlatform.d),
      };
      const obsPayload = rows.map((r, idx) => ({
        sequenceIndex: idx,
        load: Number(r.load),
        indicatedValue: Number(r.indicatedValue),
        additionalLoad: Number(r.additionalLoad),
        zeroError: Number(r.zeroError),
        loadingDirection: r.loadingDirection,
      }));

      const evalResult = evaluateWeighingPerformanceTest(
        obsPayload,
        instObj,
        VerificationContext.InitialVerification
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
      expect(evalResult.completeness?.isComplete).toBe(true);
    });

    it('generates schema-valid observation payloads for database persistence', () => {
      const res = generateWeighingPerformanceDemo(baseScale, VerificationContext.TypeEvaluation);
      expect(res.success).toBe(true);
      const row = res.data![0];

      const validation = validateTestObservationCreate({
        sessionId: 'session-demo-1',
        testType: 'WEIGHING_PERFORMANCE',
        sequenceIndex: 0,
        observationData: {
          sequenceIndex: 0,
          load: Number(row.load),
          indicatedValue: Number(row.indicatedValue),
          additionalLoad: Number(row.additionalLoad),
          zeroError: Number(row.zeroError),
          loadingDirection: row.loadingDirection,
          isDemo: true,
          dataSource: 'DEMO_DATA',
        },
      });
      expect(validation.success).toBe(true);
    });

    it('returns clear reason when instrument parameters are invalid', () => {
      const invalid = { ...baseScale, max: -5 };
      const res = generateWeighingPerformanceDemo(invalid, VerificationContext.InitialVerification);
      expect(res.success).toBe(false);
      expect(res.reason).toContain('Max capacity must be a positive number');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 2: REPEATABILITY
  // ──────────────────────────────────────────────────────────────────────────
  describe('Module 2: Repeatability Demo Generation', () => {
    it('handles 10 readings per series under Type Evaluation (Max < 1000 kg)', () => {
      const res = generateRepeatabilityDemo(baseScale, VerificationContext.TypeEvaluation);
      expect(res.success).toBe(true);
      const form = res.data!;

      expect(form.autoZeroOrTrackingActive).toBe(true);
      expect(form.series).toBeDefined();
      expect(form.series).toHaveLength(2);

      // Annex A.4.10: For Max < 1000 kg, 10 weighings each
      expect(form.series![0].indications).toHaveLength(10);
      expect(form.series![1].indications).toHaveLength(10);
      expect(form.series![0].indications.every((v) => v.trim() !== '')).toBe(true);
      expect(form.series![1].indications.every((v) => v.trim() !== '')).toBe(true);

      // Series 1: ~0.5 Max (15 kg), Series 2: close to Max (30 kg)
      expect(Number(form.series![0].testLoad)).toBe(15);
      expect(Number(form.series![1].testLoad)).toBe(30);

      // Evaluate via engine
      const instObj: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
      };
      const obsPayload = {
        testLoad: Number(form.testLoad),
        indications: form.indications.map(Number),
        autoZeroOrTrackingActive: form.autoZeroOrTrackingActive,
        series: form.series!.map((s) => ({
          seriesNumber: s.seriesNumber,
          testLoad: Number(s.testLoad),
          indications: s.indications.map(Number),
        })),
      };

      const evalResult = evaluateRepeatabilityTest(
        obsPayload,
        instObj,
        VerificationContext.TypeEvaluation
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
      expect(evalResult.seriesResults).toHaveLength(2);
      expect(evalResult.seriesResults!.every((s) => s.outcome === TestOutcome.Pass)).toBe(true);
      expect(evalResult.completeness?.isComplete).toBe(true);
    });

    it('populates 6 weighings for Class II under Verification', () => {
      const res = generateRepeatabilityDemo(classIIScale, VerificationContext.InitialVerification);
      expect(res.success).toBe(true);
      const form = res.data!;

      // Class II requires 6 weighings per Annex A.4.10
      expect(form.indications).toHaveLength(6);
      expect(form.indications.every((v) => v.trim() !== '')).toBe(true);

      const instObj: any = {
        ...classIIScale,
        max: Number(classIIScale.max),
        min: Number(classIIScale.min),
        e: Number(classIIScale.e),
        d: Number(classIIScale.d),
      };
      const obsPayload = {
        testLoad: Number(form.testLoad),
        indications: form.indications.map(Number),
        autoZeroOrTrackingActive: form.autoZeroOrTrackingActive,
      };

      const evalResult = evaluateRepeatabilityTest(
        obsPayload,
        instObj,
        VerificationContext.InitialVerification
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
    });

    it('populates 3 weighings for Class III under Verification', () => {
      const res = generateRepeatabilityDemo(baseScale, VerificationContext.InitialVerification);
      expect(res.success).toBe(true);
      const form = res.data!;

      // Class III requires 3 weighings per Annex A.4.10
      expect(form.indications).toHaveLength(3);
      expect(form.indications.every((v) => v.trim() !== '')).toBe(true);

      const instObj: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
      };
      const obsPayload = {
        testLoad: Number(form.testLoad),
        indications: form.indications.map(Number),
        autoZeroOrTrackingActive: form.autoZeroOrTrackingActive,
      };

      const evalResult = evaluateRepeatabilityTest(
        obsPayload,
        instObj,
        VerificationContext.InitialVerification
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
    });

    it('generates schema-valid observation payloads for repeatability persistence', () => {
      const res = generateRepeatabilityDemo(baseScale, VerificationContext.InitialVerification);
      expect(res.success).toBe(true);
      const form = res.data!;

      const validation = validateTestObservationCreate({
        sessionId: 'session-demo-1',
        testType: 'REPEATABILITY',
        observationData: {
          testLoad: Number(form.testLoad),
          indications: form.indications.map(Number),
          autoZeroOrTrackingActive: form.autoZeroOrTrackingActive,
          isDemo: true,
        },
      });
      expect(validation.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 3: ECCENTRIC LOADING
  // ──────────────────────────────────────────────────────────────────────────
  describe('Module 3: Eccentric Loading Demo Generation', () => {
    it('populates 4 quarter positions with prescribed load 1/3 Max for standard 4-point platform', () => {
      const res = generateEccentricLoadingDemo(baseScale);
      expect(res.success).toBe(true);
      const rows = res.data!;

      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.positionId)).toEqual(['1', '2', '3', '4']);

      // Prescribed load: 1/3 of Max = 30 / 3 = 10 kg
      for (const r of rows) {
        expect(Number(r.appliedLoad)).toBe(10);
        expect(Number(r.indicatedValue)).toBe(10);
        expect(r.autoZeroOrTrackingDisabled).toBe(true);
        expect(r.zeroError).toBe('0');
      }

      // Check load validation
      for (const r of rows) {
        const val = validateEccentricLoad(Number(r.appliedLoad), {
          max: Number(baseScale.max),
          e: Number(baseScale.e),
        });
        expect(val.isValid).toBe(true);
      }

      // Evaluate via engine
      const instObj: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
        numberOfSupportPoints: 4,
      };
      const obsPayload = rows.map((r) => ({
        positionId: r.positionId,
        appliedLoad: Number(r.appliedLoad),
        indicatedValue: Number(r.indicatedValue),
        additionalLoad: Number(r.additionalLoad),
        zeroError: Number(r.zeroError),
        autoZeroOrTrackingDisabled: r.autoZeroOrTrackingDisabled,
      }));

      const evalResult = evaluateEccentricLoadingTest(
        obsPayload,
        instObj,
        VerificationContext.TypeEvaluation,
        false
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
      expect(evalResult.completeness.isComplete).toBe(true);
      expect(evalResult.observationResults.every((o) => o.outcome === TestOutcome.Pass)).toBe(true);
    });

    it('populates 3 positions for 3-point load receptors', () => {
      const scale3Points = { ...baseScale, numberOfSupportPoints: 3 };
      const res = generateEccentricLoadingDemo(scale3Points);
      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(3);
      expect(res.data!.map((r) => r.positionId)).toEqual(['1', '2', '3']);
    });

    it('returns an explanation rather than forcing values when support points > 4', () => {
      const unsupported = { ...baseScale, numberOfSupportPoints: 6 };
      const res = generateEccentricLoadingDemo(unsupported);
      expect(res.success).toBe(false);
      expect(res.reason).toContain('unsupported for instruments with > 4 support points');
    });

    it('generates schema-valid observation payloads for eccentric loading persistence', () => {
      const res = generateEccentricLoadingDemo(baseScale);
      expect(res.success).toBe(true);
      const row = res.data![0];

      const validation = validateTestObservationCreate({
        sessionId: 'session-demo-1',
        testType: 'ECCENTRIC_LOADING',
        sequenceIndex: 0,
        observationData: {
          positionId: row.positionId,
          appliedLoad: Number(row.appliedLoad),
          indicatedValue: Number(row.indicatedValue),
          additionalLoad: Number(row.additionalLoad),
          zeroError: Number(row.zeroError),
          autoZeroOrTrackingDisabled: row.autoZeroOrTrackingDisabled,
          isDemo: true,
        },
      });
      expect(validation.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 4: DIGITAL DISCRIMINATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('Module 4: Digital Discrimination Demo Generation', () => {
    it('populates 3 points (Min, 0.5 Max, Max) with indication shift of 1d and produces PASS', () => {
      const res = generateDiscriminationDemo(baseScale, VerificationContext.TypeEvaluation);
      expect(res.success).toBe(true);
      const rows = res.data!;

      expect(rows).toHaveLength(3);
      expect(Number(rows[0].testLoad)).toBe(0.2); // Min
      expect(Number(rows[1].testLoad)).toBe(15);  // 0.5 Max
      expect(Number(rows[2].testLoad)).toBe(30);  // Max

      for (const r of rows) {
        expect(Number(r.indicationAfter) - Number(r.indicationBefore)).toBeCloseTo(Number(baseScale.d), 6);
      }

      const instObj: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
      };
      const obsPayload = rows.map((r) => ({
        testLoad: Number(r.testLoad),
        indicationBefore: Number(r.indicationBefore),
        indicationAfter: Number(r.indicationAfter),
      }));

      const evalResult = evaluateDiscriminationTest(
        obsPayload,
        instObj,
        VerificationContext.TypeEvaluation
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
      expect(evalResult.observationResults.every((o) => o.outcome === TestOutcome.Pass)).toBe(true);
    });

    it('explains non-applicability when context is not Type Evaluation', () => {
      const res = generateDiscriminationDemo(baseScale, VerificationContext.InitialVerification);
      expect(res.success).toBe(false);
      expect(res.reason).toContain('applies to Type Evaluation only');
    });

    it('explains non-applicability when d < 5 mg', () => {
      const smallDScale = { ...baseScale, d: 0.000001 };
      const res = generateDiscriminationDemo(smallDScale, VerificationContext.TypeEvaluation);
      expect(res.success).toBe(false);
      expect(res.reason).toContain('requires scale interval d >= 5 mg');
    });

    it('generates schema-valid observation payloads for discrimination persistence', () => {
      const res = generateDiscriminationDemo(baseScale, VerificationContext.TypeEvaluation);
      expect(res.success).toBe(true);
      const row = res.data![0];

      const validation = validateTestObservationCreate({
        sessionId: 'session-demo-1',
        testType: 'DISCRIMINATION',
        sequenceIndex: 0,
        observationData: {
          testLoad: Number(row.testLoad),
          indicationBefore: Number(row.indicationBefore),
          indicationAfter: Number(row.indicationAfter),
          isDemo: true,
        },
      });
      expect(validation.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 5: ZERO-SETTING ACCURACY
  // ──────────────────────────────────────────────────────────────────────────
  describe('Module 5: Zero-Setting Accuracy Demo Generation', () => {
    it('populates 10e reference load with zero error within +/- 0.25e and produces PASS', () => {
      const res = generateZeroSettingDemo(baseScale);
      expect(res.success).toBe(true);
      const data = res.data!;

      // 10e = 10 * 0.01 = 0.1 kg
      expect(Number(data.load)).toBe(0.1);
      expect(Number(data.indicatedValue)).toBe(0.1);
      expect(Number(data.additionalLoad)).toBe(0.005); // 0.5e

      const instObj: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
      };
      const obsPayload = {
        load: Number(data.load),
        indicatedValue: Number(data.indicatedValue),
        additionalLoad: Number(data.additionalLoad),
      };

      const evalResult = evaluateZeroSettingTest(
        obsPayload,
        instObj,
        VerificationContext.TypeEvaluation
      );
      expect(evalResult.outcome).toBe(TestOutcome.Pass);
      expect(evalResult.maxAbsoluteError).toBe(0);
      expect(evalResult.observationResults[0].outcome).toBe(TestOutcome.Pass);
    });

    it('explains non-applicability when zero-setting mechanisms are not fitted', () => {
      const noMechanisms = { ...baseScale, zeroSettingMechanisms: [] };
      const res = generateZeroSettingDemo(noMechanisms);
      expect(res.success).toBe(false);
      expect(res.reason).toContain('No zero-setting mechanism is fitted');
    });

    it('generates schema-valid observation payloads for zero-setting persistence', () => {
      const res = generateZeroSettingDemo(baseScale);
      expect(res.success).toBe(true);
      const data = res.data!;

      const validation = validateTestObservationCreate({
        sessionId: 'session-demo-1',
        testType: 'ZERO_SETTING_ACCURACY',
        observationData: {
          load: Number(data.load),
          indicatedValue: Number(data.indicatedValue),
          additionalLoad: Number(data.additionalLoad),
          isDemo: true,
        },
      });
      expect(validation.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // END-TO-END ORCHESTRATION & COMPLIANCE ENGINE PASS
  // ──────────────────────────────────────────────────────────────────────────
  describe('End-to-End Orchestration & Regulatory PASS Verification', () => {
    it('genuinely returns overall PASS across all 5 test modules in Type Evaluation', () => {
      const demoData = generateAllDemoData(baseScale, VerificationContext.TypeEvaluation);
      expect(demoData.weighing?.success).toBe(true);
      expect(demoData.repeatability?.success).toBe(true);
      expect(demoData.eccentric?.success).toBe(true);
      expect(demoData.discrimination?.success).toBe(true);
      expect(demoData.zeroSetting?.success).toBe(true);

      const instPayload: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
        numberOfSupportPoints: 4,
        instrumentType: InstrumentType.SingleRange,
        indicationType: 'digital',
        zeroSettingMechanisms: ['semi_automatic'],
      };

      const observationsPayload = {
        weighingPerformance: demoData.weighing!.data!.map((r, idx) => ({
          sequenceIndex: idx,
          load: Number(r.load),
          indicatedValue: Number(r.indicatedValue),
          additionalLoad: Number(r.additionalLoad),
          zeroError: Number(r.zeroError),
          loadingDirection: r.loadingDirection,
        })),
        repeatability: {
          testLoad: Number(demoData.repeatability!.data!.testLoad),
          indications: demoData.repeatability!.data!.indications.map(Number),
          autoZeroOrTrackingActive: demoData.repeatability!.data!.autoZeroOrTrackingActive,
          series: demoData.repeatability!.data!.series!.map((s) => ({
            seriesNumber: s.seriesNumber,
            testLoad: Number(s.testLoad),
            indications: s.indications.map(Number),
          })),
        },
        eccentricLoading: demoData.eccentric!.data!.map((r) => ({
          positionId: r.positionId,
          appliedLoad: Number(r.appliedLoad),
          indicatedValue: Number(r.indicatedValue),
          additionalLoad: Number(r.additionalLoad),
          zeroError: Number(r.zeroError),
          autoZeroOrTrackingDisabled: r.autoZeroOrTrackingDisabled,
        })),
        eccentricZeroDeterminedBeforeEachLoading: false,
        discrimination: demoData.discrimination!.data!.map((r) => ({
          testLoad: Number(r.testLoad),
          indicationBefore: Number(r.indicationBefore),
          indicationAfter: Number(r.indicationAfter),
        })),
        zeroSettingAccuracy: {
          load: Number(demoData.zeroSetting!.data!.load),
          indicatedValue: Number(demoData.zeroSetting!.data!.indicatedValue),
          additionalLoad: Number(demoData.zeroSetting!.data!.additionalLoad),
        },
      };

      const result = evaluateInstrumentCompliance(
        instPayload,
        VerificationContext.TypeEvaluation,
        observationsPayload
      );

      // Verify that the actual application evaluation engine independently returns PASS!
      expect(result.overallOutcome).toBe('pass');
      expect(result.counts.passed).toBe(5);
      expect(result.counts.failed).toBe(0);
      expect(result.counts.incomplete).toBe(0);
      expect(result.counts.requiresRetest).toBe(0);

      const weighingTest = result.evaluatedTests.find((t) => t.testType === TestType.WeighingPerformance);
      const repTest = result.evaluatedTests.find((t) => t.testType === TestType.Repeatability);
      const eccTest = result.evaluatedTests.find((t) => t.testType === TestType.EccentricLoading);
      const discTest = result.evaluatedTests.find((t) => t.testType === TestType.Discrimination);
      const zeroTest = result.evaluatedTests.find((t) => t.testType === TestType.ZeroSettingAccuracy);

      expect(weighingTest?.status).toBe('passed');
      expect(repTest?.status).toBe('passed');
      expect(eccTest?.status).toBe('passed');
      expect(discTest?.status).toBe('passed');
      expect(zeroTest?.status).toBe('passed');
    });

    it('genuinely returns overall PASS across all 4 applicable modules in Initial Verification', () => {
      const demoData = generateAllDemoData(baseScale, VerificationContext.InitialVerification);
      expect(demoData.weighing?.success).toBe(true);
      expect(demoData.repeatability?.success).toBe(true);
      expect(demoData.eccentric?.success).toBe(true);
      // Discrimination does not apply to Initial Verification
      expect(demoData.discrimination?.success).toBe(false);
      expect(demoData.zeroSetting?.success).toBe(true);

      const instPayload: any = {
        ...baseScale,
        max: Number(baseScale.max),
        min: Number(baseScale.min),
        e: Number(baseScale.e),
        d: Number(baseScale.d),
        numberOfSupportPoints: 4,
        instrumentType: InstrumentType.SingleRange,
        indicationType: 'digital',
        zeroSettingMechanisms: ['semi_automatic'],
      };

      const observationsPayload = {
        weighingPerformance: demoData.weighing!.data!.map((r, idx) => ({
          sequenceIndex: idx,
          load: Number(r.load),
          indicatedValue: Number(r.indicatedValue),
          additionalLoad: Number(r.additionalLoad),
          zeroError: Number(r.zeroError),
          loadingDirection: r.loadingDirection,
        })),
        repeatability: {
          testLoad: Number(demoData.repeatability!.data!.testLoad),
          indications: demoData.repeatability!.data!.indications.map(Number),
          autoZeroOrTrackingActive: demoData.repeatability!.data!.autoZeroOrTrackingActive,
        },
        eccentricLoading: demoData.eccentric!.data!.map((r) => ({
          positionId: r.positionId,
          appliedLoad: Number(r.appliedLoad),
          indicatedValue: Number(r.indicatedValue),
          additionalLoad: Number(r.additionalLoad),
          zeroError: Number(r.zeroError),
          autoZeroOrTrackingDisabled: r.autoZeroOrTrackingDisabled,
        })),
        eccentricZeroDeterminedBeforeEachLoading: false,
        zeroSettingAccuracy: {
          load: Number(demoData.zeroSetting!.data!.load),
          indicatedValue: Number(demoData.zeroSetting!.data!.indicatedValue),
          additionalLoad: Number(demoData.zeroSetting!.data!.additionalLoad),
        },
      };

      const result = evaluateInstrumentCompliance(
        instPayload,
        VerificationContext.InitialVerification,
        observationsPayload
      );

      expect(result.overallOutcome).toBe('pass');
      expect(result.counts.passed).toBe(4);
      expect(result.counts.skipped).toBe(1); // Discrimination skipped per R76 rules
      expect(result.counts.failed).toBe(0);
      expect(result.counts.incomplete).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CONFIGURATION CHANGE & EXISTING DATA PROTECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('Instrument Configuration Changes & Data Protection', () => {
    it('regenerates compatible sample readings when instrument parameters change', () => {
      // 1. Initially generated for Max 15000, e = 5
      const initialEccentric = generateEccentricLoadingDemo(industrialPlatform);
      expect(initialEccentric.success).toBe(true);
      expect(Number(initialEccentric.data![0].appliedLoad)).toBe(5000); // 15000 / 3

      // 2. Instrument is reconfigured to Max 30, e = 0.01
      const updatedEccentric = generateEccentricLoadingDemo(baseScale);
      expect(updatedEccentric.success).toBe(true);
      expect(Number(updatedEccentric.data![0].appliedLoad)).toBe(10); // 30 / 3

      // Confirms that the updated values match the new instrument configuration perfectly
      const val = validateEccentricLoad(Number(updatedEccentric.data![0].appliedLoad), {
        max: Number(baseScale.max),
        e: Number(baseScale.e),
      });
      expect(val.isValid).toBe(true);
    });

    it('accurately distinguishes user-entered readings from empty/default states', () => {
      // Empty / blank states
      expect(hasWeighingReadings([{ id: 'w1', load: '', indicatedValue: '', additionalLoad: '0', zeroError: '0', loadingDirection: 'increasing' }])).toBe(false);
      expect(hasRepeatabilityReadings({ testLoad: '', indications: ['', '', ''], autoZeroOrTrackingActive: true })).toBe(false);
      expect(hasEccentricReadings([{ id: 'e1', positionId: '1', appliedLoad: '', indicatedValue: '', additionalLoad: '0', zeroError: '0', autoZeroOrTrackingDisabled: true }])).toBe(false);
      expect(hasDiscriminationReadings([{ id: 'd1', testLoad: '', indicationBefore: '', indicationAfter: '' }])).toBe(false);
      expect(hasZeroSettingReadings({ load: '', indicatedValue: '', additionalLoad: '' })).toBe(false);

      // User-entered readings
      expect(hasWeighingReadings([{ id: 'w1', load: '10', indicatedValue: '10', additionalLoad: '0', zeroError: '0', loadingDirection: 'increasing' }])).toBe(true);
      expect(hasRepeatabilityReadings({ testLoad: '20', indications: ['20', '', ''], autoZeroOrTrackingActive: true })).toBe(true);
      expect(hasEccentricReadings([{ id: 'e1', positionId: '1', appliedLoad: '5', indicatedValue: '5', additionalLoad: '0', zeroError: '0', autoZeroOrTrackingDisabled: true }])).toBe(true);
      expect(hasDiscriminationReadings([{ id: 'd1', testLoad: '1', indicationBefore: '1', indicationAfter: '1.005' }])).toBe(true);
      expect(hasZeroSettingReadings({ load: '0.1', indicatedValue: '0.1', additionalLoad: '0.005' })).toBe(true);
    });
  });
});

