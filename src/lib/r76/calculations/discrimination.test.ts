import { describe, it, expect } from 'vitest';
import { evaluateDiscriminationTest, evaluateDiscriminationObservation } from './discrimination';
import { Instrument, AccuracyClass, InstrumentType, IndicationType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestOutcome } from '../types/results';
import { DiscriminationObservationPoint } from '../types/observations';

describe('Discrimination Calculation', () => {
  const baseInstrument: Instrument = {
    id: 'test-inst',
    manufacturer: 'Test',
    model: 'Model',
    accuracyClass: AccuracyClass.III,
    instrumentType: InstrumentType.SingleRange,
    indicationType: IndicationType.Digital,
    max: 15,
    min: 0.1,
    e: 0.005,
    d: 0.005,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
  };

  const context = VerificationContext.TypeEvaluation;

  it('passes when indication increases exactly by d', () => {
    const obs: DiscriminationObservationPoint = {
      testLoad: 0.1,
      indicationBefore: 0.1,
      indicationAfter: 0.105, // I + d (0.1 + 0.005)
    };

    const result = evaluateDiscriminationObservation(obs, baseInstrument, context);
    expect(result.outcome).toBe(TestOutcome.Pass);
    expect(result.calculatedError).toBe(0); // I_after - (I + d) == 0
  });

  it('fails when indication does not increase by d', () => {
    const obs: DiscriminationObservationPoint = {
      testLoad: 0.1,
      indicationBefore: 0.1,
      indicationAfter: 0.100, // No change
    };

    const result = evaluateDiscriminationObservation(obs, baseInstrument, context);
    expect(result.outcome).toBe(TestOutcome.Fail);
    expect(result.calculatedError).toBe(-0.005);
  });

  it('overall test passes if all 3 points pass', () => {
    const observations: DiscriminationObservationPoint[] = [
      { testLoad: 0.1, indicationBefore: 0.1, indicationAfter: 0.105 },
      { testLoad: 7.5, indicationBefore: 7.5, indicationAfter: 7.505 },
      { testLoad: 15, indicationBefore: 15, indicationAfter: 15.005 },
    ];

    const result = evaluateDiscriminationTest(observations, baseInstrument, context);
    expect(result.outcome).toBe(TestOutcome.Pass);
    expect(result.observationResults).toHaveLength(3);
  });

  it('overall test fails if any point fails', () => {
    const observations: DiscriminationObservationPoint[] = [
      { testLoad: 0.1, indicationBefore: 0.1, indicationAfter: 0.105 },
      { testLoad: 7.5, indicationBefore: 7.5, indicationAfter: 7.505 },
      { testLoad: 15, indicationBefore: 15, indicationAfter: 15.000 }, // Fails here
    ];

    const result = evaluateDiscriminationTest(observations, baseInstrument, context);
    expect(result.outcome).toBe(TestOutcome.Fail);
  });

  it('compliance trace contains the relevant R76 references', () => {
    const obs: DiscriminationObservationPoint = {
      testLoad: 0.1, indicationBefore: 0.1, indicationAfter: 0.105
    };
    const result = evaluateDiscriminationObservation(obs, baseInstrument, context);
    
    expect(result.trace.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ clause: '3.8.2.2' }),
        expect.objectContaining({ annex: 'Annex A.4.8.2' })
      ])
    );
  });

  describe('Boundary and Regulatory Validation per A.4.8.2', () => {
    it('passes when indication change is greater than one actual scale interval (I + 2d)', () => {
      const obs: DiscriminationObservationPoint = {
        testLoad: 0.1,
        indicationBefore: 0.1,
        indicationAfter: 0.110, // I + 2d (0.1 + 2 * 0.005)
      };

      const result = evaluateDiscriminationObservation(obs, baseInstrument, context);
      expect(result.outcome).toBe(TestOutcome.Pass);
      expect(result.calculatedError).toBe(0.005);
    });

    it('rejects missing or NaN observation values', () => {
      const invalidObs: DiscriminationObservationPoint = {
        testLoad: NaN,
        indicationBefore: 0.1,
        indicationAfter: 0.105,
      };

      expect(() => evaluateDiscriminationObservation(invalidObs, baseInstrument, context))
        .toThrow(/Invalid testLoad/);
    });

    it('rejects invalid scale interval d <= 0', () => {
      const invalidInst: Instrument = { ...baseInstrument, d: 0 };
      const obs: DiscriminationObservationPoint = {
        testLoad: 0.1, indicationBefore: 0.1, indicationAfter: 0.105
      };

      expect(() => evaluateDiscriminationObservation(obs, invalidInst, context))
        .toThrow(/Invalid actual scale interval/);
    });

    it('rejects instruments with d < 5 mg (0.000005 kg)', () => {
      const tinyDInst: Instrument = { ...baseInstrument, d: 0.000002 };
      const obs: DiscriminationObservationPoint = {
        testLoad: 0.1, indicationBefore: 0.1, indicationAfter: 0.100002
      };

      expect(() => evaluateDiscriminationObservation(obs, tinyDInst, context))
        .toThrow(/requires d >= 5 mg/);
    });

    it('rejects non-applicable verification context (SubsequentVerification)', () => {
      const obs: DiscriminationObservationPoint = {
        testLoad: 0.1, indicationBefore: 0.1, indicationAfter: 0.105
      };

      expect(() => evaluateDiscriminationObservation(obs, baseInstrument, VerificationContext.SubsequentVerification))
        .toThrow(/Type Evaluation only/);
    });
  });
});
