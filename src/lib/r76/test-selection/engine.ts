import { Instrument, InstrumentType } from '../types/instrument';
import { VerificationContext, isTypeEvaluationContext } from '../types/verification';
import { TestType } from '../types/test';

export interface TestSelectionResult {
  testType: TestType;
  isApplicable: boolean;
  reason: string;
  r76Reference: string;
  prerequisites: string[];
}

/**
 * Automatically determines which OIML R76 tests apply to the given instrument
 * and verification context based on the current prototype's supported scope.
 *
 * @param instrument The instrument data model to evaluate
 * @param context The verification context
 * @returns Array of test selection results explaining applicability and prerequisites
 */
export function selectTests(
  instrument: Instrument,
  context: VerificationContext | string
): TestSelectionResult[] {
  const results: TestSelectionResult[] = [];

  const isSingleRange = instrument.instrumentType === InstrumentType.SingleRange;

  // 1. Weighing Performance
  if (!isSingleRange) {
    results.push({
      testType: TestType.WeighingPerformance,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported by the prototype. Multi-interval or multiple-range instruments require manual review.',
      r76Reference: 'OIML R76-1 clause A.4.1.11, 3.3.3',
      prerequisites: []
    });
  } else {
    const prerequisites = [
      'Pre-load the instrument once to Max (or Lim) before the test (A.4.1.10).'
    ];
    if (instrument.hasInitialZeroSettingDevice && instrument.initialZeroSettingRange > 0.20) {
      prerequisites.push('Supplementary weighing test required: initial zero-setting range > 20% of Max (A.4.4.2).');
    }
    
    results.push({
      testType: TestType.WeighingPerformance,
      isApplicable: true,
      reason: 'Applies to every instrument regardless of accuracy class.',
      r76Reference: 'OIML R76-1 clause 3.5.1, Table 6, A.4.4.1',
      prerequisites
    });
  }

  // 2. Repeatability
  if (!isSingleRange) {
    results.push({
      testType: TestType.Repeatability,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported by the prototype.',
      r76Reference: 'OIML R76-1 clause A.4.1.11',
      prerequisites: []
    });
  } else {
    const prerequisites = [
      'Test load should be approximately 0.8 × Max for verification testing (A.4.10, 3rd paragraph).'
    ];
    if (instrument.hasAutoZeroOrTracking) {
      prerequisites.push('Automatic zero-setting or zero-tracking shall be in operation during this test (A.4.10).');
    }
    
    results.push({
      testType: TestType.Repeatability,
      isApplicable: true,
      reason: 'Required repeatability test for all instruments.',
      r76Reference: 'OIML R76-1 clause 3.6.1, A.4.10',
      prerequisites
    });
  }

  // 3. Eccentric Loading
  if (!isSingleRange) {
    results.push({
      testType: TestType.EccentricLoading,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported by the prototype.',
      r76Reference: 'OIML R76-1 clause A.4.1.11',
      prerequisites: []
    });
  } else if (instrument.numberOfSupportPoints > 4) {
    results.push({
      testType: TestType.EccentricLoading,
      isApplicable: false,
      reason: 'Unsupported: Eccentric loading for instruments with > 4 support points (A.4.7.2) is not currently supported by the prototype.',
      r76Reference: 'OIML R76-1 clause 3.6.2.2, A.4.7.2',
      prerequisites: []
    });
  } else {
    const prerequisites = [
      'Manual Review Required: This selection assumes a standard stationary load receptor. Mobile, rolling-load, or special receptors are unsupported and must be evaluated manually.',
      'Test load should be 1/3 × (Max + maximum additive tare effect) applied to each quarter segment (A.4.7.1).'
    ];
    if (instrument.hasAutoZeroOrTracking) {
      prerequisites.push('Automatic zero-setting/zero-tracking must NOT be in operation during this test (A.4.7).');
    }
    
    results.push({
      testType: TestType.EccentricLoading,
      isApplicable: true,
      reason: 'Applies to standard-platform instruments with ≤ 4 support points.',
      r76Reference: 'OIML R76-1 clause 3.6.2.1, A.4.7.1',
      prerequisites
    });
  }

  // 4. Discrimination
  if (!isSingleRange) {
    results.push({
      testType: TestType.Discrimination,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported.',
      r76Reference: 'OIML R76-1 clause A.4.1.11',
      prerequisites: [],
    });
  } else if (!isTypeEvaluationContext(context)) {
    results.push({
      testType: TestType.Discrimination,
      isApplicable: false,
      reason: 'Digital discrimination test applies to type examination only.',
      r76Reference: 'OIML R76-1 clause 3.8.2.2',
      prerequisites: [],
    });
  } else if (instrument.indicationType !== 'digital') {
    results.push({
      testType: TestType.Discrimination,
      isApplicable: false,
      reason: 'Only digital indication discrimination test is currently supported by the prototype.',
      r76Reference: 'OIML R76-1 clause A.4.8.2',
      prerequisites: [],
    });
  } else if (instrument.d < 0.000005) { // d < 5 mg (assuming kg as base unit, 5 mg = 0.000005 kg)
    results.push({
      testType: TestType.Discrimination,
      isApplicable: false,
      reason: 'Discrimination test for digital indication requires d >= 5 mg.',
      r76Reference: 'OIML R76-1 clause 3.8.2.2',
      prerequisites: [],
    });
  } else {
    results.push({
      testType: TestType.Discrimination,
      isApplicable: true,
      reason: 'Discrimination test for digital indication applies (d >= 5 mg).',
      r76Reference: 'OIML R76-1 clause 3.8.2.2, A.4.8.2',
      prerequisites: [
        'Test loads should be Min, 0.5 × Max, and Max (A.4.8).',
      ],
    });
  }

  // 5. Zero-Setting Accuracy
  if (!isSingleRange) {
    results.push({
      testType: TestType.ZeroSettingAccuracy,
      isApplicable: false,
      reason: 'Unsupported: Only single-range instruments are currently supported.',
      r76Reference: 'OIML R76-1 clause A.4.1.11',
      prerequisites: [],
    });
  } else if (instrument.zeroSettingMechanisms && instrument.zeroSettingMechanisms.length > 0) {
    results.push({
      testType: TestType.ZeroSettingAccuracy,
      isApplicable: true,
      reason: 'Zero-setting accuracy must be verified for instruments with zero-setting mechanisms.',
      r76Reference: 'OIML R76-1 clause 4.5.2, A.4.2.3',
      prerequisites: [
        'For automatic/tracking: Load instrument to bring it out of zero-tracking range (e.g. 10e) (A.4.2.3.2).',
      ],
    });
  } else if (instrument.zeroSettingMechanisms === undefined) {
    results.push({
      testType: TestType.ZeroSettingAccuracy,
      isApplicable: false,
      reason: 'Unsupported: Zero-setting mechanism metadata is missing or unrecorded. Confirm whether zero-setting mechanisms are fitted (clause 4.5.2).',
      r76Reference: 'OIML R76-1 clause 4.5.2',
      prerequisites: [],
    });
  } else if (
    Array.isArray(instrument.zeroSettingMechanisms) &&
    instrument.zeroSettingMechanisms.length === 0 &&
    (instrument.hasAutoZeroOrTracking || instrument.hasInitialZeroSettingDevice)
  ) {
    results.push({
      testType: TestType.ZeroSettingAccuracy,
      isApplicable: false,
      reason: 'Unsupported: Contradictory configuration — instrument has zero-setting device flags enabled (hasAutoZeroOrTracking or hasInitialZeroSettingDevice) but zeroSettingMechanisms is empty. Manual review and mechanism clarification required.',
      r76Reference: 'OIML R76-1 clause 4.5.2, A.4.2.3',
      prerequisites: [],
    });
  } else {
    // instrument.zeroSettingMechanisms is an empty array: genuinely not fitted
    results.push({
      testType: TestType.ZeroSettingAccuracy,
      isApplicable: false,
      reason: 'No zero-setting mechanism is fitted on this instrument (clause 4.5.2).',
      r76Reference: 'OIML R76-1 clause 4.5.2',
      prerequisites: [],
    });
  }

  return results;
}
