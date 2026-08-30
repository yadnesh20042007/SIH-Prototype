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
});
