import { describe, it, expect } from 'vitest';
import { calculateMPE } from './mpe';
import { AccuracyClass } from '../types/instrument';
import { VerificationContext } from '../types/verification';

describe('calculateMPE (OIML R76 Table 6)', () => {
  const e = 1; // Simplify tests by setting e = 1
  const initialContext = VerificationContext.InitialVerification;
  const subsequentContext = VerificationContext.SubsequentVerification;
  const serviceContext = VerificationContext.ServiceInspection;

  describe('Class I Boundaries', () => {
    it('0 ≤ m ≤ 50,000e: ±0.5e', () => {
      expect(calculateMPE(AccuracyClass.I, 0, e, initialContext).baseMPE).toBe(0.5);
      expect(calculateMPE(AccuracyClass.I, 50000, e, initialContext).baseMPE).toBe(0.5);
    });
    it('50,000e < m ≤ 200,000e: ±1.0e', () => {
      // lower boundary exclusive
      expect(calculateMPE(AccuracyClass.I, 50001, e, initialContext).baseMPE).toBe(1.0);
      expect(calculateMPE(AccuracyClass.I, 200000, e, initialContext).baseMPE).toBe(1.0);
    });
    it('m > 200,000e: ±1.5e', () => {
      // lower boundary exclusive
      expect(calculateMPE(AccuracyClass.I, 200001, e, initialContext).baseMPE).toBe(1.5);
      expect(calculateMPE(AccuracyClass.I, 500000, e, initialContext).baseMPE).toBe(1.5);
    });
  });

  describe('Class II Boundaries', () => {
    it('0 ≤ m ≤ 5,000e: ±0.5e', () => {
      expect(calculateMPE(AccuracyClass.II, 0, e, initialContext).baseMPE).toBe(0.5);
      expect(calculateMPE(AccuracyClass.II, 5000, e, initialContext).baseMPE).toBe(0.5);
    });
    it('5,000e < m ≤ 20,000e: ±1.0e', () => {
      expect(calculateMPE(AccuracyClass.II, 5001, e, initialContext).baseMPE).toBe(1.0);
      expect(calculateMPE(AccuracyClass.II, 20000, e, initialContext).baseMPE).toBe(1.0);
    });
    it('20,000e < m ≤ 100,000e: ±1.5e', () => {
      expect(calculateMPE(AccuracyClass.II, 20001, e, initialContext).baseMPE).toBe(1.5);
      expect(calculateMPE(AccuracyClass.II, 100000, e, initialContext).baseMPE).toBe(1.5);
    });
    it('m > 100,000e: throws error', () => {
      expect(() => calculateMPE(AccuracyClass.II, 100001, e, initialContext)).toThrow();
    });
  });

  describe('Class III Boundaries', () => {
    it('0 ≤ m ≤ 500e: ±0.5e', () => {
      expect(calculateMPE(AccuracyClass.III, 0, e, initialContext).baseMPE).toBe(0.5);
      expect(calculateMPE(AccuracyClass.III, 500, e, initialContext).baseMPE).toBe(0.5);
    });
    it('500e < m ≤ 2,000e: ±1.0e', () => {
      expect(calculateMPE(AccuracyClass.III, 501, e, initialContext).baseMPE).toBe(1.0);
      expect(calculateMPE(AccuracyClass.III, 2000, e, initialContext).baseMPE).toBe(1.0);
    });
    it('2,000e < m ≤ 10,000e: ±1.5e', () => {
      expect(calculateMPE(AccuracyClass.III, 2001, e, initialContext).baseMPE).toBe(1.5);
      expect(calculateMPE(AccuracyClass.III, 10000, e, initialContext).baseMPE).toBe(1.5);
    });
    it('m > 10,000e: throws error', () => {
      expect(() => calculateMPE(AccuracyClass.III, 10001, e, initialContext)).toThrow();
    });
  });

  describe('Class IIII Boundaries', () => {
    it('0 ≤ m ≤ 50e: ±0.5e', () => {
      expect(calculateMPE(AccuracyClass.IIII, 0, e, initialContext).baseMPE).toBe(0.5);
      expect(calculateMPE(AccuracyClass.IIII, 50, e, initialContext).baseMPE).toBe(0.5);
    });
    it('50e < m ≤ 200e: ±1.0e', () => {
      expect(calculateMPE(AccuracyClass.IIII, 51, e, initialContext).baseMPE).toBe(1.0);
      expect(calculateMPE(AccuracyClass.IIII, 200, e, initialContext).baseMPE).toBe(1.0);
    });
    it('200e < m ≤ 1,000e: ±1.5e', () => {
      expect(calculateMPE(AccuracyClass.IIII, 201, e, initialContext).baseMPE).toBe(1.5);
      expect(calculateMPE(AccuracyClass.IIII, 1000, e, initialContext).baseMPE).toBe(1.5);
    });
    it('m > 1,000e: throws error', () => {
      expect(() => calculateMPE(AccuracyClass.IIII, 1001, e, initialContext)).toThrow();
    });
  });

  describe('Context Multipliers', () => {
    it('Initial Verification applies multiplier 1', () => {
      const result = calculateMPE(AccuracyClass.III, 500, e, initialContext);
      expect(result.baseMPE).toBe(0.5);
      expect(result.effectiveMPE).toBe(0.5);
    });
    it('Subsequent Verification applies multiplier 1', () => {
      const result = calculateMPE(AccuracyClass.III, 500, e, subsequentContext);
      expect(result.baseMPE).toBe(0.5);
      expect(result.effectiveMPE).toBe(0.5);
    });
    it('Service Inspection applies multiplier 2', () => {
      const result = calculateMPE(AccuracyClass.III, 500, e, serviceContext);
      expect(result.baseMPE).toBe(0.5);
      expect(result.effectiveMPE).toBe(1.0);
    });
  });

  describe('Scale intervals scale properly', () => {
    it('mpe scales with e (e = 2kg)', () => {
      // For class III, 500e with e=2 is 1000kg.
      // Base MPE should be 0.5e = 1.0kg.
      const result = calculateMPE(AccuracyClass.III, 1000, 2, initialContext);
      expect(result.baseMPE).toBe(1.0);
      expect(result.effectiveMPE).toBe(1.0);
    });
    it('handles decimal loads properly', () => {
      // 500.5e is > 500e, should bump to 1.0e band
      const result = calculateMPE(AccuracyClass.III, 500.5, 1, initialContext);
      expect(result.baseMPE).toBe(1.0);
    });
  });
});
