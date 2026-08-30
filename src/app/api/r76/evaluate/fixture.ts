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
    hasAutoZeroOrTracking: true,
    hasInitialZeroSettingDevice: false,
    initialZeroSettingRange: 0,
    hasFineDisplayDevice: false,
    instrumentType: InstrumentType.SingleRange
  } as Instrument,
  verificationContext: VerificationContext.InitialVerification,
  observations: {
    weighingPerformance: [
      { sequenceIndex: 0, load: 5000, indicatedValue: 5000, additionalLoad: 1.5, zeroError: 0.5, loadingDirection: 'increasing' }
    ],
    repeatability: {
      testLoad: 5000,
      indications: [5000.0, 5002.0, 5001.0],
      autoZeroOrTrackingActive: true
    },
    eccentricLoading: [
      { positionId: '1', appliedLoad: 5000, indicatedValue: 5000, additionalLoad: 2.5, zeroError: 0, autoZeroOrTrackingDisabled: true }
    ],
    eccentricZeroDeterminedBeforeEachLoading: false
  } as TestObservations
};
