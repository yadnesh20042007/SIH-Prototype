import { describe, it, expect } from 'vitest';
import {
  evaluateWeighingObservation,
  evaluateWeighingPerformanceTest,
  checkWeighingCompleteness,
  validateWeighingLoad,
  validateWeighingLoadInput,
} from './weighing';
import { WeighingPerformanceObservation } from '../types/observations';
import { AccuracyClass, Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestOutcome } from '../types/results';

describe('Weighing Performance Calculation (R76 A.4.4.3)', () => {
  const baseInstrument: Instrument = {
    id: 'test-inst',
    manufacturer: 'TestMaker',
    model: 'TestModel',
    accuracyClass: AccuracyClass.III,
    max: 15000,
    min: 100,
    e: 5,
    d: 5,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: InstrumentType.SingleRange
  };

  const context = VerificationContext.InitialVerification;

  // Helper for generating observations easily
  const makeObs = (L: number, I: number, deltaL: number | undefined, E0: number): WeighingPerformanceObservation => ({
    sequenceIndex: 0,
    load: L,
    indicatedValue: I,
    additionalLoad: deltaL,
    zeroError: E0,
    loadingDirection: 'increasing'
  });

  describe('Single Observation Evaluation', () => {
    it('evaluates an exact PASS well within MPE', () => {
      // Worked example from standard (modified to 1000g vs 1kg, we'll use base unit values as g for illustration)
      // L=1000, I=1000, e=5, deltaL=1.5, E0=0.5
      // P = 1000 + 2.5 - 1.5 = 1001
      // E = 1001 - 1000 = +1
      // Ec = 1 - 0.5 = 0.5
      // m=1000 (200e), MPE = 0.5e = 2.5.
      // |0.5| <= 2.5 -> PASS
      const obs = makeObs(1000, 1000, 1.5, 0.5);
      const res = evaluateWeighingObservation(obs, baseInstrument, context);
      
      expect(res.indicationPriorToRounding).toBe(1001);
      expect(res.errorPriorToRounding).toBe(1);
      expect(res.calculatedError).toBe(0.5);
      expect(res.mpe).toBe(2.5);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });

    it('evaluates an exact MPE-boundary PASS (positive)', () => {
      // L=1000, I=1000, e=5, deltaL=0, E0=0
      // P = 1000 + 2.5 - 0 = 1002.5
      // E = 1002.5 - 1000 = 2.5
      // Ec = 2.5 - 0 = 2.5
      // MPE = 2.5. |2.5| <= 2.5 -> PASS
      const obs = makeObs(1000, 1000, 0, 0);
      const res = evaluateWeighingObservation(obs, baseInstrument, context);
      
      expect(res.calculatedError).toBe(2.5);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });

    it('evaluates an exact MPE-boundary PASS (negative error)', () => {
      // L=1000, I=995, e=5, deltaL=0, E0=0
      // P = 995 + 2.5 - 0 = 997.5
      // E = 997.5 - 1000 = -2.5
      // Ec = -2.5. MPE = 2.5 -> PASS
      const obs = makeObs(1000, 995, 0, 0);
      const res = evaluateWeighingObservation(obs, baseInstrument, context);
      
      expect(res.calculatedError).toBe(-2.5);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });

    it('evaluates a FAIL just beyond MPE', () => {
      // L=1000, I=1000, e=5, deltaL=0, E0=-0.5
      // P = 1002.5, E = 2.5, Ec = 2.5 - (-0.5) = 3.0
      // MPE = 2.5. |3.0| > 2.5 -> FAIL
      const obs = makeObs(1000, 1000, 0, -0.5);
      const res = evaluateWeighingObservation(obs, baseInstrument, context);
      
      expect(res.calculatedError).toBe(3.0);
      expect(res.outcome).toBe(TestOutcome.Fail);
    });

    it('throws error when additionalLoad is missing', () => {
      const obs = makeObs(1000, 1000, undefined, 0);
      expect(() => evaluateWeighingObservation(obs, baseInstrument, context)).toThrow(/additionalLoad.*is required/);
    });
  });

  describe('Full Test Aggregation and Procedure Completeness (Annex A.4.4)', () => {
    it('returns INCOMPLETE when observations pass MPE but procedure is incomplete', () => {
      const observations = [
        makeObs(500, 500, 1, 0), // Ec = 1.5, MPE = 2.5 (Pass)
        makeObs(1000, 1000, 1, 0) // Ec = 1.5, MPE = 2.5 (Pass)
      ];
      const res = evaluateWeighingPerformanceTest(observations, baseInstrument, context);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
      expect(res.completeness?.isComplete).toBe(false);
      expect(res.maxAbsoluteError).toBe(1.5);
    });

    it('passes when requireComplete is false for partial calculation check', () => {
      const observations = [
        makeObs(500, 500, 1, 0),
        makeObs(1000, 1000, 1, 0)
      ];
      const res = evaluateWeighingPerformanceTest(observations, baseInstrument, context, false);
      expect(res.outcome).toBe(TestOutcome.Pass);
      expect(res.maxAbsoluteError).toBe(1.5);
    });

    it('fails when a single observation fails, even if procedure is incomplete (FAIL precedence)', () => {
      const observations = [
        makeObs(500, 500, 1, 0), // Ec = 1.5, MPE = 2.5 (Pass)
        makeObs(1000, 1000, 0, -0.5) // Ec = 3.0, MPE = 2.5 (Fail)
      ];
      const res = evaluateWeighingPerformanceTest(observations, baseInstrument, context);
      expect(res.outcome).toBe(TestOutcome.Fail);
      expect(res.maxAbsoluteError).toBe(3.0);
    });

    it('throws when no observations provided', () => {
      expect(() => evaluateWeighingPerformanceTest([], baseInstrument, context)).toThrow(/No observations/);
    });

    it('passes with a full complete procedure for Initial Verification (5 loads, inc & dec, Min & Max & transitions)', () => {
      // BaseInstrument: Class III, Min=100, Max=15000, e=5
      // Transition points: 500e = 2500, 2000e = 10000
      const completeObs: WeighingPerformanceObservation[] = [
        // Increasing
        { sequenceIndex: 0, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 1, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 2, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 3, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 4, load: 15000, indicatedValue: 15000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        // Decreasing
        { sequenceIndex: 5, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
        { sequenceIndex: 6, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
        { sequenceIndex: 7, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
        { sequenceIndex: 8, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
      ];

      const res = evaluateWeighingPerformanceTest(completeObs, baseInstrument, context);
      expect(res.outcome).toBe(TestOutcome.Pass);
      expect(res.completeness?.isComplete).toBe(true);
      expect(res.completeness?.testedLoadsCount).toBe(5);
    });

    it('marks INCOMPLETE when missing decreasing loading sequence', () => {
      const incOnlyObs: WeighingPerformanceObservation[] = [
        { sequenceIndex: 0, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 1, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 2, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 3, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 4, load: 15000, indicatedValue: 15000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
      ];

      const res = evaluateWeighingPerformanceTest(incOnlyObs, baseInstrument, context);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
      expect(res.completeness?.isComplete).toBe(false);
      expect(res.completeness?.hasDecreasing).toBe(false);
      expect(res.completeness?.message).toContain('Missing decreasing');
    });

    it('marks INCOMPLETE when missing Min or Max test load', () => {
      // 5 loads but neither Min (100) nor Max (15000)
      const missingMinMax: WeighingPerformanceObservation[] = [
        { sequenceIndex: 0, load: 2000, indicatedValue: 2000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 1, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 2, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 3, load: 7000, indicatedValue: 7000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 4, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 5, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
      ];

      const res = evaluateWeighingPerformanceTest(missingMinMax, baseInstrument, context);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
      expect(res.completeness?.isComplete).toBe(false);
      expect(res.completeness?.coversMin).toBe(false);
      expect(res.completeness?.coversMax).toBe(false);
    });

    it('requires at least 10 test loads for Type Evaluation context', () => {
      const typeEvalContext = VerificationContext.TypeEvaluation;
      // Supply 5 loads which would satisfy Initial Verification but NOT Type Evaluation
      const fiveLoadsObs: WeighingPerformanceObservation[] = [
        { sequenceIndex: 0, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 1, load: 2500, indicatedValue: 2500, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 2, load: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 3, load: 10000, indicatedValue: 10000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 4, load: 15000, indicatedValue: 15000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 5, load: 15000, indicatedValue: 15000, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
        { sequenceIndex: 6, load: 100, indicatedValue: 100, additionalLoad: 2.5, zeroError: 0, loadingDirection: 'decreasing' },
      ];

      const res = evaluateWeighingPerformanceTest(fiveLoadsObs, baseInstrument, typeEvalContext);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
      expect(res.completeness?.requiredLoadsCount).toBe(10);
      expect(res.completeness?.testedLoadsCount).toBe(5);
    });
  });

  describe('Stage 2 Weighing Performance Validation Regressions', () => {
    const inst30kg: Instrument = {
      id: 'inst-30kg',
      manufacturer: 'Maker',
      model: 'Model-30',
      accuracyClass: AccuracyClass.III,
      instrumentType: InstrumentType.SingleRange,
      max: 30,
      min: 0.2,
      e: 0.01,
      d: 0.005,
      numberOfSupportPoints: 4,
      additiveTareEffect: false,
      hasAutoZeroOrTracking: false,
      hasInitialZeroSettingDevice: false,
      initialZeroSettingRange: 0,
      hasFineDisplayDevice: false,
    };

    // Regression requirement: Max = 30, load = 35 => invalid
    it('Max = 30, load = 35 => invalid', () => {
      const validation = validateWeighingLoad(35, inst30kg);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('exceeds instrument Max capacity (30 kg)');

      const inputValidation = validateWeighingLoadInput('35', { min: inst30kg.min, max: inst30kg.max });
      expect(inputValidation.isValid).toBe(false);
      expect(inputValidation.error).toContain('exceeds instrument Max capacity (30 kg)');
    });

    // Regression requirement: Max = 30, load = 30 => valid
    it('Max = 30, load = 30 => valid', () => {
      const validation = validateWeighingLoad(30, inst30kg);
      expect(validation.isValid).toBe(true);
      expect(validation.error).toBeUndefined();

      const inputValidation = validateWeighingLoadInput('30', { min: inst30kg.min, max: inst30kg.max });
      expect(inputValidation.isValid).toBe(true);
      expect(inputValidation.error).toBeUndefined();
    });

    it('accounts for explicitly permitted zero load in OIML A.4.4.1 (load = 0 is valid even when Min = 0.2)', () => {
      const zeroValidation = validateWeighingLoad(0, inst30kg);
      expect(zeroValidation.isValid).toBe(true);

      const belowMinValidation = validateWeighingLoad(0.1, inst30kg);
      expect(belowMinValidation.isValid).toBe(false);
      expect(belowMinValidation.error).toContain('below instrument Min capacity');

      const negativeValidation = validateWeighingLoad(-1, inst30kg);
      expect(negativeValidation.isValid).toBe(false);
      expect(negativeValidation.error).toContain('cannot be negative');
    });

    // Regression requirement: Empty observation => not counted
    it('Empty observation => not counted toward loads, sequences, or completeness', () => {
      const emptyObs = [
        { sequenceIndex: 0, load: NaN, indicatedValue: NaN, additionalLoad: 0, zeroError: 0, loadingDirection: 'increasing' as const },
        { sequenceIndex: 1, load: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const },
      ];

      const completeness = checkWeighingCompleteness(emptyObs, inst30kg, VerificationContext.InitialVerification);
      // Only the valid 10 kg observation counts, NaN observation is excluded
      expect(completeness.distinctLoadPointsCount).toBe(1);
      expect(completeness.testedLoadsCount).toBe(1);
      expect(completeness.hasDecreasing).toBe(false);
      expect(completeness.isComplete).toBe(false);
    });

    // Regression requirement: Over-capacity load => Max requirement not satisfied
    it('Over-capacity load => Max requirement not satisfied', () => {
      // Single over-capacity load
      const overCapacityObs = [
        { sequenceIndex: 0, load: 35, indicatedValue: 35, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' as const }
      ];

      const completenessSingle = checkWeighingCompleteness(overCapacityObs, inst30kg, VerificationContext.InitialVerification);
      expect(completenessSingle.testedMax).toBe(false);
      expect(completenessSingle.coversMax).toBe(false);
      expect(completenessSingle.isComplete).toBe(false);
      expect(completenessSingle.missingRequirements.some(r => r.includes('reaching Max'))).toBe(true);
      expect(completenessSingle.missingRequirements.some(r => r.includes('exceeds instrument Max capacity'))).toBe(true);

      // Multiple loads where valid loads only reach 25 kg, plus an over-capacity 35 kg load
      const mixedObs: WeighingPerformanceObservation[] = [
        { sequenceIndex: 0, load: 0.2, indicatedValue: 0.2, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 1, load: 5, indicatedValue: 5, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 2, load: 10, indicatedValue: 10, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 3, load: 20, indicatedValue: 20, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 4, load: 25, indicatedValue: 25, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 5, load: 35, indicatedValue: 35, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'increasing' },
        { sequenceIndex: 6, load: 25, indicatedValue: 25, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'decreasing' },
        { sequenceIndex: 7, load: 0.2, indicatedValue: 0.2, additionalLoad: 0.005, zeroError: 0, loadingDirection: 'decreasing' },
      ];

      const completenessMixed = checkWeighingCompleteness(mixedObs, inst30kg, VerificationContext.InitialVerification);
      // 35 kg must NOT satisfy Max requirement; valid loads only reach 25 kg (< 30 kg)
      expect(completenessMixed.testedMax).toBe(false);
      expect(completenessMixed.coversMax).toBe(false);
      expect(completenessMixed.isComplete).toBe(false);
    });

    // Regression requirement: Invalid observation => cannot produce PASS
    it('Invalid observation => cannot produce PASS', () => {
      const invalidObs: WeighingPerformanceObservation = {
        sequenceIndex: 1,
        load: 35,
        indicatedValue: 35,
        additionalLoad: 0.005,
        zeroError: 0,
        loadingDirection: 'increasing',
      };

      // evaluateWeighingObservation must throw when load exceeds Max
      expect(() => evaluateWeighingObservation(invalidObs, inst30kg, VerificationContext.InitialVerification))
        .toThrow(/exceeds instrument Max capacity \(30 kg\)/);

      // evaluateWeighingPerformanceTest must throw on invalid observation
      expect(() => evaluateWeighingPerformanceTest([invalidObs], inst30kg, VerificationContext.InitialVerification))
        .toThrow(/Weighing performance observation 1 \(load: 35 kg\): Load 35 kg exceeds instrument Max capacity \(30 kg\)/);

      // Even with requireComplete: false, an invalid observation must not PASS
      expect(() => evaluateWeighingPerformanceTest([invalidObs], inst30kg, VerificationContext.InitialVerification, false))
        .toThrow(/Load 35 kg exceeds instrument Max capacity/);
    });
  });
});
