import { describe, it, expect } from 'vitest';
import { evaluateWeighingObservation, evaluateWeighingPerformanceTest } from './weighing';
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

  describe('Full Test Aggregation', () => {
    it('passes when all observations pass', () => {
      const observations = [
        makeObs(500, 500, 1, 0), // Ec = 1.5, MPE = 2.5 (Pass)
        makeObs(1000, 1000, 1, 0) // Ec = 1.5, MPE = 2.5 (Pass)
      ];
      const res = evaluateWeighingPerformanceTest(observations, baseInstrument, context);
      expect(res.outcome).toBe(TestOutcome.Pass);
      expect(res.maxAbsoluteError).toBe(1.5);
    });

    it('fails when a single observation fails', () => {
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
  });
});
