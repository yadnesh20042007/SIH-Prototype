import { describe, it, expect } from 'vitest';
import { evaluateEccentricLoadingTest } from './eccentricity';
import { EccentricLoadingObservation } from '../types/observations';
import { AccuracyClass, Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestOutcome } from '../types/results';

describe('Eccentric Loading Calculation (R76 A.4.7 / 3.6.2)', () => {
  const baseInstrument: Instrument = {
    id: 'inst-eccentric',
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

  const initialContext = VerificationContext.InitialVerification;
  const serviceContext = VerificationContext.ServiceInspection;

  const makeObs = (
    positionId: string, 
    L: number, 
    I: number, 
    deltaL: number | undefined, 
    E0: number, 
    autoZeroDisabled = true
  ): EccentricLoadingObservation => ({
    positionId,
    appliedLoad: L,
    indicatedValue: I,
    additionalLoad: deltaL,
    zeroError: E0,
    autoZeroOrTrackingDisabled: autoZeroDisabled
  });

  describe('Core Validations and MPE Boundaries', () => {
    it('evaluates all positions PASS', () => {
      // test load = 5000 (1/3 of 15000), 5000 / 5 = 1000e. Class III MPE = 1.0e = 5.0
      const obs = [
        makeObs('Pos1', 5000, 5000, 1.0, 0), // P=5001.5, E=1.5, Ec=1.5 -> PASS
        makeObs('Pos2', 5000, 5000, 1.5, 0), // P=5001.0, E=1.0, Ec=1.0 -> PASS
        makeObs('Pos3', 5000, 5000, 2.0, 0), // P=5000.5, E=0.5, Ec=0.5 -> PASS
        makeObs('Pos4', 5000, 5000, 2.5, 0)  // P=5000.0, E=0.0, Ec=0.0 -> PASS
      ];
      
      const res = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, false);
      expect(res.outcome).toBe(TestOutcome.Pass);
      expect(res.retestRequired).toBe(false);
      expect(res.maxAbsoluteError).toBe(1.5);
    });

    it('evaluates exact MPE-boundary PASS (positive and negative)', () => {
      // test load 5000, MPE = 5.0
      const obs = [
        makeObs('Pos1', 5000, 5000, 0, 2.5),  // P=5002.5, E=2.5, Ec=0.0
        makeObs('Pos2', 5000, 5005, 2.5, 0),  // P=5005, E=5.0, Ec=5.0 -> exactly MPE (positive)
        makeObs('Pos3', 5000, 4995, 2.5, 0),  // P=4995, E=-5.0, Ec=-5.0 -> exactly MPE (negative)
        makeObs('Pos4', 5000, 5000, 2.5, 0)
      ];
      
      const res = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, false);
      expect(res.outcome).toBe(TestOutcome.Pass);
      expect(res.maxAbsoluteError).toBe(5.0);
    });

    it('uses Service Inspection MPE multiplier correctly', () => {
      // test load 5000, Initial MPE = 5.0, Service MPE = 10.0
      const obs = [
        makeObs('Pos1', 5000, 5005, 0, 0), // P=5007.5, E=7.5, Ec=7.5
        makeObs('Pos2', 5000, 5000, 2.5, 0),
        makeObs('Pos3', 5000, 5000, 2.5, 0),
        makeObs('Pos4', 5000, 5000, 2.5, 0),
      ];
      
      // Initial context should fail (well, require retest)
      const initialRes = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, false);
      expect(initialRes.outcome).toBe(TestOutcome.RequiresRetest);
      
      // Service context should pass
      const serviceRes = evaluateEccentricLoadingTest(obs, baseInstrument, serviceContext, false);
      expect(serviceRes.outcome).toBe(TestOutcome.Pass);
    });
  });

  describe('Retest Workflow (REQUIRES_RETEST vs FAIL)', () => {
    it('returns REQUIRES_RETEST when zero is NOT determined before each loading and MPE is exceeded', () => {
      // MPE = 5.0. E = 7.5. zeroDeterminedBeforeEachLoading = false
      const obs = [
        makeObs('Pos1', 5000, 5005, 0, 0),
        makeObs('Pos2', 5000, 5000, 2.5, 0),
        makeObs('Pos3', 5000, 5000, 2.5, 0),
        makeObs('Pos4', 5000, 5000, 2.5, 0),
      ];
      const res = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, false);
      expect(res.outcome).toBe(TestOutcome.RequiresRetest);
      expect(res.retestRequired).toBe(true);
    });

    it('returns final FAIL when zero IS determined before each loading and MPE is exceeded', () => {
      // MPE = 5.0. E = 7.5. zeroDeterminedBeforeEachLoading = true
      const obs = [
        makeObs('Pos1', 5000, 5005, 0, 0),
        makeObs('Pos2', 5000, 5000, 2.5, 0),
        makeObs('Pos3', 5000, 5000, 2.5, 0),
        makeObs('Pos4', 5000, 5000, 2.5, 0),
      ];
      const res = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, true);
      expect(res.outcome).toBe(TestOutcome.Fail);
      expect(res.retestRequired).toBe(false); // Retest was already done, this is the final fail
    });

    it('returns FAIL if any position fails finally, even if another position only requires retest (mixed conditions)', () => {
      const obs = [
        makeObs('Pos1', 5000, 5000, 2.5, 0), // Pass
        makeObs('Pos2', 5000, 5005, 0, 0),    // Exceeds MPE
        makeObs('Pos3', 5000, 5000, 2.5, 0),
        makeObs('Pos4', 5000, 5000, 2.5, 0),
      ];
      // When zeroDeterminedBeforeEachLoading = true, the exceeding one FAILS completely
      const res = evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, true);
      expect(res.outcome).toBe(TestOutcome.Fail);
    });
  });

  describe('Rejections and Constraints', () => {
    it('rejects test if auto-zero/tracking is NOT disabled', () => {
      const obs = [
        makeObs('Pos1', 5000, 5000, 2.5, 0, false),
        makeObs('Pos2', 5000, 5000, 2.5, 0, false),
        makeObs('Pos3', 5000, 5000, 2.5, 0, false),
        makeObs('Pos4', 5000, 5000, 2.5, 0, false),
      ];
      expect(() => evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, false)).toThrow(/must be disabled/);
    });

    it('rejects test if additionalLoad is missing', () => {
      const obs = [
        makeObs('Pos1', 5000, 5000, undefined, 0, true),
        makeObs('Pos2', 5000, 5000, 2.5, 0, true),
        makeObs('Pos3', 5000, 5000, 2.5, 0, true),
        makeObs('Pos4', 5000, 5000, 2.5, 0, true),
      ];
      expect(() => evaluateEccentricLoadingTest(obs, baseInstrument, initialContext, false)).toThrow(/additionalLoad.*is required/);
    });

    it('rejects instruments with > 4 support points', () => {
      const invalidInst = { ...baseInstrument, numberOfSupportPoints: 6 };
      const obs = [
        makeObs('Pos1', 5000, 5000, 2.5, 0),
        makeObs('Pos2', 5000, 5000, 2.5, 0),
        makeObs('Pos3', 5000, 5000, 2.5, 0),
        makeObs('Pos4', 5000, 5000, 2.5, 0),
      ];
      expect(() => evaluateEccentricLoadingTest(obs, invalidInst, initialContext, false)).toThrow(/supports only standard platforms with 4 or fewer/);
    });
    
    it('throws when no observations provided', () => {
      expect(() => evaluateEccentricLoadingTest([], baseInstrument, initialContext)).toThrow(/No observations/);
    });

    it('prevents overall PASS when fewer than required positions are tested on 4-point instrument', () => {
      const incompleteObs = [
        makeObs('1', 5000, 5000, 2.5, 0),
      ];
      expect(() => evaluateEccentricLoadingTest(incompleteObs, baseInstrument, initialContext, false))
        .toThrow(/Incomplete eccentric loading test.*Missing 3 required position\(s\): Position 2, Position 3, Position 4/);
    });

    it('prevents overall PASS when fewer than required positions are tested on 3-point instrument', () => {
      const threePointInst = { ...baseInstrument, numberOfSupportPoints: 3 };
      const incompleteObs = [
        makeObs('1', 5000, 5000, 2.5, 0),
        makeObs('2', 5000, 5000, 2.5, 0),
      ];
      expect(() => evaluateEccentricLoadingTest(incompleteObs, threePointInst, initialContext, false))
        .toThrow(/Incomplete eccentric loading test.*Missing 1 required position\(s\): Position 3/);
    });

    it('allows 3-position test to PASS on 3-point instrument', () => {
      const threePointInst = { ...baseInstrument, numberOfSupportPoints: 3 };
      const completeObs = [
        makeObs('1', 5000, 5000, 2.5, 0),
        makeObs('2', 5000, 5000, 2.5, 0),
        makeObs('3', 5000, 5000, 2.5, 0),
      ];
      const res = evaluateEccentricLoadingTest(completeObs, threePointInst, initialContext, false);
      expect(res.outcome).toBe(TestOutcome.Pass);
      expect(res.observationResults).toHaveLength(3);
    });

    it('returns FAIL instead of throwing when a measured observation exceeds MPE, even if positions are missing (FAIL precedence)', () => {
      // Only 1 position tested (so positions are missing), but it fails MPE!
      const failingIncompleteObs = [
        makeObs('1', 5000, 5020, 2.5, 0), // Big error >> MPE (5.0)
      ];
      // With zeroDeterminedBeforeEachLoading = true, this is a final FAIL
      const res = evaluateEccentricLoadingTest(failingIncompleteObs, baseInstrument, initialContext, true, false);
      expect(res.outcome).toBe(TestOutcome.Fail);
      expect(res.completeness.isComplete).toBe(false);
      expect(res.completeness.missingPositionsCount).toBe(3);
    });

    it('correctly calculates prescribed eccentric load as 1/3 Max', () => {
      const res = evaluateEccentricLoadingTest(
        [
          makeObs('1', 5000, 5000, 2.5, 0),
          makeObs('2', 5000, 5000, 2.5, 0),
          makeObs('3', 5000, 5000, 2.5, 0),
          makeObs('4', 5000, 5000, 2.5, 0),
        ],
        baseInstrument,
        initialContext,
        false
      );
      expect(res.prescribedLoad).toBe(5000);
      expect(res.completeness.prescribedLoad).toBe(5000);
    });
  });
});
