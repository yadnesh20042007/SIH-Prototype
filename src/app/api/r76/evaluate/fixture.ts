import { AccuracyClass, Instrument, InstrumentType } from '../../../../lib/r76/types/instrument';
import { VerificationContext } from '../../../../lib/r76/types/verification';
import { TestObservations } from '../../../../lib/r76/engine';

export const validEvaluationFixture = {
  instrument: {
    id: 'inst-fixture',
    manufacturer: 'FixtureMaker',
    model: 'FixtureModel',
    accuracyClass: AccuracyClass.III,
    max: 15000,
    min: 100,
    e: 5,
    d: 5,
    numberOfSupportPoints: 4,
    additiveTareEffect: false,
    hasAutoZeroOrTracking: false,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: InstrumentType.SingleRange,
    indicationType: 'digital' as any,
    zeroSettingMechanisms: []
  } as Instrument,
  verificationContext: VerificationContext.TypeEvaluation,
  observations: {
    weighingPerformance: [
      ...[100, 500, 1000, 2500, 5000, 7500, 10000, 12000, 14000, 15000].map((load, idx) => ({
        sequenceIndex: idx,
        load,
        indicatedValue: load,
        additionalLoad: 2.5,
        zeroError: 0,
        loadingDirection: 'increasing' as const,
      })),
      ...[15000, 14000, 12000, 10000, 7500, 5000, 2500, 1000, 500, 100].map((load, idx) => ({
        sequenceIndex: 10 + idx,
        load,
        indicatedValue: load,
        additionalLoad: 2.5,
        zeroError: 0,
        loadingDirection: 'decreasing' as const,
      })),
    ],
    repeatability: {
      series: [
        { seriesNumber: 1, testLoad: 7500, indications: [7500, 7501, 7500.5] },
        { seriesNumber: 2, testLoad: 15000, indications: [15000, 15001, 15001] },
      ],
      autoZeroOrTrackingActive: true,
    },
    eccentricLoading: [
      { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
      { positionId: '2', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
      { positionId: '3', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true },
      { positionId: '4', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true }
    ],
    eccentricZeroDeterminedBeforeEachLoading: false,
    discrimination: [
      { testLoad: 100, indicationBefore: 100, indicationAfter: 105 },
      { testLoad: 7500, indicationBefore: 7500, indicationAfter: 7505 },
      { testLoad: 15000, indicationBefore: 15000, indicationAfter: 15005 }
    ]
  } as TestObservations
};
