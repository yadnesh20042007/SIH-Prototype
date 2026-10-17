import { describe, it, expect } from 'vitest';
import { evaluateInstrumentCompliance, OverallOutcome, TestObservations } from './index';
import { Instrument, AccuracyClass, InstrumentType, IndicationType } from '../types/instrument';
import { VerificationContext } from '../types/verification';
import { TestType } from '../types/test';

describe('R76 Engine Safety and Evaluation Integrity', () => {
  const baseSingleRangeInstrument: Instrument = {
    id: 'safe-inst-1',
    manufacturer: 'Compliance Metrology Ltd',
    model: 'SafeScale-3000',
    accuracyClass: AccuracyClass.III,
    instrumentType: InstrumentType.SingleRange,
    indicationType: IndicationType.Digital,
    max: 15,
    min: 0.1,
    e: 0.005,
    d: 0.005,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: false,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    zeroSettingMechanisms: [],
  };

  const passingWeighingObservations = [
    { sequenceIndex: 0, load: 0.1, indicatedValue: 0.1, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'increasing' as const },
    { sequenceIndex: 1, load: 2.5, indicatedValue: 2.5, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'increasing' as const },
    { sequenceIndex: 2, load: 5, indicatedValue: 5, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'increasing' as const },
    { sequenceIndex: 3, load: 10, indicatedValue: 10, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'increasing' as const },
    { sequenceIndex: 4, load: 15, indicatedValue: 15, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'increasing' as const },
    { sequenceIndex: 5, load: 10, indicatedValue: 10, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'decreasing' as const },
    { sequenceIndex: 6, load: 5, indicatedValue: 5, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'decreasing' as const },
    { sequenceIndex: 7, load: 2.5, indicatedValue: 2.5, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'decreasing' as const },
    { sequenceIndex: 8, load: 0.1, indicatedValue: 0.1, additionalLoad: 0.0025, zeroError: 0, loadingDirection: 'decreasing' as const },
  ];

  const passingRepeatabilityObservations = {
    testLoad: 12,
    indications: [12, 12, 12],
    autoZeroOrTrackingActive: false,
  };

  const passingEccentricObservations = [
    { positionId: '1', appliedLoad: 5, indicatedValue: 5, additionalLoad: 0.0025, zeroError: 0, autoZeroOrTrackingDisabled: true },
    { positionId: '2', appliedLoad: 5, indicatedValue: 5, additionalLoad: 0.0025, zeroError: 0, autoZeroOrTrackingDisabled: true },
    { positionId: '3', appliedLoad: 5, indicatedValue: 5, additionalLoad: 0.0025, zeroError: 0, autoZeroOrTrackingDisabled: true },
    { positionId: '4', appliedLoad: 5, indicatedValue: 5, additionalLoad: 0.0025, zeroError: 0, autoZeroOrTrackingDisabled: true },
  ];

  it('never returns PASS on empty evaluation with zero completed tests', () => {
    const emptyObs: TestObservations = {};
    const result = evaluateInstrumentCompliance(
      baseSingleRangeInstrument,
      VerificationContext.InitialVerification,
      emptyObs
    );

    expect(result.overallOutcome).not.toBe(OverallOutcome.Pass);
    expect(result.overallOutcome).toBe(OverallOutcome.Incomplete);
    expect(result.counts.passed).toBe(0);
    expect(result.counts.incomplete).toBeGreaterThan(0);
    expect(result.explanation).toContain('incomplete');
  });

  it('returns INCOMPLETE when all selected tests are skipped or have zero observations', () => {
    // If an instrument has zero applicable tests evaluated
    const result = evaluateInstrumentCompliance(
      baseSingleRangeInstrument,
      VerificationContext.InitialVerification,
      {}
    );

    expect(result.overallOutcome).toBe(OverallOutcome.Incomplete);
  });

  it('produces INCOMPLETE when one required applicable test is missing observations', () => {
    // Weighing and Repeatability are provided, but EccentricLoading is missing
    const partialObs: TestObservations = {
      weighingPerformance: passingWeighingObservations,
      repeatability: passingRepeatabilityObservations,
    };

    const result = evaluateInstrumentCompliance(
      baseSingleRangeInstrument,
      VerificationContext.InitialVerification,
      partialObs
    );

    expect(result.overallOutcome).toBe(OverallOutcome.Incomplete);
    expect(result.counts.passed).toBe(2);
    expect(result.counts.incomplete).toBeGreaterThan(0);
    expect(result.explanation).toContain('incomplete');
  });

  it('produces PASS when all applicable tests are completed and passing', () => {
    const completeObs: TestObservations = {
      weighingPerformance: passingWeighingObservations,
      repeatability: passingRepeatabilityObservations,
      eccentricLoading: passingEccentricObservations,
    };

    const result = evaluateInstrumentCompliance(
      baseSingleRangeInstrument,
      VerificationContext.InitialVerification,
      completeObs
    );

    expect(result.overallOutcome).toBe(OverallOutcome.Pass);
    expect(result.counts.passed).toBe(3);
    expect(result.counts.failed).toBe(0);
    expect(result.counts.incomplete).toBe(0);
    expect(result.explanation).toContain('fully complies');
  });

  it('preserves FAIL precedence when an applicable test fails', () => {
    // Failing weighing observation (huge error exceeding MPE)
    const failingWeighingObs = [
      { sequenceIndex: 0, load: 10, indicatedValue: 10.5, additionalLoad: 0, zeroError: 0, loadingDirection: 'increasing' as const }
    ];

    const obsWithFailure: TestObservations = {
      weighingPerformance: failingWeighingObs,
      repeatability: passingRepeatabilityObservations,
      // EccentricLoading left missing (incomplete)
    };

    const result = evaluateInstrumentCompliance(
      baseSingleRangeInstrument,
      VerificationContext.InitialVerification,
      obsWithFailure
    );

    // FAIL takes precedence over INCOMPLETE
    expect(result.overallOutcome).toBe(OverallOutcome.Fail);
    expect(result.counts.failed).toBe(1);
    expect(result.explanation).toContain('FAILS compliance');
  });

  it('handles combination of PASS and legitimately NOT APPLICABLE tests without false failure', () => {
    // In SubsequentVerification, Discrimination is NOT APPLICABLE
    // Zero-setting accuracy is NOT APPLICABLE because zeroSettingMechanisms is empty []
    const completeObs: TestObservations = {
      weighingPerformance: passingWeighingObservations,
      repeatability: passingRepeatabilityObservations,
      eccentricLoading: passingEccentricObservations,
    };

    const result = evaluateInstrumentCompliance(
      baseSingleRangeInstrument,
      VerificationContext.SubsequentVerification,
      completeObs
    );

    expect(result.overallOutcome).toBe(OverallOutcome.Pass);
    expect(result.counts.skipped).toBeGreaterThan(0);
    expect(result.counts.failed).toBe(0);
    expect(result.counts.incomplete).toBe(0);
  });

  it('produces MANUAL_REVIEW for unsupported configurations (e.g. multi-interval or >4 support points)', () => {
    const unsupportedInst: Instrument = {
      ...baseSingleRangeInstrument,
      numberOfSupportPoints: 6, // > 4 support points is unsupported
    };

    const result = evaluateInstrumentCompliance(
      unsupportedInst,
      VerificationContext.InitialVerification,
      {
        weighingPerformance: passingWeighingObservations,
        repeatability: passingRepeatabilityObservations,
      }
    );

    expect(result.overallOutcome).toBe(OverallOutcome.ManualReview);
    expect(result.counts.manualReview).toBeGreaterThan(0);
    expect(result.explanation).toContain('manual review');
  });

  it('preserves FAIL precedence even when unsupported configuration is present', () => {
    const unsupportedInst: Instrument = {
      ...baseSingleRangeInstrument,
      numberOfSupportPoints: 6, // > 4 support points is unsupported
    };

    const failingWeighingObs = [
      { sequenceIndex: 0, load: 10, indicatedValue: 10.5, additionalLoad: 0, zeroError: 0, loadingDirection: 'increasing' as const }
    ];

    const result = evaluateInstrumentCompliance(
      unsupportedInst,
      VerificationContext.InitialVerification,
      {
        weighingPerformance: failingWeighingObs,
      }
    );

    // An actual failure must still override manual review
    expect(result.overallOutcome).toBe(OverallOutcome.Fail);
    expect(result.counts.failed).toBe(1);
  });
});
