import { describe, it, expect } from 'vitest';
import { calculateMPE, MPEValidationError } from './mpe';
import { AccuracyClass, Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { evaluateWeighingPerformanceTest } from './weighing';
import { evaluateRepeatabilityTest } from './repeatability';
import { evaluateEccentricPosition } from './eccentricity';

describe('MPE Input Safety and Validation per OIML R76 Table 6', () => {
  const e = 1;
  const context = VerificationContext.InitialVerification;

  describe('calculateMPE boundary and input validation', () => {
    it('correctly calculates valid Class III boundaries', () => {
      // 0 <= m <= 500e -> 0.5e
      expect(calculateMPE(AccuracyClass.III, 0, e, context).baseMPE).toBe(0.5);
      expect(calculateMPE(AccuracyClass.III, 500, e, context).baseMPE).toBe(0.5);

      // 500e < m <= 2000e -> 1.0e
      expect(calculateMPE(AccuracyClass.III, 501, e, context).baseMPE).toBe(1.0);
      expect(calculateMPE(AccuracyClass.III, 2000, e, context).baseMPE).toBe(1.0);

      // 2000e < m <= 10000e -> 1.5e
      expect(calculateMPE(AccuracyClass.III, 2001, e, context).baseMPE).toBe(1.5);
      expect(calculateMPE(AccuracyClass.III, 10000, e, context).baseMPE).toBe(1.5);
    });

    it('throws MPEValidationError on overloads exceeding class limits', () => {
      // Class III max is 10000e
      expect(() => calculateMPE(AccuracyClass.III, 10001, e, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, 10001, e, context))
        .toThrow(/exceeds Class III maximum/);

      // Class II max is 100000e
      expect(() => calculateMPE(AccuracyClass.II, 100001, e, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.II, 100001, e, context))
        .toThrow(/exceeds Class II maximum/);

      // Class IIII max is 1000e
      expect(() => calculateMPE(AccuracyClass.IIII, 1001, e, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.IIII, 1001, e, context))
        .toThrow(/exceeds Class IIII maximum/);
    });

    it('throws MPEValidationError on negative loads', () => {
      expect(() => calculateMPE(AccuracyClass.III, -5, e, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, -5, e, context))
        .toThrow(/cannot be negative/);
    });

    it('throws MPEValidationError on NaN and Infinity for load m', () => {
      expect(() => calculateMPE(AccuracyClass.III, NaN, e, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, Infinity, e, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, -Infinity, e, context))
        .toThrow(MPEValidationError);
    });

    it('throws MPEValidationError on invalid scale interval e (<= 0, NaN, Infinity)', () => {
      expect(() => calculateMPE(AccuracyClass.III, 100, 0, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, 100, -1, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, 100, NaN, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, 100, Infinity, context))
        .toThrow(MPEValidationError);
    });

    it('throws MPEValidationError on unsupported accuracy class or context', () => {
      expect(() => calculateMPE('UNKNOWN_CLASS' as any, 100, e, context))
        .toThrow(MPEValidationError);
      expect(() => calculateMPE(AccuracyClass.III, 100, e, 'UNKNOWN_CONTEXT' as any))
        .toThrow(MPEValidationError);
    });
  });

  describe('Enriched error messages in test calculation modules', () => {
    const testInst: Instrument = {
      id: 'test-inst',
      manufacturer: 'Maker',
      model: 'Model',
      accuracyClass: AccuracyClass.III,
      instrumentType: InstrumentType.SingleRange,
      max: 1000,
      min: 10,
      e: 1,
      d: 1,
      numberOfSupportPoints: 4,
      additiveTareEffect: false,
      hasAutoZeroOrTracking: false,
      hasInitialZeroSettingDevice: false,
      initialZeroSettingRange: 0,
      hasFineDisplayDevice: false,
    };

    it('enriches weighing observation error with sequenceIndex and load', () => {
      const invalidObs = [
        { sequenceIndex: 2, load: 15000, indicatedValue: 15000, additionalLoad: 0.5, zeroError: 0, loadingDirection: 'increasing' as const }
      ];

      expect(() => evaluateWeighingPerformanceTest(invalidObs, testInst, context))
        .toThrow(/Weighing performance observation 2 \(load: 15000 kg\): Load 15000e exceeds Class III maximum/);
    });

    it('enriches repeatability error with testLoad', () => {
      const invalidObs = {
        testLoad: 12000,
        indications: [12000, 12000, 12000],
        autoZeroOrTrackingActive: false,
      };

      expect(() => evaluateRepeatabilityTest(invalidObs, testInst, context))
        .toThrow(/Repeatability test \(test load: 12000 kg\): Load 12000e exceeds Class III maximum/);
    });

    it('enriches eccentric position error with positionId and applied load', () => {
      const invalidObs = {
        positionId: 'CORNER_4',
        appliedLoad: 15000,
        indicatedValue: 15000,
        additionalLoad: 0.5,
        zeroError: 0,
        autoZeroOrTrackingDisabled: true,
      };

      expect(() => evaluateEccentricPosition(invalidObs, testInst, context, false))
        .toThrow(/Eccentric loading test position CORNER_4 \(applied load: 15000 kg\): (Load 15000e exceeds Class III maximum|Applied eccentric load 15000 kg exceeds instrument Max capacity)/);
    });
  });
});
