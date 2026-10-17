import { describe, it, expect } from 'vitest';
import { evaluateRepeatabilityTest } from './repeatability';
import { RepeatabilityObservation } from '../types/observations';
import { AccuracyClass, Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestOutcome } from '../types/results';

describe('Repeatability Calculation (R76 A.4.10 / 3.6.1)', () => {
  const classIIIInstrument: Instrument = {
    id: 'inst-class3',
    manufacturer: 'TestMaker',
    model: 'Model3',
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

  const classIInstrument: Instrument = {
    id: 'inst-class1',
    manufacturer: 'TestMaker',
    model: 'Model1',
    accuracyClass: AccuracyClass.I,
    max: 100000,
    min: 10,
    e: 1,
    d: 0.1,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: false,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: InstrumentType.SingleRange
  };

  const initialContext = VerificationContext.InitialVerification;
  const serviceContext = VerificationContext.ServiceInspection;

  const makeObs = (testLoad: number, indications: number[], autoZeroActive = true): RepeatabilityObservation => ({
    testLoad,
    indications,
    autoZeroOrTrackingActive: autoZeroActive
  });

  describe('Core Validations', () => {
    it('evaluates Class III with exactly 3 valid weighings and PASS', () => {
      // testLoad = 1000 (200e -> MPE = 0.5e = 2.5)
      const obs = makeObs(1000, [1000.0, 1002.0, 1001.0]);
      const res = evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext);
      
      expect(res.numberOfWeighings).toBe(3);
      expect(res.iMax).toBe(1002.0);
      expect(res.iMin).toBe(1000.0);
      expect(res.repeatabilityRange).toBe(2.0);
      expect(res.mpe).toBe(2.5);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });

    it('evaluates Class III with exactly 3 weighings and FAIL', () => {
      // testLoad = 1000 (MPE = 2.5)
      const obs = makeObs(1000, [1000.0, 1005.0, 1001.0]);
      const res = evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext);
      
      expect(res.repeatabilityRange).toBe(5.0);
      expect(res.outcome).toBe(TestOutcome.Fail);
    });

    it('evaluates Class I with exactly 6 valid weighings', () => {
      // testLoad = 50000 (50000e -> MPE = 0.5e = 0.5)
      const obs = makeObs(50000, [50000.0, 50000.2, 50000.1, 50000.4, 50000.3, 50000.0]);
      const res = evaluateRepeatabilityTest(obs, classIInstrument, initialContext);
      
      expect(res.numberOfWeighings).toBe(6);
      expect(res.repeatabilityRange).toBe(0.4);
      expect(res.mpe).toBe(0.5);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });
  });

  describe('Rejections & Requirements', () => {
    it('rejects Class III with fewer than 3 readings', () => {
      const obs = makeObs(1000, [1000.0, 1001.0]);
      expect(() => evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext)).toThrow(/exactly 3 weighings/);
    });
    
    it('rejects Class III with more than 3 readings', () => {
      const obs = makeObs(1000, [1000.0, 1001.0, 1002.0, 1000.0]);
      expect(() => evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext)).toThrow(/exactly 3 weighings/);
    });

    it('rejects Class I with fewer than 6 readings', () => {
      const obs = makeObs(50000, [50000.0, 50000.2, 50000.1, 50000.4, 50000.3]);
      expect(() => evaluateRepeatabilityTest(obs, classIInstrument, initialContext)).toThrow(/exactly 6 weighings/);
    });

    it('rejects if auto zero-tracking is present but not active', () => {
      const obs = makeObs(1000, [1000.0, 1002.0, 1001.0], false);
      expect(() => evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext)).toThrow(/must be active/);
    });
  });

  describe('MPE Boundary Conditions', () => {
    it('evaluates exact MPE-boundary PASS', () => {
      // Class III, testLoad 1000 -> MPE = 2.5
      const obs = makeObs(1000, [1000.0, 1002.5, 1000.0]);
      const res = evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext);
      
      expect(res.repeatabilityRange).toBe(2.5);
      expect(res.mpe).toBe(2.5);
      expect(res.outcome).toBe(TestOutcome.Pass);
    });

    it('evaluates failure just beyond MPE', () => {
      // Class III, testLoad 1000 -> MPE = 2.5
      // With JS precision fixes we should safely evaluate this properly
      const obs = makeObs(1000, [1000.0, 1002.6, 1000.0]);
      const res = evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext);
      
      expect(res.repeatabilityRange).toBe(2.6);
      expect(res.outcome).toBe(TestOutcome.Fail);
    });
  });

  describe('Service Inspection Integration', () => {
    it('service-inspection multiplier is integrated properly', () => {
      // Class III, testLoad 1000 -> Initial MPE = 2.5, Service Inspection MPE = 5.0
      const obs = makeObs(1000, [1000.0, 1004.5, 1000.0]);
      
      // Should fail under initial verification
      const failRes = evaluateRepeatabilityTest(obs, classIIIInstrument, initialContext);
      expect(failRes.outcome).toBe(TestOutcome.Fail);
      
      // Should pass under service inspection
      const passRes = evaluateRepeatabilityTest(obs, classIIIInstrument, serviceContext);
      expect(passRes.mpe).toBe(5.0);
      expect(passRes.outcome).toBe(TestOutcome.Pass);
    });
  });

  describe('Multi-Series Repeatability (Type Evaluation A.4.10)', () => {
    const typeEvalContext = VerificationContext.TypeEvaluation;
    // For Class III with Max = 15000 kg (> 1000 kg):
    // Standard requires at least 3 weighings per series, 2 series (approx 0.5 Max and close to Max)
    // 0.5 Max = 7500 kg, Max = 15000 kg.
    it('evaluates complete 2-series test with PASS', () => {
      const multiObs: RepeatabilityObservation = {
        series: [
          {
            seriesNumber: 1,
            testLoad: 7500, // 0.5 Max
            indications: [7500.0, 7501.0, 7500.5], // R = 1.0, 7500 / 5 = 1500e -> MPE = 1.0e = 5.0
          },
          {
            seriesNumber: 2,
            testLoad: 15000, // Max
            indications: [15000.0, 15002.0, 15001.0], // R = 2.0, 15000 / 5 = 3000e -> MPE = 1.5e = 7.5
          },
        ],
        autoZeroOrTrackingActive: true,
      };

      const res = evaluateRepeatabilityTest(multiObs, classIIIInstrument, typeEvalContext);
      expect(res.outcome).toBe(TestOutcome.Pass);
      expect(res.completeness?.isComplete).toBe(true);
      expect(res.seriesResults).toHaveLength(2);
      expect(res.seriesResults?.[0].repeatabilityRange).toBe(1.0);
      expect(res.seriesResults?.[1].repeatabilityRange).toBe(2.0);
    });

    it('returns INCOMPLETE when Type Evaluation is missing the second series', () => {
      const singleSeriesObs: RepeatabilityObservation = {
        series: [
          {
            seriesNumber: 1,
            testLoad: 7500,
            indications: [7500.0, 7501.0, 7500.5],
          },
        ],
        autoZeroOrTrackingActive: true,
      };

      const res = evaluateRepeatabilityTest(singleSeriesObs, classIIIInstrument, typeEvalContext);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
      expect(res.completeness?.isComplete).toBe(false);
      expect(res.completeness?.missingSeriesCount).toBe(1);
    });

    it('returns FAIL when one series exceeds MPE even if another passes (FAIL precedence)', () => {
      const failingMultiObs: RepeatabilityObservation = {
        series: [
          {
            seriesNumber: 1,
            testLoad: 7500,
            indications: [7500.0, 7501.0, 7500.5], // Pass
          },
          {
            seriesNumber: 2,
            testLoad: 15000,
            // R = 15010 - 15000 = 10.0 > MPE (7.5) -> FAIL
            indications: [15000.0, 15010.0, 15001.0],
          },
        ],
        autoZeroOrTrackingActive: true,
      };

      const res = evaluateRepeatabilityTest(failingMultiObs, classIIIInstrument, typeEvalContext);
      expect(res.outcome).toBe(TestOutcome.Fail);
      expect(res.seriesResults?.[0].outcome).toBe(TestOutcome.Pass);
      expect(res.seriesResults?.[1].outcome).toBe(TestOutcome.Fail);
    });

    it('enforces 10 weighings per series for instruments with Max < 1000 kg in Type Evaluation', () => {
      const smallInstrument: Instrument = {
        ...classIIIInstrument,
        max: 30, // 30 kg < 1000 kg
        e: 0.01,
        d: 0.01,
      };

      // Only 3 weighings provided instead of required 10
      const insufficientWeighingsObs: RepeatabilityObservation = {
        series: [
          {
            seriesNumber: 1,
            testLoad: 15,
            indications: [15.0, 15.01, 15.0],
          },
        ],
        autoZeroOrTrackingActive: true,
      };

      const res = evaluateRepeatabilityTest(insufficientWeighingsObs, smallInstrument, typeEvalContext);
      expect(res.outcome).toBe(TestOutcome.Incomplete);
      expect(res.completeness?.isComplete).toBe(false);
      expect(res.completeness?.missingRequirements.some(r => r.includes('requires at least 10'))).toBe(true);
    });
  });
});
